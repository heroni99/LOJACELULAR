import { Type } from "class-transformer";
import {
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { ServiceOrderItemInputDto } from "./service-order-item-input.dto";

export class UpdateServiceOrderDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string | null;

  @IsOptional()
  @IsUUID()
  relatedSaleId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  deviceType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  brand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  imei2?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  serialNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  color?: string | null;

  @IsOptional()
  @IsString()
  accessories?: string | null;

  @IsOptional()
  @IsString()
  reportedIssue?: string;

  @IsOptional()
  @IsString()
  foundIssue?: string | null;

  @IsOptional()
  @IsString()
  technicalNotes?: string | null;

  @IsOptional()
  @IsDateString()
  estimatedCompletionDate?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalFinal?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderItemInputDto)
  items?: ServiceOrderItemInputDto[];
}
