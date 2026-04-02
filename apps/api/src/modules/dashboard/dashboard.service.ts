import { Injectable } from "@nestjs/common";
import { Prisma, SaleStatus } from "@prisma/client";
import {
  addDays,
  buildDateKeysBetween,
  buildRelativeRange,
  formatDateInTimeZone,
  formatDateParts,
  toSafeNumber,
  zonedDateTimeToUtc
} from "../../common/reporting-date.utils";
import { PrismaService } from "../../prisma/prisma.service";
import { GetDashboardInsightsDto } from "./dto/get-dashboard-insights.dto";
import { GetDashboardLowStockDto } from "./dto/get-dashboard-low-stock.dto";

type SalesMetricsRow = {
  total_sales_today: bigint | number | string | null;
  total_sales_month: bigint | number | string | null;
  total_revenue_today: bigint | number | string | null;
  total_revenue_month: bigint | number | string | null;
  total_profit_today: bigint | number | string | null;
  total_profit_month: bigint | number | string | null;
  total_orders_today: bigint | number | string | null;
  total_orders_month: bigint | number | string | null;
};

type LowStockCountRow = {
  low_stock_count: bigint | number | string;
};

const dashboardInsightSaleSelect = {
  id: true,
  total: true,
  completedAt: true,
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
  }
} satisfies Prisma.SaleSelect;

type DashboardInsightSaleRecord = Prisma.SaleGetPayload<{
  select: typeof dashboardInsightSaleSelect;
}>;

