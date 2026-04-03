import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min
} from "class-validator";
import {
  normalizeFormat,
  resolveQueryDateAlias,
  toOptionalBoolean,
  trimToUndefined
} from "./report-query.utils";

export class CustomerReportFiltersDto {
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(({ value }) => toOptionalBoolean(value))
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  city?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  state?: string;

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
  @Max(300)
  take?: number;

  @IsOptional()
  @Transform(normalizeFormat)
  @IsIn(["json", "csv"])
  format?: "json" | "csv";
}
