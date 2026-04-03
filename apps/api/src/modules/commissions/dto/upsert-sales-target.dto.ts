import { Type } from "class-transformer";
import { IsInt, IsUUID, Max, Min } from "class-validator";

export class UpsertSalesTargetDto {
  @IsUUID()
  userId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(9999)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  targetAmount!: number;
}
