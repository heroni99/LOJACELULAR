import { IsUUID } from "class-validator";

export class CreateScannerSessionDto {
  @IsUUID()
  cashSessionId!: string;
}
