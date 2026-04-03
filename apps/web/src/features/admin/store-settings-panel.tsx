import { useEffect, useState, type ReactNode } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import type { UseFormRegisterReturn } from "react-hook-form";
import { ImagePlus, LoaderCircle, Palette, Save, Store as StoreIcon } from "lucide-react";
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
import { LoadingButton } from "@/components/ui/loading-button";
import { PageLoading } from "@/components/ui/page-loading";
import { applyZodErrors, readFormCheckbox, readFormString } from "@/lib/form-helpers";
import { updateStoreSettings, type StoreSettings } from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { queryClient } from "@/lib/query-client";
import { error as toastError, success } from "@/lib/toast";

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Informe uma cor hexadecimal valida com 6 digitos.");

const storeSettingsSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome oficial da loja."),
  displayName: z.string().trim().min(1, "Informe o nome exibido no sistema."),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  accentColor: hexColorSchema,
  logoUrl: z.string().trim().max(255, "URL da logo muito longa.").optional(),
  bannerUrl: z.string().trim().max(255, "URL do banner muito longa.").optional(),
  heroBannerEnabled: z.boolean().default(true)
});

type StoreSettingsPanelProps = {
  token?: string;
  store: StoreSettings | null;
  isLoading: boolean;
  errorMessage?: string | null;
};

type StoreSettingsFormValues = z.infer<typeof storeSettingsSchema>;

const textInputClassName =
  "h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

const emptyFormValues: StoreSettingsFormValues = {
  name: "",
  displayName: "",
  primaryColor: "#f97316",
  secondaryColor: "#111827",
  accentColor: "#ffffff",
  logoUrl: "",
  bannerUrl: "",
  heroBannerEnabled: true
};

