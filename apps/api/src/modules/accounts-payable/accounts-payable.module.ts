import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { AccountsPayableController } from "./accounts-payable.controller";
import { AccountsPayableService } from "./accounts-payable.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [AccountsPayableController],
  providers: [AccountsPayableService],
  exports: [AccountsPayableService]
})
export class AccountsPayableModule {}
