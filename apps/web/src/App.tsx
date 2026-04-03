import { startTransition, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Store as StoreIcon, Wifi } from "lucide-react";
import { useLocation } from "react-router-dom";
import type { AuthSession, PermissionKey } from "@/shared";
import { AppRoutes } from "./app/app-routes";
import { AppSessionProvider } from "./app/session-context";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import { LoginForm } from "./features/auth/login-form";
import { MobileScannerPage } from "./pages/scanner/mobile-scanner-page";
import {
  API_CONFIGURATION_ERROR_MESSAGE,
  IS_API_CONFIGURED,
  getCurrentStore,
  getHealth,
  getMe,
  logoutSession,
  refreshSession,
  resolveApiAssetUrl,
  type StoreSettings
} from "./lib/api";
import { applyStoreTheme } from "./lib/theme";
import {
  clearStoredSession,
  readStoredSession,
  storeSession
} from "./lib/session-storage";

function createHasPermission(session: AuthSession) {
  return (permission?: PermissionKey | PermissionKey[]) => {
    if (!permission) {
      return true;
    }

    const permissions = new Set(session.user.permissions);
    const requiredPermissions = Array.isArray(permission) ? permission : [permission];

    return requiredPermissions.every((item) => permissions.has(item));
  };
}

export default function App() {
  const location = useLocation();
  const [session, setSession] = useState<AuthSession | null>(() => readStoredSession());
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: IS_API_CONFIGURED ? 30000 : false,
    retry: IS_API_CONFIGURED ? 1 : false
  });
  const storeQuery = useQuery({
    queryKey: ["stores", "current"],
    queryFn: () => getCurrentStore(),
    enabled: IS_API_CONFIGURED,
    retry: 1
  });

  useEffect(() => {
    applyStoreTheme(storeQuery.data ?? null);
  }, [storeQuery.data]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSession() {
      const storedSession = readStoredSession();

      if (!storedSession) {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
        return;
      }

      try {
        const user = await getMe(storedSession.accessToken);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          const nextSession = {
            ...storedSession,
            user
          };

          setSession(nextSession);
          storeSession(nextSession);
        });
      } catch {
        try {
          const refreshedSession = await refreshSession({
            refreshToken: storedSession.refreshToken
          });

          if (cancelled) {
            return;
          }

          startTransition(() => {
            setSession(refreshedSession);
            storeSession(refreshedSession);
          });
        } catch {
          clearStoredSession();

          if (!cancelled) {
            startTransition(() => {
              setSession(null);
            });
          }
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    }

    void bootstrapSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeStore = storeQuery.data ?? null;
  const apiStatusText = healthQuery.data?.status === "ok"
    ? "online"
    : IS_API_CONFIGURED
      ? "aguardando"
      : "nao configurada";
  const apiMetricValue = healthQuery.data?.status === "ok"
    ? "Online"
    : IS_API_CONFIGURED
      ? "Aguardando"
      : "Nao configurada";
  const databaseMetricValue = healthQuery.data?.database.status === "up"
    ? "Conectado"
    : IS_API_CONFIGURED
      ? "Indisponivel"
      : "Nao verificado";
  const environmentMessage =
    healthQuery.data?.database.message ??
    (IS_API_CONFIGURED ? "Verifique PostgreSQL e API." : API_CONFIGURATION_ERROR_MESSAGE);

  if (location.pathname === "/scanner") {
    return <MobileScannerPage />;
  }

  if (isBootstrapping) {
    return <LoadingScreen healthMessage={healthQuery.data?.database.message} store={activeStore} />;
  }

  if (session) {
    return (
      <AppSessionProvider
        value={{
          session,
          authEnabled: true,
          hasPermission: createHasPermission(session),
          onLogout: () => {
            const currentSession = session;

            clearStoredSession();
            startTransition(() => {
              setSession(null);
            });

            void logoutSession(currentSession.accessToken, currentSession.refreshToken).catch(
              () => null
            );
          }
        }}
      >
        <AppRoutes />
      </AppSessionProvider>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid min-h-screen max-w-[1600px] gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1.2fr)_420px] lg:px-10">
        <section
          className="relative overflow-hidden rounded-[2.5rem] border border-border/70 shadow-panel"
          style={{
            background:
              activeStore?.bannerUrl && activeStore.heroBannerEnabled
                ? `linear-gradient(rgba(17, 24, 39, 0.65), rgba(17, 24, 39, 0.55)), url(${resolveApiAssetUrl(activeStore.bannerUrl) ?? activeStore.bannerUrl}) center/cover`
                : `linear-gradient(135deg, ${activeStore?.secondaryColor ?? "#111827"} 0%, ${activeStore?.primaryColor ?? "#f97316"} 100%)`,
            color: activeStore?.accentColor ?? "#ffffff"
          }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.18),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.14),transparent_34%)]" />

          <div className="relative flex h-full flex-col justify-between gap-10 p-8 lg:p-12">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em]">
                {activeStore?.logoUrl ? (
                  <img
                    alt={`Logo ${activeStore.displayName}`}
                    className="h-8 w-8 rounded-xl object-cover"
                    src={resolveApiAssetUrl(activeStore.logoUrl) ?? activeStore.logoUrl}
                  />
                ) : (
                  <StoreIcon className="h-4 w-4" />
                )}
                {activeStore?.displayName ?? "ALPHA TECNOLOGIA"}
              </div>

              <div className="max-w-3xl space-y-4">
                <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
                  ERP e PDV local com base administrativa, identidade da loja e
                  controle real de dados.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-white/82">
                  Branding, cadastros, configuracao da loja, usuarios, papeis e
                  auditoria agora entram no fluxo com autenticacao real e persistencia
                  validada no PostgreSQL.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <BrandMetric
                icon={<Wifi className="h-4 w-4" />}
                label="API"
                value={apiMetricValue}
              />
              <BrandMetric
                icon={<ShieldCheck className="h-4 w-4" />}
                label="Banco"
                value={databaseMetricValue}
              />
              <BrandMetric
                icon={<StoreIcon className="h-4 w-4" />}
                label="Loja"
                value={activeStore?.code ?? "Sem codigo"}
              />
            </div>
          </div>
        </section>

        <section className="flex items-center">
          <div className="w-full space-y-5">
            <div className="space-y-2">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
                Acesso autenticado
              </p>
              <h2 className="text-3xl font-black tracking-tight">
                {activeStore?.displayName ?? "ALPHA TECNOLOGIA"}
              </h2>
              <p className="text-sm leading-6 text-muted-foreground">
                Entre com um usuario seed real para abrir o shell principal da loja.
              </p>
            </div>

            <LoginForm
              onSuccess={(nextSession) => {
                storeSession(nextSession);
                startTransition(() => {
                  setSession(nextSession);
                });
              }}
              store={activeStore}
            />

            <Card className="border-border/70 bg-white/90">
              <CardHeader>
                <CardTitle className="text-lg">Estado do ambiente</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>
                  API:{" "}
                  <strong className="text-foreground">
                    {apiStatusText}
                  </strong>
                </p>
                <p>
                  Banco:{" "}
                  <strong className="text-foreground">
                    {environmentMessage}
                  </strong>
                </p>
                <p>
                  Usuario seed padrao: <code>admin@local.test</code>
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}

function BrandMetric({
  icon,
  label,
  value
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[1.75rem] border border-white/12 bg-white/10 p-4 backdrop-blur">
      <div className="flex items-center gap-2 text-sm font-medium text-white/80">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-2xl font-black tracking-tight text-white">{value}</p>
    </div>
  );
}

function LoadingScreen({
  store,
  healthMessage
}: {
  store: StoreSettings | null;
  healthMessage?: string;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <Card className="w-full max-w-lg border-border/70 bg-white/90">
        <CardContent className="space-y-4 p-8 text-center">
          <div className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold uppercase tracking-[0.22em] text-primary">
            <StoreIcon className="h-4 w-4" />
            {store?.displayName ?? "ALPHA TECNOLOGIA"}
          </div>
          <h1 className="text-2xl font-black tracking-tight">Preparando sessao</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            Validando branding, conectividade e token salvo antes de abrir o sistema.
          </p>
          <div className="rounded-2xl border border-border/70 bg-secondary/35 px-4 py-3 text-sm text-muted-foreground">
            {healthMessage ?? "Conferindo API e banco de dados..."}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
