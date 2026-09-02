import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export class StartManufacturingDowntimeDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsString() @IsNotEmpty() orderId!: string;
  @IsString() @IsNotEmpty() operationExecutionId!: string;
  @IsString() @IsNotEmpty() resourceId!: string;
  @IsOptional() @IsString() @MaxLength(80) reasonCode?: string | null;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(160) signatureMeaning?: string | null;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
}

export class EndManufacturingDowntimeDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
  @IsOptional() @IsString() @MaxLength(1000) endNote?: string | null;
  @IsOptional() @IsString() @MaxLength(160) signatureMeaning?: string | null;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
}

export const MANUFACTURING_DOWNTIME_STATUSES = ["OPEN", "ENDED"] as const;
export type ManufacturingDowntimeStatusFilter =
  (typeof MANUFACTURING_DOWNTIME_STATUSES)[number];

export class ListManufacturingDowntimesDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
  @IsOptional()
  @IsIn(MANUFACTURING_DOWNTIME_STATUSES)
  status?: ManufacturingDowntimeStatusFilter;
  @IsOptional() @IsString() orderId?: string;
  @IsOptional() @IsString() resourceId?: string;
}
