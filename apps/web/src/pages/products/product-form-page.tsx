import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, LoaderCircle, Save } from "lucide-react";
import { useForm, type UseFormRegisterReturn } from "react-hook-form";
import { z } from "zod";
import { PageHeader } from "@/components/app/page-header";
import { ProductImage } from "@/components/app/product-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProductCodesCard } from "./product-codes-card";
import {
  createProduct,
  getProduct,
  listCategories,
  listSuppliers,
  uploadProductImage,
  updateProduct
} from "@/lib/api";
import { applyZodErrors, readFormCheckbox, readFormString } from "@/lib/form-helpers";
import { centsToInputValue, parseCurrencyToCents, parseInteger } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { useAppSession } from "@/app/session-context";

const checkboxClassName =
  "h-4 w-4 rounded border border-input text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const textareaClassName =
  "min-h-[120px] w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type CatalogMode = "product" | "service";

const currencyFieldSchema = z
  .string()
  .trim()
  .min(1, "Informe um valor.")
  .refine((value) => Number.isFinite(Number(value.replace(",", "."))), {
    message: "Informe um numero valido."
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
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const { authEnabled, session } = useAppSession();
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const forcedServiceMode = catalogMode === "service";

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
      costPrice: "0.00",
      salePrice: "0.00",
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
  const isServiceItem = productQuery.data?.isService ?? forcedServiceMode;
  const basePath =
    productQuery.data?.isService || forcedServiceMode ? "/services" : "/products";
  const singularLabel = isServiceItem ? "servico" : "produto";

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
      costPrice: centsToInputValue(productQuery.data.costPrice),
      salePrice: centsToInputValue(productQuery.data.salePrice),
      stockMin: String(productQuery.data.stockMin),
      hasSerialControl: productQuery.data.hasSerialControl,
      needsPriceReview: productQuery.data.needsPriceReview,
      isService: productQuery.data.isService || forcedServiceMode,
      active: productQuery.data.active
    });
  }, [forcedServiceMode, form, productQuery.data]);

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
        name: values.name,
        description: values.description || undefined,
        brand: values.brand || undefined,
        model: values.model || undefined,
        supplierCode: values.supplierCode || undefined,
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
        return uploadProductImage(authEnabled ? session.accessToken : undefined, product.id, imageFile);
      }

      return product;
    },
    onSuccess: async (product) => {
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      navigate(`${product.isService ? "/services" : "/products"}/${product.id}`);
    },
    onError: (error: Error) => {
      setFormError(error.message);
    }
  });

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button asChild variant="outline">
            <Link to={isEditing && id ? `${basePath}/${id}` : basePath}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Voltar
            </Link>
          </Button>
        }
        description={
          isEditing
            ? `Ajuste dados comerciais, preco e flags operacionais do ${singularLabel}.`
            : `Cadastre um novo ${singularLabel} com categoria, fornecedor e precos reais.`
        }
        eyebrow="Cadastros"
        title={isEditing ? `Editar ${singularLabel}` : `Novo ${singularLabel}`}
      />

      <Card className="bg-white/90">
        <CardContent className="space-y-6 p-6">
          {productQuery.isLoading ? (
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Carregando produto...
            </div>
          ) : null}

          {formError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          ) : null}

          <form
            className="space-y-6"
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              const parsed = productFormSchema.safeParse(
                readProductFormValues(event.currentTarget)
              );

              if (!parsed.success) {
                applyZodErrors(form, parsed.error);
                setFormError("Revise os campos destacados antes de salvar o produto.");
                return;
              }

              form.clearErrors();
              saveMutation.mutate({
                values: parsed.data,
                imageFile: selectedImageFile
              });
            }}
          >
            <div className="grid gap-4 xl:grid-cols-2">
              <SelectInput
                id="product-category"
                label="Categoria"
                options={[
                  { label: "Selecione", value: "" },
                  ...(categoriesQuery.data ?? []).map((category) => ({
                    label: category.name,
                    value: category.id
                  }))
                ]}
                error={form.formState.errors.categoryId?.message}
                registration={form.register("categoryId")}
              />

              <SelectInput
                id="product-supplier"
                label="Fornecedor"
                options={[
                  { label: "Sem fornecedor", value: "" },
                  ...(suppliersQuery.data ?? []).map((supplier) => ({
                    label: supplier.name,
                    value: supplier.id
                  }))
                ]}
                error={form.formState.errors.supplierId?.message}
                registration={form.register("supplierId")}
              />

              <Field
                error={form.formState.errors.name?.message}
                id="product-name"
                label="Nome"
                registration={form.register("name")}
                type="text"
              />
              <Field
                error={form.formState.errors.supplierCode?.message}
                id="product-supplier-code"
                label="Supplier code"
                registration={form.register("supplierCode")}
                type="text"
              />
              <Field
                error={form.formState.errors.brand?.message}
                id="product-brand"
                label="Marca"
                registration={form.register("brand")}
                type="text"
              />
              <Field
                error={form.formState.errors.model?.message}
                id="product-model"
                label="Modelo"
                registration={form.register("model")}
                type="text"
              />
              <Field
                error={form.formState.errors.costPrice?.message}
                id="product-cost"
                label="Custo (R$)"
                registration={form.register("costPrice")}
                type="number"
              />
              <Field
                error={form.formState.errors.salePrice?.message}
                id="product-sale"
                label="Venda (R$)"
                registration={form.register("salePrice")}
                type="number"
              />
              <Field
                disabled={isServiceItem}
                error={form.formState.errors.stockMin?.message}
                id="product-stock-min"
                label="Estoque minimo"
                registration={form.register("stockMin")}
                type="number"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="product-description">
                Descricao
              </label>
              <textarea
                className={textareaClassName}
                id="product-description"
                {...form.register("description")}
              />
              <FieldError message={form.formState.errors.description?.message} />
            </div>

            <div className="grid gap-4 xl:grid-cols-[180px_minmax(0,1fr)]">
              <div className="space-y-3">
                <p className="text-sm font-medium">Foto do produto</p>
                <ProductImage
                  className="h-44 w-44"
                  imageUrl={imagePreviewUrl ?? productQuery.data?.imageUrl}
                  name={form.watch("name") || productQuery.data?.name || "produto"}
                />
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium" htmlFor="product-image">
                  Anexar imagem
                </label>
                <Input
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  id="product-image"
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
                <p className="text-sm text-muted-foreground">
                  A foto e opcional e pode ser escolhida diretamente do seu computador.
                  Ao salvar o produto, a imagem fica anexada ao cadastro.
                </p>
                {selectedImageFile ? (
                  <p className="text-sm font-medium text-primary">
                    Arquivo selecionado: {selectedImageFile.name}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <CheckboxField
                id="product-active"
                label={`${isServiceItem ? "Servico" : "Produto"} ativo`}
                registration={form.register("active")}
              />
              <CheckboxField
                disabled={isServiceItem}
                id="product-serial"
                label="Controla serial"
                registration={form.register("hasSerialControl")}
              />
              <CheckboxField
                id="product-review"
                label="Revisar preco"
                registration={form.register("needsPriceReview")}
              />
              <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                {isServiceItem
                  ? "Este cadastro grava um servico no catalogo e nao depende de estoque."
                  : "Este cadastro grava um produto fisico com custo, venda e relacao opcional com fornecedor."}
              </div>
            </div>

            <div className="flex justify-end">
              <Button disabled={saveMutation.isPending} type="submit">
                {saveMutation.isPending ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {isServiceItem ? "Salvar servico" : "Salvar produto"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {isEditing ? (
        productQuery.data ? (
          <ProductCodesCard
            codes={productQuery.data.codes}
            isService={productQuery.data.isService}
            productId={productQuery.data.id}
          />
        ) : null
      ) : (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm leading-6 text-muted-foreground">
            Salve o {singularLabel} primeiro para gerenciar codigos alternativos reais,
            como EAN, etiqueta interna em barras e codigo de fabricante.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  registration,
  type,
  error,
  disabled
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  type: string;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <Input
        disabled={disabled}
        id={id}
        step={type === "number" ? "0.01" : undefined}
        type={type}
        {...registration}
      />
      <FieldError message={error} />
    </div>
  );
}

function SelectInput({
  id,
  label,
  options,
  registration,
  error
}: {
  id: string;
  label: string;
  options: { label: string; value: string }[];
  registration: UseFormRegisterReturn;
  error?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <select className={selectClassName} id={id} {...registration}>
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

function CheckboxField({
  id,
  label,
  registration,
  disabled
}: {
  id: string;
  label: string;
  registration: UseFormRegisterReturn;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-2xl border border-border/70 bg-secondary/30 px-4 py-3 text-sm font-medium ${
        disabled ? "cursor-not-allowed opacity-65" : ""
      }`}
      htmlFor={id}
    >
      <input
        className={checkboxClassName}
        disabled={disabled}
        id={id}
        type="checkbox"
        {...registration}
      />
      {label}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) {
    return null;
  }

  return <p className="text-sm text-red-600">{message}</p>;
}

function readProductFormValues(formElement: HTMLFormElement): ProductFormValues {
  const formData = new FormData(formElement);

  return {
    categoryId: readFormString(formData, "categoryId"),
    supplierId: readFormString(formData, "supplierId"),
    name: readFormString(formData, "name"),
    description: readFormString(formData, "description"),
    brand: readFormString(formData, "brand"),
    model: readFormString(formData, "model"),
    supplierCode: readFormString(formData, "supplierCode"),
    costPrice: readFormString(formData, "costPrice"),
    salePrice: readFormString(formData, "salePrice"),
    stockMin: readFormString(formData, "stockMin"),
    hasSerialControl: readFormCheckbox(formData, "hasSerialControl"),
    needsPriceReview: readFormCheckbox(formData, "needsPriceReview"),
    isService: readFormCheckbox(formData, "isService"),
    active: readFormCheckbox(formData, "active")
  };
}
