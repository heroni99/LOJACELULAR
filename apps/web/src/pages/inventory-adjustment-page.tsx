import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSession } from "@/app/session-context";
import { InventoryFeedback, InventoryFieldError, getInventoryErrorMessage, inventorySelectClassName, inventoryTextareaClassName } from "@/features/inventory/inventory-ui";
import {
  createInventoryAdjustment,
  listInventoryBalances,
  listProducts,
  listStockLocations
} from "@/lib/api";
import { formatCompactNumber } from "@/lib/format";
import { applyZodErrors, readFormString } from "@/lib/form-helpers";
import { queryClient } from "@/lib/query-client";

const inventoryAdjustmentSchema = z.object({
  productId: z.string().uuid("Selecione um produto fisico valido."),
  locationId: z.string().uuid("Selecione um local de estoque valido."),
  countedQuantity: z.coerce.number().int("Saldo contado deve ser inteiro.").min(0, "Saldo contado nao pode ser negativo."),
  reason: z.string().trim().min(1, "Informe o motivo do ajuste.").max(255, "Motivo muito longo.")
});

type InventoryAdjustmentValues = z.infer<typeof inventoryAdjustmentSchema>;

export function InventoryAdjustmentPage() {
  const { session } = useAppSession();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const form = useForm<InventoryAdjustmentValues>({
    resolver: zodResolver(inventoryAdjustmentSchema),
    defaultValues: {
      productId: "",
      locationId: "",
      countedQuantity: 0,
      reason: ""
    }
  });

  const productId = form.watch("productId");
  const locationId = form.watch("locationId");

  const productsQuery = useQuery({
    queryKey: ["products", "inventory-adjustment"],
    queryFn: () =>
      listProducts(session.accessToken, {
        active: true,
        isService: false,
        take: 200
      })
  });

  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "inventory-adjustment"],
    queryFn: () => listStockLocations(session.accessToken, { active: true, take: 200 })
  });

  const currentBalanceQuery = useQuery({
    queryKey: ["inventory", "balance-preview", productId, locationId],
    queryFn: async () => {
      const rows = await listInventoryBalances(session.accessToken, {
        productId,
        locationId,
        take: 1
      });

      return rows[0] ?? null;
    },
    enabled: Boolean(productId && locationId)
  });

  const selectedProduct = useMemo(
    () =>
      (productsQuery.data ?? []).find((product) => product.id === productId) ?? null,
    [productId, productsQuery.data]
  );
  const selectedLocation = useMemo(
    () =>
      (locationsQuery.data ?? []).find((location) => location.id === locationId) ?? null,
    [locationId, locationsQuery.data]
  );
  const currentQuantity =
    currentBalanceQuery.data?.balances.find((balance) => balance.location.id === locationId)
      ?.quantity ?? 0;

  const saveMutation = useMutation({
    mutationFn: async (values: InventoryAdjustmentValues) =>
      createInventoryAdjustment(session.accessToken, values),
    onSuccess: async (result) => {
      const direction = result.delta > 0 ? "acrescentou" : "reduziu";
      setFeedback({
        tone: "success",
        text: `Ajuste gravado com sucesso. O saldo ${direction} ${Math.abs(result.delta)} unidade(s) e agora esta em ${result.currentQuantity}.`
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["pdv"] })
      ]);
      form.reset({
        productId: "",
        locationId: "",
        countedQuantity: 0,
        reason: ""
      });
    },
    onError: (error: Error) => {
      setFeedback({
        tone: "error",
        text: error.message
      });
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link to="/inventory">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar ao estoque
            </Link>
          </Button>
        }
        description="Ajuste com rastreabilidade: o sistema registra a diferenca em `stock_movements` e corrige o `stock_balances` do local."
        eyebrow="Estoque"
        title="Ajuste de estoque"
      />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Ajuste por saldo contado</CardTitle>
          <CardDescription>
            Informe o saldo real contado no local e o motivo do ajuste. O sistema calcula a diferenca automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFeedback(null);
              const parsed = inventoryAdjustmentSchema.safeParse(
                readInventoryAdjustmentFormValues(event.currentTarget)
              );

              if (!parsed.success) {
                applyZodErrors(form, parsed.error);
                setFeedback({
                  tone: "error",
                  text: "Nao foi possivel registrar o ajuste. Confira produto, local, saldo contado e motivo."
                });
                return;
              }

              form.clearErrors();
              saveMutation.mutate(parsed.data);
            }}
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-adjustment-product">Produto</Label>
                <select
                  className={inventorySelectClassName}
                  id="inventory-adjustment-product"
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
                <Label htmlFor="inventory-adjustment-location">Local</Label>
                <select
                  className={inventorySelectClassName}
                  id="inventory-adjustment-location"
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
                <Label htmlFor="inventory-adjustment-counted">Saldo contado</Label>
                <Input
                  id="inventory-adjustment-counted"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  type="number"
                  {...form.register("countedQuantity")}
                />
                <InventoryFieldError message={form.formState.errors.countedQuantity?.message} />
              </div>

              <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
                <p className="text-sm text-muted-foreground">Saldo atual no local</p>
                <p className="mt-2 text-3xl font-black">{formatCompactNumber(currentQuantity)}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {currentBalanceQuery.isLoading
                    ? "Consultando saldo atual..."
                    : "Valor carregado do banco para o produto/local selecionados."}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventory-adjustment-reason">Motivo</Label>
              <textarea
                className={inventoryTextareaClassName}
                id="inventory-adjustment-reason"
                {...form.register("reason")}
              />
              <InventoryFieldError message={form.formState.errors.reason?.message} />
            </div>

            {selectedProduct?.hasSerialControl ? (
              <InventoryFeedback
                text="Produto serializado nao usa ajuste agregado. Altere o status ou identificadores em Estoque > Unidades serializadas."
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

            {currentBalanceQuery.error ? (
              <InventoryFeedback
                text={getInventoryErrorMessage(currentBalanceQuery.error)}
                tone="error"
              />
            ) : null}

            {feedback ? <InventoryFeedback {...feedback} /> : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Gravando ajuste...
                  </>
                ) : (
                  <>
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Registrar ajuste
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function readInventoryAdjustmentFormValues(
  formElement: HTMLFormElement
): InventoryAdjustmentValues {
  const formData = new FormData(formElement);

  return {
    productId: readFormString(formData, "productId"),
    locationId: readFormString(formData, "locationId"),
    countedQuantity: Number(readFormString(formData, "countedQuantity")),
    reason: readFormString(formData, "reason")
  };
}
