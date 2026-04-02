import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PdvModule } from "../pdv/pdv.module";
import { ScannerSessionsController } from "./scanner-sessions.controller";
import { ScannerSessionsGateway } from "./scanner-sessions.gateway";
import { ScannerSessionsService } from "./scanner-sessions.service";

@Module({
  imports: [AuditModule, PdvModule],
  controllers: [ScannerSessionsController],
  providers: [ScannerSessionsService, ScannerSessionsGateway]
})
export class ScannerSessionsModule {}
