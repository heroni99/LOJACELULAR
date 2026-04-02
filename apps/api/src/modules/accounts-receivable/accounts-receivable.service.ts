import {
  BadRequestException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import {
  CashMovementType,
  CashSessionStatus,
  FinancialEntryStatus,
  Prisma
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  calculateDaysUntilDue,
  getTodayStart,
  normalizeOptionalText,
  parseDateOnly,
  resolveFinancialStatusForDueDate
} from "../financial/financial-utils";
import { CreateAccountsReceivableDto } from "./dto/create-accounts-receivable.dto";
import { ListAccountsReceivableDto } from "./dto/list-accounts-receivable.dto";
import { ReceiveAccountsReceivableDto } from "./dto/receive-accounts-receivable.dto";
import { UpdateAccountsReceivableDto } from "./dto/update-accounts-receivable.dto";

type FinancialAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const accountsReceivableInclude = {
  store: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true
    }
  },
  customer: {
    select: {
      id: true,
      name: true,
      phone: true
    }
  },
  sale: {
    select: {
      id: true,
      saleNumber: true,
      total: true,
      completedAt: true
    }
  },
  serviceOrder: {
    select: {
      id: true,
      status: true,
      deviceType: true,
      totalFinal: true
    }
  }
} satisfies Prisma.AccountsReceivableInclude;

type AccountsReceivableRecord = Prisma.AccountsReceivableGetPayload<{
  include: typeof accountsReceivableInclude;
}>;

@Injectable()
export class AccountsReceivableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(filters: ListAccountsReceivableDto) {
    await this.syncOverdueStatuses();

