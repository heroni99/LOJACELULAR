import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  CashMovementType,
  CashSessionStatus,
  PaymentMethod,
  Prisma
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CashDepositDto } from "./dto/cash-deposit.dto";
import { CashWithdrawalDto } from "./dto/cash-withdrawal.dto";
import { CloseCashSessionDto } from "./dto/close-cash-session.dto";
import { CreateCashTerminalDto } from "./dto/create-cash-terminal.dto";
import { OpenCashSessionDto } from "./dto/open-cash-session.dto";
import { UpdateCashTerminalActiveDto } from "./dto/update-cash-terminal-active.dto";
import { UpdateCashTerminalDto } from "./dto/update-cash-terminal.dto";

type CashAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const cashTerminalInclude = {
  store: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true
    }
  }
} satisfies Prisma.CashTerminalInclude;

const cashSessionInclude = {
  cashTerminal: {
    include: cashTerminalInclude
  },
  openedByUser: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  closedByUser: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  movements: {
    orderBy: {
      createdAt: "asc"
    }
  },
  sales: {
    select: {
      id: true,
      saleNumber: true,
      total: true,
      status: true,
      completedAt: true
    },
    orderBy: {
      completedAt: "desc"
    }
  }
} satisfies Prisma.CashSessionInclude;

type CashTerminalWithRelations = Prisma.CashTerminalGetPayload<{
  include: typeof cashTerminalInclude;
}>;

type CashSessionWithRelations = Prisma.CashSessionGetPayload<{
  include: typeof cashSessionInclude;
}>;

type CashMovementRecord = CashSessionWithRelations["movements"][number];

const automaticOpenNotes = "Sessão aberta automaticamente pelo sistema";

