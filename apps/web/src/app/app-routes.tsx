import { Navigate, Route, Routes } from "react-router-dom";
import type { ReactElement } from "react";
import type { PermissionKey } from "@/shared";
import { AppShell } from "./app-shell";
import { resolveDefaultRoute } from "./navigation";
import { useAppSession } from "./session-context";
import { CategoriesPage } from "@/pages/categories-page";
import { CustomersPage } from "@/pages/customers-page";
import { CashPage } from "@/pages/cash/cash-page";
import { DashboardPage } from "@/pages/dashboard-page";
import { FiscalPage } from "@/pages/fiscal/fiscal-page";
import { AccountsPayablePage } from "@/pages/finance/accounts-payable-page";
import { AccountsReceivablePage } from "@/pages/finance/accounts-receivable-page";
import { FinancialSummaryPage } from "@/pages/finance/financial-summary-page";
import { InventoryAdjustmentPage } from "@/pages/inventory-adjustment-page";
import { InventoryEntryPage } from "@/pages/inventory-entry-page";
import { InventoryPage } from "@/pages/inventory-page";
import { InventoryTransferPage } from "@/pages/inventory-transfer-page";
import { InventoryUnitsPage } from "@/pages/inventory-units-page";
import { NotFoundPage } from "@/pages/not-found-page";
import { PdvPage } from "@/pages/pdv/pdv-page";
import { ProductDetailPage } from "@/pages/products/product-detail-page";
import { ProductFormPage } from "@/pages/products/product-form-page";
import { ProductLabelPrintPage } from "@/pages/products/product-label-print-page";
import { ProductsListPage } from "@/pages/products/products-list-page";
import { PurchaseOrderDetailPage } from "@/pages/purchase-orders/purchase-order-detail-page";
import { PurchaseOrderFormPage } from "@/pages/purchase-orders/purchase-order-form-page";
import { PurchaseOrdersListPage } from "@/pages/purchase-orders/purchase-orders-list-page";
import { CashReportPage } from "@/pages/reports/cash-report-page";
import { CustomersReportPage } from "@/pages/reports/customers-report-page";
import { ReportsHubPage } from "@/pages/reports/reports-hub-page";
import { SalesReportPage } from "@/pages/reports/sales-report-page";
import { StockReportPage } from "@/pages/reports/stock-report-page";
import { SaleReturnDetailPage } from "@/pages/sale-returns/sale-return-detail-page";
import { SaleReturnFormPage } from "@/pages/sale-returns/sale-return-form-page";
import { SaleReturnsListPage } from "@/pages/sale-returns/sale-returns-list-page";
import { SaleDetailPage } from "@/pages/sales/sale-detail-page";
import { SalesListPage } from "@/pages/sales/sales-list-page";
import { ServiceOrderDetailPage } from "@/pages/service-orders/service-order-detail-page";
import { ServiceOrderFormPage } from "@/pages/service-orders/service-order-form-page";
import { ServiceOrdersListPage } from "@/pages/service-orders/service-orders-list-page";
import { StockLocationsPage } from "@/pages/stock-locations-page";
import { StoreSettingsPage } from "@/pages/store-settings-page";
import { SuppliersPage } from "@/pages/suppliers-page";
import { UnauthorizedPage } from "@/pages/unauthorized-page";

