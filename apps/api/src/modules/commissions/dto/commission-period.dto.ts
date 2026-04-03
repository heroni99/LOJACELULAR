import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

export class CommissionPeriodDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(9999)
  year?: number;
}
