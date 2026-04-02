import { PageHeader } from "@/components/app/page-header";
import { CategoriesPanel } from "@/features/admin/categories-panel";
import { useAppSession } from "@/app/session-context";

export function CategoriesPage() {
  const { session } = useAppSession();

  return (
    <div className="space-y-6">
      <PageHeader
        description="Estruture prefixos, sequencias e serializacao padrao do catalogo."
        eyebrow="Cadastros"
        title="Categorias"
      />
      <CategoriesPanel token={session.accessToken} />
    </div>
  );
}
