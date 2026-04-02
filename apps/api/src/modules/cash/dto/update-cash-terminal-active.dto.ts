import { IsBoolean } from "class-validator";

export class UpdateCashTerminalActiveDto {
  @IsBoolean()
  active!: boolean;
}
