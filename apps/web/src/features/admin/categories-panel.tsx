import { useDeferredValue, useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { LoaderCircle, PencilLine, RefreshCw, Search, Tags } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createCategory,
  deactivateCategory,
  listCategories,
  updateCategory,
  type Category
} from "@/lib/api";
import { applyZodErrors, readFormCheckbox, readFormString } from "@/lib/form-helpers";
import { queryClient } from "@/lib/query-client";

const categoryFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome da categoria."),
  prefix: z
    .string()
    .trim()
    .min(2, "Prefixo muito curto.")
    .max(16, "Prefixo muito longo."),
  description: z.string().trim().optional(),
  defaultSerialized: z.boolean().default(false),
  sequenceName: z
    .string()
    .trim()
    .min(3, "Informe a sequence_name.")
    .max(64, "sequence_name muito longa."),
  active: z.boolean().default(true)
});

type CategoriesPanelProps = {
  token?: string;
};

type CategoryFormValues = z.infer<typeof categoryFormSchema>;
type ActiveFilter = "active" | "inactive" | "all";

const emptyCategoryForm: CategoryFormValues = {
  name: "",
  prefix: "",
  description: "",
  defaultSerialized: false,
  sequenceName: "",
  active: true
};

const textareaClassName =
  "min-h-[120px] w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function CategoriesPanel({ token }: CategoriesPanelProps) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [formFeedback, setFormFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search);

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: emptyCategoryForm
  });

  useEffect(() => {
    form.reset(editingCategory ? toCategoryFormValues(editingCategory) : emptyCategoryForm);
    setFormFeedback(null);
  }, [editingCategory, form]);

  const categoriesQuery = useQuery({
    queryKey: ["categories", deferredSearch, activeFilter],
    queryFn: () =>
      listCategories(token, {
        search: deferredSearch.trim() || undefined,
        active:
          activeFilter === "all" ? undefined : activeFilter === "active"
      })
  });

  const saveMutation = useMutation({
    mutationFn: async (values: CategoryFormValues) => {
      const payload = toCategoryPayload(values);

      if (editingCategory) {
        return updateCategory(token, editingCategory.id, payload);
      }

      return createCategory(token, payload);
    },
    onSuccess: async () => {
      setFormFeedback({
        tone: "success",
        text: editingCategory
          ? "Categoria atualizada com sucesso."
          : "Categoria cadastrada com sucesso."
      });
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditingCategory(null);
      form.reset(emptyCategoryForm);
    },
    onError: (error: Error) => {
      setFormFeedback({ tone: "error", text: error.message });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (category: Category) => {
      if (category.active) {
        return deactivateCategory(token, category.id);
      }

      return updateCategory(token, category.id, { active: true });
    },
    onSuccess: async (_, category) => {
      if (editingCategory?.id === category.id) {
        setEditingCategory(null);
      }

      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  const categories = categoriesQuery.data ?? [];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_360px]">
      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Categorias</CardTitle>
          <CardDescription>
            Defina prefixos, sequence_name e o comportamento padrao de serializacao.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto]">
            <div className="space-y-2">
              <Label htmlFor="category-search">Busca</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  id="category-search"
                  onChange={(event) => {
                    setSearch(event.target.value);
                  }}
                  placeholder="Nome, prefixo ou sequence_name"
                  value={search}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-active-filter">Status</Label>
              <select
                className={selectClassName}
                id="category-active-filter"
                onChange={(event) => {
                  setActiveFilter(event.target.value as ActiveFilter);
                }}
                value={activeFilter}
              >
                <option value="active">Somente ativos</option>
                <option value="inactive">Somente inativos</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => {
                  void categoriesQuery.refetch();
                }}
                type="button"
                variant="outline"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>

          {categoriesQuery.isLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Carregando categorias...
            </div>
          ) : null}

          {categoriesQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(categoriesQuery.error)}
            </div>
          ) : null}

          {!categoriesQuery.isLoading && !categories.length ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
              Nenhuma categoria encontrada com os filtros atuais.
            </div>
          ) : null}

          <div className="space-y-3">
            {categories.map((category) => (
              <div
                key={category.id}
                className="rounded-[1.5rem] border border-border/80 bg-card/90 p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{category.name}</p>
                      <span
                        className={cnBadge(
                          category.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {category.active ? "Ativo" : "Inativo"}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Prefixo {category.prefix} • {category.sequenceName}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {category.defaultSerialized
                        ? "Serializado por padrao"
                        : "Nao serializado por padrao"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => {
                        setEditingCategory(category);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <PencilLine className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      disabled={toggleActiveMutation.isPending}
                      onClick={() => {
                        const action = category.active ? "inativar" : "reativar";
                        const confirmed = window.confirm(
                          `Deseja ${action} a categoria ${category.name}?`
                        );

                        if (confirmed) {
                          toggleActiveMutation.mutate(category);
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {category.active ? "Inativar" : "Reativar"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>{editingCategory ? "Editar categoria" : "Nova categoria"}</CardTitle>
          <CardDescription>
            {editingCategory
              ? "Ajuste os dados da categoria selecionada."
              : "Cadastre prefixo e sequence_name para o codigo interno dos produtos."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFormFeedback(null);
              const parsed = categoryFormSchema.safeParse(
                readCategoryFormValues(event.currentTarget)
              );

              if (!parsed.success) {
                applyZodErrors(form, parsed.error);
                setFormFeedback({
                  tone: "error",
                  text: "Revise os campos destacados antes de salvar a categoria."
                });
                return;
              }

              form.clearErrors();
              saveMutation.mutate(parsed.data);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="category-name">Nome</Label>
              <Input id="category-name" {...form.register("name")} />
              <FieldError message={form.formState.errors.name?.message} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="category-prefix">Prefixo</Label>
                <Input id="category-prefix" {...form.register("prefix")} />
                <FieldError message={form.formState.errors.prefix?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-sequence-name">sequence_name</Label>
                <Input id="category-sequence-name" {...form.register("sequenceName")} />
                <FieldError message={form.formState.errors.sequenceName?.message} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category-description">Descricao</Label>
              <textarea
                className={textareaClassName}
                id="category-description"
                {...form.register("description")}
              />
              <FieldError message={form.formState.errors.description?.message} />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
              <input
                className="h-4 w-4"
                type="checkbox"
                {...form.register("defaultSerialized")}
              />
              Categoria serializada por padrao
            </label>

            {editingCategory ? (
              <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
                <input className="h-4 w-4" type="checkbox" {...form.register("active")} />
                Manter categoria ativa
              </label>
            ) : null}

            {formFeedback ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  formFeedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {formFeedback.text}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? (
                  <>
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Tags className="mr-2 h-4 w-4" />
                    {editingCategory ? "Salvar alteracoes" : "Cadastrar categoria"}
                  </>
                )}
              </Button>

              {editingCategory ? (
                <Button
                  onClick={() => {
                    setEditingCategory(null);
                    form.reset(emptyCategoryForm);
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
  );
}

function toCategoryFormValues(category: Category): CategoryFormValues {
  return {
    name: category.name,
    prefix: category.prefix,
    description: category.description ?? "",
    defaultSerialized: category.defaultSerialized,
    sequenceName: category.sequenceName,
    active: category.active
  };
}

function toCategoryPayload(values: CategoryFormValues) {
  return {
    name: values.name.trim(),
    prefix: values.prefix.trim().toUpperCase(),
    description: emptyToUndefined(values.description),
    defaultSerialized: values.defaultSerialized,
    sequenceName: values.sequenceName.trim(),
    active: values.active
  };
}

function readCategoryFormValues(formElement: HTMLFormElement): CategoryFormValues {
  const formData = new FormData(formElement);

  return {
    name: readFormString(formData, "name"),
    prefix: readFormString(formData, "prefix"),
    description: readFormString(formData, "description"),
    defaultSerialized: readFormCheckbox(formData, "defaultSerialized"),
    sequenceName: readFormString(formData, "sequenceName"),
    active: readFormCheckbox(formData, "active")
  };
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nao foi possivel concluir a operacao.";
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-red-600">{message}</p> : null;
}

function cnBadge(className: string) {
  return `inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`;
}