    const where: Prisma.AccountsReceivableWhereInput = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.startDate || filters.endDate
        ? {
            dueDate: {
              ...(filters.startDate ? { gte: parseDateOnly(filters.startDate) } : {}),
              ...(filters.endDate ? { lte: parseDateOnly(filters.endDate) } : {})
            }
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                description: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                notes: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                customer: {
                  name: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              },
              {
                sale: {
                  saleNumber: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              }
            ]
          }
        : {})
    };

    const entries = await this.prisma.accountsReceivable.findMany({
      where,
      include: accountsReceivableInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: Math.min(filters.take ?? 120, 200)
    });

    return entries.map((entry) => this.decorateEntry(entry));
  }

  async create(payload: CreateAccountsReceivableDto, context: FinancialAuditContext) {
    const store = payload.storeId
      ? await this.findStoreById(payload.storeId)
      : await this.findDefaultStore();

    const customerId =
      payload.customerId === undefined
        ? undefined
        : payload.customerId
          ? (await this.findCustomerById(payload.customerId)).id
          : null;

    const saleId =
      payload.saleId === undefined
        ? undefined
        : payload.saleId
          ? (await this.findSaleById(payload.saleId)).id
          : null;

    const serviceOrderId =
      payload.serviceOrderId === undefined
        ? undefined
        : payload.serviceOrderId
          ? (await this.findServiceOrderById(payload.serviceOrderId)).id
          : null;

    const dueDate = parseDateOnly(payload.dueDate);
    const entry = await this.prisma.accountsReceivable.create({
      data: {
        storeId: store.id,
        customerId,
        saleId,
        serviceOrderId,
        description: payload.description.trim(),
        amount: payload.amount,
        dueDate,
        paymentMethod: payload.paymentMethod ?? null,
        notes: normalizeOptionalText(payload.notes),
        status: resolveFinancialStatusForDueDate(FinancialEntryStatus.PENDING, dueDate)
      },
      include: accountsReceivableInclude
    });

    await this.auditService.log({
      storeId: store.id,
      userId: context.userId ?? null,
      action: "accounts_receivable.created",
      entity: "accounts_receivable",
      entityId: entry.id,
      newData: entry,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateEntry(entry);
  }

  async update(
    id: string,
    payload: UpdateAccountsReceivableDto,
    context: FinancialAuditContext
  ) {
    const previous = await this.findByIdOrFail(id);

    if (previous.status === FinancialEntryStatus.RECEIVED) {
      throw new BadRequestException("Contas recebidas nao podem ser editadas.");
    }

    if (payload.status === FinancialEntryStatus.RECEIVED) {
      throw new BadRequestException("Use a acao de recebimento para baixar a conta.");
    }

    const customerId =
      payload.customerId === undefined
        ? undefined
        : payload.customerId
          ? (await this.findCustomerById(payload.customerId)).id
          : null;

    const saleId =
      payload.saleId === undefined
        ? undefined
        : payload.saleId
          ? (await this.findSaleById(payload.saleId)).id
          : null;

    const serviceOrderId =
      payload.serviceOrderId === undefined
        ? undefined
        : payload.serviceOrderId
          ? (await this.findServiceOrderById(payload.serviceOrderId)).id
          : null;

    const dueDate = payload.dueDate ? parseDateOnly(payload.dueDate) : previous.dueDate;
    const nextStatus =
      payload.status === FinancialEntryStatus.CANCELED
        ? FinancialEntryStatus.CANCELED
        : resolveFinancialStatusForDueDate(payload.status ?? previous.status, dueDate);

    const entry = await this.prisma.accountsReceivable.update({
      where: {
        id
      },
      data: {
        customerId,
        saleId,
        serviceOrderId,
        description: payload.description?.trim(),
        amount: payload.amount,
        dueDate: payload.dueDate ? dueDate : undefined,
        paymentMethod:
          payload.paymentMethod === undefined ? undefined : payload.paymentMethod,
        notes: payload.notes === undefined ? undefined : normalizeOptionalText(payload.notes),
        status: nextStatus
      },
      include: accountsReceivableInclude
    });

    await this.auditService.log({
      storeId: previous.storeId,
      userId: context.userId ?? null,
      action: nextStatus === FinancialEntryStatus.CANCELED ? "accounts_receivable.canceled" : "accounts_receivable.updated",
      entity: "accounts_receivable",
      entityId: entry.id,
      oldData: previous,
      newData: entry,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateEntry(entry);
  }

  async receive(
    id: string,
    payload: ReceiveAccountsReceivableDto,
    context: FinancialAuditContext
  ) {
    await this.syncOverdueStatuses();
    const previous = await this.findByIdOrFail(id);

    if (previous.status === FinancialEntryStatus.CANCELED) {
      throw new BadRequestException("Nao e possivel receber uma conta cancelada.");
    }

    if (previous.status === FinancialEntryStatus.RECEIVED) {
      throw new BadRequestException("A conta informada ja foi recebida.");
    }

    const session = await this.findCurrentOpenCashSession();
    if (!session) {
      throw new BadRequestException("Abra um caixa para registrar o recebimento.");
    }

    const receivedAt = payload.receivedAt ? new Date(payload.receivedAt) : new Date();
    const notes = normalizeOptionalText(payload.notes);

    const entry = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.accountsReceivable.update({
        where: {
          id
        },
        data: {
          status: FinancialEntryStatus.RECEIVED,
          receivedAt,
          paymentMethod: payload.paymentMethod,
          notes: notes ?? previous.notes
        },
        include: accountsReceivableInclude
      });

      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id,
          movementType: CashMovementType.SUPPLY,
          amount: previous.amount,
          paymentMethod: payload.paymentMethod,
          referenceType: "accounts_receivable",
          referenceId: previous.id,
          description: `Recebimento: ${previous.description}`,
          userId: context.userId ?? null
        }
      });

      return updated;
    });

    await this.auditService.log({
      storeId: previous.storeId,
      userId: context.userId ?? null,
      action: "accounts_receivable.received",
      entity: "accounts_receivable",
      entityId: entry.id,
      oldData: previous,
      newData: entry,
      metadata: {
        cashSessionId: session.id,
        paymentMethod: payload.paymentMethod
      },
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateEntry(entry);
  }

  private async syncOverdueStatuses() {
    await this.prisma.accountsReceivable.updateMany({
      where: {
        status: FinancialEntryStatus.PENDING,
        dueDate: {
          lt: getTodayStart()
        }
      },
      data: {
        status: FinancialEntryStatus.OVERDUE
      }
    });
  }

  private decorateEntry(entry: AccountsReceivableRecord) {
    const effectiveStatus = resolveFinancialStatusForDueDate(entry.status, entry.dueDate);
    return {
      ...entry,
      status: effectiveStatus,
      isOverdue: effectiveStatus === FinancialEntryStatus.OVERDUE,
      daysUntilDue: calculateDaysUntilDue(entry.dueDate)
    };
  }

  private async findByIdOrFail(id: string) {
    const entry = await this.prisma.accountsReceivable.findUnique({
      where: {
        id
      },
      include: accountsReceivableInclude
    });

    if (!entry) {
      throw new NotFoundException("Conta a receber nao encontrada.");
    }

    return entry;
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
      throw new NotFoundException("Nenhuma loja ativa encontrada.");
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
      throw new NotFoundException("Loja nao encontrada.");
    }

    return store;
  }

  private async findCustomerById(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: {
        id
      }
    });

    if (!customer) {
      throw new NotFoundException("Cliente nao encontrado.");
    }

    return customer;
  }

  private async findSaleById(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: {
        id
      }
    });

    if (!sale) {
      throw new NotFoundException("Venda nao encontrada.");
    }

    return sale;
  }

  private async findServiceOrderById(id: string) {
    const serviceOrder = await this.prisma.serviceOrder.findUnique({
      where: {
        id
      }
    });

    if (!serviceOrder) {
      throw new NotFoundException("Ordem de servico nao encontrada.");
    }

    return serviceOrder;
  }

  private async findCurrentOpenCashSession() {
    return this.prisma.cashSession.findFirst({
      where: {
        status: CashSessionStatus.OPEN
      },
      orderBy: {
        openedAt: "desc"
      },
      select: {
        id: true
      }
    });
  }
}

