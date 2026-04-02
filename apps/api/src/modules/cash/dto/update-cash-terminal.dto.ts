import { Transform } from "class-transformer";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export class UpdateCashTerminalDto {
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;
}
