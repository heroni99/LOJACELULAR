import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CashModule } from "../cash/cash.module";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";

@Module({
  imports: [AuditModule, CashModule],
  controllers: [SalesController],
  providers: [SalesService]
})
export class SalesModule {}
