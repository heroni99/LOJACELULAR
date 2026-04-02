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
import { CreateAccountsPayableDto } from "./dto/create-accounts-payable.dto";
import { ListAccountsPayableDto } from "./dto/list-accounts-payable.dto";
import { PayAccountsPayableDto } from "./dto/pay-accounts-payable.dto";
import { UpdateAccountsPayableDto } from "./dto/update-accounts-payable.dto";

type FinancialAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const accountsPayableInclude = {
  store: {
    select: {
      id: true,
      code: true,
      name: true,
      displayName: true
    }
  },
  supplier: {
    select: {
      id: true,
      name: true,
      tradeName: true
    }
  },
  purchaseOrder: {
    select: {
      id: true,
      status: true,
      total: true,
      orderedAt: true
    }
  }
} satisfies Prisma.AccountsPayableInclude;

type AccountsPayableRecord = Prisma.AccountsPayableGetPayload<{
  include: typeof accountsPayableInclude;
}>;

@Injectable()
export class AccountsPayableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async findAll(filters: ListAccountsPayableDto) {
    await this.syncOverdueStatuses();

    const where: Prisma.AccountsPayableWhereInput = {
      ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
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
                supplier: {
                  name: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              },
              {
                supplier: {
                  tradeName: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              }
            ]
          }
        : {})
    };

    const entries = await this.prisma.accountsPayable.findMany({
      where,
      include: accountsPayableInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: Math.min(filters.take ?? 120, 200)
    });

    return entries.map((entry) => this.decorateEntry(entry));
  }

  async create(payload: CreateAccountsPayableDto, context: FinancialAuditContext) {
    const store = payload.storeId
      ? await this.findStoreById(payload.storeId)
      : await this.findDefaultStore();

    const supplierId =
      payload.supplierId === undefined
        ? undefined
        : payload.supplierId
          ? (await this.findSupplierById(payload.supplierId)).id
          : null;

    const purchaseOrderId =
      payload.purchaseOrderId === undefined
        ? undefined
        : payload.purchaseOrderId
          ? (await this.findPurchaseOrderById(payload.purchaseOrderId)).id
          : null;

    const dueDate = parseDateOnly(payload.dueDate);
    const entry = await this.prisma.accountsPayable.create({
      data: {
        storeId: store.id,
        supplierId,
        purchaseOrderId,
        description: payload.description.trim(),
        amount: payload.amount,
        dueDate,
        paymentMethod: payload.paymentMethod ?? null,
        notes: normalizeOptionalText(payload.notes),
        status: resolveFinancialStatusForDueDate(FinancialEntryStatus.PENDING, dueDate)
      },
      include: accountsPayableInclude
    });

    await this.auditService.log({
      storeId: store.id,
      userId: context.userId ?? null,
      action: "accounts_payable.created",
      entity: "accounts_payable",
      entityId: entry.id,
      newData: entry,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateEntry(entry);
  }

  async update(
    id: string,
    payload: UpdateAccountsPayableDto,
    context: FinancialAuditContext
  ) {
    const previous = await this.findByIdOrFail(id);

    if (previous.status === FinancialEntryStatus.PAID) {
      throw new BadRequestException("Contas pagas nao podem ser editadas.");
    }

    if (payload.status === FinancialEntryStatus.PAID) {
      throw new BadRequestException("Use a acao de pagamento para quitar a conta.");
    }

    const supplierId =
      payload.supplierId === undefined
        ? undefined
        : payload.supplierId
          ? (await this.findSupplierById(payload.supplierId)).id
          : null;

    const purchaseOrderId =
      payload.purchaseOrderId === undefined
        ? undefined
        : payload.purchaseOrderId
          ? (await this.findPurchaseOrderById(payload.purchaseOrderId)).id
          : null;

    const dueDate = payload.dueDate ? parseDateOnly(payload.dueDate) : previous.dueDate;
    const nextStatus =
      payload.status === FinancialEntryStatus.CANCELED
        ? FinancialEntryStatus.CANCELED
        : resolveFinancialStatusForDueDate(payload.status ?? previous.status, dueDate);

    const entry = await this.prisma.accountsPayable.update({
      where: {
        id
      },
      data: {
        supplierId,
        purchaseOrderId,
        description: payload.description?.trim(),
        amount: payload.amount,
        dueDate: payload.dueDate ? dueDate : undefined,
        paymentMethod:
          payload.paymentMethod === undefined ? undefined : payload.paymentMethod,
        notes: payload.notes === undefined ? undefined : normalizeOptionalText(payload.notes),
        status: nextStatus
      },
      include: accountsPayableInclude
    });

    await this.auditService.log({
      storeId: previous.storeId,
      userId: context.userId ?? null,
      action: nextStatus === FinancialEntryStatus.CANCELED ? "accounts_payable.canceled" : "accounts_payable.updated",
      entity: "accounts_payable",
      entityId: entry.id,
      oldData: previous,
      newData: entry,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.decorateEntry(entry);
  }

  async pay(id: string, payload: PayAccountsPayableDto, context: FinancialAuditContext) {
    await this.syncOverdueStatuses();
    const previous = await this.findByIdOrFail(id);

    if (previous.status === FinancialEntryStatus.CANCELED) {
      throw new BadRequestException("Nao e possivel pagar uma conta cancelada.");
    }

    if (previous.status === FinancialEntryStatus.PAID) {
      throw new BadRequestException("A conta informada ja foi paga.");
    }

    const session = await this.findCurrentOpenCashSession();
    if (!session) {
      throw new BadRequestException("Abra um caixa para registrar o pagamento.");
    }

    const paidAt = payload.paidAt ? new Date(payload.paidAt) : new Date();
    const notes = normalizeOptionalText(payload.notes);

    const entry = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.accountsPayable.update({
        where: {
          id
        },
        data: {
          status: FinancialEntryStatus.PAID,
          paidAt,
          paymentMethod: payload.paymentMethod,
          notes: notes ?? previous.notes
        },
        include: accountsPayableInclude
      });

      await tx.cashMovement.create({
        data: {
          cashSessionId: session.id,
          movementType: CashMovementType.WITHDRAWAL,
          amount: previous.amount,
          paymentMethod: payload.paymentMethod,
          referenceType: "accounts_payable",
          referenceId: previous.id,
          description: `Pagamento: ${previous.description}`,
          userId: context.userId ?? null
        }
      });

      return updated;
    });

    await this.auditService.log({
      storeId: previous.storeId,
      userId: context.userId ?? null,
      action: "accounts_payable.paid",
      entity: "accounts_payable",
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
    await this.prisma.accountsPayable.updateMany({
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

  private decorateEntry(entry: AccountsPayableRecord) {
    const effectiveStatus = resolveFinancialStatusForDueDate(entry.status, entry.dueDate);
    return {
      ...entry,
      status: effectiveStatus,
      isOverdue: effectiveStatus === FinancialEntryStatus.OVERDUE,
      daysUntilDue: calculateDaysUntilDue(entry.dueDate)
    };
  }

  private async findByIdOrFail(id: string) {
    const entry = await this.prisma.accountsPayable.findUnique({
      where: {
        id
      },
      include: accountsPayableInclude
    });

    if (!entry) {
      throw new NotFoundException("Conta a pagar nao encontrada.");
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

  private async findSupplierById(id: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: {
        id
      }
    });

    if (!supplier) {
      throw new NotFoundException("Fornecedor nao encontrado.");
    }

    return supplier;
  }

  private async findPurchaseOrderById(id: string) {
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: {
        id
      }
    });

    if (!purchaseOrder) {
      throw new NotFoundException("Pedido de compra nao encontrado.");
    }

    return purchaseOrder;
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

