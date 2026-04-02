import { useDeferredValue, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle, PencilLine, RefreshCw, Search, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCustomer,
  deactivateCustomer,
  listCustomers,
  updateCustomer,
  type Customer
} from "@/lib/api";
import { applyZodErrors, readFormCheckbox, readFormString } from "@/lib/form-helpers";
import { queryClient } from "@/lib/query-client";

const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cliente."),
  cpfCnpj: z.string().trim().max(32, "CPF/CNPJ muito longo.").optional(),
  email: z.union([z.string().trim().email("Informe um e-mail valido."), z.literal("")]),
  phone: z
    .string()
    .trim()
    .min(8, "Informe um telefone com pelo menos 8 caracteres.")
    .max(32, "Telefone muito longo."),
  phone2: z.string().trim().max(32, "Telefone secundario muito longo.").optional(),
  zipCode: z.string().trim().max(16, "CEP muito longo.").optional(),
  address: z.string().trim().max(255, "Endereco muito longo.").optional(),
  city: z.string().trim().max(120, "Cidade muito longa.").optional(),
  state: z.string().trim().max(8, "UF muito longa.").optional(),
  notes: z.string().trim().optional(),
  active: z.boolean().default(true)
});

type CustomersPanelProps = {
  token?: string;
};

type CustomerFormValues = z.infer<typeof customerFormSchema>;
type ActiveFilter = "active" | "inactive" | "all";

const emptyCustomerForm: CustomerFormValues = {
  name: "",
  cpfCnpj: "",
  email: "",
  phone: "",
  phone2: "",
  zipCode: "",
  address: "",
  city: "",
  state: "",
  notes: "",
  active: true
};

