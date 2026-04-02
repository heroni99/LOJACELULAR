import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Eye, RefreshCw, Search } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listCustomers, listSales } from "@/lib/api";
import { formatCompactNumber, formatCurrency, formatDateTime } from "@/lib/format";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function SalesListPage() {
  const { authEnabled, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [status, setStatus] = useState<"" | "COMPLETED" | "CANCELED" | "REFUNDED">("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const customersQuery = useQuery({
    queryKey: ["customers", "sales-filter"],
    queryFn: () => listCustomers(token, { active: true })
  });
  const salesQuery = useQuery({
    queryKey: ["sales", search, customerId, status, startDate, endDate],
    queryFn: () =>
      listSales(token, {
        search: search.trim() || undefined,
        customerId: customerId || undefined,
        status: status || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        take: 120
      })
  });

  const sales = salesQuery.data ?? [];
  const visibleTotal = sales.reduce((sum, sale) => sum + sale.total, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operacao"
        title="Vendas"
        description="Historico comercial da loja com filtros rapidos por data, cliente, status e acesso ao detalhe completo."
      />

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_180px_180px_180px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="sales-search">Busca</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-10" id="sales-search" onChange={(event) => setSearch(event.target.value)} placeholder="Numero da venda, recibo ou cliente" value={search} />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Cliente</label>
            <select className={selectClassName} onChange={(event) => setCustomerId(event.target.value)} value={customerId}>
              <option value="">Todos</option>
              {(customersQuery.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <select className={selectClassName} onChange={(event) => setStatus(event.target.value as typeof status)} value={status}>
              <option value="">Todos</option>
              <option value="COMPLETED">Concluida</option>
              <option value="CANCELED">Cancelada</option>
              <option value="REFUNDED">Reembolsada</option>
            </select>
          </div>
          <FieldDate label="De" onChange={setStartDate} value={startDate} />
          <FieldDate label="Ate" onChange={setEndDate} value={endDate} />
          <div className="flex items-end"><Button onClick={() => void salesQuery.refetch()} type="button" variant="outline"><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Summary label="Vendas carregadas" value={formatCompactNumber(sales.length)} />
        <Summary label="Total visivel" value={formatCurrency(visibleTotal)} />
        <Summary label="Ticket medio" value={formatCurrency(sales.length ? Math.round(visibleTotal / sales.length) : 0)} />
      </div>

      <Card className="bg-white/90">
        <CardContent className="p-0">
          {salesQuery.isLoading ? <div className="p-6 text-sm text-muted-foreground">Carregando vendas...</div> : null}
          {salesQuery.error ? <div className="p-6 text-sm text-red-700">{(salesQuery.error as Error).message}</div> : null}
          {sales.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Venda</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Caixa</th>
                    <th className="px-4 py-3 font-medium">Total</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium text-right">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-b border-border/60">
                      <td className="px-4 py-4"><div className="space-y-1"><p className="font-semibold">{sale.saleNumber}</p><p className="text-xs text-muted-foreground">{sale.receiptNumber || "Sem recibo"}</p></div></td>
                      <td className="px-4 py-4 text-muted-foreground">{sale.customer?.name || "Consumidor nao identificado"}</td>
                      <td className="px-4 py-4 text-muted-foreground">{formatDateTime(sale.completedAt)}</td>
                      <td className="px-4 py-4 text-muted-foreground">{sale.cashSession.cashTerminal.name}</td>
                      <td className="px-4 py-4"><div className="space-y-1"><p className="font-semibold">{formatCurrency(sale.total)}</p><p className="text-xs text-muted-foreground">desc. {formatCurrency(sale.discountAmount)}</p></div></td>
                      <td className="px-4 py-4"><div className="flex flex-wrap gap-2"><StatusBadge tone={sale.status === "COMPLETED" ? "green" : sale.status === "CANCELED" ? "amber" : "orange"}>{sale.status}</StatusBadge><StatusBadge tone="slate">{sale.fiscalStatus}</StatusBadge></div></td>
                      <td className="px-4 py-4 text-right"><Button asChild size="sm" variant="outline"><Link to={`/sales/${sale.id}`}><Eye className="mr-2 h-4 w-4" />Ver</Link></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !salesQuery.isLoading ? <div className="p-6 text-sm text-muted-foreground">Nenhuma venda encontrada com os filtros atuais.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldDate({ label, value, onChange }: { label: string; value: string; onChange(value: string): void }) {
  return <div className="space-y-2"><label className="text-sm font-medium">{label}</label><Input onChange={(event) => onChange(event.target.value)} type="date" value={value} /></div>;
}

function Summary({ label, value }: { label: string; value: string }) {
  return <Card className="bg-white/90"><CardContent className="space-y-2 p-5"><p className="text-sm font-medium text-muted-foreground">{label}</p><p className="text-2xl font-black tracking-tight">{value}</p></CardContent></Card>;
}
