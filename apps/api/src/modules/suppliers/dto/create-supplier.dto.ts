import { Transform } from "class-transformer";
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateSupplierDto {
  @Transform(trimIfString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(120)
  tradeName?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  cnpj?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  stateRegistration?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsEmail({}, { message: "Informe um e-mail valido." })
  email?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(16)
  zipCode?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(8)
  state?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  notes?: string;
}
