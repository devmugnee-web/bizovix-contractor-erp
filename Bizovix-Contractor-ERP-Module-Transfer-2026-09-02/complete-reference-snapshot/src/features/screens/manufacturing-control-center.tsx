"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeDollarSign,
  BookOpen,
  Boxes,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Factory,
  FlaskConical,
  Gauge,
  LineChart,
  PackageCheck,
  PlayCircle,
  Printer,
  ScanLine,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  Warehouse,
} from "lucide-react";

import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { buildWorkspaceRoute } from "@/config/routes";
import {
  ManufacturingBlueprintControlsWorkspace,
  isManufacturingBlueprintView,
} from "@/features/screens/manufacturing-blueprint-controls-workspace";
import { ManufacturingCostReportWorkspace } from "@/features/screens/manufacturing-cost-report-workspace";
import { ManufacturingDowntimeWorkspace } from "@/features/screens/manufacturing-downtime-workspace";
import {
  ManufacturingExecutionTransferWorkspace,
  isManufacturingExecutionTransferView,
} from "@/features/screens/manufacturing-execution-transfer-workspace";
import {
  ManufacturingGovernanceWorkspace,
  isManufacturingGovernanceView,
} from "@/features/screens/manufacturing-governance-workspace";
import {
  ManufacturingMaterialsWorkspace,
  isManufacturingMaterialsOperationalView,
} from "@/features/screens/manufacturing-materials-workspace";
import {
  ManufacturingSerialPackagingWorkspace,
  isManufacturingSerialPackagingView,
} from "@/features/screens/manufacturing-serial-packaging-workspace";
import { ManufacturingSupplySuggestionsWorkspace } from "@/features/screens/manufacturing-supply-suggestions-workspace";
import { ManufacturingNavigationConfigurationDialog } from "@/features/screens/manufacturing-navigation-configuration-dialog";
import {
  ManufacturingAvailabilityWorkspace,
  ManufacturingBomWorkspace,
  ManufacturingDashboardWorkspace,
  ManufacturingItemProfilesWorkspace,
  ManufacturingLocationsWorkspace,
  ManufacturingMrpWorkspace,
  ManufacturingOrdersWorkspace,
  ManufacturingPlanWorkspace,
  ManufacturingProductionScheduleWorkspace,
  ManufacturingRoutingWorkspace,
  ManufacturingSettingsWorkspace,
  ManufacturingWorkflowReviewAdjunct,
  ManufacturingWorkflowReviewWorkspace,
} from "@/features/screens/manufacturing-control-center-workspaces";
import { manufacturingAmendableOrderStatuses } from "@/features/screens/manufacturing-order-amendment";
import {
  useLcInventoryItemsQuery,
  useLcWarehousesQuery,
} from "@/hooks/use-lc-query";
import {
  useManufacturingSettingsQuery,
  useManufacturingOrdersQuery,
  useManufacturingReadinessQuery,
  useManufacturingWorkflowConfigurationQuery,
  useManufacturingWorkflowDefinitionQuery,
  useDiscardEmptyManufacturingWorkflowRunMutation,
  useManufacturingWorkflowElectronicSignatureQuery,
  useManufacturingWorkflowRunHistoryQuery,
  useManufacturingWorkflowRunsQuery,
  useCreateManufacturingWorkflowRunStepOccurrenceMutation,
  useStartManufacturingWorkflowRunMutation,
  useTransitionManufacturingWorkflowRunStepMutation,
  useUpdateManufacturingWorkflowConfigurationMutation,
} from "@/hooks/use-manufacturing-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatDateTime } from "@/lib/format";
import {
  isLegacyUnboundDraftManufacturingRun,
  isManufacturingRunVisiblyUntouched,
  manufacturingWorkflowStartOrderIneligibility,
  summarizeManufacturingWorkflowOrderIneligibility,
} from "@/features/screens/manufacturing-workflow-order-eligibility";
import {
  deriveVisibleManufacturingNavigation,
  resolveVisibleManufacturingNavigationTarget,
} from "@/features/screens/manufacturing-workflow-visibility";
import type {
  ManufacturingItemRole,
  ManufacturingOrderActionKind,
  ManufacturingOrderStatus,
  ManufacturingOrderType,
  ManufacturingRunStepTransitionRecord,
  ManufacturingRunStepTransitionAction,
  ManufacturingRunStepRecord,
  TransitionManufacturingRunStepInput,
  ManufacturingWorkflowStepDefinitionRecord,
  ManufacturingWorkflowGroup,
} from "@/types/manufacturing";
import type { ManufacturingSupplySuggestionType } from "@/types/manufacturing-supply";
import { toast } from "sonner";

const steps = (labels: string[]) =>
  labels.map((label) => ({
    id: label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
    label,
  }));

const manufacturingGroups = [
  {
    id: "dashboard",
    flowCode: "A",
    label: "A. Dashboard & Control Center",
    icon: Gauge,
    views: steps([
      "Manufacturing Dashboard",
      "Production Control Center",
      "Pending Approvals",
      "Material Shortage Alerts",
      "Quality & Compliance Alerts",
      "Equipment and Calibration Alerts",
      "Batch Release Queue",
    ]),
  },
  {
    id: "setup",
    flowCode: "B",
    label: "B. Setup, Workflow & Security",
    icon: Settings2,
    views: steps([
      "Manufacturing Settings",
      "Approval Workflow",
      "User Roles and Permissions",
      "Electronic Signature Settings",
      "Document Numbering",
      "Status Configuration",
      "Alert and Notification Rules",
      "Print Templates",
      "Integration Settings",
    ]),
  },
  {
    id: "masters",
    flowCode: "C",
    label: "C. Products, Formula & Resources",
    icon: BookOpen,
    views: steps([
      "Manufactured Products",
      "Raw Material Master",
      "Packaging Material Master",
      "Intermediate and Bulk Products",
      "Work Centers",
      "Rooms and Production Lines",
      "Equipment and Machines",
      "Tools, Dies and Moulds",
      "Manufacturing Calendar and Shifts",
      "Operations and Process Stages",
      "Production Routing",
      "BOM / Master Formula",
      "Formula Versions",
      "Quality Specifications",
      "Test Methods",
      "Packaging Configurations",
      "Label and Artwork Versions",
      "Batch and Serial Number Rules",
      "Reason Codes",
      "Cost Drivers and Overhead Rules",
    ]),
  },
  {
    id: "planning",
    flowCode: "D",
    label: "D. Planning, MRP & Scheduling",
    icon: CalendarDays,
    views: steps([
      "Demand Plan",
      "Master Production Schedule",
      "Campaign Planning",
      "Material Requirement Planning",
      "Material Availability",
      "Material Shortage",
      "Suggested Purchase Requisition",
      "Suggested Stock Transfer",
      "What-if Production Planning",
      "Production Plan",
      "Capacity Planning",
      "Production Schedule Calendar",
    ]),
  },
  {
    id: "orders",
    flowCode: "E",
    label: "E. Production Orders & Pre-Production Readiness",
    icon: ClipboardList,
    views: steps([
      "All Production Orders",
      "Assembly Production Orders",
      "Pharmaceutical Batch Orders",
      "Subcontract Production Orders",
      "Production Order Approvals",
      "Production Order Amendments",
      "Qualification and Validation",
      "Environmental Monitoring",
      "Water and Utility Monitoring",
      "Cleaning and Line Clearance",
    ]),
  },
  {
    id: "materials",
    flowCode: "F",
    label: "F. Raw Material Quality & Material Preparation",
    icon: Boxes,
    views: steps([
      "Incoming Material Sampling",
      "QC Sample Management",
      "Test Result Entry",
      "Material Release or Rejection",
      "Material Requisition",
      "Batch/Lot Allocation",
      "FEFO Allocation",
      "Material Reservation",
      "Material Staging",
      "Weighing and Dispensing",
      "Dispensing Verification",
      "Material Issue",
      "Material Consumption",
      "Additional Material Issue",
      "Material Substitution",
      "Unused Material Return",
      "Material Reconciliation",
      "Stock Status Transfer",
      "Rejected Material and Destruction",
      "Destruction Approval",
    ]),
  },
  {
    id: "execution",
    flowCode: "G",
    label: "G. Production Execution & In-Process Control",
    icon: Factory,
    views: steps([
      "Active Production",
      "Electronic Batch Manufacturing Record — eBMR",
      "Operation Execution",
      "Process Parameter Entry",
      "In-process Checks",
      "In-process Quality Control",
      "Stage-wise Yield",
      "WIP Transfer",
      "Partial Production Completion",
      "Bulk Product Testing",
      "Bulk Product Transfer",
      "Downtime Entry",
      "Damage and Scrap",
      "Rework Orders",
      "Reprocessing Orders",
      "Rework and Reprocessing",
      "Operator Handover",
      "Production Completion",
    ]),
  },
  {
    id: "quality",
    flowCode: "H",
    label: "H. Finished Product Quality & Compliance",
    icon: FlaskConical,
    views: steps([
      "Serialisation — Preallocation",
      "Finished Product Testing",
      "Out of Specification — OOS",
      "Out of Trend — OOT",
      "Deviations",
      "CAPA",
      "Change Control",
      "Stability Studies",
      "Retention Samples",
      "Product Quality Review — PQR/APR",
      "Complaints and Recalls",
    ]),
  },
  {
    id: "packaging",
    flowCode: "I",
    label: "I. Packaging, Finished Goods & QA Release",
    icon: PackageCheck,
    views: steps([
      "Packaging Plan",
      "Packaging Orders — Order Register",
      "Packaging Order",
      "Batch Packaging Record — eBPR",
      "Packaging Line Clearance",
      "Packaging Material Issue",
      "Coding and Printing",
      "Label Control",
      "Packaging Execution",
      "Parent-child Aggregation",
      "Carton and Shipper Packing",
      "Palletisation",
      "Packaging Reconciliation",
      "Finished Goods Receipt",
      "Finished Goods Quarantine",
      "QA Batch Review",
      "Final Batch Release",
      "Certificate of Analysis",
      "QA Release",
      "Released Finished Goods",
    ]),
  },
  {
    id: "costing",
    flowCode: "J",
    label: "J. Costing & Accounts",
    icon: BadgeDollarSign,
    views: steps([
      "Estimated Production Cost",
      "Standard Cost",
      "Material Consumption Cost",
      "Labour Cost",
      "Machine Cost",
      "Factory Overhead",
      "Packaging Cost",
      "Subcontract Cost",
      "WIP Valuation",
      "Yield Loss Cost",
      "Scrap and Rejection Cost",
      "Actual Batch Cost",
      "Production Variance",
      "Cost of Goods Manufactured",
      "Accounting Journal Preview",
      "Posted Manufacturing Journals",
    ]),
  },
  {
    id: "reports",
    flowCode: "K",
    label: "K. Reports, Audit, Close & Archive",
    icon: LineChart,
    views: steps([
      "Production Reports",
      "Material Reports",
      "WIP Reports",
      "Batch and Lot Reports",
      "Costing Reports",
      "Quality Reports",
      "Compliance Reports",
      "Packaging Reports",
      "Traceability Reports",
      "Executive Analytics",
      "Audit Trail",
      "Validation Documents",
      "Audit Trail Review",
      "Cancelled and Closed Orders",
      "Period Lock",
      "Data Retention and Archive",
    ]),
  },
] as const;

// Existing bookmarks keep resolving even though their steps now appear in the A-K flow.
const legacyManufacturingRouteAliases: Record<string, string> = {
  "orders/packaging-orders": "packaging/packaging-orders-order-register",
  "orders/rework-orders": "execution/rework-orders",
  "orders/reprocessing-orders": "execution/reprocessing-orders",
  "orders/cancelled-and-closed-orders": "reports/cancelled-and-closed-orders",
  "quality/incoming-material-sampling": "materials/incoming-material-sampling",
  "quality/qc-sample-management": "materials/qc-sample-management",
  "quality/test-result-entry": "materials/test-result-entry",
  "quality/material-release-or-rejection":
    "materials/material-release-or-rejection",
  "quality/in-process-quality-control": "execution/in-process-quality-control",
  "quality/bulk-product-testing": "execution/bulk-product-testing",
  "quality/qa-batch-review": "packaging/qa-batch-review",
  "quality/final-batch-release": "packaging/final-batch-release",
  "quality/certificate-of-analysis": "packaging/certificate-of-analysis",
  "quality/qualification-and-validation": "orders/qualification-and-validation",
  "quality/environmental-monitoring": "orders/environmental-monitoring",
  "quality/water-and-utility-monitoring": "orders/water-and-utility-monitoring",
  "quality/cleaning-and-line-clearance": "orders/cleaning-and-line-clearance",
  "quality/destruction-approval": "materials/destruction-approval",
  "execution/batch-packaging-record-ebpr":
    "packaging/batch-packaging-record-ebpr",
  "packaging/serialisation": "quality/serialisation-preallocation",
  "setup/audit-trail": "reports/audit-trail",
  "setup/audit-trail-review": "reports/audit-trail-review",
  "setup/period-lock": "reports/period-lock",
  "setup/data-retention-and-archive": "reports/data-retention-and-archive",
  "setup/validation-documents": "reports/validation-documents",
};

export type ManufacturingSection = (typeof manufacturingGroups)[number]["id"];

export type ManufacturingSpecializedWorkspaceOwner =
  "MATERIALS" | "COST_REPORT" | "GOVERNANCE" | "BLUEPRINT" | null;

export function manufacturingSpecializedWorkspaceOwner(
  section: string,
  view: string,
): ManufacturingSpecializedWorkspaceOwner {
  // Cross-group governance/control views must win before broad section owners.
  if (isManufacturingGovernanceView(view)) return "GOVERNANCE";
  if (isManufacturingBlueprintView(view)) return "BLUEPRINT";
  if (isManufacturingMaterialsOperationalView(section, view))
    return "MATERIALS";
  if (
    (section === "masters" && view === "cost-drivers-and-overhead-rules") ||
    section === "costing" ||
    section === "reports"
  )
    return "COST_REPORT";
  return null;
}

