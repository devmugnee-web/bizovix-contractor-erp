import { PartialType } from "@nestjs/mapped-types";
import { VatTaxCertificateStatus, VatTaxCertificateType } from "@bizovix/database";
import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class SaveVatTaxCertificateDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\S/)
  cmsWorkId!: string;

  @IsOptional()
  @IsString()
  contractId?: string | null;

  @IsEnum(VatTaxCertificateType)
  certificateType!: VatTaxCertificateType;

  @IsOptional()
  @IsEnum(VatTaxCertificateStatus)
  status?: VatTaxCertificateStatus;

  @IsOptional()
  @IsDateString()
  applicationDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  certificateNo?: string | null;

  @IsOptional()
  @IsDateString()
  issueDate?: string | null;

  @IsOptional()
  @IsDateString()
  validTill?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  issuingAuthority?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remarks?: string | null;
}

export class UpdateVatTaxCertificateDto extends PartialType(SaveVatTaxCertificateDto) {}
