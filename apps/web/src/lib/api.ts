import {
  authUserSchema,
  authSessionSchema,
  healthResponseSchema,
  type AuthSession,
  type AuthUser,
  type HealthResponse,
  type LoginInput,
  type PermissionKey,
  type RefreshSessionInput,
  type ScannerSessionStatus
} from "@/shared";
import {
  type ApiErrorBody,
  createApiHttpError,
  isApiHttpError,
  markApiErrorAsHandled,
  parseApiError
} from "./api-error";
import { clearStoredSession } from "./session-storage";
import { error as toastError } from "./toast";

export const API_CONFIGURATION_ERROR_MESSAGE =
  "API publica nao configurada para este deploy. Defina VITE_API_URL com a URL publica da API.";

function isLocalDevelopmentHostname(hostname: string) {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".lan")
  ) {
    return true;
  }

  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname)) {
    return true;
  }

  const private172Match = hostname.match(/^172\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/);
  if (private172Match) {
    const secondOctet = Number(private172Match[1]);
    if (secondOctet >= 16 && secondOctet <= 31) {
      return true;
    }
  }

  return !hostname.includes(".");
}

function resolveApiUrl() {
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
  if (configuredApiUrl) {
    return configuredApiUrl.replace(/\/$/, "");
  }

  if (typeof window !== "undefined") {
    if (isLocalDevelopmentHostname(window.location.hostname)) {
      return `${window.location.protocol}//${window.location.hostname}:3000/api`;
    }

    return "";
  }

  return "http://localhost:3000/api";
}

const API_URL = resolveApiUrl();
export const IS_API_CONFIGURED = API_URL.length > 0;
export const API_ORIGIN = IS_API_CONFIGURED ? API_URL.replace(/\/api$/, "") : "";
const GLOBAL_SERVER_ERROR_THROTTLE_MS = 5000;
const PENDING_TOAST_STORAGE_KEY = "lojacelular.pending-toast";
const recentGlobalErrors = new Map<string, number>();

type RequestMetadata = {
  path?: string;
  authenticated?: boolean;
  skipUnauthorizedRedirect?: boolean;
  skipGlobalErrorToast?: boolean;
};

function ensureApiConfigured(path?: string) {
  if (IS_API_CONFIGURED) {
    return;
  }

  throw createApiHttpError({
    body: API_CONFIGURATION_ERROR_MESSAGE,
    path
  });
}

function shouldEmitGlobalServerErrorToast(message: string) {
  const now = Date.now();
  const lastShownAt = recentGlobalErrors.get(message) ?? 0;

  if (now - lastShownAt < GLOBAL_SERVER_ERROR_THROTTLE_MS) {
    return false;
  }

  recentGlobalErrors.set(message, now);

  if (recentGlobalErrors.size > 40) {
    for (const [entryMessage, shownAt] of recentGlobalErrors.entries()) {
      if (now - shownAt >= GLOBAL_SERVER_ERROR_THROTTLE_MS * 3) {
        recentGlobalErrors.delete(entryMessage);
      }
    }
  }

  return true;
}

function logApiErrorInDevelopment(error: unknown, metadata?: RequestMetadata) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.error("[api]", {
    error,
    path: metadata?.path
  });
}

function queuePendingToastForNextLoad(message: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    PENDING_TOAST_STORAGE_KEY,
    JSON.stringify({
      tone: "error",
      title: message
    })
  );
}

function handleApiErrorGlobally(error: unknown, metadata: RequestMetadata = {}) {
  if (!isApiHttpError(error)) {
    logApiErrorInDevelopment(error, metadata);
    return;
  }

  const message = parseApiError(error);
  logApiErrorInDevelopment(error, metadata);

  if (
    error.status === 401 &&
    metadata.authenticated &&
    !metadata.skipUnauthorizedRedirect &&
    typeof window !== "undefined"
  ) {
    markApiErrorAsHandled(error);
    clearStoredSession();
    queuePendingToastForNextLoad(message);

    if (window.location.pathname !== "/login") {
      window.location.assign("/login");
    }

    return;
  }

  if ((error.status ?? 0) >= 500 && !metadata.skipGlobalErrorToast) {
    if (shouldEmitGlobalServerErrorToast(message)) {
      toastError(message);
    }

    markApiErrorAsHandled(error);
  }
}

async function readJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
  metadata: RequestMetadata = {}
): Promise<T> {
  ensureApiConfigured(metadata.path);

  let response: Response;

  try {
    response = await fetch(input, {
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      },
      ...init
    });
  } catch (error) {
    const apiError = createApiHttpError({
      body: error instanceof Error ? error.message : null,
      isNetworkError: true,
      path: metadata.path
    });
    handleApiErrorGlobally(apiError, metadata);
    throw apiError;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const apiError = createApiHttpError({
      status: response.status,
      body,
      path: metadata.path
    });
    handleApiErrorGlobally(apiError, metadata);
    throw apiError;
  }

  return body as T;
}

type AuthenticatedJsonOptions = RequestInit & {
  token?: string | null;
};

export type DownloadedFile = {
  blob: Blob;
  fileName: string;
  contentType: string | null;
};

export type ListEntitiesFilters = {
  search?: string;
  active?: boolean;
  take?: number;
};

export type Customer = {
  id: string;
  name: string;
  cpfCnpj: string | null;
  email: string | null;
  phone: string;
  phone2: string | null;
  zipCode: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Supplier = {
  id: string;
  name: string;
  tradeName: string | null;
  cnpj: string | null;
  stateRegistration: string | null;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  zipCode: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  prefix: string;
  description: string | null;
  defaultSerialized: boolean;
  sequenceName: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StoreSettings = {
  id: string;
  code: string;
  name: string;
  displayName: string;
  active: boolean;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  heroBannerEnabled: boolean;
  timezone: string;
  createdAt: string;
  updatedAt: string;
};

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  store: {
    id: string;
    code: string;
    name: string;
    displayName: string;
  };
  role: {
    id: string;
    name: string;
    description: string | null;
    active: boolean;
  };
};

export type RoleRecord = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  isSystem: boolean;
  permissions: Array<{
    id: string;
    permissionKey: PermissionKey;
  }>;
  createdAt: string;
  updatedAt: string;
};

export type DashboardSummary = {
  total_sales_today: number;
  total_sales_month: number;
  total_revenue_today: number;
  total_revenue_month: number;
  total_profit_today: number;
  total_profit_month: number;
  total_orders_today: number;
  total_orders_month: number;
  average_ticket: number;
  low_stock_count: number;
  total_products: number;
  total_customers: number;
  time_zone: string;
  generated_at: string;
};

export type DashboardPeriod = "today" | "week" | "month";

export type DashboardTopProducts = {
  period: DashboardPeriod;
  generatedAt: string;
  rows: Array<{
    productId: string;
    name: string;
    internalCode: string;
    isService: boolean;
    quantitySold: number;
    revenue: number;
    estimatedProfit: number;
    lastSoldAt: string | null;
    category: ProductCategorySummary;
  }>;
};

export type DashboardLowStock = {
  generatedAt: string;
  rows: Array<{
    productId: string;
    name: string;
    internalCode: string;
    supplierCode: string | null;
    stockMin: number;
    totalStock: number;
    deficit: number;
    lowStock: boolean;
    inventoryCostValue: number;
    inventorySaleValue: number;
    category: ProductCategorySummary;
    supplier: ProductSupplierSummary | null;
    balances: Array<{
      id: string;
      quantity: number;
      updatedAt: string;
      location: {
        id: string;
        name: string;
        isDefault: boolean;
        active: boolean;
      };
    }>;
  }>;
};

export type DashboardSalesChart = {
  period: DashboardPeriod;
  timeZone: string;
  generatedAt: string;
  series: Array<{
    date: string;
    revenue: number;
    profit: number;
    orders: number;
    itemsSold: number;
  }>;
};

export type CashTerminal = {
  id: string;
  storeId: string;
  name: string;
  active: boolean;
  createdAt: string;
  store: {
    id: string;
    code: string;
    name: string;
    displayName: string;
  };
};

export type CashMovement = {
  id: string;
  cashSessionId: string;
  movementType:
    | "OPENING"
    | "SALE"
    | "SUPPLY"
    | "WITHDRAWAL"
    | "CLOSING"
    | "REFUND";
  amount: number;
  paymentMethod: "CASH" | "PIX" | "DEBIT" | "CREDIT" | "STORE_CREDIT" | null;
  referenceType: string | null;
  referenceId: string | null;
  description: string | null;
  userId: string | null;
  createdAt: string;
};

export type CashSessionSaleSummary = {
  id: string;
  saleNumber: string;
  total: number;
  status: string;
  completedAt: string;
};

export type CashSession = {
  id: string;
  cashTerminalId: string;
  openedBy: string | null;
  closedBy: string | null;
  status: "OPEN" | "CLOSED";
  openingAmount: number;
  expectedAmount: number | null;
  closingAmount: number | null;
  difference: number | null;
  openedAt: string;
  closedAt: string | null;
  notes: string | null;
  calculatedExpectedAmount: number;
  cashOnHand: number;
  isBalanced: boolean | null;
  movementSummary: {
    opening: number;
    salesCash: number;
    supplies: number;
    withdrawals: number;
    closingRegistered: number;
    refundsCash: number;
  };
  cashTerminal: CashTerminal;
  openedByUser: { id: string; name: string; email: string } | null;
  closedByUser: { id: string; name: string; email: string } | null;
  movements: CashMovement[];
  sales: CashSessionSaleSummary[];
};

export type ProductCategorySummary = {
  id: string;
  name: string;
  prefix: string;
  sequenceName: string;
  defaultSerialized: boolean;
};

export type ProductSupplierSummary = {
  id: string;
  name: string;
  tradeName: string | null;
};

export type ProductCodeTypeName =
  | "INTERNAL_BARCODE"
  | "MANUFACTURER_BARCODE"
  | "EAN13"
  | "CODE128"
  | "IMEI"
  | "SERIAL";

export type ProductCodeScopeName = "PRODUCT" | "UNIT";

export type ProductCode = {
  id: string;
  code: string;
  codeType: ProductCodeTypeName;
  scope: ProductCodeScopeName;
  isPrimary: boolean;
  createdAt: string;
};

export type ProductBarcodeSummary = {
  id: string;
  code: string;
  codeType: ProductCodeTypeName;
  isPrimary: boolean;
  barcodeFormat: "CODE128";
  source: "store" | "primary" | "alternate";
};

export type ProductUnitSummary = {
  totalUnits: number;
  inStockUnits: number;
  soldUnits: number;
  reservedUnits: number;
  damagedUnits: number;
};

export type Product = {
  id: string;
  categoryId: string;
  supplierId: string | null;
  name: string;
  description: string | null;
  brand: string | null;
  model: string | null;
  imageUrl: string | null;
  internalCode: string;
  supplierCode: string | null;
  ncm: string | null;
  cest: string | null;
  cfopDefault: string | null;
  originCode: string | null;
  taxCategory: string | null;
  taxNotes: string | null;
  costPrice: number;
  salePrice: number;
  stockMin: number;
  hasSerialControl: boolean;
  needsPriceReview: boolean;
  isService: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  category: ProductCategorySummary;
  supplier: ProductSupplierSummary | null;
  codes: ProductCode[];
  storeBarcode: ProductBarcodeSummary | null;
  primaryBarcode: ProductBarcodeSummary | null;
  displayBarcode: ProductBarcodeSummary | null;
  unitSummary: ProductUnitSummary;
};

export type StockLocation = {
  id: string;
  storeId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  active: boolean;
  createdAt: string;
  balanceSummary: {
    trackedProducts: number;
    totalQuantity: number;
  };
};

