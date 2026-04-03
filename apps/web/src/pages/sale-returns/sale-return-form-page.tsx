import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type UseFormRegisterReturn } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  createSaleReturn,
  getSale,
  listSales,
  listStockLocations,
  type RefundTypeName
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCurrency, parseCurrencyToCents } from "@/lib/format";
import { success } from "@/lib/toast";
import {
  AdvancedFeedback,
  advancedSelectClassName,
  advancedTextareaClassName,
  formatRefundType
} from "@/pages/advanced/advanced-shared";

const itemSchema = z.object({
  saleItemId: z.string().uuid(),
  quantity: z.string().trim().default("0"),
  amount: z.string().trim().default("0.00"),
  returnToStock: z.boolean(),
  locationId: z.string().optional()
});

const formSchema = z.object({
  saleId: z.string().uuid("Selecione a venda."),
  reason: z.string().trim().min(1, "Informe o motivo da devolucao."),
  refundType: z.enum(["CASH", "STORE_CREDIT", "EXCHANGE", "PIX", "CARD_REVERSAL"]),
  items: z.array(itemSchema)
});

type FormValues = z.infer<typeof formSchema>;

export function SaleReturnFormPage() {
  const navigate = useNavigate();
  const { session } = useAppSession();
  const [searchParams] = useSearchParams();
  const initialSaleId = searchParams.get("saleId") ?? "";
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const salesQuery = useQuery({
    queryKey: ["sales", "sale-return-form"],
    queryFn: () => listSales(session.accessToken, { take: 120 })
  });
  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "sale-return-form"],
    queryFn: () => listStockLocations(session.accessToken, { active: true, take: 150 })
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      saleId: initialSaleId,
      reason: "",
      refundType: "STORE_CREDIT",
      items: []
    }
  });
  const fieldArray = useFieldArray({
    control: form.control,
    name: "items"
  });
  const selectedSaleId = form.watch("saleId");

  const saleQuery = useQuery({
    queryKey: ["sales", "sale-return-form", selectedSaleId],
    queryFn: () => getSale(session.accessToken, selectedSaleId),
    enabled: Boolean(selectedSaleId)
  });

  useEffect(() => {
    if (!saleQuery.data) {
      return;
    }

    form.reset({
      saleId: saleQuery.data.id,
      reason: form.getValues("reason"),
      refundType: form.getValues("refundType"),
      items: saleQuery.data.items.map((item) => ({
        saleItemId: item.id,
        quantity: "0",
        amount: (item.totalPrice / 100).toFixed(2),
        returnToStock: !item.product.isService,
        locationId: ""
      }))
    });
  }, [form, saleQuery.data]);

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) =>
      createSaleReturn(session.accessToken, {
        saleId: values.saleId,
        reason: values.reason,
        refundType: values.refundType as RefundTypeName,
        items: values.items
          .filter((item) => Number(item.quantity) > 0)
          .map((item) => ({
            saleItemId: item.saleItemId,
            quantity: Number(item.quantity),
            amount: parseCurrencyToCents(item.amount),
            returnToStock: item.returnToStock,
            locationId: item.locationId || undefined
          }))
      }),
    onSuccess: (record) => {
      success("Devolucao registrada com sucesso.");
      navigate(`/sale-returns/${record.id}`);
    },
    onError: (error: Error) => setFeedback({ tone: "error", text: parseApiError(error) })
  });

  const selectedSale = saleQuery.data;
  const totalSelected = form
    .watch("items")
    .reduce(
      (sum, item) =>
        Number(item.quantity || 0) > 0 ? sum + parseCurrencyToCents(item.amount || "0") : sum,
      0
    );

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/sale-returns"
        subtitle="Crie a devolucao a partir de uma venda real, com retorno opcional ao estoque e reembolso coerente."
        title="Nova devolucao"
      />

      <AdvancedFeedback feedback={feedback} />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Venda selecionada" value={selectedSale?.saleNumber ?? "Nenhuma"} helper="Fonte da devolucao." />
        <MetricCard label="Itens retornados" value={String(form.watch("items").filter((item) => Number(item.quantity) > 0).length)} helper="Linhas marcadas para devolucao." />
        <MetricCard label="Valor calculado" value={formatCurrency(totalSelected)} helper="Estimativa baseada nas linhas preenchidas." />
      </div>

      <form
        className="space-y-6"
        onSubmit={form.handleSubmit((values) => {
          setFeedback(null);
          createMutation.mutate(values);
        })}
      >
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Cabecalho da devolucao</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <SelectField
              label="Venda"
              value={selectedSaleId}
              onChange={(value) => form.setValue("saleId", value, { shouldValidate: true })}
              options={[
                { label: "Selecione", value: "" },
                ...(salesQuery.data ?? []).map((sale) => ({
                  label: `${sale.saleNumber} • ${sale.customer?.name ?? "Consumidor final"} • ${formatCurrency(sale.total)}`,
                  value: sale.id
                }))
              ]}
            />
            <SelectField
              label="Tipo de reembolso"
              value={form.watch("refundType")}
              onChange={(value) => form.setValue("refundType", value as FormValues["refundType"])}
              options={[
                { label: formatRefundType("STORE_CREDIT"), value: "STORE_CREDIT" },
                { label: formatRefundType("EXCHANGE"), value: "EXCHANGE" },
                { label: formatRefundType("CASH"), value: "CASH" },
                { label: formatRefundType("PIX"), value: "PIX" },
                { label: formatRefundType("CARD_REVERSAL"), value: "CARD_REVERSAL" }
              ]}
            />
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="sale-return-reason">Motivo</Label>
              <textarea
                className={advancedTextareaClassName}
                id="sale-return-reason"
                {...form.register("reason")}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Itens da venda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedSale ? (
              <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                Selecione uma venda para montar a devolucao.
              </div>
            ) : null}

            {fieldArray.fields.map((field, index) => {
              const saleItem = selectedSale?.items.find((item) => item.id === field.saleItemId);
              const isService = saleItem?.product.isService ?? false;

              if (!saleItem) {
                return null;
              }

              return (
                <div key={field.id} className="space-y-4 rounded-[1.5rem] border border-border/70 bg-card/80 p-4">
                  <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="font-semibold">
                        {saleItem.product.internalCode} • {saleItem.product.name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Vendido: {saleItem.quantity} x {formatCurrency(saleItem.unitPrice)}
                      </p>
                      {saleItem.productUnit ? (
                        <p className="text-sm text-muted-foreground">
                          Unidade: {saleItem.productUnit.imei ?? saleItem.productUnit.serialNumber ?? saleItem.productUnit.id}
                        </p>
                      ) : null}
                    </div>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs font-medium">
                      {isService ? "Servico" : saleItem.product.hasSerialControl ? "Produto serializado" : "Produto fisico"}
                    </span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Field
                      id={`sale-return-qty-${index}`}
                      label="Quantidade devolvida"
                      registration={form.register(`items.${index}.quantity`)}
                      type="number"
                    />
                    <Field
                      id={`sale-return-amount-${index}`}
                      label="Valor do estorno (R$)"
                      registration={form.register(`items.${index}.amount`)}
                      type="number"
                    />

                    <div className="space-y-2">
                      <Label>Retorna ao estoque</Label>
                      <select
                        className={advancedSelectClassName}
                        disabled={isService}
                        onChange={(event) =>
                          form.setValue(`items.${index}.returnToStock`, event.target.value === "true")
                        }
                        value={String(form.watch(`items.${index}.returnToStock`))}
                      >
                        <option value="true">Sim</option>
                        <option value="false">Nao</option>
                      </select>
                    </div>

                    {!isService && form.watch(`items.${index}.returnToStock`) ? (
                      <SelectField
                        label="Local de retorno"
                        value={form.watch(`items.${index}.locationId`) ?? ""}
                        onChange={(value) => form.setValue(`items.${index}.locationId`, value)}
                        options={[
                          { label: "Selecione", value: "" },
                          ...(locationsQuery.data ?? []).map((location) => ({
                            label: location.name,
                            value: location.id
                          }))
                        ]}
                      />
                    ) : null}
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
          <LoadingButton
            disabled={!selectedSale}
            isLoading={createMutation.isPending}
            loadingText="Processando..."
            type="submit"
          >
            Registrar devolucao
          </LoadingButton>
        </div>
      </form>
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
