import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn, type DataTableSort } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";

type ListPageProps<TData> = {
  title: string;
  description?: string;
  data: TData[];
  columns: Array<DataTableColumn<TData>>;
  rowKey: (row: TData) => string;
  searchValue: string;
  onSearchChange: (nextValue: string) => void;
  searchPlaceholder?: string;
  advancedFilters?: ReactNode;
  filtersDefaultOpen?: boolean;
  createHref?: string;
  createLabel?: string;
  loading?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  pageSize?: number;
  initialSort?: DataTableSort | null;
  pageResetKey?: string;
  getRowHref?: (row: TData) => string;
  filterActions?: ReactNode;
  errorMessage?: string | null;
};

export function ListPage<TData>({
  title,
  description,
  data,
  columns,
  rowKey,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Buscar",
  advancedFilters,
  filtersDefaultOpen = false,
  createHref,
  createLabel = "Novo",
  loading = false,
  emptyTitle,
  emptyDescription,
  pageSize = 10,
  initialSort = null,
  pageResetKey,
  getRowHref,
  filterActions,
  errorMessage
}: ListPageProps<TData>) {
  const navigate = useNavigate();
  const [filtersOpen, setFiltersOpen] = useState(filtersDefaultOpen);
  const [pageIndex, setPageIndex] = useState(0);
  const [sort, setSort] = useState<DataTableSort | null>(initialSort);

  useEffect(() => {
    setPageIndex(0);
  }, [pageResetKey]);

  const sortedData = useMemo(() => {
    if (!sort) {
      return data;
    }

    const column = columns.find((entry) => entry.id === sort.columnId);

    if (!column?.sortable || !column.sortValue) {
      return data;
    }

    return [...data].sort((left, right) => {
      const leftValue = normalizeSortValue(column.sortValue?.(left));
      const rightValue = normalizeSortValue(column.sortValue?.(right));

      if (typeof leftValue === "number" && typeof rightValue === "number") {
        return sort.direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }

      const comparison = String(leftValue).localeCompare(String(rightValue), "pt-BR", {
        numeric: true,
        sensitivity: "base"
      });

      return sort.direction === "asc" ? comparison : comparison * -1;
    });
  }, [columns, data, sort]);

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  const pagedData = useMemo(() => {
    const start = pageIndex * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [pageIndex, pageSize, sortedData]);

  const visibleStart = sortedData.length === 0 ? 0 : pageIndex * pageSize + 1;
  const visibleEnd = Math.min((pageIndex + 1) * pageSize, sortedData.length);

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {sortedData.length} resultado{sortedData.length === 1 ? "" : "s"}
            </span>
            {createHref ? (
              <Button asChild>
                <Link to={createHref}>{createLabel}</Link>
              </Button>
            ) : null}
          </>
        }
        subtitle={description}
        title={title}
      />

      <Card className="bg-white/90">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={searchPlaceholder}
                value={searchValue}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {filterActions}
              {advancedFilters ? (
                <Button
                  onClick={() => setFiltersOpen((current) => !current)}
                  type="button"
                  variant="outline"
                >
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  Filtros
                  <ChevronDown
                    className={cn(
                      "ml-2 h-4 w-4 transition-transform",
                      filtersOpen ? "rotate-180" : undefined
                    )}
                  />
                </Button>
              ) : null}
            </div>
          </div>

          {advancedFilters && filtersOpen ? (
            <div className="grid gap-4 border-t border-border/60 pt-4 md:grid-cols-2 xl:grid-cols-4">
              {advancedFilters}
            </div>
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <DataTable
          columns={columns}
          data={pagedData}
          emptyDescription={emptyDescription}
          emptyTitle={emptyTitle}
          loading={loading}
          onRowClick={
            getRowHref
              ? (row) => {
                  navigate(getRowHref(row));
                }
              : undefined
          }
          onSortChange={setSort}
          rowKey={rowKey}
          sort={sort}
        />

        <CardContent className="flex flex-col gap-3 border-t border-border/70 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            Mostrando {visibleStart === 0 ? 0 : `${visibleStart}-${visibleEnd}`} de {sortedData.length}
          </p>

          <div className="flex items-center gap-2">
            <Button
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              type="button"
              variant="outline"
            >
              Anterior
            </Button>
            <Button
              disabled={pageIndex >= totalPages - 1}
              onClick={() =>
                setPageIndex((current) => Math.min(totalPages - 1, current + 1))
              }
              type="button"
              variant="outline"
            >
              Proximo
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function normalizeSortValue(
  value: string | number | boolean | null | undefined
) {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value === null || value === undefined || value === "") {
    return Number.POSITIVE_INFINITY;
  }

  return value;
}
