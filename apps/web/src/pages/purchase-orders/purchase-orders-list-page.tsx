import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  listPurchaseOrders,
  listSuppliers,
  type PurchaseOrderStatusName
} from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  AdvancedSummaryCard,
  PurchaseOrderStatusBadge,
  advancedSelectClassName,
  formatPurchaseOrderStatus
} from "@/pages/advanced/advanced-shared";

type StatusFilter = "" | PurchaseOrderStatusName;

export function PurchaseOrdersListPage() {
  const { session, hasPermission } = useAppSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [supplierId, setSupplierId] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", search, status, supplierId],
    queryFn: () =>
      listPurchaseOrders(session.accessToken, {
        search: search.trim() || undefined,
        status: status || undefined,
        supplierId: supplierId || undefined,
        take: 150
      })
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "purchase-orders-filter"],
    queryFn: () => listSuppliers(session.accessToken, { active: true, take: 150 })
  });

  const orders = ordersQuery.data ?? [];
  const inFlightCount = orders.filter((order) =>
    ["DRAFT", "ORDERED", "PARTIALLY_RECEIVED"].includes(order.status)
  ).length;
  const receivedCount = orders.filter((order) => order.status === "RECEIVED").length;
  const openValue = useMemo(
    () =>
      orders
        .filter((order) => order.status !== "RECEIVED" && order.status !== "CANCELED")
        .reduce((sum, order) => sum + order.total, 0),
    [orders]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Compras"
        title="Pedidos de compra"
        description="Planejamento de compras, recebimento parcial e rastreabilidade de entrada no estoque."
        actions={
          hasPermission("purchase-orders.create") ? (
            <Button asChild>
              <Link to="/purchase-orders/new">
                <Plus className="mr-2 h-4 w-4" />
                Novo pedido
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdvancedSummaryCard label="Pedidos em curso" value={String(inFlightCount)} helper="Rascunho, enviado ou recebido parcial." />
        <AdvancedSummaryCard label="Pedidos recebidos" value={String(receivedCount)} helper="Ja impactaram o estoque integralmente." />
        <AdvancedSummaryCard label="Valor em aberto" value={formatCurrency(openValue)} helper="Total financeiro ainda pendente de recebimento." />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_260px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="purchase-orders-search">Busca</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                id="purchase-orders-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Numero do pedido ou fornecedor"
                value={search}
              />
            </div>
          </div>

          <SelectField
            label="Status"
            value={status}
            onChange={(value) => setStatus(value as StatusFilter)}
            options={[
              { label: "Todos", value: "" },
              { label: formatPurchaseOrderStatus("DRAFT"), value: "DRAFT" },
              { label: formatPurchaseOrderStatus("ORDERED"), value: "ORDERED" },
              { label: formatPurchaseOrderStatus("PARTIALLY_RECEIVED"), value: "PARTIALLY_RECEIVED" },
              { label: formatPurchaseOrderStatus("RECEIVED"), value: "RECEIVED" },
              { label: formatPurchaseOrderStatus("CANCELED"), value: "CANCELED" }
            ]}
          />

          <SelectField
            label="Fornecedor"
            value={supplierId}
            onChange={setSupplierId}
            options={[
              { label: "Todos", value: "" },
              ...(suppliersQuery.data ?? []).map((supplier) => ({
                label: supplier.name,
                value: supplier.id
              }))
            ]}
          />

          <div className="flex items-end">
            <Button onClick={() => void ordersQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Pedidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ordersQuery.isLoading ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              Carregando pedidos de compra...
            </div>
          ) : null}
          {ordersQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(ordersQuery.error as Error).message}
            </div>
          ) : null}
          {!ordersQuery.isLoading && !orders.length ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              Nenhum pedido encontrado com os filtros atuais.
            </div>
          ) : null}

          <div className="space-y-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                className="block rounded-[1.5rem] border border-border/70 bg-card/80 p-4 transition-colors hover:bg-secondary/35"
                to={`/purchase-orders/${order.id}`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{order.orderNumber}</p>
                      <PurchaseOrderStatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {order.supplier.tradeName ?? order.supplier.name}
                    </p>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:min-w-[420px] lg:grid-cols-3">
                    <InfoItem label="Pedido em" value={formatDateTime(order.orderedAt)} />
                    <InfoItem label="Total" value={formatCurrency(order.total)} />
                    <InfoItem label="Itens" value={String(order._count.items)} />
                    <InfoItem label="Recebido em" value={order.receivedAt ? formatDateTime(order.receivedAt) : "Pendente"} />
                    <InfoItem label="AP vinculadas" value={String(order._count.accountsPayable)} />
                    <InfoItem label="Status" value={formatPurchaseOrderStatus(order.status)} />
                  </dl>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
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
      <label className="text-sm font-medium">{label}</label>
      <select
        className={advancedSelectClassName}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {options.map((option) => (
          <option key={`${label}-${option.value || "all"}`} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
