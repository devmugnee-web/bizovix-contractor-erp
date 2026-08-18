import { IsNotEmpty, IsString } from "class-validator";

export class CancelSupplierPaymentDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
