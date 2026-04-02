import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CashDepositDto {
  @IsUUID()
  cashSessionId!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;
}
