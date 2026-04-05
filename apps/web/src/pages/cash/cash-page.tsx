import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  CircleDollarSign,
  Wallet
} from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/app/session-context";
import {
  closeCashSession,
  createCashDeposit,
  createCashWithdrawal,
  getCurrentCashSession,
  listCashHistory,
  type CashSession
} from "@/lib/api";
import {
  centsToInputValue,
  formatCurrency,
  formatDateTime,
  parseCurrencyToCents
} from "@/lib/format";
import { queryClient } from "@/lib/query-client";

const textareaClassName =
  "flex min-h-24 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CashPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;

  const currentSessionQuery = useQuery({
    queryKey: ["cash", "current-session"],
    queryFn: () => getCurrentCashSession(token)
  });
  const historyQuery = useQuery({
    queryKey: ["cash", "history"],
    queryFn: () => listCashHistory(token)
  });

  const currentSession = currentSessionQuery.data;
  const cashHistory = historyQuery.data ?? [];

  const [depositAmount, setDepositAmount] = useState("0,00");
  const [depositDescription, setDepositDescription] = useState("");
  const [withdrawalAmount, setWithdrawalAmount] = useState("0,00");
  const [withdrawalDescription, setWithdrawalDescription] = useState("");
  const [closingAmount, setClosingAmount] = useState("0,00");
  const [closingNotes, setClosingNotes] = useState("");

  useEffect(() => {
    if (currentSession) {
      setClosingAmount(
        centsToInputValue(currentSession.calculatedExpectedAmount).replace(".", ",")
      );
    }
  }, [currentSession]);

  const invalidateCash = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["cash"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    ]);
  };

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!currentSession) {
        throw new Error("Sessao atual do caixa indisponivel.");
      }

      return createCashDeposit(token, {
        cashSessionId: currentSession.id,
        amount: parseCurrencyToCents(depositAmount),
        description: depositDescription.trim() || undefined
      });
    },
    onSuccess: async () => {
      setDepositAmount("0,00");
      setDepositDescription("");
      await invalidateCash();
    }
  });

  const withdrawalMutation = useMutation({
    mutationFn: async () => {
      if (!currentSession) {
        throw new Error("Sessao atual do caixa indisponivel.");
      }

      return createCashWithdrawal(token, {
        cashSessionId: currentSession.id,
        amount: parseCurrencyToCents(withdrawalAmount),
        description: withdrawalDescription.trim() || undefined
      });
    },
    onSuccess: async () => {
      setWithdrawalAmount("0,00");
      setWithdrawalDescription("");
      await invalidateCash();
    }
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (!currentSession) {
        throw new Error("Sessao atual do caixa indisponivel.");
      }

      return closeCashSession(token, {
        cashSessionId: currentSession.id,
        closingAmount: parseCurrencyToCents(closingAmount),
        notes: closingNotes.trim() || undefined
      });
    },
    onSuccess: async () => {
      setClosingNotes("");
      await invalidateCash();
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operacao"
        title="Caixa"
        description="Acompanhe a sessao atual do terminal padrao, registre suprimentos, sangrias e feche o caixa com visao clara dos movimentos."
        badge={
          <StatusBadge tone={currentSession ? "green" : "amber"}>
            {currentSession
              ? "Sessao ativa"
              : currentSessionQuery.isLoading
                ? "Preparando sessao"
                : "Sessao indisponivel"}
          </StatusBadge>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={<Wallet className="h-5 w-5 text-primary" />}
          label="Sessao atual"
          value={currentSession ? "Aberta" : "Carregando"}
          helper={
            currentSession
              ? currentSession.cashTerminal.name
              : currentSessionQuery.isError
                ? "Falha ao carregar a sessao atual."
                : "Garantindo a sessao atual do caixa."
          }
        />
        <MetricTile
          icon={<CircleDollarSign className="h-5 w-5 text-primary" />}
          label="Valor esperado"
          value={formatCurrency(currentSession?.calculatedExpectedAmount ?? 0)}
          helper="Caixa consolidado pelas movimentacoes."
        />
        <MetricTile
          icon={<ArrowUpRight className="h-5 w-5 text-primary" />}
          label="Suprimentos"
          value={formatCurrency(currentSession?.movementSummary.supplies ?? 0)}
          helper="Entradas manuais em dinheiro."
        />
        <MetricTile
          icon={<ArrowDownLeft className="h-5 w-5 text-primary" />}
          label="Sangrias"
          value={formatCurrency(currentSession?.movementSummary.withdrawals ?? 0)}
          helper="Retiradas manuais registradas."
        />
      </div>

      {currentSessionQuery.isError ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-red-700">
            {(currentSessionQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : currentSession ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Sessao em operacao</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoRow label="Terminal" value={currentSession.cashTerminal.name} />
                <InfoRow
                  label="Aberta em"
                  value={formatDateTime(currentSession.openedAt)}
                />
                <InfoRow
                  label="Abertura"
                  value={formatCurrency(currentSession.openingAmount)}
                />
                <InfoRow
                  label="Em caixa agora"
                  value={formatCurrency(currentSession.cashOnHand)}
                />
              </CardContent>
            </Card>

            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Resumo da sessao</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <InfoRow
                  label="Vendas em dinheiro"
                  value={formatCurrency(currentSession.movementSummary.salesCash)}
                />
                <InfoRow
                  label="Reembolsos em dinheiro"
                  value={formatCurrency(currentSession.movementSummary.refundsCash)}
                />
                <InfoRow
                  label="Esperado"
                  value={formatCurrency(currentSession.calculatedExpectedAmount)}
                />
                <InfoRow
                  label="Observacao"
                  value={currentSession.notes || "Sem observacoes"}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <CashActionCard
              actionLabel="Registrar suprimento"
              amount={depositAmount}
              amountId="cash-deposit-amount"
              description={depositDescription}
              descriptionId="cash-deposit-description"
              errorMessage={
                depositMutation.error ? (depositMutation.error as Error).message : null
              }
              icon={<ArrowUpRight className="h-5 w-5 text-primary" />}
              isPending={depositMutation.isPending}
              onAmountChange={setDepositAmount}
              onDescriptionChange={setDepositDescription}
              onSubmit={() => {
                depositMutation.mutate();
              }}
              title="Suprimento"
            />

            <CashActionCard
              actionLabel="Registrar sangria"
              amount={withdrawalAmount}
              amountId="cash-withdrawal-amount"
              description={withdrawalDescription}
              descriptionId="cash-withdrawal-description"
              errorMessage={
                withdrawalMutation.error
                  ? (withdrawalMutation.error as Error).message
                  : null
              }
              icon={<ArrowDownLeft className="h-5 w-5 text-primary" />}
              isPending={withdrawalMutation.isPending}
              onAmountChange={setWithdrawalAmount}
              onDescriptionChange={setWithdrawalDescription}
              onSubmit={() => {
                withdrawalMutation.mutate();
              }}
              title="Sangria"
            />

            <CashActionCard
              actionLabel="Fechar sessao"
              allowZeroAmount
              amount={closingAmount}
              amountId="cash-close-amount"
              description={closingNotes}
              descriptionId="cash-close-notes"
              descriptionLabel="Notas de fechamento"
              errorMessage={closeMutation.error ? (closeMutation.error as Error).message : null}
              icon={<CheckCircle2 className="h-5 w-5 text-primary" />}
              isPending={closeMutation.isPending}
              onAmountChange={setClosingAmount}
              onDescriptionChange={setClosingNotes}
              onSubmit={() => {
                closeMutation.mutate();
              }}
              title="Fechamento"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Movimentos da sessao</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {currentSession.movements.length ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3 font-medium">Horario</th>
                          <th className="px-4 py-3 font-medium">Tipo</th>
                          <th className="px-4 py-3 font-medium">Descricao</th>
                          <th className="px-4 py-3 font-medium text-right">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentSession.movements
                          .slice()
                          .reverse()
                          .map((movement) => (
                            <tr key={movement.id} className="border-b border-border/60">
                              <td className="px-4 py-3 text-muted-foreground">
                                {formatDateTime(movement.createdAt)}
                              </td>
                              <td className="px-4 py-3">
                                <StatusBadge tone={movementTone(movement.movementType)}>
                                  {movementLabel(movement.movementType)}
                                </StatusBadge>
                              </td>
                              <td className="px-4 py-3 text-muted-foreground">
                                {movement.description || "Sem descricao"}
                              </td>
                              <td className="px-4 py-3 text-right font-semibold">
                                {formatCurrency(movement.amount)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 text-sm text-muted-foreground">
                    Nenhuma movimentacao registrada nesta sessao.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Vendas vinculadas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentSession.sales.length ? (
                  currentSession.sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="rounded-2xl border border-border/70 bg-secondary/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{sale.saleNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {formatDateTime(sale.completedAt)}
                          </p>
                        </div>
                        <StatusBadge tone="slate">{sale.status}</StatusBadge>
                      </div>
                      <p className="mt-3 text-sm font-semibold">
                        {formatCurrency(sale.total)}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Ainda nao ha vendas registradas nesta sessao.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Preparando a sessao atual do caixa...
          </CardContent>
        </Card>
      )}

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Historico recente</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {historyQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando historico...</div>
          ) : null}

          {historyQuery.error ? (
            <div className="p-6 text-sm text-red-700">
              {(historyQuery.error as Error).message}
            </div>
          ) : null}

          {cashHistory.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Terminal</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Abertura</th>
                    <th className="px-4 py-3 font-medium">Esperado</th>
                    <th className="px-4 py-3 font-medium">Fechamento</th>
                    <th className="px-4 py-3 font-medium">Diferenca</th>
                  </tr>
                </thead>
                <tbody>
                  {cashHistory.slice(0, 8).map((sessionItem) => (
                    <tr key={sessionItem.id} className="border-b border-border/60">
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <p className="font-semibold">{sessionItem.cashTerminal.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(sessionItem.openedAt)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={sessionItem.status === "OPEN" ? "green" : "slate"}>
                          {sessionItem.status === "OPEN" ? "Aberta" : "Fechada"}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3">{formatCurrency(sessionItem.openingAmount)}</td>
                      <td className="px-4 py-3">
                        {formatCurrency(sessionItem.calculatedExpectedAmount)}
                      </td>
                      <td className="px-4 py-3">
                        {sessionItem.closingAmount !== null
                          ? formatCurrency(sessionItem.closingAmount)
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {sessionItem.difference !== null
                          ? formatCurrency(sessionItem.difference)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !historyQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhuma sessao de caixa registrada ainda.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function CashActionCard({
  title,
  icon,
  amount,
  amountId,
  description,
  descriptionId,
  descriptionLabel = "Descricao",
  actionLabel,
  allowZeroAmount = false,
  isPending,
  errorMessage,
  onAmountChange,
  onDescriptionChange,
  onSubmit
}: {
  title: string;
  icon: ReactNode;
  amount: string;
  amountId: string;
  description: string;
  descriptionId: string;
  descriptionLabel?: string;
  actionLabel: string;
  allowZeroAmount?: boolean;
  isPending: boolean;
  errorMessage: string | null;
  onAmountChange(value: string): void;
  onDescriptionChange(value: string): void;
  onSubmit(): void;
}) {
  return (
    <Card className="bg-white/90">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={amountId}>
            Valor
          </label>
          <Input
            id={amountId}
            onChange={(event) => {
              onAmountChange(event.target.value);
            }}
            placeholder="0,00"
            value={amount}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor={descriptionId}>
            {descriptionLabel}
          </label>
          <textarea
            className={textareaClassName}
            id={descriptionId}
            onChange={(event) => {
              onDescriptionChange(event.target.value);
            }}
            placeholder="Adicionar contexto operacional"
            value={description}
          />
        </div>

        {errorMessage ? <p className="text-sm text-red-700">{errorMessage}</p> : null}

        <Button
          disabled={
            isPending || parseCurrencyToCents(amount) < (allowZeroAmount ? 0 : 1)
          }
          onClick={onSubmit}
          type="button"
          variant="outline"
        >
          {actionLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function MetricTile({
  icon,
  label,
  value,
  helper
}: {
  icon: ReactNode;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}</span>
          {icon}
        </div>
        <p className="text-2xl font-black tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/25 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-base font-semibold">{value}</p>
    </div>
  );
}

function movementLabel(movementType: CashSession["movements"][number]["movementType"]) {
  switch (movementType) {
    case "OPENING":
      return "Abertura";
    case "SALE":
      return "Venda";
    case "SUPPLY":
      return "Suprimento";
    case "WITHDRAWAL":
      return "Sangria";
    case "CLOSING":
      return "Fechamento";
    case "REFUND":
      return "Estorno";
    default:
      return movementType;
  }
}

function movementTone(
  movementType: CashSession["movements"][number]["movementType"]
): "green" | "orange" | "amber" | "slate" {
  switch (movementType) {
    case "OPENING":
    case "SUPPLY":
      return "green";
    case "WITHDRAWAL":
    case "REFUND":
      return "amber";
    case "SALE":
      return "orange";
    case "CLOSING":
    default:
      return "slate";
  }
}
