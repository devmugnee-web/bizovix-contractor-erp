import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

const applicationStages = [
  "APPLIED",
  "SCREENING",
  "SHORTLISTED",
  "INTERVIEW",
  "ASSESSMENT",
  "REFERENCE_CHECK",
  "SELECTED",
  "OFFER_SENT",
  "OFFER_ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
] as const;

export class UpdateJobApplicationDto {
  @IsOptional()
  @IsIn(applicationStages)
  stage?: (typeof applicationStages)[number];

  @IsOptional()
  @IsDateString()
  interviewDate?: string | null;

  @IsOptional()
  @IsString()
  interviewNotes?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  assessmentScore?: number | null;

  @IsOptional()
  @IsString()
  referenceCheckNotes?: string | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  offeredSalary?: number | null;

  @IsOptional()
  @IsDateString()
  offerDate?: string | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
