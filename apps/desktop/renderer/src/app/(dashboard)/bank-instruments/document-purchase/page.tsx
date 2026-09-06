"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Download, Eye, FileText, Landmark, Layers, Plus, RotateCcw, Search, ShoppingCart, X } from "lucide-react";
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
  FilterBar,
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
import { SuccessPopup } from "@/components/layout/SuccessPopup";

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

const REQUEST_STATUS_META = {
  PENDING_APPROVAL: { label: "Pending Approval", tone: "warning" },
  APPROVED: { label: "Approved to Purchase", tone: "info" },
  REJECTED: { label: "Rejected", tone: "danger" },
  PURCHASED: { label: "Purchased", tone: "success" },
} as const;

const REQUEST_STATUS_TABS = [
  { status: DocumentPurchaseRequestStatus.PENDING_APPROVAL, label: "Pending", countKey: "pendingApproval" },
  { status: DocumentPurchaseRequestStatus.APPROVED, label: "Approved", countKey: "approved" },
  { status: DocumentPurchaseRequestStatus.REJECTED, label: "Rejected", countKey: "rejected" },
  { status: DocumentPurchaseRequestStatus.PURCHASED, label: "Purchased", countKey: "purchased" },
] as const;

export default function DocumentPurchaseListPage() {
  useSetBreadcrumb([{ label: "Bank Instruments" }, { label: "Document Purchase" }]);
  const router = useRouter();
  const me = useMe();
  const canApprove = me.data?.permissions.includes("document_purchase.approve") ?? false;
  const canCreate = me.data?.permissions.includes("document_purchase.create") ?? false;

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
  const [approvedRequest, setApprovedRequest] = React.useState<DocumentPurchaseRequest | null>(null);

  async function approve(row: DocumentPurchaseRequest) {
    setWorkflowError("");
    try {
      const approved = await approveRequest.mutateAsync({ id: row.id, payload: { version: row.version } });
      setApprovedRequest(approved);
    } catch {
      setWorkflowError("Could not approve the request. Reload the list and try again.");
    }
  }

  function showApprovedRequests() {
    setApprovedRequest(null);
    setRequestStatus(DocumentPurchaseRequestStatus.APPROVED);
    setRequestPage(1);
  }

  function purchaseApprovedDocument() {
    if (!approvedRequest) return;
    router.push(
      `/bank-instruments/document-purchase/create?tenderId=${approvedRequest.tenderId}&requestId=${approvedRequest.id}`,
    );
    setApprovedRequest(null);
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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5">
        <div>
          <h1 className="text-page-title text-biz-text">Document Purchase</h1>
        </div>
        <Link href="/bank-instruments/document-purchase/create" className="w-full sm:w-auto">
          <PrimaryButton className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Add Document Purchase
          </PrimaryButton>
        </Link>
      </div>

      <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <ModuleStatCard
          icon={Layers}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Purchases"
          value={String(stats.data?.totalPurchases ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          icon={FileText}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="e-GP Purchases"
          value={String(stats.data?.egpPurchases ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          icon={FileText}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Manual Purchases"
          value={String(stats.data?.manualPurchases ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          icon={Landmark}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Total Amount"
          value={stats.data ? formatBDT(stats.data.totalAmount) : "—"}
          helper="All Time"
        />
      </div>

      <section className="overflow-hidden rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex flex-col gap-3 border-b border-biz-border px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-biz-text">Costing to Document Purchase Workflow</h2>
            <p className="mt-0.5 text-[12px] text-biz-muted">
              Tenders approved for costing appear here automatically before any purchase is recorded.
            </p>
          </div>
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-biz-bg p-1" role="tablist" aria-label="Document purchase request status">
            {REQUEST_STATUS_TABS.map((tab) => {
              const active = requestStatus === tab.status;
              return (
                <button
                  key={tab.status}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => {
                    setRequestStatus(tab.status);
                    setRequestPage(1);
                  }}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[11px] font-semibold transition-colors ${
                    active ? "bg-white text-biz-blue shadow-sm" : "text-biz-muted hover:text-biz-text"
                  }`}
                >
                  {tab.label}
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${active ? "bg-biz-blue-soft text-biz-blue" : "bg-white text-biz-muted"}`}>
                    {requestStats.isLoading ? "–" : (requestStats.data?.[tab.countKey] ?? 0)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {workflowError && <p role="alert" className="border-b border-biz-border px-4 py-2 text-[12px] text-biz-danger">{workflowError}</p>}

        <DataTable<DocumentPurchaseRequest>
          isLoading={requests.isLoading}
          data={requests.data?.items ?? []}
          rowKey={(row) => row.id}
          containerClassName="overflow-x-auto"
          stickyHeader
          columns={[
            { key: "tender", header: "Tender ID", render: (row) => row.tender.egpTenderId ?? "N/A" },
            { key: "organization", header: "Organization", render: (row) => row.tender.organizationMaster?.shortName ?? "Not assigned" },
            { key: "work", header: "Tender / Work Name", render: (row) => row.tender.workName },
            { key: "fee", header: "Document Fee", render: (row) => row.tender.documentFee ? formatBDT(row.tender.documentFee) : "Not set" },
            { key: "deadline", header: "Purchase Deadline", render: (row) => row.tender.documentPurchaseDeadline ? formatDate(row.tender.documentPurchaseDeadline) : "Not set" },
            {
              key: "status",
              header: "Status",
              render: (row) => {
                const meta = REQUEST_STATUS_META[row.status];
                return <StatusBadge label={meta.label} tone={meta.tone} />;
              },
            },
            {
              key: "decision",
              header: "Decision",
              render: (row) => {
                if (row.status === DocumentPurchaseRequestStatus.APPROVED || row.status === DocumentPurchaseRequestStatus.PURCHASED) {
                  return (
                    <div className="text-[11px]">
                      <p className="font-medium text-biz-text">{row.approvedBy?.name ?? "Approved"}</p>
                      <p className="text-biz-muted">{row.approvedAt ? formatDate(row.approvedAt) : "Date not available"}</p>
                    </div>
                  );
                }
                if (row.status === DocumentPurchaseRequestStatus.REJECTED) {
                  return (
                    <div className="max-w-48 text-[11px]">
                      <p className="font-medium text-biz-danger">{row.rejectedBy?.name ?? "Rejected"}</p>
                      <p className="text-biz-muted">{row.rejectedAt ? formatDate(row.rejectedAt) : "Date not available"}</p>
                      {row.rejectionReason && <p className="mt-1 break-words text-biz-text">Reason: {row.rejectionReason}</p>}
                    </div>
                  );
                }
                return <span className="text-[11px] text-biz-muted">Awaiting decision</span>;
              },
            },
            {
              key: "workflow-action",
              header: "Action",
              render: (row) => (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(row.status === DocumentPurchaseRequestStatus.PENDING_APPROVAL ||
                    row.status === DocumentPurchaseRequestStatus.REJECTED) &&
                    canApprove && (
                      <button
                        type="button"
                        disabled={approveRequest.isPending}
                        onClick={() => void approve(row)}
                        className="inline-flex h-8 items-center gap-1 rounded-md bg-biz-blue px-2.5 text-[11px] font-semibold text-white disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" /> Approve for Purchase
                      </button>
                    )}
                  {row.status === DocumentPurchaseRequestStatus.PENDING_APPROVAL && canApprove && (
                    <button
                      type="button"
                      disabled={rejectRequest.isPending}
                      onClick={() => {
                        setRejecting(row);
                        setRejectionReason("");
                      }}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-biz-border px-2.5 text-[11px] font-semibold text-biz-danger disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  )}
                  {row.status === DocumentPurchaseRequestStatus.APPROVED && canCreate && (
                    <Link
                      href={`/bank-instruments/document-purchase/create?tenderId=${row.tenderId}&requestId=${row.id}`}
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-biz-success px-2.5 text-[11px] font-semibold text-white"
                    >
                      <ShoppingCart className="h-3.5 w-3.5" /> Purchase Document
                    </Link>
                  )}
                  {row.status === DocumentPurchaseRequestStatus.PURCHASED && row.documentPurchaseId && (
                    <Link
                      href={`/bank-instruments/document-purchase/${row.documentPurchaseId}`}
                      className="inline-flex h-8 items-center gap-1 rounded-md border border-biz-border px-2.5 text-[11px] font-semibold text-biz-text"
                    >
                      <Eye className="h-3.5 w-3.5" /> View Purchase
                    </Link>
                  )}
                </div>
              ),
            },
          ]}
        />
        <div className="border-t border-biz-border">
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
      </section>

      <FilterBar className="shrink-0 p-2.5">
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <label className="text-[12px] font-medium text-biz-muted">Date Range</label>
          <div className="flex items-center gap-2">
            <DateInput
              value={draft.fromDate}
              onChange={(e) => updateDraft("fromDate", e.target.value)}
              className="h-10 w-full sm:w-[130px]"
            />
            <span className="shrink-0 text-biz-muted">–</span>
            <DateInput
              value={draft.toDate}
              onChange={(e) => updateDraft("toDate", e.target.value)}
              className="h-10 w-full sm:w-[130px]"
            />
          </div>
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-[135px]">
          <label className="text-[12px] font-medium text-biz-muted">Purchase Type</label>
          <SelectInput
            className="h-10 w-full"
            placeholder="All"
            value={draft.purchaseType}
            onChange={(e) => updateDraft("purchaseType", e.target.value)}
            options={[
              { label: "e-GP", value: "EGP" },
              { label: "Manual", value: "MANUAL" },
            ]}
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-[150px]">
          <label className="text-[12px] font-medium text-biz-muted">Organization</label>
          <SelectInput
            className="h-10 w-full"
            placeholder="All"
            value={draft.organizationMasterId}
            onChange={(e) => updateDraft("organizationMasterId", e.target.value)}
            options={(organizations.data ?? []).map((org) => ({ label: org.shortName, value: org.id }))}
          />
        </div>

        <div className="flex w-full flex-col gap-1 sm:w-[145px]">
          <label className="text-[12px] font-medium text-biz-muted">Payment From</label>
          <SelectInput
            className="h-10 w-full"
            placeholder="All"
            value={draft.paymentFromAccountId}
            onChange={(e) => updateDraft("paymentFromAccountId", e.target.value)}
            options={(bankAccounts.data ?? []).map((acc) => ({ label: acc.accountName, value: acc.id }))}
          />
        </div>

        <div className="flex w-full min-w-0 flex-1 flex-col gap-1 sm:min-w-[180px]">
          <label className="text-[12px] font-medium text-biz-muted">Search Tender ID / Work Name</label>
          <TextInput
            icon={Search}
            placeholder="Search..."
            value={draft.search}
            onChange={(e) => updateDraft("search", e.target.value)}
            className="h-10"
          />
        </div>

        <IconButton
          type="button"
          onClick={handleResetFilters}
          aria-label="Reset filters"
          title="Reset filters"
          className="h-10 w-10 shrink-0"
        >
          <RotateCcw className="h-4 w-4" />
        </IconButton>
      </FilterBar>

      <div className="flex flex-col rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex shrink-0 items-center justify-between border-b border-biz-border px-4 py-2.5">
          <h3 className="text-[15px] font-semibold text-biz-text">Purchase List</h3>
          <SecondaryButton>
            <Download className="h-4 w-4" />
            Export
          </SecondaryButton>
        </div>

        <DataTable<DocumentPurchase>
          isLoading={documentPurchases.isLoading}
          data={items}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/bank-instruments/document-purchase/${row.id}`)}
          containerClassName="overflow-x-auto"
          stickyHeader
          columns={[
            {
              key: "sl",
              header: "SL",
              render: (_row) => items.indexOf(_row) + 1 + (meta.page - 1) * meta.limit,
            },
            {
              key: "type",
              header: "Purchase Type",
              render: (row) => (
                <StatusBadge
                  label={row.purchaseType === "EGP" ? "e-GP" : "Manual"}
                  tone={row.purchaseType === "EGP" ? "success" : "warning"}
                />
              ),
            },
            { key: "tenderId", header: "Tender ID", render: (row) => row.tenderId ?? "N/A" },
            { key: "org", header: "Organization", render: (row) => row.organizationMaster.shortName },
            { key: "work", header: "Tender / Work Name", render: (row) => row.tenderWorkName },
            { key: "date", header: "Purchase Date", render: (row) => formatDate(row.purchaseDate) },
            { key: "price", header: "Document Price", render: (row) => formatBDT(row.documentPrice) },
            { key: "payment", header: "Payment From", render: (row) => row.paymentFromAccount.accountName },
            {
              key: "action",
              header: "Action",
              render: (row) => (
                <Link href={`/bank-instruments/document-purchase/${row.id}`}>
                  <IconButton aria-label="View">
                    <Eye className="h-4 w-4" />
                  </IconButton>
                </Link>
              ),
            },
          ]}
        />

        <div className="shrink-0 border-t border-biz-border">
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
      </div>

      <SuccessPopup
        open={approvedRequest !== null}
        title="Document Purchase Approved"
        message={
          approvedRequest
            ? `Tender ${approvedRequest.tender.egpTenderId ?? approvedRequest.tenderId} is approved and ready for document purchase.`
            : "The request is approved and ready for document purchase."
        }
        primaryLabel={canCreate ? "Purchase Document Now" : "View Approved Requests"}
        onPrimary={canCreate ? purchaseApprovedDocument : showApprovedRequests}
        secondaryLabel={canCreate ? "Purchase Later" : undefined}
        onSecondary={showApprovedRequests}
        onClose={showApprovedRequests}
        dismissOnBackdrop={false}
      />

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
