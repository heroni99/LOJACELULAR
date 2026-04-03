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
import {
  normalizeFormat,
  resolveQueryDateAlias,
  trimToUndefined
} from "./report-query.utils";

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
  @Transform(resolveQueryDateAlias("start"))
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @Transform(resolveQueryDateAlias("end"))
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
