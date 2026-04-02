import { Transform, Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from "class-validator";
import { ServiceOrderStatus } from "@prisma/client";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class ChangeServiceOrderStatusDto {
  @IsEnum(ServiceOrderStatus)
  status!: ServiceOrderStatus;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  totalFinal?: number;
}
