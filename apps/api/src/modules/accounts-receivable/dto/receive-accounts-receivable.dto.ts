import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength
} from "class-validator";
import { PaymentMethod } from "@prisma/client";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ReceiveAccountsReceivableDto {
  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(255)
  notes?: string;
}

