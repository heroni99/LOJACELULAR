import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Search, Wallet } from "lucide-react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  createAccountsPayable,
  getPurchaseOrder,
  listAccountsPayable,
  listSuppliers,
  payAccountsPayable,
  updateAccountsPayable,
  type AccountsPayableEntry,
  type PaymentMethodName
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { centsToInputValue, formatCurrency } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { error as toastError, success } from "@/lib/toast";
import {
  FeedbackBanner,
  FinancialStatusBadge,
  formatPaymentMethod,
  SummaryCard,
  selectClassName
} from "./finance-shared";

const accountFormSchema = z.object({
  supplierId: z.string().trim().optional(),
  purchaseOrderId: z.string().trim().optional(),
  description: z.string().trim().min(1, "Informe a descricao."),
  amount: z
    .string()
    .trim()
    .min(1, "Informe o valor.")
    .refine((value) => Number(value.replace(",", ".")) > 0, "Informe um valor positivo."),
  dueDate: z.string().trim().min(1, "Informe o vencimento."),
  paymentMethod: z.string().trim().optional(),
  notes: z.string().trim().optional()
});

type AccountFormValues = z.infer<typeof accountFormSchema>;

const paymentOptions: Array<{ value: PaymentMethodName; label: string }> = [
  { value: "CASH", label: "Dinheiro" },
  { value: "PIX", label: "PIX" },
  { value: "DEBIT", label: "Debito" },
  { value: "CREDIT", label: "Credito" },
  { value: "STORE_CREDIT", label: "Credito da loja" }
];

