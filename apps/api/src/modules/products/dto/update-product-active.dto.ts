import { IsBoolean } from "class-validator";

export class UpdateProductActiveDto {
  @IsBoolean()
  active!: boolean;
}
