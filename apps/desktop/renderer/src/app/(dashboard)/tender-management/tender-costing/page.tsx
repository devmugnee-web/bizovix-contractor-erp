"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Calculator,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FolderKanban,
  Plus,
  RotateCcw,
  Search,
  Settings2,
} from "lucide-react";
import {
  useAllOrganizations,
  useTenderCostingStats,
  useTenderCostings,
  useTenderOptions,
} from "@bizovix/api-client";
import {
  DataTable,
  ModuleStatCard,
  Pagination,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
  type StatusBadgeTone,
} from "@bizovix/ui";
import { formatDate } from "@bizovix/utils";
import type { TenderCostingQuery, TenderCostingRecord, TenderCostingStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const STATUS_META: Record<TenderCostingStatus, { label: string; tone: StatusBadgeTone }> = {
  READY: { label: "Ready for Costing", tone: "info" },
  IN_PROGRESS: { label: "In Progress", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

interface FilterDraft {
  search: string;
  organizationMasterId: string;
  status: string;
  assignedToUserId: string;
  fromDate: string;
  toDate: string;
}

const EMPTY_FILTERS: FilterDraft = {
  search: "",
  organizationMasterId: "",
  status: "",
  assignedToUserId: "",
  fromDate: "",
  toDate: "",
};

function formatBDTLakh(value: number): string {
  if (!Number.isFinite(value)) return "BDT 0.00 Lakh";
  return `BDT ${(value / 100_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} Lakh`;
}

function formatCostingNumber(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
}

function downloadCsv(rows: TenderCostingRecord[]) {
  const header = [
    "Tender ID",
    "Product / Work Name",
    "Organization",
    "Estimated Value",
    "Estimated Cost",
    "Our Cost",
    "Margin %",
    "Status",
    "Assigned To",
    "Last Updated",
  ];
  const body = rows.map((record) => [
    record.tender.egpTenderId ?? record.tender.id,
    record.tender.workName,
    record.tender.organizationMaster?.shortName ?? "Not set",
    record.estimatedValue,
    record.estimatedCost,
    record.ourCost,
    record.marginPercent,
    STATUS_META[record.status].label,
    record.assignedTo?.name ?? record.assignedToName ?? record.preparedBy?.name ?? "Unassigned",
    record.updatedAt,
  ]);
  const blob = new Blob([toCsv([header, ...body])], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tender-costing.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function TenderCostingPage() {
  useSetBreadcrumb([
    { label: "Tender Management", href: "/tender-management" },
    { label: "Tender Costing" },
  ]);
  const router = useRouter();
  const [filters, setFilters] = React.useState<FilterDraft>(EMPTY_FILTERS);
  const [query, setQuery] = React.useState<TenderCostingQuery>({ page: 1, limit: 5 });
  const [highlightedId, setHighlightedId] = React.useState("");

  const costings = useTenderCostings(query);
  const stats = useTenderCostingStats();
  const organizations = useAllOrganizations();
  const options = useTenderOptions();

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("costingId") ?? "";
    const timer = window.setTimeout(() => setHighlightedId(id), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function applyFilters() {
    setQuery({
      page: 1,
      limit: query.limit ?? 5,
      search: filters.search || undefined,
      organizationMasterId: filters.organizationMasterId || undefined,
      status: (filters.status as TenderCostingStatus) || undefined,
      assignedToUserId: filters.assignedToUserId || undefined,
      fromDate: filters.fromDate || undefined,
      toDate: filters.toDate || undefined,
    });
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setQuery({ page: 1, limit: 5 });
  }

  const records = React.useMemo(() => {
    const items = costings.data?.items ?? [];
    if (!highlightedId) return items;
    return [...items].sort(
      (left, right) => Number(right.id === highlightedId) - Number(left.id === highlightedId),
    );
  }, [costings.data?.items, highlightedId]);

  const meta = costings.data?.meta ?? { page: 1, limit: 5, total: 0, totalPages: 1 };
  const snapshot = stats.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-biz-border bg-biz-surface px-4 py-3 shadow-card">
        <div>
          <h1 className="text-page-title text-biz-text">Tender Costing</h1>
          <p className="mt-0.5 text-[12.5px] text-biz-muted">
            Approved tenders appear here first, ready for costing preparation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SecondaryButton disabled={!records.length} onClick={() => downloadCsv(records)}>
            <Download className="h-4 w-4" />
            Export
          </SecondaryButton>
          <Link href="/tenders">
            <PrimaryButton>
              <Plus className="h-4 w-4" />
              Review Pending Tenders
            </PrimaryButton>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-1 sm:gap-1.5 lg:gap-2">
        <ModuleStatCard
          compact
          icon={FolderKanban}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Costing"
          value={String(snapshot?.total ?? "—")}
          helper="Live records"
        />
        <ModuleStatCard
          compact
          icon={Clock3}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Ready"
          value={String(snapshot?.ready ?? "—")}
          helper="Approved tenders"
        />
        <ModuleStatCard
          compact
          icon={Settings2}
          iconClassName="bg-biz-warning-soft text-biz-warning"
          label="In Progress"
          value={String(snapshot?.inProgress ?? "—")}
          helper="Costing underway"
        />
        <ModuleStatCard
          compact
          icon={CheckCircle2}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Completed"
          value={String(snapshot?.completed ?? "—")}
          helper="Final costing"
        />
        <ModuleStatCard
          compact
          icon={Banknote}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Costing Budget"
          value={snapshot ? formatBDTLakh(Number(snapshot.totalCostingBudget)) : "—"}
          helper="Saved budgets"
        />
        <ModuleStatCard
          compact
          icon={Banknote}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Our Cost"
          value={snapshot ? formatBDTLakh(Number(snapshot.totalOurCost)) : "—"}
          helper="Calculated total"
        />
      </div>

      <div className="rounded-lg border border-biz-border bg-biz-surface p-2">
        <div className="grid grid-cols-[minmax(0,2fr)_repeat(6,minmax(0,1fr))] items-end gap-1 lg:gap-2">
          <div className="min-w-0">
            <label className="mb-1 hidden text-[11px] font-medium text-biz-muted xl:block">
              Search Tender ID / Work Name
            </label>
            <TextInput
              className="h-8 min-w-0 px-1.5 text-[9px] sm:text-[10px] lg:px-2 lg:text-[11px]"
              placeholder="Tender ID / Work..."
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value }))
              }
              onKeyDown={(event) => event.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 hidden text-[11px] font-medium text-biz-muted xl:block">
              Organization
            </label>
            <SelectInput
              placeholder="All"
              aria-label="Organization"
              className="h-8 min-w-0 px-1 pr-4 text-[9px] sm:text-[10px] lg:px-2 lg:pr-6 lg:text-[11px]"
              value={filters.organizationMasterId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, organizationMasterId: event.target.value }))
              }
              options={(organizations.data ?? []).map((organization) => ({
                value: organization.id,
                label: organization.shortName,
              }))}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 hidden text-[11px] font-medium text-biz-muted xl:block">Status</label>
            <SelectInput
              placeholder="All"
              aria-label="Status"
              className="h-8 min-w-0 px-1 pr-4 text-[9px] sm:text-[10px] lg:px-2 lg:pr-6 lg:text-[11px]"
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({ ...current, status: event.target.value }))
              }
              options={Object.entries(STATUS_META).map(([value, meta]) => ({
                value,
                label: meta.label,
              }))}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 hidden text-[11px] font-medium text-biz-muted xl:block">
              Assigned To
            </label>
            <SelectInput
              placeholder="All"
              aria-label="Assigned To"
              className="h-8 min-w-0 px-1 pr-4 text-[9px] sm:text-[10px] lg:px-2 lg:pr-6 lg:text-[11px]"
              value={filters.assignedToUserId}
              onChange={(event) =>
                setFilters((current) => ({ ...current, assignedToUserId: event.target.value }))
              }
              options={(options.data?.users ?? []).map((user) => ({
                value: user.id,
                label: user.name,
              }))}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 hidden text-[11px] font-medium text-biz-muted xl:block">From</label>
            <TextInput
              type="date"
              aria-label="From date"
              className="h-8 min-w-0 px-0.5 text-[8px] sm:px-1 sm:text-[9px] lg:px-2 lg:text-[10px]"
              value={filters.fromDate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, fromDate: event.target.value }))
              }
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 hidden text-[11px] font-medium text-biz-muted xl:block">To</label>
            <TextInput
              type="date"
              aria-label="To date"
              className="h-8 min-w-0 px-0.5 text-[8px] sm:px-1 sm:text-[9px] lg:px-2 lg:text-[10px]"
              value={filters.toDate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, toDate: event.target.value }))
              }
            />
          </div>
          <div className="flex min-w-0 items-end gap-0.5 lg:gap-1">
            <button
              type="button"
              aria-label="Search"
              title="Search"
              className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-sm bg-biz-blue px-0.5 text-white hover:bg-biz-blue/90"
              onClick={applyFilters}
            >
              <Search className="h-3 w-3 shrink-0" />
              <span className="ml-1 hidden text-[10px] xl:inline">Search</span>
            </button>
            <button
              type="button"
              aria-label="Reset filters"
              title="Reset filters"
              className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-sm border border-biz-border bg-biz-surface px-0.5 text-biz-muted hover:bg-biz-bg"
              onClick={resetFilters}
            >
              <RotateCcw className="h-3 w-3 shrink-0" />
              <span className="ml-1 hidden text-[10px] xl:inline">Reset</span>
            </button>
          </div>
        </div>
      </div>

      {costings.isError && (
        <div className="rounded-lg border border-biz-danger/30 bg-biz-danger/5 px-4 py-3 text-[12.5px] text-biz-danger">
          Could not load tender costing records. Please retry.
        </div>
      )}

      <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
        <div className="flex items-center justify-between border-b border-biz-border px-4 py-3">
          <h2 className="whitespace-nowrap text-[15px] font-semibold text-biz-text">Tender Costing List</h2>
          <span className="hidden truncate text-[11.5px] text-biz-muted sm:block">
            Ready records are created only after approval
          </span>
        </div>
        <DataTable<TenderCostingRecord>
          containerClassName="overflow-x-hidden"
          tableClassName="min-w-0 table-fixed text-[10px] xl:text-[11px]"
          isLoading={costings.isLoading}
          data={records}
          rowKey={(record) => record.id}
          emptyMessage="No approved tender costing records found."
          onRowClick={(record) =>
            router.push(`/tender-management/tender-costing/add?costingId=${record.id}`)
          }
          columns={[
            {
              key: "tenderId",
              header: "Tender ID",
              className: "w-[12%] overflow-hidden px-1.5 xl:w-[10%] xl:px-2",
              render: (record) => (
                <div
                  className={
                    highlightedId === record.id
                      ? "rounded-md bg-biz-blue-soft px-2 py-1 ring-1 ring-biz-blue/30"
                      : ""
                  }
                >
                  <p
                    title={record.tender.egpTenderId ?? record.tender.id}
                    className="truncate font-semibold text-biz-blue"
                  >
                    {record.tender.egpTenderId ?? record.tender.id}
                  </p>
                  {highlightedId === record.id && (
                    <p className="text-[10px] font-medium text-biz-success">Newly approved</p>
                  )}
                </div>
              ),
            },
            {
              key: "work",
              header: "Product / Work Name",
              className: "w-[22%] overflow-hidden px-1.5 xl:w-[18%] xl:px-2",
              render: (record) => (
                <span title={record.tender.workName} className="block truncate">
                  {record.tender.workName}
                </span>
              ),
            },
            {
              key: "organization",
              header: "Organization",
              className: "hidden w-[8%] overflow-hidden px-2 xl:table-cell",
              render: (record) => {
                const organization = record.tender.organizationMaster?.shortName ?? "Not set";
                return (
                  <span title={organization} className="block truncate">
                    {organization}
                  </span>
                );
              },
            },
            {
              key: "value",
              header: "Estimated Value (BDT)",
              className: "w-[14%] overflow-hidden whitespace-normal px-1.5 text-right leading-tight xl:w-[10%] xl:px-2",
              render: (record) => formatCostingNumber(Number(record.estimatedValue)),
            },
            {
              key: "estimated",
              header: "Estimated Cost (BDT)",
              className: "hidden w-[10%] overflow-hidden whitespace-normal px-2 text-right leading-tight lg:table-cell",
              render: (record) => formatCostingNumber(Number(record.estimatedCost)),
            },
            {
              key: "ourCost",
              header: "Our Cost (BDT)",
              className: "w-[14%] overflow-hidden whitespace-normal px-1.5 text-right leading-tight xl:w-[10%] xl:px-2",
              render: (record) => formatCostingNumber(Number(record.ourCost)),
            },
            {
              key: "margin",
              header: "Margin",
              className: "w-[9%] overflow-hidden px-1 text-right xl:w-[7%] xl:px-2",
              render: (record) => (
                <span className="font-semibold text-biz-success">
                  {Number(record.marginPercent).toFixed(2)}%
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              className: "w-[12%] overflow-hidden px-1 xl:w-[8%] xl:px-2",
              render: (record) => (
                <StatusBadge
                  label={STATUS_META[record.status].label}
                  tone={STATUS_META[record.status].tone}
                />
              ),
            },
            {
              key: "assigned",
              header: "Assigned To",
              className: "hidden w-[8%] overflow-hidden px-2 lg:table-cell",
              render: (record) => {
                const assigned =
                  record.assignedTo?.name ??
                  record.assignedToName ??
                  record.preparedBy?.name ??
                  "Unassigned";
                return (
                  <span title={assigned} className="block truncate">
                    {assigned}
                  </span>
                );
              },
            },
            {
              key: "updated",
              header: "Last Updated",
              className: "hidden w-[7%] whitespace-normal px-2 leading-tight xl:table-cell",
              render: (record) => formatDate(record.updatedAt),
            },
            {
              key: "action",
              header: "Action",
              className: "w-[17%] overflow-hidden px-1 text-center xl:w-[14%] xl:px-2",
              render: (record) => (
                <Link href={`/tender-management/tender-costing/add?costingId=${record.id}`}>
                  {record.status === "READY" ? (
                    <PrimaryButton className="h-7 max-w-full gap-1 bg-biz-blue px-1.5 text-[9px] text-white shadow-sm hover:bg-biz-blue/90 xl:px-2 xl:text-[10px]">
                      <Calculator className="hidden h-3 w-3 shrink-0 sm:block" />
                      <>
                        <span className="sm:hidden">Start</span>
                        <span className="hidden sm:inline">Start Costing</span>
                      </>
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton className="h-7 max-w-full gap-1 px-1.5 text-[9px] xl:px-2 xl:text-[10px]">
                      <Eye className="hidden h-3 w-3 shrink-0 sm:block" />
                      Open
                    </SecondaryButton>
                  )}
                </Link>
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
    </div>
  );
}