export type InventoryBalanceRow = {
  id: string;
  name: string;
  internalCode: string;
  supplierCode: string | null;
  active: boolean;
  hasSerialControl: boolean;
  stockMin: number;
  totalStock: number;
  lowStock: boolean;
  category: ProductCategorySummary;
  supplier: ProductSupplierSummary | null;
  balances: Array<{
    id: string;
    quantity: number;
    updatedAt: string | null;
    location: {
      id: string;
      name: string;
      isDefault: boolean;
      active: boolean;
    };
  }>;
};

export type StockMovementTypeName =
  | "ENTRY"
  | "EXIT"
  | "ADJUSTMENT"
  | "SALE"
  | "RETURN"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export type InventoryMovement = {
  id: string;
  productId: string;
  productUnitId: string | null;
  locationId: string;
  movementType: StockMovementTypeName;
  quantity: number;
  unitCost: number | null;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  userId: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    internalCode: string;
    supplierCode: string | null;
    isService: boolean;
  };
  location: {
    id: string;
    name: string;
    isDefault: boolean;
    active: boolean;
  };
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
};

export type InventoryBalanceSnapshot = {
  product: {
    id: string;
    name: string;
    internalCode: string;
    supplierCode: string | null;
    stockMin: number;
    hasSerialControl: boolean;
    category: ProductCategorySummary;
    supplier: ProductSupplierSummary | null;
  };
  location: {
    id: string;
    name: string;
    isDefault: boolean;
    active: boolean;
  };
  currentQuantity: number;
  totalStock: number;
  lowStock: boolean;
};

export type InventoryEntryResult = {
  referenceId: string;
  previousQuantity: number;
  currentQuantity: number;
  totalStock: number;
  snapshot: InventoryBalanceSnapshot;
};

export type InventoryAdjustmentResult = {
  referenceId: string;
  previousQuantity: number;
  currentQuantity: number;
  delta: number;
  totalStock: number;
  snapshot: InventoryBalanceSnapshot;
};

export type InventoryTransferResult = {
  referenceId: string;
  quantity: number;
  fromPreviousQuantity: number;
  fromCurrentQuantity: number;
  toPreviousQuantity: number;
  toCurrentQuantity: number;
  fromSnapshot: InventoryBalanceSnapshot;
  toSnapshot: InventoryBalanceSnapshot;
};

export type InventoryProductUnit = {
  id: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
  purchasePrice: number | null;
  unitStatus: "IN_STOCK" | "SOLD" | "RESERVED" | "DAMAGED";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    internalCode: string;
    supplierCode: string | null;
    imageUrl: string | null;
    hasSerialControl: boolean;
    costPrice: number;
  };
  supplier: ProductSupplierSummary | null;
  currentLocation: {
    id: string;
    name: string;
    isDefault: boolean;
    active: boolean;
  } | null;
};

export type InventoryProductUnitsListFilters = {
  search?: string;
  productId?: string;
  locationId?: string;
  status?: "IN_STOCK" | "SOLD" | "RESERVED" | "DAMAGED";
  take?: number;
};

export type CreateInventoryProductUnitsPayload = {
  productId: string;
  locationId: string;
  purchasePrice?: number;
  notes?: string;
  units: Array<{
    imei?: string;
    imei2?: string;
    serialNumber?: string;
    notes?: string;
  }>;
};

export type UpdateInventoryProductUnitPayload = {
  imei?: string;
  imei2?: string;
  serialNumber?: string;
  supplierId?: string | null;
  purchasePrice?: number | null;
  unitStatus?: "IN_STOCK" | "SOLD" | "RESERVED" | "DAMAGED";
  notes?: string | null;
};

export type TransferInventoryProductUnitPayload = {
  toLocationId: string;
  notes?: string;
};

export type InventoryProductUnitsEntryResult = {
  referenceId: string;
  units: InventoryProductUnit[];
  snapshot: InventoryBalanceSnapshot;
};

export type InventoryProductUnitTransferResult = {
  referenceId: string;
  unit: InventoryProductUnit;
};

export type CreateCustomerPayload = {
  name: string;
  cpfCnpj?: string;
  email?: string;
  phone: string;
  phone2?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
};

export type UpdateCustomerPayload = Partial<CreateCustomerPayload> & {
  active?: boolean;
};

export type CreateSupplierPayload = {
  name: string;
  tradeName?: string;
  cnpj?: string;
  stateRegistration?: string;
  email?: string;
  phone?: string;
  contactName?: string;
  zipCode?: string;
  address?: string;
  city?: string;
  state?: string;
  notes?: string;
};

export type UpdateSupplierPayload = Partial<CreateSupplierPayload> & {
  active?: boolean;
};

export type CreateCategoryPayload = {
  name: string;
  prefix: string;
  description?: string;
  defaultSerialized?: boolean;
  sequenceName: string;
};

export type UpdateCategoryPayload = Partial<CreateCategoryPayload> & {
  active?: boolean;
};

export type UpdateStoreSettingsPayload = {
  name?: string;
  displayName?: string;
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  logoUrl?: string;
  bannerUrl?: string;
  heroBannerEnabled?: boolean;
};

export type ListUsersFilters = {
  search?: string;
  active?: boolean;
  storeId?: string;
  roleId?: string;
  take?: number;
};

export type CreateUserPayload = {
  name: string;
  email: string;
  phone?: string;
  roleId: string;
  storeId?: string;
  password: string;
  mustChangePassword?: boolean;
};

export type UpdateUserPayload = Partial<
  Omit<CreateUserPayload, "password">
>;

export type ChangeUserPasswordPayload = {
  newPassword: string;
  mustChangePassword?: boolean;
};

export type ListProductsFilters = {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  brand?: string;
  active?: boolean;
  isService?: boolean;
  take?: number;
};

export type ListStockLocationsFilters = {
  search?: string;
  active?: boolean;
  take?: number;
};

export type ListInventoryBalancesFilters = {
  search?: string;
  productId?: string;
  locationId?: string;
  active?: boolean;
  lowStockOnly?: boolean;
  take?: number;
};

