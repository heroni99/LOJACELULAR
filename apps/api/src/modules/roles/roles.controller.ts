import { Body, Controller, Get, Param, Patch, Req, UseGuards } from "@nestjs/common";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { UpdateRolePermissionsDto } from "./dto/update-role-permissions.dto";
import { RolesService } from "./roles.service";

@Controller("roles")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermissions("roles.read")
  @Get()
  async findAll() {
    return this.rolesService.findAll();
  }

  @RequirePermissions("roles.read")
  @Get(":id")
  async findById(@Param("id") id: string) {
    return this.rolesService.findById(id);
  }

  @RequirePermissions("roles.update")
  @Patch(":id/permissions")
  async updatePermissions(
    @Param("id") id: string,
    @Body() payload: UpdateRolePermissionsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.rolesService.updatePermissions(id, payload.permissions, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
