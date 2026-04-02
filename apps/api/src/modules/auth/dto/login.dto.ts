import { Transform } from "class-transformer";
import { IsEmail, IsString, MinLength } from "class-validator";

export class LoginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail({}, { message: "Informe um e-mail valido." })
  email!: string;

  @IsString()
  @MinLength(8, { message: "A senha precisa ter pelo menos 8 caracteres." })
  password!: string;
}
