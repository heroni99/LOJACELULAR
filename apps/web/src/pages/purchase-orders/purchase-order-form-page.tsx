import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm, type UseFormRegisterReturn } from "react-hook-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createPurchaseOrder, listProducts, listSuppliers } from "@/lib/api";
import { formatCurrency, parseCurrencyToCents } from "@/lib/format";
import {
  AdvancedFeedback,
  advancedSelectClassName,
  advancedTextareaClassName
} from "@/pages/advanced/advanced-shared";

const itemSchema = z.object({
  productId: z.string().uuid("Selecione o produto."),
  description: z.string().trim().min(1, "Informe a descricao."),
  quantity: z.string().trim().min(1, "Informe a quantidade."),
  unitCost: z.string().trim().min(1, "Informe o custo unitario.")
});

const formSchema = z.object({
  supplierId: z.string().uuid("Selecione o fornecedor."),
  notes: z.string().trim().optional(),
  discountAmount: z.string().trim().optional(),
  items: z.array(itemSchema).min(1, "Adicione ao menos um item.")
});

type FormValues = z.infer<typeof formSchema>;

export function PurchaseOrderFormPage() {
  const navigate = useNavigate();
  const { session } = useAppSession();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "purchase-orders-form"],
    queryFn: () => listSuppliers(session.accessToken, { active: true, take: 150 })
  });
  const productsQuery = useQuery({
    queryKey: ["products", "purchase-orders-form"],
    queryFn: () => listProducts(session.accessToken, { active: true, isService: false, take: 200 })
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      supplierId: "",
      notes: "",
      discountAmount: "",
      items: [{ productId: "", description: "", quantity: "1", unitCost: "0.00" }]
    }
  });
  const fieldArray = useFieldArray({
    control: form.control,
    name: "items"
  });

  const createMutation = useMutation({
    mutationFn: async (values: FormValues) =>
      createPurchaseOrder(session.accessToken, {
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
    onSuccess: (order) => navigate(`/purchase-orders/${order.id}`),
    onError: (error: Error) => setFeedback({ tone: "error", text: error.message })
  });

  const watchItems = form.watch("items");
  const estimatedTotal = watchItems.reduce((sum, item) => {
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCost || 0);
    return sum + Math.round(quantity * unitCost * 100);
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compras"
        title="Novo pedido de compra"
        description="Monte o pedido em rascunho, vincule fornecedor e prepare o recebimento real em estoque."
        actions={
          <Button asChild type="button" variant="outline">
            <Link to="/purchase-orders">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
      />

      <AdvancedFeedback feedback={feedback} />

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Itens em compra" value={String(watchItems.length)} helper="Linhas planejadas para o pedido." />
        <MetricCard label="Valor bruto" value={formatCurrency(estimatedTotal)} helper="Antes do desconto informado." />
        <MetricCard
          label="Serializados no pedido"
          value={String(
            watchItems.filter((item) =>
              (productsQuery.data ?? []).find((product) => product.id === item.productId)?.hasSerialControl
            ).length
          )}
          helper="Linhas que exigirao unidades no recebimento."
        />
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
            <CardTitle className="text-xl">Cabecalho</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <SelectField
              label="Fornecedor"
              options={[
                { label: "Selecione", value: "" },
                ...(suppliersQuery.data ?? []).map((supplier) => ({
                  label: supplier.tradeName ?? supplier.name,
                  value: supplier.id
                }))
              ]}
              value={form.watch("supplierId")}
              onChange={(value) => form.setValue("supplierId", value, { shouldValidate: true })}
            />
            <Field id="purchase-order-discount" label="Desconto (R$)" registration={form.register("discountAmount")} type="number" />
            <div className="space-y-2 lg:col-span-2">
              <Label htmlFor="purchase-order-notes">Observacoes</Label>
              <textarea
                className={advancedTextareaClassName}
                id="purchase-order-notes"
                {...form.register("notes")}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader className="flex flex-row items-center justify-between gap-4">
            <div>
              <CardTitle className="text-xl">Itens</CardTitle>
              <p className="text-sm text-muted-foreground">
                Produtos fisicos que serao recebidos futuramente no estoque.
              </p>
            </div>
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
              <Plus className="mr-2 h-4 w-4" />
              Adicionar item
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {fieldArray.fields.map((field, index) => (
              <div
                key={field.id}
                className="space-y-4 rounded-[1.5rem] border border-border/70 bg-card/80 p-4"
              >
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
                    options={[
                      { label: "Selecione", value: "" },
                      ...(productsQuery.data ?? []).map((product) => ({
                        label: `${product.internalCode} • ${product.name}`,
                        value: product.id
                      }))
                    ]}
                    value={form.watch(`items.${index}.productId`)}
                    onChange={(value) => form.setValue(`items.${index}.productId`, value, { shouldValidate: true })}
                  />
                  <Field id={`purchase-order-qty-${index}`} label="Quantidade" registration={form.register(`items.${index}.quantity`)} type="number" />
                  <Field id={`purchase-order-cost-${index}`} label="Custo unitario (R$)" registration={form.register(`items.${index}.unitCost`)} type="number" />
                  <div className="space-y-2 lg:col-span-2">
                    <Label htmlFor={`purchase-order-description-${index}`}>Descricao</Label>
                    <textarea
                      className={advancedTextareaClassName}
                      id={`purchase-order-description-${index}`}
                      {...form.register(`items.${index}.description`)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {createMutation.error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {(createMutation.error as Error).message}
          </div>
        ) : null}

        <div className="flex justify-end">
          <Button disabled={createMutation.isPending} type="submit">
            {createMutation.isPending ? "Salvando..." : "Criar pedido"}
          </Button>
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
