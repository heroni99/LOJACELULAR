import { PageHeader } from "@/components/app/page-header";
import { CustomersPanel } from "@/features/admin/customers-panel";
import { useAppSession } from "@/app/session-context";

export function CustomersPage() {
  const { session } = useAppSession();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Cadastre, filtre e inative clientes mantendo o CRM basico da loja organizado."
        eyebrow="Cadastros"
        title="Clientes"
      />
      <CustomersPanel token={session.accessToken} />
    </div>
  );
}
