"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleX,
  CloudUpload,
  Download,
  Eye,
  FileBadge2,
  FileDown,
  FileSpreadsheet,
  FileText,
  Hourglass,
  Info,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  ApiError,
  downloadDocument as downloadStoredDocument,
  useAddDocumentVersion,
  useCmsWorks,
  useCreateDocument,
  useCreateVatTaxCertificate,
  useExportVatTaxCertificates,
  useMe,
  useRecentVatTaxCertificates,
  useUpdateVatTaxCertificate,
  useVatTaxCertificate,
  useVatTaxCertificates,
  useVatTaxCertificateStats,
} from "@bizovix/api-client";
import type {
  CreateVatTaxCertificateInput,
  VatTaxCertificateRecord,
  VatTaxCertificateStatus,
  VatTaxCertificateStatusFilter,
  VatTaxCertificateType,
} from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { formatAmount } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type CertificateType = VatTaxCertificateType;
type CertificateStatus = VatTaxCertificateStatus;
type CertificateTab =
  | "All Certificates"
  | "Issued"
  | "Under Processing"
  | "Pending / Not Issued"
  | "Rejected / Returned";

interface CertificateRow {
  id: string;
  tid: string;
  project: string;
  type: CertificateType;
  certificateNo: string | null;
  applicationDate: string | null;
  issueDate: string | null;
  validTill: string | null;
  amount: number | null;
  status: CertificateStatus;
  record: VatTaxCertificateRecord;
}

interface AppliedFilters {
  type: "" | CertificateType;
  search: string;
  dateFrom: string;
  dateTo: string;
}

function currentFinancialYear() {
  const today = new Date();
  const calendarYear = today.getUTCFullYear();
  const startYear = today.getUTCMonth() >= 6 ? calendarYear : calendarYear - 1;
  const endYear = startYear + 1;
  return {
    value: `fy-${startYear}-${String(endYear).slice(-2)}`,
    label: `This Financial Year (FY ${startYear}-${String(endYear).slice(-2)})`,
    from: `${startYear}-07-01`,
    to: `${endYear}-06-30`,
  };
}

const CURRENT_FINANCIAL_YEAR = currentFinancialYear();
const DEFAULT_DATE_FROM = CURRENT_FINANCIAL_YEAR.from;
const DEFAULT_DATE_TO = CURRENT_FINANCIAL_YEAR.to;
const PAGE_SIZE = 10;
const TABS: CertificateTab[] = [
  "All Certificates",
  "Issued",
  "Under Processing",
  "Pending / Not Issued",
  "Rejected / Returned",
];

const STATUS_CLASS: Record<CertificateStatus, string> = {
  ISSUED: "bg-[#e8f8ec] text-[#249b4a]",
  UNDER_PROCESSING: "bg-[#f1eafe] text-[#7047d9]",
  PENDING: "bg-[#fff3df] text-[#d98111]",
  NOT_ISSUED: "bg-[#fff0f1] text-[#d83b4b]",
  REJECTED: "bg-[#fff0f1] text-[#d83b4b]",
  RETURNED: "bg-[#fff0f1] text-[#d83b4b]",
};

const STATUS_LABEL: Record<CertificateStatus, string> = {
  ISSUED: "Issued",
  UNDER_PROCESSING: "Under Processing",
  PENDING: "Pending",
  NOT_ISSUED: "Not Issued",
  REJECTED: "Rejected",
  RETURNED: "Returned",
};

const TAB_STATUS: Record<CertificateTab, VatTaxCertificateStatusFilter | undefined> = {
  "All Certificates": undefined,
  Issued: "ISSUED",
  "Under Processing": "UNDER_PROCESSING",
  "Pending / Not Issued": "PENDING_NOT_ISSUED",
  "Rejected / Returned": "REJECTED_RETURNED",
};

const EMPTY_STATS = {
  total: 0,
  vat: 0,
  tax: 0,
  issued: 0,
  underProcessing: 0,
  pendingNotIssued: 0,
  rejectedReturned: 0,
  totalAmount: "0.00",
  issuedAmount: "0.00",
  underProcessingAmount: "0.00",
  pendingNotIssuedAmount: "0.00",
  rejectedReturnedAmount: "0.00",
};

const CONTROL_CLASS =
  "h-[35px] w-full rounded-[5px] border border-[#dbe3ef] bg-white px-3 text-[10px] font-medium text-[#10244c] outline-none transition focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10";

function formatMoney(value: number) {
  return formatAmount(value);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
}

function mapCertificate(record: VatTaxCertificateRecord): CertificateRow {
  return {
    id: record.id,
    tid: record.tender?.egpTenderId ?? "-",
    project: record.cmsWork.workName,
    type: record.certificateType,
    certificateNo: record.certificateNo,
    applicationDate: record.applicationDate,
    issueDate: record.issueDate,
    validTill: record.validTill,
    amount: record.amount === null ? null : Number(record.amount),
    status: record.status,
    record,
  };
}

function errorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Something went wrong. Please try again.";
}

function percentage(value: number, total: number) {
  return total ? `${((value / total) * 100).toFixed(2)}%` : "0.00%";
}

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function downloadCsv(fileName: string, rows: Array<Array<string | number>>) {
  const content = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadText(fileName: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "blue" | "green" | "purple" | "orange" | "red";
}) {
  const tones = {
    blue: "bg-[#e8f2ff] text-[#0b67e8]",
    green: "bg-[#e8f8ed] text-[#28a655]",
    purple: "bg-[#f0e9ff] text-[#754be2]",
    orange: "bg-[#fff2df] text-[#f39a19]",
    red: "bg-[#fff0f1] text-[#e34453]",
  };

  return (
    <div className="flex h-[78px] min-w-0 items-center rounded-[7px] border border-[#dfe6f1] bg-white px-3 shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
      <span
        className={cn(
          "flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full",
          tones[tone],
        )}
      >
        <Icon className="h-[19px] w-[19px]" />
      </span>
      <span className="ml-2.5 min-w-0">
        <span className="block truncate text-[9px] font-semibold text-[#21385f]" title={label}>
          {label}
        </span>
        <span className="mt-1 block text-[17px] font-bold leading-none text-[#071b49]">
          {value}
        </span>
        <span className="mt-1 block truncate text-[8.5px] text-[#62728d]">{helper}</span>
      </span>
    </div>
  );
}

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

