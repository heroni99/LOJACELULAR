import { Type } from "class-transformer";
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";

class ReceivePurchaseOrderUnitDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei2?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class ReceivePurchaseOrderItemDto {
  @IsUUID()
  purchaseOrderItemId!: string;

  @IsUUID()
  locationId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderUnitDto)
  units?: ReceivePurchaseOrderUnitDto[];
}

export class ReceivePurchaseOrderDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseOrderItemDto)
  items!: ReceivePurchaseOrderItemDto[];
}

export type ReceivePurchaseOrderItemInput = ReceivePurchaseOrderItemDto;
export type ReceivePurchaseOrderUnitInput = ReceivePurchaseOrderUnitDto;
