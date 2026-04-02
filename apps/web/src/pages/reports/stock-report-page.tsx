import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, Search } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  downloadStockReportCsv,
  getStockReport,
  listCategories,
  listStockLocations,
  listSuppliers
} from "@/lib/api";
import { formatCompactNumber, formatCurrency } from "@/lib/format";
import {
  downloadBrowserFile,
  ReportMetricCard,
  selectClassName,
  SingleSeriesBarChart
} from "@/features/reports/reporting-ui";

export function StockReportPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [locationId, setLocationId] = useState("");
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
  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "reports", "stock"],
    queryFn: () => listStockLocations(token, { active: true, take: 100 })
  });
  const reportQuery = useQuery({
    queryKey: ["reports", "stock", search, categoryId, supplierId, locationId, active, lowStockOnly],
    queryFn: () =>
      getStockReport(token, {
        search: search.trim() || undefined,
        categoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
        locationId: locationId || undefined,
        active: active === "" ? undefined : active === "true",
        lowStockOnly,
        take: 150
      })
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadStockReportCsv(token, {
        search: search.trim() || undefined,
        categoryId: categoryId || undefined,
        supplierId: supplierId || undefined,
        locationId: locationId || undefined,
        active: active === "" ? undefined : active === "true",
        lowStockOnly
      }),
    onSuccess: (file) => {
      downloadBrowserFile(file);
    }
  });

  const report = reportQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Relatorios"
        title="Relatorio de estoque"
        description="Saldo real por produto e local, com valor de inventario, baixo estoque e exportacao CSV."
        actions={
          <>
            <Button onClick={() => void reportQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
            <Button disabled={exportMutation.isPending} onClick={() => exportMutation.mutate()} type="button">
              <Download className="mr-2 h-4 w-4" />
              CSV
            </Button>
          </>
        }
      />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_220px_220px_180px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="stock-report-search">
              Busca
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                id="stock-report-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Produto, codigo interno ou fornecedor"
                value={search}
              />
            </div>
          </div>
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
            label="Local"
            onChange={setLocationId}
            options={(locationsQuery.data ?? []).map((item) => ({
              label: item.name,
              value: item.id
            }))}
            value={locationId}
          />
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <select
              className={selectClassName}
              onChange={(event) => setActive(event.target.value as typeof active)}
              value={active}
            >
              <option value="">Todos</option>
              <option value="true">Ativos</option>
              <option value="false">Inativos</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex h-11 items-center gap-2 rounded-xl border border-border/70 px-4 text-sm">
              <input
                checked={lowStockOnly}
                onChange={(event) => setLowStockOnly(event.target.checked)}
                type="checkbox"
              />
              So baixo estoque
            </label>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <ReportMetricCard
          helper="Produtos retornados pelo filtro"
          label="Produtos"
          value={formatCompactNumber(report?.summary.trackedProducts ?? 0)}
        />
        <ReportMetricCard
          helper="Quantidade total em estoque"
          label="Saldo total"
          value={formatCompactNumber(report?.summary.totalQuantity ?? 0)}
        />
        <ReportMetricCard
          helper="Valor em custo dos itens filtrados"
          label="Valor custo"
          value={formatCurrency(report?.summary.totalCostValue ?? 0)}
        />
        <ReportMetricCard
          helper="Valor potencial de venda"
          label="Valor venda"
          value={formatCurrency(report?.summary.totalSaleValue ?? 0)}
        />
        <ReportMetricCard
          helper="Itens abaixo do minimo"
          label="Baixo estoque"
          value={formatCompactNumber(report?.summary.lowStockCount ?? 0)}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_340px]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Saldo por categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <SingleSeriesBarChart
              colorClassName="bg-slate-900/80"
              emptyMessage="Sem saldo para os filtros atuais."
              entries={(report?.charts.categoryBreakdown ?? []).map((entry) => ({
                label: entry.name.slice(0, 10),
                value: entry.totalQuantity
              }))}
              formatValue={formatCompactNumber}
            />
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Reposicao</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {(report?.rows ?? [])
              .filter((row) => row.lowStock)
              .slice(0, 8)
              .map((row) => (
                <div key={row.productId} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-xs text-amber-800">
                    {row.internalCode} • saldo {formatCompactNumber(row.totalStock)} / minimo {formatCompactNumber(row.stockMin)}
                  </p>
                </div>
              ))}
            {!report?.rows.some((row) => row.lowStock) ? (
              <p className="text-sm text-muted-foreground">Nenhum item em reposicao imediata.</p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Saldo por produto</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando relatorio...</div>
          ) : null}
          {reportQuery.error ? (
            <div className="p-6 text-sm text-red-700">{(reportQuery.error as Error).message}</div>
          ) : null}
          {exportMutation.error ? (
            <div className="px-6 pb-4 text-sm text-red-700">{(exportMutation.error as Error).message}</div>
          ) : null}
          {report?.rows.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Produto</th>
                    <th className="px-4 py-3 font-medium">Categoria</th>
                    <th className="px-4 py-3 font-medium">Saldo</th>
                    <th className="px-4 py-3 font-medium">Minimo</th>
                    <th className="px-4 py-3 font-medium">Locais</th>
                    <th className="px-4 py-3 font-medium">Valor venda</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((row) => (
                    <tr key={row.productId} className="border-b border-border/60">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{row.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {row.internalCode}
                            {row.supplierCode ? ` • ${row.supplierCode}` : ""}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">{row.category.name}</td>
                      <td className="px-4 py-4 font-semibold">{formatCompactNumber(row.totalStock)}</td>
                      <td className="px-4 py-4">{formatCompactNumber(row.stockMin)}</td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {row.balances.length
                          ? row.balances.map((balance) => `${balance.location.name}: ${balance.quantity}`).join(" • ")
                          : "Sem saldo"}
                      </td>
                      <td className="px-4 py-4">{formatCurrency(row.inventorySaleValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !reportQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhum produto encontrado com os filtros atuais.
            </div>
          ) : null}
        </CardContent>
      </Card>
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
      <label className="text-sm font-medium">{label}</label>
      <select className={selectClassName} onChange={(event) => onChange(event.target.value)} value={value}>
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
