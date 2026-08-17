import { TenderStatus } from "@bizovix/database";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from "class-validator";

export class CreateTenderDto {
  @IsString()
  @IsNotEmpty()
  organizationMasterId!: string;

  @IsOptional()
  @IsString()
  egpTenderId?: string;

  @IsString()
  @IsNotEmpty()
  workName!: string;

  @IsString()
  @IsNotEmpty()
  category!: string;

  @IsOptional()
  @IsString()
  tenderType?: string;

  @IsOptional()
  @IsString()
  procurementMethod?: string;

  @IsOptional()
  @IsString()
  tenderMethod?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contractValue?: number;

  @IsOptional()
  @IsEnum(TenderStatus)
  status?: TenderStatus;

  @IsOptional()
  @IsDateString()
  publishedDate?: string;

  @IsOptional()
  @IsDateString()
  documentPurchaseDeadline?: string;

  @IsOptional()
  @IsDateString()
  preBidDate?: string;

  @IsOptional()
  @IsDateString()
  submissionDeadline?: string;

  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @IsOptional()
  @IsBoolean()
  tenderSecurityRequired?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedTenderSecurityAmount?: number;

  @IsOptional()
  @IsString()
  assignedToUserId?: string;

  @IsOptional()
  @IsString()
  assignedToName?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
