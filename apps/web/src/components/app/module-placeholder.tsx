import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Construction, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "./page-header";

type ModulePlaceholderProps = {
  title: string;
  description: string;
  moduleLabel: string;
  statusLabel?: string;
  summary: string;
  bullets: string[];
  primaryAction?: {
    label: string;
    to: string;
  };
};

export function ModulePlaceholder({
  title,
  description,
  moduleLabel,
  statusLabel = "Estrutura preparada",
  summary,
  bullets,
  primaryAction
}: ModulePlaceholderProps) {
  return (
    <div className="space-y-6">
      <PageHeader
        badge={
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
            {statusLabel}
          </span>
        }
        description={description}
        eyebrow={moduleLabel}
        title={title}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_340px]">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Construction className="h-5 w-5 text-primary" />
              Tela organizada para a trilha completa
            </CardTitle>
            <CardDescription>{summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-border/70 bg-secondary/40 p-4 text-sm leading-6 text-muted-foreground">
              O layout, o contexto visual e a navegacao desta area ja fazem parte do
              sistema, mas o fluxo operacional completo ainda depende do modulo
              backend correspondente.
            </div>

            <div className="grid gap-3">
              {bullets.map((bullet) => (
                <div
                  key={bullet}
                  className="flex gap-3 rounded-2xl border border-border/70 bg-card/80 p-4"
                >
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-sm leading-6 text-muted-foreground">{bullet}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <AlertTriangle className="h-5 w-5 text-primary" />
              Proximo encaixe
            </CardTitle>
            <CardDescription>
              Esta pagina evita navegacao quebrada e deixa a trilha pronta para a
              proxima entrega funcional.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
              Enquanto o modulo nao ganha API e interacao completas, a operacao
              continua centralizada nas areas ja entregues da loja.
            </div>

            {primaryAction ? (
              <Button asChild className="w-full">
                <Link to={primaryAction.to}>
                  {primaryAction.label}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
