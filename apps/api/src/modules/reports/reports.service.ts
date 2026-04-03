import { Injectable } from "@nestjs/common";
import {
  CashMovementType,
  CashSessionStatus,
  FinancialEntryStatus,
  PaymentMethod,
  Prisma,
  SaleStatus
} from "@prisma/client";
import {
  addDays,
  buildDateKeysBetween,
  formatDateInTimeZone,
  parseDateOnlyInTimeZone
} from "../../common/reporting-date.utils";
import { PrismaService } from "../../prisma/prisma.service";
import { stringify } from "csv-stringify/sync";
import { CashReportFiltersDto } from "./dto/cash-report-filters.dto";
import { CustomerReportFiltersDto } from "./dto/customer-report-filters.dto";
import { SalesReportFiltersDto } from "./dto/sales-report-filters.dto";
import { StockReportFiltersDto } from "./dto/stock-report-filters.dto";

const salesReportSelect = {
  id: true,
  saleNumber: true,
  receiptNumber: true,
  subtotal: true,
  discountAmount: true,
  total: true,
  status: true,
  fiscalStatus: true,
  completedAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      phone: true
    }
  },
  user: {
    select: {
      id: true,
      name: true,
      email: true
    }
  },
  cashSession: {
    select: {
      id: true,
      cashTerminal: {
        select: {
          id: true,
          name: true
        }
      }
    }
  },
  items: {
    select: {
      quantity: true,
      totalPrice: true,
      product: {
        select: {
          id: true,
          name: true,
          internalCode: true,
          isService: true,
          costPrice: true,
          category: {
            select: {
              id: true,
              name: true,
              prefix: true
            }
          }
        }
      }
    }
  },
  payments: {
    select: {
      id: true,
      method: true,
      amount: true
    }
  }
} satisfies Prisma.SaleSelect;

const stockReportProductSelect = {
  id: true,
  name: true,
  internalCode: true,
  supplierCode: true,
  active: true,
  brand: true,
  model: true,
  costPrice: true,
  salePrice: true,
  stockMin: true,
  category: {
    select: {
      id: true,
      name: true,
      prefix: true
    }
  },
  supplier: {
    select: {
      id: true,
      name: true,
      tradeName: true
    }
  },
  balances: {
    include: {
      location: {
        select: {
          id: true,
          name: true,
          isDefault: true,
          active: true
        }
      }
    }
  }
} satisfies Prisma.ProductSelect;

