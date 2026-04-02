import { Link } from "react-router-dom";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function UnauthorizedPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="w-full max-w-xl border-border/70 bg-white/92 shadow-panel">
        <CardContent className="space-y-5 p-8 text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight">Acesso negado</h1>
            <p className="text-sm leading-6 text-muted-foreground">
              Seu papel atual nao tem permissao para abrir esta area do sistema.
            </p>
          </div>
          <Button asChild>
            <Link to="/dashboard">Voltar ao dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
