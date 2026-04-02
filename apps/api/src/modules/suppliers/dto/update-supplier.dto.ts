import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateSupplierDto {
  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(120)
  tradeName?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  cnpj?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  stateRegistration?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsEmail({}, { message: "Informe um e-mail valido." })
  email?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(120)
  contactName?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(16)
  zipCode?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(8)
  state?: string | null;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
