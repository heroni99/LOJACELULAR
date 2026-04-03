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
import { Input } from "@/components/ui/input";
import { formatCurrency } from "@/lib/format";
import type { PaymentMethodName } from "@/lib/api";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type PaymentRow = {
  id: string;
  method: PaymentMethodName;
  amount: string;
  installments: string;
  referenceCode: string;
};

type CustomerOption = {
  id: string;
  name: string;
};

type PdvCheckoutDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  customerId: string;
  onCustomerIdChange(value: string): void;
  customers: CustomerOption[];
  saleDiscount: string;
  onSaleDiscountChange(value: string): void;
  payments: PaymentRow[];
  onAddPayment(): void;
  onUseTotal(): void;
  onUpdatePayment(
    paymentId: string,
    patch: Partial<Pick<PaymentRow, "method" | "amount" | "installments" | "referenceCode">>
  ): void;
  onRemovePayment(paymentId: string): void;
  subtotal: number;
  total: number;
  paymentTotal: number;
  troco: number;
  missingAmount: number;
  itemCount: number;
  checkoutPending: boolean;
  checkoutDisabled: boolean;
  onCheckout(): void;
  feedback?: {
    tone: "success" | "error";
    text: string;
  } | null;
};

export function PdvCheckoutDialog({
  open,
  onOpenChange,
  customerId,
  onCustomerIdChange,
  customers,
  saleDiscount,
  onSaleDiscountChange,
  payments,
  onAddPayment,
  onUseTotal,
  onUpdatePayment,
  onRemovePayment,
  subtotal,
  total,
  paymentTotal,
  troco,
  missingAmount,
  itemCount,
  checkoutPending,
  checkoutDisabled,
  onCheckout,
  feedback
}: PdvCheckoutDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Checkout da venda</DialogTitle>
          <DialogDescription>
            Confirme cliente, desconto e pagamentos antes de concluir a venda no
            backend real.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_320px]">
            <div className="space-y-4">
              <section className="space-y-3 rounded-[1.75rem] border border-border/70 bg-white p-5">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                    Cliente
                  </p>
                  <select
                    className={selectClassName}
                    onChange={(event) => onCustomerIdChange(event.target.value)}
                    value={customerId}
                  >
                    <option value="">Consumidor nao identificado</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                </div>

                <Field
                  label="Desconto geral"
                  onChange={onSaleDiscountChange}
                  value={saleDiscount}
                />
              </section>

              <section className="space-y-4 rounded-[1.75rem] border border-border/70 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                      Pagamentos
                    </p>
                    <p className="text-sm text-muted-foreground">
                      O total conciliado precisa bater com a venda.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={onAddPayment} type="button" variant="outline">
                      Adicionar pagamento
                    </Button>
                    <Button onClick={onUseTotal} type="button" variant="outline">
                      Usar total
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {payments.map((payment, index) => (
                    <div
                      key={payment.id}
                      className="rounded-2xl border border-border/70 bg-secondary/20 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold">
                          Pagamento {index + 1}
                        </p>
                        <Button
                          disabled={payments.length === 1}
                          onClick={() => onRemovePayment(payment.id)}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Remover
                        </Button>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2">
                        <select
                          className={selectClassName}
                          onChange={(event) =>
                            onUpdatePayment(payment.id, {
                              method: event.target.value as PaymentMethodName
                            })
                          }
                          value={payment.method}
                        >
                          <option value="CASH">Dinheiro</option>
                          <option value="PIX">PIX</option>
                          <option value="DEBIT">Debito</option>
                          <option value="CREDIT">Credito</option>
                          <option value="STORE_CREDIT">Credito da loja</option>
                        </select>

                        <Field
                          label="Valor"
                          onChange={(value) =>
                            onUpdatePayment(payment.id, { amount: value })
                          }
                          value={payment.amount}
                        />

                        <Field
                          label="Parcelas"
                          onChange={(value) =>
                            onUpdatePayment(payment.id, { installments: value })
                          }
                          value={payment.installments}
                        />

                        <Field
                          label="Referencia"
                          onChange={(value) =>
                            onUpdatePayment(payment.id, { referenceCode: value })
                          }
                          value={payment.referenceCode}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-[1.75rem] border border-border/70 bg-slate-950 p-5 text-white">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-200">
                  Resumo do checkout
                </p>
                <div className="mt-5 space-y-3">
                  <SummaryRow label="Itens" value={String(itemCount)} />
                  <SummaryRow label="Subtotal" value={formatCurrency(subtotal)} />
                  <SummaryRow label="Desconto" value={saleDiscount} />
                  <SummaryRow label="Pagamentos" value={formatCurrency(paymentTotal)} />
                  <SummaryRow
                    label="Falta"
                    value={formatCurrency(Math.max(0, missingAmount))}
                  />
                  <SummaryRow label="Troco" value={formatCurrency(troco)} />
                </div>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                    Total final
                  </p>
                  <p className="mt-2 text-3xl font-black tracking-tight">
                    {formatCurrency(total)}
                  </p>
                </div>
              </section>

              {feedback ? (
                <section
                  className={`rounded-2xl border p-4 text-sm ${
                    feedback.tone === "success"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {feedback.text}
                </section>
              ) : null}
            </aside>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Voltar ao carrinho
          </Button>
          <Button
            disabled={checkoutDisabled || checkoutPending}
            onClick={onCheckout}
            type="button"
          >
            {checkoutPending ? "Concluindo..." : "Finalizar venda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
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
      <Input onChange={(event) => onChange(event.target.value)} value={value} />
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-white/62">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
