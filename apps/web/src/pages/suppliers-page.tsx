import { PageHeader } from "@/components/app/page-header";
import { SuppliersPanel } from "@/features/admin/suppliers-panel";
import { useAppSession } from "@/app/session-context";

export function SuppliersPage() {
  const { session } = useAppSession();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Base de fornecedores para compras, cotacoes e formacao do catalogo."
        eyebrow="Cadastros"
        title="Fornecedores"
      />
      <SuppliersPanel token={session.accessToken} />
    </div>
  );
}
