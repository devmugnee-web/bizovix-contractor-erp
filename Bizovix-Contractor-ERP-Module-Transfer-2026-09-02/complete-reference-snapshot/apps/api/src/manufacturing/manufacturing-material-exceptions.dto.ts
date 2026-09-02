import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";

export const MATERIAL_EXCEPTION_KINDS = [
  "ADDITIONAL_ISSUE",
  "SUBSTITUTION",
  "STATUS_TRANSFER",
  "DESTRUCTION",
] as const;

export type MaterialExceptionKind = (typeof MATERIAL_EXCEPTION_KINDS)[number];

export class CreateMaterialExceptionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsIn(MATERIAL_EXCEPTION_KINDS) kind!: MaterialExceptionKind;
  @IsString() @IsNotEmpty() orderId!: string;
  @IsOptional() @IsString() sourceOrderMaterialId?: string | null;
  @IsOptional() @IsString() substituteInventoryItemId?: string | null;
  @IsOptional() @IsString() inventoryLotId?: string | null;
  @IsOptional() @IsString() destinationLocationId?: string | null;
  @IsOptional() @IsString() qualityCaseId?: string | null;
  @IsNumber() @Min(0.0001) quantity!: number;
  @IsOptional() @IsString() @MaxLength(40) unit?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
}

export class DecideMaterialExceptionDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsIn(["APPROVE", "REJECT"]) action!: "APPROVE" | "REJECT";
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) signatureMeaning!: string;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
}

export class RetestManufacturingInventoryLotDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() qualityCaseId!: string;
  @IsDateString() retestDueAt!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
}
