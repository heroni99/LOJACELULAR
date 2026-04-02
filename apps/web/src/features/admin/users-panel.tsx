import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  KeyRound,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Search,
  UserPlus
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
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
import {
  changeUserPassword,
  createUser,
  listRoles,
  listUsers,
  updateUser,
  updateUserActive,
  type UserRecord
} from "@/lib/api";
import { applyZodErrors, readFormCheckbox, readFormString } from "@/lib/form-helpers";
import { formatDateTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";

const userFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do usuario."),
  email: z.string().trim().min(1, "Informe o e-mail.").email("Informe um e-mail valido."),
  phone: z.string().trim().max(32, "Telefone muito longo.").optional(),
  roleId: z.string().uuid("Selecione um papel valido."),
  password: z.string().optional(),
  mustChangePassword: z.boolean().default(true)
});

const passwordFormSchema = z.object({
  newPassword: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres.")
    .max(120, "Senha muito longa."),
  mustChangePassword: z.boolean().default(false)
});

type UsersPanelProps = {
  token: string;
  currentUserId: string;
  currentStoreId: string;
};

type UserFormValues = z.infer<typeof userFormSchema>;
type PasswordFormValues = z.infer<typeof passwordFormSchema>;
type ActiveFilter = "active" | "inactive" | "all";

const emptyUserForm: UserFormValues = {
  name: "",
  email: "",
  phone: "",
  roleId: "",
  password: "",
  mustChangePassword: true
};

