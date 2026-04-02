import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, LogOut, Shield, StoreIcon, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getCurrentStore, getHealth, resolveApiAssetUrl } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAppSession } from "./session-context";
import {
  findNavigationItem,
  getRouteTitle,
  isNavigationItemActive,
  navigationGroups
} from "./navigation";

export function AppShell() {
  const { hasPermission, onLogout, session } = useAppSession();
  const location = useLocation();
  const routeMeta = getRouteTitle(location.pathname);
  const currentNavItem = findNavigationItem(location.pathname);
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30000
  });
  const storeQuery = useQuery({
    queryKey: ["stores", "current"],
    queryFn: () => getCurrentStore(session.accessToken)
  });

  const activeStore = storeQuery.data;
  const storeName =
    activeStore?.displayName ?? session.user.store.displayName ?? session.user.store.name;
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(item.permission))
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1800px] gap-6 px-4 py-4 lg:grid-cols-[300px_minmax(0,1fr)] lg:px-6">
        <aside
          className="rounded-[2rem] shadow-panel"
          style={{
            backgroundColor: "var(--shell-sidebar)",
            color: "var(--shell-sidebar-foreground)"
          }}
        >
          <div className="flex h-full flex-col">
            <div className="space-y-5 border-b border-white/10 p-6">
              <div className="flex items-center gap-3">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-[1.35rem] border border-white/12 bg-white/10">
                  {activeStore?.logoUrl ? (
                    <img
                      alt={`Logo ${storeName}`}
                      className="h-11 w-11 rounded-xl object-cover"
                      src={resolveApiAssetUrl(activeStore.logoUrl) ?? activeStore.logoUrl}
                    />
                  ) : (
                    <StoreIcon className="h-6 w-6" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-200">
                    {activeStore?.code ?? session.user.store.code}
                  </p>
                  <p className="text-xl font-black tracking-tight">{storeName}</p>
                </div>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold">Operador ativo</p>
                <p className="mt-2 text-lg font-bold">{session.user.name}</p>
                <p className="text-sm text-white/72">{session.user.role.name}</p>
                <p className="mt-3 text-sm leading-6 text-white/72">
                  Shell principal da operacao com branding da loja, catalogo,
                  cadastros base, usuarios, papeis e auditoria.
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-4">
              {visibleGroups.map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="px-3 text-xs font-semibold uppercase tracking-[0.28em] text-white/42">
                    {group.label}
                  </p>

                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = isNavigationItemActive(item, location.pathname);

                      return (
                        <Link
                          key={item.to}
                          className={cn(
                            "flex items-start gap-3 rounded-2xl border px-3 py-3 transition-colors",
                            active
                              ? "border-primary/35 bg-white/10 text-white"
                              : "border-transparent text-white/78 hover:border-white/10 hover:bg-white/6 hover:text-white"
                          )}
                          to={item.to}
                        >
                          <div
                            className={cn(
                              "rounded-xl p-2",
                              active ? "bg-primary/20 text-orange-200" : "bg-white/5"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold">{item.label}</p>
                            <p className="text-sm leading-5 text-white/52">{item.description}</p>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-h-screen flex-col gap-6">
          <header className="rounded-[2rem] border border-border/80 bg-white/92 shadow-panel">
            <div className="flex flex-col gap-5 p-6 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                    Sessao autenticada
                  </span>
                  {currentNavItem ? (
                    <span className="rounded-full border border-border/80 bg-secondary/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-secondary-foreground">
                      {currentNavItem.label}
                    </span>
                  ) : null}
                </div>

                <div>
                  <h1 className="text-3xl font-black tracking-tight">{routeMeta.title}</h1>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">
                    {routeMeta.description}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <StatusPill
                  icon={Wifi}
                  label="API"
                  value={healthQuery.data?.status === "ok" ? "Online" : "Pendente"}
                />
                <StatusPill
                  icon={CheckCircle2}
                  label="Banco"
                  value={
                    healthQuery.data?.database.status === "up" ? "Conectado" : "Aguardando"
                  }
                />
                <StatusPill
                  icon={Shield}
                  label="Perfil"
                  value={session.user.role.name}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border/70 px-6 py-4 md:flex-row md:items-center md:justify-between">
              <p className="text-sm text-muted-foreground">
                Ultimo healthcheck:{" "}
                {healthQuery.data?.timestamp
                  ? formatDateTime(healthQuery.data.timestamp)
                  : "aguardando"}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-border/80 bg-secondary/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {storeName}
                </div>
                <Button onClick={onLogout} type="button" variant="outline">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </Button>
              </div>
            </div>
          </header>

          <main className="pb-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function StatusPill({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Wifi;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-border/70 bg-secondary/35">
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <p className="text-sm font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
