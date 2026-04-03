import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PencilLine, Printer, ScanBarcode } from "lucide-react";
import { ProductImage } from "@/components/app/product-image";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DetailCard } from "@/components/ui/detail-card";
import { DetailTabs, type DetailTabItem } from "@/components/ui/detail-tabs";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { useAppSession } from "@/app/session-context";
import {
  generateProductBarcode,
  getProduct,
  getSale,
  listInventoryBalances,
  listInventoryMovements,
  listInventoryUnits,
  resolveApiAssetUrl,
  updateProductActive,
  type InventoryBalanceRow,
  type InventoryMovement,
  type InventoryProductUnit,
  type ProductCode,
  type SaleDetail
} from "@/lib/api";
import { parseApiError } from "@/lib/api-error";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { queryClient } from "@/lib/query-client";
import { StatusBadge } from "@/components/app/status-badge";
import { success } from "@/lib/toast";

type ProductSaleRow = {
  id: string;
  saleNumber: string;
  completedAt: string;
  customerName: string;
  status: SaleDetail["status"];
  quantity: number;
  totalPrice: number;
};

export function ProductDetailPage({
  catalogMode = "product"
}: {
  catalogMode?: "product" | "service";
}) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authEnabled, hasPermission, session } = useAppSession();
  const token = authEnabled ? session.accessToken : undefined;
  const [imageExpanded, setImageExpanded] = useState(false);

  const productQuery = useQuery({
    queryKey: ["products", "detail", id],
    queryFn: () => getProduct(token, id ?? ""),
    enabled: Boolean(id)
  });
  const generateBarcodeMutation = useMutation({
    mutationFn: () => generateProductBarcode(token, id ?? ""),
    onSuccess: async () => {
      success("Barcode gerado com sucesso.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products", "detail", id] }),
        queryClient.invalidateQueries({ queryKey: ["products"] })
      ]);
    }
  });
  const toggleActiveMutation = useMutation({
    mutationFn: () => {
      if (!productQuery.data || !id) {
        throw new Error("Item nao encontrado.");
      }

      return updateProductActive(token, id, !productQuery.data.active);
    },
    onSuccess: async () => {
      success("Status do item atualizado com sucesso.");
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

  const balancesQuery = useQuery({
    queryKey: ["products", "detail", id, "balances"],
    queryFn: () => listInventoryBalances(token, { productId: id, take: 50 }),
    enabled: Boolean(id && !isServiceItem && hasPermission("inventory.read"))
  });
  const unitsQuery = useQuery({
    queryKey: ["products", "detail", id, "units"],
    queryFn: () => listInventoryUnits(token, { productId: id, take: 100 }),
    enabled: Boolean(
      id &&
        !isServiceItem &&
        product?.hasSerialControl &&
        hasPermission("inventory.read")
    )
  });
  const movementsQuery = useQuery({
    queryKey: ["products", "detail", id, "movements"],
    queryFn: () => listInventoryMovements(token, { productId: id, take: 20 }),
    enabled: Boolean(id && !isServiceItem && hasPermission("inventory.read"))
  });
  const salesQuery = useQuery({
    queryKey: ["products", "detail", id, "sales"],
    queryFn: async () => {
      const saleMovements = await listInventoryMovements(token, {
        productId: id,
        movementType: "SALE",
        take: 20
      });
      const saleIds = Array.from(
        new Set(
          saleMovements
            .filter((movement) => movement.referenceType === "sale" && movement.referenceId)
            .map((movement) => movement.referenceId as string)
        )
      ).slice(0, 20);
      const sales = await Promise.all(saleIds.map((saleId) => getSale(token, saleId)));

      return sales
        .map((sale) => {
          const matchingItems = sale.items.filter((item) => item.product.id === id);

          return {
            id: sale.id,
            saleNumber: sale.saleNumber,
            completedAt: sale.completedAt,
            customerName: sale.customer?.name || "Consumidor final",
            status: sale.status,
            quantity: matchingItems.reduce((sum, item) => sum + item.quantity, 0),
            totalPrice: matchingItems.reduce((sum, item) => sum + item.totalPrice, 0)
          } satisfies ProductSaleRow;
        })
        .filter((sale) => sale.quantity > 0)
        .sort(
          (left, right) =>
            new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime()
        );
    },
    enabled: Boolean(
      id &&
        !isServiceItem &&
        hasPermission("inventory.read") &&
        hasPermission("sales.read")
    )
  });

  const stockRow = balancesQuery.data?.[0] ?? null;
  const stockByLocationRows = stockRow?.balances ?? [];
  const totalStock = stockRow?.totalStock ?? 0;

  const stockColumns = useMemo<Array<DataTableColumn<InventoryBalanceRow["balances"][number]>>>(
    () => [
      {
        id: "location",
        header: "Local",
        cell: (entry) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{entry.location.name}</p>
            <p className="text-xs text-muted-foreground">
              {entry.location.isDefault ? "Local padrao" : "Local auxiliar"}
            </p>
          </div>
        )
      },
      {
        id: "quantity",
        header: "Saldo",
        cell: (entry) => <span className="font-medium text-foreground">{entry.quantity}</span>
      },
      {
        id: "updatedAt",
        header: "Atualizado em",
        cell: (entry) => (
          <span className="text-muted-foreground">
            {entry.updatedAt ? formatDateTime(entry.updatedAt) : "Sem registro"}
          </span>
        )
      }
    ],
    []
  );

  const unitsColumns = useMemo<Array<DataTableColumn<InventoryProductUnit>>>(
    () => [
      {
        id: "unit",
        header: "Unidade",
        cell: (unit) => (
          <div className="space-y-1">
            <p className="font-medium text-foreground">{displayUnit(unit)}</p>
            <p className="text-xs text-muted-foreground">
              {unit.currentLocation?.name || "Sem local atual"}
            </p>
          </div>
        )
      },
      {
        id: "status",
        header: "Status",
        cell: (unit) => (
          <StatusBadge tone={toneByUnitStatus(unit.unitStatus)}>
            {labelByUnitStatus(unit.unitStatus)}
          </StatusBadge>
        )
      },
      {
        id: "purchasePrice",
        header: "Custo",
        cell: (unit) => (
          <span className="font-medium text-foreground">
            {formatCurrency(unit.purchasePrice ?? unit.product.costPrice)}
          </span>
        )
      }
    ],
    []
  );

  const codesColumns = useMemo<Array<DataTableColumn<ProductCode>>>(
    () => [
      {
        id: "codeType",
        header: "Tipo",
        cell: (code) => <span className="text-muted-foreground">{translateCodeType(code.codeType)}</span>
      },
      {
        id: "code",
        header: "Codigo",
        cell: (code) => <span className="font-medium text-foreground">{code.code}</span>
      },
      {
        id: "primary",
        header: "Primario?",
        cell: (code) => (
          <StatusBadge tone={code.isPrimary ? "green" : "slate"}>
            {code.isPrimary ? "Sim" : "Nao"}
          </StatusBadge>
        )
      }
    ],
    []
  );

  const movementsColumns = useMemo<Array<DataTableColumn<InventoryMovement>>>(
    () => [
      {
        id: "createdAt",
        header: "Data",
        cell: (movement) => <span className="text-muted-foreground">{formatDateTime(movement.createdAt)}</span>
      },
      {
        id: "movementType",
        header: "Tipo",
        cell: (movement) => (
          <StatusBadge tone={toneByMovementType(movement.movementType)}>
            {formatMovementType(movement.movementType)}
          </StatusBadge>
        )
      },
      {
        id: "location",
        header: "Local",
        cell: (movement) => <span className="text-muted-foreground">{movement.location.name}</span>
      },
      {
        id: "quantity",
        header: "Qtd",
        cell: (movement) => <span className="font-medium text-foreground">{movement.quantity}</span>
      },
      {
        id: "reference",
        header: "Referencia",
        cell: (movement) =>
          movement.referenceType === "sale" && movement.referenceId && hasPermission("sales.read") ? (
            <Link className="font-medium text-primary" to={`/sales/${movement.referenceId}`}>
              Venda vinculada
            </Link>
          ) : (
            <span className="text-muted-foreground">{movement.referenceType || "Sem referencia"}</span>
          )
      }
    ],
    [hasPermission]
  );

  const salesColumns = useMemo<Array<DataTableColumn<ProductSaleRow>>>(
    () => [
      {
        id: "saleNumber",
        header: "Venda",
        cell: (sale) => <span className="font-medium text-foreground">{sale.saleNumber}</span>
      },
      {
        id: "completedAt",
        header: "Data",
        cell: (sale) => <span className="text-muted-foreground">{formatDateTime(sale.completedAt)}</span>
      },
      {
        id: "customerName",
        header: "Cliente",
        cell: (sale) => <span className="text-muted-foreground">{sale.customerName}</span>
      },
      {
        id: "quantity",
        header: "Qtd",
        cell: (sale) => <span className="font-medium text-foreground">{sale.quantity}</span>
      },
      {
        id: "totalPrice",
        header: "Total item",
        cell: (sale) => <span className="font-medium text-foreground">{formatCurrency(sale.totalPrice)}</span>
      }
    ],
    []
  );

  const tabs = useMemo<DetailTabItem[]>(() => {
    const items: DetailTabItem[] = [];

    if (!isServiceItem && hasPermission("inventory.read")) {
      items.push({
        id: "stock",
        label: "Estoque por local",
        badge: stockByLocationRows.length ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
            {stockByLocationRows.length}
          </span>
        ) : undefined,
        content: (
          <div className="space-y-4 p-6">
            <TabError message={getErrorMessage(balancesQuery.error)} />
            <DataTable
              columns={stockColumns}
              data={stockByLocationRows}
              emptyDescription="Esse item ainda nao possui saldo distribuido por local."
              emptyTitle="Sem saldo por local"
              loading={balancesQuery.isLoading}
              rowKey={(entry) => entry.id}
            />
          </div>
        )
      });
    }

    if (!isServiceItem && product?.hasSerialControl && hasPermission("inventory.read")) {
      items.push({
        id: "units",
        label: "Unidades",
        badge: unitsQuery.data?.length ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
            {unitsQuery.data.length}
          </span>
        ) : undefined,
        content: (
          <div className="space-y-4 p-6">
            <TabError message={getErrorMessage(unitsQuery.error)} />
            <DataTable
              columns={unitsColumns}
              data={unitsQuery.data ?? []}
              emptyDescription="Nenhuma unidade serializada foi encontrada para este item."
              emptyTitle="Sem unidades"
              loading={unitsQuery.isLoading}
              rowKey={(unit) => unit.id}
            />
          </div>
        )
      });
    }

    items.push({
      id: "codes",
      label: "Codigos",
      badge: product?.codes.length ? (
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
          {product.codes.length}
        </span>
      ) : undefined,
      content: (
        <div className="space-y-4 p-6">
          {displayBarcode ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                Barcode operacional
              </p>
              <p className="mt-2 font-medium" style={{ color: "var(--color-text)" }}>
                {displayBarcode.code}
              </p>
            </div>
          ) : null}
          <DataTable
            columns={codesColumns}
            data={product?.codes ?? []}
            emptyDescription="Esse item ainda nao possui codigos alternativos cadastrados."
            emptyTitle="Sem codigos alternativos"
            rowKey={(code) => code.id}
          />
        </div>
      )
    });

    if (!isServiceItem && hasPermission("inventory.read")) {
      items.push({
        id: "movements",
        label: "Movimentacoes",
        badge: movementsQuery.data?.length ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
            {movementsQuery.data.length}
          </span>
        ) : undefined,
        content: (
          <div className="space-y-4 p-6">
            <TabError message={getErrorMessage(movementsQuery.error)} />
            <DataTable
              columns={movementsColumns}
              data={movementsQuery.data ?? []}
              emptyDescription="Nenhuma movimentacao recente foi encontrada para este produto."
              emptyTitle="Sem movimentacoes"
              loading={movementsQuery.isLoading}
              rowKey={(movement) => movement.id}
            />
          </div>
        )
      });
    }

    if (!isServiceItem && hasPermission("inventory.read") && hasPermission("sales.read")) {
      items.push({
        id: "sales",
        label: "Vendas",
        badge: salesQuery.data?.length ? (
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-white/80">
            {salesQuery.data.length}
          </span>
        ) : undefined,
        content: (
          <div className="space-y-4 p-6">
            <TabError message={getErrorMessage(salesQuery.error)} />
            <DataTable
              columns={salesColumns}
              data={salesQuery.data ?? []}
              emptyDescription="Nenhuma venda recente foi identificada para este item."
              emptyTitle="Sem vendas recentes"
              loading={salesQuery.isLoading}
              onRowClick={(sale) => navigate(`/sales/${sale.id}`)}
              rowKey={(sale) => sale.id}
            />
          </div>
        )
      });
    }

    return items;
  }, [
    balancesQuery.error,
    balancesQuery.isLoading,
    codesColumns,
    displayBarcode,
    hasPermission,
    isServiceItem,
    movementsColumns,
    movementsQuery.data,
    movementsQuery.error,
    movementsQuery.isLoading,
    navigate,
    product?.codes,
    product?.hasSerialControl,
    salesColumns,
    salesQuery.data,
    salesQuery.error,
    salesQuery.isLoading,
    stockByLocationRows,
    stockColumns,
    unitsColumns,
    unitsQuery.data,
    unitsQuery.error,
    unitsQuery.isLoading
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        backHref={basePath}
        backLabel={isServiceItem ? "Servicos" : "Produtos"}
        leadingVisual={
          <button
            className="rounded-2xl transition-transform hover:scale-[1.02]"
            onClick={() => {
              if (product?.imageUrl) {
                setImageExpanded(true);
              }
            }}
            type="button"
          >
            <ProductImage
              className="h-16 w-16"
              imageUrl={product?.imageUrl}
              name={product?.name ?? singularLabel}
            />
          </button>
        }
        title={product?.name ?? `Detalhes do ${singularLabel}`}
        titleAdornment={
          product ? (
            <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {product.internalCode}
            </span>
          ) : null
        }
        subtitle={`Catalogo, estoque e trilha operacional do ${singularLabel} selecionado.`}
        actions={
          <>
            {id ? (
              <Button asChild>
                <Link to={`${basePath}/${id}/edit`}>
                  <PencilLine className="mr-2 h-4 w-4" />
                  Editar
                </Link>
              </Button>
            ) : null}
            {product && hasPermission("products.update") ? (
              <Button
                disabled={toggleActiveMutation.isPending}
                onClick={() => {
                  const action = product.active ? "inativar" : "reativar";
                  const confirmed = window.confirm(
                    `Deseja ${action} ${isServiceItem ? "o servico" : "o produto"} ${product.name}?`
                  );

                  if (confirmed) {
                    toggleActiveMutation.mutate();
                  }
                }}
                type="button"
                variant="outline"
              >
                {toggleActiveMutation.isPending
                  ? "Salvando..."
                  : product.active
                    ? "Inativar"
                    : "Reativar"}
              </Button>
            ) : null}
            {!isServiceItem && product?.hasSerialControl && hasPermission("inventory.read") ? (
              <Button asChild variant="outline">
                <Link to={`/inventory/units?productId=${product.id}`}>Gerir unidades</Link>
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
                  <Link to={`/products/${id}/label`}>Visualizar etiqueta</Link>
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
      />

      {product?.imageUrl ? (
        <Dialog onOpenChange={setImageExpanded} open={imageExpanded}>
          <DialogContent className="max-w-[960px] overflow-hidden border-white/10 bg-slate-950 p-0">
            <img
              alt={`Imagem ampliada de ${product.name}`}
              className="max-h-[80vh] w-full object-contain"
              src={resolveApiAssetUrl(product.imageUrl) ?? product.imageUrl}
            />
          </DialogContent>
        </Dialog>
      ) : null}

      {productQuery.isLoading ? (
        <DetailCard>
          <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
            Carregando {singularLabel}...
          </p>
        </DetailCard>
      ) : null}

      <TabError message={getErrorMessage(productQuery.error)} />
      <TabError message={getErrorMessage(generateBarcodeMutation.error)} />
      <TabError message={getErrorMessage(toggleActiveMutation.error)} />

      {product ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              label="Estoque total"
              value={
                isServiceItem
                  ? "Nao se aplica"
                  : hasPermission("inventory.read")
                    ? String(totalStock)
                    : "--"
              }
            />
            <StatCard label="Custo" value={formatCurrency(product.costPrice)} />
            <StatCard label="Preco de venda" value={formatCurrency(product.salePrice)} />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <DetailCard title="Identificacao">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailRow label="Categoria" value={product.category.name} />
                <DetailRow
                  label="Fornecedor"
                  value={product.supplier?.tradeName || product.supplier?.name || "Sem fornecedor"}
                />
                <DetailRow label="Marca" value={product.brand || "Sem marca"} />
                <DetailRow label="Modelo" value={product.model || "Sem modelo"} />
                <DetailRow label="Supplier code" value={product.supplierCode || "Sem codigo"} />
                <DetailRow label="Status" value={product.active ? "Ativo" : "Inativo"} />
              </div>
            </DetailCard>

            <DetailCard title="Fiscal">
              <div className="grid gap-4 md:grid-cols-2">
                <DetailRow label="NCM" value={product.ncm || "Nao informado"} />
                <DetailRow label="CEST" value={product.cest || "Nao informado"} />
                <DetailRow label="CFOP" value={product.cfopDefault || "Nao informado"} />
                <DetailRow label="Origem" value={product.originCode || "Nao informada"} />
              </div>
            </DetailCard>
          </div>

          {tabs.length ? <DetailTabs defaultTabId={tabs[0].id} tabs={tabs} /> : null}
        </>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        {label}
      </p>
      <p className="mt-2 font-medium" style={{ color: "var(--color-text)" }}>
        {value}
      </p>
    </div>
  );
}

function TabError({ message }: { message?: string | null }) {
  return message ? (
    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {message}
    </div>
  ) : null;
}

function displayUnit(unit: Pick<InventoryProductUnit, "imei" | "imei2" | "serialNumber">) {
  return unit.imei || unit.serialNumber || unit.imei2 || "Unidade serializada";
}

function labelByUnitStatus(status: InventoryProductUnit["unitStatus"]) {
  switch (status) {
    case "IN_STOCK":
      return "Em estoque";
    case "RESERVED":
      return "Reservada";
    case "DAMAGED":
      return "Avariada";
    case "SOLD":
      return "Vendida";
    default:
      return status;
  }
}

function toneByUnitStatus(status: InventoryProductUnit["unitStatus"]) {
  switch (status) {
    case "IN_STOCK":
      return "green";
    case "RESERVED":
      return "slate";
    case "DAMAGED":
      return "amber";
    case "SOLD":
      return "orange";
    default:
      return "slate";
  }
}

function formatMovementType(value: InventoryMovement["movementType"]) {
  switch (value) {
    case "ENTRY":
      return "Entrada";
    case "ADJUSTMENT":
      return "Ajuste";
    case "SALE":
      return "Venda";
    case "TRANSFER_IN":
      return "Transferencia recebida";
    case "TRANSFER_OUT":
      return "Transferencia enviada";
    case "RETURN":
      return "Retorno";
    case "EXIT":
      return "Saida";
    default:
      return value;
  }
}

function toneByMovementType(type: InventoryMovement["movementType"]) {
  switch (type) {
    case "ENTRY":
    case "TRANSFER_IN":
    case "RETURN":
      return "green";
    case "SALE":
    case "EXIT":
      return "orange";
    case "ADJUSTMENT":
      return "amber";
    case "TRANSFER_OUT":
    default:
      return "slate";
  }
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

function getErrorMessage(error: unknown) {
  return error ? parseApiError(error) : null;
}
