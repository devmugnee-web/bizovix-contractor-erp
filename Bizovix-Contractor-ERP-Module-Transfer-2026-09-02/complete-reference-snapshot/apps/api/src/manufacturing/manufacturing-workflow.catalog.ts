export const MANUFACTURING_WORKFLOW_DEFINITION_VERSION = 2;

export const MANUFACTURING_MODES = [
  "GENERAL",
  "PHARMACEUTICAL",
  "HYBRID",
] as const;

export const MANUFACTURING_WORKFLOW_PERMISSION_KEYS = [
  "manufacturing.view",
  "manufacturing.configure",
  "manufacturing.master.manage",
  "manufacturing.plan.manage",
  "manufacturing.order.create",
  "manufacturing.order.approve",
  "manufacturing.material.reserve",
  "manufacturing.material.issue",
  "manufacturing.production.execute",
  "manufacturing.quality.manage",
  "manufacturing.quality.inspect",
  "manufacturing.quality.release",
  "manufacturing.packaging.execute",
  "manufacturing.cost.post",
  "manufacturing.close",
  "manufacturing.reports.view",
  "manufacturing.audit.review",
] as const;

export type ManufacturingWorkflowMode = (typeof MANUFACTURING_MODES)[number];
export type ManufacturingWorkflowGroupCode =
  "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K";
export type ManufacturingWorkflowStepType =
  "OPERATIONAL" | "MONITORING" | "APPROVAL" | "POSTING" | "CONTROL" | "REPORT";
export type ManufacturingWorkflowApplicabilityType =
  | "REQUIRED"
  | "CONDITIONAL"
  | "MODE_SPECIFIC"
  | "MONITORING"
  | "PERIODIC"
  | "NOT_APPLICABLE";
export type ManufacturingWorkflowPostingEffect =
  "NONE" | "INVENTORY_ONLY" | "GENERAL_LEDGER_ONLY" | "INVENTORY_AND_GL";
export type ManufacturingWorkflowIdempotencyPolicy =
  "NOT_APPLICABLE" | "REQUIRED";
export type ManufacturingWorkflowDependencyType =
  "HARD" | "CONDITIONAL" | "GROUP_GATE" | "POSTING_PRECONDITION";
export type ManufacturingWorkflowTerminalStatus =
  "APPROVED" | "POSTED" | "COMPLETED";

export interface ManufacturingWorkflowGroupCatalogEntry {
  legacyGroupCode: string;
  flowGroupCode: ManufacturingWorkflowGroupCode;
  name: string;
  flowGroupOrder: number;
  expectedStepCount: number;
  routeSegment: string;
}

export interface ManufacturingWorkflowStepCatalogEntry {
  legacyStepCode: string;
  flowSerial: number;
  flowGroupCode: ManufacturingWorkflowGroupCode;
  title: string;
  displayOrder: number;
  executionOrder: number;
  stepType: ManufacturingWorkflowStepType;
  applicabilityType: ManufacturingWorkflowApplicabilityType;
  repeatable: boolean;
  postingEffect: ManufacturingWorkflowPostingEffect;
  postingDescription: string | null;
  idempotencyPolicy: ManufacturingWorkflowIdempotencyPolicy;
  permissionKey: string;
  route: string;
  completionRule: {
    kind: "APPROVAL" | "DOMAIN_COMPLETION" | "DOMAIN_POSTING" | "OBSERVED";
    requiredStatus: ManufacturingWorkflowTerminalStatus;
  };
  allowedModes: readonly ManufacturingWorkflowMode[];
  isBlocking: boolean;
  isActive: boolean;
}

export interface ManufacturingStepDependencyCatalogEntry {
  stepSerial: number;
  prerequisiteStepSerial: number;
  requiredStatus: ManufacturingWorkflowTerminalStatus;
  dependencyType: ManufacturingWorkflowDependencyType;
  conditionExpression: Record<string, unknown> | null;
}

