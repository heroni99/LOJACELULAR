import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from "class-validator";
import {
  normalizeFormat,
  toOptionalBoolean,
  trimToUndefined
} from "./report-query.utils";

export class StockReportFiltersDto {
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  lowStockOnly?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(300)
  take?: number;

  @IsOptional()
  @Transform(normalizeFormat)
  @IsIn(["json", "csv"])
  format?: "json" | "csv";
}
