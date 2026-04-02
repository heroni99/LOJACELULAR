import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Search } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  downloadSalesReportCsv,
  getSalesReport,
  listCustomers
} from "@/lib/api";
import {
  formatCompactNumber,
  formatCurrency,
  formatDateTime
} from "@/lib/format";
import {
  downloadBrowserFile,
  DualSeriesBarChart,
  ReportMetricCard,
  selectClassName
} from "@/features/reports/reporting-ui";
import { monthStartDateValue, shortDateLabel, todayDateValue } from "@/features/reports/report-utils";

export function SalesReportPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState<"" | "COMPLETED" | "CANCELED" | "REFUNDED">("COMPLETED");
  const [startDate, setStartDate] = useState(monthStartDateValue());
  const [endDate, setEndDate] = useState(todayDateValue());

  const customersQuery = useQuery({
    queryKey: ["customers", "reports", "sales"],
    queryFn: () => listCustomers(token, { active: true, take: 200 })
  });

  const reportQuery = useQuery({
    queryKey: ["reports", "sales", search, customerId, status, startDate, endDate],
    queryFn: () =>
      getSalesReport(token, {
        search: search.trim() || undefined,
        customerId: customerId || undefined,
        status: status || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 120
      })
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadSalesReportCsv(token, {
        search: search.trim() || undefined,
        customerId: customerId || undefined,
        status: status || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      }),
    onSuccess: (file) => {
      downloadBrowserFile(file);
    }
  });

  const report = reportQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Relatorios"
        title="Relatorio de vendas"
        description="Consulta real de vendas persistidas, com filtros por periodo, cliente e status, grafico diario e exportacao CSV."
        actions={
          <>
            <Button onClick={() => void reportQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
              type="button"
            >
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </>
        }
      />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_180px_180px_180px]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="sales-report-search">
              Busca
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                id="sales-report-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Venda, recibo ou cliente"
                value={search}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cliente</label>
            <select
              className={selectClassName}
              onChange={(event) => setCustomerId(event.target.value)}
              value={customerId}
            >
              <option value="">Todos</option>
              {(customersQuery.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <select
              className={selectClassName}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              value={status}
            >
              <option value="">Todos</option>
              <option value="COMPLETED">Concluida</option>
              <option value="CANCELED">Cancelada</option>
              <option value="REFUNDED">Reembolsada</option>
            </select>
          </div>
          <FieldDate label="De" onChange={setStartDate} value={startDate} />
          <FieldDate label="Ate" onChange={setEndDate} value={endDate} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportMetricCard
          helper="Pedidos retornados pelo filtro atual"
          label="Vendas"
          value={formatCompactNumber(report?.summary.orderCount ?? 0)}
        />
        <ReportMetricCard
          helper="Faturamento total das vendas filtradas"
          label="Faturamento"
          value={formatCurrency(report?.summary.totalRevenue ?? 0)}
        />
        <ReportMetricCard
          helper="Lucro estimado por custo cadastrado"
          label="Lucro"
          value={formatCurrency(report?.summary.totalProfit ?? 0)}
        />
        <ReportMetricCard
          helper="Media por venda concluida"
          label="Ticket medio"
          value={formatCurrency(report?.summary.averageTicket ?? 0)}
        />
        <ReportMetricCard
          helper="Quantidade total de itens vendidos"
          label="Itens"
          value={formatCompactNumber(report?.summary.totalItemsSold ?? 0)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_360px]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Faturamento diario</CardTitle>
          </CardHeader>
          <CardContent>
            <DualSeriesBarChart
              emptyMessage="Sem vendas no periodo filtrado."
              entries={(report?.charts.dailyRevenue ?? []).map((entry) => ({
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
            <CardTitle className="text-xl">Top itens vendidos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {report?.topProducts.length ? (
              report.topProducts.map((item) => (
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
              <p className="text-sm text-muted-foreground">
                Nenhum item vendido no periodo atual.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Vendas filtradas</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando relatorio...</div>
          ) : null}
          {reportQuery.error ? (
            <div className="p-6 text-sm text-red-700">{(reportQuery.error as Error).message}</div>
          ) : null}
          {exportMutation.error ? (
            <div className="px-6 pb-4 text-sm text-red-700">
              {(exportMutation.error as Error).message}
            </div>
          ) : null}
          {report?.rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Venda</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Itens</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Lucro</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{row.saleNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.receiptNumber || "Sem recibo"}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {row.customer?.name || "Consumidor nao identificado"}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {formatDateTime(row.completedAt)}
                      </td>
                      <td className="px-4 py-4">{formatCompactNumber(row.itemCount)}</td>
                      <td className="px-4 py-4 font-semibold">{formatCurrency(row.total)}</td>
                      <td className="px-4 py-4">{formatCurrency(row.estimatedProfit)}</td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{row.status}</p>
                          <p className="text-xs text-muted-foreground">{row.fiscalStatus}</p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma venda encontrada com os filtros atuais.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldDate({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input onChange={(event) => onChange(event.target.value)} type="date" value={value} />
    </div>
  );
}