export type ListInventoryMovementsFilters = {
  search?: string;
  productId?: string;
  locationId?: string;
  movementType?: StockMovementTypeName;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type ListInventoryUnitsFilters = InventoryProductUnitsListFilters;

export type CreateProductPayload = {
  categoryId: string;
  supplierId?: string;
  name: string;
  description?: string;
  brand?: string;
  model?: string;
  supplierCode?: string;
  costPrice: number;
  salePrice: number;
  stockMin: number;
  hasSerialControl?: boolean;
  needsPriceReview?: boolean;
  isService?: boolean;
  active?: boolean;
};

export type UpdateProductPayload = Partial<CreateProductPayload>;

export type ProductCodeEditorType = Extract<
  ProductCodeTypeName,
  "INTERNAL_BARCODE" | "MANUFACTURER_BARCODE" | "EAN13" | "CODE128"
>;

export type CreateProductCodePayload = {
  code: string;
  codeType: ProductCodeEditorType;
  isPrimary?: boolean;
};

export type UpdateProductCodePayload = Partial<CreateProductCodePayload>;

export type ProductBarcodeInfo = {
  productId: string;
  internalCode: string;
  productName: string;
  storeBarcode: ProductBarcodeSummary | null;
  primaryBarcode: ProductBarcodeSummary | null;
  displayBarcode: ProductBarcodeSummary | null;
};

export type ProductLabelPreviewItem = {
  productId: string;
  quantity: number;
  productName: string;
  shortName: string;
  internalCode: string;
  supplierCode: string | null;
  salePrice: number;
  imageUrl: string | null;
  barcode: ProductBarcodeSummary & {
    humanReadableCode: string;
  };
};

export type ProductLabelsPreview = {
  items: ProductLabelPreviewItem[];
  includePrice: boolean;
  totalLabels: number;
};

export type ProductLabelsPreviewPayload = {
  items: Array<{
    productId: string;
    quantity: number;
  }>;
  includePrice?: boolean;
};

export type CreateStockLocationPayload = {
  name: string;
  description?: string;
  isDefault?: boolean;
  active?: boolean;
};

export type UpdateStockLocationPayload = Partial<CreateStockLocationPayload>;

export type CreateInventoryEntryPayload = {
  productId: string;
  locationId: string;
  quantity: number;
  unitCost?: number;
  notes?: string;
};

export type CreateInventoryAdjustmentPayload = {
  productId: string;
  locationId: string;
  countedQuantity: number;
  reason: string;
};

export type CreateInventoryTransferPayload = {
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  notes?: string;
};

export type OpenCashSessionPayload = {
  cashTerminalId: string;
  openingAmount: number;
  notes?: string;
};

export type CreateCashTerminalPayload = {
  name: string;
};

export type UpdateCashTerminalPayload = {
  name?: string;
};

export type CashAmountPayload = {
  cashSessionId: string;
  amount: number;
  description?: string;
};

export type CloseCashSessionPayload = {
  cashSessionId: string;
  closingAmount: number;
  notes?: string;
};

export type PaymentMethodName =
  | "CASH"
  | "PIX"
  | "DEBIT"
  | "CREDIT"
  | "STORE_CREDIT";

export type PdvProductResult = {
  id: string;
  name: string;
  internalCode: string;
  supplierCode: string | null;
  imageUrl: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  salePrice: number;
  costPrice: number;
  active: boolean;
  isService: boolean;
  hasSerialControl: boolean;
  stockMin: number;
  matchedBy: "search" | "barcode" | "internal_code" | "supplier_code" | "imei";
  totalStock: number;
  category: {
    id: string;
    name: string;
    prefix: string;
  };
  supplier: ProductSupplierSummary | null;
  balances: Array<{
    id: string;
    quantity: number;
    location: {
      id: string;
      name: string;
      isDefault: boolean;
    };
  }>;
  availableUnits: Array<{
    id: string;
    imei: string | null;
    imei2: string | null;
    serialNumber: string | null;
    unitStatus: "IN_STOCK" | "SOLD" | "RESERVED" | "DAMAGED";
    currentLocation: {
      id: string;
      name: string;
      isDefault: boolean;
      active: boolean;
    } | null;
  }>;
  selectedUnit: {
    id: string;
    imei: string | null;
    imei2: string | null;
    serialNumber: string | null;
    currentLocation: {
      id: string;
      name: string;
      isDefault: boolean;
      active: boolean;
    } | null;
  } | null;
};

export type CheckoutSaleItemPayload = {
  productId: string;
  productUnitId?: string;
  stockLocationId?: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
};

export type CheckoutSalePaymentPayload = {
  method: PaymentMethodName;
  amount: number;
  installments?: number;
  referenceCode?: string;
};

export type CheckoutSalePayload = {
  customerId?: string;
  cashSessionId: string;
  items: CheckoutSaleItemPayload[];
  payments: CheckoutSalePaymentPayload[];
  discountAmount: number;
  notes?: string;
};

export type ScannerSessionState = {
  id: string;
  storeId: string;
  storeCode: string;
  storeDisplayName: string;
  cashSessionId: string;
  cashTerminalId: string;
  cashTerminalName: string;
  desktopUserId: string | null;
  pairingCode: string;
  status: ScannerSessionStatus;
  desktopConnected: boolean;
  scannerConnected: boolean;
  connectedDesktopAt: string | null;
  connectedScannerAt: string | null;
  lastReadAt: string | null;
  expiresAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateScannerSessionPayload = {
  cashSessionId: string;
};

export type CreateScannerSessionResult = {
  session: ScannerSessionState;
  pairingToken: string;
  desktopSocketToken: string;
};

export type PairScannerSessionPayload = {
  sessionId?: string;
  pairingCode?: string;
  pairingToken?: string;
};

export type PairScannerSessionResult = {
  session: ScannerSessionState;
  scannerSocketToken: string;
};

export type SaleListItem = {
  id: string;
  saleNumber: string;
  receiptNumber: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  status: "COMPLETED" | "CANCELED" | "REFUNDED";
  fiscalStatus:
    | "NOT_REQUIRED"
    | "PENDING"
    | "QUEUED"
    | "PROCESSING"
    | "AUTHORIZED"
    | "REJECTED"
    | "CANCELED"
    | "OFFLINE_PENDING"
    | "ERROR";
  completedAt: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  cashSession: {
    id: string;
    status: "OPEN" | "CLOSED";
    cashTerminal: {
      id: string;
      name: string;
    };
  };
  fiscalDocument: {
    id: string;
    documentType: string;
    status: string;
    accessKey: string | null;
    receiptNumber: string | null;
  } | null;
  _count: {
    items: number;
    payments: number;
  };
};

export type SaleDetail = {
  id: string;
  saleNumber: string;
  receiptNumber: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  status: "COMPLETED" | "CANCELED" | "REFUNDED";
  fiscalStatus:
    | "NOT_REQUIRED"
    | "PENDING"
    | "QUEUED"
    | "PROCESSING"
    | "AUTHORIZED"
    | "REJECTED"
    | "CANCELED"
    | "OFFLINE_PENDING"
    | "ERROR";
  notes: string | null;
  completedAt: string;
  createdAt: string;
  updatedAt: string;
  store: {
    id: string;
    code: string;
    name: string;
    displayName: string;
  };
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  cashSession: {
    id: string;
    status: "OPEN" | "CLOSED";
    openedAt: string;
    cashTerminal: {
      id: string;
      name: string;
    };
  };
  items: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    discountAmount: number;
    totalPrice: number;
    product: {
      id: string;
      name: string;
      internalCode: string;
      supplierCode: string | null;
      imageUrl: string | null;
      isService: boolean;
      hasSerialControl: boolean;
    };
    productUnit: {
      id: string;
      imei: string | null;
      imei2: string | null;
      serialNumber: string | null;
    } | null;
  }>;
  payments: Array<{
    id: string;
    method: PaymentMethodName;
    amount: number;
    installments: number | null;
    referenceCode: string | null;
    createdAt: string;
  }>;
  refunds: Array<{
    id: string;
    reason: string;
    amount: number;
    createdAt: string;
  }>;
  fiscalDocument: {
    id: string;
    documentType: string;
    status: string;
    accessKey: string | null;
    receiptNumber: string | null;
    protocolNumber: string | null;
    authorizationMessage: string | null;
    rejectionCode: string | null;
    rejectionMessage: string | null;
    issuedAt: string | null;
    authorizedAt: string | null;
    canceledAt: string | null;
  } | null;
};

export type FiscalDocumentRecord = {
  id: string;
  saleId: string;
  storeId: string;
  documentType: "NFCE" | "NFE" | "RECEIPT" | "SERVICE_RECEIPT";
  status:
    | "PENDING"
    | "QUEUED"
    | "PROCESSING"
    | "AUTHORIZED"
    | "REJECTED"
    | "CANCELED"
    | "VOIDED"
    | "OFFLINE_PENDING"
    | "ERROR";
  accessKey: string | null;
  series: string | null;
  number: string | null;
  receiptNumber: string | null;
  protocolNumber: string | null;
  authorizationMessage: string | null;
  rejectionCode: string | null;
  rejectionMessage: string | null;
  issuedAt: string | null;
  authorizedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
  sale: {
    id: string;
    saleNumber: string;
    receiptNumber: string | null;
    total: number;
    status: "COMPLETED" | "CANCELED" | "REFUNDED";
    fiscalStatus: string;
    completedAt: string;
    customer: {
      id: string;
      name: string;
      phone: string;
    } | null;
    user: {
      id: string;
      name: string;
      email: string;
    } | null;
  };
  events: Array<{
    id: string;
    eventType: string;
    description: string | null;
    payload: unknown;
    createdAt: string;
  }>;
};

export type FiscalReceiptPrintLink = {
  path: string;
  expiresAt: string;
};

export type ListFiscalDocumentsFilters = {
  search?: string;
  documentType?: "NFCE" | "NFE" | "RECEIPT" | "SERVICE_RECEIPT";
  status?:
    | "PENDING"
    | "QUEUED"
    | "PROCESSING"
    | "AUTHORIZED"
    | "REJECTED"
    | "CANCELED"
    | "VOIDED"
    | "OFFLINE_PENDING"
    | "ERROR";
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type FiscalReport = {
  generatedAt: string;
  summary: {
    totalDocuments: number;
    totalAmount: number;
    authorizedCount: number;
    canceledCount: number;
    receiptCount: number;
    serviceReceiptCount: number;
  };
  rows: FiscalDocumentRecord[];
};

export type ListSalesFilters = {
  search?: string;
  customerId?: string;
  userId?: string;
  status?: "COMPLETED" | "CANCELED" | "REFUNDED";
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type FinancialEntryStatusName =
  | "PENDING"
  | "PAID"
  | "RECEIVED"
  | "OVERDUE"
  | "CANCELED";

export type AccountsPayableEntry = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: FinancialEntryStatusName;
  paymentMethod: PaymentMethodName | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  daysUntilDue: number;
  supplier: {
    id: string;
    name: string;
    tradeName: string | null;
  } | null;
  purchaseOrder: {
    id: string;
    status: string;
    total: number;
    orderedAt: string;
  } | null;
};

export type AccountsReceivableEntry = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  receivedAt: string | null;
  status: FinancialEntryStatusName;
  paymentMethod: PaymentMethodName | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  isOverdue: boolean;
  daysUntilDue: number;
  customer: {
    id: string;
    name: string;
    phone: string;
  } | null;
  sale: {
    id: string;
    saleNumber: string;
    total: number;
    completedAt: string;
  } | null;
  serviceOrder: {
    id: string;
    status: string;
    deviceType: string;
    totalFinal: number | null;
  } | null;
};

export type ListAccountsPayableFilters = {
  search?: string;
  supplierId?: string;
  status?: FinancialEntryStatusName;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type ListAccountsReceivableFilters = {
  search?: string;
  customerId?: string;
  status?: FinancialEntryStatusName;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type CreateAccountsPayablePayload = {
  supplierId?: string;
  purchaseOrderId?: string;
  description: string;
  amount: number;
  dueDate: string;
  paymentMethod?: PaymentMethodName;
  notes?: string;
};

export type UpdateAccountsPayablePayload = Partial<CreateAccountsPayablePayload> & {
  status?: FinancialEntryStatusName;
};

export type PayAccountsPayablePayload = {
  paymentMethod: PaymentMethodName;
  paidAt?: string;
  notes?: string;
};

export type CreateAccountsReceivablePayload = {
  customerId?: string;
  saleId?: string;
  serviceOrderId?: string;
  description: string;
  amount: number;
  dueDate: string;
  paymentMethod?: PaymentMethodName;
  notes?: string;
};

export type UpdateAccountsReceivablePayload = Partial<CreateAccountsReceivablePayload> & {
  status?: FinancialEntryStatusName;
};

export type ReceiveAccountsReceivablePayload = {
  paymentMethod: PaymentMethodName;
  receivedAt?: string;
  notes?: string;
};

export type FinancialSummary = {
  period: "today" | "week" | "month";
  generatedAt: string;
  totals: {
    payablePending: number;
    receivablePending: number;
    predictedBalance: number;
    currentCash: number;
  };
  charts: {
    cashFlow: Array<{
      date: string;
      inflow: number;
      outflow: number;
    }>;
    cashEvolution: Array<{
      date: string;
      balance: number;
    }>;
  };
  currentCashReference: {
    source: "open_session" | "last_closed_session";
    sessionId: string;
    terminalName: string;
    updatedAt: string | null;
  } | null;
  upcoming: {
    payables: AccountsPayableEntry[];
    receivables: AccountsReceivableEntry[];
  };
};

export type ServiceOrderStatusName =
  | "OPEN"
  | "WAITING_APPROVAL"
  | "APPROVED"
  | "IN_PROGRESS"
  | "WAITING_PARTS"
  | "READY_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELED"
  | "REJECTED";

export type ServiceOrderItemTypeName = "PART" | "SERVICE" | "MANUAL_ITEM";

export type ServiceOrderQuoteStatusName = "PENDING" | "APPROVED" | "REJECTED";

export type ServiceOrderAttachment = {
  id: string;
  fileName: string;
  fileType: string;
  url: string;
  createdAt: string;
};

export type ServiceOrderReceiptFormat = "a4" | "thermal";

export type ServiceOrderReceiptPrintLink = {
  path: string;
  expiresAt: string;
};

export type ServiceOrderListItem = {
  id: string;
  orderNumber: string;
  status: ServiceOrderStatusName;
  deviceType: string;
  brand: string;
  model: string;
  imei: string | null;
  serialNumber: string | null;
  reportedIssue: string;
  totalEstimated: number;
  totalFinal: number | null;
  estimatedCompletionDate: string | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    phone: string;
  };
  assignedToUser: {
    id: string;
    name: string;
    email: string;
  } | null;
  _count: {
    items: number;
    statusHistory: number;
  };
};

export type ServiceOrder = {
  id: string;
  orderNumber: string;
  storeId: string;
  customerId: string;
  createdByUserId: string;
  assignedToUserId: string | null;
  relatedSaleId: string | null;
  status: ServiceOrderStatusName;
  deviceType: string;
  brand: string;
  model: string;
  imei: string | null;
  imei2: string | null;
  serialNumber: string | null;
  color: string | null;
  accessories: string | null;
  reportedIssue: string;
  foundIssue: string | null;
  technicalNotes: string | null;
  estimatedCompletionDate: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  deliveredAt: string | null;
  totalEstimated: number;
  totalFinal: number | null;
  createdAt: string;
  updatedAt: string;
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  };
  createdByUser: {
    id: string;
    name: string;
    email: string;
  };
  assignedToUser: {
    id: string;
    name: string;
    email: string;
  } | null;
  relatedSale: {
    id: string;
    saleNumber: string;
    receiptNumber: string | null;
    total: number;
    completedAt: string;
  } | null;
  items: Array<{
    id: string;
    itemType: ServiceOrderItemTypeName;
    productId: string | null;
    productUnitId: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    stockConsumed: boolean;
    createdAt: string;
    product: {
      id: string;
      name: string;
      internalCode: string;
      isService: boolean;
      hasSerialControl: boolean;
      costPrice: number;
    } | null;
    productUnit: {
      id: string;
      imei: string | null;
      imei2: string | null;
      serialNumber: string | null;
      unitStatus: "IN_STOCK" | "SOLD" | "RESERVED" | "DAMAGED";
    } | null;
  }>;
  statusHistory: Array<{
    id: string;
    oldStatus: ServiceOrderStatusName | null;
    newStatus: ServiceOrderStatusName;
    notes: string | null;
    createdAt: string;
    changedByUser: {
      id: string;
      name: string;
      email: string;
    } | null;
  }>;
};

export type PurchaseOrderStatusName =
  | "DRAFT"
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELED";

export type PurchaseOrderListItem = {
  id: string;
  orderNumber: string;
  supplierId: string;
  status: PurchaseOrderStatusName;
  subtotal: number;
  discountAmount: number;
  total: number;
  orderedAt: string;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: {
    id: string;
    name: string;
    tradeName: string | null;
  };
  _count: {
    items: number;
    accountsPayable: number;
  };
};

export type PurchaseOrder = {
  id: string;
  orderNumber: string;
  supplierId: string;
  createdByUserId: string | null;
  status: PurchaseOrderStatusName;
  notes: string | null;
  subtotal: number;
  discountAmount: number;
  total: number;
  orderedAt: string;
  receivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  supplier: {
    id: string;
    name: string;
    tradeName: string | null;
    phone: string | null;
    email: string | null;
  };
  createdByUser: {
    id: string;
    name: string;
    email: string;
  } | null;
  accountsPayable: Array<{
    id: string;
    description: string;
    amount: number;
    dueDate: string;
    status: FinancialEntryStatusName;
  }>;
  items: Array<{
    id: string;
    productId: string;
    description: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
    receivedQuantity: number;
    product: {
      id: string;
      name: string;
      internalCode: string;
      hasSerialControl: boolean;
      costPrice: number;
      active: boolean;
      isService: boolean;
    };
  }>;
};

export type RefundTypeName =
  | "CASH"
  | "STORE_CREDIT"
  | "EXCHANGE"
  | "PIX"
  | "CARD_REVERSAL";

export type SaleReturnListItem = {
  id: string;
  saleId: string;
  customerId: string | null;
  returnNumber: string;
  reason: string;
  refundType: RefundTypeName;
  totalAmount: number;
  createdAt: string;
  sale: {
    id: string;
    saleNumber: string;
    receiptNumber: string | null;
    status: "COMPLETED" | "CANCELED" | "REFUNDED";
    total: number;
  };
  customer: {
    id: string;
    name: string;
    phone: string;
  } | null;
  _count: {
    items: number;
  };
};

export type SaleReturn = {
  id: string;
  saleId: string;
  customerId: string | null;
  returnNumber: string;
  reason: string;
  refundType: RefundTypeName;
  totalAmount: number;
  createdByUserId: string | null;
  createdAt: string;
  sale: {
    id: string;
    saleNumber: string;
    receiptNumber: string | null;
    status: "COMPLETED" | "CANCELED" | "REFUNDED";
    total: number;
    completedAt: string;
    cashSessionId: string | null;
  };
  customer: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
  } | null;
  createdByUser: {
    id: string;
    name: string;
    email: string;
  } | null;
  items: Array<{
    id: string;
    saleItemId: string;
    quantity: number;
    returnToStock: boolean;
    amount: number;
    createdAt: string;
    saleItem: {
      id: string;
      quantity: number;
      unitPrice: number;
      discountAmount: number;
      totalPrice: number;
      product: {
        id: string;
        name: string;
        internalCode: string;
        isService: boolean;
        hasSerialControl: boolean;
        costPrice: number;
      };
      productUnit: {
        id: string;
        imei: string | null;
        imei2: string | null;
        serialNumber: string | null;
        unitStatus: "IN_STOCK" | "SOLD" | "RESERVED" | "DAMAGED";
      } | null;
    };
  }>;
};