const textareaClassName =
  "min-h-[120px] w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function CustomersPanel({ token }: CustomersPanelProps) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formFeedback, setFormFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search);

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: emptyCustomerForm
  });

  useEffect(() => {
    form.reset(editingCustomer ? toCustomerFormValues(editingCustomer) : emptyCustomerForm);
    setFormFeedback(null);
  }, [editingCustomer, form]);

  const customersQuery = useQuery({
    queryKey: ["customers", deferredSearch, activeFilter],
    queryFn: () =>
      listCustomers(token, {
        search: deferredSearch.trim() || undefined,
        active:
          activeFilter === "all" ? undefined : activeFilter === "active"
      })
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CustomerFormValues) => {
      const payload = toCustomerPayload(values);

      if (editingCustomer) {
        return updateCustomer(token, editingCustomer.id, payload);
      }

      return createCustomer(token, payload);
    },
    onSuccess: async () => {
      setFormFeedback({
        tone: "success",
        text: editingCustomer
          ? "Cliente atualizado com sucesso."
          : "Cliente cadastrado com sucesso. Se ele nao aparecer na lista, confira busca e filtro de status."
      });
      if (!editingCustomer) {
        setSearch("");
        setActiveFilter("active");
      }
      await queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditingCustomer(null);
      form.reset(emptyCustomerForm);
    },
    onError: (error: Error) => {
      setFormFeedback({ tone: "error", text: error.message });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      if (customer.active) {
        return deactivateCustomer(token, customer.id);
      }

      return updateCustomer(token, customer.id, { active: true });
    },
    onSuccess: async (_, customer) => {
      if (editingCustomer?.id === customer.id) {
        setEditingCustomer(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["customers"] });
    }
  });

  const customers = customersQuery.data ?? [];
  const inactiveCount = customers.filter((customer) => !customer.active).length;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Base de clientes</CardTitle>
          <CardDescription>
            Consulte, filtre, edite e inative clientes sem sair do painel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <div className="space-y-2">
              <Label htmlFor="customer-search">Busca</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="customer-search"
                  className="pl-10"
                  onChange={(event) => {
                    setSearch(event.target.value);
                  }}
                  placeholder="Nome, documento, e-mail ou telefone"
                  value={search}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-active-filter">Status</Label>
              <select
                className={selectClassName}
                id="customer-active-filter"
                onChange={(event) => {
                  setActiveFilter(event.target.value as ActiveFilter);
                }}
                value={activeFilter}
              >
                <option value="active">Somente ativos</option>
                <option value="inactive">Somente inativos</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <div className="flex items-end gap-2">
              <Button
                className="flex-1"
                onClick={() => {
                  void customersQuery.refetch();
                }}
                type="button"
                variant="outline"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
              <p className="text-sm text-muted-foreground">Registros visiveis</p>
              <p className="mt-2 text-3xl font-black">{customers.length}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
              <p className="text-sm text-muted-foreground">Inativos nesta busca</p>
              <p className="mt-2 text-3xl font-black">{inactiveCount}</p>
            </div>
          </div>

          {customersQuery.isLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Carregando clientes...
            </div>
          ) : null}

          {customersQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(customersQuery.error)}
            </div>
          ) : null}

          {!customersQuery.isLoading && !customers.length ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
              Nenhum cliente encontrado com os filtros atuais.
            </div>
          ) : null}

          <div className="space-y-3">
            {customers.map((customer) => (
              <div
                key={customer.id}
                className="rounded-[1.5rem] border border-border/80 bg-card/90 p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{customer.name}</p>
                      <span
                        className={cnBadge(
                          customer.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {customer.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {customer.phone}
                      {customer.email ? ` • ${customer.email}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {customer.city || "Cidade nao informada"}
                      {customer.state ? ` / ${customer.state}` : ""}
                      {customer.cpfCnpj ? ` • ${customer.cpfCnpj}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        setEditingCustomer(customer);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <PencilLine className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      disabled={toggleActiveMutation.isPending}
                      onClick={() => {
                        const action = customer.active ? "inativar" : "reativar";
                        const confirmed = window.confirm(
                          `Deseja ${action} o cliente ${customer.name}?`
                        );

                        if (confirmed) {
                          toggleActiveMutation.mutate(customer);
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {customer.active ? "Inativar" : "Reativar"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>{editingCustomer ? "Editar cliente" : "Novo cliente"}</CardTitle>
          <CardDescription>
            {editingCustomer
              ? "Ajuste os dados do cliente selecionado."
              : "Cadastre um cliente para as proximas rotinas de venda."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFormFeedback(null);
              const parsed = customerFormSchema.safeParse(
                readCustomerFormValues(event.currentTarget)
              );

              if (!parsed.success) {
                applyZodErrors(form, parsed.error);
                setFormFeedback({
                  tone: "error",
                  text:
                    "Nao foi possivel salvar o cliente. Preencha nome e telefone, e informe um e-mail valido se quiser usar esse campo."
                });
                return;
              }

              form.clearErrors();
              saveMutation.mutate(parsed.data);
            }}
          >
            <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
              Para cadastrar um cliente, os campos obrigatorios sao <strong>Nome</strong> e <strong>Telefone</strong>.
              Se informar <strong>E-mail</strong>, ele precisa estar em formato valido.
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-name">Nome</Label>
              <Input id="customer-name" {...form.register("name")} />
              <FieldError message={form.formState.errors.name?.message} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-phone">Telefone</Label>
                <Input id="customer-phone" {...form.register("phone")} />
                <FieldError message={form.formState.errors.phone?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-phone2">Telefone 2</Label>
                <Input id="customer-phone2" {...form.register("phone2")} />
                <FieldError message={form.formState.errors.phone2?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-email">E-mail</Label>
                <Input id="customer-email" type="email" {...form.register("email")} />
                <FieldError message={form.formState.errors.email?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-cpfcnpj">CPF/CNPJ</Label>
                <Input id="customer-cpfcnpj" {...form.register("cpfCnpj")} />
                <FieldError message={form.formState.errors.cpfCnpj?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="customer-city">Cidade</Label>
                <Input id="customer-city" {...form.register("city")} />
                <FieldError message={form.formState.errors.city?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="customer-state">UF</Label>
                <Input id="customer-state" {...form.register("state")} />
                <FieldError message={form.formState.errors.state?.message} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-address">Endereco</Label>
              <Input id="customer-address" {...form.register("address")} />
              <FieldError message={form.formState.errors.address?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-zipcode">CEP</Label>
              <Input id="customer-zipcode" {...form.register("zipCode")} />
              <FieldError message={form.formState.errors.zipCode?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="customer-notes">Observacoes</Label>
              <textarea
                className={textareaClassName}
                id="customer-notes"
                {...form.register("notes")}
              />
              <FieldError message={form.formState.errors.notes?.message} />
            </div>

            {editingCustomer ? (
              <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
                <input className="h-4 w-4" type="checkbox" {...form.register("active")} />
                Manter cliente ativo
              </label>
            ) : null}

            {formFeedback ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  formFeedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {formFeedback.text}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <UserPlus className="mr-2 h-4 w-4" />
                    {editingCustomer ? "Salvar alteracoes" : "Cadastrar cliente"}
                  </>
                )}
              </Button>

              {editingCustomer ? (
                <Button
                  onClick={() => {
                    setEditingCustomer(null);
                    form.reset(emptyCustomerForm);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancelar
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function toCustomerFormValues(customer: Customer): CustomerFormValues {
  return {
    name: customer.name,
    cpfCnpj: customer.cpfCnpj ?? "",
    email: customer.email ?? "",
    phone: customer.phone,
    phone2: customer.phone2 ?? "",
    zipCode: customer.zipCode ?? "",
    address: customer.address ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    notes: customer.notes ?? "",
    active: customer.active
  };
}

function toCustomerPayload(values: CustomerFormValues) {
  return {
    name: values.name.trim(),
    cpfCnpj: emptyToUndefined(values.cpfCnpj),
    email: emptyToUndefined(values.email),
    phone: values.phone.trim(),
    phone2: emptyToUndefined(values.phone2),
    zipCode: emptyToUndefined(values.zipCode),
    address: emptyToUndefined(values.address),
    city: emptyToUndefined(values.city),
    state: emptyToUndefined(values.state),
    notes: emptyToUndefined(values.notes),
    active: values.active
  };
}

function readCustomerFormValues(formElement: HTMLFormElement): CustomerFormValues {
  const formData = new FormData(formElement);

  return {
    name: readFormString(formData, "name"),
    cpfCnpj: readFormString(formData, "cpfCnpj"),
    email: readFormString(formData, "email"),
    phone: readFormString(formData, "phone"),
    phone2: readFormString(formData, "phone2"),
    zipCode: readFormString(formData, "zipCode"),
    address: readFormString(formData, "address"),
    city: readFormString(formData, "city"),
    state: readFormString(formData, "state"),
    notes: readFormString(formData, "notes"),
    active: readFormCheckbox(formData, "active")
  };
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nao foi possivel concluir a operacao.";
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-red-600">{message}</p> : null;
}

function cnBadge(className: string) {
  return `inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`;
}
