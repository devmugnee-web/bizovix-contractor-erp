import { AdjustmentDirection, BillType, DeductionCalcType } from "@bizovix/database";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class BillItemInputDto {
  @IsString()
  @IsNotEmpty()
  boqItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentQty!: number;
}

export class BillAdjustmentInputDto {
  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsIn(["ADDITION", "DEDUCTION"])
  direction!: AdjustmentDirection;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(DeductionCalcType)
  calculationType?: DeductionCalcType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  baseAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  ledgerAccountId?: string;
}

export class SaveProjectBillDto {
  @IsString()
  @IsNotEmpty()
  contractId!: string;

  @IsOptional()
  @IsEnum(BillType)
  billType?: BillType;

  @IsDateString()
  billDate!: string;

  @IsOptional()
  @IsDateString()
  periodFrom?: string;

  @IsOptional()
  @IsDateString()
  periodTo?: string;

  @IsOptional()
  @IsString()
  clientCertificateRef?: string;

  @IsOptional()
  @IsString()
  measurementBookRef?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  retentionPctOverride?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BillItemInputDto)
  items!: BillItemInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillAdjustmentInputDto)
  adjustments?: BillAdjustmentInputDto[];
}
