import { useDeferredValue, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle, PencilLine, RefreshCw, Search, Truck } from "lucide-react";
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
  createSupplier,
  deactivateSupplier,
  listSuppliers,
  updateSupplier,
  type Supplier
} from "@/lib/api";
import { applyZodErrors, readFormCheckbox, readFormString } from "@/lib/form-helpers";
import { queryClient } from "@/lib/query-client";

const supplierFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do fornecedor."),
  tradeName: z.string().trim().max(120, "Nome fantasia muito longo.").optional(),
  cnpj: z.string().trim().max(32, "CNPJ muito longo.").optional(),
  stateRegistration: z
    .string()
    .trim()
    .max(32, "Inscricao estadual muito longa.")
    .optional(),
  email: z.union([z.string().trim().email("Informe um e-mail valido."), z.literal("")]),
  phone: z.string().trim().max(32, "Telefone muito longo.").optional(),
  contactName: z.string().trim().max(120, "Contato muito longo.").optional(),
  zipCode: z.string().trim().max(16, "CEP muito longo.").optional(),
  address: z.string().trim().max(255, "Endereco muito longo.").optional(),
  city: z.string().trim().max(120, "Cidade muito longa.").optional(),
  state: z.string().trim().max(8, "UF muito longa.").optional(),
  notes: z.string().trim().optional(),
  active: z.boolean().default(true)
});

type SuppliersPanelProps = {
  token?: string;
};

type SupplierFormValues = z.infer<typeof supplierFormSchema>;
type ActiveFilter = "active" | "inactive" | "all";

