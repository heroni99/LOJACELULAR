import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/app/status-badge";
import type { FinancialEntryStatusName, PaymentMethodName } from "@/lib/api";

export const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function FinancialStatusBadge({
  status
}: {
  status: FinancialEntryStatusName;
}) {
  const tone =
    status === "PAID" || status === "RECEIVED"
      ? "green"
      : status === "OVERDUE"
        ? "orange"
        : status === "CANCELED"
          ? "slate"
          : "amber";

  return <StatusBadge tone={tone}>{formatFinancialStatus(status)}</StatusBadge>;
}

export function formatFinancialStatus(status: FinancialEntryStatusName) {
  switch (status) {
    case "PAID":
      return "Pago";
    case "RECEIVED":
      return "Recebido";
    case "OVERDUE":
      return "Atrasado";
    case "CANCELED":
      return "Cancelado";
    case "PENDING":
    default:
      return "Pendente";
  }
}

export function formatPaymentMethod(method: PaymentMethodName | null) {
  switch (method) {
    case "CASH":
      return "Dinheiro";
    case "PIX":
      return "PIX";
    case "DEBIT":
      return "Debito";
    case "CREDIT":
      return "Credito";
    case "STORE_CREDIT":
      return "Credito da loja";
    default:
      return "Nao informado";
  }
}

export function SummaryCard({
  label,
  value,
  helper
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-2 p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
        {helper ? <p className="text-xs text-muted-foreground">{helper}</p> : null}
      </CardContent>
    </Card>
  );
}

export function FeedbackBanner({
  feedback
}: {
  feedback: { tone: "success" | "error"; text: string } | null;
}) {
  if (!feedback) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        feedback.tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {feedback.text}
    </div>
  );
}