export const manufacturingWorkflowGroups = [
  {
    legacyGroupCode: "01",
    flowGroupCode: "A",
    name: "Dashboard & Control Center",
    flowGroupOrder: 1,
    expectedStepCount: 7,
    routeSegment: "dashboard",
  },
  {
    legacyGroupCode: "11",
    flowGroupCode: "B",
    name: "Setup, Workflow & Security",
    flowGroupOrder: 2,
    expectedStepCount: 9,
    routeSegment: "setup",
  },
  {
    legacyGroupCode: "02",
    flowGroupCode: "C",
    name: "Products, Formula & Resources",
    flowGroupOrder: 3,
    expectedStepCount: 20,
    routeSegment: "masters",
  },
  {
    legacyGroupCode: "03",
    flowGroupCode: "D",
    name: "Planning, MRP & Scheduling",
    flowGroupOrder: 4,
    expectedStepCount: 12,
    routeSegment: "planning",
  },
  {
    legacyGroupCode: "04",
    flowGroupCode: "E",
    name: "Production Orders & Pre-Production Readiness",
    flowGroupOrder: 5,
    expectedStepCount: 10,
    routeSegment: "orders",
  },
  {
    legacyGroupCode: "05",
    flowGroupCode: "F",
    name: "Raw Material Quality & Material Preparation",
    flowGroupOrder: 6,
    expectedStepCount: 20,
    routeSegment: "materials",
  },
  {
    legacyGroupCode: "06",
    flowGroupCode: "G",
    name: "Production Execution & In-Process Control",
    flowGroupOrder: 7,
    expectedStepCount: 18,
    routeSegment: "execution",
  },
  {
    legacyGroupCode: "07",
    flowGroupCode: "H",
    name: "Finished Product Quality & Compliance",
    flowGroupOrder: 8,
    expectedStepCount: 11,
    routeSegment: "quality",
  },
  {
    legacyGroupCode: "08",
    flowGroupCode: "I",
    name: "Packaging, Finished Goods & QA Release",
    flowGroupOrder: 9,
    expectedStepCount: 20,
    routeSegment: "packaging",
  },
  {
    legacyGroupCode: "09",
    flowGroupCode: "J",
    name: "Costing & Accounts",
    flowGroupOrder: 10,
    expectedStepCount: 16,
    routeSegment: "costing",
  },
  {
    legacyGroupCode: "10",
    flowGroupCode: "K",
    name: "Reports, Audit, Close & Archive",
    flowGroupOrder: 11,
    expectedStepCount: 16,
    routeSegment: "reports",
  },
] as const satisfies readonly ManufacturingWorkflowGroupCatalogEntry[];

