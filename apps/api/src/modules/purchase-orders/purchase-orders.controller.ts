import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ChangePurchaseOrderStatusDto } from "./dto/change-purchase-order-status.dto";
import { CreatePurchaseOrderDto } from "./dto/create-purchase-order.dto";
import { ListPurchaseOrdersDto } from "./dto/list-purchase-orders.dto";
import { ReceivePurchaseOrderDto } from "./dto/receive-purchase-order.dto";
import { UpdatePurchaseOrderDto } from "./dto/update-purchase-order.dto";
import { PurchaseOrdersService } from "./purchase-orders.service";

@Controller("purchase-orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @RequirePermissions("purchase-orders.read")
  @Get()
  async findAll(
    @Query() filters: ListPurchaseOrdersDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.purchaseOrdersService.findAll(request.authUser!.storeId, filters);
  }

  @RequirePermissions("purchase-orders.read")
  @Get(":id")
  async findById(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.purchaseOrdersService.findById(id, request.authUser!.storeId);
  }

  @RequirePermissions("purchase-orders.create")
  @Post()
  async create(
    @Body() payload: CreatePurchaseOrderDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.purchaseOrdersService.create(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("purchase-orders.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdatePurchaseOrderDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.purchaseOrdersService.update(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("purchase-orders.update")
  @Post(":id/status")
  async changeStatus(
    @Param("id") id: string,
    @Body() payload: ChangePurchaseOrderStatusDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.purchaseOrdersService.changeStatus(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("purchase-orders.receive")
  @Post(":id/receive")
  async receive(
    @Param("id") id: string,
    @Body() payload: ReceivePurchaseOrderDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.purchaseOrdersService.receive(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
