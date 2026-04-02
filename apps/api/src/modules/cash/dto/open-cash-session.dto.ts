import { IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";

export class OpenCashSessionDto {
  @IsUUID()
  cashTerminalId!: string;

  @IsInt()
  @Min(0)
  openingAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  notes?: string;
}