const cashReportSessionSelect = {
  id: true,
  status: true,
  openingAmount: true,
  expectedAmount: true,
  closingAmount: true,
  difference: true,
  openedAt: true,
  closedAt: true,
  cashTerminal: {
    select: {
      id: true,
      name: true
    }
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
    select: {
      id: true,
      movementType: true,
      amount: true,
      paymentMethod: true,
      referenceType: true,
      referenceId: true,
      description: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  },
  sales: {
    select: {
      id: true,
      saleNumber: true,
      total: true,
      status: true,
      completedAt: true
    }
  }
} satisfies Prisma.CashSessionSelect;

type SalesReportSale = Prisma.SaleGetPayload<{
  select: typeof salesReportSelect;
}>;

type StockReportProduct = Prisma.ProductGetPayload<{
  select: typeof stockReportProductSelect;
}>;

type CashReportSession = Prisma.CashSessionGetPayload<{
  select: typeof cashReportSessionSelect;
}>;

type SalesReportRow = {
  id: string;
  saleNumber: string;
  receiptNumber: string | null;
  status: SaleStatus;
  fiscalStatus: string;
  completedAt: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  estimatedProfit: number;
  itemCount: number;
  paymentCount: number;
  paymentMethods: PaymentMethod[];
  customer: {
    id: string;
    name: string;
    phone: string;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  cashTerminal: {
    id: string;
    name: string;
  };
};

type StockReportRow = {
  productId: string;
  name: string;
  internalCode: string;
  supplierCode: string | null;
  active: boolean;
  brand: string | null;
  model: string | null;
  costPrice: number;
  salePrice: number;
  stockMin: number;
  totalStock: number;
  lowStock: boolean;
  inventoryCostValue: number;
  inventorySaleValue: number;
  category: {
    id: string;
    name: string;
    prefix: string;
  };
  supplier: {
    id: string;
    name: string;
    tradeName: string | null;
  } | null;
  balances: Array<{
    id: string;
    quantity: number;
    location: {
      id: string;
      name: string;
      isDefault: boolean;
      active: boolean;
    };
  }>;
};

type CashMovementRow = {
  id: string;
  sessionId: string;
  sessionStatus: CashSessionStatus;
  terminal: {
    id: string;
    name: string;
  };
  movementType: CashMovementType;
  paymentMethod: PaymentMethod | null;
  amount: number;
  description: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
};

type CashSessionRow = {
  id: string;
  status: CashSessionStatus;
  openedAt: string;
  closedAt: string | null;
  openingAmount: number;
  expectedAmount: number | null;
  closingAmount: number | null;
  difference: number | null;
  terminal: {
    id: string;
    name: string;
  };
  openedByUser: {
    id: string;
    name: string;
    email: string;
  } | null;
  salesCount: number;
  salesTotal: number;
  movementCount: number;
  inflow: number;
  outflow: number;
  netFlow: number;
};

type CustomerReportRow = {
  id: string;
  name: string;
  cpfCnpj: string | null;
  email: string | null;
  phone: string;
  city: string | null;
  state: string | null;
  active: boolean;
  orderCount: number;
  totalRevenue: number;
  averageTicket: number;
  lastPurchaseAt: string | null;
  openReceivables: number;
  overdueReceivables: number;
};

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSalesReport(
    preferredStoreId: string | null | undefined,
    filters: SalesReportFiltersDto
  ) {
    const store = await this.findReferenceStore(preferredStoreId);
    const timeZone = store?.timezone ?? "America/Sao_Paulo";
    const range = this.resolveDateRange(timeZone, filters.startDate, filters.endDate);
    const salesWhere: Prisma.SaleWhereInput = {
      ...(store?.id ? { storeId: store.id } : {}),
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.userId ? { userId: filters.userId } : {}),
      ...(filters.paymentMethod
        ? {
            payments: {
              some: {
                method: filters.paymentMethod
              }
            }
          }
        : {}),
      ...(range
        ? {
            completedAt: {
              ...(range.start ? { gte: range.start } : {}),
              ...(range.endInclusive ? { lte: range.endInclusive } : {})
            }
          }
        : {}),
      ...(filters.search
        ? {
            OR: [
              {
                saleNumber: {
                  contains: filters.search,
                  mode: "insensitive"
                }
              },
              {
                receiptNumber: {
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
                user: {
                  name: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              }
            ]
          }
        : {})
    };
    const sales = await this.prisma.sale.findMany({
      where: {
        ...salesWhere,
        ...(filters.status ? { status: filters.status } : {}),
      },
      select: salesReportSelect,
      orderBy: {
        completedAt: "desc"
      }
    });

    const rows = sales.map((sale) => this.serializeSalesRow(sale));
    const canceledSalesTotal =
      filters.status === SaleStatus.CANCELED
        ? sales.reduce((total, sale) => total + sale.total, 0)
        : (
            await this.prisma.sale.aggregate({
              where: {
                ...salesWhere,
                status: SaleStatus.CANCELED
              },
              _sum: {
                total: true
              }
            })
          )._sum.total ?? 0;
    const summary = {
      orderCount: rows.length,
      totalRevenue: rows.reduce((total, row) => total + row.total, 0),
      totalDiscount: rows.reduce((total, row) => total + row.discountAmount, 0),
      totalProfit: rows.reduce((total, row) => total + row.estimatedProfit, 0),
      totalItemsSold: rows.reduce((total, row) => total + row.itemCount, 0),
      totalCanceled: canceledSalesTotal,
      averageTicket: rows.length
        ? Math.round(rows.reduce((total, row) => total + row.total, 0) / rows.length)
        : 0
    };
    const chartKeys = this.resolveChartKeys(
      timeZone,
      range,
      sales.map((sale) => sale.completedAt)
    );
    const chartMap = new Map(
      chartKeys.map((date) => [
        date,
        {
          date,
          revenue: 0,
          profit: 0,
          orders: 0,
          itemsSold: 0
        }
      ])
    );
    const topProductsMap = new Map<
      string,
      {
        productId: string;
        name: string;
        internalCode: string;
        quantitySold: number;
        revenue: number;
        category: {
          id: string;
          name: string;
          prefix: string;
        };
      }
    >();

    for (const sale of sales) {
      const dateKey = formatDateInTimeZone(sale.completedAt, timeZone);
      const chartEntry = chartMap.get(dateKey);
      let costTotal = 0;
      let itemCount = 0;

      for (const item of sale.items) {
        costTotal += item.product.costPrice * item.quantity;
        itemCount += item.quantity;

        const current = topProductsMap.get(item.product.id) ?? {
          productId: item.product.id,
          name: item.product.name,
          internalCode: item.product.internalCode,
          quantitySold: 0,
          revenue: 0,
          category: item.product.category
        };

        current.quantitySold += item.quantity;
        current.revenue += item.totalPrice;
        topProductsMap.set(item.product.id, current);
      }

      if (chartEntry) {
        chartEntry.revenue += sale.total;
        chartEntry.profit += sale.total - costTotal;
        chartEntry.orders += 1;
        chartEntry.itemsSold += itemCount;
      }
    }

    if (filters.format === "csv") {
      return this.buildCsv(
        [
          "Numero",
          "Data",
          "Cliente",
          "Operador",
          "Pagamento",
          "Total",
          "Status"
        ],
        rows.map((row) => [
          row.saleNumber,
          row.completedAt,
          row.customer?.name ?? "",
          row.user?.name ?? "",
          row.paymentMethods.join(", "),
          row.total,
          row.status
        ])
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      summary,
      charts: {
        dailyRevenue: [...chartMap.values()]
      },
      topProducts: [...topProductsMap.values()]
        .sort((left, right) => {
          if (right.quantitySold !== left.quantitySold) {
            return right.quantitySold - left.quantitySold;
          }

          return right.revenue - left.revenue;
        })
        .slice(0, 8),
      rows: rows.slice(0, filters.take ?? 120)
    };
  }

  async getStockReport(
    preferredStoreId: string | null | undefined,
    filters: StockReportFiltersDto
  ) {
    const store = await this.findReferenceStore(preferredStoreId);
    const products = await this.prisma.product.findMany({
      where: {
        isService: false,
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        ...(filters.active === undefined ? {} : { active: filters.active }),
        ...(filters.search
          ? {
              OR: [
                {
                  name: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                },
                {
                  internalCode: {
                    contains: filters.search.toUpperCase(),
                    mode: "insensitive"
                  }
                },
                {
                  supplierCode: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                },
                {
                  brand: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                },
                {
                  model: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              ]
            }
          : {})
      },
      select: {
        ...stockReportProductSelect,
        balances: {
          where: {
            ...(store?.id
              ? {
                  location: {
                    storeId: store.id,
                    ...(filters.locationId ? { id: filters.locationId } : {})
                  }
                }
              : filters.locationId
                ? {
                    locationId: filters.locationId
                  }
                : {})
          },
          include: {
            location: {
              select: {
                id: true,
                name: true,
                isDefault: true,
                active: true
              }
            }
          }
        }
      },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });

    const rows = products
      .map((product) => this.serializeStockRow(product))
      .filter((row) => (filters.lowStockOnly ? row.lowStock : true));
    const summary = {
      trackedProducts: rows.length,
      totalQuantity: rows.reduce((total, row) => total + row.totalStock, 0),
      totalCostValue: rows.reduce((total, row) => total + row.inventoryCostValue, 0),
      totalSaleValue: rows.reduce((total, row) => total + row.inventorySaleValue, 0),
      lowStockCount: rows.filter((row) => row.lowStock).length
    };
    const categoryBreakdown = new Map<
      string,
      {
        categoryId: string;
        name: string;
        totalQuantity: number;
        inventoryValue: number;
      }
    >();

    for (const row of rows) {
      const current = categoryBreakdown.get(row.category.id) ?? {
        categoryId: row.category.id,
        name: row.category.name,
        totalQuantity: 0,
        inventoryValue: 0
      };

      current.totalQuantity += row.totalStock;
      current.inventoryValue += row.inventorySaleValue;
      categoryBreakdown.set(row.category.id, current);
    }

    if (filters.format === "csv") {
      return this.buildCsv(
        [
          "Codigo",
          "Nome",
          "Categoria",
          "Estoque por local",
          "Custo",
          "Preco",
          "Minimo",
          "Ativo"
        ],
        rows.map((row) => [
          row.internalCode,
          row.name,
          row.category.name,
          row.balances.length
            ? row.balances
                .map((balance) => `${balance.location.name}: ${balance.quantity}`)
                .join(" | ")
            : `Total: ${row.totalStock}`,
          row.costPrice,
          row.salePrice,
          row.stockMin,
          row.active
        ])
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      summary,
      charts: {
        categoryBreakdown: [...categoryBreakdown.values()]
          .sort((left, right) => right.totalQuantity - left.totalQuantity)
          .slice(0, 8)
      },
      rows: rows.slice(0, filters.take ?? 120)
    };
  }

  async getCashReport(
    preferredStoreId: string | null | undefined,
    filters: CashReportFiltersDto
  ) {
    const store = await this.findReferenceStore(preferredStoreId);
    const timeZone = store?.timezone ?? "America/Sao_Paulo";
    const range = this.resolveDateRange(timeZone, filters.startDate, filters.endDate);
    const sessions = await this.prisma.cashSession.findMany({
      where: {
        cashTerminal: {
          ...(store?.id ? { storeId: store.id } : {}),
          ...(filters.cashTerminalId ? { id: filters.cashTerminalId } : {})
        },
        ...(filters.sessionStatus ? { status: filters.sessionStatus } : {}),
        ...(range
          ? {
              movements: {
                some: {
                  createdAt: {
                    ...(range.start ? { gte: range.start } : {}),
                    ...(range.endInclusive ? { lte: range.endInclusive } : {})
                  }
                }
              }
            }
          : {})
      },
      select: {
        ...cashReportSessionSelect,
        movements: {
          where: {
            ...(range
              ? {
                  createdAt: {
                    ...(range.start ? { gte: range.start } : {}),
                    ...(range.endInclusive ? { lte: range.endInclusive } : {})
                  }
                }
              : {})
          },
          orderBy: {
            createdAt: "asc"
          },
          select: {
            id: true,
            movementType: true,
            amount: true,
            paymentMethod: true,
            referenceType: true,
            referenceId: true,
            description: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        sales: {
          select: {
            id: true,
            saleNumber: true,
            total: true,
            status: true,
            completedAt: true
          }
        }
      },
      orderBy: {
        openedAt: "desc"
      }
    });

    const movementRows: CashMovementRow[] = [];
    const sessionRows: CashSessionRow[] = [];

    for (const session of sessions) {
      const filteredMovements = session.movements.filter((movement) =>
        this.matchesCashMovementFilters(movement, filters)
      );

      if ((filters.movementType || filters.paymentMethod) && !filteredMovements.length) {
        continue;
      }

      const movementSummary = filteredMovements.reduce(
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
              summary.supplies += movement.amount;
              break;
            case CashMovementType.WITHDRAWAL:
              summary.withdrawals += movement.amount;
              break;
            case CashMovementType.REFUND:
              if (movement.paymentMethod === PaymentMethod.CASH) {
                summary.refundsCash += movement.amount;
              }
              break;
            case CashMovementType.CLOSING:
              summary.closingRegistered += movement.amount;
              break;
          }

          return summary;
        },
        {
          opening: 0,
          salesCash: 0,
          supplies: 0,
          withdrawals: 0,
          refundsCash: 0,
          closingRegistered: 0
        }
      );

      for (const movement of filteredMovements) {
        movementRows.push({
          id: movement.id,
          sessionId: session.id,
          sessionStatus: session.status,
          terminal: session.cashTerminal,
          movementType: movement.movementType,
          paymentMethod: movement.paymentMethod,
          amount: movement.amount,
          description: movement.description,
          referenceType: movement.referenceType,
          referenceId: movement.referenceId,
          createdAt: movement.createdAt.toISOString(),
          user: movement.user
        });
      }

      sessionRows.push({
        id: session.id,
        status: session.status,
        openedAt: session.openedAt.toISOString(),
        closedAt: session.closedAt?.toISOString() ?? null,
        openingAmount: session.openingAmount,
        expectedAmount: session.expectedAmount,
        closingAmount: session.closingAmount,
        difference: session.difference,
        terminal: session.cashTerminal,
        openedByUser: session.openedByUser,
        salesCount: session.sales.length,
        salesTotal: session.sales.reduce((total, sale) => total + sale.total, 0),
        movementCount: filteredMovements.length,
        inflow:
          movementSummary.opening + movementSummary.salesCash + movementSummary.supplies,
        outflow: movementSummary.withdrawals + movementSummary.refundsCash,
        netFlow:
          movementSummary.opening +
          movementSummary.salesCash +
          movementSummary.supplies -
          movementSummary.withdrawals -
          movementSummary.refundsCash
      });
    }

    const chartKeys = this.resolveChartKeys(
      timeZone,
      range,
      movementRows.map((movement) => new Date(movement.createdAt))
    );
    const chartMap = new Map(
      chartKeys.map((date) => [
        date,
        {
          date,
          inflow: 0,
          outflow: 0,
          net: 0
        }
      ])
    );
    const summary = {
      sessionCount: sessionRows.length,
      openSessionCount: sessionRows.filter((row) => row.status === CashSessionStatus.OPEN)
        .length,
      movementCount: movementRows.length,
      totalInflow: 0,
      totalOutflow: 0,
      netCashFlow: 0,
      totalSalesCash: 0,
      totalSupplies: 0,
      totalWithdrawals: 0,
      totalRefundsCash: 0,
      totalClosingRegistered: 0,
      closingDifferenceTotal: sessionRows.reduce(
        (total, row) => total + (row.difference ?? 0),
        0
      )
    };

    for (const movement of movementRows) {
      const dateKey = formatDateInTimeZone(new Date(movement.createdAt), timeZone);
      const chartEntry = chartMap.get(dateKey);

      switch (movement.movementType) {
        case CashMovementType.OPENING:
          summary.totalInflow += movement.amount;
          summary.netCashFlow += movement.amount;
          summary.totalSalesCash += 0;
          break;
        case CashMovementType.SALE:
          if (movement.paymentMethod === PaymentMethod.CASH) {
            summary.totalInflow += movement.amount;
            summary.netCashFlow += movement.amount;
            summary.totalSalesCash += movement.amount;
          }
          break;
        case CashMovementType.SUPPLY:
          summary.totalInflow += movement.amount;
          summary.netCashFlow += movement.amount;
          summary.totalSupplies += movement.amount;
          break;
        case CashMovementType.WITHDRAWAL:
          summary.totalOutflow += movement.amount;
          summary.netCashFlow -= movement.amount;
          summary.totalWithdrawals += movement.amount;
          break;
        case CashMovementType.REFUND:
          if (movement.paymentMethod === PaymentMethod.CASH) {
            summary.totalOutflow += movement.amount;
            summary.netCashFlow -= movement.amount;
            summary.totalRefundsCash += movement.amount;
          }
          break;
        case CashMovementType.CLOSING:
          summary.totalClosingRegistered += movement.amount;
          break;
      }

      if (chartEntry) {
        if (
          movement.movementType === CashMovementType.OPENING ||
          movement.movementType === CashMovementType.SUPPLY ||
          (movement.movementType === CashMovementType.SALE &&
            movement.paymentMethod === PaymentMethod.CASH)
        ) {
          chartEntry.inflow += movement.amount;
          chartEntry.net += movement.amount;
        }

        if (
          movement.movementType === CashMovementType.WITHDRAWAL ||
          (movement.movementType === CashMovementType.REFUND &&
            movement.paymentMethod === PaymentMethod.CASH)
        ) {
          chartEntry.outflow += movement.amount;
          chartEntry.net -= movement.amount;
        }
      }
    }

    if (filters.format === "csv") {
      return this.buildCsv(
        [
          "Data",
          "Terminal",
          "Operador",
          "Abertura",
          "Fechamento",
          "Diferenca",
          "Status"
        ],
        sessionRows.map((row) => [
          row.openedAt,
          row.terminal.name,
          row.openedByUser?.name ?? "",
          row.openingAmount,
          row.closingAmount,
          row.difference,
          row.status
        ])
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      timeZone,
      summary,
      charts: {
        dailyFlow: [...chartMap.values()]
      },
      sessions: sessionRows.slice(0, filters.take ?? 80),
      movements: movementRows.slice(0, filters.take ?? 120)
    };
  }

  async getCustomerReport(
    preferredStoreId: string | null | undefined,
    filters: CustomerReportFiltersDto
  ) {
    const store = await this.findReferenceStore(preferredStoreId);
    const timeZone = store?.timezone ?? "America/Sao_Paulo";
    const range = this.resolveDateRange(timeZone, filters.startDate, filters.endDate);
    const customers = await this.prisma.customer.findMany({
      where: {
        ...(filters.active === undefined ? {} : { active: filters.active }),
        ...(filters.city
          ? {
              city: {
                contains: filters.city,
                mode: "insensitive"
              }
            }
          : {}),
        ...(filters.state
          ? {
              state: {
                contains: filters.state,
                mode: "insensitive"
              }
            }
          : {}),
        ...(filters.search
          ? {
              OR: [
                {
                  name: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                },
                {
                  email: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                },
                {
                  phone: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                },
                {
                  cpfCnpj: {
                    contains: filters.search,
                    mode: "insensitive"
                  }
                }
              ]
            }
          : {})
      },
      select: {
        id: true,
        name: true,
        cpfCnpj: true,
        email: true,
        phone: true,
        city: true,
        state: true,
        active: true,
        sales: {
          where: {
            status: SaleStatus.COMPLETED,
            ...(store?.id ? { storeId: store.id } : {}),
            ...(range
              ? {
                  completedAt: {
                    ...(range.start ? { gte: range.start } : {}),
                    ...(range.endInclusive ? { lte: range.endInclusive } : {})
                  }
                }
              : {})
          },
          orderBy: {
            completedAt: "desc"
          },
          select: {
            id: true,
            total: true,
            completedAt: true
          }
        },
        accountsReceivable: {
          where: {
            ...(store?.id ? { storeId: store.id } : {}),
            status: {
              in: [FinancialEntryStatus.PENDING, FinancialEntryStatus.OVERDUE]
            }
          },
          select: {
            amount: true,
            status: true
          }
        }
      },
      orderBy: [{ active: "desc" }, { name: "asc" }]
    });

    const rows: CustomerReportRow[] = customers.map((customer) => {
      const totalRevenue = customer.sales.reduce((total, sale) => total + sale.total, 0);
      const orderCount = customer.sales.length;
      const openReceivables = customer.accountsReceivable.reduce(
        (total, receivable) => total + receivable.amount,
        0
      );
      const overdueReceivables = customer.accountsReceivable.reduce(
        (total, receivable) =>
          receivable.status === FinancialEntryStatus.OVERDUE
            ? total + receivable.amount
            : total,
        0
      );

      return {
        id: customer.id,
        name: customer.name,
        cpfCnpj: customer.cpfCnpj,
        email: customer.email,
        phone: customer.phone,
        city: customer.city,
        state: customer.state,
        active: customer.active,
        orderCount,
        totalRevenue,
        averageTicket: orderCount ? Math.round(totalRevenue / orderCount) : 0,
        lastPurchaseAt: customer.sales[0]?.completedAt.toISOString() ?? null,
        openReceivables,
        overdueReceivables
      };
    });
    const summary = {
      totalCustomers: rows.length,
      activeCustomers: rows.filter((row) => row.active).length,
      customersWithSales: rows.filter((row) => row.orderCount > 0).length,
      totalRevenue: rows.reduce((total, row) => total + row.totalRevenue, 0),
      totalOrders: rows.reduce((total, row) => total + row.orderCount, 0),
      averageTicket: 0,
      openReceivables: rows.reduce((total, row) => total + row.openReceivables, 0),
      overdueReceivables: rows.reduce((total, row) => total + row.overdueReceivables, 0)
    };
    summary.averageTicket = summary.totalOrders
      ? Math.round(summary.totalRevenue / summary.totalOrders)
      : 0;

    const topCustomers = [...rows]
      .filter((row) => row.totalRevenue > 0)
      .sort((left, right) => right.totalRevenue - left.totalRevenue)
      .slice(0, 8)
      .map((row) => ({
        customerId: row.id,
        name: row.name,
        totalRevenue: row.totalRevenue,
        orderCount: row.orderCount
      }));

    if (filters.format === "csv") {
      return this.buildCsv(
        [
          "Nome",
          "Telefone",
          "Total comprado",
          "Qtd compras",
          "Ultima compra",
          "Media",
          "Cidade",
          "UF",
          "Ativo"
        ],
        rows.map((row) => [
          row.name,
          row.phone,
          row.totalRevenue,
          row.orderCount,
          row.lastPurchaseAt,
          row.averageTicket,
          row.city,
          row.state,
          row.active
        ])
      );
    }

    return {
      generatedAt: new Date().toISOString(),
      summary,
      charts: {
        topCustomers
      },
      rows: [...rows]
        .sort((left, right) => {
          if (right.totalRevenue !== left.totalRevenue) {
            return right.totalRevenue - left.totalRevenue;
          }

          return left.name.localeCompare(right.name, "pt-BR");
        })
        .slice(0, filters.take ?? 120)
    };
  }

  private serializeSalesRow(sale: SalesReportSale): SalesReportRow {
    const itemCount = sale.items.reduce((total, item) => total + item.quantity, 0);
    const costTotal = sale.items.reduce(
      (total, item) => total + item.product.costPrice * item.quantity,
      0
    );

    return {
      id: sale.id,
      saleNumber: sale.saleNumber,
      receiptNumber: sale.receiptNumber,
      status: sale.status,
      fiscalStatus: sale.fiscalStatus,
      completedAt: sale.completedAt.toISOString(),
      subtotal: sale.subtotal,
      discountAmount: sale.discountAmount,
      total: sale.total,
      estimatedProfit: sale.total - costTotal,
      itemCount,
      paymentCount: sale.payments.length,
      paymentMethods: [...new Set(sale.payments.map((payment) => payment.method))],
      customer: sale.customer,
      user: sale.user,
      cashTerminal: sale.cashSession.cashTerminal
    };
  }

  private serializeStockRow(product: StockReportProduct): StockReportRow {
    const totalStock = product.balances.reduce((total, balance) => total + balance.quantity, 0);

    return {
      productId: product.id,
      name: product.name,
      internalCode: product.internalCode,
      supplierCode: product.supplierCode,
      active: product.active,
      brand: product.brand,
      model: product.model,
      costPrice: product.costPrice,
      salePrice: product.salePrice,
      stockMin: product.stockMin,
      totalStock,
      lowStock: product.stockMin > 0 && totalStock < product.stockMin,
      inventoryCostValue: totalStock * product.costPrice,
      inventorySaleValue: totalStock * product.salePrice,
      category: product.category,
      supplier: product.supplier,
      balances: product.balances
        .map((balance) => ({
          id: balance.id,
          quantity: balance.quantity,
          location: balance.location
        }))
        .sort((left, right) => right.quantity - left.quantity)
    };
  }

  private matchesCashMovementFilters(
    movement: CashReportSession["movements"][number],
    filters: CashReportFiltersDto
  ) {
    if (filters.movementType && movement.movementType !== filters.movementType) {
      return false;
    }

    if (!filters.paymentMethod) {
      return true;
    }

    if (movement.paymentMethod === filters.paymentMethod) {
      return true;
    }

    return (
      filters.paymentMethod === PaymentMethod.CASH &&
      movement.paymentMethod === null &&
      (movement.movementType === CashMovementType.OPENING ||
        movement.movementType === CashMovementType.SUPPLY ||
        movement.movementType === CashMovementType.WITHDRAWAL ||
        movement.movementType === CashMovementType.CLOSING)
    );
  }

  private resolveDateRange(
    timeZone: string,
    startDate?: string,
    endDate?: string
  ) {
    if (!startDate && !endDate) {
      return null;
    }

    return {
      start: startDate ? parseDateOnlyInTimeZone(startDate, timeZone) : null,
      endInclusive: endDate ? parseDateOnlyInTimeZone(endDate, timeZone, true) : null,
      endExclusive: endDate
        ? addDays(parseDateOnlyInTimeZone(endDate, timeZone), 1)
        : null
    };
  }

  private resolveChartKeys(
    timeZone: string,
    range: {
      start: Date | null;
      endInclusive: Date | null;
      endExclusive: Date | null;
    } | null,
    dates: Date[]
  ) {
    if (range?.start && range.endExclusive) {
      return buildDateKeysBetween(range.start, range.endExclusive, timeZone);
    }

    return [...new Set(dates.map((date) => formatDateInTimeZone(date, timeZone)))].sort();
  }

  private buildCsv(
    headers: string[],
    rows: Array<Array<string | number | boolean | null | undefined>>
  ) {
    return stringify([headers, ...rows].map((row) => row.map((cell) => cell ?? "")), {
      bom: true,
      delimiter: ";",
      record_delimiter: "windows"
    });
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
}
