import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import {
  loginSchema,
  type AuthSession,
  type LoginInput
} from "@/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, resolveApiAssetUrl, type StoreSettings } from "@/lib/api";

type LoginFormProps = {
  onSuccess(session: AuthSession): void;
  store?: StoreSettings | null;
};

export function LoginForm({ onSuccess, store }: LoginFormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: ""
    }
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (session) => {
      setFormError(null);
      onSuccess(session);
      form.reset({
        email: "",
        password: ""
      });
    },
    onError: (error) => {
      setFormError(error.message);
    }
  });

  return (
    <Card className="border-primary/10 bg-white/95">
      <CardHeader>
        <div className="mb-2 flex items-center gap-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {store?.logoUrl ? (
              <img
                alt={`Logo ${store.displayName}`}
                className="h-10 w-10 rounded-xl object-cover"
                src={resolveApiAssetUrl(store.logoUrl) ?? store.logoUrl}
              />
            ) : (
              <ShieldCheck className="h-6 w-6" />
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary">
              {store?.code ?? "LOJA"}
            </p>
            <p className="text-sm font-semibold text-muted-foreground">
              {store?.displayName ?? "ALPHA TECNOLOGIA"}
            </p>
          </div>
        </div>
        <CardTitle>Entrar no sistema</CardTitle>
        <CardDescription>
          Login administrativo com sessao JWT real, papeis e permissoes aplicados
          no backend antes de abrir o shell principal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={form.handleSubmit((values) => {
            loginMutation.mutate(values);
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="admin@local.test"
              {...form.register("email")}
            />
            {form.formState.errors.email ? (
              <p className="text-sm text-red-600">
                {form.formState.errors.email.message}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Se o e-mail nao entrar, confira o <code>SEED_ADMIN_EMAIL</code>{" "}
                e rode o seed novamente.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="Sua senha"
              {...form.register("password")}
            />
            {form.formState.errors.password ? (
              <p className="text-sm text-red-600">
                {form.formState.errors.password.message}
              </p>
            ) : null}
          </div>

          {formError ? (
            <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{formError}</span>
            </div>
          ) : null}

          <Button className="w-full" disabled={loginMutation.isPending} type="submit">
            {loginMutation.isPending ? (
              <>
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                Validando acesso...
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
