import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer, Undo2 } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { ProductImage } from "@/components/app/product-image";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  cancelFiscalDocument,
  getFiscalDocument,
  getSale,
  issueInternalReceipt
} from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";

const textareaClassName =
  "flex min-h-24 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SaleDetailPage() {
  const { id = "" } = useParams();
  const { authEnabled, hasPermission, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  const saleQuery = useQuery({
    queryKey: ["sales", id],
    queryFn: () => getSale(token, id),
    enabled: Boolean(id)
  });

  const sale = saleQuery.data;
  const fiscalDocumentQuery = useQuery({
    queryKey: ["fiscal", "documents", sale?.fiscalDocument?.id],
    queryFn: () => getFiscalDocument(token, sale?.fiscalDocument?.id ?? ""),
    enabled: Boolean(sale?.fiscalDocument?.id && hasPermission("fiscal.read"))
  });

  const operatorLabel = useMemo(
    () => sale?.user?.name || "Operacao local",
    [sale?.user?.name]
  );
  const issueMutation = useMutation({
    mutationFn: async () => issueInternalReceipt(token, id),
    onSuccess: async (document) => {
      setFeedback({
        tone: "success",
        text: `Comprovante ${document.receiptNumber || document.id} emitido com sucesso.`
      });
      setShowCancelForm(false);
      setCancelReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["sales", id] }),
        queryClient.invalidateQueries({ queryKey: ["fiscal"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });
  const cancelMutation = useMutation({
    mutationFn: async () =>
      sale?.fiscalDocument
        ? cancelFiscalDocument(
            token,
            sale.fiscalDocument.id,
            cancelReason.trim() || undefined
          )
        : Promise.reject(new Error("Documento fiscal/documental nao encontrado.")),
    onSuccess: async (document) => {
      setFeedback({
        tone: "success",
        text: `Comprovante ${document.receiptNumber || document.id} cancelado com sucesso.`
      });
      setShowCancelForm(false);
      setCancelReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["sales", id] }),
        queryClient.invalidateQueries({ queryKey: ["fiscal"] }),
        queryClient.invalidateQueries({ queryKey: ["reports"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link to="/sales">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
            <Button onClick={() => window.print()} type="button" variant="outline">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir
            </Button>
            {hasPermission("sale-returns.create") && sale && sale.status !== "CANCELED" ? (
              <Button asChild type="button" variant="outline">
                <Link to={`/sale-returns/new?saleId=${sale.id}`}>
                  <Undo2 className="mr-2 h-4 w-4" />
                  Registrar devolucao
                </Link>
              </Button>
            ) : null}
            {hasPermission("fiscal.issue") &&
            sale &&
            !sale.fiscalDocument &&
            sale.status === "COMPLETED" ? (
              <Button
                disabled={issueMutation.isPending}
                onClick={() => issueMutation.mutate()}
                type="button"
                variant="outline"
              >
                Emitir comprovante
              </Button>
            ) : null}
            {hasPermission("fiscal.cancel") &&
            sale?.fiscalDocument &&
            sale.fiscalDocument.status === "AUTHORIZED" ? (
              <Button
                disabled={cancelMutation.isPending}
                onClick={() => {
                  setFeedback(null);
                  setShowCancelForm((current) => !current);
                }}
                type="button"
                variant="outline"
              >
                {showCancelForm ? "Fechar cancelamento" : "Cancelar comprovante"}
              </Button>
            ) : null}
            {hasPermission("fiscal.read") ? (
              <Button asChild variant="outline">
                <Link to="/fiscal">Fiscal</Link>
              </Button>
            ) : null}
          </>
        }
        description="Ficha completa da venda com itens, pagamentos, status comercial e dados fiscais quando existirem."
        eyebrow="Operacao"
        title={sale ? `Venda ${sale.saleNumber}` : "Detalhe da venda"}
      />

      {saleQuery.isLoading ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Carregando venda...
          </CardContent>
        </Card>
      ) : null}

      {saleQuery.error ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-red-700">
            {(saleQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {feedback ? (
        <Card className="bg-white/90">
          <CardContent
            className={`p-4 text-sm ${
              feedback.tone === "success" ? "text-green-700" : "text-red-700"
            }`}
          >
            {feedback.text}
          </CardContent>
        </Card>
      ) : null}

      {fiscalDocumentQuery.error ? (
        <Card className="bg-white/90">
          <CardContent className="p-4 text-sm text-red-700">
            {(fiscalDocumentQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {sale ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard
              label="Cliente"
              value={sale.customer?.name || "Consumidor nao identificado"}
            />
            <InfoCard label="Operador" value={operatorLabel} />
            <InfoCard label="Caixa" value={sale.cashSession.cashTerminal.name} />
            <InfoCard label="Data" value={formatDateTime(sale.completedAt)} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Itens vendidos</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                      <tr>
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 font-medium">Qtd</th>
                        <th className="px-4 py-3 font-medium">Preco</th>
                        <th className="px-4 py-3 font-medium">Desconto</th>
                        <th className="px-4 py-3 font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sale.items.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b border-border/60"
                        >
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-3">
                              <ProductImage
                                className="h-14 w-14 shrink-0"
                                imageUrl={item.product.imageUrl}
                                name={item.product.name}
                              />
                              <div className="space-y-1">
                                <p className="font-semibold">{item.product.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {item.product.internalCode}
                                  {item.productUnit?.imei
                                    ? ` • ${item.productUnit.imei}`
                                    : item.productUnit?.serialNumber
                                      ? ` • ${item.productUnit.serialNumber}`
                                      : ""}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-4">{item.quantity}</td>
                          <td className="px-4 py-4">
                            {formatCurrency(item.unitPrice)}
                          </td>
                          <td className="px-4 py-4">
                            {formatCurrency(item.discountAmount)}
                          </td>
                          <td className="px-4 py-4 font-semibold">
                            {formatCurrency(item.totalPrice)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-white/90">
                <CardHeader>
                  <CardTitle className="text-xl">Resumo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    <StatusBadge
                      tone={
                        sale.status === "COMPLETED"
                          ? "green"
                          : sale.status === "CANCELED"
                            ? "amber"
                            : "orange"
                      }
                    >
                      {sale.status}
                    </StatusBadge>
                    <StatusBadge tone="slate">{sale.fiscalStatus}</StatusBadge>
                  </div>
                  <InfoCard compact label="Subtotal" value={formatCurrency(sale.subtotal)} />
                  <InfoCard
                    compact
                    label="Desconto"
                    value={formatCurrency(sale.discountAmount)}
                  />
                  <InfoCard compact label="Total" value={formatCurrency(sale.total)} />
                  <InfoCard
                    compact
                    label="Recibo"
                    value={sale.receiptNumber || "Nao gerado"}
                  />
                </CardContent>
              </Card>

              <Card className="bg-white/90">
                <CardHeader>
                  <CardTitle className="text-xl">Pagamentos</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {sale.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="rounded-2xl border border-border/70 bg-secondary/20 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold">{payment.method}</p>
                        <p className="font-semibold">
                          {formatCurrency(payment.amount)}
                        </p>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {payment.installments
                          ? `${payment.installments} parcela(s)`
                          : "Pagamento a vista"}
                        {payment.referenceCode ? ` • ${payment.referenceCode}` : ""}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-white/90">
                <CardHeader>
                  <CardTitle className="text-xl">Fiscal</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    O fluxo atual gera apenas comprovante interno da loja. Nao existe emissao
                    fiscal SEFAZ ativa nesta etapa.
                  </p>
                  {sale.fiscalDocument ? (
                    <>
                      <InfoCard
                        compact
                        label="Documento"
                        value={translateDocumentType(sale.fiscalDocument.documentType)}
                      />
                      <InfoCard
                        compact
                        label="Status"
                        value={sale.fiscalDocument.status}
                      />
                      <InfoCard
                        compact
                        label="Recibo"
                        value={sale.fiscalDocument.receiptNumber || "Sem recibo"}
                      />
                      <InfoCard
                        compact
                        label="Mensagem"
                        value={
                          sale.fiscalDocument.authorizationMessage || "Sem mensagem registrada"
                        }
                      />
                      <InfoCard
                        compact
                        label="Chave"
                        value={sale.fiscalDocument.accessKey || "Sem chave"}
                      />
                      {showCancelForm && hasPermission("fiscal.cancel") ? (
                        <div className="space-y-3 rounded-2xl border border-border/70 bg-secondary/20 p-4">
                          <div className="space-y-2">
                            <label
                              className="text-sm font-medium"
                              htmlFor="sale-fiscal-cancel-reason"
                            >
                              Motivo do cancelamento
                            </label>
                            <textarea
                              className={textareaClassName}
                              id="sale-fiscal-cancel-reason"
                              onChange={(event) => setCancelReason(event.target.value)}
                              placeholder="Informe o motivo do cancelamento interno."
                              value={cancelReason}
                            />
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button
                              disabled={cancelMutation.isPending}
                              onClick={() => cancelMutation.mutate()}
                              type="button"
                            >
                              Confirmar cancelamento
                            </Button>
                            <Button
                              onClick={() => {
                                setShowCancelForm(false);
                                setCancelReason("");
                              }}
                              type="button"
                              variant="outline"
                            >
                              Voltar
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Historico fiscal
                        </p>
                        {fiscalDocumentQuery.isLoading ? (
                          <p className="mt-3 text-sm text-muted-foreground">
                            Carregando eventos do comprovante...
                          </p>
                        ) : fiscalDocumentQuery.data?.events.length ? (
                          <div className="mt-3 space-y-3">
                            {fiscalDocumentQuery.data.events.map((event) => {
                              const reason =
                                event.payload &&
                                typeof event.payload === "object" &&
                                event.payload !== null &&
                                "reason" in event.payload &&
                                typeof event.payload.reason === "string"
                                  ? event.payload.reason
                                  : null;

                              return (
                                <div
                                  key={event.id}
                                  className="rounded-xl border border-border/60 bg-white/80 p-3"
                                >
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="text-sm font-semibold">
                                      {translateFiscalEvent(event.eventType)}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      {formatDateTime(event.createdAt)}
                                    </p>
                                  </div>
                                  <p className="mt-1 text-sm text-muted-foreground">
                                    {event.description || "Sem descricao registrada."}
                                  </p>
                                  {reason ? (
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      Motivo: {reason}
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="mt-3 text-sm text-muted-foreground">
                            Nenhum evento fiscal complementar registrado.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Nenhum documento fiscal vinculado a esta venda.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function InfoCard({
  label,
  value,
  compact = false
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border border-border/70 bg-white/90 ${
        compact ? "p-4" : "p-5"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}

function translateDocumentType(value: string) {
  switch (value) {
    case "RECEIPT":
      return "Recibo interno";
    case "SERVICE_RECEIPT":
      return "Recibo de servico";
    case "NFCE":
      return "NFC-e";
    case "NFE":
      return "NF-e";
    default:
      return value;
  }
}

function translateFiscalEvent(value: string) {
  switch (value) {
    case "CREATED":
      return "Criado";
    case "AUTHORIZED":
      return "Autorizado";
    case "REJECTED":
      return "Rejeitado";
    case "CANCELED":
      return "Cancelado";
    case "ERROR":
      return "Erro";
    case "VOIDED":
      return "Inutilizado";
    default:
      return value;
  }
}
