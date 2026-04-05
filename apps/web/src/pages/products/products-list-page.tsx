import { useDeferredValue, useMemo, useState, type MouseEvent } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Printer, RefreshCw, ScanBarcode } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { ProductImage } from "@/components/app/product-image";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { type DataTableColumn } from "@/components/ui/data-table";
import { ListPage } from "@/components/ui/list-page";
import {
  listCategories,
  listInventoryBalances,
  listProducts,
  listSuppliers,
  type Product
} from "@/lib/api";
import { formatCurrency } from "@/lib/format";

type ActiveFilter = "all" | "active" | "inactive";
type StockFilter = "all" | "with-stock" | "without-stock";
type CatalogMode = "product" | "service";
type CatalogRow = Product & { totalStock: number };

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function ProductsListPage({
  catalogMode = "product"
}: {
  catalogMode?: CatalogMode;
}) {
  const { authEnabled, hasPermission, session } = useAppSession();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [supplierId, setSupplierId] = useState("all");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const deferredSearch = useDeferredValue(search);
  const isServiceCatalog = catalogMode === "service";
  const basePath = isServiceCatalog ? "/services" : "/products";
  const title = isServiceCatalog ? "Servicos" : "Produtos";
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
      "list",
      catalogMode,
      deferredSearch,
      categoryId,
      supplierId,
      activeFilter
    ],
    queryFn: () =>
      listProducts(authEnabled ? session.accessToken : undefined, {
        search: deferredSearch.trim() || undefined,
        categoryId: categoryId === "all" ? undefined : categoryId,
        supplierId: supplierId === "all" ? undefined : supplierId,
        active: activeFilter === "all" ? undefined : activeFilter === "active",
        isService: isServiceCatalog
      })
  });
  const balancesQuery = useQuery({
    queryKey: ["inventory", "balances", "products-list", activeFilter],
    queryFn: () =>
      listInventoryBalances(authEnabled ? session.accessToken : undefined, {
        active: activeFilter === "all" ? undefined : activeFilter === "active"
      }),
    enabled: !isServiceCatalog
  });

  const totalStockByProductId = useMemo(() => {
    const entries = (balancesQuery.data ?? []).map((row) => [row.id, row.totalStock] as const);
    return new Map(entries);
  }, [balancesQuery.data]);

  const rows = useMemo<Array<CatalogRow>>(() => {
    const catalogRows = (productsQuery.data ?? []).map((product) => ({
      ...product,
      totalStock: isServiceCatalog ? 0 : totalStockByProductId.get(product.id) ?? 0
    }));

    if (isServiceCatalog || stockFilter === "all") {
      return catalogRows;
    }

    return catalogRows.filter((product) =>
      stockFilter === "with-stock" ? product.totalStock > 0 : product.totalStock <= 0
    );
  }, [isServiceCatalog, productsQuery.data, stockFilter, totalStockByProductId]);

  const columns = useMemo<Array<DataTableColumn<CatalogRow>>>(() => {
    const baseColumns: Array<DataTableColumn<CatalogRow>> = [
      {
        id: "internalCode",
        header: "Codigo interno",
        sortable: true,
        sortValue: (product) => product.internalCode,
        cell: (product) => (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{product.internalCode}</p>
            <p className="text-xs text-muted-foreground">
              {product.supplierCode || "Sem supplier code"}
            </p>
          </div>
        )
      },
      {
        id: "name",
        header: isServiceCatalog ? "Servico" : "Produto",
        sortable: true,
        sortValue: (product) => product.name,
        cell: (product) => (
          <div className="flex items-center gap-3">
            <ProductImage
              className="h-12 w-12 shrink-0"
              imageUrl={product.imageUrl}
              name={product.name}
            />
            <div className="space-y-1">
              <p className="font-semibold text-foreground">{product.name}</p>
              <p className="text-xs text-muted-foreground">
                {product.brand || "Sem marca"}
                {product.model ? ` / ${product.model}` : ""}
              </p>
            </div>
          </div>
        )
      },
      {
        id: "category",
        header: "Categoria",
        sortable: true,
        sortValue: (product) => product.category.name,
        cell: (product) => (
          <span className="text-muted-foreground">{product.category.name}</span>
        )
      },
      {
        id: "price",
        header: "Preco",
        sortable: true,
        sortValue: (product) => product.salePrice,
        cell: (product) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{formatCurrency(product.salePrice)}</p>
            <p className="text-xs text-muted-foreground">
              custo {formatCurrency(product.costPrice)}
            </p>
          </div>
        )
      }
    ];

    if (!isServiceCatalog) {
      baseColumns.push({
        id: "stock",
        header: "Estoque total",
        sortable: true,
        sortValue: (product) => product.totalStock,
        cell: (product) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{product.totalStock}</p>
            <p className="text-xs text-muted-foreground">
              {product.totalStock > 0 ? "Com saldo" : "Sem estoque"}
            </p>
          </div>
        )
      });

      baseColumns.push({
        id: "barcode",
        header: "Barcode",
        cell: (product) => (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {product.displayBarcode?.code ?? "Nao gerado"}
            </p>
            {product.displayBarcode ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  onClick={stopTableRowClick}
                  to={`/products/${product.id}/label`}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Etiqueta
                </Link>
              </Button>
            ) : hasPermission("products.update") ? (
              <Button asChild size="sm" variant="outline">
                <Link
                  onClick={stopTableRowClick}
                  to={`/products/${product.id}`}
                >
                  <ScanBarcode className="mr-2 h-4 w-4" />
                  Gerar
                </Link>
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Abrir detalhe do produto
              </p>
            )}
          </div>
        )
      });
    }

    baseColumns.push({
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (product) => product.active,
      cell: (product) => (
        <div className="space-y-1">
          <StatusBadge tone={product.active ? "green" : "amber"}>
            {product.active ? "Ativo" : "Inativo"}
          </StatusBadge>
          {product.needsPriceReview ? (
            <p className="text-xs text-amber-700">Revisar preco</p>
          ) : null}
        </div>
      )
    });

    return baseColumns;
  }, [hasPermission, isServiceCatalog]);

  return (
    <ListPage
      columns={columns}
      createHref={`${basePath}/new`}
      createLabel={isServiceCatalog ? "Novo servico" : "Novo produto"}
      data={rows}
      description={
        isServiceCatalog
          ? "Catalogo de servicos com filtros avancados e detalhe dedicado por item."
          : "Catalogo de produtos com filtros avancados, estoque total e acesso rapido a barcode e etiqueta."
      }
      emptyDescription={`Ajuste a busca ou os filtros para localizar o ${singularLabel} desejado.`}
      emptyTitle={`Nenhum ${singularLabel} encontrado`}
      errorMessage={getFirstErrorMessage([
        productsQuery.error,
        categoriesQuery.error,
        suppliersQuery.error,
        balancesQuery.error
      ])}
      filterActions={
        <Button
          onClick={() => {
            void Promise.all([
              productsQuery.refetch(),
              categoriesQuery.refetch(),
              suppliersQuery.refetch(),
              isServiceCatalog ? Promise.resolve() : balancesQuery.refetch()
            ]);
          }}
          type="button"
          variant="outline"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      }
      getRowHref={(product) => `${basePath}/${product.id}`}
      initialSort={{ columnId: "internalCode", direction: "asc" }}
      loading={productsQuery.isLoading || (!isServiceCatalog && balancesQuery.isLoading)}
      pageResetKey={[
        catalogMode,
        deferredSearch,
        categoryId,
        supplierId,
        activeFilter,
        stockFilter
      ].join(":")}
      rowKey={(product) => product.id}
      searchPlaceholder={
        isServiceCatalog
          ? "Buscar por nome ou codigo interno"
          : "Buscar por nome, codigo interno ou supplier code"
      }
      searchValue={search}
      title={title}
      onSearchChange={setSearch}
      advancedFilters={
        <>
          <SelectField
            id={`${catalogMode}-category-filter`}
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
            id={`${catalogMode}-active-filter`}
            label="Status"
            onChange={(value) => setActiveFilter(value as ActiveFilter)}
            options={[
              { label: "Somente ativos", value: "active" },
              { label: "Somente inativos", value: "inactive" },
              { label: "Todos", value: "all" }
            ]}
            value={activeFilter}
          />
          {!isServiceCatalog ? (
            <SelectField
              id="product-stock-filter"
              label="Estoque"
              onChange={(value) => setStockFilter(value as StockFilter)}
              options={[
                { label: "Todos", value: "all" },
                { label: "Com estoque", value: "with-stock" },
                { label: "Sem estoque", value: "without-stock" }
              ]}
              value={stockFilter}
            />
          ) : null}
          <SelectField
            id={`${catalogMode}-supplier-filter`}
            label="Fornecedor"
            onChange={setSupplierId}
            options={[
              { label: "Todos", value: "all" },
              ...(suppliersQuery.data ?? []).map((supplier) => ({
                label: supplier.tradeName || supplier.name,
                value: supplier.id
              }))
            ]}
            value={supplierId}
          />
        </>
      }
    />
  );
}

function stopTableRowClick(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
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
  options: Array<{ label: string; value: string }>;
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
        onChange={(event) => onChange(event.target.value)}
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

function getFirstErrorMessage(errors: unknown[]) {
  const firstError = errors.find((error): error is Error => error instanceof Error);
  return firstError?.message ?? null;
}
