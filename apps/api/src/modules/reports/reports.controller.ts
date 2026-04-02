import { Controller, Get, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import { AuthenticatedRequest } from "../../common/auth-request";
import { AuditService } from "../audit/audit.service";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CashReportFiltersDto } from "./dto/cash-report-filters.dto";
import { CustomerReportFiltersDto } from "./dto/customer-report-filters.dto";
import { SalesReportFiltersDto } from "./dto/sales-report-filters.dto";
import { StockReportFiltersDto } from "./dto/stock-report-filters.dto";
import { ReportsService } from "./reports.service";

@Controller("reports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly auditService: AuditService
  ) {}

  @RequirePermissions("reports.read")
  @Get("sales")
  async getSalesReport(
    @Query() filters: SalesReportFiltersDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.reportsService.getSalesReport(
      request.authUser?.storeId,
      filters
    );

    if (filters.format === "csv") {
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="sales-report.csv"'
      );
    }

    await this.logReport("sales", filters, request);

    return result;
  }

  @RequirePermissions("reports.read")
  @Get("stock")
  async getStockReport(
    @Query() filters: StockReportFiltersDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.reportsService.getStockReport(
      request.authUser?.storeId,
      filters
    );

    if (filters.format === "csv") {
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="stock-report.csv"'
      );
    }

    await this.logReport("stock", filters, request);

    return result;
  }

  @RequirePermissions("reports.read")
  @Get("cash")
  async getCashReport(
    @Query() filters: CashReportFiltersDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.reportsService.getCashReport(
      request.authUser?.storeId,
      filters
    );

    if (filters.format === "csv") {
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="cash-report.csv"'
      );
    }

    await this.logReport("cash", filters, request);

    return result;
  }

  @RequirePermissions("reports.read")
  @Get("customers")
  async getCustomerReport(
    @Query() filters: CustomerReportFiltersDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ) {
    const result = await this.reportsService.getCustomerReport(
      request.authUser?.storeId,
      filters
    );

    if (filters.format === "csv") {
      response.setHeader("Content-Type", "text/csv; charset=utf-8");
      response.setHeader(
        "Content-Disposition",
        'attachment; filename="customers-report.csv"'
      );
    }

    await this.logReport("customers", filters, request);

    return result;
  }

  private async logReport(
    reportName: string,
    filters: unknown,
    request: AuthenticatedRequest
  ) {
    await this.auditService.log({
      storeId: request.authUser?.storeId ?? null,
      userId: request.authUser?.sub ?? null,
      action: "reports.generated",
      entity: "reports",
      metadata: JSON.parse(
        JSON.stringify({
          reportName,
          filters
        })
      ) as Prisma.InputJsonValue,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
