import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Minus,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2
} from "lucide-react";
import { useAppSession } from "@/app/session-context";
import { PageHeader } from "@/components/app/page-header";
import { ProductImage } from "@/components/app/product-image";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PdvCheckoutDialog } from "@/pages/pdv/pdv-checkout-dialog";
import { PdvScannerPanel } from "@/pages/pdv/pdv-scanner-panel";
import {
  checkoutSale,
  getCurrentCashSession,
  listCustomers,
  listStockLocations,
  searchPdvProducts,
  type CheckoutSalePaymentPayload,
  type PaymentMethodName,
  type PdvProductResult,
  type SaleDetail
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { openFiscalReceiptPrintWindow } from "@/lib/fiscal-receipt";
import {
  centsToInputValue,
  formatCurrency,
  parseCurrencyToCents,
  parseInteger
} from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { error as toastError, success } from "@/lib/toast";

type CartItem = {
  key: string;
  productId: string;
  productUnitId?: string;
  stockLocationId?: string;
  stockLocationName?: string | null;
  name: string;
  internalCode: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  hasSerialControl: boolean;
  unitLabel: string | null;
};

type PaymentRow = {
  id: string;
  method: PaymentMethodName;
  amount: string;
  installments: string;
  referenceCode: string;
};

const selectClassName =
  "flex h-11 w-full rounded-xl border border-input bg-white/90 px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PdvPage() {
  const { authEnabled, hasPermission, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const scanRef = useRef<HTMLInputElement | null>(null);
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<PdvProductResult[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [saleDiscount, setSaleDiscount] = useState("0,00");
  const [payments, setPayments] = useState<PaymentRow[]>([createPaymentRow()]);
  const [unitSelections, setUnitSelections] = useState<Record<string, string>>({});
  const [stockLocationId, setStockLocationId] = useState("");
  const [feedback, setFeedback] = useState<{
    tone: "success" | "error";
    text: string;
  } | null>(null);
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutSuccessOpen, setCheckoutSuccessOpen] = useState(false);
  const [receiptPrintPending, setReceiptPrintPending] = useState(false);

  const cashSessionQuery = useQuery({
    queryKey: ["cash", "current-session"],
    queryFn: () => getCurrentCashSession(token)
  });
  const customersQuery = useQuery({
    queryKey: ["customers", "pdv"],
    queryFn: () => listCustomers(token, { active: true })
  });
  const stockLocationsQuery = useQuery({
    queryKey: ["stock-locations", "pdv"],
    queryFn: () => listStockLocations(token, { active: true, take: 200 }),
    enabled: Boolean(cashSessionQuery.data)
  });

  const searchMutation = useMutation({
    mutationFn: (value: string) =>
      searchPdvProducts(token, value, 8, stockLocationId || undefined),
    onSuccess: (nextResults) => {
      setResults(nextResults);

      const exactMatches = nextResults.filter((result) => result.matchedBy !== "search");
      const autoPick =
        nextResults.length === 1
          ? nextResults[0]
          : exactMatches.length === 1
            ? exactMatches[0]
            : null;

      if (autoPick) {
        const single = autoPick;
        const autoUnit =
          single.selectedUnit ??
          (single.hasSerialControl && single.availableUnits.length === 1
            ? single.availableUnits[0]
            : null);

        if (!single.hasSerialControl || autoUnit) {
          addToCart(single, autoUnit?.id);
          setResults([]);
          setTerm("");
        }
      }
    },
    onError: (error) => toastError(parseApiError(error))
  });

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity - item.discountAmount,
        0
      ),
    [cart]
  );
  const total = Math.max(0, subtotal - parseCurrencyToCents(saleDiscount));
  const paymentTotal = payments.reduce(
    (sum, payment) => sum + parseCurrencyToCents(payment.amount),
    0
  );
  const troco =
    payments.some((payment) => payment.method === "CASH") && paymentTotal > total
      ? paymentTotal - total
      : 0;
  const missingAmount = Math.max(0, total - paymentTotal);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!cashSessionQuery.data) {
        throw new Error("Aguarde a sessao atual do caixa ficar disponivel.");
      }

      return checkoutSale(token, {
        customerId: customerId || undefined,
        cashSessionId: cashSessionQuery.data.id,
        items: cart.map((item) => ({
          productId: item.productId,
          productUnitId: item.productUnitId,
          stockLocationId: item.stockLocationId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountAmount: item.discountAmount
        })),
        payments: normalizePayments(payments, total),
        discountAmount: parseCurrencyToCents(saleDiscount)
      });
    },
    onSuccess: async (sale) => {
      setCart([]);
      setPayments([createPaymentRow()]);
      setCustomerId("");
      setSaleDiscount("0,00");
      setTerm("");
      setResults([]);
      setLastSale(sale);
      setCheckoutOpen(false);
      setCheckoutSuccessOpen(true);
      success(`Venda ${sale.saleNumber} concluida.`);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cash"] }),
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] })
      ]);
    },
    onError: (error) => toastError(parseApiError(error))
  });

  useEffect(() => {
    scanRef.current?.focus();
  }, [results, cart.length]);

  useEffect(() => {
    if (!cart.length && checkoutOpen) {
      setCheckoutOpen(false);
    }
  }, [cart.length, checkoutOpen]);

  async function handlePrintLastSaleReceipt() {
    if (!lastSale) {
      return;
    }

    try {
      setReceiptPrintPending(true);
      setFeedback(null);
      await openFiscalReceiptPrintWindow(token, lastSale.id);
      success("Comprovante aberto em nova aba para impressao.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sales"] }),
        queryClient.invalidateQueries({ queryKey: ["fiscal"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      ]);
    } catch (error) {
      toastError(parseApiError(error));
    } finally {
      setReceiptPrintPending(false);
    }
  }

  function addToCart(product: PdvProductResult, unitId?: string) {
    const unit =
      product.availableUnits.find((entry) => entry.id === unitId) ??
      product.selectedUnit;
    const resolvedLocation = resolveCartLocation(product, stockLocationId, unit);

    if (!product.isService && !product.hasSerialControl && product.totalStock <= 0) {
      setFeedback({ tone: "error", text: `${product.name} sem estoque.` });
      return false;
    }

    if (product.hasSerialControl && !unit) {
      setFeedback({
        tone: "error",
        text: `Selecione a unidade de ${product.name}.`
      });
      return false;
    }

    if (!product.isService && !resolvedLocation) {
      setFeedback({
        tone: "error",
        text: `Selecione o local de estoque para ${product.name}.`
      });
      return false;
    }

    setFeedback(null);

    let addedToCart = false;

    setCart((current) => {
      if (!product.hasSerialControl) {
        const existing = current.find(
          (entry) =>
            entry.productId === product.id &&
            !entry.productUnitId &&
            entry.stockLocationId === resolvedLocation?.id
        );

        if (existing) {
          addedToCart = true;
          return current.map((entry) =>
            entry.key === existing.key
              ? { ...entry, quantity: entry.quantity + 1 }
              : entry
          );
        }
      }

      if (unit?.id && current.some((entry) => entry.productUnitId === unit.id)) {
        setFeedback({
          tone: "error",
          text: `A unidade ${formatUnit(unit)} ja esta no carrinho.`
        });
        return current;
      }

      addedToCart = true;
      return [
        ...current,
        {
          key: `${product.id}-${unit?.id ?? current.length + 1}`,
          productId: product.id,
          productUnitId: unit?.id,
          stockLocationId: resolvedLocation?.id,
          stockLocationName: resolvedLocation?.name ?? null,
          name: product.name,
          internalCode: product.internalCode,
          quantity: 1,
          unitPrice: product.salePrice,
          discountAmount: 0,
          hasSerialControl: product.hasSerialControl,
          unitLabel: unit ? formatUnit(unit) : null
        }
      ];
    });

    if (addedToCart) {
      setResults([]);
      setTerm("");
      setTimeout(() => scanRef.current?.focus(), 0);
    }

    return addedToCart;
  }

  function handleScannedProduct(product: PdvProductResult, code: string) {
    const autoUnit =
      product.selectedUnit ??
      (product.hasSerialControl && product.availableUnits.length === 1
        ? product.availableUnits[0]
        : null);

    if (!product.hasSerialControl || autoUnit) {
      const added = addToCart(product, autoUnit?.id);

      if (added) {
        setFeedback({
          tone: "success",
          text: `Leitura recebida: ${product.name}.`
        });
      }

      return added;
    }

    setResults([product]);
    setTerm(code);
    setFeedback({
      tone: "success",
      text: `${product.name} localizado. Selecione a unidade para concluir a adicao.`
    });
    setTimeout(() => scanRef.current?.focus(), 0);
    return false;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Button
            disabled={!cashSessionQuery.data || !cart.length}
            onClick={() => setCheckoutOpen(true)}
            type="button"
          >
            Abrir checkout
          </Button>
        }
        badge={
          <StatusBadge tone={cashSessionQuery.data ? "green" : "amber"}>
            {cashSessionQuery.data
              ? "Sessao atual pronta"
              : cashSessionQuery.isLoading
                ? "Preparando sessao"
                : "Sessao indisponivel"}
          </StatusBadge>
        }
        description="Busca rapida, carrinho e checkout integrados a sessao atual do caixa."
        eyebrow="Operacao"
        title="PDV"
      />

      {cashSessionQuery.isError ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-red-700">
            {(cashSessionQuery.error as Error).message}
          </CardContent>
        </Card>
      ) : !cashSessionQuery.data ? (
        <Card className="bg-white/90">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Preparando a sessao atual do caixa para o PDV...
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            <PdvScannerPanel
              cashSessionId={cashSessionQuery.data.id}
              onFeedback={setFeedback}
              onProductScanned={handleScannedProduct}
              stockLocationId={stockLocationId}
              token={token}
            />

            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Busca operacional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      onChange={(event) => setTerm(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          searchMutation.mutate(term.trim());
                        }
                      }}
                      placeholder="Nome, barcode, internal_code, supplier_code ou IMEI"
                      ref={scanRef}
                      value={term}
                    />
                  </div>

                  <Button
                    disabled={searchMutation.isPending || !term.trim()}
                    onClick={() => searchMutation.mutate(term.trim())}
                    type="button"
                  >
                    Buscar
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <MiniInfo
                    label="Terminal"
                    value={cashSessionQuery.data.cashTerminal.name}
                  />
                  <div className="space-y-2">
                    <label className="text-sm font-medium" htmlFor="pdv-stock-location">
                      Local
                    </label>
                    <select
                      className={selectClassName}
                      id="pdv-stock-location"
                      onChange={(event) => setStockLocationId(event.target.value)}
                      value={stockLocationId}
                    >
                      <option value="">Operar em todos / auto</option>
                      {(stockLocationsQuery.data ?? []).map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.name}
                          {location.isDefault ? " (padrao)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                  <MiniInfo
                    label="Sessao"
                    value={cashSessionQuery.data.id.slice(0, 8).toUpperCase()}
                  />
                  <MiniInfo
                    label="Esperado"
                    value={formatCurrency(
                      cashSessionQuery.data.calculatedExpectedAmount
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Resultados</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!results.length && !searchMutation.isPending ? (
                  <p className="text-sm text-muted-foreground">
                    Leia um item ou pesquise manualmente para montar o carrinho.
                  </p>
                ) : null}

                {results.map((product) => (
                  <div
                    key={product.id}
                    className="rounded-2xl border border-border/70 bg-secondary/20 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-start gap-3">
                        <ProductImage
                          className="h-20 w-20 shrink-0"
                          imageUrl={product.imageUrl}
                          name={product.name}
                        />

                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{product.name}</p>
                            <StatusBadge tone={product.isService ? "blue" : "slate"}>
                              {product.isService ? "Servico" : "Produto"}
                            </StatusBadge>
                            {product.hasSerialControl ? (
                              <StatusBadge tone="orange">Serializado</StatusBadge>
                            ) : null}
                          </div>

                          <p className="text-sm text-muted-foreground">
                            {product.internalCode}
                            {product.supplierCode ? ` / ${product.supplierCode}` : ""}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {formatCurrency(product.salePrice)} • estoque{" "}
                            {product.totalStock}
                          </p>
                          {!product.isService && stockLocationId ? (
                            <p className="text-xs text-muted-foreground">
                              Local filtrado:{" "}
                              {(stockLocationsQuery.data ?? []).find(
                                (location) => location.id === stockLocationId
                              )?.name || "selecionado"}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      <div className="w-full max-w-sm space-y-2">
                        {product.hasSerialControl ? (
                          <select
                            className={selectClassName}
                            onChange={(event) =>
                              setUnitSelections((current) => ({
                                ...current,
                                [product.id]: event.target.value
                              }))
                            }
                            value={
                              unitSelections[product.id] ?? product.selectedUnit?.id ?? ""
                            }
                          >
                            <option value="">Selecionar unidade</option>
                            {product.availableUnits.map((unit) => (
                              <option key={unit.id} value={unit.id}>
                                {formatUnit(unit)}
                                {unit.currentLocation ? ` • ${unit.currentLocation.name}` : ""}
                              </option>
                            ))}
                          </select>
                        ) : null}

                        <Button
                          className="w-full"
                          disabled={
                            product.hasSerialControl &&
                            !(
                              unitSelections[product.id] ||
                              product.selectedUnit?.id ||
                              (product.availableUnits.length === 1
                                ? product.availableUnits[0].id
                                : "")
                            )
                          }
                          onClick={() =>
                            addToCart(
                              product,
                              unitSelections[product.id] ||
                                product.selectedUnit?.id ||
                                (product.availableUnits.length === 1
                                  ? product.availableUnits[0].id
                                  : undefined)
                            )
                          }
                          type="button"
                          variant="outline"
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-xl">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  Carrinho
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!cart.length ? (
                  <p className="text-sm text-muted-foreground">Carrinho vazio.</p>
                ) : (
                  cart.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-2xl border border-border/70 bg-secondary/20 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.internalCode}
                            {item.unitLabel ? ` • ${item.unitLabel}` : ""}
                            {item.stockLocationName ? ` • ${item.stockLocationName}` : ""}
                          </p>
                        </div>

                        <Button
                          onClick={() =>
                            setCart((current) =>
                              current.filter((entry) => entry.key !== item.key)
                            )
                          }
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Qtd</label>
                          <div className="flex items-center gap-2">
                            <Button
                              disabled={item.hasSerialControl}
                              onClick={() =>
                                setCart((current) =>
                                  current.map((entry) =>
                                    entry.key === item.key
                                      ? {
                                          ...entry,
                                          quantity: Math.max(1, entry.quantity - 1)
                                        }
                                      : entry
                                  )
                                )
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                              onChange={(event) =>
                                setCart((current) =>
                                  current.map((entry) =>
                                    entry.key === item.key
                                      ? {
                                          ...entry,
                                          quantity: item.hasSerialControl
                                            ? 1
                                            : Math.max(1, parseInteger(event.target.value))
                                        }
                                      : entry
                                  )
                                )
                              }
                              value={String(item.quantity)}
                            />
                            <Button
                              disabled={item.hasSerialControl}
                              onClick={() =>
                                setCart((current) =>
                                  current.map((entry) =>
                                    entry.key === item.key
                                      ? {
                                          ...entry,
                                          quantity: entry.quantity + 1
                                        }
                                      : entry
                                  )
                                )
                              }
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <Field
                          label="Preco"
                          onChange={(value) =>
                            setCart((current) =>
                              current.map((entry) =>
                                entry.key === item.key
                                  ? {
                                      ...entry,
                                      unitPrice: parseCurrencyToCents(value)
                                    }
                                  : entry
                              )
                            )
                          }
                          value={centsToInputValue(item.unitPrice)}
                        />
                        <Field
                          label="Desc."
                          onChange={(value) =>
                            setCart((current) =>
                              current.map((entry) =>
                                entry.key === item.key
                                  ? {
                                      ...entry,
                                      discountAmount: parseCurrencyToCents(value)
                                    }
                                  : entry
                              )
                            )
                          }
                          value={centsToInputValue(item.discountAmount)}
                        />
                      </div>

                      <div className="mt-4 flex items-center justify-between rounded-2xl border border-border/60 bg-white/80 px-4 py-3 text-sm">
                        <span className="text-muted-foreground">Total da linha</span>
                        <span className="font-semibold">
                          {formatCurrency(
                            item.unitPrice * item.quantity - item.discountAmount
                          )}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/90">
              <CardHeader>
                <CardTitle className="text-xl">Resumo rapido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Itens</span>
                    <span className="font-semibold">{totalItems}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-semibold">{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Pagamentos</span>
                    <span className="font-semibold">{formatCurrency(paymentTotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Falta</span>
                    <span className="font-semibold">{formatCurrency(missingAmount)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Troco</span>
                    <span className="font-semibold">{formatCurrency(troco)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="text-xl font-black">{formatCurrency(total)}</span>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <MiniInfo
                    label="Cliente"
                    value={
                      customerId
                        ? (customersQuery.data ?? []).find(
                            (customer) => customer.id === customerId
                          )?.name || "Selecionado"
                        : "Consumidor nao identificado"
                    }
                  />
                  <MiniInfo label="Desconto geral" value={saleDiscount} />
                </div>

                {feedback ? (
                  <div
                    className={`rounded-2xl border p-4 text-sm ${
                      feedback.tone === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-red-200 bg-red-50 text-red-700"
                    }`}
                  >
                    {feedback.text}
                  </div>
                ) : null}

                {lastSale ? (
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/sales/${lastSale.id}`}>Abrir ultima venda</Link>
                  </Button>
                ) : null}

                <Button
                  className="w-full"
                  disabled={!cart.length}
                  onClick={() => setCheckoutOpen(true)}
                  type="button"
                >
                  Abrir checkout
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <PdvCheckoutDialog
        checkoutDisabled={!cart.length}
        checkoutPending={checkoutMutation.isPending}
        customerId={customerId}
        customers={customersQuery.data ?? []}
        feedback={feedback}
        itemCount={totalItems}
        missingAmount={missingAmount}
        onAddPayment={() =>
          setPayments((current) => [...current, createPaymentRow()])
        }
        onCheckout={() => checkoutMutation.mutate()}
        onCustomerIdChange={setCustomerId}
        onOpenChange={setCheckoutOpen}
        onRemovePayment={(paymentId) =>
          setPayments((current) =>
            current.length === 1
              ? current
              : current.filter((payment) => payment.id !== paymentId)
          )
        }
        onSaleDiscountChange={setSaleDiscount}
        onUpdatePayment={(paymentId, patch) =>
          setPayments((current) =>
            current.map((entry) =>
              entry.id === paymentId ? { ...entry, ...patch } : entry
            )
          )
        }
        onUseTotal={() =>
          setPayments((current) =>
            current.map((entry, index) =>
              index === 0 ? { ...entry, amount: centsToInputValue(total) } : entry
            )
          )
        }
        open={checkoutOpen}
        paymentTotal={paymentTotal}
        payments={payments}
        saleDiscount={saleDiscount}
        subtotal={subtotal}
        total={total}
        troco={troco}
      />

      <Dialog open={checkoutSuccessOpen && Boolean(lastSale)} onOpenChange={setCheckoutSuccessOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <div className="space-y-1">
                <DialogTitle>Venda concluida</DialogTitle>
                <DialogDescription>
                  {lastSale
                    ? `Venda ${lastSale.saleNumber} registrada com total de ${formatCurrency(lastSale.total)}.`
                    : "A operacao foi concluida com sucesso."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {lastSale ? (
            <DialogBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <MiniInfo label="Venda" value={lastSale.saleNumber} />
                <MiniInfo
                  label="Cliente"
                  value={lastSale.customer?.name || "Consumidor final"}
                />
                <MiniInfo label="Total" value={formatCurrency(lastSale.total)} />
              </div>
            </DialogBody>
          ) : null}

          <DialogFooter>
            <Button
              onClick={() => setCheckoutSuccessOpen(false)}
              type="button"
              variant="outline"
            >
              Fechar
            </Button>
            {lastSale ? (
              <Button asChild type="button" variant="outline">
                <Link
                  onClick={() => setCheckoutSuccessOpen(false)}
                  to={`/sales/${lastSale.id}`}
                >
                  Abrir venda
                </Link>
              </Button>
            ) : null}
            {hasPermission("fiscal.issue") && lastSale ? (
              <Button
                disabled={receiptPrintPending}
                onClick={() => void handlePrintLastSaleReceipt()}
                type="button"
              >
                <Printer className="mr-2 h-4 w-4" />
                {receiptPrintPending ? "Abrindo comprovante..." : "Imprimir comprovante"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function createPaymentRow(): PaymentRow {
  return {
    id: createClientId(),
    method: "CASH",
    amount: "0,00",
    installments: "",
    referenceCode: ""
  };
}

function createClientId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `payment-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function formatUnit(unit: {
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
}) {
  return unit.imei || unit.serialNumber || unit.imei2 || "Unidade";
}

function resolveCartLocation(
  product: PdvProductResult,
  selectedLocationId: string,
  unit?: PdvProductResult["availableUnits"][number] | PdvProductResult["selectedUnit"] | null
) {
  if (product.isService) {
    return null;
  }

  if (product.hasSerialControl) {
    return unit?.currentLocation ?? null;
  }

  const balances = product.balances.filter((entry) => entry.quantity > 0);

  if (selectedLocationId) {
    const explicitLocation = balances.find(
      (entry) => entry.location.id === selectedLocationId
    );

    return explicitLocation?.location ?? null;
  }

  if (balances.length === 1) {
    return balances[0].location;
  }

  const defaultBalance = balances.find((entry) => entry.location.isDefault);
  return defaultBalance?.location ?? null;
}

function normalizePayments(
  payments: PaymentRow[],
  total: number
): CheckoutSalePaymentPayload[] {
  const parsed = payments
    .map((payment) => ({
      ...payment,
      cents: parseCurrencyToCents(payment.amount)
    }))
    .filter((payment) => payment.cents > 0);

  if (!parsed.length) {
    throw new Error("Informe ao menos um pagamento.");
  }

  const informed = parsed.reduce((sum, payment) => sum + payment.cents, 0);
  const nonCash = parsed
    .filter((payment) => payment.method !== "CASH")
    .reduce((sum, payment) => sum + payment.cents, 0);

  if (nonCash > total) {
    throw new Error("Pagamentos sem dinheiro excedem o total.");
  }

  if (informed < total) {
    throw new Error("Pagamentos insuficientes.");
  }

  if (informed > total && !parsed.some((payment) => payment.method === "CASH")) {
    throw new Error("Troco so e permitido no dinheiro.");
  }

  let excess = Math.max(0, informed - total);

  const normalized = parsed
    .map((payment) => {
      if (payment.method !== "CASH" || excess === 0) {
        return payment;
      }

      const reducible = Math.min(payment.cents, excess);
      excess -= reducible;

      return {
        ...payment,
        cents: payment.cents - reducible
      };
    })
    .filter((payment) => payment.cents > 0)
    .map((payment) => ({
      method: payment.method,
      amount: payment.cents,
      installments: payment.installments
        ? parseInteger(payment.installments)
        : undefined,
      referenceCode: payment.referenceCode.trim() || undefined
    }));

  if (normalized.reduce((sum, payment) => sum + payment.amount, 0) !== total) {
    throw new Error("Nao foi possivel conciliar os pagamentos.");
  }

  return normalized;
}

function Field({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Input
        onChange={(event) => onChange(event.target.value)}
        value={value}
      />
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-secondary/20 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold">{value}</p>
    </div>
  );
}
