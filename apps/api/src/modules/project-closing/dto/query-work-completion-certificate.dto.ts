import {
  CompletionCertificateEgpStatus,
  CompletionCertificateSource,
  CompletionCertificateStatus,
} from "@bizovix/database";
import { IsEnum, IsIn, IsOptional, IsString } from "class-validator";
import { PaginationQueryDto } from "../../../common/dto/pagination-query.dto";

export const WORK_COMPLETION_DISPLAY_STATUSES = [
  "NOT_APPLIED",
  "WCC_APPLIED",
  "WCC_OBTAINED",
  "EGP_APPLIED_FOR_MANUAL",
  "MANUAL_WCC_OBTAINED_EGP_APPLIED",
  "MANUAL_WCC_OBTAINED_EGP_NOT_APPLIED",
] as const;

export type WorkCompletionDisplayStatus =
  (typeof WORK_COMPLETION_DISPLAY_STATUSES)[number];

export class QueryWorkCompletionCertificateDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  cmsWorkId?: string;

  @IsOptional()
  @IsEnum(CompletionCertificateSource)
  source?: CompletionCertificateSource;

  @IsOptional()
  @IsEnum(CompletionCertificateEgpStatus)
  egpStatus?: CompletionCertificateEgpStatus;

  @IsOptional()
  @IsEnum(CompletionCertificateStatus)
  certificateStatus?: CompletionCertificateStatus;

  @IsOptional()
  @IsIn(WORK_COMPLETION_DISPLAY_STATUSES)
  displayStatus?: WorkCompletionDisplayStatus;
}
