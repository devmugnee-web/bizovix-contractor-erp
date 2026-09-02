import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class RegisterIncomingMaterialLotDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() inventoryItemId!: string;
  @IsString() @IsNotEmpty() warehouseId!: string;
  @IsOptional() @IsString() locationId?: string | null;
  @IsString() @IsNotEmpty() sourceStockMovementId!: string;
  @IsString() @IsNotEmpty() sourceReference!: string;
  @IsString() @IsNotEmpty() lotNumber!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsString() @IsNotEmpty() unit!: string;
  @IsOptional() @IsDateString() manufacturedAt?: string | null;
  @IsOptional() @IsDateString() retestDueAt?: string | null;
  @IsOptional() @IsDateString() expiresAt?: string | null;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() note?: string | null;
}

export class IncomingInspectionResultDto {
  @IsString() @IsNotEmpty() parameterCode!: string;
  @IsString() @IsNotEmpty() parameterName!: string;
  @IsOptional() @IsString() testMethod?: string | null;
  @IsOptional() @IsString() specification?: string | null;
  @IsOptional() @IsNumber() actualValue?: number | null;
  @IsOptional() @IsString() actualText?: string | null;
  @IsBoolean() passed!: boolean;
  @IsOptional() @IsString() remarks?: string | null;
}

export class InspectIncomingMaterialLotDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsIn(["RELEASED", "REJECTED"]) decision!: "RELEASED" | "REJECTED";
  @IsNumber() @Min(0.0001) sampleQuantity!: number;
  @IsNumber() @Min(0) acceptedQuantity!: number;
  @IsNumber() @Min(0) rejectedQuantity!: number;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IncomingInspectionResultDto)
  results!: IncomingInspectionResultDto[];
  @IsOptional() @IsString() reason?: string | null;
  @IsOptional() @IsString() note?: string | null;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
}

export class MaterialRequisitionLineDto {
  @IsString() @IsNotEmpty() orderMaterialId!: string;
  @IsString() @IsNotEmpty() inventoryLotId!: string;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsOptional() @IsString() unit?: string;
}

export class CreateMaterialRequisitionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() orderId!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MaterialRequisitionLineDto)
  lines!: MaterialRequisitionLineDto[];
  @IsOptional() @IsString() note?: string | null;
}

export class MaterialRequisitionTransitionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() note?: string | null;
}

export class RecordMaterialHandlingEvidenceDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() requisitionId!: string;
  @IsString() @IsNotEmpty() requisitionLineId!: string;
  @IsString() @IsNotEmpty() orderLotId!: string;
  @IsIn(["STAGED", "VERIFIED", "ISSUE_SCAN", "RETURN_SCAN"])
  stage!: "STAGED" | "VERIFIED" | "ISSUE_SCAN" | "RETURN_SCAN";
  @IsString() @IsNotEmpty() barcode!: string;
  @IsOptional() @IsNumber() @Min(0.0001) quantity?: number | null;
  @IsOptional() @IsString() transactionId?: string | null;
  @IsOptional() @IsString() locationId?: string | null;
  @IsOptional() @IsString() verifierUserId?: string | null;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() idempotencyKey!: string;
  @IsOptional() @IsString() note?: string | null;
}