const stepRows = [
  [1, "01.01", "Manufacturing Dashboard"],
  [2, "01.02", "Production Control Center"],
  [3, "01.03", "Pending Approvals"],
  [4, "01.04", "Material Shortage Alerts"],
  [5, "01.05", "Quality & Compliance Alerts"],
  [6, "01.06", "Equipment and Calibration Alerts"],
  [7, "01.07", "Batch Release Queue"],
  [8, "11.01", "Manufacturing Settings"],
  [9, "11.02", "Approval Workflow"],
  [10, "11.03", "User Roles and Permissions"],
  [11, "11.04", "Electronic Signature Settings"],
  [12, "11.05", "Document Numbering"],
  [13, "11.06", "Status Configuration"],
  [14, "11.07", "Alert and Notification Rules"],
  [15, "11.08", "Print Templates"],
  [16, "11.09", "Integration Settings"],
  [17, "02.01", "Manufactured Products"],
  [18, "02.02", "Raw Material Master"],
  [19, "02.03", "Packaging Material Master"],
  [20, "02.04", "Intermediate and Bulk Products"],
  [21, "02.09", "Work Centers"],
  [22, "02.10", "Rooms and Production Lines"],
  [23, "02.11", "Equipment and Machines"],
  [24, "02.12", "Tools, Dies and Moulds"],
  [25, "02.20", "Manufacturing Calendar and Shifts"],
  [26, "02.08", "Operations and Process Stages"],
  [27, "02.07", "Production Routing"],
  [28, "02.05", "BOM / Master Formula"],
  [29, "02.06", "Formula Versions"],
  [30, "02.13", "Quality Specifications"],
  [31, "02.14", "Test Methods"],
  [32, "02.15", "Packaging Configurations"],
  [33, "02.16", "Label and Artwork Versions"],
  [34, "02.17", "Batch and Serial Number Rules"],
  [35, "02.19", "Reason Codes"],
  [36, "02.18", "Cost Drivers and Overhead Rules"],
  [37, "03.01", "Demand Plan"],
  [38, "03.02", "Master Production Schedule"],
  [39, "03.11", "Campaign Planning"],
  [40, "03.03", "Material Requirement Planning"],
  [41, "03.07", "Material Availability"],
  [42, "03.08", "Material Shortage"],
  [43, "03.09", "Suggested Purchase Requisition"],
  [44, "03.10", "Suggested Stock Transfer"],
  [45, "03.12", "What-if Production Planning"],
  [46, "03.04", "Production Plan"],
  [47, "03.05", "Capacity Planning"],
  [48, "03.06", "Production Schedule Calendar"],
  [49, "04.01", "All Production Orders"],
  [50, "04.02", "Assembly Production Orders"],
  [51, "04.03", "Pharmaceutical Batch Orders"],
  [52, "04.07", "Subcontract Production Orders"],
  [53, "04.08", "Production Order Approvals"],
  [54, "04.09", "Production Order Amendments"],
  [55, "07.21", "Qualification and Validation"],
  [56, "07.18", "Environmental Monitoring"],
  [57, "07.19", "Water and Utility Monitoring"],
  [58, "07.20", "Cleaning and Line Clearance"],
  [59, "07.01", "Incoming Material Sampling"],
  [60, "07.02", "QC Sample Management"],
  [61, "07.03", "Test Result Entry"],
  [62, "07.04", "Material Release or Rejection"],
  [63, "05.02", "Material Requisition"],
  [64, "05.11", "Batch/Lot Allocation"],
  [65, "05.12", "FEFO Allocation"],
  [66, "05.01", "Material Reservation"],
  [67, "05.06", "Material Staging"],
  [68, "05.04", "Weighing and Dispensing"],
  [69, "05.05", "Dispensing Verification"],
  [70, "05.03", "Material Issue"],
  [71, "05.07", "Material Consumption"],
  [72, "05.08", "Additional Material Issue"],
  [73, "05.09", "Material Substitution"],
  [74, "05.10", "Unused Material Return"],
  [75, "05.13", "Material Reconciliation"],
  [76, "05.14", "Stock Status Transfer"],
  [77, "05.15", "Rejected Material and Destruction"],
  [78, "07.24", "Destruction Approval"],
  [79, "06.01", "Active Production"],
  [80, "06.02", "Electronic Batch Manufacturing Record — eBMR"],
  [81, "06.04", "Operation Execution"],
  [82, "06.05", "Process Parameter Entry"],
  [83, "06.06", "In-process Checks"],
  [84, "07.05", "In-process Quality Control"],
  [85, "06.07", "Stage-wise Yield"],
  [86, "06.08", "WIP Transfer"],
  [87, "06.10", "Partial Production Completion"],
  [88, "07.06", "Bulk Product Testing"],
  [89, "06.09", "Bulk Product Transfer"],
  [90, "06.11", "Downtime Entry"],
  [91, "06.12", "Damage and Scrap"],
  [92, "04.05", "Rework Orders"],
  [93, "04.06", "Reprocessing Orders"],
  [94, "06.13", "Rework and Reprocessing"],
  [95, "06.15", "Operator Handover"],
  [96, "06.14", "Production Completion"],
  [97, "08.09", "Serialisation — Preallocation"],
  [98, "07.07", "Finished Product Testing"],
  [99, "07.11", "Out of Specification — OOS"],
  [100, "07.12", "Out of Trend — OOT"],
  [101, "07.13", "Deviations"],
  [102, "07.14", "CAPA"],
  [103, "07.15", "Change Control"],
  [104, "07.16", "Stability Studies"],
  [105, "07.17", "Retention Samples"],
  [106, "07.22", "Product Quality Review — PQR/APR"],
  [107, "07.23", "Complaints and Recalls"],
  [108, "08.01", "Packaging Plan"],
  [109, "04.04", "Packaging Orders — Order Register"],
  [110, "08.02", "Packaging Order"],
  [111, "06.03", "Batch Packaging Record — eBPR"],
  [112, "08.03", "Packaging Line Clearance"],
  [113, "08.04", "Packaging Material Issue"],
  [114, "08.05", "Coding and Printing"],
  [115, "08.06", "Label Control"],
  [116, "08.07", "Packaging Execution"],
  [117, "08.10", "Parent-child Aggregation"],
  [118, "08.11", "Carton and Shipper Packing"],
  [119, "08.12", "Palletisation"],
  [120, "08.08", "Packaging Reconciliation"],
  [121, "08.13", "Finished Goods Receipt"],
  [122, "08.14", "Finished Goods Quarantine"],
  [123, "07.08", "QA Batch Review"],
  [124, "07.09", "Final Batch Release"],
  [125, "07.10", "Certificate of Analysis"],
  [126, "08.15", "QA Release"],
  [127, "08.16", "Released Finished Goods"],
  [128, "09.01", "Estimated Production Cost"],
  [129, "09.02", "Standard Cost"],
  [130, "09.04", "Material Consumption Cost"],
  [131, "09.05", "Labour Cost"],
  [132, "09.06", "Machine Cost"],
  [133, "09.07", "Factory Overhead"],
  [134, "09.08", "Packaging Cost"],
  [135, "09.09", "Subcontract Cost"],
  [136, "09.10", "WIP Valuation"],
  [137, "09.12", "Yield Loss Cost"],
  [138, "09.13", "Scrap and Rejection Cost"],
  [139, "09.03", "Actual Batch Cost"],
  [140, "09.11", "Production Variance"],
  [141, "09.14", "Cost of Goods Manufactured"],
  [142, "09.15", "Accounting Journal Preview"],
  [143, "09.16", "Posted Manufacturing Journals"],
  [144, "10.01", "Production Reports"],
  [145, "10.02", "Material Reports"],
  [146, "10.03", "WIP Reports"],
  [147, "10.04", "Batch and Lot Reports"],
  [148, "10.05", "Costing Reports"],
  [149, "10.06", "Quality Reports"],
  [150, "10.07", "Compliance Reports"],
  [151, "10.08", "Packaging Reports"],
  [152, "10.09", "Traceability Reports"],
  [153, "10.10", "Executive Analytics"],
  [154, "11.10", "Audit Trail"],
  [155, "11.14", "Validation Documents"],
  [156, "11.11", "Audit Trail Review"],
  [157, "04.10", "Cancelled and Closed Orders"],
  [158, "11.12", "Period Lock"],
  [159, "11.13", "Data Retention and Archive"],
] as const;

