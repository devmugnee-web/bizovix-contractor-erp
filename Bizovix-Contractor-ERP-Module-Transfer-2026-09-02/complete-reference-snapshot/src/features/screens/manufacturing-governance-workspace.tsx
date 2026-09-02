"use client";

import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileClock,
  FilePlus2,
  History,
  Paperclip,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLcInventoryItemsQuery } from "@/hooks/use-lc-query";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  createManufacturingGovernanceRecord,
  getManufacturingValidationReadiness,
  listManufacturingGovernanceAudit,
  listManufacturingGovernanceRecords,
  recordManufacturingControlledPrint,
  reviseManufacturingGovernanceRecord,
  transitionManufacturingGovernanceRecord,
} from "@/services/manufacturing-governance.service";
import {
  getManufacturingOrder,
  listManufacturingOrders,
  listManufacturingRoutingAssignees,
} from "@/services/manufacturing.service";
import {
  qualityCaseMaterialLinkValues,
  qualityCaseOrderLinkValues,
} from "./manufacturing-quality-case-form";
import type {
  ManufacturingGovernanceKind,
  ManufacturingGovernanceRecord,
} from "@/types/manufacturing-governance";

type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "date"
  | "boolean"
  | "select"
  | "list"
  | "stages"
  | "transitions"
  | "entries"
  | "order-select"
  | "order-material-select"
  | "item-select"
  | "member-select";
type FieldDefinition = {
  key: string;
  label: string;
  type?: FieldType;
  options?: string[];
  placeholder?: string;
  defaultValue?: string | boolean;
  required?: boolean;
  trainingOnly?: boolean;
};
type ViewConfiguration = {
  kinds: ManufacturingGovernanceKind[];
  description: string;
  defaults?: Record<string, string | boolean>;
};
type EvidenceAttachment = {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256?: string;
  dataUrl: string;
};

const inputClass = "h-9 rounded-lg border-[#d7e1ee] bg-white text-sm";
const selectClass =
  "h-9 w-full rounded-lg border border-[#d7e1ee] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#8dbbf2]";
const textareaClass =
  "min-h-20 w-full resize-y rounded-lg border border-[#d7e1ee] bg-white px-3 py-2 text-sm text-[#334155] outline-none focus:border-[#8dbbf2]";
const evidenceAttachmentKinds = new Set<ManufacturingGovernanceKind>([
  "VALIDATION_DOCUMENT",
  "AUDIT_EVIDENCE_PACK",
]);
const evidenceAccept =
  ".pdf,.png,.jpg,.jpeg,.webp,.txt,.log,.csv,.json,.docx,.xlsx";
const evidenceMimeByExtension: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  txt: "text/plain",
  log: "text/plain",
  csv: "text/csv",
  json: "application/json",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const validationTypes = [
  "URS",
  "FS",
  "DS",
  "RISK_ASSESSMENT",
  "DATA_FLOW_ARCHITECTURE",
  "ROLE_ACCESS_MATRIX",
  "TRACEABILITY_MATRIX",
  "IQ",
  "OQ",
  "PQ_UAT",
  "BACKUP_RESTORE_TEST",
  "DISASTER_RECOVERY_TEST",
  "SECURITY_TEST",
  "AUDIT_TRAIL_TEST",
  "ELECTRONIC_SIGNATURE_TEST",
  "DATA_MIGRATION_VALIDATION",
  "INTEGRATION_VALIDATION",
  "SOP",
  "TRAINING_RECORD",
  "CHANGE_CONTROL",
  "PERIODIC_REVIEW",
  "INCIDENT_PROBLEM_MANAGEMENT",
  "DECOMMISSION_ARCHIVE_PLAN",
];

