import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested
} from "class-validator";
import { RefundType } from "@prisma/client";

class CreateSaleReturnItemDto {
  @IsUUID()
  saleItemId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amount!: number;

  @IsBoolean()
  returnToStock!: boolean;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}

export class CreateSaleReturnDto {
  @IsUUID()
  saleId!: string;

  @IsString()
  reason!: string;

  @IsEnum(RefundType)
  refundType!: RefundType;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleReturnItemDto)
  items!: CreateSaleReturnItemDto[];
}

export type CreateSaleReturnItemInput = CreateSaleReturnItemDto;
