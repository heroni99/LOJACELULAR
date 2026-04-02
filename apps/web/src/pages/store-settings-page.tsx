import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/page-header";
import { StoreSettingsPanel } from "@/features/admin/store-settings-panel";
import { getCurrentStore } from "@/lib/api";
import { useAppSession } from "@/app/session-context";

export function StoreSettingsPage() {
  const { session } = useAppSession();
  const storeQuery = useQuery({
    queryKey: ["stores", "current"],
    queryFn: () => getCurrentStore(session.accessToken)
  });

  return (
    <div className="space-y-6">
      <PageHeader
        description="Identidade visual, nome institucional, hero e cores da loja ativa."
        eyebrow="Administracao"
        title="Configuracao da loja"
      />
      <StoreSettingsPanel
        errorMessage={storeQuery.error ? (storeQuery.error as Error).message : undefined}
        isLoading={storeQuery.isLoading}
        store={storeQuery.data ?? null}
        token={session.accessToken}
      />
    </div>
  );
}
