import { Type } from "class-transformer";
import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";

export class SubmitTenderDto {
  @IsDateString()
  submissionDate!: string;

  @IsString()
  @IsNotEmpty()
  submissionMethod!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  quotedAmount!: number;

  @IsOptional()
  @IsString()
  submittedByName?: string;

  @IsOptional()
  @IsString()
  submissionReference?: string;

  @IsOptional()
  @IsString()
  checklistStatus?: string;

  @IsOptional()
  @IsString()
  submissionRemarks?: string;
}
