import { Transform, Type } from "class-transformer";
import {
  IsInt,
  IsString,
  IsUUID,
  MaxLength,
  Min
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateInventoryAdjustmentDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  locationId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  countedQuantity!: number;

  @Transform(trimIfString)
  @IsString()
  @MaxLength(255)
  reason!: string;
}