const groupForSerial = (flowSerial: number) => {
  const group = manufacturingWorkflowGroups.find((candidate, index) => {
    const start =
      manufacturingWorkflowGroups
        .slice(0, index)
        .reduce((total, row) => total + row.expectedStepCount, 0) + 1;
    return (
      flowSerial >= start && flowSerial < start + candidate.expectedStepCount
    );
  });
  if (!group)
    throw new Error(`No manufacturing group for serial ${flowSerial}.`);
  return group;
};

const serialSet = (...values: Array<number | readonly number[]>) =>
  new Set(values.flatMap((value) => (Array.isArray(value) ? value : [value])));
const range = (start: number, end: number) =>
  Array.from({ length: end - start + 1 }, (_, index) => start + index);

const monitoringSerials = serialSet(range(1, 7), 41, 42, 49, 79, 109, 127, 143);
const reportSerials = serialSet(range(144, 154));
const approvalSerials = serialSet(53, 69, 78, 123, 124, 142, 156, 158);
const periodicSerials = serialSet(104, 105, 106);
const conditionalSerials = serialSet(
  11,
  20,
  39,
  43,
  44,
  45,
  52,
  54,
  55,
  56,
  57,
  72,
  73,
  74,
  77,
  78,
  88,
  89,
  90,
  91,
  92,
  93,
  94,
  95,
  99,
  100,
  101,
  102,
  103,
  107,
  108,
  110,
  112,
  113,
  range(114, 118),
  119,
  120,
  125,
  129,
  131,
  132,
  133,
  134,
  135,
  137,
  138,
  140,
);
// These controls belong to the regulated pharmaceutical/GMP branch.  HYBRID
// deliberately keeps that branch available, while a GENERAL assembly/process
// manufacturer should not be forced through batch-release and GxP records that
// do not apply to its operation.  Core inventory and accounting postings stay
// shared by every mode.
const pharmaceuticalOnlySerials = serialSet(
  7,
  range(55, 62),
  80,
  111,
  range(123, 125),
  155,
);
const modeSpecificSerials = serialSet(50, 51, [...pharmaceuticalOnlySerials]);
const repeatableSerials = serialSet(
  range(59, 78),
  range(81, 95),
  range(98, 107),
  range(110, 126),
  range(130, 140),
);

