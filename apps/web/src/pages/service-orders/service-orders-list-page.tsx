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
  listCustomers,
  listServiceOrders,
  listUsers,
  type ServiceOrderStatusName
} from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  AdvancedSummaryCard,
  ServiceOrderStatusBadge,
  advancedSelectClassName
} from "@/pages/advanced/advanced-shared";

type StatusFilter = "" | ServiceOrderStatusName;

export function ServiceOrdersListPage() {
  const { session, hasPermission } = useAppSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [customerId, setCustomerId] = useState("");
  const [assignedToUserId, setAssignedToUserId] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["service-orders", search, status, customerId, assignedToUserId],
    queryFn: () =>
      listServiceOrders(session.accessToken, {
        search: search.trim() || undefined,
        status: status || undefined,
        customerId: customerId || undefined,
        assignedToUserId: assignedToUserId || undefined,
        take: 150
      })
  });
  const customersQuery = useQuery({
    queryKey: ["customers", "service-orders-filter"],
    queryFn: () => listCustomers(session.accessToken, { active: true, take: 150 })
  });
  const usersQuery = useQuery({
    queryKey: ["users", "service-orders-filter"],
    queryFn: () => listUsers(session.accessToken, { active: true, take: 150 })
  });

  const orders = ordersQuery.data ?? [];
  const openCount = orders.filter((order) =>
    ["OPEN", "WAITING_APPROVAL", "APPROVED", "IN_PROGRESS", "WAITING_PARTS", "READY_FOR_DELIVERY"].includes(
      order.status
    )
  ).length;
  const deliveryCount = orders.filter((order) => order.status === "READY_FOR_DELIVERY").length;
  const estimatedTotal = useMemo(
    () => orders.reduce((sum, order) => sum + (order.totalFinal ?? order.totalEstimated), 0),
    [orders]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Assistencia tecnica"
        title="Ordens de servico"
        description="Abertura, acompanhamento de status, consumo de pecas e integracao com financeiro."
        actions={
          hasPermission("service-orders.create") ? (
            <Button asChild>
              <Link to="/service-orders/new">
                <Plus className="mr-2 h-4 w-4" />
                Nova OS
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdvancedSummaryCard
          label="OS em andamento"
          value={String(openCount)}
          helper="Fluxo real em aberto na bancada."
        />
        <AdvancedSummaryCard
          label="Prontas para entrega"
          value={String(deliveryCount)}
          helper="Aguardando retirada pelo cliente."
        />
        <AdvancedSummaryCard
          label="Valor projetado"
          value={formatCurrency(estimatedTotal)}
          helper="Soma do total final ou estimado das OS filtradas."
        />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_200px_240px_240px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="service-orders-search">
              Busca
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                id="service-orders-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Numero, cliente, aparelho, IMEI ou defeito"
                value={search}
              />
            </div>
          </div>

          <SelectField
            label="Status"
            onChange={(value) => setStatus(value as StatusFilter)}
            options={[
              { label: "Todos", value: "" },
              { label: "Aberta", value: "OPEN" },
              { label: "Aguardando aprovacao", value: "WAITING_APPROVAL" },
              { label: "Aprovada", value: "APPROVED" },
              { label: "Em andamento", value: "IN_PROGRESS" },
              { label: "Aguardando pecas", value: "WAITING_PARTS" },
              { label: "Pronta para entrega", value: "READY_FOR_DELIVERY" },
              { label: "Entregue", value: "DELIVERED" },
              { label: "Cancelada", value: "CANCELED" },
              { label: "Rejeitada", value: "REJECTED" }
            ]}
            value={status}
          />

          <SelectField
            label="Cliente"
            onChange={setCustomerId}
            options={[
              { label: "Todos", value: "" },
              ...(customersQuery.data ?? []).map((customer) => ({
                label: customer.name,
                value: customer.id
              }))
            ]}
            value={customerId}
          />

          <SelectField
            label="Responsavel"
            onChange={setAssignedToUserId}
            options={[
              { label: "Todos", value: "" },
              ...(usersQuery.data ?? []).map((user) => ({
                label: user.name,
                value: user.id
              }))
            ]}
            value={assignedToUserId}
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
          <CardTitle className="text-xl">Backlog tecnico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ordersQuery.isLoading ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              Carregando ordens de servico...
            </div>
          ) : null}

          {ordersQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(ordersQuery.error as Error).message}
            </div>
          ) : null}

          {!ordersQuery.isLoading && !orders.length ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              Nenhuma ordem de servico encontrada com os filtros atuais.
            </div>
          ) : null}

          <div className="space-y-3">
            {orders.map((order) => (
              <Link
                key={order.id}
                className="block rounded-[1.5rem] border border-border/70 bg-card/80 p-4 transition-colors hover:bg-secondary/35"
                to={`/service-orders/${order.id}`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{order.orderNumber}</p>
                      <ServiceOrderStatusBadge status={order.status} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {order.customer.name} • {order.deviceType} {order.brand} {order.model}
                    </p>
                    <p className="text-sm text-muted-foreground">{order.reportedIssue}</p>
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:min-w-[420px] lg:grid-cols-3">
                    <InfoItem label="Criada em" value={formatDateTime(order.createdAt)} />
                    <InfoItem
                      label="Responsavel"
                      value={order.assignedToUser?.name ?? "Nao definido"}
                    />
                    <InfoItem
                      label="Valor"
                      value={formatCurrency(order.totalFinal ?? order.totalEstimated)}
                    />
                    <InfoItem label="Itens" value={String(order._count.items)} />
                    <InfoItem label="IMEI/serial" value={order.imei ?? order.serialNumber ?? "Nao informado"} />
                    <InfoItem
                      label="Previsao"
                      value={order.estimatedCompletionDate ? formatDateTime(order.estimatedCompletionDate) : "Sem previsao"}
                    />
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
