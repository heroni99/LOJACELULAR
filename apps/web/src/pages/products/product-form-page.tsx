import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Controller,
  useForm,
  type Control,
  type FieldPath,
  type FieldValues,
  type UseFormRegisterReturn
} from "react-hook-form";
import { z } from "zod";
import { ProductImage } from "@/components/app/product-image";
import { DetailCard } from "@/components/ui/detail-card";
import { FormPage } from "@/components/ui/form-page";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { useAppSession } from "@/app/session-context";
import {
  createProduct,
  getProduct,
  listCategories,
  listSuppliers,
  uploadProductImage,
  updateProduct
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import {
  formatCurrencyInput,
  formatCurrencyInputFromDigits,
  parseCurrencyToCents,
  parseInteger
} from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { success } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { ProductCodesCard } from "./product-codes-card";

const checkboxClassName =
  "h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const textareaClassName =
  "min-h-[120px] w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type CatalogMode = "product" | "service";

const currencyFieldSchema = z
  .string()
  .trim()
  .min(1, "Informe um valor.")
  .refine((value) => /\d/.test(value), {
    message: "Informe um valor valido."
  });

const integerFieldSchema = z
  .string()
  .trim()
  .min(1, "Informe um numero inteiro.")
  .refine((value) => /^\d+$/.test(value), {
    message: "Informe um numero inteiro valido."
  });

const productFormSchema = z
  .object({
    categoryId: z.string().trim().min(1, "Selecione a categoria."),
    supplierId: z.string().trim().optional(),
    name: z.string().trim().min(1, "Informe o nome do produto."),
    description: z.string().trim().optional(),
    brand: z.string().trim().optional(),
    model: z.string().trim().optional(),
    supplierCode: z.string().trim().optional(),
    costPrice: currencyFieldSchema,
    salePrice: currencyFieldSchema,
    stockMin: integerFieldSchema,
    hasSerialControl: z.boolean().default(false),
    needsPriceReview: z.boolean().default(false),
    isService: z.boolean().default(false),
    active: z.boolean().default(true)
  })
  .superRefine((values, context) => {
    const costPrice = parseCurrencyToCents(values.costPrice);
    const salePrice = parseCurrencyToCents(values.salePrice);
    const stockMin = parseInteger(values.stockMin);

    if (salePrice <= costPrice) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Preco de venda deve ser maior que o custo.",
        path: ["salePrice"]
      });
    }

    if (values.isService && stockMin > 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Servico deve permanecer com estoque minimo zero.",
        path: ["stockMin"]
      });
    }
  });

type ProductFormValues = z.infer<typeof productFormSchema>;

