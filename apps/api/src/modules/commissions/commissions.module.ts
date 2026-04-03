import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuditModule } from "../audit/audit.module";
import { CommissionsController } from "./commissions.controller";
import { CommissionsService } from "./commissions.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [CommissionsController],
  providers: [CommissionsService]
})
export class CommissionsModule {}
