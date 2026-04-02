import { IsOptional, IsUUID } from "class-validator";

export class ConsumeServiceOrderItemDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;
}
