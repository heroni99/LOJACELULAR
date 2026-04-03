import { Transform, Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from "class-validator";
import { PaymentMethod, SaleStatus } from "@prisma/client";
import {
  normalizeFormat,
  resolveQueryDateAlias,
  trimToUndefined
} from "./report-query.utils";

export class SalesReportFiltersDto {
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsEnum(SaleStatus)
  status?: SaleStatus;

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
