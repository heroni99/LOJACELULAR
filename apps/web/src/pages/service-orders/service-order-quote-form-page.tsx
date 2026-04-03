import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Search, Trash2 } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { DetailCard } from "@/components/ui/detail-card";
import { FormPage } from "@/components/ui/form-page";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createServiceOrderQuote,
  getServiceOrder,
  listProducts,
  listServiceOrderQuotes,
  updateServiceOrderQuote,
  type Product
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import {
  formatCurrency,
  formatCurrencyInput,
  formatCurrencyInputFromDigits,
  parseCurrencyToCents
} from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { success } from "@/lib/toast";
import {
  AdvancedFeedback,
  advancedSelectClassName,
  advancedTextareaClassName
} from "@/pages/advanced/advanced-shared";

const quoteItemSchema = z
  .object({
    itemType: z.enum(["PART", "SERVICE", "MANUAL_ITEM"]),
    productId: z.string().optional(),
    productLabel: z.string().optional(),
    description: z.string().trim().min(1, "Informe a descricao do item."),
    quantity: z
      .string()
      .trim()
      .refine(
        (value) => Number.isInteger(Number(value)) && Number(value) > 0,
        "Informe uma quantidade inteira maior que zero."
      ),
    unitPrice: z.string().trim().min(1, "Informe o valor unitario.")
  })
  .superRefine((item, context) => {
    if (item.itemType === "PART" && !item.productId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Selecione a peca vinculada.",
        path: ["productLabel"]
      });
    }
  });

const quoteFormSchema = z.object({
  notes: z.string().trim().optional(),
  items: z.array(quoteItemSchema).min(1, "Adicione pelo menos um item ao orcamento.")
});

type QuoteFormValues = z.infer<typeof quoteFormSchema>;

const defaultValues: QuoteFormValues = {
  notes: "",
  items: [
    {
      itemType: "SERVICE",
      productId: "",
      productLabel: "",
      description: "",
      quantity: "1",
      unitPrice: formatCurrencyInput(0)
    }
  ]
};

