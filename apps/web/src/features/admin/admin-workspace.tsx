import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Building2,
  FolderKanban,
  LayoutDashboard,
  Palette,
  Tags,
  Truck,
  Users
} from "lucide-react";
import type { AuthSession } from "@/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { getCurrentStore, getHealth } from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";
import { AuthSummary } from "../auth/auth-summary";
import { CategoriesPanel } from "./categories-panel";
import { CustomersPanel } from "./customers-panel";
import { StoreSettingsPanel } from "./store-settings-panel";
import { SuppliersPanel } from "./suppliers-panel";

type AdminWorkspaceProps = {
  session: AuthSession;
  onLogout(): void;
};

type AdminSection =
  | "overview"
  | "storeSettings"
  | "customers"
  | "suppliers"
  | "categories";

type SectionConfig = {
  id: AdminSection;
  label: string;
  description: string;
  icon: LucideIcon;
};

const sections: SectionConfig[] = [
  {
    id: "overview",
    label: "Resumo",
    description: "Visao geral da sessao e atalhos da operacao.",
    icon: LayoutDashboard
  },
  {
    id: "storeSettings",
    label: "Loja",
    description: "Nome visual, cores e assets institucionais.",
    icon: Palette
  },
  {
    id: "customers",
    label: "Clientes",
    description: "Cadastro e consulta de clientes.",
    icon: Users
  },
  {
    id: "suppliers",
    label: "Fornecedores",
    description: "Gestao basica de fornecedores.",
    icon: Truck
  },
  {
    id: "categories",
    label: "Categorias",
    description: "Prefixos, sequencias e serializacao.",
    icon: Tags
  }
];

