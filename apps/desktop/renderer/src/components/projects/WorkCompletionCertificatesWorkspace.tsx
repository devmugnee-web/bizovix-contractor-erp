"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  Award,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  Info,
  MoreVertical,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Workflow,
  X,
} from "lucide-react";
import {
  ApiError,
  downloadDocument,
  useCmsWorks,
  useContracts,
  useCompletionCertificateStatus,
  useCreateCompletionCertificate,
  useMe,
  useUpdateCompletionCertificate,
  useUpdateCompletionCertificateEgpTracking,
  useWorkCompletionCertificates,
  useWorkCompletionCertificateStats,
} from "@bizovix/api-client";
import type {
  CmsWork,
  CmsWorkStatus,
  WorkCompletionCertificateRow as ApiWorkCompletionCertificateRow,
  WorkCompletionCertificateStats,
} from "@bizovix/types";
import { cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

type WccStatus =
  | "WCC_OBTAINED"
  | "EGP_APPLIED_FOR_MANUAL"
  | "MANUAL_WCC_OBTAINED_EGP_APPLIED"
  | "MANUAL_WCC_OBTAINED_EGP_NOT_APPLIED"
  | "WCC_APPLIED"
  | "NOT_APPLIED";

type WccSource = "EGP" | "MANUAL";
type WccEgpStatus = "OBTAINED" | "PENDING" | "NOT_APPLICABLE" | "NOT_APPLIED" | "UNDER_PROCESS";

/**
 * Page-facing record kept separate from API transport types. The dedicated WCC
 * query can map into this shape without coupling the screenshot layout to a
 * particular backend response.
 */
export interface WorkCompletionCertificateListRow {
  id: string;
  recordId?: string;
  workId: string;
  contractId?: string | null;
  tid: string;
  project: string;
  procuringEntity: string;
  workDescription: string;
  contractNo: string | null;
  status: WccStatus;
  source: WccSource | null;
  obtainedOn: string | null;
  certificateNo: string | null;
  certificateDate: string | null;
  egpAppliedOn: string | null;
  egpStatus: WccEgpStatus | null;
  lastUpdated: string | null;
  applicationDate?: string | null;
  actualCompletionDate?: string | null;
  certifiedCompletionDate?: string | null;
  issuingAuthority?: string | null;
  remarks?: string | null;
  documentId?: string | null;
  coreStatus?: "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "CANCELLED";
  projectStatus: CmsWorkStatus;
}

interface AppliedFilters {
  search: string;
  projectId: string;
  status: "" | WccStatus;
  source: "" | WccSource;
  egpStatus: "" | WccEgpStatus;
}

interface ApplicationState {
  workId: string;
  row: WorkCompletionCertificateListRow | null;
}

interface PageDataSource {
  projects: CmsWork[];
  rows: WorkCompletionCertificateListRow[];
  stats: WorkCompletionCertificateStats;
  totalRows: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;
}

const PAGE_SIZE = 10;
const EMPTY_STATS: WorkCompletionCertificateStats = {
  totalProjects: 0,
  wccObtained: 0,
  obtainedEgp: 0,
  obtainedManual: 0,
  unclassifiedObtained: 0,
  egpAppliedForManual: 0,
  withoutWcc: 0,
};
const CONTROL_CLASS =
  "h-[36px] w-full rounded-[5px] border border-[#dbe3ef] bg-white px-3 text-[10px] font-medium text-[#10244c] outline-none transition focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10";

const STATUS_LABEL: Record<WccStatus, string> = {
  WCC_OBTAINED: "WCC Obtained",
  EGP_APPLIED_FOR_MANUAL: "EGP Applied (For Manual)",
  MANUAL_WCC_OBTAINED_EGP_APPLIED: "Manual WCC Obtained, EGP Applied",
  MANUAL_WCC_OBTAINED_EGP_NOT_APPLIED: "Manual WCC Obtained, EGP Not Applied",
  WCC_APPLIED: "WCC Applied",
  NOT_APPLIED: "Not Applied",
};

const STATUS_CLASS: Record<WccStatus, string> = {
  WCC_OBTAINED: "bg-[#e8f8ec] text-[#249b4a]",
  EGP_APPLIED_FOR_MANUAL: "bg-[#f1eafe] text-[#7047d9]",
  MANUAL_WCC_OBTAINED_EGP_APPLIED: "bg-[#f1eafe] text-[#7047d9]",
  MANUAL_WCC_OBTAINED_EGP_NOT_APPLIED: "bg-[#eaf3ff] text-[#1767c9]",
  WCC_APPLIED: "bg-[#fff3df] text-[#d98111]",
  NOT_APPLIED: "bg-[#fff0f1] text-[#d83b4b]",
};

const EGP_STATUS_LABEL: Record<WccEgpStatus, string> = {
  OBTAINED: "EGP Obtained",
  PENDING: "Pending",
  NOT_APPLICABLE: "Not Applicable",
  NOT_APPLIED: "Not Applied",
  UNDER_PROCESS: "Under Process",
};

const PROJECT_STATUS_LABEL: Record<CmsWorkStatus, string> = {
  ONGOING: "Ongoing",
  COMPLETION_PENDING: "Completion Pending",
  DLP: "Defect Liability Period",
  CLOSEOUT_PENDING: "Closeout Pending",
  COMPLETED: "Completed",
  ARCHIVED: "Completed (Archived)",
  CANCELLED: "Cancelled",
};

const PROJECT_STATUS_CLASS: Record<CmsWorkStatus, string> = {
  ONGOING: "bg-[#eaf3ff] text-[#1767c9]",
  COMPLETION_PENDING: "bg-[#fff3df] text-[#b66c0d]",
  DLP: "bg-[#f1eafe] text-[#7047d9]",
  CLOSEOUT_PENDING: "bg-[#eef2f7] text-[#40577f]",
  COMPLETED: "bg-[#e8f8ec] text-[#249b4a]",
  ARCHIVED: "bg-[#eef2f7] text-[#60718e]",
  CANCELLED: "bg-[#fff0f1] text-[#d83b4b]",
};

const CORE_STATUS_LABEL: Record<
  NonNullable<WorkCompletionCertificateListRow["coreStatus"]>,
  string
> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const STATUS_OPTIONS: Array<{ value: WccStatus; label: string }> = Object.entries(STATUS_LABEL).map(
  ([value, label]) => ({ value: value as WccStatus, label }),
);

const EGP_STATUS_OPTIONS: Array<{ value: WccEgpStatus; label: string }> = Object.entries(EGP_STATUS_LABEL).map(
  ([value, label]) => ({ value: value as WccEgpStatus, label }),
);

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const normalized = value.length === 10 ? `${value}T00:00:00Z` : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(normalized));
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : error instanceof Error
      ? error.message
      : "The WCC application could not be saved.";
}