const fieldsByKind: Record<ManufacturingGovernanceKind, FieldDefinition[]> = {
  TOOLS_DIES_MOULDS: [
    {
      key: "resourceType",
      label: "Resource type",
      type: "select",
      options: ["TOOL", "DIE", "MOULD", "JIG", "GAUGE"],
    },
    { key: "resourceCode", label: "Resource code" },
    {
      key: "readinessState",
      label: "Readiness",
      type: "select",
      options: ["READY", "DUE_SOON", "BLOCKED"],
    },
    { key: "evidenceReference", label: "Readiness evidence reference" },
  ],
  APPROVAL_WORKFLOW: [
    {
      key: "workflowScope",
      label: "Workflow scope",
      type: "select",
      options: [
        "BOM_VERSION",
        "ROUTING_VERSION",
        "PRODUCTION_PLAN",
        "PRODUCTION_ORDER",
        "MATERIAL_ISSUE",
        "PRODUCTION_COMPLETION",
        "QUALITY_RESULT",
        "FINAL_RELEASE",
      ],
    },
    {
      key: "stages",
      label: "Approval stages",
      type: "stages",
      placeholder:
        "1 | manufacturing.order.approve | Approved\n2 | manufacturing.audit.review | Verified",
    },
  ],
  USER_ACCESS_REVIEW: [
    { key: "reviewPeriod", label: "Review period" },
    { key: "reviewerReference", label: "Reviewer reference" },
    { key: "evidenceReference", label: "Approved access-matrix evidence" },
  ],
  ELECTRONIC_SIGNATURE_POLICY: [
    {
      key: "signatureMeanings",
      label: "Allowed signature meanings",
      type: "list",
      placeholder: "Reviewed, Approved, Verified, Released",
    },
    {
      key: "reauthenticationRequired",
      label: "Require reauthentication",
      type: "boolean",
      defaultValue: true,
    },
    {
      key: "sessionTimeoutMinutes",
      label: "Session timeout (minutes)",
      type: "number",
      defaultValue: "15",
    },
    {
      key: "mfaRequired",
      label: "Require MFA (blocks approval until MFA is configured)",
      type: "boolean",
      defaultValue: false,
    },
  ],
  STATUS_CONFIGURATION: [
    { key: "workflowScope", label: "Workflow scope" },
    {
      key: "transitions",
      label: "Allowed status transitions",
      type: "transitions",
      placeholder:
        "DRAFT | SUBMITTED | manufacturing.order.create\nSUBMITTED | APPROVED | manufacturing.order.approve",
    },
  ],
  ALERT_NOTIFICATION_RULE: [
    { key: "eventCode", label: "Manufacturing event code" },
    {
      key: "channels",
      label: "Channels",
      type: "list",
      placeholder: "IN_APP, EMAIL",
    },
    {
      key: "recipientRoles",
      label: "Recipient roles",
      type: "list",
      placeholder: "Production Manager, QA Manager",
    },
  ],
  PRINT_TEMPLATE: [
    {
      key: "documentType",
      label: "Controlled document type",
      type: "select",
      options: [
        "PRODUCTION_PLAN",
        "PRODUCTION_ORDER",
        "MATERIAL_REQUISITION",
        "MATERIAL_ISSUE",
        "DISPENSING_SHEET",
        "MASTER_FORMULA",
        "EBMR",
        "EBPR",
        "LINE_CLEARANCE",
        "QC_WORKSHEET",
        "COA",
        "DEVIATION",
        "CAPA",
        "BATCH_RELEASE",
        "PACKAGING_RECONCILIATION",
        "FG_RECEIPT",
        "PRODUCTION_COST_SHEET",
        "BATCH_GENEALOGY",
        "RECALL_REPORT",
      ],
    },
    { key: "templateReference", label: "Template or approved asset reference" },
    {
      key: "controlledCopy",
      label: "Controlled-copy watermark",
      type: "boolean",
      defaultValue: true,
    },
  ],
  INTEGRATION_SETTING: [
    { key: "systemName", label: "System / device" },
    {
      key: "direction",
      label: "Direction",
      type: "select",
      options: ["INBOUND", "OUTBOUND", "BIDIRECTIONAL"],
    },
    { key: "endpointReference", label: "Endpoint configuration reference" },
    {
      key: "secretReference",
      label: "Secret-manager reference",
      placeholder: "Secret values are never stored here",
    },
  ],
  ENVIRONMENT_UTILITY_CHECK: [
    {
      key: "monitoringType",
      label: "Monitoring type",
      type: "select",
      options: ["ENVIRONMENT", "WATER", "UTILITY"],
    },
    { key: "parameter", label: "Parameter" },
    { key: "result", label: "Measured result" },
    { key: "unit", label: "Unit" },
    { key: "acceptanceCriteria", label: "Acceptance criteria" },
    {
      key: "outcome",
      label: "Outcome",
      type: "select",
      options: ["PASS", "FAIL", "REVIEW_REQUIRED"],
    },
    { key: "evidenceReference", label: "Signed evidence reference" },
  ],
  QUALITY_CASE: [
    {
      key: "caseType",
      label: "Case type",
      type: "select",
      options: [
        "OOS",
        "OOT",
        "DEVIATION",
        "CAPA",
        "CHANGE_CONTROL",
        "COMPLAINT",
        "DESTRUCTION",
      ],
    },
    {
      key: "sourceReference",
      label: "Batch, lot, order or complaint reference",
    },
    {
      key: "productionOrderId",
      label: "Linked production order (order or item required)",
      type: "order-select",
      required: false,
    },
    {
      key: "inventoryItemId",
      label: "Linked inventory item (order or item required)",
      type: "item-select",
      required: false,
    },
    {
      key: "inventoryLotId",
      label: "Exact inventory lot ID (destruction / lot control)",
      required: false,
    },
    {
      key: "bomVersionId",
      label: "Exact BOM version ID (controlled substitution)",
      required: false,
    },
    {
      key: "bomComponentId",
      label: "Exact BOM component ID (controlled substitution)",
      required: false,
    },
    {
      key: "approvedSubstituteInventoryItemId",
      label: "Approved substitute inventory item",
      type: "item-select",
      required: false,
    },
    {
      key: "approvedSubstituteQuantity",
      label: "Approved substitute quantity",
      type: "number",
      required: false,
    },
    {
      key: "approvedSubstituteUnit",
      label: "Approved substitute unit",
      required: false,
    },
    {
      key: "targetDisposition",
      label: "Authorized target disposition (status transfer)",
      type: "select",
      options: ["QC_HOLD", "REJECTED"],
      required: false,
    },
    {
      key: "orderMaterialId",
      label: "Production-order material (variance approval)",
      type: "order-material-select",
      required: false,
    },
    {
      key: "approvedVarianceQuantity",
      label: "Approved signed variance quantity (+ overuse / - underuse)",
      type: "number",
      required: false,
    },
    {
      key: "approvedVarianceUnit",
      label: "Approved variance unit",
      required: false,
    },
    {
      key: "varianceReason",
      label: "Investigated variance reason",
      required: false,
    },
    {
      key: "severity",
      label: "Severity",
      type: "select",
      options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
    },
    { key: "ownerReference", label: "Owner / investigator" },
    {
      key: "state",
      label: "Case state",
      type: "select",
      options: [
        "OPEN",
        "INVESTIGATION",
        "ACTION_PENDING",
        "EFFECTIVENESS_REVIEW",
        "CLOSED",
      ],
    },
    { key: "targetDate", label: "Target date", type: "date" },
  ],
  COMPLIANCE_RECORD: [
    {
      key: "recordType",
      label: "Record type",
      type: "select",
      options: [
        "COA",
        "STABILITY",
        "RETENTION_SAMPLE",
        "QUALIFICATION",
        "PQR_APR",
        "CLEANING",
        "LINE_CLEARANCE",
      ],
    },
    {
      key: "sourceReference",
      label: "Batch, product, resource or protocol reference",
    },
    { key: "reviewDate", label: "Review date", type: "date" },
    { key: "evidenceReference", label: "Approved evidence reference" },
  ],
  RECALL_DRILL: [
    { key: "scope", label: "Recall scope" },
    { key: "traceCriteria", label: "Lot / serial / customer trace criteria" },
    {
      key: "outcome",
      label: "Outcome",
      type: "select",
      options: ["SUCCESSFUL", "PARTIAL", "FAILED"],
    },
    { key: "evidenceReference", label: "Recall evidence reference" },
  ],
  DATA_RETENTION_POLICY: [
    { key: "recordType", label: "Record type / scope" },
    {
      key: "retentionYears",
      label: "Retention years",
      type: "number",
      defaultValue: "7",
    },
    { key: "archiveMethod", label: "Archive and retrieval method" },
  ],
  VALIDATION_DOCUMENT: [
    {
      key: "documentType",
      label: "Validation document type",
      type: "select",
      options: validationTypes,
    },
    { key: "documentNumber", label: "Document number" },
    { key: "documentVersion", label: "Document version" },
    { key: "ownerReference", label: "Document owner" },
    { key: "evidenceReference", label: "Controlled file / evidence reference" },
    {
      key: "subjectUserId",
      label: "Qualified workspace user",
      type: "member-select",
      trainingOnly: true,
    },
    {
      key: "qualificationScope",
      label: "Qualification scope",
      placeholder: "ALL, routing operation ID or operation code",
      defaultValue: "ALL",
      trainingOnly: true,
    },
    {
      key: "qualificationOutcome",
      label: "Qualification outcome",
      type: "select",
      options: ["QUALIFIED", "NOT_QUALIFIED", "EXPIRED"],
      defaultValue: "QUALIFIED",
      trainingOnly: true,
    },
  ],
  AUDIT_EVIDENCE_PACK: [
    { key: "scope", label: "Audit scope" },
    { key: "periodFrom", label: "Period from", type: "date" },
    { key: "periodTo", label: "Period to", type: "date" },
    { key: "evidenceReference", label: "Evidence-pack reference" },
  ],
  EXECUTION_EVIDENCE: [
    { key: "orderId", label: "Production order ID" },
    {
      key: "recordType",
      label: "Execution record type",
      type: "select",
      options: [
        "PROCESS_PARAMETER",
        "IN_PROCESS_CHECK",
        "STAGE_YIELD",
        "WIP_TRANSFER",
        "BULK_TRANSFER",
        "PARTIAL_COMPLETION",
        "DOWNTIME",
        "DAMAGE_SCRAP",
        "OPERATOR_HANDOVER",
        "EBMR",
      ],
    },
    {
      key: "entries",
      label: "Signed execution entries",
      type: "entries",
      placeholder:
        "Temperature | 4.2 | C | PASS\nOperator handover | Shift B | - | VERIFIED",
    },
    {
      key: "evidenceReference",
      label: "Source evidence / attachment reference",
    },
  ],
};

