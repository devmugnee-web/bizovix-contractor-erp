"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, Check, Download, Eye, FileText, Landmark, Layers, Plus, RotateCcw, Search, ShoppingCart, X } from "lucide-react";
import {
  useApproveDocumentPurchaseRequest,
  useAllOrganizations,
  useBankAccounts,
  useDocumentPurchaseStats,
  useDocumentPurchaseRequestStats,
  useDocumentPurchaseRequests,
  useDocumentPurchases,
  useMe,
  useRejectDocumentPurchaseRequest,
} from "@bizovix/api-client";
import {
  DataTable,
  DateInput,
  IconButton,
  ModuleStatCard,
  Pagination,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@bizovix/ui";
import { formatBDT, formatDate } from "@bizovix/utils";
import {
  DocumentPurchaseRequestStatus,
  type DocumentPurchase,
  type DocumentPurchaseQuery,
  type DocumentPurchaseRequest,
  type PurchaseType,
} from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Modal } from "@/components/layout/Modal";

interface FilterDraft {
  purchaseType: string;
  organizationMasterId: string;
  paymentFromAccountId: string;
  search: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_DRAFT: FilterDraft = {
  purchaseType: "",
  organizationMasterId: "",
  paymentFromAccountId: "",
  search: "",
  fromDate: "",
  toDate: "",
};

const DEFAULT_LIMIT = 10;
const PAGE_SIZE_OPTIONS = [5, 10, 20, 50, 100];
const COMPACT_PAGINATION_CLASS =
  "shrink-0 border-t border-biz-border bg-[#fbfcff] [&>div]:!gap-1 [&>div]:!px-3 [&>div]:!py-1.5 [&>div>div]:!gap-1.5 [&_button]:!h-7 [&_button]:!w-7 [&_select]:!h-7";

const REQUEST_STATUS_META = {
  PENDING_APPROVAL: { label: "Pending Approval", shortLabel: "Pending", tone: "warning" },
  APPROVED: { label: "Approved to Purchase", shortLabel: "Approved", tone: "info" },
  REJECTED: { label: "Rejected", shortLabel: "Rejected", tone: "danger" },
  PURCHASED: { label: "Purchased", shortLabel: "Purchased", tone: "success" },
} as const;

const REQUEST_STATUS_TABS = [
  { status: DocumentPurchaseRequestStatus.PENDING_APPROVAL, label: "Pending", countKey: "pendingApproval" },
  { status: DocumentPurchaseRequestStatus.APPROVED, label: "Approved", countKey: "approved" },
  { status: DocumentPurchaseRequestStatus.REJECTED, label: "Rejected", countKey: "rejected" },
] as const;

export default function DocumentPurchaseListPage() {
  useSetBreadcrumb([{ label: "Bank Instruments" }, { label: "Document Purchase" }]);
  const router = useRouter();
  const me = useMe();
  const canApprove = me.data?.permissions.includes("document_purchase.approve") ?? false;
  const canCreate = me.data?.permissions.includes("document_purchase.create") ?? false;
  const canExport = me.data?.permissions.includes("document_purchase.export") ?? false;

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(DEFAULT_LIMIT);
  const deferredSearch = React.useDeferredValue(draft.search.trim());
  const query = React.useMemo<DocumentPurchaseQuery>(
    () => ({
      page,
      limit,
      search: deferredSearch || undefined,
      purchaseType: (draft.purchaseType as PurchaseType) || undefined,
      organizationMasterId: draft.organizationMasterId || undefined,
      paymentFromAccountId: draft.paymentFromAccountId || undefined,
      fromDate: draft.fromDate || undefined,
      toDate: draft.toDate || undefined,
    }),
    [deferredSearch, draft.fromDate, draft.organizationMasterId, draft.paymentFromAccountId, draft.purchaseType, draft.toDate, limit, page],
  );

  const stats = useDocumentPurchaseStats();
  const organizations = useAllOrganizations();
  const bankAccounts = useBankAccounts();
  const documentPurchases = useDocumentPurchases(query);
  const [activeWorkspace, setActiveWorkspace] = React.useState<"purchases" | "workflow">("workflow");
  const [requestStatus, setRequestStatus] = React.useState<DocumentPurchaseRequestStatus>(
    DocumentPurchaseRequestStatus.PENDING_APPROVAL,
  );
  const [requestPage, setRequestPage] = React.useState(1);
  const [requestLimit, setRequestLimit] = React.useState(5);
  const requests = useDocumentPurchaseRequests({ page: requestPage, limit: requestLimit, status: requestStatus });
  const requestStats = useDocumentPurchaseRequestStats();
  const approveRequest = useApproveDocumentPurchaseRequest();
  const rejectRequest = useRejectDocumentPurchaseRequest();
  const [rejecting, setRejecting] = React.useState<DocumentPurchaseRequest | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState("");
  const [workflowError, setWorkflowError] = React.useState("");

  async function approve(row: DocumentPurchaseRequest) {
    setWorkflowError("");
    try {
      const approved = await approveRequest.mutateAsync({ id: row.id, payload: { version: row.version } });
      router.push(
        `/bank-instruments/document-purchase/create?tenderId=${approved.tenderId}&requestId=${approved.id}`,
      );
    } catch {
      setWorkflowError("Could not approve the request. Reload the list and try again.");
    }
  }

  async function reject() {
    if (!rejecting || !rejectionReason.trim()) return;
    setWorkflowError("");
    try {
      await rejectRequest.mutateAsync({
        id: rejecting.id,
        payload: { version: rejecting.version, reason: rejectionReason.trim() },
      });
      setRejecting(null);
      setRejectionReason("");
    } catch {
      setWorkflowError("Could not reject the request. Reload the list and try again.");
    }
  }

  function handleLimitChange(nextLimit: number) {
    setLimit(nextLimit);
    setPage(1);
  }

  function handleResetFilters() {
    setDraft(EMPTY_DRAFT);
    setPage(1);
  }

  function updateDraft<Key extends keyof FilterDraft>(key: Key, value: FilterDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  const items = documentPurchases.data?.items ?? [];
  const meta = documentPurchases.data?.meta ?? { page: 1, limit: DEFAULT_LIMIT, total: 0, totalPages: 1 };
  const requestEmptyMessage = requestStatus === DocumentPurchaseRequestStatus.PENDING_APPROVAL
    ? "No approvals are waiting for a decision. Choose another status to review past requests."
    : `No ${REQUEST_STATUS_META[requestStatus].label.toLowerCase()} requests.`;

  function exportCurrentPage() {
    if (!items.length) return;
    const csvCell = (value: string | number | null | undefined) => {
      const text = String(value ?? "");
      const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const rows = [
      ["Purchase Type", "Tender ID", "Organization", "Tender / Work Name", "Purchase Date", "Document Price (BDT)", "Payment From"],
      ...items.map((row) => [
        row.purchaseType === "EGP" ? "e-GP" : "Manual",
        row.tenderId ?? "",
        row.organizationMaster.shortName,
        row.tenderWorkName,
        formatDate(row.purchaseDate),
        String(row.documentPrice),
        row.paymentFromAccount.accountName,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `document-purchases-page-${meta.page}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderRequestDecision(row: DocumentPurchaseRequest) {
    if (row.status === DocumentPurchaseRequestStatus.APPROVED || row.status === DocumentPurchaseRequestStatus.PURCHASED) {
      return <><span className="font-medium text-biz-text">{row.approvedBy?.name ?? "Approved"}</span><span className="block text-biz-muted">{row.approvedAt ? formatDate(row.approvedAt) : "Date not available"}</span></>;
    }
    if (row.status === DocumentPurchaseRequestStatus.REJECTED) {
      return <><span className="font-medium text-biz-danger">{row.rejectedBy?.name ?? "Rejected"}</span><span className="block text-biz-muted">{row.rejectedAt ? formatDate(row.rejectedAt) : "Date not available"}</span>{row.rejectionReason && <span className="mt-1 block break-words text-biz-text">Reason: {row.rejectionReason}</span>}</>;
    }
    return <span className="text-biz-muted">Awaiting decision</span>;
  }

  function renderRequestAction(row: DocumentPurchaseRequest) {
    return <div className="flex flex-wrap gap-1.5 xl:flex-col xl:gap-1">
      {(row.status === DocumentPurchaseRequestStatus.PENDING_APPROVAL || row.status === DocumentPurchaseRequestStatus.REJECTED) && canApprove && <button type="button" disabled={approveRequest.isPending} onClick={() => void approve(row)} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-biz-blue px-2.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50 xl:min-h-7"><Check className="h-3.5 w-3.5" /> Approve for Purchase</button>}
      {row.status === DocumentPurchaseRequestStatus.PENDING_APPROVAL && canApprove && <button type="button" disabled={rejectRequest.isPending} onClick={() => { setRejecting(row); setRejectionReason(""); }} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 text-[11px] font-semibold text-biz-danger hover:bg-red-100 disabled:opacity-50 xl:min-h-7"><X className="h-3.5 w-3.5" /> Reject</button>}
      {row.status === DocumentPurchaseRequestStatus.APPROVED && canCreate && <Link href={`/bank-instruments/document-purchase/create?tenderId=${row.tenderId}&requestId=${row.id}`} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg bg-biz-success px-2.5 text-[11px] font-semibold text-white hover:brightness-95 xl:min-h-7"><ShoppingCart className="h-3.5 w-3.5" /> Purchase Document</Link>}
      {row.status === DocumentPurchaseRequestStatus.PURCHASED && row.documentPurchaseId && <Link href={`/bank-instruments/document-purchase/${row.documentPurchaseId}`} className="inline-flex min-h-8 items-center justify-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-biz-blue hover:bg-blue-100 xl:min-h-7"><Eye className="h-3.5 w-3.5" /> View Purchase</Link>}
    </div>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-2 pb-4 xl:h-full xl:min-h-0 xl:overflow-hidden xl:pb-0 2xl:gap-3 xl:[@media(max-height:519px)]:h-auto xl:[@media(max-height:519px)]:overflow-visible xl:[@media(max-height:519px)]:pb-4">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-biz-border bg-white px-3 py-2 shadow-card 2xl:px-4 2xl:py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue 2xl:h-9 2xl:w-9"><FileText className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" /></span>
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="shrink-0 text-page-title text-biz-text 2xl:text-[28px]">Document Purchase</h1>
            <p className="hidden truncate border-l border-biz-border pl-2.5 text-[11px] font-medium text-slate-500 md:block xl:text-[12px] 2xl:text-[14px]">Approvals and purchase records</p>
          </div>
        </div>
        {canCreate && <Link href="/bank-instruments/document-purchase/create" className="w-full sm:w-auto">
          <PrimaryButton className="w-full shadow-sm sm:w-auto">
            <Plus className="h-4 w-4" />
            Add Document Purchase
          </PrimaryButton>
        </Link>}
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-2 xl:grid-cols-4 2xl:gap-3 [&>div]:min-w-0 [&>div]:gap-2 [&>div]:rounded-xl [&>div]:px-3 [&>div]:py-2 [&>div]:shadow-sm [&>div>span]:h-8 [&>div>span]:w-8 [&>div>span_svg]:h-4 [&>div>span_svg]:w-4 [&>div>div]:min-w-0 [&>div>div>span:nth-child(1)]:text-[11px] [&>div>div>span:nth-child(2)]:break-words [&>div>div>span:nth-child(2)]:text-[17px] sm:[&>div>div>span:nth-child(2)]:text-[18px] 2xl:[&>div>div>span:nth-child(2)]:text-[21px] [&>div:last-child>div>span:nth-child(2)]:!text-[14px] sm:[&>div:last-child>div>span:nth-child(2)]:!text-[17px] 2xl:[&>div:last-child>div>span:nth-child(2)]:!text-[21px]">
        <ModuleStatCard
          icon={Layers}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Purchases"
          value={String(stats.data?.totalPurchases ?? "—")}
        />
        <ModuleStatCard
          icon={FileText}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="e-GP Purchases"
          value={String(stats.data?.egpPurchases ?? "—")}
        />
        <ModuleStatCard
          icon={FileText}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Manual Purchases"
          value={String(stats.data?.manualPurchases ?? "—")}
        />
        <ModuleStatCard
          icon={Landmark}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Total Amount"
          value={stats.data ? formatBDT(stats.data.totalAmount) : "—"}
        />
      </div>

      <section className="flex min-h-[440px] min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card xl:min-h-0 xl:[@media(max-height:519px)]:flex-none">
        <div className="shrink-0 overflow-x-auto border-b border-biz-border bg-slate-50/55 px-3 py-2 2xl:px-4 2xl:py-2.5">
          <div className="flex min-w-max items-center justify-between gap-3">
            <div className="inline-flex shrink-0 items-center gap-1 rounded-md bg-slate-100 p-1" role="tablist" aria-label="Document purchase views">
              {REQUEST_STATUS_TABS.map((tab) => {
                const active = activeWorkspace === "workflow" && requestStatus === tab.status;
                return (
                  <button
                    key={tab.status}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => {
                      setActiveWorkspace("workflow");
                      setRequestStatus(tab.status);
                      setRequestPage(1);
                    }}
                    className={`inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold transition-all 2xl:text-xs ${
                      active ? "bg-white text-biz-blue shadow-sm" : "text-biz-muted hover:bg-white/80 hover:text-biz-text"
                    }`}
                  >
                    {tab.label}
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-blue-100 text-biz-blue" : "bg-white text-biz-muted"}`}>
                      {requestStats.isLoading ? "–" : (requestStats.data?.[tab.countKey] ?? 0)}
                    </span>
                  </button>
                );
              })}
              <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-slate-300" />
              <button type="button" role="tab" aria-selected={activeWorkspace === "purchases"} onClick={() => setActiveWorkspace("purchases")} title="All completed document purchases" className={`inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-[12px] font-semibold 2xl:text-[14px] ${activeWorkspace === "purchases" ? "bg-white text-biz-blue shadow-sm" : "text-biz-muted hover:text-biz-text"}`}>
                Purchase Records <span className="rounded-full bg-biz-blue-soft px-1.5 py-0.5 text-[10px] text-biz-blue">{meta.total}</span>
              </button>
            </div>
            {activeWorkspace === "purchases" && canExport && <SecondaryButton type="button" disabled={!items.length} onClick={exportCurrentPage} title="Export the records shown on this page as CSV" className="h-8 border-biz-border bg-white px-3 text-[11px] text-biz-blue shadow-sm hover:bg-blue-50 disabled:opacity-50 2xl:h-9 2xl:text-[13px]">
              <Download className="h-3.5 w-3.5" /> Export page
            </SecondaryButton>}
          </div>
        </div>

        {activeWorkspace === "workflow" ? <>
        {workflowError && <p role="alert" className="border-b border-red-100 bg-red-50 px-5 py-2.5 text-[12px] font-medium text-biz-danger">{workflowError}</p>}

        <div className="hidden xl:min-h-0 xl:flex-1 xl:overflow-hidden xl:block xl:[@media(max-height:519px)]:flex-none xl:[@media(max-height:519px)]:overflow-visible">
          <DataTable<DocumentPurchaseRequest>
          isLoading={requests.isLoading}
          data={requests.data?.items ?? []}
          emptyMessage={requestEmptyMessage}
          rowKey={(row) => row.id}
          containerClassName="h-full overflow-auto bg-white [&_th]:px-3 [&_td]:px-3 [&_td]:py-1.5 [&_th]:py-2 [&_th]:text-[11px] [&_td]:text-[12px] 2xl:[&_td]:text-[13px] xl:[@media(max-height:519px)]:h-auto"
          tableClassName="table-fixed min-w-[1010px]"
          stickyHeader
          columns={[
            { key: "tender", header: "Tender ID", className: "w-[8%]", render: (row) => <span className="font-semibold">{row.tender.egpTenderId ?? "N/A"}</span> },
            { key: "organization", header: "Organization", className: "w-[13%]", render: (row) => <span className="block break-words leading-4" title={row.tender.organizationMaster?.shortName ?? "Not assigned"}>{row.tender.organizationMaster?.shortName ?? "Not assigned"}</span> },
            { key: "work", header: "Tender / Work Name", className: "w-[20%]", render: (row) => <p className="line-clamp-2 font-medium leading-4 text-biz-text" title={row.tender.workName}>{row.tender.workName}</p> },
            { key: "fee", header: "Document Fee", className: "w-[11%]", render: (row) => row.tender.documentFee ? formatBDT(row.tender.documentFee) : "Not set" },
            { key: "deadline", header: "Purchase Deadline", className: "w-[11%]", render: (row) => row.tender.documentPurchaseDeadline ? formatDate(row.tender.documentPurchaseDeadline) : "Not set" },
            {
              key: "status",
              header: "Status",
              className: "w-[9%]",
              render: (row) => {
                const meta = REQUEST_STATUS_META[row.status];
                return <span title={meta.label}><StatusBadge label={meta.shortLabel} tone={meta.tone} /></span>;
              },
            },
            {
              key: "decision",
              header: "Decision",
              className: "w-[11%]",
              render: (row) => <div className="text-[11px] leading-4">{renderRequestDecision(row)}</div>,
            },
            {
              key: "workflow-action",
              header: "Action",
              className: "w-[17%]",
              render: renderRequestAction,
            },
          ]}
        />
        </div>
        <div className="divide-y divide-biz-border xl:hidden">
          {requests.isLoading ? <p className="px-4 py-8 text-center text-sm text-biz-muted">Loading requests...</p> : !requests.data?.items.length ? <p className="px-4 py-8 text-center text-sm text-biz-muted">{requestEmptyMessage}</p> : requests.data.items.map((row) => {
            const statusMeta = REQUEST_STATUS_META[row.status];
            return <article key={row.id} className="space-y-3 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-biz-muted">Tender #{row.tender.egpTenderId ?? "N/A"}</p><p className="mt-1 text-sm font-semibold leading-5 text-biz-text" title={row.tender.workName}>{row.tender.workName}</p></div><StatusBadge label={statusMeta.label} tone={statusMeta.tone} /></div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs"><div><span className="block text-biz-muted">Organization</span><span className="font-medium text-biz-text">{row.tender.organizationMaster?.shortName ?? "Not assigned"}</span></div><div><span className="block text-biz-muted">Document fee</span><span className="font-medium text-biz-text">{row.tender.documentFee ? formatBDT(row.tender.documentFee) : "Not set"}</span></div><div><span className="block text-biz-muted">Purchase deadline</span><span className="font-medium text-biz-text">{row.tender.documentPurchaseDeadline ? formatDate(row.tender.documentPurchaseDeadline) : "Not set"}</span></div><div><span className="block text-biz-muted">Decision</span><div className="leading-4">{renderRequestDecision(row)}</div></div></div>
              {renderRequestAction(row)}
            </article>;
          })}
        </div>
        {(requests.data?.meta.total ?? 0) > 5 && (
          <div className={COMPACT_PAGINATION_CLASS}>
            <Pagination
              page={requests.data?.meta.page ?? requestPage}
              limit={requests.data?.meta.limit ?? requestLimit}
              total={requests.data?.meta.total ?? 0}
              totalPages={requests.data?.meta.totalPages ?? 1}
              onPageChange={setRequestPage}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onLimitChange={(nextLimit) => {
                setRequestLimit(nextLimit);
                setRequestPage(1);
              }}
            />
          </div>
        )}
        </> : <>
      <div aria-label="Purchase filters" className="shrink-0 border-b border-biz-border bg-white px-3 py-2 2xl:px-4 2xl:py-3">
        <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(270px,2fr)_minmax(105px,0.75fr)_minmax(130px,0.9fr)_minmax(130px,0.9fr)_minmax(180px,1.2fr)]">
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-semibold text-biz-muted">Date range</label>
            <div className="flex min-w-0 items-center gap-1.5">
              <DateInput value={draft.fromDate} onChange={(e) => updateDraft("fromDate", e.target.value)} className="h-9 min-w-0 w-full text-[12px]" />
              <span className="shrink-0 text-biz-muted">–</span>
              <DateInput value={draft.toDate} onChange={(e) => updateDraft("toDate", e.target.value)} className="h-9 min-w-0 w-full text-[12px]" />
            </div>
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-semibold text-biz-muted">Purchase type</label>
            <SelectInput className="h-9 w-full text-[12px]" placeholder="All" value={draft.purchaseType} onChange={(e) => updateDraft("purchaseType", e.target.value)} options={[{ label: "e-GP", value: "EGP" }, { label: "Manual", value: "MANUAL" }]} />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-semibold text-biz-muted">Organization</label>
            <SelectInput className="h-9 w-full text-[12px]" placeholder="All" value={draft.organizationMasterId} onChange={(e) => updateDraft("organizationMasterId", e.target.value)} options={(organizations.data ?? []).map((org) => ({ label: org.shortName, value: org.id }))} />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-semibold text-biz-muted">Payment from</label>
            <SelectInput className="h-9 w-full text-[12px]" placeholder="All" value={draft.paymentFromAccountId} onChange={(e) => updateDraft("paymentFromAccountId", e.target.value)} options={(bankAccounts.data ?? []).map((acc) => ({ label: acc.accountName, value: acc.id }))} />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[11px] font-semibold text-biz-muted">Tender ID or work name</label>
            <div className="flex items-center gap-1.5">
              <TextInput icon={Search} placeholder="Search purchases..." value={draft.search} onChange={(e) => updateDraft("search", e.target.value)} className="h-9 min-w-0 flex-1 text-[12px]" />
              <IconButton type="button" onClick={handleResetFilters} aria-label="Clear purchase filters" title="Clear purchase filters" className="h-9 w-9 shrink-0 border-biz-border bg-white text-biz-muted hover:bg-blue-50 hover:text-biz-blue"><RotateCcw className="h-4 w-4" /></IconButton>
            </div>
          </div>
        </div>
      </div>

        <div className="hidden xl:min-h-0 xl:flex-1 xl:overflow-hidden xl:block xl:[@media(max-height:519px)]:flex-none xl:[@media(max-height:519px)]:overflow-visible">
        <DataTable<DocumentPurchase>
          isLoading={documentPurchases.isLoading}
          data={items}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/bank-instruments/document-purchase/${row.id}`)}
          containerClassName="h-full overflow-auto bg-white [&_th]:px-3 [&_td]:px-3 [&_td]:py-2.5 [&_th]:text-[11px] [&_td]:text-[12px] 2xl:[&_td]:text-[13px] xl:[@media(max-height:519px)]:h-auto"
          tableClassName="table-fixed min-w-[1000px]"
          stickyHeader
          columns={[
            {
              key: "sl",
              header: "SL",
              className: "w-[4%]",
              render: (_row) => items.indexOf(_row) + 1 + (meta.page - 1) * meta.limit,
            },
            {
              key: "type",
              header: "Type",
              className: "w-[9%]",
              render: (row) => (
                <StatusBadge
                  label={row.purchaseType === "EGP" ? "e-GP" : "Manual"}
                  tone={row.purchaseType === "EGP" ? "success" : "warning"}
                />
              ),
            },
            { key: "tenderId", header: "Tender ID", className: "w-[9%]", render: (row) => <span className="font-semibold">{row.tenderId ?? "N/A"}</span> },
            { key: "org", header: "Organization", className: "w-[16%]", render: (row) => <span className="block break-words leading-4" title={row.organizationMaster.shortName}>{row.organizationMaster.shortName}</span> },
            { key: "work", header: "Tender / Work Name", className: "w-[22%]", render: (row) => <p className="line-clamp-2 font-medium leading-4 text-biz-text" title={row.tenderWorkName}>{row.tenderWorkName}</p> },
            { key: "date", header: "Purchase Date", className: "w-[11%]", render: (row) => formatDate(row.purchaseDate) },
            { key: "price", header: "Document Price", className: "w-[12%]", render: (row) => formatBDT(row.documentPrice) },
            { key: "payment", header: "Payment From", className: "w-[11%]", render: (row) => <span className="block break-words leading-4" title={row.paymentFromAccount.accountName}>{row.paymentFromAccount.accountName}</span> },
            {
              key: "action",
              header: "Action",
              className: "w-[6%]",
              render: (row) => (
                <Link href={`/bank-instruments/document-purchase/${row.id}`}>
                  <IconButton aria-label={`View purchase for tender ${row.tenderId ?? "N/A"}`} className="border-blue-100 bg-blue-50/60 text-biz-blue hover:bg-blue-100">
                    <Eye className="h-4 w-4" />
                  </IconButton>
                </Link>
              ),
            },
          ]}
        />
        </div>
        <div className="divide-y divide-biz-border xl:hidden">
          {documentPurchases.isLoading ? <p className="px-4 py-8 text-center text-sm text-biz-muted">Loading purchases...</p> : !items.length ? <p className="px-4 py-8 text-center text-sm text-biz-muted">No purchases match these filters.</p> : items.map((row, index) => <Link key={row.id} href={`/bank-instruments/document-purchase/${row.id}`} className="block px-4 py-3 hover:bg-blue-50/50 focus-visible:bg-blue-50/50 sm:px-5">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-semibold text-biz-muted">#{index + 1 + (meta.page - 1) * meta.limit} · Tender {row.tenderId ?? "N/A"}</p><p className="mt-1 text-sm font-semibold leading-5 text-biz-text" title={row.tenderWorkName}>{row.tenderWorkName}</p></div><span className="shrink-0 whitespace-nowrap"><StatusBadge label={row.purchaseType === "EGP" ? "e-GP" : "Manual"} tone={row.purchaseType === "EGP" ? "success" : "warning"} /></span></div>
            <p className="mt-1 text-xs text-biz-muted">{row.organizationMaster.shortName}</p>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-biz-border pt-2.5 text-xs"><div><span className="block text-biz-muted">Purchase date</span><span className="inline-flex items-center gap-1 font-medium text-biz-text"><CalendarDays className="h-3.5 w-3.5 text-biz-muted" />{formatDate(row.purchaseDate)}</span></div><div><span className="block text-biz-muted">Document price</span><span className="font-semibold text-biz-text">{formatBDT(row.documentPrice)}</span></div><div className="col-span-2"><span className="block text-biz-muted">Payment from</span><span className="font-medium text-biz-text">{row.paymentFromAccount.accountName}</span></div></div>
            <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-biz-blue">View purchase <Eye className="h-3.5 w-3.5" /></span>
          </Link>)}
        </div>

        <div className={COMPACT_PAGINATION_CLASS}>
          <Pagination
            page={meta.page}
            limit={meta.limit}
            total={meta.total}
            totalPages={meta.totalPages}
            onPageChange={setPage}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            onLimitChange={handleLimitChange}
          />
        </div>
        </>}
      </section>

      <Modal
        open={!!rejecting}
        onClose={() => {
          if (rejectRequest.isPending) return;
          setRejecting(null);
          setRejectionReason("");
        }}
        title="Reject Document Purchase Request"
      >
        <p className="text-[13px] text-biz-muted">
          Add a reason so the decision remains clear in the audit trail.
        </p>
        <textarea
          autoFocus
          value={rejectionReason}
          onChange={(event) => setRejectionReason(event.target.value)}
          placeholder="Enter rejection reason"
          className="mt-3 min-h-24 w-full resize-y rounded-md border border-biz-border bg-white px-3 py-2 text-sm text-biz-text outline-none focus:border-biz-blue"
        />
        <div className="mt-4 flex justify-end gap-2">
          <SecondaryButton
            type="button"
            disabled={rejectRequest.isPending}
            onClick={() => setRejecting(null)}
          >
            Cancel
          </SecondaryButton>
          <PrimaryButton
            type="button"
            disabled={!rejectionReason.trim() || rejectRequest.isPending}
            onClick={() => void reject()}
          >
            {rejectRequest.isPending ? "Rejecting..." : "Confirm Reject"}
          </PrimaryButton>
        </div>
      </Modal>
    </div>
  );
}
