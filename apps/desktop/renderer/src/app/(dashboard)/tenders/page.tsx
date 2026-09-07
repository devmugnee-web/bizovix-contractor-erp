"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Award,
  Calendar,
  ClipboardList,
  Download,
  Eye,
  FileEdit,
  MoreVertical,
  Search,
  ShieldCheck,
  SquareStack,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  ApiError,
  useApproveTenderForCosting,
  useDeleteTender,
  useTenderStats,
  useTenders,
} from "@bizovix/api-client";
import {
  DataTable,
  IconButton,
  ModuleStatCard,
  Pagination,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import {
  TENDER_PROCUREMENT_METHODS,
  type TenderProcurementMethod,
  type TenderQuery,
  type TenderRecord,
  type TenderStatus,
} from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Modal } from "@/components/layout/Modal";
import { SuccessPopup } from "@/components/layout/SuccessPopup";
import { TenderForm } from "@/components/tenders/TenderForm";
import { TENDER_STATUS_META, TENDER_STATUS_OPTIONS } from "@/lib/tenders";

interface FilterDraft {
  search: string;
  tenderType: string;
  procurementMethod: string;
  status: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_DRAFT: FilterDraft = {
  search: "",
  tenderType: "",
  procurementMethod: "",
  status: "",
  fromDate: "",
  toDate: "",
};

const TENDER_TYPE_OPTIONS = ["Works", "Goods", "Services", "Physical Service"].map(
  (value) => ({ value, label: value }),
);

const COSTING_APPROVAL_META = {
  DRAFT: { label: "Draft", tone: "neutral" as const },
  PENDING_APPROVAL: { label: "Pending Approval", tone: "warning" as const },
  APPROVED: { label: "Approved for Costing", tone: "success" as const },
  REJECTED: { label: "Costing Rejected", tone: "danger" as const },
};

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TendersListPage() {
  useSetBreadcrumb([
    { label: "Tender Management", href: "/tender-management" },
    { label: "Tender List" },
  ]);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [draft, setDraft] = React.useState<FilterDraft>(EMPTY_DRAFT);
  const [query, setQuery] = React.useState<TenderQuery>({ page: 1, limit: 5 });
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);
  const [menuAnchor, setMenuAnchor] = React.useState<{
    tender: TenderRecord;
    top: number;
    right: number;
  } | null>(null);
  const [approvalTender, setApprovalTender] = React.useState<TenderRecord | null>(null);
  const [approvalError, setApprovalError] = React.useState("");
  const [successMessage, setSuccessMessage] = React.useState("");
  const [successTitle, setSuccessTitle] = React.useState("Tender Saved");
  const [createTenderOpen, setCreateTenderOpen] = React.useState(false);
  const [deleteTender, setDeleteTender] = React.useState<TenderRecord | null>(null);
  const [deleteError, setDeleteError] = React.useState("");

