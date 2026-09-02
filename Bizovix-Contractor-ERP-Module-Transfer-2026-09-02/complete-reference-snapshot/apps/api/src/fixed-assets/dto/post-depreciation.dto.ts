import { IsDateString, IsString } from "class-validator";

export class PostDepreciationDto {
  @IsString()
  workspaceId!: string;

  /** Last day of the period being depreciated (e.g. end of the month). */
  @IsDateString()
  periodEnd!: string;
}
