// Tender Costing has no backend yet — this whole page is a new UI-only module
// (unlike Tender List, which reads real data). All rows below are structured
// mock data. The first 10 rows match the reference design's sample data
// exactly; the remaining rows are generated deterministically (hashed on row
// index, not Math.random()) so pagination/sorting/filtering stay stable
// across re-renders instead of reshuffling on every render.

export type CostingStatus = "Completed" | "In Progress" | "Pending";

export interface CostingAssignee {
  name: string;
  initial: string;
  color: string;
}

export const COSTING_ASSIGNEES: CostingAssignee[] = [
  { name: "Naimul Islam", initial: "N", color: "#2563EB" },
  { name: "Rokon Hossain", initial: "R", color: "#F97316" },
  { name: "Samiul Islam", initial: "S", color: "#64748B" },
  { name: "Mithun Roy", initial: "M", color: "#DC2626" },
  { name: "Arifur Rahman", initial: "A", color: "#3B82F6" },
];

export const COSTING_ORGANIZATIONS = ["DPHE", "BUP", "CAAB", "LGED", "WASA", "SREDA", "PWD", "BTV", "BCMCL"];

export const COSTING_STATUS_OPTIONS: CostingStatus[] = ["Completed", "In Progress", "Pending"];

export interface TenderCostingRow {
  id: string;
  tenderId: string;
  workName: string;
  organization: string;
  estimatedValue: number;
  estimatedCost: number;
  ourCost: number;
  marginPercent: number;
  status: CostingStatus;
  assignedTo: CostingAssignee;
  lastUpdated: string;
}

const SAMPLE_ROWS: TenderCostingRow[] = [
  {
    id: "TDR-2024-1258",
    tenderId: "TDR-2024-1258",
    workName: "Supply of LED Display System",
    organization: "DPHE",
    estimatedValue: 1_250_000,
    estimatedCost: 1_180_000,
    ourCost: 1_080_000,
    marginPercent: 5.6,
    status: "Completed",
    assignedTo: COSTING_ASSIGNEES[0]!,
    lastUpdated: "2024-05-29",
  },
  {
    id: "TDR-2024-1257",
    tenderId: "TDR-2024-1257",
    workName: "PA System for Conference Room",
    organization: "BUP",
    estimatedValue: 850_000,
    estimatedCost: 810_000,
    ourCost: 790_000,
    marginPercent: 7.06,
    status: "Completed",
    assignedTo: COSTING_ASSIGNEES[1]!,
    lastUpdated: "2024-05-30",
  },
  {
    id: "TDR-2024-1256",
    tenderId: "TDR-2024-1256",
    workName: "Access Control System",
    organization: "CAAB",
    estimatedValue: 680_000,
    estimatedCost: 650_000,
    ourCost: 630_000,
    marginPercent: 7.35,
    status: "In Progress",
    assignedTo: COSTING_ASSIGNEES[2]!,
    lastUpdated: "2024-05-28",
  },
  {
    id: "TDR-2024-1255",
    tenderId: "TDR-2024-1255",
    workName: "ICT Equipment Supply",
    organization: "LGED",
    estimatedValue: 2_100_000,
    estimatedCost: 2_000_000,
    ourCost: 1_950_000,
    marginPercent: 7.14,
    status: "In Progress",
    assignedTo: COSTING_ASSIGNEES[3]!,
    lastUpdated: "2024-05-27",
  },
  {
    id: "TDR-2024-1254",
    tenderId: "TDR-2024-1254",
    workName: "Solar Power System",
    organization: "WASA",
    estimatedValue: 1_750_000,
    estimatedCost: 1_670_000,
    ourCost: 1_620_000,
    marginPercent: 7.43,
    status: "Pending",
    assignedTo: COSTING_ASSIGNEES[4]!,
    lastUpdated: "2024-05-26",
  },
  {
    id: "TDR-2024-1253",
    tenderId: "TDR-2024-1253",
    workName: "UPS System Supply",
    organization: "SREDA",
    estimatedValue: 950_000,
    estimatedCost: 910_000,
    ourCost: 880_000,
    marginPercent: 7.37,
    status: "Pending",
    assignedTo: COSTING_ASSIGNEES[0]!,
    lastUpdated: "2024-05-24",
  },
  {
    id: "TDR-2024-1252",
    tenderId: "TDR-2024-1252",
    workName: "Electrical Works at Office Building",
    organization: "PWD",
    estimatedValue: 3_450_000,
    estimatedCost: 3_250_000,
    ourCost: 3_050_000,
    marginPercent: 11.59,
    status: "Completed",
    assignedTo: COSTING_ASSIGNEES[1]!,
    lastUpdated: "2024-05-22",
  },
  {
    id: "TDR-2024-1251",
    tenderId: "TDR-2024-1251",
    workName: "Conference System Supply",
    organization: "BTV",
    estimatedValue: 620_000,
    estimatedCost: 580_000,
    ourCost: 560_000,
    marginPercent: 9.68,
    status: "In Progress",
    assignedTo: COSTING_ASSIGNEES[2]!,
    lastUpdated: "2024-05-21",
  },
  {
    id: "TDR-2024-1250",
    tenderId: "TDR-2024-1250",
    workName: "Networking Equipment Supply",
    organization: "BCMCL",
    estimatedValue: 1_320_000,
    estimatedCost: 1_250_000,
    ourCost: 1_190_000,
    marginPercent: 9.85,
    status: "In Progress",
    assignedTo: COSTING_ASSIGNEES[3]!,
    lastUpdated: "2024-05-20",
  },
  {
    id: "TDR-2024-1249",
    tenderId: "TDR-2024-1249",
    workName: "Generator Supply and Installation",
    organization: "WASA",
    estimatedValue: 890_000,
    estimatedCost: 850_000,
    ourCost: 820_000,
    marginPercent: 7.87,
    status: "Pending",
    assignedTo: COSTING_ASSIGNEES[4]!,
    lastUpdated: "2024-05-18",
  },
];

