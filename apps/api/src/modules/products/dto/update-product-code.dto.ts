import { Transform } from "class-transformer";
import { ProductCodeType } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class UpdateProductCodeDto {
  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MinLength(3, { message: "Informe um codigo com pelo menos 3 caracteres." })
  @MaxLength(120)
  code?: string;

  @IsOptional()
  @IsEnum(ProductCodeType, { message: "Tipo de codigo invalido." })
  codeType?: ProductCodeType;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
