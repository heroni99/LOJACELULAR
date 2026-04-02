import { Type } from "class-transformer";
import {
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min
} from "class-validator";

export class PurchaseOrderItemInputDto {
  @IsUUID()
  productId!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCost!: number;
}
