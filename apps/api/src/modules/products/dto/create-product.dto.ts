import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export class CreateProductDto {
  @Transform(trimIfString)
  @IsUUID()
  categoryId!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  supplierId?: string;

  @Transform(trimIfString)
  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(64)
  supplierCode?: string;

  @IsInt()
  @Min(0)
  costPrice!: number;

  @IsInt()
  @Min(0)
  salePrice!: number;

  @IsInt()
  @Min(0)
  stockMin!: number;

  @IsOptional()
  @IsBoolean()
  hasSerialControl?: boolean;

  @IsOptional()
  @IsBoolean()
  needsPriceReview?: boolean;

  @IsOptional()
  @IsBoolean()
  isService?: boolean;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
