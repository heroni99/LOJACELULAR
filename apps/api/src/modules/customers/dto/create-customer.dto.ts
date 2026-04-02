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

export class CreateCustomerDto {
  @Transform(trimIfString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  cpfCnpj?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsEmail({}, { message: "Informe um e-mail valido." })
  email?: string;

  @Transform(trimIfString)
  @IsString()
  @MinLength(8)
  @MaxLength(32)
  phone!: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  phone2?: string;

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
