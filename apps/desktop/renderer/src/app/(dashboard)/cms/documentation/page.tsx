"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Award,
  Calendar,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Eye,
  FileBadge2,
  FileText,
  Search,
  ShieldCheck,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useChallanSubmissions,
  useChallanSubmissionStats,
  useBillPreparation,
  useCmsWorks,
  useMe,
  useProjectBills,
  useProjectBillStats,
  useVatTaxCertificates,
  useVatTaxCertificateStats,
  useWorkCompletionCertificates,
} from "@bizovix/api-client";
import type {
  ChallanSubmissionRecord,
  ChallanSubmissionStatus,
  ProjectBillRecord,
  VatTaxCertificateRecord,
  VatTaxCertificateStatus,
  WorkCompletionCertificateRow,
} from "@bizovix/types";
import {
  DataTable,
  IconButton,
  SecondaryButton,
  StatusBadge,
  TextInput,
  cn,
  type DataTableColumn,
  type StatusBadgeTone,
} from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { BILL_STATUS_META, BILL_TYPE_META } from "@/lib/project-bills";
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

function readableStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

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
  { label: "VAT-Tax", value: "vat-tax" },
  { label: "Completion Certificate", value: "wcc" },
];

type DocumentCategory = (typeof DOC_TYPE_OPTIONS)[number]["value"];

type RecentDocument = {
  key: string;
  type: string;
  reference: string;
  detail: string;
  date: string | null;
  status: string;
  tone: StatusBadgeTone;
  onView: () => void;
};

type CategoryAction = {
  value: DocumentCategory;
  label: string;
  icon: LucideIcon;
  iconClassName: string;
  createLabel: string;
  guidance: string;
  disabledReason: string;
  onCreate?: () => void;
};

const ADD_BUTTON_BASE =
  "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-[12.5px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50";

type ViewingDetail = { title: string; fields: Array<[string, string]> } | null;

interface DocumentPanelProps<T> {
  icon: LucideIcon;
  iconClassName: string;
  title: string;
  subtitle: string;
  addLabel: string;
  addButtonClassName: string;
  onAdd?: () => void;
  data: T[];
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  emptyHint?: string;
  addDisabledReason?: string;
  rowKey: (row: T) => string;
  columns: DataTableColumn<T>[];
  extraContent?: React.ReactNode;
  footerLabel: string;
  onFooterClick?: () => void;
  fullHeight?: boolean;
  compact?: boolean;
}

function DocumentPanel<T>({
  icon: Icon,
  iconClassName,
  title,
  subtitle,
  addLabel,
  addButtonClassName,
  onAdd,
  data,
  loading = false,
  error = false,
  onRetry,
  emptyMessage = "No documents found for this project.",
  emptyHint,
  addDisabledReason,
  rowKey,
  columns,
  extraContent,
  footerLabel,
  onFooterClick,
  fullHeight = false,
  compact = false,
}: DocumentPanelProps<T>) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xl border border-biz-border bg-biz-surface shadow-[0_2px_10px_rgba(15,23,42,0.05)]",
        compact ? "min-h-[190px]" : "min-h-[250px]",
        fullHeight ? "lg:min-h-0 lg:flex-1" : "shrink-0",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-3 py-2">
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
          <button
            type="button"
            title={onAdd ? addLabel : (addDisabledReason ?? `${addLabel} is not available`)}
            onClick={onAdd}
            disabled={!onAdd}
            className={cn(ADD_BUTTON_BASE, addButtonClassName)}
          >
            + {addLabel}
          </button>
        </div>
      </div>

      {loading || error || data.length === 0 ? (
        <div
          className={cn(
            "flex flex-1 items-center justify-center px-4 text-center",
            compact ? "min-h-[100px] py-3" : "min-h-[180px] py-8",
          )}
        >
          <div className="flex w-full max-w-md flex-col items-center gap-2 rounded-xl border border-dashed border-biz-border bg-slate-50/60 px-5 py-5">
            {!loading && !error && <Icon className="h-6 w-6 text-biz-muted" aria-hidden="true" />}
            <p className="text-[13px] font-semibold text-biz-text">
              {loading
                ? "Loading documents..."
                : error
                  ? "Documents could not be loaded."
                  : emptyMessage}
            </p>
            {!loading && !error && emptyHint && (
              <p className="text-[11.5px] text-biz-muted">{emptyHint}</p>
            )}
            {error && onRetry && (
              <button type="button" onClick={onRetry} className="font-semibold text-biz-blue">
                Retry
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="divide-y divide-biz-border sm:hidden">
            {data.map((row) => (
              <div
                key={rowKey(row)}
                className="grid grid-cols-2 gap-x-3 gap-y-2 px-3 py-3 text-[12px]"
              >
                {columns
                  .filter((column) => column.key !== "action")
                  .map((column) => (
                    <div key={column.key} className="min-w-0">
                      <p className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-biz-muted">
                        {column.header}
                      </p>
                      <div className="break-words font-medium text-biz-text">
                        {column.render(row)}
                      </div>
                    </div>
                  ))}
                <div className="col-span-2 flex items-center justify-end gap-2 border-t border-biz-border/70 pt-2">
                  <span className="text-[11px] text-biz-muted">View details</span>
                  {columns.find((column) => column.key === "action")?.render(row)}
                </div>
              </div>
            ))}
          </div>
          <DataTable<T>
            data={data}
            rowKey={rowKey}
            columns={columns}
            stickyHeader
            containerClassName={cn(
              "hidden sm:block",
              fullHeight ? "min-h-0 lg:flex-1 lg:overflow-auto" : "flex-none",
            )}
          />
        </>
      )}

      {extraContent}

      {onFooterClick && data.length > 0 && (
        <button
          type="button"
          onClick={onFooterClick}
          className="flex shrink-0 items-center gap-1 border-t border-biz-border px-3 py-2 text-[12px] font-semibold text-biz-blue transition-colors hover:text-biz-blue-hover"
        >
          {footerLabel}
          <span aria-hidden>&rarr;</span>
        </button>
      )}
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
      </div>
    ),
  };
}

