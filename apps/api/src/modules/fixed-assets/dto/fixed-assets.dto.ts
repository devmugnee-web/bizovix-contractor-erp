import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import {
  AssetAcquisitionType,
  AssetCondition,
  AssetFundingMode,
  AssetOperationalStatus,
  FixedAssetDepreciationMethod,
  FixedAssetStatus,
} from "@bizovix/database";

export class QueryFixedAssetsDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsEnum(FixedAssetStatus) status?: FixedAssetStatus;
}

export class CreateAssetCategoryDto {
  @IsString() name!: string;
  @IsString() code!: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() defaultUsefulLifeMonths?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultSalvageValue?: number;
  @IsOptional() @IsEnum(FixedAssetDepreciationMethod) defaultDepreciationMethod?: FixedAssetDepreciationMethod;
}

export class UpdateAssetCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() defaultUsefulLifeMonths?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultSalvageValue?: number;
  @IsOptional() @IsEnum(FixedAssetDepreciationMethod) defaultDepreciationMethod?: FixedAssetDepreciationMethod;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateFixedAssetDto {
  @IsString() name!: string;
  @IsString() categoryId!: string;
  @IsOptional() @IsString() assetCode?: string;
  @IsOptional() @IsString() supplierId?: string;
  @IsEnum(AssetFundingMode) fundingMode!: AssetFundingMode;
  @IsOptional() @IsString() fundingBankAccountId?: string;
  @IsDateString() purchaseDate!: string;
  @Type(() => Number) @IsNumber() @IsPositive() purchaseCost!: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) transportationCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) installationCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) importDuty?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) registrationCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) otherCapitalizedCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) salvageValue?: number;
  @Type(() => Number) @IsInt() @IsPositive() usefulLifeMonths!: number;
  @IsOptional() @IsEnum(FixedAssetDepreciationMethod) depreciationMethod?: FixedAssetDepreciationMethod;
  @IsOptional() @IsBoolean() useManualDepreciation?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() manualDepreciationAmount?: number;
  @IsOptional() @IsEnum(AssetAcquisitionType) acquisitionType?: AssetAcquisitionType;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() assignedToName?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsEnum(AssetOperationalStatus) operationalStatus?: AssetOperationalStatus;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class UpdateFixedAssetDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() location?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsString() assignedToName?: string;
  @IsOptional() @IsString() brand?: string;
  @IsOptional() @IsString() model?: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() serialNumber?: string;
  @IsOptional() @IsString() registrationNumber?: string;
  @IsOptional() @IsEnum(AssetCondition) condition?: AssetCondition;
  @IsOptional() @IsEnum(AssetOperationalStatus) operationalStatus?: AssetOperationalStatus;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) salvageValue?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() usefulLifeMonths?: number;
  @IsOptional() @IsBoolean() useManualDepreciation?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @IsPositive() manualDepreciationAmount?: number | null;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class PostDepreciationDto {
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}

export class BulkPostDepreciationDto extends PostDepreciationDto {
  @IsOptional() @IsArray() @IsString({ each: true }) assetIds?: string[];
}
