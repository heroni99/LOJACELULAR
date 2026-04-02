import { Module } from "@nestjs/common";
import { HealthModule } from "./health/health.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AccountsPayableModule } from "./modules/accounts-payable/accounts-payable.module";
import { AccountsReceivableModule } from "./modules/accounts-receivable/accounts-receivable.module";
import { CashModule } from "./modules/cash/cash.module";
import { CategoriesModule } from "./modules/categories/categories.module";
import { CustomersModule } from "./modules/customers/customers.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { FiscalModule } from "./modules/fiscal/fiscal.module";
import { FinancialModule } from "./modules/financial/financial.module";
import { InventoryModule } from "./modules/inventory/inventory.module";
import { PdvModule } from "./modules/pdv/pdv.module";
import { ProductsModule } from "./modules/products/products.module";
import { PurchaseOrdersModule } from "./modules/purchase-orders/purchase-orders.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { RolesModule } from "./modules/roles/roles.module";
import { SaleReturnsModule } from "./modules/sale-returns/sale-returns.module";
import { SalesModule } from "./modules/sales/sales.module";
import { ScannerSessionsModule } from "./modules/scanner-sessions/scanner-sessions.module";
import { ServiceOrdersModule } from "./modules/service-orders/service-orders.module";
import { StoresModule } from "./modules/stores/stores.module";
import { SuppliersModule } from "./modules/suppliers/suppliers.module";
import { UsersModule } from "./modules/users/users.module";
import { PrismaModule } from "./prisma/prisma.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthModule,
    AuditModule,
    AccountsPayableModule,
    AccountsReceivableModule,
    CashModule,
    DashboardModule,
    FiscalModule,
    FinancialModule,
    InventoryModule,
    StoresModule,
    CategoriesModule,
    SuppliersModule,
    CustomersModule,
    ProductsModule,
    ServiceOrdersModule,
    PurchaseOrdersModule,
    SaleReturnsModule,
    PdvModule,
    ReportsModule,
    SalesModule,
    ScannerSessionsModule,
    RolesModule,
    UsersModule
  ]
})
export class AppModule {}