export function ServiceOrderQuoteFormPage() {
  const { id = "", quoteId } = useParams();
  const navigate = useNavigate();
  const { session } = useAppSession();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(
    null
  );

  const isEditing = Boolean(quoteId);
  const backHref = `/service-orders/${id}?tab=quote`;

  const orderQuery = useQuery({
    queryKey: ["service-orders", id],
    queryFn: () => getServiceOrder(session.accessToken, id),
    enabled: Boolean(id)
  });
  const quotesQuery = useQuery({
    queryKey: ["service-orders", id, "quotes"],
    queryFn: () => listServiceOrderQuotes(session.accessToken, id),
    enabled: Boolean(id && isEditing)
  });

  const quote = useMemo(
    () => quotesQuery.data?.find((entry) => entry.id === quoteId) ?? null,
    [quoteId, quotesQuery.data]
  );

  const form = useForm<QuoteFormValues>({
    resolver: zodResolver(quoteFormSchema),
    defaultValues
  });
  const fieldArray = useFieldArray({
    control: form.control,
    name: "items"
  });
  const watchItems = form.watch("items");

  useEffect(() => {
    if (!quote) {
      if (!isEditing) {
        form.reset(defaultValues);
      }
      return;
    }

    form.reset({
      notes: quote.notes ?? "",
      items: quote.items.length
        ? quote.items.map((item) => ({
            itemType: item.itemType,
            productId: item.productId ?? "",
            productLabel: item.product
              ? `${item.product.internalCode} • ${item.product.name}`
              : "",
            description: item.description,
            quantity: String(item.quantity),
            unitPrice: formatCurrencyInput(item.unitPrice)
          }))
        : defaultValues.items
    });
  }, [form, isEditing, quote]);

  const quoteTotal = useMemo(
    () =>
      watchItems.reduce(
        (total, item) =>
          total +
          Number(item.quantity || 0) * parseCurrencyToCents(item.unitPrice || "0"),
        0
      ),
    [watchItems]
  );

  const saveMutation = useMutation({
    mutationFn: async (values: QuoteFormValues) => {
      const payload = {
        notes: values.notes?.trim() ?? "",
        items: values.items.map((item) => ({
          itemType: item.itemType,
          productId: item.productId || undefined,
          description: item.description.trim(),
          quantity: Number(item.quantity),
          unitPrice: parseCurrencyToCents(item.unitPrice)
        }))
      };

      if (isEditing && quoteId) {
        return updateServiceOrderQuote(session.accessToken, id, quoteId, payload);
      }

      return createServiceOrderQuote(session.accessToken, id, payload);
    },
    onSuccess: async () => {
      success(isEditing ? "Orcamento atualizado" : "Orcamento criado", {
        description: "O fluxo de aprovacao da OS foi atualizado.",
        href: backHref
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id, "quotes"] })
      ]);

      navigate(backHref);
    },
    onError: (error: Error) => {
      setFeedback({ tone: "error", text: parseApiError(error) });
    }
  });

  const loading = orderQuery.isLoading || (isEditing && quotesQuery.isLoading);
  const order = orderQuery.data;

  let errorMessage: string | null = null;
  if (orderQuery.error) {
    errorMessage = parseApiError(orderQuery.error);
  } else if (quotesQuery.error) {
    errorMessage = parseApiError(quotesQuery.error);
  } else if (isEditing && !quote && !quotesQuery.isLoading) {
    errorMessage = "Orcamento nao encontrado para esta OS.";
  } else if (quote && quote.status !== "PENDING") {
    errorMessage = "Somente orcamentos pendentes podem ser editados.";
  }

  return (
    <FormPage
      backHref={backHref}
      backLabel="Voltar para OS"
      cancelHref={backHref}
      errorMessage={errorMessage}
      formId="service-order-quote-form"
      loading={loading}
      loadingMessage="Carregando dados do orcamento..."
      onSubmit={form.handleSubmit((values) => {
        setFeedback(null);
        saveMutation.mutate(values);
      })}
      saveDisabled={Boolean(errorMessage)}
      saveLabel={isEditing ? "Salvar orcamento" : "Criar orcamento"}
      saving={saveMutation.isPending}
      subtitle={
        order
          ? `${order.orderNumber} • ${order.customer.name} • ${order.deviceType} ${order.brand} ${order.model}`
          : "Monte o orcamento comercial antes da aprovacao da OS."
      }
      title={isEditing ? "Editar orcamento" : "Novo orcamento"}
    >
      <AdvancedFeedback feedback={feedback} />

      <DetailCard title="Itens do orcamento">
        <FormSection columns={1} title="Itens">
          <div className="space-y-4">
            {fieldArray.fields.map((field, index) => {
              const item = watchItems[index];
              const itemTotal =
                Number(item?.quantity || 0) *
                parseCurrencyToCents(item?.unitPrice || "0");

              return (
                <div
                  className="rounded-[var(--radius-card)] border p-4"
                  key={field.id}
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">Item {index + 1}</p>
                      <p
                        className="text-xs"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        Total da linha: {formatCurrency(itemTotal)}
                      </p>
                    </div>

                    <Button
                      disabled={fieldArray.fields.length === 1}
                      onClick={() => fieldArray.remove(index)}
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <SelectField
                      label="Tipo"
                      onChange={(value) => {
                        form.setValue(
                          `items.${index}.itemType`,
                          value as QuoteFormValues["items"][number]["itemType"],
                          {
                            shouldValidate: true
                          }
                        );

                        if (value !== "PART") {
                          form.setValue(`items.${index}.productId`, "");
                          form.setValue(`items.${index}.productLabel`, "");
                        }
                      }}
                      options={[
                        { label: "Peca", value: "PART" },
                        { label: "Servico", value: "SERVICE" },
                        { label: "Item manual", value: "MANUAL_ITEM" }
                      ]}
                      value={item?.itemType ?? "SERVICE"}
                    />
                    <TextField
                      label="Quantidade"
                      onChange={(value) =>
                        form.setValue(`items.${index}.quantity`, value.replace(/\D/g, ""), {
                          shouldValidate: true
                        })
                      }
                      type="text"
                      value={item?.quantity ?? ""}
                    />
                    {item?.itemType === "PART" ? (
                      <ProductLookupField
                        onInputChange={(value) => {
                          form.setValue(`items.${index}.productId`, "", {
                            shouldValidate: true
                          });
                          form.setValue(`items.${index}.productLabel`, value, {
                            shouldValidate: true
                          });
                        }}
                        onSelect={(product) => {
                          form.setValue(`items.${index}.productId`, product.id, {
                            shouldValidate: true
                          });
                          form.setValue(
                            `items.${index}.productLabel`,
                            formatProductLabel(product),
                            { shouldValidate: true }
                          );

                          if (!form.getValues(`items.${index}.description`).trim()) {
                            form.setValue(`items.${index}.description`, product.name, {
                              shouldValidate: true
                            });
                          }
                        }}
                        selectedLabel={item?.productLabel ?? ""}
                        token={session.accessToken}
                      />
                    ) : null}
                    <TextField
                      label="Descricao"
                      onChange={(value) =>
                        form.setValue(`items.${index}.description`, value, {
                          shouldValidate: true
                        })
                      }
                      value={item?.description ?? ""}
                    />
                    <TextField
                      label="Valor unitario"
                      onChange={(value) =>
                        form.setValue(
                          `items.${index}.unitPrice`,
                          formatCurrencyInputFromDigits(value),
                          { shouldValidate: true }
                        )
                      }
                      value={item?.unitPrice ?? formatCurrencyInput(0)}
                    />
                  </div>
                </div>
              );
            })}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                onClick={() =>
                  fieldArray.append({
                    itemType: "SERVICE",
                    productId: "",
                    productLabel: "",
                    description: "",
                    quantity: "1",
                    unitPrice: formatCurrencyInput(0)
                  })
                }
                type="button"
                variant="outline"
              >
                <Plus className="mr-2 h-4 w-4" />
                Adicionar linha
              </Button>

              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Total</p>
                <p className="text-2xl font-semibold">{formatCurrency(quoteTotal)}</p>
              </div>
            </div>
          </div>
        </FormSection>
      </DetailCard>

      <DetailCard title="Observacoes">
        <FormSection columns={1} title="Notas">
          <div className="space-y-2">
            <Label htmlFor="service-order-quote-notes">Notas</Label>
            <textarea
              className={advancedTextareaClassName}
              id="service-order-quote-notes"
              onChange={(event) =>
                form.setValue("notes", event.target.value, { shouldValidate: true })
              }
              value={form.watch("notes") ?? ""}
            />
          </div>
        </FormSection>
      </DetailCard>
    </FormPage>
  );
}

