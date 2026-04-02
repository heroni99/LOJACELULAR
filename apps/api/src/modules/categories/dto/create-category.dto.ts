import { Transform } from "class-transformer";
import {
  IsBoolean,
  Matches,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const upperCaseIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toUpperCase() : value;

export class CreateCategoryDto {
  @Transform(trimIfString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(upperCaseIfString)
  @IsString()
  @MinLength(2)
  @MaxLength(16)
  prefix!: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  defaultSerialized?: boolean;

  @Transform(trimIfString)
  @IsString()
  @MinLength(3)
  @MaxLength(64)
  @Matches(/^[A-Za-z_][A-Za-z0-9_]*$/, {
    message:
      "sequence_name deve usar apenas letras, numeros e underscore, sem espacos."
  })
  sequenceName!: string;
}