const postingEffects = new Map<number, ManufacturingWorkflowPostingEffect>([
  [67, "INVENTORY_ONLY"],
  [70, "INVENTORY_AND_GL"],
  [72, "INVENTORY_AND_GL"],
  [74, "INVENTORY_AND_GL"],
  [76, "INVENTORY_ONLY"],
  [77, "INVENTORY_AND_GL"],
  [86, "INVENTORY_ONLY"],
  [89, "INVENTORY_ONLY"],
  [91, "INVENTORY_AND_GL"],
  [113, "INVENTORY_AND_GL"],
  [121, "INVENTORY_AND_GL"],
  [126, "INVENTORY_ONLY"],
  [139, "GENERAL_LEDGER_ONLY"],
]);

const postingDescriptions = new Map<number, string>([
  [67, "Controlled RM-RES to STAGE location transfer; no duplicate GL."],
  [70, "Dr Work in Process / Cr Raw Material Control."],
  [
    72,
    "Dr Work in Process / Cr Raw Material Control for approved additional issue.",
  ],
  [
    74,
    "Controlled unused-material return and reversal of the applicable WIP value.",
  ],
  [
    76,
    "Controlled RM-REL/RM-RES/STAGE/WIP status-location transfer; no duplicate GL.",
  ],
  [
    77,
    "Controlled rejected-material destruction/disposition using actual stock value.",
  ],
  [86, "Controlled WIP location/stage transfer."],
  [89, "Controlled bulk-product location transfer."],
  [91, "Controlled actual-cost scrap disposition."],
  [113, "Dr Work in Process / Cr Packaging Inventory."],
  [
    121,
    "Dr Finished Goods Control / Cr Work in Process; receipt destination FG-Q.",
  ],
  [
    126,
    "FG-Q to FG-R inventory/status transfer; no GL when the ledger is unchanged.",
  ],
  [
    139,
    "Controlled actual-cost finalization journal linked to real source costs.",
  ],
]);

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

function permissionFor(flowSerial: number): string {
  if (flowSerial <= 7) return "manufacturing.view";
  if (flowSerial <= 16)
    return flowSerial === 10
      ? "manufacturing.audit.review"
      : "manufacturing.configure";
  if (flowSerial <= 36) return "manufacturing.master.manage";
  if (flowSerial <= 48) return "manufacturing.plan.manage";
  if (flowSerial <= 58)
    return flowSerial === 53
      ? "manufacturing.order.approve"
      : "manufacturing.order.create";
  if (flowSerial <= 62) return "manufacturing.quality.inspect";
  if (flowSerial <= 69) return "manufacturing.material.reserve";
  if (flowSerial <= 78)
    return flowSerial === 78
      ? "manufacturing.quality.manage"
      : "manufacturing.material.issue";
  if (flowSerial <= 96) return "manufacturing.production.execute";
  if (flowSerial <= 107)
    return flowSerial === 98
      ? "manufacturing.quality.inspect"
      : "manufacturing.quality.manage";
  if (flowSerial <= 122) return "manufacturing.packaging.execute";
  if (flowSerial <= 127) return "manufacturing.quality.release";
  if (flowSerial <= 143) return "manufacturing.cost.post";
  if (flowSerial <= 153) return "manufacturing.reports.view";
  if (flowSerial <= 156) return "manufacturing.audit.review";
  if (flowSerial === 157) return "manufacturing.close";
  return "manufacturing.configure";
}

function allowedModesFor(
  flowSerial: number,
): readonly ManufacturingWorkflowMode[] {
  if (flowSerial === 50) return ["GENERAL", "HYBRID"];
  if (flowSerial === 51) return ["PHARMACEUTICAL", "HYBRID"];
  if (pharmaceuticalOnlySerials.has(flowSerial))
    return ["PHARMACEUTICAL", "HYBRID"];
  return MANUFACTURING_MODES;
}

function applicabilityFor(
  flowSerial: number,
): ManufacturingWorkflowApplicabilityType {
  // Monitoring dashboards and generated reports are evidence surfaces. They
  // must never become manual completion gates for an operational run.
  if (monitoringSerials.has(flowSerial) || reportSerials.has(flowSerial))
    return "MONITORING";
  if (periodicSerials.has(flowSerial)) return "PERIODIC";
  if (conditionalSerials.has(flowSerial)) return "CONDITIONAL";
  if (modeSpecificSerials.has(flowSerial)) return "MODE_SPECIFIC";
  return "REQUIRED";
}