function ProductLookupField({
  token,
  selectedLabel,
  onInputChange,
  onSelect
}: {
  token: string;
  selectedLabel: string;
  onInputChange: (value: string) => void;
  onSelect: (product: Product) => void;
}) {
  const [search, setSearch] = useState(selectedLabel);
  const [showResults, setShowResults] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    setSearch(selectedLabel);
    setShowResults(false);
  }, [selectedLabel]);

  const productsQuery = useQuery({
    queryKey: ["products", "service-order-quotes", "search", debouncedSearch],
    queryFn: () =>
      listProducts(token, {
        search: debouncedSearch,
        active: true,
        isService: false,
        take: 8
      }),
    enabled: debouncedSearch.trim().length >= 2
  });

  const products = productsQuery.data ?? [];

  return (
    <div className="space-y-2 md:col-span-2">
      <Label>Produto</Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          onChange={(event) => {
            setSearch(event.target.value);
            setShowResults(true);
            onInputChange(event.target.value);
          }}
          placeholder="Busque por nome ou codigo"
          value={search}
        />
      </div>

      {showResults && debouncedSearch.trim().length >= 2 ? (
        <div
          className="rounded-[var(--radius-input)] border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "rgb(17 24 39 / 0.72)"
          }}
        >
          {productsQuery.isLoading ? (
            <div className="px-3 py-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Buscando produtos...
            </div>
          ) : products.length ? (
            <div className="divide-y divide-white/10">
              {products.map((product) => (
                <button
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-white/5"
                  key={product.id}
                  onClick={() => {
                    const label = formatProductLabel(product);
                    setSearch(label);
                    setShowResults(false);
                    onSelect(product);
                  }}
                  type="button"
                >
                  <span>{product.name}</span>
                  <span className="text-xs text-muted-foreground">{product.internalCode}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Nenhuma peca encontrada.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        className={advancedSelectClassName}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatProductLabel(product: Pick<Product, "internalCode" | "name">) {
  return `${product.internalCode} • ${product.name}`;
}

function useDebouncedValue<TValue>(value: TValue, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}