const viewConfigurations: Record<string, ViewConfiguration> = {
  "tools-dies-and-moulds": {
    kinds: ["TOOLS_DIES_MOULDS"],
    description:
      "Version-controlled tool, die, mould, jig and gauge readiness master.",
  },
  "approval-workflow": {
    kinds: ["APPROVAL_WORKFLOW"],
    description:
      "Configure ordered maker-checker approval stages with permission and signature meaning.",
  },
  "user-roles-and-permissions": {
    kinds: ["USER_ACCESS_REVIEW"],
    description:
      "Record periodic role/access reviews against the approved access matrix.",
  },
  "electronic-signature-settings": {
    kinds: ["ELECTRONIC_SIGNATURE_POLICY"],
    description:
      "Controlled signature meanings, reauthentication, MFA and session policy.",
  },
  "status-configuration": {
    kinds: ["STATUS_CONFIGURATION"],
    description:
      "Define controlled workflow transitions and the permission required for each move.",
  },
  "alert-and-notification-rules": {
    kinds: ["ALERT_NOTIFICATION_RULE"],
    description:
      "Event-driven alert rules with explicit channels and recipient roles.",
  },
  "print-templates": {
    kinds: ["PRINT_TEMPLATE"],
    description: "Approved print templates and controlled-copy policy.",
  },
  "integration-settings": {
    kinds: ["INTEGRATION_SETTING"],
    description:
      "Reference integration endpoints and secret-manager keys without storing credentials.",
  },
  "validation-documents": {
    kinds: [
      "VALIDATION_DOCUMENT",
      "DATA_RETENTION_POLICY",
      "AUDIT_EVIDENCE_PACK",
    ],
    description:
      "Computer-system validation, retention policy and evidence register for URS through PQ/UAT and periodic review.",
  },
  "process-parameter-entry": {
    kinds: ["EXECUTION_EVIDENCE"],
    description:
      "Signed process parameter entries linked to a real production order.",
    defaults: { recordType: "PROCESS_PARAMETER" },
  },
  "in-process-checks": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Order-linked in-process control evidence.",
    defaults: { recordType: "IN_PROCESS_CHECK" },
  },
  "stage-wise-yield": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Stage input, output, loss and yield evidence.",
    defaults: { recordType: "STAGE_YIELD" },
  },
  "wip-transfer": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Controlled WIP transfer evidence.",
    defaults: { recordType: "WIP_TRANSFER" },
  },
  "bulk-product-transfer": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Controlled bulk product transfer evidence.",
    defaults: { recordType: "BULK_TRANSFER" },
  },
  "partial-production-completion": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Signed partial-completion evidence.",
    defaults: { recordType: "PARTIAL_COMPLETION" },
  },
  "downtime-entry": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Order-linked downtime and reason evidence.",
    defaults: { recordType: "DOWNTIME" },
  },
  "damage-and-scrap": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Controlled damage and scrap evidence.",
    defaults: { recordType: "DAMAGE_SCRAP" },
  },
  "operator-handover": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Signed shift/operator handover evidence.",
    defaults: { recordType: "OPERATOR_HANDOVER" },
  },
  "electronic-batch-manufacturing-record-ebmr": {
    kinds: ["EXECUTION_EVIDENCE"],
    description: "Order-linked electronic batch manufacturing record.",
    defaults: { recordType: "EBMR" },
  },
  "out-of-specification-oos": {
    kinds: ["QUALITY_CASE"],
    description: "OOS investigation, actions and closure register.",
    defaults: { caseType: "OOS" },
  },
  "out-of-trend-oot": {
    kinds: ["QUALITY_CASE"],
    description: "OOT investigation and trend-review register.",
    defaults: { caseType: "OOT" },
  },
  deviations: {
    kinds: ["QUALITY_CASE"],
    description: "Production and quality deviation register.",
    defaults: { caseType: "DEVIATION" },
  },
  capa: {
    kinds: ["QUALITY_CASE"],
    description: "Corrective and preventive action register.",
    defaults: { caseType: "CAPA" },
  },
  "change-control": {
    kinds: ["QUALITY_CASE"],
    description: "Controlled manufacturing change register.",
    defaults: { caseType: "CHANGE_CONTROL" },
  },
  "complaints-and-recalls": {
    kinds: ["QUALITY_CASE", "RECALL_DRILL"],
    description:
      "Complaint investigation, recall trace and mock-recall evidence.",
    defaults: { caseType: "COMPLAINT" },
  },
  "destruction-approval": {
    kinds: ["QUALITY_CASE"],
    description: "Rejected material/product destruction approval register.",
    defaults: { caseType: "DESTRUCTION" },
  },
  "certificate-of-analysis": {
    kinds: ["COMPLIANCE_RECORD"],
    description: "Controlled Certificate of Analysis evidence.",
    defaults: { recordType: "COA" },
  },
  "stability-studies": {
    kinds: ["COMPLIANCE_RECORD"],
    description: "Stability protocol, sample and review evidence.",
    defaults: { recordType: "STABILITY" },
  },
  "retention-samples": {
    kinds: ["COMPLIANCE_RECORD"],
    description: "Retention sample register and evidence.",
    defaults: { recordType: "RETENTION_SAMPLE" },
  },
  "qualification-and-validation": {
    kinds: ["COMPLIANCE_RECORD", "VALIDATION_DOCUMENT"],
    description:
      "Resource qualification and system/process validation evidence.",
    defaults: { recordType: "QUALIFICATION" },
  },
  "product-quality-review-pqr-apr": {
    kinds: ["COMPLIANCE_RECORD"],
    description: "Periodic product quality review evidence.",
    defaults: { recordType: "PQR_APR" },
  },
  "environmental-monitoring": {
    kinds: ["ENVIRONMENT_UTILITY_CHECK"],
    description:
      "Environmental monitoring results with criteria and disposition.",
    defaults: { monitoringType: "ENVIRONMENT" },
  },
  "water-and-utility-monitoring": {
    kinds: ["ENVIRONMENT_UTILITY_CHECK"],
    description:
      "Water and utility monitoring results with criteria and disposition.",
    defaults: { monitoringType: "WATER" },
  },
  "cleaning-and-line-clearance": {
    kinds: ["COMPLIANCE_RECORD"],
    description:
      "General-production cleaning and line-clearance evidence, independent from packaging-order line clearance.",
    defaults: { recordType: "CLEANING" },
  },
};

const auditViews = new Set(["audit-trail", "audit-trail-review"]);