function mapApiRow(row: ApiWorkCompletionCertificateRow): WorkCompletionCertificateListRow {
  const source = row.source === "EGP" || row.source === "MANUAL" ? row.source : null;
  const egpStatus =
    row.egpStatus && !["UNSPECIFIED"].includes(row.egpStatus)
      ? (row.egpStatus as WccEgpStatus)
      : null;
  const certificate = row.certificate;
  return {
    id: row.id,
    recordId: certificate?.id,
    workId: row.workId,
    contractId: certificate?.contract.id ?? null,
    tid: row.tid ?? "-",
    project: row.project,
    procuringEntity: row.procuringEntity,
    workDescription: row.workDescription,
    contractNo: row.contractNo,
    status: row.displayStatus,
    source,
    obtainedOn: row.wccObtainedOn,
    certificateNo: row.certificateNo,
    certificateDate: row.certificateDate,
    egpAppliedOn: row.egpAppliedOn,
    egpStatus,
    lastUpdated: row.lastUpdated,
    applicationDate: certificate?.applicationDate ?? null,
    actualCompletionDate: certificate?.actualCompletionDate ?? row.workCompletionDate,
    certifiedCompletionDate: certificate?.certifiedCompletionDate ?? null,
    issuingAuthority: certificate?.issuingAuthority ?? null,
    remarks: certificate?.remarks ?? null,
    documentId: row.documents[0]?.id ?? null,
    coreStatus: certificate?.status,
    projectStatus: row.projectStatus,
  };
}

function useWorkCompletionCertificatePageData(
  filters: AppliedFilters,
  page: number,
): PageDataSource {
  const works = useCmsWorks({ page: 1, limit: 100, includeClosed: true });
  const projects = React.useMemo(() => works.data?.items ?? [], [works.data?.items]);
  const query = React.useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      completedOnly: true,
      search: filters.search.trim() || undefined,
      cmsWorkId: filters.projectId || undefined,
      displayStatus: filters.status || undefined,
      source: filters.source || undefined,
      egpStatus: filters.egpStatus || undefined,
    }),
    [filters, page],
  );
  const rowsQuery = useWorkCompletionCertificates(query);
  const statsQuery = useWorkCompletionCertificateStats({
    completedOnly: true,
    search: query.search,
    cmsWorkId: query.cmsWorkId,
    displayStatus: query.displayStatus,
    source: query.source,
    egpStatus: query.egpStatus,
  });
  const rows = React.useMemo(
    () => (rowsQuery.data?.items ?? []).map(mapApiRow),
    [rowsQuery.data?.items],
  );

  return {
    projects,
    rows,
    stats: statsQuery.data ?? EMPTY_STATS,
    totalRows: rowsQuery.data?.meta.total ?? 0,
    totalPages: rowsQuery.data?.meta.totalPages ?? 1,
    isLoading: works.isLoading || rowsQuery.isLoading,
    error:
      works.isError || rowsQuery.isError || statsQuery.isError
        ? "Work completion records could not be loaded."
        : null,
  };
}

