import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CircleDollarSign, CreditCard, Landmark, RefreshCw, Wallet } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFinancialSummary } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { SummaryCard } from "./finance-shared";
import { useState } from "react";

export function FinancialSummaryPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [period, setPeriod] = useState<"today" | "week" | "month">("month");

  const summaryQuery = useQuery({
    queryKey: ["financial-summary", period],
    queryFn: () => getFinancialSummary(token, period)
  });

  const summary = summaryQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Resumo financeiro"
        description="Visao consolidada de entradas, saidas, previsao financeira e pulso do caixa da ALPHA TECNOLOGIA."
        actions={
          <div className="flex flex-wrap gap-2">
            <PeriodButton active={period === "today"} label="Hoje" onClick={() => setPeriod("today")} />
            <PeriodButton active={period === "week"} label="Semana" onClick={() => setPeriod("week")} />
            <PeriodButton active={period === "month"} label="Mes" onClick={() => setPeriod("month")} />
            <Button onClick={() => void summaryQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard helper="Titulos pendentes e atrasados" label="Total a pagar" value={formatCurrency(summary?.totals.payablePending ?? 0)} />
        <SummaryCard helper="Recebimentos em aberto" label="Total a receber" value={formatCurrency(summary?.totals.receivablePending ?? 0)} />
        <SummaryCard helper="Receber menos pagar" label="Saldo previsto" value={formatCurrency(summary?.totals.predictedBalance ?? 0)} />
        <SummaryCard helper={summary?.currentCashReference ? `${summary.currentCashReference.terminalName} • ${summary.currentCashReference.source === "open_session" ? "caixa aberto" : "ultimo fechamento"}` : "Sem referencia de caixa"} label="Saldo atual" value={formatCurrency(summary?.totals.currentCash ?? 0)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-primary" />
              Entradas vs saidas
            </CardTitle>
            <CardDescription>Fluxo financeiro do periodo consultado.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary?.charts.cashFlow.length ? (
              <FlowChart
                entries={summary.charts.cashFlow.map((entry) => ({
                  label: entry.date.slice(5),
                  inflow: entry.inflow,
                  outflow: entry.outflow
                }))}
              />
            ) : (
              <EmptyChart message="Sem movimentacao financeira no periodo." />
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Wallet className="h-5 w-5 text-primary" />
              Evolucao do caixa
            </CardTitle>
            <CardDescription>Saldo acumulado do caixa no periodo.</CardDescription>
          </CardHeader>
          <CardContent>
            {summary?.charts.cashEvolution.length ? (
              <BalanceChart
                entries={summary.charts.cashEvolution.map((entry) => ({
                  label: entry.date.slice(5),
                  value: entry.balance
                }))}
              />
            ) : (
              <EmptyChart message="Sem referencia de caixa no periodo." />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CreditCard className="h-5 w-5 text-primary" />
              Proximas contas a pagar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary?.upcoming.payables.length ? (
              summary.upcoming.payables.map((entry) => (
                <Link
                  key={entry.id}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 transition-colors hover:bg-secondary/40"
                  to="/accounts-payable"
                >
                  <div>
                    <p className="font-semibold">{entry.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {entry.supplier?.tradeName || entry.supplier?.name || "Sem fornecedor"} • {entry.dueDate.slice(0, 10)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatCurrency(entry.amount)}</p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma conta a pagar em aberto.</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <CircleDollarSign className="h-5 w-5 text-primary" />
              Proximas contas a receber
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary?.upcoming.receivables.length ? (
              summary.upcoming.receivables.map((entry) => (
                <Link
                  key={entry.id}
                  className="flex items-center justify-between rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 transition-colors hover:bg-secondary/40"
                  to="/accounts-receivable"
                >
                  <div>
                    <p className="font-semibold">{entry.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {entry.customer?.name || "Sem cliente"} • {entry.dueDate.slice(0, 10)}
                    </p>
                  </div>
                  <p className="font-semibold">{formatCurrency(entry.amount)}</p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">Nenhuma conta a receber em aberto.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {summaryQuery.isLoading ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-muted-foreground">Carregando resumo financeiro...</CardContent>
        </Card>
      ) : null}

      {summaryQuery.error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-sm text-red-700">
            {(summaryQuery.error as Error).message}
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

function FlowChart({
  entries
}: {
  entries: Array<{ label: string; inflow: number; outflow: number }>;
}) {
  const max = Math.max(1, ...entries.flatMap((entry) => [entry.inflow, entry.outflow]));

  return (
    <div className="space-y-4">
      <div className="flex h-56 items-end gap-2">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className="w-1/2 rounded-t-lg bg-emerald-500/80"
                style={{ height: `${Math.max(6, (entry.inflow / max) * 100)}%` }}
                title={`Entradas ${formatCurrency(entry.inflow)}`}
              />
              <div
                className="w-1/2 rounded-t-lg bg-orange-500/80"
                style={{ height: `${Math.max(6, (entry.outflow / max) * 100)}%` }}
                title={`Saidas ${formatCurrency(entry.outflow)}`}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">{entry.label}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Entradas</span>
        <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-orange-500" />Saidas</span>
      </div>
    </div>
  );
}

function BalanceChart({
  entries
}: {
  entries: Array<{ label: string; value: number }>;
}) {
  const max = Math.max(1, ...entries.map((entry) => Math.abs(entry.value)));

  return (
    <div className="space-y-4">
      <div className="flex h-56 items-end gap-2">
        {entries.map((entry) => (
          <div key={entry.label} className="flex flex-1 flex-col items-center gap-2">
            <div
              className={`w-full rounded-t-lg ${entry.value >= 0 ? "bg-slate-900/80" : "bg-red-500/80"}`}
              style={{ height: `${Math.max(6, (Math.abs(entry.value) / max) * 100)}%` }}
              title={formatCurrency(entry.value)}
            />
            <span className="text-[11px] text-muted-foreground">{entry.label}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Landmark className="h-4 w-4" />
        Saldo acumulado do periodo
      </div>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-secondary/20 p-6 text-sm text-muted-foreground">
      {message}
    </div>
  );
}
