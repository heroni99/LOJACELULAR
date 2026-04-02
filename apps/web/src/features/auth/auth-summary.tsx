import type { AuthSession } from "@/shared";
import { Building2, LogOut, Shield, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";

type AuthSummaryProps = {
  session: AuthSession;
  storeName?: string;
  onLogout(): void;
};

export function AuthSummary({ session, storeName, onLogout }: AuthSummaryProps) {
  return (
    <Card className="border-emerald-200/80 bg-white/95">
      <CardHeader>
        <CardTitle>Sessao iniciada</CardTitle>
        <CardDescription>
          Auth funcionando com JWT, refresh token e acesso controlado por papel e permissao.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-2xl bg-secondary/80 p-4">
          <div className="flex items-center gap-3">
            <UserRound className="h-5 w-5 text-primary" />
            <div>
              <p className="font-semibold">{session.user.name}</p>
              <p className="text-sm text-muted-foreground">{session.user.email}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-border/80 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Shield className="h-4 w-4" />
              Perfil
            </div>
            <p className="mt-2 text-lg font-semibold">{session.user.role.name}</p>
          </div>

          <div className="rounded-2xl border border-border/80 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Loja
            </div>
            <p className="mt-2 text-lg font-semibold">{session.user.store.code}</p>
            <p className="text-sm text-muted-foreground">
              {storeName ?? session.user.store.name}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-dashed border-border/90 bg-muted/50 p-4 text-sm text-muted-foreground">
          {`Token emitido com validade de ${session.expiresIn}. Use a navegacao do painel para seguir em loja, clientes, fornecedores, categorias, usuarios e papeis.`}
        </div>

        <Button className="w-full" variant="outline" onClick={onLogout}>
          <LogOut className="mr-2 h-4 w-4" />
          Encerrar sessao
        </Button>
      </CardContent>
    </Card>
  );
}