function KpiCard({
  label,
  value,
  tone,
  icon: Icon,
  textIcon,
}: {
  label: string;
  value: number;
  tone: "blue" | "green" | "orange" | "purple" | "red";
  icon?: React.ComponentType<{ className?: string }>;
  textIcon?: string;
}) {
  const tones = {
    blue: "bg-[#e8f2ff] text-[#0b67e8]",
    green: "bg-[#e8f8ed] text-[#28a655]",
    orange: "bg-[#fff3df] text-[#f39a1b]",
    purple: "bg-[#f0e8ff] text-[#814ee8]",
    red: "bg-[#fff0f1] text-[#e14958]",
  };

  return (
    <div className="flex h-[87px] min-w-0 items-center rounded-[7px] border border-[#dfe6f1] bg-white px-3 shadow-[0_1px_2px_rgba(15,34,70,0.025)]">
      <span className={cn("flex h-[43px] w-[43px] shrink-0 items-center justify-center rounded-full", tones[tone])}>
        {Icon ? <Icon className="h-[20px] w-[20px]" /> : <span className="text-[12px] font-bold">{textIcon}</span>}
      </span>
      <span className="ml-3 min-w-0">
        <span className="block text-[9.5px] font-semibold leading-tight text-[#172b55]">{label}</span>
        <span className="mt-2 block text-[19px] font-bold leading-none text-[#071b49]">{value}</span>
      </span>
    </div>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  children,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">{label}</span>
      <span className="relative block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={cn(CONTROL_CLASS, "appearance-none pr-8 disabled:cursor-not-allowed disabled:bg-[#f3f6fa] disabled:text-[#71819b]")}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#40577f]" />
      </span>
    </label>
  );
}

function ApplicationDialog({
  state,
  projects,
  onClose,
  onSaved,
}: {
  state: ApplicationState;
  projects: CmsWork[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialRow = state.row;
  const applicationProjects = initialRow?.recordId
    ? projects
    : projects.filter((project) => !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(project.status));
  const [workId, setWorkId] = React.useState(state.workId || initialRow?.workId || projects[0]?.id || "");
  const [contractId, setContractId] = React.useState(initialRow?.contractId ?? "");
  const [source, setSource] = React.useState<WccSource>(initialRow?.source ?? "EGP");
  const [applicationDate, setApplicationDate] = React.useState(initialRow?.applicationDate?.slice(0, 10) ?? isoToday());
  const [actualCompletionDate, setActualCompletionDate] = React.useState(initialRow?.actualCompletionDate?.slice(0, 10) ?? "");
  const [certifiedCompletionDate, setCertifiedCompletionDate] = React.useState(initialRow?.certifiedCompletionDate?.slice(0, 10) ?? "");
  const [obtainedOn, setObtainedOn] = React.useState(initialRow?.obtainedOn?.slice(0, 10) ?? "");
  const [issuingAuthority, setIssuingAuthority] = React.useState(initialRow?.issuingAuthority ?? "");
  const [remarks, setRemarks] = React.useState(initialRow?.remarks ?? "");
  const [error, setError] = React.useState("");
  const contracts = useContracts({ page: 1, limit: 100, cmsWorkId: workId || "unselected" });
  const contractOptions = contracts.data?.items ?? [];
  const createApplication = useCreateCompletionCertificate(workId);
  const updateApplication = useUpdateCompletionCertificate(workId, initialRow?.recordId ?? "");
  const saving = createApplication.isPending || updateApplication.isPending;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!workId || !contractId || !applicationDate || !actualCompletionDate) {
      setError("Project, contract, application date and actual completion date are required.");
      return;
    }
    try {
      const input = {
        source,
        applicationDate,
        actualCompletionDate,
        certifiedCompletionDate: certifiedCompletionDate || undefined,
        certificateDate: obtainedOn || undefined,
        issuingAuthority: issuingAuthority.trim() || undefined,
        remarks: remarks.trim() || undefined,
      };
      if (initialRow?.recordId) {
        await updateApplication.mutateAsync(input);
      } else {
        await createApplication.mutateAsync({ ...input, contractId });
      }
      onSaved();
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b49]/35 p-4" role="dialog" aria-modal="true" aria-label={initialRow?.recordId ? "Edit WCC application" : "New WCC application"}>
      <form onSubmit={submit} className="w-full max-w-[720px] overflow-hidden rounded-[8px] border border-[#dce4ef] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e8f1] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-[#071b49]">{initialRow?.recordId ? "Update WCC Application" : "New WCC Application"}</h2>
            <p className="mt-1 text-[10px] text-[#60718e]">Record the project completion source and application details.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#f1f5fa]"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid max-h-[68vh] grid-cols-1 gap-4 overflow-y-auto p-5 sm:grid-cols-2">
          <SelectControl label="Project *" value={workId} disabled={Boolean(initialRow?.recordId)} onChange={(value) => { setWorkId(value); setContractId(""); }}>
            <option value="">Select project</option>
            {applicationProjects.map((project) => <option key={project.id} value={project.id}>{project.workName}</option>)}
          </SelectControl>
          <SelectControl label="Contract / Work Order *" value={contractId} disabled={Boolean(initialRow?.recordId)} onChange={setContractId}>
            <option value="">{contracts.isLoading ? "Loading contracts..." : "Select contract"}</option>
            {contractOptions.map((contract) => <option key={contract.id} value={contract.id}>{contract.contractNo}</option>)}
          </SelectControl>
          <SelectControl label="Source *" value={source} onChange={(value) => setSource(value as WccSource)}>
            <option value="EGP">e-GP</option>
            <option value="MANUAL">Manual</option>
          </SelectControl>
          <label className="block">
            <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">Application Date *</span>
            <input type="date" required value={applicationDate} onChange={(event) => setApplicationDate(event.target.value)} className={CONTROL_CLASS} />
          </label>
          <label className="block">
            <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">Actual Completion Date *</span>
            <input type="date" required value={actualCompletionDate} onChange={(event) => setActualCompletionDate(event.target.value)} className={CONTROL_CLASS} />
          </label>
          <label className="block">
            <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">WCC Obtained On</span>
            <input type="date" value={obtainedOn} onChange={(event) => setObtainedOn(event.target.value)} className={CONTROL_CLASS} />
          </label>
          <label className="block">
            <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">Certified Completion Date</span>
            <input type="date" value={certifiedCompletionDate} onChange={(event) => setCertifiedCompletionDate(event.target.value)} className={CONTROL_CLASS} />
          </label>
          {source === "MANUAL" && (
            <p className="rounded-md border border-[#dce8fa] bg-[#f2f7ff] px-3 py-2 text-[9px] leading-relaxed text-[#31527e] sm:col-span-2">
              e-GP follow-up becomes available after the manual WCC is approved.
            </p>
          )}
          <label className="block sm:col-span-2">
            <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">Issuing Authority</span>
            <input value={issuingAuthority} onChange={(event) => setIssuingAuthority(event.target.value)} placeholder="Enter issuing authority" className={CONTROL_CLASS} />
          </label>
          <label className="block sm:col-span-2">
            <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">Remarks</span>
            <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="Optional remarks" className="min-h-[72px] w-full resize-y rounded-[5px] border border-[#dbe3ef] bg-white px-3 py-2 text-[10px] text-[#10244c] outline-none focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10" />
          </label>
          {error && <p className="sm:col-span-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#e2e8f1] px-5 py-4">
          <button type="button" onClick={onClose} className="h-9 rounded-[5px] border border-[#d9e1ed] bg-white px-4 text-[10px] font-semibold text-[#33496f] hover:bg-[#f7f9fc]">Cancel</button>
          <button type="submit" disabled={saving} className="h-9 rounded-[5px] bg-[#0765e9] px-5 text-[10px] font-semibold text-white hover:bg-[#0458ce] disabled:opacity-50">{saving ? "Saving..." : initialRow?.recordId ? "Update Application" : "Save Application"}</button>
        </div>
      </form>
    </div>
  );
}

function DetailsDialog({ row, onClose }: { row: WorkCompletionCertificateListRow; onClose: () => void }) {
  const fields = [
    ["Tender ID", row.tid],
    ["Project", row.project],
    ["Procuring Entity", row.procuringEntity],
    ["Work Description", row.workDescription],
    ["Contract No.", row.contractNo ?? "-"],
    ["Work Status", PROJECT_STATUS_LABEL[row.projectStatus]],
    ["Actual Completion Date", formatDate(row.actualCompletionDate)],
    ["WCC Status", STATUS_LABEL[row.status]],
    ["Source", row.source === "EGP" ? "e-GP" : row.source === "MANUAL" ? "Manual" : "-"],
    ["WCC Obtained On", formatDate(row.obtainedOn)],
    ["Certificate No.", row.certificateNo ?? "-"],
    ["Certificate Date", formatDate(row.certificateDate)],
    ["Certified Completion Date", formatDate(row.certifiedCompletionDate)],
    ["EGP Applied On", formatDate(row.egpAppliedOn)],
    ["EGP Status", row.egpStatus ? EGP_STATUS_LABEL[row.egpStatus] : "-"],
    ["Issuing Authority", row.issuingAuthority ?? "-"],
    ["Last Updated", formatDate(row.lastUpdated)],
  ];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b49]/35 p-4" role="dialog" aria-modal="true" aria-label="WCC details">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[8px] border border-[#dce4ef] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e8f1] px-5 py-4">
          <div><h2 className="text-[15px] font-bold text-[#071b49]">Work Completion Certificate</h2><p className="mt-1 text-[10px] text-[#60718e]">{row.tid}</p></div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#f1f5fa]"><X className="h-4 w-4" /></button>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-5 sm:grid-cols-2">
          {fields.map(([label, value]) => <div key={label}><dt className="text-[9px] text-[#71819b]">{label}</dt><dd className="mt-1 text-[11px] font-semibold text-[#10244c]">{value}</dd></div>)}
        </dl>
      </div>
    </div>
  );
}

