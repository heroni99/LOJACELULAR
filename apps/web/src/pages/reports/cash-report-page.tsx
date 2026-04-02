import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, RefreshCw } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  downloadCashReportCsv,
  getCashReport,
  listCashTerminals
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
import { Input } from "@/components/ui/input";

export function CashReportPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [cashTerminalId, setCashTerminalId] = useState("");
  const [sessionStatus, setSessionStatus] = useState<"" | "OPEN" | "CLOSED">("");
  const [movementType, setMovementType] = useState<
    "" | "OPENING" | "SALE" | "SUPPLY" | "WITHDRAWAL" | "CLOSING" | "REFUND"
  >("");
  const [paymentMethod, setPaymentMethod] = useState<
    "" | "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT"
  >("");
  const [startDate, setStartDate] = useState(monthStartDateValue());
  const [endDate, setEndDate] = useState(todayDateValue());

  const terminalsQuery = useQuery({
    queryKey: ["cash", "terminals", "reports"],
    queryFn: () => listCashTerminals(token)
  });

  const reportQuery = useQuery({
    queryKey: [
      "reports",
      "cash",
      cashTerminalId,
      sessionStatus,
      movementType,
      paymentMethod,
      startDate,
      endDate
    ],
    queryFn: () =>
      getCashReport(token, {
        cashTerminalId: cashTerminalId || undefined,
        sessionStatus: sessionStatus || undefined,
        movementType: movementType || undefined,
        paymentMethod: paymentMethod || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 120
      })
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadCashReportCsv(token, {
        cashTerminalId: cashTerminalId || undefined,
        sessionStatus: sessionStatus || undefined,
        movementType: movementType || undefined,
        paymentMethod: paymentMethod || undefined,
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
        title="Relatorio de caixa"
        description="Fluxo de caixa real por terminal, sessao e movimento, com conciliacao de entradas, saidas e diferenca de fechamento."
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
        <CardContent className="grid gap-4 xl:grid-cols-[220px_180px_220px_220px_180px_180px]">
          <SelectField
            label="Terminal"
            onChange={setCashTerminalId}
            options={(terminalsQuery.data ?? []).map((item) => ({
              label: item.name,
              value: item.id
            }))}
            value={cashTerminalId}
          />
          <SelectField
            label="Sessao"
            onChange={(value) => setSessionStatus(value as typeof sessionStatus)}
            options={[
              { label: "Aberta", value: "OPEN" },
              { label: "Fechada", value: "CLOSED" }
            ]}
            value={sessionStatus}
          />
          <SelectField
            label="Movimento"
            onChange={(value) => setMovementType(value as typeof movementType)}
            options={[
              { label: "Abertura", value: "OPENING" },
              { label: "Venda", value: "SALE" },
              { label: "Suprimento", value: "SUPPLY" },
              { label: "Sangria", value: "WITHDRAWAL" },
              { label: "Fechamento", value: "CLOSING" },
              { label: "Estorno", value: "REFUND" }
            ]}
            value={movementType}
          />
          <SelectField
            label="Pagamento"
            onChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
            options={[
              { label: "Dinheiro", value: "CASH" },
              { label: "PIX", value: "PIX" },
              { label: "Debito", value: "DEBIT" },
              { label: "Credito", value: "CREDIT" },
              { label: "Credito loja", value: "STORE_CREDIT" }
            ]}
            value={paymentMethod}
          />
          <FieldDate label="De" onChange={setStartDate} value={startDate} />
          <FieldDate label="Ate" onChange={setEndDate} value={endDate} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <ReportMetricCard
          helper="Sessoes retornadas no recorte"
          label="Sessoes"
          value={formatCompactNumber(report?.summary.sessionCount ?? 0)}
        />
        <ReportMetricCard
          helper="Entradas em dinheiro do periodo"
          label="Entradas"
          value={formatCurrency(report?.summary.totalInflow ?? 0)}
        />
        <ReportMetricCard
          helper="Saidas em dinheiro do periodo"
          label="Saidas"
          value={formatCurrency(report?.summary.totalOutflow ?? 0)}
        />
        <ReportMetricCard
          helper="Entradas menos saidas"
          label="Fluxo liquido"
          value={formatCurrency(report?.summary.netCashFlow ?? 0)}
        />
        <ReportMetricCard
          helper="Vendas recebidas em dinheiro"
          label="Vendas cash"
          value={formatCurrency(report?.summary.totalSalesCash ?? 0)}
        />
        <ReportMetricCard
          helper="Diferenca registrada nos fechamentos"
          label="Diferenca"
          value={formatCurrency(report?.summary.closingDifferenceTotal ?? 0)}
        />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Fluxo diario</CardTitle>
        </CardHeader>
        <CardContent>
          <DualSeriesBarChart
            emptyMessage="Sem movimentacoes de caixa no periodo filtrado."
            entries={(report?.charts.dailyFlow ?? []).map((entry) => ({
              label: shortDateLabel(entry.date),
              firstValue: entry.inflow,
              secondValue: entry.outflow
            }))}
            firstColorClassName="bg-emerald-500/80"
            firstLabel="Entradas"
            formatValue={formatCurrency}
            secondColorClassName="bg-orange-500/80"
            secondLabel="Saidas"
          />
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Sessoes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando relatorio...</div>
          ) : null}
          {reportQuery.error ? (
            <div className="p-6 text-sm text-red-700">{(reportQuery.error as Error).message}</div>
          ) : null}
          {report?.sessions.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Terminal</th>
                    <th className="px-4 py-3 font-medium">Abertura</th>
                    <th className="px-4 py-3 font-medium">Fechamento</th>
                    <th className="px-4 py-3 font-medium">Fluxo</th>
                    <th className="px-4 py-3 font-medium">Vendas</th>
                    <th className="px-4 py-3 font-medium">Diferenca</th>
                  </tr>
                </thead>
                <tbody>
                  {report.sessions.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{row.terminal.name}</p>
                          <p className="text-xs text-muted-foreground">{row.status}</p>
                        </div>
                      </td>
                      <td className="px-4 py-4">{formatDateTime(row.openedAt)}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {row.closedAt ? formatDateTime(row.closedAt) : "Sessao aberta"}
                      </td>
                      <td className="px-4 py-4 font-semibold">{formatCurrency(row.netFlow)}</td>
                      <td className="px-4 py-4">
                        {formatCompactNumber(row.salesCount)} • {formatCurrency(row.salesTotal)}
                      </td>
                      <td className="px-4 py-4">{formatCurrency(row.difference ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma sessao encontrada para os filtros atuais.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Movimentacoes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {report?.movements.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Terminal</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Pagamento</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Descricao</th>
                  </tr>
                </thead>
                <tbody>
                  {report.movements.map((row) => (
                    <tr key={row.id} className="border-b border-border/60">
                      <td className="px-4 py-4">{formatDateTime(row.createdAt)}</td>
                      <td className="px-4 py-4">{row.terminal.name}</td>
                      <td className="px-4 py-4 font-semibold">{row.movementType}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {row.paymentMethod || "CASH"}
                      </td>
                      <td className="px-4 py-4">{formatCurrency(row.amount)}</td>
                      <td className="px-4 py-4 text-muted-foreground">{row.description || "Sem descricao"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma movimentacao encontrada para os filtros atuais.
            </div>
          ) : null}
          {exportMutation.error ? (
            <div className="px-6 pb-4 text-sm text-red-700">{(exportMutation.error as Error).message}</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange(value: string): void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select className={selectClassName} onChange={(event) => onChange(event.target.value)} value={value}>
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
