import { IsUUID } from "class-validator";

export class IssueInternalReceiptDto {
  @IsUUID()
  saleId!: string;
}
