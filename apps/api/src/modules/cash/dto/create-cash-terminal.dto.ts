import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const trimToUndefined = ({ value }: { value: unknown }) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

export class CreateCashTerminalDto {
  @Transform(trimIfString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
