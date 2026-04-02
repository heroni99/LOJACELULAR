import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export class CreateProductUnitItemDto {
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
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class CreateProductUnitsDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  purchasePrice?: number;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateProductUnitItemDto)
  units!: CreateProductUnitItemDto[];
}
