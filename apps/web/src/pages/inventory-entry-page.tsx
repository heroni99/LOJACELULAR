import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import { useAppSession } from "@/app/session-context";
import { InventoryFeedback, InventoryFieldError, getInventoryErrorMessage, inventorySelectClassName, inventoryTextareaClassName } from "@/features/inventory/inventory-ui";
import {
  createInventoryEntry,
  listProducts,
  listStockLocations
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { applyZodErrors, readFormString } from "@/lib/form-helpers";
import { queryClient } from "@/lib/query-client";
import { error as toastError, success } from "@/lib/toast";

const inventoryEntrySchema = z.object({
  productId: z.string().uuid("Selecione um produto fisico valido."),
  locationId: z.string().uuid("Selecione um local de estoque valido."),
  quantity: z.coerce.number().int("Quantidade deve ser inteira.").min(1, "Informe uma quantidade maior que zero."),
  unitCost: z
    .union([z.coerce.number().int().min(0, "Custo deve ser zero ou maior."), z.literal("")])
    .optional(),
  notes: z.string().trim().max(500, "Observacao muito longa.").optional()
});

type InventoryEntryValues = z.infer<typeof inventoryEntrySchema>;

export function InventoryEntryPage() {
  const { session } = useAppSession();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const form = useForm<InventoryEntryValues>({
    resolver: zodResolver(inventoryEntrySchema),
    defaultValues: {
      productId: "",
      locationId: "",
      quantity: 1,
      unitCost: "",
      notes: ""
    }
  });

  const productsQuery = useQuery({
    queryKey: ["products", "inventory-entry"],
    queryFn: () =>
      listProducts(session.accessToken, {
        active: true,
        isService: false,
        take: 200
      })
  });

  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "inventory-entry"],
    queryFn: () => listStockLocations(session.accessToken, { active: true, take: 200 })
  });

  const selectedProduct = useMemo(
    () =>
      (productsQuery.data ?? []).find(
        (product) => product.id === form.watch("productId")
      ) ?? null,
    [form, productsQuery.data]
  );
  const selectedLocation = useMemo(
    () =>
      (locationsQuery.data ?? []).find(
        (location) => location.id === form.watch("locationId")
      ) ?? null,
    [form, locationsQuery.data]
  );

  const saveMutation = useMutation({
    mutationFn: async (values: InventoryEntryValues) =>
      createInventoryEntry(session.accessToken, {
        productId: values.productId,
        locationId: values.locationId,
        quantity: values.quantity,
        unitCost:
          typeof values.unitCost === "number" ? values.unitCost : undefined,
        notes: emptyToUndefined(values.notes)
      }),
    onSuccess: async (result) => {
      success(
        `Entrada registrada com sucesso. Saldo no local: ${result.currentQuantity}. Saldo total do produto: ${result.totalStock}.`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["pdv"] })
      ]);
      form.reset({
        productId: "",
        locationId: "",
        quantity: 1,
        unitCost: "",
        notes: ""
      });
    },
    onError: (error: Error) => {
      toastError(parseApiError(error));
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/inventory"
        subtitle="Lancamento real de entrada: grava movimento, atualiza saldo do local e permanece consistente apos refresh."
        title="Entrada de estoque"
      />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Novo lancamento de entrada</CardTitle>
          <CardDescription>
            Use este fluxo para aumentar o saldo de um produto fisico em um local ativo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFeedback(null);
              const parsed = inventoryEntrySchema.safeParse(
                readInventoryEntryFormValues(event.currentTarget)
              );

              if (!parsed.success) {
                applyZodErrors(form, parsed.error);
                setFeedback({
                  tone: "error",
                  text: "Nao foi possivel registrar a entrada. Confira produto, local e quantidade."
                });
                return;
              }

              form.clearErrors();
              saveMutation.mutate(parsed.data);
            }}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-entry-product">Produto</Label>
                <select
                  className={inventorySelectClassName}
                  id="inventory-entry-product"
                  {...form.register("productId")}
                >
                  <option value="">Selecione um produto fisico</option>
                  {(productsQuery.data ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.internalCode} • {product.name}
                      {product.hasSerialControl ? " • serializado" : ""}
                    </option>
                  ))}
                </select>
                <InventoryFieldError message={form.formState.errors.productId?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-entry-location">Local</Label>
                <select
                  className={inventorySelectClassName}
                  id="inventory-entry-location"
                  {...form.register("locationId")}
                >
                  <option value="">Selecione um local ativo</option>
                  {(locationsQuery.data ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                      {location.isDefault ? " (padrao)" : ""}
                    </option>
                  ))}
                </select>
                <InventoryFieldError message={form.formState.errors.locationId?.message} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-entry-quantity">Quantidade</Label>
                <Input
                  id="inventory-entry-quantity"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  type="number"
                  {...form.register("quantity")}
                />
                <InventoryFieldError message={form.formState.errors.quantity?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-entry-unit-cost">Custo unitario em centavos</Label>
                <Input
                  id="inventory-entry-unit-cost"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  type="number"
                  {...form.register("unitCost")}
                />
                <InventoryFieldError message={form.formState.errors.unitCost?.message} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventory-entry-notes">Observacoes</Label>
              <textarea
                className={inventoryTextareaClassName}
                id="inventory-entry-notes"
                {...form.register("notes")}
              />
              <InventoryFieldError message={form.formState.errors.notes?.message} />
            </div>

            {selectedProduct ? (
              <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                Produto selecionado: <strong>{selectedProduct.name}</strong> ({selectedProduct.internalCode})
                {selectedProduct.hasSerialControl
                  ? " • produto serializado, a entrada deve ser feita em Unidades serializadas."
                  : " • produto nao serializado."}
              </div>
            ) : null}

            {selectedProduct?.hasSerialControl ? (
              <InventoryFeedback
                text="Produto serializado nao usa este formulario. Registre a entrada em Estoque > Unidades serializadas."
                tone="error"
              />
            ) : null}

            {productsQuery.error ? (
              <InventoryFeedback
                text={getInventoryErrorMessage(productsQuery.error)}
                tone="error"
              />
            ) : null}

            {locationsQuery.error ? (
              <InventoryFeedback
                text={getInventoryErrorMessage(locationsQuery.error)}
                tone="error"
              />
            ) : null}

            {feedback ? <InventoryFeedback {...feedback} /> : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <LoadingButton
                className="flex-1"
                isLoading={saveMutation.isPending}
                loadingText="Gravando entrada..."
                type="submit"
              >
                <PackagePlus className="mr-2 h-4 w-4" />
                Registrar entrada
              </LoadingButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function readInventoryEntryFormValues(
  formElement: HTMLFormElement
): InventoryEntryValues {
  const formData = new FormData(formElement);
  const unitCost = readFormString(formData, "unitCost").trim();

  return {
    productId: readFormString(formData, "productId"),
    locationId: readFormString(formData, "locationId"),
    quantity: Number(readFormString(formData, "quantity")),
    unitCost: unitCost ? Number(unitCost) : "",
    notes: readFormString(formData, "notes")
  };
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
