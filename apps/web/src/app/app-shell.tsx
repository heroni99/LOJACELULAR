import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  StoreIcon,
  Wifi,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getCurrentStore,
  getHealth,
  listAccountsPayable,
  listAccountsReceivable,
  listServiceOrders,
  resolveApiAssetUrl
} from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useAppSession } from "./session-context";
import type { AppNavBadgeKey, AppNavGroup, AppNavItem } from "./navigation";
import {
  findNavigationItem,
  getRouteTitle,
  isNavigationItemActive,
  navigationGroups
} from "./navigation";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebar-collapsed";
const OPEN_SERVICE_ORDER_STATUS_MAP: Record<string, true> = {
  OPEN: true,
  WAITING_APPROVAL: true,
  APPROVED: true,
  IN_PROGRESS: true,
  WAITING_PARTS: true,
  READY_FOR_DELIVERY: true
};

export function AppShell() {
  const { hasPermission, onLogout, session } = useAppSession();
  const location = useLocation();
  const routeMeta = getRouteTitle(location.pathname);
  const currentNavItem = findNavigationItem(location.pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readStoredSidebarCollapsed);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30000
  });
  const storeQuery = useQuery({
    queryKey: ["stores", "current"],
    queryFn: () => getCurrentStore(session.accessToken)
  });
  const serviceOrdersBadgeQuery = useQuery({
    queryKey: ["service-orders", "sidebar-badge", "open"],
    queryFn: async () => {
      const orders = await listServiceOrders(session.accessToken, { take: 150 });
      return orders.filter((order) => OPEN_SERVICE_ORDER_STATUS_MAP[order.status]).length;
    },
    enabled: hasPermission("service-orders.read"),
    staleTime: 30000
  });
  const accountsPayableBadgeQuery = useQuery({
    queryKey: ["accounts-payable", "sidebar-badge", "overdue"],
    queryFn: async () => {
      const entries = await listAccountsPayable(session.accessToken, {
        status: "OVERDUE",
        take: 150
      });
      return entries.length;
    },
    enabled: hasPermission("accounts-payable.read"),
    staleTime: 30000
  });
  const accountsReceivableBadgeQuery = useQuery({
    queryKey: ["accounts-receivable", "sidebar-badge", "overdue"],
    queryFn: async () => {
      const entries = await listAccountsReceivable(session.accessToken, {
        status: "OVERDUE",
        take: 150
      });
      return entries.length;
    },
    enabled: hasPermission("accounts-receivable.read"),
    staleTime: 30000
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      SIDEBAR_COLLAPSED_STORAGE_KEY,
      JSON.stringify(sidebarCollapsed)
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileSidebarOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileSidebarOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileSidebarOpen]);

  const activeStore = storeQuery.data;
  const storeName =
    activeStore?.displayName ?? session.user.store.displayName ?? session.user.store.name;
  const storeCode = activeStore?.code ?? session.user.store.code;
  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => hasPermission(item.permission))
    }))
    .filter((group) => group.items.length > 0);
  const navBadgeCounts: Partial<Record<AppNavBadgeKey, number>> = {
    "service-orders-open": serviceOrdersBadgeQuery.data ?? 0,
    "accounts-payable-overdue": accountsPayableBadgeQuery.data ?? 0,
    "accounts-receivable-overdue": accountsReceivableBadgeQuery.data ?? 0
  };
  const showNavigation = visibleGroups.length > 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-[1800px] gap-4 px-3 py-3 md:px-4 lg:px-6">
        {showNavigation ? (
          <>
            <aside
              className="hidden shrink-0 md:block"
              style={{ width: sidebarCollapsed ? 64 : 240 }}
            >
              <div
                className="h-full overflow-hidden rounded-[2rem] shadow-panel transition-[width] duration-200"
                style={{
                  backgroundColor: "var(--shell-sidebar)",
                  color: "var(--shell-sidebar-foreground)"
                }}
              >
                <SidebarNavigation
                  badgeCounts={navBadgeCounts}
                  collapsed={sidebarCollapsed}
                  groups={visibleGroups}
                  logoUrl={activeStore?.logoUrl ?? null}
                  onNavigate={() => undefined}
                  onToggle={() => setSidebarCollapsed((current) => !current)}
                  pathname={location.pathname}
                  storeCode={storeCode}
                  storeName={storeName}
                  toggleIcon={sidebarCollapsed ? PanelLeftOpen : PanelLeftClose}
                  toggleLabel={sidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
                  userName={session.user.name}
                  userRole={session.user.role.name}
                />
              </div>
            </aside>

            {mobileSidebarOpen ? (
              <div className="fixed inset-0 z-50 md:hidden">
                <button
                  aria-label="Fechar navegacao"
                  className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]"
                  onClick={() => setMobileSidebarOpen(false)}
                  type="button"
                />
                <div className="absolute inset-y-0 left-0 w-[240px] max-w-[calc(100vw-1rem)] p-2">
                  <div
                    className="h-full overflow-hidden rounded-[2rem] shadow-panel"
                    style={{
                      backgroundColor: "var(--shell-sidebar)",
                      color: "var(--shell-sidebar-foreground)"
                    }}
                  >
                    <SidebarNavigation
                      badgeCounts={navBadgeCounts}
                      collapsed={false}
                      groups={visibleGroups}
                      logoUrl={activeStore?.logoUrl ?? null}
                      onNavigate={() => setMobileSidebarOpen(false)}
                      onToggle={() => setMobileSidebarOpen(false)}
                      pathname={location.pathname}
                      storeCode={storeCode}
                      storeName={storeName}
                      toggleIcon={X}
                      toggleLabel="Fechar navegacao"
                      userName={session.user.name}
                      userRole={session.user.role.name}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        <div className="flex min-h-screen min-w-0 flex-1 flex-col gap-4">
          <header className="overflow-hidden rounded-[2rem] border border-border/80 bg-white/92 shadow-panel">
            <div className="border-b border-border/70">
              <div className="flex flex-col gap-5 p-4 md:p-6 xl:flex-row xl:items-start xl:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {showNavigation ? (
                      <button
                        aria-expanded={mobileSidebarOpen}
                        aria-label="Abrir navegacao"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-white text-foreground transition-colors hover:bg-secondary md:hidden"
                        onClick={() => setMobileSidebarOpen(true)}
                        type="button"
                      >
                        <Menu className="h-4 w-4" />
                      </button>
                    ) : null}

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

                <div className="w-full max-w-[420px] space-y-4">
                  <div className="flex flex-col gap-4 rounded-[1.5rem] border border-border/70 bg-secondary/15 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                        Loja ativa
                      </p>
                      <p className="truncate text-lg font-bold">{storeName}</p>
                      <p className="text-sm text-muted-foreground">
                        {session.user.name} • {session.user.role.name}
                      </p>
                    </div>

                    <Button onClick={onLogout} type="button" variant="outline">
                      <LogOut className="mr-2 h-4 w-4" />
                      Sair
                    </Button>
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
              </div>
            </div>

            <div className="flex flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
              <p className="text-sm text-muted-foreground">
                Ultimo healthcheck:{" "}
                {healthQuery.data?.timestamp
                  ? formatDateTime(healthQuery.data.timestamp)
                  : "aguardando"}
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-border/80 bg-secondary/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {storeCode}
                </div>
                <div className="rounded-full border border-border/80 bg-secondary/50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {session.user.name}
                </div>
              </div>
            </div>
          </header>

          <main className="min-w-0 pb-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarNavigation({
  collapsed,
  groups,
  pathname,
  badgeCounts,
  storeName,
  storeCode,
  logoUrl,
  userName,
  userRole,
  toggleLabel,
  toggleIcon: ToggleIcon,
  onToggle,
  onNavigate
}: {
  collapsed: boolean;
  groups: AppNavGroup[];
  pathname: string;
  badgeCounts: Partial<Record<AppNavBadgeKey, number>>;
  storeName: string;
  storeCode: string;
  logoUrl: string | null;
  userName: string;
  userRole: string;
  toggleLabel: string;
  toggleIcon: typeof X;
  onToggle(): void;
  onNavigate(): void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={cn("border-b border-white/10", collapsed ? "p-2" : "p-4")}>
        <div
          className={cn(
            "gap-3",
            collapsed ? "flex flex-col items-center" : "flex items-start justify-between"
          )}
        >
          <div
            className={cn(
              "gap-3",
              collapsed ? "flex flex-col items-center" : "flex min-w-0 items-center"
            )}
          >
            <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white/10">
              {logoUrl ? (
                <img
                  alt={`Logo ${storeName}`}
                  className="h-8 w-8 rounded-lg object-cover"
                  src={resolveApiAssetUrl(logoUrl) ?? logoUrl}
                />
              ) : (
                <StoreIcon className="h-5 w-5" />
              )}
            </div>

            {!collapsed ? (
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-orange-200">
                  {storeCode}
                </p>
                <p className="truncate text-base font-bold">{storeName}</p>
              </div>
            ) : null}
          </div>

          <button
            aria-label={toggleLabel}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/12 bg-white/8 text-white/78 transition-colors hover:bg-white/14 hover:text-white"
            onClick={onToggle}
            type="button"
          >
            <ToggleIcon className="h-4 w-4" />
          </button>
        </div>

        {!collapsed ? (
          <div className="mt-4 rounded-[1.25rem] border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-semibold">Operador ativo</p>
            <p className="mt-2 text-base font-bold">{userName}</p>
            <p className="text-sm text-white/72">{userRole}</p>
          </div>
        ) : null}
      </div>

      <div className={cn("flex-1 overflow-y-auto", collapsed ? "px-2 py-3" : "p-3")}>
        {groups.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 ? "mt-4" : "")}>
            {collapsed ? (
              <div className="mx-2 mb-2 h-px bg-white/10" />
            ) : (
              <div className="mb-2 flex items-center gap-2 px-2">
                <div className="h-px flex-1 bg-white/10" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-white/42">
                  {group.label}
                </p>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            )}

            <div className="space-y-1">
              {group.items.map((item) => (
                <SidebarNavigationItem
                  badgeCount={item.badgeKey ? badgeCounts[item.badgeKey] ?? 0 : 0}
                  collapsed={collapsed}
                  item={item}
                  key={item.to}
                  onNavigate={onNavigate}
                  pathname={pathname}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SidebarNavigationItem({
  item,
  pathname,
  collapsed,
  badgeCount,
  onNavigate
}: {
  item: AppNavItem;
  pathname: string;
  collapsed: boolean;
  badgeCount: number;
  onNavigate(): void;
}) {
  const Icon = item.icon;
  const active = isNavigationItemActive(item, pathname);
  const showBadge = badgeCount > 0;

  return (
    <Link
      aria-label={item.label}
      className={cn(
        "group relative flex items-center overflow-hidden rounded-xl border transition-colors",
        collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
        active
          ? "text-white"
          : "border-transparent text-white/78 hover:border-white/10 hover:bg-white/6 hover:text-white"
      )}
      onClick={onNavigate}
      style={
        active
          ? {
              backgroundColor: "rgb(var(--brand-primary-rgb) / 0.14)",
              borderColor: "rgb(var(--brand-primary-rgb) / 0.28)"
            }
          : undefined
      }
      title={collapsed ? item.label : undefined}
      to={item.to}
    >
      {active && !collapsed ? (
        <span
          className="absolute inset-y-2 left-0 w-1 rounded-r-full"
          style={{ backgroundColor: "var(--color-primary)" }}
        />
      ) : null}

      <div
        className={cn(
          "relative z-10 flex shrink-0 items-center justify-center rounded-xl",
          collapsed ? "h-10 w-10" : "h-9 w-9",
          active ? "bg-white/10" : "bg-white/5 group-hover:bg-white/10"
        )}
        style={active ? { color: "var(--color-primary)" } : undefined}
      >
        <Icon className="h-4 w-4" />
      </div>

      {!collapsed ? (
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.label}</span>
          {showBadge ? <NavBadge compact={false} count={badgeCount} /> : null}
        </>
      ) : null}

      {collapsed && showBadge ? <NavBadge compact count={badgeCount} /> : null}
    </Link>
  );
}

function NavBadge({
  count,
  compact
}: {
  count: number;
  compact: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full border font-semibold",
        compact
          ? "absolute right-1.5 top-1.5 min-w-[18px] px-1 text-[10px] leading-4"
          : "min-w-[22px] px-2 py-0.5 text-[11px] leading-4"
      )}
      style={{
        borderColor: "rgb(var(--brand-primary-rgb) / 0.35)",
        backgroundColor: "rgb(var(--brand-primary-rgb) / 0.18)",
        color: "var(--color-primary)"
      }}
    >
      {compact ? formatCompactBadgeCount(count) : formatBadgeCount(count)}
    </span>
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

function formatBadgeCount(count: number) {
  return count > 99 ? "99+" : String(count);
}

function formatCompactBadgeCount(count: number) {
  return count > 9 ? "9+" : String(count);
}

function readStoredSidebarCollapsed() {
  if (typeof window === "undefined") {
    return false;
  }

  const raw = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);

  if (!raw) {
    return false;
  }

  return raw === "true";
}
