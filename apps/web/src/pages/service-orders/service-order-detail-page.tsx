import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type UseFormRegisterReturn } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Link2, PackageCheck, Pencil, RefreshCw, Save, Trash2 } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changeServiceOrderStatus,
  consumeServiceOrderItem,
  getServiceOrder,
  listCustomers,
  listInventoryUnits,
  listProducts,
  listSales,
  listStockLocations,
  listUsers,
  updateServiceOrder,
  type ServiceOrderStatusName
} from "@/lib/api";
import { formatCurrency, formatDateTime, parseCurrencyToCents } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import {
  AdvancedFeedback,
  ServiceOrderStatusBadge,
  advancedSelectClassName,
  advancedTextareaClassName,
  emptyToUndefined,
  formatServiceOrderItemType,
  formatServiceOrderStatus
} from "@/pages/advanced/advanced-shared";

const editableItemSchema = z.object({
  itemType: z.enum(["PART", "SERVICE", "MANUAL_ITEM"]),
  productId: z.string().optional(),
  productUnitId: z.string().optional(),
  description: z.string().trim().min(1),
  quantity: z.string().trim().min(1),
  unitPrice: z.string().trim().min(1)
});

const editSchema = z.object({
  customerId: z.string().uuid(),
  assignedToUserId: z.string().optional(),
  relatedSaleId: z.string().optional(),
  deviceType: z.string().trim().min(1),
  brand: z.string().trim().min(1),
  model: z.string().trim().min(1),
  imei: z.string().trim().optional(),
  imei2: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  color: z.string().trim().optional(),
  accessories: z.string().trim().optional(),
  reportedIssue: z.string().trim().min(1),
  foundIssue: z.string().trim().optional(),
  technicalNotes: z.string().trim().optional(),
  estimatedCompletionDate: z.string().trim().optional(),
  totalFinal: z.string().trim().optional(),
  items: z.array(editableItemSchema)
});

type EditValues = z.infer<typeof editSchema>;

const statusTransitionMap: Record<ServiceOrderStatusName, ServiceOrderStatusName[]> = {
  OPEN: ["WAITING_APPROVAL", "CANCELED"],
  WAITING_APPROVAL: ["APPROVED", "REJECTED", "CANCELED"],
  APPROVED: ["IN_PROGRESS", "WAITING_PARTS", "CANCELED"],
  IN_PROGRESS: ["WAITING_PARTS", "READY_FOR_DELIVERY", "CANCELED"],
  WAITING_PARTS: ["IN_PROGRESS", "CANCELED"],
  READY_FOR_DELIVERY: ["DELIVERED"],
  DELIVERED: [],
  CANCELED: [],
  REJECTED: []
};

