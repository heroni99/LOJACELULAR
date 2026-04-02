import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { StockLocationsController } from "./stock-locations.controller";

@Module({
  imports: [AuditModule],
  controllers: [InventoryController, StockLocationsController],
  providers: [InventoryService],
  exports: [InventoryService]
})
export class InventoryModule {}
