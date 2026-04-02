import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ClipboardList,
  Package,
  RefreshCw,
  ShoppingCart,
  Users
} from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getDashboardLowStock,
  getDashboardSalesChart,
  getDashboardSummary,
  getDashboardTopProducts,
  type DashboardPeriod
} from "@/lib/api";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { DualSeriesBarChart, ReportMetricCard } from "@/features/reports/reporting-ui";
import { shortDateLabel } from "@/features/reports/report-utils";

export function DashboardPage() {
  const { hasPermission, session } = useAppSession();
  const [period, setPeriod] = useState<DashboardPeriod>("month");

  const summaryQuery = useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: () => getDashboardSummary(session.accessToken)
  });
  const salesChartQuery = useQuery({
    queryKey: ["dashboard", "sales-chart", period],
    queryFn: () => getDashboardSalesChart(session.accessToken, { period })
  });
  const topProductsQuery = useQuery({
    queryKey: ["dashboard", "top-products", period],
    queryFn: () => getDashboardTopProducts(session.accessToken, { period, take: 8 })
  });
  const lowStockQuery = useQuery({
    queryKey: ["dashboard", "low-stock"],
    queryFn: () => getDashboardLowStock(session.accessToken, { take: 8 })
  });

  const summary = summaryQuery.data;
  const chart = salesChartQuery.data;
  const topProducts = topProductsQuery.data?.rows ?? [];
  const lowStock = lowStockQuery.data?.rows ?? [];
  const loading =
    summaryQuery.isLoading ||
    salesChartQuery.isLoading ||
    topProductsQuery.isLoading ||
    lowStockQuery.isLoading;
  const error =
    summaryQuery.error ||
    salesChartQuery.error ||
    topProductsQuery.error ||
    lowStockQuery.error;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Gestao"
        title="Dashboard"
        description="Pulso real da operacao da ALPHA TECNOLOGIA com indicadores, curva de faturamento, itens mais vendidos e alerta de reposicao."
        actions={
          <>
            <PeriodButton active={period === "week"} label="Semana" onClick={() => setPeriod("week")} />
            <PeriodButton active={period === "month"} label="Mes" onClick={() => setPeriod("month")} />
            {hasPermission("reports.read") ? (
              <Button asChild variant="outline">
                <Link to="/reports">Abrir relatorios</Link>
              </Button>
            ) : null}
            <Button
              onClick={() => {
                void Promise.all([
                  summaryQuery.refetch(),
                  salesChartQuery.refetch(),
                  topProductsQuery.refetch(),
                  lowStockQuery.refetch()
                ]);
              }}
              type="button"
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportMetricCard
          helper="Pedidos concluidos hoje"
          label="Faturamento hoje"
          value={formatCurrency(summary?.total_revenue_today ?? 0)}
        />
        <ReportMetricCard
          helper="Periodo mensal consolidado"
          label="Faturamento no mes"
          value={formatCurrency(summary?.total_revenue_month ?? 0)}
        />
        <ReportMetricCard
          helper="Lucro estimado do mes"
          label="Lucro no mes"
          value={formatCurrency(summary?.total_profit_month ?? 0)}
        />
        <ReportMetricCard
          helper="Media por pedido no mes"
          label="Ticket medio"
          value={formatCurrency(summary?.average_ticket ?? 0)}
        />
        <ReportMetricCard
          helper="Itens abaixo do estoque minimo"
          label="Baixo estoque"
          value={formatCompactNumber(summary?.low_stock_count ?? 0)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-primary" />
              Curva de vendas
            </CardTitle>
            <CardDescription>Grafico diario agregado diretamente a partir das vendas concluidas.</CardDescription>
          </CardHeader>
          <CardContent>
            <DualSeriesBarChart
              emptyMessage="Sem vendas registradas no periodo selecionado."
              entries={(chart?.series ?? []).map((entry) => ({
                label: shortDateLabel(entry.date),
                firstValue: entry.revenue,
                secondValue: entry.profit
              }))}
              firstColorClassName="bg-slate-900/80"
              firstLabel="Faturamento"
              formatValue={formatCurrency}
              secondColorClassName="bg-orange-500/80"
              secondLabel="Lucro"
            />
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <ShoppingCart className="h-5 w-5 text-primary" />
              Top vendidos
            </CardTitle>
            <CardDescription>Itens com maior quantidade vendida no periodo consultado.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topProducts.length ? (
              topProducts.map((item) => (
                <div
                  key={item.productId}
                  className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.internalCode} • {item.category.name}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">
                      {formatCompactNumber(item.quantitySold)} un.
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Receita {formatCurrency(item.revenue)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum item vendido no periodo atual.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_360px]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Reposicao imediata
            </CardTitle>
            <CardDescription>Itens fisicos abaixo do estoque minimo somando todos os locais operacionais.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {lowStock.length ? (
              lowStock.map((item) => (
                <div
                  key={item.productId}
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-amber-950">{item.name}</p>
                      <p className="text-xs text-amber-800">
                        {item.internalCode} • {item.category.name}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-amber-900">
                      falta {formatCompactNumber(item.deficit)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-amber-800">
                    saldo {formatCompactNumber(item.totalStock)} / minimo {formatCompactNumber(item.stockMin)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhum item abaixo do minimo neste momento.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Atalhos gerenciais</CardTitle>
            <CardDescription>Acesso rapido aos modulos que sustentam os indicadores acima.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {hasPermission("products.read") ? (
              <ShortcutCard description="Catalogo base de produtos e servicos." icon={Package} title="Catalogo" to="/products" />
            ) : null}
            {hasPermission("inventory.read") ? (
              <ShortcutCard description="Saldo real por produto, local e historico." icon={ClipboardList} title="Estoque" to="/inventory" />
            ) : null}
            {hasPermission("customers.read") ? (
              <ShortcutCard description="Base de clientes usada nas vendas e recebiveis." icon={Users} title="Clientes" to="/customers" />
            ) : null}
            {hasPermission("categories.read") ? (
              <ShortcutCard description="Prefixos, sequencias e regras do catalogo." icon={Boxes} title="Categorias" to="/categories" />
            ) : null}
            {hasPermission("reports.read") ? (
              <ShortcutCard description="Relatorios completos de vendas, estoque, caixa e clientes." icon={BarChart3} title="Relatorios" to="/reports" />
            ) : null}
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Carregando indicadores gerenciais...
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-sm text-red-700">
            {(error as Error).message}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function PeriodButton({
  active,
  label,
  onClick
}: {
  active: boolean;
  label: string;
  onClick(): void;
}) {
  return (
    <Button onClick={onClick} type="button" variant={active ? "default" : "outline"}>
      {label}
    </Button>
  );
}

function ShortcutCard({
  description,
  icon: Icon,
  title,
  to
}: {
  description: string;
  icon: typeof Package;
  title: string;
  to: string;
}) {
  return (
    <Link
      className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 transition-colors hover:bg-secondary/60"
      to={to}
    >
      <div className="rounded-xl bg-primary/10 p-2 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
