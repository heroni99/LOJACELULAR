import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { HandCoins, RefreshCw, Target, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailCard } from "@/components/ui/detail-card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { getMyCommissionSummary, type CommissionRecord } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { reportFieldClassName, reportSelectClassName, SaleStatusBadge } from "@/pages/reports/reports-shared";
import {
  COMMISSION_MONTH_OPTIONS,
  formatPercent,
  getCurrentCommissionPeriod,
  getErrorMessage
} from "./commissions-shared";

export function MyCommissionsPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const initialPeriod = getCurrentCommissionPeriod();
  const [month, setMonth] = useState(initialPeriod.month);
  const [year, setYear] = useState(initialPeriod.year);

  const summaryQuery = useQuery({
    queryKey: ["commissions", "my", month, year],
    queryFn: () => getMyCommissionSummary(token, { month, year })
  });

  const columns = useMemo<Array<DataTableColumn<CommissionRecord>>>(
    () => [
      {
        id: "sale",
        header: "Venda",
        cell: (row) => (
          <div className="space-y-1">
            <Link
              className="font-semibold text-primary underline-offset-4 hover:underline"
              to={`/sales/${row.sale.id}`}
            >
              {row.sale.saleNumber}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Total {formatCurrency(row.sale.total)}
              </span>
              <SaleStatusBadge status={row.sale.status} />
            </div>
          </div>
        )
      },
      {
        id: "commissionType",
        header: "Tipo",
        cell: (row) => row.commissionType
      },
      {
        id: "commissionValue",
        header: "Valor",
        cell: (row) => <span className="font-semibold">{formatCurrency(row.commissionValue)}</span>
      },
      {
        id: "createdAt",
        header: "Data do registro",
        cell: (row) => (
          <span style={{ color: "var(--color-text-muted)" }}>{formatDateTime(row.createdAt)}</span>
        )
      }
    ],
    []
  );

  const summary = summaryQuery.data?.summary;
  const errorMessage = getErrorMessage(summaryQuery.error);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button onClick={() => void summaryQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        }
        subtitle="Resumo mensal das comissoes registradas manualmente e da meta vinculada ao seu desempenho."
        title="Minhas comissoes"
      />

      <DetailCard title="Periodo">
        <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_160px]">
          <div className="space-y-2">
            <FieldLabel>Mes</FieldLabel>
            <select
              className={reportSelectClassName}
              onChange={(event) => setMonth(Number(event.target.value))}
              value={month}
            >
              {COMMISSION_MONTH_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Ano</FieldLabel>
            <Input
              className={reportFieldClassName}
              inputMode="numeric"
              min={2000}
              onChange={(event) => setYear(Number(event.target.value) || initialPeriod.year)}
              type="number"
              value={year}
            />
          </div>
        </div>
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      </DetailCard>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          icon={<HandCoins className="h-5 w-5" />}
          label="Total comissoes"
          value={formatCurrency(summary?.totalCommission ?? 0)}
        />
        <StatCard
          icon={<Target className="h-5 w-5" />}
          label="Meta do mes"
          value={formatCurrency(summary?.targetAmount ?? 0)}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="% atingido"
          value={formatPercent(summary?.achievementPercent ?? 0)}
          variant={summary && summary.achievementPercent >= 100 ? "success" : "default"}
        />
      </div>

      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Total vendido no periodo: {formatCurrency(summary?.totalSold ?? 0)}
      </p>

      <DetailCard title="Lancamentos do periodo">
        <DataTable
          columns={columns}
          data={summaryQuery.data?.rows ?? []}
          emptyDescription="Nenhuma comissao foi registrada para o periodo selecionado."
          emptyTitle="Sem comissoes no periodo"
          loading={summaryQuery.isLoading}
          rowKey={(row) => row.commissionId}
        />
      </DetailCard>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-medium uppercase tracking-[0.14em]" style={{ color: "var(--color-text-muted)" }}>
      {children}
    </p>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
      {message}
    </div>
  );
}