function stepTypeFor(
  flowSerial: number,
  postingEffect: ManufacturingWorkflowPostingEffect,
): ManufacturingWorkflowStepType {
  if (postingEffect !== "NONE") return "POSTING";
  if (monitoringSerials.has(flowSerial)) return "MONITORING";
  if (reportSerials.has(flowSerial)) return "REPORT";
  if (approvalSerials.has(flowSerial)) return "APPROVAL";
  if (flowSerial >= 8 && flowSerial <= 16) return "CONTROL";
  if (flowSerial >= 155) return "CONTROL";
  return "OPERATIONAL";
}

export const manufacturingWorkflowSteps: readonly ManufacturingWorkflowStepCatalogEntry[] =
  stepRows.map(([flowSerial, legacyStepCode, title]) => {
    const group = groupForSerial(flowSerial);
    const groupStart =
      manufacturingWorkflowGroups
        .filter((candidate) => candidate.flowGroupOrder < group.flowGroupOrder)
        .reduce((total, candidate) => total + candidate.expectedStepCount, 0) +
      1;
    const postingEffect = postingEffects.get(flowSerial) ?? "NONE";
    const stepType = stepTypeFor(flowSerial, postingEffect);
    const applicabilityType = applicabilityFor(flowSerial);
    const requiredStatus: ManufacturingWorkflowTerminalStatus =
      postingEffect !== "NONE"
        ? "POSTED"
        : stepType === "APPROVAL"
          ? "APPROVED"
          : "COMPLETED";
    return {
      legacyStepCode,
      flowSerial,
      flowGroupCode: group.flowGroupCode,
      title,
      displayOrder: flowSerial - groupStart + 1,
      executionOrder: flowSerial,
      stepType,
      applicabilityType,
      repeatable: repeatableSerials.has(flowSerial),
      postingEffect,
      postingDescription: postingDescriptions.get(flowSerial) ?? null,
      idempotencyPolicy:
        postingEffect === "NONE" ? "NOT_APPLICABLE" : "REQUIRED",
      permissionKey: permissionFor(flowSerial),
      route: `/app/manufacturing/dashboard?section=${group.routeSegment}&view=${slug(title)}`,
      completionRule: {
        kind:
          postingEffect !== "NONE"
            ? "DOMAIN_POSTING"
            : stepType === "APPROVAL"
              ? "APPROVAL"
              : stepType === "MONITORING" || stepType === "REPORT"
                ? "OBSERVED"
                : "DOMAIN_COMPLETION",
        requiredStatus,
      },
      allowedModes: allowedModesFor(flowSerial),
      isBlocking:
        applicabilityType !== "MONITORING" && applicabilityType !== "PERIODIC",
      isActive: true,
    };
  });

type DependencyRow = readonly [
  stepSerial: number,
  prerequisiteStepSerial: number,
  dependencyType?: ManufacturingWorkflowDependencyType,
];

