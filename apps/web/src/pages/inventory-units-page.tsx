import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowRightLeft, PencilLine, Plus, RefreshCw, Search } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  InventoryFeedback,
  InventoryFieldError,
  getInventoryErrorMessage,
  inventorySelectClassName,
  inventoryTextareaClassName
} from "@/features/inventory/inventory-ui";
import {
  createInventoryUnits,
  listInventoryUnits,
  listProducts,
  listStockLocations,
  transferInventoryUnit,
  updateInventoryUnit,
  type InventoryProductUnit
} from "@/lib/api";
import {
  centsToInputValue,
  formatCurrency,
  formatDateTime,
  parseCurrencyToCents
} from "@/lib/format";
import { queryClient } from "@/lib/query-client";

const createUnitsSchema = z.object({
  productId: z.string().uuid("Selecione um produto serializado."),
  locationId: z.string().uuid("Selecione o local de entrada."),
  purchasePrice: z.string().optional(),
  notes: z.string().max(500, "Observacao muito longa.").optional(),
  units: z
    .array(
      z.object({
        imei: z.string().max(32).optional(),
        imei2: z.string().max(32).optional(),
        serialNumber: z.string().max(80).optional(),
        notes: z.string().max(500).optional()
      })
    )
    .min(1, "Informe ao menos uma unidade.")
}).superRefine((value, context) => {
  value.units.forEach((unit, index) => {
    if (!unit.imei?.trim() && !unit.imei2?.trim() && !unit.serialNumber?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Cada linha precisa de IMEI, IMEI2 ou serial.",
        path: ["units", index, "imei"]
      });
    }
  });
});

const updateUnitSchema = z.object({
  imei: z.string().max(32).optional(),
  imei2: z.string().max(32).optional(),
  serialNumber: z.string().max(80).optional(),
  purchasePrice: z.string().optional(),
  unitStatus: z.enum(["IN_STOCK", "RESERVED", "DAMAGED"]),
  notes: z.string().max(500).optional()
}).superRefine((value, context) => {
  if (!value.imei?.trim() && !value.imei2?.trim() && !value.serialNumber?.trim()) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "A unidade precisa manter ao menos um identificador.",
      path: ["imei"]
    });
  }
});

const transferUnitSchema = z.object({
  toLocationId: z.string().uuid("Selecione o local de destino."),
  notes: z.string().max(500).optional()
});

type CreateUnitsValues = z.infer<typeof createUnitsSchema>;
type UpdateUnitValues = z.infer<typeof updateUnitSchema>;
type TransferUnitValues = z.infer<typeof transferUnitSchema>;

const emptyCreateValues: CreateUnitsValues = {
  productId: "",
  locationId: "",
  purchasePrice: "",
  notes: "",
  units: [{ imei: "", imei2: "", serialNumber: "", notes: "" }]
};

const emptyUpdateValues: UpdateUnitValues = {
  imei: "",
  imei2: "",
  serialNumber: "",
  purchasePrice: "",
  unitStatus: "IN_STOCK",
  notes: ""
};

const emptyTransferValues: TransferUnitValues = {
  toLocationId: "",
  notes: ""
};

type StatusFilter = "" | "IN_STOCK" | "SOLD" | "RESERVED" | "DAMAGED";