function DonutChart({ total, segments }: { total: number; segments: DonutSegment[] }) {
  let used = 0;
  const gradient = segments
    .map((segment) => {
      const start = total ? (used / total) * 100 : 0;
      used += segment.value;
      const end = total ? (used / total) * 100 : 0;
      return `${segment.color} ${start}% ${end}%`;
    })
    .join(", ");

  return (
    <div
      className="relative h-[112px] w-[112px] shrink-0 rounded-full"
      style={{ background: total ? `conic-gradient(${gradient})` : "#e7edf5" }}
      role="img"
      aria-label={`${total} certificates in total`}
    >
      <span className="absolute inset-[19px] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-[inset_0_0_0_1px_rgba(219,227,239,0.7)]">
        <strong className="text-[19px] leading-none text-[#071b49]">{total}</strong>
        <span className="mt-1 text-[9px] font-semibold text-[#425679]">Total</span>
      </span>
    </div>
  );
}

function ChartCard({
  title,
  total,
  segments,
}: {
  title: string;
  total: number;
  segments: DonutSegment[];
}) {
  return (
    <section className="min-h-[170px] rounded-[7px] border border-[#dfe6f1] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
      <h2 className="text-[11px] font-bold text-[#10244c]">{title}</h2>
      <div className="mt-2 flex items-center gap-4">
        <DonutChart total={total} segments={segments} />
        <ul className="min-w-0 flex-1 space-y-2">
          {segments.map((segment) => (
            <li key={segment.label} className="flex min-w-0 items-center gap-2 text-[9px]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
              />
              <span className="min-w-0 flex-1 truncate font-medium text-[#253b62]">
                {segment.label}
              </span>
              <span className="shrink-0 font-semibold text-[#10244c]">
                {segment.value} ({percentage(segment.value, total)})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-[25px] w-[25px] items-center justify-center rounded-[4px] border border-[#dce4ef] bg-white text-[#223c66] transition hover:border-[#0b63e5] hover:text-[#0b63e5]"
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: CertificateStatus }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-[4px] px-2 py-[4px] text-[8px] font-semibold leading-none",
        STATUS_CLASS[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

async function downloadAttachment(documentId: string, fallbackName: string) {
  const result = await downloadStoredDocument(documentId);
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = result.fileName ?? fallbackName;
  link.click();
  URL.revokeObjectURL(url);
}

function CertificateViewDialog({
  row,
  canDownload,
  onClose,
}: {
  row: CertificateRow;
  canDownload: boolean;
  onClose: () => void;
}) {
  const detail = useVatTaxCertificate(row.id);
  const record = detail.data ?? row.record;
  const [downloadError, setDownloadError] = React.useState("");
  const [downloadingId, setDownloadingId] = React.useState("");

  async function handleDownload(documentId: string, fileName: string | null) {
    setDownloadError("");
    setDownloadingId(documentId);
    try {
      await downloadAttachment(documentId, fileName ?? "vat-tax-certificate");
    } catch (error) {
      setDownloadError(errorMessage(error));
    } finally {
      setDownloadingId("");
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b49]/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Certificate details"
    >
      <div className="w-full max-w-[520px] rounded-[8px] border border-[#dce4ef] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e8f1] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-[#071b49]">
              {record.certificateNo ?? "VAT-Tax Certificate"}
            </h2>
            <p className="mt-1 text-[11px] text-[#60718e]">
              {record.tender?.egpTenderId ?? "No Tender ID"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close certificate details">
            <X className="h-5 w-5" />
          </button>
        </div>
        {detail.isError && (
          <p className="mx-5 mt-4 rounded-[5px] bg-[#fff0f1] px-3 py-2 text-[10px] text-[#b72f3d]">
            Latest certificate details could not be loaded. Showing the list information.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 p-5 text-[11px]">
          {[
            ["Project", record.cmsWork.workName],
            ["Certificate Type", record.certificateType],
            ["Application Date", formatDate(record.applicationDate)],
            ["Issue Date", formatDate(record.issueDate)],
            ["Valid Till", formatDate(record.validTill)],
            ["Amount (BDT)", record.amount === null ? "-" : formatMoney(Number(record.amount))],
            ["Issuing Authority", record.issuingAuthority ?? "-"],
            ["Status", STATUS_LABEL[record.status]],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-[#71819b]">{label}</dt>
              <dd className="mt-1 font-semibold text-[#10244c]">{value}</dd>
            </div>
          ))}
        </dl>
        {record.remarks && (
          <div className="mx-5 mb-4 rounded-[5px] border border-[#e2e8f1] bg-[#fbfcfe] px-3 py-2 text-[10px] text-[#40577f]">
            <span className="font-semibold text-[#10244c]">Remarks: </span>{record.remarks}
          </div>
        )}
        <div className="border-t border-[#e2e8f1] px-5 py-4">
          <h3 className="text-[10px] font-bold text-[#10244c]">Attachments</h3>
          <div className="mt-2 space-y-2">
            {record.documents.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-[5px] border border-[#e2e8f1] px-3 py-2 text-[10px]"
              >
                <span className="min-w-0 truncate text-[#40577f]">{item.fileName ?? item.name}</span>
                {canDownload && (
                  <button
                    type="button"
                    disabled={downloadingId === item.id}
                    onClick={() => void handleDownload(item.id, item.fileName)}
                    className="inline-flex h-[27px] shrink-0 items-center gap-1.5 rounded-[4px] border border-[#cddbed] px-2.5 font-semibold text-[#0765e9] disabled:opacity-60"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {downloadingId === item.id ? "Downloading..." : "Download"}
                  </button>
                )}
              </div>
            ))}
            {!record.documents.length && (
              <p className="rounded-[5px] bg-[#f7f9fc] px-3 py-3 text-center text-[9px] text-[#71819b]">
                No attachment uploaded.
              </p>
            )}
            {downloadError && <p className="text-[9px] text-[#c23b49]">{downloadError}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CertificateFormState {
  cmsWorkId: string;
  certificateType: CertificateType;
  status: CertificateStatus;
  applicationDate: string;
  certificateNo: string;
  issueDate: string;
  validTill: string;
  amount: string;
  issuingAuthority: string;
  remarks: string;
}

function toDateInput(value: string | null | undefined) {
  return value?.slice(0, 10) ?? "";
}

function initialCertificateForm(row: CertificateRow | null, defaultWorkId: string): CertificateFormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    cmsWorkId: row?.record.cmsWorkId ?? defaultWorkId,
    certificateType: row?.type ?? "VAT",
    status: row?.status ?? "PENDING",
    applicationDate: toDateInput(row?.applicationDate) || today,
    certificateNo: row?.certificateNo ?? "",
    issueDate: toDateInput(row?.issueDate),
    validTill: toDateInput(row?.validTill),
    amount: row?.amount === null || row?.amount === undefined ? "" : String(row.amount),
    issuingAuthority: row?.record.issuingAuthority ?? "",
    remarks: row?.record.remarks ?? "",
  };
}

function CertificateFormDialog({
  row,
  defaultWorkId,
  projects,
  canUpload,
  onClose,
}: {
  row: CertificateRow | null;
  defaultWorkId: string;
  projects: Array<{ id: string; workName: string }>;
  canUpload: boolean;
  onClose: () => void;
}) {
  const createCertificate = useCreateVatTaxCertificate();
  const updateCertificate = useUpdateVatTaxCertificate();
  const createDocument = useCreateDocument();
  const addDocumentVersion = useAddDocumentVersion();
  const [form, setForm] = React.useState(() => initialCertificateForm(row, defaultWorkId));
  const [file, setFile] = React.useState<File | null>(null);
  const [persistedRecord, setPersistedRecord] = React.useState<VatTaxCertificateRecord | null>(
    row?.record ?? null,
  );
  const [error, setError] = React.useState("");
  const [partialSuccess, setPartialSuccess] = React.useState("");
  const busy =
    createCertificate.isPending ||
    updateCertificate.isPending ||
    createDocument.isPending ||
    addDocumentVersion.isPending;

  function updateField<K extends keyof CertificateFormState>(key: K, value: CertificateFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleFile(nextFile: File | null) {
    setError("");
    if (!nextFile) {
      setFile(null);
      return;
    }
    const allowed = new Set(["application/pdf", "image/jpeg", "image/png"]);
    if (!allowed.has(nextFile.type)) {
      setFile(null);
      setError("Attachment must be a PDF, JPG, or PNG file.");
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      setError("Attachment size must not exceed 10MB.");
      return;
    }
    setFile(nextFile);
  }

  async function save() {
    setError("");
    setPartialSuccess("");
    if (!form.cmsWorkId) {
      setError("Project is required.");
      return;
    }
    if (form.issueDate && form.validTill && form.validTill < form.issueDate) {
      setError("Valid Till cannot be before Issue Date.");
      return;
    }
    const amount = form.amount.trim() ? Number(form.amount) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      setError("Amount must be a valid non-negative number.");
      return;
    }
    if (
      form.status === "ISSUED" &&
      (!form.certificateNo.trim() ||
        !form.issueDate ||
        !form.validTill ||
        amount === null ||
        amount <= 0)
    ) {
      setError(
        "Issued certificates require Certificate No, Issue Date, Valid Till, and a positive Amount.",
      );
      return;
    }

    const payload: CreateVatTaxCertificateInput = {
      cmsWorkId: form.cmsWorkId,
      certificateType: form.certificateType,
      status: form.status,
      applicationDate: form.applicationDate || undefined,
      certificateNo: form.certificateNo.trim() || null,
      issueDate: form.issueDate || null,
      validTill: form.validTill || null,
      amount,
      issuingAuthority: form.issuingAuthority.trim() || null,
      remarks: form.remarks.trim() || null,
    };

    let saved: VatTaxCertificateRecord;
    try {
      saved = persistedRecord
        ? await updateCertificate.mutateAsync({ id: persistedRecord.id, payload })
        : await createCertificate.mutateAsync(payload);
      setPersistedRecord(saved);
    } catch (saveError) {
      setError(errorMessage(saveError));
      return;
    }

    if (file) {
      try {
        const documentType = `${saved.certificateType}_CERTIFICATE`;
        const existingDocument =
          saved.documents.find((document) => document.documentType === documentType) ??
          saved.documents[0];
        if (existingDocument) {
          await addDocumentVersion.mutateAsync({
            id: existingDocument.id,
            file,
            changeNote: "Updated from VAT-Tax Certificate",
          });
        } else {
          await createDocument.mutateAsync({
            input: {
              name: saved.certificateNo
                ? `${saved.certificateType} Certificate ${saved.certificateNo}`
                : `${saved.certificateType} Certificate - ${saved.cmsWork.workName}`,
              category: "Project Documentation",
              documentType,
              relatedModule: "VAT_TAX_CERTIFICATE",
              relatedEntityId: saved.id,
              relatedEntityName: saved.certificateNo ?? saved.cmsWork.workName,
              vatTaxCertificateId: saved.id,
              tenderId: saved.tenderId ?? undefined,
              workId: saved.cmsWorkId,
              contractId: saved.contractId ?? undefined,
              referenceNumber: saved.tender?.egpTenderId ?? undefined,
              certificateNumber: saved.certificateNo ?? undefined,
              amount: saved.amount === null ? undefined : Number(saved.amount),
              issueDate: saved.issueDate ?? undefined,
              expiryDate: saved.validTill ?? undefined,
              description: saved.remarks ?? undefined,
            },
            file,
          });
        }
      } catch (uploadError) {
        setPartialSuccess(
          `Certificate saved successfully, but the attachment upload failed: ${errorMessage(uploadError)} Select Save again to retry the attachment.`,
        );
        return;
      }
    }

    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#071b49]/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={row ? "Update VAT-Tax certificate" : "New VAT-Tax certificate"}
    >
      <div className="my-auto w-full max-w-[680px] rounded-[8px] border border-[#dce4ef] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e8f1] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-[#071b49]">
              {row ? "Update VAT-Tax Certificate" : "New VAT-Tax Certificate"}
            </h2>
            <p className="mt-1 text-[10px] text-[#60718e]">
              {row?.tid ?? "Create the certificate record and optionally attach one document."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close certificate form" disabled={busy}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Project *</span>
            <select
              value={form.cmsWorkId}
              onChange={(event) => updateField("cmsWorkId", event.target.value)}
              className={CONTROL_CLASS}
              disabled={Boolean(row)}
            >
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.workName}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Certificate Type *</span>
            <select
              value={form.certificateType}
              onChange={(event) => updateField("certificateType", event.target.value as CertificateType)}
              className={CONTROL_CLASS}
            >
              <option value="VAT">VAT</option>
              <option value="TAX">TAX</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Status *</span>
            <select
              value={form.status}
              onChange={(event) => updateField("status", event.target.value as CertificateStatus)}
              className={CONTROL_CLASS}
            >
              {(Object.keys(STATUS_LABEL) as CertificateStatus[]).map((status) => (
                <option key={status} value={status}>{STATUS_LABEL[status]}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Application Date</span>
            <input type="date" value={form.applicationDate} onChange={(event) => updateField("applicationDate", event.target.value)} className={CONTROL_CLASS} />
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Certificate No</span>
            <input value={form.certificateNo} onChange={(event) => updateField("certificateNo", event.target.value)} placeholder="e.g. VAT-2026-001" className={CONTROL_CLASS} />
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Issue Date</span>
            <input type="date" value={form.issueDate} onChange={(event) => updateField("issueDate", event.target.value)} className={CONTROL_CLASS} />
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Valid Till</span>
            <input type="date" value={form.validTill} onChange={(event) => updateField("validTill", event.target.value)} className={CONTROL_CLASS} />
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Amount (BDT)</span>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => updateField("amount", event.target.value)} placeholder="0.00" className={CONTROL_CLASS} />
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Issuing Authority</span>
            <input value={form.issuingAuthority} onChange={(event) => updateField("issuingAuthority", event.target.value)} placeholder="Enter authority" className={CONTROL_CLASS} />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Remarks</span>
            <textarea value={form.remarks} onChange={(event) => updateField("remarks", event.target.value)} rows={2} className="w-full rounded-[5px] border border-[#dbe3ef] px-3 py-2 text-[10px] outline-none focus:border-[#1769e8]" />
          </label>
          {canUpload && (
            <label className="sm:col-span-2">
              <span className="mb-1.5 block text-[9px] font-semibold text-[#33496f]">Attachment (optional)</span>
              <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => handleFile(event.target.files?.[0] ?? null)} className="block w-full rounded-[5px] border border-[#dbe3ef] bg-white px-3 py-2 text-[9px] text-[#40577f] file:mr-3 file:rounded-[4px] file:border-0 file:bg-[#eaf3ff] file:px-3 file:py-1.5 file:text-[9px] file:font-semibold file:text-[#0765e9]" />
              <span className="mt-1 block text-[8px] text-[#71819b]">PDF, JPG or PNG; maximum 10MB.</span>
            </label>
          )}
          {error && <p className="sm:col-span-2 rounded-[5px] bg-[#fff0f1] px-3 py-2 text-[9px] text-[#b72f3d]">{error}</p>}
          {partialSuccess && <p className="sm:col-span-2 rounded-[5px] border border-[#f2cf88] bg-[#fff8e8] px-3 py-2 text-[9px] text-[#8a5a00]">{partialSuccess}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-[#e2e8f1] px-5 py-3">
          <button type="button" onClick={onClose} disabled={busy} className="h-[34px] rounded-[5px] border border-[#d9e1ed] px-4 text-[10px] font-semibold text-[#40577f] disabled:opacity-60">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={busy || !form.cmsWorkId} className="h-[34px] rounded-[5px] bg-[#0765e9] px-5 text-[10px] font-semibold text-white disabled:opacity-60">
            {busy ? "Saving..." : row ? "Update Certificate" : "Save Certificate"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function VatTaxCertificatesWorkspace() {
  useSetBreadcrumb([
    { label: "Projects", href: "/cms/ongoing-works" },
    { label: "Project Documentation", href: "/cms/documentation" },
    { label: "VAT-Tax Certificate" },
  ]);

  const searchParams = useSearchParams();
  const requestedWorkId = searchParams.get("workId") ?? "";
  const openCreateOnLoad = searchParams.get("create") === "1";
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const tableRef = React.useRef<HTMLElement>(null);
  const [selectedProject, setSelectedProject] = React.useState(requestedWorkId);
  const [typeDraft, setTypeDraft] = React.useState<"" | CertificateType>("");
  const [searchDraft, setSearchDraft] = React.useState("");
  const [dateFromDraft, setDateFromDraft] = React.useState(DEFAULT_DATE_FROM);
  const [dateToDraft, setDateToDraft] = React.useState(DEFAULT_DATE_TO);
  const [quickRange, setQuickRange] = React.useState(CURRENT_FINANCIAL_YEAR.value);
  const [filters, setFilters] = React.useState<AppliedFilters>({
    type: "",
    search: "",
    dateFrom: DEFAULT_DATE_FROM,
    dateTo: DEFAULT_DATE_TO,
  });
  const [activeTab, setActiveTab] = React.useState<CertificateTab>("All Certificates");
  const [page, setPage] = React.useState(1);
  const [viewing, setViewing] = React.useState<CertificateRow | null>(null);
  const [createFor, setCreateFor] = React.useState<CertificateRow | null | undefined>(
    openCreateOnLoad ? null : undefined,
  );
  const [exportError, setExportError] = React.useState("");
  const me = useMe();
  const permissions = me.data?.permissions ?? [];
  const canCreate = permissions.includes("vat_tax_certificate.create");
  const canUpdate = permissions.includes("vat_tax_certificate.update");
  const canExport = permissions.includes("vat_tax_certificate.export");
  const canUpload = permissions.includes("documents.upload");
  const canDownload = permissions.includes("documents.download");
  const projectsQuery = useCmsWorks({ page: 1, limit: 100, includeClosed: true });
  const projects = React.useMemo(() => projectsQuery.data?.items ?? [], [projectsQuery.data?.items]);
  const effectiveProjectId = selectedProject || projects[0]?.id || "";
  const certificateExporter = useExportVatTaxCertificates();

  const listQuery = useVatTaxCertificates({
    page,
    limit: PAGE_SIZE,
    search: filters.search || undefined,
    certificateType: filters.type || undefined,
    status: TAB_STATUS[activeTab],
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });
  const statsQuery = useVatTaxCertificateStats({
    search: filters.search || undefined,
    certificateType: filters.type || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
  });
  const recentQuery = useRecentVatTaxCertificates({
    limit: 5,
    certificateType: filters.type || undefined,
  });

  const visibleRows = React.useMemo(
    () => (listQuery.data?.items ?? []).map(mapCertificate),
    [listQuery.data?.items],
  );
  const recentRows = React.useMemo(
    () => (recentQuery.data ?? []).map(mapCertificate),
    [recentQuery.data],
  );
  const rawSummary = statsQuery.data ?? EMPTY_STATS;
  const summary = {
    total: rawSummary.total,
    vat: rawSummary.vat,
    tax: rawSummary.tax,
    issued: rawSummary.issued,
    processing: rawSummary.underProcessing,
    pending: rawSummary.pendingNotIssued,
    rejected: rawSummary.rejectedReturned,
    totalAmount: Number(rawSummary.totalAmount),
    issuedAmount: Number(rawSummary.issuedAmount),
    processingAmount: Number(rawSummary.underProcessingAmount),
    pendingAmount: Number(rawSummary.pendingNotIssuedAmount),
    rejectedAmount: Number(rawSummary.rejectedReturnedAmount),
  };
  const meta = listQuery.data?.meta ?? { page, limit: PAGE_SIZE, total: 0, totalPages: 1 };
  const pageCount = Math.max(1, meta.totalPages);
  const safePage = Math.min(meta.page, pageCount);
  const startEntry = meta.total ? (safePage - 1) * meta.limit + 1 : 0;
  const endEntry = Math.min(safePage * meta.limit, meta.total);
  const paginationStart = Math.min(
    Math.max(1, safePage - 2),
    Math.max(1, pageCount - 4),
  );
  const paginationPages = Array.from(
    { length: Math.min(pageCount, 5) },
    (_, index) => paginationStart + index,
  );

  function applyFilters() {
    setFilters({
      type: typeDraft,
      search: searchDraft,
      dateFrom: dateFromDraft,
      dateTo: dateToDraft,
    });
    setPage(1);
  }

  function resetFilters() {
    setTypeDraft("");
    setSearchDraft("");
    setDateFromDraft(DEFAULT_DATE_FROM);
    setDateToDraft(DEFAULT_DATE_TO);
    setQuickRange(CURRENT_FINANCIAL_YEAR.value);
    setFilters({
      type: "",
      search: "",
      dateFrom: DEFAULT_DATE_FROM,
      dateTo: DEFAULT_DATE_TO,
    });
    setActiveTab("All Certificates");
    setPage(1);
  }

  async function exportCertificates() {
    setExportError("");
    try {
      const result = await certificateExporter.mutateAsync({
        search: filters.search || undefined,
        certificateType: filters.type || undefined,
        status: TAB_STATUS[activeTab],
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
      });
      downloadText(result.filename, result.content);
    } catch (error) {
      setExportError(errorMessage(error));
    }
  }

  function exportAmountSummary() {
    downloadCsv("vat-tax-amount-summary.csv", [
      ["Category", "Amount (BDT)"],
      ["Total Amount", formatMoney(summary.totalAmount)],
      ["Issued Amount", formatMoney(summary.issuedAmount)],
      ["Under Processing Amount", formatMoney(summary.processingAmount)],
      ["Pending / Not Issued Amount", formatMoney(summary.pendingAmount)],
      ["Rejected / Returned Amount", formatMoney(summary.rejectedAmount)],
    ]);
  }

  function focusTidSearch() {
    searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(() => searchInputRef.current?.focus(), 250);
  }

  function openBulkUpload() {
    setCreateFor(null);
  }

  function downloadTemplate() {
    downloadCsv("vat-tax-certificate-template.csv", [
      [
        "TID",
        "Project",
        "Certificate Type",
        "Application Date",
        "Certificate No",
        "Issue Date",
        "Valid Till",
        "Amount (BDT)",
        "Status",
        "Issuing Authority",
        "Remarks",
      ],
    ]);
  }

  const statusSegments: DonutSegment[] = [
    { label: "Issued", value: summary.issued, color: "#38ad59" },
    { label: "Under Processing", value: summary.processing, color: "#6b34e6" },
    { label: "Pending / Not Issued", value: summary.pending, color: "#f6a21b" },
    { label: "Rejected / Returned", value: summary.rejected, color: "#ed3345" },
  ];
  const typeSegments: DonutSegment[] = [
    { label: "VAT Certificates", value: summary.vat, color: "#0765e9" },
    { label: "Tax Certificates", value: summary.tax, color: "#119f98" },
  ];

  return (
    <div className="min-h-full bg-[#f8faff] px-1 pb-4 pt-1 text-[#10244c] sm:px-2">
      <header className="flex min-h-[61px] flex-col items-start justify-between gap-2 pb-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-[23px] font-bold leading-tight tracking-[-0.02em] text-[#071b49]">
            VAT-Tax Certificates
          </h1>
          <p className="mt-1 text-[11px] text-[#40577f]">
            Track and manage all VAT &amp; Tax certificates for projects
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <label className="relative block h-[45px] w-full rounded-[6px] border border-[#dce4ef] bg-white px-3 pt-[6px] shadow-[0_1px_3px_rgba(20,39,74,0.03)] sm:w-[245px]">
            <span className="block text-[8px] font-medium text-[#60718e]">Select Project</span>
            <select
              aria-label="Select Project"
              value={effectiveProjectId}
              onChange={(event) => setSelectedProject(event.target.value)}
              className="absolute inset-0 h-full w-full appearance-none bg-transparent px-3 pb-1 pt-[16px] text-[11px] font-bold text-[#10244c] outline-none"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.workName}</option>
              ))}
              {!projects.length && (
                <option value="">
                  {projectsQuery.isLoading
                    ? "Loading projects..."
                    : projectsQuery.isError
                      ? "Projects could not be loaded"
                      : "No projects available"}
                </option>
              )}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#071b49]" />
          </label>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateFor(null)}
              disabled={!effectiveProjectId || projectsQuery.isLoading || projectsQuery.isError}
              className="inline-flex h-[35px] shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] bg-[#0765e9] px-4 text-[10px] font-semibold text-white shadow-[0_3px_9px_rgba(7,101,233,0.2)] hover:bg-[#0458ce] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> New VAT-Tax Certificate
            </button>
          )}
        </div>
      </header>

      {(projectsQuery.isError || statsQuery.isError) && (
        <div className="mb-2 rounded-[5px] border border-[#f2c7cc] bg-[#fff4f5] px-3 py-2 text-[9px] text-[#b72f3d]">
          {projectsQuery.isError
            ? "Projects could not be loaded. Certificate creation is unavailable until the connection is restored."
            : "Certificate summary could not be loaded. The zero values below are not confirmed totals."}
        </div>
      )}

      <section className="rounded-[7px] border border-[#dfe6f1] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 xl:grid-cols-[0.75fr_1fr_1.45fr_1.15fr_auto_auto]">
          <label className="block min-w-0">
            <span className="mb-[5px] block text-[9px] font-medium text-[#33496f]">
              Certificate Type
            </span>
            <select
              value={typeDraft}
              onChange={(event) => setTypeDraft(event.target.value as "" | CertificateType)}
              className={CONTROL_CLASS}
            >
              <option value="">All Types</option>
              <option value="VAT">VAT</option>
              <option value="TAX">TAX</option>
            </select>
          </label>

          <label className="block min-w-0">
            <span className="mb-[5px] block text-[9px] font-medium text-[#33496f]">
              Search by TID
            </span>
            <span className="relative block">
              <input
                ref={searchInputRef}
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && applyFilters()}
                placeholder="Enter Tender ID (TID)"
                className={cn(CONTROL_CLASS, "pr-9 placeholder:text-[#7c8ca6]")}
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#31476d]" />
            </span>
          </label>

          <div className="block min-w-0">
            <span className="mb-[5px] block text-[9px] font-medium text-[#33496f]">Date Range</span>
            <div className="grid h-[35px] grid-cols-[1fr_28px_1fr] overflow-hidden rounded-[5px] border border-[#dbe3ef] bg-white">
              <label className="relative flex min-w-0 items-center px-2.5">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[#354c73]" />
                <span className="ml-2 truncate text-[9px] font-medium">
                  {formatDate(dateFromDraft)}
                </span>
                <input
                  type="date"
                  aria-label="Date range start"
                  value={dateFromDraft}
                  onChange={(event) => setDateFromDraft(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <span className="flex items-center justify-center border-x border-[#e2e8f1] text-[9px] text-[#6d7e99]">
                to
              </span>
              <label className="relative flex min-w-0 items-center px-2.5">
                <span className="truncate text-[9px] font-medium">{formatDate(dateToDraft)}</span>
                <CalendarDays className="ml-auto h-3.5 w-3.5 shrink-0 text-[#354c73]" />
                <input
                  type="date"
                  aria-label="Date range end"
                  value={dateToDraft}
                  onChange={(event) => setDateToDraft(event.target.value)}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
            </div>
          </div>

          <label className="block min-w-0">
            <span className="mb-[5px] block text-[9px] font-medium text-[#33496f]">
              Quick Range
            </span>
            <select
              value={quickRange}
              onChange={(event) => {
                const value = event.target.value;
                setQuickRange(value);
                if (value === CURRENT_FINANCIAL_YEAR.value) {
                  setDateFromDraft(DEFAULT_DATE_FROM);
                  setDateToDraft(DEFAULT_DATE_TO);
                } else if (value === "all") {
                  setDateFromDraft("");
                  setDateToDraft("");
                }
              }}
              className={CONTROL_CLASS}
            >
              <option value={CURRENT_FINANCIAL_YEAR.value}>
                {CURRENT_FINANCIAL_YEAR.label}
              </option>
              <option value="all">All Time</option>
            </select>
          </label>

          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex h-[35px] items-center justify-center gap-2 rounded-[5px] bg-[#0765e9] px-5 text-[10px] font-semibold text-white shadow-[0_3px_9px_rgba(7,101,233,0.2)] hover:bg-[#0458ce]"
          >
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-[35px] items-center justify-center gap-2 rounded-[5px] border border-[#d9e1ed] bg-white px-5 text-[10px] font-semibold text-[#33496f] hover:bg-[#f7f9fc]"
          >
            <RotateCcw className="h-3.5 w-3.5 text-[#dfb21a]" /> Reset
          </button>
        </div>
      </section>

      <section className="mt-2.5 grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <KpiCard
          label="Total Certificates"
          value={String(summary.total)}
          helper="All Types"
          tone="blue"
          icon={FileBadge2}
        />
        <KpiCard
          label="VAT Certificates"
          value={String(summary.vat)}
          helper={percentage(summary.vat, summary.total)}
          tone="green"
          icon={ShieldCheck}
        />
        <KpiCard
          label="Tax Certificates"
          value={String(summary.tax)}
          helper={percentage(summary.tax, summary.total)}
          tone="blue"
          icon={FileText}
        />
        <KpiCard
          label="Issued"
          value={String(summary.issued)}
          helper={percentage(summary.issued, summary.total)}
          tone="green"
          icon={ShieldCheck}
        />
        <KpiCard
          label="Under Processing"
          value={String(summary.processing)}
          helper={percentage(summary.processing, summary.total)}
          tone="purple"
          icon={Hourglass}
        />
        <KpiCard
          label="Pending / Not Issued"
          value={String(summary.pending)}
          helper={percentage(summary.pending, summary.total)}
          tone="orange"
          icon={Hourglass}
        />
        <KpiCard
          label="Rejected / Returned"
          value={String(summary.rejected)}
          helper={percentage(summary.rejected, summary.total)}
          tone="red"
          icon={CircleX}
        />
      </section>

      <section className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-[1fr_1fr_1.08fr]">
        <ChartCard
          title="Certificate Status Overview"
          total={summary.total}
          segments={statusSegments}
        />
        <ChartCard
          title="Certificate Type Overview"
          total={summary.total}
          segments={typeSegments}
        />
        <section className="min-h-[170px] rounded-[7px] border border-[#dfe6f1] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-bold text-[#10244c]">Amount Summary (BDT)</h2>
            {canExport && (
              <button
                type="button"
                onClick={exportAmountSummary}
                className="inline-flex h-[25px] items-center gap-1.5 rounded-[4px] border border-[#d9e2ef] bg-white px-2.5 text-[8.5px] font-semibold text-[#24446e] hover:border-[#0b63e5] hover:text-[#0b63e5]"
              >
                <Download className="h-3 w-3" /> Export
              </button>
            )}
          </div>
          <dl className="mt-2 divide-y divide-[#edf1f6] text-[9px]">
            {[
              ["Total Amount", summary.totalAmount, "text-[#071b49]"],
              ["Issued Amount", summary.issuedAmount, "text-[#249b4a]"],
              ["Under Processing Amount", summary.processingAmount, "text-[#7047d9]"],
              ["Pending / Not Issued Amount", summary.pendingAmount, "text-[#d98111]"],
              ["Rejected / Returned Amount", summary.rejectedAmount, "text-[#d83b4b]"],
            ].map(([label, amount, valueClass]) => (
              <div key={String(label)} className="flex items-center justify-between gap-4 py-[6px]">
                <dt className="font-medium text-[#273e66]">{label}</dt>
                <dd className={cn("font-bold tabular-nums", valueClass)}>
                  {formatMoney(Number(amount))}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </section>

      <section className="mt-2.5 grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,2.45fr)_minmax(295px,1fr)]">
        <section
          ref={tableRef}
          className="min-w-0 overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]"
        >
          <div className="flex min-h-[37px] items-end justify-between gap-2 border-b border-[#e2e8f1] px-2.5">
            <div className="flex min-w-0 gap-4 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    setActiveTab(tab);
                    setPage(1);
                  }}
                  className={cn(
                    "h-[37px] shrink-0 border-b-2 px-0.5 text-[8.5px] font-semibold",
                    activeTab === tab
                      ? "border-[#0765e9] text-[#0765e9]"
                      : "border-transparent text-[#60718e] hover:text-[#10244c]",
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
            {canExport && (
              <button
                type="button"
                onClick={() => void exportCertificates()}
                disabled={certificateExporter.isPending}
                className="mb-[6px] inline-flex h-[25px] shrink-0 items-center gap-1.5 rounded-[4px] border border-[#d9e2ef] bg-white px-2.5 text-[8.5px] font-semibold text-[#24446e] hover:border-[#0b63e5] hover:text-[#0b63e5]"
              >
                <Download className="h-3 w-3" />
                {certificateExporter.isPending ? "Exporting..." : "Export"}
              </button>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[856px] table-fixed text-left text-[8.5px] text-[#10244c]">
              <colgroup>
                <col className="w-[32px]" />
                <col className="w-[88px]" />
                <col className="w-[140px]" />
                <col className="w-[72px]" />
                <col className="w-[94px]" />
                <col className="w-[80px]" />
                <col className="w-[80px]" />
                <col className="w-[88px]" />
                <col className="w-[108px]" />
                <col className="w-[74px]" />
              </colgroup>
              <thead>
                <tr className="h-[31px] border-b border-[#e2e8f1] bg-[#fbfcfe] text-[8px] font-semibold text-[#172c53]">
                  {[
                    "SL",
                    "TID",
                    "Project",
                    "Certificate Type",
                    "Certificate No",
                    "Issue Date",
                    "Valid Till",
                    "Amount (BDT)",
                    "Status",
                    "Action",
                  ].map((header) => (
                    <th key={header} className="px-2 py-1.5">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => {
                  return (
                    <tr
                      key={row.id}
                      className="h-[31px] border-b border-[#e6ebf2] last:border-0 hover:bg-[#fbfdff]"
                    >
                      <td className="px-2">{(safePage - 1) * PAGE_SIZE + index + 1}</td>
                      <td className="truncate px-2 font-semibold" title={row.tid}>
                        {row.tid}
                      </td>
                      <td className="truncate px-2" title={row.project}>
                        {row.project}
                      </td>
                      <td className="px-2">{row.type}</td>
                      <td className="truncate px-2" title={row.certificateNo ?? "-"}>
                        {row.certificateNo ?? "-"}
                      </td>
                      <td className="whitespace-nowrap px-2">{formatDate(row.issueDate)}</td>
                      <td className="whitespace-nowrap px-2">{formatDate(row.validTill)}</td>
                      <td className="whitespace-nowrap px-2 font-medium tabular-nums">
                        {row.amount === null ? "-" : formatMoney(row.amount)}
                      </td>
                      <td className="px-2">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-2">
                        <div className="flex items-center gap-1.5">
                          <IconButton label={`View ${row.tid}`} onClick={() => setViewing(row)}>
                            <Eye className="h-3 w-3" />
                          </IconButton>
                          {canUpdate && (
                            <IconButton
                              label={`Update ${row.tid}`}
                              onClick={() => setCreateFor(row)}
                            >
                              {row.status === "PENDING" || row.status === "NOT_ISSUED" ? (
                                <Plus className="h-3.5 w-3.5" />
                              ) : (
                                <MoreVertical className="h-3 w-3" />
                              )}
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!visibleRows.length && (
                  <tr>
                    <td colSpan={10} className="h-[74px] text-center text-[10px] text-[#6d7e99]">
                      {listQuery.isLoading
                        ? "Loading VAT-Tax certificates..."
                        : listQuery.isError
                          ? "VAT-Tax certificates could not be loaded."
                          : "No VAT-Tax certificates found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex min-h-[43px] flex-wrap items-center justify-between gap-3 border-t border-[#e2e8f1] px-2.5 text-[8.5px] text-[#40577f]">
            <span>
              Showing {startEntry} to {endEntry} of {meta.total} entries
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
                aria-label="Previous page"
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[4px] border border-[#dce4ef] disabled:text-[#bcc6d5]"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              {paginationPages.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    onClick={() => setPage(pageNumber)}
                    className={cn(
                      "flex h-[26px] min-w-[26px] items-center justify-center rounded-[4px] border px-1.5 font-semibold",
                      safePage === pageNumber
                        ? "border-[#0765e9] bg-[#0765e9] text-white"
                        : "border-[#dce4ef] bg-white text-[#10244c]",
                    )}
                  >
                    {pageNumber}
                  </button>
                ))}
              <button
                type="button"
                disabled={safePage === pageCount}
                onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                aria-label="Next page"
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[4px] border border-[#dce4ef] disabled:text-[#bcc6d5]"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </section>

        <aside className="grid min-w-0 content-start gap-2.5">
          <section className="rounded-[7px] border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
            <div className="flex h-[34px] items-center justify-between border-b border-[#e5eaf2] px-3">
              <h2 className="text-[10.5px] font-bold text-[#10244c]">Recent Certificates</h2>
              <button
                type="button"
                onClick={() => {
                  setActiveTab("All Certificates");
                  setPage(1);
                  tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="text-[8.5px] font-semibold text-[#0765e9] hover:underline"
              >
                View All
              </button>
            </div>
            <ul className="divide-y divide-[#edf1f6] px-3">
              {recentRows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setViewing(row)}
                    className="flex w-full min-w-0 items-center gap-2 py-[7px] text-left"
                  >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-[5px]",
                      row.status === "PENDING" || row.status === "NOT_ISSUED"
                        ? "bg-[#fff3df] text-[#e18b14]"
                        : "bg-[#e8f2ff] text-[#0b67e8]",
                    )}
                  >
                    <FileBadge2 className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-[8.5px] text-[#10244c]">{row.tid}</strong>
                    <span className="mt-0.5 block truncate text-[7.5px] text-[#60718e]">
                      {row.certificateNo
                        ? `${row.certificateNo} - ${row.type} Certificate`
                        : `${row.type} Certificate`}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span
                      className={cn(
                        "block rounded-[4px] px-1.5 py-[3px] text-[7px] font-semibold",
                        STATUS_CLASS[row.status],
                      )}
                    >
                      {STATUS_LABEL[row.status]}
                    </span>
                    <span className="mt-1 block whitespace-nowrap text-[7px] text-[#60718e]">
                      {formatDate(row.issueDate ?? row.applicationDate ?? row.record.updatedAt)}
                    </span>
                  </span>
                  </button>
                </li>
              ))}
              {!recentRows.length && (
                <li className="py-6 text-center text-[8.5px] text-[#6d7e99]">
                  {recentQuery.isLoading
                    ? "Loading recent certificates..."
                    : recentQuery.isError
                      ? "Recent certificates could not be loaded."
                      : "No recent certificates."}
                </li>
              )}
            </ul>
          </section>

          <section className="rounded-[7px] border border-[#dfe6f1] bg-white p-3 shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
            <h2 className="text-[10.5px] font-bold text-[#10244c]">Quick Actions</h2>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {canCreate && (
                <button
                  type="button"
                  onClick={openBulkUpload}
                  disabled={!effectiveProjectId || projectsQuery.isLoading || projectsQuery.isError}
                  className="flex h-[59px] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dfe6f1] bg-white text-[8px] font-semibold text-[#233a62] hover:border-[#8eb8ee] hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CloudUpload className="h-[18px] w-[18px] text-[#0765e9]" />
                  Add Certificate
                </button>
              )}
              {canExport && (
                <button
                  type="button"
                  onClick={() => void exportCertificates()}
                  disabled={certificateExporter.isPending}
                  className="flex h-[59px] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dfe6f1] bg-white text-[8px] font-semibold text-[#233a62] hover:border-[#8eb8ee] hover:bg-[#f7faff]"
                >
                  <FileDown className="h-[18px] w-[18px] text-[#0765e9]" />
                  Download Report
                </button>
              )}
              <button
                type="button"
                onClick={downloadTemplate}
                className="flex h-[59px] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dfe6f1] bg-white text-[8px] font-semibold text-[#233a62] hover:border-[#8eb8ee] hover:bg-[#f7faff]"
              >
                <FileSpreadsheet className="h-[18px] w-[18px] text-[#0765e9]" />
                Certificate Template
              </button>
              <button
                type="button"
                onClick={focusTidSearch}
                className="flex h-[59px] flex-col items-center justify-center gap-1.5 rounded-[5px] border border-[#dfe6f1] bg-white text-[8px] font-semibold text-[#233a62] hover:border-[#8eb8ee] hover:bg-[#f7faff]"
              >
                <Search className="h-[18px] w-[18px] text-[#0765e9]" />
                Search by TID
              </button>
            </div>
          </section>
        </aside>
      </section>

      {exportError && (
        <div className="mt-2.5 rounded-[5px] border border-[#f2c7cc] bg-[#fff4f5] px-3 py-2 text-[9px] text-[#b72f3d]">
          Export failed: {exportError}
        </div>
      )}

      <div className="mt-2.5 flex min-h-[43px] items-center gap-3 rounded-[5px] border border-[#e1e9f7] bg-[#f0f5ff] px-3 text-[9px] text-[#314b78]">
        <Info className="h-[18px] w-[18px] shrink-0 text-[#1267df]" />
        <span>
          <span className="block">
            Use TID to quickly find VAT &amp; Tax certificates for any tender.
          </span>
          <span className="mt-0.5 block">
            You can view, upload, and manage all related documents here.
          </span>
        </span>
      </div>

      {viewing && (
        <CertificateViewDialog
          row={viewing}
          canDownload={canDownload}
          onClose={() => setViewing(null)}
        />
      )}

      {createFor !== undefined &&
        ((createFor === null && canCreate) || (createFor !== null && canUpdate)) && (
        <CertificateFormDialog
          key={createFor?.id ?? "new"}
          row={createFor}
          defaultWorkId={effectiveProjectId}
          projects={projects}
          canUpload={canUpload}
          onClose={() => setCreateFor(undefined)}
        />
      )}
    </div>
  );
}
