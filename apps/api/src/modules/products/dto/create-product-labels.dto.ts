import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested
} from "class-validator";

class CreateProductLabelItemDto {
  @IsUUID()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}

export class CreateProductLabelsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => CreateProductLabelItemDto)
  items!: CreateProductLabelItemDto[];

  @IsOptional()
  @IsBoolean()
  includePrice?: boolean;
}

export type CreateProductLabelItemInput = CreateProductLabelItemDto;
