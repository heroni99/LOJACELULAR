import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { PaymentMethod } from "@prisma/client";

export class CheckoutSaleItemDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  productUnitId?: string;

  @IsOptional()
  @IsUUID()
  stockLocationId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPrice!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountAmount!: number;
}

export class CheckoutSalePaymentDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  installments?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  referenceCode?: string;
}

export class CheckoutSaleDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsUUID()
  cashSessionId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutSaleItemDto)
  items!: CheckoutSaleItemDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutSalePaymentDto)
  payments!: CheckoutSalePaymentDto[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  discountAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
