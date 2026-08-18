import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class RfqItemInputDto {
  @IsString()
  @IsNotEmpty()
  itemId!: string;

  @IsOptional()
  @IsString()
  purchaseRequisitionItemId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requestedQty!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SaveRfqDto {
  @IsOptional()
  @IsString()
  rfqNo?: string;

  @IsOptional()
  @IsString()
  purchaseRequisitionId?: string;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  submissionDeadline!: string;

  @IsOptional()
  @IsString()
  deliveryLocation?: string;

  @IsOptional()
  @IsString()
  termsConditions?: string;

  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  supplierIds!: string[];

  /** Required unless purchaseRequisitionId is set, in which case items are derived from the
   * PR's own items when omitted. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RfqItemInputDto)
  items?: RfqItemInputDto[];
}
