import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { RefreshCw, Save, Target } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailCard } from "@/components/ui/detail-card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import {
  getTeamCommissionSummary,
  listCommissionTargets,
  type TeamCommissionSummary,
  upsertCommissionTarget
} from "@/lib/api";
import {
  formatCurrency,
  formatCurrencyInput,
  formatCurrencyInputFromDigits,
  formatCompactNumber,
  parseCurrencyToCents
} from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { reportFieldClassName, reportSelectClassName } from "@/pages/reports/reports-shared";
import {
  COMMISSION_MONTH_OPTIONS,
  formatPercent,
  getCurrentCommissionPeriod,
  getErrorMessage
} from "./commissions-shared";

type TeamRow = TeamCommissionSummary["rows"][number];

export function TeamCommissionsPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const initialPeriod = getCurrentCommissionPeriod();
  const [month, setMonth] = useState(initialPeriod.month);
  const [year, setYear] = useState(initialPeriod.year);
  const [dialogRow, setDialogRow] = useState<TeamRow | null>(null);
  const [targetAmountInput, setTargetAmountInput] = useState(formatCurrencyInput(0));

  const teamQuery = useQuery({
    queryKey: ["commissions", "team", month, year],
    queryFn: () => getTeamCommissionSummary(token, { month, year })
  });

  const targetsQuery = useQuery({
    queryKey: ["commissions", "targets", month, year],
    queryFn: () => listCommissionTargets(token, { month, year })
  });

  const targetMutation = useMutation({
    mutationFn: async () => {
      if (!dialogRow) {
        throw new Error("Selecione um vendedor antes de salvar a meta.");
      }

      return upsertCommissionTarget(token, {
        userId: dialogRow.userId,
        month,
        year,
        targetAmount: parseCurrencyToCents(targetAmountInput)
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["commissions", "team"] }),
        queryClient.invalidateQueries({ queryKey: ["commissions", "targets"] })
      ]);
      setDialogRow(null);
    }
  });

  useEffect(() => {
    if (!dialogRow) {
      return;
    }

    const targetRecord = targetsQuery.data?.rows.find((row) => row.userId === dialogRow.userId);
    setTargetAmountInput(formatCurrencyInput(targetRecord?.targetAmount ?? dialogRow.targetAmount));
  }, [dialogRow, targetsQuery.data?.rows]);

  const rows = useMemo(() => {
    const targetsByUserId = new Map(
      (targetsQuery.data?.rows ?? []).map((row) => [row.userId, row])
    );

    return (teamQuery.data?.rows ?? []).map((row) => {
      const target = targetsByUserId.get(row.userId);

      if (!target) {
        return row;
      }

      return {
        ...row,
        targetId: target.targetId,
        targetAmount: target.targetAmount,
        achievementPercent:
          target.targetAmount > 0
            ? Math.round((row.totalSold / target.targetAmount) * 1000) / 10
            : 0
      };
    });
  }, [targetsQuery.data?.rows, teamQuery.data?.rows]);

  const columns = useMemo<Array<DataTableColumn<TeamRow>>>(
    () => [
      {
        id: "name",
        header: "Nome",
        cell: (row) => <span className="font-semibold">{row.name}</span>
      },
      {
        id: "saleCount",
        header: "Vendas no periodo",
        cell: (row) => formatCompactNumber(row.saleCount)
      },
      {
        id: "totalSold",
        header: "Total vendido",
        cell: (row) => <span className="font-semibold">{formatCurrency(row.totalSold)}</span>
      },
      {
        id: "totalCommission",
        header: "Comissao",
        cell: (row) => formatCurrency(row.totalCommission)
      },
      {
        id: "targetAmount",
        header: "Meta",
        cell: (row) => formatCurrency(row.targetAmount)
      },
      {
        id: "achievementPercent",
        header: "%",
        cell: (row) => formatPercent(row.achievementPercent)
      },
      {
        id: "actions",
        header: "Meta",
        headerClassName: "text-right",
        className: "text-right",
        cell: (row) => (
          <Button onClick={() => setDialogRow(row)} size="sm" type="button" variant="outline">
            <Target className="mr-2 h-4 w-4" />
            Definir meta
          </Button>
        )
      }
    ],
    []
  );

  const errorMessage =
    getErrorMessage(teamQuery.error) ??
    getErrorMessage(targetsQuery.error) ??
    getErrorMessage(targetMutation.error);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button
            onClick={() => {
              void teamQuery.refetch();
              void targetsQuery.refetch();
            }}
            type="button"
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        }
        subtitle="Visao gerencial mensal com vendas concluidas, comissoes registradas manualmente e metas por vendedor."
        title="Comissoes da equipe"
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

      <DetailCard title="Equipe no periodo">
        <DataTable
          columns={columns}
          data={rows}
          emptyDescription="Nenhum vendedor ativo teve vendas, comissoes ou meta no periodo selecionado."
          emptyTitle="Sem movimentacao no periodo"
          loading={teamQuery.isLoading || targetsQuery.isLoading}
          rowKey={(row) => row.userId}
        />
      </DetailCard>

      <Dialog onOpenChange={(open) => !open && setDialogRow(null)} open={Boolean(dialogRow)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Definir meta mensal</DialogTitle>
            <DialogDescription>
              {dialogRow
                ? `Atualize a meta de vendas de ${dialogRow.name} para ${COMMISSION_MONTH_OPTIONS.find((option) => option.value === month)?.label?.toLowerCase()} de ${year}.`
                : "Atualize a meta mensal do vendedor."}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
            <div className="space-y-2">
              <FieldLabel>Meta do periodo</FieldLabel>
              <Input
                className={reportFieldClassName}
                onChange={(event) =>
                  setTargetAmountInput(formatCurrencyInputFromDigits(event.target.value))
                }
                value={targetAmountInput}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button onClick={() => setDialogRow(null)} type="button" variant="ghost">
              Cancelar
            </Button>
            <Button
              disabled={targetMutation.isPending}
              onClick={() => targetMutation.mutate()}
              type="button"
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar meta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
