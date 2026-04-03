import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Download, PackageSearch, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailCard } from "@/components/ui/detail-card";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAppSession } from "@/app/session-context";
import {
  downloadStockReportCsv,
  getStockReport,
  listCategories,
  listSuppliers,
  type StockReport
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import { downloadBrowserFile, SingleSeriesBarChart } from "@/features/reports/reporting-ui";
import { reportSelectClassName } from "@/pages/reports/reports-shared";

type StockReportRow = StockReport["rows"][number];

export function StockReportPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [active, setActive] = useState<"" | "true" | "false">("true");
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["categories", "reports", "stock"],
    queryFn: () => listCategories(token, { active: true, take: 200 })
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "reports", "stock"],
    queryFn: () => listSuppliers(token, { active: true, take: 200 })
  });
  const reportQuery = useQuery({
    queryKey: ["reports", "stock", categoryId, supplierId, active, lowStockOnly],
    queryFn: () =>
      getStockReport(token, {
        categoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
        active: active === "" ? undefined : active === "true",
        lowStockOnly,
        take: 150
      })
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadStockReportCsv(token, {
        categoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
        active: active === "" ? undefined : active === "true",
        lowStockOnly
      }),
    onSuccess: (file) => {
      downloadBrowserFile(file);
    }
  });

  const report = reportQuery.data;
  const errorMessage = getErrorMessage(reportQuery.error) ?? getErrorMessage(exportMutation.error);

  const columns: Array<DataTableColumn<StockReportRow>> = [
    {
      id: "internalCode",
      header: "Codigo",
      cell: (row) => <span className="font-semibold">{row.internalCode}</span>
    },
    {
      id: "name",
      header: "Nome",
      cell: (row) => (
        <div className="space-y-1">
          <p className="font-semibold">{row.name}</p>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {row.supplier?.tradeName || row.supplier?.name || "Sem fornecedor"}
          </p>
        </div>
      )
    },
    {
      id: "category",
      header: "Categoria",
      cell: (row) => row.category.name
    },
    {
      id: "stock",
      header: "Estoque total por local",
      cell: (row) => (
        <div className="space-y-1">
          <p className="font-semibold">{formatCompactNumber(row.totalStock)}</p>
          <p className="text-xs leading-5" style={{ color: "var(--color-text-muted)" }}>
            {row.balances.length
              ? row.balances
                  .map((balance) => `${balance.location.name}: ${formatCompactNumber(balance.quantity)}`)
                  .join(" | ")
              : "Sem saldo por local"}
          </p>
        </div>
      )
    },
    {
      id: "costPrice",
      header: "Custo",
      cell: (row) => formatCurrency(row.costPrice)
    },
    {
      id: "salePrice",
      header: "Preco",
      cell: (row) => formatCurrency(row.salePrice)
    },
    {
      id: "stockMin",
      header: "Minimo",
      cell: (row) => formatCompactNumber(row.stockMin)
    }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button onClick={() => void reportQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
              type="button"
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </>
        }
        subtitle="Estoque consolidado por produto e local, com foco em reposicao e valor unitario."
        title="Relatorio de estoque"
      />

      <DetailCard title="Filtros">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SelectField
            label="Categoria"
            onChange={setCategoryId}
            options={(categoriesQuery.data ?? []).map((item) => ({
              label: item.name,
              value: item.id
            }))}
            value={categoryId}
          />
          <SelectField
            label="Fornecedor"
            onChange={setSupplierId}
            options={(suppliersQuery.data ?? []).map((item) => ({
              label: item.tradeName || item.name,
              value: item.id
            }))}
            value={supplierId}
          />
          <SelectField
            label="Ativo"
            onChange={(value) => setActive(value as typeof active)}
            options={[
              { label: "Ativos", value: "true" },
              { label: "Inativos", value: "false" }
            ]}
            value={active}
          />
          <CheckboxField
            checked={lowStockOnly}
            label="Abaixo do minimo"
            onChange={setLowStockOnly}
          />
        </div>
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      </DetailCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<PackageSearch className="h-5 w-5" />}
          label="Produtos"
          value={formatCompactNumber(report?.summary.trackedProducts ?? 0)}
        />
        <StatCard
          icon={<Boxes className="h-5 w-5" />}
          label="Saldo total"
          value={formatCompactNumber(report?.summary.totalQuantity ?? 0)}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Valor custo"
          value={formatCurrency(report?.summary.totalCostValue ?? 0)}
        />
        <StatCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="Baixo estoque"
          value={formatCompactNumber(report?.summary.lowStockCount ?? 0)}
          variant="warning"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
        <DetailCard title="Saldo por categoria">
          <SingleSeriesBarChart
            colorClassName="bg-slate-900/80"
            emptyMessage="Sem saldo para os filtros atuais."
            entries={(report?.charts.categoryBreakdown ?? []).map((entry) => ({
              label: entry.name.slice(0, 12),
              value: entry.totalQuantity
            }))}
            formatValue={formatCompactNumber}
          />
        </DetailCard>

        <DetailCard title="Reposicao imediata">
          <div className="space-y-3">
            {(report?.rows ?? [])
              .filter((row) => row.lowStock)
              .slice(0, 8)
              .map((row) => (
                <div
                  className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900"
                  key={row.productId}
                >
                  <p className="font-semibold">{row.name}</p>
                  <p className="mt-1 text-xs">
                    {row.internalCode} • saldo {formatCompactNumber(row.totalStock)} / minimo{" "}
                    {formatCompactNumber(row.stockMin)}
                  </p>
                </div>
              ))}
            {!report?.rows.some((row) => row.lowStock) ? (
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Nenhum item com reposicao imediata.
              </p>
            ) : null}
          </div>
        </DetailCard>
      </div>

      <DetailCard title="Produtos filtrados">
        <DataTable
          columns={columns}
          data={report?.rows ?? []}
          emptyDescription="Amplie os filtros ou ajuste a visao de ativos."
          emptyTitle="Nenhum produto encontrado"
          getRowClassName={(row) =>
            row.lowStock ? "bg-amber-50/90 hover:bg-amber-100/70" : undefined
          }
          loading={reportQuery.isLoading}
          rowKey={(row) => row.productId}
        />
      </DetailCard>
    </div>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value
}: {
  label: string;
  onChange(value: string): void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <select
        className={reportSelectClassName}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">Todos</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CheckboxField({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange(nextValue: boolean): void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>Filtro especial</FieldLabel>
      <label
        className="flex h-11 items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4"
        style={{ color: "var(--color-text)" }}
      >
        <input
          checked={checked}
          className="h-4 w-4 rounded border-white/20"
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        {label}
      </label>
    </div>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label
      className="text-[13px] font-medium"
      style={{ color: "var(--color-text-muted)" }}
    >
      {children}
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error ? parseApiError(error) : null;
}