export function AdminWorkspace({ session, onLogout }: AdminWorkspaceProps) {
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");
  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    refetchInterval: 30000
  });
  const storeQuery = useQuery({
    queryKey: ["stores", "current", session.user.store.id],
    queryFn: () => getCurrentStore(session.accessToken)
  });

  const currentSection = sections.find((section) => section.id === activeSection) ?? sections[0];
  const activeStore = storeQuery.data ?? null;
  const storeCode = activeStore?.code ?? session.user.store.code;
  const storeDisplayName =
    activeStore?.displayName || activeStore?.name || session.user.store.name;
  const storeOfficialName = activeStore?.name || session.user.store.name;
  const operatorRole = session.user.role.name;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="overflow-hidden rounded-[2rem] border border-border/80 bg-white/90 shadow-panel backdrop-blur">
          <div className="flex flex-col gap-5 p-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                <FolderKanban className="h-3.5 w-3.5" />
                Workspace administrativo
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  {storeDisplayName}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                  Base administrativa da ALPHA TECNOLOGIA com catalogo,
                  configuracao da loja e cadastros principais em um unico workspace.
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-[1.75rem] border border-border/70 bg-secondary/40 p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Building2 className="h-4 w-4" />
                  Loja ativa
                </div>
                <p className="text-lg font-semibold">{storeCode}</p>
                <p className="text-sm text-muted-foreground">{storeOfficialName}</p>
              </div>

              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">Usuario logado</p>
                <p className="text-lg font-semibold">{session.user.name}</p>
                <p className="text-sm text-muted-foreground">{operatorRole}</p>
              </div>
            </div>
          </div>

          <div className="border-t border-border/70 bg-gradient-to-r from-slate-950 via-slate-900 to-orange-500/90 px-6 py-5 text-white">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-center">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/75">
                  Workspace comercial
                </p>
                <p className="text-2xl font-black tracking-tight">
                  Operacao pronta para configurar a identidade da loja,
                  catalogo e os cadastros base.
                </p>
                <p className="max-w-3xl text-sm leading-6 text-white/80">
                  Ajuste `stores/settings` primeiro se quiser alinhar nome visual,
                  cores e banner. Depois siga para clientes, fornecedores e categorias.
                </p>
              </div>

              <div className="grid gap-3 rounded-[1.5rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white/80">Paleta atual</p>
                  <span className="rounded-full border border-white/15 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                    {activeStore?.heroBannerEnabled ? "Hero on" : "Hero off"}
                  </span>
                </div>
                <div className="flex gap-2">
                  <ColorSwatch color={activeStore?.primaryColor ?? "#f97316"} />
                  <ColorSwatch color={activeStore?.secondaryColor ?? "#111827"} />
                  <ColorSwatch color={activeStore?.accentColor ?? "#ffffff"} />
                </div>
                <p className="text-sm text-white/80">{storeDisplayName}</p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[270px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Navegacao</CardTitle>
                <CardDescription>
                  Escolha um modulo para continuar a operacao.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {sections.map((section) => {
                  const Icon = section.icon;

                  return (
                    <button
                      key={section.id}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors",
                        activeSection === section.id
                          ? "border-primary/30 bg-primary/10 text-foreground"
                          : "border-border/70 bg-card/70 text-foreground hover:bg-secondary"
                      )}
                      onClick={() => {
                        setActiveSection(section.id);
                      }}
                      type="button"
                    >
                      <div className="rounded-xl bg-white/80 p-2 text-primary shadow-sm">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold">{section.label}</p>
                        <p className="text-sm leading-5 text-muted-foreground">
                          {section.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Status do sistema</CardTitle>
                <CardDescription>
                  Monitor simples para validar a base local.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
                  <p className="text-sm font-medium text-muted-foreground">API</p>
                  <p className="mt-2 text-xl font-semibold">
                    {healthQuery.data?.status === "ok" ? "Online" : "Aguardando"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {healthQuery.data?.database.message ??
                      "Aguardando resposta do healthcheck."}
                  </p>
                </div>

                <Button className="w-full" variant="outline" onClick={onLogout}>
                  Encerrar sessao
                </Button>
              </CardContent>
            </Card>
          </aside>

          <section className="space-y-4">
            <div>
              <h2 className="text-2xl font-black tracking-tight">{currentSection.label}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {currentSection.description}
              </p>
            </div>

            {activeSection === "overview" ? (
              <OverviewPanel
                onLogout={onLogout}
                onSelectSection={setActiveSection}
                session={session}
                storeDisplayName={storeDisplayName}
              />
            ) : null}
            {activeSection === "storeSettings" ? (
              <StoreSettingsPanel
                errorMessage={getErrorMessage(storeQuery.error)}
                isLoading={storeQuery.isLoading}
                store={activeStore}
                token={session.accessToken}
              />
            ) : null}
            {activeSection === "customers" ? (
              <CustomersPanel token={session.accessToken} />
            ) : null}
            {activeSection === "suppliers" ? (
              <SuppliersPanel token={session.accessToken} />
            ) : null}
            {activeSection === "categories" ? (
              <CategoriesPanel token={session.accessToken} />
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}

type OverviewPanelProps = {
  session: AuthSession;
  onLogout(): void;
  onSelectSection(section: AdminSection): void;
  storeDisplayName: string;
};

function OverviewPanel({
  session,
  onLogout,
  onSelectSection,
  storeDisplayName
}: OverviewPanelProps) {
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Atalhos da operacao</CardTitle>
          <CardDescription>
            Use estes acessos rapidos para configurar {storeDisplayName} e abrir os
            cadastros ja liberados neste MVP.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <QuickAccessCard
            description="Nome visual, cores, hero e assets da loja."
            icon={Palette}
            label="Loja"
            onClick={() => {
              onSelectSection("storeSettings");
            }}
          />
          <QuickAccessCard
            description="Cadastro, busca e inativacao basica."
            icon={Users}
            label="Clientes"
            onClick={() => {
              onSelectSection("customers");
            }}
          />
          <QuickAccessCard
            description="Base inicial de parceiros comerciais."
            icon={Truck}
            label="Fornecedores"
            onClick={() => {
              onSelectSection("suppliers");
            }}
          />
          <QuickAccessCard
            description="Prefixos e sequencias para o catalogo."
            icon={Tags}
            label="Categorias"
            onClick={() => {
              onSelectSection("categories");
            }}
          />
        </CardContent>
      </Card>

      <AuthSummary
        onLogout={onLogout}
        session={session}
        storeName={storeDisplayName}
      />
    </div>
  );
}

type QuickAccessCardProps = {
  label: string;
  description: string;
  icon: LucideIcon;
  onClick(): void;
};

function QuickAccessCard({
  label,
  description,
  icon: Icon,
  onClick
}: QuickAccessCardProps) {
  return (
    <button
      className="rounded-[1.75rem] border border-border/80 bg-card/90 p-5 text-left shadow-sm transition-colors hover:bg-secondary"
      onClick={onClick}
      type="button"
    >
      <div className="inline-flex rounded-2xl bg-primary/10 p-3 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-lg font-semibold">{label}</p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </button>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <span
      className="h-9 w-9 rounded-full border border-white/20 shadow-sm"
      style={{ backgroundColor: color }}
    />
  );
}

function getErrorMessage(error: unknown) {
  return error ? parseApiError(error) : null;
}
