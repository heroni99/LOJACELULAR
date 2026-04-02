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
import {
  getFiscalReport,
  listFiscalDocuments,
  type ListFiscalDocumentsFilters
} from "@/lib/api";
import { formatCompactNumber, formatCurrency, formatDateTime } from "@/lib/format";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type StatusFilter = NonNullable<ListFiscalDocumentsFilters["status"]> | "";
type TypeFilter = NonNullable<ListFiscalDocumentsFilters["documentType"]> | "";

export function FiscalPage() {
  const { session } = useAppSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [documentType, setDocumentType] = useState<TypeFilter>("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filters: ListFiscalDocumentsFilters = {
    search: search.trim() || undefined,
    status: status || undefined,
    documentType: documentType || undefined,
    startDate: startDate || undefined,
    endDate: endDate || undefined,
    take: 120
  };

  const documentsQuery = useQuery({
    queryKey: ["fiscal", "documents", filters],
    queryFn: () => listFiscalDocuments(session.accessToken, filters)
  });
  const reportQuery = useQuery({
    queryKey: ["fiscal", "report", filters],
    queryFn: () => getFiscalReport(session.accessToken, filters)
  });

  const documents = documentsQuery.data ?? [];
  const summary = reportQuery.data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fiscal"
        title="Fiscal core"
        description="Comprovantes internos, cancelamentos rastreados e visao honesta do que ja existe de base fiscal executavel."
        actions={
          <Button
            onClick={() => {
              void Promise.all([documentsQuery.refetch(), reportQuery.refetch()]);
            }}
            type="button"
            variant="outline"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        }
      />

      <Card className="border-orange-200 bg-orange-50/90">
        <CardContent className="space-y-2 p-5 text-sm text-slate-800">
          <p className="font-semibold">Escopo fiscal atual</p>
          <p>
            Esta tela opera apenas comprovantes internos da ALPHA TECNOLOGIA e seus
            cancelamentos rastreados. Nao existe emissao fiscal SEFAZ executavel nesta
            base atual.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_220px_180px_180px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="fiscal-search">
              Busca
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="fiscal-search"
                className="pl-10"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Venda, recibo ou cliente"
                value={search}
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Tipo</label>
            <select
              className={selectClassName}
              onChange={(event) => setDocumentType(event.target.value as TypeFilter)}
              value={documentType}
            >
              <option value="">Todos</option>
              <option value="RECEIPT">Recibo interno</option>
              <option value="SERVICE_RECEIPT">Recibo de servico</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <select
              className={selectClassName}
              onChange={(event) => setStatus(event.target.value as StatusFilter)}
              value={status}
            >
              <option value="">Todos</option>
              <option value="AUTHORIZED">Autorizado</option>
              <option value="CANCELED">Cancelado</option>
              <option value="PENDING">Pendente</option>
              <option value="ERROR">Erro</option>
            </select>
          </div>

          <FieldDate label="De" onChange={setStartDate} value={startDate} />
          <FieldDate label="Ate" onChange={setEndDate} value={endDate} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Documentos"
          value={formatCompactNumber(summary?.totalDocuments ?? 0)}
        />
        <MetricCard
          label="Autorizados"
          value={formatCompactNumber(summary?.authorizedCount ?? 0)}
        />
        <MetricCard
          label="Cancelados"
          value={formatCompactNumber(summary?.canceledCount ?? 0)}
        />
        <MetricCard
          label="Recibos internos"
          value={formatCompactNumber(summary?.receiptCount ?? 0)}
        />
        <MetricCard
          label="Recibos de servico"
          value={formatCompactNumber(summary?.serviceReceiptCount ?? 0)}
        />
        <MetricCard
          label="Valor total"
          value={formatCurrency(summary?.totalAmount ?? 0)}
        />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Documentos e comprovantes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {documentsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Carregando documentos fiscais/documentais...
            </div>
          ) : null}

          {documentsQuery.error ? (
            <div className="p-6 text-sm text-red-700">
              {(documentsQuery.error as Error).message}
            </div>
          ) : null}

          {documents.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Documento</th>
                    <th className="px-4 py-3 font-medium">Venda</th>
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Emitido em</th>
                    <th className="px-4 py-3 font-medium text-right">Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id} className="border-b border-border/60">
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">
                            {translateDocumentType(document.documentType)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {document.receiptNumber || "Sem recibo"}
                          </p>
                          {document.events.length ? (
                            <p className="text-xs text-muted-foreground">
                              Ultimo evento:{" "}
                              {document.events[document.events.length - 1]?.description ||
                                translateFiscalEvent(
                                  document.events[document.events.length - 1]?.eventType || ""
                                )}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1">
                          <p className="font-semibold">{document.sale.saleNumber}</p>
                          <p className="text-xs text-muted-foreground">
                            {document.sale.fiscalStatus}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {document.sale.customer?.name || "Consumidor nao identificado"}
                      </td>
                      <td className="px-4 py-4 font-semibold">
                        {formatCurrency(document.sale.total)}
                      </td>
                      <td className="px-4 py-4">
                        <StatusBadge tone={toneByFiscalStatus(document.status)}>
                          {document.status}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-4 text-muted-foreground">
                        {formatDateTime(document.issuedAt || document.createdAt)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/sales/${document.sale.id}`}>
                            <Eye className="mr-2 h-4 w-4" />
                            Venda
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !documentsQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">
              Nenhum documento encontrado com os filtros atuais.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function FieldDate({
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
      <label className="text-sm font-medium">{label}</label>
      <Input onChange={(event) => onChange(event.target.value)} type="date" value={value} />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-2 p-5">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function translateDocumentType(value: string) {
  switch (value) {
    case "RECEIPT":
      return "Recibo interno";
    case "SERVICE_RECEIPT":
      return "Recibo de servico";
    case "NFCE":
      return "NFC-e";
    case "NFE":
      return "NF-e";
    default:
      return value;
  }
}

function translateFiscalEvent(value: string) {
  switch (value) {
    case "CREATED":
      return "Criado";
    case "AUTHORIZED":
      return "Autorizado";
    case "REJECTED":
      return "Rejeitado";
    case "CANCELED":
      return "Cancelado";
    case "ERROR":
      return "Erro";
    case "VOIDED":
      return "Inutilizado";
    default:
      return value;
  }
}

function toneByFiscalStatus(status: string) {
  if (status === "AUTHORIZED") {
    return "green";
  }

  if (status === "CANCELED") {
    return "amber";
  }

  if (status === "ERROR" || status === "REJECTED") {
    return "orange";
  }

  return "slate";
}
