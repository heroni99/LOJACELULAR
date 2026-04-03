import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { DetailCard } from "@/components/ui/detail-card";
import { FormPage } from "@/components/ui/form-page";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/app/session-context";
import {
  createCustomer,
  getCustomer,
  updateCustomer,
  type Customer
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { queryClient } from "@/lib/query-client";
import { success } from "@/lib/toast";
import { cn } from "@/lib/utils";

const customerFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do cliente."),
  cpfCnpj: z.string().trim().max(32, "CPF/CNPJ muito longo.").optional(),
  email: z.union([z.string().trim().email("Informe um e-mail valido."), z.literal("")]),
  phone: z
    .string()
    .trim()
    .min(8, "Informe um telefone com pelo menos 8 caracteres.")
    .max(32, "Telefone muito longo."),
  phone2: z.string().trim().max(32, "Telefone secundario muito longo.").optional(),
  zipCode: z.string().trim().max(16, "CEP muito longo.").optional(),
  address: z.string().trim().max(255, "Endereco muito longo.").optional(),
  city: z.string().trim().max(120, "Cidade muito longa.").optional(),
  state: z.string().trim().max(8, "UF muito longa.").optional(),
  notes: z.string().trim().optional(),
  active: z.boolean().default(true)
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

const emptyCustomerForm: CustomerFormValues = {
  name: "",
  cpfCnpj: "",
  email: "",
  phone: "",
  phone2: "",
  zipCode: "",
  address: "",
  city: "",
  state: "",
  notes: "",
  active: true
};

const textareaClassName =
  "min-h-[120px] w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function CustomerFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authEnabled, session } = useAppSession();
  const isEditing = Boolean(id);
  const destinationHref = isEditing && id ? `/customers/${id}` : "/customers";

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: emptyCustomerForm
  });

  const customerQuery = useQuery({
    queryKey: ["customers", "detail", id],
    queryFn: () => getCustomer(authEnabled ? session.accessToken : undefined, id ?? ""),
    enabled: isEditing
  });

  useEffect(() => {
    if (!customerQuery.data) {
      return;
    }

    form.reset(toCustomerFormValues(customerQuery.data));
  }, [customerQuery.data, form]);

  const saveMutation = useMutation({
    mutationFn: (values: CustomerFormValues) => {
      const payload = toCustomerPayload(values);

      if (isEditing && id) {
        return updateCustomer(authEnabled ? session.accessToken : undefined, id, payload);
      }

      return createCustomer(authEnabled ? session.accessToken : undefined, payload);
    },
    onSuccess: async (customer) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["customers"] }),
        queryClient.invalidateQueries({ queryKey: ["customers", "detail", customer.id] })
      ]);

      success(isEditing ? "Cliente atualizado com sucesso." : "Cliente criado com sucesso.", {
        href: `/customers/${customer.id}`,
        linkLabel: "Ver registro"
      });

      navigate(`/customers/${customer.id}`);
    }
  });

  return (
    <FormPage
      backHref="/customers"
      backLabel="Clientes"
      cancelHref={destinationHref}
      errorMessage={getErrorMessage(customerQuery.error) ?? getErrorMessage(saveMutation.error)}
      formId="customer-form"
      loading={isEditing && customerQuery.isLoading}
      loadingMessage="Carregando dados do cliente..."
      saveDisabled={Boolean(customerQuery.error)}
      saveLabel="Salvar cliente"
      saving={saveMutation.isPending}
      subtitle={
        isEditing
          ? "Ajuste os dados do cliente em uma tela dedicada, com secoes claras e footer fixo."
          : "Cadastre um novo cliente em uma tela full page, sem competir com a listagem."
      }
      title={isEditing ? "Editar cliente" : "Novo cliente"}
      onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}
    >
      <DetailCard title="Dados pessoais">
        <FormSection title="Dados pessoais">
          <TextField
            error={form.formState.errors.name?.message}
            label="Nome *"
            registration={form.register("name")}
          />
          <TextField
            error={form.formState.errors.phone?.message}
            label="Telefone *"
            registration={form.register("phone")}
          />
          <TextField
            error={form.formState.errors.phone2?.message}
            label="Telefone 2"
            registration={form.register("phone2")}
          />
          <TextField
            error={form.formState.errors.email?.message}
            label="E-mail"
            registration={form.register("email")}
            type="email"
          />
          <TextField
            className="md:col-span-2"
            error={form.formState.errors.cpfCnpj?.message}
            label="CPF/CNPJ"
            registration={form.register("cpfCnpj")}
          />
        </FormSection>
      </DetailCard>

      <DetailCard title="Endereco">
        <FormSection title="Endereco">
          <TextField
            error={form.formState.errors.zipCode?.message}
            label="CEP"
            registration={form.register("zipCode")}
          />
          <TextField
            error={form.formState.errors.address?.message}
            label="Endereco"
            registration={form.register("address")}
          />
          <TextField
            error={form.formState.errors.city?.message}
            label="Cidade"
            registration={form.register("city")}
          />
          <TextField
            error={form.formState.errors.state?.message}
            label="Estado"
            registration={form.register("state")}
          />
        </FormSection>
      </DetailCard>

      <DetailCard title="Outros">
        <FormSection title="Outros" columns={1}>
          <TextAreaField
            error={form.formState.errors.notes?.message}
            label="Observacoes"
            registration={form.register("notes")}
          />
          <CheckboxField
            label="Status ativo"
            registration={form.register("active")}
          />
        </FormSection>
      </DetailCard>
    </FormPage>
  );
}

function TextField({
  label,
  registration,
  error,
  type = "text",
  className
}: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  type?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      <Input type={type} {...registration} />
      <FieldError message={error} />
    </div>
  );
}

function TextAreaField({
  label,
  registration,
  error
}: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      <textarea className={textareaClassName} {...registration} />
      <FieldError message={error} />
    </div>
  );
}

function CheckboxField({
  label,
  registration
}: {
  label: string;
  registration: UseFormRegisterReturn;
}) {
  return (
    <label
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm"
      style={{ color: "var(--color-text)" }}
    >
      <input className="h-4 w-4" type="checkbox" {...registration} />
      {label}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-red-400">{message}</p> : null;
}

function toCustomerFormValues(customer: Customer): CustomerFormValues {
  return {
    name: customer.name,
    cpfCnpj: customer.cpfCnpj ?? "",
    email: customer.email ?? "",
    phone: customer.phone,
    phone2: customer.phone2 ?? "",
    zipCode: customer.zipCode ?? "",
    address: customer.address ?? "",
    city: customer.city ?? "",
    state: customer.state ?? "",
    notes: customer.notes ?? "",
    active: customer.active
  };
}

function toCustomerPayload(values: CustomerFormValues) {
  return {
    name: values.name.trim(),
    cpfCnpj: emptyToUndefined(values.cpfCnpj),
    email: emptyToUndefined(values.email),
    phone: values.phone.trim(),
    phone2: emptyToUndefined(values.phone2),
    zipCode: emptyToUndefined(values.zipCode),
    address: emptyToUndefined(values.address),
    city: emptyToUndefined(values.city),
    state: emptyToUndefined(values.state),
    notes: emptyToUndefined(values.notes),
    active: values.active
  };
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getErrorMessage(error: unknown) {
  return error ? parseApiError(error) : null;
}
