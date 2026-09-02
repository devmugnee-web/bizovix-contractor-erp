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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

const LABEL_STATUSES = [
  "ISSUED",
  "USED",
  "RETURNED",
  "VOIDED",
  "DESTROYED",
] as const;
const PACKAGE_LEVELS = ["UNIT", "CARTON", "SHIPPER", "PALLET"] as const;

export class CreateManufacturingSerialRuleDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional() @IsString() orderId?: string | null;
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsString() prefix!: string;
  @IsOptional() @IsString() suffix?: string | null;
  @IsInt() @Min(0) @Max(2147483647) startNumber!: number;
  @IsInt() @Min(0) @Max(2147483647) endNumber!: number;
  @IsOptional() @IsInt() @Min(1) @Max(18) padding?: number;
}

export class ManufacturingSignedActionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() signatureMeaning!: string;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsOptional() @IsString() note?: string | null;
}

export class AllocateManufacturingSerialsDto extends ManufacturingSignedActionDto {
  @IsString() @IsNotEmpty() orderId!: string;
  @IsOptional() @IsString() orderLotId?: string | null;
  @IsInt() @Min(1) quantity!: number;
}

export class SerialQualityResultDto {
  @IsString() @IsNotEmpty() parameterCode!: string;
  @IsString() @IsNotEmpty() parameterName!: string;
  @IsOptional() @IsString() testMethod?: string | null;
  @IsOptional() @IsString() unit?: string | null;
  @IsOptional() @IsNumber() specificationMin?: number | null;
  @IsOptional() @IsNumber() specificationMax?: number | null;
  @IsOptional() @IsString() specificationText?: string | null;
  @IsOptional() @IsNumber() actualValue?: number | null;
  @IsOptional() @IsString() actualText?: string | null;
  @IsBoolean() passed!: boolean;
  @IsOptional() @IsString() remarks?: string | null;
}

export class SerialQualityInspectionDto {
  @IsString() @IsNotEmpty() serialId!: string;
  @IsBoolean() passed!: boolean;
  @IsOptional() @IsString() holdReason?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SerialQualityResultDto)
  results!: SerialQualityResultDto[];
}

export class RecordSerialQualityDto extends ManufacturingSignedActionDto {
  @IsString() @IsNotEmpty() orderId!: string;
  @IsOptional() @IsString() orderLotId?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SerialQualityInspectionDto)
  inspections!: SerialQualityInspectionDto[];
}

export class CreateManufacturingPackagingOrderDto extends ManufacturingSignedActionDto {
  @IsString() @IsNotEmpty() orderId!: string;
  @IsOptional() @IsString() orderLotId?: string | null;
  @IsString() @IsNotEmpty() packagingConfigurationId!: string;
  @IsOptional() @IsString() packagingOrderNumber?: string;
  @IsNumber() @Min(0.0001) plannedQuantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
}

export class RetryPackagingMaterialReservationDto extends ManufacturingSignedActionDto {}

export class RecordPackagingLineClearanceDto extends ManufacturingSignedActionDto {
  @IsString() @IsNotEmpty() evidenceReference!: string;
}

export class PackagingReconciliationLineDto {
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsNumber() @Min(0) usedQuantity!: number;
  @IsNumber() @Min(0) returnedQuantity!: number;
  @IsNumber() @Min(0) rejectedQuantity!: number;
  @IsNumber() @Min(0) destroyedQuantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
  @IsOptional() @IsString() note?: string | null;
}

export class ReconcileManufacturingPackagingDto extends ManufacturingSignedActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PackagingReconciliationLineDto)
  lines!: PackagingReconciliationLineDto[];
}

export class PackagingLabelDto {
  @IsString() @IsNotEmpty() labelCode!: string;
  @IsOptional() @IsString() serialId?: string | null;
  @IsIn(LABEL_STATUSES) status!: (typeof LABEL_STATUSES)[number];
  @IsOptional() @IsString() dispositionReason?: string | null;
}

export class RegisterManufacturingPackagingLabelsDto extends ManufacturingSignedActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PackagingLabelDto)
  labels!: PackagingLabelDto[];
}

export class PackagingUnitDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsIn(PACKAGE_LEVELS) level!: (typeof PACKAGE_LEVELS)[number];
  @IsOptional() @IsString() parentCode?: string | null;
  @IsOptional() @IsString() serialId?: string | null;
  @IsOptional() @IsNumber() @Min(0.0001) quantity?: number;
  @IsOptional() @IsString() note?: string | null;
}

export class RegisterManufacturingPackageUnitsDto extends ManufacturingSignedActionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PackagingUnitDto)
  units!: PackagingUnitDto[];
}

export class ConfirmPackagingReleaseReadinessDto extends ManufacturingSignedActionDto {}