const dependencyRows: readonly DependencyRow[] = [
  ...range(9, 16).map((serial) => [serial, 8, "HARD"] as const),
  ...range(8, 16).map((serial) => [17, serial, "GROUP_GATE"] as const),
  [22, 21],
  [23, 21],
  [25, 21],
  [26, 21],
  [27, 21],
  [27, 22],
  [27, 23],
  [27, 26],
  [28, 17],
  [28, 18],
  [29, 28],
  [30, 17],
  [31, 30],
  [32, 19],
  [33, 32],
  [34, 17],
  [36, 17],
  [36, 21],
  ...[
    17, 18, 19, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36,
  ].map((serial) => [37, serial, "GROUP_GATE"] as const),
  [38, 37],
  [39, 38, "CONDITIONAL"],
  [40, 38],
  [40, 28],
  [41, 40],
  [42, 41],
  [43, 42, "CONDITIONAL"],
  [44, 42, "CONDITIONAL"],
  [45, 40, "CONDITIONAL"],
  [46, 40],
  [46, 42],
  [47, 46],
  [47, 27],
  [47, 25],
  [48, 46],
  [48, 47],
  [49, 48, "GROUP_GATE"],
  [50, 46],
  [50, 48],
  [51, 46],
  [51, 48],
  [52, 46, "CONDITIONAL"],
  [52, 48, "CONDITIONAL"],
  [53, 46],
  [53, 48],
  [54, 53],
  [55, 53, "CONDITIONAL"],
  [56, 53, "CONDITIONAL"],
  [57, 53, "CONDITIONAL"],
  [58, 53],
  [59, 53, "GROUP_GATE"],
  [59, 58, "GROUP_GATE"],
  [60, 59],
  [61, 60],
  [62, 61],
  [63, 53],
  [63, 62],
  [64, 63],
  [65, 64],
  [66, 63],
  [66, 64],
  [66, 65],
  [67, 66],
  [68, 67],
  [69, 68],
  [70, 69, "POSTING_PRECONDITION"],
  [71, 70],
  [72, 70, "CONDITIONAL"],
  [73, 66, "CONDITIONAL"],
  [74, 70, "CONDITIONAL"],
  [75, 70],
  [75, 71],
  [76, 70],
  [77, 62, "CONDITIONAL"],
  [78, 77, "CONDITIONAL"],
  [79, 70, "GROUP_GATE"],
  [80, 70],
  [81, 70],
  [81, 58],
  [82, 81],
  [83, 82],
  [84, 83],
  [85, 83],
  [85, 84],
  [86, 85],
  [87, 86],
  [88, 87, "CONDITIONAL"],
  [89, 88, "CONDITIONAL"],
  [90, 81, "CONDITIONAL"],
  [91, 81, "CONDITIONAL"],
  [92, 91, "CONDITIONAL"],
  [93, 91, "CONDITIONAL"],
  [94, 91, "CONDITIONAL"],
  [95, 81, "CONDITIONAL"],
  [96, 75],
  [96, 81],
  [96, 83],
  [96, 84],
  [96, 85],
  [97, 96, "GROUP_GATE"],
  [98, 97],
  [99, 98, "CONDITIONAL"],
  [100, 98, "CONDITIONAL"],
  [101, 98, "CONDITIONAL"],
  [102, 101, "CONDITIONAL"],
  [103, 101, "CONDITIONAL"],
  [104, 98, "CONDITIONAL"],
  [105, 98, "CONDITIONAL"],
  [106, 98, "CONDITIONAL"],
  [107, 98, "CONDITIONAL"],
  [108, 98, "GROUP_GATE"],
  [109, 108],
  [110, 108],
  [111, 110],
  [112, 110],
  [113, 112, "POSTING_PRECONDITION"],
  [114, 113],
  [115, 114],
  [116, 115],
  [117, 116],
  [118, 117],
  [119, 118, "CONDITIONAL"],
  [120, 113],
  [120, 115],
  [120, 116],
  [121, 120, "POSTING_PRECONDITION"],
  [121, 98],
  [122, 121],
  [123, 121],
  [123, 98],
  [124, 123],
  [125, 124, "CONDITIONAL"],
  [126, 121, "POSTING_PRECONDITION"],
  [126, 124],
  [127, 126],
  [128, 127, "GROUP_GATE"],
  [129, 128, "CONDITIONAL"],
  [130, 70],
  [130, 121],
  ...range(131, 138).map((serial) => [serial, 130, "CONDITIONAL"] as const),
  [139, 130],
  [139, 136],
  [139, 121],
  [140, 139, "CONDITIONAL"],
  [141, 139],
  [142, 141],
  [143, 142],
  ...range(144, 154).map((serial) => [serial, 143, "GROUP_GATE"] as const),
  [155, 143],
  [156, 155],
  [157, 143],
  [157, 156],
  [158, 155],
  [158, 156],
  [158, 157],
  [159, 158],
];

const stepBySerial = new Map(
  manufacturingWorkflowSteps.map((step) => [step.flowSerial, step]),
);

export const manufacturingStepDependencies: readonly ManufacturingStepDependencyCatalogEntry[] =
  dependencyRows.map(
    ([stepSerial, prerequisiteStepSerial, dependencyType = "HARD"]) => {
      const prerequisite = stepBySerial.get(prerequisiteStepSerial);
      if (!prerequisite)
        throw new Error(
          `Unknown manufacturing prerequisite serial ${prerequisiteStepSerial}.`,
        );
      return {
        stepSerial,
        prerequisiteStepSerial,
        requiredStatus: prerequisite.completionRule.requiredStatus,
        dependencyType,
        conditionExpression:
          dependencyType === "CONDITIONAL"
            ? { whenStepApplicable: stepSerial }
            : null,
      };
    },
  );
