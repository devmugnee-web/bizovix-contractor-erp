import { IsNotEmpty, IsString } from "class-validator";

export class RejectPurchaseRequisitionDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
