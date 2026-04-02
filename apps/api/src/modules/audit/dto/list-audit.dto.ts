import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ListAuditDto {
  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  search?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  action?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  entity?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsUUID()
  userId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  take?: number;
}
