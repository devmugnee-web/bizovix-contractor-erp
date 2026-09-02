import { Type } from "class-transformer";
import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";

export class FundingSourceDto {
  @IsString()
  accountId!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount!: number;
}

const conditions = ["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"] as const;
const operationalStatuses = ["AVAILABLE", "ASSIGNED", "ACTIVE", "UNDER_MAINTENANCE", "DAMAGED", "LOST", "RETIRED"] as const;
const acquisitionTypes = [
  "DIRECT_PURCHASE",
  "PURCHASE_ORDER",
  "OPENING_ASSET",
  "DONATION",
  "TRANSFER_IN",
  "INTERNALLY_CONSTRUCTED",
  "OTHER",
] as const;

export class CreateFixedAssetDto {
  @IsString()
  workspaceId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  assignedToName?: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  serialNumber?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsIn(conditions)
  condition?: (typeof conditions)[number];

  @IsOptional()
  @IsIn(operationalStatuses)
  operationalStatus?: (typeof operationalStatuses)[number];

  @IsOptional()
  @IsIn(acquisitionTypes)
  acquisitionType?: (typeof acquisitionTypes)[number];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsDateString()
  purchaseDate!: string;

  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  purchaseCost!: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  transportationCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  installationCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  importDuty?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  registrationCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  otherCapitalizedCost?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  salvageValue?: number;

  @IsInt()
  @Min(1)
  usefulLifeMonths!: number;

  @IsOptional()
  @IsIn(["STRAIGHT_LINE"])
  depreciationMethod?: string;

  @IsOptional()
  useManualDepreciation?: boolean;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  manualDepreciationAmount?: number | null;

  /** "CASH_BANK" pays the full capitalized cost from `fundingAccountId` now (the
   * ledger's opening balance mechanism). "CREDIT" instead books it against
   * `supplierId` as a payable, via a journal entry — no cash/bank ledger moves
   * on acquisition day. */
  @IsOptional()
  @IsIn(["CASH_BANK", "CREDIT"])
  fundingMode?: "CASH_BANK" | "CREDIT";

  /** Single Cash/Bank/MFS ledger the purchase cost was funded from. Kept for
   * the simple one-ledger case and backward compatibility; when the payment is
   * split across several ledgers, send `fundingSources` instead. */
  @IsOptional()
  @IsString()
  fundingAccountId?: string;

  /** Split the capitalized cost across several Cash/Bank/MFS ledgers (e.g. part
   * cash, part bank, part cheque, part MFS). Amounts must total the capitalized
   * cost. Takes precedence over `fundingAccountId` when present. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FundingSourceDto)
  fundingSources?: FundingSourceDto[];

  /** Required when fundingMode is CREDIT — the supplier this asset is payable to. */
  @IsOptional()
  @IsString()
  supplierId?: string;
}
