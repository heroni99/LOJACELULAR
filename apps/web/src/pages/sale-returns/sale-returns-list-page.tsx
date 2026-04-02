import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, RefreshCw, Search } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listCustomers, listSaleReturns, type RefundTypeName } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  AdvancedSummaryCard,
  advancedSelectClassName,
  formatRefundType
} from "@/pages/advanced/advanced-shared";

type RefundFilter = "" | RefundTypeName;

export function SaleReturnsListPage() {
  const { session, hasPermission } = useAppSession();
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [refundType, setRefundType] = useState<RefundFilter>("");

  const returnsQuery = useQuery({
    queryKey: ["sale-returns", search, customerId, refundType],
    queryFn: () =>
      listSaleReturns(session.accessToken, {
        search: search.trim() || undefined,
        customerId: customerId || undefined,
        refundType: refundType || undefined,
        take: 150
      })
  });
  const customersQuery = useQuery({
    queryKey: ["customers", "sale-returns-filter"],
    queryFn: () => listCustomers(session.accessToken, { active: true, take: 150 })
  });

  const returns = returnsQuery.data ?? [];
  const totalAmount = returns.reduce((sum, item) => sum + item.totalAmount, 0);
  const cashLikeCount = returns.filter((item) =>
    ["CASH", "PIX", "CARD_REVERSAL"].includes(item.refundType)
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pos-venda"
        title="Devolucoes"
        description="Retorno de itens para o estoque e reembolso vinculado a vendas reais."
        actions={
          hasPermission("sale-returns.create") ? (
            <Button asChild>
              <Link to="/sale-returns/new">
                <Plus className="mr-2 h-4 w-4" />
                Nova devolucao
              </Link>
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <AdvancedSummaryCard label="Devolucoes" value={String(returns.length)} helper="Registros persistidos no banco." />
        <AdvancedSummaryCard label="Total devolvido" value={formatCurrency(totalAmount)} helper="Soma financeira das devolucoes filtradas." />
        <AdvancedSummaryCard label="Reembolsos monetarios" value={String(cashLikeCount)} helper="Fluxos que exigiram caixa aberto." />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px_220px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="sale-returns-search">Busca</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                id="sale-returns-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Numero da devolucao, venda ou cliente"
                value={search}
              />
            </div>
          </div>

          <SelectField
            label="Cliente"
            value={customerId}
            onChange={setCustomerId}
            options={[
              { label: "Todos", value: "" },
              ...(customersQuery.data ?? []).map((customer) => ({
                label: customer.name,
                value: customer.id
              }))
            ]}
          />

          <SelectField
            label="Reembolso"
            value={refundType}
            onChange={(value) => setRefundType(value as RefundFilter)}
            options={[
              { label: "Todos", value: "" },
              { label: formatRefundType("CASH"), value: "CASH" },
              { label: formatRefundType("PIX"), value: "PIX" },
              { label: formatRefundType("CARD_REVERSAL"), value: "CARD_REVERSAL" },
              { label: formatRefundType("STORE_CREDIT"), value: "STORE_CREDIT" },
              { label: formatRefundType("EXCHANGE"), value: "EXCHANGE" }
            ]}
          />

          <div className="flex items-end">
            <Button onClick={() => void returnsQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Atualizar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Historico de devolucoes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {returnsQuery.isLoading ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              Carregando devolucoes...
            </div>
          ) : null}
          {returnsQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(returnsQuery.error as Error).message}
            </div>
          ) : null}
          {!returnsQuery.isLoading && !returns.length ? (
            <div className="rounded-2xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
              Nenhuma devolucao encontrada com os filtros atuais.
            </div>
          ) : null}

          <div className="space-y-3">
            {returns.map((item) => (
              <Link
                key={item.id}
                className="block rounded-[1.5rem] border border-border/70 bg-card/80 p-4 transition-colors hover:bg-secondary/35"
                to={`/sale-returns/${item.id}`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-lg font-semibold">{item.returnNumber}</p>
                    <p className="text-sm text-muted-foreground">
                      Venda {item.sale.saleNumber} • {item.customer?.name ?? "Consumidor final"}
                    </p>
                    <p className="text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                  <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:min-w-[420px] lg:grid-cols-3">
                    <InfoItem label="Criada em" value={formatDateTime(item.createdAt)} />
                    <InfoItem label="Reembolso" value={formatRefundType(item.refundType)} />
                    <InfoItem label="Valor" value={formatCurrency(item.totalAmount)} />
                    <InfoItem label="Itens" value={String(item._count.items)} />
                    <InfoItem label="Venda" value={item.sale.receiptNumber ?? item.sale.saleNumber} />
                    <InfoItem label="Status venda" value={item.sale.status} />
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
