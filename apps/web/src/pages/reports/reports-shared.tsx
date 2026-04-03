import { StatusBadge } from "@/components/app/status-badge";
import type { CashReport, PaymentMethodName, SalesReport } from "@/lib/api";
import { formatPaymentMethod } from "@/pages/finance/finance-shared";

export const reportFieldClassName =
  "border-white/10 bg-white/5 text-[color:var(--color-text)] placeholder:text-[color:var(--color-text-muted)]";

export const reportSelectClassName =
  "flex h-11 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-[color:var(--color-text)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SaleStatusBadge({
  status
}: {
  status: SalesReport["rows"][number]["status"];
}) {
  const tone =
    status === "COMPLETED" ? "green" : status === "REFUNDED" ? "orange" : "amber";

  return <StatusBadge tone={tone}>{formatSaleStatus(status)}</StatusBadge>;
}

export function formatSaleStatus(status: SalesReport["rows"][number]["status"]) {
  switch (status) {
    case "COMPLETED":
      return "Concluida";
    case "REFUNDED":
      return "Estornada";
    case "CANCELED":
    default:
      return "Cancelada";
  }
}

export function CashSessionStatusBadge({
  status
}: {
  status: CashReport["sessions"][number]["status"];
}) {
  return (
    <StatusBadge tone={status === "OPEN" ? "green" : "slate"}>
      {status === "OPEN" ? "Aberta" : "Fechada"}
    </StatusBadge>
  );
}

export function formatCashMovementType(
  movementType: CashReport["movements"][number]["movementType"]
) {
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
    default:
      return "Estorno";
  }
}

export function formatCashMovementPayment(
  paymentMethod: PaymentMethodName | null,
  movementType: CashReport["movements"][number]["movementType"]
) {
  if (paymentMethod) {
    return formatPaymentMethod(paymentMethod);
  }

  if (
    movementType === "OPENING" ||
    movementType === "SUPPLY" ||
    movementType === "WITHDRAWAL" ||
    movementType === "CLOSING"
  ) {
    return formatPaymentMethod("CASH");
  }

  return "Nao informado";
}
