import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { GetDashboardInsightsDto } from "./dto/get-dashboard-insights.dto";
import { GetDashboardLowStockDto } from "./dto/get-dashboard-low-stock.dto";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @RequirePermissions("reports.read")
  @Get("summary")
  async getSummary() {
    return this.dashboardService.getSummary();
  }

  @RequirePermissions("reports.read")
  @Get("top-products")
  async getTopProducts(@Query() filters: GetDashboardInsightsDto) {
    return this.dashboardService.getTopProducts(filters);
  }

  @RequirePermissions("reports.read")
  @Get("low-stock")
  async getLowStock(@Query() filters: GetDashboardLowStockDto) {
    return this.dashboardService.getLowStock(filters);
  }

  @RequirePermissions("reports.read")
  @Get("sales-chart")
  async getSalesChart(@Query() filters: GetDashboardInsightsDto) {
    return this.dashboardService.getSalesChart(filters);
  }
}
