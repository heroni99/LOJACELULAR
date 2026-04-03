import type { FormEventHandler, ReactNode } from "react";
import { Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/loading-button";
import { PageLoading } from "@/components/ui/page-loading";
import { PageHeader } from "@/components/ui/page-header";

type FormPageProps = {
  title: string;
  subtitle?: string;
  backHref: string;
  backLabel: string;
  formId: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  children: ReactNode;
  cancelHref: string;
  cancelLabel?: string;
  saveLabel?: string;
  saving?: boolean;
  saveDisabled?: boolean;
  loading?: boolean;
  loadingMessage?: string;
  errorMessage?: string | null;
};

export function FormPage({
  title,
  subtitle,
  backHref,
  backLabel,
  formId,
  onSubmit,
  children,
  cancelHref,
  cancelLabel = "Cancelar",
  saveLabel = "Salvar",
  saving = false,
  saveDisabled = false,
  loading = false,
  loadingMessage = "Carregando formulario...",
  errorMessage
}: FormPageProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 pb-28">
      <PageHeader backHref={backHref} backLabel={backLabel} subtitle={subtitle} title={title} />

      <form className="mx-auto w-full max-w-[720px] space-y-6" id={formId} onSubmit={onSubmit}>
        {errorMessage ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        {loading ? (
          <PageLoading description={loadingMessage} />
        ) : (
          children
        )}
      </form>

      <div className="sticky bottom-4 z-20 mx-auto w-full max-w-[720px]">
        <div
          className="flex items-center justify-end gap-2 border px-4 py-3 shadow-2xl backdrop-blur"
          style={{
            backgroundColor: "rgb(17 24 39 / 0.92)",
            borderColor: "var(--color-border)",
            borderRadius: "var(--radius-card)"
          }}
        >
          <Button
            onClick={() => navigate(cancelHref)}
            type="button"
            variant="outline"
          >
            {cancelLabel}
          </Button>
          <LoadingButton
            form={formId}
            isLoading={saving}
            loadingText="Salvando..."
            type="submit"
            disabled={loading || saveDisabled}
          >
            <Save className="mr-2 h-4 w-4" />
            {saveLabel}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}
