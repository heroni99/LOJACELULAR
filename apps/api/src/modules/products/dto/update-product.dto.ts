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

const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const trimToNullable = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export class UpdateProductDto {
  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @Transform(trimToNullable)
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @Transform(trimToNullable)
  @IsString()
  description?: string | null;

  @IsOptional()
  @Transform(trimToNullable)
  @IsString()
  @MaxLength(120)
  brand?: string | null;

  @IsOptional()
  @Transform(trimToNullable)
  @IsString()
  @MaxLength(120)
  model?: string | null;

  @IsOptional()
  @Transform(trimToNullable)
  @IsString()
  @MaxLength(64)
  supplierCode?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  costPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  salePrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stockMin?: number;

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
