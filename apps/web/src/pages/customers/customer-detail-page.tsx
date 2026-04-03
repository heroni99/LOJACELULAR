import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PencilLine } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailCard } from "@/components/ui/detail-card";
import { DetailTabs, type DetailTabItem } from "@/components/ui/detail-tabs";
import { PageHeader } from "@/components/ui/page-header";
import {
  deactivateCustomer,
  getCustomer,
  listAccountsReceivable,
  listSales,
  listServiceOrders,
  updateCustomer,
  type AccountsReceivableEntry,
  type SaleListItem,
  type ServiceOrderListItem
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { success } from "@/lib/toast";
import { ServiceOrderStatusBadge } from "@/pages/advanced/advanced-shared";
import { FinancialStatusBadge } from "@/pages/finance/finance-shared";

export function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authEnabled, hasPermission, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;

  const customerQuery = useQuery({
    queryKey: ["customers", "detail", id],
    queryFn: () => getCustomer(token, id ?? ""),
    enabled: Boolean(id)
  });
  const salesQuery = useQuery({
    queryKey: ["customers", "detail", id, "sales"],
    queryFn: () => listSales(token, { customerId: id, take: 20 }),
    enabled: Boolean(id && hasPermission("sales.read"))
  });
  const serviceOrdersQuery = useQuery({
    queryKey: ["customers", "detail", id, "service-orders"],
    queryFn: () => listServiceOrders(token, { customerId: id, take: 20 }),
    enabled: Boolean(id && hasPermission("service-orders.read"))
  });
  const receivablesQuery = useQuery({
    queryKey: ["customers", "detail", id, "accounts-receivable"],
    queryFn: () => listAccountsReceivable(token, { customerId: id, take: 50 }),
    enabled: Boolean(id && hasPermission("accounts-receivable.read"))
  });

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const customer = customerQuery.data;

      if (!customer || !id) {
        throw new Error("Cliente nao encontrado.");
      }

      if (customer.active) {
        return deactivateCustomer(token, id);
      }

      return updateCustomer(token, id, { active: true });
    },
    onSuccess: async () => {
      success("Cliente atualizado com sucesso.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customers", "detail", id] })
      ]);
    }
  });

  const salesColumns = useMemo<Array<DataTableColumn<SaleListItem>>>(
    () => [
      {
        id: "saleNumber",
        header: "Numero",
        cell: (sale) => <span className="font-medium text-foreground">{sale.saleNumber}</span>
      },
      {
        id: "completedAt",
        header: "Data",
        cell: (sale) => <span className="text-muted-foreground">{formatDateTime(sale.completedAt)}</span>
      },
      {
        id: "total",
        header: "Total",
        cell: (sale) => <span className="font-medium text-foreground">{formatCurrency(sale.total)}</span>
      },
      {
        id: "status",
        header: "Status",
        cell: (sale) => (
          <StatusBadge tone={toneBySaleStatus(sale.status)}>
            {labelBySaleStatus(sale.status)}
          </StatusBadge>
        )
      }
    ],
    []
  );

  const serviceOrdersColumns = useMemo<Array<DataTableColumn<ServiceOrderListItem>>>(
    () => [
      {
        id: "orderNumber",
        header: "Numero",
        cell: (order) => <span className="font-medium text-foreground">{order.orderNumber}</span>
      },
      {
        id: "device",
        header: "Aparelho",
        cell: (order) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">
              {order.deviceType} {order.brand} {order.model}
            </p>
            <p className="text-xs text-muted-foreground">
              {order.imei || order.serialNumber || "Sem IMEI/serial"}
            </p>
          </div>
        )
      },
      {
        id: "status",
        header: "Status",
        cell: (order) => <ServiceOrderStatusBadge status={order.status} />
      },
      {
        id: "createdAt",
        header: "Data",
        cell: (order) => <span className="text-muted-foreground">{formatDateTime(order.createdAt)}</span>
      }
    ],
    []
  );

  const receivablesColumns = useMemo<Array<DataTableColumn<AccountsReceivableEntry>>>(
    () => [
      {
        id: "description",
        header: "Parcela",
        cell: (entry) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{entry.description}</p>
            <p className="text-xs text-muted-foreground">
              {entry.sale
                ? `Venda ${entry.sale.saleNumber}`
                : entry.serviceOrder
                  ? `OS ${entry.serviceOrder.id.slice(0, 8)}`
                  : "Sem origem vinculada"}
            </p>
          </div>
        )
      },
      {
        id: "dueDate",
        header: "Vencimento",
        cell: (entry) => <span className="text-muted-foreground">{formatDateTime(entry.dueDate)}</span>
      },
      {
        id: "amount",
        header: "Valor",
        cell: (entry) => <span className="font-medium text-foreground">{formatCurrency(entry.amount)}</span>
      },
      {
        id: "status",
        header: "Status",
        cell: (entry) => <FinancialStatusBadge status={entry.status} />
      }
    ],
    []
  );

  const pendingReceivablesAmount = useMemo(
    () =>
      (receivablesQuery.data ?? [])
        .filter((entry) => entry.status === "PENDING" || entry.status === "OVERDUE")
        .reduce((sum, entry) => sum + entry.amount, 0),
    [receivablesQuery.data]
  );

  const tabs = useMemo<DetailTabItem[]>(() => {
    const items: DetailTabItem[] = [];

    if (hasPermission("sales.read")) {
      items.push({
        id: "sales",
        label: "Historico de compras",
        badge: salesQuery.data?.length ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
            {salesQuery.data.length}
          </span>
        ) : undefined,
        content: (
          <div className="space-y-4 p-6">
            <TabError message={getErrorMessage(salesQuery.error)} />
            <DataTable
              columns={salesColumns}
              data={salesQuery.data ?? []}
              emptyDescription="Esse cliente ainda nao possui vendas associadas."
              emptyTitle="Sem historico de compras"
              loading={salesQuery.isLoading}
              onRowClick={(sale) => navigate(`/sales/${sale.id}`)}
              rowKey={(sale) => sale.id}
            />
          </div>
        )
      });
    }

    if (hasPermission("service-orders.read")) {
      items.push({
        id: "service-orders",
        label: "Ordens de servico",
        badge: serviceOrdersQuery.data?.length ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
            {serviceOrdersQuery.data.length}
          </span>
        ) : undefined,
        content: (
          <div className="space-y-4 p-6">
            <TabError message={getErrorMessage(serviceOrdersQuery.error)} />
            <DataTable
              columns={serviceOrdersColumns}
              data={serviceOrdersQuery.data ?? []}
              emptyDescription="Esse cliente ainda nao abriu ordens de servico."
              emptyTitle="Sem ordens de servico"
              loading={serviceOrdersQuery.isLoading}
              onRowClick={(order) => navigate(`/service-orders/${order.id}`)}
              rowKey={(order) => order.id}
            />
          </div>
        )
      });
    }

    if (hasPermission("accounts-receivable.read")) {
      items.push({
        id: "receivables",
        label: "Contas a receber",
        badge:
          pendingReceivablesAmount > 0 ? (
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">
              {formatCurrency(pendingReceivablesAmount)}
            </span>
          ) : undefined,
        content: (
          <div className="space-y-4 p-6">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Saldo pendente
              </p>
              <p className="mt-2 text-2xl font-semibold" style={{ color: "var(--color-text)" }}>
                {formatCurrency(pendingReceivablesAmount)}
              </p>
            </div>
            <TabError message={getErrorMessage(receivablesQuery.error)} />
            <DataTable
              columns={receivablesColumns}
              data={receivablesQuery.data ?? []}
              emptyDescription="Esse cliente nao possui parcelas em aberto ou historicas."
              emptyTitle="Sem contas a receber"
              loading={receivablesQuery.isLoading}
              rowKey={(entry) => entry.id}
            />
          </div>
        )
      });
    }

    return items;
  }, [
    hasPermission,
    navigate,
    pendingReceivablesAmount,
    receivablesColumns,
    receivablesQuery.data,
    receivablesQuery.error,
    receivablesQuery.isLoading,
    salesColumns,
    salesQuery.data,
    salesQuery.error,
    salesQuery.isLoading,
    serviceOrdersColumns,
    serviceOrdersQuery.data,
    serviceOrdersQuery.error,
    serviceOrdersQuery.isLoading
  ]);

  const customer = customerQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/customers"
        backLabel="Clientes"
        title={customer?.name ?? "Detalhes do cliente"}
        titleAdornment={
          customer ? (
            <StatusBadge tone={customer.active ? "green" : "amber"}>
              {customer.active ? "Ativo" : "Inativo"}
            </StatusBadge>
          ) : null
        }
        subtitle="Visao consolidada do cadastro, relacionamento comercial e pendencias financeiras."
        actions={
          <>
            {id && hasPermission("customers.update") ? (
              <Button asChild>
                <Link to={`/customers/${id}/edit`}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </Button>
            ) : null}
            {customer && hasPermission("customers.update") ? (
              <Button
                disabled={toggleMutation.isPending}
                onClick={() => {
                  const action = customer.active ? "inativar" : "reativar";
                  const confirmed = window.confirm(
                    `Deseja ${action} o cliente ${customer.name}?`
                  );

                  if (confirmed) {
                    toggleMutation.mutate();
                  }
                }}
                type="button"
                variant="outline"
              >
                {toggleMutation.isPending
                  ? "Salvando..."
                  : customer.active
                    ? "Inativar"
                    : "Reativar"}
              </Button>
            ) : null}
          </>
        }
      />

      {customerQuery.isLoading ? (
        <DetailCard>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Carregando cliente...
          </p>
        </DetailCard>
      ) : null}

      <TabError message={getErrorMessage(customerQuery.error)} />
      <TabError message={getErrorMessage(toggleMutation.error)} />

      {customer ? (
        <>
          <div className="grid gap-6 xl:grid-cols-2">
            <DetailCard title="Dados de contato">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailRow label="Telefone" value={customer.phone} />
                <DetailRow label="Telefone 2" value={customer.phone2 || "Nao informado"} />
                <DetailRow label="E-mail" value={customer.email || "Nao informado"} />
                <DetailRow label="CPF/CNPJ" value={customer.cpfCnpj || "Nao informado"} />
              </div>
            </DetailCard>

            <DetailCard title="Endereco">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailRow label="CEP" value={customer.zipCode || "Nao informado"} />
                <DetailRow label="Endereco" value={customer.address || "Nao informado"} />
                <DetailRow label="Cidade" value={customer.city || "Nao informada"} />
                <DetailRow label="Estado" value={customer.state || "Nao informado"} />
              </div>
            </DetailCard>
          </div>

          {tabs.length ? <DetailTabs defaultTabId={tabs[0].id} tabs={tabs} /> : null}
        </>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p className="mt-2 font-medium" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
    </div>
  );
}

function TabError({ message }: { message?: string | null }) {
  return message ? (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  ) : null;
}

function toneBySaleStatus(status: SaleListItem["status"]) {
  switch (status) {
    case "COMPLETED":
      return "green";
    case "REFUNDED":
      return "orange";
    case "CANCELED":
    default:
      return "amber";
  }
}

function labelBySaleStatus(status: SaleListItem["status"]) {
  switch (status) {
    case "COMPLETED":
      return "Concluida";
    case "REFUNDED":
      return "Estornada";
    case "CANCELED":
      return "Cancelada";
    default:
      return status;
  }
}

function getErrorMessage(error: unknown) {
  return error ? parseApiError(error) : null;
}
