import { IsDateString, IsOptional, IsString, Matches, MaxLength } from "class-validator";
import type { TenderChallanPdfOptions } from "@bizovix/types";

export class TenderChallanPdfDto implements TenderChallanPdfOptions {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  deliveryPlace?: string;
}
