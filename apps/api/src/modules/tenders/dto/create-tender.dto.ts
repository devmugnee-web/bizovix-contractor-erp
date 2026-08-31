import { TenderProcurementMethod, TenderStatus } from "@bizovix/database";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from "class-validator";

export class CreateTenderDto {
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: "organizationMasterId must contain text" })
  organizationMasterId?: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: "Tender ID must contain text" })
  @MaxLength(100)
  egpTenderId!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/\S/, { message: "Product / Work Name must contain text" })
  @MaxLength(300)
  workName!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: "category must contain text" })
  @MaxLength(150)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  tenderType?: string;

  @IsOptional()
  @IsEnum(TenderProcurementMethod)
  procurementMethod?: TenderProcurementMethod;

  @IsOptional()
  @IsString()
  @MaxLength(100)
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
  @IsBoolean()
  payOrderRequired?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  payOrderAmount?: number;

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
  foundByUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  foundByName?: string;

  @IsOptional()
  @IsDateString()
  findingDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  remarks?: string;
}