const WORK_TEMPLATES = [
  "Supply of Office Furniture",
  "CCTV Surveillance Installation",
  "Water Treatment Plant Supply",
  "Road Marking & Signage",
  "Boundary Wall Construction",
  "Fire Alarm System Installation",
  "Elevator Supply & Installation",
  "Network Cabling & Switching",
  "Drainage Improvement Works",
  "Air Conditioning System Supply",
  "Solar Street Light Installation",
  "Perimeter Fencing Works",
  "Computer Lab Setup",
  "Bridge Repair & Maintenance",
  "Public Address System Upgrade",
  "Overhead Water Tank Construction",
  "Substation Equipment Supply",
  "Landscaping & Horticulture Works",
  "Transformer Installation",
  "School Building Renovation",
];

// Integer hash (Thomas Wang mix) rather than a string hash: a simple
// `hash*31 + charCode` string hash has poor avalanche for sequential inputs
// like "value-0", "value-1", ... (they differ by ~1 in the output), which
// clustered generated values together instead of spreading them.
function hashSeed(index: number, salt: number): number {
  let x = (index * 7919 + salt) | 0;
  x = (((x >> 16) ^ x) * 0x45d9f3b) | 0;
  x = (((x >> 16) ^ x) * 0x45d9f3b) | 0;
  x = (x >> 16) ^ x;
  return Math.abs(x);
}

const STATUS_SALT = 101;
const VALUE_SALT = 211;
const MARGIN_SALT = 307;
const COST_SALT = 401;
const DAYS_SALT = 503;
const WORK_SALT = 601;
const ORG_SALT = 701;
const ASSIGNEE_SALT = 809;