export function ProductFormPage({
  catalogMode = "product"
}: {
  catalogMode?: CatalogMode;
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authEnabled, session } = useAppSession();
  const isEditing = Boolean(id);
  const forcedServiceMode = catalogMode === "service";
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      categoryId: "",
      supplierId: "",
      name: "",
      description: "",
      brand: "",
      model: "",
      supplierCode: "",
      costPrice: formatCurrencyInput(0),
      salePrice: formatCurrencyInput(0),
      stockMin: "0",
      hasSerialControl: false,
      needsPriceReview: false,
      isService: forcedServiceMode,
      active: true
    }
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories", "product-form"],
    queryFn: () =>
      listCategories(authEnabled ? session.accessToken : undefined, { active: true })
  });
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "product-form"],
    queryFn: () =>
      listSuppliers(authEnabled ? session.accessToken : undefined, { active: true })
  });
  const productQuery = useQuery({
    queryKey: ["products", "detail", id],
    queryFn: () => getProduct(authEnabled ? session.accessToken : undefined, id ?? ""),
    enabled: isEditing
  });

  const isServiceItem = productQuery.data?.isService ?? form.watch("isService") ?? forcedServiceMode;
  const basePath =
    productQuery.data?.isService || forcedServiceMode || isServiceItem ? "/services" : "/products";
  const singularLabel = isServiceItem ? "servico" : "produto";
  const destinationHref = isEditing && id ? `${basePath}/${id}` : basePath;

  useEffect(() => {
    if (!productQuery.data) {
      return;
    }

    form.reset({
      categoryId: productQuery.data.categoryId,
      supplierId: productQuery.data.supplierId ?? "",
      name: productQuery.data.name,
      description: productQuery.data.description ?? "",
      brand: productQuery.data.brand ?? "",
      model: productQuery.data.model ?? "",
      supplierCode: productQuery.data.supplierCode ?? "",
      costPrice: formatCurrencyInput(productQuery.data.costPrice),
      salePrice: formatCurrencyInput(productQuery.data.salePrice),
      stockMin: String(productQuery.data.stockMin),
      hasSerialControl: productQuery.data.hasSerialControl,
      needsPriceReview: productQuery.data.needsPriceReview,
      isService: productQuery.data.isService || forcedServiceMode,
      active: productQuery.data.active
    });
  }, [forcedServiceMode, form, productQuery.data]);

  useEffect(() => {
    if (!forcedServiceMode) {
      return;
    }

    form.setValue("isService", true);
  }, [forcedServiceMode, form]);

  useEffect(() => {
    if (!isServiceItem) {
      return;
    }

    form.setValue("stockMin", "0");
    form.setValue("hasSerialControl", false);
  }, [form, isServiceItem]);

  useEffect(() => {
    if (!selectedImageFile) {
      setImagePreviewUrl(null);
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(selectedImageFile);
    setImagePreviewUrl(nextPreviewUrl);

    return () => {
      URL.revokeObjectURL(nextPreviewUrl);
    };
  }, [selectedImageFile]);

  const saveMutation = useMutation({
    mutationFn: async ({
      values,
      imageFile
    }: {
      values: ProductFormValues;
      imageFile: File | null;
    }) => {
      const payload = {
        categoryId: values.categoryId,
        supplierId: values.supplierId || undefined,
        name: values.name.trim(),
        description: emptyToUndefined(values.description),
        brand: emptyToUndefined(values.brand),
        model: emptyToUndefined(values.model),
        supplierCode: emptyToUndefined(values.supplierCode),
        costPrice: parseCurrencyToCents(values.costPrice),
        salePrice: parseCurrencyToCents(values.salePrice),
        stockMin: isServiceItem ? 0 : parseInteger(values.stockMin),
        hasSerialControl: isServiceItem ? false : values.hasSerialControl,
        needsPriceReview: values.needsPriceReview,
        isService: isServiceItem,
        active: values.active
      };

      let product;

      if (isEditing && id) {
        product = await updateProduct(authEnabled ? session.accessToken : undefined, id, payload);
      } else {
        product = await createProduct(authEnabled ? session.accessToken : undefined, payload);
      }

      if (imageFile) {
        return uploadProductImage(
          authEnabled ? session.accessToken : undefined,
          product.id,
          imageFile
        );
      }

      return product;
    },
    onSuccess: async (product) => {
      setFormError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["products", "detail", product.id] })
      ]);

      success(
        isEditing
          ? `${isServiceItem ? "Servico" : "Produto"} atualizado com sucesso.`
          : `${isServiceItem ? "Servico" : "Produto"} criado com sucesso.`,
        {
          href: `${product.isService ? "/services" : "/products"}/${product.id}`,
          linkLabel: "Ver registro"
        }
      );

      navigate(`${product.isService ? "/services" : "/products"}/${product.id}`);
    },
    onError: (error: Error) => {
      setFormError(parseApiError(error));
    }
  });

  return (
    <FormPage
      backHref={basePath}
      backLabel={isServiceItem ? "Servicos" : "Produtos"}
      cancelHref={destinationHref}
      errorMessage={
        getFirstErrorMessage([
          productQuery.error,
          categoriesQuery.error,
          suppliersQuery.error
        ]) ?? formError
      }
      formId="product-form"
      loading={isEditing && productQuery.isLoading}
      loadingMessage={`Carregando ${singularLabel}...`}
      saveDisabled={
        Boolean(productQuery.error) ||
        Boolean(categoriesQuery.error) ||
        Boolean(suppliersQuery.error)
      }
      saveLabel={isServiceItem ? "Salvar servico" : "Salvar produto"}
      saving={saveMutation.isPending}
      subtitle={
        isEditing
          ? `Ajuste dados comerciais e operacionais do ${singularLabel} em uma tela dedicada.`
          : `Cadastre um novo ${singularLabel} em secoes separadas, sem dividir espaco com a listagem.`
      }
      title={isEditing ? `Editar ${singularLabel}` : `Novo ${singularLabel}`}
      onSubmit={form.handleSubmit((values) => {
        setFormError(null);
        saveMutation.mutate({
          values,
          imageFile: selectedImageFile
        });
      })}
    >
      <DetailCard title="Identificacao">
        <FormSection title="Identificacao">
          <TextField
            error={form.formState.errors.name?.message}
            label="Nome *"
            registration={form.register("name")}
          />
          <SelectField
            error={form.formState.errors.categoryId?.message}
            label="Categoria *"
            options={[
              { label: "Selecione", value: "" },
              ...(categoriesQuery.data ?? []).map((category) => ({
                label: category.name,
                value: category.id
              }))
            ]}
            registration={form.register("categoryId")}
          />
          <SelectField
            error={form.formState.errors.supplierId?.message}
            label="Fornecedor"
            options={[
              { label: "Sem fornecedor", value: "" },
              ...(suppliersQuery.data ?? []).map((supplier) => ({
                label: supplier.tradeName || supplier.name,
                value: supplier.id
              }))
            ]}
            registration={form.register("supplierId")}
          />
          <TextField
            error={form.formState.errors.brand?.message}
            label="Marca"
            registration={form.register("brand")}
          />
          <TextField
            error={form.formState.errors.model?.message}
            label="Modelo"
            registration={form.register("model")}
          />
          <TextAreaField
            className="md:col-span-2"
            error={form.formState.errors.description?.message}
            label="Descricao"
            registration={form.register("description")}
          />
          <div className="space-y-4 md:col-span-2">
            <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
              Imagem
            </label>
            <div className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
              <ProductImage
                className="h-40 w-40"
                imageUrl={imagePreviewUrl ?? productQuery.data?.imageUrl}
                name={form.watch("name") || productQuery.data?.name || singularLabel}
              />

              <div className="space-y-3">
                <Input
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;

                    if (file && !file.type.startsWith("image/")) {
                      setSelectedImageFile(null);
                      setFormError("Selecione uma imagem valida em JPG, PNG, WEBP ou GIF.");
                      return;
                    }

                    setFormError(null);
                    setSelectedImageFile(file);
                  }}
                  type="file"
                />
                <p className="text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
                  O upload de imagem continua disponivel neste fluxo. Ao salvar, o arquivo fica anexado ao cadastro.
                </p>
                {selectedImageFile ? (
                  <p className="text-sm font-medium text-primary">
                    Arquivo selecionado: {selectedImageFile.name}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        </FormSection>
      </DetailCard>

      <DetailCard title="Codigos">
        <FormSection title="Codigos">
          <ReadOnlyField
            label="Internal code"
            value={productQuery.data?.internalCode || "Gerado automaticamente ao salvar"}
          />
          <TextField
            error={form.formState.errors.supplierCode?.message}
            label="Supplier code"
            registration={form.register("supplierCode")}
          />
        </FormSection>
      </DetailCard>

      <DetailCard title="Precos">
        <FormSection title="Precos">
          <CurrencyField
            control={form.control}
            error={form.formState.errors.costPrice?.message}
            label="Custo *"
            name="costPrice"
          />
          <CurrencyField
            control={form.control}
            error={form.formState.errors.salePrice?.message}
            label="Preco de venda *"
            name="salePrice"
          />
          <TextField
            disabled={isServiceItem}
            error={form.formState.errors.stockMin?.message}
            label="Estoque minimo"
            registration={form.register("stockMin")}
            type="number"
          />
        </FormSection>
      </DetailCard>

      <DetailCard title="Fiscal">
        <FormSection title="Fiscal">
          <ReadOnlyField label="NCM" value={productQuery.data?.ncm || "Nao informado"} />
          <ReadOnlyField label="CEST" value={productQuery.data?.cest || "Nao informado"} />
          <ReadOnlyField
            label="CFOP"
            value={productQuery.data?.cfopDefault || "Nao informado"}
          />
          <ReadOnlyField
            label="Origem"
            value={productQuery.data?.originCode || "Nao informado"}
          />
          <ReadOnlyField
            className="md:col-span-2"
            label="Categoria tributaria"
            value={productQuery.data?.taxCategory || "Nao informada"}
          />
          <div
            className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 md:col-span-2"
            style={{ color: "var(--color-text-muted)" }}
          >
            Os campos fiscais foram expostos nesta tela, mas o contrato atual de criacao/edicao de produtos ainda nao recebe esses valores para persistencia.
          </div>
        </FormSection>
      </DetailCard>

      <DetailCard title="Configuracoes">
        <FormSection title="Configuracoes">
          <CheckboxField
            disabled={isServiceItem}
            label="Serializado"
            registration={form.register("hasSerialControl")}
          />
          <CheckboxField
            disabled
            label="Servico"
            registration={form.register("isService")}
          />
          <CheckboxField
            label="Revisao de preco"
            registration={form.register("needsPriceReview")}
          />
          <CheckboxField
            label="Ativo"
            registration={form.register("active")}
          />
        </FormSection>
      </DetailCard>

      {isEditing ? (
        productQuery.data ? (
          <ProductCodesCard
            codes={productQuery.data.codes}
            isService={productQuery.data.isService}
            productId={productQuery.data.id}
          />
        ) : null
      ) : (
        <DetailCard title="Codigos alternativos">
          <div className="text-sm leading-6" style={{ color: "var(--color-text-muted)" }}>
            Salve o {singularLabel} primeiro para gerenciar codigos alternativos reais, como EAN, etiqueta interna e codigo de fabricante.
          </div>
        </DetailCard>
      )}
    </FormPage>
  );
}