export function isManufacturingGovernanceView(view: string) {
  return Boolean(viewConfigurations[view]) || auditViews.has(view);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function idempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `manufacturing-governance:${scope}:${suffix}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function initialValues(
  kind: ManufacturingGovernanceKind,
  defaults: Record<string, string | boolean> = {},
) {
  const result: Record<string, string | boolean> = {
    description: "",
    ...defaults,
  };
  for (const field of fieldsByKind[kind]) {
    if (result[field.key] === undefined)
      result[field.key] =
        field.defaultValue ?? (field.type === "boolean" ? false : "");
  }
  return result;
}

function splitRows(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("|").map((cell) => cell.trim()));
}

function buildDetails(
  kind: ManufacturingGovernanceKind,
  values: Record<string, string | boolean>,
) {
  const details: Record<string, unknown> = {
    description: String(values.description ?? "").trim(),
  };
  for (const field of fieldsByKind[kind]) {
    const value = values[field.key];
    if (field.type === "boolean") details[field.key] = Boolean(value);
    else if (field.type === "number") details[field.key] = Number(value);
    else if (field.type === "list")
      details[field.key] = String(value ?? "")
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    else if (field.type === "stages")
      details[field.key] = splitRows(String(value ?? "")).map(
        ([sequence, permissionKey, signatureMeaning]) => ({
          sequence: Number(sequence),
          permissionKey,
          signatureMeaning,
        }),
      );
    else if (field.type === "transitions")
      details[field.key] = splitRows(String(value ?? "")).map(
        ([from, to, permissionKey]) => ({ from, to, permissionKey }),
      );
    else if (field.type === "entries")
      details[field.key] = splitRows(String(value ?? "")).map(
        ([parameter, valueText, unit, outcome]) => ({
          parameter,
          value: valueText,
          unit,
          outcome,
        }),
      );
    else details[field.key] = String(value ?? "").trim();
  }
  return details;
}

function valuesFromRecord(record: ManufacturingGovernanceRecord) {
  const values: Record<string, string | boolean> = {
    description: String(record.payload.details.description ?? ""),
  };
  for (const field of fieldsByKind[record.kind]) {
    const value =
      record.kind === "QUALITY_CASE" && field.key === "productionOrderId"
        ? (record.payload.details.productionOrderId ??
          record.payload.details.orderId)
        : record.payload.details[field.key];
    if (field.type === "boolean") values[field.key] = Boolean(value);
    else if (field.type === "list" && Array.isArray(value))
      values[field.key] = value.join(", ");
    else if (field.type === "stages" && Array.isArray(value))
      values[field.key] = value
        .map((entry) => {
          const row = entry as Record<string, unknown>;
          return `${row.sequence ?? ""} | ${row.permissionKey ?? ""} | ${row.signatureMeaning ?? ""}`;
        })
        .join("\n");
    else if (field.type === "transitions" && Array.isArray(value))
      values[field.key] = value
        .map((entry) => {
          const row = entry as Record<string, unknown>;
          return `${row.from ?? ""} | ${row.to ?? ""} | ${row.permissionKey ?? ""}`;
        })
        .join("\n");
    else if (field.type === "entries" && Array.isArray(value))
      values[field.key] = value
        .map((entry) => {
          const row = entry as Record<string, unknown>;
          return `${row.parameter ?? ""} | ${row.value ?? ""} | ${row.unit ?? ""} | ${row.outcome ?? ""}`;
        })
        .join("\n");
    else values[field.key] = value == null ? "" : String(value);
  }
  return values;
}

function evidenceAttachmentsFromRecord(
  record: ManufacturingGovernanceRecord,
): EvidenceAttachment[] {
  const value = record.payload.details.attachments;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>;
    if (
      typeof row.fileName !== "string" ||
      typeof row.mimeType !== "string" ||
      typeof row.sizeBytes !== "number" ||
      typeof row.dataUrl !== "string"
    )
      return [];
    if (
      !/^data:(application\/pdf|image\/(png|jpeg|webp)|text\/(plain|csv)|application\/json|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet));base64,/.test(
        row.dataUrl,
      )
    )
      return [];
    return [
      {
        fileName: row.fileName,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        sha256: typeof row.sha256 === "string" ? row.sha256 : undefined,
        dataUrl: row.dataUrl,
      },
    ];
  });
}

function readEvidenceAttachment(file: File): Promise<EvidenceAttachment> {
  if (file.size <= 0 || file.size > 2 * 1024 * 1024)
    return Promise.reject(
      new Error(`${file.name} must be between 1 byte and 2 MB.`),
    );
  const extension = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "";
  const mimeType = evidenceMimeByExtension[extension];
  if (!mimeType)
    return Promise.reject(
      new Error(`${file.name} is not a supported evidence file.`),
    );
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`${file.name} could not be read.`));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve({
            fileName: file.name,
            mimeType,
            sizeBytes: file.size,
            dataUrl: `data:${mimeType};base64,${reader.result.slice(reader.result.indexOf(",") + 1)}`,
          })
        : reject(new Error(`${file.name} could not be read.`));
    reader.readAsDataURL(file);
  });
}

function formatEvidenceBytes(value: number) {
  return value >= 1024 * 1024
    ? `${(value / (1024 * 1024)).toFixed(2)} MB`
    : `${Math.max(1, Math.ceil(value / 1024))} KB`;
}

function labelForKind(kind: ManufacturingGovernanceKind) {
  return kind
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  return status === "APPROVED"
    ? "bg-emerald-50 text-emerald-700"
    : status === "DRAFT"
      ? "bg-blue-50 text-blue-700"
      : status === "CANCELLED"
        ? "bg-red-50 text-red-700"
        : "bg-slate-100 text-slate-600";
}

function AuditWorkspace({
  workspaceId,
  title,
}: {
  workspaceId: string;
  title: string;
}) {
  const [search, setSearch] = useState("");
  const audit = useQuery({
    queryKey: ["manufacturing-governance", workspaceId, "audit"],
    queryFn: () => listManufacturingGovernanceAudit({ workspaceId, take: 250 }),
    enabled: Boolean(workspaceId),
  });
  const rows = useMemo(
    () =>
      (audit.data?.events ?? []).filter(
        (row) =>
          !search.trim() ||
          `${row.action} ${row.entityType ?? ""} ${row.entityId ?? ""} ${row.actor?.name ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [audit.data, search],
  );
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#cfdeef] bg-white shadow-[0_6px_20px_rgba(30,64,175,0.05)]">
      <header className="flex items-center justify-between gap-3 border-b border-[#dce7f3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e9f3ff] text-[#2478df]">
            <History className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#203651]">{title}</h2>
            <p className="text-[11px] text-[#718096]">
              Immutable manufacturing actions, old/new values and linked
              electronic signatures.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CollapsibleSearch
            value={search}
            onChange={setSearch}
            size="sm"
            expandedWidth="w-[320px]"
            label="Search audit trail"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void audit.refetch()}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        {audit.isLoading ? (
          <div className="p-5 text-sm text-[#718096]">
            Loading live audit records...
          </div>
        ) : audit.error ? (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage(audit.error, "Audit trail could not be loaded.")}
          </div>
        ) : rows.length ? (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#f3f7fb] text-[10px] uppercase tracking-wide text-[#64748b]">
              <tr>
                <th className="px-3 py-2.5">Date / time</th>
                <th className="px-3 py-2.5">Action</th>
                <th className="px-3 py-2.5">Record</th>
                <th className="px-3 py-2.5">User</th>
                <th className="px-3 py-2.5">Change / evidence</th>
                <th className="px-3 py-2.5">Signature</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[#e3ebf3] align-top"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    {formatDateTime(row.occurredAt)}
                  </td>
                  <td className="px-3 py-3 font-semibold text-[#203651]">
                    {row.action.replaceAll("_", " ")}
                  </td>
                  <td className="px-3 py-3">
                    <div>{row.entityType?.replaceAll("_", " ") ?? "-"}</div>
                    <div className="max-w-48 truncate text-[10px] text-[#718096]">
                      {row.entityId ?? "-"}
                    </div>
                  </td>
                  <td className="px-3 py-3">{row.actor?.name ?? "System"}</td>
                  <td className="max-w-md px-3 py-3">
                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-[#64748b]">
                      {JSON.stringify(
                        row.newValues ?? row.oldValues ?? {},
                        null,
                        2,
                      )}
                    </pre>
                  </td>
                  <td className="px-3 py-3">
                    {row.signatureHash ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">
                        Linked
                      </span>
                    ) : (
                      <span className="text-[#94a3b8]">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid min-h-64 place-items-center text-sm text-[#718096]">
            No manufacturing audit event matches this view.
          </div>
        )}
      </div>
    </section>
  );
}

export function ManufacturingGovernanceWorkspace({
  workspaceId,
  view,
  title,
}: {
  workspaceId?: string;
  view: string;
  title: string;
}) {
  const resolvedWorkspaceId = workspaceId ?? "";
  if (auditViews.has(view))
    return <AuditWorkspace workspaceId={resolvedWorkspaceId} title={title} />;
  const config = viewConfigurations[view];
  if (!config) return null;
  return (
    <GovernanceRegister
      workspaceId={resolvedWorkspaceId}
      title={title}
      config={config}
      showReadiness={view === "validation-documents"}
      showManageUsers={view === "user-roles-and-permissions"}
    />
  );
}

function GovernanceRegister({
  workspaceId,
  title,
  config,
  showReadiness,
  showManageUsers,
}: {
  workspaceId: string;
  title: string;
  config: ViewConfiguration;
  showReadiness: boolean;
  showManageUsers: boolean;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<ManufacturingGovernanceKind>(
    config.kinds[0],
  );
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [revisionTarget, setRevisionTarget] =
    useState<ManufacturingGovernanceRecord | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [effectiveTo, setEffectiveTo] = useState("");
  const [reason, setReason] = useState("");
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    initialValues(kind, config.defaults),
  );
  const [actionTarget, setActionTarget] = useState<{
    record: ManufacturingGovernanceRecord;
    action: "APPROVE" | "RETIRE" | "CANCEL" | "PRINT";
  } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const [signatureMeaning, setSignatureMeaning] = useState("Approved");
  const [reauthenticationPassword, setReauthenticationPassword] = useState("");
  const [attachments, setAttachments] = useState<EvidenceAttachment[]>([]);

  const key = ["manufacturing-governance", workspaceId, "records", kind];
  const records = useQuery({
    queryKey: key,
    queryFn: () => listManufacturingGovernanceRecords({ workspaceId, kind }),
    enabled: Boolean(workspaceId),
  });
  const readiness = useQuery({
    queryKey: ["manufacturing-governance", workspaceId, "readiness"],
    queryFn: () => getManufacturingValidationReadiness(workspaceId),
    enabled: Boolean(workspaceId && showReadiness),
  });
  const qualityCaseOrders = useQuery({
    queryKey: ["manufacturing", "orders", workspaceId, "quality-case-link"],
    queryFn: () => listManufacturingOrders({ workspaceId }),
    enabled: Boolean(workspaceId && kind === "QUALITY_CASE"),
  });
  const qualityCaseItems = useLcInventoryItemsQuery(
    workspaceId || undefined,
    Boolean(workspaceId && kind === "QUALITY_CASE"),
  );
  const selectedQualityOrderId = String(values.productionOrderId ?? "").trim();
  const selectedQualityOrder = useQuery({
    queryKey: [
      "manufacturing",
      "orders",
      workspaceId,
      selectedQualityOrderId,
      "quality-case-materials",
    ],
    queryFn: () => getManufacturingOrder(selectedQualityOrderId),
    enabled: Boolean(
      workspaceId && kind === "QUALITY_CASE" && selectedQualityOrderId,
    ),
  });
  const workspaceMembers = useQuery({
    queryKey: ["manufacturing", "routing-assignees", workspaceId],
    queryFn: () => listManufacturingRoutingAssignees(workspaceId),
    enabled: Boolean(workspaceId && kind === "VALIDATION_DOCUMENT"),
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({
      queryKey: ["manufacturing-governance", workspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["manufacturing-blueprint", workspaceId],
    });
  };
  const resetForm = (nextKind = kind) => {
    setRevisionTarget(null);
    setCode("");
    setName("");
    setEffectiveFrom(todayIso());
    setEffectiveTo("");
    setReason("");
    setValues(initialValues(nextKind, config.defaults));
    setAttachments([]);
  };
  const create = useMutation({
    mutationFn: createManufacturingGovernanceRecord,
    onSuccess: () => {
      invalidate();
      resetForm();
      setFormOpen(false);
      toast.success("Controlled record saved as draft.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Record could not be saved.")),
  });
  const revise = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof reviseManufacturingGovernanceRecord>[1];
    }) => reviseManufacturingGovernanceRecord(id, input),
    onSuccess: () => {
      invalidate();
      resetForm();
      setFormOpen(false);
      toast.success("New controlled revision saved as draft.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Revision could not be saved.")),
  });
  const transition = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof transitionManufacturingGovernanceRecord>[1];
    }) => transitionManufacturingGovernanceRecord(id, input),
    onSuccess: () => {
      invalidate();
      setActionTarget(null);
      setActionReason("");
      setReauthenticationPassword("");
      toast.success("Controlled status updated.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Status could not be updated.")),
  });
  const controlledPrint = useMutation({
    mutationFn: recordManufacturingControlledPrint,
    onSuccess: (metadata) => {
      invalidate();
      setActionTarget(null);
      setActionReason("");
      setReauthenticationPassword("");
      toast.success(`${metadata.watermark} ${metadata.copyNumber} recorded.`);
      window.print();
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Controlled print could not be recorded."),
      ),
  });
  const filtered = useMemo(
    () =>
      (records.data ?? []).filter(
        (row) =>
          !search.trim() ||
          `${row.code} ${row.name} ${row.status}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [records.data, search],
  );

  const changeKind = (nextKind: ManufacturingGovernanceKind) => {
    setKind(nextKind);
    resetForm(nextKind);
    setFormOpen(false);
    setActionTarget(null);
  };
  const addEvidenceFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const files = Array.from(input.files ?? []);
    try {
      if (!files.length) return;
      if (attachments.length + files.length > 5)
        throw new Error(
          "A controlled record may contain at most 5 evidence files.",
        );
      const next = await Promise.all(files.map(readEvidenceAttachment));
      if (
        [...attachments, ...next].reduce(
          (total, file) => total + file.sizeBytes,
          0,
        ) >
        8 * 1024 * 1024
      ) {
        throw new Error("Evidence files exceed the combined 8 MB limit.");
      }
      if (
        next.some((file) =>
          attachments.some((current) => current.dataUrl === file.dataUrl),
        ) ||
        new Set(next.map((file) => file.dataUrl)).size !== next.length
      ) {
        throw new Error("The same evidence file cannot be attached twice.");
      }
      setAttachments((current) => [...current, ...next]);
    } catch (error) {
      toast.error(errorMessage(error, "Evidence files could not be attached."));
    } finally {
      input.value = "";
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || (!revisionTarget && !code.trim()))
      return toast.error("Code and name are required.");
    if (!String(values.description ?? "").trim())
      return toast.error("Description is required.");
    if (
      kind === "QUALITY_CASE" &&
      !String(values.productionOrderId ?? "").trim() &&
      !String(values.inventoryItemId ?? "").trim()
    ) {
      return toast.error(
        "Select an existing production order or inventory item for this quality case.",
      );
    }
    const details = buildDetails(kind, values);
    if (evidenceAttachmentKinds.has(kind)) details.attachments = attachments;
    if (kind === "AUDIT_EVIDENCE_PACK" && attachments.length === 0)
      return toast.error("Attach at least one retrievable evidence file.");
    if (revisionTarget) {
      if (!reason.trim()) return toast.error("Revision reason is required.");
      revise.mutate({
        id: revisionTarget.id,
        input: {
          workspaceId,
          name,
          effectiveFrom: effectiveFrom || null,
          effectiveTo: effectiveTo || null,
          details,
          reason,
          transactionDate: new Date().toISOString(),
          idempotencyKey: idempotencyKey("revise"),
        },
      });
    } else {
      create.mutate({
        workspaceId,
        kind,
        code,
        name,
        effectiveFrom: effectiveFrom || null,
        effectiveTo: effectiveTo || null,
        details,
        note: reason || null,
        transactionDate: new Date().toISOString(),
        idempotencyKey: idempotencyKey("create"),
      });
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#cfdeef] bg-white shadow-[0_6px_20px_rgba(30,64,175,0.05)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce7f3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e9f3ff] text-[#2478df]">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#203651]">{title}</h2>
            <p className="text-[11px] text-[#718096]">{config.description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showManageUsers ? (
            <Button asChild type="button" size="sm" variant="outline">
              <Link href="/app/utilities/sync-share">Manage Users &amp; Roles</Link>
            </Button>
          ) : null}
          {config.kinds.length > 1 ? (
            <select
              className={selectClass}
              value={kind}
              onChange={(event) =>
                changeKind(event.target.value as ManufacturingGovernanceKind)
              }
            >
              {config.kinds.map((entry) => (
                <option key={entry} value={entry}>
                  {labelForKind(entry)}
                </option>
              ))}
            </select>
          ) : null}
          <CollapsibleSearch
            value={search}
            onChange={setSearch}
            size="sm"
            expandedWidth="w-[260px]"
            label={`Search ${title}`}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => {
              resetForm();
              setFormOpen((open) => !open);
            }}
          >
            <FilePlus2 className="h-4 w-4" />
            New record
          </Button>
        </div>
      </header>
      {showReadiness && readiness.data ? (
        <div className="grid gap-2 border-b border-[#dce7f3] bg-[#f8fbff] p-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            className={`rounded-xl border p-3 ${readiness.data.ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#64748b]">
              Validation readiness
            </div>
            <div className="mt-1 text-lg font-semibold text-[#203651]">
              {readiness.data.readyCount}/{readiness.data.requiredCount}
            </div>
            <div className="text-[10px] text-[#64748b]">
              {readiness.data.ready
                ? "Required controls ready"
                : "Required controls still blocked"}
            </div>
          </div>
          {readiness.data.checks
            .filter((check) => check.required && check.state === "BLOCKED")
            .slice(0, 3)
            .map((check) => (
              <div
                key={check.key}
                className="rounded-xl border border-red-100 bg-white p-3"
              >
                <div className="text-xs font-semibold text-[#203651]">
                  {check.label}
                </div>
                <div className="mt-1 text-[10px] text-red-600">
                  Missing approved configuration
                </div>
              </div>
            ))}
        </div>
      ) : null}
      {formOpen ? (
        <form
          onSubmit={submit}
          className="grid gap-3 border-b border-[#dce7f3] bg-[#f9fbfe] p-4 md:grid-cols-2 xl:grid-cols-4"
        >
          <div className="md:col-span-2 xl:col-span-4 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-[#203651]">
                {revisionTarget
                  ? `New revision of ${revisionTarget.code} v${revisionTarget.versionNumber}`
                  : `New ${labelForKind(kind)}`}
              </div>
              <div className="text-[10px] text-[#718096]">
                Saved as draft; approval requires maker-checker and a linked
                signature.
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setFormOpen(false);
                resetForm();
              }}
              className="text-xs text-[#64748b]"
            >
              Close
            </button>
          </div>
          {revisionTarget ? null : (
            <label className="grid gap-1 text-xs text-[#52647d]">
              <span>Code *</span>
              <Input
                className={inputClass}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </label>
          )}
          <label className="grid gap-1 text-xs text-[#52647d]">
            <span>Name *</span>
            <Input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-[#52647d]">
            <span>Effective from</span>
            <AppDateInput
              aria-label="Effective from"
              inputClassName={inputClass}
              value={effectiveFrom}
              onChange={(value) => setEffectiveFrom(value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-[#52647d]">
            <span>Effective to</span>
            <AppDateInput
              aria-label="Effective to"
              inputClassName={inputClass}
              value={effectiveTo}
              onChange={(value) => setEffectiveTo(value)}
            />
          </label>
          <label className="grid gap-1 text-xs text-[#52647d] md:col-span-2 xl:col-span-4">
            <span>Description *</span>
            <textarea
              className={textareaClass}
              value={String(values.description ?? "")}
              onChange={(event) =>
                setValues({ ...values, description: event.target.value })
              }
            />
          </label>
          {fieldsByKind[kind]
            .filter(
              (field) =>
                (!field.trainingOnly ||
                  String(values.documentType ?? "") === "TRAINING_RECORD") &&
                (![
                  "orderMaterialId",
                  "approvedVarianceQuantity",
                  "approvedVarianceUnit",
                  "varianceReason",
                ].includes(field.key) ||
                  ["DEVIATION", "CHANGE_CONTROL"].includes(
                    String(values.caseType ?? ""),
                  )),
            )
            .map((field) => (
              <label
                key={field.key}
                className={`grid gap-1 text-xs text-[#52647d] ${["textarea", "stages", "transitions", "entries"].includes(field.type ?? "") ? "md:col-span-2" : ""}`}
              >
                <span>
                  {field.label}
                  {field.required === false ? "" : " *"}
                </span>
                {field.type === "boolean" ? (
                  <input
                    type="checkbox"
                    checked={Boolean(values[field.key])}
                    onChange={(event) =>
                      setValues({
                        ...values,
                        [field.key]: event.target.checked,
                      })
                    }
                    className="h-5 w-5 rounded border-[#cbd5e1]"
                  />
                ) : field.type === "order-select" ? (
                  <select
                    className={selectClass}
                    value={String(values[field.key] ?? "")}
                    disabled={qualityCaseOrders.isLoading}
                    onChange={(event) => {
                      const orderId = event.target.value;
                      const order = qualityCaseOrders.data?.find(
                        (entry) => entry.id === orderId,
                      );
                      setValues((current) => ({
                        ...current,
                        ...qualityCaseOrderLinkValues(order, orderId),
                      }));
                    }}
                  >
                    <option value="">
                      {qualityCaseOrders.isLoading
                        ? "Loading production orders..."
                        : qualityCaseOrders.isError
                          ? "Production orders could not be loaded"
                          : "Select a production order..."}
                    </option>
                    {(qualityCaseOrders.data ?? []).map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNumber} — {order.finishedProductName} (
                        {order.status.replaceAll("_", " ")})
                      </option>
                    ))}
                  </select>
                ) : field.type === "order-material-select" ? (
                  <select
                    className={selectClass}
                    value={String(values[field.key] ?? "")}
                    disabled={!selectedQualityOrderId || selectedQualityOrder.isLoading}
                    onChange={(event) => {
                      const material = selectedQualityOrder.data?.materials.find(
                        (entry) => entry.id === event.target.value,
                      );
                      setValues((current) => ({
                        ...current,
                        ...(material
                          ? qualityCaseMaterialLinkValues(material)
                          : {
                              orderMaterialId: "",
                              approvedVarianceUnit: "",
                            }),
                      }));
                    }}
                  >
                    <option value="">
                      {!selectedQualityOrderId
                        ? "Select a production order first..."
                        : selectedQualityOrder.isLoading
                          ? "Loading order materials..."
                          : selectedQualityOrder.isError
                            ? "Order materials could not be loaded"
                            : "Select an exact order material..."}
                    </option>
                    {(selectedQualityOrder.data?.materials ?? []).map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.itemCode} — {material.itemName} · {material.plannedQuantity} {material.unit}
                      </option>
                    ))}
                  </select>
                ) : field.type === "item-select" ? (
                  <select
                    className={selectClass}
                    value={String(values[field.key] ?? "")}
                    disabled={qualityCaseItems.isLoading}
                    onChange={(event) => {
                      const inventoryItemId = event.target.value;
                      const item = qualityCaseItems.data?.find(
                        (entry) => entry.id === inventoryItemId,
                      );
                      setValues((current) => ({
                        ...current,
                        [field.key]: inventoryItemId,
                        ...(item
                          ? {
                              sourceReference:
                                String(current.sourceReference ?? "").trim() ||
                                `${item.itemCode} — ${item.itemName}`,
                            }
                          : {}),
                      }));
                    }}
                  >
                    <option value="">
                      {qualityCaseItems.isLoading
                        ? "Loading inventory items..."
                        : qualityCaseItems.isError
                          ? "Inventory items could not be loaded"
                          : "Select an inventory item..."}
                    </option>
                    {(qualityCaseItems.data ?? []).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemCode} — {item.itemName}
                      </option>
                    ))}
                  </select>
                ) : field.type === "member-select" ? (
                  <select
                    className={selectClass}
                    value={String(values[field.key] ?? "")}
                    disabled={workspaceMembers.isLoading}
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                  >
                    <option value="">
                      {workspaceMembers.isLoading
                        ? "Loading workspace users..."
                        : workspaceMembers.isError
                          ? "Workspace users could not be loaded"
                          : "Select a workspace user..."}
                    </option>
                    {(workspaceMembers.data ?? []).map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.name} — {member.email}
                      </option>
                    ))}
                  </select>
                ) : field.type === "select" ? (
                  <select
                    className={selectClass}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                  >
                    <option value="">Select...</option>
                    {field.options?.map((option) => (
                      <option key={option} value={option}>
                        {option.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                ) : ["textarea", "stages", "transitions", "entries"].includes(
                    field.type ?? "",
                  ) ? (
                  <textarea
                    className={textareaClass}
                    placeholder={field.placeholder}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                  />
                ) : field.type === "date" ? (
                  <AppDateInput
                    value={String(values[field.key] ?? "")}
                    onChange={(value) =>
                      setValues({ ...values, [field.key]: value })
                    }
                    inputClassName={inputClass}
                    aria-label={field.label}
                  />
                ) : (
                  <Input
                    className={inputClass}
                    type={field.type === "number" ? "number" : "text"}
                    placeholder={field.placeholder}
                    value={String(values[field.key] ?? "")}
                    onChange={(event) =>
                      setValues({ ...values, [field.key]: event.target.value })
                    }
                  />
                )}
              </label>
            ))}
          {evidenceAttachmentKinds.has(kind) ? (
            <div className="rounded-xl border border-[#cfe0f3] bg-white p-3 md:col-span-2 xl:col-span-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#203651]">
                    <Paperclip className="h-4 w-4 text-[#2478df]" />
                    Evidence files {kind === "AUDIT_EVIDENCE_PACK" ? "*" : ""}
                  </div>
                  <div className="mt-1 text-[10px] text-[#718096]">
                    Up to 5 PDF, image, text, CSV, JSON, DOCX or XLSX files; 2
                    MB each and 8 MB combined. The server verifies each
                    checksum.
                  </div>
                </div>
                <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-[#bdd4ee] bg-[#f7fbff] px-3 text-xs font-semibold text-[#2563a8] hover:bg-[#edf6ff]">
                  <Paperclip className="h-3.5 w-3.5" />
                  Attach files
                  <input
                    className="sr-only"
                    type="file"
                    multiple
                    accept={evidenceAccept}
                    onChange={addEvidenceFiles}
                  />
                </label>
              </div>
              {attachments.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {attachments.map((file, index) => (
                    <div
                      key={`${file.fileName}:${file.sizeBytes}:${index}`}
                      className="flex min-w-0 items-center gap-2 rounded-lg border border-[#e0e9f3] bg-[#f9fbfd] px-2.5 py-2"
                    >
                      <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#4a82c2]" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[11px] font-medium text-[#243b55]">
                          {file.fileName}
                        </div>
                        <div className="text-[9px] text-[#718096]">
                          {formatEvidenceBytes(file.sizeBytes)}
                          {file.sha256
                            ? ` · ${file.sha256.slice(0, 10)}`
                            : " · checksum on save"}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="rounded-md p-1 text-[#b45353] hover:bg-red-50"
                        title={`Remove ${file.fileName}`}
                        onClick={() =>
                          setAttachments((current) =>
                            current.filter(
                              (_, currentIndex) => currentIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-[#d6e2ef] px-3 py-2 text-[10px] text-[#718096]">
                  No file attached yet.
                </div>
              )}
            </div>
          ) : null}
          <label className="grid gap-1 text-xs text-[#52647d] md:col-span-2 xl:col-span-3">
            <span>
              {revisionTarget ? "Revision reason *" : "Creation note"}
            </span>
            <Input
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div className="flex items-end justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || revise.isPending}
            >
              <ClipboardCheck className="h-4 w-4" />
              Save draft
            </Button>
          </div>
        </form>
      ) : null}
      {actionTarget ? (
        <form
          className="flex flex-wrap items-end gap-3 border-b border-[#dce7f3] bg-[#fffaf2] p-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!actionReason.trim() || !signatureMeaning.trim())
              return toast.error("Reason and signature meaning are required.");
            if (actionTarget.action === "PRINT")
              controlledPrint.mutate({
                workspaceId,
                recordId: actionTarget.record.id,
                copyNumber: `${actionTarget.record.code}-COPY-${Date.now()}`,
                copyType: "CONTROLLED",
                reason: actionReason,
                signatureMeaning,
                reauthenticationPassword: reauthenticationPassword || null,
                transactionDate: new Date().toISOString(),
                idempotencyKey: idempotencyKey("print"),
              });
            else
              transition.mutate({
                id: actionTarget.record.id,
                input: {
                  workspaceId,
                  action: actionTarget.action,
                  reason: actionReason,
                  signatureMeaning,
                  reauthenticationPassword: reauthenticationPassword || null,
                  transactionDate: new Date().toISOString(),
                  idempotencyKey: idempotencyKey(
                    actionTarget.action.toLowerCase(),
                  ),
                },
              });
          }}
        >
          <div className="min-w-56 flex-1">
            <div className="text-xs font-semibold text-[#203651]">
              {actionTarget.action} {actionTarget.record.code} v
              {actionTarget.record.versionNumber}
            </div>
            <div className="text-[10px] text-[#718096]">
              This action is immutable and will be written to the audit trail.
            </div>
          </div>
          <label className="grid min-w-64 gap-1 text-xs text-[#52647d]">
            <span>Reason *</span>
            <Input
              className={inputClass}
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
            />
          </label>
          <label className="grid min-w-44 gap-1 text-xs text-[#52647d]">
            <span>Signature meaning *</span>
            <select
              className={selectClass}
              value={signatureMeaning}
              onChange={(event) => setSignatureMeaning(event.target.value)}
            >
              {[
                "Reviewed",
                "Approved",
                "Verified",
                "Released",
                "Rejected",
                "Witnessed",
                "Corrected",
                "Cancelled",
              ].map((meaning) => (
                <option key={meaning}>{meaning}</option>
              ))}
            </select>
          </label>
          <label className="grid min-w-56 gap-1 text-xs text-[#52647d]">
            <span>Current password (if policy requires)</span>
            <Input
              type="password"
              autoComplete="current-password"
              className={inputClass}
              value={reauthenticationPassword}
              onChange={(event) =>
                setReauthenticationPassword(event.target.value)
              }
            />
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setActionTarget(null);
              setReauthenticationPassword("");
            }}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={transition.isPending || controlledPrint.isPending}
          >
            Confirm
          </Button>
        </form>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        {records.isLoading ? (
          <div className="flex items-center gap-2 p-5 text-sm text-[#718096]">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading live controlled records...
          </div>
        ) : records.error ? (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage(records.error, "Records could not be loaded.")}
          </div>
        ) : filtered.length ? (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[#f3f7fb] text-[10px] uppercase tracking-wide text-[#64748b]">
              <tr>
                <th className="px-3 py-2.5">Code / name</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Version</th>
                <th className="px-3 py-2.5">Effective</th>
                <th className="px-3 py-2.5">Evidence hash</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-[#e3ebf3]">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-[#203651]">
                      {row.name}
                    </div>
                    <div className="text-[10px] text-[#718096]">{row.code}</div>
                  </td>
                  <td className="px-3 py-3">{labelForKind(row.kind)}</td>
                  <td className="px-3 py-3">v{row.versionNumber}</td>
                  <td className="px-3 py-3">
                    {row.effectiveFrom
                      ? formatDate(row.effectiveFrom)
                      : "-"}
                    {row.effectiveTo
                      ? ` to ${formatDate(row.effectiveTo)}`
                      : ""}
                  </td>
                  <td className="px-3 py-3 text-[10px] text-[#64748b]">
                    <div className="font-mono">
                      {row.payload.evidenceHash?.slice(0, 12) ?? "-"}
                    </div>
                    {evidenceAttachmentsFromRecord(row).length ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {evidenceAttachmentsFromRecord(row).map((file) => (
                          <a
                            key={`${file.sha256 ?? file.fileName}:${file.fileName}`}
                            href={file.dataUrl}
                            download={file.fileName}
                            title={`Download ${file.fileName}`}
                            className="inline-flex items-center gap-1 rounded-md border border-[#d3e2f2] bg-[#f7fbff] px-1.5 py-1 font-sans text-[9px] text-[#2563a8] hover:bg-[#edf6ff]"
                          >
                            <Download className="h-3 w-3" />
                            <span className="max-w-24 truncate">
                              {file.fileName}
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-semibold ${statusClass(row.status)}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1">
                      {row.status === "DRAFT" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setActionTarget({
                                record: row,
                                action: "APPROVE",
                              })
                            }
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approve
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setActionTarget({ record: row, action: "CANCEL" })
                            }
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        </>
                      ) : null}
                      {row.status === "APPROVED" ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setKind(row.kind);
                              setRevisionTarget(row);
                              setCode(row.code);
                              setName(row.name);
                              setEffectiveFrom(
                                row.effectiveFrom?.slice(0, 10) ?? todayIso(),
                              );
                              setEffectiveTo(
                                row.effectiveTo?.slice(0, 10) ?? "",
                              );
                              setValues(valuesFromRecord(row));
                              setAttachments(
                                evidenceAttachmentsFromRecord(row),
                              );
                              setReason("");
                              setFormOpen(true);
                            }}
                          >
                            <FileClock className="h-3.5 w-3.5" />
                            Revise
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setActionTarget({ record: row, action: "PRINT" })
                            }
                          >
                            <Printer className="h-3.5 w-3.5" />
                            Print
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setActionTarget({ record: row, action: "RETIRE" })
                            }
                          >
                            <Archive className="h-3.5 w-3.5" />
                            Retire
                          </Button>
                        </>
                      ) : null}
                      {["RETIRED", "CANCELLED"].includes(row.status) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setKind(row.kind);
                            setRevisionTarget(row);
                            setCode(row.code);
                            setName(row.name);
                            setEffectiveFrom(todayIso());
                            setEffectiveTo("");
                            setValues(valuesFromRecord(row));
                            setAttachments(evidenceAttachmentsFromRecord(row));
                            setReason("");
                            setFormOpen(true);
                          }}
                        >
                          <FileClock className="h-3.5 w-3.5" />
                          New revision
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="grid min-h-64 place-items-center px-6 text-center">
            <div>
              <ShieldCheck className="mx-auto h-10 w-10 text-[#8dbbf2]" />
              <div className="mt-3 text-sm font-semibold text-[#203651]">
                No {labelForKind(kind).toLowerCase()} records yet
              </div>
              <div className="mt-1 text-xs text-[#718096]">
                Only real user-entered records will appear here; no demo data is
                generated.
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
