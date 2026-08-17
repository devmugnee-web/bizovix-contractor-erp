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

  /** Real FK to a Tenders module record — set when this purchase is initiated from a Tender's workflow. */
  @IsOptional()
  @IsString()
  linkedTenderId?: string;

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
}
