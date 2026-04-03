import { useEffect, useMemo, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { permissionKeys, type PermissionKey } from "@/shared";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { listRoles, updateRolePermissions } from "@/lib/api";
import { queryClient } from "@/lib/query-client";

const rolePermissionsSchema = z.object({
  permissions: z.array(z.enum(permissionKeys))
});

type RolesPanelProps = {
  token: string;
};

type RolePermissionsFormValues = z.infer<typeof rolePermissionsSchema>;

const permissionGroups: Array<{
  label: string;
  permissions: Array<{ key: PermissionKey; label: string }>;
}> = [
  {
    label: "Loja e operacao",
    permissions: [
      { key: "stores.read", label: "Ler configuracao da loja" },
      { key: "stores.update", label: "Atualizar configuracao da loja" },
      { key: "reports.read", label: "Visualizar dashboard e relatorios" },
      { key: "audit.read", label: "Consultar auditoria" }
    ]
  },
  {
    label: "Administracao",
    permissions: [
      { key: "users.read", label: "Listar usuarios" },
      { key: "users.create", label: "Criar usuarios" },
      { key: "users.update", label: "Editar usuarios" },
      { key: "users.change_password", label: "Trocar senha de usuarios" },
      { key: "users.activate", label: "Ativar e inativar usuarios" },
      { key: "roles.read", label: "Listar papeis" },
      { key: "roles.update", label: "Atualizar permissoes de papeis" }
    ]
  },
  {
    label: "Cadastros",
    permissions: [
      { key: "customers.read", label: "Listar clientes" },
      { key: "customers.create", label: "Criar clientes" },
      { key: "customers.update", label: "Editar clientes" },
      { key: "suppliers.read", label: "Listar fornecedores" },
      { key: "suppliers.create", label: "Criar fornecedores" },
      { key: "suppliers.update", label: "Editar fornecedores" },
      { key: "categories.read", label: "Listar categorias" },
      { key: "categories.create", label: "Criar categorias" },
      { key: "categories.update", label: "Editar categorias" },
      { key: "products.read", label: "Listar produtos" },
      { key: "products.create", label: "Criar produtos" },
      { key: "products.update", label: "Editar produtos" }
    ]
  },
  {
    label: "Estoque e caixa",
    permissions: [
      { key: "inventory.read", label: "Consultar estoque" },
      { key: "inventory.entry", label: "Lancamento de entrada" },
      { key: "inventory.adjust", label: "Ajuste de estoque" },
      { key: "inventory.transfer", label: "Transferencia de estoque" },
      { key: "cash.read", label: "Consultar caixa" },
      { key: "cash.open", label: "Abrir caixa e gerenciar terminais" },
      { key: "cash.move", label: "Fazer suprimento e sangria" },
      { key: "cash.close", label: "Fechar caixa" }
    ]
  },
  {
    label: "Vendas e financeiro",
    permissions: [
      { key: "sales.read", label: "Consultar vendas" },
      { key: "sales.checkout", label: "Realizar checkout" },
      { key: "sales.cancel", label: "Cancelar venda" },
      { key: "sales.refund", label: "Estornar venda" },
      { key: "service-orders.read", label: "Listar ordens de servico" },
      { key: "service-orders.create", label: "Criar ordens de servico" },
      { key: "service-orders.update", label: "Editar ordens de servico" },
      { key: "purchase-orders.read", label: "Listar pedidos de compra" },
      { key: "purchase-orders.create", label: "Criar pedidos de compra" },
      { key: "purchase-orders.update", label: "Editar pedidos de compra" },
      { key: "purchase-orders.receive", label: "Receber pedidos de compra" },
      { key: "sale-returns.read", label: "Consultar devolucoes" },
      { key: "sale-returns.create", label: "Criar devolucoes" },
      { key: "accounts-payable.read", label: "Listar contas a pagar" },
      { key: "accounts-payable.create", label: "Criar contas a pagar" },
      { key: "accounts-payable.update", label: "Editar contas a pagar" },
      { key: "accounts-payable.pay", label: "Baixar contas a pagar" },
      { key: "accounts-receivable.read", label: "Listar contas a receber" },
      { key: "accounts-receivable.create", label: "Criar contas a receber" },
      { key: "accounts-receivable.update", label: "Editar contas a receber" },
      { key: "accounts-receivable.receive", label: "Baixar contas a receber" },
      { key: "financial.read", label: "Consultar resumo financeiro" },
      { key: "commissions.read", label: "Consultar comissoes e metas pessoais" },
      { key: "commissions.manage", label: "Gerenciar comissoes e metas da equipe" }
    ]
  }
];

export function RolesPanel({ token }: RolesPanelProps) {
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);

  const form = useForm<RolePermissionsFormValues>({
    resolver: zodResolver(rolePermissionsSchema),
    defaultValues: {
      permissions: []
    }
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => listRoles(token)
  });

  const roles = rolesQuery.data ?? [];
  const selectedRole =
    roles.find((role) => role.id === selectedRoleId) ?? roles[0] ?? null;

  useEffect(() => {
    if (!roles.length) {
      return;
    }

    if (!selectedRoleId) {
      setSelectedRoleId(roles[0].id);
      return;
    }

    if (!roles.some((role) => role.id === selectedRoleId)) {
      setSelectedRoleId(roles[0].id);
    }
  }, [roles, selectedRoleId]);

  useEffect(() => {
    form.reset({
      permissions: selectedRole?.permissions.map((permission) => permission.permissionKey) ?? []
    });
    setFeedback(null);
  }, [form, selectedRole]);

  const selectedPermissions = form.watch("permissions") ?? [];
  const permissionCount = selectedPermissions.length;
  const isDirty = useMemo(() => {
    const initialPermissions =
      selectedRole?.permissions.map((permission) => permission.permissionKey).sort() ?? [];
    const currentPermissions = [...selectedPermissions].sort();

    return JSON.stringify(initialPermissions) !== JSON.stringify(currentPermissions);
  }, [selectedPermissions, selectedRole]);

  const saveMutation = useMutation({
    mutationFn: async (values: RolePermissionsFormValues) => {
      if (!selectedRole) {
        throw new Error("Selecione um papel antes de salvar.");
      }

      return updateRolePermissions(token, selectedRole.id, values.permissions);
    },
    onSuccess: async () => {
      setFeedback({
        tone: "success",
        text: "Permissoes atualizadas com sucesso."
      });
      await queryClient.invalidateQueries({ queryKey: ["roles"] });
    },
    onError: (error: Error) => {
      setFeedback({
        tone: "error",
        text: error.message
      });
    }
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Papeis disponiveis</CardTitle>
          <CardDescription>
            Lista real de papeis persistidos e sincronizados com o backend.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => void rolesQuery.refetch()} type="button" variant="outline">
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>

          {rolesQuery.isLoading ? (
            <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-4 text-sm text-muted-foreground">
              Carregando papeis...
            </div>
          ) : null}

          {rolesQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {(rolesQuery.error as Error).message}
            </div>
          ) : null}

          <div className="space-y-2">
            {roles.map((role) => {
              const selected = selectedRole?.id === role.id;

              return (
                <button
                  key={role.id}
                  className={`w-full rounded-[1.5rem] border p-4 text-left transition-colors ${
                    selected
                      ? "border-primary/30 bg-primary/5"
                      : "border-border/70 bg-card/80 hover:bg-secondary/35"
                  }`}
                  onClick={() => setSelectedRoleId(role.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{role.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {role.description || "Sem descricao cadastrada."}
                      </p>
                    </div>
                    <span className="rounded-full border border-border/80 bg-white/70 px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                      {role.permissions.length}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>
                {selectedRole ? `Permissoes de ${selectedRole.name}` : "Permissoes"}
              </CardTitle>
              <CardDescription>
                Ajuste o conjunto real de permissoes aplicado ao papel selecionado.
              </CardDescription>
            </div>
            <div className="rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                Permissoes marcadas
              </p>
              <p className="mt-2 text-3xl font-black">{permissionCount}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!selectedRole ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
              Nenhum papel disponivel para editar.
            </div>
          ) : (
            <form
              className="space-y-6"
              onSubmit={form.handleSubmit((values) => {
                setFeedback(null);
                saveMutation.mutate(values);
              })}
            >
              {permissionGroups.map((group) => (
                <div key={group.label} className="space-y-3">
                  <div className="space-y-1">
                    <h3 className="text-lg font-semibold">{group.label}</h3>
                    <p className="text-sm text-muted-foreground">
                      Permissoes agrupadas para facilitar a revisao do papel.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {group.permissions.map((permission) => {
                      const checked = selectedPermissions.includes(permission.key);

                      return (
                        <label
                          key={permission.key}
                          className="flex items-start gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm"
                        >
                          <input
                            checked={checked}
                            className="mt-1 h-4 w-4"
                            onChange={() => {
                              const nextPermissions = checked
                                ? selectedPermissions.filter((item) => item !== permission.key)
                                : [...selectedPermissions, permission.key];

                              form.setValue("permissions", nextPermissions, {
                                shouldDirty: true
                              });
                            }}
                            type="checkbox"
                          />
                          <div>
                            <p className="font-medium">{permission.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              <code>{permission.key}</code>
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              {feedback ? (
                <FeedbackMessage tone={feedback.tone}>{feedback.text}</FeedbackMessage>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  className="sm:min-w-52"
                  disabled={saveMutation.isPending || !isDirty}
                  type="submit"
                >
                  {saveMutation.isPending ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar permissoes
                    </>
                  )}
                </Button>

                <Button
                  disabled={!selectedRole}
                  onClick={() =>
                    form.reset({
                      permissions:
                        selectedRole?.permissions.map((permission) => permission.permissionKey) ??
                        []
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  Reverter alteracoes
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FeedbackMessage({
  children,
  tone
}: {
  children: ReactNode;
  tone: "success" | "error";
}) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-red-200 bg-red-50 text-red-700"
      }`}
    >
      {children}
    </div>
  );
}
