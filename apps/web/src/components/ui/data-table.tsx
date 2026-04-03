import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export type DataTableSort = {
  columnId: string;
  direction: "asc" | "desc";
};

export type DataTableColumn<TData> = {
  id: string;
  header: ReactNode;
  cell: (row: TData) => ReactNode;
  sortable?: boolean;
  sortValue?: (row: TData) => string | number | boolean | null | undefined;
  className?: string;
  headerClassName?: string;
};

type DataTableProps<TData> = {
  data: TData[];
  columns: Array<DataTableColumn<TData>>;
  rowKey: (row: TData) => string;
  loading?: boolean;
  loadingRowCount?: number;
  emptyTitle: string;
  emptyDescription?: string;
  sort?: DataTableSort | null;
  onSortChange?: (nextSort: DataTableSort | null) => void;
  onRowClick?: (row: TData) => void;
  getRowClassName?: (row: TData) => string | undefined;
};

export function DataTable<TData>({
  data,
  columns,
  rowKey,
  loading = false,
  loadingRowCount = 5,
  emptyTitle,
  emptyDescription,
  sort,
  onSortChange,
  onRowClick,
  getRowClassName
}: DataTableProps<TData>) {
  if (!loading && !data.length) {
    return (
      <div className="p-6">
        <EmptyState description={emptyDescription} title={emptyTitle} />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-left text-sm">
        <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
          <tr>
            {columns.map((column) => {
              const activeSort = sort?.columnId === column.id ? sort.direction : null;

              return (
                <th
                  className={cn("px-4 py-3 font-medium", column.headerClassName)}
                  key={column.id}
                >
                  {column.sortable ? (
                    <button
                      className="inline-flex items-center gap-2 text-left transition-colors hover:text-foreground"
                      onClick={() => {
                        if (!onSortChange) {
                          return;
                        }

                        onSortChange({
                          columnId: column.id,
                          direction:
                            sort?.columnId === column.id && sort.direction === "asc"
                              ? "desc"
                              : "asc"
                        });
                      }}
                      type="button"
                    >
                      {column.header}
                      {activeSort === "asc" ? (
                        <ArrowUp className="h-4 w-4" />
                      ) : activeSort === "desc" ? (
                        <ArrowDown className="h-4 w-4" />
                      ) : (
                        <ArrowUpDown className="h-4 w-4 opacity-60" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: loadingRowCount }).map((_, rowIndex) => (
                <tr className="border-b border-border/60" key={`skeleton-${rowIndex}`}>
                  {columns.map((column) => (
                    <td className={cn("px-4 py-4", column.className)} key={column.id}>
                      <div className="list-skeleton-shimmer h-4 w-full rounded-md" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((row) => {
                const clickable = Boolean(onRowClick);

                return (
                  <tr
                    className={cn(
                      "border-b border-border/60 align-top transition-colors",
                      clickable ? "cursor-pointer hover:bg-secondary/20" : undefined,
                      getRowClassName?.(row)
                    )}
                    key={rowKey(row)}
                    onClick={clickable ? () => onRowClick?.(row) : undefined}
                    onKeyDown={
                      clickable
                        ? (event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onRowClick?.(row);
                            }
                          }
                        : undefined
                    }
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                  >
                    {columns.map((column) => (
                      <td className={cn("px-4 py-4", column.className)} key={column.id}>
                        {column.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
