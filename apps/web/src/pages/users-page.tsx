import { PageHeader } from "@/components/app/page-header";
import { UsersPanel } from "@/features/admin/users-panel";
import { useAppSession } from "@/app/session-context";

export function UsersPage() {
  const { session } = useAppSession();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Crie, edite, ative, inative e redefina senhas dos operadores da loja."
        eyebrow="Administracao"
        title="Usuarios"
      />
      <UsersPanel
        currentStoreId={session.user.store.id}
        currentUserId={session.user.id}
        token={session.accessToken}
      />
    </div>
  );
}
