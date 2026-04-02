import { Link } from "react-router-dom";
import { Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-xl bg-white/90">
        <CardContent className="space-y-4 p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">
            ALPHA TECNOLOGIA
          </p>
          <h1 className="text-3xl font-black tracking-tight">Pagina nao encontrada</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            A rota informada nao faz parte do shell principal. Volte para o dashboard
            para continuar a navegacao do ERP/PDV.
          </p>
          <Button asChild>
            <Link to="/dashboard">
              <Home className="mr-2 h-4 w-4" />
              Ir para dashboard
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
