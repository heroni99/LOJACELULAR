import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FiscalController } from "./fiscal.controller";
import { FiscalService } from "./fiscal.service";

@Module({
  imports: [AuditModule],
  controllers: [FiscalController],
  providers: [FiscalService]
})
export class FiscalModule {}
