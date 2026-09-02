import { IsBoolean, IsDateString, IsOptional, IsString } from "class-validator";

export class UpdateOnboardingChecklistDto {
  @IsOptional()
  @IsBoolean()
  documentsCollected?: boolean;

  @IsOptional()
  @IsBoolean()
  joiningFormSubmitted?: boolean;

  @IsOptional()
  @IsBoolean()
  idCardIssued?: boolean;

  @IsOptional()
  @IsBoolean()
  emailAccountCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  accessGranted?: boolean;

  @IsOptional()
  @IsBoolean()
  deviceAllocated?: boolean;

  @IsOptional()
  @IsBoolean()
  workspaceAllocated?: boolean;

  @IsOptional()
  @IsDateString()
  probationReviewDate?: string | null;

  @IsOptional()
  @IsString()
  probationReviewNotes?: string | null;

  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;
}
