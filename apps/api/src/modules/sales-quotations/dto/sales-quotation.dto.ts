import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export enum SalesQuotationStatusDto { DRAFT = "DRAFT", SENT = "SENT", ACCEPTED = "ACCEPTED", REJECTED = "REJECTED" }
export enum SalesQuotationDecisionDto { PENDING = "PENDING", ACCEPTED = "ACCEPTED", REJECTED = "REJECTED" }

export class QuerySalesQuotationDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsDateString() fromDate?: string;
  @IsOptional() @IsDateString() toDate?: string;
  @IsOptional() @IsEnum(SalesQuotationStatusDto) status?: SalesQuotationStatusDto;
  @IsOptional() @IsEnum(SalesQuotationDecisionDto) decision?: SalesQuotationDecisionDto;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() salesPersonId?: string;
  @IsOptional() @IsString() @MaxLength(200) workName?: string;
  @IsOptional() @IsString() @MaxLength(200) projectName?: string;
}

export class CreateSalesQuotationDto {
  @IsString() @IsNotEmpty() customerId!: string;
  @IsString() @IsNotEmpty() @MaxLength(200) workName!: string;
  @IsDateString() quotationDate!: string;
  @IsDateString() validUntil!: string;
  @IsOptional() @IsString() salesPersonId?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
}

export class UpdateSalesQuotationDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) workName?: string;
  @IsOptional() @IsDateString() quotationDate?: string;
  @IsOptional() @IsDateString() validUntil?: string;
  @IsOptional() @IsString() salesPersonId?: string;
  @IsOptional() @IsString() @MaxLength(2000) remarks?: string;
  @IsOptional() @IsString() @Length(3, 3) currency?: string;
}

export class SalesQuotationCostingItemDto {
  @IsString() @IsNotEmpty() @MaxLength(500) description!: string;
  @IsNumberString() quantity!: string;
  @IsString() @IsNotEmpty() @MaxLength(30) unit!: string;
  @IsNumberString() unitCost!: string;
  @IsOptional() @IsNumberString() taxPct?: string;
  @IsNumberString() unitPrice!: string;
}

export class SalesQuotationOverheadDto {
  @IsString() @IsNotEmpty() @MaxLength(500) description!: string;
  @IsNumberString() amount!: string;
}

export class SaveSalesQuotationCostingDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => SalesQuotationCostingItemDto)
  items!: SalesQuotationCostingItemDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SalesQuotationOverheadDto)
  overheads?: SalesQuotationOverheadDto[];
  @IsOptional() @IsBoolean() vatApplicable?: boolean;
  @IsOptional() @IsNumberString() vatRate?: string;
}

export class VersionedSalesQuotationActionDto {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
}

export class RecordSalesQuotationResultDto extends VersionedSalesQuotationActionDto {
  @IsEnum(SalesQuotationDecisionDto) decision!: SalesQuotationDecisionDto.ACCEPTED | SalesQuotationDecisionDto.REJECTED;
  @IsDateString() decisionDate!: string;
  @IsOptional() @IsNumberString() acceptedAmount?: string;
  @IsOptional() @IsString() @MaxLength(100) customerPoWoNo?: string;
  @IsOptional() @IsString() @MaxLength(2000) rejectionReason?: string;
}

export class CreateSalesQuotationFollowUpDto extends VersionedSalesQuotationActionDto {
  @IsDateString() followedUpAt!: string;
  @IsOptional() @IsDateString() nextFollowUpAt?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}
