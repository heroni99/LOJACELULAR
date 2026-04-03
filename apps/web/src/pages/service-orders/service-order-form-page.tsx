import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type UseFormRegisterReturn } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/ui/page-header";
import {
  createServiceOrder,
  listCustomers,
  listInventoryUnits,
  listProducts,
  listSales,
  listUsers
} from "@/lib/api";
import { parseCurrencyToCents } from "@/lib/format";
import { parseApiError } from "@/lib/api-error";
import {
  AdvancedFeedback,
  advancedSelectClassName,
  advancedTextareaClassName,
  emptyToUndefined,
  formatServiceOrderItemType
} from "@/pages/advanced/advanced-shared";
import { success } from "@/lib/toast";

const itemSchema = z.object({
  itemType: z.enum(["PART", "SERVICE", "MANUAL_ITEM"]),
  productId: z.string().optional(),
  productUnitId: z.string().optional(),
  description: z.string().trim().min(1, "Informe a descricao do item."),
  quantity: z.string().trim().min(1, "Informe a quantidade."),
  unitPrice: z.string().trim().min(1, "Informe o valor unitario.")
});

const formSchema = z.object({
  customerId: z.string().uuid("Selecione o cliente."),
  assignedToUserId: z.string().optional(),
  relatedSaleId: z.string().optional(),
  deviceType: z.string().trim().min(1, "Informe o tipo do aparelho."),
  brand: z.string().trim().min(1, "Informe a marca."),
  model: z.string().trim().min(1, "Informe o modelo."),
  imei: z.string().trim().optional(),
  imei2: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  color: z.string().trim().optional(),
  accessories: z.string().trim().optional(),
  reportedIssue: z.string().trim().min(1, "Informe o defeito relatado."),
  foundIssue: z.string().trim().optional(),
  technicalNotes: z.string().trim().optional(),
  estimatedCompletionDate: z.string().trim().optional(),
  totalFinal: z.string().trim().optional(),
  items: z.array(itemSchema).default([])
});

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  customerId: "",
  assignedToUserId: "",
  relatedSaleId: "",
  deviceType: "",
  brand: "",
  model: "",
  imei: "",
  imei2: "",
  serialNumber: "",
  color: "",
  accessories: "",
  reportedIssue: "",
  foundIssue: "",
  technicalNotes: "",
  estimatedCompletionDate: "",
  totalFinal: "",
  items: []
};

