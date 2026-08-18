import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class PoItemInputDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsOptional()
  @IsString()
  sourceQuotationItemId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  orderedQty!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitRate!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsString()
  boqItemId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SavePurchaseOrderDto {
  @IsOptional()
  @IsString()
  poNo?: string;

  @IsDateString()
  poDate!: string;

  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsString()
  purchaseRequisitionId?: string;

  @IsOptional()
  @IsString()
  rfqId?: string;

  @IsOptional()
  @IsString()
  comparativeStatementId?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  deliveryTerms?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otherCharges?: number;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PoItemInputDto)
  items!: PoItemInputDto[];
}
