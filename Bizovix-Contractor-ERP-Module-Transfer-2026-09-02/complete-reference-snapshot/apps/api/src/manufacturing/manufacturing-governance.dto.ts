import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";

export const MANUFACTURING_GOVERNANCE_KINDS = [
  "TOOLS_DIES_MOULDS",
  "APPROVAL_WORKFLOW",
  "USER_ACCESS_REVIEW",
  "ELECTRONIC_SIGNATURE_POLICY",
  "STATUS_CONFIGURATION",
  "ALERT_NOTIFICATION_RULE",
  "PRINT_TEMPLATE",
  "INTEGRATION_SETTING",
  "ENVIRONMENT_UTILITY_CHECK",
  "QUALITY_CASE",
  "COMPLIANCE_RECORD",
  "RECALL_DRILL",
  "DATA_RETENTION_POLICY",
  "VALIDATION_DOCUMENT",
  "AUDIT_EVIDENCE_PACK",
  "EXECUTION_EVIDENCE",
] as const;

export type ManufacturingGovernanceKind =
  (typeof MANUFACTURING_GOVERNANCE_KINDS)[number];

export class ManufacturingGovernanceWorkspaceDto {
  @IsString() @IsNotEmpty() workspaceId!: string;
}

export class CreateManufacturingGovernanceRecordDto extends ManufacturingGovernanceWorkspaceDto {
  @IsIn(MANUFACTURING_GOVERNANCE_KINDS) kind!: ManufacturingGovernanceKind;
  @IsString() @IsNotEmpty() @MaxLength(80) code!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsObject() details!: Record<string, unknown>;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string | null;
}

export class ReviseManufacturingGovernanceRecordDto extends ManufacturingGovernanceWorkspaceDto {
  @IsString() @IsNotEmpty() @MaxLength(160) name!: string;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsObject() details!: Record<string, unknown>;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
}

export class TransitionManufacturingGovernanceRecordDto extends ManufacturingGovernanceWorkspaceDto {
  @IsIn(["APPROVE", "RETIRE", "CANCEL"]) action!:
    "APPROVE" | "RETIRE" | "CANCEL";
  @IsString() @IsNotEmpty() @MaxLength(1000) reason!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) signatureMeaning!: string;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
}

export class RecordManufacturingControlledPrintDto extends ManufacturingGovernanceWorkspaceDto {
  @IsString() @IsNotEmpty() recordId!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) copyNumber!: string;
  @IsIn(["CONTROLLED", "UNCONTROLLED"]) copyType!:
    "CONTROLLED" | "UNCONTROLLED";
  @IsString() @IsNotEmpty() @MaxLength(160) idempotencyKey!: string;
  @IsDateString() transactionDate!: string;
  @IsString() @IsNotEmpty() @MaxLength(160) signatureMeaning!: string;
  @IsOptional() @IsString() @MaxLength(512) reauthenticationPassword?:
    string | null;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string | null;
}
