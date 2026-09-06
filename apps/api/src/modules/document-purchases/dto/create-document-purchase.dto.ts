import { PurchaseType } from "@bizovix/database";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, ValidateIf } from "class-validator";

export class CreateDocumentPurchaseDto {
  @IsEnum(PurchaseType)
  purchaseType!: PurchaseType;

  @ValidateIf((dto: CreateDocumentPurchaseDto) => dto.purchaseType === PurchaseType.EGP)
  @IsString()
  @IsNotEmpty({ message: "Tender ID is required for e-GP purchases" })
  tenderId?: string;

  /** Real FK to an existing Tenders module record — set only when this purchase is initiated from
   * a Tender's own workflow page. When omitted, the backend creates the internal Tender record
   * automatically from this same form so the user never has to enter the tender twice. */
  @IsOptional()
  @IsString()
  linkedTenderId?: string;

  @IsOptional()
  @IsString()
  requestId?: string;

  @IsString()
  @IsNotEmpty()
  organizationMasterId!: string;

  @IsString()
  @IsNotEmpty()
  tenderWorkName!: string;

  @IsDateString()
  purchaseDate!: string;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  documentPrice!: number;

  @IsString()
  @IsNotEmpty()
  paymentFromAccountId!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  estimatedTenderAmount?: number;

  @IsOptional()
  @IsDateString()
  submissionDate?: string;

  @IsOptional()
  @IsDateString()
  openingDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
