import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CashDepositDto } from "./dto/cash-deposit.dto";
import { CashWithdrawalDto } from "./dto/cash-withdrawal.dto";
import { CloseCashSessionDto } from "./dto/close-cash-session.dto";
import { CreateCashTerminalDto } from "./dto/create-cash-terminal.dto";
import { OpenCashSessionDto } from "./dto/open-cash-session.dto";
import { UpdateCashTerminalActiveDto } from "./dto/update-cash-terminal-active.dto";
import { UpdateCashTerminalDto } from "./dto/update-cash-terminal.dto";
import { CashService } from "./cash.service";

@Controller("cash")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CashController {
  constructor(private readonly cashService: CashService) {}

  @RequirePermissions("cash.read")
  @Get("terminals")
  async findTerminals() {
    return this.cashService.findTerminals();
  }

  @RequirePermissions("cash.open")
  @Post("terminals")
  async createTerminal(
    @Body() payload: CreateCashTerminalDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.cashService.createTerminal(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("cash.open")
  @Patch("terminals/:id")
  async updateTerminal(
    @Param("id") id: string,
    @Body() payload: UpdateCashTerminalDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.cashService.updateTerminal(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("cash.open")
  @Patch("terminals/:id/active")
  async updateTerminalActive(
    @Param("id") id: string,
    @Body() payload: UpdateCashTerminalActiveDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.cashService.updateTerminalActive(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("cash.read")
  @Get("current-session")
  async findCurrentSession(@Req() request: AuthenticatedRequest) {
    return this.cashService.findCurrentSession(request.authUser?.storeId ?? null);
  }

  @RequirePermissions("cash.open")
  @Post("open")
  async open(
    @Body() payload: OpenCashSessionDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.cashService.open(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("cash.move")
  @Post("deposit")
  async deposit(
    @Body() payload: CashDepositDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.cashService.deposit(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("cash.move")
  @Post("withdrawal")
  async withdrawal(
    @Body() payload: CashWithdrawalDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.cashService.withdrawal(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("cash.close")
  @Post("close")
  async close(
    @Body() payload: CloseCashSessionDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.cashService.close(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("cash.read")
  @Get("history")
  async findHistory() {
    return this.cashService.findHistory();
  }

  @RequirePermissions("cash.read")
  @Get("sessions/:id")
  async findSessionById(@Param("id") id: string) {
    return this.cashService.findSessionById(id);
  }
}
