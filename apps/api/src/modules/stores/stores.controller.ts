import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards
} from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { UpdateStoreBrandingDto } from "./dto/update-store-branding.dto";
import { StoresService } from "./stores.service";

@Controller("stores")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StoresController {
  constructor(private readonly storesService: StoresService) {}

  @RequirePermissions("stores.read")
  @Get()
  async findAll() {
    return this.storesService.findAll();
  }

  @Public()
  @Get("current")
  async findCurrent() {
    return this.storesService.findDefaultStore();
  }

  @RequirePermissions("stores.read")
  @Get(":id")
  async findById(@Param("id") id: string) {
    return this.storesService.findById(id);
  }

  @RequirePermissions("stores.update")
  @Patch(":id/settings")
  async updateBranding(
    @Param("id") id: string,
    @Body() payload: UpdateStoreBrandingDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.storesService.updateBranding(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
