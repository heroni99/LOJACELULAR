import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
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
  createInventoryTransfer,
  listInventoryBalances,
  listProducts,
  listStockLocations
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCompactNumber } from "@/lib/format";
import { applyZodErrors, readFormString } from "@/lib/form-helpers";
import { queryClient } from "@/lib/query-client";
import { error as toastError, success } from "@/lib/toast";

const inventoryTransferSchema = z
  .object({
    productId: z.string().uuid("Selecione um produto fisico valido."),
    fromLocationId: z.string().uuid("Selecione o local de origem."),
    toLocationId: z.string().uuid("Selecione o local de destino."),
    quantity: z.coerce.number().int("Quantidade deve ser inteira.").min(1, "Informe uma quantidade maior que zero."),
    notes: z.string().trim().max(500, "Observacao muito longa.").optional()
  })
  .refine((values) => values.fromLocationId !== values.toLocationId, {
    message: "Origem e destino precisam ser diferentes.",
    path: ["toLocationId"]
  });

type InventoryTransferValues = z.infer<typeof inventoryTransferSchema>;

export function InventoryTransferPage() {
  const { session } = useAppSession();
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const form = useForm<InventoryTransferValues>({
    resolver: zodResolver(inventoryTransferSchema),
    defaultValues: {
      productId: "",
      fromLocationId: "",
      toLocationId: "",
      quantity: 1,
      notes: ""
    }
  });

  const productId = form.watch("productId");
  const fromLocationId = form.watch("fromLocationId");

  const productsQuery = useQuery({
    queryKey: ["products", "inventory-transfer"],
    queryFn: () =>
      listProducts(session.accessToken, {
        active: true,
        isService: false,
        take: 200
      })
  });

  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "inventory-transfer"],
    queryFn: () => listStockLocations(session.accessToken, { active: true, take: 200 })
  });

  const sourceBalanceQuery = useQuery({
    queryKey: ["inventory", "transfer-source-balance", productId, fromLocationId],
    queryFn: async () => {
      const rows = await listInventoryBalances(session.accessToken, {
        productId,
        locationId: fromLocationId,
        take: 1
      });

      return rows[0] ?? null;
    },
    enabled: Boolean(productId && fromLocationId)
  });

  const selectedProduct = useMemo(
    () =>
      (productsQuery.data ?? []).find((product) => product.id === productId) ?? null,
    [productId, productsQuery.data]
  );

  const availableSourceQuantity =
    sourceBalanceQuery.data?.balances.find(
      (balance) => balance.location.id === fromLocationId
    )?.quantity ?? 0;

  const saveMutation = useMutation({
    mutationFn: async (values: InventoryTransferValues) =>
      createInventoryTransfer(session.accessToken, {
        productId: values.productId,
        fromLocationId: values.fromLocationId,
        toLocationId: values.toLocationId,
        quantity: values.quantity,
        notes: emptyToUndefined(values.notes)
      }),
    onSuccess: async (result) => {
      success(
        `Transferencia registrada. Origem agora em ${result.fromCurrentQuantity} unidade(s) e destino em ${result.toCurrentQuantity}.`
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["pdv"] })
      ]);
      form.reset({
        productId: "",
        fromLocationId: "",
        toLocationId: "",
        quantity: 1,
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
        subtitle="Transferencia real entre locais: baixa a origem, soma no destino e registra dois movimentos vinculados."
        title="Transferencia entre locais"
      />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Novo movimento de transferencia</CardTitle>
          <CardDescription>
            Use este fluxo para mover saldo entre locais sem criar ou destruir quantidade indevidamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFeedback(null);
              const parsed = inventoryTransferSchema.safeParse(
                readInventoryTransferFormValues(event.currentTarget)
              );

              if (!parsed.success) {
                applyZodErrors(form, parsed.error);
                setFeedback({
                  tone: "error",
                  text: "Nao foi possivel registrar a transferencia. Confira produto, locais e quantidade."
                });
                return;
              }

              form.clearErrors();
              saveMutation.mutate(parsed.data);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="inventory-transfer-product">Produto</Label>
              <select
                className={inventorySelectClassName}
                id="inventory-transfer-product"
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

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-transfer-from">Origem</Label>
                <select
                  className={inventorySelectClassName}
                  id="inventory-transfer-from"
                  {...form.register("fromLocationId")}
                >
                  <option value="">Selecione o local de origem</option>
                  {(locationsQuery.data ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                      {location.isDefault ? " (padrao)" : ""}
                    </option>
                  ))}
                </select>
                <InventoryFieldError message={form.formState.errors.fromLocationId?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="inventory-transfer-to">Destino</Label>
                <select
                  className={inventorySelectClassName}
                  id="inventory-transfer-to"
                  {...form.register("toLocationId")}
                >
                  <option value="">Selecione o local de destino</option>
                  {(locationsQuery.data ?? []).map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                      {location.isDefault ? " (padrao)" : ""}
                    </option>
                  ))}
                </select>
                <InventoryFieldError message={form.formState.errors.toLocationId?.message} />
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="inventory-transfer-quantity">Quantidade</Label>
                <Input
                  id="inventory-transfer-quantity"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  type="number"
                  {...form.register("quantity")}
                />
                <InventoryFieldError message={form.formState.errors.quantity?.message} />
              </div>

              <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3">
                <p className="text-sm text-muted-foreground">Saldo disponivel na origem</p>
                <p className="mt-2 text-3xl font-black">
                  {formatCompactNumber(availableSourceQuantity)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {sourceBalanceQuery.isLoading
                    ? "Consultando saldo..."
                    : "Valor carregado do banco para o produto/local de origem."}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="inventory-transfer-notes">Observacoes</Label>
              <textarea
                className={inventoryTextareaClassName}
                id="inventory-transfer-notes"
                {...form.register("notes")}
              />
              <InventoryFieldError message={form.formState.errors.notes?.message} />
            </div>

            {selectedProduct?.hasSerialControl ? (
              <InventoryFeedback
                text="Produto serializado transfere por unidade em Estoque > Unidades serializadas."
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

            {sourceBalanceQuery.error ? (
              <InventoryFeedback
                text={getInventoryErrorMessage(sourceBalanceQuery.error)}
                tone="error"
              />
            ) : null}

            {feedback ? <InventoryFeedback {...feedback} /> : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <LoadingButton
                className="flex-1"
                isLoading={saveMutation.isPending}
                loadingText="Gravando transferencia..."
                type="submit"
              >
                <ArrowRightLeft className="mr-2 h-4 w-4" />
                Registrar transferencia
              </LoadingButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function readInventoryTransferFormValues(
  formElement: HTMLFormElement
): InventoryTransferValues {
  const formData = new FormData(formElement);

  return {
    productId: readFormString(formData, "productId"),
    fromLocationId: readFormString(formData, "fromLocationId"),
    toLocationId: readFormString(formData, "toLocationId"),
    quantity: Number(readFormString(formData, "quantity")),
    notes: readFormString(formData, "notes")
  };
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