const TOTAL_ROWS = 68;
const COMPLETED_COUNT = 28;
const IN_PROGRESS_COUNT = 24;
const PENDING_COUNT = 16;
const EXTRA_COUNT = TOTAL_ROWS - SAMPLE_ROWS.length;
// Total Estimated Value KPI = BDT 125.68 Cr; sample rows already sum to 13,860,000.
const TARGET_TOTAL_VALUE = 1_256_800_000;
const EXTRA_TARGET_VALUE = TARGET_TOTAL_VALUE - SAMPLE_ROWS.reduce((sum, row) => sum + row.estimatedValue, 0);

const sampleStatusCounts = SAMPLE_ROWS.reduce(
  (acc, row) => ({ ...acc, [row.status]: acc[row.status] + 1 }),
  { Completed: 0, "In Progress": 0, Pending: 0 } as Record<CostingStatus, number>,
);

const extraStatusPool: CostingStatus[] = [
  ...Array.from({ length: COMPLETED_COUNT - sampleStatusCounts.Completed }, () => "Completed" as const),
  ...Array.from({ length: IN_PROGRESS_COUNT - sampleStatusCounts["In Progress"] }, () => "In Progress" as const),
  ...Array.from({ length: PENDING_COUNT - sampleStatusCounts.Pending }, () => "Pending" as const),
]
  .map((status, i) => ({ status, sortKey: hashSeed(i, STATUS_SALT) }))
  .sort((a, b) => a.sortKey - b.sortKey)
  .map((x) => x.status);

const extraBaseValues = Array.from({ length: EXTRA_COUNT }, (_, i) => 500_000 + (hashSeed(i, VALUE_SALT) % 4_000_000));
const extraBaseSum = extraBaseValues.reduce((a, b) => a + b, 0);
const valueScale = EXTRA_TARGET_VALUE / extraBaseSum;

let runningValueSum = 0;
const extraRows: TenderCostingRow[] = Array.from({ length: EXTRA_COUNT }, (_, i) => {
  const tenderNumber = 1248 - i;
  const tenderId = `TDR-2024-${tenderNumber}`;
  const isLast = i === EXTRA_COUNT - 1;
  const estimatedValue = isLast
    ? EXTRA_TARGET_VALUE - runningValueSum
    : Math.round((extraBaseValues[i]! * valueScale) / 10_000) * 10_000;
  if (!isLast) runningValueSum += estimatedValue;

  const marginPercent = Number((5 + (hashSeed(i, MARGIN_SALT) % 700) / 100).toFixed(2));
  const ourCost = Math.round(estimatedValue * (1 - marginPercent / 100));
  const costFactor = 0.3 + (hashSeed(i, COST_SALT) % 40) / 100;
  const estimatedCost = Math.round(ourCost + (estimatedValue - ourCost) * costFactor);

  const cumulativeDays = 1 + i * 3 + (hashSeed(i, DAYS_SALT) % 3);
  const lastUpdated = new Date(2024, 4, 17);
  lastUpdated.setDate(lastUpdated.getDate() - cumulativeDays);

  return {
    id: tenderId,
    tenderId,
    workName: WORK_TEMPLATES[hashSeed(i, WORK_SALT) % WORK_TEMPLATES.length]!,
    organization: COSTING_ORGANIZATIONS[hashSeed(i, ORG_SALT) % COSTING_ORGANIZATIONS.length]!,
    estimatedValue,
    estimatedCost,
    ourCost,
    marginPercent,
    status: extraStatusPool[i]!,
    assignedTo: COSTING_ASSIGNEES[hashSeed(i, ASSIGNEE_SALT) % COSTING_ASSIGNEES.length]!,
    lastUpdated: lastUpdated.toISOString().slice(0, 10),
  };
});

export const TENDER_COSTING_ROWS: TenderCostingRow[] = [...SAMPLE_ROWS, ...extraRows];

export const TENDER_COSTING_TOTAL_VALUE = TENDER_COSTING_ROWS.reduce((sum, row) => sum + row.estimatedValue, 0);
