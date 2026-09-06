"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Award,
  Calendar,
  ChevronDown,
  ClipboardList,
  Eye,
  FileBadge2,
  FileText,
  Info,
  MoreVertical,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useChallanSubmissions,
  useChallanSubmissionStats,
  useCmsWorks,
  useMe,
  useVatTaxCertificates,
  useVatTaxCertificateStats,
} from "@bizovix/api-client";
import type {
  ChallanSubmissionRecord,
  ChallanSubmissionStatus,
  VatTaxCertificateRecord,
  VatTaxCertificateStatus,
} from "@bizovix/types";
import {
  DataTable,
  IconButton,
  ModuleStatCard,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
  cn,
  type DataTableColumn,
  type StatusBadgeTone,
} from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  BILL_SUBMISSION_ROWS,
  DOCUMENT_KPI_TOTALS,
  WORK_COMPLETION_CERT_ROWS,
  type BillStatus,
  type BillSubmissionRow,
  type WccSource,
  type WccStatus,
  type WorkCompletionCertRow,
} from "./mock-data";

const BILL_STATUS_TONE: Record<BillStatus, StatusBadgeTone> = {
  Approved: "success",
  "Under Review": "warning",
};
const CHALLAN_STATUS_TONE: Record<ChallanSubmissionStatus, StatusBadgeTone> = {
  DRAFT: "neutral",
  SUBMITTED: "info",
  UNDER_REVIEW: "warning",
  APPROVED: "success",
  PAYMENT_RELEASED: "success",
  REJECTED: "danger",
  CANCELLED: "neutral",
};
const CERT_STATUS_TONE: Record<VatTaxCertificateStatus, StatusBadgeTone> = {
  ISSUED: "success",
  UNDER_PROCESSING: "info",
  PENDING: "warning",
  NOT_ISSUED: "neutral",
  REJECTED: "danger",
  RETURNED: "danger",
};
const WCC_STATUS_TONE: Record<WccStatus, StatusBadgeTone> = {
  Issued: "success",
  "In Progress": "info",
};
const WCC_SOURCE_TONE: Record<WccSource, StatusBadgeTone> = { "e-GP": "success", Manual: "info" };

