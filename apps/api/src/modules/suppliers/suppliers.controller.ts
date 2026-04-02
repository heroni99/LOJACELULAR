import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { ListEntitiesDto } from "../../common/dto/list-entities.dto";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CreateSupplierDto } from "./dto/create-supplier.dto";
import { UpdateSupplierDto } from "./dto/update-supplier.dto";
import { SuppliersService } from "./suppliers.service";

@Controller("suppliers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @RequirePermissions("suppliers.read")
  @Get()
  async findAll(@Query() filters: ListEntitiesDto) {
    return this.suppliersService.findAll(filters);
  }

  @RequirePermissions("suppliers.create")
  @Post()
  async create(
    @Body() payload: CreateSupplierDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.suppliersService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("suppliers.read")
  @Get(":id")
  async findById(@Param("id") id: string) {
    return this.suppliersService.findById(id);
  }

  @RequirePermissions("suppliers.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateSupplierDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.suppliersService.update(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("suppliers.update")
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.suppliersService.remove(id, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
