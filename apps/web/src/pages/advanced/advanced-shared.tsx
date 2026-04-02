import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/app/status-badge";
import type {
  PurchaseOrderStatusName,
  RefundTypeName,
  ServiceOrderItemTypeName,
  ServiceOrderStatusName
} from "@/lib/api";

export const advancedSelectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const advancedTextareaClassName =
  "flex min-h-24 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function AdvancedFeedback({
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

export function AdvancedSummaryCard({
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

export function formatServiceOrderStatus(status: ServiceOrderStatusName) {
  switch (status) {
    case "OPEN":
      return "Aberta";
    case "WAITING_APPROVAL":
      return "Aguardando aprovacao";
    case "APPROVED":
      return "Aprovada";
    case "IN_PROGRESS":
      return "Em andamento";
    case "WAITING_PARTS":
      return "Aguardando pecas";
    case "READY_FOR_DELIVERY":
      return "Pronta para entrega";
    case "DELIVERED":
      return "Entregue";
    case "CANCELED":
      return "Cancelada";
    case "REJECTED":
      return "Rejeitada";
    default:
      return status;
  }
}

export function ServiceOrderStatusBadge({
  status
}: {
  status: ServiceOrderStatusName;
}) {
  const tone =
    status === "DELIVERED"
      ? "green"
      : status === "REJECTED" || status === "CANCELED"
        ? "slate"
        : status === "READY_FOR_DELIVERY"
          ? "blue"
          : status === "APPROVED" || status === "IN_PROGRESS"
            ? "amber"
            : "orange";

  return <StatusBadge tone={tone}>{formatServiceOrderStatus(status)}</StatusBadge>;
}

export function formatPurchaseOrderStatus(status: PurchaseOrderStatusName) {
  switch (status) {
    case "DRAFT":
      return "Rascunho";
    case "ORDERED":
      return "Pedido enviado";
    case "PARTIALLY_RECEIVED":
      return "Recebido parcial";
    case "RECEIVED":
      return "Recebido";
    case "CANCELED":
      return "Cancelado";
    default:
      return status;
  }
}

export function PurchaseOrderStatusBadge({
  status
}: {
  status: PurchaseOrderStatusName;
}) {
  const tone =
    status === "RECEIVED"
      ? "green"
      : status === "PARTIALLY_RECEIVED"
        ? "blue"
        : status === "CANCELED"
          ? "slate"
          : status === "ORDERED"
            ? "amber"
            : "orange";

  return <StatusBadge tone={tone}>{formatPurchaseOrderStatus(status)}</StatusBadge>;
}

export function formatRefundType(refundType: RefundTypeName) {
  switch (refundType) {
    case "CASH":
      return "Dinheiro";
    case "PIX":
      return "PIX";
    case "CARD_REVERSAL":
      return "Estorno no cartao";
    case "STORE_CREDIT":
      return "Credito da loja";
    case "EXCHANGE":
      return "Troca";
    default:
      return refundType;
  }
}

export function formatServiceOrderItemType(type: ServiceOrderItemTypeName) {
  switch (type) {
    case "PART":
      return "Peca";
    case "SERVICE":
      return "Servico";
    case "MANUAL_ITEM":
      return "Item manual";
    default:
      return type;
  }
}

export function emptyToUndefined(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
