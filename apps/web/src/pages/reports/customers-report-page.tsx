import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, RefreshCw, TrendingUp, UserCheck, Users, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppSession } from "@/app/session-context";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailCard } from "@/components/ui/detail-card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  downloadCustomerReportCsv,
  getCustomerReport,
  type CustomerReport
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCompactNumber, formatCurrency, formatDateTime } from "@/lib/format";
import { downloadBrowserFile, SingleSeriesBarChart } from "@/features/reports/reporting-ui";
import { monthStartDateValue, todayDateValue } from "@/features/reports/report-utils";
import { reportFieldClassName, reportSelectClassName } from "@/pages/reports/reports-shared";

type CustomerReportRow = CustomerReport["rows"][number];

export function CustomersReportPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [active, setActive] = useState<"" | "true" | "false">("true");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [startDate, setStartDate] = useState(monthStartDateValue());
  const [endDate, setEndDate] = useState(todayDateValue());

  const reportQuery = useQuery({
    queryKey: ["reports", "customers", active, city, state, startDate, endDate],
    queryFn: () =>
      getCustomerReport(token, {
        active: active === "" ? undefined : active === "true",
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 150
      })
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadCustomerReportCsv(token, {
        active: active === "" ? undefined : active === "true",
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      }),
    onSuccess: (file) => {
      downloadBrowserFile(file);
    }
  });

  const report = reportQuery.data;
  const errorMessage = getErrorMessage(reportQuery.error) ?? getErrorMessage(exportMutation.error);

  const columns: Array<DataTableColumn<CustomerReportRow>> = [
    {
      id: "name",
      header: "Nome",
      cell: (row) => (
        <div className="space-y-1">
          <Link
            className="font-semibold text-primary underline-offset-4 hover:underline"
            to={`/customers/${row.id}`}
          >
            {row.name}
          </Link>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {row.active ? "Ativo" : "Inativo"}
          </p>
        </div>
      )
    },
    {
      id: "phone",
      header: "Telefone",
      cell: (row) => row.phone
    },
    {
      id: "totalRevenue",
      header: "Total comprado",
      cell: (row) => <span className="font-semibold">{formatCurrency(row.totalRevenue)}</span>
    },
    {
      id: "orderCount",
      header: "Qtd compras",
      cell: (row) => formatCompactNumber(row.orderCount)
    },
    {
      id: "lastPurchaseAt",
      header: "Ultima compra",
      cell: (row) =>
        row.lastPurchaseAt ? formatDateTime(row.lastPurchaseAt) : "Sem compras no periodo"
    },
    {
      id: "averageTicket",
      header: "Media",
      cell: (row) => formatCurrency(row.averageTicket)
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
        subtitle="Base de clientes com receita, recorrencia e recorte geografico."
        title="Relatorio de clientes"
      />

      <DetailCard title="Filtros">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <TextField label="Cidade" onChange={setCity} value={city} />
          <TextField label="Estado" onChange={setState} value={state} />
          <SelectField
            label="Ativo"
            onChange={(value) => setActive(value as typeof active)}
            options={[
              { label: "Ativos", value: "true" },
              { label: "Inativos", value: "false" }
            ]}
            value={active}
          />
          <DateField label="Periodo inicio" onChange={setStartDate} value={startDate} />
          <DateField label="Periodo fim" onChange={setEndDate} value={endDate} />
        </div>
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      </DetailCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Clientes"
          value={formatCompactNumber(report?.summary.totalCustomers ?? 0)}
        />
        <StatCard
          icon={<UserCheck className="h-5 w-5" />}
          label="Com compras"
          value={formatCompactNumber(report?.summary.customersWithSales ?? 0)}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="Total comprado"
          value={formatCurrency(report?.summary.totalRevenue ?? 0)}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Media"
          value={formatCurrency(report?.summary.averageTicket ?? 0)}
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="A receber"
          value={formatCurrency(report?.summary.openReceivables ?? 0)}
          variant="warning"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_320px]">
        <DetailCard title="Top clientes por receita">
          <SingleSeriesBarChart
            colorClassName="bg-slate-900/80"
            emptyMessage="Sem clientes com faturamento no periodo filtrado."
            entries={(report?.charts.topCustomers ?? []).map((entry) => ({
              label: entry.name.slice(0, 12),
              value: entry.totalRevenue
            }))}
            formatValue={formatCurrency}
          />
        </DetailCard>

        <DetailCard title="Recebiveis vencidos">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">Saldo vencido</p>
            <p className="mt-2 text-3xl font-semibold text-amber-900">
              {formatCurrency(report?.summary.overdueReceivables ?? 0)}
            </p>
          </div>
          <p className="mt-4 text-sm" style={{ color: "var(--color-text-muted)" }}>
            O valor considera apenas contas a receber com status real de atraso.
          </p>
        </DetailCard>
      </div>

      <DetailCard title="Clientes do periodo">
        <DataTable
          columns={columns}
          data={report?.rows ?? []}
          emptyDescription="Tente outro periodo ou ajuste o recorte geografico."
          emptyTitle="Nenhum cliente encontrado"
          loading={reportQuery.isLoading}
          rowKey={(row) => row.id}
        />
      </DetailCard>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <Input
        className={reportFieldClassName}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
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

function DateField({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <Input
        className={reportFieldClassName}
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
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
