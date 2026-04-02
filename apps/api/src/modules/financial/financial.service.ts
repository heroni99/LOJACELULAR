import { Injectable } from "@nestjs/common";
import {
  CashMovementType,
  CashSessionStatus,
  FinancialEntryStatus,
  PaymentMethod
} from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import {
  buildPeriodRange,
  formatSeriesDate,
  getTodayStart
} from "./financial-utils";
import { GetFinancialSummaryDto } from "./dto/get-financial-summary.dto";

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(filters: GetFinancialSummaryDto) {
    await Promise.all([this.syncPayablesOverdue(), this.syncReceivablesOverdue()]);

    const period = filters.period ?? "month";
    const { start, end } = buildPeriodRange(period);
    const pendingStatuses = [FinancialEntryStatus.PENDING, FinancialEntryStatus.OVERDUE];

    const [
      totalPayablePending,
      totalReceivablePending,
      currentCashSession,
      lastClosedSession,
      upcomingPayables,
      upcomingReceivables,
      paidEntries,
      receivedEntries,
      cashMovements
    ] = await Promise.all([
      this.sumAccountsPayableByStatus(pendingStatuses),
      this.sumAccountsReceivableByStatus(pendingStatuses),
      this.prisma.cashSession.findFirst({
        where: {
          status: CashSessionStatus.OPEN
        },
        include: {
          cashTerminal: {
            select: {
              id: true,
              name: true
            }
          },
          movements: {
            orderBy: {
              createdAt: "asc"
            }
          }
        },
        orderBy: {
          openedAt: "desc"
        }
      }),
      this.prisma.cashSession.findFirst({
        where: {
          status: CashSessionStatus.CLOSED
        },
        select: {
          id: true,
          cashTerminal: {
            select: {
              id: true,
              name: true
            }
          },
          closingAmount: true,
          closedAt: true
        },
        orderBy: {
          closedAt: "desc"
        }
      }),
      this.prisma.accountsPayable.findMany({
        where: {
          status: {
            in: pendingStatuses
          }
        },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              tradeName: true
            }
          }
        },
        orderBy: [{ dueDate: "asc" }, { amount: "desc" }],
        take: 6
      }),
      this.prisma.accountsReceivable.findMany({
        where: {
          status: {
            in: pendingStatuses
          }
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true
            }
          }
        },
        orderBy: [{ dueDate: "asc" }, { amount: "desc" }],
        take: 6
      }),
      this.prisma.accountsPayable.findMany({
        where: {
          status: FinancialEntryStatus.PAID,
          paidAt: {
            gte: start,
            lte: end
          }
        },
        select: {
          amount: true,
          paidAt: true
        }
      }),
      this.prisma.accountsReceivable.findMany({
        where: {
          status: FinancialEntryStatus.RECEIVED,
          receivedAt: {
            gte: start,
            lte: end
          }
        },
        select: {
          amount: true,
          receivedAt: true
        }
      }),
      this.prisma.cashMovement.findMany({
        where: {
          createdAt: {
            gte: start,
            lte: end
          }
        },
        orderBy: {
          createdAt: "asc"
        },
        select: {
          movementType: true,
          amount: true,
          paymentMethod: true,
          createdAt: true
        }
      })
    ]);

    const currentCashAmount = currentCashSession
      ? this.calculateCashOnHand(currentCashSession.movements)
      : lastClosedSession?.closingAmount ?? 0;
    const currentCashReference = currentCashSession
      ? {
          source: "open_session",
          sessionId: currentCashSession.id,
          terminalName: currentCashSession.cashTerminal.name,
          updatedAt: currentCashSession.openedAt
        }
      : lastClosedSession
        ? {
            source: "last_closed_session",
            sessionId: lastClosedSession.id,
            terminalName: lastClosedSession.cashTerminal.name,
            updatedAt: lastClosedSession.closedAt
          }
        : null;

    return {
      period,
      generatedAt: new Date().toISOString(),
      totals: {
        payablePending: totalPayablePending,
        receivablePending: totalReceivablePending,
        predictedBalance: totalReceivablePending - totalPayablePending,
        currentCash: currentCashAmount
      },
      charts: {
        cashFlow: this.buildCashFlowSeries({
          start,
          end,
          paidEntries,
          receivedEntries
        }),
        cashEvolution: this.buildCashEvolutionSeries({
          start,
          end,
          movements: cashMovements
        })
      },
      currentCashReference,
      upcoming: {
        payables: upcomingPayables,
        receivables: upcomingReceivables
      }
    };
  }

  private async syncPayablesOverdue() {
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

  private async syncReceivablesOverdue() {
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

  private async sumAccountsPayableByStatus(statuses: FinancialEntryStatus[]) {
    const aggregate = await this.prisma.accountsPayable.aggregate({
      where: {
        status: {
          in: statuses
        }
      },
      _sum: {
        amount: true
      }
    });

    return aggregate._sum.amount ?? 0;
  }

  private async sumAccountsReceivableByStatus(statuses: FinancialEntryStatus[]) {
    const aggregate = await this.prisma.accountsReceivable.aggregate({
      where: {
        status: {
          in: statuses
        }
      },
      _sum: {
        amount: true
      }
    });

    return aggregate._sum.amount ?? 0;
  }

  private buildCashFlowSeries(input: {
    start: Date;
    end: Date;
    paidEntries: Array<{ amount: number; paidAt: Date | null }>;
    receivedEntries: Array<{ amount: number; receivedAt: Date | null }>;
  }) {
    const map = this.buildEmptySeriesMap(input.start, input.end);

    for (const entry of input.receivedEntries) {
      if (!entry.receivedAt) {
        continue;
      }

      const point = map.get(formatSeriesDate(entry.receivedAt));
      if (point) {
        point.inflow += entry.amount;
      }
    }

    for (const entry of input.paidEntries) {
      if (!entry.paidAt) {
        continue;
      }

      const point = map.get(formatSeriesDate(entry.paidAt));
      if (point) {
        point.outflow += entry.amount;
      }
    }

    return [...map.values()];
  }

  private buildCashEvolutionSeries(input: {
    start: Date;
    end: Date;
    movements: Array<{
      movementType: CashMovementType;
      amount: number;
      paymentMethod: PaymentMethod | null;
      createdAt: Date;
    }>;
  }) {
    const map = new Map(
      [...this.buildEmptySeriesMap(input.start, input.end).values()].map((entry) => [
        entry.date,
        { date: entry.date, balance: 0 }
      ])
    );

    let runningBalance = 0;
    for (const movement of input.movements) {
      runningBalance += this.cashMovementDelta(movement);
      const point = map.get(formatSeriesDate(movement.createdAt));
      if (point) {
        point.balance = runningBalance;
      }
    }

    let carry = 0;
    for (const point of map.values()) {
      carry = point.balance || carry;
      point.balance = carry;
    }

    return [...map.values()];
  }

  private buildEmptySeriesMap(start: Date, end: Date) {
    const map = new Map<string, { date: string; inflow: number; outflow: number }>();
    const cursor = new Date(start);

    while (cursor <= end) {
      const key = formatSeriesDate(cursor);
      map.set(key, {
        date: key,
        inflow: 0,
        outflow: 0
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return map;
  }

  private cashMovementDelta(movement: {
    movementType: CashMovementType;
    amount: number;
    paymentMethod: PaymentMethod | null;
  }) {
    switch (movement.movementType) {
      case CashMovementType.OPENING:
        return movement.amount;
      case CashMovementType.SUPPLY:
        return movement.paymentMethod === null || movement.paymentMethod === PaymentMethod.CASH
          ? movement.amount
          : 0;
      case CashMovementType.WITHDRAWAL:
        return movement.paymentMethod === null || movement.paymentMethod === PaymentMethod.CASH
          ? -movement.amount
          : 0;
      case CashMovementType.SALE:
        return movement.paymentMethod === PaymentMethod.CASH ? movement.amount : 0;
      case CashMovementType.REFUND:
        return movement.paymentMethod === PaymentMethod.CASH ? -movement.amount : 0;
      case CashMovementType.CLOSING:
      default:
        return 0;
    }
  }

  private calculateCashOnHand(
    movements: Array<{
      movementType: CashMovementType;
      amount: number;
      paymentMethod: PaymentMethod | null;
    }>
  ) {
    return movements.reduce((total, movement) => total + this.cashMovementDelta(movement), 0);
  }
}

