import { IsDateString, IsString } from "class-validator";

export class CreateJobApplicationDto {
  @IsString()
  candidateId!: string;

  @IsString()
  jobOpeningId!: string;

  @IsDateString()
  appliedDate!: string;
}