export function ServiceOrderFormPage() {
  const navigate = useNavigate();
  const { session } = useAppSession();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const customersQuery = useQuery({
    queryKey: ["customers", "service-orders-form"],
    queryFn: () => listCustomers(session.accessToken, { active: true, take: 150 })
  });
  const usersQuery = useQuery({
    queryKey: ["users", "service-orders-form"],
    queryFn: () => listUsers(session.accessToken, { active: true, take: 150 })
  });
  const salesQuery = useQuery({
    queryKey: ["sales", "service-orders-form"],
    queryFn: () => listSales(session.accessToken, { status: "COMPLETED", take: 80 })
  });
  const productsQuery = useQuery({
    queryKey: ["products", "service-orders-form"],
    queryFn: () => listProducts(session.accessToken, { active: true, take: 200 })
  });
  const unitsQuery = useQuery({
    queryKey: ["inventory", "units", "service-orders-form"],
    queryFn: () =>
      listInventoryUnits(session.accessToken, {
        status: "IN_STOCK",
        take: 200
      })
  });

  const products = productsQuery.data ?? [];
  const partProducts = useMemo(() => products.filter((product) => !product.isService), [products]);
  const serviceProducts = useMemo(() => products.filter((product) => product.isService), [products]);
  const inventoryUnits = unitsQuery.data ?? [];

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues
  });
  const itemsFieldArray = useFieldArray({
    control: form.control,
    name: "items"
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) =>
      createServiceOrder(session.accessToken, {
        customerId: values.customerId,
        assignedToUserId: values.assignedToUserId || undefined,
        relatedSaleId: values.relatedSaleId || undefined,
        deviceType: values.deviceType,
        brand: values.brand,
        model: values.model,
        imei: emptyToUndefined(values.imei),
        imei2: emptyToUndefined(values.imei2),
        serialNumber: emptyToUndefined(values.serialNumber),
        color: emptyToUndefined(values.color),
        accessories: emptyToUndefined(values.accessories),
        reportedIssue: values.reportedIssue,
        foundIssue: emptyToUndefined(values.foundIssue),
        technicalNotes: emptyToUndefined(values.technicalNotes),
        estimatedCompletionDate: emptyToUndefined(values.estimatedCompletionDate),
        totalFinal: values.totalFinal?.trim()
          ? parseCurrencyToCents(values.totalFinal)
          : undefined,
        items: values.items.length
          ? values.items.map((item) => ({
              itemType: item.itemType,
              productId: item.productId || undefined,
              productUnitId: item.productUnitId || undefined,
              description: item.description,
              quantity: Number(item.quantity),
              unitPrice: parseCurrencyToCents(item.unitPrice)
            }))
          : undefined
      }),
    onSuccess: (order) => {
      success("OS aberta com sucesso.");
      navigate(`/service-orders/${order.id}`);
    },
    onError: (error: Error) => {
      setFeedback({ tone: "error", text: parseApiError(error) });
    }
  });

  const watchItems = form.watch("items");

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/service-orders"
        subtitle="Abra a OS com cliente, equipamento, defeito relatado e itens previstos da bancada."
        title="Nova ordem de servico"
      />

      <AdvancedFeedback feedback={feedback} />

      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((values) => {
          setFeedback(null);
          createMutation.mutate(values);
        })}
      >
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Cabecalho da OS</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <SelectField
              label="Cliente"
              options={[
                { label: "Selecione", value: "" },
                ...(customersQuery.data ?? []).map((customer) => ({
                  label: customer.name,
                  value: customer.id
                }))
              ]}
              value={form.watch("customerId")}
              onChange={(value) => form.setValue("customerId", value, { shouldValidate: true })}
            />
            <SelectField
              label="Responsavel"
              options={[
                { label: "Nao atribuido", value: "" },
                ...(usersQuery.data ?? []).map((user) => ({
                  label: user.name,
                  value: user.id
                }))
              ]}
              value={form.watch("assignedToUserId") ?? ""}
              onChange={(value) => form.setValue("assignedToUserId", value)}
            />
            <SelectField
              label="Venda relacionada"
              options={[
                { label: "Sem venda relacionada", value: "" },
                ...(salesQuery.data ?? []).map((sale) => ({
                  label: `${sale.saleNumber} • ${sale.customer?.name ?? "Consumidor final"}`,
                  value: sale.id
                }))
              ]}
              value={form.watch("relatedSaleId") ?? ""}
              onChange={(value) => form.setValue("relatedSaleId", value)}
            />
            <Field id="service-order-eta" label="Previsao" registration={form.register("estimatedCompletionDate")} type="date" />
            <Field id="service-order-device" label="Tipo do aparelho" registration={form.register("deviceType")} />
            <Field id="service-order-brand" label="Marca" registration={form.register("brand")} />
            <Field id="service-order-model" label="Modelo" registration={form.register("model")} />
            <Field id="service-order-color" label="Cor" registration={form.register("color")} />
            <Field id="service-order-imei" label="IMEI" registration={form.register("imei")} />
            <Field id="service-order-imei2" label="IMEI 2" registration={form.register("imei2")} />
            <Field id="service-order-serial" label="Serial" registration={form.register("serialNumber")} />
            <Field id="service-order-total-final" label="Valor final previsto (R$)" registration={form.register("totalFinal")} type="number" />

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="service-order-accessories">Acessorios</Label>
              <textarea
                className={advancedTextareaClassName}
                id="service-order-accessories"
                {...form.register("accessories")}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="service-order-reported-issue">Defeito relatado</Label>
              <textarea
                className={advancedTextareaClassName}
                id="service-order-reported-issue"
                {...form.register("reportedIssue")}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="service-order-found-issue">Defeito constatado</Label>
              <textarea
                className={advancedTextareaClassName}
                id="service-order-found-issue"
                {...form.register("foundIssue")}
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="service-order-tech-notes">Observacoes tecnicas</Label>
              <textarea
                className={advancedTextareaClassName}
                id="service-order-tech-notes"
                {...form.register("technicalNotes")}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Itens previstos</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cadastre pecas, servicos e itens manuais. Pecas serializadas exigem unidade vinculada.
              </p>
            </div>
            <Button
              onClick={() =>
                itemsFieldArray.append({
                  itemType: "SERVICE",
                  productId: "",
                  productUnitId: "",
                  description: "",
                  quantity: "1",
                  unitPrice: "0.00"
                })
              }
              type="button"
              variant="outline"
            >
              <Plus className="mr-2 h-4 w-4" />
              Adicionar item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!watchItems.length ? (
              <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                Nenhum item previsto ainda. A OS pode ser aberta sem itens e ajustada depois.
              </div>
            ) : null}

            {itemsFieldArray.fields.map((field, index) => {
              const currentItem = watchItems[index];
              const productOptions =
                currentItem?.itemType === "PART" ? partProducts : serviceProducts;
              const unitOptions = inventoryUnits.filter(
                (unit) => unit.product.id === currentItem?.productId
              );

              return (
                <div
                  key={field.id}
                  className="space-y-4 rounded-[1.5rem] border border-border/70 bg-card/80 p-4"
                >
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold">
                      Item {index + 1}
                      {currentItem ? ` • ${formatServiceOrderItemType(currentItem.itemType)}` : ""}
                    </p>
                    <Button
                      onClick={() => itemsFieldArray.remove(index)}
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <SelectField
                      label="Tipo"
                      options={[
                        { label: "Peca", value: "PART" },
                        { label: "Servico", value: "SERVICE" },
                        { label: "Item manual", value: "MANUAL_ITEM" }
                      ]}
                      value={currentItem?.itemType ?? "SERVICE"}
                      onChange={(value) => {
                        form.setValue(`items.${index}.itemType`, value as FormValues["items"][number]["itemType"]);
                        form.setValue(`items.${index}.productId`, "");
                        form.setValue(`items.${index}.productUnitId`, "");
                      }}
                    />

                    <SelectField
                      label="Produto vinculado"
                      options={[
                        {
                          label: currentItem?.itemType === "MANUAL_ITEM" ? "Nao se aplica" : "Selecione",
                          value: ""
                        },
                        ...productOptions.map((product) => ({
                          label: `${product.internalCode} • ${product.name}`,
                          value: product.id
                        }))
                      ]}
                      value={currentItem?.productId ?? ""}
                      onChange={(value) => {
                        form.setValue(`items.${index}.productId`, value);
                        form.setValue(`items.${index}.productUnitId`, "");
                      }}
                    />

                    {currentItem?.itemType === "PART" ? (
                      <SelectField
                        label="Unidade serializada"
                        options={[
                          { label: "Sem unidade especifica", value: "" },
                          ...unitOptions.map((unit) => ({
                            label: `${unit.imei ?? unit.serialNumber ?? unit.id} • ${unit.currentLocation?.name ?? "Sem local"}`,
                            value: unit.id
                          }))
                        ]}
                        value={currentItem.productUnitId ?? ""}
                        onChange={(value) => form.setValue(`items.${index}.productUnitId`, value)}
                      />
                    ) : null}

                    <Field
                      id={`service-order-item-qty-${index}`}
                      label="Quantidade"
                      registration={form.register(`items.${index}.quantity`)}
                      type="number"
                    />
                    <Field
                      id={`service-order-item-price-${index}`}
                      label="Valor unitario (R$)"
                      registration={form.register(`items.${index}.unitPrice`)}
                      type="number"
                    />
                    <div className="space-y-2 lg:col-span-2">
                      <Label htmlFor={`service-order-item-description-${index}`}>Descricao</Label>
                      <textarea
                        className={advancedTextareaClassName}
                        id={`service-order-item-description-${index}`}
                        {...form.register(`items.${index}.description`)}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {createMutation.error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(createMutation.error as Error).message}
          </div>
        ) : null}

        <div className="flex justify-end">
          <LoadingButton isLoading={createMutation.isPending} loadingText="Salvando..." type="submit">
            Abrir OS
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

function Field({
  id,
  label,
  registration,
  type = "text"
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} {...registration} />
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
          <option key={`${label}-${option.value || "empty"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
