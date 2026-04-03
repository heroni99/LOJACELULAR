import { Card, CardContent } from "@/components/ui/card";

type PageLoadingProps = {
  title?: string;
  description?: string;
};

export function PageLoading({
  title = "Carregando",
  description = "Buscando dados da pagina..."
}: PageLoadingProps) {
  return (
    <div className="mx-auto flex min-h-[320px] w-full max-w-[720px] items-center justify-center">
      <Card
        className="w-full max-w-[520px] overflow-hidden border"
        style={{
          borderColor: "var(--color-border)",
          borderRadius: "var(--radius-card)",
          backgroundColor: "var(--color-surface-2)"
        }}
      >
        <CardContent className="space-y-5 p-6">
          <div className="space-y-2">
            <div className="h-3 w-24 animate-pulse rounded-full bg-white/10" />
            <div className="h-7 w-48 animate-pulse rounded-full bg-white/10" />
          </div>

          <div className="space-y-3">
            <div className="h-11 animate-pulse rounded-xl bg-white/10" />
            <div className="h-11 animate-pulse rounded-xl bg-white/10" />
            <div className="h-28 animate-pulse rounded-2xl bg-white/10" />
          </div>

          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
              {title}
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
              {description}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
