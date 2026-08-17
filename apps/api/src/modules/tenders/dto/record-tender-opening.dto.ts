import { Type } from "class-transformer";
import { IsDateString, IsIn, IsNumber, IsOptional, IsString } from "class-validator";

const OPENING_RESULT_STATUSES = ["OPENED", "UNDER_PROCESS", "AWARDED", "REJECTED"] as const;
export type OpeningResultStatus = (typeof OPENING_RESULT_STATUSES)[number];

export class RecordTenderOpeningDto {
  @IsDateString()
  openingDate!: string;

  @IsIn(OPENING_RESULT_STATUSES)
  status!: OpeningResultStatus;

  @IsOptional()
  @IsString()
  openingResult?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  lowestBidAmount?: number;

  @IsOptional()
  @IsString()
  lowestBidder?: string;

  @IsOptional()
  @IsString()
  resultRemarks?: string;
}
