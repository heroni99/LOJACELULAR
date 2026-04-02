import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { RequirePermissions } from "../auth/decorators/permissions.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { SearchProductDto } from "./dto/search-product.dto";
import { PdvService } from "./pdv.service";

@Controller("pdv")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PdvController {
  constructor(private readonly pdvService: PdvService) {}

  @RequirePermissions("sales.checkout")
  @Get("product-search")
  async search(@Query() filters: SearchProductDto) {
    return this.pdvService.search(filters);
  }

  @RequirePermissions("sales.checkout")
  @Get("by-barcode/:code")
  async findByBarcode(@Param("code") code: string) {
    return this.pdvService.findByBarcode(code);
  }

  @RequirePermissions("sales.checkout")
  @Get("by-code/:internalCode")
  async findByCode(@Param("internalCode") internalCode: string) {
    return this.pdvService.findByInternalCode(internalCode);
  }

  @RequirePermissions("sales.checkout")
  @Get("by-supplier-code/:supplierCode")
  async findBySupplierCode(@Param("supplierCode") supplierCode: string) {
    return this.pdvService.findBySupplierCode(supplierCode);
  }

  @RequirePermissions("sales.checkout")
  @Get("by-imei/:imei")
  async findByImei(@Param("imei") imei: string) {
    return this.pdvService.findByImei(imei);
  }
}
