import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, PencilLine, Printer, ScanBarcode } from "lucide-react";
import { PageHeader } from "@/components/app/page-header";
import { Code128Barcode } from "@/components/barcode/code128-barcode";
import { ProductImage } from "@/components/app/product-image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAppSession } from "@/app/session-context";
import { generateProductBarcode, getProduct } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";

export function ProductDetailPage({
  catalogMode = "product"
}: {
  catalogMode?: "product" | "service";
}) {
  const { id } = useParams();
  const { authEnabled, hasPermission, session } = useAppSession();
  const productQuery = useQuery({
    queryKey: ["products", "detail", id],
    queryFn: () => getProduct(authEnabled ? session.accessToken : undefined, id ?? ""),
    enabled: Boolean(id)
  });
  const generateBarcodeMutation = useMutation({
    mutationFn: () =>
      generateProductBarcode(authEnabled ? session.accessToken : undefined, id ?? ""),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products", "detail", id] }),
        queryClient.invalidateQueries({ queryKey: ["products"] })
      ]);
    }
  });

  const product = productQuery.data;
  const isServiceItem = product?.isService ?? (catalogMode === "service");
  const singularLabel = isServiceItem ? "servico" : "produto";
  const basePath = isServiceItem ? "/services" : "/products";
  const displayBarcode = product?.displayBarcode ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={basePath}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Voltar
              </Link>
            </Button>
            {id ? (
              <Button asChild>
                <Link to={`${basePath}/${id}/edit`}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </Button>
            ) : null}
            {!isServiceItem && product?.hasSerialControl && hasPermission("inventory.read") ? (
              <Button asChild variant="outline">
                <Link to={`/inventory/units?productId=${product.id}`}>
                  Gerir unidades
                </Link>
              </Button>
            ) : null}
            {!isServiceItem && id && hasPermission("products.update") && !displayBarcode ? (
              <Button
                disabled={generateBarcodeMutation.isPending}
                onClick={() => generateBarcodeMutation.mutate()}
                type="button"
                variant="outline"
              >
                <ScanBarcode className="mr-2 h-4 w-4" />
                {generateBarcodeMutation.isPending ? "Gerando..." : "Gerar barcode"}
              </Button>
            ) : null}
            {!isServiceItem && id && displayBarcode ? (
              <>
                <Button asChild type="button" variant="outline">
                  <Link to={`/products/${id}/label`}>
                    Visualizar etiqueta
                  </Link>
                </Button>
                <Button asChild type="button">
                  <Link to={`/products/${id}/label?autoprint=1`}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimir etiqueta
                  </Link>
                </Button>
              </>
            ) : null}
          </>
        }
        description={`Resumo comercial do ${singularLabel}, codigos, precos e flags operacionais.`}
        eyebrow="Cadastros"
        title={product?.name ?? `Detalhes do ${singularLabel}`}
      />

      {productQuery.isLoading ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Carregando produto...
          </CardContent>
        </Card>
      ) : null}

      {productQuery.error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-sm text-red-700">
            {(productQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {generateBarcodeMutation.error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-sm text-red-700">
            {(generateBarcodeMutation.error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {product ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <InfoCard label="Internal code" value={product.internalCode} />
            <InfoCard
              label="Barcode loja"
              value={displayBarcode?.code || "Nao gerado"}
            />
            <InfoCard label="Supplier code" value={product.supplierCode || "Sem codigo"} />
            <InfoCard label="Preco de venda" value={formatCurrency(product.salePrice)} />
            <InfoCard label="Custo" value={formatCurrency(product.costPrice)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_360px]">
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Ficha comercial</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <DetailRow label="Nome" value={product.name} />
                <DetailRow label="Categoria" value={product.category.name} />
                <DetailRow
                  label="Fornecedor"
                  value={product.supplier?.tradeName || product.supplier?.name || "Sem fornecedor"}
                />
                <DetailRow label="Marca" value={product.brand || "Sem marca"} />
                <DetailRow label="Modelo" value={product.model || "Sem modelo"} />
                <DetailRow label="Estoque minimo" value={String(product.stockMin)} />
                <DetailRow
                  label="Serializacao"
                  value={product.hasSerialControl ? "Controlado" : "Nao controlado"}
                />
                <DetailRow label="Tipo" value={product.isService ? "Servico" : "Produto"} />
                <DetailRow label="Status" value={product.active ? "Ativo" : "Inativo"} />
                <DetailRow
                  label="Revisao de preco"
                  value={product.needsPriceReview ? "Pendente" : "Nao"}
                />
                <DetailRow label="Criado em" value={formatDateTime(product.createdAt)} />
                <DetailRow label="Atualizado em" value={formatDateTime(product.updatedAt)} />
              </CardContent>
            </Card>

            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Foto e observacoes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ProductImage
                  className="h-64 w-full"
                  imageUrl={product.imageUrl}
                  name={product.name}
                />
                <div className="rounded-2xl border border-border/70 bg-card/80 p-4 text-sm leading-6 text-muted-foreground">
                  {product.description || "Sem descricao complementar."}
                </div>
                <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                  {product.isService
                    ? "Servico persistido no catalogo com categoria, fornecedor opcional e valores comerciais reais."
                    : "Produto persistido no catalogo com categoria, fornecedor opcional e valores comerciais reais."}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Codigos alternativos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!product.isService ? (
                  <div className="rounded-3xl border border-primary/15 bg-primary/5 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">
                          Barcode operacional da loja
                        </p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          O PDV aceita esse codigo no leitor comum como atalho principal para a loja fisica.
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/20 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        CODE 128
                      </span>
                    </div>

                    {displayBarcode ? (
                      <div className="mt-4 rounded-2xl border border-border/70 bg-white p-4">
                        <div className="flex justify-center">
                          <Code128Barcode
                            barWidth={1.8}
                            className="w-full max-w-[320px] [&_svg]:h-[68px] [&_svg]:w-full"
                            height={68}
                            value={displayBarcode.code}
                          />
                        </div>
                        <p className="mt-3 text-center text-sm font-semibold tracking-[0.22em] text-slate-900">
                          {displayBarcode.code}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-4 rounded-2xl border border-dashed border-border/80 bg-card/80 p-4 text-sm text-muted-foreground">
                        Este produto fisico ainda nao possui barcode operacional salvo.
                      </div>
                    )}
                  </div>
                ) : null}

                {product.codes.length ? (
                  product.codes.map((code) => (
                    <div
                      key={code.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/80 p-4"
                    >
                      <div>
                        <p className="font-semibold">{code.code}</p>
                        <p className="text-sm text-muted-foreground">
                          {translateCodeType(code.codeType)}
                        </p>
                      </div>
                      <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                        {code.isPrimary ? "Principal" : "Alternativo"}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-border/80 bg-card/80 p-4 text-sm text-muted-foreground">
                    Nenhum codigo alternativo cadastrado para este item.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Resumo de unidades</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {product.isService ? (
                  <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm leading-6 text-muted-foreground">
                    Servicos nao usam controle unitario nem estoque serializado.
                  </div>
                ) : (
                  <>
                    <DetailRow
                      label="Total de unidades"
                      value={String(product.unitSummary.totalUnits)}
                    />
                    <DetailRow
                      label="Disponiveis"
                      value={String(product.unitSummary.inStockUnits)}
                    />
                    <DetailRow
                      label="Vendidas"
                      value={String(product.unitSummary.soldUnits)}
                    />
                    <DetailRow
                      label="Reservadas / avariadas"
                      value={`${product.unitSummary.reservedUnits} / ${product.unitSummary.damagedUnits}`}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="bg-white/90">
      <CardContent className="space-y-2 p-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/80 p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function translateCodeType(codeType: string) {
  switch (codeType) {
    case "INTERNAL_BARCODE":
      return "Barcode da loja (Code 128)";
    case "MANUFACTURER_BARCODE":
      return "Codigo de fabricante";
    case "EAN13":
      return "EAN-13";
    case "CODE128":
      return "Code 128";
    default:
      return codeType;
  }
}
