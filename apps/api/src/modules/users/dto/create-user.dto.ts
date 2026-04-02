import { Transform } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength
} from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

const lowerCaseEmail = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim().toLowerCase() : value;

export class CreateUserDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsUUID()
  roleId!: string;

  @Transform(trimIfString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @Transform(lowerCaseEmail)
  @IsEmail({}, { message: "Informe um e-mail valido." })
  email!: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  phone?: string;

  @Transform(trimIfString)
  @IsString()
  @MinLength(8, { message: "A senha precisa ter pelo menos 8 caracteres." })
  @MaxLength(120)
  password!: string;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
