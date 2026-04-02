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
import { CancelFiscalDocumentDto } from "./dto/cancel-fiscal-document.dto";
import { IssueInternalReceiptDto } from "./dto/issue-internal-receipt.dto";
import { ListFiscalDocumentsDto } from "./dto/list-fiscal-documents.dto";
import { FiscalService } from "./fiscal.service";

@Controller("fiscal")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FiscalController {
  constructor(private readonly fiscalService: FiscalService) {}

  @RequirePermissions("fiscal.read")
  @Get("documents")
  async findAll(
    @Query() filters: ListFiscalDocumentsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.fiscalService.findAll(request.authUser!.storeId, filters);
  }

  @RequirePermissions("fiscal.read")
  @Get("documents/:id")
  async findById(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.fiscalService.findById(id, request.authUser!.storeId);
  }

  @RequirePermissions("fiscal.issue")
  @Post("documents/internal-receipt")
  async issueInternalReceipt(
    @Body() payload: IssueInternalReceiptDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.fiscalService.issueInternalReceipt(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("fiscal.cancel")
  @Post("documents/:id/cancel")
  async cancelDocument(
    @Param("id") id: string,
    @Body() payload: CancelFiscalDocumentDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.fiscalService.cancelDocument(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("fiscal.read")
  @Get("report")
  async getReport(
    @Query() filters: ListFiscalDocumentsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.fiscalService.getReport(request.authUser!.storeId, filters, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