export function AppRoutes() {
  const { hasPermission } = useAppSession();
  const defaultRoute = resolveDefaultRoute(hasPermission);

  return (
    <Routes>
      <Route element={<AppShell />} path="/">
        <Route element={<Navigate replace to={defaultRoute} />} index />
        <Route
          element={
            <PermissionRoute permission="reports.read">
              <DashboardPage />
            </PermissionRoute>
          }
          path="dashboard"
        />
        <Route
          element={
            <PermissionRoute permission="products.read">
              <ProductsListPage catalogMode="product" />
            </PermissionRoute>
          }
          path="products"
        />
        <Route
          element={
            <PermissionRoute permission="products.create">
              <ProductFormPage catalogMode="product" />
            </PermissionRoute>
          }
          path="products/new"
        />
        <Route
          element={
            <PermissionRoute permission="products.read">
              <ProductDetailPage catalogMode="product" />
            </PermissionRoute>
          }
          path="products/:id"
        />
        <Route
          element={
            <PermissionRoute permission="products.read">
              <ProductLabelPrintPage />
            </PermissionRoute>
          }
          path="products/:id/label"
        />
        <Route
          element={
            <PermissionRoute permission="products.update">
              <ProductFormPage catalogMode="product" />
            </PermissionRoute>
          }
          path="products/:id/edit"
        />
        <Route
          element={
            <PermissionRoute permission="products.read">
              <ProductsListPage catalogMode="service" />
            </PermissionRoute>
          }
          path="services"
        />
        <Route
          element={
            <PermissionRoute permission="products.create">
              <ProductFormPage catalogMode="service" />
            </PermissionRoute>
          }
          path="services/new"
        />
        <Route
          element={
            <PermissionRoute permission="products.read">
              <ProductDetailPage catalogMode="service" />
            </PermissionRoute>
          }
          path="services/:id"
        />
        <Route
          element={
            <PermissionRoute permission="products.update">
              <ProductFormPage catalogMode="service" />
            </PermissionRoute>
          }
          path="services/:id/edit"
        />
        <Route
          element={
            <PermissionRoute permission="customers.read">
              <CustomersPage />
            </PermissionRoute>
          }
          path="customers"
        />
        <Route
          element={
            <PermissionRoute permission="suppliers.read">
              <SuppliersPage />
            </PermissionRoute>
          }
          path="suppliers"
        />
        <Route
          element={
            <PermissionRoute permission="categories.read">
              <CategoriesPage />
            </PermissionRoute>
          }
          path="categories"
        />
        <Route
          element={
            <PermissionRoute permission="inventory.read">
              <InventoryPage />
            </PermissionRoute>
          }
          path="inventory"
        />
        <Route
          element={
            <PermissionRoute permission="inventory.entry">
              <InventoryEntryPage />
            </PermissionRoute>
          }
          path="inventory/entry"
        />
        <Route
          element={
            <PermissionRoute permission="inventory.adjust">
              <InventoryAdjustmentPage />
            </PermissionRoute>
          }
          path="inventory/adjustment"
        />
        <Route
          element={
            <PermissionRoute permission="inventory.transfer">
              <InventoryTransferPage />
            </PermissionRoute>
          }
          path="inventory/transfer"
        />
        <Route
          element={
            <PermissionRoute permission="inventory.read">
              <InventoryUnitsPage />
            </PermissionRoute>
          }
          path="inventory/units"
        />
        <Route
          element={
            <PermissionRoute permission="inventory.read">
              <StockLocationsPage />
            </PermissionRoute>
          }
          path="stock-locations"
        />
        <Route
          element={
            <PermissionRoute permission="cash.read">
              <CashPage />
            </PermissionRoute>
          }
          path="cash"
        />
        <Route
          element={
            <PermissionRoute permission="sales.checkout">
              <PdvPage />
            </PermissionRoute>
          }
          path="pdv"
        />
        <Route
          element={
            <PermissionRoute permission="sales.read">
              <SalesListPage />
            </PermissionRoute>
          }
          path="sales"
        />
        <Route
          element={
            <PermissionRoute permission="sales.read">
              <SaleDetailPage />
            </PermissionRoute>
          }
          path="sales/:id"
        />
        <Route
          element={
            <PermissionRoute permission="financial.read">
              <FinancialSummaryPage />
            </PermissionRoute>
          }
          path="financial"
        />
        <Route
          element={
            <PermissionRoute permission="accounts-payable.read">
              <AccountsPayablePage />
            </PermissionRoute>
          }
          path="accounts-payable"
        />
        <Route
          element={
            <PermissionRoute permission="accounts-receivable.read">
              <AccountsReceivablePage />
            </PermissionRoute>
          }
          path="accounts-receivable"
        />
        <Route
          element={
            <PermissionRoute permission="reports.read">
              <ReportsHubPage />
            </PermissionRoute>
          }
          path="reports"
        />
        <Route
          element={
            <PermissionRoute permission="fiscal.read">
              <FiscalPage />
            </PermissionRoute>
          }
          path="fiscal"
        />
        <Route
          element={
            <PermissionRoute permission="service-orders.read">
              <ServiceOrdersListPage />
            </PermissionRoute>
          }
          path="service-orders"
        />
        <Route
          element={
            <PermissionRoute permission="service-orders.create">
              <ServiceOrderFormPage />
            </PermissionRoute>
          }
          path="service-orders/new"
        />
        <Route
          element={
            <PermissionRoute permission="service-orders.read">
              <ServiceOrderDetailPage />
            </PermissionRoute>
          }
          path="service-orders/:id"
        />
        <Route
          element={
            <PermissionRoute permission="purchase-orders.read">
              <PurchaseOrdersListPage />
            </PermissionRoute>
          }
          path="purchase-orders"
        />
        <Route
          element={
            <PermissionRoute permission="purchase-orders.create">
              <PurchaseOrderFormPage />
            </PermissionRoute>
          }
          path="purchase-orders/new"
        />
        <Route
          element={
            <PermissionRoute permission="purchase-orders.read">
              <PurchaseOrderDetailPage />
            </PermissionRoute>
          }
          path="purchase-orders/:id"
        />
        <Route
          element={
            <PermissionRoute permission="sale-returns.read">
              <SaleReturnsListPage />
            </PermissionRoute>
          }
          path="sale-returns"
        />
        <Route
          element={
            <PermissionRoute permission="sale-returns.create">
              <SaleReturnFormPage />
            </PermissionRoute>
          }
          path="sale-returns/new"
        />
        <Route
          element={
            <PermissionRoute permission="sale-returns.read">
              <SaleReturnDetailPage />
            </PermissionRoute>
          }
          path="sale-returns/:id"
        />
        <Route
          element={
            <PermissionRoute permission="reports.read">
              <SalesReportPage />
            </PermissionRoute>
          }
          path="reports/sales"
        />
        <Route
          element={
            <PermissionRoute permission="reports.read">
              <StockReportPage />
            </PermissionRoute>
          }
          path="reports/stock"
        />
        <Route
          element={
            <PermissionRoute permission="reports.read">
              <CashReportPage />
            </PermissionRoute>
          }
          path="reports/cash"
        />
        <Route
          element={
            <PermissionRoute permission="reports.read">
              <CustomersReportPage />
            </PermissionRoute>
          }
          path="reports/customers"
        />
        <Route
          element={
            <PermissionRoute permission="stores.read">
              <StoreSettingsPage />
            </PermissionRoute>
          }
          path="settings/store"
        />
        <Route element={<UnauthorizedPage />} path="unauthorized" />
        <Route element={<NotFoundPage />} path="*" />
      </Route>
    </Routes>
  );
}

function PermissionRoute({
  permission,
  children
}: {
  permission: PermissionKey;
  children: ReactElement;
}) {
  const { hasPermission } = useAppSession();

  if (!hasPermission(permission)) {
    return <Navigate replace to="/unauthorized" />;
  }

  return children;
}
