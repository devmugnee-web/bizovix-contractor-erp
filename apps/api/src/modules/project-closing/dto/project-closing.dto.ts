import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";
import { CompletionCertificateStatus, DefectStatus, HandoverType } from "@bizovix/database";

export class SaveCompletionCertificateDto {
  @IsString() contractId!: string;
  @IsDateString() applicationDate!: string;
  @IsDateString() actualCompletionDate!: string;
  @IsOptional() @IsDateString() certifiedCompletionDate?: string;
  @IsOptional() @IsDateString() certificateDate?: string;
  @IsOptional() @IsString() completionType?: string;
  @IsOptional() @IsString() issuingAuthority?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class CertificateStatusDto {
  @IsEnum(CompletionCertificateStatus) status!: CompletionCertificateStatus;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateDlpDto {
  @IsString() completionCertificateId!: string;
  @IsDateString() startDate!: string;
  @Type(() => Number) @IsInt() @Min(0) durationDays!: number;
  @IsOptional() @IsString() remarks?: string;
}

export class ExtendDlpDto {
  @Type(() => Number) @IsInt() @Min(1) extensionDays!: number;
  @IsString() @IsNotEmpty() reason!: string;
}

export class CreateDefectDto {
  @IsString() dlpId!: string;
  @IsString() @IsNotEmpty() description!: string;
  @IsDateString() reportedDate!: string;
  @IsOptional() @IsString() reportedBy?: string;
  @IsOptional() @IsString() responsiblePerson?: string;
  @IsOptional() @IsDateString() targetRectificationDate?: string;
  @IsOptional() @IsBoolean() mandatory?: boolean;
  @IsOptional() @IsString() remarks?: string;
}

export class DefectStatusDto {
  @IsEnum(DefectStatus) status!: DefectStatus;
  @IsOptional() @IsDateString() rectifiedDate?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateRetentionReleaseDto {
  @IsString() contractId!: string;
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsDateString() releaseDueDate?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() remarks?: string;
}

export class CreateHandoverDto {
  @IsString() contractId!: string;
  @IsOptional() @IsString() completionCertificateId?: string;
  @IsOptional() @IsEnum(HandoverType) handoverType?: HandoverType;
  @IsDateString() handoverDate!: string;
  @IsString() handedOverBy!: string;
  @IsString() receivedBy!: string;
  @IsString() authority!: string;
  @IsOptional() @IsString() remarks?: string;
}

export class CloseProjectDto {
  @IsOptional() @IsBoolean() override?: boolean;
  @IsOptional() @IsString() reason?: string;
}

export class ReopenProjectDto {
  @IsString() @IsNotEmpty() reason!: string;
}
