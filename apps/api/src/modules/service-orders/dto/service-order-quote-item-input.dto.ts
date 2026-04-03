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
import { ServiceOrderItemType } from "@prisma/client";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ServiceOrderQuoteItemInputDto {
  @Transform(({ value, obj }: { value: unknown; obj?: Record<string, unknown> }) =>
    value ?? obj?.item_type
  )
  @IsEnum(ServiceOrderItemType)
  itemType!: ServiceOrderItemType;

  @Transform(({ value, obj }: { value: unknown; obj?: Record<string, unknown> }) =>
    value ?? obj?.product_id
  )
  @IsOptional()
  @IsUUID()
  productId?: string;

  @Transform(trimIfString)
  @IsString()
  @MaxLength(255)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Transform(({ value, obj }: { value: unknown; obj?: Record<string, unknown> }) =>
    value ?? obj?.unit_price
  )
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice!: number;
}
