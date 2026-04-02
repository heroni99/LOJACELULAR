import { IsOptional, IsString, MaxLength } from "class-validator";

export class CancelFiscalDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
