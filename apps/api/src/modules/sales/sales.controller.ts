import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CheckoutSaleDto } from "./dto/checkout-sale.dto";
import { ListSalesDto } from "./dto/list-sales.dto";
import { SalesService } from "./sales.service";

@Controller("sales")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @RequirePermissions("sales.read")
  @Get()
  async findAll(@Query() filters: ListSalesDto, @Req() request: AuthenticatedRequest) {
    return this.salesService.findAll(request.authUser!.storeId, filters);
  }

  @RequirePermissions("sales.checkout")
  @Post("checkout")
  async checkout(
    @Body() payload: CheckoutSaleDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.salesService.checkout(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("sales.read")
  @Get(":id")
  async findById(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.salesService.findById(id, request.authUser!.storeId);
  }
}
