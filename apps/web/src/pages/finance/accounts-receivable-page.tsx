import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle, Pencil, Plus, RefreshCw, Search, WalletCards } from "lucide-react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createAccountsReceivable,
  getServiceOrder,
  listAccountsReceivable,
  listCustomers,
  receiveAccountsReceivable,
  updateAccountsReceivable,
  type AccountsReceivableEntry,
  type PaymentMethodName
} from "@/lib/api";
import { centsToInputValue, formatCurrency } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import {
  FeedbackBanner,
  FinancialStatusBadge,
  formatPaymentMethod,
  SummaryCard,
  selectClassName
} from "./finance-shared";

const accountFormSchema = z.object({
  customerId: z.string().trim().optional(),
  serviceOrderId: z.string().trim().optional(),
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

export function AccountsReceivablePage() {
  const [searchParams] = useSearchParams();
  const serviceOrderIdParam = searchParams.get("serviceOrderId") ?? "";
  const { authEnabled, hasPermission, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState<"" | "PENDING" | "RECEIVED" | "OVERDUE" | "CANCELED">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editingEntry, setEditingEntry] = useState<AccountsReceivableEntry | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [receivingEntry, setReceivingEntry] = useState<AccountsReceivableEntry | null>(null);
  const [receiveMethod, setReceiveMethod] = useState<PaymentMethodName>("CASH");
  const [receiveNotes, setReceiveNotes] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues: {
      customerId: "",
      serviceOrderId: "",
      description: "",
      amount: "0.00",
      dueDate: "",
      paymentMethod: "",
      notes: ""
    }
  });

  const customersQuery = useQuery({
    queryKey: ["customers", "accounts-receivable-filter"],
    queryFn: () => listCustomers(token, { active: true })
  });
  const linkedServiceOrderQuery = useQuery({
    queryKey: ["service-orders", "accounts-receivable-prefill", serviceOrderIdParam],
    queryFn: () => getServiceOrder(token, serviceOrderIdParam),
    enabled: Boolean(serviceOrderIdParam)
  });

  const accountsQuery = useQuery({
    queryKey: ["accounts-receivable", search, customerId, status, startDate, endDate],
    queryFn: () =>
      listAccountsReceivable(token, {
        search: search.trim() || undefined,
        customerId: customerId || undefined,
        status: status || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 150
      })
  });

  useEffect(() => {
    if (!editingEntry) {
      form.reset({
        customerId: "",
        serviceOrderId: "",
        description: "",
        amount: "0.00",
        dueDate: "",
        paymentMethod: "",
        notes: ""
      });
      return;
    }

    form.reset({
      customerId: editingEntry.customer?.id ?? "",
      serviceOrderId: editingEntry.serviceOrder?.id ?? "",
      description: editingEntry.description,
      amount: centsToInputValue(editingEntry.amount),
      dueDate: editingEntry.dueDate.slice(0, 10),
      paymentMethod: editingEntry.paymentMethod ?? "",
      notes: editingEntry.notes ?? ""
    });
  }, [editingEntry, form]);

  useEffect(() => {
    if (!serviceOrderIdParam || editingEntry || !linkedServiceOrderQuery.data) {
      return;
    }

    const serviceOrder = linkedServiceOrderQuery.data;
    setShowForm(true);
    form.reset({
      customerId: serviceOrder.customer.id,
      serviceOrderId: serviceOrder.id,
      description: `OS ${serviceOrder.orderNumber}`,
      amount: centsToInputValue(serviceOrder.totalFinal ?? serviceOrder.totalEstimated),
      dueDate: new Date().toISOString().slice(0, 10),
      paymentMethod: "",
      notes: serviceOrder.reportedIssue
    });
  }, [editingEntry, form, linkedServiceOrderQuery.data, serviceOrderIdParam]);

  const saveMutation = useMutation({
    mutationFn: async (values: AccountFormValues) => {
      const payload = {
        customerId: values.customerId || undefined,
        serviceOrderId: values.serviceOrderId || undefined,
        description: values.description,
        amount: Math.round(Number(values.amount.replace(",", ".")) * 100),
        dueDate: values.dueDate,
        paymentMethod: (values.paymentMethod || undefined) as PaymentMethodName | undefined,
        notes: values.notes || undefined
      };

      if (editingEntry) {
        return updateAccountsReceivable(token, editingEntry.id, payload);
      }

      return createAccountsReceivable(token, payload);
    },
    onSuccess: async () => {
      setFeedback({
        tone: "success",
        text: editingEntry ? "Conta a receber atualizada." : "Conta a receber criada."
      });
      setEditingEntry(null);
      setShowForm(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] })
      ]);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!receivingEntry) {
        throw new Error("Selecione a conta a receber.");
      }

      return receiveAccountsReceivable(token, receivingEntry.id, {
        paymentMethod: receiveMethod,
        notes: receiveNotes || undefined
      });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Recebimento registrado com sucesso." });
      setReceivingEntry(null);
      setReceiveMethod("CASH");
      setReceiveNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] }),
        queryClient.invalidateQueries({ queryKey: ["cash"] })
      ]);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });

  const cancelMutation = useMutation({
    mutationFn: (entry: AccountsReceivableEntry) =>
      updateAccountsReceivable(token, entry.id, { status: "CANCELED" }),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Conta cancelada." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] }),
        queryClient.invalidateQueries({ queryKey: ["financial-summary"] })
      ]);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });

  const entries = accountsQuery.data ?? [];
  const pendingTotal = useMemo(
    () =>
      entries
        .filter((entry) => entry.status === "PENDING" || entry.status === "OVERDUE")
        .reduce((sum, entry) => sum + entry.amount, 0),
    [entries]
  );
  const receivedTotal = useMemo(
    () =>
      entries.filter((entry) => entry.status === "RECEIVED").reduce((sum, entry) => sum + entry.amount, 0),
    [entries]
  );
  const overdueCount = entries.filter((entry) => entry.status === "OVERDUE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Financeiro"
        title="Contas a receber"
        description="Controle de crediario, recebimentos manuais e pendencias financeiras da loja e da assistencia tecnica."
        actions={
          hasPermission("accounts-receivable.create") ? (
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

      {linkedServiceOrderQuery.data && !editingEntry ? (
        <Card className="border-sky-200 bg-sky-50">
          <CardContent className="flex flex-col gap-3 p-4 text-sm text-sky-900 lg:flex-row lg:items-center lg:justify-between">
            <div>
              Conta a receber pre-preenchida a partir da OS {linkedServiceOrderQuery.data.orderNumber}.
            </div>
            <Button asChild type="button" variant="outline">
              <Link to={`/service-orders/${linkedServiceOrderQuery.data.id}`}>Abrir OS</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard helper="Pendentes e atrasadas" label="Em aberto" value={formatCurrency(pendingTotal)} />
        <SummaryCard helper="Recebimentos ja baixados" label="Recebidas" value={formatCurrency(receivedTotal)} />
        <SummaryCard helper="Titulos em atraso" label="Atrasadas" value={String(overdueCount)} />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_180px_180px_180px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="accounts-receivable-search">Busca</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-10" id="accounts-receivable-search" onChange={(event) => setSearch(event.target.value)} placeholder="Descricao ou cliente" value={search} />
            </div>
          </div>
          <SelectField label="Cliente" onChange={setCustomerId} options={[{ label: "Todos", value: "" }, ...(customersQuery.data ?? []).map((customer) => ({ label: customer.name, value: customer.id }))]} value={customerId} />
          <SelectField label="Status" onChange={(value) => setStatus(value as typeof status)} options={[{ label: "Todos", value: "" }, { label: "Pendente", value: "PENDING" }, { label: "Atrasado", value: "OVERDUE" }, { label: "Recebido", value: "RECEIVED" }, { label: "Cancelado", value: "CANCELED" }]} value={status} />
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
              {editingEntry ? "Editar conta a receber" : "Nova conta a receber"}
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
                  id="accounts-receivable-customer"
                  label="Cliente"
                  options={[
                    { label: "Sem cliente", value: "" },
                    ...(customersQuery.data ?? []).map((customer) => ({
                      label: customer.name,
                      value: customer.id
                    }))
                  ]}
                  registration={form.register("customerId")}
                />
                {form.watch("serviceOrderId") ? (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">OS vinculada</label>
                    <div className="rounded-xl border border-border/70 bg-secondary/30 px-3 py-2 text-sm">
                      {linkedServiceOrderQuery.data?.orderNumber ??
                        editingEntry?.serviceOrder?.id ??
                        form.watch("serviceOrderId")}
                    </div>
                  </div>
                ) : null}
                <Field id="accounts-receivable-due-date" label="Vencimento" registration={form.register("dueDate")} type="date" />
                <Field id="accounts-receivable-description" label="Descricao" registration={form.register("description")} type="text" />
                <Field id="accounts-receivable-amount" label="Valor (R$)" registration={form.register("amount")} type="number" />
                <SelectInput
                  id="accounts-receivable-method"
                  label="Forma de recebimento"
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
                <label className="text-sm font-medium" htmlFor="accounts-receivable-notes">
                  Observacoes
                </label>
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  id="accounts-receivable-notes"
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
                <Button disabled={saveMutation.isPending} type="submit">
                  {saveMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Salvar conta
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      {receivingEntry ? (
        <Card className="border-sky-200 bg-sky-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-sky-900">
              <WalletCards className="h-5 w-5" />
              Registrar recebimento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-sky-800">
              {receivingEntry.description} • {formatCurrency(receivingEntry.amount)}
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <SelectField
                label="Forma de recebimento"
                onChange={(value) => setReceiveMethod(value as PaymentMethodName)}
                options={paymentOptions.map((option) => ({ label: option.label, value: option.value }))}
                value={receiveMethod}
              />
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="accounts-receivable-receive-notes">
                  Observacoes
                </label>
                <Input id="accounts-receivable-receive-notes" onChange={(event) => setReceiveNotes(event.target.value)} value={receiveNotes} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button onClick={() => setReceivingEntry(null)} type="button" variant="outline">
                Cancelar
              </Button>
              <Button disabled={receiveMutation.isPending} onClick={() => receiveMutation.mutate()} type="button">
                {receiveMutation.isPending ? <LoaderCircle className="mr-2 h-4 w-4 animate-spin" /> : null}
                Confirmar recebimento
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-white/90">
        <CardContent className="p-0">
          {accountsQuery.isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando contas a receber...</div> : null}
          {accountsQuery.error ? <div className="p-6 text-sm text-red-700">{(accountsQuery.error as Error).message}</div> : null}
          {entries.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Descricao</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Vencimento</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Recebimento</th>
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
                          {entry.serviceOrder ? (
                            <p className="text-xs text-muted-foreground">
                              OS vinculada • {entry.serviceOrder.deviceType}
                            </p>
                          ) : null}
                          {entry.sale ? (
                            <p className="text-xs text-muted-foreground">
                              Venda vinculada • {entry.sale.saleNumber}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{entry.customer?.name || "Sem cliente"}</td>
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
                            disabled={!hasPermission("accounts-receivable.update")}
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
                            disabled={entry.status === "RECEIVED" || entry.status === "CANCELED" || !hasPermission("accounts-receivable.receive")}
                            onClick={() => {
                              setReceivingEntry(entry);
                              setReceiveMethod(entry.paymentMethod ?? "CASH");
                              setReceiveNotes("");
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Receber
                          </Button>
                          <Button
                            disabled={entry.status === "RECEIVED" || entry.status === "CANCELED" || cancelMutation.isPending || !hasPermission("accounts-receivable.update")}
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
            <div className="p-6 text-sm text-muted-foreground">Nenhuma conta a receber encontrada com os filtros atuais.</div>
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
