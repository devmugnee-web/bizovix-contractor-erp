import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class ApproveChallanSubmissionDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  approvedAmount?: number;
}

export class ChallanActionReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
