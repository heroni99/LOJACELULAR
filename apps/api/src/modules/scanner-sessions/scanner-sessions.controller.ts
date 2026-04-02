import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CreateScannerSessionDto } from "./dto/create-scanner-session.dto";
import { PairScannerSessionDto } from "./dto/pair-scanner-session.dto";
import { ScannerSessionsGateway } from "./scanner-sessions.gateway";
import { ScannerSessionsService } from "./scanner-sessions.service";

@Controller("scanner-sessions")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ScannerSessionsController {
  constructor(
    private readonly scannerSessionsService: ScannerSessionsService,
    private readonly scannerSessionsGateway: ScannerSessionsGateway
  ) {}

  @RequirePermissions("sales.checkout")
  @Post()
  async create(
    @Body() payload: CreateScannerSessionDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.scannerSessionsService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @Public()
  @Post("pair")
  async pair(@Body() payload: PairScannerSessionDto) {
    return this.scannerSessionsService.pair(payload);
  }

  @RequirePermissions("sales.checkout")
  @Get(":id/status")
  async findStatus(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.scannerSessionsService.findStatus(id, {
      storeId: request.authUser?.storeId ?? null
    });
  }

  @RequirePermissions("sales.checkout")
  @Post(":id/disconnect")
  async disconnect(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    const session = await this.scannerSessionsService.disconnect(id, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });

    await this.scannerSessionsGateway.closeSession(id, session);

    return session;
  }
}
