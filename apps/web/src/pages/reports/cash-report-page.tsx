import { Fragment, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Receipt,
  RefreshCw,
  Wallet
} from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { DetailCard } from "@/components/ui/detail-card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  type CashReport,
  downloadCashReportCsv,
  getCashReport,
  listCashTerminals
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCompactNumber, formatCurrency, formatDateTime } from "@/lib/format";
import { downloadBrowserFile, DualSeriesBarChart } from "@/features/reports/reporting-ui";
import { monthStartDateValue, shortDateLabel, todayDateValue } from "@/features/reports/report-utils";
import {
  CashSessionStatusBadge,
  formatCashMovementPayment,
  formatCashMovementType,
  reportFieldClassName,
  reportSelectClassName
} from "@/pages/reports/reports-shared";

export function CashReportPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [cashTerminalId, setCashTerminalId] = useState("");
  const [startDate, setStartDate] = useState(monthStartDateValue());
  const [endDate, setEndDate] = useState(todayDateValue());
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);

  const terminalsQuery = useQuery({
    queryKey: ["cash", "terminals", "reports"],
    queryFn: () => listCashTerminals(token)
  });

  const reportQuery = useQuery({
    queryKey: ["reports", "cash", cashTerminalId, startDate, endDate],
    queryFn: () =>
      getCashReport(token, {
        cashTerminalId: cashTerminalId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 120
      })
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadCashReportCsv(token, {
        cashTerminalId: cashTerminalId || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      }),
    onSuccess: (file) => {
      downloadBrowserFile(file);
    }
  });

  const report = reportQuery.data;
  const errorMessage = getErrorMessage(reportQuery.error) ?? getErrorMessage(exportMutation.error);

  const movementsBySessionId = useMemo(() => {
    const groups = new Map<string, CashReport["movements"]>();

    for (const movement of report?.movements ?? []) {
      const current = groups.get(movement.sessionId) ?? [];
      current.push(movement);
      groups.set(movement.sessionId, current);
    }

    return groups;
  }, [report?.movements]);

  return (
    <div className="space-y-6">
      <PageHeader
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
              Exportar CSV
            </Button>
          </>
        }
        subtitle="Sessoes de caixa por terminal, com expansao dos movimentos registrados no periodo."
        title="Relatorio de caixa"
      />

      <DetailCard title="Filtros">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <SelectField
            label="Terminal"
            onChange={setCashTerminalId}
            options={(terminalsQuery.data ?? []).map((item) => ({
              label: item.name,
              value: item.id
            }))}
            value={cashTerminalId}
          />
          <DateField label="Data inicio" onChange={setStartDate} value={startDate} />
          <DateField label="Data fim" onChange={setEndDate} value={endDate} />
        </div>
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      </DetailCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          icon={<Receipt className="h-5 w-5" />}
          label="Sessoes"
          value={formatCompactNumber(report?.summary.sessionCount ?? 0)}
        />
        <StatCard
          icon={<ArrowDownCircle className="h-5 w-5" />}
          label="Entradas"
          value={formatCurrency(report?.summary.totalInflow ?? 0)}
          variant="success"
        />
        <StatCard
          icon={<ArrowUpCircle className="h-5 w-5" />}
          label="Saidas"
          value={formatCurrency(report?.summary.totalOutflow ?? 0)}
          variant="warning"
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Fluxo liquido"
          value={formatCurrency(report?.summary.netCashFlow ?? 0)}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Vendas cash"
          value={formatCurrency(report?.summary.totalSalesCash ?? 0)}
        />
        <StatCard
          icon={<ArrowUpCircle className="h-5 w-5" />}
          label="Diferenca"
          value={formatCurrency(report?.summary.closingDifferenceTotal ?? 0)}
          variant="danger"
        />
      </div>

      <DetailCard title="Fluxo diario">
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
      </DetailCard>

      <DetailCard title="Sessoes do periodo">
        {reportQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div className="list-skeleton-shimmer h-14 rounded-xl" key={index} />
            ))}
          </div>
        ) : null}

        {!reportQuery.isLoading && report?.sessions.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead
                className="border-b border-border/70 text-muted-foreground"
                style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
              >
                <tr>
                  <th className="w-12 px-4 py-3 font-medium" />
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Terminal</th>
                  <th className="px-4 py-3 font-medium">Operador</th>
                  <th className="px-4 py-3 font-medium">Abertura</th>
                  <th className="px-4 py-3 font-medium">Fechamento</th>
                  <th className="px-4 py-3 font-medium">Diferenca</th>
                </tr>
              </thead>
              <tbody>
                {report.sessions.map((row) => {
                  const expanded = expandedSessionId === row.id;
                  const movements = movementsBySessionId.get(row.id) ?? [];

                  return (
                    <Fragment key={row.id}>
                      <tr
                        className="cursor-pointer border-b border-border/60 transition-colors hover:bg-white/5"
                        onClick={() =>
                          setExpandedSessionId((current) => (current === row.id ? null : row.id))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setExpandedSessionId((current) =>
                              current === row.id ? null : row.id
                            );
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td className="px-4 py-4">
                          {expanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <div className="space-y-1">
                            <p className="font-semibold">{formatDateTime(row.openedAt)}</p>
                            <CashSessionStatusBadge status={row.status} />
                          </div>
                        </td>
                        <td className="px-4 py-4">{row.terminal.name}</td>
                        <td className="px-4 py-4">
                          {row.openedByUser?.name || "Sem operador"}
                        </td>
                        <td className="px-4 py-4">{formatCurrency(row.openingAmount)}</td>
                        <td className="px-4 py-4">
                          {row.closingAmount !== null
                            ? formatCurrency(row.closingAmount)
                            : "Sessao aberta"}
                        </td>
                        <td className="px-4 py-4 font-semibold">
                          {formatCurrency(row.difference ?? 0)}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-b border-border/60">
                          <td className="px-4 pb-5 pt-0" colSpan={7}>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                              <p
                                className="mb-3 text-sm font-semibold"
                                style={{ color: "var(--color-text)" }}
                              >
                                Movimentos da sessao
                              </p>
                              {movements.length ? (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full text-left text-sm">
                                    <thead
                                      className="border-b border-border/60"
                                      style={{ color: "var(--color-text-muted)" }}
                                    >
                                      <tr>
                                        <th className="px-3 py-2 font-medium">Data/hora</th>
                                        <th className="px-3 py-2 font-medium">Tipo</th>
                                        <th className="px-3 py-2 font-medium">Pagamento</th>
                                        <th className="px-3 py-2 font-medium">Valor</th>
                                        <th className="px-3 py-2 font-medium">Descricao</th>
                                        <th className="px-3 py-2 font-medium">Referencia</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {movements.map((movement) => (
                                        <tr
                                          className="border-b border-white/5 last:border-b-0"
                                          key={movement.id}
                                        >
                                          <td className="px-3 py-3">
                                            {formatDateTime(movement.createdAt)}
                                          </td>
                                          <td className="px-3 py-3">
                                            {formatCashMovementType(movement.movementType)}
                                          </td>
                                          <td className="px-3 py-3">
                                            {formatCashMovementPayment(
                                              movement.paymentMethod,
                                              movement.movementType
                                            )}
                                          </td>
                                          <td className="px-3 py-3 font-semibold">
                                            {formatCurrency(movement.amount)}
                                          </td>
                                          <td className="px-3 py-3">
                                            {movement.description || "Sem descricao"}
                                          </td>
                                          <td className="px-3 py-3">
                                            {movement.referenceType && movement.referenceId
                                              ? `${movement.referenceType} • ${movement.referenceId}`
                                              : "Sem referencia"}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <p
                                  className="text-sm"
                                  style={{ color: "var(--color-text-muted)" }}
                                >
                                  Nenhum movimento encontrado para esta sessao no periodo.
                                </p>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {!reportQuery.isLoading && !report?.sessions.length ? (
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Nenhuma sessao encontrada para os filtros atuais.
          </p>
        ) : null}
      </DetailCard>
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
      <FieldLabel>{label}</FieldLabel>
      <select
        className={reportSelectClassName}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
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

function DateField({
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
      <FieldLabel>{label}</FieldLabel>
      <Input
        className={reportFieldClassName}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label
      className="text-[13px] font-medium"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error ? parseApiError(error) : null;
}
