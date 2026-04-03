import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Link2 } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSaleReturn } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { formatRefundType } from "@/pages/advanced/advanced-shared";

export function SaleReturnDetailPage() {
  const { id = "" } = useParams();
  const { session } = useAppSession();

  const returnQuery = useQuery({
    queryKey: ["sale-returns", id],
    queryFn: () => getSaleReturn(session.accessToken, id),
    enabled: Boolean(id)
  });

  const record = returnQuery.data;

  if (returnQuery.isLoading) {
    return <div className="rounded-2xl border border-dashed border-border/70 px-4 py-8 text-sm text-muted-foreground">Carregando devolucao...</div>;
  }

  if (returnQuery.error || !record) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
        {(returnQuery.error as Error)?.message ?? "Devolucao nao encontrada."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/sale-returns"
        subtitle={`Venda ${record.sale.saleNumber} • ${record.customer?.name ?? "Consumidor final"}`}
        title={record.returnNumber}
        actions={
          <Button asChild type="button" variant="outline">
            <Link to={`/sales/${record.sale.id}`}>
              <Link2 className="mr-2 h-4 w-4" />
              Abrir venda
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Reembolso" value={formatRefundType(record.refundType)} helper="Tratamento financeiro da devolucao." />
        <MetricCard label="Valor total" value={formatCurrency(record.totalAmount)} helper="Somatorio persistido desta devolucao." />
        <MetricCard label="Itens" value={String(record.items.length)} helper="Itens efetivamente devolvidos." />
        <MetricCard label="Criada em" value={formatDateTime(record.createdAt)} helper="Data real da operacao." />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Resumo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <InfoItem label="Venda" value={record.sale.saleNumber} />
          <InfoItem label="Recibo" value={record.sale.receiptNumber ?? "Nao informado"} />
          <InfoItem label="Status da venda" value={record.sale.status} />
          <InfoItem label="Cliente" value={record.customer?.name ?? "Consumidor final"} />
          <InfoItem label="Usuario" value={record.createdByUser?.name ?? "Sistema"} />
          <InfoItem label="Concluida em" value={formatDateTime(record.sale.completedAt)} />
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Motivo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-6">{record.reason}</p>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Itens devolvidos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {record.items.map((item) => (
            <div
              key={item.id}
              className="rounded-[1.5rem] border border-border/70 bg-card/80 p-4"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <p className="font-semibold">
                    {item.saleItem.product.internalCode} • {item.saleItem.product.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Qtd devolvida: {item.quantity} • Valor: {formatCurrency(item.amount)}
                  </p>
                  {item.saleItem.productUnit ? (
                    <p className="text-sm text-muted-foreground">
                      Unidade: {item.saleItem.productUnit.imei ?? item.saleItem.productUnit.serialNumber ?? item.saleItem.productUnit.id}
                    </p>
                  ) : null}
                </div>

                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <InfoItem label="Retornou ao estoque" value={item.returnToStock ? "Sim" : "Nao"} />
                  <InfoItem label="Tipo" value={item.saleItem.product.isService ? "Servico" : "Produto"} />
                </dl>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-2 p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
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
