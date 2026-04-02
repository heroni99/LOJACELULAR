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
import { CreateInventoryAdjustmentDto } from "./dto/create-inventory-adjustment.dto";
import { CreateInventoryEntryDto } from "./dto/create-inventory-entry.dto";
import { CreateInventoryTransferDto } from "./dto/create-inventory-transfer.dto";
import { CreateProductUnitsDto } from "./dto/create-product-units.dto";
import { ListInventoryBalancesDto } from "./dto/list-inventory-balances.dto";
import { ListInventoryMovementsDto } from "./dto/list-inventory-movements.dto";
import { ListProductUnitsDto } from "./dto/list-product-units.dto";
import { TransferProductUnitDto } from "./dto/transfer-product-unit.dto";
import { UpdateProductUnitDto } from "./dto/update-product-unit.dto";
import { InventoryService } from "./inventory.service";

@Controller("inventory")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @RequirePermissions("inventory.read")
  @Get("balances")
  async listBalances(
    @Query() filters: ListInventoryBalancesDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.listBalances(request.authUser!.storeId, filters);
  }

  @RequirePermissions("inventory.read")
  @Get("movements")
  async listMovements(
    @Query() filters: ListInventoryMovementsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.listMovements(request.authUser!.storeId, filters);
  }

  @RequirePermissions("inventory.entry")
  @Post("entries")
  async createEntry(
    @Body() payload: CreateInventoryEntryDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.createEntry(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("inventory.adjust")
  @Post("adjustments")
  async createAdjustment(
    @Body() payload: CreateInventoryAdjustmentDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.createAdjustment(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("inventory.transfer")
  @Post("transfers")
  async createTransfer(
    @Body() payload: CreateInventoryTransferDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.createTransfer(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("inventory.read")
  @Get("units")
  async listUnits(
    @Query() filters: ListProductUnitsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.listUnits(request.authUser!.storeId, filters);
  }

  @RequirePermissions("inventory.entry")
  @Post("units")
  async createUnits(
    @Body() payload: CreateProductUnitsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.inventoryService.createUnits(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("inventory.transfer")
  @Post("units/:id/transfer")
  async moveUnit(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() payload: TransferProductUnitDto
  ) {
    return this.inventoryService.transferUnit(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("inventory.adjust")
  @Patch("units/:id")
  async updateUnit(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest,
    @Body() payload: UpdateProductUnitDto
  ) {
    return this.inventoryService.updateUnit(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