export function AccountsPayablePage() {
  const [searchParams] = useSearchParams();
  const purchaseOrderIdParam = searchParams.get("purchaseOrderId") ?? "";
  const { authEnabled, hasPermission, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState<"" | "PENDING" | "PAID" | "OVERDUE" | "CANCELED">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editingEntry, setEditingEntry] = useState<AccountsPayableEntry | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [payingEntry, setPayingEntry] = useState<AccountsPayableEntry | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodName>("CASH");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      supplierId: "",
      purchaseOrderId: "",
      description: "",
      amount: "0.00",
      dueDate: "",
      paymentMethod: "",
      notes: ""
    }
  });

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "accounts-payable-filter"],
    queryFn: () => listSuppliers(token, { active: true })
  });
  const linkedPurchaseOrderQuery = useQuery({
    queryKey: ["purchase-orders", "accounts-payable-prefill", purchaseOrderIdParam],
    queryFn: () => getPurchaseOrder(token, purchaseOrderIdParam),
    enabled: Boolean(purchaseOrderIdParam)
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts-payable", search, supplierId, status, startDate, endDate],
    queryFn: () =>
      listAccountsPayable(token, {
        search: search.trim() || undefined,
        supplierId: supplierId || undefined,
        status: status || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 150
      })
  });

  useEffect(() => {
    if (!editingEntry) {
      form.reset({
        supplierId: "",
        purchaseOrderId: "",
        description: "",
        amount: "0.00",
        dueDate: "",
        paymentMethod: "",
        notes: ""
      });
      return;
    }

    form.reset({
      supplierId: editingEntry.supplier?.id ?? "",
      purchaseOrderId: editingEntry.purchaseOrder?.id ?? "",
      description: editingEntry.description,
      amount: centsToInputValue(editingEntry.amount),
      dueDate: editingEntry.dueDate.slice(0, 10),
      paymentMethod: editingEntry.paymentMethod ?? "",
      notes: editingEntry.notes ?? ""
    });
  }, [editingEntry, form]);

  useEffect(() => {
    if (!purchaseOrderIdParam || editingEntry || !linkedPurchaseOrderQuery.data) {
      return;
    }

    const purchaseOrder = linkedPurchaseOrderQuery.data;
    setShowForm(true);
    form.reset({
      supplierId: purchaseOrder.supplier.id,
      purchaseOrderId: purchaseOrder.id,
      description: `Pedido ${purchaseOrder.orderNumber}`,
      amount: centsToInputValue(purchaseOrder.total),
      dueDate: new Date().toISOString().slice(0, 10),
      paymentMethod: "",
      notes: purchaseOrder.notes ?? ""
    });
  }, [editingEntry, form, linkedPurchaseOrderQuery.data, purchaseOrderIdParam]);

  const saveMutation = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const payload = {
        supplierId: values.supplierId || undefined,
        purchaseOrderId: values.purchaseOrderId || undefined,
        description: values.description,
        amount: Math.round(Number(values.amount.replace(",", ".")) * 100),
        dueDate: values.dueDate,
        paymentMethod: (values.paymentMethod || undefined) as PaymentMethodName | undefined,
        notes: values.notes || undefined
      };

      if (editingEntry) {
        return updateAccountsPayable(token, editingEntry.id, payload);
      }

      return createAccountsPayable(token, payload);
    },
    onSuccess: async () => {
      success(editingEntry ? "Conta a pagar atualizada." : "Conta a pagar criada.");
      setEditingEntry(null);
      setShowForm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts-payable"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const payMutation = useMutation({
    mutationFn: async () => {
      if (!payingEntry) {
        throw new Error("Selecione a conta a pagar.");
      }

      return payAccountsPayable(token, payingEntry.id, {
        paymentMethod,
        notes: paymentNotes || undefined
      });
    },
    onSuccess: async () => {
      success("Pagamento registrado com sucesso.");
      setPayingEntry(null);
      setPaymentMethod("CASH");
      setPaymentNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts-payable"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["cash"] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const cancelMutation = useMutation({
    mutationFn: (entry: AccountsPayableEntry) =>
      updateAccountsPayable(token, entry.id, { status: "CANCELED" }),
    onSuccess: async () => {
      success("Conta cancelada.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts-payable"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const entries = accountsQuery.data ?? [];
  const pendingTotal = useMemo(
    () =>
      entries
        .filter((entry) => entry.status === "PENDING" || entry.status === "OVERDUE")
        .reduce((sum, entry) => sum + entry.amount, 0),
    [entries]
  );
  const paidTotal = useMemo(
    () =>
      entries.filter((entry) => entry.status === "PAID").reduce((sum, entry) => sum + entry.amount, 0),
    [entries]
  );
  const overdueCount = entries.filter((entry) => entry.status === "OVERDUE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Contas a pagar"
        description="Despesas, vencimentos e baixa financeira integrados ao caixa aberto e aos pedidos de compra."
        actions={
          hasPermission("accounts-payable.create") ? (
            <Button
              onClick={() => {
                setEditingEntry(null);
                setShowForm((current) => !current);
              }}
              type="button"
            >
              <Plus className="mr-2 h-4 w-4" />
              Nova conta
            </Button>
          ) : undefined
        }
      />

      <FeedbackBanner feedback={feedback} />

      {linkedPurchaseOrderQuery.data && !editingEntry ? (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-orange-900 lg:flex-row lg:items-center lg:justify-between">
            <div>
              Conta a pagar pre-preenchida a partir do pedido {linkedPurchaseOrderQuery.data.orderNumber}.
            </div>
            <Button asChild type="button" variant="outline">
              <Link to={`/purchase-orders/${linkedPurchaseOrderQuery.data.id}`}>Abrir pedido</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard helper="Pendentes e atrasadas" label="Em aberto" value={formatCurrency(pendingTotal)} />
        <SummaryCard helper="Baixas ja registradas" label="Pagas" value={formatCurrency(paidTotal)} />
        <SummaryCard helper="Titulos vencidos" label="Atrasadas" value={String(overdueCount)} />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_180px_180px_180px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="accounts-payable-search">Busca</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-10" id="accounts-payable-search" onChange={(event) => setSearch(event.target.value)} placeholder="Descricao ou fornecedor" value={search} />
            </div>
          </div>
          <SelectField label="Fornecedor" onChange={setSupplierId} options={[{ label: "Todos", value: "" }, ...(suppliersQuery.data ?? []).map((supplier) => ({ label: supplier.name, value: supplier.id }))]} value={supplierId} />
          <SelectField label="Status" onChange={(value) => setStatus(value as typeof status)} options={[{ label: "Todos", value: "" }, { label: "Pendente", value: "PENDING" }, { label: "Atrasado", value: "OVERDUE" }, { label: "Pago", value: "PAID" }, { label: "Cancelado", value: "CANCELED" }]} value={status} />
          <DateField label="De" onChange={setStartDate} value={startDate} />
          <DateField label="Ate" onChange={setEndDate} value={endDate} />
          <div className="flex items-end">
            <Button onClick={() => void accountsQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {showForm ? (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">
              {editingEntry ? "Editar conta a pagar" : "Nova conta a pagar"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) => {
                setFeedback(null);
                saveMutation.mutate(values);
              })}
            >
              <div className="grid gap-4 xl:grid-cols-2">
                <SelectInput
                  id="accounts-payable-supplier"
                  label="Fornecedor"
                  options={[
                    { label: "Sem fornecedor", value: "" },
                    ...(suppliersQuery.data ?? []).map((supplier) => ({
                      label: supplier.name,
                      value: supplier.id
                    }))
                  ]}
                  registration={form.register("supplierId")}
                />
                {form.watch("purchaseOrderId") ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Pedido vinculado</label>
                    <div className="rounded-xl border border-border/70 bg-secondary/30 px-3 py-2 text-sm">
                      {linkedPurchaseOrderQuery.data?.orderNumber ??
                        editingEntry?.purchaseOrder?.id ??
                        form.watch("purchaseOrderId")}
                    </div>
                  </div>
                ) : null}
                <Field id="accounts-payable-due-date" label="Vencimento" registration={form.register("dueDate")} type="date" />
                <Field id="accounts-payable-description" label="Descricao" registration={form.register("description")} type="text" />
                <Field id="accounts-payable-amount" label="Valor (R$)" registration={form.register("amount")} type="number" />
                <SelectInput
                  id="accounts-payable-method"
                  label="Forma de pagamento"
                  options={[
                    { label: "Nao definido", value: "" },
                    ...paymentOptions.map((option) => ({
                      label: option.label,
                      value: option.value
                    }))
                  ]}
                  registration={form.register("paymentMethod")}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="accounts-payable-notes">
                  Observacoes
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  id="accounts-payable-notes"
                  {...form.register("notes")}
                />
              </div>
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  onClick={() => {
                    setShowForm(false);
                    setEditingEntry(null);
                  }}
                  type="button"
                  variant="outline"
                >
                  Fechar
                </Button>
                <LoadingButton isLoading={saveMutation.isPending} loadingText="Aguarde..." type="submit">
                  Salvar conta
                </LoadingButton>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {payingEntry ? (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-emerald-900">
              <Wallet className="h-5 w-5" />
              Registrar pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-emerald-800">
              {payingEntry.description} • {formatCurrency(payingEntry.amount)}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Forma de pagamento"
                onChange={(value) => setPaymentMethod(value as PaymentMethodName)}
                options={paymentOptions.map((option) => ({ label: option.label, value: option.value }))}
                value={paymentMethod}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="accounts-payable-payment-notes">
                  Observacoes
                </label>
                <Input id="accounts-payable-payment-notes" onChange={(event) => setPaymentNotes(event.target.value)} value={paymentNotes} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button onClick={() => setPayingEntry(null)} type="button" variant="outline">
                Cancelar
              </Button>
              <LoadingButton isLoading={payMutation.isPending} loadingText="Aguarde..." onClick={() => payMutation.mutate()} type="button">
                Confirmar pagamento
              </LoadingButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-white/90">
        <CardContent className="p-0">
          {accountsQuery.isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando contas a pagar...</div> : null}
          {accountsQuery.error ? <div className="p-6 text-sm text-red-700">{parseApiError(accountsQuery.error)}</div> : null}
          {entries.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Descricao</th>
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Vencimento</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Pagamento</th>
                    <th className="px-4 py-3 font-medium text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`border-b border-border/60 ${
                        entry.status === "OVERDUE" ? "bg-red-50/60" : ""
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{entry.description}</p>
                          {entry.notes ? <p className="text-xs text-muted-foreground">{entry.notes}</p> : null}
                          {entry.purchaseOrder ? (
                            <p className="text-xs text-muted-foreground">
                              Pedido vinculado • {formatCurrency(entry.purchaseOrder.total)}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{entry.supplier?.tradeName || entry.supplier?.name || "Sem fornecedor"}</td>
                      <td className="px-4 py-4 font-semibold">{formatCurrency(entry.amount)}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        <div className="space-y-1">
                          <p>{entry.dueDate.slice(0, 10)}</p>
                          <p className="text-xs">
                            {entry.daysUntilDue >= 0 ? `vence em ${entry.daysUntilDue} dia(s)` : `${Math.abs(entry.daysUntilDue)} dia(s) de atraso`}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <FinancialStatusBadge status={entry.status} />
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{formatPaymentMethod(entry.paymentMethod)}</td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button
                            disabled={!hasPermission("accounts-payable.update")}
                            onClick={() => {
                              setEditingEntry(entry);
                              setShowForm(true);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Editar
                          </Button>
                          <Button
                            disabled={entry.status === "PAID" || entry.status === "CANCELED" || !hasPermission("accounts-payable.pay")}
                            onClick={() => {
                              setPayingEntry(entry);
                              setPaymentMethod(entry.paymentMethod ?? "CASH");
                              setPaymentNotes("");
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Pagar
                          </Button>
                          <Button
                            disabled={entry.status === "PAID" || entry.status === "CANCELED" || cancelMutation.isPending || !hasPermission("accounts-payable.update")}
                            onClick={() => cancelMutation.mutate(entry)}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Cancelar
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !accountsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhuma conta a pagar encontrada com os filtros atuais.</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  id,
  label,
  registration,
  type
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  type: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <Input id={id} step={type === "number" ? "0.01" : undefined} type={type} {...registration} />
    </div>
  );
}

function SelectInput({
  id,
  label,
  options,
  registration
}: {
  id: string;
  label: string;
  options: { label: string; value: string }[];
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <select className={selectClassName} id={id} {...registration}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function SelectField({
  label,
  options,
  value,
  onChange
}: {
  label: string;
  options: { label: string; value: string }[];
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <select className={selectClassName} onChange={(event) => onChange(event.target.value)} value={value}>
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
      <label className="text-sm font-medium">{label}</label>
      <Input onChange={(event) => onChange(event.target.value)} type="date" value={value} />
    </div>
  );
}