export function InventoryUnitsPage() {
  const { session, hasPermission } = useAppSession();
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [productId, setProductId] = useState(searchParams.get("productId") ?? "");
  const [locationId, setLocationId] = useState("");
  const [selectedUnit, setSelectedUnit] = useState<InventoryProductUnit | null>(null);
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const productsQuery = useQuery({
    queryKey: ["products", "serialized"],
    queryFn: () =>
      listProducts(session.accessToken, {
        active: true,
        isService: false,
        take: 200
      })
  });
  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "inventory-units"],
    queryFn: () => listStockLocations(session.accessToken, { active: true, take: 200 })
  });
  const unitsQuery = useQuery({
    queryKey: ["inventory", "units", search, productId, locationId, status],
    queryFn: () =>
      listInventoryUnits(session.accessToken, {
        search: search.trim() || undefined,
        productId: productId || undefined,
        locationId: locationId || undefined,
        status: status || undefined,
        take: 150
      })
  });

  const serializedProducts = useMemo(
    () => (productsQuery.data ?? []).filter((product) => product.hasSerialControl),
    [productsQuery.data]
  );

  const createForm = useForm<CreateUnitsValues>({
    resolver: zodResolver(createUnitsSchema),
    defaultValues: {
      ...emptyCreateValues,
      productId: searchParams.get("productId") ?? ""
    }
  });
  const unitFields = useFieldArray({
    control: createForm.control,
    name: "units"
  });

  const updateForm = useForm<UpdateUnitValues>({
    resolver: zodResolver(updateUnitSchema),
    defaultValues: emptyUpdateValues
  });

  const transferForm = useForm<TransferUnitValues>({
    resolver: zodResolver(transferUnitSchema),
    defaultValues: emptyTransferValues
  });

  useEffect(() => {
    if (!selectedUnit) {
      updateForm.reset(emptyUpdateValues);
      transferForm.reset(emptyTransferValues);
      return;
    }

    updateForm.reset({
      imei: selectedUnit.imei ?? "",
      imei2: selectedUnit.imei2 ?? "",
      serialNumber: selectedUnit.serialNumber ?? "",
      purchasePrice:
        selectedUnit.purchasePrice === null
          ? ""
          : centsToInputValue(selectedUnit.purchasePrice),
      unitStatus:
        selectedUnit.unitStatus === "SOLD" ? "IN_STOCK" : selectedUnit.unitStatus,
      notes: selectedUnit.notes ?? ""
    });
    transferForm.reset({
      toLocationId: "",
      notes: ""
    });
  }, [selectedUnit, transferForm, updateForm]);

  const createMutation = useMutation({
    mutationFn: async (values: CreateUnitsValues) => {
      return createInventoryUnits(session.accessToken, {
        productId: values.productId,
        locationId: values.locationId,
        purchasePrice: values.purchasePrice?.trim()
          ? parseCurrencyToCents(values.purchasePrice)
          : undefined,
        notes: emptyToUndefined(values.notes),
        units: values.units.map((unit) => ({
          imei: emptyToUndefined(unit.imei),
          imei2: emptyToUndefined(unit.imei2),
          serialNumber: emptyToUndefined(unit.serialNumber),
          notes: emptyToUndefined(unit.notes)
        }))
      });
    },
    onSuccess: async (result) => {
      setFeedback({
        tone: "success",
        text: `${result.units.length} unidade(s) serializada(s) registrada(s) com sucesso.`
      });
      createForm.reset({
        ...emptyCreateValues,
        productId: createForm.getValues("productId"),
        locationId: createForm.getValues("locationId")
      });
      await invalidateInventoryViews();
    },
    onError: (error: Error) => {
      setFeedback({ tone: "error", text: error.message });
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (values: UpdateUnitValues) => {
      if (!selectedUnit) {
        throw new Error("Selecione uma unidade para editar.");
      }

      return updateInventoryUnit(session.accessToken, selectedUnit.id, {
        imei: emptyToUndefined(values.imei),
        imei2: emptyToUndefined(values.imei2),
        serialNumber: emptyToUndefined(values.serialNumber),
        purchasePrice: values.purchasePrice?.trim()
          ? parseCurrencyToCents(values.purchasePrice)
          : null,
        unitStatus: values.unitStatus,
        notes: emptyToUndefined(values.notes) ?? null
      });
    },
    onSuccess: async (unit) => {
      setSelectedUnit(unit);
      setFeedback({
        tone: "success",
        text: `Unidade ${displayUnit(unit)} atualizada com sucesso.`
      });
      await invalidateInventoryViews();
    },
    onError: (error: Error) => {
      setFeedback({ tone: "error", text: error.message });
    }
  });

  const transferMutation = useMutation({
    mutationFn: async (values: TransferUnitValues) => {
      if (!selectedUnit) {
        throw new Error("Selecione uma unidade para transferir.");
      }

      return transferInventoryUnit(session.accessToken, selectedUnit.id, {
        toLocationId: values.toLocationId,
        notes: emptyToUndefined(values.notes)
      });
    },
    onSuccess: async (result) => {
      setSelectedUnit(result.unit);
      setFeedback({
        tone: "success",
        text: `Unidade transferida para ${result.unit.currentLocation?.name ?? "novo local"}.`
      });
      await invalidateInventoryViews();
    },
    onError: (error: Error) => {
      setFeedback({ tone: "error", text: error.message });
    }
  });

  async function invalidateInventoryViews() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["inventory"] }),
      queryClient.invalidateQueries({ queryKey: ["products"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
    ]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Estoque"
        title="Unidades serializadas"
        description="Controle real por IMEI/serial com local atual, status operacional e transferencia entre locais."
        actions={
          <Button
            onClick={() => {
              void Promise.all([
                unitsQuery.refetch(),
                locationsQuery.refetch(),
                productsQuery.refetch()
              ]);
            }}
            type="button"
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        }
      />

      {feedback ? <InventoryFeedback tone={feedback.tone} text={feedback.text} /> : null}

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>
            Busque por IMEI, serial, codigo interno, produto, local ou status da unidade.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px_260px_220px]">
          <div className="space-y-2">
            <Label htmlFor="inventory-units-search">Busca</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="inventory-units-search"
                className="pl-10"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="IMEI, serial, produto ou codigo"
                value={search}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventory-units-product">Produto</Label>
            <select
              className={inventorySelectClassName}
              id="inventory-units-product"
              onChange={(event) => setProductId(event.target.value)}
              value={productId}
            >
              <option value="">Todos os produtos serializados</option>
              {serializedProducts.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name} • {product.internalCode}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventory-units-location">Local</Label>
            <select
              className={inventorySelectClassName}
              id="inventory-units-location"
              onChange={(event) => setLocationId(event.target.value)}
              value={locationId}
            >
              <option value="">Todos os locais</option>
              {(locationsQuery.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventory-units-status">Status</Label>
            <select
              className={inventorySelectClassName}
              id="inventory-units-status"
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              value={status}
            >
              <option value="">Todos</option>
              <option value="IN_STOCK">Em estoque</option>
              <option value="RESERVED">Reservada</option>
              <option value="DAMAGED">Avariada</option>
              <option value="SOLD">Vendida</option>
            </select>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_420px]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle>Unidades encontradas</CardTitle>
            <CardDescription>
              Cada linha vem do banco e reflete o status e o local atual da unidade.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {unitsQuery.isLoading ? (
              <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-4 text-sm text-muted-foreground">
                Carregando unidades serializadas...
              </div>
            ) : null}

            {unitsQuery.error ? (
              <InventoryFeedback
                tone="error"
                text={getInventoryErrorMessage(unitsQuery.error)}
              />
            ) : null}

            {!unitsQuery.isLoading && !(unitsQuery.data ?? []).length ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
                Nenhuma unidade encontrada com os filtros atuais.
              </div>
            ) : null}

            {(unitsQuery.data ?? []).map((unit) => (
              <div
                key={unit.id}
                className={`rounded-[1.5rem] border p-4 shadow-sm ${
                  selectedUnit?.id === unit.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border/80 bg-card/90"
                }`}
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{displayUnit(unit)}</p>
                      <StatusBadge tone={toneByUnitStatus(unit.unitStatus)}>
                        {labelByUnitStatus(unit.unitStatus)}
                      </StatusBadge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {unit.product.name} • {unit.product.internalCode}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Local atual: {unit.currentLocation?.name || "Sem local"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Custo:{" "}
                      {formatCurrency(unit.purchasePrice ?? unit.product.costPrice)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Atualizada em {formatDateTime(unit.updatedAt)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {hasPermission("inventory.adjust") && unit.unitStatus !== "SOLD" ? (
                      <Button
                        onClick={() => setSelectedUnit(unit)}
                        type="button"
                        variant="outline"
                      >
                        <PencilLine className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                    ) : null}
                    {hasPermission("inventory.transfer") &&
                    unit.unitStatus !== "SOLD" &&
                    unit.currentLocation ? (
                      <Button
                        onClick={() => setSelectedUnit(unit)}
                        type="button"
                        variant="outline"
                      >
                        <ArrowRightLeft className="mr-2 h-4 w-4" />
                        Transferir
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {hasPermission("inventory.entry") ? (
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Plus className="h-5 w-5 text-primary" />
                  Entrada serializada
                </CardTitle>
                <CardDescription>
                  Crie unidades reais para produtos serializados e incremente o saldo do local.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="inventory-units-create-product">Produto</Label>
                  <select
                    className={inventorySelectClassName}
                    id="inventory-units-create-product"
                    onChange={(event) => createForm.setValue("productId", event.target.value)}
                    value={createForm.watch("productId")}
                  >
                    <option value="">Selecione</option>
                    {serializedProducts.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} • {product.internalCode}
                      </option>
                    ))}
                  </select>
                  <InventoryFieldError message={createForm.formState.errors.productId?.message} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-units-create-location">Local</Label>
                  <select
                    className={inventorySelectClassName}
                    id="inventory-units-create-location"
                    onChange={(event) => createForm.setValue("locationId", event.target.value)}
                    value={createForm.watch("locationId")}
                  >
                    <option value="">Selecione</option>
                    {(locationsQuery.data ?? []).map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  <InventoryFieldError message={createForm.formState.errors.locationId?.message} />
                </div>

                <Field
                  label="Custo unitario"
                  onChange={(value) => createForm.setValue("purchasePrice", value)}
                  value={createForm.watch("purchasePrice") || ""}
                />

                <div className="space-y-2">
                  <Label htmlFor="inventory-units-create-notes">Observacoes gerais</Label>
                  <textarea
                    className={inventoryTextareaClassName}
                    id="inventory-units-create-notes"
                    onChange={(event) => createForm.setValue("notes", event.target.value)}
                    value={createForm.watch("notes") || ""}
                  />
                  <InventoryFieldError message={createForm.formState.errors.notes?.message} />
                </div>

                <div className="space-y-3">
                  {unitFields.fields.map((field, index) => (
                    <div
                      key={field.id}
                      className="rounded-2xl border border-border/70 bg-secondary/20 p-4"
                    >
                      <div className="grid gap-3">
                        <Field
                          label={`IMEI ${index + 1}`}
                          onChange={(value) =>
                            createForm.setValue(`units.${index}.imei`, value)
                          }
                          value={createForm.watch(`units.${index}.imei`) || ""}
                        />
                        <Field
                          label="IMEI 2"
                          onChange={(value) =>
                            createForm.setValue(`units.${index}.imei2`, value)
                          }
                          value={createForm.watch(`units.${index}.imei2`) || ""}
                        />
                        <Field
                          label="Serial"
                          onChange={(value) =>
                            createForm.setValue(`units.${index}.serialNumber`, value)
                          }
                          value={createForm.watch(`units.${index}.serialNumber`) || ""}
                        />
                        <div className="space-y-2">
                          <Label>Notas da unidade</Label>
                          <textarea
                            className={inventoryTextareaClassName}
                            onChange={(event) =>
                              createForm.setValue(`units.${index}.notes`, event.target.value)
                            }
                            value={createForm.watch(`units.${index}.notes`) || ""}
                          />
                        </div>
                        <InventoryFieldError
                          message={createForm.formState.errors.units?.[index]?.imei?.message}
                        />
                        {unitFields.fields.length > 1 ? (
                          <Button
                            onClick={() => unitFields.remove(index)}
                            type="button"
                            variant="outline"
                          >
                            Remover linha
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() =>
                      unitFields.append({
                        imei: "",
                        imei2: "",
                        serialNumber: "",
                        notes: ""
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    Adicionar unidade
                  </Button>
                  <Button
                    disabled={createMutation.isPending}
                    onClick={createForm.handleSubmit((values) => createMutation.mutate(values))}
                    type="button"
                  >
                    Salvar unidades
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {selectedUnit &&
          hasPermission("inventory.adjust") &&
          selectedUnit.unitStatus !== "SOLD" ? (
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle>Editar unidade</CardTitle>
                <CardDescription>
                  Ajuste identificadores, custo, observacoes e status operacional.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field
                  label="IMEI"
                  onChange={(value) => updateForm.setValue("imei", value)}
                  value={updateForm.watch("imei") || ""}
                />
                <Field
                  label="IMEI 2"
                  onChange={(value) => updateForm.setValue("imei2", value)}
                  value={updateForm.watch("imei2") || ""}
                />
                <Field
                  label="Serial"
                  onChange={(value) => updateForm.setValue("serialNumber", value)}
                  value={updateForm.watch("serialNumber") || ""}
                />
                <Field
                  label="Custo unitario"
                  onChange={(value) => updateForm.setValue("purchasePrice", value)}
                  value={updateForm.watch("purchasePrice") || ""}
                />
                <div className="space-y-2">
                  <Label htmlFor="inventory-unit-status">Status</Label>
                  <select
                    className={inventorySelectClassName}
                    id="inventory-unit-status"
                    onChange={(event) =>
                      updateForm.setValue(
                        "unitStatus",
                        event.target.value as UpdateUnitValues["unitStatus"]
                      )
                    }
                    value={updateForm.watch("unitStatus")}
                  >
                    <option value="IN_STOCK">Em estoque</option>
                    <option value="RESERVED">Reservada</option>
                    <option value="DAMAGED">Avariada</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inventory-unit-notes">Observacoes</Label>
                  <textarea
                    className={inventoryTextareaClassName}
                    id="inventory-unit-notes"
                    onChange={(event) => updateForm.setValue("notes", event.target.value)}
                    value={updateForm.watch("notes") || ""}
                  />
                </div>
                <InventoryFieldError message={updateForm.formState.errors.imei?.message} />
                <Button
                  disabled={updateMutation.isPending}
                  onClick={updateForm.handleSubmit((values) => updateMutation.mutate(values))}
                  type="button"
                >
                  Salvar alteracoes
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {selectedUnit &&
          selectedUnit.unitStatus !== "SOLD" &&
          selectedUnit.currentLocation &&
          hasPermission("inventory.transfer") ? (
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle>Transferir unidade</CardTitle>
                <CardDescription>
                  Move a unidade entre locais sem perder rastreabilidade.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-card/80 p-4 text-sm">
                  Origem atual: <strong>{selectedUnit.currentLocation.name}</strong>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-unit-transfer-location">Destino</Label>
                  <select
                    className={inventorySelectClassName}
                    id="inventory-unit-transfer-location"
                    onChange={(event) => transferForm.setValue("toLocationId", event.target.value)}
                    value={transferForm.watch("toLocationId")}
                  >
                    <option value="">Selecione</option>
                    {(locationsQuery.data ?? [])
                      .filter((location) => location.id !== selectedUnit.currentLocation?.id)
                      .map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                        </option>
                      ))}
                  </select>
                  <InventoryFieldError
                    message={transferForm.formState.errors.toLocationId?.message}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inventory-unit-transfer-notes">Observacoes</Label>
                  <textarea
                    className={inventoryTextareaClassName}
                    id="inventory-unit-transfer-notes"
                    onChange={(event) => transferForm.setValue("notes", event.target.value)}
                    value={transferForm.watch("notes") || ""}
                  />
                </div>

                <Button
                  disabled={transferMutation.isPending}
                  onClick={transferForm.handleSubmit((values) => transferMutation.mutate(values))}
                  type="button"
                >
                  Transferir unidade
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
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
      <Label>{label}</Label>
      <Input onChange={(event) => onChange(event.target.value)} value={value} />
    </div>
  );
}

function displayUnit(unit: Pick<InventoryProductUnit, "imei" | "imei2" | "serialNumber">) {
  return unit.imei || unit.serialNumber || unit.imei2 || "Unidade serializada";
}

function labelByUnitStatus(status: InventoryProductUnit["unitStatus"]) {
  switch (status) {
    case "IN_STOCK":
      return "Em estoque";
    case "RESERVED":
      return "Reservada";
    case "DAMAGED":
      return "Avariada";
    case "SOLD":
      return "Vendida";
    default:
      return status;
  }
}

function toneByUnitStatus(status: InventoryProductUnit["unitStatus"]) {
  switch (status) {
    case "IN_STOCK":
      return "green";
    case "RESERVED":
      return "slate";
    case "DAMAGED":
      return "amber";
    case "SOLD":
      return "orange";
    default:
      return "slate";
  }
}

function emptyToUndefined(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