  const stats = useTenderStats();
  const tenders = useTenders(query);
  const approveForCosting = useApproveTenderForCosting();
  const deleteTenderMutation = useDeleteTender();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const notice = params.get("notice");
    if (!notice) return;
    const timer = window.setTimeout(() => {
      setSuccessTitle("Tender Saved");
      setSuccessMessage(notice);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    if (searchParams.get("addTender") !== "1") return;
    const timer = window.setTimeout(() => {
      setCreateTenderOpen(true);
      const params = new URLSearchParams(window.location.search);
      params.delete("addTender");
      const queryString = params.toString();
      window.history.replaceState(null, "", `/tenders${queryString ? `?${queryString}` : ""}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [searchParams]);

  function closeSuccess() {
    setSuccessMessage("");
    const url = new URL(window.location.href);
    url.searchParams.delete("notice");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }

  async function approveSelectedTender() {
    if (!approvalTender) return;
    setApprovalError("");
    try {
      const result = await approveForCosting.mutateAsync({
        id: approvalTender.id,
        payload: { version: approvalTender.version },
      });
      setApprovalTender(null);
      router.push(`/tender-management/tender-costing?costingId=${result.costing.id}`);
    } catch (error) {
      setApprovalError(
        error instanceof ApiError ? error.message : "Could not approve this tender for costing.",
      );
    }
  }

  async function deleteSelectedTender() {
    if (!deleteTender) return;
    setDeleteError("");
    try {
      await deleteTenderMutation.mutateAsync(deleteTender.id);
      setDeleteTender(null);
      setSuccessTitle("Tender Deleted");
      setSuccessMessage("Tender deleted successfully.");
      setQuery((current) => ({
        ...current,
        page:
          visibleItems.length === 1 && (current.page ?? 1) > 1
            ? (current.page ?? 1) - 1
            : current.page,
      }));
    } catch (error) {
      setDeleteError(
        error instanceof ApiError ? error.message : "Could not delete this tender.",
      );
    }
  }

  function applyFilters(next: FilterDraft = draft) {
    setQuery({
      page: 1,
      limit: query.limit ?? 5,
      search: next.search || undefined,
      tenderType: next.tenderType || undefined,
      procurementMethod: (next.procurementMethod as TenderProcurementMethod) || undefined,
      status: (next.status as TenderStatus) || undefined,
      fromDate: next.fromDate || undefined,
      toDate: next.toDate || undefined,
    });
    setDateRangeOpen(false);
  }

  function clearFilters() {
    setDraft(EMPTY_DRAFT);
    setQuery({ page: 1, limit: 5 });
  }

  function toggleMenu(tender: TenderRecord, e: React.MouseEvent<HTMLButtonElement>) {
    if (menuAnchor?.tender.id === tender.id) {
      setMenuAnchor(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setMenuAnchor({ tender, top: rect.bottom + 4, right: window.innerWidth - rect.right });
  }

  const meta = tenders.data?.meta ?? { page: 1, limit: 5, total: 0, totalPages: 1 };

  const visibleItems = tenders.data?.items ?? [];

  function exportCsv() {
    const header = [
      "Tender ID",
      "Product / Work Name",
      "Tender Type",
      "Procurement Method",
      "Closing Date",
      "Found By",
      "Finding Date",
      "Status",
      "Costing Approval",
    ];
    const rows = visibleItems.map((row) => [
      row.egpTenderId ?? "N/A",
      row.workName,
      row.tenderType ?? "Not set",
      row.procurementMethod,
      row.submissionDeadline ? formatDate(row.submissionDeadline) : "—",
      row.foundBy?.name ?? row.foundByName ?? "—",
      row.findingDate ? formatDate(row.findingDate) : "—",
      TENDER_STATUS_META[row.status].label,
      COSTING_APPROVAL_META[row.costingApprovalStatus].label,
    ]);
    downloadCsv("tender-list.csv", [header, ...rows]);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-biz-border bg-biz-surface px-4 py-3 shadow-[0_2px_10px_rgba(15,23,42,0.05)]">
        <div>
          <h1 className="text-page-title text-biz-text">Tender List</h1>
          <p className="mt-0.5 text-[12.5px] text-biz-muted">
            Manage tender opportunities, submission status and award lifecycle.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SecondaryButton onClick={() => setDateRangeOpen((v) => !v)} className="h-9">
              <Calendar className="h-4 w-4" />
              {draft.fromDate ? formatDate(draft.fromDate) : "From"} –{" "}
              {draft.toDate ? formatDate(draft.toDate) : "To"}
            </SecondaryButton>
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
                      Submission Deadline From
                      <input
                        type="date"
                        value={draft.fromDate}
                        onChange={(e) => setDraft((d) => ({ ...d, fromDate: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-biz-muted">
                      To
                      <input
                        type="date"
                        value={draft.toDate}
                        onChange={(e) => setDraft((d) => ({ ...d, toDate: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <PrimaryButton className="mt-1 h-9" onClick={() => applyFilters()}>
                      Apply
                    </PrimaryButton>
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={exportCsv}
            title="Export as CSV"
            className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-sm bg-biz-success px-4 text-[13px] font-medium text-white transition-colors hover:brightness-95"
          >
            <Download className="h-4 w-4" />
            Export
          </button>

          <PrimaryButton
            type="button"
            className="h-9"
            onClick={() => setCreateTenderOpen(true)}
          >
            <FileEdit className="h-4 w-4" />
            Add New Tender
          </PrimaryButton>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-6 gap-1 sm:gap-1.5 lg:gap-2 xl:gap-3">
        <ModuleStatCard
          compact
          icon={SquareStack}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Tenders"
          value={String(stats.data?.total ?? "—")}
          helper="All Time"
        />
        <ModuleStatCard
          compact
          icon={ClipboardList}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Preparing"
          value={String(stats.data?.preparing ?? "—")}
          helper="Draft / Published / Preparing"
        />
        <ModuleStatCard
          compact
          icon={ArrowRight}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Submitted"
          value={String(stats.data?.submitted ?? "—")}
          helper="Awaiting Opening"
        />
        <ModuleStatCard
          compact
          icon={Search}
          iconClassName="bg-biz-warning-soft text-biz-warning"
          label="Under Evaluation"
          value={String(stats.data?.underEvaluation ?? "—")}
          helper="Opened / NOA Pending"
        />
        <ModuleStatCard
          compact
          icon={Award}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Awarded"
          value={String(stats.data?.awarded ?? "—")}
          helper="Awarded / Ongoing"
        />
        <ModuleStatCard
          compact
          icon={XCircle}
          iconClassName="bg-biz-danger-soft text-biz-danger"
          label="Unsuccessful"
          value={String(stats.data?.unsuccessful ?? "—")}
          helper="Rejected / Cancelled"
        />
      </div>

      {/* Filter Panel */}
      <div className="rounded-lg border border-biz-border bg-biz-surface p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-1 min-w-[180px] flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">
              Search Tender ID / Work Name
            </label>
            <TextInput
              icon={Search}
              placeholder="Search..."
              value={draft.search}
              onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Tender Type</label>
            <SelectInput
              className="w-[160px]"
              placeholder="All"
              value={draft.tenderType}
              onChange={(e) => setDraft((d) => ({ ...d, tenderType: e.target.value }))}
              options={TENDER_TYPE_OPTIONS}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Procurement Method</label>
            <SelectInput
              className="w-[150px]"
              placeholder="All"
              value={draft.procurementMethod}
              onChange={(e) => setDraft((d) => ({ ...d, procurementMethod: e.target.value }))}
              options={TENDER_PROCUREMENT_METHODS.map((method) => ({
                value: method,
                label: method,
              }))}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-biz-muted">Status</label>
            <SelectInput
              className="w-[160px]"
              placeholder="All"
              value={draft.status}
              onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
              options={TENDER_STATUS_OPTIONS}
            />
          </div>

          <PrimaryButton onClick={() => applyFilters()}>
            <Search className="h-4 w-4" />
            Search
          </PrimaryButton>
          <SecondaryButton onClick={clearFilters}>Reset</SecondaryButton>
        </div>

      </div>

      {/* Table */}
      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
          <h3 className="text-[15px] font-semibold text-biz-text">
            All Tenders ({meta.total})
          </h3>
        </div>

        <DataTable<TenderRecord>
          containerClassName="overflow-x-hidden"
          tableClassName="min-w-0 table-fixed text-[11px] xl:text-[12px]"
          isLoading={tenders.isLoading}
          data={visibleItems}
          rowKey={(row) => row.id}
          columns={[
            {
              key: "tenderId",
              header: "Tender ID",
              className: "w-[10%] overflow-hidden px-2 xl:px-3",
              render: (row) => (
                <span title={row.egpTenderId ?? "N/A"} className="block truncate">
                  {row.egpTenderId ?? "N/A"}
                </span>
              ),
            },
            {
              key: "work",
              header: "Product / Work Name",
              className: "w-[21%] overflow-hidden px-2 xl:px-3",
              render: (row) => (
                <Link
                  href={`/tenders/${row.id}`}
                  title={row.workName}
                  className="line-clamp-2 w-full break-words font-medium leading-4 text-biz-blue hover:underline"
                >
                  {row.workName}
                </Link>
              ),
            },
            {
              key: "tenderType",
              header: "Tender Type",
              className: "hidden w-[8%] overflow-hidden whitespace-normal px-2 leading-tight lg:table-cell xl:px-3",
              render: (row) => (
                <span title={row.tenderType ?? "Not set"} className="block truncate">
                  {row.tenderType ?? "Not set"}
                </span>
              ),
            },
            {
              key: "procurementMethod",
              header: "Procurement Method",
              className: "w-[9%] overflow-hidden whitespace-normal px-2 leading-tight xl:px-3",
              render: (row) => (
                <span title={row.procurementMethod} className="block truncate">
                  {row.procurementMethod}
                </span>
              ),
            },
            {
              key: "closingDate",
              header: "Closing Date",
              className: "w-[10%] whitespace-normal px-2 leading-tight xl:px-3",
              render: (row) =>
                row.submissionDeadline ? formatDate(row.submissionDeadline) : "—",
            },
            {
              key: "foundBy",
              header: "Found By",
              className: "hidden w-[9%] overflow-hidden px-2 lg:table-cell xl:px-3",
              render: (row) => row.foundBy?.name ?? row.foundByName ?? "—",
            },
            {
              key: "findingDate",
              header: "Finding Date",
              className: "hidden w-[9%] whitespace-normal px-2 leading-tight lg:table-cell xl:px-3",
              render: (row) => (row.findingDate ? formatDate(row.findingDate) : "—"),
            },
            {
              key: "status",
              header: "Status",
              className: "w-[9%] overflow-hidden px-2 xl:px-3",
              render: (row) => (
                <StatusBadge
                  label={TENDER_STATUS_META[row.status].label}
                  tone={TENDER_STATUS_META[row.status].tone}
                />
              ),
            },
            {
              key: "costingApproval",
              header: "Costing Approval",
              className: "w-[11%] overflow-hidden whitespace-normal px-2 leading-tight xl:px-3",
              render: (row) => {
                if (row.costingApprovalStatus === "PENDING_APPROVAL") {
                  return (
                    <PrimaryButton
                      className="h-7 max-w-full gap-1 px-1.5 text-[10px] xl:px-2"
                      onClick={() => {
                        setApprovalError("");
                        setApprovalTender(row);
                      }}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Approve
                    </PrimaryButton>
                  );
                }
                const meta = COSTING_APPROVAL_META[row.costingApprovalStatus];
                return <StatusBadge label={meta.label} tone={meta.tone} />;
              },
            },
            {
              key: "action",
              header: "Action",
              className: "w-[5%] overflow-hidden bg-biz-surface px-1 text-center",
              render: (row) => (
                <div className="flex items-center justify-center">
                  <IconButton
                    aria-label="More actions"
                    title="More actions"
                    onClick={(e) => toggleMenu(row, e)}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </IconButton>
                </div>
              ),
            },
          ]}
        />

        {meta.total > 5 && (
          <Pagination
            page={meta.page}
            limit={meta.limit}
            total={meta.total}
            totalPages={meta.totalPages}
            pageSizeOptions={[5, 10, 20, 50]}
            onLimitChange={(limit) => setQuery((current) => ({ ...current, page: 1, limit }))}
            onPageChange={(page) => setQuery((current) => ({ ...current, page }))}
            showJumpButtons
          />
        )}
      </div>

      {menuAnchor && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40"
            aria-label="Close"
            onClick={() => setMenuAnchor(null)}
          />
          <div
            className="fixed z-50 w-[180px] overflow-hidden rounded-md border border-biz-border bg-biz-surface py-1 shadow-card-hover"
            style={{ top: menuAnchor.top, right: menuAnchor.right }}
          >
            <Link
              href={`/tenders/${menuAnchor.tender.id}`}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-biz-text hover:bg-biz-bg"
              onClick={() => setMenuAnchor(null)}
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Link>
            <Link
              href={`/tenders/${menuAnchor.tender.id}/edit`}
              className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-biz-text hover:bg-biz-bg"
              onClick={() => setMenuAnchor(null)}
            >
              <FileEdit className="h-3.5 w-3.5" />
              Edit
            </Link>
            {menuAnchor.tender.costingApprovalStatus !== "APPROVED" && (
              <button
                type="button"
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-biz-danger hover:bg-biz-danger/5"
                onClick={() => {
                  setDeleteError("");
                  setDeleteTender(menuAnchor.tender);
                  setMenuAnchor(null);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            )}
          </div>
        </>
      )}

      <Modal
        open={!!deleteTender}
        onClose={() => !deleteTenderMutation.isPending && setDeleteTender(null)}
        title="Delete Tender?"
      >
        {deleteTender && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-biz-border bg-biz-bg p-3 text-[13px] text-biz-text">
              <p className="font-semibold">
                {deleteTender.egpTenderId} · {deleteTender.workName}
              </p>
              <p className="mt-1 text-biz-muted">
                This tender has not been approved for costing. It can be deleted if no workflow
                records are linked. This action cannot be undone.
              </p>
            </div>
            {deleteTender.costingApprovalStatus === "APPROVED" && (
              <p className="text-[12px] font-medium text-biz-danger">
                This tender is already approved for costing and cannot be deleted.
              </p>
            )}
            {deleteError && <p className="text-[12px] text-biz-danger">{deleteError}</p>}
            <div className="flex justify-end gap-2">
              <SecondaryButton
                disabled={deleteTenderMutation.isPending}
                onClick={() => setDeleteTender(null)}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton
                className="bg-biz-danger hover:bg-biz-danger/90"
                disabled={
                  deleteTenderMutation.isPending ||
                  deleteTender.costingApprovalStatus === "APPROVED"
                }
                onClick={deleteSelectedTender}
              >
                <Trash2 className="h-4 w-4" />
                {deleteTenderMutation.isPending ? "Deleting..." : "Delete Tender"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={createTenderOpen}
        onClose={() => setCreateTenderOpen(false)}
        title="Add New Tender"
        wide
        contentClassName="max-h-[calc(100vh-2rem)] overflow-y-auto"
      >
        <TenderForm
          mode="create"
          embedded
          onCancel={() => setCreateTenderOpen(false)}
          onCompleted={(message) => {
            setCreateTenderOpen(false);
            setSuccessTitle("Tender Saved");
            setSuccessMessage(message);
          }}
        />
      </Modal>

      <Modal
        open={!!approvalTender}
        onClose={() => !approveForCosting.isPending && setApprovalTender(null)}
        title="Approve for Tender Costing?"
      >
        {approvalTender && (
          <div className="flex flex-col gap-4">
            <div className="rounded-md border border-biz-border bg-biz-bg p-3 text-[13px] text-biz-text">
              <p className="font-semibold">
                {approvalTender.egpTenderId} · {approvalTender.workName}
              </p>
              <p className="mt-1 text-biz-muted">
                A ready costing record will be created and placed at the top of the Tender Costing
                list.
              </p>
            </div>
            {approvalError && <p className="text-[12px] text-biz-danger">{approvalError}</p>}
            <div className="flex justify-end gap-2">
              <SecondaryButton
                disabled={approveForCosting.isPending}
                onClick={() => setApprovalTender(null)}
              >
                Cancel
              </SecondaryButton>
              <PrimaryButton disabled={approveForCosting.isPending} onClick={approveSelectedTender}>
                <ShieldCheck className="h-4 w-4" />
                {approveForCosting.isPending ? "Approving..." : "Approve for Costing"}
              </PrimaryButton>
            </div>
          </div>
        )}
      </Modal>

      <SuccessPopup
        open={!!successMessage}
        title={successTitle}
        message={successMessage}
        onClose={closeSuccess}
        onPrimary={closeSuccess}
      />
    </div>
  );
}
