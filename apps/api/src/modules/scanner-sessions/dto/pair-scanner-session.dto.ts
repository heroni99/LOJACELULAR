import { Transform } from "class-transformer";
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from "class-validator";

const trimIfString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export class PairScannerSessionDto {
  @IsOptional()
  @IsUUID()
  sessionId?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MinLength(6)
  @MaxLength(16)
  pairingCode?: string;

  @IsOptional()
  @Transform(trimIfString)
  @IsString()
  @MinLength(16)
  @MaxLength(255)
  pairingToken?: string;
}
