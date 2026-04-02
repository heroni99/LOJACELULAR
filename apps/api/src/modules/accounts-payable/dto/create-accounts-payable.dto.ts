import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min
} from "class-validator";
import { PaymentMethod } from "@prisma/client";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateAccountsPayableDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @Transform(trimIfString)
  @IsString()
  @MaxLength(255)
  description!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  notes?: string;
}

