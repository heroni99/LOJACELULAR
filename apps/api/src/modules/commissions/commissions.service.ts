import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, SaleStatus } from "@prisma/client";
import {
  formatDateParts,
  zonedDateTimeToUtc
} from "../../common/reporting-date.utils";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { CommissionPeriodDto } from "./dto/commission-period.dto";
import { CreateCommissionDto } from "./dto/create-commission.dto";
import { UpsertSalesTargetDto } from "./dto/upsert-sales-target.dto";

type CommissionAuditContext = {
  userId?: string | null;
  storeId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | string[] | undefined;
};

const commissionRecordSelect = {
  id: true,
  commissionType: true,
  commissionValue: true,
  createdAt: true,
  sale: {
    select: {
      id: true,
      saleNumber: true,
      total: true,
      completedAt: true,
      status: true
    }
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  }
} satisfies Prisma.SalesCommissionSelect;

type CommissionRecord = Prisma.SalesCommissionGetPayload<{
  select: typeof commissionRecordSelect;
}>;

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  async getMySummary(userId: string, storeId: string, filters: CommissionPeriodDto) {
    this.assertStoreScope(storeId);

    const period = await this.resolvePeriod(storeId, filters);
    await this.findUserInStore(userId, storeId);

    const [commissions, salesAggregate, target] = await Promise.all([
      this.prisma.salesCommission.findMany({
        where: {
          userId,
          createdAt: {
            gte: period.start,
            lt: period.endExclusive
          },
          sale: {
            storeId
          }
        },
        select: commissionRecordSelect,
        orderBy: {
          createdAt: "desc"
        }
      }),
      this.prisma.sale.aggregate({
        where: {
          storeId,
          userId,
          status: SaleStatus.COMPLETED,
          completedAt: {
            gte: period.start,
            lt: period.endExclusive
          }
        },
        _sum: {
          total: true
        }
      }),
      this.prisma.salesTarget.findUnique({
        where: {
          userId_periodMonth_periodYear: {
            userId,
            periodMonth: period.month,
            periodYear: period.year
          }
        }
      })
    ]);

    const totalCommission = commissions.reduce(
      (sum, item) => sum + item.commissionValue,
      0
    );
    const totalSold = salesAggregate._sum.total ?? 0;
    const targetAmount = target?.targetAmount ?? 0;

    return {
      generatedAt: new Date().toISOString(),
      timeZone: period.timeZone,
      periodMonth: period.month,
      periodYear: period.year,
      summary: {
        totalCommission,
        totalSold,
        targetAmount,
        achievementPercent: this.calculateAchievementPercent(totalSold, targetAmount)
      },
      rows: commissions.map((item) => this.serializeCommissionRecord(item))
    };
  }

  async getTeamSummary(storeId: string, filters: CommissionPeriodDto) {
    this.assertStoreScope(storeId);

    const period = await this.resolvePeriod(storeId, filters);
    const [activeUsers, salesGroups, commissionGroups, targets] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          storeId,
          active: true
        },
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: "asc"
        }
      }),
      this.prisma.sale.groupBy({
        by: ["userId"],
        where: {
          storeId,
          status: SaleStatus.COMPLETED,
          userId: {
            not: null
          },
          completedAt: {
            gte: period.start,
            lt: period.endExclusive
          }
        },
        _sum: {
          total: true
        },
        _count: {
          _all: true
        }
      }),
      this.prisma.salesCommission.groupBy({
        by: ["userId"],
        where: {
          createdAt: {
            gte: period.start,
            lt: period.endExclusive
          },
          sale: {
            storeId
          }
        },
        _sum: {
          commissionValue: true
        }
      }),
      this.prisma.salesTarget.findMany({
        where: {
          periodMonth: period.month,
          periodYear: period.year,
          user: {
            storeId,
            active: true
          }
        },
        select: {
          id: true,
          userId: true,
          targetAmount: true
        }
      })
    ]);

    const activeUsersById = new Map(activeUsers.map((user) => [user.id, user]));
    const salesByUserId = new Map(
      salesGroups
        .filter((entry): entry is typeof entry & { userId: string } => Boolean(entry.userId))
        .map((entry) => [
          entry.userId,
          {
            saleCount: entry._count._all,
            totalSold: entry._sum.total ?? 0
          }
        ])
    );
    const commissionsByUserId = new Map(
      commissionGroups.map((entry) => [entry.userId, entry._sum.commissionValue ?? 0])
    );
    const targetsByUserId = new Map(
      targets.map((entry) => [
        entry.userId,
        {
          id: entry.id,
          targetAmount: entry.targetAmount
        }
      ])
    );

    const relevantUserIds = new Set<string>();

    for (const userId of salesByUserId.keys()) {
      relevantUserIds.add(userId);
    }

    for (const userId of commissionsByUserId.keys()) {
      relevantUserIds.add(userId);
    }

    for (const userId of targetsByUserId.keys()) {
      relevantUserIds.add(userId);
    }

    const rows = [...relevantUserIds]
      .map((userId) => {
        const user = activeUsersById.get(userId);

        if (!user) {
          return null;
        }

        const sales = salesByUserId.get(userId);
        const target = targetsByUserId.get(userId);
        const totalSold = sales?.totalSold ?? 0;
        const targetAmount = target?.targetAmount ?? 0;

        return {
          userId: user.id,
          name: user.name,
          saleCount: sales?.saleCount ?? 0,
          totalSold,
          totalCommission: commissionsByUserId.get(userId) ?? 0,
          targetId: target?.id ?? null,
          targetAmount,
          achievementPercent: this.calculateAchievementPercent(totalSold, targetAmount)
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((left, right) => {
        if (right.totalSold !== left.totalSold) {
          return right.totalSold - left.totalSold;
        }

        return left.name.localeCompare(right.name);
      });

    return {
      generatedAt: new Date().toISOString(),
      timeZone: period.timeZone,
      periodMonth: period.month,
      periodYear: period.year,
      rows
    };
  }

  async create(payload: CreateCommissionDto, context: CommissionAuditContext) {
    this.assertStoreScope(context.storeId);

    const commissionType = payload.commissionType.trim();

    if (!commissionType) {
      throw new BadRequestException("Informe o tipo da comissao.");
    }

    const [user, sale] = await Promise.all([
      this.findUserInStore(payload.userId, context.storeId),
      this.findSaleInStore(payload.saleId, context.storeId)
    ]);

    const commission = await this.prisma.salesCommission.create({
      data: {
        userId: user.id,
        saleId: sale.id,
        commissionType,
        commissionValue: payload.commissionValue
      },
      select: commissionRecordSelect
    });

    await this.auditService.log({
      storeId: context.storeId,
      userId: context.userId ?? null,
      action: "commissions.created",
      entity: "sales_commissions",
      entityId: commission.id,
      newData: this.serializeCommissionRecord(commission),
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return this.serializeCommissionRecord(commission);
  }

  async getTargets(storeId: string, filters: CommissionPeriodDto) {
    this.assertStoreScope(storeId);

    const period = await this.resolvePeriod(storeId, filters);
    const [users, targets] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          storeId,
          active: true
        },
        select: {
          id: true,
          name: true,
          email: true
        },
        orderBy: {
          name: "asc"
        }
      }),
      this.prisma.salesTarget.findMany({
        where: {
          periodMonth: period.month,
          periodYear: period.year,
          user: {
            storeId,
            active: true
          }
        },
        select: {
          id: true,
          userId: true,
          targetAmount: true,
          periodMonth: true,
          periodYear: true,
          createdAt: true
        }
      })
    ]);

    const targetsByUserId = new Map(targets.map((target) => [target.userId, target]));

    return {
      generatedAt: new Date().toISOString(),
      timeZone: period.timeZone,
      periodMonth: period.month,
      periodYear: period.year,
      rows: users.map((user) => {
        const target = targetsByUserId.get(user.id);

        return {
          targetId: target?.id ?? null,
          userId: user.id,
          name: user.name,
          email: user.email,
          targetAmount: target?.targetAmount ?? 0,
          periodMonth: period.month,
          periodYear: period.year,
          createdAt: target?.createdAt?.toISOString() ?? null
        };
      })
    };
  }

  async upsertTarget(payload: UpsertSalesTargetDto, context: CommissionAuditContext) {
    this.assertStoreScope(context.storeId);

    const user = await this.findUserInStore(payload.userId, context.storeId);

    const target = await this.prisma.salesTarget.upsert({
      where: {
        userId_periodMonth_periodYear: {
          userId: user.id,
          periodMonth: payload.month,
          periodYear: payload.year
        }
      },
      create: {
        userId: user.id,
        periodMonth: payload.month,
        periodYear: payload.year,
        targetAmount: payload.targetAmount
      },
      update: {
        targetAmount: payload.targetAmount
      },
      select: {
        id: true,
        userId: true,
        periodMonth: true,
        periodYear: true,
        targetAmount: true,
        createdAt: true
      }
    });

    const response = {
      targetId: target.id,
      userId: user.id,
      name: user.name,
      email: user.email,
      targetAmount: target.targetAmount,
      periodMonth: target.periodMonth,
      periodYear: target.periodYear,
      createdAt: target.createdAt.toISOString()
    };

    await this.auditService.log({
      storeId: context.storeId,
      userId: context.userId ?? null,
      action: "sales-targets.upserted",
      entity: "sales_targets",
      entityId: target.id,
      newData: response,
      ipAddress: context.ipAddress ?? null,
      userAgent: context.userAgent
    });

    return response;
  }

  private serializeCommissionRecord(record: CommissionRecord) {
    return {
      commissionId: record.id,
      commissionType: record.commissionType,
      commissionValue: record.commissionValue,
      createdAt: record.createdAt.toISOString(),
      sale: {
        id: record.sale.id,
        saleNumber: record.sale.saleNumber,
        total: record.sale.total,
        completedAt: record.sale.completedAt.toISOString(),
        status: record.sale.status
      },
      user: {
        id: record.user.id,
        name: record.user.name,
        email: record.user.email
      }
    };
  }

  private calculateAchievementPercent(totalSold: number, targetAmount: number) {
    if (targetAmount <= 0) {
      return 0;
    }

    return Math.round((totalSold / targetAmount) * 1000) / 10;
  }

  private async resolvePeriod(storeId: string, filters: CommissionPeriodDto) {
    const store = await this.findReferenceStore(storeId);
    const timeZone = store?.timezone ?? "America/Sao_Paulo";
    const now = formatDateParts(new Date(), timeZone);
    const month = filters.month ?? now.month;
    const year = filters.year ?? now.year;
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;

    return {
      timeZone,
      month,
      year,
      start: zonedDateTimeToUtc({ year, month, day: 1 }, timeZone),
      endExclusive: zonedDateTimeToUtc(
        { year: nextMonthYear, month: nextMonth, day: 1 },
        timeZone
      )
    };
  }

  private async findReferenceStore(preferredStoreId?: string | null) {
    if (preferredStoreId) {
      const store = await this.prisma.store.findUnique({
        where: {
          id: preferredStoreId
        },
        select: {
          id: true,
          timezone: true,
          active: true
        }
      });

      if (store?.active) {
        return {
          id: store.id,
          timezone: store.timezone
        };
      }
    }

    const store = await this.prisma.store.findFirst({
      where: {
        active: true
      },
      orderBy: {
        createdAt: "asc"
      },
      select: {
        id: true,
        timezone: true
      }
    });

    return store ?? null;
  }

  private async findUserInStore(userId: string, storeId: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        storeId
      },
      select: {
        id: true,
        name: true,
        email: true,
        active: true
      }
    });

    if (!user) {
      throw new NotFoundException("Usuario nao encontrado para a comissao.");
    }

    return user;
  }

  private async findSaleInStore(saleId: string, storeId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id: saleId,
        storeId
      },
      select: {
        id: true,
        saleNumber: true,
        total: true,
        completedAt: true,
        status: true
      }
    });

    if (!sale) {
      throw new NotFoundException("Venda nao encontrada para a comissao.");
    }

    return sale;
  }

  private assertStoreScope(storeId?: string | null): asserts storeId is string {
    if (!storeId) {
      throw new ForbiddenException("Loja do operador nao encontrada para as comissoes.");
    }
  }
}
