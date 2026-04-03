import { useDeferredValue, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { type DataTableColumn } from "@/components/ui/data-table";
import { ListPage } from "@/components/ui/list-page";
import { useAppSession } from "@/app/session-context";
import { listCustomers, type Customer } from "@/lib/api";
import { parseApiError } from "@/lib/api-error";

type ActiveFilter = "active" | "inactive" | "all";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function CustomersPage() {
  const { authEnabled, session } = useAppSession();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const deferredSearch = useDeferredValue(search);

  const customersQuery = useQuery({
    queryKey: ["customers", "list", deferredSearch, activeFilter],
    queryFn: () =>
      listCustomers(authEnabled ? session.accessToken : undefined, {
        search: deferredSearch.trim() || undefined,
        active: activeFilter === "all" ? undefined : activeFilter === "active"
      })
  });

  const columns = useMemo<Array<DataTableColumn<Customer>>>(
    () => [
      {
        id: "name",
        header: "Nome",
        sortable: true,
        sortValue: (customer) => customer.name,
        cell: (customer) => (
          <div className="space-y-1">
            <p className="font-semibold text-foreground">{customer.name}</p>
            <p className="text-xs text-muted-foreground">
              {customer.email || "Sem e-mail cadastrado"}
            </p>
          </div>
        )
      },
      {
        id: "phone",
        header: "Telefone",
        sortable: true,
        sortValue: (customer) => customer.phone,
        cell: (customer) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{customer.phone}</p>
            <p className="text-xs text-muted-foreground">
              {customer.phone2 || "Sem telefone secundario"}
            </p>
          </div>
        )
      },
      {
        id: "cpfCnpj",
        header: "CPF/CNPJ",
        sortable: true,
        sortValue: (customer) => customer.cpfCnpj ?? "",
        cell: (customer) => (
          <span className="text-muted-foreground">
            {customer.cpfCnpj || "Nao informado"}
          </span>
        )
      },
      {
        id: "city",
        header: "Cidade",
        sortable: true,
        sortValue: (customer) => customer.city ?? "",
        cell: (customer) => (
          <span className="text-muted-foreground">
            {customer.city || "Nao informada"}
            {customer.state ? ` / ${customer.state}` : ""}
          </span>
        )
      },
      {
        id: "status",
        header: "Status",
        sortable: true,
        sortValue: (customer) => customer.active,
        cell: (customer) => (
          <StatusBadge tone={customer.active ? "green" : "amber"}>
            {customer.active ? "Ativo" : "Inativo"}
          </StatusBadge>
        )
      }
    ],
    []
  );

  return (
    <ListPage
      columns={columns}
      createHref="/customers/new"
      createLabel="Novo cliente"
      data={customersQuery.data ?? []}
      description="Base de clientes separada por busca, filtros e tabela clicavel para reduzir ruido operacional."
      emptyDescription="Ajuste a busca ou o filtro de status para localizar clientes."
      emptyTitle="Nenhum cliente encontrado"
      errorMessage={getErrorMessage(customersQuery.error)}
      filterActions={
        <Button
          onClick={() => {
            void customersQuery.refetch();
          }}
          type="button"
          variant="outline"
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar
        </Button>
      }
      getRowHref={(customer) => `/customers/${customer.id}`}
      initialSort={{ columnId: "name", direction: "asc" }}
      loading={customersQuery.isLoading}
      pageResetKey={`${deferredSearch}:${activeFilter}`}
      rowKey={(customer) => customer.id}
      searchPlaceholder="Buscar por nome ou telefone"
      searchValue={search}
      title="Clientes"
      onSearchChange={setSearch}
      advancedFilters={
        <SelectField
          id="customer-active-filter"
          label="Status"
          onChange={(value) => setActiveFilter(value as ActiveFilter)}
          options={[
            { label: "Somente ativos", value: "active" },
            { label: "Somente inativos", value: "inactive" },
            { label: "Todos", value: "all" }
          ]}
          value={activeFilter}
        />
      }
    />
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

function getErrorMessage(error: unknown) {
  return error ? parseApiError(error) : null;
}