function WorkflowDialog({
  row,
  canUpdate,
  canSubmit,
  canApprove,
  onEdit,
  onClose,
}: {
  row: WorkCompletionCertificateListRow;
  canUpdate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  onEdit: () => void;
  onClose: () => void;
}) {
  const certificateId = row.recordId ?? "";
  const statusMutation = useCompletionCertificateStatus(row.workId, certificateId);
  const egpMutation = useUpdateCompletionCertificateEgpTracking();
  const [remarks, setRemarks] = React.useState(row.remarks ?? "");
  const [egpStatus, setEgpStatus] = React.useState<"PENDING" | "UNDER_PROCESS" | "OBTAINED">(
    row.egpStatus === "UNDER_PROCESS" || row.egpStatus === "OBTAINED"
      ? row.egpStatus
      : "PENDING",
  );
  const [egpAppliedOn, setEgpAppliedOn] = React.useState(row.egpAppliedOn?.slice(0, 10) ?? isoToday());
  const [egpObtainedOn, setEgpObtainedOn] = React.useState("");
  const [error, setError] = React.useState("");
  const pending = statusMutation.isPending || egpMutation.isPending;
  const projectAllowsChanges = !["COMPLETED", "ARCHIVED", "CANCELLED"].includes(row.projectStatus);
  const editable = projectAllowsChanges && (row.coreStatus === "DRAFT" || row.coreStatus === "REJECTED");
  const canTrackEgp =
    projectAllowsChanges &&
    canUpdate &&
    row.coreStatus === "APPROVED" &&
    row.source === "MANUAL" &&
    row.egpStatus !== "OBTAINED";

  async function changeStatus(status: "SUBMITTED" | "APPROVED" | "REJECTED") {
    setError("");
    try {
      await statusMutation.mutateAsync({ status, remarks: remarks.trim() || undefined });
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function saveEgpTracking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await egpMutation.mutateAsync({
        certificateId,
        input: {
          egpStatus,
          egpAppliedOn,
          egpObtainedOn: egpStatus === "OBTAINED" ? egpObtainedOn || undefined : undefined,
          remarks: remarks.trim() || undefined,
        },
      });
      onClose();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#071b49]/35 p-4" role="dialog" aria-modal="true" aria-label="WCC workflow actions">
      <div className="w-full max-w-[520px] overflow-hidden rounded-[8px] border border-[#dce4ef] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#e2e8f1] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-bold text-[#071b49]">WCC Workflow</h2>
            <p className="mt-1 text-[10px] text-[#60718e]">{row.tid} · {row.project}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-[#f1f5fa]"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-4 p-5">
          <div className="flex items-center justify-between rounded-md border border-[#e2e8f1] bg-[#f8faff] px-3 py-2.5 text-[10px]">
            <span className="text-[#60718e]">Approval status</span>
            <span className="font-semibold text-[#10244c]">{row.coreStatus?.replaceAll("_", " ") ?? "Not available"}</span>
          </div>
          <label className="block">
            <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">Workflow Remarks</span>
            <textarea value={remarks} onChange={(event) => setRemarks(event.target.value)} className="min-h-[68px] w-full resize-y rounded-[5px] border border-[#dbe3ef] px-3 py-2 text-[10px] text-[#10244c] outline-none focus:border-[#1769e8]" />
          </label>

          {canTrackEgp && (
            <form onSubmit={saveEgpTracking} className="grid grid-cols-1 gap-3 rounded-md border border-[#dce8fa] bg-[#f7faff] p-3 sm:grid-cols-2">
              <div className="sm:col-span-2 text-[10px] font-semibold text-[#17365f]">Manual WCC · e-GP Follow-up</div>
              <SelectControl label="e-GP Status" value={egpStatus} onChange={(value) => setEgpStatus(value as "PENDING" | "UNDER_PROCESS" | "OBTAINED")}>
                <option value="PENDING">Pending</option>
                <option value="UNDER_PROCESS">Under Process</option>
                <option value="OBTAINED">EGP Obtained</option>
              </SelectControl>
              <label className="block">
                <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">e-GP Applied On *</span>
                <input type="date" required value={egpAppliedOn} onChange={(event) => setEgpAppliedOn(event.target.value)} className={CONTROL_CLASS} />
              </label>
              {egpStatus === "OBTAINED" && (
                <label className="block sm:col-span-2">
                  <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">e-GP Obtained On *</span>
                  <input type="date" required value={egpObtainedOn} onChange={(event) => setEgpObtainedOn(event.target.value)} className={CONTROL_CLASS} />
                </label>
              )}
              <button type="submit" disabled={pending} className="h-9 rounded-[5px] bg-[#0765e9] px-4 text-[10px] font-semibold text-white disabled:opacity-50 sm:col-span-2">Save e-GP Tracking</button>
            </form>
          )}

          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{error}</p>}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-[#e2e8f1] px-5 py-4">
          {editable && canUpdate && <button type="button" onClick={onEdit} className="h-9 rounded-[5px] border border-[#d9e1ed] px-4 text-[10px] font-semibold text-[#33496f]">Edit Application</button>}
          {editable && canSubmit && <button type="button" disabled={pending} onClick={() => void changeStatus("SUBMITTED")} className="h-9 rounded-[5px] bg-[#0765e9] px-4 text-[10px] font-semibold text-white disabled:opacity-50">Submit for Review</button>}
          {projectAllowsChanges && row.coreStatus === "SUBMITTED" && canApprove && (
            <>
              <button type="button" disabled={pending} onClick={() => void changeStatus("REJECTED")} className="h-9 rounded-[5px] border border-[#f0c7cc] px-4 text-[10px] font-semibold text-[#cf3547] disabled:opacity-50">Return</button>
              <button type="button" disabled={pending} onClick={() => void changeStatus("APPROVED")} className="h-9 rounded-[5px] bg-[#1f9f50] px-4 text-[10px] font-semibold text-white disabled:opacity-50">Approve</button>
            </>
          )}
          <button type="button" onClick={onClose} className="h-9 rounded-[5px] border border-[#d9e1ed] bg-white px-4 text-[10px] font-semibold text-[#33496f]">Close</button>
        </div>
      </div>
    </div>
  );
}

export function WorkCompletionCertificatesWorkspace() {
  useSetBreadcrumb([
    { label: "Projects", href: "/cms/ongoing-works" },
    { label: "Project Documentation", href: "/cms/documentation" },
    { label: "Work Completion Certificate" },
  ]);

  const searchParams = useSearchParams();
  const requestedWorkId = searchParams.get("workId") ?? "";
  const openCreateOnLoad = searchParams.get("create") === "1";
  const me = useMe();
  const permissions = me.data?.permissions ?? [];
  const canCreate = permissions.includes("completion_certificate.create");
  const canUpdate = permissions.includes("completion_certificate.update");
  const canSubmit = permissions.includes("completion_certificate.submit");
  const canApprove = permissions.includes("completion_certificate.approve");
  const canDownload = permissions.includes("documents.download");
  const [searchDraft, setSearchDraft] = React.useState("");
  const [filters, setFilters] = React.useState<AppliedFilters>({ search: "", projectId: "", status: "", source: "", egpStatus: "" });
  const [page, setPage] = React.useState(1);
  const dataSource = useWorkCompletionCertificatePageData(filters, page);
  const [viewing, setViewing] = React.useState<WorkCompletionCertificateListRow | null>(null);
  const [workflowing, setWorkflowing] = React.useState<WorkCompletionCertificateListRow | null>(null);
  const [application, setApplication] = React.useState<ApplicationState | null>(() =>
    openCreateOnLoad ? { workId: requestedWorkId, row: null } : null,
  );
  const [downloadError, setDownloadError] = React.useState("");

  const pageCount = Math.max(1, dataSource.totalPages);
  const visibleRows = dataSource.rows;
  const startEntry = dataSource.totalRows ? (page - 1) * PAGE_SIZE + 1 : 0;
  const endEntry = Math.min(page * PAGE_SIZE, dataSource.totalRows);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) =>
        current.search === searchDraft ? current : { ...current, search: searchDraft },
      );
      setPage(1);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  function updateFilter<Key extends keyof AppliedFilters>(
    key: Key,
    value: AppliedFilters[Key],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function resetFilters() {
    setSearchDraft("");
    setFilters({ search: "", projectId: "", status: "", source: "", egpStatus: "" });
    setPage(1);
  }

  async function download(row: WorkCompletionCertificateListRow) {
    if (!row.documentId || !canDownload) return;
    setDownloadError("");
    try {
      const file = await downloadDocument(row.documentId);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName ?? `work-completion-certificate-${row.tid}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("The certificate file could not be downloaded.");
    }
  }

  return (
    <div className="min-h-full bg-[#f8faff] pb-4 pt-2 text-[#0b1f4b]">
      <div className="mb-4 pt-1">
        <h1 className="text-[25px] font-bold leading-tight tracking-[-0.02em] text-[#071b49]">Work Completion Certificate</h1>
        <p className="mt-1 text-[11px] text-[#40577f]">Completed projects and their work completion certificate status</p>
      </div>

      <section className="rounded-[8px] border border-[#dce5f1] bg-gradient-to-r from-white to-[#f8fbff] px-4 py-3 shadow-[0_3px_12px_rgba(15,34,70,0.04)]">
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1.15fr_1fr_0.9fr_0.82fr_1fr_40px]">
          <label className="block min-w-0">
            <span className="mb-[6px] block text-[9px] font-medium text-[#33496f]">Search by TID</span>
            <span className="relative block">
              <input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Enter Tender ID (TID)" className={cn(CONTROL_CLASS, "border-[#d8e2ef] bg-white pr-9 shadow-sm placeholder:text-[#8a98ad] focus:border-[#1769e8] focus:ring-2 focus:ring-[#1769e8]/10")} />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#1769e8]" />
            </span>
          </label>
          <SelectControl label="Project" value={filters.projectId} onChange={(value) => updateFilter("projectId", value)}>
            <option value="">All Projects</option>
            {dataSource.projects.map((project) => <option key={project.id} value={project.id}>{project.workName}</option>)}
          </SelectControl>
          <SelectControl label="WCC Status" value={filters.status} onChange={(value) => updateFilter("status", value as "" | WccStatus)}>
            <option value="">All Status</option>
            {STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectControl>
          <SelectControl label="Source" value={filters.source} onChange={(value) => updateFilter("source", value as "" | WccSource)}>
            <option value="">All Sources</option><option value="EGP">e-GP</option><option value="MANUAL">Manual</option>
          </SelectControl>
          <SelectControl label="EGP Status (For Manual)" value={filters.egpStatus} onChange={(value) => updateFilter("egpStatus", value as "" | WccEgpStatus)}>
            <option value="">All EGP Status</option>
            {EGP_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectControl>
          <button type="button" onClick={resetFilters} aria-label="Reset filters" title="Reset filters" className="inline-flex h-[36px] w-full items-center justify-center gap-2 rounded-[6px] border border-[#d8e2ef] bg-white text-[10px] font-semibold text-[#50627f] shadow-sm transition hover:border-[#aac6ee] hover:bg-[#f2f7ff] hover:text-[#075fdf] sm:w-[40px] xl:w-[40px]"><RotateCcw className="h-3.5 w-3.5" /><span className="sm:hidden">Reset</span></button>
        </div>
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total Projects" value={dataSource.stats.totalProjects} tone="blue" icon={FileText} />
        <KpiCard label="WCC Obtained" value={dataSource.stats.wccObtained} tone="green" icon={ShieldCheck} />
        <KpiCard label="Obtained (EGP)" value={dataSource.stats.obtainedEgp} tone="green" textIcon="e-GP" />
        <KpiCard label="Obtained (Manual)" value={dataSource.stats.obtainedManual} tone="orange" icon={Award} />
        <KpiCard label="EGP Applied (For Manual)" value={dataSource.stats.egpAppliedForManual} tone="purple" icon={Workflow} />
        <KpiCard label="Without WCC" value={dataSource.stats.withoutWcc} tone="red" icon={ClipboardCheck} />
      </section>

      {(dataSource.error || downloadError) && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[10px] text-red-700">{dataSource.error ?? downloadError}</div>}

      <section className="mt-3 overflow-hidden rounded-[7px] border border-[#dfe6f1] bg-white shadow-[0_1px_2px_rgba(15,34,70,0.02)]">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] table-fixed text-left text-[9.5px] text-[#10244c]">
            <colgroup>
              <col className="w-[45px]" />
              <col className="w-[120px]" />
              <col className="w-[260px]" />
              <col className="w-[170px]" />
              <col className="w-[190px]" />
              <col className="w-[150px]" />
              <col className="w-[100px]" />
            </colgroup>
            <thead>
              <tr className="h-[36px] border-b border-[#e2e8f1] bg-[#fbfcfe] text-[9.5px] font-semibold text-[#172c53]">
                {[
                  "SL",
                  "Tender ID",
                  "Work Name",
                  "Completion Status",
                  "Certificate Status",
                  "Completion Date",
                  "Action",
                ].map((header) => (
                  <th key={header} className="px-3 py-2">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dataSource.isLoading ? (
                <tr>
                  <td colSpan={7} className="h-[90px] text-center text-[10px] text-[#6d7e99]">
                    Loading completed projects...
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className="min-h-[54px] border-b border-[#e6ebf2] align-middle last:border-0 hover:bg-[#fbfdff]"
                  >
                    <td className="px-3 py-2.5">{(page - 1) * PAGE_SIZE + index + 1}</td>
                    <td className="break-words px-3 py-2.5 font-semibold">{row.tid}</td>
                    <td className="truncate px-3 py-2.5 font-semibold" title={row.project}>
                      {row.project}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex max-w-full whitespace-nowrap rounded-[4px] px-2 py-[4px] text-[8px] font-semibold leading-none",
                          PROJECT_STATUS_CLASS[row.projectStatus],
                        )}
                      >
                        {PROJECT_STATUS_LABEL[row.projectStatus]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          "inline-flex max-w-full whitespace-nowrap rounded-[4px] px-2 py-[4px] text-[8px] font-semibold leading-none",
                          STATUS_CLASS[row.status],
                        )}
                      >
                        {STATUS_LABEL[row.status]}
                      </span>
                      {row.coreStatus && (
                        <p className="mt-1 text-[8px] text-[#71819b]">
                          {CORE_STATUS_LABEL[row.coreStatus]}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium">{formatDate(row.actualCompletionDate)}</td>
                    <td className="px-3">
                      {row.status === "NOT_APPLIED" ? (
                        <button
                          type="button"
                          disabled={
                            !canCreate ||
                            ["COMPLETED", "ARCHIVED", "CANCELLED"].includes(row.projectStatus)
                          }
                          onClick={() => setApplication({ workId: row.workId, row: null })}
                          aria-label={`Create WCC application for ${row.project}`}
                          title={
                            ["COMPLETED", "ARCHIVED", "CANCELLED"].includes(row.projectStatus)
                              ? "Reopen this project before creating a WCC application"
                              : "New WCC application"
                          }
                          className="inline-flex h-[27px] w-[27px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5] disabled:opacity-40"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setViewing(row)}
                            aria-label={`View ${row.project} WCC`}
                            title="View"
                            className="flex h-[27px] w-[27px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5]"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={!row.documentId || !canDownload}
                            onClick={() => void download(row)}
                            aria-label={`Download ${row.project} WCC`}
                            title={row.documentId ? "Download" : "No certificate file"}
                            className="flex h-[27px] w-[27px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5] disabled:opacity-40"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={!canUpdate && !canSubmit && !canApprove}
                            onClick={() => setWorkflowing(row)}
                            aria-label={`More actions for ${row.project} WCC`}
                            title="Workflow actions"
                            className="flex h-[27px] w-[27px] items-center justify-center rounded-[5px] border border-[#dce4ef] hover:border-[#0b63e5] hover:text-[#0b63e5] disabled:opacity-40"
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
              {!dataSource.isLoading && !visibleRows.length && (
                <tr>
                  <td colSpan={7} className="h-[90px] text-center text-[10px] text-[#6d7e99]">
                    No completed projects found.
                  </td>
                </tr>
              )}
              {!dataSource.isLoading &&
                visibleRows.length > 0 &&
                visibleRows.length < PAGE_SIZE && (
                  <tr aria-hidden="true" className="pointer-events-none">
                    <td
                      colSpan={7}
                      style={{ height: `${(PAGE_SIZE - visibleRows.length) * 54}px` }}
                    />
                  </tr>
                )}
            </tbody>
          </table>
        </div>
        <div className="flex min-h-[52px] flex-wrap items-center justify-between gap-3 border-t border-[#e2e8f1] px-3 text-[9px] text-[#40577f]"><span>Showing {startEntry} to {endEntry} of {dataSource.totalRows} entries</span><div className="flex items-center gap-2"><button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page" className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] disabled:text-[#bcc6d5]"><ChevronLeft className="h-4 w-4" /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" onClick={() => setPage(pageNumber)} className={cn("flex h-[28px] min-w-[28px] items-center justify-center rounded-[5px] border px-2 font-semibold", page === pageNumber ? "border-[#0765e9] bg-[#0765e9] text-white" : "border-[#dce4ef] bg-white text-[#10244c]")}>{pageNumber}</button>)}<button type="button" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} aria-label="Next page" className="flex h-[28px] w-[28px] items-center justify-center rounded-[5px] border border-[#dce4ef] disabled:text-[#bcc6d5]"><ChevronRight className="h-4 w-4" /></button></div></div>
      </section>

      <section className="mt-3 rounded-[6px] border border-[#dfe6f1] bg-white px-3 py-2.5"><h2 className="text-[9.5px] font-semibold text-[#172b55]">Status Legend</h2><div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[8.5px] text-[#40577f]">{[["WCC Obtained (EGP)", "bg-[#28a655]"], ["WCC Obtained (Manual)", "bg-[#f39a1b]"], ["EGP Applied (For Manual)", "bg-[#814ee8]"], ["Manual WCC Obtained, EGP Applied", "bg-[#9a67e8]"], ["Manual WCC Obtained, EGP Not Applied", "bg-[#1767c9]"], ["WCC Applied", "bg-[#e5a712]"], ["Not Applied", "bg-[#e14958]"]].map(([label, color]) => <span key={label} className="inline-flex items-center gap-2"><span className={cn("h-1.5 w-1.5 rounded-full", color)} />{label}</span>)}</div></section>

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[1.55fr_1fr]">
        <section className="flex min-h-[68px] items-start gap-3 rounded-[6px] border border-[#dce8fa] bg-[#f2f7ff] px-4 py-3"><Info className="mt-0.5 h-[17px] w-[17px] shrink-0 text-[#1267df]" /><div><h2 className="text-[9.5px] font-semibold text-[#172b55]">Notes:</h2><ul className="mt-1 list-disc space-y-0.5 pl-4 text-[8.5px] leading-[1.45] text-[#314b78]"><li>If WCC is obtained manually, you can apply for e-GP.</li><li>After applying for e-GP, you can track the status until e-GP WCC is obtained.</li></ul></div></section>
        <section className="min-h-[68px] rounded-[6px] border border-[#dfe6f1] bg-white px-4 py-3"><h2 className="text-[9.5px] font-semibold text-[#172b55]">Source Guide</h2><div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2 text-[8.5px] text-[#314b78]"><span className="inline-flex items-center gap-2"><span className="rounded-[4px] bg-[#e8f8ec] px-2 py-1 font-semibold text-[#249b4a]">e-GP</span>= Work Completion via e-GP</span><span className="inline-flex items-center gap-2"><span className="rounded-[4px] bg-[#fff3df] px-2 py-1 font-semibold text-[#b66c0d]">Manual</span>= Work Completion via Manual Process</span></div></section>
      </div>

      {application && <ApplicationDialog state={application} projects={dataSource.projects} onClose={() => setApplication(null)} onSaved={() => setPage(1)} />}
      {viewing && <DetailsDialog row={viewing} onClose={() => setViewing(null)} />}
      {workflowing && (
        <WorkflowDialog
          row={workflowing}
          canUpdate={canUpdate}
          canSubmit={canSubmit}
          canApprove={canApprove}
          onEdit={() => {
            setApplication({ workId: workflowing.workId, row: workflowing });
            setWorkflowing(null);
          }}
          onClose={() => setWorkflowing(null)}
        />
      )}
    </div>
  );
}
