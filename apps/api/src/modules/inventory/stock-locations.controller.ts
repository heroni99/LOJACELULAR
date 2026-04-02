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
import { CreateStockLocationDto } from "./dto/create-stock-location.dto";
import { ListStockLocationsDto } from "./dto/list-stock-locations.dto";
import { UpdateStockLocationDto } from "./dto/update-stock-location.dto";
import { InventoryService } from "./inventory.service";

@Controller("stock-locations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StockLocationsController {
  constructor(private readonly inventoryService: InventoryService) {}

  @RequirePermissions("inventory.read")
  @Get()
  async findAll(
    @Query() filters: ListStockLocationsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.listStockLocations(request.authUser!.storeId, filters);
  }

  @RequirePermissions("inventory.adjust")
  @Post()
  async create(
    @Body() payload: CreateStockLocationDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.createStockLocation(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("inventory.adjust")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateStockLocationDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.updateStockLocation(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
