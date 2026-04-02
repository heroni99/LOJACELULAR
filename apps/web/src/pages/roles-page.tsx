import { PageHeader } from "@/components/app/page-header";
import { RolesPanel } from "@/features/admin/roles-panel";
import { useAppSession } from "@/app/session-context";

export function RolesPage() {
  const { session } = useAppSession();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Revise e atualize as permissoes reais aplicadas por papel no backend."
        eyebrow="Administracao"
        title="Papeis"
      />
      <RolesPanel token={session.accessToken} />
    </div>
  );
}