@Injectable()
export class CashService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findTerminals() {
    return this.prisma.cashTerminal.findMany({
      include: cashTerminalInclude,
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });
  }

  async createTerminal(payload: CreateCashTerminalDto, context: CashAuditContext) {
    const store = payload.storeId
      ? await this.findStoreById(payload.storeId)
      : await this.findDefaultStore();

    try {
      const terminal = await this.prisma.cashTerminal.create({
        data: {
          storeId: store.id,
          name: payload.name,
          active: payload.active ?? true
        },
        include: cashTerminalInclude
      });

      await this.auditService.log({
        storeId: store.id,
        userId: context.userId ?? null,
        action: "cash.terminals.created",
        entity: "cash_terminals",
        entityId: terminal.id,
        newData: terminal,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return terminal;
    } catch (error) {
      this.handleTerminalWriteError(error);
    }
  }

  async updateTerminal(
    id: string,
    payload: UpdateCashTerminalDto,
    context: CashAuditContext
  ) {
    const previous = await this.findTerminalById(id);

    try {
      const terminal = await this.prisma.cashTerminal.update({
        where: {
          id
        },
        data: {
          name: payload.name ?? undefined
        },
        include: cashTerminalInclude
      });

      await this.auditService.log({
        storeId: previous.storeId,
        userId: context.userId ?? null,
        action: "cash.terminals.updated",
        entity: "cash_terminals",
        entityId: terminal.id,
        oldData: previous,
        newData: terminal,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent
      });

      return terminal;
    } catch (error) {
      this.handleTerminalWriteError(error);
    }
  }

  async updateTerminalActive(
    id: string,
    payload: UpdateCashTerminalActiveDto,
    context: CashAuditContext
  ) {
    const previous = await this.findTerminalById(id);

    if (!payload.active) {
      const openSession = await this.prisma.cashSession.findFirst({
        where: {
          cashTerminalId: id,
          status: CashSessionStatus.OPEN
        },
        select: {
          id: true
        }
      });

      if (openSession) {
        throw new BadRequestException(
          "Nao e possivel inativar um terminal com sessao de caixa aberta."
        );
      }
    }

    const terminal = await this.prisma.cashTerminal.update({
      where: {
        id
      },
      data: {
        active: payload.active
      },
      include: cashTerminalInclude
    });

    await this.auditService.log({
      storeId: previous.storeId,
      userId: context.userId ?? null,
      action: payload.active ? "cash.terminals.activated" : "cash.terminals.deactivated",
      entity: "cash_terminals",
      entityId: terminal.id,
      oldData: previous,
      newData: terminal,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return terminal;
  }

  async findCurrentSession(storeId?: string | null) {
    return this.ensureOpenSession(storeId);
  }

  async ensureOpenSession(storeId?: string | null) {
    this.assertStoreScope(storeId);

    const terminal = await this.findDefaultActiveTerminalForStore(storeId);
    let createdAutomatically = false;

    const session = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM cash_terminals WHERE id = ${terminal.id} FOR UPDATE`
      );

      const existingOpenSession = await tx.cashSession.findFirst({
        where: {
          cashTerminalId: terminal.id,
          status: CashSessionStatus.OPEN
        },
        include: cashSessionInclude,
        orderBy: {
          openedAt: "desc"
        }
      });

      if (existingOpenSession) {
        return existingOpenSession;
      }

      createdAutomatically = true;

      const created = await tx.cashSession.create({
        data: {
          cashTerminalId: terminal.id,
          openedBy: null,
          status: CashSessionStatus.OPEN,
          openingAmount: 0,
          notes: automaticOpenNotes
        },
        include: cashSessionInclude
      });

      await tx.cashMovement.create({
        data: {
          cashSessionId: created.id,
          movementType: CashMovementType.OPENING,
          amount: 0,
          paymentMethod: PaymentMethod.CASH,
          description: automaticOpenNotes,
          userId: null
        }
      });

      return tx.cashSession.findUniqueOrThrow({
        where: {
          id: created.id
        },
        include: cashSessionInclude
      });
    });

    if (createdAutomatically) {
      await this.auditService.log({
        storeId: terminal.storeId,
        userId: null,
        action: "cash.sessions.auto_opened",
        entity: "cash_sessions",
        entityId: session.id,
        newData: {
          cashTerminalId: terminal.id,
          openingAmount: 0,
          notes: automaticOpenNotes
        }
      });
    }

    return this.decorateSession(session);
  }

  async open(payload: OpenCashSessionDto, context: CashAuditContext) {
    const terminal = await this.findTerminalById(payload.cashTerminalId);

    if (!terminal.active) {
      throw new BadRequestException("O terminal informado esta inativo.");
    }

    const existingOpenSession = await this.prisma.cashSession.findFirst({
      where: {
        cashTerminalId: terminal.id,
        status: CashSessionStatus.OPEN
      },
      select: {
        id: true
      }
    });

    if (existingOpenSession) {
      throw new ConflictException(
        "Este terminal ja possui uma sessao de caixa aberta."
      );
    }

    const notes = this.normalizeOptionalText(payload.notes);

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cashSession.create({
        data: {
          cashTerminalId: terminal.id,
          openedBy: context.userId ?? null,
          status: CashSessionStatus.OPEN,
          openingAmount: payload.openingAmount,
          notes
        },
        include: cashSessionInclude
      });

      await tx.cashMovement.create({
        data: {
          cashSessionId: created.id,
          movementType: CashMovementType.OPENING,
          amount: payload.openingAmount,
          paymentMethod: PaymentMethod.CASH,
          description: notes ?? "Abertura de caixa",
          userId: context.userId ?? null
        }
      });

      return tx.cashSession.findUniqueOrThrow({
        where: {
          id: created.id
        },
        include: cashSessionInclude
      });
    });

    await this.auditService.log({
      storeId: terminal.storeId,
      userId: context.userId ?? null,
      action: "cash.sessions.opened",
      entity: "cash_sessions",
      entityId: session.id,
      newData: session,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateSession(session);
  }

  async deposit(payload: CashDepositDto, context: CashAuditContext) {
    const session = await this.findSessionOrFail(payload.cashSessionId);
    this.assertSessionOpen(session);

    const description =
      this.normalizeOptionalText(payload.description) ?? "Suprimento de caixa";

    const updatedSession = await this.prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id,
          movementType: CashMovementType.SUPPLY,
          amount: payload.amount,
          paymentMethod: PaymentMethod.CASH,
          description,
          userId: context.userId ?? null
        }
      });

      return tx.cashSession.findUniqueOrThrow({
        where: {
          id: session.id
        },
        include: cashSessionInclude
      });
    });

    await this.auditService.log({
      storeId: session.cashTerminal.storeId,
      userId: context.userId ?? null,
      action: "cash.sessions.supplied",
      entity: "cash_sessions",
      entityId: session.id,
      newData: {
        amount: payload.amount,
        description
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateSession(updatedSession);
  }

  async withdrawal(payload: CashWithdrawalDto, context: CashAuditContext) {
    const session = await this.findSessionOrFail(payload.cashSessionId);
    this.assertSessionOpen(session);

    const currentExpectedAmount = this.calculateExpectedAmount(session.movements);

    if (payload.amount > currentExpectedAmount) {
      throw new BadRequestException(
        "A sangria nao pode ser maior que o valor esperado em caixa."
      );
    }

    const description =
      this.normalizeOptionalText(payload.description) ?? "Sangria de caixa";

    const updatedSession = await this.prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id,
          movementType: CashMovementType.WITHDRAWAL,
          amount: payload.amount,
          paymentMethod: PaymentMethod.CASH,
          description,
          userId: context.userId ?? null
        }
      });

      return tx.cashSession.findUniqueOrThrow({
        where: {
          id: session.id
        },
        include: cashSessionInclude
      });
    });

    await this.auditService.log({
      storeId: session.cashTerminal.storeId,
      userId: context.userId ?? null,
      action: "cash.sessions.withdrawn",
      entity: "cash_sessions",
      entityId: session.id,
      newData: {
        amount: payload.amount,
        description
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateSession(updatedSession);
  }

  async close(payload: CloseCashSessionDto, context: CashAuditContext) {
    const session = await this.findSessionOrFail(payload.cashSessionId);
    this.assertSessionOpen(session);

    const expectedAmount = this.calculateExpectedAmount(session.movements);
    const difference = payload.closingAmount - expectedAmount;
    const notes = this.normalizeOptionalText(payload.notes);

    const closedSession = await this.prisma.$transaction(async (tx) => {
      await tx.cashSession.update({
        where: {
          id: session.id
        },
        data: {
          status: CashSessionStatus.CLOSED,
          expectedAmount,
          closingAmount: payload.closingAmount,
          difference,
          closedAt: new Date(),
          closedBy: context.userId ?? null,
          notes: payload.notes === undefined ? session.notes : notes
        }
      });

      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id,
          movementType: CashMovementType.CLOSING,
          amount: payload.closingAmount,
          paymentMethod: PaymentMethod.CASH,
          description: notes ?? "Fechamento de caixa",
          userId: context.userId ?? null
        }
      });

      return tx.cashSession.findUniqueOrThrow({
        where: {
          id: session.id
        },
        include: cashSessionInclude
      });
    });

    await this.auditService.log({
      storeId: session.cashTerminal.storeId,
      userId: context.userId ?? null,
      action: "cash.sessions.closed",
      entity: "cash_sessions",
      entityId: session.id,
      oldData: {
        previousStatus: session.status
      },
      newData: {
        closingAmount: payload.closingAmount,
        expectedAmount,
        difference
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateSession(closedSession);
  }

  async findHistory() {
    const sessions = await this.prisma.cashSession.findMany({
      include: cashSessionInclude,
      orderBy: [{ status: "asc" }, { openedAt: "desc" }]
    });

    return sessions.map((session) => this.decorateSession(session));
  }

  async findSessionById(id: string) {
    const session = await this.findSessionOrFail(id);
    return this.decorateSession(session);
  }

  private async findDefaultStore() {
    const store = await this.prisma.store.findFirst({
      where: {
        active: true
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    if (!store) {
      throw new NotFoundException("Nenhuma loja ativa encontrada para o caixa.");
    }

    return store;
  }

  private async findStoreById(storeId: string) {
    const store = await this.prisma.store.findUnique({
      where: {
        id: storeId
      }
    });

    if (!store) {
      throw new NotFoundException("Loja nao encontrada para o terminal.");
    }

    return store;
  }

  private async findDefaultActiveTerminalForStore(storeId: string) {
    const terminal = await this.prisma.cashTerminal.findFirst({
      where: {
        storeId,
        active: true
      },
      include: cashTerminalInclude,
      orderBy: {
        createdAt: "asc"
      }
    });

    if (!terminal) {
      throw new NotFoundException(
        "Nenhum terminal de caixa ativo foi encontrado para a loja."
      );
    }

    return terminal;
  }

  private async findTerminalById(id: string) {
    const terminal = await this.prisma.cashTerminal.findUnique({
      where: {
        id
      },
      include: cashTerminalInclude
    });

    if (!terminal) {
      throw new NotFoundException("Terminal de caixa nao encontrado.");
    }

    return terminal;
  }

  private async findSessionOrFail(id: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: {
        id
      },
      include: cashSessionInclude
    });

    if (!session) {
      throw new NotFoundException("Sessao de caixa nao encontrada.");
    }

    return session;
  }

  private assertSessionOpen(session: CashSessionWithRelations) {
    if (session.status !== CashSessionStatus.OPEN) {
      throw new BadRequestException("A sessao de caixa informada ja esta fechada.");
    }
  }

  private calculateExpectedAmount(movements: CashMovementRecord[]) {
    return movements.reduce((total, movement) => {
      switch (movement.movementType) {
        case CashMovementType.OPENING:
        case CashMovementType.SUPPLY:
          return movement.paymentMethod === null || movement.paymentMethod === PaymentMethod.CASH
            ? total + movement.amount
            : total;
        case CashMovementType.WITHDRAWAL:
          return movement.paymentMethod === null || movement.paymentMethod === PaymentMethod.CASH
            ? total - movement.amount
            : total;
        case CashMovementType.SALE:
          return movement.paymentMethod === PaymentMethod.CASH
            ? total + movement.amount
            : total;
        case CashMovementType.REFUND:
          return movement.paymentMethod === PaymentMethod.CASH
            ? total - movement.amount
            : total;
        case CashMovementType.CLOSING:
        default:
          return total;
      }
    }, 0);
  }

  private buildMovementSummary(movements: CashMovementRecord[]) {
    return movements.reduce(
      (summary, movement) => {
        switch (movement.movementType) {
          case CashMovementType.OPENING:
            summary.opening += movement.amount;
            break;
          case CashMovementType.SALE:
            if (movement.paymentMethod === PaymentMethod.CASH) {
              summary.salesCash += movement.amount;
            }
            break;
          case CashMovementType.SUPPLY:
            if (movement.paymentMethod === null || movement.paymentMethod === PaymentMethod.CASH) {
              summary.supplies += movement.amount;
            }
            break;
          case CashMovementType.WITHDRAWAL:
            if (movement.paymentMethod === null || movement.paymentMethod === PaymentMethod.CASH) {
              summary.withdrawals += movement.amount;
            }
            break;
          case CashMovementType.CLOSING:
            summary.closingRegistered += movement.amount;
            break;
          case CashMovementType.REFUND:
            if (movement.paymentMethod === PaymentMethod.CASH) {
              summary.refundsCash += movement.amount;
            }
            break;
        }

        return summary;
      },
      {
        opening: 0,
        salesCash: 0,
        supplies: 0,
        withdrawals: 0,
        closingRegistered: 0,
        refundsCash: 0
      }
    );
  }

  private decorateSession(session: CashSessionWithRelations) {
    const calculatedExpectedAmount = this.calculateExpectedAmount(session.movements);
    const movementSummary = this.buildMovementSummary(session.movements);

    return {
      ...session,
      calculatedExpectedAmount: session.expectedAmount ?? calculatedExpectedAmount,
      cashOnHand:
        session.status === CashSessionStatus.CLOSED
          ? session.closingAmount ?? session.expectedAmount ?? calculatedExpectedAmount
          : calculatedExpectedAmount,
      isBalanced:
        session.status === CashSessionStatus.CLOSED
          ? (session.difference ?? 0) === 0
          : null,
      movementSummary
    };
  }

  private normalizeOptionalText(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private assertStoreScope(storeId?: string | null): asserts storeId is string {
    if (!storeId) {
      throw new ForbiddenException("Loja do operador nao encontrada para o caixa.");
    }
  }

  private handleTerminalWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        "Ja existe um terminal com esse nome para a loja informada."
      );
    }

    throw error;
  }
}