const dashboardLowStockProductSelect = {
  id: true,
  name: true,
  internalCode: true,
  supplierCode: true,
  stockMin: true,
  costPrice: true,
  salePrice: true,
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

type DashboardLowStockProductRecord = Prisma.ProductGetPayload<{
  select: typeof dashboardLowStockProductSelect;
}>;

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const store = await this.findReferenceStore();
    const storeId = store?.id ?? null;
    const timeZone = store?.timezone ?? "America/Sao_Paulo";
    const now = new Date();
    const nowParts = formatDateParts(now, timeZone);
    const startOfToday = zonedDateTimeToUtc(
      {
        year: nowParts.year,
        month: nowParts.month,
        day: nowParts.day
      },
      timeZone
    );
    const startOfTomorrow = addDays(startOfToday, 1);
    const startOfMonth = zonedDateTimeToUtc(
      {
        year: nowParts.year,
        month: nowParts.month,
        day: 1
      },
      timeZone
    );

    const salesMetrics = await this.prisma.$queryRaw<SalesMetricsRow[]>(Prisma.sql`
      WITH sale_metrics AS (
        SELECT
          s.id,
          s.total,
          s.completed_at,
          COALESCE(items.quantity, 0) AS item_quantity,
          COALESCE(items.cost_total, 0) AS cost_total
        FROM sales AS s
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(si.quantity), 0) AS quantity,
            COALESCE(SUM(p.cost_price * si.quantity), 0) AS cost_total
          FROM sale_items AS si
          INNER JOIN products AS p
            ON p.id = si.product_id
          WHERE si.sale_id = s.id
        ) AS items ON TRUE
        WHERE
          s.status = ${SaleStatus.COMPLETED}::"SaleStatus"
          ${storeId ? Prisma.sql`AND s.store_id = ${storeId}` : Prisma.empty}
          AND s.completed_at >= ${startOfMonth}
          AND s.completed_at < ${startOfTomorrow}
      )
      SELECT
        COALESCE(SUM(item_quantity) FILTER (WHERE completed_at >= ${startOfToday}), 0)::integer AS total_sales_today,
        COALESCE(SUM(item_quantity), 0)::integer AS total_sales_month,
        COALESCE(SUM(total) FILTER (WHERE completed_at >= ${startOfToday}), 0)::integer AS total_revenue_today,
        COALESCE(SUM(total), 0)::integer AS total_revenue_month,
        COALESCE(SUM(total - cost_total) FILTER (WHERE completed_at >= ${startOfToday}), 0)::integer AS total_profit_today,
        COALESCE(SUM(total - cost_total), 0)::integer AS total_profit_month,
        COALESCE(COUNT(*) FILTER (WHERE completed_at >= ${startOfToday}), 0)::integer AS total_orders_today,
        COALESCE(COUNT(*), 0)::integer AS total_orders_month
      FROM sale_metrics;
    `);

    const lowStockRows = await this.prisma.$queryRaw<LowStockCountRow[]>(Prisma.sql`
      SELECT COUNT(*)::integer AS low_stock_count
      FROM (
        SELECT p.id
        FROM products AS p
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(sb.quantity), 0) AS total_quantity
          FROM stock_balances AS sb
          INNER JOIN stock_locations AS sl
            ON sl.id = sb.location_id
          WHERE
            sb.product_id = p.id
            ${storeId ? Prisma.sql`AND sl.store_id = ${storeId}` : Prisma.empty}
        ) AS stock ON TRUE
        WHERE
          p.active = TRUE
          AND p.is_service = FALSE
          AND p.stock_min > 0
          AND COALESCE(stock.total_quantity, 0) < p.stock_min
      ) AS low_stock_products;
    `);

    const totalProducts = await this.prisma.product.count({
      where: {
        active: true
      }
    });
    const totalCustomers = await this.prisma.customer.count({
      where: {
        active: true
      }
    });

    const metrics = salesMetrics[0] ?? {
      total_sales_today: 0,
      total_sales_month: 0,
      total_revenue_today: 0,
      total_revenue_month: 0,
      total_profit_today: 0,
      total_profit_month: 0,
      total_orders_today: 0,
      total_orders_month: 0
    };

    const totalRevenueMonth = toSafeNumber(metrics.total_revenue_month);
    const totalOrdersMonth = toSafeNumber(metrics.total_orders_month);

    return {
      total_sales_today: toSafeNumber(metrics.total_sales_today),
      total_sales_month: toSafeNumber(metrics.total_sales_month),
      total_revenue_today: toSafeNumber(metrics.total_revenue_today),
      total_revenue_month: totalRevenueMonth,
      total_profit_today: toSafeNumber(metrics.total_profit_today),
      total_profit_month: toSafeNumber(metrics.total_profit_month),
      total_orders_today: toSafeNumber(metrics.total_orders_today),
      total_orders_month: totalOrdersMonth,
      average_ticket:
        totalOrdersMonth > 0 ? Math.round(totalRevenueMonth / totalOrdersMonth) : 0,
      low_stock_count: toSafeNumber(lowStockRows[0]?.low_stock_count),
      total_products: totalProducts,
      total_customers: totalCustomers,
      time_zone: timeZone,
      generated_at: now.toISOString()
    };
  }

  async getTopProducts(filters: GetDashboardInsightsDto) {
    const store = await this.findReferenceStore();
    const timeZone = store?.timezone ?? "America/Sao_Paulo";
    const { start, endExclusive } = buildRelativeRange(filters.period ?? "month", timeZone);
    const sales = await this.findInsightSales(store?.id ?? null, start, endExclusive);
    const aggregation = new Map<
      string,
      {
        productId: string;
        name: string;
        internalCode: string;
        isService: boolean;
        quantitySold: number;
        revenue: number;
        estimatedProfit: number;
        lastSoldAt: string | null;
        category: {
          id: string;
          name: string;
          prefix: string;
        };
      }
    >();

    for (const sale of sales) {
      for (const item of sale.items) {
        const key = item.product.id;
        const costTotal = item.product.costPrice * item.quantity;
        const current = aggregation.get(key) ?? {
          productId: item.product.id,
          name: item.product.name,
          internalCode: item.product.internalCode,
          isService: item.product.isService,
          quantitySold: 0,
          revenue: 0,
          estimatedProfit: 0,
          lastSoldAt: null,
          category: item.product.category
        };

        current.quantitySold += item.quantity;
        current.revenue += item.totalPrice;
        current.estimatedProfit += item.totalPrice - costTotal;
        current.lastSoldAt =
          current.lastSoldAt && current.lastSoldAt > sale.completedAt.toISOString()
            ? current.lastSoldAt
            : sale.completedAt.toISOString();

        aggregation.set(key, current);
      }
    }

    return {
      period: filters.period ?? "month",
      generatedAt: new Date().toISOString(),
      rows: [...aggregation.values()]
        .sort((left, right) => {
          if (right.quantitySold !== left.quantitySold) {
            return right.quantitySold - left.quantitySold;
          }

          return right.revenue - left.revenue;
        })
        .slice(0, filters.take ?? 8)
    };
  }

  async getLowStock(filters: GetDashboardLowStockDto) {
    const store = await this.findReferenceStore();
    const products = await this.prisma.product.findMany({
      where: {
        active: true,
        isService: false,
        stockMin: {
          gt: 0
        }
      },
      select: {
        ...dashboardLowStockProductSelect,
        balances: {
          where: {
            ...(store?.id
              ? {
                  location: {
                    storeId: store.id
                  }
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
      orderBy: {
        name: "asc"
      }
    });

    return {
      generatedAt: new Date().toISOString(),
      rows: products
        .map((product) => this.serializeLowStockProduct(product))
        .filter((row) => row.lowStock)
        .sort((left, right) => {
          if (right.deficit !== left.deficit) {
            return right.deficit - left.deficit;
          }

          return left.name.localeCompare(right.name, "pt-BR");
        })
        .slice(0, filters.take ?? 8)
    };
  }

  async getSalesChart(filters: GetDashboardInsightsDto) {
    const store = await this.findReferenceStore();
    const timeZone = store?.timezone ?? "America/Sao_Paulo";
    const period = filters.period ?? "month";
    const { start, endExclusive } = buildRelativeRange(period, timeZone);
    const sales = await this.findInsightSales(store?.id ?? null, start, endExclusive);
    const seriesMap = new Map(
      buildDateKeysBetween(start, endExclusive, timeZone).map((date) => [
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

    for (const sale of sales) {
      const date = formatDateInTimeZone(sale.completedAt, timeZone);
      const entry = seriesMap.get(date);

      if (!entry) {
        continue;
      }

      const itemCostTotal = sale.items.reduce(
        (total, item) => total + item.product.costPrice * item.quantity,
        0
      );
      const itemsSold = sale.items.reduce((total, item) => total + item.quantity, 0);

      entry.revenue += sale.total;
      entry.profit += sale.total - itemCostTotal;
      entry.orders += 1;
      entry.itemsSold += itemsSold;
    }

    return {
      period,
      timeZone,
      generatedAt: new Date().toISOString(),
      series: [...seriesMap.values()]
    };
  }

  private async findInsightSales(
    storeId: string | null,
    start: Date,
    endExclusive: Date
  ) {
    return this.prisma.sale.findMany({
      where: {
        status: SaleStatus.COMPLETED,
        ...(storeId ? { storeId } : {}),
        completedAt: {
          gte: start,
          lt: endExclusive
        }
      },
      select: dashboardInsightSaleSelect,
      orderBy: {
        completedAt: "asc"
      }
    });
  }

  private serializeLowStockProduct(product: DashboardLowStockProductRecord) {
    const totalStock = product.balances.reduce((total, balance) => total + balance.quantity, 0);
    const deficit = Math.max(product.stockMin - totalStock, 0);

    return {
      productId: product.id,
      name: product.name,
      internalCode: product.internalCode,
      supplierCode: product.supplierCode,
      stockMin: product.stockMin,
      totalStock,
      deficit,
      lowStock: product.stockMin > 0 && totalStock < product.stockMin,
      inventoryCostValue: totalStock * product.costPrice,
      inventorySaleValue: totalStock * product.salePrice,
      category: product.category,
      supplier: product.supplier,
      balances: product.balances
        .map((balance) => ({
          id: balance.id,
          quantity: balance.quantity,
          updatedAt: balance.updatedAt.toISOString(),
          location: balance.location
        }))
        .sort((left, right) => right.quantity - left.quantity)
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
}
