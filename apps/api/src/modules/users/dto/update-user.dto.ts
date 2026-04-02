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

export class UpdateUserDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @Transform(lowerCaseEmail)
  @IsEmail({}, { message: "Informe um e-mail valido." })
  email?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
