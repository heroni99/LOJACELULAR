import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min
} from "class-validator";
import { ProductUnitStatus } from "@prisma/client";

const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export class UpdateProductUnitDto {
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(32)
  imei?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(32)
  imei2?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  purchasePrice?: number | null;

  @IsOptional()
  @IsEnum(ProductUnitStatus)
  unitStatus?: ProductUnitStatus;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}
