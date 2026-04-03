import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested
} from "class-validator";
import { ServiceOrderQuoteItemInputDto } from "./service-order-quote-item-input.dto";

export class UpdateServiceOrderQuoteDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ServiceOrderQuoteItemInputDto)
  items?: ServiceOrderQuoteItemInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