const emptyPasswordForm: PasswordFormValues = {
  newPassword: "",
  mustChangePassword: false
};

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function UsersPanel({
  token,
  currentUserId,
  currentStoreId
}: UsersPanelProps) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("active");
  const [roleFilter, setRoleFilter] = useState("");
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [formFeedback, setFormFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const deferredSearch = useDeferredValue(search);

  const userForm = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: emptyUserForm
  });
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: emptyPasswordForm
  });

  const rolesQuery = useQuery({
    queryKey: ["roles"],
    queryFn: () => listRoles(token)
  });
  const usersQuery = useQuery({
    queryKey: ["users", deferredSearch, activeFilter, roleFilter],
    queryFn: () =>
      listUsers(token, {
        search: deferredSearch.trim() || undefined,
        active: activeFilter === "all" ? undefined : activeFilter === "active",
        roleId: roleFilter || undefined,
        storeId: currentStoreId,
        take: 100
      })
  });

  useEffect(() => {
    if (!editingUser) {
      userForm.reset({
        ...emptyUserForm,
        roleId: rolesQuery.data?.[0]?.id ?? ""
      });
      passwordForm.reset(emptyPasswordForm);
      setFormFeedback(null);
      return;
    }

    userForm.reset({
      name: editingUser.name,
      email: editingUser.email,
      phone: editingUser.phone ?? "",
      roleId: editingUser.role.id,
      password: "",
      mustChangePassword: editingUser.mustChangePassword
    });
    passwordForm.reset(emptyPasswordForm);
    setFormFeedback(null);
  }, [editingUser, passwordForm, rolesQuery.data, userForm]);

  const users = usersQuery.data ?? [];
  const roleOptions = rolesQuery.data ?? [];
  const activeUsersCount = useMemo(
    () => users.filter((user) => user.active).length,
    [users]
  );

  const saveMutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      if (editingUser) {
        return updateUser(token, editingUser.id, {
          name: values.name.trim(),
          email: values.email.trim().toLowerCase(),
          phone: emptyToUndefined(values.phone),
          roleId: values.roleId,
          mustChangePassword: values.mustChangePassword
        });
      }

      const password = values.password?.trim();

      if (!password || password.length < 8) {
        throw new Error("Informe uma senha inicial com pelo menos 8 caracteres.");
      }

      return createUser(token, {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        phone: emptyToUndefined(values.phone),
        roleId: values.roleId,
        storeId: currentStoreId,
        password,
        mustChangePassword: values.mustChangePassword
      });
    },
    onSuccess: async () => {
      setFormFeedback({
        tone: "success",
        text: editingUser
          ? "Usuario atualizado com sucesso."
          : "Usuario criado com sucesso."
      });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditingUser(null);
    },
    onError: (error: Error) => {
      setFormFeedback({
        tone: "error",
        text: error.message
      });
    }
  });

  const passwordMutation = useMutation({
    mutationFn: async (values: PasswordFormValues) => {
      if (!editingUser) {
        throw new Error("Selecione um usuario para redefinir a senha.");
      }

      return changeUserPassword(token, editingUser.id, values);
    },
    onSuccess: async () => {
      passwordForm.reset(emptyPasswordForm);
      setFormFeedback({
        tone: "success",
        text: "Senha redefinida com sucesso."
      });
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => {
      setFormFeedback({
        tone: "error",
        text: error.message
      });
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (user: UserRecord) =>
      updateUserActive(token, user.id, !user.active),
    onSuccess: async (_, user) => {
      if (editingUser?.id === user.id) {
        setEditingUser(null);
      }
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    }
  });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_380px]">
      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Operadores da loja</CardTitle>
          <CardDescription>
            Lista real de usuarios persistidos, com papel, status e ultimo acesso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px_220px_auto]">
            <div className="space-y-2">
              <Label htmlFor="user-search">Busca</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="user-search"
                  className="pl-10"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome, e-mail ou telefone"
                  value={search}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-active-filter">Status</Label>
              <select
                className={selectClassName}
                id="user-active-filter"
                onChange={(event) => setActiveFilter(event.target.value as ActiveFilter)}
                value={activeFilter}
              >
                <option value="active">Somente ativos</option>
                <option value="inactive">Somente inativos</option>
                <option value="all">Todos</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="user-role-filter">Papel</Label>
              <select
                className={selectClassName}
                id="user-role-filter"
                onChange={(event) => setRoleFilter(event.target.value)}
                value={roleFilter}
              >
                <option value="">Todos</option>
                {roleOptions.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button onClick={() => void usersQuery.refetch()} type="button" variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Atualizar
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
              <p className="text-sm text-muted-foreground">Usuarios visiveis</p>
              <p className="mt-2 text-3xl font-black">{users.length}</p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
              <p className="text-sm text-muted-foreground">Ativos na busca</p>
              <p className="mt-2 text-3xl font-black">{activeUsersCount}</p>
            </div>
          </div>

          {usersQuery.isLoading ? (
            <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card/80 p-4 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Carregando usuarios...
            </div>
          ) : null}

          {usersQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {getErrorMessage(usersQuery.error)}
            </div>
          ) : null}

          {!usersQuery.isLoading && !users.length ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
              Nenhum usuario encontrado com os filtros atuais.
            </div>
          ) : null}

          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="rounded-[1.5rem] border border-border/80 bg-card/90 p-4 shadow-sm"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-lg font-semibold">{user.name}</p>
                      <span
                        className={cnBadge(
                          user.active
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        )}
                      >
                        {user.active ? "Ativo" : "Inativo"}
                      </span>
                      {user.mustChangePassword ? (
                        <span className={cnBadge("border-orange-200 bg-orange-50 text-orange-700")}>
                          Troca de senha pendente
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">{user.email}</p>
                    <p className="text-sm text-muted-foreground">
                      {user.role.name} • {user.store.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Ultimo login: {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "nunca"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      onClick={() => setEditingUser(user)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <PencilLine className="mr-2 h-4 w-4" />
                      Editar
                    </Button>
                    <Button
                      disabled={toggleActiveMutation.isPending || user.id === currentUserId}
                      onClick={() => {
                        const action = user.active ? "inativar" : "reativar";
                        const confirmed = window.confirm(
                          `Deseja ${action} o usuario ${user.name}?`
                        );

                        if (confirmed) {
                          toggleActiveMutation.mutate(user);
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      {user.active ? "Inativar" : "Reativar"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle>{editingUser ? "Editar usuario" : "Novo usuario"}</CardTitle>
            <CardDescription>
              {editingUser
                ? "Ajuste nome, e-mail, papel e politica de troca de senha."
                : "Crie um operador com senha inicial e papel valido."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                setFormFeedback(null);
                const parsed = userFormSchema.safeParse(readUserFormValues(event.currentTarget));

                if (!parsed.success) {
                  applyZodErrors(userForm, parsed.error);
                  setFormFeedback({
                    tone: "error",
                    text: "Revise os campos destacados antes de salvar o usuario."
                  });
                  return;
                }

                userForm.clearErrors();
                saveMutation.mutate(parsed.data);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="user-name">Nome</Label>
                <Input id="user-name" {...userForm.register("name")} />
                <FieldError message={userForm.formState.errors.name?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-email">E-mail</Label>
                <Input id="user-email" type="email" {...userForm.register("email")} />
                <FieldError message={userForm.formState.errors.email?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-phone">Telefone</Label>
                <Input id="user-phone" {...userForm.register("phone")} />
                <FieldError message={userForm.formState.errors.phone?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-role">Papel</Label>
                <select
                  className={selectClassName}
                  id="user-role"
                  {...userForm.register("roleId")}
                >
                  <option value="">Selecione um papel</option>
                  {roleOptions.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
                <FieldError message={userForm.formState.errors.roleId?.message} />
              </div>

              {!editingUser ? (
                <div className="space-y-2">
                  <Label htmlFor="user-password">Senha inicial</Label>
                  <Input
                    id="user-password"
                    type="password"
                    {...userForm.register("password")}
                  />
                  <p className="text-xs text-muted-foreground">
                    A senha inicial deve ter pelo menos 8 caracteres.
                  </p>
                </div>
              ) : null}

              <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
                <input
                  className="h-4 w-4"
                  type="checkbox"
                  {...userForm.register("mustChangePassword")}
                />
                Exigir troca de senha no proximo acesso
              </label>

              {formFeedback ? (
                <FeedbackMessage tone={formFeedback.tone}>{formFeedback.text}</FeedbackMessage>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" disabled={saveMutation.isPending} type="submit">
                  {saveMutation.isPending ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <UserPlus className="mr-2 h-4 w-4" />
                      {editingUser ? "Salvar alteracoes" : "Criar usuario"}
                    </>
                  )}
                </Button>

                {editingUser ? (
                  <Button
                    onClick={() => {
                      setEditingUser(null);
                      userForm.reset({
                        ...emptyUserForm,
                        roleId: roleOptions[0]?.id ?? ""
                      });
                    }}
                    type="button"
                    variant="outline"
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </form>
          </CardContent>
        </Card>

        {editingUser ? (
          <Card className="bg-white/90">
            <CardHeader>
              <CardTitle>Redefinir senha</CardTitle>
              <CardDescription>
                Altere a senha de {editingUser.name} sem mexer nos outros dados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  setFormFeedback(null);
                  const parsed = passwordFormSchema.safeParse(
                    readPasswordFormValues(event.currentTarget)
                  );

                  if (!parsed.success) {
                    applyZodErrors(passwordForm, parsed.error);
                    setFormFeedback({
                      tone: "error",
                      text: "Informe uma senha valida antes de continuar."
                    });
                    return;
                  }

                  passwordForm.clearErrors();
                  passwordMutation.mutate(parsed.data);
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="user-new-password">Nova senha</Label>
                  <Input
                    id="user-new-password"
                    type="password"
                    {...passwordForm.register("newPassword")}
                  />
                  <FieldError message={passwordForm.formState.errors.newPassword?.message} />
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
                  <input
                    className="h-4 w-4"
                    type="checkbox"
                    {...passwordForm.register("mustChangePassword")}
                  />
                  Manter troca obrigatoria no proximo login
                </label>

                <Button
                  className="w-full"
                  disabled={passwordMutation.isPending}
                  type="submit"
                  variant="outline"
                >
                  {passwordMutation.isPending ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Atualizando senha...
                    </>
                  ) : (
                    <>
                      <KeyRound className="mr-2 h-4 w-4" />
                      Redefinir senha
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function readUserFormValues(formElement: HTMLFormElement): UserFormValues {
  const formData = new FormData(formElement);

  return {
    name: readFormString(formData, "name"),
    email: readFormString(formData, "email"),
    phone: readFormString(formData, "phone"),
    roleId: readFormString(formData, "roleId"),
    password: readFormString(formData, "password"),
    mustChangePassword: readFormCheckbox(formData, "mustChangePassword")
  };
}

function readPasswordFormValues(formElement: HTMLFormElement): PasswordFormValues {
  const formData = new FormData(formElement);

  return {
    newPassword: readFormString(formData, "newPassword"),
    mustChangePassword: readFormCheckbox(formData, "mustChangePassword")
  };
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nao foi possivel concluir a operacao.";
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-red-600">{message}</p> : null;
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

function cnBadge(className: string) {
  return `inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`;
}
