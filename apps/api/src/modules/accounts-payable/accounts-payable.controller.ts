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
import { AccountsPayableService } from "./accounts-payable.service";
import { CreateAccountsPayableDto } from "./dto/create-accounts-payable.dto";
import { ListAccountsPayableDto } from "./dto/list-accounts-payable.dto";
import { PayAccountsPayableDto } from "./dto/pay-accounts-payable.dto";
import { UpdateAccountsPayableDto } from "./dto/update-accounts-payable.dto";

@Controller("accounts-payable")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountsPayableController {
  constructor(private readonly accountsPayableService: AccountsPayableService) {}

  @RequirePermissions("accounts-payable.read")
  @Get()
  async findAll(@Query() filters: ListAccountsPayableDto) {
    return this.accountsPayableService.findAll(filters);
  }

  @RequirePermissions("accounts-payable.create")
  @Post()
  async create(
    @Body() payload: CreateAccountsPayableDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.accountsPayableService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("accounts-payable.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateAccountsPayableDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.accountsPayableService.update(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("accounts-payable.pay")
  @Post(":id/pay")
  async pay(
    @Param("id") id: string,
    @Body() payload: PayAccountsPayableDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.accountsPayableService.pay(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
