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
import { AccountsReceivableService } from "./accounts-receivable.service";
import { CreateAccountsReceivableDto } from "./dto/create-accounts-receivable.dto";
import { ListAccountsReceivableDto } from "./dto/list-accounts-receivable.dto";
import { ReceiveAccountsReceivableDto } from "./dto/receive-accounts-receivable.dto";
import { UpdateAccountsReceivableDto } from "./dto/update-accounts-receivable.dto";

@Controller("accounts-receivable")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountsReceivableController {
  constructor(private readonly accountsReceivableService: AccountsReceivableService) {}

  @RequirePermissions("accounts-receivable.read")
  @Get()
  async findAll(@Query() filters: ListAccountsReceivableDto) {
    return this.accountsReceivableService.findAll(filters);
  }

  @RequirePermissions("accounts-receivable.create")
  @Post()
  async create(
    @Body() payload: CreateAccountsReceivableDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.accountsReceivableService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("accounts-receivable.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateAccountsReceivableDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.accountsReceivableService.update(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("accounts-receivable.receive")
  @Post(":id/receive")
  async receive(
    @Param("id") id: string,
    @Body() payload: ReceiveAccountsReceivableDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.accountsReceivableService.receive(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
