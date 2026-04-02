import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { AccountsReceivableController } from "./accounts-receivable.controller";
import { AccountsReceivableService } from "./accounts-receivable.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AccountsReceivableController],
  providers: [AccountsReceivableService],
  exports: [AccountsReceivableService]
})
export class AccountsReceivableModule {}
