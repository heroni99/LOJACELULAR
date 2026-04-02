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
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthenticatedRequest } from "../../common/auth-request";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { CreateProductCodeDto } from "./dto/create-product-code.dto";
import { CreateProductLabelsDto } from "./dto/create-product-labels.dto";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsDto } from "./dto/list-products.dto";
import { UpdateProductCodeDto } from "./dto/update-product-code.dto";
import { UpdateProductActiveDto } from "./dto/update-product-active.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { ProductsService } from "./products.service";

type UploadedProductImage = {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
};

@Controller("products")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @RequirePermissions("products.read")
  @Get()
  async findAll(@Query() filters: ListProductsDto) {
    return this.productsService.findAll(filters);
  }

  @RequirePermissions("products.read")
  @Get("search")
  async search(@Query() filters: ListProductsDto) {
    return this.productsService.search(filters);
  }

  @RequirePermissions("products.read")
  @Get("by-code/:internalCode")
  async findByInternalCode(@Param("internalCode") internalCode: string) {
    return this.productsService.findByInternalCode(internalCode);
  }

  @RequirePermissions("products.read")
  @Get("by-supplier-code/:supplierCode")
  async findBySupplierCode(@Param("supplierCode") supplierCode: string) {
    return this.productsService.findBySupplierCode(supplierCode);
  }

  @RequirePermissions("products.read")
  @Get("by-barcode/:code")
  async findByBarcode(@Param("code") code: string) {
    return this.productsService.findByBarcode(code);
  }

  @RequirePermissions("products.read")
  @Get("by-imei/:imei")
  async findByImei(@Param("imei") imei: string) {
    return this.productsService.findByImei(imei);
  }

  @RequirePermissions("products.read")
  @Post("labels")
  async createLabels(
    @Body() payload: CreateProductLabelsDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.createLabels(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("products.create")
  @Post()
  async create(
    @Body() payload: CreateProductDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.create(payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("products.update")
  @Post(":id/image")
  @UseInterceptors(FileInterceptor("file"))
  async uploadImage(
    @Param("id") id: string,
    @UploadedFile() file: UploadedProductImage | undefined,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.uploadImage(id, file, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("products.read")
  @Get(":id/barcode")
  async getBarcode(@Param("id") id: string) {
    return this.productsService.getBarcode(id);
  }

  @RequirePermissions("products.update")
  @Post(":id/barcode/generate")
  async generateBarcode(
    @Param("id") id: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.generateBarcode(id, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("products.read")
  @Get(":id")
  async findById(@Param("id") id: string) {
    return this.productsService.findById(id);
  }

  @RequirePermissions("products.update")
  @Patch(":id/active")
  async updateActive(
    @Param("id") id: string,
    @Body() payload: UpdateProductActiveDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.updateActive(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("products.update")
  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() payload: UpdateProductDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.update(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("products.update")
  @Post(":id/codes")
  async createCode(
    @Param("id") id: string,
    @Body() payload: CreateProductCodeDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.createCode(id, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("products.update")
  @Patch(":id/codes/:codeId")
  async updateCode(
    @Param("id") id: string,
    @Param("codeId") codeId: string,
    @Body() payload: UpdateProductCodeDto,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.updateCode(id, codeId, payload, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }

  @RequirePermissions("products.update")
  @Delete(":id/codes/:codeId")
  async deleteCode(
    @Param("id") id: string,
    @Param("codeId") codeId: string,
    @Req() request: AuthenticatedRequest
  ) {
    return this.productsService.deleteCode(id, codeId, {
      userId: request.authUser?.sub ?? null,
      storeId: request.authUser?.storeId ?? null,
      ipAddress: request.ip,
      userAgent: request.headers["user-agent"]
    });
  }
}
