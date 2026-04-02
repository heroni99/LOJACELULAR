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
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { CustomersService } from "./customers.service";

@Controller("customers")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @RequirePermissions("customers.read")
  @Get()
  async findAll(@Query() filters: ListEntitiesDto) {
    return this.customersService.findAll(filters);
  }

  @RequirePermissions("customers.create")
  @Post()
  async create(
    @Body() payload: CreateCustomerDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.customersService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("customers.read")
  @Get(":id")
  async findById(@Param("id") id: string) {
    return this.customersService.findById(id);
  }

  @RequirePermissions("customers.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateCustomerDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.customersService.update(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("customers.update")
  @Delete(":id")
  async remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.customersService.remove(id, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
