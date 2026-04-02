import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class CloseCashSessionDto {
  @IsUUID()
  cashSessionId!: string;

  @IsInt()
  @Min(0)
  closingAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
