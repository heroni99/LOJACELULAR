import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, PencilLine, Plus, RefreshCw, Search } from "lucide-react";
import { ProductImage } from "@/components/app/product-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/app/page-header";
import {
  listCategories,
  listProducts,
  listSuppliers,
  updateProductActive,
  type Product
} from "@/lib/api";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { useAppSession } from "@/app/session-context";

type ActiveFilter = "all" | "active" | "inactive";
type CatalogMode = "product" | "service";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ProductsListPage({
  catalogMode = "product"
}: {
  catalogMode?: CatalogMode;
}) {
  const { authEnabled, session } = useAppSession();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [supplierId, setSupplierId] = useState("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const isServiceCatalog = catalogMode === "service";
  const catalogLabel = isServiceCatalog ? "Servicos" : "Produtos";
  const singularLabel = isServiceCatalog ? "servico" : "produto";

  const categoriesQuery = useQuery({
    queryKey: ["categories", "active-for-products"],
    queryFn: () =>
      listCategories(authEnabled ? session.accessToken : undefined, { active: true })
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "active-for-products"],
    queryFn: () =>
      listSuppliers(authEnabled ? session.accessToken : undefined, { active: true })
  });
  const productsQuery = useQuery({
    queryKey: [
      "products",
      catalogMode,
      search,
      categoryId,
      supplierId,
      activeFilter
    ],
    queryFn: () =>
      listProducts(authEnabled ? session.accessToken : undefined, {
        search: search.trim() || undefined,
        categoryId: categoryId === "all" ? undefined : categoryId,
        supplierId: supplierId === "all" ? undefined : supplierId,
        active:
          activeFilter === "all" ? undefined : activeFilter === "active",
        isService: isServiceCatalog
      })
  });

  const toggleMutation = useMutation({
    mutationFn: (product: Product) =>
      updateProductActive(
        authEnabled ? session.accessToken : undefined,
        product.id,
        !product.active
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  });

  const products = productsQuery.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild>
            <Link to={isServiceCatalog ? "/services/new" : "/products/new"}>
              <Plus className="mr-2 h-4 w-4" />
              {isServiceCatalog ? "Novo servico" : "Novo produto"}
            </Link>
          </Button>
        }
        description={
          isServiceCatalog
            ? "Catalogo de servicos com busca por nome, codigo interno, codigo alternativo, categoria e fornecedor quando aplicavel."
            : "Catalogo comercial com busca por nome, internal code, supplier code, codigo alternativo e IMEI/serial."
        }
        eyebrow="Cadastros"
        title={catalogLabel}
      />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_220px_220px_180px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="product-search">
              Busca
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                id="product-search"
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Nome, internal code, supplier code, codigo alternativo ou IMEI"
                value={search}
              />
            </div>
          </div>

          <SelectField
            id="product-category-filter"
            label="Categoria"
            onChange={setCategoryId}
            options={[
              { label: "Todas", value: "all" },
              ...(categoriesQuery.data ?? []).map((category) => ({
                label: category.name,
                value: category.id
              }))
            ]}
            value={categoryId}
          />

          <SelectField
            id="product-supplier-filter"
            label="Fornecedor"
            onChange={setSupplierId}
            options={[
              { label: "Todos", value: "all" },
              ...(suppliersQuery.data ?? []).map((supplier) => ({
                label: supplier.name,
                value: supplier.id
              }))
            ]}
            value={supplierId}
          />

          <SelectField
            id="product-active-filter"
            label="Status"
            onChange={(value) => {
              setActiveFilter(value as ActiveFilter);
            }}
            options={[
              { label: "Somente ativos", value: "active" },
              { label: "Somente inativos", value: "inactive" },
              { label: "Todos", value: "all" }
            ]}
            value={activeFilter}
          />

          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() => {
                void productsQuery.refetch();
              }}
              type="button"
              variant="outline"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryTile label={`${catalogLabel} visiveis`} value={formatCompactNumber(products.length)} />
        <SummaryTile
          label={isServiceCatalog ? "Servicos ativos" : "Itens para revisar preco"}
          value={formatCompactNumber(
            isServiceCatalog
              ? products.filter((product) => product.active).length
              : products.filter((product) => product.needsPriceReview).length
          )}
        />
        <SummaryTile
          label={isServiceCatalog ? "Sem fornecedor" : "Com codigos alternativos"}
          value={formatCompactNumber(
            isServiceCatalog
              ? products.filter((product) => !product.supplierId).length
              : products.filter((product) => product.codes.length > 0).length
          )}
        />
      </div>

      <Card className="bg-white/90">
        <CardContent className="p-0">
          {productsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando catalogo...</div>
          ) : null}

          {productsQuery.error ? (
            <div className="p-6 text-sm text-red-700">
              {(productsQuery.error as Error).message}
            </div>
          ) : null}

          {!productsQuery.isLoading && !products.length ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhum {singularLabel} encontrado com os filtros atuais.
            </div>
          ) : null}

          {products.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Codigo</th>
                    <th className="px-4 py-3 font-medium">{isServiceCatalog ? "Servico" : "Produto"}</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 font-medium">Fornecedor</th>
                    <th className="px-4 py-3 font-medium">Precos</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className="border-b border-border/60 align-top">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{product.internalCode}</p>
                          <p className="text-xs text-muted-foreground">
                            {product.supplierCode || "Sem supplier_code"}
                          </p>
                          {product.codes[0] ? (
                            <p className="text-xs text-muted-foreground">
                              alt. principal {product.codes[0].code}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <ProductImage
                            className="h-14 w-14 shrink-0"
                            imageUrl={product.imageUrl}
                            name={product.name}
                          />
                          <div className="space-y-1">
                            <p className="font-semibold">{product.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {product.brand || "Sem marca"}
                              {product.model ? ` / ${product.model}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {product.category.name}
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {product.supplier?.tradeName || product.supplier?.name || "Sem fornecedor"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-medium">{formatCurrency(product.salePrice)}</p>
                          <p className="text-xs text-muted-foreground">
                            custo {formatCurrency(product.costPrice)}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <StatusBadge tone={product.active ? "green" : "amber"}>
                            {product.active ? "Ativo" : "Inativo"}
                          </StatusBadge>
                          {product.isService ? (
                            <StatusBadge tone="slate">Servico</StatusBadge>
                          ) : null}
                          {product.needsPriceReview ? (
                            <StatusBadge tone="orange">Revisar preco</StatusBadge>
                          ) : null}
                          {product.codes.length ? (
                            <StatusBadge tone="slate">{product.codes.length} codigos</StatusBadge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          <Button asChild size="sm" variant="outline">
                            <Link to={`${isServiceCatalog ? "/services" : "/products"}/${product.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              Ver
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link to={`${isServiceCatalog ? "/services" : "/products"}/${product.id}/edit`}>
                              <PencilLine className="mr-2 h-4 w-4" />
                              Editar
                            </Link>
                          </Button>
                          <Button
                            disabled={toggleMutation.isPending}
                            onClick={() => {
                              toggleMutation.mutate(product);
                            }}
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            {product.active ? "Inativar" : "Ativar"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-2 p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-black tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  children,
  tone
}: {
  children: ReactNode;
  tone: "green" | "amber" | "orange" | "slate";
}) {
  const toneClassName = {
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    orange: "border-orange-200 bg-orange-50 text-orange-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700"
  }[tone];

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${toneClassName}`}
    >
      {children}
    </span>
  );
}

function SelectField({
  id,
  label,
  onChange,
  options,
  value
}: {
  id: string;
  label: string;
  onChange(nextValue: string): void;
  options: { label: string; value: string }[];
  value: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <select
        className={selectClassName}
        id={id}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        value={value}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
