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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { AuthenticatedRequest } from "../../common/auth-request";
import { Public } from "../auth/decorators/public.decorator";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ChangeServiceOrderStatusDto } from "./dto/change-service-order-status.dto";
import { ConsumeServiceOrderItemDto } from "./dto/consume-service-order-item.dto";
import { CreateServiceOrderDto } from "./dto/create-service-order.dto";
import { CreateServiceOrderQuoteDto } from "./dto/create-service-order-quote.dto";
import { ListServiceOrdersDto } from "./dto/list-service-orders.dto";
import { UpdateServiceOrderQuoteDto } from "./dto/update-service-order-quote.dto";
import { UpdateServiceOrderDto } from "./dto/update-service-order.dto";
import { ServiceOrdersService } from "./service-orders.service";

type UploadedServiceOrderAttachment = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

@Controller("service-orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ServiceOrdersController {
  constructor(private readonly serviceOrdersService: ServiceOrdersService) {}

  @RequirePermissions("service-orders.read")
  @Get()
  async findAll(
    @Query() filters: ListServiceOrdersDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.findAll(request.authUser!.storeId, filters);
  }

  @RequirePermissions("service-orders.read")
  @Get(":id")
  async findById(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.serviceOrdersService.findById(id, request.authUser!.storeId);
  }

  @RequirePermissions("service-orders.read")
  @Post(":id/receipt/print-link")
  async createReceiptPrintLink(
    @Param("id") id: string,
    @Query("format") format: string | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.createReceiptPrintLink(
      id,
      request.authUser!.storeId,
      format,
      {
        userId: request.authUser?.sub ?? null,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      }
    );
  }

  @Public()
  @Get(":id/receipt")
  async getReceiptHtml(
    @Param("id") id: string,
    @Query("printToken") printToken: string | undefined,
    @Query("format") format: string | undefined,
    @Query("autoprint") autoprint: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.setHeader("Cache-Control", "no-store");

    return this.serviceOrdersService.getReceiptHtml(
      id,
      printToken ?? "",
      format,
      autoprint === "1"
    );
  }

  @RequirePermissions("service-orders.read")
  @Get(":id/attachments")
  async listAttachments(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.serviceOrdersService.listAttachments(id, request.authUser!.storeId);
  }

  @RequirePermissions("service-orders.create")
  @Post()
  async create(
    @Body() payload: CreateServiceOrderDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.create(request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("service-orders.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateServiceOrderDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.update(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("service-orders.update")
  @Post(":id/attachments")
  @UseInterceptors(FileInterceptor("file"))
  async uploadAttachment(
    @Param("id") id: string,
    @UploadedFile() file: UploadedServiceOrderAttachment | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.uploadAttachment(id, request.authUser!.storeId, file, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("service-orders.update")
  @Delete(":id/attachments/:attachmentId")
  async deleteAttachment(
    @Param("id") id: string,
    @Param("attachmentId") attachmentId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.deleteAttachment(
      id,
      attachmentId,
      request.authUser!.storeId,
      {
        userId: request.authUser?.sub ?? null,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      }
    );
  }

  @RequirePermissions("service-orders.read")
  @Get(":id/quotes")
  async listQuotes(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.serviceOrdersService.listQuotes(id, request.authUser!.storeId);
  }

  @RequirePermissions("service-orders.update")
  @Post(":id/quotes")
  async createQuote(
    @Param("id") id: string,
    @Body() payload: CreateServiceOrderQuoteDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.createQuote(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("service-orders.update")
  @Patch(":id/quotes/:quoteId")
  async updateQuote(
    @Param("id") id: string,
    @Param("quoteId") quoteId: string,
    @Body() payload: UpdateServiceOrderQuoteDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.updateQuote(
      id,
      quoteId,
      request.authUser!.storeId,
      payload,
      {
        userId: request.authUser?.sub ?? null,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      }
    );
  }

  @RequirePermissions("service-orders.update")
  @Post(":id/quotes/:quoteId/approve")
  async approveQuote(
    @Param("id") id: string,
    @Param("quoteId") quoteId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.approveQuote(
      id,
      quoteId,
      request.authUser!.storeId,
      {
        userId: request.authUser?.sub ?? null,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      }
    );
  }

  @RequirePermissions("service-orders.update")
  @Post(":id/quotes/:quoteId/reject")
  async rejectQuote(
    @Param("id") id: string,
    @Param("quoteId") quoteId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.rejectQuote(
      id,
      quoteId,
      request.authUser!.storeId,
      {
        userId: request.authUser?.sub ?? null,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      }
    );
  }

  @RequirePermissions("service-orders.update")
  @Post(":id/status")
  async changeStatus(
    @Param("id") id: string,
    @Body() payload: ChangeServiceOrderStatusDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.changeStatus(id, request.authUser!.storeId, payload, {
      userId: request.authUser?.sub ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("service-orders.update")
  @Post(":id/items/:itemId/consume")
  async consumeItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() payload: ConsumeServiceOrderItemDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.serviceOrdersService.consumeItem(
      id,
      itemId,
      request.authUser!.storeId,
      payload,
      {
        userId: request.authUser?.sub ?? null,
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"]
      }
    );
  }
}
