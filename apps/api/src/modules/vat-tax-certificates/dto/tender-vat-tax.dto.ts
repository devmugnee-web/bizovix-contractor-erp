import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from "class-validator";
import { TenderVatTaxEntryKind, VatTaxCertificateType } from "@bizovix/database";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export class TenderTaxQueryDto extends PaginationQueryDto {
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) dateFrom?: string;
  @IsOptional() @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) dateTo?: string;
  @IsOptional() @IsEnum(TenderVatTaxEntryKind) entryKind?: TenderVatTaxEntryKind;
  @IsOptional() @IsEnum(VatTaxCertificateType) taxType?: VatTaxCertificateType;
}
export class SaveTenderTaxDto {
  @IsEnum(VatTaxCertificateType) taxType!: VatTaxCertificateType;
  @IsEnum(TenderVatTaxEntryKind) entryKind!: TenderVatTaxEntryKind;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) entryDate!: string;
  @IsString() @Matches(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,2})?$/) amount!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(120) referenceNo!: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}
export class CreateTenderTaxDto extends SaveTenderTaxDto {
  @IsUUID() requestId!: string;
}
export class UpdateTenderTaxDto extends SaveTenderTaxDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
}
export class VoidTenderTaxDto {
  @Type(() => Number) @IsInt() @Min(1) version!: number;
  @IsString() @Matches(/\S/) @MaxLength(500) reason!: string;
}
