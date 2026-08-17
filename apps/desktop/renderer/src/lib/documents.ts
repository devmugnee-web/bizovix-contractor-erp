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
  | "Contract"
  | "Running Bill"
  | "Variation Order"
  | "Time Extension"
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
  "Contract",
  "Running Bill",
  "Variation Order",
  "Time Extension",
  "Expense",
  "Receipt",
  "Cash & Bank",
  "Bank Instrument",
  "Company",
  "General",
];
