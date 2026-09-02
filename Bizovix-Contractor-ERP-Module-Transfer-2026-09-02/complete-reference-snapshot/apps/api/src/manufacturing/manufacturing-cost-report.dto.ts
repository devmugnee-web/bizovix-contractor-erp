import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

const COST_TYPES = [
  "LABOUR",
  "MACHINE",
  "OVERHEAD",
  "SUBCONTRACT",
  "OTHER",
] as const;
const DRIVER_BASES = [
  "FLAT",
  "OUTPUT_QUANTITY",
  "LABOUR_HOURS",
  "MACHINE_HOURS",
  "MATERIAL_COST_PERCENT",
  "PRIME_COST_PERCENT",
] as const;

export class CreateManufacturingCostDriverDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsIn(COST_TYPES) costType!: (typeof COST_TYPES)[number];
  @IsIn(DRIVER_BASES) basis!: (typeof DRIVER_BASES)[number];
  @IsOptional() @IsString() unit?: string | null;
  @IsNumber() @Min(0) rate!: number;
  @IsString() @IsNotEmpty() clearingAccountId!: string;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateManufacturingCostDriverDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional() @IsString() @IsNotEmpty() code?: string;
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsIn(COST_TYPES) costType?: (typeof COST_TYPES)[number];
  @IsOptional() @IsIn(DRIVER_BASES) basis?: (typeof DRIVER_BASES)[number];
  @IsOptional() @IsString() unit?: string | null;
  @IsOptional() @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsString() @IsNotEmpty() clearingAccountId?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ManufacturingStandardCostLineDto {
  @IsInt() @Min(1) sequence!: number;
  @IsIn([
    "MATERIAL",
    "LABOUR",
    "MACHINE",
    "OVERHEAD",
    "PACKAGING",
    "SUBCONTRACT",
    "OTHER",
  ])
  costType!:
    | "MATERIAL"
    | "LABOUR"
    | "MACHINE"
    | "OVERHEAD"
    | "PACKAGING"
    | "SUBCONTRACT"
    | "OTHER";
  @IsString() @IsNotEmpty() description!: string;
  @IsOptional() @IsNumber() @Min(0.0001) quantity?: number;
  @IsOptional() @IsNumber() @Min(0) rate?: number;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() costDriverId?: string | null;
  @IsOptional() @IsString() clearingAccountId?: string | null;
}

export class CreateManufacturingStandardCostDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsString() notes?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ManufacturingStandardCostLineDto)
  lines!: ManufacturingStandardCostLineDto[];
}

export class ApproveManufacturingStandardCostDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() note?: string | null;
}

export class PostManufacturingActualCostDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() costDriverId!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsNumber() @Min(0.0001) basisQuantity?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() referenceNo?: string | null;
  @IsOptional() @IsString() note?: string | null;
}

export class FinalizeManufacturingActualCostDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() standardCostVersionId?: string | null;
  @IsOptional() @IsString() note?: string | null;
}
