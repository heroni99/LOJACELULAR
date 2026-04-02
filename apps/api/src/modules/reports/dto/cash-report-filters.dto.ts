import { Transform, Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min
} from "class-validator";
import {
  CashMovementType,
  CashSessionStatus,
  PaymentMethod
} from "@prisma/client";
import { normalizeFormat, trimToUndefined } from "./report-query.utils";

export class CashReportFiltersDto {
  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  cashTerminalId?: string;

  @IsOptional()
  @IsEnum(CashSessionStatus)
  sessionStatus?: CashSessionStatus;

  @IsOptional()
  @IsEnum(CashMovementType)
  movementType?: CashMovementType;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;

  @IsOptional()
  @Transform(normalizeFormat)
  @IsIn(["json", "csv"])
  format?: "json" | "csv";
}