function DocumentationStat({
  icon: Icon,
  iconClassName,
  label,
  value,
  active,
  onClick,
  className,
}: {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-[68px] min-w-0 items-center gap-2 rounded-lg border bg-biz-surface px-2.5 text-left shadow-sm transition-colors hover:border-biz-blue/40 hover:bg-biz-blue-soft/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue sm:h-[58px] sm:gap-2.5 sm:px-3",
        active ? "border-biz-blue bg-biz-blue-soft/40" : "border-biz-border",
        className,
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          iconClassName,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[11px] leading-tight text-biz-muted" title={label}>
          {label}
        </p>
        <strong className="block truncate text-[15px] font-bold leading-tight tabular-nums text-biz-navy">
          {value}
        </strong>
      </div>
      <ChevronRight
        className="ml-auto hidden h-4 w-4 shrink-0 text-biz-muted sm:block"
        aria-hidden="true"
      />
    </button>
  );
}

export default function ProjectDocumentationPage() {
  useSetBreadcrumb([{ label: "Projects", href: "/cms" }, { label: "Project Documentation" }]);
  const router = useRouter();
  const me = useMe();
  const permissions = me.data?.permissions ?? [];
  const canReadVatTax = permissions.includes("vat_tax_certificate.read");
  const canCreateVatTax = permissions.includes("vat_tax_certificate.create");
  const canCreateBill = permissions.includes("project_bill.create");
  const canCreateChallan = permissions.includes("challan_submission.create");
  const canCreateWcc = permissions.includes("completion_certificate.create");

  const projects = useCmsWorks({ limit: 100, includeClosed: true });
  const [selectedProjectId, setSelectedProjectId] = React.useState<string | null>(null);
  const [projectPickerOpen, setProjectPickerOpen] = React.useState(false);

  const projectList = projects.data?.items ?? [];
  const selectedProject =
    projectList.find((p) => p.id === selectedProjectId) ?? projectList[0] ?? null;
  const projectReadOnly = selectedProject
    ? ["COMPLETED", "ARCHIVED", "CANCELLED"].includes(selectedProject.status)
    : false;
  const projectCancelled = selectedProject?.status === "CANCELLED";

  const [tid, setTid] = React.useState("");
  const [fromDate, setFromDate] = React.useState("");
  const [toDate, setToDate] = React.useState("");
  const [docType, setDocType] = React.useState<DocumentCategory | "">("");
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);

  const [viewing, setViewing] = React.useState<ViewingDetail>(null);
  const projectId = selectedProject?.id;
  const searchTerm = tid.trim();
  const bills = useProjectBills(
    {
      cmsWorkId: projectId,
      search: searchTerm || undefined,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      limit: 100,
    },
    Boolean(projectId),
  );
  const billStats = useProjectBillStats(projectId, Boolean(projectId));
  const billPreparation = useBillPreparation(projectId);
  const challans = useChallanSubmissions({
    limit: 100,
    cmsWorkId: projectId,
    search: searchTerm || undefined,
    dateFrom: fromDate || undefined,
    dateTo: toDate || undefined,
  });
  const challanStats = useChallanSubmissionStats(projectId);
  const vatTaxCertificates = useVatTaxCertificates(
    {
      limit: 100,
      cmsWorkId: projectId,
      search: searchTerm || undefined,
      dateFrom: fromDate || undefined,
      dateTo: toDate || undefined,
    },
    Boolean(projectId) && canReadVatTax,
  );
  const vatTaxStats = useVatTaxCertificateStats(
    { cmsWorkId: projectId },
    Boolean(projectId) && canReadVatTax,
  );
  const completionCertificates = useWorkCompletionCertificates({
    cmsWorkId: projectId,
    limit: 100,
  });

  const matchesGlobal = React.useCallback(
    (terms: Array<string | null | undefined>, dateField: string | null | undefined) => {
      const term = tid.trim().toLowerCase();
      if (term && !terms.some((value) => value?.toLowerCase().includes(term))) return false;
      const date = dateField?.slice(0, 10);
      if (fromDate && (!date || date < fromDate)) return false;
      if (toDate && (!date || date > toDate)) return false;
      return true;
    },
    [tid, fromDate, toDate],
  );

  function resetFilters() {
    setTid("");
    setFromDate("");
    setToDate("");
    setDateRangeOpen(false);
  }

  const billRows = React.useMemo(
    () =>
      (bills.data?.items ?? []).filter(
        (row) =>
          row.cmsWorkId === projectId &&
          matchesGlobal(
            [row.billNo, row.cmsWork.workName, row.cmsWork.tender?.egpTenderId],
            row.billDate,
          ),
      ),
    [bills.data?.items, matchesGlobal, projectId],
  );
  const challanRows = React.useMemo(
    () =>
      (challans.data?.items ?? []).filter((row) => {
        if (row.cmsWorkId !== projectId) return false;
        return matchesGlobal(
          [
            row.contract?.tender?.egpTenderId,
            row.contract?.contractNo,
            row.challanNo,
            row.description,
            row.cmsWork.workName,
          ],
          row.challanDate,
        );
      }),
    [challans.data?.items, matchesGlobal, projectId],
  );
  const vatTaxRows = React.useMemo(
    () =>
      (vatTaxCertificates.data?.items ?? []).filter(
        (row) =>
          row.cmsWorkId === projectId &&
          matchesGlobal(
            [row.tender?.egpTenderId, row.cmsWork.workName, row.certificateNo],
            row.issueDate,
          ),
      ),
    [vatTaxCertificates.data?.items, matchesGlobal, projectId],
  );
  const wccDocuments = React.useMemo(
    () =>
      (completionCertificates.data?.items ?? []).filter(
        (row) => row.workId === projectId && row.certificate !== null,
      ),
    [completionCertificates.data?.items, projectId],
  );
  const wccRows = React.useMemo(
    () =>
      wccDocuments.filter((row) =>
        matchesGlobal(
          [row.tid, row.certificateNo, row.project],
          row.certificateDate ?? row.certificate?.applicationDate,
        ),
      ),
    [matchesGlobal, wccDocuments],
  );

  const documentCounts: Record<DocumentCategory, number> = {
    bill: billStats.data?.totalBills ?? 0,
    challan: challanStats.data?.total ?? 0,
    "vat-tax": canReadVatTax ? (vatTaxStats.data?.total ?? 0) : 0,
    wcc: wccDocuments.length,
  };
  const countLoading =
    Boolean(projectId) &&
    (billStats.isLoading ||
      challanStats.isLoading ||
      (canReadVatTax && vatTaxStats.isLoading) ||
      completionCertificates.isLoading);
  const countError =
    billStats.isError ||
    challanStats.isError ||
    (canReadVatTax && vatTaxStats.isError) ||
    completionCertificates.isError;
  const hasDocuments = Object.values(documentCounts).some((count) => count > 0);
  const showFilters =
    Boolean(projectId) && hasDocuments && (!docType || (documentCounts[docType] ?? 0) > 0);
  const listsLoading =
    bills.isLoading ||
    challans.isLoading ||
    (canReadVatTax && vatTaxCertificates.isLoading) ||
    completionCertificates.isLoading;
  const listsError =
    bills.isError ||
    challans.isError ||
    (canReadVatTax && vatTaxCertificates.isError) ||
    completionCertificates.isError;

  function viewVatTaxRecord(row: VatTaxCertificateRecord) {
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
    });
  }

  const recentDocuments: RecentDocument[] = [
    ...billRows.map((row) => ({
      key: `bill-${row.id}`,
      type: "Bill Submission",
      reference: row.billNo,
      detail: BILL_TYPE_META[row.billType],
      date: row.billDate,
      status: BILL_STATUS_META[row.status].label,
      tone: BILL_STATUS_META[row.status].tone,
      onView: () => router.push(`/cms/bills/${encodeURIComponent(row.id)}`),
    })),
    ...challanRows.map((row) => ({
      key: `challan-${row.id}`,
      type: "Challan Submission",
      reference: row.challanNo,
      detail: row.description,
      date: row.challanDate,
      status: challanStatusLabel(row.status),
      tone: CHALLAN_STATUS_TONE[row.status],
      onView: () =>
        router.push(`/cms/documentation/challan-submission?id=${encodeURIComponent(row.id)}`),
    })),
    ...vatTaxRows.map((row) => ({
      key: `vat-${row.id}`,
      type: "VAT-Tax Certificate",
      reference: row.certificateNo ?? "Not assigned",
      detail: row.certificateType,
      date: row.issueDate,
      status: certificateStatusLabel(row.status),
      tone: CERT_STATUS_TONE[row.status],
      onView: () => viewVatTaxRecord(row),
    })),
    ...wccRows.map((row) => ({
      key: `wcc-${row.id}`,
      type: "Completion Certificate",
      reference: row.certificateNo ?? "Not assigned",
      detail: row.project,
      date: row.certificateDate ?? row.certificate?.applicationDate ?? null,
      status: readableStatus(row.displayStatus),
      tone: row.displayStatus.includes("OBTAINED") ? ("success" as const) : ("info" as const),
      onView: () =>
        router.push(
          `/cms/documentation/work-completion-certificate?workId=${encodeURIComponent(row.workId)}`,
        ),
    })),
  ]
    .sort(
      (a, b) =>
        (b.date ? new Date(b.date).getTime() || 0 : 0) -
        (a.date ? new Date(a.date).getTime() || 0 : 0),
    )
    .slice(0, 8);

  const showBill = docType === "bill";
  const showChallan = docType === "challan";
  const showVatTax = docType === "vat-tax" && canReadVatTax;
  const vatTaxHref = selectedProject
    ? `/cms/documentation/vat-tax-certificate?workId=${encodeURIComponent(selectedProject.id)}`
    : "/cms/documentation/vat-tax-certificate";
  const vatTaxCreateHref = `${vatTaxHref}${vatTaxHref.includes("?") ? "&" : "?"}create=1`;
  const showWcc = docType === "wcc";
  const billColumns: DataTableColumn<ProjectBillRecord>[] = [
    { key: "tid", header: "Tender ID", render: (row) => row.cmsWork.tender?.egpTenderId ?? "—" },
    { key: "billNo", header: "Bill No", render: (row) => row.billNo },
    { key: "billDate", header: "Bill Date", render: (row) => formatDate(row.billDate) },
    { key: "billType", header: "Bill Type", render: (row) => BILL_TYPE_META[row.billType] },
    {
      key: "billAmount",
      header: "Gross Amount (BDT)",
      render: (row) => formatBDT(row.grossBillAmount),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          label={BILL_STATUS_META[row.status].label}
          tone={BILL_STATUS_META[row.status].tone}
        />
      ),
    },
    actionColumn<ProjectBillRecord>((row) =>
      router.push(`/cms/bills/${encodeURIComponent(row.id)}`),
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
    actionColumn<VatTaxCertificateRecord>(viewVatTaxRecord),
  ];

  const wccColumns: DataTableColumn<WorkCompletionCertificateRow>[] = [
    { key: "tid", header: "Tender ID", render: (row) => row.tid ?? "—" },
    { key: "wccNo", header: "Certificate No", render: (row) => row.certificateNo ?? "—" },
    {
      key: "completionDate",
      header: "Completion Date",
      render: (row) =>
        row.certificate?.actualCompletionDate
          ? formatDate(row.certificate.actualCompletionDate)
          : "—",
    },
    {
      key: "issuedOn",
      header: "Certificate Date",
      render: (row) => (row.certificateDate ? formatDate(row.certificateDate) : "—"),
    },
    {
      key: "source",
      header: "Source",
      render: (row) =>
        row.source === "EGP" ? "e-GP" : row.source === "MANUAL" ? "Manual" : "Not set",
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          label={readableStatus(row.displayStatus)}
          tone={row.displayStatus.includes("OBTAINED") ? "success" : "info"}
        />
      ),
    },
    actionColumn<WorkCompletionCertificateRow>((row) =>
      router.push(
        `/cms/documentation/work-completion-certificate?workId=${encodeURIComponent(row.workId)}`,
      ),
    ),
  ];

  const categoryActions: CategoryAction[] = [
    {
      value: "bill",
      label: "Bill Submission",
      icon: ClipboardList,
      iconClassName: "bg-biz-success-soft text-biz-success",
      createLabel: "New Bill",
      guidance: projectReadOnly
        ? "Reopen this project before creating a bill."
        : !canCreateBill
          ? "You do not have permission to create bills."
          : billPreparation.isLoading
            ? "Checking contract and BOQ readiness..."
            : billPreparation.data?.ready
              ? "Ready to prepare a bill."
              : (billPreparation.data?.reason ?? "An active BDT contract and BOQ are required."),
      disabledReason: projectReadOnly
        ? "Reopen this project before creating a bill."
        : !canCreateBill
          ? "You do not have permission to create bills."
          : (billPreparation.data?.reason ?? "An active BDT contract and BOQ are required."),
      onCreate:
        canCreateBill && projectId && !projectReadOnly && billPreparation.data?.ready
          ? () => router.push(`/cms/bills/create?cmsWorkId=${encodeURIComponent(projectId)}`)
          : undefined,
    },
    {
      value: "challan",
      label: "Challan Submission",
      icon: FileBadge2,
      iconClassName: "bg-biz-purple-soft text-biz-purple",
      createLabel: "New Challan",
      guidance: projectReadOnly
        ? "Reopen this project before creating a challan."
        : !canCreateChallan
          ? "You do not have permission to create challans."
          : "Record a challan when goods or documents need to be submitted.",
      disabledReason: projectReadOnly
        ? "Reopen this project before creating a challan."
        : "You do not have permission to create challans.",
      onCreate:
        canCreateChallan && projectId && !projectReadOnly
          ? () =>
              router.push(
                `/cms/documentation/challan-submission?mode=create&cmsWorkId=${encodeURIComponent(projectId)}`,
              )
          : undefined,
    },
    ...(canReadVatTax
      ? [
          {
            value: "vat-tax" as const,
            label: "VAT-Tax Certificate",
            icon: Award,
            iconClassName: "bg-biz-orange-soft text-biz-orange",
            createLabel: "New VAT-Tax",
            guidance: projectCancelled
              ? "Cancelled projects cannot have new certificates."
              : !canCreateVatTax
                ? "You do not have permission to create VAT or tax certificates."
                : "Record a certificate when a VAT or tax document is available.",
            disabledReason: projectCancelled
              ? "Cancelled projects cannot have new certificates."
              : "You do not have permission to create VAT or tax certificates.",
            onCreate:
              canCreateVatTax && projectId && !projectCancelled
                ? () => router.push(vatTaxCreateHref)
                : undefined,
          },
        ]
      : []),
    {
      value: "wcc",
      label: "Completion Certificate",
      icon: ShieldCheck,
      iconClassName: "bg-biz-success-soft text-biz-success",
      createLabel: "New WCC",
      guidance: projectReadOnly
        ? "Reopen this project before creating a certificate."
        : !canCreateWcc
          ? "You do not have permission to create completion certificates."
          : "Open the completion workflow when work is ready for certification.",
      disabledReason: projectReadOnly
        ? "Reopen this project before creating a certificate."
        : "You do not have permission to create completion certificates.",
      onCreate:
        canCreateWcc && projectId && !projectReadOnly
          ? () =>
              router.push(
                `/cms/documentation/work-completion-certificate?workId=${encodeURIComponent(projectId)}&create=1`,
              )
          : undefined,
    },
  ];

  return (
    <div className="flex flex-col gap-2.5 pb-3 xl:h-full xl:min-h-0 xl:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue">
            <FileText className="h-4 w-4" />
          </span>
          <h1 className="text-page-title text-biz-text">Project Documentation</h1>
        </div>

        <div className="relative max-w-full">
          <button
            type="button"
            onClick={() => setProjectPickerOpen((v) => !v)}
            aria-expanded={projectPickerOpen}
            className="flex h-10 w-[260px] max-w-full items-center justify-between gap-3 rounded-lg border border-biz-border bg-biz-surface px-3 text-left"
          >
            <div className="min-w-0">
              <p className="text-[10.5px] leading-tight text-biz-muted">Project</p>
              <p
                className="truncate text-[12px] font-semibold leading-tight text-biz-text"
                title={selectedProject?.workName}
              >
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
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 max-h-72 w-[300px] max-w-[calc(100vw-32px)] overflow-y-auto rounded-lg border border-biz-border bg-biz-surface py-1 shadow-card-hover">
                {projectList.length === 0 ? (
                  <p className="px-3 py-2.5 text-[12.5px] text-biz-muted">No projects found</p>
                ) : (
                  projectList.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setDocType("");
                        resetFilters();
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
                        {project.organizationMaster.shortName} · {readableStatus(project.status)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-2 gap-2",
          canReadVatTax ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        <DocumentationStat
          icon={ClipboardList}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Bill Submissions"
          active={docType === "bill"}
          onClick={() => {
            setDocType("bill");
            resetFilters();
          }}
          value={
            !projectId || billStats.isLoading
              ? "..."
              : billStats.isError
                ? "—"
                : String(billStats.data?.totalBills ?? 0)
          }
        />
        <DocumentationStat
          icon={FileBadge2}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Challan Submissions"
          active={docType === "challan"}
          onClick={() => {
            setDocType("challan");
            resetFilters();
          }}
          value={
            !projectId || challanStats.isLoading
              ? "..."
              : challanStats.isError
                ? "—"
                : String(challanStats.data?.total ?? 0)
          }
        />
        {canReadVatTax && (
          <DocumentationStat
            icon={Award}
            iconClassName="bg-biz-orange-soft text-biz-orange"
            label="VAT-Tax Certificates"
            active={docType === "vat-tax"}
            onClick={() => {
              setDocType("vat-tax");
              resetFilters();
            }}
            value={
              !projectId || vatTaxStats.isLoading
                ? "..."
                : vatTaxStats.isError
                  ? "—"
                  : String(vatTaxStats.data?.total ?? 0)
            }
          />
        )}
        <DocumentationStat
          icon={ShieldCheck}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Completion Certificates"
          active={docType === "wcc"}
          onClick={() => {
            setDocType("wcc");
            resetFilters();
          }}
          value={
            !projectId || completionCertificates.isLoading
              ? "..."
              : completionCertificates.isError
                ? "—"
                : String(wccDocuments.length)
          }
        />
      </div>

      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-biz-border bg-biz-surface px-3 py-2">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="documentation-tid" className="sr-only">
              Search documents
            </label>
            <TextInput
              id="documentation-tid"
              icon={Search}
              placeholder="Search by Tender ID, document number or work..."
              value={tid}
              onChange={(e) => setTid(e.target.value)}
              className="h-9 w-full"
            />
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label="Date range"
              aria-expanded={dateRangeOpen}
              onClick={() => setDateRangeOpen((v) => !v)}
              className="flex h-9 w-[210px] items-center justify-between gap-2 rounded-md border border-biz-border bg-biz-surface px-3 text-[12px] text-biz-text"
            >
              <span className="truncate">
                {fromDate || toDate
                  ? `${fromDate ? formatDate(fromDate) : "Start"} – ${toDate ? formatDate(toDate) : "End"}`
                  : "All dates"}
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
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[260px] rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card-hover">
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
                        min={fromDate}
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
          <SecondaryButton className="h-9 px-3" onClick={resetFilters}>
            Reset
          </SecondaryButton>
        </div>
      )}

      {docType && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setDocType("");
              resetFilters();
            }}
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-biz-blue hover:bg-biz-blue-soft"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            All documents
          </button>
          <span className="text-[12px] text-biz-muted" aria-hidden="true">
            /
          </span>
          <span className="truncate text-[12px] font-semibold text-biz-text">
            {DOC_TYPE_OPTIONS.find((option) => option.value === docType)?.label}
          </span>
        </div>
      )}

      {!docType && (
        <section
          className={cn(
            "flex min-h-0 flex-col overflow-hidden rounded-xl border border-biz-border bg-biz-surface shadow-sm",
            hasDocuments ? "xl:flex-1" : "shrink-0",
          )}
        >
          {!projectId ? (
            <div className="px-5 py-10 text-center text-[13px] text-biz-muted">
              {projects.isError ? (
                <>
                  Projects could not be loaded.{" "}
                  <button
                    type="button"
                    onClick={() => void projects.refetch()}
                    className="font-semibold text-biz-blue hover:underline"
                  >
                    Retry
                  </button>
                </>
              ) : projects.isLoading ? (
                "Loading projects..."
              ) : (
                "No projects are available yet."
              )}
            </div>
          ) : countLoading ? (
            <p className="px-5 py-10 text-center text-[13px] text-biz-muted">
              Loading document overview...
            </p>
          ) : countError ? (
            <div className="px-5 py-10 text-center text-[13px] text-biz-muted">
              Document counts could not be loaded.{" "}
              <button
                type="button"
                onClick={() => {
                  void billStats.refetch();
                  void challanStats.refetch();
                  if (canReadVatTax) void vatTaxStats.refetch();
                  void completionCertificates.refetch();
                }}
                className="font-semibold text-biz-blue hover:underline"
              >
                Retry
              </button>
            </div>
          ) : !hasDocuments ? (
            <div className="px-4 py-5 sm:px-5">
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-biz-blue-soft text-biz-blue">
                  <FileText className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-[15px] font-semibold text-biz-text">
                    No documents for this project yet
                  </h2>
                  <p className="mt-0.5 text-[12px] text-biz-muted">
                    Choose the document you need. Available actions and requirements are shown
                    below.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {categoryActions.map((category) => (
                  <div
                    key={category.value}
                    className="flex min-w-0 items-center gap-3 rounded-lg border border-biz-border bg-slate-50/40 px-3 py-3"
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        category.iconClassName,
                      )}
                    >
                      <category.icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-biz-text">{category.label}</p>
                      <p className="text-[11.5px] leading-snug text-biz-muted">
                        {category.guidance}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={category.onCreate}
                      disabled={!category.onCreate}
                      title={category.onCreate ? category.createLabel : category.disabledReason}
                      className="h-8 shrink-0 rounded-md border border-biz-blue/25 bg-white px-2.5 text-[11.5px] font-semibold text-biz-blue hover:bg-biz-blue-soft disabled:cursor-not-allowed disabled:border-biz-border disabled:text-biz-muted"
                    >
                      + {category.createLabel}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
                <div>
                  <h2 className="text-[14px] font-semibold text-biz-text">Recent Documents</h2>
                  <p className="text-[11.5px] text-biz-muted">
                    Latest records for the selected project
                  </p>
                </div>
                {recentDocuments.length > 0 && (
                  <span className="shrink-0 text-[11.5px] text-biz-muted">
                    Latest {recentDocuments.length}
                  </span>
                )}
              </div>
              {listsLoading && recentDocuments.length === 0 ? (
                <p className="px-5 py-10 text-center text-[13px] text-biz-muted">
                  Loading documents...
                </p>
              ) : listsError && recentDocuments.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-biz-muted">
                  Documents could not be loaded.{" "}
                  <button
                    type="button"
                    onClick={() => {
                      void bills.refetch();
                      void challans.refetch();
                      if (canReadVatTax) void vatTaxCertificates.refetch();
                      void completionCertificates.refetch();
                    }}
                    className="font-semibold text-biz-blue hover:underline"
                  >
                    Retry
                  </button>
                </div>
              ) : recentDocuments.length === 0 ? (
                <div className="px-5 py-10 text-center text-[13px] text-biz-muted">
                  No documents match the current search or date range.
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="ml-2 font-semibold text-biz-blue hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-biz-border sm:hidden">
                    {recentDocuments.map((record) => (
                      <div
                        key={record.key}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-[11px] text-biz-muted">
                            {record.type} · {record.date ? formatDate(record.date) : "Date not set"}
                          </p>
                          <p className="truncate text-[12.5px] font-semibold text-biz-text">
                            {record.reference}
                          </p>
                          <p className="truncate text-[11.5px] text-biz-muted">{record.detail}</p>
                        </div>
                        <IconButton
                          aria-label={`View ${record.type} ${record.reference}`}
                          onClick={record.onView}
                          className="h-8 w-8 shrink-0"
                        >
                          <Eye className="h-4 w-4" />
                        </IconButton>
                      </div>
                    ))}
                  </div>
                  <div className="hidden min-h-0 flex-1 overflow-auto sm:block">
                    <table className="w-full table-fixed text-left text-[12px]">
                      <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-biz-muted">
                        <tr>
                          <th className="w-[23%] px-4 py-2.5">Type</th>
                          <th className="w-[25%] px-4 py-2.5">Document No.</th>
                          <th className="w-[19%] px-4 py-2.5">Date</th>
                          <th className="w-[25%] px-4 py-2.5">Status</th>
                          <th className="w-[8%] px-4 py-2.5 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentDocuments.map((record) => (
                          <tr
                            key={record.key}
                            className="border-t border-biz-border hover:bg-biz-blue-soft/20"
                          >
                            <td className="px-4 py-3 font-medium text-biz-text">{record.type}</td>
                            <td className="min-w-0 px-4 py-3">
                              <p
                                className="truncate font-semibold text-biz-text"
                                title={record.reference}
                              >
                                {record.reference}
                              </p>
                              <p
                                className="truncate text-[11px] text-biz-muted"
                                title={record.detail}
                              >
                                {record.detail}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-biz-text">
                              {record.date ? formatDate(record.date) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <StatusBadge label={record.status} tone={record.tone} />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <IconButton
                                aria-label={`View ${record.type} ${record.reference}`}
                                onClick={record.onView}
                                className="h-7 w-7"
                              >
                                <Eye className="h-3.5 w-3.5" />
                              </IconButton>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      )}

      {docType && (
        <div className="flex min-h-0 flex-1 flex-col">
          {showBill && (
            <DocumentPanel<ProjectBillRecord>
              icon={ClipboardList}
              iconClassName="bg-biz-success-soft text-biz-success"
              title="Bill Submission"
              subtitle="Saved bills for this project"
              addLabel="New Bill Submission"
              addButtonClassName="bg-biz-blue hover:bg-biz-blue-hover"
              onAdd={
                canCreateBill && projectId && !projectReadOnly && billPreparation.data?.ready
                  ? () =>
                      router.push(`/cms/bills/create?cmsWorkId=${encodeURIComponent(projectId)}`)
                  : undefined
              }
              addDisabledReason={
                projectReadOnly
                  ? "Reopen this project before creating new documents."
                  : !canCreateBill
                    ? "You do not have permission to create bills."
                    : (billPreparation.data?.reason ??
                      "An active contract and BOQ are required before billing.")
              }
              data={billRows}
              loading={!projectId || bills.isLoading}
              error={bills.isError}
              onRetry={() => void bills.refetch()}
              emptyMessage="No saved bills for this project."
              emptyHint={
                billPreparation.isLoading
                  ? "Checking contract and BOQ readiness..."
                  : billPreparation.data?.ready
                    ? "This project is ready for its first bill."
                    : (billPreparation.data?.reason ??
                      "Set up an active contract and BOQ before creating a bill.")
              }
              rowKey={(row) => row.id}
              columns={billColumns}
              footerLabel="View All Bill Submissions"
              onFooterClick={
                projectId
                  ? () =>
                      router.push(
                        `/cms/documentation/bill-submission?cmsWorkId=${encodeURIComponent(projectId)}`,
                      )
                  : undefined
              }
              fullHeight={billRows.length > 0}
            />
          )}

          {showChallan && (
            <DocumentPanel<ChallanSubmissionRecord>
              icon={FileBadge2}
              iconClassName="bg-biz-purple-soft text-biz-purple"
              title="Challan Submission"
              subtitle="Saved challans for this project"
              addLabel="New Challan Submission"
              addButtonClassName="bg-biz-blue hover:bg-biz-blue-hover"
              onAdd={
                canCreateChallan && projectId && !projectReadOnly
                  ? () =>
                      router.push(
                        `/cms/documentation/challan-submission?mode=create&cmsWorkId=${encodeURIComponent(projectId)}`,
                      )
                  : undefined
              }
              data={challanRows}
              loading={!projectId || challans.isLoading}
              error={challans.isError}
              onRetry={() => void challans.refetch()}
              emptyMessage="No challans for this project."
              emptyHint={
                projectReadOnly
                  ? "This project is read-only."
                  : "Use New Challan Submission when you need to record one."
              }
              addDisabledReason={
                projectReadOnly
                  ? "Reopen this project before creating new documents."
                  : "You do not have permission to create challans."
              }
              rowKey={(row) => row.id}
              columns={challanColumns}
              footerLabel="Open Tender Challan Workspace"
              onFooterClick={() => router.push("/cms/documentation/challan-submission")}
              fullHeight={challanRows.length > 0}
            />
          )}

          {showVatTax && (
            <DocumentPanel<VatTaxCertificateRecord>
              icon={Award}
              iconClassName="bg-biz-purple-soft text-biz-purple"
              title="VAT-Tax Certificates"
              subtitle="Saved VAT and tax certificates for this project"
              addLabel="New VAT-Tax Certificate"
              addButtonClassName="bg-biz-purple hover:brightness-95"
              onAdd={
                canCreateVatTax && projectId && !projectCancelled
                  ? () => router.push(vatTaxCreateHref)
                  : undefined
              }
              data={vatTaxRows}
              loading={!projectId || vatTaxCertificates.isLoading}
              error={vatTaxCertificates.isError}
              onRetry={() => void vatTaxCertificates.refetch()}
              emptyMessage="No VAT or tax certificates for this project."
              emptyHint={
                projectCancelled
                  ? "This project is cancelled."
                  : "Create a certificate only when a VAT or tax document is available."
              }
              addDisabledReason={
                projectCancelled
                  ? "A cancelled project cannot have new VAT or tax certificates."
                  : "You do not have permission to create VAT or tax certificates."
              }
              rowKey={(row) => row.id}
              columns={vatTaxColumns}
              footerLabel="View All VAT-Tax Certificates"
              onFooterClick={() => router.push(vatTaxHref)}
              fullHeight={vatTaxRows.length > 0}
            />
          )}

          {showWcc && (
            <DocumentPanel<WorkCompletionCertificateRow>
              icon={ShieldCheck}
              iconClassName="bg-biz-success-soft text-biz-success"
              title="Work Completion Certificate"
              subtitle="Saved completion certificates for this project"
              addLabel="New WCC"
              addButtonClassName="bg-biz-success hover:brightness-95"
              onAdd={
                canCreateWcc && projectId && !projectReadOnly
                  ? () =>
                      router.push(
                        selectedProject
                          ? `/cms/documentation/work-completion-certificate?workId=${encodeURIComponent(selectedProject.id)}&create=1`
                          : "/cms/documentation/work-completion-certificate?create=1",
                      )
                  : undefined
              }
              data={wccRows}
              loading={!projectId || completionCertificates.isLoading}
              error={completionCertificates.isError}
              onRetry={() => void completionCertificates.refetch()}
              emptyMessage="No completion certificate for this project."
              emptyHint={
                projectReadOnly
                  ? "This project is read-only."
                  : "Open the completion workflow to create or track a certificate."
              }
              addDisabledReason={
                projectReadOnly
                  ? "Reopen this project before creating new documents."
                  : "You do not have permission to create completion certificates."
              }
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
              fullHeight={wccRows.length > 0}
            />
          )}
        </div>
      )}

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
