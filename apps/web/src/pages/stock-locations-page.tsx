import { useDeferredValue, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle, MapPinPlus, PencilLine, RefreshCw, Search } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSession } from "@/app/session-context";
import { InventoryFeedback, InventoryFieldError, getInventoryErrorMessage, inventorySelectClassName, inventoryTextareaClassName } from "@/features/inventory/inventory-ui";
import {
  createStockLocation,
  listStockLocations,
  updateStockLocation,
  type StockLocation
} from "@/lib/api";
import { formatCompactNumber } from "@/lib/format";
import { applyZodErrors, readFormCheckbox, readFormString } from "@/lib/form-helpers";
import { queryClient } from "@/lib/query-client";

const stockLocationFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do local."),
  description: z.string().trim().max(255, "Descricao muito longa.").optional(),
  isDefault: z.boolean().default(false),
  active: z.boolean().default(true)
});

type StockLocationFormValues = z.infer<typeof stockLocationFormSchema>;
type ActiveFilter = "active" | "inactive" | "all";

const emptyStockLocationForm: StockLocationFormValues = {
  name: "",
  description: "",
  isDefault: false,
  active: true
};

export function StockLocationsPage() {
  const { session } = useAppSession();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("all");
  const [editingLocation, setEditingLocation] = useState<StockLocation | null>(null);
  const [formFeedback, setFormFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search);

  const form = useForm<StockLocationFormValues>({
    resolver: zodResolver(stockLocationFormSchema),
    defaultValues: emptyStockLocationForm
  });

  useEffect(() => {
    form.reset(
      editingLocation
        ? {
            name: editingLocation.name,
            description: editingLocation.description ?? "",
            isDefault: editingLocation.isDefault,
            active: editingLocation.active
          }
        : emptyStockLocationForm
    );
    setFormFeedback(null);
  }, [editingLocation, form]);

  const locationsQuery = useQuery({
    queryKey: ["stock-locations", deferredSearch, activeFilter],
    queryFn: () =>
      listStockLocations(session.accessToken, {
        search: deferredSearch.trim() || undefined,
        active: activeFilter === "all" ? undefined : activeFilter === "active",
        take: 200
      })
  });

  const saveMutation = useMutation({
    mutationFn: async (values: StockLocationFormValues) => {
      const payload = {
        name: values.name.trim(),
        description: emptyToUndefined(values.description),
        isDefault: values.isDefault,
        active: values.active
      };

      if (editingLocation) {
        return updateStockLocation(session.accessToken, editingLocation.id, payload);
      }

      return createStockLocation(session.accessToken, payload);
    },
    onSuccess: async (location) => {
      setFormFeedback({
        tone: "success",
        text: editingLocation
          ? `Local ${location.name} atualizado com sucesso.`
          : `Local ${location.name} cadastrado com sucesso.`
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stock-locations"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] })
      ]);
      setEditingLocation(null);
      form.reset(emptyStockLocationForm);
    },
    onError: (error: Error) => {
      setFormFeedback({
        tone: "error",
        text: error.message
      });
    }
  });

  const locations = locationsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        description="Locais reais de estoque da loja. O local padrao e usado pelo fluxo operacional de vendas e pelas novas entradas."
        eyebrow="Estoque"
        title="Locais de estoque"
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle>Locais cadastrados</CardTitle>
            <CardDescription>
              Consulte, filtre e ajuste o status dos locais sem perder o historico de saldo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
              <div className="space-y-2">
                <Label htmlFor="location-search">Busca</Label>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="location-search"
                    className="pl-10"
                    onChange={(event) => {
                      setSearch(event.target.value);
                    }}
                    placeholder="Nome ou descricao"
                    value={search}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="location-active-filter">Status</Label>
                <select
                  className={inventorySelectClassName}
                  id="location-active-filter"
                  onChange={(event) => {
                    setActiveFilter(event.target.value as ActiveFilter);
                  }}
                  value={activeFilter}
                >
                  <option value="all">Todos</option>
                  <option value="active">Somente ativos</option>
                  <option value="inactive">Somente inativos</option>
                </select>
              </div>

              <div className="flex items-end">
                <Button
                  className="w-full"
                  onClick={() => {
                    void locationsQuery.refetch();
                  }}
                  type="button"
                  variant="outline"
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Atualizar
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard label="Locais visiveis" value={formatCompactNumber(locations.length)} />
              <MetricCard
                label="Locais ativos"
                value={formatCompactNumber(locations.filter((location) => location.active).length)}
              />
              <MetricCard
                label="Itens consolidados"
                value={formatCompactNumber(
                  locations.reduce(
                    (sum, location) => sum + location.balanceSummary.totalQuantity,
                    0
                  )
                )}
              />
            </div>

            {locationsQuery.isLoading ? (
              <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-4 text-sm text-muted-foreground">
                Carregando locais de estoque...
              </div>
            ) : null}

            {locationsQuery.error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {getInventoryErrorMessage(locationsQuery.error)}
              </div>
            ) : null}

            {!locationsQuery.isLoading && !locations.length ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
                Nenhum local encontrado com os filtros atuais.
              </div>
            ) : null}

            <div className="space-y-3">
              {locations.map((location) => (
                <div
                  key={location.id}
                  className="rounded-[1.5rem] border border-border/80 bg-card/90 p-4 shadow-sm"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-lg font-semibold">{location.name}</p>
                        {location.isDefault ? (
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            Padrao
                          </span>
                        ) : null}
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                            location.active
                              ? "border-slate-200 bg-slate-50 text-slate-700"
                              : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}
                        >
                          {location.active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {location.description || "Sem descricao operacional."}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Produtos acompanhados {formatCompactNumber(location.balanceSummary.trackedProducts)} •
                        saldo somado {formatCompactNumber(location.balanceSummary.totalQuantity)}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          setEditingLocation(location);
                        }}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <PencilLine className="mr-2 h-4 w-4" />
                        Editar
                      </Button>
                      {!location.isDefault ? (
                        <Button
                          disabled={saveMutation.isPending}
                          onClick={() => {
                            setEditingLocation(location);
                            form.reset({
                              name: location.name,
                              description: location.description ?? "",
                              isDefault: true,
                              active: true
                            });
                          }}
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          Tornar padrao
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle>{editingLocation ? "Editar local" : "Novo local"}</CardTitle>
            <CardDescription>
              {editingLocation
                ? "Ajuste o registro selecionado sem quebrar a operacao do estoque."
                : "Cadastre um novo local para separar saldo por area operacional."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setFormFeedback(null);
                const parsed = stockLocationFormSchema.safeParse(
                  readStockLocationFormValues(event.currentTarget)
                );

                if (!parsed.success) {
                  applyZodErrors(form, parsed.error);
                  setFormFeedback({
                    tone: "error",
                    text: "Nao foi possivel salvar o local. Informe ao menos o nome."
                  });
                  return;
                }

                form.clearErrors();
                saveMutation.mutate(parsed.data);
              }}
            >
              <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                O local padrao precisa ficar ativo. Para trocar o padrao, marque o novo registro como padrao.
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock-location-name">Nome</Label>
                <Input id="stock-location-name" {...form.register("name")} />
                <InventoryFieldError message={form.formState.errors.name?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="stock-location-description">Descricao</Label>
                <textarea
                  className={inventoryTextareaClassName}
                  id="stock-location-description"
                  {...form.register("description")}
                />
                <InventoryFieldError message={form.formState.errors.description?.message} />
              </div>

              <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
                <input className="h-4 w-4" type="checkbox" {...form.register("isDefault")} />
                Definir como local padrao
              </label>

              <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
                <input className="h-4 w-4" type="checkbox" {...form.register("active")} />
                Manter local ativo
              </label>

              {formFeedback ? <InventoryFeedback {...formFeedback} /> : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" disabled={saveMutation.isPending} type="submit">
                  {saveMutation.isPending ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <MapPinPlus className="mr-2 h-4 w-4" />
                      {editingLocation ? "Salvar alteracoes" : "Cadastrar local"}
                    </>
                  )}
                </Button>

                {editingLocation ? (
                  <Button
                    onClick={() => {
                      setEditingLocation(null);
                      form.reset(emptyStockLocationForm);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function readStockLocationFormValues(
  formElement: HTMLFormElement
): StockLocationFormValues {
  const formData = new FormData(formElement);

  return {
    name: readFormString(formData, "name"),
    description: readFormString(formData, "description"),
    isDefault: readFormCheckbox(formData, "isDefault"),
    active: readFormCheckbox(formData, "active")
  };
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
