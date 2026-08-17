import { Type } from "class-transformer";
import { IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  documentType?: string;

  @IsOptional()
  @IsString()
  relatedModule?: string;

  @IsOptional()
  @IsString()
  relatedEntityId?: string;

  @IsOptional()
  @IsString()
  relatedEntityName?: string;

  @IsOptional()
  @IsString()
  tenderId?: string;

  @IsOptional()
  @IsString()
  workId?: string;

  @IsOptional()
  @IsString()
  contractId?: string;

  @IsOptional()
  @IsString()
  projectBillId?: string;

  @IsOptional()
  @IsString()
  variationOrderId?: string;

  @IsOptional()
  @IsString()
  timeExtensionId?: string;

  @IsOptional() @IsString() completionCertificateId?: string;
  @IsOptional() @IsString() dlpId?: string;
  @IsOptional() @IsString() defectId?: string;
  @IsOptional() @IsString() retentionReleaseId?: string;
  @IsOptional() @IsString() projectHandoverId?: string;

  @IsOptional()
  @IsString()
  organizationMasterId?: string;

  @IsOptional()
  @IsString()
  referenceNumber?: string;

  @IsOptional()
  @IsString()
  certificateNumber?: string;

  @IsOptional()
  @IsString()
  issuingAuthority?: string;

  @IsOptional()
  @IsString()
  account?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  reminderDays?: number;

  @IsOptional()
  @IsString()
  responsiblePerson?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Comma-separated on the wire (multipart form field) — split into an array in the service. */
  @IsOptional()
  @IsString()
  tags?: string;
}
