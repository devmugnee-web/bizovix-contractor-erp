import { TechnicalComplianceStatus } from "@bizovix/database";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";

export class CsSupplierEvaluationInputDto {
  @IsString()
  @IsNotEmpty()
  supplierId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  commercialAdjustment?: number;

  @IsOptional()
  @IsEnum(TechnicalComplianceStatus)
  technicalStatus?: TechnicalComplianceStatus;

  @IsOptional()
  @IsBoolean()
  recommended?: boolean;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SaveComparativeStatementDto {
  @IsOptional()
  @IsString()
  csNo?: string;

  @IsString()
  @IsNotEmpty()
  rfqId!: string;

  /** Defaults to every supplier with an active quotation on the RFQ when omitted. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CsSupplierEvaluationInputDto)
  suppliers?: CsSupplierEvaluationInputDto[];
}
