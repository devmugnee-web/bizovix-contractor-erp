import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class BillItemInputDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  currentBilledQty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  invoiceRate!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class OtherDeductionInputDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SaveSupplierBillDto {
  @IsOptional()
  @IsString()
  billNo?: string;

  @IsString()
  @IsNotEmpty()
  supplierInvoiceNo!: string;

  @IsDateString()
  supplierInvoiceDate!: string;

  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string;

  @IsOptional()
  @IsString()
  paymentTermId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BillItemInputDto)
  items!: BillItemInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OtherDeductionInputDto)
  otherDeductions?: OtherDeductionInputDto[];
}
