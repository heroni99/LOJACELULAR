const { createRequire } = require("node:module");
const { resolve } = require("node:path");

require(resolve(__dirname, "../apps/api/dist/common/load-env.js"));

const appModulePath = resolve(__dirname, "../apps/api/dist/app.module.js");
const workspaceRequire = createRequire(appModulePath);

workspaceRequire("reflect-metadata");

const { NestFactory } = workspaceRequire("@nestjs/core");
const { AppModule } = require(appModulePath);
const { PrismaService } = require("../apps/api/dist/prisma/prisma.service.js");
const {
  CustomersService
} = require("../apps/api/dist/modules/customers/customers.service.js");
const { StoresService } = require("../apps/api/dist/modules/stores/stores.service.js");
const { AuthService } = require("../apps/api/dist/modules/auth/auth.service.js");
const { UsersService } = require("../apps/api/dist/modules/users/users.service.js");
const {
  SuppliersService
} = require("../apps/api/dist/modules/suppliers/suppliers.service.js");
const {
  CategoriesService
} = require("../apps/api/dist/modules/categories/categories.service.js");
const {
  ProductsService
} = require("../apps/api/dist/modules/products/products.service.js");
const { RolesService } = require("../apps/api/dist/modules/roles/roles.service.js");
const { AuditService } = require("../apps/api/dist/modules/audit/audit.service.js");
const {
  InventoryService
} = require("../apps/api/dist/modules/inventory/inventory.service.js");
const { CashService } = require("../apps/api/dist/modules/cash/cash.service.js");
const { SalesService } = require("../apps/api/dist/modules/sales/sales.service.js");
const { ReportsService } = require("../apps/api/dist/modules/reports/reports.service.js");
const { FiscalService } = require("../apps/api/dist/modules/fiscal/fiscal.service.js");
const {
  ServiceOrdersService
} = require("../apps/api/dist/modules/service-orders/service-orders.service.js");
const {
  PurchaseOrdersService
} = require("../apps/api/dist/modules/purchase-orders/purchase-orders.service.js");
const {
  SaleReturnsService
} = require("../apps/api/dist/modules/sale-returns/sale-returns.service.js");
const {
  AccountsPayableService
} = require("../apps/api/dist/modules/accounts-payable/accounts-payable.service.js");
const {
  AccountsReceivableService
} = require("../apps/api/dist/modules/accounts-receivable/accounts-receivable.service.js");
const {
  FinancialService
} = require("../apps/api/dist/modules/financial/financial.service.js");

