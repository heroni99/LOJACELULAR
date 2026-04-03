import { Type } from "class-transformer";
import { IsInt, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CreateCommissionDto {
  @IsUUID()
  userId!: string;

  @IsUUID()
  saleId!: string;

  @IsString()
  @MaxLength(32)
  commissionType!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  commissionValue!: number;
}