export function resolveManufacturingRunStepRoute(
  rawRoute: string,
): { section: ManufacturingSection; view: string } | null {
  let route: URL | null;
  try {
    route = rawRoute.includes("?")
      ? new URL(rawRoute, "http://manufacturing.local")
      : null;
  } catch {
    return null;
  }

  const routeParts = rawRoute.replace(/^\/+/, "").split("?", 1)[0].split("/");
  let section = route?.searchParams.get("section") ?? routeParts[0];
  let view = route?.searchParams.get("view") ?? routeParts[1];

  if (section === "bom") {
    section = "masters";
    view = "bom-master-formula";
  } else if (section === "configuration") {
    section = "setup";
    view = "manufacturing-settings";
  }

  const aliasedRoute =
    section && view
      ? legacyManufacturingRouteAliases[`${section}/${view}`]
      : undefined;
  if (aliasedRoute) [section, view] = aliasedRoute.split("/");

  const group = manufacturingGroups.find(
    (candidate) => candidate.id === section,
  );
  if (
    !group ||
    !view ||
    !group.views.some((candidate) => candidate.id === view)
  )
    return null;
  return { section: group.id, view };
}

export function selectManufacturingRunStepForView({
  steps,
  section,
  view,
  requestedOccurrenceKey,
  catalogFlowSerial,
}: {
  steps: readonly ManufacturingRunStepRecord[];
  section: ManufacturingSection;
  view: string;
  requestedOccurrenceKey?: string;
  catalogFlowSerial: number;
}): ManufacturingRunStepRecord | null {
  const matchesRoute = (step: ManufacturingRunStepRecord) => {
    const target = resolveManufacturingRunStepRoute(step.route);
    return target?.section === section && target.view === view;
  };

  // An explicit occurrence is an exact selector. Falling back to PRIMARY here
  // could make a stale/bookmarked URL mutate a different occurrence.
  if (requestedOccurrenceKey) {
    return (
      steps.find(
        (step) =>
          matchesRoute(step) && step.occurrenceKey === requestedOccurrenceKey,
      ) ?? null
    );
  }

  return (
    steps.find(
      (step) => matchesRoute(step) && step.occurrenceKey === "PRIMARY",
    ) ??
    steps.find(
      (step) =>
        step.flowSerial === catalogFlowSerial &&
        step.occurrenceKey === "PRIMARY",
    ) ??
    null
  );
}

export function previousManufacturingOperationalStep(
  history: ManufacturingRunStepTransitionRecord[],
  activeFlowSerial: number,
  activeOccurrenceKey = "PRIMARY",
): ManufacturingRunStepTransitionRecord | null {
  return (
    [...history]
      .filter(
        (entry) =>
          entry.flowSerial !== activeFlowSerial ||
          entry.occurrenceKey !== activeOccurrenceKey,
      )
      .sort(
        (left, right) =>
          right.createdAt.localeCompare(left.createdAt) ||
          right.id.localeCompare(left.id),
      )[0] ?? null
  );
}
type OrderPreset = {
  orderType?: ManufacturingOrderType;
  orderTypes?: ManufacturingOrderType[];
  status?: ManufacturingOrderStatus;
  statuses?: ManufacturingOrderStatus[];
  terminalOnly?: boolean;
  preferredAction?: ManufacturingOrderActionKind;
};

const workflowGroupBySection: Record<
  ManufacturingSection,
  ManufacturingWorkflowGroup
> = {
  dashboard: "DASHBOARD_CONTROL_CENTER",
  masters: "MASTERS_FORMULA",
  planning: "PLANNING_MRP",
  orders: "PRODUCTION_BATCH_ORDERS",
  materials: "MATERIALS_DISPENSING",
  execution: "PRODUCTION_EXECUTION",
  quality: "QUALITY_COMPLIANCE",
  packaging: "PACKAGING_RELEASE",
  costing: "COSTING_ACCOUNTS",
  reports: "REPORTS_ANALYTICS",
  setup: "SETUP_WORKFLOW_AUDIT",
};

const sectionByWorkflowGroup = Object.fromEntries(
  Object.entries(workflowGroupBySection).map(([section, group]) => [
    group,
    section,
  ]),
) as Record<ManufacturingWorkflowGroup, ManufacturingSection>;

const availabilityViews: Record<
  string,
  { role?: ManufacturingItemRole; shortageOnly?: boolean }
> = {
  "dashboard/material-shortage-alerts": { shortageOnly: true },
  "planning/material-availability": {},
  "planning/material-shortage": { shortageOnly: true },
};

const itemProfileViews: Record<string, ManufacturingItemRole> = {
  "masters/manufactured-products": "FINISHED_GOOD",
  "masters/raw-material-master": "RAW_MATERIAL",
  "masters/packaging-material-master": "PACKAGING_MATERIAL",
};

const orderPresets: Record<string, OrderPreset> = {
  "dashboard/pending-approvals": { status: "SUBMITTED" },
  "dashboard/quality-compliance-alerts": { statuses: ["QC_HOLD"] },
  "dashboard/batch-release-queue": { statuses: ["QC_HOLD", "COMPLETED"] },
  "orders/all-production-orders": {},
  "orders/assembly-production-orders": { orderType: "ASSEMBLY" },
  "orders/pharmaceutical-batch-orders": { orderType: "PHARMACEUTICAL" },
  "packaging/packaging-orders-order-register": { orderType: "PACKAGING" },
  "execution/rework-orders": { orderType: "REWORK" },
  "execution/reprocessing-orders": { orderType: "REPROCESSING" },
  "orders/subcontract-production-orders": { orderType: "SUBCONTRACT" },
  "orders/production-order-approvals": { status: "SUBMITTED" },
  "orders/production-order-amendments": {
    statuses: [...manufacturingAmendableOrderStatuses],
    preferredAction: "AMEND",
  },
  "reports/cancelled-and-closed-orders": { terminalOnly: true },
  "execution/active-production": { statuses: ["ISSUED", "IN_PRODUCTION"] },
  "execution/operation-execution": {
    statuses: ["IN_PRODUCTION"],
    preferredAction: "START_OPERATION",
  },
  "execution/process-parameter-entry": {
    statuses: ["IN_PRODUCTION", "QC_HOLD"],
    preferredAction: "RECORD_IN_PROCESS_RESULT",
  },
  "execution/in-process-checks": {
    statuses: ["IN_PRODUCTION", "QC_HOLD"],
    preferredAction: "RECORD_IN_PROCESS_RESULT",
  },
  "execution/stage-wise-yield": {
    statuses: ["IN_PRODUCTION"],
    preferredAction: "COMPLETE_OPERATION",
  },
  "execution/partial-production-completion": {
    statuses: ["IN_PRODUCTION"],
    preferredAction: "COMPLETE_PRODUCTION",
  },
  "execution/damage-and-scrap": {
    statuses: ["IN_PRODUCTION"],
    preferredAction: "POST_SCRAP_DISPOSITION",
  },
  "execution/rework-and-reprocessing": {
    statuses: ["IN_PRODUCTION"],
    preferredAction: "CREATE_REWORK_DISPOSITION",
  },
  "execution/production-completion": {
    statuses: ["IN_PRODUCTION"],
    preferredAction: "COMPLETE_PRODUCTION",
  },
  "execution/in-process-quality-control": {
    statuses: ["IN_PRODUCTION", "QC_HOLD"],
    preferredAction: "RECORD_IN_PROCESS_RESULT",
  },
  "execution/bulk-product-testing": {
    statuses: ["QC_HOLD", "COMPLETED"],
    preferredAction: "RECORD_QUALITY_RESULT",
  },
  "packaging/qa-batch-review": { statuses: ["QC_HOLD", "COMPLETED"] },
  "packaging/final-batch-release": {
    statuses: ["QC_HOLD", "COMPLETED"],
    preferredAction: "QA_RELEASE",
  },
  "packaging/packaging-material-issue": {
    statuses: ["RESERVED", "ISSUED", "IN_PRODUCTION"],
    preferredAction: "PACKAGING_ISSUE",
  },
  "packaging/finished-goods-receipt": {
    statuses: ["QC_HOLD", "COMPLETED"],
    preferredAction: "POST_PRODUCTION_RECEIPT",
  },
  "packaging/finished-goods-quarantine": { statuses: ["QC_HOLD", "COMPLETED"] },
  "packaging/qa-release": {
    statuses: ["QC_HOLD", "COMPLETED"],
    preferredAction: "QA_RELEASE",
  },
  "packaging/released-finished-goods": { statuses: ["QA_RELEASED", "CLOSED"] },
};

const totalControlledSteps = manufacturingGroups.reduce(
  (total, group) => total + group.views.length,
  0,
);
const manufacturingFlowSteps = manufacturingGroups.flatMap((group) =>
  group.views.map((view) => ({
    ...view,
    section: group.id,
    flowCode: group.flowCode,
  })),
);

function manufacturingFlowSerial(section: string, view: string) {
  const index = manufacturingFlowSteps.findIndex(
    (step) => step.section === section && step.id === view,
  );
  return index >= 0 ? index + 1 : null;
}

const manufacturingConfigurationGroups = manufacturingGroups.map((group) => ({
  id: group.id,
  code: `Group ${group.flowCode}`,
  label: group.label,
  steps: group.views.map((view) => ({
    id: view.id,
    label: view.label,
    flowSerial: manufacturingFlowSerial(group.id, view.id)!,
  })),
}));

const workflowStepActionLabels: Record<
  Extract<
    ManufacturingRunStepTransitionAction,
    | "TRIGGER"
    | "START"
    | "SAVE_DRAFT"
    | "SUBMIT"
    | "APPROVE"
    | "BEGIN_POSTING"
    | "CONFIRM_POSTED"
    | "COMPLETE"
    | "MARK_N_A"
    | "HOLD"
    | "RESUME"
  >,
  string
> = {
  TRIGGER: "Activate branch",
  START: "Start",
  SAVE_DRAFT: "Save Draft",
  SUBMIT: "Submit",
  APPROVE: "Approve",
  BEGIN_POSTING: "Begin Post",
  CONFIRM_POSTED: "Confirm Posted",
  COMPLETE: "Complete",
  MARK_N_A: "Mark N/A",
  HOLD: "Hold",
  RESUME: "Resume",
};

export type ManufacturingWorkflowStepUiAction =
  keyof typeof workflowStepActionLabels;

type PendingSignedWorkflowTransition = {
  runId: string;
  stepId: string;
  stepLabel: string;
  input: TransitionManufacturingRunStepInput;
};

function workflowMetadataString(
  metadata:
    | Pick<ManufacturingWorkflowStepDefinitionRecord, "completionRule">
    | Pick<ManufacturingRunStepRecord, "completionRule">
    | null,
  key: string,
) {
  const value = metadata?.completionRule[key];
  return typeof value === "string" ? value : null;
}

export function manufacturingWorkflowStepUiActions({
  step,
  definition,
  hasPermission,
}: {
  step: ManufacturingRunStepRecord;
  definition: ManufacturingWorkflowStepDefinitionRecord | null;
  hasPermission: boolean;
}): ManufacturingWorkflowStepUiAction[] {
  if (!hasPermission) return [];

  // Dashboards, monitors and reports are evidence surfaces, not business
  // transactions. Offering Complete / Mark N/A / Hold here made a user-facing
  // screen look like a manually postable workflow record. Their underlying
  // domain records remain available through the operational workspaces.
  if (["MONITORING", "REPORT"].includes(step.stepType)) return [];

  const canActivateBranch = Boolean(
    step.status === "N_A" &&
    !step.approvedBy &&
    ["CONDITIONAL", "PERIODIC"].includes(
      step.applicabilityType || definition?.applicabilityType || "REQUIRED",
    ),
  );
  if (!step.applicable) return canActivateBranch ? ["TRIGGER"] : [];

  // Run metadata belongs to the definition version that created the run and
  // must not be replaced by a later active catalog version.
  const completionKind = workflowMetadataString(step, "kind");
  const requiredStatus = workflowMetadataString(step, "requiredStatus");
  const postingStep = step.postingEffect !== "NONE";
  const canMarkNotApplicable = !postingStep;
  const hasAdvisoryGap =
    step.missingPrerequisites.length > 0 || Boolean(step.blockerReason);
  let actions: ManufacturingWorkflowStepUiAction[];

  switch (step.status) {
    case "BLOCKED":
    case "ON_HOLD":
    case "REJECTED":
    case "FAILED":
      actions = ["RESUME"];
      break;
    case "READY":
      if (completionKind === "APPROVAL" || requiredStatus === "APPROVED") {
        actions = ["SAVE_DRAFT", "SUBMIT"];
      } else if (completionKind === "OBSERVED") {
        actions = ["COMPLETE"];
      } else {
        actions = ["START", "SAVE_DRAFT"];
        if (completionKind === "DOMAIN_COMPLETION") {
          actions.push("COMPLETE");
        }
      }
      if (canMarkNotApplicable) actions.push("MARK_N_A");
      actions.push("HOLD");
      break;
    case "IN_PROGRESS":
      if (completionKind === "APPROVAL" || requiredStatus === "APPROVED") {
        actions = ["SAVE_DRAFT", "SUBMIT"];
      } else if (postingStep) {
        actions = ["SAVE_DRAFT", "BEGIN_POSTING"];
      } else {
        actions = ["SAVE_DRAFT", "COMPLETE"];
      }
      if (canMarkNotApplicable) actions.push("MARK_N_A");
      actions.push("HOLD");
      break;
    case "PENDING_APPROVAL":
      actions = ["APPROVE"];
      break;
    case "APPROVED":
      if (requiredStatus === "APPROVED") return [];
      if (postingStep) {
        actions = ["BEGIN_POSTING", "HOLD"];
      } else {
        actions = ["COMPLETE", "HOLD"];
      }
      break;
    case "POSTING":
      actions = ["CONFIRM_POSTED"];
      break;
    case "POSTED":
      actions = ["COMPLETE"];
      break;
    default:
      return [];
  }

  if (!hasAdvisoryGap) return actions;
  return actions.filter(
    (action) =>
      !["APPROVE", "BEGIN_POSTING", "CONFIRM_POSTED", "COMPLETE"].includes(
        action,
      ),
  );
}

function workflowStepIdempotencyKey(
  runId: string,
  stepId: string,
  action: ManufacturingWorkflowStepUiAction,
) {
  const nonce =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `manufacturing-step:${runId}:${stepId}:${action}:${nonce}`;
}