const emptySupplierForm: SupplierFormValues = {
  name: "",
  tradeName: "",
  cnpj: "",
  stateRegistration: "",
  email: "",
  phone: "",
  contactName: "",
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

export function SuppliersPanel({ token }: SuppliersPanelProps) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formFeedback, setFormFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: emptySupplierForm
  });

  useEffect(() => {
    form.reset(editingSupplier ? toSupplierFormValues(editingSupplier) : emptySupplierForm);
    setFormFeedback(null);
  }, [editingSupplier, form]);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", deferredSearch, activeFilter],
    queryFn: () =>
      listSuppliers(token, {
        search: deferredSearch.trim() || undefined,
        active:
          activeFilter === "all" ? undefined : activeFilter === "active"
      })
  });

  const saveMutation = useMutation({
    mutationFn: async (values: SupplierFormValues) => {
      const payload = toSupplierPayload(values);

      if (editingSupplier) {
        return updateSupplier(token, editingSupplier.id, payload);
      }

      return createSupplier(token, payload);
    },
    onSuccess: async () => {
      setFormFeedback({
        tone: "success",
        text: editingSupplier
          ? "Fornecedor atualizado com sucesso."
          : "Fornecedor cadastrado com sucesso."
      });
      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
      setEditingSupplier(null);
      form.reset(emptySupplierForm);
    },
    onError: (error: Error) => {
      setFormFeedback({ tone: "error", text: error.message });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (supplier: Supplier) => {
      if (supplier.active) {
        return deactivateSupplier(token, supplier.id);
      }

      return updateSupplier(token, supplier.id, { active: true });
    },
    onSuccess: async (_, supplier) => {
      if (editingSupplier?.id === supplier.id) {
        setEditingSupplier(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["suppliers"] });
    }
  });

  const suppliers = suppliersQuery.data ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Fornecedores</CardTitle>
          <CardDescription>
            Base administrativa para compras, estoque e relacionamento comercial.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <div className="space-y-2">
              <Label htmlFor="supplier-search">Busca</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  id="supplier-search"
                  onChange={(event) => {
                    setSearch(event.target.value);
                  }}
                  placeholder="Nome, fantasia, CNPJ ou IE"
                  value={search}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-active-filter">Status</Label>
              <select
                className={selectClassName}
                id="supplier-active-filter"
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

            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => {
                  void suppliersQuery.refetch();
                }}
                type="button"
                variant="outline"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>

          {suppliersQuery.isLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Carregando fornecedores...
            </div>
          ) : null}

          {suppliersQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(suppliersQuery.error)}
            </div>
          ) : null}

          {!suppliersQuery.isLoading && !suppliers.length ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
              Nenhum fornecedor encontrado com os filtros atuais.
            </div>
          ) : null}

          <div className="space-y-3">
            {suppliers.map((supplier) => (
              <div
                key={supplier.id}
                className="rounded-[1.5rem] border border-border/80 bg-card/90 p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{supplier.name}</p>
                      <span
                        className={cnBadge(
                          supplier.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {supplier.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {supplier.tradeName || "Sem nome fantasia"}
                      {supplier.cnpj ? ` • ${supplier.cnpj}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {supplier.contactName || "Contato nao informado"}
                      {supplier.phone ? ` • ${supplier.phone}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        setEditingSupplier(supplier);
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
                        const action = supplier.active ? "inativar" : "reativar";
                        const confirmed = window.confirm(
                          `Deseja ${action} o fornecedor ${supplier.name}?`
                        );

                        if (confirmed) {
                          toggleActiveMutation.mutate(supplier);
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {supplier.active ? "Inativar" : "Reativar"}
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
          <CardTitle>
            {editingSupplier ? "Editar fornecedor" : "Novo fornecedor"}
          </CardTitle>
          <CardDescription>
            {editingSupplier
              ? "Ajuste os dados do fornecedor selecionado."
              : "Cadastre um fornecedor para abastecimento e compras."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFormFeedback(null);
              const parsed = supplierFormSchema.safeParse(
                readSupplierFormValues(event.currentTarget)
              );

              if (!parsed.success) {
                applyZodErrors(form, parsed.error);
                setFormFeedback({
                  tone: "error",
                  text: "Revise os campos destacados antes de salvar o fornecedor."
                });
                return;
              }

              form.clearErrors();
              saveMutation.mutate(parsed.data);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="supplier-name">Razao social</Label>
              <Input id="supplier-name" {...form.register("name")} />
              <FieldError message={form.formState.errors.name?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-tradename">Nome fantasia</Label>
              <Input id="supplier-tradename" {...form.register("tradeName")} />
              <FieldError message={form.formState.errors.tradeName?.message} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="supplier-cnpj">CNPJ</Label>
                <Input id="supplier-cnpj" {...form.register("cnpj")} />
                <FieldError message={form.formState.errors.cnpj?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-ie">Inscricao estadual</Label>
                <Input id="supplier-ie" {...form.register("stateRegistration")} />
                <FieldError message={form.formState.errors.stateRegistration?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="supplier-contact">Contato</Label>
                <Input id="supplier-contact" {...form.register("contactName")} />
                <FieldError message={form.formState.errors.contactName?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-phone">Telefone</Label>
                <Input id="supplier-phone" {...form.register("phone")} />
                <FieldError message={form.formState.errors.phone?.message} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-email">E-mail</Label>
              <Input id="supplier-email" type="email" {...form.register("email")} />
              <FieldError message={form.formState.errors.email?.message} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="supplier-city">Cidade</Label>
                <Input id="supplier-city" {...form.register("city")} />
                <FieldError message={form.formState.errors.city?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier-state">UF</Label>
                <Input id="supplier-state" {...form.register("state")} />
                <FieldError message={form.formState.errors.state?.message} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-address">Endereco</Label>
              <Input id="supplier-address" {...form.register("address")} />
              <FieldError message={form.formState.errors.address?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-zipcode">CEP</Label>
              <Input id="supplier-zipcode" {...form.register("zipCode")} />
              <FieldError message={form.formState.errors.zipCode?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplier-notes">Observacoes</Label>
              <textarea
                className={textareaClassName}
                id="supplier-notes"
                {...form.register("notes")}
              />
              <FieldError message={form.formState.errors.notes?.message} />
            </div>

            {editingSupplier ? (
              <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
                <input className="h-4 w-4" type="checkbox" {...form.register("active")} />
                Manter fornecedor ativo
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
                    <Truck className="mr-2 h-4 w-4" />
                    {editingSupplier ? "Salvar alteracoes" : "Cadastrar fornecedor"}
                  </>
                )}
              </Button>

              {editingSupplier ? (
                <Button
                  onClick={() => {
                    setEditingSupplier(null);
                    form.reset(emptySupplierForm);
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

function toSupplierFormValues(supplier: Supplier): SupplierFormValues {
  return {
    name: supplier.name,
    tradeName: supplier.tradeName ?? "",
    cnpj: supplier.cnpj ?? "",
    stateRegistration: supplier.stateRegistration ?? "",
    email: supplier.email ?? "",
    phone: supplier.phone ?? "",
    contactName: supplier.contactName ?? "",
    zipCode: supplier.zipCode ?? "",
    address: supplier.address ?? "",
    city: supplier.city ?? "",
    state: supplier.state ?? "",
    notes: supplier.notes ?? "",
    active: supplier.active
  };
}

function toSupplierPayload(values: SupplierFormValues) {
  return {
    name: values.name.trim(),
    tradeName: emptyToUndefined(values.tradeName),
    cnpj: emptyToUndefined(values.cnpj),
    stateRegistration: emptyToUndefined(values.stateRegistration),
    email: emptyToUndefined(values.email),
    phone: emptyToUndefined(values.phone),
    contactName: emptyToUndefined(values.contactName),
    zipCode: emptyToUndefined(values.zipCode),
    address: emptyToUndefined(values.address),
    city: emptyToUndefined(values.city),
    state: emptyToUndefined(values.state),
    notes: emptyToUndefined(values.notes),
    active: values.active
  };
}

function readSupplierFormValues(formElement: HTMLFormElement): SupplierFormValues {
  const formData = new FormData(formElement);

  return {
    name: readFormString(formData, "name"),
    tradeName: readFormString(formData, "tradeName"),
    cnpj: readFormString(formData, "cnpj"),
    stateRegistration: readFormString(formData, "stateRegistration"),
    email: readFormString(formData, "email"),
    phone: readFormString(formData, "phone"),
    contactName: readFormString(formData, "contactName"),
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
