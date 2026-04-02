import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ListAuditDto } from "./dto/list-audit.dto";
import { AuditService } from "./audit.service";

@Controller("audit")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @RequirePermissions("audit.read")
  @Get()
  async findAll(@Query() filters: ListAuditDto) {
    return this.auditService.findAll(filters);
  }
}
