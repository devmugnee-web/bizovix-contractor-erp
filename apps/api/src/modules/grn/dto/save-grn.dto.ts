import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class GrnItemInputDto {
  @IsString()
  @IsNotEmpty()
  purchaseOrderItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  currentReceivedQty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  acceptedQty!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rejectedQty?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  damagedQty?: number;

  @IsOptional()
  @IsString()
  inspectionRemarks?: string;
}

export class SaveGrnDto {
  @IsOptional()
  @IsString()
  grnNo?: string;

  @IsString()
  @IsNotEmpty()
  purchaseOrderId!: string;

  @IsDateString()
  receiptDate!: string;

  @IsOptional()
  @IsString()
  deliveryChallanNo?: string;

  @IsOptional()
  @IsDateString()
  deliveryChallanDate?: string;

  @IsOptional()
  @IsString()
  receivedById?: string;

  @IsOptional()
  @IsString()
  warehouseLocation?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GrnItemInputDto)
  items!: GrnItemInputDto[];
}
