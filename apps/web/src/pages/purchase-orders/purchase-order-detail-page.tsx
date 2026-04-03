import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type UseFormRegisterReturn } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Link2, PackagePlus, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageHeader } from "@/components/ui/page-header";
import {
  changePurchaseOrderStatus,
  getPurchaseOrder,
  listProducts,
  listStockLocations,
  listSuppliers,
  receivePurchaseOrder,
  updatePurchaseOrder,
  type PurchaseOrderStatusName
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCurrency, formatDateTime, parseCurrencyToCents } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { error as toastError, success } from "@/lib/toast";
import {
  AdvancedFeedback,
  PurchaseOrderStatusBadge,
  advancedSelectClassName,
  advancedTextareaClassName,
  formatPurchaseOrderStatus
} from "@/pages/advanced/advanced-shared";

const itemSchema = z.object({
  productId: z.string().uuid(),
  description: z.string().trim().min(1),
  quantity: z.string().trim().min(1),
  unitCost: z.string().trim().min(1)
});

const editSchema = z.object({
  supplierId: z.string().uuid(),
  notes: z.string().trim().optional(),
  discountAmount: z.string().trim().optional(),
  items: z.array(itemSchema).min(1)
});

type EditValues = z.infer<typeof editSchema>;
export function PurchaseOrderDetailPage() {
  const { id = "" } = useParams();
  const { session, hasPermission } = useAppSession();
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [nextStatus, setNextStatus] = useState<PurchaseOrderStatusName | "">("");
  const [receiveState, setReceiveState] = useState<
    Record<string, { locationId: string; quantity: string; unitsText: string }>
  >({});

  const orderQuery = useQuery({
    queryKey: ["purchase-orders", id],
    queryFn: () => getPurchaseOrder(session.accessToken, id),
    enabled: Boolean(id)
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "purchase-order-detail"],
    queryFn: () => listSuppliers(session.accessToken, { active: true, take: 150 })
  });
  const productsQuery = useQuery({
    queryKey: ["products", "purchase-order-detail"],
    queryFn: () => listProducts(session.accessToken, { active: true, isService: false, take: 200 })
  });
  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "purchase-order-detail"],
    queryFn: () => listStockLocations(session.accessToken, { active: true, take: 150 })
  });

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      supplierId: "",
      notes: "",
      discountAmount: "",
      items: []
    }
  });
  const fieldArray = useFieldArray({
    control: form.control,
    name: "items"
  });

  const order = orderQuery.data;

  useEffect(() => {
    if (!order) {
      return;
    }

    form.reset({
      supplierId: order.supplier.id,
      notes: order.notes ?? "",
      discountAmount: (order.discountAmount / 100).toFixed(2),
      items: order.items.map((item) => ({
        productId: item.productId,
        description: item.description,
        quantity: String(item.quantity),
        unitCost: (item.unitCost / 100).toFixed(2)
      }))
    });

    setReceiveState(
      Object.fromEntries(
        order.items.map((item) => [
          item.id,
          {
            locationId: "",
            quantity: "",
            unitsText: ""
          }
        ])
      )
    );
  }, [form, order]);

  const updateMutation = useMutation({
    mutationFn: async (values: EditValues) =>
      updatePurchaseOrder(session.accessToken, id, {
        supplierId: values.supplierId,
        notes: values.notes?.trim() || undefined,
        discountAmount: values.discountAmount?.trim()
          ? parseCurrencyToCents(values.discountAmount)
          : undefined,
        items: values.items.map((item) => ({
          productId: item.productId,
          description: item.description,
          quantity: Number(item.quantity),
          unitCost: parseCurrencyToCents(item.unitCost)
        }))
      }),
    onSuccess: async () => {
      setEditing(false);
      success("Pedido atualizado com sucesso.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!nextStatus) {
        throw new Error("Selecione o novo status.");
      }

      return changePurchaseOrderStatus(session.accessToken, id, {
        status: nextStatus
      });
    },
    onSuccess: async () => {
      success("Status do pedido atualizado.");
      setNextStatus("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  const receiveMutation = useMutation({
    mutationFn: async () => {
      if (!order) {
        throw new Error("Pedido nao carregado.");
      }

      const items: Array<{
        purchaseOrderItemId: string;
        locationId: string;
        quantity?: number;
        units?: Array<{
          imei?: string;
          imei2?: string;
          serialNumber?: string;
          notes?: string;
        }>;
      }> = [];

      for (const item of order.items) {
          const current = receiveState[item.id];
          if (!current?.locationId) {
            continue;
          }

          if (item.product.hasSerialControl) {
            const units = current.unitsText
              .split(/\r?\n/)
              .map((line) => line.trim())
              .filter(Boolean)
              .map((line) => {
                const [imei, imei2, serialNumber, notes] = line.split(";").map((chunk) => chunk?.trim() || "");
                return {
                  imei: imei || undefined,
                  imei2: imei2 || undefined,
                  serialNumber: serialNumber || undefined,
                  notes: notes || undefined
                };
              });

            if (!units.length) {
              continue;
            }

            items.push({
              purchaseOrderItemId: item.id,
              locationId: current.locationId,
              units
            });
            continue;
          }

          if (!current.quantity.trim()) {
            continue;
          }

          items.push({
            purchaseOrderItemId: item.id,
            locationId: current.locationId,
            quantity: Number(current.quantity)
          });
        }

      if (!items.length) {
        throw new Error("Informe ao menos um recebimento para processar.");
      }

      return receivePurchaseOrder(session.accessToken, id, { items });
    },
    onSuccess: async () => {
      success("Recebimento processado e estoque atualizado.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["purchase-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["purchase-orders", id] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory", "units"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] })
      ]);
    },
    onError: (error: Error) => toastError(parseApiError(error))
  });

  if (orderQuery.isLoading) {
    return <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">Carregando pedido de compra...</div>;
  }

  if (orderQuery.error || !order) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        {(orderQuery.error as Error)?.message ?? "Pedido nao encontrado."}
      </div>
    );
  }

  const canEditDraft = hasPermission("purchase-orders.update") && order.status === "DRAFT";
  const canReceive = hasPermission("purchase-orders.receive") && ["ORDERED", "PARTIALLY_RECEIVED"].includes(order.status);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/purchase-orders"
        subtitle={`${order.supplier.tradeName ?? order.supplier.name} • ${formatPurchaseOrderStatus(order.status)}`}
        title={order.orderNumber}
        actions={
          <div className="flex flex-wrap gap-2">
            {hasPermission("accounts-payable.create") ? (
              <Button asChild type="button" variant="outline">
                <Link to={`/accounts-payable?purchaseOrderId=${order.id}`}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Gerar conta a pagar
                </Link>
              </Button>
            ) : null}
            {canEditDraft ? (
              <Button onClick={() => setEditing((current) => !current)} type="button" variant="outline">
                <Pencil className="mr-2 h-4 w-4" />
                {editing ? "Cancelar edicao" : "Editar"}
              </Button>
            ) : null}
          </div>
        }
      />

      <AdvancedFeedback feedback={feedback} />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Status" value={formatPurchaseOrderStatus(order.status)} helper="Fluxo atual do pedido." />
        <MetricCard label="Subtotal" value={formatCurrency(order.subtotal)} helper="Soma dos itens antes do desconto." />
        <MetricCard label="Total" value={formatCurrency(order.total)} helper="Valor financeiro consolidado do pedido." />
        <MetricCard label="Recebido em" value={order.receivedAt ? formatDateTime(order.receivedAt) : "Pendente"} helper="Data final do recebimento integral." />
      </div>

      <Card className="bg-white/90">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-xl">Resumo</CardTitle>
          <PurchaseOrderStatusBadge status={order.status} />
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <InfoItem label="Fornecedor" value={order.supplier.tradeName ?? order.supplier.name} />
          <InfoItem label="Contato" value={order.supplier.email ?? order.supplier.phone ?? "Nao informado"} />
          <InfoItem label="Criado em" value={formatDateTime(order.createdAt)} />
          <InfoItem label="Pedido em" value={formatDateTime(order.orderedAt)} />
          <InfoItem label="Contas a pagar" value={String(order.accountsPayable.length)} />
          <InfoItem label="Atualizado em" value={formatDateTime(order.updatedAt)} />
        </CardContent>
      </Card>

      {editing ? (
        <form
          className="space-y-6"
          onSubmit={form.handleSubmit((values) => {
            setFeedback(null);
            updateMutation.mutate(values);
          })}
        >
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle className="text-xl">Editar pedido em rascunho</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <SelectField
                label="Fornecedor"
                value={form.watch("supplierId")}
                onChange={(value) => form.setValue("supplierId", value, { shouldValidate: true })}
                options={[
                  { label: "Selecione", value: "" },
                  ...(suppliersQuery.data ?? []).map((supplier) => ({
                    label: supplier.tradeName ?? supplier.name,
                    value: supplier.id
                  }))
                ]}
              />
              <Field id="purchase-order-edit-discount" label="Desconto (R$)" registration={form.register("discountAmount")} type="number" />
              <TextAreaField id="purchase-order-edit-notes" label="Observacoes" registration={form.register("notes")} />
            </CardContent>
          </Card>

          <Card className="bg-white/90">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-xl">Itens editaveis</CardTitle>
              <Button
                onClick={() =>
                  fieldArray.append({
                    productId: "",
                    description: "",
                    quantity: "1",
                    unitCost: "0.00"
                  })
                }
                type="button"
                variant="outline"
              >
                <Pencil className="mr-2 h-4 w-4" />
                Adicionar item
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {fieldArray.fields.map((field, index) => (
                <div key={field.id} className="space-y-4 rounded-[1.5rem] border border-border/70 bg-card/80 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-semibold">Item {index + 1}</p>
                    <Button onClick={() => fieldArray.remove(index)} type="button" variant="ghost">
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remover
                    </Button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <SelectField
                      label="Produto"
                      value={form.watch(`items.${index}.productId`)}
                      onChange={(value) => form.setValue(`items.${index}.productId`, value, { shouldValidate: true })}
                      options={[
                        { label: "Selecione", value: "" },
                        ...(productsQuery.data ?? []).map((product) => ({
                          label: `${product.internalCode} • ${product.name}`,
                          value: product.id
                        }))
                      ]}
                    />
                    <Field id={`purchase-order-edit-qty-${index}`} label="Quantidade" registration={form.register(`items.${index}.quantity`)} type="number" />
                    <Field id={`purchase-order-edit-cost-${index}`} label="Custo unitario (R$)" registration={form.register(`items.${index}.unitCost`)} type="number" />
                    <TextAreaField id={`purchase-order-edit-description-${index}`} label="Descricao" registration={form.register(`items.${index}.description`)} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <LoadingButton isLoading={updateMutation.isPending} loadingText="Salvando..." type="submit">
              <Save className="mr-2 h-4 w-4" />
              Salvar pedido
            </LoadingButton>
          </div>
        </form>
      ) : null}

      {hasPermission("purchase-orders.update") && ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"].includes(order.status) ? (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Mover status do pedido</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[260px_auto]">
            <SelectField
              label="Novo status"
              value={nextStatus}
              onChange={(value) => setNextStatus(value as PurchaseOrderStatusName | "")}
              options={[
                { label: "Selecione", value: "" },
                ...(order.status === "DRAFT"
                  ? [{ label: "Pedido enviado", value: "ORDERED" }]
                  : []),
                { label: "Cancelar", value: "CANCELED" }
              ]}
            />
            <div className="flex items-end">
              <LoadingButton isLoading={statusMutation.isPending} loadingText="Aguarde..." onClick={() => statusMutation.mutate()} type="button">
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar status
              </LoadingButton>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Itens e recebimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.items.map((item) => {
            const remaining = item.quantity - item.receivedQuantity;
            const state = receiveState[item.id] ?? { locationId: "", quantity: "", unitsText: "" };

            return (
              <div key={item.id} className="space-y-4 rounded-[1.5rem] border border-border/70 bg-card/80 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="font-semibold">
                      {item.product.internalCode} • {item.product.name}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                    <InfoItem label="Qtd pedida" value={String(item.quantity)} />
                    <InfoItem label="Qtd recebida" value={String(item.receivedQuantity)} />
                    <InfoItem label="Saldo a receber" value={String(remaining)} />
                    <InfoItem label="Custo" value={formatCurrency(item.unitCost)} />
                  </dl>
                </div>

                {canReceive && remaining > 0 ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <SelectField
                      label="Local de entrada"
                      value={state.locationId}
                      onChange={(value) =>
                        setReceiveState((current) => ({
                          ...current,
                          [item.id]: {
                            ...state,
                            locationId: value
                          }
                        }))
                      }
                      options={[
                        { label: "Selecione", value: "" },
                        ...(locationsQuery.data ?? []).map((location) => ({
                          label: location.name,
                          value: location.id
                        }))
                      ]}
                    />

                    {item.product.hasSerialControl ? (
                      <TextAreaControlled
                        id={`receive-units-${item.id}`}
                        label="Unidades serializadas"
                        value={state.unitsText}
                        onChange={(value) =>
                          setReceiveState((current) => ({
                            ...current,
                            [item.id]: {
                              ...state,
                              unitsText: value
                            }
                          }))
                        }
                        placeholder="Uma linha por unidade: imei;imei2;serial;observacao"
                      />
                    ) : (
                      <FieldControlled
                        id={`receive-qty-${item.id}`}
                        label="Quantidade a receber"
                        onChange={(value) =>
                          setReceiveState((current) => ({
                            ...current,
                            [item.id]: {
                              ...state,
                              quantity: value
                            }
                          }))
                        }
                        type="number"
                        value={state.quantity}
                      />
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}

          {canReceive ? (
            <div className="flex justify-end">
              <LoadingButton isLoading={receiveMutation.isPending} loadingText="Processando..." onClick={() => receiveMutation.mutate()} type="button">
                <PackagePlus className="mr-2 h-4 w-4" />
                Receber no estoque
              </LoadingButton>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-2 p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
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

function FieldControlled({
  id,
  label,
  value,
  onChange,
  type = "text"
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </div>
  );
}

function TextAreaField({
  id,
  label,
  registration
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <div className="space-y-2 lg:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea className={advancedTextareaClassName} id={id} {...registration} />
    </div>
  );
}

function TextAreaControlled({
  id,
  label,
  value,
  onChange,
  placeholder
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2 lg:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        className={advancedTextareaClassName}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
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
