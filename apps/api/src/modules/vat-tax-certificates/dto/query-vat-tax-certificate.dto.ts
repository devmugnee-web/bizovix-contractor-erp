import { VatTaxCertificateStatus, VatTaxCertificateType } from "@bizovix/database";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export type VatTaxCertificateStatusFilter =
  | VatTaxCertificateStatus
  | "PENDING_NOT_ISSUED"
  | "REJECTED_RETURNED";

const STATUS_FILTERS = [
  ...Object.values(VatTaxCertificateStatus),
  "PENDING_NOT_ISSUED",
  "REJECTED_RETURNED",
] as const;

export class QueryVatTaxCertificateDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsString()
  tenderId?: string;

  @IsOptional()
  @IsEnum(VatTaxCertificateType)
  certificateType?: VatTaxCertificateType;

  @IsOptional()
  @IsIn(STATUS_FILTERS)
  status?: VatTaxCertificateStatusFilter;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class QueryVatTaxCertificateStatsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsString()
  tenderId?: string;

  @IsOptional()
  @IsEnum(VatTaxCertificateType)
  certificateType?: VatTaxCertificateType;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class QueryRecentVatTaxCertificateDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 5;

  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsEnum(VatTaxCertificateType)
  certificateType?: VatTaxCertificateType;
}
