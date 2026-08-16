export type DocumentCategory =
  | "Tender"
  | "Project"
  | "Company"
  | "Financial"
  | "Bank Instrument"
  | "Legal"
  | "Tax & VAT"
  | "Employee / Authorization"
  | "Other";
export type DocumentStatus =
  "Active" | "Expiring Soon" | "Expired" | "Archived" | "Draft" | "Renewed";
export type DocumentModule =
  | "Tender"
  | "Project / CMS"
  | "Expense"
  | "Receipt"
  | "Cash & Bank"
  | "Bank Instrument"
  | "Company"
  | "General";
export interface DocumentVersion {
  id: string;
  version: number;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedBy: string;
  changeNote: string;
  current: boolean;
}
export interface ErpDocument {
  id: string;
  name: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  category: DocumentCategory;
  documentType: string;
  relatedModule: DocumentModule;
  relatedEntityId?: string;
  relatedEntityName?: string;
  tenderId?: string;
  projectStatus?: "Ongoing" | "Archived";
  workCategory?: string;
  organizationName?: string;
  referenceNumber?: string;
  certificateNumber?: string;
  issuingAuthority?: string;
  account?: string;
  amount?: number;
  issueDate?: string;
  expiryDate?: string;
  reminderDays?: number;
  responsiblePerson?: string;
  description?: string;
  tags: string[];
  manualStatus?: "Draft" | "Renewed";
  currentVersion: number;
  versions: DocumentVersion[];
  uploadedBy: string;
  uploadedAt: string;
  updatedAt: string;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: string;
}
export interface DocumentFilters {
  search: string;
  documentType: string;
  category: string;
  module: string;
  related: string;
  organization: string;
  status: string;
  dateFrom: string;
  dateTo: string;
  expiryPeriod: string;
}
export const EMPTY_FILTERS: DocumentFilters = {
  search: "",
  documentType: "",
  category: "",
  module: "",
  related: "",
  organization: "",
  status: "",
  dateFrom: "",
  dateTo: "",
  expiryPeriod: "",
};
const day = (offset: number) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};
const version = (
  id: string,
  fileName: string,
  uploadedAt: string,
  uploadedBy = "Saiful Islam",
  number = 1,
): DocumentVersion => ({
  id: `${id}-v${number}`,
  version: number,
  fileName,
  fileSize: 482000,
  uploadedAt,
  uploadedBy,
  changeNote: number === 1 ? "Initial upload" : "Renewed document",
  current: true,
});
const make = (d: Omit<ErpDocument, "versions" | "updatedAt" | "currentVersion">): ErpDocument => ({
  ...d,
  currentVersion: 1,
  updatedAt: d.uploadedAt,
  versions: [version(d.id, d.fileName, d.uploadedAt, d.uploadedBy)],
});
export const DEMO_DOCUMENTS: ErpDocument[] = [
  make({
    id: "doc-1",
    name: "Trade License 2026",
    fileName: "trade-license-2026.pdf",
    fileType: "application/pdf",
    fileSize: 640000,
    category: "Company",
    documentType: "Trade License",
    relatedModule: "Company",
    organizationName: "Bizovix Engineering Ltd.",
    referenceNumber: "TL/DNCC/2026/1842",
    certificateNumber: "TRAD/DNCC/1842",
    issuingAuthority: "Dhaka North City Corporation",
    issueDate: day(-330),
    expiryDate: day(28),
    reminderDays: 30,
    responsiblePerson: "Saiful Islam",
    description: "Current company trade license.",
    tags: ["license", "compliance"],
    uploadedBy: "Saiful Islam",
    uploadedAt: day(-30),
  }),
  make({
    id: "doc-2",
    name: "TIN Certificate",
    fileName: "tin-certificate.pdf",
    fileType: "application/pdf",
    fileSize: 310000,
    category: "Tax & VAT",
    documentType: "TIN Certificate",
    relatedModule: "Company",
    organizationName: "Bizovix Engineering Ltd.",
    referenceNumber: "TIN-745921638",
    certificateNumber: "745921638",
    issuingAuthority: "National Board of Revenue",
    issueDate: day(-900),
    tags: ["tax", "company"],
    responsiblePerson: "Accounts Manager",
    uploadedBy: "Galib Hasan",
    uploadedAt: day(-160),
  }),
  make({
    id: "doc-3",
    name: "BIN Certificate",
    fileName: "bin-certificate.pdf",
    fileType: "application/pdf",
    fileSize: 355000,
    category: "Tax & VAT",
    documentType: "BIN / VAT Certificate",
    relatedModule: "Company",
    organizationName: "Bizovix Engineering Ltd.",
    certificateNumber: "BIN-001482795",
    issuingAuthority: "National Board of Revenue",
    issueDate: day(-700),
    expiryDate: day(-5),
    reminderDays: 30,
    responsiblePerson: "Accounts Manager",
    tags: ["vat", "compliance"],
    uploadedBy: "Galib Hasan",
    uploadedAt: day(-200),
  }),
  make({
    id: "doc-4",
    name: "Bank Solvency Certificate",
    fileName: "bank-solvency-aug-2026.pdf",
    fileType: "application/pdf",
    fileSize: 270000,
    category: "Financial",
    documentType: "Bank Solvency",
    relatedModule: "Bank Instrument",
    organizationName: "DPHE Patuakhali",
    referenceNumber: "IBBL/SLV/2026/882",
    issueDate: day(-12),
    expiryDate: day(14),
    reminderDays: 15,
    responsiblePerson: "Saiful Islam",
    tags: ["bank", "tender"],
    uploadedBy: "Saiful Islam",
    uploadedAt: day(-12),
  }),
  make({
    id: "doc-5",
    name: "Tender Schedule - 1024587",
    fileName: "tender-schedule-1024587.pdf",
    fileType: "application/pdf",
    fileSize: 2840000,
    category: "Tender",
    documentType: "Tender Schedule",
    relatedModule: "Tender",
    relatedEntityId: "tender-1024587",
    relatedEntityName: "Supply of LED Display at Patuakhali",
    tenderId: "1024587",
    organizationName: "DPHE Patuakhali",
    referenceNumber: "e-GP/1024587",
    issueDate: day(-40),
    expiryDate: day(42),
    reminderDays: 15,
    responsiblePerson: "Mahbubur Rahman",
    tags: ["egp", "schedule"],
    uploadedBy: "Saiful Islam",
    uploadedAt: day(-40),
  }),
  make({
    id: "doc-6",
    name: "Tender Security - 1024587",
    fileName: "tender-security-1024587.jpg",
    fileType: "image/jpeg",
    fileSize: 910000,
    category: "Bank Instrument",
    documentType: "Tender Security Copy",
    relatedModule: "Tender",
    relatedEntityId: "tender-1024587",
    relatedEntityName: "Supply of LED Display at Patuakhali",
    tenderId: "1024587",
    organizationName: "DPHE Patuakhali",
    referenceNumber: "PO-IBBL-88912",
    issueDate: day(-20),
    expiryDate: day(7),
    reminderDays: 7,
    responsiblePerson: "Mahbubur Rahman",
    tags: ["security", "bank"],
    uploadedBy: "Saiful Islam",
    uploadedAt: day(-20),
  }),
  make({
    id: "doc-7",
    name: "NOA - Supply of LED Display at Patuakhali",
    fileName: "noa-led-display.pdf",
    fileType: "application/pdf",
    fileSize: 1250000,
    category: "Project",
    documentType: "NOA",
    relatedModule: "Project / CMS",
    relatedEntityId: "project-led",
    relatedEntityName: "Supply of LED Display at Patuakhali",
    projectStatus: "Ongoing",
    workCategory: "ICT Equipment",
    organizationName: "DPHE Patuakhali",
    referenceNumber: "DPHE/NOA/2026/44",
    issueDate: day(-60),
    tags: ["noa", "project"],
    uploadedBy: "Saiful Islam",
    uploadedAt: day(-60),
  }),
  make({
    id: "doc-8",
    name: "Contract Agreement - LED Display",
    fileName: "contract-led-display.pdf",
    fileType: "application/pdf",
    fileSize: 3440000,
    category: "Project",
    documentType: "Contract Agreement",
    relatedModule: "Project / CMS",
    relatedEntityId: "project-led",
    relatedEntityName: "Supply of LED Display at Patuakhali",
    projectStatus: "Ongoing",
    workCategory: "ICT Equipment",
    organizationName: "DPHE Patuakhali",
    referenceNumber: "DPHE/CON/2026/19",
    issueDate: day(-48),
    expiryDate: day(280),
    reminderDays: 30,
    responsiblePerson: "Project Manager",
    tags: ["contract"],
    uploadedBy: "Saiful Islam",
    uploadedAt: day(-48),
  }),
  make({
    id: "doc-9",
    name: "Running Bill #01",
    fileName: "running-bill-01.xlsx",
    fileType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    fileSize: 520000,
    category: "Financial",
    documentType: "Supplier Bill",
    relatedModule: "Expense",
    relatedEntityId: "expense-41",
    relatedEntityName: "Supply of LED Display at Patuakhali",
    organizationName: "DPHE Patuakhali",
    referenceNumber: "RB-2026-001",
    account: "Project Expense",
    amount: 845000,
    issueDate: day(-8),
    tags: ["bill", "expense"],
    uploadedBy: "Galib Hasan",
    uploadedAt: day(-8),
  }),
  make({
    id: "doc-10",
    name: "Payment Voucher PV-2026-0041",
    fileName: "pv-2026-0041.pdf",
    fileType: "application/pdf",
    fileSize: 195000,
    category: "Financial",
    documentType: "Payment Voucher",
    relatedModule: "Cash & Bank",
    referenceNumber: "PV-2026-0041",
    account: "Islami Bank Current Account",
    amount: 125000,
    issueDate: day(-4),
    tags: ["voucher", "payment"],
    uploadedBy: "Galib Hasan",
    uploadedAt: day(-4),
  }),
  make({
    id: "doc-11",
    name: "Archived Power of Attorney",
    fileName: "power-of-attorney-2024.pdf",
    fileType: "application/pdf",
    fileSize: 430000,
    category: "Legal",
    documentType: "Power of Attorney",
    relatedModule: "Company",
    organizationName: "Bizovix Engineering Ltd.",
    referenceNumber: "POA-2024-09",
    issueDate: day(-600),
    tags: ["legal"],
    uploadedBy: "Saiful Islam",
    uploadedAt: day(-600),
    archivedAt: day(-20),
    archivedBy: "Admin User",
    archiveReason: "Superseded by renewed authorization",
  }),
  make({
    id: "doc-12",
    name: "Experience Certificate - Road Works",
    fileName: "experience-road-works.pdf",
    fileType: "application/pdf",
    fileSize: 870000,
    category: "Tender",
    documentType: "Experience Certificate",
    relatedModule: "Tender",
    relatedEntityName: "Road Rehabilitation Package",
    tenderId: "1009821",
    organizationName: "LGED Barishal",
    referenceNumber: "LGED/EXP/2024/118",
    issueDate: day(-400),
    tags: ["experience"],
    manualStatus: "Draft",
    uploadedBy: "Saiful Islam",
    uploadedAt: day(-3),
  }),
];
export function documentStatus(d: ErpDocument, warning = d.reminderDays ?? 30): DocumentStatus {
  if (d.archivedAt) return "Archived";
  if (d.manualStatus) return d.manualStatus;
  if (!d.expiryDate) return "Active";
  const days = daysUntil(d.expiryDate);
  return days < 0 ? "Expired" : days <= warning ? "Expiring Soon" : "Active";
}
export function daysUntil(date: string) {
  const target = new Date(`${date}T12:00:00`),
    today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 864e5);
}
export function daysRemaining(date?: string) {
  if (!date) return "No Expiry";
  const n = daysUntil(date);
  return n === 0
    ? "Today"
    : n > 0
      ? `${n} Day${n === 1 ? "" : "s"}`
      : `Expired ${Math.abs(n)} Day${n === -1 ? "" : "s"} Ago`;
}
export const fileSize = (bytes: number) =>
  bytes >= 1048576 ? `${(bytes / 1048576).toFixed(2)} MB` : `${Math.ceil(bytes / 1024)} KB`;
export function searchDocument(d: ErpDocument, search: string) {
  const q = search.trim().toLowerCase();
  return (
    !q ||
    [
      d.name,
      d.fileName,
      d.tenderId,
      d.relatedEntityName,
      d.organizationName,
      d.referenceNumber,
      d.certificateNumber,
      d.description,
      ...d.tags,
    ].some((v) => v?.toLowerCase().includes(q))
  );
}
export const DOCUMENT_CATEGORIES: DocumentCategory[] = [
  "Tender",
  "Project",
  "Company",
  "Financial",
  "Bank Instrument",
  "Legal",
  "Tax & VAT",
  "Employee / Authorization",
  "Other",
];
export const DOCUMENT_MODULES: DocumentModule[] = [
  "Tender",
  "Project / CMS",
  "Expense",
  "Receipt",
  "Cash & Bank",
  "Bank Instrument",
  "Company",
  "General",
];