export function ServiceOrderDetailPage() {
  const { id = "" } = useParams();
  const { session, hasPermission } = useAppSession();
  const [editing, setEditing] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [statusNotes, setStatusNotes] = useState("");
  const [nextStatus, setNextStatus] = useState<ServiceOrderStatusName | "">("");
  const [statusTotalFinal, setStatusTotalFinal] = useState("");
  const [consumeLocationByItem, setConsumeLocationByItem] = useState<Record<string, string>>({});

  const orderQuery = useQuery({
    queryKey: ["service-orders", id],
    queryFn: () => getServiceOrder(session.accessToken, id),
    enabled: Boolean(id)
  });
  const customersQuery = useQuery({
    queryKey: ["customers", "service-order-detail"],
    queryFn: () => listCustomers(session.accessToken, { active: true, take: 150 })
  });
  const usersQuery = useQuery({
    queryKey: ["users", "service-order-detail"],
    queryFn: () => listUsers(session.accessToken, { active: true, take: 150 })
  });
  const salesQuery = useQuery({
    queryKey: ["sales", "service-order-detail"],
    queryFn: () => listSales(session.accessToken, { status: "COMPLETED", take: 80 })
  });
  const productsQuery = useQuery({
    queryKey: ["products", "service-order-detail"],
    queryFn: () => listProducts(session.accessToken, { active: true, take: 200 })
  });
  const unitsQuery = useQuery({
    queryKey: ["inventory", "units", "service-order-detail"],
    queryFn: () => listInventoryUnits(session.accessToken, { status: "IN_STOCK", take: 200 })
  });
  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "service-order-detail"],
    queryFn: () => listStockLocations(session.accessToken, { active: true, take: 150 })
  });

  const products = productsQuery.data ?? [];
  const partProducts = useMemo(() => products.filter((product) => !product.isService), [products]);
  const serviceProducts = useMemo(() => products.filter((product) => product.isService), [products]);
  const inventoryUnits = unitsQuery.data ?? [];
  const order = orderQuery.data;

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
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
    }
  });
  const fieldArray = useFieldArray({
    control: form.control,
    name: "items"
  });
  const watchItems = form.watch("items");

  useEffect(() => {
    if (!order) {
      return;
    }

    const editableItems = order.items
      .filter((item) => !item.stockConsumed)
      .map((item) => ({
        itemType: item.itemType,
        productId: item.product?.id ?? "",
        productUnitId: item.productUnit?.id ?? "",
        description: item.description,
        quantity: String(item.quantity),
        unitPrice: (item.unitPrice / 100).toFixed(2)
      }));

    form.reset({
      customerId: order.customer.id,
      assignedToUserId: order.assignedToUser?.id ?? "",
      relatedSaleId: order.relatedSale?.id ?? "",
      deviceType: order.deviceType,
      brand: order.brand,
      model: order.model,
      imei: order.imei ?? "",
      imei2: order.imei2 ?? "",
      serialNumber: order.serialNumber ?? "",
      color: order.color ?? "",
      accessories: order.accessories ?? "",
      reportedIssue: order.reportedIssue,
      foundIssue: order.foundIssue ?? "",
      technicalNotes: order.technicalNotes ?? "",
      estimatedCompletionDate: order.estimatedCompletionDate?.slice(0, 10) ?? "",
      totalFinal: order.totalFinal === null ? "" : (order.totalFinal / 100).toFixed(2),
      items: editableItems
    });
    setNextStatus("");
    setStatusNotes("");
    setStatusTotalFinal(order.totalFinal === null ? "" : (order.totalFinal / 100).toFixed(2));
  }, [form, order]);

  const updateMutation = useMutation({
    mutationFn: async (values: EditValues) =>
      updateServiceOrder(session.accessToken, id, {
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
        totalFinal: values.totalFinal?.trim() ? parseCurrencyToCents(values.totalFinal) : undefined,
        items: values.items.map((item) => ({
          itemType: item.itemType,
          productId: item.productId || undefined,
          productUnitId: item.productUnitId || undefined,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: parseCurrencyToCents(item.unitPrice)
        }))
      }),
    onSuccess: async () => {
      setEditing(false);
      setFeedback({ tone: "success", text: "OS atualizada com sucesso." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] }),
        queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] })
      ]);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });

  const statusMutation = useMutation({
    mutationFn: async () => {
      if (!nextStatus) {
        throw new Error("Selecione a proxima etapa da OS.");
      }

      return changeServiceOrderStatus(session.accessToken, id, {
        status: nextStatus,
        notes: emptyToUndefined(statusNotes),
        totalFinal: statusTotalFinal.trim() ? parseCurrencyToCents(statusTotalFinal) : undefined
      });
    },
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Status da OS atualizado." });
      setNextStatus("");
      setStatusNotes("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] })
      ]);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });

  const consumeMutation = useMutation({
    mutationFn: async (payload: { itemId: string; locationId?: string }) =>
      consumeServiceOrderItem(session.accessToken, id, payload.itemId, {
        locationId: payload.locationId
      }),
    onSuccess: async () => {
      setFeedback({ tone: "success", text: "Consumo de peca registrado no estoque." });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["service-orders"] }),
        queryClient.invalidateQueries({ queryKey: ["service-orders", id] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory", "units"] })
      ]);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });

  if (orderQuery.isLoading) {
    return <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">Carregando ordem de servico...</div>;
  }

  if (orderQuery.error || !order) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        {(orderQuery.error as Error)?.message ?? "Ordem de servico nao encontrada."}
      </div>
    );
  }

  const statusOptions = statusTransitionMap[order.status];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assistencia tecnica"
        title={order.orderNumber}
        description={`${order.customer.name} • ${order.deviceType} ${order.brand} ${order.model}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" variant="outline">
              <Link to="/service-orders">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
            {hasPermission("accounts-receivable.create") ? (
              <Button asChild type="button" variant="outline">
                <Link to={`/accounts-receivable?serviceOrderId=${order.id}`}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Gerar contas a receber
                </Link>
              </Button>
            ) : null}
            {hasPermission("service-orders.update") ? (
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
        <MetricCard label="Status" value={formatServiceOrderStatus(order.status)} helper="Fluxo operacional atual da OS." />
        <MetricCard label="Total previsto" value={formatCurrency(order.totalFinal ?? order.totalEstimated)} helper="Valor final ou estimado da ordem." />
        <MetricCard label="Itens" value={String(order.items.length)} helper="Pecas e servicos vinculados." />
        <MetricCard label="Atualizada em" value={formatDateTime(order.updatedAt)} helper="Ultima persistencia real desta OS." />
      </div>

      <Card className="bg-white/90">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Resumo</CardTitle>
          </div>
          <ServiceOrderStatusBadge status={order.status} />
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <InfoItem label="Cliente" value={order.customer.name} />
          <InfoItem label="Responsavel" value={order.assignedToUser?.name ?? "Nao definido"} />
          <InfoItem label="Venda relacionada" value={order.relatedSale?.saleNumber ?? "Nao vinculada"} />
          <InfoItem label="IMEI" value={order.imei ?? "Nao informado"} />
          <InfoItem label="IMEI 2" value={order.imei2 ?? "Nao informado"} />
          <InfoItem label="Serial" value={order.serialNumber ?? "Nao informado"} />
          <InfoItem label="Cor" value={order.color ?? "Nao informada"} />
          <InfoItem label="Aprovada em" value={order.approvedAt ? formatDateTime(order.approvedAt) : "Ainda nao"} />
          <InfoItem label="Entrega" value={order.deliveredAt ? formatDateTime(order.deliveredAt) : "Pendente"} />
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
              <CardTitle className="text-xl">Editar cabecalho e itens</CardTitle>
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
              <Field id="service-order-edit-eta" label="Previsao" registration={form.register("estimatedCompletionDate")} type="date" />
              <Field id="service-order-edit-device" label="Tipo do aparelho" registration={form.register("deviceType")} />
              <Field id="service-order-edit-brand" label="Marca" registration={form.register("brand")} />
              <Field id="service-order-edit-model" label="Modelo" registration={form.register("model")} />
              <Field id="service-order-edit-color" label="Cor" registration={form.register("color")} />
              <Field id="service-order-edit-imei" label="IMEI" registration={form.register("imei")} />
              <Field id="service-order-edit-imei2" label="IMEI 2" registration={form.register("imei2")} />
              <Field id="service-order-edit-serial" label="Serial" registration={form.register("serialNumber")} />
              <Field id="service-order-edit-total" label="Valor final (R$)" registration={form.register("totalFinal")} type="number" />
              <TextAreaField id="service-order-edit-accessories" label="Acessorios" registration={form.register("accessories")} />
              <TextAreaField id="service-order-edit-reported" label="Defeito relatado" registration={form.register("reportedIssue")} />
              <TextAreaField id="service-order-edit-found" label="Defeito constatado" registration={form.register("foundIssue")} />
              <TextAreaField id="service-order-edit-tech" label="Observacoes tecnicas" registration={form.register("technicalNotes")} />
            </CardContent>
          </Card>

          <Card className="bg-white/90">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle className="text-xl">Itens editaveis</CardTitle>
              <Button
                onClick={() =>
                  fieldArray.append({
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
                <Pencil className="mr-2 h-4 w-4" />
                Adicionar item
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {fieldArray.fields.map((field, index) => {
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
                        Item {index + 1} • {formatServiceOrderItemType(currentItem.itemType)}
                      </p>
                      <Button onClick={() => fieldArray.remove(index)} type="button" variant="ghost">
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
                        value={currentItem.itemType}
                        onChange={(value) => {
                          form.setValue(`items.${index}.itemType`, value as EditValues["items"][number]["itemType"]);
                          form.setValue(`items.${index}.productId`, "");
                          form.setValue(`items.${index}.productUnitId`, "");
                        }}
                      />
                      <SelectField
                        label="Produto vinculado"
                        options={[
                          {
                            label: currentItem.itemType === "MANUAL_ITEM" ? "Nao se aplica" : "Selecione",
                            value: ""
                          },
                          ...productOptions.map((product) => ({
                            label: `${product.internalCode} • ${product.name}`,
                            value: product.id
                          }))
                        ]}
                        value={currentItem.productId ?? ""}
                        onChange={(value) => form.setValue(`items.${index}.productId`, value)}
                      />
                      {currentItem.itemType === "PART" ? (
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
                      <Field id={`service-order-edit-qty-${index}`} label="Quantidade" registration={form.register(`items.${index}.quantity`)} type="number" />
                      <Field id={`service-order-edit-price-${index}`} label="Valor unitario (R$)" registration={form.register(`items.${index}.unitPrice`)} type="number" />
                      <TextAreaField id={`service-order-edit-description-${index}`} label="Descricao" registration={form.register(`items.${index}.description`)} />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button disabled={updateMutation.isPending} type="submit">
              <Save className="mr-2 h-4 w-4" />
              {updateMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
            </Button>
          </div>
        </form>
      ) : null}

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Timeline de status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.statusHistory.map((entry) => (
            <div
              key={entry.id}
              className="rounded-[1.5rem] border border-border/70 bg-card/80 p-4"
            >
              <div className="flex flex-wrap items-center gap-2">
                {entry.oldStatus ? <ServiceOrderStatusBadge status={entry.oldStatus} /> : null}
                <span className="text-muted-foreground">→</span>
                <ServiceOrderStatusBadge status={entry.newStatus} />
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {entry.changedByUser?.name ?? "Sistema"} • {formatDateTime(entry.createdAt)}
              </p>
              {entry.notes ? <p className="mt-2 text-sm">{entry.notes}</p> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Itens e consumo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.items.map((item) => {
            const requiresLocation = item.itemType === "PART" && !item.product?.hasSerialControl;

            return (
              <div
                key={item.id}
                className="space-y-3 rounded-[1.5rem] border border-border/70 bg-card/80 p-4"
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className="font-semibold">
                      {formatServiceOrderItemType(item.itemType)} • {item.description}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {item.product?.name ?? "Sem produto"} • {item.quantity} x {formatCurrency(item.unitPrice)}
                    </p>
                    {item.productUnit ? (
                      <p className="text-sm text-muted-foreground">
                        Unidade: {item.productUnit.imei ?? item.productUnit.serialNumber ?? item.productUnit.id}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                      {item.stockConsumed ? "Estoque consumido" : "Sem consumo"}
                    </span>
                    {hasPermission("service-orders.update") &&
                    item.itemType === "PART" &&
                    !item.stockConsumed ? (
                      <>
                        {requiresLocation ? (
                          <select
                            className={advancedSelectClassName}
                            onChange={(event) =>
                              setConsumeLocationByItem((current) => ({
                                ...current,
                                [item.id]: event.target.value
                              }))
                            }
                            value={consumeLocationByItem[item.id] ?? ""}
                          >
                            <option value="">Selecione o local</option>
                            {(locationsQuery.data ?? []).map((location) => (
                              <option key={location.id} value={location.id}>
                                {location.name}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        <Button
                          onClick={() =>
                            consumeMutation.mutate({
                              itemId: item.id,
                              locationId: requiresLocation
                                ? consumeLocationByItem[item.id]
                                : undefined
                            })
                          }
                          type="button"
                          variant="outline"
                        >
                          <PackageCheck className="mr-2 h-4 w-4" />
                          Consumir peca
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {hasPermission("service-orders.update") && statusOptions.length ? (
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Mover etapa da OS</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[220px_220px_minmax(0,1fr)_auto]">
            <SelectField
              label="Proximo status"
              options={[
                { label: "Selecione", value: "" },
                ...statusOptions.map((status) => ({
                  label: formatServiceOrderStatus(status),
                  value: status
                }))
              ]}
              value={nextStatus}
              onChange={(value) => setNextStatus(value as ServiceOrderStatusName | "")}
            />
            <FieldControlled
              id="service-order-status-total"
              label="Valor final (R$)"
              onChange={setStatusTotalFinal}
              type="number"
              value={statusTotalFinal}
            />
            <TextAreaControlled
              id="service-order-status-notes"
              label="Observacao"
              onChange={setStatusNotes}
              value={statusNotes}
            />
            <div className="flex items-end">
              <Button disabled={statusMutation.isPending} onClick={() => statusMutation.mutate()} type="button">
                <RefreshCw className="mr-2 h-4 w-4" />
                Avancar status
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
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

function TextAreaControlled({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2 lg:col-span-2">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        className={advancedTextareaClassName}
        id={id}
        onChange={(event) => onChange(event.target.value)}
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
