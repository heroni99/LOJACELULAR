import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { SaleReturnsController } from "./sale-returns.controller";
import { SaleReturnsService } from "./sale-returns.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [SaleReturnsController],
  providers: [SaleReturnsService],
  exports: [SaleReturnsService]
})
export class SaleReturnsModule {}
