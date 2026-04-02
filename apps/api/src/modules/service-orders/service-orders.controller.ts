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
import { ChangeServiceOrderStatusDto } from "./dto/change-service-order-status.dto";
import { ConsumeServiceOrderItemDto } from "./dto/consume-service-order-item.dto";
import { CreateServiceOrderDto } from "./dto/create-service-order.dto";
import { ListServiceOrdersDto } from "./dto/list-service-orders.dto";
import { UpdateServiceOrderDto } from "./dto/update-service-order.dto";
import { ServiceOrdersService } from "./service-orders.service";

@Controller("service-orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ServiceOrdersController {
  constructor(private readonly serviceOrdersService: ServiceOrdersService) {}

  @RequirePermissions("service-orders.read")
  @Get()
  async findAll(
    @Query() filters: ListServiceOrdersDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.findAll(request.authUser!.storeId, filters);
  }

  @RequirePermissions("service-orders.read")
  @Get(":id")
  async findById(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.serviceOrdersService.findById(id, request.authUser!.storeId);
  }

  @RequirePermissions("service-orders.create")
  @Post()
  async create(
    @Body() payload: CreateServiceOrderDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.create(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("service-orders.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateServiceOrderDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.update(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("service-orders.update")
  @Post(":id/status")
  async changeStatus(
    @Param("id") id: string,
    @Body() payload: ChangeServiceOrderStatusDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.changeStatus(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("service-orders.update")
  @Post(":id/items/:itemId/consume")
  async consumeItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() payload: ConsumeServiceOrderItemDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.consumeItem(
      id,
      itemId,
      request.authUser!.storeId,
      payload,
      {
        userId: request.authUser?.sub ?? null,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      }
    );
  }
}
