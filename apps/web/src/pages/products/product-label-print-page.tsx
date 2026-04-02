import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { Code128Barcode } from "@/components/barcode/code128-barcode";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createProductLabelsPreview } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

export function ProductLabelPrintPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { session } = useAppSession();
  const [quantityInput, setQuantityInput] = useState("1");
  const [includePrice, setIncludePrice] = useState(false);
  const [autoPrinted, setAutoPrinted] = useState(false);
  const quantity = clampQuantity(Number(quantityInput) || 1);
  const shouldAutoPrint = searchParams.get("autoprint") === "1";

  const previewQuery = useQuery({
    queryKey: ["products", "label-preview", id, quantity, includePrice],
    queryFn: () =>
      createProductLabelsPreview(session.accessToken, {
        items: id ? [{ productId: id, quantity }] : [],
        includePrice
      }),
    enabled: Boolean(id)
  });

  useEffect(() => {
    if (!shouldAutoPrint || autoPrinted || !previewQuery.data?.items.length) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      window.print();
      setAutoPrinted(true);
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [autoPrinted, previewQuery.data?.items.length, shouldAutoPrint]);

  const baseLabel = previewQuery.data?.items[0] ?? null;
  const labels = useMemo(() => {
    if (!baseLabel) {
      return [];
    }

    return Array.from({ length: baseLabel.quantity }, (_, index) => ({
      ...baseLabel,
      copyIndex: index + 1
    }));
  }, [baseLabel]);

  return (
    <div className="space-y-6">
      <style>
        {`@media print {
            @page { margin: 8mm; }
            body { background: #ffffff; }
            .label-screen-only { display: none !important; }
            .label-sheet { gap: 6px !important; }
          }`}
      </style>

      <div className="label-screen-only">
        <PageHeader
          eyebrow="Loja fisica"
          title="Etiqueta pequena"
          description="Preview compacto em Code 128 para impressao e uso com leitor de codigo de barras no PDV."
          actions={
            <>
              <Button asChild type="button" variant="outline">
                <Link to={id ? `/products/${id}` : "/products"}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Voltar
                </Link>
              </Button>
              <Button
                disabled={!labels.length}
                onClick={() => window.print()}
                type="button"
              >
                <Printer className="mr-2 h-4 w-4" />
                Imprimir
              </Button>
            </>
          }
        />

        <Card className="bg-white/90">
          <CardHeader>
            <CardTitle className="text-xl">Configuracao da etiqueta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[180px_180px_auto]">
            <div className="space-y-2">
              <Label htmlFor="product-label-quantity">Quantidade</Label>
              <Input
                id="product-label-quantity"
                max={60}
                min={1}
                onChange={(event) => setQuantityInput(event.target.value)}
                type="number"
                value={quantityInput}
              />
            </div>

            <label className="flex items-end gap-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3 text-sm font-medium">
              <input
                checked={includePrice}
                className="h-4 w-4 rounded border border-input text-primary"
                onChange={(event) => setIncludePrice(event.target.checked)}
                type="checkbox"
              />
              Mostrar preco na etiqueta
            </label>

            <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              Etiqueta compacta para produto fisico. O barcode linear `CODE 128` e o
              padrao principal para a loja fisica.
            </div>
          </CardContent>
        </Card>
      </div>

      {previewQuery.isLoading ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Montando etiqueta...
          </CardContent>
        </Card>
      ) : null}

      {previewQuery.error ? (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-6 text-sm text-red-700">
            {(previewQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : null}

      {labels.length ? (
        <div className="label-sheet grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {labels.map((label) => (
            <article
              key={`${label.productId}-${label.copyIndex}`}
              className="rounded-xl border border-slate-300 bg-white p-3 text-slate-950 shadow-sm"
            >
              <div className="min-h-[30px] text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700">
                {label.shortName}
              </div>

              <div className="mt-2 flex items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white px-2 py-2">
                <Code128Barcode
                  barWidth={1.6}
                  className="w-full [&_svg]:h-[52px] [&_svg]:w-full"
                  height={52}
                  value={label.barcode.code}
                />
              </div>

              <div className="mt-2 text-center text-[11px] font-medium tracking-[0.18em] text-slate-900">
                {label.barcode.humanReadableCode}
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 text-[10px] text-slate-600">
                <span>{label.internalCode}</span>
                {includePrice ? <span>{formatCurrency(label.salePrice)}</span> : null}
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function clampQuantity(value: number) {
  return Math.min(60, Math.max(1, Number.isFinite(value) ? value : 1));
}
