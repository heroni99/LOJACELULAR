import { Body, Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CommissionsService } from "./commissions.service";
import { CommissionPeriodDto } from "./dto/commission-period.dto";
import { CreateCommissionDto } from "./dto/create-commission.dto";
import { UpsertSalesTargetDto } from "./dto/upsert-sales-target.dto";

@Controller("commissions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommissionsController {
  constructor(private readonly commissionsService: CommissionsService) {}

  @RequirePermissions("commissions.read")
  @Get("my-summary")
  async getMySummary(
    @Query() filters: CommissionPeriodDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.commissionsService.getMySummary(
      request.authUser!.sub,
      request.authUser!.storeId,
      filters
    );
  }

  @RequirePermissions("commissions.manage")
  @Get("team-summary")
  async getTeamSummary(
    @Query() filters: CommissionPeriodDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.commissionsService.getTeamSummary(request.authUser!.storeId, filters);
  }

  @RequirePermissions("commissions.manage")
  @Post()
  async create(
    @Body() payload: CreateCommissionDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.commissionsService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("commissions.manage")
  @Get("targets")
  async getTargets(
    @Query() filters: CommissionPeriodDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.commissionsService.getTargets(request.authUser!.storeId, filters);
  }

  @RequirePermissions("commissions.manage")
  @Post("targets")
  async upsertTarget(
    @Body() payload: UpsertSalesTargetDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.commissionsService.upsertTarget(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
