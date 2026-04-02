import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { GetFinancialSummaryDto } from "./dto/get-financial-summary.dto";
import { FinancialService } from "./financial.service";

@Controller("financial")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FinancialController {
  constructor(private readonly financialService: FinancialService) {}

  @RequirePermissions("financial.read")
  @Get("summary")
  async getSummary(@Query() filters: GetFinancialSummaryDto) {
    return this.financialService.getSummary(filters);
  }
}
