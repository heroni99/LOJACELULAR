import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class ChangeUserPasswordDto {
  @IsString()
  @MinLength(8, { message: "A senha precisa ter pelo menos 8 caracteres." })
  @MaxLength(120)
  newPassword!: string;

  @IsOptional()
  @IsBoolean()
  mustChangePassword?: boolean;
}
