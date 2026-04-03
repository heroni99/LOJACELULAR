import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, DollarSign, RefreshCw, RotateCcw, ShoppingBag, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppSession } from "@/app/session-context";
import { StatusBadge } from "@/components/app/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailCard } from "@/components/ui/detail-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import {
  downloadSalesReportCsv,
  getSalesReport,
  listUsers,
  type PaymentMethodName,
  type SalesReport
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCompactNumber, formatCurrency, formatDateTime } from "@/lib/format";
import { downloadBrowserFile } from "@/features/reports/reporting-ui";
import { monthStartDateValue, todayDateValue } from "@/features/reports/report-utils";
import {
  reportFieldClassName,
  reportSelectClassName,
  SaleStatusBadge
} from "@/pages/reports/reports-shared";
import { formatPaymentMethod } from "@/pages/finance/finance-shared";

type SalesReportRow = SalesReport["rows"][number];

export function SalesReportPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [userId, setUserId] = useState("");
  const [status, setStatus] = useState<"" | "COMPLETED" | "CANCELED" | "REFUNDED">("COMPLETED");
  const [paymentMethod, setPaymentMethod] = useState<"" | PaymentMethodName>("");
  const [startDate, setStartDate] = useState(monthStartDateValue());
  const [endDate, setEndDate] = useState(todayDateValue());

  const usersQuery = useQuery({
    queryKey: ["users", "reports", "sales"],
    queryFn: () => listUsers(token, { active: true, take: 200 })
  });

  const reportQuery = useQuery({
    queryKey: ["reports", "sales", userId, status, paymentMethod, startDate, endDate],
    queryFn: () =>
      getSalesReport(token, {
        userId: userId || undefined,
        status: status || undefined,
        paymentMethod: paymentMethod || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 120
      })
  });

  const exportMutation = useMutation({
    mutationFn: () =>
      downloadSalesReportCsv(token, {
        userId: userId || undefined,
        status: status || undefined,
        paymentMethod: paymentMethod || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined
      }),
    onSuccess: (file) => {
      downloadBrowserFile(file);
    }
  });

  const report = reportQuery.data;
  const errorMessage = getErrorMessage(reportQuery.error) ?? getErrorMessage(exportMutation.error);

  const columns: Array<DataTableColumn<SalesReportRow>> = [
    {
      id: "saleNumber",
      header: "Numero",
      cell: (row) => (
        <div className="space-y-1">
          <Link
            className="font-semibold text-primary underline-offset-4 hover:underline"
            to={`/sales/${row.id}`}
          >
            {row.saleNumber}
          </Link>
          <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
            {row.receiptNumber ? `Recibo ${row.receiptNumber}` : "Sem recibo"}
          </p>
        </div>
      )
    },
    {
      id: "completedAt",
      header: "Data/hora",
      cell: (row) => (
        <span style={{ color: "var(--color-text-muted)" }}>{formatDateTime(row.completedAt)}</span>
      )
    },
    {
      id: "customer",
      header: "Cliente",
      cell: (row) => row.customer?.name || "Consumidor nao identificado"
    },
    {
      id: "operator",
      header: "Operador",
      cell: (row) => row.user?.name || "Sem operador"
    },
    {
      id: "payment",
      header: "Pagamento",
      cell: (row) =>
        row.paymentMethods.length
          ? row.paymentMethods.map((method) => formatPaymentMethod(method)).join(", ")
          : "Nao informado"
    },
    {
      id: "total",
      header: "Total",
      cell: (row) => <span className="font-semibold">{formatCurrency(row.total)}</span>
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <div className="flex flex-wrap gap-2">
          <SaleStatusBadge status={row.status} />
          <StatusBadge tone="slate">{row.fiscalStatus}</StatusBadge>
        </div>
      )
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
        subtitle="Vendas persistidas com filtro por periodo, operador, status e forma de pagamento."
        title="Relatorio de vendas"
      />

      <DetailCard title="Filtros">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SelectField
            label="Operador"
            onChange={setUserId}
            options={(usersQuery.data ?? []).map((user) => ({
              label: user.name,
              value: user.id
            }))}
            value={userId}
          />
          <SelectField
            label="Status"
            onChange={(value) => setStatus(value as typeof status)}
            options={[
              { label: "Concluida", value: "COMPLETED" },
              { label: "Cancelada", value: "CANCELED" },
              { label: "Estornada", value: "REFUNDED" }
            ]}
            value={status}
          />
          <SelectField
            label="Forma de pagamento"
            onChange={(value) => setPaymentMethod(value as typeof paymentMethod)}
            options={[
              { label: "Dinheiro", value: "CASH" },
              { label: "PIX", value: "PIX" },
              { label: "Debito", value: "DEBIT" },
              { label: "Credito", value: "CREDIT" },
              { label: "Credito da loja", value: "STORE_CREDIT" }
            ]}
            value={paymentMethod}
          />
          <DateField label="Data inicio" onChange={setStartDate} value={startDate} />
          <DateField label="Data fim" onChange={setEndDate} value={endDate} />
        </div>
        {errorMessage ? <ErrorBanner message={errorMessage} /> : null}
      </DetailCard>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="Total periodo"
          value={formatCurrency(report?.summary.totalRevenue ?? 0)}
        />
        <StatCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label="Qtd vendas"
          value={formatCompactNumber(report?.summary.orderCount ?? 0)}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Ticket medio"
          value={formatCurrency(report?.summary.averageTicket ?? 0)}
        />
        <StatCard
          icon={<RotateCcw className="h-5 w-5" />}
          label="Total cancelado"
          value={formatCurrency(report?.summary.totalCanceled ?? 0)}
          variant="warning"
        />
      </div>

      <DetailCard title="Vendas do periodo">
        <DataTable
          columns={columns}
          data={report?.rows ?? []}
          emptyDescription="Ajuste os filtros para buscar outro periodo ou operador."
          emptyTitle="Nenhuma venda encontrada"
          loading={reportQuery.isLoading}
          rowKey={(row) => row.id}
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
