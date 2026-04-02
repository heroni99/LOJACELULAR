import { Fragment, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, RefreshCw, Search, ShieldCheck, UserRound } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listAudit, type AuditLogEntry, type JsonValue } from "@/lib/api";
import { formatCompactNumber, formatDateTime } from "@/lib/format";

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const takeOptions = [25, 50, 100, 200];

export function AuditPage() {
  const { session } = useAppSession();
  const token = session.accessToken;
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [entity, setEntity] = useState("");
  const [take, setTake] = useState(50);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const auditQuery = useQuery({
    queryKey: ["audit", search, action, entity, take],
    queryFn: () =>
      listAudit(token, {
        search: search.trim() || undefined,
        action: action.trim() || undefined,
        entity: entity.trim() || undefined,
        take
      })
  });

  const logs = auditQuery.data ?? [];
  const summary = useMemo(() => buildSummary(logs), [logs]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administracao"
        title="Auditoria"
        description="Trilha sensivel de eventos do sistema com filtro rapido por acao, entidade, origem e responsavel."
        badge={<StatusBadge tone="green">Logs ativos</StatusBadge>}
        actions={
          <Button onClick={() => void auditQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Logs carregados"
          value={formatCompactNumber(summary.total)}
        />
        <SummaryCard
          icon={<UserRound className="h-4 w-4" />}
          label="Responsaveis"
          value={formatCompactNumber(summary.actors)}
        />
        <SummaryCard
          icon={<Database className="h-4 w-4" />}
          label="Entidades"
          value={formatCompactNumber(summary.entities)}
        />
        <SummaryCard
          icon={<RefreshCw className="h-4 w-4" />}
          label="Acoes"
          value={formatCompactNumber(summary.actions)}
        />
      </div>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle className="text-xl">Filtros</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_220px_220px_140px_auto]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="audit-search">
              Busca
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                id="audit-search"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Acao, entidade ou IP"
                value={search}
              />
            </div>
          </div>

          <FilterField
            label="Acao"
            onChange={setAction}
            placeholder="Ex.: sales.checkout"
            value={action}
          />
          <FilterField
            label="Entidade"
            onChange={setEntity}
            placeholder="Ex.: products"
            value={entity}
          />

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="audit-take">
              Janela
            </label>
            <select
              className={selectClassName}
              id="audit-take"
              onChange={(event) => setTake(Number(event.target.value))}
              value={take}
            >
              {takeOptions.map((value) => (
                <option key={value} value={value}>
                  Ultimos {value}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button onClick={() => void auditQuery.refetch()} type="button" variant="outline">
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardContent className="p-0">
          {auditQuery.isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando trilha de auditoria...</div>
          ) : null}

          {auditQuery.error ? (
            <div className="p-6 text-sm text-red-700">
              {(auditQuery.error as Error).message}
            </div>
          ) : null}

          {logs.length ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-border/70 bg-secondary/40 text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">Data e hora</th>
                    <th className="px-4 py-3 font-medium">Acao</th>
                    <th className="px-4 py-3 font-medium">Entidade</th>
                    <th className="px-4 py-3 font-medium">Responsavel</th>
                    <th className="px-4 py-3 font-medium">Origem</th>
                    <th className="px-4 py-3 font-medium">Loja</th>
                    <th className="px-4 py-3 font-medium text-right">Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const expanded = expandedId === log.id;

                    return (
                      <Fragment key={log.id}>
                        <tr key={log.id} className="border-b border-border/60 align-top">
                          <td className="px-4 py-4 text-muted-foreground">
                            {formatDateTime(log.createdAt)}
                          </td>
                          <td className="px-4 py-4">
                            <StatusBadge tone={getActionTone(log.action)}>{log.action}</StatusBadge>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <p className="font-semibold">{log.entity}</p>
                              <p className="text-xs text-muted-foreground">
                                {log.entityId || "Sem entityId"}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="space-y-1">
                              <p className="font-semibold">{getActorLabel(log)}</p>
                              <p className="text-xs text-muted-foreground">
                                {log.user?.email || getActorMode(log)}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            <div className="space-y-1">
                              <p>{log.ipAddress || "rede local"}</p>
                              <p className="line-clamp-1 max-w-[240px] text-xs">
                                {log.userAgent || "Operacao interna"}
                              </p>
                            </div>
                          </td>
                          <td className="px-4 py-4 text-muted-foreground">
                            {log.store?.displayName || log.store?.name || "Sem loja vinculada"}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Button
                              onClick={() => setExpandedId(expanded ? null : log.id)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {expanded ? "Ocultar" : "Ver"}
                            </Button>
                          </td>
                        </tr>

                        {expanded ? (
                          <tr key={`${log.id}-details`} className="border-b border-border/60 bg-secondary/20">
                            <td className="px-4 py-4" colSpan={7}>
                              <div className="grid gap-4 xl:grid-cols-3">
                                <JsonPanel label="Metadata" value={log.metadata} />
                                <JsonPanel label="Antes" value={log.oldData} />
                                <JsonPanel label="Depois" value={log.newData} />
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !auditQuery.isLoading ? (
            <div className="space-y-3 p-6 text-sm text-muted-foreground">
              <p>Nenhum log encontrado com os filtros atuais.</p>
              <p>Ajuste os filtros ou gere novas acoes sensiveis para alimentar a trilha.</p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function buildSummary(logs: AuditLogEntry[]) {
  return {
    total: logs.length,
    actors: new Set(logs.map((log) => getActorLabel(log))).size,
    entities: new Set(logs.map((log) => log.entity)).size,
    actions: new Set(logs.map((log) => log.action)).size
  };
}

function getActionTone(action: string): "green" | "amber" | "orange" | "slate" | "blue" {
  if (/(created|login|received|paid|open|checkout|refresh)/i.test(action)) {
    return "green";
  }

  if (/(cancel|reject|error|fail|withdrawal|close)/i.test(action)) {
    return "amber";
  }

  if (/(update|adjust|reprocess|change)/i.test(action)) {
    return "orange";
  }

  return "blue";
}

function getActorLabel(log: AuditLogEntry) {
  if (log.user?.name) {
    return log.user.name;
  }

  const metadata = asJsonObject(log.metadata);
  const actorLabel = metadata?.actorLabel;

  return typeof actorLabel === "string" && actorLabel.trim() ? actorLabel : "Sistema";
}

function getActorMode(log: AuditLogEntry) {
  const metadata = asJsonObject(log.metadata);
  const authMode = metadata?.authMode;

  return typeof authMode === "string" ? authMode : "usuario nao identificado";
}

function asJsonObject(value: JsonValue | null) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, JsonValue>;
}

function FilterField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string;
  value: string;
  onChange(value: string): void;
  placeholder: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input onChange={(event) => onChange(event.target.value)} placeholder={placeholder} value={value} />
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-3 p-5">
        <div className="inline-flex rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="text-2xl font-black tracking-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function JsonPanel({ label, value }: { label: string; value: JsonValue | null }) {
  return (
    <div className="rounded-2xl border border-border/80 bg-white/90 p-4">
      <p className="mb-3 text-sm font-semibold">{label}</p>
      <pre className="max-h-80 overflow-auto rounded-xl bg-secondary/40 p-3 text-xs leading-6 text-slate-700">
        {formatJsonValue(value)}
      </pre>
    </div>
  );
}

function formatJsonValue(value: JsonValue | null) {
  if (value == null) {
    return "Sem dados registrados.";
  }

  return JSON.stringify(value, null, 2);
}
