import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, ClipboardList, MapPin, PackagePlus, RefreshCw, Search, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppSession } from "@/app/session-context";
import { formatCompactNumber, formatCurrency, formatDateTime } from "@/lib/format";
import {
  listInventoryBalances,
  listInventoryMovements,
  listStockLocations
} from "@/lib/api";
import { getInventoryErrorMessage, inventorySelectClassName } from "@/features/inventory/inventory-ui";

type ActiveFilter = "active" | "inactive" | "all";

function badgeClassName(color: "emerald" | "amber" | "slate") {
  if (color === "emerald") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (color === "amber") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

export function InventoryPage() {
  const { session, hasPermission } = useAppSession();
  const [search, setSearch] = useState("");
  const [locationId, setLocationId] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const deferredSearch = useDeferredValue(search);

  const locationsQuery = useQuery({
    queryKey: ["stock-locations", "all"],
    queryFn: () => listStockLocations(session.accessToken, { take: 200 })
  });

  const balancesQuery = useQuery({
    queryKey: [
      "inventory",
      "balances",
      deferredSearch,
      locationId,
      activeFilter,
      lowStockOnly
    ],
    queryFn: () =>
      listInventoryBalances(session.accessToken, {
        search: deferredSearch.trim() || undefined,
        locationId: locationId || undefined,
        active: activeFilter === "all" ? undefined : activeFilter === "active",
        lowStockOnly,
        take: 150
      })
  });

  const movementsQuery = useQuery({
    queryKey: ["inventory", "movements", deferredSearch, locationId],
    queryFn: () =>
      listInventoryMovements(session.accessToken, {
        search: deferredSearch.trim() || undefined,
        locationId: locationId || undefined,
        take: 25
      })
  });

  const balances = balancesQuery.data ?? [];
  const movements = movementsQuery.data ?? [];
  const totalVisibleUnits = useMemo(
    () => balances.reduce((sum, row) => sum + row.totalStock, 0),
    [balances]
  );
  const lowStockCount = balances.filter((row) => row.lowStock).length;
  const selectedLocation = (locationsQuery.data ?? []).find(
    (location) => location.id === locationId
  );

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            {hasPermission("inventory.entry") ? (
              <Button asChild>
                <Link to="/inventory/entry">
                  <PackagePlus className="mr-2 h-4 w-4" />
                  Entrada
                </Link>
              </Button>
            ) : null}
            {hasPermission("inventory.adjust") ? (
              <Button asChild variant="outline">
                <Link to="/inventory/adjustment">
                  <ClipboardList className="mr-2 h-4 w-4" />
                  Ajuste
                </Link>
              </Button>
            ) : null}
            {hasPermission("inventory.transfer") ? (
              <Button asChild variant="outline">
                <Link to="/inventory/transfer">
                  <ArrowRightLeft className="mr-2 h-4 w-4" />
                  Transferir
                </Link>
              </Button>
            ) : null}
            {hasPermission("inventory.read") ? (
              <Button asChild variant="outline">
                <Link to="/inventory/units">
                  <Smartphone className="mr-2 h-4 w-4" />
                  Unidades
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to="/stock-locations">
                <MapPin className="mr-2 h-4 w-4" />
                Locais
              </Link>
            </Button>
          </>
        }
        description="Saldo consolidado por produto, consulta por local e historico real de movimentacoes gravadas no banco."
        eyebrow="Estoque"
        title="Visao geral do estoque"
      />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Filtros operacionais</CardTitle>
          <CardDescription>
            Consulte saldos reais por produto e local sem depender de calculo visual temporario.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
          <div className="space-y-2">
            <Label htmlFor="inventory-search">Busca</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="inventory-search"
                className="pl-10"
                onChange={(event) => {
                  setSearch(event.target.value);
                }}
                placeholder="Produto, codigo interno ou codigo do fornecedor"
                value={search}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventory-location">Local</Label>
            <select
              className={inventorySelectClassName}
              id="inventory-location"
              onChange={(event) => {
                setLocationId(event.target.value);
              }}
              value={locationId}
            >
              <option value="">Todos os locais</option>
              {(locationsQuery.data ?? []).map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.isDefault ? " (padrao)" : ""}
                  {!location.active ? " - inativo" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inventory-active-filter">Status do produto</Label>
            <select
              className={inventorySelectClassName}
              id="inventory-active-filter"
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

          <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm lg:col-span-2">
            <input
              checked={lowStockOnly}
              className="h-4 w-4"
              onChange={(event) => {
                setLowStockOnly(event.target.checked);
              }}
              type="checkbox"
            />
            Mostrar somente itens abaixo do estoque minimo
          </label>

          <div className="flex items-end">
            <Button
              className="w-full"
              onClick={() => {
                void Promise.all([balancesQuery.refetch(), movementsQuery.refetch()]);
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

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricCard label="Produtos visiveis" value={formatCompactNumber(balances.length)} />
        <MetricCard
          label={selectedLocation ? `Saldo em ${selectedLocation.name}` : "Saldo consolidado"}
          value={formatCompactNumber(totalVisibleUnits)}
        />
        <MetricCard label="Estoque baixo" value={formatCompactNumber(lowStockCount)} />
        <MetricCard label="Movimentacoes listadas" value={formatCompactNumber(movements.length)} />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Saldo por produto</CardTitle>
          <CardDescription>
            Servicos ficam fora deste fluxo. Cada linha abaixo vem do banco e reflete os `stock_balances` atuais.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {balancesQuery.isLoading ? (
            <LoadingBox text="Carregando saldo real do estoque..." />
          ) : null}

          {balancesQuery.error ? (
            <ErrorBox text={getInventoryErrorMessage(balancesQuery.error)} />
          ) : null}

          {!balancesQuery.isLoading && !balances.length ? (
            <EmptyBox text="Nenhum produto fisico encontrado com os filtros atuais." />
          ) : null}

          <div className="space-y-3">
            {balances.map((row) => (
              <div
                key={row.id}
                className="rounded-[1.5rem] border border-border/80 bg-card/90 p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{row.name}</p>
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                          row.lowStock
                            ? badgeClassName("amber")
                            : badgeClassName("emerald")
                        }`}
                      >
                        {row.lowStock ? "Abaixo do minimo" : "Saldo dentro do esperado"}
                      </span>
                      {!row.active ? (
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassName("slate")}`}
                        >
                          Produto inativo
                        </span>
                      ) : null}
                      {row.hasSerialControl ? (
                        <span
                          className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClassName("slate")}`}
                        >
                          Serializado
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {row.internalCode}
                      {row.supplierCode ? ` • fornecedor ${row.supplierCode}` : ""}
                      {row.supplier ? ` • ${row.supplier.tradeName || row.supplier.name}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Categoria {row.category.name} • estoque minimo {formatCompactNumber(row.stockMin)}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-border/70 bg-secondary/20 px-4 py-3 text-right">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">
                      Saldo total
                    </p>
                    <p className="mt-2 text-3xl font-black">{formatCompactNumber(row.totalStock)}</p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {row.balances.map((balance) => (
                    <div
                      key={balance.id}
                      className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{balance.location.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {balance.location.isDefault ? "Local padrao" : "Local auxiliar"}
                            {balance.location.active ? "" : " • inativo"}
                          </p>
                        </div>
                        <p className="text-2xl font-black">
                          {formatCompactNumber(balance.quantity)}
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {balance.updatedAt
                          ? `Atualizado em ${formatDateTime(balance.updatedAt)}`
                          : "Sem movimentacao registrada neste local"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Movimentacoes recentes</CardTitle>
          <CardDescription>
            Historico rastreavel de entradas, ajustes, vendas e transferencias persistidas em `stock_movements`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {movementsQuery.isLoading ? (
            <LoadingBox text="Carregando historico de movimentacoes..." />
          ) : null}

          {movementsQuery.error ? (
            <ErrorBox text={getInventoryErrorMessage(movementsQuery.error)} />
          ) : null}

          {!movementsQuery.isLoading && !movements.length ? (
            <EmptyBox text="Nenhuma movimentacao encontrada com os filtros atuais." />
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border/70 text-left text-muted-foreground">
                  <th className="px-3 py-3 font-medium">Data</th>
                  <th className="px-3 py-3 font-medium">Tipo</th>
                  <th className="px-3 py-3 font-medium">Produto</th>
                  <th className="px-3 py-3 font-medium">Local</th>
                  <th className="px-3 py-3 font-medium">Qtd.</th>
                  <th className="px-3 py-3 font-medium">Custo unit.</th>
                  <th className="px-3 py-3 font-medium">Observacoes</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id} className="border-b border-border/50 align-top">
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDateTime(movement.createdAt)}
                    </td>
                    <td className="px-3 py-3 font-semibold">
                      {formatMovementType(movement.movementType)}
                    </td>
                    <td className="px-3 py-3">
                      <p className="font-semibold">{movement.product.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {movement.product.internalCode}
                        {movement.product.supplierCode
                          ? ` • ${movement.product.supplierCode}`
                          : ""}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{movement.location.name}</td>
                    <td className="px-3 py-3 font-semibold">
                      {formatCompactNumber(movement.quantity)}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {movement.unitCost === null ? "N/A" : formatCurrency(movement.unitCost)}
                    </td>
                    <td className="px-3 py-3">
                      <p>{movement.notes || "Sem observacoes"}</p>
                      <p className="text-xs text-muted-foreground">
                        {movement.user
                          ? `Operador ${movement.user.name}`
                          : movement.referenceType || "Sem referencia"}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-white/90 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}

function LoadingBox({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-4 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {text}
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function formatMovementType(value: string) {
  switch (value) {
    case "ENTRY":
      return "Entrada";
    case "ADJUSTMENT":
      return "Ajuste";
    case "SALE":
      return "Venda";
    case "TRANSFER_IN":
      return "Transferencia recebida";
    case "TRANSFER_OUT":
      return "Transferencia enviada";
    case "RETURN":
      return "Retorno";
    case "EXIT":
      return "Saida";
    default:
      return value;
  }
}