const auditContext = {
  userId: null,
  storeId: null,
  ipAddress: null,
  userAgent: "review-smoke"
};

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false
  });
  const prisma = app.get(PrismaService);
  const customers = app.get(CustomersService);
  const stores = app.get(StoresService);
  const auth = app.get(AuthService);
  const users = app.get(UsersService);
  const suppliers = app.get(SuppliersService);
  const categories = app.get(CategoriesService);
  const products = app.get(ProductsService);
  const roles = app.get(RolesService);
  const audit = app.get(AuditService);
  const inventory = app.get(InventoryService);
  const cash = app.get(CashService);
  const sales = app.get(SalesService);
  const reports = app.get(ReportsService);
  const fiscal = app.get(FiscalService);
  const serviceOrders = app.get(ServiceOrdersService);
  const purchaseOrders = app.get(PurchaseOrdersService);
  const saleReturns = app.get(SaleReturnsService);
  const accountsPayable = app.get(AccountsPayableService);
  const accountsReceivable = app.get(AccountsReceivableService);
  const financial = app.get(FinancialService);

  const suffix = `${Date.now()}`;
  const report = {
    ok: true,
    checks: [],
    cleanup: [],
    errors: []
  };

  let customer = null;
  let supplier = null;
  let category = null;
  let product = null;
  let serializedProduct = null;
  let productCode = null;
  let createdUser = null;
  let originalStore = null;
  let roleRestore = null;
  let createdUserSession = null;
  let defaultLocation = null;
  let secondaryLocation = null;
  let createdUnit = null;
  let createdTerminal = null;
  let createdSession = null;
  let createdSale = null;
  let createdFiscalDocument = null;
  let createdServiceOrder = null;
  let createdPurchaseOrder = null;
  let createdSaleReturn = null;
  let createdPayable = null;
  let createdReceivable = null;

  try {
    const loginSession = await auth.login(
      {
        email: (process.env.SEED_ADMIN_EMAIL || "admin@local.test").toLowerCase(),
        password: process.env.SEED_ADMIN_PASSWORD || "Admin@123"
      },
      auditContext
    );
    report.checks.push({
      name: "auth.login",
      passed:
        typeof loginSession.accessToken === "string" &&
        typeof loginSession.refreshToken === "string"
    });

    const refreshedSession = await auth.refresh(
      {
        refreshToken: loginSession.refreshToken
      },
      auditContext
    );
    report.checks.push({
      name: "auth.refresh",
      passed:
        typeof refreshedSession.accessToken === "string" &&
        refreshedSession.refreshToken !== loginSession.refreshToken
    });

    const logoutResult = await auth.logout(
      {
        refreshToken: refreshedSession.refreshToken
      },
      auditContext
    );
    report.checks.push({
      name: "auth.logout",
      passed: logoutResult.success === true
    });
    const revokedRefreshToken = await prisma.refreshToken.findUnique({
      where: {
        tokenHash: auth["hashToken"](refreshedSession.refreshToken)
      }
    });
    report.checks.push({
      name: "auth.logout.revokes_refresh_token",
      passed: revokedRefreshToken?.revokedAt instanceof Date
    });

    originalStore = await stores.findDefaultStore();
    report.checks.push({
      name: "stores.findDefaultStore",
      passed: Boolean(originalStore?.id && originalStore?.displayName)
    });
    const brandedStore = await stores.updateBranding(
      originalStore.id,
      {
        displayName: `${originalStore.displayName} Smoke`,
        primaryColor: "#ea580c",
        secondaryColor: "#111827",
        accentColor: "#ffffff",
        heroBannerEnabled: true
      },
      auditContext
    );
    report.checks.push({
      name: "stores.updateBranding",
      passed: brandedStore.displayName.endsWith("Smoke")
    });
    const persistedStore = await prisma.store.findUnique({
      where: {
        id: originalStore.id
      }
    });
    report.checks.push({
      name: "stores.persisted",
      passed: persistedStore?.displayName === brandedStore.displayName
    });

    customer = await customers.create(
      {
        name: `Cliente Auditoria ${suffix}`,
        phone: "11999990001"
      },
      auditContext
    );
    report.checks.push({
      name: "customers.create",
      passed: Boolean(customer?.id)
    });

    const updatedCustomer = await customers.update(
      customer.id,
      {
        notes: "audit-ok"
      },
      auditContext
    );
    report.checks.push({
      name: "customers.update",
      passed: updatedCustomer.notes === "audit-ok"
    });
    const listedCustomers = await customers.findAll({
      search: suffix,
      active: true
    });
    const persistedCustomer = await prisma.customer.findUnique({
      where: {
        id: customer.id
      }
    });
    report.checks.push({
      name: "customers.list",
      passed: listedCustomers.some((item) => item.id === customer.id)
    });
    report.checks.push({
      name: "customers.persisted",
      passed: persistedCustomer?.notes === "audit-ok"
    });

    supplier = await suppliers.create(
      {
        name: `Fornecedor Auditoria ${suffix}`
      },
      auditContext
    );
    report.checks.push({
      name: "suppliers.create",
      passed: Boolean(supplier?.id)
    });

    const updatedSupplier = await suppliers.update(
      supplier.id,
      {
        contactName: "QA"
      },
      auditContext
    );
    report.checks.push({
      name: "suppliers.update",
      passed: updatedSupplier.contactName === "QA"
    });
    const listedSuppliers = await suppliers.findAll({
      search: suffix,
      active: true
    });
    const persistedSupplier = await prisma.supplier.findUnique({
      where: {
        id: supplier.id
      }
    });
    report.checks.push({
      name: "suppliers.list",
      passed: listedSuppliers.some((item) => item.id === supplier.id)
    });
    report.checks.push({
      name: "suppliers.persisted",
      passed: persistedSupplier?.contactName === "QA"
    });

    category = await categories.create(
      {
        name: `Categoria Auditoria ${suffix}`,
        prefix: `Q${suffix.slice(-3)}`,
        sequenceName: `seq_audit_${suffix}`,
        defaultSerialized: false
      },
      auditContext
    );
    report.checks.push({
      name: "categories.create",
      passed: Boolean(category?.id)
    });

    const updatedCategory = await categories.update(
      category.id,
      {
        description: "audit-ok"
      },
      auditContext
    );
    report.checks.push({
      name: "categories.update",
      passed: updatedCategory.description === "audit-ok"
    });
    const listedCategories = await categories.findAll({
      search: suffix,
      active: true
    });
    const persistedCategory = await prisma.category.findUnique({
      where: {
        id: category.id
      }
    });
    report.checks.push({
      name: "categories.list",
      passed: listedCategories.some((item) => item.id === category.id)
    });
    report.checks.push({
      name: "categories.persisted",
      passed: persistedCategory?.description === "audit-ok"
    });

    product = await products.create(
      {
        categoryId: category.id,
        supplierId: supplier.id,
        name: `Produto Auditoria ${suffix}`,
        supplierCode: `AUD-${suffix}`,
        costPrice: 1500,
        salePrice: 2500,
        stockMin: 2,
        hasSerialControl: false,
        needsPriceReview: false,
        isService: false,
        active: true
      },
      auditContext
    );
    report.checks.push({
      name: "products.create",
      passed:
        Boolean(product?.id) &&
        typeof product?.internalCode === "string" &&
        product.internalCode.includes("-")
    });
    report.checks.push({
      name: "products.auto_barcode",
      passed:
        product.displayBarcode?.code === product.internalCode &&
        product.storeBarcode?.codeType === "INTERNAL_BARCODE"
    });

    const listedProducts = await products.findAll({
      search: suffix,
      active: true,
      isService: false
    });
    report.checks.push({
      name: "products.list",
      passed: listedProducts.some((item) => item.id === product.id)
    });

    const persistedProduct = await prisma.product.findUnique({
      where: {
        id: product.id
      }
    });
    report.checks.push({
      name: "products.persisted",
      passed: persistedProduct?.supplierCode === `AUD-${suffix}`
    });

    const foundByInternalCode = await products.findByInternalCode(product.internalCode);
    report.checks.push({
      name: "products.findByInternalCode",
      passed: foundByInternalCode.id === product.id
    });

    const barcodeInfo = await products.getBarcode(product.id);
    report.checks.push({
      name: "products.getBarcode",
      passed:
        barcodeInfo.productId === product.id &&
        barcodeInfo.displayBarcode?.code === product.internalCode
    });

    const labelsPreview = await products.createLabels(
      {
        items: [
          {
            productId: product.id,
            quantity: 2
          }
        ],
        includePrice: true
      },
      auditContext
    );
    report.checks.push({
      name: "products.labels.preview",
      passed:
        labelsPreview.totalLabels === 2 &&
        labelsPreview.items[0]?.barcode?.code === product.internalCode
    });

    const updatedProduct = await products.update(
      product.id,
      {
        salePrice: 2900,
        needsPriceReview: true
      },
      auditContext
    );
    report.checks.push({
      name: "products.update",
      passed:
        updatedProduct.salePrice === 2900 &&
        updatedProduct.needsPriceReview === true
    });

    productCode = await products.createCode(
      product.id,
      {
        code: `EAN${suffix}`,
        codeType: "EAN13",
        isPrimary: true
      },
      auditContext
    );
    report.checks.push({
      name: "products.codes.create",
      passed:
        Boolean(productCode?.id) &&
        productCode.code === `EAN${suffix}` &&
        productCode.isPrimary === true
    });

    const foundByBarcode = await products.findByBarcode(productCode.code);
    report.checks.push({
      name: "products.findByBarcode",
      passed: foundByBarcode.id === product.id
    });

    const searchedByBarcode = await products.findAll({
      search: productCode.code,
      active: true,
      isService: false
    });
    report.checks.push({
      name: "products.search_by_barcode",
      passed: searchedByBarcode.some((item) => item.id === product.id)
    });

    const updatedCode = await products.updateCode(
      product.id,
      productCode.id,
      {
        code: `ALT${suffix}`,
        codeType: "CODE128",
        isPrimary: true
      },
      auditContext
    );
    report.checks.push({
      name: "products.codes.update",
      passed:
        updatedCode.code === `ALT${suffix}` &&
        updatedCode.codeType === "CODE128"
    });

    const persistedProductCode = await prisma.productCode.findUnique({
      where: {
        id: productCode.id
      }
    });
    report.checks.push({
      name: "products.codes.persisted",
      passed: persistedProductCode?.code === `ALT${suffix}`
    });

    const deleteCodeResult = await products.deleteCode(product.id, productCode.id, auditContext);
    report.checks.push({
      name: "products.codes.delete",
      passed: deleteCodeResult.success === true
    });
    const deletedProductCode = await prisma.productCode.findUnique({
      where: {
        id: productCode.id
      }
    });
    report.checks.push({
      name: "products.codes.deleted_from_db",
      passed: deletedProductCode === null
    });
    productCode = null;

    const listedLocations = await inventory.listStockLocations(originalStore.id, {
      take: 20
    });
    defaultLocation = listedLocations.find((location) => location.isDefault) || null;
    report.checks.push({
      name: "stock_locations.list",
      passed: Boolean(defaultLocation?.id)
    });

    secondaryLocation = await inventory.createStockLocation(
      originalStore.id,
      {
        name: `Balcao Smoke ${suffix}`,
        description: "Local temporario do smoke",
        isDefault: false,
        active: true
      },
      auditContext
    );
    report.checks.push({
      name: "stock_locations.create",
      passed: Boolean(secondaryLocation?.id)
    });

    serializedProduct = await products.create(
      {
        categoryId: category.id,
        supplierId: supplier.id,
        name: `Produto Serializado ${suffix}`,
        supplierCode: `SER-${suffix}`,
        costPrice: 3000,
        salePrice: 4800,
        stockMin: 1,
        hasSerialControl: true,
        needsPriceReview: false,
        isService: false,
        active: true
      },
      auditContext
    );
    report.checks.push({
      name: "products.serialized.create",
      passed: Boolean(serializedProduct?.id && serializedProduct?.hasSerialControl)
    });

    const entryResult = await inventory.createEntry(
      originalStore.id,
      {
        productId: product.id,
        locationId: defaultLocation.id,
        quantity: 5,
        unitCost: 1500,
        notes: "smoke-entry"
      },
      auditContext
    );
    report.checks.push({
      name: "inventory.entry",
      passed: entryResult.currentQuantity === 5 && entryResult.totalStock === 5
    });

    const createdUnitsResult = await inventory.createUnits(
      originalStore.id,
      {
        productId: serializedProduct.id,
        locationId: defaultLocation.id,
        purchasePrice: 3000,
        notes: "smoke-unit-entry",
        units: [
          {
            imei: `356000${suffix.slice(-8)}`.slice(0, 14),
            imei2: `357000${suffix.slice(-8)}`.slice(0, 14),
            serialNumber: `SMK-${suffix}`
          }
        ]
      },
      auditContext
    );
    createdUnit = createdUnitsResult.units[0] || null;
    report.checks.push({
      name: "inventory.units.create",
      passed:
        Boolean(createdUnit?.id) &&
        createdUnitsResult.snapshot.currentQuantity >= 1 &&
        createdUnit.currentLocation?.id === defaultLocation.id
    });

    const listedUnits = await inventory.listUnits(originalStore.id, {
      productId: serializedProduct.id,
      take: 20
    });
    report.checks.push({
      name: "inventory.units.list",
      passed: listedUnits.some((unit) => unit.id === createdUnit.id)
    });

    const updatedUnit = await inventory.updateUnit(
      createdUnit.id,
      originalStore.id,
      {
        notes: "smoke-unit-updated",
        unitStatus: "RESERVED"
      },
      auditContext
    );
    report.checks.push({
      name: "inventory.units.update",
      passed:
        updatedUnit.unitStatus === "RESERVED" &&
        updatedUnit.notes === "smoke-unit-updated"
    });

    const restoredUnit = await inventory.updateUnit(
      createdUnit.id,
      originalStore.id,
      {
        unitStatus: "IN_STOCK",
        notes: "smoke-unit-restored"
      },
      auditContext
    );
    report.checks.push({
      name: "inventory.units.restore",
      passed: restoredUnit.unitStatus === "IN_STOCK"
    });

    const transferredUnit = await inventory.transferUnit(
      createdUnit.id,
      originalStore.id,
      {
        toLocationId: secondaryLocation.id,
        notes: "smoke-transfer-unit"
      },
      auditContext
    );
    createdUnit = transferredUnit.unit;
    report.checks.push({
      name: "inventory.units.transfer",
      passed: createdUnit.currentLocation?.id === secondaryLocation.id
    });

    const transferResult = await inventory.createTransfer(
      originalStore.id,
      {
        productId: product.id,
        fromLocationId: defaultLocation.id,
        toLocationId: secondaryLocation.id,
        quantity: 2,
        notes: "smoke-transfer-bulk"
      },
      auditContext
    );
    report.checks.push({
      name: "inventory.transfer.bulk",
      passed:
        transferResult.fromCurrentQuantity === 3 &&
        transferResult.toCurrentQuantity === 2
    });

    createdTerminal = await cash.createTerminal(
      {
        storeId: originalStore.id,
        name: `Caixa Smoke ${suffix}`,
        active: true
      },
      auditContext
    );
    report.checks.push({
      name: "cash.terminals.create",
      passed: Boolean(createdTerminal?.id)
    });

    createdSession = await cash.open(
      {
        cashTerminalId: createdTerminal.id,
        openingAmount: 10000,
        notes: "smoke-open"
      },
      {
        ...auditContext,
        userId: loginSession.user.id,
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "cash.open",
      passed: createdSession.status === "OPEN"
    });

    const depositSession = await cash.deposit(
      {
        cashSessionId: createdSession.id,
        amount: 2000,
        description: "smoke-deposit"
      },
      {
        ...auditContext,
        userId: loginSession.user.id,
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "cash.deposit",
      passed: depositSession.movementSummary.supplies === 2000
    });

    const withdrawalSession = await cash.withdrawal(
      {
        cashSessionId: createdSession.id,
        amount: 500,
        description: "smoke-withdrawal"
      },
      {
        ...auditContext,
        userId: loginSession.user.id,
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "cash.withdrawal",
      passed: withdrawalSession.movementSummary.withdrawals === 500
    });

    createdSale = await sales.checkout(
      {
        customerId: customer.id,
        cashSessionId: createdSession.id,
        items: [
          {
            productId: product.id,
            stockLocationId: secondaryLocation.id,
            quantity: 1,
            unitPrice: 2900,
            discountAmount: 0
          },
          {
            productId: serializedProduct.id,
            productUnitId: createdUnit.id,
            stockLocationId: secondaryLocation.id,
            quantity: 1,
            unitPrice: 4800,
            discountAmount: 0
          }
        ],
        payments: [
          {
            method: "PIX",
            amount: 7700
          }
        ],
        discountAmount: 0,
        notes: "smoke-sale"
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "sales.checkout",
      passed:
        Boolean(createdSale?.id) &&
        createdSale.items.length === 2 &&
        createdSale.payments.length === 1
    });

    const soldUnit = await prisma.productUnit.findUnique({
      where: {
        id: createdUnit.id
      }
    });
    report.checks.push({
      name: "sales.checkout.product_unit_sold",
      passed:
        soldUnit?.unitStatus === "SOLD" && soldUnit?.currentLocationId === null
    });

    const sourceBalanceAfterSale = await prisma.stockBalance.findUnique({
      where: {
        productId_locationId: {
          productId: product.id,
          locationId: secondaryLocation.id
        }
      }
    });
    report.checks.push({
      name: "sales.checkout.stock_decrement",
      passed: sourceBalanceAfterSale?.quantity === 1
    });

    const listedSales = await sales.findAll({
      search: createdSale.saleNumber,
      take: 20
    });
    report.checks.push({
      name: "sales.list",
      passed: listedSales.some((sale) => sale.id === createdSale.id)
    });

    createdFiscalDocument = await fiscal.issueInternalReceipt(
      originalStore.id,
      {
        saleId: createdSale.id
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "fiscal.issue_internal_receipt",
      passed:
        createdFiscalDocument.status === "AUTHORIZED" &&
        createdFiscalDocument.sale.id === createdSale.id
    });

    const fiscalReport = await fiscal.getReport(
      originalStore.id,
      {
        search: createdSale.saleNumber
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "fiscal.report",
      passed:
        fiscalReport.summary.totalDocuments >= 1 &&
        fiscalReport.rows.some((row) => row.id === createdFiscalDocument.id)
    });

    const canceledFiscalDocument = await fiscal.cancelDocument(
      createdFiscalDocument.id,
      originalStore.id,
      {
        reason: "smoke-cancel"
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    createdFiscalDocument = canceledFiscalDocument;
    report.checks.push({
      name: "fiscal.cancel_internal_receipt",
      passed: canceledFiscalDocument.status === "CANCELED"
    });

    const serializedSaleItem = createdSale.items.find(
      (item) => item.productUnit?.id === createdUnit.id
    );

    if (!serializedSaleItem) {
      throw new Error("Item serializado da venda nao encontrado para o smoke.");
    }

    createdSaleReturn = await saleReturns.create(
      originalStore.id,
      {
        saleId: createdSale.id,
        reason: "smoke-return",
        refundType: "CASH",
        items: [
          {
            saleItemId: serializedSaleItem.id,
            quantity: 1,
            amount: 4800,
            returnToStock: true,
            locationId: defaultLocation.id
          }
        ]
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "sale_returns.create",
      passed:
        Boolean(createdSaleReturn?.id) &&
        createdSaleReturn.items.length === 1 &&
        createdSaleReturn.refundType === "CASH"
    });

    const returnedUnit = await prisma.productUnit.findUnique({
      where: {
        id: createdUnit.id
      }
    });
    report.checks.push({
      name: "sale_returns.restore_serialized_unit",
      passed:
        returnedUnit?.unitStatus === "IN_STOCK" &&
        returnedUnit?.currentLocationId === defaultLocation.id
    });

    const serviceCatalogItem = await prisma.product.findFirst({
      where: {
        isService: true,
        active: true
      }
    });

    if (!serviceCatalogItem) {
      throw new Error("Nenhum servico seedado encontrado para o smoke.");
    }

    createdServiceOrder = await serviceOrders.create(
      originalStore.id,
      {
        customerId: customer.id,
        assignedToUserId: loginSession.user.id,
        deviceType: "Smartphone",
        brand: "Motorola",
        model: `Smoke ${suffix}`,
        imei: `3510${suffix.slice(-10)}`.slice(0, 14),
        reportedIssue: "Tela trincada",
        technicalNotes: "OS do smoke test",
        totalFinal: 4500,
        items: [
          {
            itemType: "PART",
            productId: product.id,
            description: "Peca de reposicao",
            quantity: 1,
            unitPrice: 2500
          },
          {
            itemType: "SERVICE",
            productId: serviceCatalogItem.id,
            description: "Mao de obra",
            quantity: 1,
            unitPrice: 2000
          }
        ]
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "service_orders.create",
      passed:
        Boolean(createdServiceOrder?.id) &&
        createdServiceOrder.items.length === 2 &&
        createdServiceOrder.status === "OPEN"
    });

    createdServiceOrder = await serviceOrders.changeStatus(
      createdServiceOrder.id,
      originalStore.id,
      {
        status: "WAITING_APPROVAL",
        notes: "aguardando retorno do cliente"
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    createdServiceOrder = await serviceOrders.changeStatus(
      createdServiceOrder.id,
      originalStore.id,
      {
        status: "APPROVED",
        notes: "cliente aprovou",
        totalFinal: 4500
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "service_orders.status",
      passed: createdServiceOrder.status === "APPROVED"
    });

    const partItem = createdServiceOrder.items.find((item) => item.itemType === "PART");

    if (!partItem) {
      throw new Error("Item de peca nao encontrado na OS do smoke.");
    }

    createdServiceOrder = await serviceOrders.consumeItem(
      createdServiceOrder.id,
      partItem.id,
      originalStore.id,
      {
        locationId: secondaryLocation.id
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "service_orders.consume_part",
      passed: createdServiceOrder.items.find((item) => item.id === partItem.id)?.stockConsumed === true
    });

    createdReceivable = await accountsReceivable.create(
      {
        storeId: originalStore.id,
        customerId: customer.id,
        serviceOrderId: createdServiceOrder.id,
        description: `OS ${createdServiceOrder.orderNumber}`,
        amount: 4500,
        dueDate: new Date().toISOString().slice(0, 10),
        paymentMethod: "PIX"
      },
      {
        ...auditContext,
        userId: loginSession.user.id,
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "accounts_receivable.linked_service_order",
      passed:
        Boolean(createdReceivable?.id) &&
        createdReceivable.serviceOrder?.id === createdServiceOrder.id
    });

    createdPurchaseOrder = await purchaseOrders.create(
      originalStore.id,
      {
        supplierId: supplier.id,
        notes: "smoke-po",
        items: [
          {
            productId: product.id,
            description: "Reposicao produto comum",
            quantity: 2,
            unitCost: 1400
          },
          {
            productId: serializedProduct.id,
            description: "Reposicao produto serializado",
            quantity: 1,
            unitCost: 3100
          }
        ]
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    createdPurchaseOrder = await purchaseOrders.changeStatus(
      createdPurchaseOrder.id,
      originalStore.id,
      {
        status: "ORDERED"
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "purchase_orders.create_and_order",
      passed:
        Boolean(createdPurchaseOrder?.id) &&
        createdPurchaseOrder.status === "ORDERED" &&
        createdPurchaseOrder.items.length === 2
    });

    createdPayable = await accountsPayable.create(
      {
        storeId: originalStore.id,
        supplierId: supplier.id,
        purchaseOrderId: createdPurchaseOrder.id,
        description: `PO ${createdPurchaseOrder.orderNumber}`,
        amount: createdPurchaseOrder.total,
        dueDate: new Date().toISOString().slice(0, 10),
        paymentMethod: "PIX"
      },
      {
        ...auditContext,
        userId: loginSession.user.id,
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "accounts_payable.linked_purchase_order",
      passed:
        Boolean(createdPayable?.id) &&
        createdPayable.purchaseOrder?.id === createdPurchaseOrder.id
    });

    const summaryBeforeSettlement = await financial.getSummary({
      period: "month"
    });
    report.checks.push({
      name: "financial.summary.linked_entries",
      passed:
        summaryBeforeSettlement.upcoming.payables.some((entry) => entry.id === createdPayable.id) &&
        summaryBeforeSettlement.upcoming.receivables.some((entry) => entry.id === createdReceivable.id)
    });

    const serialPoItem = createdPurchaseOrder.items.find(
      (item) => item.productId === serializedProduct.id
    );
    const bulkPoItem = createdPurchaseOrder.items.find(
      (item) => item.productId === product.id
    );

    if (!serialPoItem || !bulkPoItem) {
      throw new Error("Itens do pedido de compra nao encontrados para o smoke.");
    }

    createdPurchaseOrder = await purchaseOrders.receive(
      createdPurchaseOrder.id,
      originalStore.id,
      {
        items: [
          {
            purchaseOrderItemId: bulkPoItem.id,
            locationId: defaultLocation.id,
            quantity: 2
          },
          {
            purchaseOrderItemId: serialPoItem.id,
            locationId: defaultLocation.id,
            units: [
              {
                imei: `8610${suffix.slice(-10)}`.slice(0, 14),
                imei2: `8620${suffix.slice(-10)}`.slice(0, 14),
                serialNumber: `PO-${suffix}`
              }
            ]
          }
        ]
      },
      {
        ...auditContext,
        userId: loginSession.user.id
      }
    );
    report.checks.push({
      name: "purchase_orders.receive",
      passed: createdPurchaseOrder.status === "RECEIVED"
    });

    const receivedSerialUnit = await prisma.productUnit.findFirst({
      where: {
        productId: serializedProduct.id,
        serialNumber: `PO-${suffix}`
      }
    });
    report.checks.push({
      name: "purchase_orders.receive.serialized_unit_created",
      passed:
        Boolean(receivedSerialUnit?.id) &&
        receivedSerialUnit.currentLocationId === defaultLocation.id
    });

    createdReceivable = await accountsReceivable.receive(
      createdReceivable.id,
      {
        paymentMethod: "PIX"
      },
      {
        ...auditContext,
        userId: loginSession.user.id,
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "accounts_receivable.receive",
      passed: createdReceivable.status === "RECEIVED"
    });

    createdPayable = await accountsPayable.pay(
      createdPayable.id,
      {
        paymentMethod: "PIX"
      },
      {
        ...auditContext,
        userId: loginSession.user.id,
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "accounts_payable.pay",
      passed: createdPayable.status === "PAID"
    });

    const salesReport = await reports.getSalesReport(originalStore.id, {
      search: createdSale.saleNumber,
      take: 20
    });
    report.checks.push({
      name: "reports.sales",
      passed: salesReport.rows.some((row) => row.id === createdSale.id)
    });

    const stockReport = await reports.getStockReport(originalStore.id, {
      search: product.internalCode,
      take: 20
    });
    report.checks.push({
      name: "reports.stock",
      passed: stockReport.rows.some((row) => row.productId === product.id)
    });

    const currentSession = await cash.findCurrentSession();
    const closedSession = await cash.close(
      {
        cashSessionId: createdSession.id,
        closingAmount: currentSession?.calculatedExpectedAmount ?? 19200,
        notes: "smoke-close"
      },
      {
        ...auditContext,
        userId: loginSession.user.id,
        storeId: originalStore.id
      }
    );
    createdSession = closedSession;
    report.checks.push({
      name: "cash.close",
      passed: closedSession.status === "CLOSED" && closedSession.isBalanced === true
    });

    const usersList = await users.findAll({});
    report.checks.push({
      name: "users.findAll",
      passed: Array.isArray(usersList) && usersList.length >= 3
    });

    const rolesList = await roles.findAll();
    report.checks.push({
      name: "roles.findAll",
      passed: Array.isArray(rolesList) && rolesList.length >= 5
    });

    const sellerRole = rolesList.find((role) => role.name === "SELLER");

    if (!sellerRole) {
      throw new Error("Role SELLER nao encontrada no smoke.");
    }

    roleRestore = {
      roleId: sellerRole.id,
      permissions: sellerRole.permissions.map((permission) => permission.permissionKey)
    };

    const updatedRole = await roles.updatePermissions(
      sellerRole.id,
      Array.from(new Set([...roleRestore.permissions, "stores.read"])),
      auditContext
    );
    report.checks.push({
      name: "roles.updatePermissions",
      passed: updatedRole.permissions.some((permission) => permission.permissionKey === "stores.read")
    });
    const persistedRolePermissions = await prisma.rolePermission.findMany({
      where: {
        roleId: sellerRole.id
      }
    });
    report.checks.push({
      name: "roles.persisted",
      passed: persistedRolePermissions.some((permission) => permission.permissionKey === "stores.read")
    });

    createdUser = await users.create(
      {
        name: `Usuario Auditoria ${suffix}`,
        email: `usuario.auditoria.${suffix}@local.test`,
        roleId: sellerRole.id,
        storeId: originalStore.id,
        password: "Auditoria@123",
        mustChangePassword: true
      },
      {
        ...auditContext,
        roleName: "OWNER",
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "users.create",
      passed: Boolean(createdUser?.id)
    });
    const listedUsers = await users.findAll({
      search: suffix,
      storeId: originalStore.id,
      take: 20
    });
    report.checks.push({
      name: "users.list",
      passed: listedUsers.some((item) => item.id === createdUser.id)
    });

    const updatedUser = await users.update(
      createdUser.id,
      {
        name: `Usuario Auditoria Editado ${suffix}`,
        mustChangePassword: false
      },
      {
        ...auditContext,
        roleName: "OWNER",
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "users.update",
      passed:
        updatedUser.name.includes("Editado") && updatedUser.mustChangePassword === false
    });
    const persistedUpdatedUser = await prisma.user.findUnique({
      where: {
        id: createdUser.id
      }
    });
    report.checks.push({
      name: "users.persisted_after_update",
      passed:
        persistedUpdatedUser?.name.includes("Editado") &&
        persistedUpdatedUser?.mustChangePassword === false
    });

    const changedPasswordUser = await users.changePassword(
      createdUser.id,
      {
        newPassword: "Auditoria@456",
        mustChangePassword: false
      },
      {
        ...auditContext,
        roleName: "OWNER",
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "users.changePassword",
      passed: changedPasswordUser.mustChangePassword === false
    });
    createdUserSession = await auth.login(
      {
        email: createdUser.email.toLowerCase(),
        password: "Auditoria@456"
      },
      auditContext
    );
    report.checks.push({
      name: "auth.login.created_user",
      passed:
        typeof createdUserSession.accessToken === "string" &&
        createdUserSession.user.email === createdUser.email
    });
    const meUser = await auth.me(createdUserSession.user.id);
    report.checks.push({
      name: "auth.me.created_user",
      passed:
        meUser.email === createdUser.email &&
        meUser.permissions.includes("stores.read")
    });

    const deactivatedUser = await users.updateActive(
      createdUser.id,
      {
        active: false
      },
      {
        ...auditContext,
        roleName: "OWNER",
        storeId: originalStore.id
      }
    );
    report.checks.push({
      name: "users.updateActive",
      passed: deactivatedUser.active === false
    });
    const persistedDeactivatedUser = await prisma.user.findUnique({
      where: {
        id: createdUser.id
      }
    });
    report.checks.push({
      name: "users.persisted_after_deactivate",
      passed: persistedDeactivatedUser?.active === false
    });
    let deactivatedUserBlocked = false;
    try {
      await auth.login(
        {
          email: createdUser.email.toLowerCase(),
          password: "Auditoria@456"
        },
        auditContext
      );
    } catch (error) {
      deactivatedUserBlocked =
        error instanceof Error && error.message === "Credenciais invalidas.";
    }
    report.checks.push({
      name: "auth.login.inactive_user_blocked",
      passed: deactivatedUserBlocked
    });

    const auditLogs = await audit.findAll({});
    report.checks.push({
      name: "audit.findAll",
      passed: Array.isArray(auditLogs)
    });
  } catch (error) {
    report.ok = false;
    report.errors.push({
      name: "smoke.failure",
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  } finally {
    if (createdUserSession?.refreshToken) {
      await auth
        .logout(
          {
            refreshToken: createdUserSession.refreshToken
          },
          auditContext
        )
        .catch(() => null);
    }

    if (roleRestore?.roleId) {
      await roles
        .updatePermissions(roleRestore.roleId, roleRestore.permissions, auditContext)
        .catch(() => null);
    }

    if (originalStore?.id) {
      await stores
        .updateBranding(
          originalStore.id,
          {
            name: originalStore.name,
            displayName: originalStore.displayName,
            primaryColor: originalStore.primaryColor,
            secondaryColor: originalStore.secondaryColor,
            accentColor: originalStore.accentColor,
            logoUrl: originalStore.logoUrl || undefined,
            bannerUrl: originalStore.bannerUrl || undefined,
            heroBannerEnabled: originalStore.heroBannerEnabled
          },
          auditContext
        )
        .catch(() => null);
    }

    if (createdUser?.id) {
      await prisma.user
        .delete({
          where: {
            id: createdUser.id
          }
        })
        .then(() => report.cleanup.push("user"))
        .catch(() => null);
    }

    if (createdReceivable?.id) {
      await prisma.accountsReceivable
        .delete({
          where: {
            id: createdReceivable.id
          }
        })
        .then(() => report.cleanup.push("accounts-receivable"))
        .catch(() => null);
    }

    if (createdPayable?.id) {
      await prisma.accountsPayable
        .delete({
          where: {
            id: createdPayable.id
          }
        })
        .then(() => report.cleanup.push("accounts-payable"))
        .catch(() => null);
    }

    if (createdPurchaseOrder?.id) {
      await prisma.purchaseOrder
        .delete({
          where: {
            id: createdPurchaseOrder.id
          }
        })
        .then(() => report.cleanup.push("purchase-order"))
        .catch(() => null);
    }

    if (createdServiceOrder?.id) {
      await prisma.serviceOrder
        .delete({
          where: {
            id: createdServiceOrder.id
          }
        })
        .then(() => report.cleanup.push("service-order"))
        .catch(() => null);
    }

    if (createdSale?.id) {
      await prisma.sale
        .delete({
          where: {
            id: createdSale.id
          }
        })
        .then(() => report.cleanup.push("sale"))
        .catch(() => null);
    }

    if (createdSession?.id) {
      await prisma.cashMovement
        .deleteMany({
          where: {
            cashSessionId: createdSession.id
          }
        })
        .catch(() => null);

      await prisma.cashSession
        .delete({
          where: {
            id: createdSession.id
          }
        })
        .then(() => report.cleanup.push("cash-session"))
        .catch(() => null);
    }

    if (createdTerminal?.id) {
      await prisma.cashTerminal
        .delete({
          where: {
            id: createdTerminal.id
          }
        })
        .then(() => report.cleanup.push("cash-terminal"))
        .catch(() => null);
    }

    if (serializedProduct?.id || product?.id) {
      await prisma.stockMovement
        .deleteMany({
          where: {
            productId: {
              in: [serializedProduct?.id, product?.id].filter(Boolean)
            }
          }
        })
        .catch(() => null);

      await prisma.stockBalance
        .deleteMany({
          where: {
            productId: {
              in: [serializedProduct?.id, product?.id].filter(Boolean)
            }
          }
        })
        .catch(() => null);

      if (serializedProduct?.id) {
        await prisma.productUnit
          .deleteMany({
            where: {
              productId: serializedProduct.id
            }
          })
          .catch(() => null);
      }
    }

    if (product?.id) {
      await prisma.product
        .delete({
          where: {
            id: product.id
          }
        })
        .then(() => report.cleanup.push("product"))
        .catch(() => null);
    }

    if (serializedProduct?.id) {
      await prisma.product
        .delete({
          where: {
            id: serializedProduct.id
          }
        })
        .then(() => report.cleanup.push("serialized-product"))
        .catch(() => null);
    }

    if (secondaryLocation?.id) {
      await prisma.stockLocation
        .delete({
          where: {
            id: secondaryLocation.id
          }
        })
        .then(() => report.cleanup.push("stock-location"))
        .catch(() => null);
    }

    if (category?.id) {
      await prisma.category
        .delete({
          where: {
            id: category.id
          }
        })
        .then(() => report.cleanup.push("category"))
        .catch(() => null);
    }

    if (supplier?.id) {
      await prisma.supplier
        .delete({
          where: {
            id: supplier.id
          }
        })
        .then(() => report.cleanup.push("supplier"))
        .catch(() => null);
    }

    if (customer?.id) {
      await prisma.customer
        .delete({
          where: {
            id: customer.id
          }
        })
        .then(() => report.cleanup.push("customer"))
        .catch(() => null);
    }

    await prisma.$disconnect().catch(() => null);
  }

  console.log(JSON.stringify(report, null, 2));

  process.exit(report.ok && !report.checks.some((check) => !check.passed) ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
