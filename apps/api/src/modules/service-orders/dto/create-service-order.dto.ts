import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested
} from "class-validator";
import { ServiceOrderItemInputDto } from "./service-order-item-input.dto";

export class CreateServiceOrderDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsUUID()
  relatedSaleId?: string;

  @IsString()
  @MaxLength(80)
  deviceType!: string;

  @IsString()
  @MaxLength(120)
  brand!: string;

  @IsString()
  @MaxLength(120)
  model!: string;

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
  @MaxLength(64)
  color?: string;

  @IsOptional()
  @IsString()
  accessories?: string;

  @IsString()
  reportedIssue!: string;

  @IsOptional()
  @IsString()
  foundIssue?: string;

  @IsOptional()
  @IsString()
  technicalNotes?: string;

  @IsOptional()
  @IsDateString()
  estimatedCompletionDate?: string;

  @IsOptional()
  @Type(() => Number)
  totalFinal?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderItemInputDto)
  items?: ServiceOrderItemInputDto[];
}
