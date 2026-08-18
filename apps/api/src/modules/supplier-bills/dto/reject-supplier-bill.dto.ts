import { IsNotEmpty, IsString } from "class-validator";

export class RejectSupplierBillDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