function TextField({
  label,
  registration,
  error,
  type = "text",
  disabled,
  className
}: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      <Input disabled={disabled} step={type === "number" ? "1" : undefined} type={type} {...registration} />
      <FieldError message={error} />
    </div>
  );
}

function TextAreaField({
  label,
  registration,
  error,
  className
}: {
  label: string;
  registration: UseFormRegisterReturn;
  error?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      <textarea className={textareaClassName} {...registration} />
      <FieldError message={error} />
    </div>
  );
}

function SelectField({
  label,
  options,
  registration,
  error
}: {
  label: string;
  options: Array<{ label: string; value: string }>;
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      <select className={selectClassName} {...registration}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </div>
  );
}

function CurrencyField<TFieldValues extends FieldValues>({
  control,
  name,
  label,
  error
}: {
  control: Control<TFieldValues>;
  name: FieldPath<TFieldValues>;
  label: string;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Input
            inputMode="numeric"
            onBlur={field.onBlur}
            onChange={(event) => field.onChange(formatCurrencyInputFromDigits(event.target.value))}
            ref={field.ref}
            value={field.value ?? formatCurrencyInput(0)}
          />
        )}
      />
      <FieldError message={error} />
    </div>
  );
}

function CheckboxField({
  label,
  registration,
  disabled
}: {
  label: string;
  registration: UseFormRegisterReturn;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm",
        disabled ? "cursor-not-allowed opacity-70" : undefined
      )}
      style={{ color: "var(--color-text)" }}
    >
      <input className={checkboxClassName} disabled={disabled} type="checkbox" {...registration} />
      {label}
    </label>
  );
}

function ReadOnlyField({
  label,
  value,
  className
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      <label className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      <Input disabled readOnly value={value} />
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-sm text-red-400">{message}</p> : null;
}

function emptyToUndefined(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function getFirstErrorMessage(errors: unknown[]) {
  const firstError = errors.find((error) => Boolean(error));
  return firstError ? parseApiError(firstError) : null;
}
