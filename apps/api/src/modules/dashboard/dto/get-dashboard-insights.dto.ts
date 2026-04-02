import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, Max, Min } from "class-validator";

const normalizePeriod = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class GetDashboardInsightsDto {
  @IsOptional()
  @Transform(normalizePeriod)
  @IsIn(["today", "week", "month"])
  period?: "today" | "week" | "month";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  take?: number;
}
