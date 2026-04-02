import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CreateSaleReturnDto } from "./dto/create-sale-return.dto";
import { ListSaleReturnsDto } from "./dto/list-sale-returns.dto";
import { SaleReturnsService } from "./sale-returns.service";

@Controller("sale-returns")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SaleReturnsController {
  constructor(private readonly saleReturnsService: SaleReturnsService) {}

  @RequirePermissions("sale-returns.read")
  @Get()
  async findAll(
    @Query() filters: ListSaleReturnsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.saleReturnsService.findAll(request.authUser!.storeId, filters);
  }

  @RequirePermissions("sale-returns.read")
  @Get(":id")
  async findById(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.saleReturnsService.findById(id, request.authUser!.storeId);
  }

  @RequirePermissions("sale-returns.create")
  @Post()
  async create(
    @Body() payload: CreateSaleReturnDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.saleReturnsService.create(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