function workflowActionError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message
    : "The workflow step could not be updated.";
}

export function manufacturingWorkflowNavigationStatusLabel(status: string) {
  return ["LOCKED", "BLOCKED"].includes(status)
    ? "NEEDS ATTENTION"
    : status.replaceAll("_", " ");
}

export function manufacturingWorkflowGroupStatusLabel(status: string) {
  if (status === "READY") return "NOT STARTED";
  if (["LOCKED", "BLOCKED"].includes(status)) return "NEEDS SETUP";
  return status.replaceAll("_", " ");
}

export function ManufacturingControlCenter() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { mode, session } = useSessionContext();
  const [moduleSearch, setModuleSearch] = useState("");
  const [moduleSearchOpen, setModuleSearchOpen] = useState(false);
  const [moduleSearchResetKey, setModuleSearchResetKey] = useState(0);
  const [workflowConfigurationOpen, setWorkflowConfigurationOpen] =
    useState(false);
  const [selectedStartOrderId, setSelectedStartOrderId] = useState("");
  const [pendingLegacyRunDiscard, setPendingLegacyRunDiscard] = useState<{
    runId: string;
    version: number;
  } | null>(null);
  const [legacyRunDiscardReason, setLegacyRunDiscardReason] = useState("");
  const [pendingSignedTransition, setPendingSignedTransition] =
    useState<PendingSignedWorkflowTransition | null>(null);
  const [workflowSignatureMeaning, setWorkflowSignatureMeaning] = useState("");
  const [
    workflowReauthenticationPassword,
    setWorkflowReauthenticationPassword,
  ] = useState("");
  const workflowDefinitionQuery = useManufacturingWorkflowDefinitionQuery(
    Boolean(session?.workspaceId),
  );
  const workflowConfigurationQuery = useManufacturingWorkflowConfigurationQuery(
    session?.workspaceId,
    Boolean(session?.workspaceId),
  );
  const workflowRunsQuery = useManufacturingWorkflowRunsQuery(
    session?.workspaceId,
    Boolean(session?.workspaceId),
  );
  const readinessQuery = useManufacturingReadinessQuery(
    session?.workspaceId,
    Boolean(session?.workspaceId),
  );
  const startOrdersQuery = useManufacturingOrdersQuery(
    session?.workspaceId ? { workspaceId: session.workspaceId } : null,
    Boolean(session?.workspaceId),
  );
  const startWorkflowRun = useStartManufacturingWorkflowRunMutation();
  const discardEmptyWorkflowRun =
    useDiscardEmptyManufacturingWorkflowRunMutation();
  const transitionWorkflowStep =
    useTransitionManufacturingWorkflowRunStepMutation();
  const createWorkflowStepOccurrence =
    useCreateManufacturingWorkflowRunStepOccurrenceMutation();
  const updateWorkflowConfiguration =
    useUpdateManufacturingWorkflowConfigurationMutation();
  const requestedRunId = searchParams.get("run") ?? undefined;
  const requestedOccurrenceKey =
    searchParams.get("occurrence")?.trim() || undefined;
  const requestedRun = requestedRunId
    ? workflowRunsQuery.data?.find((run) => run.id === requestedRunId)
    : undefined;
  const requestedRunMissing = Boolean(
    requestedRunId && workflowRunsQuery.data && !requestedRun,
  );
  const operationalRuns = (workflowRunsQuery.data ?? []).filter(
    (run) =>
      run.nextAction.state !== "COMPLETE" &&
      Boolean(run.productionOrderId || run.productId),
  );
  const legacyUnboundDraftRuns = (workflowRunsQuery.data ?? []).filter(
    isLegacyUnboundDraftManufacturingRun,
  );
  const selectableRuns = [...operationalRuns, ...legacyUnboundDraftRuns];
  const activeRun = requestedRunId
    ? (requestedRun ?? null)
    : (operationalRuns[0] ?? null);
  const workflowRunHistoryQuery = useManufacturingWorkflowRunHistoryQuery(
    session?.workspaceId,
    activeRun?.id,
    Boolean(session?.workspaceId && activeRun?.id),
  );
  const manufacturingSettingsQuery = useManufacturingSettingsQuery(
    session?.workspaceId,
    Boolean(session?.workspaceId),
  );
  const workflowElectronicSignatureQuery =
    useManufacturingWorkflowElectronicSignatureQuery(
      session?.workspaceId,
      Boolean(session?.workspaceId && activeRun?.id),
    );
  const requestedSection = searchParams.get("section");
  const compatibilitySection =
    requestedSection === "bom"
      ? "masters"
      : requestedSection === "configuration"
        ? "setup"
        : requestedSection;
  const requestedView = searchParams.get("view");
  const compatibilityView =
    requestedSection === "bom"
      ? "bom-master-formula"
      : requestedSection === "configuration"
        ? "manufacturing-settings"
        : requestedView;
  const aliasedRoute =
    compatibilitySection && compatibilityView
      ? legacyManufacturingRouteAliases[
          `${compatibilitySection}/${compatibilityView}`
        ]
      : undefined;
  const [legacySection, legacyView] = aliasedRoute
    ? aliasedRoute.split("/")
    : [compatibilitySection, compatibilityView];
  const requestedCatalogSection: ManufacturingSection =
    manufacturingGroups.some((section) => section.id === legacySection)
      ? (legacySection as ManufacturingSection)
      : "dashboard";
  const requestedCatalogGroup = manufacturingGroups.find(
    (group) => group.id === requestedCatalogSection,
  )!;
  const requestedCatalogView = requestedCatalogGroup.views.some(
    (view) => view.id === legacyView,
  )
    ? legacyView!
    : requestedCatalogGroup.views[0].id;
  const requestedCatalogSerial = manufacturingFlowSerial(
    requestedCatalogSection,
    requestedCatalogView,
  );
  const configuredHiddenStepSerials = new Set(
    workflowConfigurationQuery.data?.hiddenStepSerials ?? [],
  );
  const requestedSafetyReveal = searchParams.get("reveal") === "required";
  const isConfiguredManufacturingViewVisible = (
    section: ManufacturingSection,
    view: string,
  ) => {
    const serial = manufacturingFlowSerial(section, view);
    return serial !== null && !configuredHiddenStepSerials.has(serial);
  };
  const forcedVisibleStepSerials = new Set<number>();
  const forceVisible = (serial: number | null | undefined) => {
    if (serial && Number.isSafeInteger(serial))
      forcedVisibleStepSerials.add(serial);
  };
  if (requestedSafetyReveal) forceVisible(requestedCatalogSerial);
  if (requestedRunId && workflowRunsQuery.isLoading)
    forceVisible(requestedCatalogSerial);
  if (activeRun) {
    forceVisible(activeRun.currentStepSerial);
    forceVisible(activeRun.nextAction.step?.flowSerial);
    activeRun.nextAction.step?.missingPrerequisites.forEach((dependency) =>
      forceVisible(dependency.flowSerial),
    );
    if (
      requestedCatalogSerial &&
      activeRun.steps.some((step) => step.flowSerial === requestedCatalogSerial)
    ) {
      forceVisible(requestedCatalogSerial);
    }
  }
  const requestedViewIsRequiredSetup = (readinessQuery.data?.checks ?? []).some(
    (check) =>
      check.state === "BLOCKED" &&
      check.actionGroup &&
      check.actionView &&
      manufacturingFlowSerial(
        sectionByWorkflowGroup[check.actionGroup],
        check.actionView,
      ) === requestedCatalogSerial,
  );
  if (requestedViewIsRequiredSetup) forceVisible(requestedCatalogSerial);
  const visibleManufacturingGroups = deriveVisibleManufacturingNavigation(
    manufacturingGroups,
    {
      hiddenFlowSerials: configuredHiddenStepSerials,
      forcedVisibleFlowSerials: forcedVisibleStepSerials,
    },
  );
  const visibleManufacturingFlowSteps = visibleManufacturingGroups.flatMap(
    (group) =>
      group.views.map((view) => ({
        ...view,
        section: group.id,
        flowCode: group.flowCode,
      })),
  );
  const resolvedVisibleTarget = resolveVisibleManufacturingNavigationTarget(
    visibleManufacturingGroups,
    {
      section: requestedCatalogSection,
      view: requestedCatalogView,
    },
  )!;
  const activeSection = resolvedVisibleTarget.section as ManufacturingSection;
  const activeGroup = visibleManufacturingGroups.find(
    (group) => group.id === activeSection,
  )!;
  const activeView = resolvedVisibleTarget.view;
  useEffect(() => {
    if (
      !workflowConfigurationQuery.data ||
      (activeSection === requestedCatalogSection &&
        activeView === requestedCatalogView)
    )
      return;
    const params = new URLSearchParams();
    if (!(
      activeSection === "dashboard" && activeView === "manufacturing-dashboard"
    )) {
      params.set("section", activeSection);
      params.set("view", activeView);
    }
    if (activeRun?.id) params.set("run", activeRun.id);
    const query = params.toString();
    router.replace(
      buildWorkspaceRoute(
        mode,
        `/manufacturing/dashboard${query ? `?${query}` : ""}`,
      ),
    );
  }, [
    activeRun?.id,
    activeSection,
    activeView,
    mode,
    requestedCatalogSection,
    requestedCatalogView,
    router,
    workflowConfigurationQuery.data,
  ]);
  const catalogViewLabel =
    activeGroup.views.find((view) => view.id === activeView)?.label ??
    activeGroup.views[0].label;
  const activeFlowIndex = manufacturingFlowSteps.findIndex(
    (step) => step.section === activeSection && step.id === activeView,
  );
  const catalogGlobalSerial = activeFlowIndex + 1;
  const activeRunStep = activeRun
    ? selectManufacturingRunStepForView({
        steps: activeRun.steps,
        section: activeSection,
        view: activeView,
        requestedOccurrenceKey,
        catalogFlowSerial: catalogGlobalSerial,
      })
    : null;
  const requestedOccurrenceMissing = Boolean(
    activeRun && requestedOccurrenceKey && !activeRunStep,
  );
  const activeGlobalSerial = activeRunStep?.flowSerial ?? catalogGlobalSerial;
  const activeViewLabel = activeRunStep?.title ?? catalogViewLabel;
  const activeViewWasConfiguredHidden =
    configuredHiddenStepSerials.has(activeGlobalSerial);
  const activeViewWasForcedVisible =
    activeGroup.views.find((view) => view.id === activeView)?.forcedVisible ??
    false;
  const activeViewIsSafetyFallback =
    activeGroup.views.find((view) => view.id === activeView)?.safetyFallback ??
    false;
  const workflowDefinitionGroups = workflowDefinitionQuery.data?.groups;
  const workflowStepDefinitions = useMemo(
    () =>
      Array.isArray(workflowDefinitionGroups)
        ? workflowDefinitionGroups.flatMap((group) => group.steps)
        : [],
    [workflowDefinitionGroups],
  );
  const workflowConfigurationGroups = useMemo(
    () =>
      manufacturingConfigurationGroups.map((group) => ({
        ...group,
        steps: group.steps.map((step) => ({
          ...step,
          prerequisiteFlowSerials:
            workflowStepDefinitions
              .find((definition) => definition.flowSerial === step.flowSerial)
              ?.dependencies.map(
                (dependency) => dependency.prerequisiteFlowSerial,
              ) ?? [],
        })),
      })),
    [workflowStepDefinitions],
  );
  const activeStepDefinition =
    workflowStepDefinitions.find(
      (step) => step.flowSerial === activeGlobalSerial,
    ) ?? null;
  const activeStepCompletionKind = workflowMetadataString(
    activeRunStep ?? activeStepDefinition,
    "kind",
  );
  const activeStepRequiresSourceRecord = Boolean(
    activeRunStep &&
    (activeRunStep.postingEffect !== "NONE" ||
      activeStepCompletionKind === "DOMAIN_COMPLETION" ||
      activeStepCompletionKind === "APPROVAL"),
  );
  const activeStepHasSourceRecord = Boolean(
    activeRunStep?.sourceRecordType?.trim() &&
    activeRunStep.sourceRecordId?.trim(),
  );
  const activeStepIsPendingNaApproval = Boolean(
    activeRunStep?.status === "PENDING_APPROVAL" &&
    activeRunStep.naReason?.trim(),
  );
  const permissionDataAvailable = session?.user.permissions !== undefined;
  const canConfigureManufacturing = Boolean(
    mode !== "api" ||
    session?.user.role === "Owner" ||
    !permissionDataAvailable ||
    session?.user.permissions?.includes("manufacturing.configure"),
  );
  const hasActiveStepPermission = Boolean(
    activeRunStep &&
    (mode !== "api" ||
      session?.user.role === "Owner" ||
      !permissionDataAvailable ||
      session?.user.permissions?.includes(activeRunStep.permissionKey)),
  );
  const hasLegacyRunDiscardPermission = Boolean(
    mode !== "api" ||
    session?.user.role === "Owner" ||
    !permissionDataAvailable ||
    session?.user.permissions?.includes("manufacturing.close"),
  );
  const activeRunIsLegacyUnboundDraft = Boolean(
    activeRun && isLegacyUnboundDraftManufacturingRun(activeRun),
  );
  const activeLegacyRunCanRequestDiscard = Boolean(
    activeRun &&
    activeRunIsLegacyUnboundDraft &&
    isManufacturingRunVisiblyUntouched(activeRun) &&
    !workflowRunHistoryQuery.isLoading &&
    !workflowRunHistoryQuery.isError &&
    workflowRunHistoryQuery.data?.length === 0,
  );
  const activeStepHistoryRecords = (workflowRunHistoryQuery.data ?? []).filter(
    (entry) =>
      entry.flowSerial === activeGlobalSerial &&
      entry.occurrenceKey === (activeRunStep?.occurrenceKey ?? "PRIMARY"),
  );
  const latestStepSubmission = activeStepHistoryRecords.find((entry) =>
    ["SUBMIT", "MARK_N_A"].includes(entry.sourceAction),
  );
  const makerCheckerBlocked = Boolean(
    activeRunStep?.status === "PENDING_APPROVAL" &&
    manufacturingSettingsQuery.data?.approvalRequired === true &&
    latestStepSubmission?.performedByUserId === session?.user.id,
  );
  const activeStepActions = activeRunStep
    ? manufacturingWorkflowStepUiActions({
        step: activeRunStep,
        definition: null,
        hasPermission: hasActiveStepPermission,
      }).filter((action) => action !== "APPROVE" || !makerCheckerBlocked)
    : [];
  const activeStepIsReadOnlyEvidence = Boolean(
    activeRunStep && ["MONITORING", "REPORT"].includes(activeRunStep.stepType),
  );
  const activeStepHistory = activeStepHistoryRecords.slice(0, 5);
  const previousOperationalStep = activeRun
    ? previousManufacturingOperationalStep(
        workflowRunHistoryQuery.data ?? [],
        activeGlobalSerial,
        activeRunStep?.occurrenceKey,
      )
    : null;
  const activeVisibleFlowIndex = visibleManufacturingFlowSteps.findIndex(
    (step) => step.section === activeSection && step.id === activeView,
  );
  const previousView =
    activeVisibleFlowIndex > 0
      ? visibleManufacturingFlowSteps[activeVisibleFlowIndex - 1]
      : null;
  const nextView =
    activeVisibleFlowIndex < visibleManufacturingFlowSteps.length - 1
      ? visibleManufacturingFlowSteps[activeVisibleFlowIndex + 1]
      : null;
  const activeRunProgress = activeRun?.groups.reduce(
    (totals, group) => ({
      applicable: totals.applicable + group.applicable,
      completed: totals.completed + group.completed,
      notApplicable: totals.notApplicable + group.notApplicable,
      blocked: totals.blocked + group.blocked,
      pendingApproval: totals.pendingApproval + group.pendingApproval,
    }),
    {
      applicable: 0,
      completed: 0,
      notApplicable: 0,
      blocked: 0,
      pendingApproval: 0,
    },
  );
  const activeGroupProgress = activeRun?.groups.find(
    (group) => group.flowGroupCode === activeGroup.flowCode,
  );
  const activeGroupCompletionPercent = activeGroupProgress?.applicable
    ? Math.round(
        (activeGroupProgress.completed / activeGroupProgress.applicable) * 100,
      )
    : 0;
  const settingsMode = manufacturingSettingsQuery.data?.mode;
  const activeRunOrderIds = new Set(
    operationalRuns
      .map((run) => run.productionOrderId)
      .filter((id): id is string => Boolean(id)),
  );
  const startOrderEligibility = (startOrdersQuery.data ?? []).map((order) => ({
    order,
    reason: manufacturingWorkflowStartOrderIneligibility(order, {
      manufacturingMode: settingsMode,
      activeRunOrderIds,
    }),
  }));
  const eligibleStartOrders = startOrderEligibility
    .filter((entry) => entry.reason === null)
    .map((entry) => entry.order);
  const ineligibleStartOrderHint =
    eligibleStartOrders.length === 0
      ? summarizeManufacturingWorkflowOrderIneligibility(
          startOrderEligibility.flatMap((entry) =>
            entry.reason ? [entry.reason] : [],
          ),
        )
      : "";
  const selectedStartOrder = eligibleStartOrders.find(
    (order) => order.id === selectedStartOrderId,
  );
  const setupBlocked = readinessQuery.data?.ready === false;
  const setupNeedsReview = Boolean(
    setupBlocked ||
    readinessQuery.isError ||
    (!readinessQuery.isLoading && !readinessQuery.data),
  );
  const firstSetupAction = readinessQuery.data?.checks.find(
    (check) =>
      check.state === "BLOCKED" && check.actionGroup && check.actionView,
  );
  const selectedOrderId = searchParams.get("record") ?? undefined;
  const itemsQuery = useLcInventoryItemsQuery(
    session?.workspaceId,
    Boolean(session?.workspaceId),
  );
  const warehousesQuery = useLcWarehousesQuery(
    session?.workspaceId,
    Boolean(session?.workspaceId),
  );
  const items = itemsQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const routeKey = `${activeSection}/${activeView}`;
  const availabilityConfig = availabilityViews[routeKey];
  const itemProfileRole = itemProfileViews[routeKey];
  const isIntermediateBulk =
    routeKey === "masters/intermediate-and-bulk-products";
  const orderPreset = orderPresets[routeKey];
  const isDashboard =
    activeSection === "dashboard" &&
    (activeView === "manufacturing-dashboard" ||
      activeView === "production-control-center");
  const isBom =
    activeSection === "masters" &&
    (activeView === "bom-master-formula" || activeView === "formula-versions");
  const isSettings =
    activeSection === "setup" && activeView === "manufacturing-settings";
  const isRouting =
    activeSection === "masters" &&
    (activeView === "production-routing" ||
      activeView === "operations-and-process-stages");
  const isPlan =
    activeSection === "planning" && activeView === "production-plan";
  const isProductionSchedule =
    activeSection === "planning" &&
    activeView === "production-schedule-calendar";
  const isMrp =
    activeSection === "planning" &&
    (activeView === "material-requirement-planning" ||
      activeView === "what-if-production-planning");
  const supplySuggestionType: ManufacturingSupplySuggestionType | undefined =
    activeSection === "planning" &&
    activeView === "suggested-purchase-requisition"
      ? "PURCHASE_REQUISITION"
      : activeSection === "planning" &&
          activeView === "suggested-stock-transfer"
        ? "STOCK_TRANSFER"
        : undefined;
  const specializedWorkspaceOwner = manufacturingSpecializedWorkspaceOwner(
    activeSection,
    activeView,
  );
  const isBlueprintControl = specializedWorkspaceOwner === "BLUEPRINT";
  const isGovernance = specializedWorkspaceOwner === "GOVERNANCE";
  const isDowntime = routeKey === "execution/downtime-entry";
  const isExecutionTransfer =
    activeSection === "execution" &&
    isManufacturingExecutionTransferView(activeView);
  const isStatusConfiguration =
    activeSection === "setup" && activeView === "status-configuration";
  const isMaterialsOperational = specializedWorkspaceOwner === "MATERIALS";
  const isSerialPackaging = isManufacturingSerialPackagingView(
    activeSection,
    activeView,
  );
  const isCostReportWorkspace = specializedWorkspaceOwner === "COST_REPORT";
  const hasSpecializedWorkspace = Boolean(
    isDashboard ||
    itemProfileRole ||
    isIntermediateBulk ||
    availabilityConfig ||
    isBom ||
    isRouting ||
    isPlan ||
    isProductionSchedule ||
    isMrp ||
    supplySuggestionType ||
    orderPreset ||
    isSettings ||
    isMaterialsOperational ||
    isDowntime ||
    isExecutionTransfer ||
    (isSerialPackaging && session?.workspaceId) ||
    isStatusConfiguration ||
    isCostReportWorkspace ||
    isGovernance ||
    isBlueprintControl,
  );

  const moduleSearchResults = useMemo(() => {
    const term = moduleSearch.trim().toLowerCase();
    if (!term) return [];
    return visibleManufacturingGroups
      .flatMap((group) =>
        group.views.map((view) => ({
          section: group.id,
          group: group.label,
          view: view.id,
          label: view.label,
          icon: group.icon,
        })),
      )
      .filter((result) =>
        `${result.group} ${result.label}`.toLowerCase().includes(term),
      )
      .slice(0, 8);
  }, [moduleSearch, visibleManufacturingGroups]);

  const go = (path: string) => router.push(buildWorkspaceRoute(mode, path));
  const openView = (
    section: ManufacturingSection,
    view?: string,
    record?: string,
    occurrenceKey?: string,
    requiredByWorkflowSafety = false,
  ) => {
    const catalogGroup = manufacturingGroups.find(
      (entry) => entry.id === section,
    )!;
    const requestedValidView =
      view && catalogGroup.views.some((entry) => entry.id === view)
        ? view
        : catalogGroup.views[0].id;
    const visibleTarget = requiredByWorkflowSafety
      ? {
          section,
          view: requestedValidView,
          flowSerial: manufacturingFlowSerial(section, requestedValidView) ?? 1,
        }
      : resolveVisibleManufacturingNavigationTarget(
          visibleManufacturingGroups,
          { section, view: requestedValidView },
        );
    if (!visibleTarget) return;
    const validSection = visibleTarget.section as ManufacturingSection;
    const validView = visibleTarget.view;
    const params = new URLSearchParams();
    if (!(
      validSection === "dashboard" && validView === "manufacturing-dashboard"
    )) {
      params.set("section", validSection);
      params.set("view", validView);
    }
    if (record) params.set("record", record);
    if (activeRun?.id) params.set("run", activeRun.id);
    if (occurrenceKey && occurrenceKey !== "PRIMARY")
      params.set("occurrence", occurrenceKey);
    if (requiredByWorkflowSafety) params.set("reveal", "required");
    const query = params.toString();
    go(`/manufacturing/dashboard${query ? `?${query}` : ""}`);
  };
  const openRunStep = (
    step: Pick<ManufacturingRunStepRecord, "route"> & {
      occurrenceKey?: string;
    },
  ) => {
    const target = resolveManufacturingRunStepRoute(step.route);
    if (target)
      openView(
        target.section,
        target.view,
        undefined,
        step.occurrenceKey,
        true,
      );
  };
  const openFirstSetupAction = () => {
    if (firstSetupAction?.actionGroup && firstSetupAction.actionView) {
      openView(
        sectionByWorkflowGroup[firstSetupAction.actionGroup],
        firstSetupAction.actionView,
        undefined,
        undefined,
        true,
      );
      return;
    }
    openView("setup", "manufacturing-settings", undefined, undefined, true);
  };
  const openWorkflowRun = (runId: string) => {
    setSelectedStartOrderId("");
    const params = new URLSearchParams({ run: runId });
    go(`/manufacturing/dashboard?${params.toString()}`);
  };
  const closeLegacyRunDiscardDialog = () => {
    if (discardEmptyWorkflowRun.isPending) return;
    setPendingLegacyRunDiscard(null);
    setLegacyRunDiscardReason("");
  };
  const confirmLegacyRunDiscard = async () => {
    const reason = legacyRunDiscardReason.trim();
    if (!session?.workspaceId || !pendingLegacyRunDiscard || !reason) return;
    try {
      await discardEmptyWorkflowRun.mutateAsync({
        runId: pendingLegacyRunDiscard.runId,
        input: {
          workspaceId: session.workspaceId,
          reason,
          expectedVersion: pendingLegacyRunDiscard.version,
        },
      });
      setPendingLegacyRunDiscard(null);
      setLegacyRunDiscardReason("");
      toast.success(
        "The legacy empty workflow run was cancelled. No record was deleted.",
      );
      go("/manufacturing/dashboard");
    } catch (error) {
      toast.error(workflowActionError(error));
    }
  };
  const addRepeatableOccurrence = async () => {
    if (
      !session?.workspaceId ||
      !activeRun ||
      !activeRunStep?.repeatable ||
      !hasActiveStepPermission
    )
      return;
    const supplied = window.prompt(
      "Enter the real occurrence key (for example the production lot, sample, operation, or event reference):",
    );
    if (supplied === null) return;
    const occurrenceKey = supplied.trim();
    if (!occurrenceKey || occurrenceKey.toUpperCase() === "PRIMARY") {
      toast.error("Enter a non-PRIMARY occurrence key.");
      return;
    }
    try {
      const refreshedRun = await createWorkflowStepOccurrence.mutateAsync({
        workspaceId: session.workspaceId,
        runId: activeRun.id,
        stepId: activeRunStep.id,
        input: { workspaceId: session.workspaceId, occurrenceKey },
      });
      const occurrence = refreshedRun.steps.find(
        (step) =>
          step.flowSerial === activeRunStep.flowSerial &&
          step.occurrenceKey === occurrenceKey,
      );
      toast.success(`Occurrence ${occurrenceKey} is ready in the workflow.`);
      if (occurrence) openRunStep(occurrence);
    } catch (error) {
      toast.error(workflowActionError(error));
    }
  };
  const startOrContinue = async () => {
    if (requestedRunMissing) return;
    if (
      setupBlocked ||
      readinessQuery.isError ||
      (!readinessQuery.isLoading && !readinessQuery.data)
    ) {
      openFirstSetupAction();
      return;
    }
    if (!session?.workspaceId) return;
    if (!selectedStartOrder && activeRunIsLegacyUnboundDraft) {
      toast.error(
        "This legacy unbound draft cannot continue. Cancel it, or select a production order for a new run.",
      );
      return;
    }
    if (!selectedStartOrder && activeRun?.nextAction.step) {
      openRunStep(activeRun.nextAction.step);
      return;
    }
    if (!selectedStartOrder) {
      toast.error(
        "Select a real production order before starting its workflow run.",
      );
      return;
    }
    try {
      const run = await startWorkflowRun.mutateAsync({
        workspaceId: session.workspaceId,
        productionOrderId: selectedStartOrder.id,
        productId: selectedStartOrder.finishedProductId,
        idempotencyKey:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? `manufacturing-run:${crypto.randomUUID()}`
            : `manufacturing-run:${Date.now()}`,
      });
      setSelectedStartOrderId("");
      if (run.nextAction.step) {
        const target = resolveManufacturingRunStepRoute(
          run.nextAction.step.route,
        );
        if (target) {
          const params = new URLSearchParams({
            section: target.section,
            view: target.view,
            run: run.id,
          });
          if (run.nextAction.step.occurrenceKey !== "PRIMARY")
            params.set("occurrence", run.nextAction.step.occurrenceKey);
          go(`/manufacturing/dashboard?${params.toString()}`);
        }
      }
    } catch (error) {
      toast.error(workflowActionError(error));
    }
  };
  const commitWorkflowStepTransition = async (
    transition: PendingSignedWorkflowTransition,
    signature?: {
      meaning: string;
      reauthenticationPassword: string | null;
    },
  ) => {
    try {
      await transitionWorkflowStep.mutateAsync({
        workspaceId: transition.input.workspaceId,
        runId: transition.runId,
        stepId: transition.stepId,
        input: {
          ...transition.input,
          signatureMeaning: signature?.meaning ?? null,
          reauthenticationPassword: signature?.reauthenticationPassword ?? null,
        },
      });
      setPendingSignedTransition(null);
      setWorkflowSignatureMeaning("");
      setWorkflowReauthenticationPassword("");
      toast.success(
        `${workflowStepActionLabels[transition.input.action as ManufacturingWorkflowStepUiAction]} recorded for ${transition.stepLabel}.`,
      );
    } catch (error) {
      setWorkflowReauthenticationPassword("");
      toast.error(workflowActionError(error));
    }
  };
  const transitionActiveWorkflowStep = async (
    action: ManufacturingWorkflowStepUiAction,
  ) => {
    if (!session?.workspaceId || !activeRun || !activeRunStep) return;
    if (!activeStepActions.includes(action)) {
      toast.error("This action is no longer valid for the active step.");
      return;
    }

    let sourceRecordType = activeRunStep.sourceRecordType?.trim() || null;
    let sourceRecordId = activeRunStep.sourceRecordId?.trim() || null;
    const approvingNotApplicable =
      action === "APPROVE" && Boolean(activeRunStep.naReason?.trim());
    const actionRequiresPersistedSource =
      (["BEGIN_POSTING", "CONFIRM_POSTED", "COMPLETE"].includes(action) &&
        activeStepRequiresSourceRecord) ||
      (action === "SUBMIT" && activeStepCompletionKind === "APPROVAL");
    const actionNeedsDraftSource = action === "SAVE_DRAFT";
    const shouldRequestPersistedSource =
      actionRequiresPersistedSource || actionNeedsDraftSource;

    if (
      action === "APPROVE" &&
      activeStepCompletionKind === "APPROVAL" &&
      !approvingNotApplicable &&
      (!sourceRecordType || !sourceRecordId)
    ) {
      toast.error(
        "Approval cannot continue because Submit did not link an exact persisted source record.",
      );
      return;
    }
    if (shouldRequestPersistedSource && !sourceRecordType) {
      const suppliedType = window.prompt(
        "Enter the persisted source type (for example MANUFACTURING_ORDER, MANUFACTURING_PLAN, MANUFACTURING_TRANSACTION, or MANUFACTURING_WORKFLOW_REVIEW):",
      );
      if (suppliedType === null) return;
      sourceRecordType = suppliedType.trim() || null;
      if (!sourceRecordType) {
        toast.error("A persisted source record type is required.");
        return;
      }
    }
    if (shouldRequestPersistedSource && !sourceRecordId) {
      const suppliedId = window.prompt(
        "Enter the exact ID of that existing persisted source record:",
      );
      if (suppliedId === null) return;
      sourceRecordId = suppliedId.trim() || null;
      if (!sourceRecordId) {
        toast.error("A persisted source record ID is required.");
        return;
      }
    }

    let reason: string | null = null;

    if (action === "TRIGGER") {
      const suppliedReason = window.prompt(
        "Enter the real reason or source event for activating this branch:",
      );
      if (suppliedReason === null) return;
      reason = suppliedReason.trim();
      if (!reason) {
        toast.error("A trigger reason or source event is required.");
        return;
      }
    } else if (action === "MARK_N_A") {
      const suppliedReason = window.prompt(
        "Enter the real reason this workflow step is not applicable:",
      );
      if (suppliedReason === null) return;
      reason = suppliedReason.trim();
      if (!reason) {
        toast.error("A real reason is required before requesting N/A.");
        return;
      }
    } else if (action === "HOLD") {
      const suppliedReason = window.prompt(
        "Enter the reason for placing this workflow step on hold:",
      );
      if (suppliedReason === null) return;
      reason = suppliedReason.trim();
      if (!reason) {
        toast.error("A hold reason is required.");
        return;
      }
    }

    if (action === "APPROVE" || action === "MARK_N_A") {
      if (
        manufacturingSettingsQuery.isLoading ||
        manufacturingSettingsQuery.isError ||
        !manufacturingSettingsQuery.data
      ) {
        toast.error(
          "Electronic-signature policy could not be verified. Retry after Manufacturing settings load.",
        );
        return;
      }
      if (
        action === "APPROVE" &&
        manufacturingSettingsQuery.data.approvalRequired &&
        (workflowRunHistoryQuery.isLoading || workflowRunHistoryQuery.isError)
      ) {
        toast.error(
          "Maker-checker history could not be verified. Retry the audit history before approving.",
        );
        return;
      }
    }

    const transition: PendingSignedWorkflowTransition = {
      runId: activeRun.id,
      stepId: activeRunStep.id,
      stepLabel: `step ${activeRunStep.flowSerial}. ${activeRunStep.title}`,
      input: {
        workspaceId: session.workspaceId,
        idempotencyKey: workflowStepIdempotencyKey(
          activeRun.id,
          activeRunStep.id,
          action,
        ),
        action,
        reason,
        sourceRecordType,
        sourceRecordId,
        expectedVersion: activeRunStep.version,
      },
    };
    const settings = manufacturingSettingsQuery.data;
    const signedAction =
      action === "APPROVE" ||
      (action === "MARK_N_A" && settings?.approvalRequired === false);
    if (signedAction && settings?.electronicSignatureRequired === true) {
      if (
        workflowElectronicSignatureQuery.isLoading ||
        workflowElectronicSignatureQuery.isError ||
        !workflowElectronicSignatureQuery.data
      ) {
        toast.error(
          "Electronic-signature policy could not be verified. Refresh and retry.",
        );
        return;
      }
      const signatureContext = workflowElectronicSignatureQuery.data;
      if (signatureContext.blockedReason || !signatureContext.policyReady) {
        toast.error(
          signatureContext.blockedReason ??
            "An approved electronic-signature policy is required.",
        );
        return;
      }
      setWorkflowSignatureMeaning("");
      setWorkflowReauthenticationPassword("");
      setPendingSignedTransition(transition);
      return;
    }

    await commitWorkflowStepTransition(transition);
  };
  const openWorkflowTarget = (
    group: ManufacturingWorkflowGroup,
    view: string,
  ) =>
    openView(sectionByWorkflowGroup[group], view, undefined, undefined, true);
  const openSelectedOrder = (orderId: string) =>
    openView(activeSection, activeView, orderId);
  const openWorkflowConfiguration = async () => {
    if (workflowConfigurationQuery.data) {
      setWorkflowConfigurationOpen(true);
      return;
    }
    const refreshed = await workflowConfigurationQuery.refetch();
    if (!refreshed.data) {
      toast.error(
        "Manufacturing configuration could not be loaded. Check the connection and retry.",
      );
      return;
    }
    setWorkflowConfigurationOpen(true);
  };
  const saveWorkflowConfiguration = async (hiddenStepSerials: number[]) => {
    const configuration = workflowConfigurationQuery.data;
    if (!session?.workspaceId || !configuration) {
      toast.error(
        "Manufacturing configuration is not available yet. Refresh and retry.",
      );
      return;
    }
    try {
      const savedConfiguration = await updateWorkflowConfiguration.mutateAsync({
        workspaceId: session.workspaceId,
        workflowDefinitionVersion: configuration.workflowDefinitionVersion,
        hiddenStepSerials,
        expectedRevision: configuration.revision,
      });
      const updatedVisibleGroups = deriveVisibleManufacturingNavigation(
        manufacturingGroups,
        {
          hiddenFlowSerials: savedConfiguration.hiddenStepSerials,
          forcedVisibleFlowSerials: forcedVisibleStepSerials,
        },
      );
      const updatedTarget = resolveVisibleManufacturingNavigationTarget(
        updatedVisibleGroups,
        {
          section: requestedCatalogSection,
          view: requestedCatalogView,
        },
      );
      if (
        updatedTarget &&
        (updatedTarget.section !== requestedCatalogSection ||
          updatedTarget.view !== requestedCatalogView)
      ) {
        const params = new URLSearchParams();
        if (!(
          updatedTarget.section === "dashboard" &&
          updatedTarget.view === "manufacturing-dashboard"
        )) {
          params.set("section", updatedTarget.section);
          params.set("view", updatedTarget.view);
        }
        if (activeRun?.id) params.set("run", activeRun.id);
        const query = params.toString();
        router.replace(
          buildWorkspaceRoute(
            mode,
            `/manufacturing/dashboard${query ? `?${query}` : ""}`,
          ),
        );
      }
      setWorkflowConfigurationOpen(false);
      toast.success(
        "Manufacturing navigation configuration saved. No workflow or posting data was changed.",
      );
    } catch (error) {
      toast.error(workflowActionError(error));
      void workflowConfigurationQuery.refetch();
    }
  };
  const closeWorkflowSignatureDialog = () => {
    setPendingSignedTransition(null);
    setWorkflowSignatureMeaning("");
    setWorkflowReauthenticationPassword("");
  };
  const startOrContinueDisabled =
    !session?.workspaceId ||
    readinessQuery.isLoading ||
    startWorkflowRun.isPending ||
    (!setupNeedsReview &&
      (workflowRunsQuery.isLoading ||
        workflowRunsQuery.isError ||
        workflowDefinitionQuery.isError ||
        requestedRunMissing ||
        (selectedStartOrder
          ? false
          : activeRunIsLegacyUnboundDraft
            ? true
            : activeRun
              ? !activeRun.nextAction.step
              : startOrdersQuery.isLoading ||
                startOrdersQuery.isError ||
                !selectedStartOrder)));
  const workflowStepNavigationButtons = (
    <div className="flex flex-nowrap items-center gap-2">
      {previousOperationalStep ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-0 whitespace-nowrap max-[420px]:flex-1 max-[1365px]:px-2 max-[1365px]:!text-[10px]"
          onClick={() => openRunStep(previousOperationalStep)}
        >
          <span className="max-[1365px]:hidden">
            Previous Operational Step
          </span>
          <span className="hidden max-[1365px]:inline">Previous Step</span>
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={startOrContinueDisabled}
        className="relative z-10 shrink-0 whitespace-nowrap max-[420px]:flex-1 max-[1365px]:px-2.5 max-[1365px]:!text-[10px]"
        onClick={() => void startOrContinue()}
      >
        <span className="max-[1365px]:hidden">Next Required Action</span>
        <span className="hidden max-[1365px]:inline">Next Action</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  if (workflowConfigurationOpen) {
    return (
      <div
        data-manufacturing-control-center
        data-manufacturing-configuration-route-view
        className="flex h-full min-h-0 w-full p-3 xl:max-2xl:p-1"
      >
        <ManufacturingNavigationConfigurationDialog
          presentation="page"
          open
          onOpenChange={setWorkflowConfigurationOpen}
          groups={workflowConfigurationGroups}
          configuration={workflowConfigurationQuery.data}
          canConfigure={canConfigureManufacturing}
          isSaving={updateWorkflowConfiguration.isPending}
          onSave={(hiddenStepSerials) =>
            void saveWorkflowConfiguration(hiddenStepSerials)
          }
        />
      </div>
    );
  }

  return (
    <div
      data-manufacturing-control-center
      /* Large screens keep the fixed frame: the title bar, the workflow strip and
       * the step navigator stay put and only the workspace on the right scrolls.
       * Below xl there is no room for that, so the whole screen becomes an ordinary
       * scrolling document instead of squeezing the workspace to nothing. */
      className="flex min-h-full flex-col gap-3 p-3 xl:h-full xl:min-h-0 xl:max-2xl:gap-1.5 xl:max-2xl:px-1.5 xl:max-2xl:py-1.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 xl:max-2xl:flex-nowrap xl:max-2xl:gap-2">
        <div className="flex flex-wrap items-center gap-3 xl:max-2xl:shrink-0 xl:max-2xl:flex-nowrap xl:max-2xl:gap-2">
          <h1 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-[#14233b] xl:max-2xl:!text-[20px]">
            Manufacturing Center
          </h1>
          <form
            className="relative shrink-0"
            onSubmit={(event) => {
              event.preventDefault();
              const result = moduleSearchResults[0];
              if (!result) return;
              openView(result.section, result.view);
              setModuleSearch("");
              setModuleSearchOpen(false);
              setModuleSearchResetKey((current) => current + 1);
            }}
          >
            <CollapsibleSearch
              key={moduleSearchResetKey}
              value={moduleSearch}
              onChange={(value) => {
                setModuleSearch(value);
                setModuleSearchOpen(Boolean(value.trim()));
              }}
              size="sm"
              expandedWidth="w-[300px] sm:w-[320px]"
              placeholder="Search this manufacturing module…"
              label="Search manufacturing workflows"
              inputClassName="rounded-xl border-[#cfddeb] bg-white shadow-[0_3px_12px_rgba(30,64,175,0.05)]"
            />
            {moduleSearchOpen && moduleSearch.trim() ? (
              <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-full overflow-hidden rounded-xl border border-[#cfdeef] bg-white shadow-[0_18px_42px_rgba(15,23,42,0.16)]">
                {moduleSearchResults.length ? (
                  <div className="max-h-[320px] overflow-y-auto p-1.5">
                    {moduleSearchResults.map((result) => {
                      const Icon = result.icon;
                      return (
                        <button
                          key={`${result.section}-${result.view}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            openView(result.section, result.view);
                            setModuleSearch("");
                            setModuleSearchOpen(false);
                            setModuleSearchResetKey((current) => current + 1);
                          }}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f2f7fd]"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#edf5ff] text-[#2478df]">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-[#203651]">
                              {result.label}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-[#7b8798]">
                              {result.group}
                            </span>
                          </span>
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#9aa7b8]" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-4 py-5 text-center text-xs text-[#718096]">
                    No matching manufacturing workflow found.
                  </div>
                )}
              </div>
            ) : null}
          </form>
        </div>
        <div
          data-manufacturing-header-actions
          className="flex max-w-4xl flex-wrap items-center justify-end gap-2 xl:shrink-0 xl:max-2xl:min-w-0 xl:max-2xl:max-w-none xl:max-2xl:flex-nowrap xl:max-2xl:gap-1 2xl:max-w-none 2xl:flex-nowrap 2xl:gap-1.5 [&>button]:shrink-0 xl:max-2xl:[&>button]:h-7 xl:max-2xl:[&>button]:gap-1 xl:max-2xl:[&>button]:px-1.5 xl:max-2xl:[&>button]:!text-[10px] xl:max-2xl:[&>button>svg]:h-3.5 xl:max-2xl:[&>button>svg]:w-3.5 2xl:[&>button]:gap-1.5 2xl:[&>button]:px-2.5 2xl:[&>button]:!text-[12px]"
        >
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              !session?.workspaceId ||
              (workflowConfigurationQuery.isLoading &&
                !workflowConfigurationQuery.data)
            }
            title={
              workflowConfigurationQuery.isError
                ? "Manufacturing configuration could not be loaded"
                : canConfigureManufacturing
                  ? "Choose the Manufacturing processes visible to this company"
                  : "Review the company Manufacturing configuration"
            }
            onClick={() => void openWorkflowConfiguration()}
          >
            <Settings2 className="h-4 w-4" />
            Configuration
          </Button>
          {isConfiguredManufacturingViewVisible(
            "planning",
            "production-plan",
          ) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openView("planning", "production-plan")}
            >
              <CalendarDays className="h-4 w-4" />
              Production Plan
            </Button>
          ) : null}
          {isConfiguredManufacturingViewVisible(
            "orders",
            "all-production-orders",
          ) ? (
            <Button
              type="button"
              size="sm"
              onClick={() => openView("orders", "all-production-orders")}
            >
              <ClipboardList className="h-4 w-4" />
              Production / Batch Order
            </Button>
          ) : null}
          {isConfiguredManufacturingViewVisible(
            "masters",
            "bom-master-formula",
          ) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openView("masters", "bom-master-formula")}
            >
              <BookOpen className="h-4 w-4" />
              BOM / Master Formula
            </Button>
          ) : null}
          {isConfiguredManufacturingViewVisible(
            "materials",
            "material-issue",
          ) ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => openView("materials", "material-issue")}
            >
              <ScanLine className="h-4 w-4" />
              Scan Material
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => go("/masters/inventory?tab=warehouses")}
          >
            <Warehouse className="h-4 w-4" />
            Warehouses
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => window.print()}
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#cfdeef] bg-white shadow-[0_8px_24px_rgba(30,64,175,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#dce7f3] bg-white px-4 py-3 2xl:py-2">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#1f73d8] text-white shadow-[0_4px_10px_rgba(31,115,216,0.22)] 2xl:h-8 2xl:w-8">
              <Factory className="h-4 w-4" />
            </span>
            <div className="text-sm font-semibold text-[#152b49]">
              Manufacturing Workflow Navigator
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] font-medium">
            <span className="rounded-full border border-[#bed7f5] bg-white/80 px-2.5 py-1 text-[#1767c5]">
              {visibleManufacturingGroups.length} workflow groups
            </span>
            <span className="rounded-full border border-[#d8e2ed] bg-white/80 px-2.5 py-1 text-[#53647b]">
              {visibleManufacturingFlowSteps.length}/{totalControlledSteps}{" "}
              enabled controls
            </span>
            {activeRunProgress ? (
              <span className="rounded-full border border-[#c9def7] bg-[#f2f8ff] px-2.5 py-1 text-[#1767c5]">
                Completed {activeRunProgress.completed}/
                {activeRunProgress.applicable}
                {activeRunProgress.notApplicable
                  ? ` · ${activeRunProgress.notApplicable} N/A`
                  : ""}
              </span>
            ) : null}
            {selectableRuns.length ? (
              <select
                aria-label="Active manufacturing run"
                value={activeRun?.id ?? ""}
                onChange={(event) => {
                  if (event.target.value) openWorkflowRun(event.target.value);
                }}
                className="h-8 max-w-[250px] rounded-lg border border-[#cbd8e7] bg-white px-2 text-[11px] text-[#334155] outline-none focus:border-[#7eafe8]"
              >
                {!activeRun ? (
                  <option value="">Select workflow run...</option>
                ) : null}
                {operationalRuns.map((run) => {
                  const order = (startOrdersQuery.data ?? []).find(
                    (candidate) => candidate.id === run.productionOrderId,
                  );
                  return (
                    <option key={run.id} value={run.id}>
                      {order
                        ? `${order.orderNumber} · ${order.finishedProductName}`
                        : `Product run ${run.id.slice(0, 8)}`}
                    </option>
                  );
                })}
                {legacyUnboundDraftRuns.map((run) => (
                  <option key={run.id} value={run.id}>
                    Legacy unbound draft · {run.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            ) : null}
            {readinessQuery.data?.ready &&
            (!activeRun || eligibleStartOrders.length > 0) ? (
              <select
                aria-label="Production order for new manufacturing run"
                value={selectedStartOrderId}
                onChange={(event) =>
                  setSelectedStartOrderId(event.target.value)
                }
                disabled={
                  startOrdersQuery.isLoading || startOrdersQuery.isError
                }
                className="h-8 max-w-[280px] rounded-lg border border-[#cbd8e7] bg-white px-2 text-[11px] text-[#334155] outline-none focus:border-[#7eafe8] disabled:bg-[#f1f5f9]"
              >
                <option value="">
                  {startOrdersQuery.isLoading
                    ? "Loading production orders…"
                    : eligibleStartOrders.length
                      ? activeRun
                        ? "Start another production order…"
                        : "Select production order…"
                      : "No eligible production order"}
                </option>
                {eligibleStartOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber} · {order.finishedProductName} ·{" "}
                    {order.plannedQuantity} {order.unit}
                  </option>
                ))}
              </select>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => void startOrContinue()}
              disabled={startOrContinueDisabled}
              className="h-8 rounded-lg bg-[#1671d9] px-3 text-[11px] text-white hover:bg-[#125fb9]"
            >
              {setupNeedsReview ? (
                <Settings2 className="h-3.5 w-3.5" />
              ) : (
                <PlayCircle className="h-3.5 w-3.5" />
              )}
              {startWorkflowRun.isPending
                ? "Starting…"
                : setupBlocked
                  ? "Complete Setup"
                  : setupNeedsReview
                    ? "Review Setup"
                    : requestedRunMissing
                      ? "Run unavailable"
                      : selectedStartOrder
                        ? "Start Order Run"
                        : activeRunIsLegacyUnboundDraft
                          ? "Legacy Run"
                          : activeRun
                            ? "Continue Manufacturing"
                            : "Start Order Run"}
            </Button>
            {activeLegacyRunCanRequestDiscard ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!hasLegacyRunDiscardPermission}
                title={
                  hasLegacyRunDiscardPermission
                    ? "Cancel this legacy unbound draft after the server verifies that it has no activity"
                    : "manufacturing.close permission is required"
                }
                onClick={() => {
                  if (!activeRun) return;
                  setPendingLegacyRunDiscard({
                    runId: activeRun.id,
                    version: activeRun.version,
                  });
                }}
                className="h-8 border-[#efb4ac] text-[11px] text-[#a33a2b] hover:bg-[#fff7f5] hover:text-[#8d2f23]"
              >
                Cancel legacy empty run
              </Button>
            ) : null}
          </div>
        </div>
        {readinessQuery.data?.ready &&
        !startOrdersQuery.isLoading &&
        (startOrdersQuery.data?.length ?? 0) > 0 &&
        eligibleStartOrders.length === 0 &&
        ineligibleStartOrderHint ? (
          <div className="border-b border-[#ead9b8] bg-[#fffaf0] px-4 py-2 text-[10px] leading-4 text-[#805500]">
            {activeRun ? "No additional" : "No"} production order can start a
            new run: {ineligibleStartOrderHint}.
          </div>
        ) : null}
        {/* One line at every width. The boxes share the row when they fit and the strip
         * scrolls sideways when they do not, which costs one compact row instead of the
         * six stacked rows a wrapping grid produced on a small screen. */}
        <div className="flex gap-px overflow-x-auto bg-[#dfe7f0] [scrollbar-width:thin]">
          {visibleManufacturingGroups.map((section) => {
            const Icon = section.icon;
            const active = activeSection === section.id;
            const progress = activeRun?.groups.find(
              (group) => group.flowGroupCode === section.flowCode,
            );
            const needsAttention = ["LOCKED", "BLOCKED"].includes(
              progress?.state ?? "",
            );
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => openView(section.id)}
                aria-label={`${section.label}${needsAttention ? "; prerequisites need attention" : ""}`}
                className={`group relative flex min-w-[112px] max-w-[150px] flex-[1_0_112px] flex-col gap-1 px-2 py-1.5 text-left transition-all xl:max-2xl:min-w-[96px] xl:max-2xl:flex-1 xl:max-2xl:px-1.5 ${active ? "z-10 bg-[#eff6ff] text-[#1559a7] shadow-[inset_0_-3px_0_#2478df]" : "bg-white text-[#4d5f77] hover:bg-[#f5f9fe] hover:text-[#1b2c45]"}`}
              >
                <span
                  className={`flex items-center gap-1.5 ${progress?.state ? "2xl:pr-5" : ""}`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${active ? "bg-[#2478df] text-white shadow-[0_4px_10px_rgba(36,120,223,0.2)]" : "bg-[#eef3f8] text-[#64748b] group-hover:bg-[#e4effc] group-hover:text-[#2478df]"}`}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <span
                    className={`truncate text-[9px] font-bold uppercase tracking-[0.1em] !leading-3 ${active ? "text-[#6d91bd]" : "text-[#9aa7b8]"}`}
                  >
                    Group {section.flowCode}
                  </span>
                </span>
                {/* Clamped so one over-long group name cannot make every box taller;
                 * the full text stays reachable through the tooltip and aria-label. */}
                <span
                  className="line-clamp-2 text-[11px] font-semibold !text-[11px] !leading-[14px] xl:max-2xl:!text-[10px] xl:max-2xl:!leading-[13px]"
                  title={section.label}
                >
                  {section.label}
                </span>
                {progress?.state ? (
                  <span
                    className={`absolute right-1.5 top-1.5 max-w-[52%] truncate rounded-full px-1.5 py-0.5 text-[8px] font-semibold xl:max-2xl:hidden ${needsAttention ? "bg-[#fff5df] text-[#9a6200] ring-1 ring-[#f0d4a8]" : active ? "bg-white text-[#2478df] ring-1 ring-[#c9def7]" : "bg-[#f1f5f9] text-[#7b8798]"}`}
                  >
                    {manufacturingWorkflowGroupStatusLabel(progress.state)}
                  </span>
                ) : null}
                <span className="text-[9px] font-medium text-[#8290a4] !text-[9px] !leading-3 xl:max-2xl:!text-[8px]">
                  {progress
                    ? `${progress.completed}/${progress.applicable} completed`
                    : `${section.views.length} controls`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {setupNeedsReview ? (
        <section
          aria-label="Manufacturing setup actions"
          className="rounded-2xl border border-[#f0d4a8] bg-[#fff9ef] p-2 shadow-[0_4px_16px_rgba(180,112,16,0.06)] xl:max-2xl:p-1"
        >
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
            {readinessQuery.data?.checks
              .filter((check) => check.state === "BLOCKED")
              .slice(0, 4)
              .map((check) => (
                <button
                  key={check.code}
                  type="button"
                  disabled={!check.actionGroup || !check.actionView}
                  title={
                    check.message ?? "Required configuration is incomplete."
                  }
                  aria-label={`${check.label}. ${check.message ?? "Required configuration is incomplete."}${check.actionGroup && check.actionView ? " Open setup." : ""}`}
                  onClick={() => {
                    if (check.actionGroup && check.actionView)
                      openWorkflowTarget(check.actionGroup, check.actionView);
                  }}
                  className="group flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-[#e7c98f] bg-white px-3 py-2 text-left shadow-[0_2px_8px_rgba(146,92,10,0.05)] transition enabled:cursor-pointer enabled:hover:-translate-y-0.5 enabled:hover:border-[#cf952f] enabled:hover:bg-[#fffdf8] enabled:hover:shadow-[0_5px_14px_rgba(146,92,10,0.12)] disabled:cursor-default disabled:opacity-70 xl:max-2xl:min-h-[44px] xl:max-2xl:gap-2 xl:max-2xl:px-2.5 xl:max-2xl:py-1"
                >
                  <span className="min-w-0">
                    <span className="line-clamp-1 block text-[11px] font-semibold text-[#704700] xl:max-2xl:!text-[10px] xl:max-2xl:!leading-3">
                      {check.label}
                    </span>
                    <span className="mt-1 block text-[10px] font-medium leading-3 text-[#a66500] xl:max-2xl:mt-0.5 xl:max-2xl:!text-[9px]">
                      {check.actionGroup && check.actionView
                        ? "Open setup"
                        : "Setup required"}
                    </span>
                  </span>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[#efd7ad] bg-[#fff8eb] text-[#b36d00] transition group-enabled:group-hover:border-[#dca74e] group-enabled:group-hover:bg-[#fff0d2] xl:max-2xl:h-6 xl:max-2xl:w-6">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            <button
              type="button"
              onClick={openFirstSetupAction}
              className="group flex min-h-[56px] items-center justify-between gap-3 rounded-xl border border-[#d76f08] bg-[#ec7909] px-3 py-2 text-left text-white shadow-[0_4px_12px_rgba(190,91,0,0.2)] transition hover:-translate-y-0.5 hover:bg-[#d96c00] hover:shadow-[0_7px_16px_rgba(190,91,0,0.28)] xl:max-2xl:min-h-[44px] xl:max-2xl:gap-2 xl:max-2xl:px-2.5 xl:max-2xl:py-1"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/18 ring-1 ring-white/25 xl:max-2xl:h-6 xl:max-2xl:w-6">
                  <Settings2 className="h-3.5 w-3.5" />
                </span>
                <span className="text-[11px] font-semibold xl:max-2xl:!text-[10px]">
                  {readinessQuery.isError ? "Review setup" : "Complete setup"}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </section>
      ) : null}

      {activeViewWasConfiguredHidden && activeViewWasForcedVisible ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#c9def7] bg-[#f3f8ff] px-4 py-2.5 text-[11px] leading-5 text-[#365d8d]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#2478df]" />
          <span>
            This screen is hidden in the company configuration, but it is
            temporarily visible because the active run or required setup needs
            it. Workflow, stock and accounting controls remain enforced.
          </span>
        </div>
      ) : activeViewIsSafetyFallback ? (
        <div className="flex items-start gap-2 rounded-xl border border-[#f0d4a8] bg-[#fff9ef] px-4 py-2.5 text-[11px] leading-5 text-[#805500]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Every Manufacturing screen was hidden, so the dashboard remains
            visible as a safe route back to Configuration.
          </span>
        </div>
      ) : null}

      <div className="grid gap-3 xl:min-h-0 xl:flex-1 xl:grid-cols-[286px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#cfdeef] bg-white shadow-[0_6px_20px_rgba(30,64,175,0.05)]">
          <div className="border-b border-[#dfe7f0] bg-white px-3.5 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2478df] text-white">
                  <activeGroup.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#8795a8]">
                    Active workflow
                  </div>
                  <div className="text-xs font-semibold leading-4 text-[#203651]">
                    {activeGroup.label}
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-[#e8f2ff] px-2 py-1 text-[9px] font-bold text-[#1767c5]">
                {activeGroupProgress
                  ? `${activeGroupProgress.completed}/${activeGroupProgress.applicable}`
                  : `${activeGroup.views.length} controls`}
              </span>
            </div>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#e5edf6]">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#1f73d8,#68a9f2)] transition-all"
                style={{
                  width: `${activeGroupProgress ? activeGroupCompletionPercent : 0}%`,
                }}
              />
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[9px] font-medium text-[#8290a4]">
              <span>
                {activeGroupProgress
                  ? `${activeGroupProgress.completed} completed · ${activeGroupProgress.notApplicable} N/A`
                  : "Advanced process navigator"}
              </span>
              <span>
                Global step {activeGlobalSerial} of {totalControlledSteps}
              </span>
            </div>
          </div>
          <div
            role="tablist"
            aria-label={`${activeGroup.label} process steps`}
            className="grid max-h-[300px] gap-1 overflow-y-auto bg-[#f8fafc] p-2 sm:grid-cols-2 xl:max-h-none xl:min-h-0 xl:flex-1 xl:grid-cols-1"
          >
            {activeGroup.views.map((view) => {
              const serial = view.flowSerial;
              const runStep = activeRun?.steps.find(
                (step) => step.flowSerial === serial,
              );
              const needsAttention = ["LOCKED", "BLOCKED"].includes(
                runStep?.status ?? "",
              );
              return (
                <button
                  key={view.id}
                  role="tab"
                  aria-selected={activeView === view.id}
                  type="button"
                  onClick={() => openView(activeSection, view.id)}
                  aria-label={`${serial}. ${view.label}${needsAttention ? "; prerequisites need attention" : ""}`}
                  className={`group/step flex min-h-9 w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[11px] font-medium leading-4 transition-all ${activeView === view.id ? "border-[#9bc5f7] bg-white text-[#1459a7] shadow-[0_3px_10px_rgba(37,99,235,0.10)]" : "border-transparent text-[#52647d] hover:border-[#d5e1ef] hover:bg-white hover:text-[#17365e]"}`}
                >
                  <span
                    className={`flex h-5 w-7 shrink-0 items-center justify-center rounded-md text-[9px] font-bold ${activeView === view.id ? "bg-[#2478df] text-white" : "bg-[#e9eff6] text-[#718096] group-hover/step:bg-[#e2eefc] group-hover/step:text-[#2478df]"}`}
                  >
                    {String(serial).padStart(3, "0")}
                  </span>
                  <span className="min-w-0 flex-1">{view.label}</span>
                  {runStep ? (
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[8px] font-bold ${needsAttention ? "bg-[#fff5df] text-[#9a6200]" : "bg-[#eef4fb] text-[#53647b]"}`}
                    >
                      {needsAttention ? (
                        <TriangleAlert className="h-2.5 w-2.5" />
                      ) : null}
                      {manufacturingWorkflowNavigationStatusLabel(
                        runStep.status,
                      )}
                    </span>
                  ) : activeView === view.id ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#2478df]" />
                  ) : null}
                </button>
              );
            })}
          </div>
          <div className="mt-auto border-t border-[#e2e9f1] bg-white px-3 py-2.5 text-center text-[10px] text-[#7b8798]">
            {activeGroup.views.length} enabled workflow steps · defined sequence
          </div>
        </aside>

        {/* Deliberately NOT a flex column. Several workspaces below still carry a
         * `flex-1 min-h-0` root from when this pane stretched them to its own height;
         * as flex items they were squeezed to the visible box and their own
         * `overflow-hidden` cut the rest of the page off with no way to reach it.
         * Stacking them as blocks lets each one take its natural height, so this pane
         * scrolls when a workspace is taller than the viewport and stays still when it
         * is not — the behaviour the dashboard workspace already had. */}
        <main className="min-w-0 space-y-3 xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain xl:pr-1">
          {workflowRunsQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0d4a8] bg-[#fff9ef] px-4 py-3 text-xs text-[#8a5a0a]">
              <span>
                Workflow navigation remains available. Controlled run tracking
                could not be loaded:{" "}
                {workflowActionError(workflowRunsQuery.error)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void workflowRunsQuery.refetch()}
              >
                Retry workflow
              </Button>
            </div>
          ) : null}
          {requestedRunMissing ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c7c1] bg-[#fff7f5] px-4 py-3 text-xs text-[#a33a2b]">
              <span>
                The requested manufacturing run is not available in this
                workspace. No different run was selected automatically.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => openView("dashboard", "manufacturing-dashboard")}
              >
                Open current workflow
              </Button>
            </div>
          ) : null}
          {requestedOccurrenceMissing ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c7c1] bg-[#fff7f5] px-4 py-3 text-xs text-[#a33a2b]">
              <span>
                Occurrence {requestedOccurrenceKey} is not available for this
                workflow step. No workflow action was selected.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  openView(activeSection, activeView, selectedOrderId)
                }
              >
                Open primary occurrence
              </Button>
            </div>
          ) : null}
          {activeRun?.nextAction.state === "BLOCKED" &&
          activeRun.nextAction.blockerReason ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0d4a8] bg-[#fff9ef] px-4 py-3 text-xs text-[#8a5a0a]">
              <span>
                <strong>Workflow advisory:</strong>{" "}
                {activeRun.nextAction.blockerReason}
              </span>
              {activeRun.nextAction.fixingRoute ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const fixingStep = activeRun.nextAction.step;
                    if (fixingStep) openRunStep(fixingStep);
                  }}
                >
                  Open required item
                </Button>
              ) : null}
            </div>
          ) : null}
          {activeRunStep?.missingPrerequisites.length ? (
            <div
              role="status"
              className="rounded-xl border border-[#f0d4a8] bg-[#fff9ef] px-4 py-3 text-xs text-[#7a5310]"
            >
              <div className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#b7791f]" />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    This step needs the following earlier item
                    {activeRunStep.missingPrerequisites.length === 1 ? "" : "s"}
                    :
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {activeRunStep.missingPrerequisites.map((item) => (
                      <button
                        key={`${item.flowSerial}-${item.occurrenceKey}-${item.route}`}
                        type="button"
                        className="rounded-md border border-[#e8c98d] bg-white px-2 py-1 text-left font-medium text-[#805500] hover:border-[#c99538] hover:bg-[#fffaf0]"
                        onClick={() => openRunStep(item)}
                      >
                        {item.flowSerial}. {item.title}
                        {item.occurrenceKey !== "PRIMARY"
                          ? ` [${item.occurrenceKey}]`
                          : ""}
                        {" · currently "}
                        {manufacturingWorkflowNavigationStatusLabel(
                          item.actualStatus,
                        )}
                        ; needs {item.requiredStatus.replaceAll("_", " ")}
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 text-[10px] leading-4 text-[#8a641e]">
                    You can continue browsing every workflow screen. Resolve the
                    applicable item before its controlled action, or use Mark
                    N/A with a reason when that step is optional for this
                    company or run.
                  </div>
                </div>
              </div>
            </div>
          ) : activeRunStep?.blockerReason ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0d4a8] bg-[#fff9ef] px-4 py-3 text-xs text-[#7a5310]"
            >
              <span>
                <strong>Selected-step advisory:</strong>{" "}
                {activeRunStep.blockerReason}
              </span>
              {activeRun?.nextAction.step?.flowSerial ===
                activeRunStep.flowSerial &&
              activeRun.nextAction.step.occurrenceKey ===
                activeRunStep.occurrenceKey &&
              activeRun.nextAction.fixingRoute ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const fixingStep = activeRun.nextAction.step;
                    if (fixingStep) openRunStep(fixingStep);
                  }}
                >
                  Open required item
                </Button>
              ) : null}
            </div>
          ) : null}
          <section className="isolate overflow-visible rounded-xl border border-[#d7e3f0] bg-white px-4 py-3 shadow-[0_3px_12px_rgba(30,64,175,0.04)] max-[1365px]:px-2.5 max-[1365px]:py-2.5">
            {!activeRunStep ? (
              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#60718a]">
                  Active-step audit history
                </div>
                {workflowStepNavigationButtons}
              </div>
            ) : null}
            {activeRunStep ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {!activeStepIsReadOnlyEvidence ? (
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#60718a]">
                        Valid workflow actions
                      </div>
                    {activeStepRequiresSourceRecord &&
                    activeRunStep.status !== "N_A" &&
                    !activeStepIsPendingNaApproval ? (
                      <div className="mt-1 max-w-2xl text-[10px] text-[#60718a]">
                        {activeStepCompletionKind === "APPROVAL"
                          ? "Submit must link an already-persisted Related record; Approve reuses that exact link."
                          : "Complete/Post only reconciles the already-persisted Related record; it does not create or post stock/GL transactions."}
                      </div>
                    ) : null}
                    {activeStepRequiresSourceRecord &&
                    activeRunStep.status !== "N_A" &&
                    !activeStepIsPendingNaApproval &&
                    !activeStepHasSourceRecord ? (
                      <div className="mt-1 text-[10px] font-medium text-[#b42318]">
                        {activeRunStep.status === "PENDING_APPROVAL"
                          ? "Approval is unavailable until the submitted source record type and ID are linked."
                          : "Use an existing saved domain record. The action will request any missing type or ID; it never creates a record."}
                      </div>
                    ) : null}
                    {!hasActiveStepPermission ? (
                      <div className="mt-1 text-[10px] text-[#b42318]">
                        Your role does not grant {activeRunStep.permissionKey}.
                      </div>
                    ) : makerCheckerBlocked ? (
                      <div className="mt-1 text-[10px] text-[#8a5a0a]">
                        Maker-checker control requires another authorised user
                        to approve this submission.
                      </div>
                    ) : activeStepActions.length === 0 ? (
                      <div className="mt-1 text-[10px] text-[#7b8798]">
                        No transition is available while this step is{" "}
                        {manufacturingWorkflowNavigationStatusLabel(
                          activeRunStep.status,
                        )}
                        .
                      </div>
                    ) : null}
                    </div>
                  ) : null}
                  {hasActiveStepPermission &&
                  !activeStepIsReadOnlyEvidence &&
                  (activeStepActions.length || activeRunStep.repeatable) ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeRunStep.repeatable ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={createWorkflowStepOccurrence.isPending}
                          onClick={() => void addRepeatableOccurrence()}
                          className="h-8 text-[11px]"
                        >
                          {createWorkflowStepOccurrence.isPending
                            ? "Adding..."
                            : "Add occurrence"}
                        </Button>
                      ) : null}
                      {activeStepActions.map((action) => (
                        <Button
                          key={action}
                          type="button"
                          size="sm"
                          variant={
                            ["MARK_N_A", "HOLD"].includes(action)
                              ? "outline"
                              : "default"
                          }
                          disabled={
                            transitionWorkflowStep.isPending ||
                            ((action === "APPROVE" || action === "MARK_N_A") &&
                              manufacturingSettingsQuery.isLoading) ||
                            (action === "APPROVE" &&
                              manufacturingSettingsQuery.data
                                ?.approvalRequired === true &&
                              (workflowRunHistoryQuery.isLoading ||
                                workflowRunHistoryQuery.isError))
                          }
                          onClick={() =>
                            void transitionActiveWorkflowStep(action)
                          }
                          className="h-8 text-[11px]"
                        >
                          {transitionWorkflowStep.isPending &&
                          transitionWorkflowStep.variables?.input.action ===
                            action
                            ? "Saving..."
                            : workflowStepActionLabels[action]}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div
                  className={
                    activeStepIsReadOnlyEvidence
                      ? ""
                      : "mt-3 border-t border-[#edf2f7] pt-2.5"
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#60718a]">
                      Active-step audit history
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {workflowRunHistoryQuery.isError ? (
                        <button
                          type="button"
                          className="text-[10px] font-semibold text-[#1767c5]"
                          onClick={() =>
                            void workflowRunHistoryQuery.refetch()
                          }
                        >
                          Retry
                        </button>
                      ) : null}
                      {workflowStepNavigationButtons}
                    </div>
                  </div>
                  {workflowRunHistoryQuery.isLoading ? (
                    <div className="mt-1.5 text-[10px] text-[#7b8798]">
                      Loading audit history...
                    </div>
                  ) : workflowRunHistoryQuery.isError ? (
                    <div className="mt-1.5 text-[10px] text-[#b42318]">
                      Audit history is unavailable.
                    </div>
                  ) : activeStepHistory.length ? (
                    <div className="mt-1.5 grid gap-1.5">
                      {activeStepHistory.map((entry) => (
                        <div
                          key={entry.id}
                          className="rounded-lg bg-[#f7f9fc] px-2.5 py-1.5 text-[10px] text-[#52647d]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                            <span className="font-semibold text-[#29415f]">
                              {entry.sourceAction.replaceAll("_", " ")}:{" "}
                              {manufacturingWorkflowNavigationStatusLabel(
                                entry.fromStatus,
                              )}
                              {" -> "}
                              {manufacturingWorkflowNavigationStatusLabel(
                                entry.toStatus,
                              )}
                            </span>
                            <span>{formatDateTime(entry.createdAt)}</span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                            <span>
                              By {entry.performedByUserId.slice(0, 12)}
                            </span>
                            {entry.reason ? (
                              <span>Reason: {entry.reason}</span>
                            ) : null}
                            {entry.signatureReference ? (
                              <span title={entry.signatureReference}>
                                Server signature:{" "}
                                {entry.signatureReference.slice(0, 16)}
                                ...
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
          {itemsQuery.isError &&
          (isBom ||
            isBlueprintControl ||
            isMaterialsOperational ||
            isIntermediateBulk ||
            isCostReportWorkspace ||
            Boolean(orderPreset) ||
            Boolean(itemProfileRole)) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c7c1] bg-[#fff7f5] px-4 py-3 text-sm text-[#a33a2b]">
              <span>
                Inventory items could not be loaded, so item selectors are
                unavailable.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void itemsQuery.refetch()}
              >
                Retry inventory items
              </Button>
            </div>
          ) : null}
          {warehousesQuery.isError &&
          (isBom ||
            isBlueprintControl ||
            isMaterialsOperational ||
            isSettings ||
            isMrp ||
            supplySuggestionType ||
            isStatusConfiguration ||
            Boolean(orderPreset) ||
            Boolean(availabilityConfig)) ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c7c1] bg-[#fff7f5] px-4 py-3 text-sm text-[#a33a2b]">
              <span>
                Active warehouses could not be loaded, so warehouse selectors
                may be incomplete.
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void warehousesQuery.refetch()}
              >
                Retry warehouses
              </Button>
            </div>
          ) : null}
          {isDashboard ? (
            <ManufacturingDashboardWorkspace
              workspaceId={session?.workspaceId}
              warehouses={warehouses}
              onOpenOrder={(orderId) =>
                openView("orders", "all-production-orders", orderId)
              }
              onOpenTarget={openWorkflowTarget}
            />
          ) : itemProfileRole ? (
            <ManufacturingItemProfilesWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              items={items}
              title={activeViewLabel}
              role={itemProfileRole}
              onCreateInventoryItem={
                itemProfileRole === "FINISHED_GOOD"
                  ? () => go("/masters/inventory?create=product")
                  : undefined
              }
            />
          ) : isIntermediateBulk ? (
            <ManufacturingIntermediateBulkWorkspace
              workspaceId={session?.workspaceId}
              items={items}
            />
          ) : availabilityConfig ? (
            <ManufacturingAvailabilityWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              warehouses={warehouses}
              title={activeViewLabel}
              defaultRole={availabilityConfig.role}
              shortageOnly={availabilityConfig.shortageOnly}
            />
          ) : isBom ? (
            <ManufacturingBomWorkspace
              workspaceId={session?.workspaceId}
              items={items}
              title={activeViewLabel}
            />
          ) : isRouting ? (
            <ManufacturingRoutingWorkspace workspaceId={session?.workspaceId} />
          ) : isPlan ? (
            <ManufacturingPlanWorkspace
              workspaceId={session?.workspaceId}
              onOpenMrp={(planId) =>
                openView("planning", "material-requirement-planning", planId)
              }
            />
          ) : isProductionSchedule ? (
            <ManufacturingProductionScheduleWorkspace
              workspaceId={session?.workspaceId}
            />
          ) : isMrp ? (
            <ManufacturingMrpWorkspace
              key={`${routeKey}/${selectedOrderId ?? ""}`}
              workspaceId={session?.workspaceId}
              warehouses={warehouses}
              initialPlanId={selectedOrderId}
              scenarioMode={activeView === "what-if-production-planning"}
            />
          ) : supplySuggestionType ? (
            <ManufacturingSupplySuggestionsWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              type={supplySuggestionType}
              title={activeViewLabel}
              warehouses={warehouses}
            />
          ) : orderPreset ? (
            <ManufacturingOrdersWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              items={items}
              warehouses={warehouses}
              title={activeViewLabel}
              preset={orderPreset}
              selectedOrderId={selectedOrderId}
              onOpenOrder={openSelectedOrder}
              onCloseOrder={() => openView(activeSection, activeView)}
              onConfigureBom={() => openView("masters", "bom-master-formula")}
              onRunPreflight={() =>
                openView("dashboard", "manufacturing-dashboard")
              }
            />
          ) : isSettings ? (
            <ManufacturingSettingsWorkspace
              workspaceId={session?.workspaceId}
              warehouses={warehouses}
            />
          ) : isMaterialsOperational ? (
            <ManufacturingMaterialsWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              view={activeView}
              title={activeViewLabel}
              items={items}
              warehouses={warehouses}
            />
          ) : isDowntime ? (
            <ManufacturingDowntimeWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
            />
          ) : isExecutionTransfer ? (
            <ManufacturingExecutionTransferWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              view={activeView}
              title={activeViewLabel}
            />
          ) : isSerialPackaging && session?.workspaceId ? (
            <ManufacturingSerialPackagingWorkspace
              key={routeKey}
              workspaceId={session.workspaceId}
              section={activeSection}
              view={activeView}
              title={activeViewLabel}
            />
          ) : isStatusConfiguration ? (
            <ManufacturingStatusConfigurationWorkspace
              workspaceId={session?.workspaceId}
              warehouses={warehouses}
            />
          ) : isCostReportWorkspace ? (
            <ManufacturingCostReportWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              section={activeSection as "masters" | "costing" | "reports"}
              view={activeView}
              title={activeViewLabel}
              items={items}
            />
          ) : isGovernance ? (
            <ManufacturingGovernanceWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              view={activeView}
              title={activeViewLabel}
            />
          ) : isBlueprintControl ? (
            <ManufacturingBlueprintControlsWorkspace
              key={routeKey}
              workspaceId={session?.workspaceId}
              view={activeView}
              title={activeViewLabel}
              items={items}
              warehouses={warehouses}
            />
          ) : (
            <ManufacturingWorkflowReviewWorkspace
              workspaceId={session?.workspaceId}
              group={workflowGroupBySection[activeSection]}
              workflowKey={activeView}
              groupLabel={activeGroup.label}
              title={activeViewLabel}
              icon={activeGroup.icon}
              step={activeGlobalSerial}
              total={totalControlledSteps}
              previousLabel={
                previousOperationalStep?.title ??
                (!activeRun ? previousView?.label : undefined)
              }
              nextLabel={
                activeRun?.nextAction.step?.title ??
                (!activeRun ? nextView?.label : undefined)
              }
              onPrevious={
                previousOperationalStep
                  ? () => openRunStep(previousOperationalStep)
                  : !activeRun && previousView
                    ? () => openView(previousView.section, previousView.id)
                    : undefined
              }
              onNext={
                activeRun?.nextAction.step
                  ? () => openRunStep(activeRun.nextAction.step!)
                  : !activeRun && nextView
                    ? () => openView(nextView.section, nextView.id)
                    : undefined
              }
            />
          )}
          {hasSpecializedWorkspace ? (
            <ManufacturingWorkflowReviewAdjunct
              workspaceId={session?.workspaceId}
              group={workflowGroupBySection[activeSection]}
              workflowKey={activeView}
              title={activeViewLabel}
            />
          ) : null}
        </main>
      </div>
      <ManufacturingNavigationConfigurationDialog
        open={workflowConfigurationOpen}
        onOpenChange={setWorkflowConfigurationOpen}
        groups={workflowConfigurationGroups}
        configuration={workflowConfigurationQuery.data}
        canConfigure={canConfigureManufacturing}
        isSaving={updateWorkflowConfiguration.isPending}
        onSave={(hiddenStepSerials) =>
          void saveWorkflowConfiguration(hiddenStepSerials)
        }
      />
      <Dialog
        open={Boolean(pendingLegacyRunDiscard)}
        onOpenChange={(open) => {
          if (open) return;
          closeLegacyRunDiscardDialog();
        }}
      >
        <DialogContent className="w-[min(92vw,500px)]">
          <DialogTitle className="text-base font-semibold text-[#223754]">
            Cancel legacy empty workflow run?
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-5 text-[#64748b]">
            This never deletes a run. The server will cancel it only if it is
            still an unbound DRAFT with no transitions, posting links, evidence,
            source records, or repeat occurrences.
          </DialogDescription>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void confirmLegacyRunDiscard();
            }}
          >
            <label className="block text-xs font-medium text-[#405671]">
              Cancellation reason
              <Input
                className="mt-1 h-10"
                value={legacyRunDiscardReason}
                maxLength={2000}
                autoFocus
                placeholder="Why is this legacy empty run being cancelled?"
                onChange={(event) =>
                  setLegacyRunDiscardReason(event.target.value)
                }
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={discardEmptyWorkflowRun.isPending}
                onClick={closeLegacyRunDiscardDialog}
              >
                Keep run
              </Button>
              <Button
                type="submit"
                disabled={
                  discardEmptyWorkflowRun.isPending ||
                  !legacyRunDiscardReason.trim()
                }
                className="bg-[#b63d2f] text-white hover:bg-[#982f24]"
              >
                {discardEmptyWorkflowRun.isPending
                  ? "Checking..."
                  : "Cancel empty run"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(pendingSignedTransition)}
        onOpenChange={(open) => {
          if (open) return;
          closeWorkflowSignatureDialog();
        }}
      >
        <DialogContent className="w-[min(92vw,520px)]">
          <DialogTitle className="text-base font-semibold text-[#223754]">
            Apply electronic signature
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs leading-5 text-[#64748b]">
            {pendingSignedTransition
              ? `${workflowStepActionLabels[pendingSignedTransition.input.action as ManufacturingWorkflowStepUiAction]} ${pendingSignedTransition.stepLabel}. The server will validate the approved policy and create the signature reference.`
              : "Validate this controlled manufacturing action."}
          </DialogDescription>
          <form
            className="mt-4 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!pendingSignedTransition) return;
              const signatureContext = workflowElectronicSignatureQuery.data;
              const meaning = workflowSignatureMeaning.trim();
              if (
                !signatureContext ||
                !signatureContext.allowedMeanings.includes(meaning)
              ) {
                toast.error("Select an approved electronic-signature meaning.");
                return;
              }
              if (
                signatureContext.reauthenticationRequired &&
                !workflowReauthenticationPassword
              ) {
                toast.error(
                  "Current password is required for this electronic signature.",
                );
                return;
              }
              void commitWorkflowStepTransition(pendingSignedTransition, {
                meaning,
                reauthenticationPassword:
                  workflowReauthenticationPassword || null,
              });
            }}
          >
            <label className="block text-xs font-medium text-[#405671]">
              Approved signature meaning
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[#cfdaea] bg-white px-3 text-sm text-[#243b57] outline-none focus:border-[#4f8fe8]"
                value={workflowSignatureMeaning}
                onChange={(event) =>
                  setWorkflowSignatureMeaning(event.target.value)
                }
              >
                <option value="">Select approved meaning...</option>
                {(
                  workflowElectronicSignatureQuery.data?.allowedMeanings ?? []
                ).map((meaning) => (
                  <option key={meaning} value={meaning}>
                    {meaning}
                  </option>
                ))}
              </select>
            </label>
            {workflowElectronicSignatureQuery.data?.reauthenticationRequired ? (
              <label className="block text-xs font-medium text-[#405671]">
                Current password
                <Input
                  className="mt-1 h-10"
                  type="password"
                  autoComplete="current-password"
                  value={workflowReauthenticationPassword}
                  onChange={(event) =>
                    setWorkflowReauthenticationPassword(event.target.value)
                  }
                />
              </label>
            ) : null}
            <div className="rounded-lg border border-[#d9e4f0] bg-[#f7faff] px-3 py-2 text-[11px] leading-5 text-[#5d718b]">
              Policy: {workflowElectronicSignatureQuery.data?.policyCode ?? "-"}
              {workflowElectronicSignatureQuery.data?.policyVersion
                ? ` v${workflowElectronicSignatureQuery.data.policyVersion}`
                : ""}
              . Passwords are verified in memory and are never written to
              workflow history.
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={closeWorkflowSignatureDialog}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={transitionWorkflowStep.isPending}>
                {transitionWorkflowStep.isPending
                  ? "Verifying..."
                  : "Verify & sign"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ManufacturingIntermediateBulkWorkspace({
  workspaceId,
  items,
}: {
  workspaceId?: string;
  items: Parameters<typeof ManufacturingItemProfilesWorkspace>[0]["items"];
}) {
  const [role, setRole] = useState<"INTERMEDIATE" | "BULK">("INTERMEDIATE");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#d6e1ef] bg-white p-2">
        <Button
          type="button"
          size="sm"
          variant={role === "INTERMEDIATE" ? "default" : "ghost"}
          onClick={() => setRole("INTERMEDIATE")}
        >
          <Boxes className="h-4 w-4" />
          Intermediate products
        </Button>
        <Button
          type="button"
          size="sm"
          variant={role === "BULK" ? "default" : "ghost"}
          onClick={() => setRole("BULK")}
        >
          <Factory className="h-4 w-4" />
          Bulk products
        </Button>
      </div>
      <ManufacturingItemProfilesWorkspace
        key={role}
        workspaceId={workspaceId}
        items={items}
        title={
          role === "INTERMEDIATE" ? "Intermediate Products" : "Bulk Products"
        }
        role={role}
      />
    </div>
  );
}

function ManufacturingStatusConfigurationWorkspace({
  workspaceId,
  warehouses,
}: {
  workspaceId?: string;
  warehouses: Parameters<
    typeof ManufacturingLocationsWorkspace
  >[0]["warehouses"];
}) {
  const [tab, setTab] = useState<"workflow" | "locations">("workflow");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#d6e1ef] bg-white p-2">
        <Button
          type="button"
          size="sm"
          variant={tab === "workflow" ? "default" : "ghost"}
          onClick={() => setTab("workflow")}
        >
          <Settings2 className="h-4 w-4" />
          Workflow transitions
        </Button>
        <Button
          type="button"
          size="sm"
          variant={tab === "locations" ? "default" : "ghost"}
          onClick={() => setTab("locations")}
        >
          <Warehouse className="h-4 w-4" />
          Logical stock locations
        </Button>
      </div>
      {tab === "workflow" ? (
        <ManufacturingGovernanceWorkspace
          workspaceId={workspaceId}
          view="status-configuration"
          title="Status Configuration"
        />
      ) : (
        <ManufacturingLocationsWorkspace
          workspaceId={workspaceId}
          warehouses={warehouses}
        />
      )}
    </div>
  );
}
