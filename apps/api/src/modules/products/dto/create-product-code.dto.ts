import { Transform } from "class-transformer";
import { ProductCodeType } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class CreateProductCodeDto {
  @Transform(trimIfString)
  @IsString()
  @MinLength(3, { message: "Informe um codigo com pelo menos 3 caracteres." })
  @MaxLength(120)
  code!: string;

  @IsEnum(ProductCodeType, { message: "Tipo de codigo invalido." })
  codeType!: ProductCodeType;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