export function StoreSettingsPanel({
  token,
  store,
  isLoading,
  errorMessage
}: StoreSettingsPanelProps) {
  const [formFeedback, setFormFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const form = useForm<StoreSettingsFormValues>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues: emptyFormValues
  });
  const previewValues = form.watch();

  useEffect(() => {
    form.reset(store ? toStoreFormValues(store) : emptyFormValues);
    setFormFeedback(null);
  }, [form, store]);

  const saveMutation = useMutation({
    mutationFn: async (values: StoreSettingsFormValues) => {
      if (!store) {
        throw new Error("Nenhuma loja ativa disponivel para configuracao.");
      }

      return updateStoreSettings(token, store.id, {
        name: values.name.trim(),
        displayName: values.displayName.trim(),
        primaryColor: values.primaryColor.trim().toLowerCase(),
        secondaryColor: values.secondaryColor.trim().toLowerCase(),
        accentColor: values.accentColor.trim().toLowerCase(),
        logoUrl: emptyToUndefined(values.logoUrl),
        bannerUrl: emptyToUndefined(values.bannerUrl),
        heroBannerEnabled: values.heroBannerEnabled
      });
    },
    onSuccess: async () => {
      success("Configuracoes da loja salvas com sucesso.");
      await queryClient.invalidateQueries({ queryKey: ["stores", "current"] });
    },
    onError: (error: Error) => {
      toastError(parseApiError(error));
    }
  });

  const preview = {
    displayName: previewValues.displayName?.trim() || "Loja sem nome visual",
    name: previewValues.name?.trim() || "Nome oficial da loja",
    primaryColor: previewValues.primaryColor || "#f97316",
    secondaryColor: previewValues.secondaryColor || "#111827",
    accentColor: previewValues.accentColor || "#ffffff",
    bannerUrl: previewValues.bannerUrl?.trim() || null,
    logoUrl: previewValues.logoUrl?.trim() || null,
    heroBannerEnabled: previewValues.heroBannerEnabled ?? true
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_360px]">
      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Configuracao da loja</CardTitle>
          <CardDescription>
            Ajuste nome institucional, paleta e assets que vao servir de base
            para a identidade visual da operacao.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <PageLoading description="Carregando configuracoes atuais da loja..." />
          ) : null}

          {errorMessage ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {!isLoading && !store ? (
            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/40 px-4 py-8 text-sm text-muted-foreground">
              Nenhuma loja ativa encontrada para editar.
            </div>
          ) : null}

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setFormFeedback(null);
              const parsed = storeSettingsSchema.safeParse(
                readStoreSettingsFormValues(event.currentTarget)
              );

              if (!parsed.success) {
                applyZodErrors(form, parsed.error);
                setFormFeedback({
                  tone: "error",
                  text: "Revise os campos destacados antes de salvar a configuracao."
                });
                return;
              }

              form.clearErrors();
              saveMutation.mutate(parsed.data);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="store-name">Nome oficial</Label>
                <Input id="store-name" {...form.register("name")} />
                <FieldError message={form.formState.errors.name?.message} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="store-display-name">Nome exibido</Label>
                <Input id="store-display-name" {...form.register("displayName")} />
                <FieldError message={form.formState.errors.displayName?.message} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField
                controlId="store-primary-color"
                error={form.formState.errors.primaryColor?.message}
                label="Cor primaria"
                textRegister={form.register("primaryColor")}
                value={preview.primaryColor}
              />
              <ColorField
                controlId="store-secondary-color"
                error={form.formState.errors.secondaryColor?.message}
                label="Cor secundaria"
                textRegister={form.register("secondaryColor")}
                value={preview.secondaryColor}
              />
              <ColorField
                controlId="store-accent-color"
                error={form.formState.errors.accentColor?.message}
                label="Cor de destaque"
                textRegister={form.register("accentColor")}
                value={preview.accentColor}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-logo-url">URL da logo</Label>
              <Input id="store-logo-url" {...form.register("logoUrl")} />
              <FieldError message={form.formState.errors.logoUrl?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="store-banner-url">URL do banner</Label>
              <Input id="store-banner-url" {...form.register("bannerUrl")} />
              <FieldError message={form.formState.errors.bannerUrl?.message} />
            </div>

            <label className="flex items-center gap-3 rounded-2xl border border-border/80 bg-card/80 px-4 py-3 text-sm">
              <input
                className="h-4 w-4"
                type="checkbox"
                {...form.register("heroBannerEnabled")}
              />
              Manter hero/banner visual habilitado
            </label>

            {formFeedback ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  formFeedback.tone === "success"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {formFeedback.text}
              </div>
            ) : null}

            <LoadingButton
              className="w-full"
              disabled={!store}
              isLoading={saveMutation.isPending}
              loadingText="Salvando configuracoes..."
              type="submit"
            >
              <Save className="mr-2 h-4 w-4" />
              Salvar configuracoes da loja
            </LoadingButton>
          </form>
        </CardContent>
      </Card>

      <Card className="bg-white/90">
        <CardHeader>
          <CardTitle>Preview rapido</CardTitle>
          <CardDescription>
            Visao simples da identidade que ja fica salva em `stores/settings`.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="overflow-hidden rounded-[1.75rem] border border-border/80"
            style={{
              background: preview.heroBannerEnabled
                ? `linear-gradient(135deg, ${preview.secondaryColor} 0%, ${preview.primaryColor} 100%)`
                : preview.accentColor
            }}
          >
            <div
              className="space-y-4 p-5"
              style={{
                color: preview.heroBannerEnabled
                  ? preview.accentColor
                  : preview.secondaryColor
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
                  {preview.logoUrl ? (
                    <img
                      alt={`Logo ${preview.displayName}`}
                      className="h-10 w-10 rounded-xl object-cover"
                      src={preview.logoUrl}
                    />
                  ) : (
                    <StoreIcon className="h-5 w-5" />
                  )}
                </div>
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
                  {preview.heroBannerEnabled ? "Hero ativo" : "Hero desativado"}
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] opacity-80">
                  Preview institucional
                </p>
                <p className="text-2xl font-black tracking-tight">{preview.displayName}</p>
                <p className="max-w-xs text-sm opacity-90">{preview.name}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <ColorPreviewChip color={preview.primaryColor} label="Primaria" />
                <ColorPreviewChip color={preview.secondaryColor} label="Secundaria" />
                <ColorPreviewChip color={preview.accentColor} label="Destaque" />
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            <InfoCard
              description="Estrutura preparada para receber arquivo definitivo da marca depois."
              icon={<ImagePlus className="h-4 w-4" />}
              title={preview.logoUrl ? "Logo configurada" : "Logo pendente"}
            />
            <InfoCard
              description={
                preview.bannerUrl
                  ? preview.bannerUrl
                  : "Sem banner externo por enquanto; o hero gradiente continua atendendo."
              }
              icon={<Palette className="h-4 w-4" />}
              title={preview.bannerUrl ? "Banner configurado" : "Banner em modo base"}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function toStoreFormValues(store: StoreSettings): StoreSettingsFormValues {
  return {
    name: store.name,
    displayName: store.displayName,
    primaryColor: store.primaryColor,
    secondaryColor: store.secondaryColor,
    accentColor: store.accentColor,
    logoUrl: store.logoUrl ?? "",
    bannerUrl: store.bannerUrl ?? "",
    heroBannerEnabled: store.heroBannerEnabled
  };
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function readStoreSettingsFormValues(
  formElement: HTMLFormElement
): StoreSettingsFormValues {
  const formData = new FormData(formElement);

  return {
    name: readFormString(formData, "name"),
    displayName: readFormString(formData, "displayName"),
    primaryColor: readFormString(formData, "primaryColor"),
    secondaryColor: readFormString(formData, "secondaryColor"),
    accentColor: readFormString(formData, "accentColor"),
    logoUrl: readFormString(formData, "logoUrl"),
    bannerUrl: readFormString(formData, "bannerUrl"),
    heroBannerEnabled: readFormCheckbox(formData, "heroBannerEnabled")
  };
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-red-600">{message}</p> : null;
}

function ColorField({
  controlId,
  error,
  label,
  textRegister,
  value
}: {
  controlId: string;
  error?: string;
  label: string;
  textRegister: UseFormRegisterReturn;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={controlId}>{label}</Label>
      <div className="flex items-center gap-3 rounded-2xl border border-input bg-white/90 px-3 py-2">
        <input
          className="h-10 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"
          onBlur={textRegister.onBlur}
          onChange={textRegister.onChange}
          type="color"
          value={value}
        />
        <input
          className={textInputClassName}
          id={controlId}
          name={textRegister.name}
          onBlur={textRegister.onBlur}
          onChange={textRegister.onChange}
          ref={textRegister.ref}
          value={value}
        />
      </div>
      <FieldError message={error} />
    </div>
  );
}

function ColorPreviewChip({ color, label }: { color: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3 backdrop-blur">
      <div className="flex items-center gap-3">
        <span
          className="h-6 w-6 rounded-full border border-white/40"
          style={{ backgroundColor: color }}
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-80">
            {label}
          </p>
          <p className="text-sm font-medium">{color}</p>
        </div>
      </div>
    </div>
  );
}

function InfoCard({
  description,
  icon,
  title
}: {
  description: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-card/90 p-4">
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-xl bg-primary/10 p-2 text-primary">{icon}</div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>
    </div>
  );
}