function challanStatusLabel(status: ChallanSubmissionStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function certificateStatusLabel(status: VatTaxCertificateStatus) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

const DOC_TYPE_OPTIONS = [
  { label: "Bill Submission", value: "bill" },
  { label: "Challan Submission", value: "challan" },
  { label: "VAT-Tax Certificate", value: "vat-tax" },
  { label: "Work Completion Certificate", value: "wcc" },
];

const ADD_BUTTON_BASE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-[12.5px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50";

type ViewingDetail = { title: string; fields: Array<[string, string]> } | null;

interface DocumentPanelProps<T> {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  subtitle: string;
  search: string;
  onSearchChange: (value: string) => void;
  addLabel: string;
  addButtonClassName: string;
  onAdd?: () => void;
  data: T[];
  rowKey: (row: T) => string;
  columns: DataTableColumn<T>[];
  extraContent?: React.ReactNode;
  footerLabel: string;
  onFooterClick?: () => void;
}

function DocumentPanel<T>({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  search,
  onSearchChange,
  addLabel,
  addButtonClassName,
  onAdd,
  data,
  rowKey,
  columns,
  extraContent,
  footerLabel,
  onFooterClick,
}: DocumentPanelProps<T>) {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-biz-border bg-biz-surface shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              iconClassName,
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[14px] font-semibold text-biz-text">{title}</h3>
            <p className="truncate text-[11.5px] text-biz-muted">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TextInput
            icon={Search}
            placeholder="Search by TID"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-9 w-[150px] text-[12.5px]"
          />
          <button
            type="button"
            title={onAdd ? addLabel : `${addLabel} (not yet available)`}
            onClick={onAdd}
            disabled={!onAdd}
            className={cn(ADD_BUTTON_BASE, addButtonClassName)}
          >
            + {addLabel}
          </button>
        </div>
      </div>

      <DataTable<T> data={data} rowKey={rowKey} columns={columns} />

      {extraContent}

      <button
        type="button"
        onClick={onFooterClick}
        disabled={!onFooterClick}
        title={onFooterClick ? undefined : `${footerLabel} (not yet available)`}
        className="flex shrink-0 items-center gap-1 border-t border-biz-border px-4 py-2.5 text-[12px] font-semibold text-biz-blue transition-colors hover:text-biz-blue-hover disabled:cursor-not-allowed disabled:text-biz-muted disabled:hover:text-biz-muted"
      >
        {footerLabel}
        <span aria-hidden>&rarr;</span>
      </button>
    </div>
  );
}

function actionColumn<T>(onView: (row: T) => void): DataTableColumn<T> {
  return {
    key: "action",
    header: "Action",
    render: (row) => (
      <div className="flex items-center justify-center gap-1">
        <IconButton aria-label="View" title="View" onClick={() => onView(row)} className="h-7 w-7">
          <Eye className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton aria-label="More actions" title="More actions" className="h-7 w-7">
          <MoreVertical className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    ),
  };
}

export default function ProjectDocumentationPage() {
  useSetBreadcrumb([{ label: "Projects", href: "/cms" }, { label: "Project Documentation" }]);
  const router = useRouter();
  const me = useMe();
  const permissions = me.data?.permissions ?? [];
  const canReadVatTax = permissions.includes("vat_tax_certificate.read");
  const canCreateVatTax = permissions.includes("vat_tax_certificate.create");

  const projects = useCmsWorks({ limit: 100, includeClosed: true });
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = React.useState(false);

  const projectList = projects.data?.items ?? [];
  const selectedProject =
    projectList.find((p) => p.id === selectedProjectId) ?? projectList[0] ?? null;

  const [tid, setTid] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [docType, setDocType] = React.useState("");
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);

  const [billSearch, setBillSearch] = React.useState("");
  const [challanSearch, setChallanSearch] = React.useState("");
  const [vatTaxSearch, setVatTaxSearch] = React.useState("");
  const [wccSearch, setWccSearch] = React.useState("");
  const [sourceType, setSourceType] = React.useState<"e-GP" | "Manual">("e-GP");

  const [viewing, setViewing] = React.useState<ViewingDetail>(null);
  const challans = useChallanSubmissions({
    limit: 100,
    cmsWorkId: selectedProject?.id,
    search: challanSearch.trim() || tid.trim() || undefined,
    dateFrom: fromDate || undefined,
    dateTo: toDate || undefined,
  });
  const challanStats = useChallanSubmissionStats(selectedProject?.id);
  const vatTaxCertificates = useVatTaxCertificates(
    {
      limit: 100,
      cmsWorkId: selectedProject?.id,
      search: vatTaxSearch.trim() || tid.trim() || undefined,
      dateFrom: fromDate || undefined,
      dateTo: toDate || undefined,
    },
    Boolean(selectedProject?.id) && canReadVatTax,
  );
  const vatTaxStats = useVatTaxCertificateStats(
    {
      cmsWorkId: selectedProject?.id,
      search: tid.trim() || undefined,
      dateFrom: fromDate || undefined,
      dateTo: toDate || undefined,
    },
    Boolean(selectedProject?.id) && canReadVatTax,
  );

  const matchesGlobal = React.useCallback(
    (rowTid: string, dateField: string) => {
      const term = tid.trim().toLowerCase();
      if (term && !rowTid.toLowerCase().includes(term)) return false;
      if (fromDate && dateField < fromDate) return false;
      if (toDate && dateField > toDate) return false;
      return true;
    },
    [tid, fromDate, toDate],
  );

  function applyFilters() {
    // filters are applied live via the memoized lists below; this just exists
    // so the Search button reads as a deliberate action, matching the rest
    // of the app's filter-panel convention.
  }

  function resetFilters() {
    setTid("");
    setFromDate("");
    setToDate("");
    setDocType("");
    setBillSearch("");
    setChallanSearch("");
    setVatTaxSearch("");
    setWccSearch("");
  }

  const billRows = React.useMemo(
    () =>
      BILL_SUBMISSION_ROWS.filter(
        (row) =>
          matchesGlobal(row.tid, row.billDate) &&
          (!billSearch.trim() || row.tid.toLowerCase().includes(billSearch.trim().toLowerCase())),
      ),
    [matchesGlobal, billSearch],
  );
  const challanRows = React.useMemo(() => {
    const cardTerm = challanSearch.trim().toLowerCase();
    return (challans.data?.items ?? []).filter((row) => {
      const rowTid = row.contract?.tender?.egpTenderId ?? row.contract?.contractNo ?? "";
      if (!matchesGlobal(rowTid, row.challanDate.slice(0, 10))) return false;
      if (!cardTerm) return true;
      return [rowTid, row.challanNo, row.description, row.cmsWork.workName].some((value) =>
        value.toLowerCase().includes(cardTerm),
      );
    });
  }, [challans.data?.items, matchesGlobal, challanSearch]);
  const vatTaxRows = React.useMemo(() => {
    const term = vatTaxSearch.trim().toLowerCase();
    return (vatTaxCertificates.data?.items ?? []).filter((row) => {
      if (!term) return true;
      return [
        row.tender?.egpTenderId ?? "",
        row.cmsWork.workName,
        row.certificateNo ?? "",
      ].some((value) => value.toLowerCase().includes(term));
    });
  }, [vatTaxCertificates.data?.items, vatTaxSearch]);
  // Source Type below the table is the source for a *new* WCC entry, not a
  // filter on the existing rows — the reference shows both e-GP and Manual
  // rows displayed together while "e-GP" is selected.
  const wccRows = React.useMemo(
    () =>
      WORK_COMPLETION_CERT_ROWS.filter(
        (row) =>
          matchesGlobal(row.tid, row.completionDate) &&
          (!wccSearch.trim() || row.tid.toLowerCase().includes(wccSearch.trim().toLowerCase())),
      ),
    [matchesGlobal, wccSearch],
  );

  const showBill = !docType || docType === "bill";
  const showChallan = !docType || docType === "challan";
  const showVatTax = (!docType || docType === "vat-tax") && canReadVatTax;
  const vatTaxHref = selectedProject
    ? `/cms/documentation/vat-tax-certificate?workId=${encodeURIComponent(selectedProject.id)}`
    : "/cms/documentation/vat-tax-certificate";
  const vatTaxCreateHref = `${vatTaxHref}${vatTaxHref.includes("?") ? "&" : "?"}create=1`;
  const showWcc = !docType || docType === "wcc";

  const billColumns: DataTableColumn<BillSubmissionRow>[] = [
    { key: "tid", header: "TID", render: (row) => row.tid },
    { key: "billNo", header: "Bill No", render: (row) => row.billNo },
    { key: "billDate", header: "Bill Date", render: (row) => formatDate(row.billDate) },
    { key: "workDescription", header: "Work Description", render: (row) => row.workDescription },
    { key: "billAmount", header: "Bill Amount (BDT)", render: (row) => formatBDT(row.billAmount) },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge label={row.status} tone={BILL_STATUS_TONE[row.status]} />,
    },
    actionColumn<BillSubmissionRow>((row) =>
      setViewing({
        title: row.tid,
        fields: [
          ["Bill No", row.billNo],
          ["Bill Date", formatDate(row.billDate)],
          ["Work Description", row.workDescription],
          ["Bill Amount (BDT)", formatBDT(row.billAmount)],
          ["Status", row.status],
        ],
      }),
    ),
  ];

  const challanColumns: DataTableColumn<ChallanSubmissionRecord>[] = [
    {
      key: "tid",
      header: "TID",
      render: (row) => row.contract?.tender?.egpTenderId ?? row.contract?.contractNo ?? "—",
    },
    { key: "challanNo", header: "Challan No", render: (row) => row.challanNo },
    { key: "challanDate", header: "Challan Date", render: (row) => formatDate(row.challanDate) },
    { key: "description", header: "Description", render: (row) => row.description },
    { key: "amount", header: "Amount (BDT)", render: (row) => formatBDT(Number(row.totalAmount)) },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          label={challanStatusLabel(row.status)}
          tone={CHALLAN_STATUS_TONE[row.status]}
        />
      ),
    },
    actionColumn<ChallanSubmissionRecord>((row) =>
      router.push(`/cms/documentation/challan-submission?id=${encodeURIComponent(row.id)}`),
    ),
  ];

  const vatTaxColumns: DataTableColumn<VatTaxCertificateRecord>[] = [
    {
      key: "tid",
      header: "TID",
      render: (row) => row.tender?.egpTenderId ?? "—",
    },
    {
      key: "certificateNo",
      header: "Certificate No",
      render: (row) => row.certificateNo ?? "—",
    },
    {
      key: "issueDate",
      header: "Issue Date",
      render: (row) => (row.issueDate ? formatDate(row.issueDate) : "—"),
    },
    {
      key: "validTill",
      header: "Valid Till",
      render: (row) => (row.validTill ? formatDate(row.validTill) : "—"),
    },
    { key: "type", header: "Type", render: (row) => row.certificateType },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          label={certificateStatusLabel(row.status)}
          tone={CERT_STATUS_TONE[row.status]}
        />
      ),
    },
    actionColumn<VatTaxCertificateRecord>((row) =>
      setViewing({
        title: row.tender?.egpTenderId ?? row.cmsWork.workName,
        fields: [
          ["Project", row.cmsWork.workName],
          ["Certificate No", row.certificateNo ?? "—"],
          ["Issue Date", row.issueDate ? formatDate(row.issueDate) : "—"],
          ["Valid Till", row.validTill ? formatDate(row.validTill) : "—"],
          ["Type", row.certificateType],
          ["Status", certificateStatusLabel(row.status)],
        ],
      }),
    ),
  ];

  const wccColumns: DataTableColumn<WorkCompletionCertRow>[] = [
    { key: "tid", header: "TID", render: (row) => row.tid },
    { key: "wccNo", header: "WCC No", render: (row) => row.wccNo },
    {
      key: "completionDate",
      header: "Completion Date",
      render: (row) => formatDate(row.completionDate),
    },
    { key: "issuedOn", header: "Issued On", render: (row) => formatDate(row.issuedOn) },
    {
      key: "source",
      header: "Source",
      render: (row) => <StatusBadge label={row.source} tone={WCC_SOURCE_TONE[row.source]} />,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge label={row.status} tone={WCC_STATUS_TONE[row.status]} />,
    },
    actionColumn<WorkCompletionCertRow>((row) =>
      setViewing({
        title: row.tid,
        fields: [
          ["WCC No", row.wccNo],
          ["Completion Date", formatDate(row.completionDate)],
          ["Issued On", formatDate(row.issuedOn)],
          ["Source", row.source],
          ["Status", row.status],
        ],
      }),
    ),
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-page-title text-biz-text">Project Documentation</h1>
            <p className="mt-0.5 text-[12.5px] text-biz-muted">
              Manage all project related documents in one place
            </p>
          </div>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={() => setProjectPickerOpen((v) => !v)}
            className="flex items-center gap-3 rounded-lg border border-biz-border bg-biz-surface px-3 py-1.5 text-left"
          >
            <div>
              <p className="text-[10.5px] text-biz-muted">Select Project</p>
              <p className="text-[13px] font-semibold text-biz-text">
                {projects.isLoading
                  ? "Loading..."
                  : (selectedProject?.workName ?? "No projects found")}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-biz-muted" />
          </button>
          {projectPickerOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40"
                onClick={() => setProjectPickerOpen(false)}
                aria-label="Close"
              />
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-72 w-[280px] overflow-y-auto rounded-lg border border-biz-border bg-biz-surface py-1 shadow-card-hover">
                {projectList.length === 0 ? (
                  <p className="px-3 py-2.5 text-[12.5px] text-biz-muted">No projects found</p>
                ) : (
                  projectList.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setProjectPickerOpen(false);
                      }}
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-biz-bg",
                        project.id === selectedProject?.id && "bg-biz-blue-soft",
                      )}
                    >
                      <span className="text-[12.5px] font-medium text-biz-text">
                        {project.workName}
                      </span>
                      <span className="text-[11px] text-biz-muted">
                        {project.organizationMaster.shortName}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
        <ModuleStatCard
          icon={FileText}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Documents"
          value={String(
            DOCUMENT_KPI_TOTALS.billSubmissions +
              (challanStats.data?.total ?? 0) +
              (canReadVatTax ? (vatTaxStats.data?.total ?? 0) : 0) +
              DOCUMENT_KPI_TOTALS.workCompletionCert,
          )}
          helper="All types"
        />
        <ModuleStatCard
          icon={ClipboardList}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Bill Submissions"
          value={String(DOCUMENT_KPI_TOTALS.billSubmissions)}
          helper="This Project"
        />
        <ModuleStatCard
          icon={FileBadge2}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Challan Submissions"
          value={challanStats.isLoading ? "..." : String(challanStats.data?.total ?? 0)}
          helper="This Project"
        />
        <ModuleStatCard
          icon={Award}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="VAT-Tax Certificates"
          value={
            !canReadVatTax
              ? "—"
              : vatTaxStats.isLoading
                ? "..."
                : String(vatTaxStats.data?.total ?? 0)
          }
          helper={canReadVatTax ? "This Project" : "No access"}
        />
        <ModuleStatCard
          icon={ShieldCheck}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Work Completion Cert."
          value={String(DOCUMENT_KPI_TOTALS.workCompletionCert)}
          helper="Issued"
        />
      </div>

      {/* Global filter */}
      <div className="rounded-lg border border-biz-border bg-biz-surface p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Search by TID</label>
            <TextInput
              icon={Search}
              placeholder="Enter Tender ID (TID)"
              value={tid}
              onChange={(e) => setTid(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              className="w-[220px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Other Filters</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setDateRangeOpen((v) => !v)}
                className="flex h-11 w-[220px] items-center justify-between rounded-sm border border-biz-border bg-biz-surface px-3 text-[12.5px] text-biz-text"
              >
                <span className={cn(!fromDate && !toDate && "text-biz-muted")}>
                  {fromDate ? formatDate(fromDate) : "Start Date"} to{" "}
                  {toDate ? formatDate(toDate) : "End Date"}
                </span>
                <Calendar className="h-4 w-4 shrink-0 text-biz-muted" />
              </button>
              {dateRangeOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40"
                    onClick={() => setDateRangeOpen(false)}
                    aria-label="Close"
                  />
                  <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card-hover">
                    <div className="flex flex-col gap-2">
                      <label className="text-[11px] font-medium text-biz-muted">
                        Start Date
                        <input
                          type="date"
                          value={fromDate}
                          onChange={(e) => setFromDate(e.target.value)}
                          className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                      </label>
                      <label className="text-[11px] font-medium text-biz-muted">
                        End Date
                        <input
                          type="date"
                          value={toDate}
                          onChange={(e) => setToDate(e.target.value)}
                          className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                      </label>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Document Type</label>
            <SelectInput
              className="w-[170px]"
              placeholder="All Types"
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              options={DOC_TYPE_OPTIONS}
            />
          </div>

          <button
            type="button"
            onClick={applyFilters}
            className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-sm bg-biz-blue px-4 text-[13px] font-medium text-white transition-colors hover:bg-biz-blue-hover"
          >
            <Search className="h-4 w-4" />
            Search
          </button>
          <SecondaryButton className="h-11" onClick={resetFilters}>
            Reset
          </SecondaryButton>
        </div>
      </div>

      {/* 2x2 documentation grid */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {showBill && (
          <DocumentPanel<BillSubmissionRow>
            icon={ClipboardList}
            iconClassName="bg-biz-success-soft text-biz-success"
            title="Bill Submission"
            subtitle="Track and manage all bill submissions"
            search={billSearch}
            onSearchChange={setBillSearch}
            addLabel="New Bill Submission"
            addButtonClassName="bg-biz-blue hover:bg-biz-blue-hover"
            onAdd={() => router.push("/cms/documentation/bill-submission")}
            data={billRows}
            rowKey={(row) => row.id}
            columns={billColumns}
            footerLabel="View All Bill Submissions"
            onFooterClick={() => router.push("/cms/documentation/bill-submission")}
          />
        )}

        {showChallan && (
          <DocumentPanel<ChallanSubmissionRecord>
            icon={FileBadge2}
            iconClassName="bg-biz-purple-soft text-biz-purple"
            title="Challan Submission"
            subtitle="Track and manage all challan submissions"
            search={challanSearch}
            onSearchChange={setChallanSearch}
            addLabel="New Challan Submission"
            addButtonClassName="bg-biz-blue hover:bg-biz-blue-hover"
            onAdd={() => router.push("/cms/documentation/challan-submission?mode=create")}
            data={challanRows}
            rowKey={(row) => row.id}
            columns={challanColumns}
            footerLabel="View All Challan Submissions"
            onFooterClick={() => router.push("/cms/documentation/challan-submission")}
          />
        )}

        {showVatTax && (
          <DocumentPanel<VatTaxCertificateRecord>
            icon={Award}
            iconClassName="bg-biz-purple-soft text-biz-purple"
            title="VAT-Tax Certificates"
            subtitle="Track and manage all VAT & Tax certificates"
            search={vatTaxSearch}
            onSearchChange={setVatTaxSearch}
            addLabel="New VAT-Tax Certificate"
            addButtonClassName="bg-biz-purple hover:brightness-95"
            onAdd={canCreateVatTax ? () => router.push(vatTaxCreateHref) : undefined}
            data={vatTaxRows}
            rowKey={(row) => row.id}
            columns={vatTaxColumns}
            footerLabel="View All VAT-Tax Certificates"
            onFooterClick={() => router.push(vatTaxHref)}
          />
        )}

        {showWcc && (
          <DocumentPanel<WorkCompletionCertRow>
            icon={ShieldCheck}
            iconClassName="bg-biz-success-soft text-biz-success"
            title="Work Completion Certificate"
            subtitle="Track and manage work completion certificates"
            search={wccSearch}
            onSearchChange={setWccSearch}
            addLabel="New WCC"
            addButtonClassName="bg-biz-success hover:brightness-95"
            onAdd={() =>
              router.push(
                selectedProject
                  ? `/cms/documentation/work-completion-certificate?workId=${encodeURIComponent(selectedProject.id)}&create=1`
                  : "/cms/documentation/work-completion-certificate?create=1",
              )
            }
            data={wccRows}
            rowKey={(row) => row.id}
            columns={wccColumns}
            footerLabel="View All Work Completion Certificates"
            onFooterClick={() =>
              router.push(
                selectedProject
                  ? `/cms/documentation/work-completion-certificate?workId=${encodeURIComponent(selectedProject.id)}`
                  : "/cms/documentation/work-completion-certificate",
              )
            }
            extraContent={
              <div className="border-t border-biz-border px-4 py-2.5">
                <p className="mb-1.5 text-[11.5px] font-medium text-biz-muted">Source Type</p>
                <div className="flex items-center gap-4">
                  {(["e-GP", "Manual"] as const).map((option) => (
                    <label
                      key={option}
                      className="flex items-center gap-1.5 text-[12.5px] text-biz-text"
                    >
                      <input
                        type="radio"
                        name="wcc-source-type"
                        checked={sourceType === option}
                        onChange={() => setSourceType(option)}
                        className="h-3.5 w-3.5 border-biz-border text-biz-blue focus:ring-biz-blue/30"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              </div>
            }
          />
        )}
      </div>

      {/* Bottom info bar */}
      <div className="flex items-center gap-2 rounded-lg border border-biz-blue/20 bg-biz-blue-soft px-4 py-2.5 text-[12.5px] text-biz-text">
        <Info className="h-4 w-4 shrink-0 text-biz-blue" />
        <span>
          Search by TID to find all related documents. You can view, add and manage documents for
          each category.
        </span>
      </div>

      {viewing && (
        <>
          <button
            type="button"
            aria-label="Close details"
            onClick={() => setViewing(null)}
            className="fixed inset-0 z-40 bg-biz-navy/25"
          />
          <div className="fixed left-1/2 top-1/2 z-50 w-[380px] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-biz-border bg-biz-surface shadow-card-hover">
            <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
              <h3 className="text-[14px] font-semibold text-biz-text">{viewing.title}</h3>
              <IconButton aria-label="Close" onClick={() => setViewing(null)} className="h-8 w-8">
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="flex flex-col gap-2.5 px-4 py-3">
              {viewing.fields.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-biz-muted">{label}</span>
                  <span className="text-right font-medium text-biz-text">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
