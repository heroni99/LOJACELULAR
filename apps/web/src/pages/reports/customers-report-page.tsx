import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Search } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  downloadCustomerReportCsv,
  getCustomerReport
} from "@/lib/api";
import {
  formatCompactNumber,
  formatCurrency,
  formatDateTime
} from "@/lib/format";
import {
  downloadBrowserFile,
  ReportMetricCard,
  selectClassName,
  SingleSeriesBarChart
} from "@/features/reports/reporting-ui";
import { monthStartDateValue, todayDateValue } from "@/features/reports/report-utils";

export function CustomersReportPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<"" | "true" | "false">("true");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [startDate, setStartDate] = useState(monthStartDateValue());
  const [endDate, setEndDate] = useState(todayDateValue());

  const reportQuery = useQuery({
    queryKey: ["reports", "customers", search, active, city, state, startDate, endDate],
    queryFn: () =>
      getCustomerReport(token, {
        search: search.trim() || undefined,
        active: active === "" ? undefined : active === "true",
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 150
      })
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadCustomerReportCsv(token, {
        search: search.trim() || undefined,
        active: active === "" ? undefined : active === "true",
        city: city.trim() || undefined,
        state: state.trim() || undefined,
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
        title="Relatorio de clientes"
        description="Receita por cliente, ticket medio, ultima compra e recebiveis em aberto usando os dados reais do sistema."
        actions={
          <>
            <Button onClick={() => void reportQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()} type="button">
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
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_180px_220px_140px_180px_180px]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="customers-report-search">
              Busca
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                id="customers-report-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cliente, documento, telefone ou e-mail"
                value={search}
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <select
              className={selectClassName}
              onChange={(event) => setActive(event.target.value as typeof active)}
              value={active}
            >
              <option value="">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </div>
          <FieldText label="Cidade" onChange={setCity} value={city} />
          <FieldText label="UF" onChange={setState} value={state} />
          <FieldDate label="De" onChange={setStartDate} value={startDate} />
          <FieldDate label="Ate" onChange={setEndDate} value={endDate} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportMetricCard
          helper="Clientes retornados pelo filtro"
          label="Clientes"
          value={formatCompactNumber(report?.summary.totalCustomers ?? 0)}
        />
        <ReportMetricCard
          helper="Clientes com venda no periodo"
          label="Com compra"
          value={formatCompactNumber(report?.summary.customersWithSales ?? 0)}
        />
        <ReportMetricCard
          helper="Receita total por cliente"
          label="Receita"
          value={formatCurrency(report?.summary.totalRevenue ?? 0)}
        />
        <ReportMetricCard
          helper="Media por pedido"
          label="Ticket medio"
          value={formatCurrency(report?.summary.averageTicket ?? 0)}
        />
        <ReportMetricCard
          helper="Titulos ainda em aberto"
          label="A receber"
          value={formatCurrency(report?.summary.openReceivables ?? 0)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Top clientes por receita</CardTitle>
          </CardHeader>
          <CardContent>
            <SingleSeriesBarChart
              colorClassName="bg-slate-900/80"
              emptyMessage="Sem clientes com faturamento no periodo filtrado."
              entries={(report?.charts.topCustomers ?? []).map((entry) => ({
                label: entry.name.slice(0, 10),
                value: entry.totalRevenue
              }))}
              formatValue={formatCurrency}
            />
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Inadimplencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-900">Recebiveis vencidos</p>
              <p className="mt-2 text-2xl font-black text-amber-900">
                {formatCurrency(report?.summary.overdueReceivables ?? 0)}
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              O valor acima considera apenas contas a receber com status real `OVERDUE`.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Clientes filtrados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando relatorio...</div>
          ) : null}
          {reportQuery.error ? (
            <div className="p-6 text-sm text-red-700">{(reportQuery.error as Error).message}</div>
          ) : null}
          {exportMutation.error ? (
            <div className="px-6 pb-4 text-sm text-red-700">{(exportMutation.error as Error).message}</div>
          ) : null}
          {report?.rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Cidade</th>
                    <th className="px-4 py-3 font-medium">Pedidos</th>
                    <th className="px-4 py-3 font-medium">Receita</th>
                    <th className="px-4 py-3 font-medium">Ultima compra</th>
                    <th className="px-4 py-3 font-medium">A receber</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{row.name}</p>
                          <p className="text-xs text-muted-foreground">{row.phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {row.city || "Sem cidade"}
                        {row.state ? ` • ${row.state}` : ""}
                      </td>
                      <td className="px-4 py-4">{formatCompactNumber(row.orderCount)}</td>
                      <td className="px-4 py-4 font-semibold">{formatCurrency(row.totalRevenue)}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {row.lastPurchaseAt ? formatDateTime(row.lastPurchaseAt) : "Sem compra"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p>{formatCurrency(row.openReceivables)}</p>
                          <p className="text-xs text-amber-700">
                            vencido {formatCurrency(row.overdueReceivables)}
                          </p>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhum cliente encontrado com os filtros atuais.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldText({
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
      <Input onChange={(event) => onChange(event.target.value)} value={value} />
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
