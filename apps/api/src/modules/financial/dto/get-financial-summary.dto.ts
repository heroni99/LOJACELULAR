import { Transform } from "class-transformer";
import { IsIn, IsOptional } from "class-validator";

const normalizePeriod = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class GetFinancialSummaryDto {
  @IsOptional()
  @Transform(normalizePeriod)
  @IsIn(["today", "week", "month"])
  period?: "today" | "week" | "month";
}

