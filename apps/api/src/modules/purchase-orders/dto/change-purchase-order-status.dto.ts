import { IsEnum } from "class-validator";
import { PurchaseOrderStatus } from "@prisma/client";

export class ChangePurchaseOrderStatusDto {
  @IsEnum(PurchaseOrderStatus)
  status!: PurchaseOrderStatus;
}