export type ListServiceOrdersFilters = {
  search?: string;
  status?: ServiceOrderStatusName;
  customerId?: string;
  assignedToUserId?: string;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type CreateServiceOrderPayload = {
  customerId: string;
  assignedToUserId?: string;
  relatedSaleId?: string;
  deviceType: string;
  brand: string;
  model: string;
  imei?: string;
  imei2?: string;
  serialNumber?: string;
  color?: string;
  accessories?: string;
  reportedIssue: string;
  foundIssue?: string;
  technicalNotes?: string;
  estimatedCompletionDate?: string;
  totalFinal?: number;
  items?: Array<{
    itemType: ServiceOrderItemTypeName;
    productId?: string;
    productUnitId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
};

export type UpdateServiceOrderPayload = Partial<CreateServiceOrderPayload>;

export type ChangeServiceOrderStatusPayload = {
  status: ServiceOrderStatusName;
  notes?: string;
  totalFinal?: number;
};

export type ConsumeServiceOrderItemPayload = {
  locationId?: string;
};

export type ServiceOrderQuote = {
  id: string;
  serviceOrderId: string;
  subtotal: number;
  discountAmount: number;
  total: number;
  status: ServiceOrderQuoteStatusName;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    id: string;
    quoteId: string;
    productId: string | null;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    itemType: ServiceOrderItemTypeName;
    createdAt: string;
    updatedAt: string;
    product: {
      id: string;
      name: string;
      internalCode: string;
      isService: boolean;
    } | null;
  }>;
};

export type CreateServiceOrderQuotePayload = {
  notes?: string;
  items: Array<{
    itemType: ServiceOrderItemTypeName;
    productId?: string;
    description: string;
    quantity: number;
    unitPrice: number;
  }>;
};

export type UpdateServiceOrderQuotePayload = Partial<CreateServiceOrderQuotePayload>;

type UploadProgressCallback = (progress: number) => void;

export type ListPurchaseOrdersFilters = {
  search?: string;
  status?: PurchaseOrderStatusName;
  supplierId?: string;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type CreatePurchaseOrderPayload = {
  supplierId: string;
  notes?: string;
  discountAmount?: number;
  items: Array<{
    productId: string;
    description: string;
    quantity: number;
    unitCost: number;
  }>;
};

export type UpdatePurchaseOrderPayload = Partial<CreatePurchaseOrderPayload>;

export type ChangePurchaseOrderStatusPayload = {
  status: PurchaseOrderStatusName;
};

export type ReceivePurchaseOrderPayload = {
  items: Array<{
    purchaseOrderItemId: string;
    locationId: string;
    quantity?: number;
    units?: Array<{
      imei?: string;
      imei2?: string;
      serialNumber?: string;
      notes?: string;
    }>;
  }>;
};

export type ListSaleReturnsFilters = {
  search?: string;
  saleId?: string;
  customerId?: string;
  refundType?: RefundTypeName;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type CreateSaleReturnPayload = {
  saleId: string;
  reason: string;
  refundType: RefundTypeName;
  items: Array<{
    saleItemId: string;
    quantity: number;
    amount: number;
    returnToStock: boolean;
    locationId?: string;
  }>;
};

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];

export type AuditLogEntry = {
  id: string;
  storeId: string | null;
  userId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  oldData: JsonValue | null;
  newData: JsonValue | null;
  metadata: JsonValue | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    name: string;
    email: string;
  } | null;
  store: {
    id: string;
    code: string;
    name: string;
    displayName: string;
  } | null;
};

export type ListAuditFilters = {
  search?: string;
  action?: string;
  entity?: string;
  storeId?: string;
  userId?: string;
  take?: number;
};

export type DashboardInsightFilters = {
  period?: DashboardPeriod;
  take?: number;
};

export type SalesReportFilters = {
  search?: string;
  customerId?: string;
  userId?: string;
  status?: "COMPLETED" | "CANCELED" | "REFUNDED";
  paymentMethod?: PaymentMethodName;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type SalesReport = {
  generatedAt: string;
  timeZone: string;
  summary: {
    orderCount: number;
    totalRevenue: number;
    totalDiscount: number;
    totalProfit: number;
    totalItemsSold: number;
    totalCanceled: number;
    averageTicket: number;
  };
  charts: {
    dailyRevenue: Array<{
      date: string;
      revenue: number;
      profit: number;
      orders: number;
      itemsSold: number;
    }>;
  };
  topProducts: Array<{
    productId: string;
    name: string;
    internalCode: string;
    quantitySold: number;
    revenue: number;
    category: ProductCategorySummary;
  }>;
  rows: Array<{
    id: string;
    saleNumber: string;
    receiptNumber: string | null;
    status: "COMPLETED" | "CANCELED" | "REFUNDED";
    fiscalStatus: string;
    completedAt: string;
    subtotal: number;
    discountAmount: number;
    total: number;
    estimatedProfit: number;
    itemCount: number;
    paymentCount: number;
    paymentMethods: PaymentMethodName[];
    customer: {
      id: string;
      name: string;
      phone: string;
    } | null;
    user: {
      id: string;
      name: string;
      email: string;
    } | null;
    cashTerminal: {
      id: string;
      name: string;
    };
  }>;
};

export type StockReportFilters = {
  search?: string;
  categoryId?: string;
  supplierId?: string;
  locationId?: string;
  active?: boolean;
  lowStockOnly?: boolean;
  take?: number;
};

export type StockReport = {
  generatedAt: string;
  summary: {
    trackedProducts: number;
    totalQuantity: number;
    totalCostValue: number;
    totalSaleValue: number;
    lowStockCount: number;
  };
  charts: {
    categoryBreakdown: Array<{
      categoryId: string;
      name: string;
      totalQuantity: number;
      inventoryValue: number;
    }>;
  };
  rows: Array<{
    productId: string;
    name: string;
    internalCode: string;
    supplierCode: string | null;
    active: boolean;
    brand: string | null;
    model: string | null;
    costPrice: number;
    salePrice: number;
    stockMin: number;
    totalStock: number;
    lowStock: boolean;
    inventoryCostValue: number;
    inventorySaleValue: number;
    category: ProductCategorySummary;
    supplier: ProductSupplierSummary | null;
    balances: Array<{
      id: string;
      quantity: number;
      location: {
        id: string;
        name: string;
        isDefault: boolean;
        active: boolean;
      };
    }>;
  }>;
};

export type CashReportFilters = {
  cashTerminalId?: string;
  sessionStatus?: "OPEN" | "CLOSED";
  movementType?: CashMovement["movementType"];
  paymentMethod?: PaymentMethodName;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type CashReport = {
  generatedAt: string;
  timeZone: string;
  summary: {
    sessionCount: number;
    openSessionCount: number;
    movementCount: number;
    totalInflow: number;
    totalOutflow: number;
    netCashFlow: number;
    totalSalesCash: number;
    totalSupplies: number;
    totalWithdrawals: number;
    totalRefundsCash: number;
    totalClosingRegistered: number;
    closingDifferenceTotal: number;
  };
  charts: {
    dailyFlow: Array<{
      date: string;
      inflow: number;
      outflow: number;
      net: number;
    }>;
  };
  sessions: Array<{
    id: string;
    status: "OPEN" | "CLOSED";
    openedAt: string;
    closedAt: string | null;
    openingAmount: number;
    expectedAmount: number | null;
    closingAmount: number | null;
    difference: number | null;
    terminal: {
      id: string;
      name: string;
    };
    openedByUser: {
      id: string;
      name: string;
      email: string;
    } | null;
    salesCount: number;
    salesTotal: number;
    movementCount: number;
    inflow: number;
    outflow: number;
    netFlow: number;
  }>;
  movements: Array<{
    id: string;
    sessionId: string;
    sessionStatus: "OPEN" | "CLOSED";
    terminal: {
      id: string;
      name: string;
    };
    movementType: CashMovement["movementType"];
    paymentMethod: PaymentMethodName | null;
    amount: number;
    description: string | null;
    referenceType: string | null;
    referenceId: string | null;
    createdAt: string;
    user: {
      id: string;
      name: string;
      email: string;
    } | null;
  }>;
};

export type CustomerReportFilters = {
  search?: string;
  active?: boolean;
  city?: string;
  state?: string;
  startDate?: string;
  endDate?: string;
  take?: number;
};

export type CustomerReport = {
  generatedAt: string;
  summary: {
    totalCustomers: number;
    activeCustomers: number;
    customersWithSales: number;
    totalRevenue: number;
    totalOrders: number;
    averageTicket: number;
    openReceivables: number;
    overdueReceivables: number;
  };
  charts: {
    topCustomers: Array<{
      customerId: string;
      name: string;
      totalRevenue: number;
      orderCount: number;
    }>;
  };
  rows: Array<{
    id: string;
    name: string;
    cpfCnpj: string | null;
    email: string | null;
    phone: string;
    city: string | null;
    state: string | null;
    active: boolean;
    orderCount: number;
    totalRevenue: number;
    averageTicket: number;
    lastPurchaseAt: string | null;
    openReceivables: number;
    overdueReceivables: number;
  }>;
};

export type CommissionPeriodFilters = {
  month?: number;
  year?: number;
};

export type CommissionRecord = {
  commissionId: string;
  commissionType: string;
  commissionValue: number;
  createdAt: string;
  sale: {
    id: string;
    saleNumber: string;
    total: number;
    completedAt: string;
    status: "COMPLETED" | "CANCELED" | "REFUNDED";
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
};

export type MyCommissionSummary = {
  generatedAt: string;
  timeZone: string;
  periodMonth: number;
  periodYear: number;
  summary: {
    totalCommission: number;
    totalSold: number;
    targetAmount: number;
    achievementPercent: number;
  };
  rows: CommissionRecord[];
};

export type TeamCommissionSummary = {
  generatedAt: string;
  timeZone: string;
  periodMonth: number;
  periodYear: number;
  rows: Array<{
    userId: string;
    name: string;
    saleCount: number;
    totalSold: number;
    totalCommission: number;
    targetId: string | null;
    targetAmount: number;
    achievementPercent: number;
  }>;
};

export type CommissionTargetsResponse = {
  generatedAt: string;
  timeZone: string;
  periodMonth: number;
  periodYear: number;
  rows: Array<{
    targetId: string | null;
    userId: string;
    name: string;
    email: string;
    targetAmount: number;
    periodMonth: number;
    periodYear: number;
    createdAt: string | null;
  }>;
};

export type CreateCommissionPayload = {
  userId: string;
  saleId: string;
  commissionType: string;
  commissionValue: number;
};

export type UpsertCommissionTargetPayload = {
  userId: string;
  month: number;
  year: number;
  targetAmount: number;
};

function buildListQuery(filters: ListEntitiesFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildProductsQuery(filters: ListProductsFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.supplierId) {
    params.set("supplierId", filters.supplierId);
  }

  if (filters.brand?.trim()) {
    params.set("brand", filters.brand.trim());
  }

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.isService !== undefined) {
    params.set("isService", String(filters.isService));
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildStockLocationsQuery(filters: ListStockLocationsFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildInventoryBalancesQuery(filters: ListInventoryBalancesFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.productId) {
    params.set("productId", filters.productId);
  }

  if (filters.locationId) {
    params.set("locationId", filters.locationId);
  }

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.lowStockOnly !== undefined) {
    params.set("lowStockOnly", String(filters.lowStockOnly));
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildInventoryMovementsQuery(filters: ListInventoryMovementsFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.productId) {
    params.set("productId", filters.productId);
  }

  if (filters.locationId) {
    params.set("locationId", filters.locationId);
  }

  if (filters.movementType) {
    params.set("movementType", filters.movementType);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildInventoryUnitsQuery(filters: ListInventoryUnitsFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.productId) {
    params.set("productId", filters.productId);
  }

  if (filters.locationId) {
    params.set("locationId", filters.locationId);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildSalesQuery(filters: ListSalesFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.customerId) {
    params.set("customerId", filters.customerId);
  }

  if (filters.userId) {
    params.set("userId", filters.userId);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildFinancialEntriesQuery(
  filters: ListAccountsPayableFilters | ListAccountsReceivableFilters
) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if ("supplierId" in filters && filters.supplierId) {
    params.set("supplierId", filters.supplierId);
  }

  if ("customerId" in filters && filters.customerId) {
    params.set("customerId", filters.customerId);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildServiceOrdersQuery(filters: ListServiceOrdersFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.customerId) {
    params.set("customerId", filters.customerId);
  }

  if (filters.assignedToUserId) {
    params.set("assignedToUserId", filters.assignedToUserId);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function serializeServiceOrderQuotePayload(
  payload: UpdateServiceOrderQuotePayload
) {
  return {
    ...(payload.notes !== undefined ? { notes: payload.notes } : {}),
    ...(payload.items
      ? {
          items: payload.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            item_type: item.itemType,
            ...(item.productId ? { product_id: item.productId } : {})
          }))
        }
      : {})
  };
}

function buildPurchaseOrdersQuery(filters: ListPurchaseOrdersFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.supplierId) {
    params.set("supplierId", filters.supplierId);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildSaleReturnsQuery(filters: ListSaleReturnsFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.saleId) {
    params.set("saleId", filters.saleId);
  }

  if (filters.customerId) {
    params.set("customerId", filters.customerId);
  }

  if (filters.refundType) {
    params.set("refundType", filters.refundType);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildAuditQuery(filters: ListAuditFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.action?.trim()) {
    params.set("action", filters.action.trim());
  }

  if (filters.entity?.trim()) {
    params.set("entity", filters.entity.trim());
  }

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  if (filters.userId) {
    params.set("userId", filters.userId);
  }

  if (filters.take) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildFiscalDocumentsQuery(filters: ListFiscalDocumentsFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.documentType) {
    params.set("documentType", filters.documentType);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildDashboardInsightQuery(filters: DashboardInsightFilters) {
  const params = new URLSearchParams();

  if (filters.period) {
    params.set("period", filters.period);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildSalesReportQuery(
  filters: SalesReportFilters & { format?: "json" | "csv" }
) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.customerId) {
    params.set("customerId", filters.customerId);
  }

  if (filters.userId) {
    params.set("userId", filters.userId);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.paymentMethod) {
    params.set("paymentMethod", filters.paymentMethod);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  if (filters.format) {
    params.set("format", filters.format);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildSalesReportExportQuery(filters: SalesReportFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.customerId) {
    params.set("customerId", filters.customerId);
  }

  if (filters.userId) {
    params.set("userId", filters.userId);
  }

  if (filters.status) {
    params.set("status", filters.status);
  }

  if (filters.paymentMethod) {
    params.set("paymentMethod", filters.paymentMethod);
  }

  if (filters.startDate) {
    params.set("start", filters.startDate);
  }

  if (filters.endDate) {
    params.set("end", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildStockReportQuery(
  filters: StockReportFilters & { format?: "json" | "csv" }
) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.categoryId) {
    params.set("categoryId", filters.categoryId);
  }

  if (filters.supplierId) {
    params.set("supplierId", filters.supplierId);
  }

  if (filters.locationId) {
    params.set("locationId", filters.locationId);
  }

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.lowStockOnly !== undefined) {
    params.set("lowStockOnly", String(filters.lowStockOnly));
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  if (filters.format) {
    params.set("format", filters.format);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildCashReportQuery(
  filters: CashReportFilters & { format?: "json" | "csv" }
) {
  const params = new URLSearchParams();

  if (filters.cashTerminalId) {
    params.set("cashTerminalId", filters.cashTerminalId);
  }

  if (filters.sessionStatus) {
    params.set("sessionStatus", filters.sessionStatus);
  }

  if (filters.movementType) {
    params.set("movementType", filters.movementType);
  }

  if (filters.paymentMethod) {
    params.set("paymentMethod", filters.paymentMethod);
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  if (filters.format) {
    params.set("format", filters.format);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildCashReportExportQuery(filters: CashReportFilters) {
  const params = new URLSearchParams();

  if (filters.cashTerminalId) {
    params.set("cashTerminalId", filters.cashTerminalId);
  }

  if (filters.sessionStatus) {
    params.set("sessionStatus", filters.sessionStatus);
  }

  if (filters.movementType) {
    params.set("movementType", filters.movementType);
  }

  if (filters.paymentMethod) {
    params.set("paymentMethod", filters.paymentMethod);
  }

  if (filters.startDate) {
    params.set("start", filters.startDate);
  }

  if (filters.endDate) {
    params.set("end", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildCustomerReportQuery(
  filters: CustomerReportFilters & { format?: "json" | "csv" }
) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.city?.trim()) {
    params.set("city", filters.city.trim());
  }

  if (filters.state?.trim()) {
    params.set("state", filters.state.trim());
  }

  if (filters.startDate) {
    params.set("startDate", filters.startDate);
  }

  if (filters.endDate) {
    params.set("endDate", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  if (filters.format) {
    params.set("format", filters.format);
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildCommissionPeriodQuery(filters: CommissionPeriodFilters) {
  const params = new URLSearchParams();

  if (filters.month !== undefined) {
    params.set("month", String(filters.month));
  }

  if (filters.year !== undefined) {
    params.set("year", String(filters.year));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildCustomerReportExportQuery(filters: CustomerReportFilters) {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.city?.trim()) {
    params.set("city", filters.city.trim());
  }

  if (filters.state?.trim()) {
    params.set("state", filters.state.trim());
  }

  if (filters.startDate) {
    params.set("start", filters.startDate);
  }

  if (filters.endDate) {
    params.set("end", filters.endDate);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();
  return query ? `?${query}` : "";
}

async function readAuthenticatedJson<T>(
  path: string,
  { token, ...init }: AuthenticatedJsonOptions,
  metadata: Omit<RequestMetadata, "path" | "authenticated"> = {}
): Promise<T> {
  return readJson<T>(`${API_URL}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  }, {
    ...metadata,
    path,
    authenticated: Boolean(token)
  });
}

function parseDispositionFileName(disposition: string | null) {
  if (!disposition) {
    return "download.csv";
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1]);
  }

  const fallbackMatch = disposition.match(/filename=\"?([^\";]+)\"?/i);
  return fallbackMatch?.[1] ?? "download.csv";
}

async function readAuthenticatedFile(
  path: string,
  { token, ...init }: AuthenticatedJsonOptions,
  metadata: Omit<RequestMetadata, "path" | "authenticated"> = {}
): Promise<DownloadedFile> {
  ensureApiConfigured(path);

  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {})
      }
    });
  } catch (error) {
    const apiError = createApiHttpError({
      body: error instanceof Error ? error.message : null,
      isNetworkError: true,
      path
    });
    handleApiErrorGlobally(apiError, {
      ...metadata,
      path,
      authenticated: Boolean(token)
    });
    throw apiError;
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    const body = contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null);
    const apiError = createApiHttpError({
      status: response.status,
      body,
      path
    });
    handleApiErrorGlobally(apiError, {
      ...metadata,
      path,
      authenticated: Boolean(token)
    });
    throw apiError;
  }

  return {
    blob: await response.blob(),
    fileName: parseDispositionFileName(response.headers.get("content-disposition")),
    contentType: response.headers.get("content-type")
  };
}

export async function getHealth(): Promise<HealthResponse> {
  if (!IS_API_CONFIGURED) {
    return {
      status: "degraded",
      app: import.meta.env.VITE_APP_NAME?.trim() || "ALPHA TECNOLOGIA",
      timestamp: new Date().toISOString(),
      version: "0.1.0",
      database: {
        status: "down",
        message: API_CONFIGURATION_ERROR_MESSAGE
      }
    };
  }

  const payload = await readJson<unknown>(`${API_URL}/health`, undefined, {
    path: "/health"
  });
  return healthResponseSchema.parse(payload);
}

export async function getDashboardSummary(
  token: string | undefined | null
): Promise<DashboardSummary> {
  return readAuthenticatedJson<DashboardSummary>("/dashboard/summary", { token });
}

export async function getDashboardTopProducts(
  token: string | undefined | null,
  filters: DashboardInsightFilters
): Promise<DashboardTopProducts> {
  return readAuthenticatedJson<DashboardTopProducts>(
    `/dashboard/top-products${buildDashboardInsightQuery(filters)}`,
    { token }
  );
}

export async function getDashboardLowStock(
  token: string | undefined | null,
  filters: Pick<DashboardInsightFilters, "take">
): Promise<DashboardLowStock> {
  return readAuthenticatedJson<DashboardLowStock>(
    `/dashboard/low-stock${buildDashboardInsightQuery(filters)}`,
    { token }
  );
}

export async function getDashboardSalesChart(
  token: string | undefined | null,
  filters: DashboardInsightFilters
): Promise<DashboardSalesChart> {
  return readAuthenticatedJson<DashboardSalesChart>(
    `/dashboard/sales-chart${buildDashboardInsightQuery(filters)}`,
    { token }
  );
}

export async function listCashTerminals(
  token?: string | null
): Promise<CashTerminal[]> {
  return readAuthenticatedJson<CashTerminal[]>("/cash/terminals", { token });
}

export async function createCashTerminal(
  token: string | undefined | null,
  payload: CreateCashTerminalPayload
): Promise<CashTerminal> {
  return readAuthenticatedJson<CashTerminal>("/cash/terminals", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateCashTerminal(
  token: string | undefined | null,
  id: string,
  payload: UpdateCashTerminalPayload
): Promise<CashTerminal> {
  return readAuthenticatedJson<CashTerminal>(`/cash/terminals/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function updateCashTerminalActive(
  token: string | undefined | null,
  id: string,
  active: boolean
): Promise<CashTerminal> {
  return readAuthenticatedJson<CashTerminal>(`/cash/terminals/${id}/active`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ active })
  });
}

export async function getCurrentCashSession(
  token?: string | null
): Promise<CashSession> {
  return readAuthenticatedJson<CashSession>("/cash/current-session", { token });
}

export async function listCashHistory(
  token?: string | null
): Promise<CashSession[]> {
  return readAuthenticatedJson<CashSession[]>("/cash/history", { token });
}

export async function openCashSession(
  token: string | undefined | null,
  payload: OpenCashSessionPayload
): Promise<CashSession> {
  return readAuthenticatedJson<CashSession>("/cash/open", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createCashDeposit(
  token: string | undefined | null,
  payload: CashAmountPayload
): Promise<CashSession> {
  return readAuthenticatedJson<CashSession>("/cash/deposit", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createCashWithdrawal(
  token: string | undefined | null,
  payload: CashAmountPayload
): Promise<CashSession> {
  return readAuthenticatedJson<CashSession>("/cash/withdrawal", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function closeCashSession(
  token: string | undefined | null,
  payload: CloseCashSessionPayload
): Promise<CashSession> {
  return readAuthenticatedJson<CashSession>("/cash/close", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function login(payload: LoginInput): Promise<AuthSession> {
  const response = await readJson<unknown>(`${API_URL}/auth/login`, {
    method: "POST",
    body: JSON.stringify(payload)
  }, {
    path: "/auth/login",
    skipUnauthorizedRedirect: true
  });

  return authSessionSchema.parse(response);
}

export async function refreshSession(
  payload: RefreshSessionInput
): Promise<AuthSession> {
  const response = await readJson<unknown>(`${API_URL}/auth/refresh`, {
    method: "POST",
    body: JSON.stringify(payload)
  }, {
    path: "/auth/refresh",
    skipUnauthorizedRedirect: true
  });

  return authSessionSchema.parse(response);
}

export async function logoutSession(
  token: string | undefined | null,
  refreshToken: string
): Promise<{ success: boolean }> {
  return readAuthenticatedJson<{ success: boolean }>("/auth/logout", {
    token,
    method: "POST",
    body: JSON.stringify({ refreshToken })
  });
}

export async function getMe(token: string | undefined | null): Promise<AuthUser> {
  const response = await readAuthenticatedJson<unknown>("/auth/me", { token });
  return authUserSchema.parse(response);
}

export async function getCurrentStore(token?: string | null): Promise<StoreSettings> {
  return readAuthenticatedJson<StoreSettings>("/stores/current", { token });
}

export async function updateStoreSettings(
  token: string | undefined | null,
  id: string,
  payload: UpdateStoreSettingsPayload
): Promise<StoreSettings> {
  return readAuthenticatedJson<StoreSettings>(`/stores/${id}/settings`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function listUsers(
  token: string | undefined | null,
  filters: ListUsersFilters
): Promise<UserRecord[]> {
  const params = new URLSearchParams();

  if (filters.search?.trim()) {
    params.set("search", filters.search.trim());
  }

  if (filters.active !== undefined) {
    params.set("active", String(filters.active));
  }

  if (filters.storeId) {
    params.set("storeId", filters.storeId);
  }

  if (filters.roleId) {
    params.set("roleId", filters.roleId);
  }

  if (filters.take !== undefined) {
    params.set("take", String(filters.take));
  }

  const query = params.toString();

  return readAuthenticatedJson<UserRecord[]>(`/users${query ? `?${query}` : ""}`, {
    token
  });
}

export async function createUser(
  token: string | undefined | null,
  payload: CreateUserPayload
): Promise<UserRecord> {
  return readAuthenticatedJson<UserRecord>("/users", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateUser(
  token: string | undefined | null,
  id: string,
  payload: UpdateUserPayload
): Promise<UserRecord> {
  return readAuthenticatedJson<UserRecord>(`/users/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function updateUserActive(
  token: string | undefined | null,
  id: string,
  active: boolean
): Promise<UserRecord> {
  return readAuthenticatedJson<UserRecord>(`/users/${id}/active`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ active })
  });
}

export async function changeUserPassword(
  token: string | undefined | null,
  id: string,
  payload: ChangeUserPasswordPayload
): Promise<UserRecord> {
  return readAuthenticatedJson<UserRecord>(`/users/${id}/password`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function listRoles(
  token: string | undefined | null
): Promise<RoleRecord[]> {
  return readAuthenticatedJson<RoleRecord[]>("/roles", { token });
}

export async function updateRolePermissions(
  token: string | undefined | null,
  id: string,
  permissions: PermissionKey[]
): Promise<RoleRecord> {
  return readAuthenticatedJson<RoleRecord>(`/roles/${id}/permissions`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ permissions })
  });
}

export async function listCustomers(
  token: string | undefined | null,
  filters: ListEntitiesFilters
): Promise<Customer[]> {
  return readAuthenticatedJson<Customer[]>(
    `/customers${buildListQuery(filters)}`,
    { token }
  );
}

export async function getCustomer(
  token: string | undefined | null,
  id: string
): Promise<Customer> {
  return readAuthenticatedJson<Customer>(`/customers/${id}`, { token });
}

export async function createCustomer(
  token: string | undefined | null,
  payload: CreateCustomerPayload
): Promise<Customer> {
  return readAuthenticatedJson<Customer>("/customers", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateCustomer(
  token: string | undefined | null,
  id: string,
  payload: UpdateCustomerPayload
): Promise<Customer> {
  return readAuthenticatedJson<Customer>(`/customers/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deactivateCustomer(
  token: string | undefined | null,
  id: string
): Promise<Customer> {
  return readAuthenticatedJson<Customer>(`/customers/${id}`, {
    token,
    method: "DELETE"
  });
}

export async function listSuppliers(
  token: string | undefined | null,
  filters: ListEntitiesFilters
): Promise<Supplier[]> {
  return readAuthenticatedJson<Supplier[]>(
    `/suppliers${buildListQuery(filters)}`,
    { token }
  );
}

export async function createSupplier(
  token: string | undefined | null,
  payload: CreateSupplierPayload
): Promise<Supplier> {
  return readAuthenticatedJson<Supplier>("/suppliers", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateSupplier(
  token: string | undefined | null,
  id: string,
  payload: UpdateSupplierPayload
): Promise<Supplier> {
  return readAuthenticatedJson<Supplier>(`/suppliers/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deactivateSupplier(
  token: string | undefined | null,
  id: string
): Promise<Supplier> {
  return readAuthenticatedJson<Supplier>(`/suppliers/${id}`, {
    token,
    method: "DELETE"
  });
}

export async function listCategories(
  token: string | undefined | null,
  filters: ListEntitiesFilters
): Promise<Category[]> {
  return readAuthenticatedJson<Category[]>(
    `/categories${buildListQuery(filters)}`,
    { token }
  );
}

export async function createCategory(
  token: string | undefined | null,
  payload: CreateCategoryPayload
): Promise<Category> {
  return readAuthenticatedJson<Category>("/categories", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateCategory(
  token: string | undefined | null,
  id: string,
  payload: UpdateCategoryPayload
): Promise<Category> {
  return readAuthenticatedJson<Category>(`/categories/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deactivateCategory(
  token: string | undefined | null,
  id: string
): Promise<Category> {
  return readAuthenticatedJson<Category>(`/categories/${id}`, {
    token,
    method: "DELETE"
  });
}

export async function listProducts(
  token: string | undefined | null,
  filters: ListProductsFilters
): Promise<Product[]> {
  return readAuthenticatedJson<Product[]>(
    `/products${buildProductsQuery(filters)}`,
    { token }
  );
}

export async function getProduct(
  token: string | undefined | null,
  id: string
): Promise<Product> {
  return readAuthenticatedJson<Product>(`/products/${id}`, { token });
}

export async function createProduct(
  token: string | undefined | null,
  payload: CreateProductPayload
): Promise<Product> {
  return readAuthenticatedJson<Product>("/products", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateProduct(
  token: string | undefined | null,
  id: string,
  payload: UpdateProductPayload
): Promise<Product> {
  return readAuthenticatedJson<Product>(`/products/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function createProductCode(
  token: string | undefined | null,
  productId: string,
  payload: CreateProductCodePayload
): Promise<ProductCode> {
  return readAuthenticatedJson<ProductCode>(`/products/${productId}/codes`, {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateProductCode(
  token: string | undefined | null,
  productId: string,
  codeId: string,
  payload: UpdateProductCodePayload
): Promise<ProductCode> {
  return readAuthenticatedJson<ProductCode>(`/products/${productId}/codes/${codeId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function deleteProductCode(
  token: string | undefined | null,
  productId: string,
  codeId: string
): Promise<{ success: boolean }> {
  return readAuthenticatedJson<{ success: boolean }>(
    `/products/${productId}/codes/${codeId}`,
    {
      token,
      method: "DELETE"
    }
  );
}

export async function getProductBarcode(
  token: string | undefined | null,
  productId: string
): Promise<ProductBarcodeInfo> {
  return readAuthenticatedJson<ProductBarcodeInfo>(`/products/${productId}/barcode`, {
    token
  });
}

export async function generateProductBarcode(
  token: string | undefined | null,
  productId: string
): Promise<{ productId: string; barcode: ProductBarcodeSummary; product: Product }> {
  return readAuthenticatedJson<{
    productId: string;
    barcode: ProductBarcodeSummary;
    product: Product;
  }>(`/products/${productId}/barcode/generate`, {
    token,
    method: "POST"
  });
}

export async function createProductLabelsPreview(
  token: string | undefined | null,
  payload: ProductLabelsPreviewPayload
): Promise<ProductLabelsPreview> {
  return readAuthenticatedJson<ProductLabelsPreview>("/products/labels", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listStockLocations(
  token: string | undefined | null,
  filters: ListStockLocationsFilters
): Promise<StockLocation[]> {
  return readAuthenticatedJson<StockLocation[]>(
    `/stock-locations${buildStockLocationsQuery(filters)}`,
    { token }
  );
}

export async function createStockLocation(
  token: string | undefined | null,
  payload: CreateStockLocationPayload
): Promise<StockLocation> {
  return readAuthenticatedJson<StockLocation>("/stock-locations", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateStockLocation(
  token: string | undefined | null,
  id: string,
  payload: UpdateStockLocationPayload
): Promise<StockLocation> {
  return readAuthenticatedJson<StockLocation>(`/stock-locations/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function listInventoryBalances(
  token: string | undefined | null,
  filters: ListInventoryBalancesFilters
): Promise<InventoryBalanceRow[]> {
  return readAuthenticatedJson<InventoryBalanceRow[]>(
    `/inventory/balances${buildInventoryBalancesQuery(filters)}`,
    { token }
  );
}

export async function listInventoryMovements(
  token: string | undefined | null,
  filters: ListInventoryMovementsFilters
): Promise<InventoryMovement[]> {
  return readAuthenticatedJson<InventoryMovement[]>(
    `/inventory/movements${buildInventoryMovementsQuery(filters)}`,
    { token }
  );
}

export async function createInventoryEntry(
  token: string | undefined | null,
  payload: CreateInventoryEntryPayload
): Promise<InventoryEntryResult> {
  return readAuthenticatedJson<InventoryEntryResult>("/inventory/entries", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createInventoryAdjustment(
  token: string | undefined | null,
  payload: CreateInventoryAdjustmentPayload
): Promise<InventoryAdjustmentResult> {
  return readAuthenticatedJson<InventoryAdjustmentResult>("/inventory/adjustments", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createInventoryTransfer(
  token: string | undefined | null,
  payload: CreateInventoryTransferPayload
): Promise<InventoryTransferResult> {
  return readAuthenticatedJson<InventoryTransferResult>("/inventory/transfers", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listInventoryUnits(
  token: string | undefined | null,
  filters: ListInventoryUnitsFilters
): Promise<InventoryProductUnit[]> {
  return readAuthenticatedJson<InventoryProductUnit[]>(
    `/inventory/units${buildInventoryUnitsQuery(filters)}`,
    { token }
  );
}

export async function createInventoryUnits(
  token: string | undefined | null,
  payload: CreateInventoryProductUnitsPayload
): Promise<InventoryProductUnitsEntryResult> {
  return readAuthenticatedJson<InventoryProductUnitsEntryResult>("/inventory/units", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateInventoryUnit(
  token: string | undefined | null,
  id: string,
  payload: UpdateInventoryProductUnitPayload
): Promise<InventoryProductUnit> {
  return readAuthenticatedJson<InventoryProductUnit>(`/inventory/units/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function transferInventoryUnit(
  token: string | undefined | null,
  id: string,
  payload: TransferInventoryProductUnitPayload
): Promise<InventoryProductUnitTransferResult> {
  return readAuthenticatedJson<InventoryProductUnitTransferResult>(
    `/inventory/units/${id}/transfer`,
    {
      token,
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function listServiceOrders(
  token: string | undefined | null,
  filters: ListServiceOrdersFilters
): Promise<ServiceOrderListItem[]> {
  return readAuthenticatedJson<ServiceOrderListItem[]>(
    `/service-orders${buildServiceOrdersQuery(filters)}`,
    { token }
  );
}

export async function getServiceOrder(
  token: string | undefined | null,
  id: string
): Promise<ServiceOrder> {
  return readAuthenticatedJson<ServiceOrder>(`/service-orders/${id}`, { token });
}

export async function createServiceOrderReceiptPrintLink(
  token: string | undefined | null,
  id: string,
  format: ServiceOrderReceiptFormat
): Promise<ServiceOrderReceiptPrintLink> {
  return readAuthenticatedJson<ServiceOrderReceiptPrintLink>(
    `/service-orders/${id}/receipt/print-link?format=${format}`,
    {
      token,
      method: "POST"
    }
  );
}

export async function createServiceOrder(
  token: string | undefined | null,
  payload: CreateServiceOrderPayload
): Promise<ServiceOrder> {
  return readAuthenticatedJson<ServiceOrder>("/service-orders", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateServiceOrder(
  token: string | undefined | null,
  id: string,
  payload: UpdateServiceOrderPayload
): Promise<ServiceOrder> {
  return readAuthenticatedJson<ServiceOrder>(`/service-orders/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function changeServiceOrderStatus(
  token: string | undefined | null,
  id: string,
  payload: ChangeServiceOrderStatusPayload
): Promise<ServiceOrder> {
  return readAuthenticatedJson<ServiceOrder>(`/service-orders/${id}/status`, {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function consumeServiceOrderItem(
  token: string | undefined | null,
  serviceOrderId: string,
  itemId: string,
  payload: ConsumeServiceOrderItemPayload
): Promise<ServiceOrder> {
  return readAuthenticatedJson<ServiceOrder>(
    `/service-orders/${serviceOrderId}/items/${itemId}/consume`,
    {
      token,
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function listServiceOrderQuotes(
  token: string | undefined | null,
  serviceOrderId: string
): Promise<ServiceOrderQuote[]> {
  return readAuthenticatedJson<ServiceOrderQuote[]>(
    `/service-orders/${serviceOrderId}/quotes`,
    { token }
  );
}

export async function createServiceOrderQuote(
  token: string | undefined | null,
  serviceOrderId: string,
  payload: CreateServiceOrderQuotePayload
): Promise<ServiceOrderQuote> {
  return readAuthenticatedJson<ServiceOrderQuote>(
    `/service-orders/${serviceOrderId}/quotes`,
    {
      token,
      method: "POST",
      body: JSON.stringify(serializeServiceOrderQuotePayload(payload))
    }
  );
}

export async function updateServiceOrderQuote(
  token: string | undefined | null,
  serviceOrderId: string,
  quoteId: string,
  payload: UpdateServiceOrderQuotePayload
): Promise<ServiceOrderQuote> {
  return readAuthenticatedJson<ServiceOrderQuote>(
    `/service-orders/${serviceOrderId}/quotes/${quoteId}`,
    {
      token,
      method: "PATCH",
      body: JSON.stringify(serializeServiceOrderQuotePayload(payload))
    }
  );
}

export async function approveServiceOrderQuote(
  token: string | undefined | null,
  serviceOrderId: string,
  quoteId: string
): Promise<ServiceOrderQuote> {
  return readAuthenticatedJson<ServiceOrderQuote>(
    `/service-orders/${serviceOrderId}/quotes/${quoteId}/approve`,
    {
      token,
      method: "POST"
    }
  );
}

export async function rejectServiceOrderQuote(
  token: string | undefined | null,
  serviceOrderId: string,
  quoteId: string
): Promise<ServiceOrderQuote> {
  return readAuthenticatedJson<ServiceOrderQuote>(
    `/service-orders/${serviceOrderId}/quotes/${quoteId}/reject`,
    {
      token,
      method: "POST"
    }
  );
}

export async function listServiceOrderAttachments(
  token: string | undefined | null,
  serviceOrderId: string
): Promise<ServiceOrderAttachment[]> {
  return readAuthenticatedJson<ServiceOrderAttachment[]>(
    `/service-orders/${serviceOrderId}/attachments`,
    { token }
  );
}

export async function uploadServiceOrderAttachment(
  token: string | undefined | null,
  serviceOrderId: string,
  file: File,
  onProgress?: UploadProgressCallback
): Promise<ServiceOrderAttachment> {
  return uploadAuthenticatedFile<ServiceOrderAttachment>(
    `/service-orders/${serviceOrderId}/attachments`,
    token,
    file,
    onProgress
  );
}

export async function deleteServiceOrderAttachment(
  token: string | undefined | null,
  serviceOrderId: string,
  attachmentId: string
): Promise<{ success: boolean }> {
  return readAuthenticatedJson<{ success: boolean }>(
    `/service-orders/${serviceOrderId}/attachments/${attachmentId}`,
    {
      token,
      method: "DELETE"
    }
  );
}

export async function listPurchaseOrders(
  token: string | undefined | null,
  filters: ListPurchaseOrdersFilters
): Promise<PurchaseOrderListItem[]> {
  return readAuthenticatedJson<PurchaseOrderListItem[]>(
    `/purchase-orders${buildPurchaseOrdersQuery(filters)}`,
    { token }
  );
}

export async function getPurchaseOrder(
  token: string | undefined | null,
  id: string
): Promise<PurchaseOrder> {
  return readAuthenticatedJson<PurchaseOrder>(`/purchase-orders/${id}`, { token });
}

export async function createPurchaseOrder(
  token: string | undefined | null,
  payload: CreatePurchaseOrderPayload
): Promise<PurchaseOrder> {
  return readAuthenticatedJson<PurchaseOrder>("/purchase-orders", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updatePurchaseOrder(
  token: string | undefined | null,
  id: string,
  payload: UpdatePurchaseOrderPayload
): Promise<PurchaseOrder> {
  return readAuthenticatedJson<PurchaseOrder>(`/purchase-orders/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function changePurchaseOrderStatus(
  token: string | undefined | null,
  id: string,
  payload: ChangePurchaseOrderStatusPayload
): Promise<PurchaseOrder> {
  return readAuthenticatedJson<PurchaseOrder>(`/purchase-orders/${id}/status`, {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function receivePurchaseOrder(
  token: string | undefined | null,
  id: string,
  payload: ReceivePurchaseOrderPayload
): Promise<PurchaseOrder> {
  return readAuthenticatedJson<PurchaseOrder>(`/purchase-orders/${id}/receive`, {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listSaleReturns(
  token: string | undefined | null,
  filters: ListSaleReturnsFilters
): Promise<SaleReturnListItem[]> {
  return readAuthenticatedJson<SaleReturnListItem[]>(
    `/sale-returns${buildSaleReturnsQuery(filters)}`,
    { token }
  );
}

export async function getSaleReturn(
  token: string | undefined | null,
  id: string
): Promise<SaleReturn> {
  return readAuthenticatedJson<SaleReturn>(`/sale-returns/${id}`, { token });
}

export async function createSaleReturn(
  token: string | undefined | null,
  payload: CreateSaleReturnPayload
): Promise<SaleReturn> {
  return readAuthenticatedJson<SaleReturn>("/sale-returns", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function uploadProductImage(
  token: string | undefined | null,
  id: string,
  file: File
): Promise<Product> {
  return uploadAuthenticatedFile<Product>(`/products/${id}/image`, token, file);
}

export async function updateProductActive(
  token: string | undefined | null,
  id: string,
  active: boolean
): Promise<Product> {
  return readAuthenticatedJson<Product>(`/products/${id}/active`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ active })
  });
}

export function resolveApiAssetUrl(path?: string | null) {
  if (!path) {
    return null;
  }

  if (/^(https?:\/\/|blob:|data:)/i.test(path)) {
    return path;
  }

  if (!API_ORIGIN) {
    return null;
  }

  return `${API_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

async function uploadAuthenticatedFile<TResponse>(
  path: string,
  token: string | undefined | null,
  file: File,
  onProgress?: UploadProgressCallback,
  metadata: Omit<RequestMetadata, "path" | "authenticated"> = {}
): Promise<TResponse> {
  ensureApiConfigured(path);

  const formData = new FormData();
  formData.set("file", file);

  return new Promise<TResponse>((resolve, reject) => {
    const request = new XMLHttpRequest();

    request.open("POST", `${API_URL}${path}`);

    if (token) {
      request.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    request.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) {
        return;
      }

      onProgress(Math.round((event.loaded / event.total) * 100));
    };

    request.onerror = () => {
      const apiError = createApiHttpError({
        body: "Sem conexao com o servidor",
        isNetworkError: true,
        path
      });
      handleApiErrorGlobally(apiError, {
        ...metadata,
        path,
        authenticated: Boolean(token)
      });
      reject(apiError);
    };

    request.onload = () => {
      let body: unknown = null;

      if (request.responseText) {
        try {
          body = JSON.parse(request.responseText);
        } catch {
          body = null;
        }
      }

      if (request.status < 200 || request.status >= 300) {
        const apiError = createApiHttpError({
          status: request.status,
          body: body as ApiErrorBody,
          path
        });
        handleApiErrorGlobally(apiError, {
          ...metadata,
          path,
          authenticated: Boolean(token)
        });
        reject(apiError);
        return;
      }

      onProgress?.(100);
      resolve(body as TResponse);
    };

    request.send(formData);
  });
}

export async function searchPdvProducts(
  token: string | undefined | null,
  term: string,
  limit?: number,
  locationId?: string
): Promise<PdvProductResult[]> {
  const params = new URLSearchParams({ term });

  if (limit) {
    params.set("limit", String(limit));
  }

  if (locationId) {
    params.set("locationId", locationId);
  }

  return readAuthenticatedJson<PdvProductResult[]>(
    `/pdv/product-search?${params.toString()}`,
    { token }
  );
}

export async function getPdvProductByBarcode(
  token: string | undefined | null,
  code: string
): Promise<PdvProductResult> {
  return readAuthenticatedJson<PdvProductResult>(
    `/pdv/by-barcode/${encodeURIComponent(code)}`,
    { token }
  );
}

export async function getPdvProductByInternalCode(
  token: string | undefined | null,
  internalCode: string
): Promise<PdvProductResult> {
  return readAuthenticatedJson<PdvProductResult>(
    `/pdv/by-code/${encodeURIComponent(internalCode)}`,
    { token }
  );
}

export async function getPdvProductBySupplierCode(
  token: string | undefined | null,
  supplierCode: string
): Promise<PdvProductResult> {
  return readAuthenticatedJson<PdvProductResult>(
    `/pdv/by-supplier-code/${encodeURIComponent(supplierCode)}`,
    { token }
  );
}

export async function getPdvProductByImei(
  token: string | undefined | null,
  imei: string
): Promise<PdvProductResult> {
  return readAuthenticatedJson<PdvProductResult>(
    `/pdv/by-imei/${encodeURIComponent(imei)}`,
    { token }
  );
}

export async function checkoutSale(
  token: string | undefined | null,
  payload: CheckoutSalePayload
): Promise<SaleDetail> {
  return readAuthenticatedJson<SaleDetail>("/sales/checkout", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function createScannerSession(
  token: string | undefined | null,
  payload: CreateScannerSessionPayload
): Promise<CreateScannerSessionResult> {
  return readAuthenticatedJson<CreateScannerSessionResult>("/scanner-sessions", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function getScannerSessionStatus(
  token: string | undefined | null,
  id: string
): Promise<ScannerSessionState> {
  return readAuthenticatedJson<ScannerSessionState>(`/scanner-sessions/${id}/status`, {
    token
  });
}

export async function disconnectScannerSession(
  token: string | undefined | null,
  id: string
): Promise<ScannerSessionState> {
  return readAuthenticatedJson<ScannerSessionState>(`/scanner-sessions/${id}/disconnect`, {
    token,
    method: "POST"
  });
}

export async function pairScannerSession(
  payload: PairScannerSessionPayload
): Promise<PairScannerSessionResult> {
  return readJson<PairScannerSessionResult>(`${API_URL}/scanner-sessions/pair`, {
    method: "POST",
    body: JSON.stringify(payload)
  }, {
    path: "/scanner-sessions/pair"
  });
}

export async function listSales(
  token: string | undefined | null,
  filters: ListSalesFilters
): Promise<SaleListItem[]> {
  return readAuthenticatedJson<SaleListItem[]>(`/sales${buildSalesQuery(filters)}`, {
    token
  });
}

export async function getSale(
  token: string | undefined | null,
  id: string
): Promise<SaleDetail> {
  return readAuthenticatedJson<SaleDetail>(`/sales/${id}`, { token });
}

export async function listFiscalDocuments(
  token: string | undefined | null,
  filters: ListFiscalDocumentsFilters
): Promise<FiscalDocumentRecord[]> {
  return readAuthenticatedJson<FiscalDocumentRecord[]>(
    `/fiscal/documents${buildFiscalDocumentsQuery(filters)}`,
    { token }
  );
}

export async function getFiscalDocument(
  token: string | undefined | null,
  id: string
): Promise<FiscalDocumentRecord> {
  return readAuthenticatedJson<FiscalDocumentRecord>(`/fiscal/documents/${id}`, { token });
}

export async function issueInternalReceipt(
  token: string | undefined | null,
  saleId: string
): Promise<FiscalDocumentRecord> {
  return readAuthenticatedJson<FiscalDocumentRecord>("/fiscal/documents/internal-receipt", {
    token,
    method: "POST",
    body: JSON.stringify({ saleId })
  });
}

export async function createFiscalReceiptPrintLink(
  token: string | undefined | null,
  saleId: string
): Promise<FiscalReceiptPrintLink> {
  return readAuthenticatedJson<FiscalReceiptPrintLink>(
    `/fiscal/receipt/${saleId}/print-link`,
    {
      token,
      method: "POST"
    }
  );
}

export async function cancelFiscalDocument(
  token: string | undefined | null,
  id: string,
  reason?: string
): Promise<FiscalDocumentRecord> {
  return readAuthenticatedJson<FiscalDocumentRecord>(`/fiscal/documents/${id}/cancel`, {
    token,
    method: "POST",
    body: JSON.stringify(reason ? { reason } : {})
  });
}

export async function getFiscalReport(
  token: string | undefined | null,
  filters: ListFiscalDocumentsFilters
): Promise<FiscalReport> {
  return readAuthenticatedJson<FiscalReport>(
    `/fiscal/report${buildFiscalDocumentsQuery(filters)}`,
    { token }
  );
}

export async function listAccountsPayable(
  token: string | undefined | null,
  filters: ListAccountsPayableFilters
): Promise<AccountsPayableEntry[]> {
  return readAuthenticatedJson<AccountsPayableEntry[]>(
    `/accounts-payable${buildFinancialEntriesQuery(filters)}`,
    { token }
  );
}

export async function createAccountsPayable(
  token: string | undefined | null,
  payload: CreateAccountsPayablePayload
): Promise<AccountsPayableEntry> {
  return readAuthenticatedJson<AccountsPayableEntry>("/accounts-payable", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateAccountsPayable(
  token: string | undefined | null,
  id: string,
  payload: UpdateAccountsPayablePayload
): Promise<AccountsPayableEntry> {
  return readAuthenticatedJson<AccountsPayableEntry>(`/accounts-payable/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function payAccountsPayable(
  token: string | undefined | null,
  id: string,
  payload: PayAccountsPayablePayload
): Promise<AccountsPayableEntry> {
  return readAuthenticatedJson<AccountsPayableEntry>(`/accounts-payable/${id}/pay`, {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listAccountsReceivable(
  token: string | undefined | null,
  filters: ListAccountsReceivableFilters
): Promise<AccountsReceivableEntry[]> {
  return readAuthenticatedJson<AccountsReceivableEntry[]>(
    `/accounts-receivable${buildFinancialEntriesQuery(filters)}`,
    { token }
  );
}

export async function createAccountsReceivable(
  token: string | undefined | null,
  payload: CreateAccountsReceivablePayload
): Promise<AccountsReceivableEntry> {
  return readAuthenticatedJson<AccountsReceivableEntry>("/accounts-receivable", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function updateAccountsReceivable(
  token: string | undefined | null,
  id: string,
  payload: UpdateAccountsReceivablePayload
): Promise<AccountsReceivableEntry> {
  return readAuthenticatedJson<AccountsReceivableEntry>(`/accounts-receivable/${id}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export async function receiveAccountsReceivable(
  token: string | undefined | null,
  id: string,
  payload: ReceiveAccountsReceivablePayload
): Promise<AccountsReceivableEntry> {
  return readAuthenticatedJson<AccountsReceivableEntry>(
    `/accounts-receivable/${id}/receive`,
    {
      token,
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}

export async function getFinancialSummary(
  token: string | undefined | null,
  period: "today" | "week" | "month"
): Promise<FinancialSummary> {
  return readAuthenticatedJson<FinancialSummary>(`/financial/summary?period=${period}`, {
    token
  });
}

export async function listAudit(
  token: string | undefined | null,
  filters: ListAuditFilters
): Promise<AuditLogEntry[]> {
  return readAuthenticatedJson<AuditLogEntry[]>(`/audit${buildAuditQuery(filters)}`, {
    token
  });
}

export async function getSalesReport(
  token: string | undefined | null,
  filters: SalesReportFilters
): Promise<SalesReport> {
  return readAuthenticatedJson<SalesReport>(`/reports/sales${buildSalesReportQuery(filters)}`, {
    token
  });
}

export async function downloadSalesReportCsv(
  token: string | undefined | null,
  filters: SalesReportFilters
): Promise<DownloadedFile> {
  return readAuthenticatedFile(`/reports/export/sales${buildSalesReportExportQuery(filters)}`, {
    token
  });
}

export async function getStockReport(
  token: string | undefined | null,
  filters: StockReportFilters
): Promise<StockReport> {
  return readAuthenticatedJson<StockReport>(`/reports/stock${buildStockReportQuery(filters)}`, {
    token
  });
}

export async function downloadStockReportCsv(
  token: string | undefined | null,
  filters: StockReportFilters
): Promise<DownloadedFile> {
  return readAuthenticatedFile(`/reports/export/stock${buildStockReportQuery(filters)}`, {
    token
  });
}

export async function getCashReport(
  token: string | undefined | null,
  filters: CashReportFilters
): Promise<CashReport> {
  return readAuthenticatedJson<CashReport>(`/reports/cash${buildCashReportQuery(filters)}`, {
    token
  });
}

export async function downloadCashReportCsv(
  token: string | undefined | null,
  filters: CashReportFilters
): Promise<DownloadedFile> {
  return readAuthenticatedFile(`/reports/export/cash${buildCashReportExportQuery(filters)}`, {
    token
  });
}

export async function getCustomerReport(
  token: string | undefined | null,
  filters: CustomerReportFilters
): Promise<CustomerReport> {
  return readAuthenticatedJson<CustomerReport>(`/reports/customers${buildCustomerReportQuery(filters)}`, {
    token
  });
}

export async function downloadCustomerReportCsv(
  token: string | undefined | null,
  filters: CustomerReportFilters
): Promise<DownloadedFile> {
  return readAuthenticatedFile(
    `/reports/export/customers${buildCustomerReportExportQuery(filters)}`,
    {
      token
    }
  );
}

export async function getMyCommissionSummary(
  token: string | undefined | null,
  filters: CommissionPeriodFilters
): Promise<MyCommissionSummary> {
  return readAuthenticatedJson<MyCommissionSummary>(
    `/commissions/my-summary${buildCommissionPeriodQuery(filters)}`,
    { token }
  );
}

export async function getTeamCommissionSummary(
  token: string | undefined | null,
  filters: CommissionPeriodFilters
): Promise<TeamCommissionSummary> {
  return readAuthenticatedJson<TeamCommissionSummary>(
    `/commissions/team-summary${buildCommissionPeriodQuery(filters)}`,
    { token }
  );
}

export async function createCommission(
  token: string | undefined | null,
  payload: CreateCommissionPayload
): Promise<CommissionRecord> {
  return readAuthenticatedJson<CommissionRecord>("/commissions", {
    token,
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function listCommissionTargets(
  token: string | undefined | null,
  filters: CommissionPeriodFilters
): Promise<CommissionTargetsResponse> {
  return readAuthenticatedJson<CommissionTargetsResponse>(
    `/commissions/targets${buildCommissionPeriodQuery(filters)}`,
    { token }
  );
}

export async function upsertCommissionTarget(
  token: string | undefined | null,
  payload: UpsertCommissionTargetPayload
): Promise<CommissionTargetsResponse["rows"][number]> {
  return readAuthenticatedJson<CommissionTargetsResponse["rows"][number]>(
    "/commissions/targets",
    {
      token,
      method: "POST",
      body: JSON.stringify(payload)
    }
  );
}
