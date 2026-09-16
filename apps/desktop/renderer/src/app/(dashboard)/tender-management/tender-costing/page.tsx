"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
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
  Pagination,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
  type StatusBadgeTone,
} from "@bizovix/ui";
import { formatAmount, formatDate } from "@bizovix/utils";
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

interface CostingStatCardProps {
  icon: LucideIcon;
  iconClassName: string;
  label: string;
  value: string;
  helper: string;
}

function CostingStatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  helper,
}: CostingStatCardProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-biz-border bg-white px-3 py-2.5 shadow-card transition-shadow hover:shadow-card-hover 2xl:min-h-[76px] 2xl:gap-3 2xl:px-4 2xl:py-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg 2xl:h-10 2xl:w-10 ${iconClassName}`}
      >
        <Icon className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          title={label}
          className="truncate text-[11px] font-semibold leading-tight text-slate-600 xl:text-[12px] 2xl:text-[13px]"
        >
          {label}
        </p>
        <p
          title={value}
          className="mt-0.5 whitespace-nowrap text-[15px] font-bold leading-none text-biz-text xl:text-[17px] 2xl:text-[20px]"
        >
          {value}
        </p>
        <p
          title={helper}
          className="mt-1 hidden truncate text-[9.5px] font-medium leading-tight text-slate-500 xl:block 2xl:text-[11px]"
        >
          {helper}
        </p>
      </div>
    </div>
  );
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
    <div className="scrollbar-hidden flex min-h-full flex-col gap-2 overflow-y-auto subpixel-antialiased lg:h-full lg:min-h-0 lg:overflow-hidden 2xl:gap-3">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-biz-border bg-white px-3 py-2.5 shadow-card xl:px-4 2xl:px-5 2xl:py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue 2xl:h-10 2xl:w-10">
            <Calculator className="h-[18px] w-[18px] 2xl:h-5 2xl:w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="text-[20px] font-bold leading-tight text-biz-text xl:text-[22px] 2xl:text-[26px]">
              Tender Costing
            </h1>
            <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500 xl:text-[12px] 2xl:text-[14px]">
              Approved tenders ready for costing preparation and review
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end [&_button]:h-9 [&_button]:text-[11px] 2xl:[&_button]:h-10 2xl:[&_button]:text-[13px]">
          <SecondaryButton data-shortcut-action="export" disabled={!records.length} onClick={() => downloadCsv(records)}>
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
      </header>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 2xl:gap-3">
        <CostingStatCard
          icon={FolderKanban}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Total Costing"
          value={String(snapshot?.total ?? "—")}
          helper="Live records"
        />
        <CostingStatCard
          icon={Clock3}
          iconClassName="bg-biz-blue-soft text-biz-blue"
          label="Ready"
          value={String(snapshot?.ready ?? "—")}
          helper="Approved tenders"
        />
        <CostingStatCard
          icon={Settings2}
          iconClassName="bg-biz-warning-soft text-biz-warning"
          label="In Progress"
          value={String(snapshot?.inProgress ?? "—")}
          helper="Costing underway"
        />
        <CostingStatCard
          icon={CheckCircle2}
          iconClassName="bg-biz-success-soft text-biz-success"
          label="Completed"
          value={String(snapshot?.completed ?? "—")}
          helper="Final costing"
        />
        <CostingStatCard
          icon={Banknote}
          iconClassName="bg-biz-purple-soft text-biz-purple"
          label="Budget (BDT)"
          value={snapshot ? formatAmount(Number(snapshot.totalCostingBudget)) : "—"}
          helper="Saved budgets"
        />
        <CostingStatCard
          icon={Banknote}
          iconClassName="bg-biz-orange-soft text-biz-orange"
          label="Our Cost (BDT)"
          value={snapshot ? formatAmount(Number(snapshot.totalOurCost)) : "—"}
          helper="Calculated total"
        />
      </div>

      <section className="shrink-0 rounded-lg border border-biz-border bg-white p-2.5 shadow-card 2xl:p-3">
        <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-4 xl:grid-cols-[minmax(180px,2fr)_repeat(5,minmax(100px,1fr))_160px] 2xl:gap-3">
          <div className="col-span-2 min-w-0 xl:col-span-1">
            <label className="mb-1 block text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Search Tender ID / Work Name
            </label>
            <TextInput
              data-shortcut-action="filters"
              icon={Search}
              className="h-9 min-w-0 text-[11px] xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
              placeholder="Search tender ID or work..."
              value={filters.search}
              onChange={(event) =>
                setFilters((current) => ({ ...current, search: event.target.value }))
              }
              onKeyDown={(event) => event.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Organization
            </label>
            <SelectInput
              placeholder="All"
              aria-label="Organization"
              className="h-9 min-w-0 text-[11px] xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
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
            <label className="mb-1 block text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Status
            </label>
            <SelectInput
              placeholder="All"
              aria-label="Status"
              className="h-9 min-w-0 text-[11px] xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
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
            <label className="mb-1 block text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              Assigned To
            </label>
            <SelectInput
              placeholder="All"
              aria-label="Assigned To"
              className="h-9 min-w-0 text-[11px] xl:text-[12px] 2xl:h-10 2xl:text-[14px]"
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
            <label className="mb-1 block text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              From
            </label>
            <TextInput
              type="date"
              aria-label="From date"
              className="h-9 min-w-0 px-2 text-[10px] xl:text-[11px] 2xl:h-10 2xl:text-[13px]"
              value={filters.fromDate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, fromDate: event.target.value }))
              }
            />
          </div>
          <div className="min-w-0">
            <label className="mb-1 block text-[10px] font-semibold text-slate-500 xl:text-[11px] 2xl:text-[12px]">
              To
            </label>
            <TextInput
              type="date"
              aria-label="To date"
              className="h-9 min-w-0 px-2 text-[10px] xl:text-[11px] 2xl:h-10 2xl:text-[13px]"
              value={filters.toDate}
              onChange={(event) =>
                setFilters((current) => ({ ...current, toDate: event.target.value }))
              }
            />
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-1">
            <button
              type="button"
              aria-label="Search"
              title="Search"
              className="flex h-9 min-w-0 items-center justify-center rounded-md bg-biz-blue px-1 text-white transition-colors hover:bg-biz-blue/90 2xl:h-10"
              onClick={applyFilters}
            >
              <Search className="h-3 w-3 shrink-0" />
              <span className="ml-1 hidden text-[10px] sm:inline">Search</span>
            </button>
            <button
              type="button"
              aria-label="Reset filters"
              title="Reset filters"
              className="flex h-9 min-w-0 items-center justify-center rounded-md border border-biz-border bg-white px-1 text-slate-500 transition-colors hover:bg-slate-50 2xl:h-10"
              onClick={resetFilters}
            >
              <RotateCcw className="h-3 w-3 shrink-0" />
              <span className="ml-1 hidden text-[10px] sm:inline">Reset</span>
            </button>
          </div>
        </div>
      </section>

      {costings.isError && (
        <div className="shrink-0 rounded-lg border border-biz-danger/30 bg-biz-danger/5 px-3 py-2 text-[11px] font-medium text-biz-danger xl:text-[12px]">
          Could not load tender costing records. Please retry.
        </div>
      )}

      <section className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card lg:min-h-0">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-biz-border bg-slate-50/55 px-3 py-2.5 2xl:px-4 2xl:py-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="whitespace-nowrap text-[14px] font-bold text-biz-text xl:text-[15px] 2xl:text-[18px]">
              Tender Costing List
            </h2>
            <span className="rounded-full bg-biz-blue-soft px-2 py-0.5 text-[10px] font-semibold text-biz-blue xl:text-[11px] 2xl:px-2.5 2xl:text-[12px]">
              {meta.total} records
            </span>
          </div>
          <span className="hidden truncate text-[10px] font-medium text-slate-500 sm:block xl:text-[11px] 2xl:text-[12px]">
            Costing records are created after tender approval
          </span>
        </div>
        <DataTable<TenderCostingRecord>
          containerClassName="scrollbar-hidden min-h-0 flex-1 overflow-auto"
          tableClassName="min-w-[760px] table-fixed text-[10px] [&_thead_th]:sticky [&_thead_th]:top-0 [&_thead_th]:z-10 [&_thead_th]:bg-biz-bg [&_thead_th]:font-semibold [&_thead_th]:text-slate-600 [&_tbody_tr:nth-child(even)]:bg-slate-50/35 xl:min-w-0 xl:text-[12px] 2xl:text-[14px]"
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
              className: "w-[10%] overflow-hidden px-1.5 py-2 xl:w-[8%] xl:px-2.5 2xl:py-3",
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
              className: "w-[22%] overflow-hidden px-1.5 py-2 xl:w-[18%] xl:px-2.5 2xl:py-3",
              render: (record) => (
                <span title={record.tender.workName} className="block truncate">
                  {record.tender.workName}
                </span>
              ),
            },
            {
              key: "organization",
              header: "Organization",
              className: "hidden w-[8%] overflow-hidden px-2 py-2 xl:table-cell xl:px-2.5 2xl:py-3",
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
              header: "Est. Value (BDT)",
              className:
                "w-[12%] overflow-hidden whitespace-normal px-1.5 py-2 text-right leading-tight xl:w-[9%] xl:px-2.5 2xl:py-3",
              render: (record) => (
                <span
                  className="whitespace-nowrap font-medium"
                  title={`BDT ${formatCostingNumber(Number(record.estimatedValue))}`}
                >
                  {formatAmount(Number(record.estimatedValue))}
                </span>
              ),
            },
            {
              key: "estimated",
              header: "Est. Cost (BDT)",
              className:
                "hidden w-[10%] overflow-hidden whitespace-normal px-2 py-2 text-right leading-tight lg:table-cell xl:w-[9%] xl:px-2.5 2xl:py-3",
              render: (record) => (
                <span
                  className="whitespace-nowrap font-medium"
                  title={`BDT ${formatCostingNumber(Number(record.estimatedCost))}`}
                >
                  {formatAmount(Number(record.estimatedCost))}
                </span>
              ),
            },
            {
              key: "ourCost",
              header: "Our Cost (BDT)",
              className:
                "w-[12%] overflow-hidden whitespace-normal px-1.5 py-2 text-right leading-tight xl:w-[9%] xl:px-2.5 2xl:py-3",
              render: (record) => (
                <span
                  className="whitespace-nowrap font-medium"
                  title={`BDT ${formatCostingNumber(Number(record.ourCost))}`}
                >
                  {formatAmount(Number(record.ourCost))}
                </span>
              ),
            },
            {
              key: "margin",
              header: "Margin",
              className: "w-[7%] overflow-hidden px-1 py-2 text-right xl:px-2.5 2xl:py-3",
              render: (record) => (
                <span className="font-semibold text-biz-success">
                  {Number(record.marginPercent).toFixed(2)}%
                </span>
              ),
            },
            {
              key: "status",
              header: "Status",
              className: "w-[10%] overflow-hidden px-1 py-2 xl:w-[9%] xl:px-2 2xl:py-3",
              render: (record) => {
                const status = STATUS_META[record.status];
                return (
                  <span title={status.label}>
                    <StatusBadge
                      label={record.status === "READY" ? "Ready" : status.label}
                      tone={status.tone}
                      className="whitespace-nowrap px-2 py-1 text-[9px] font-semibold xl:text-[10px] 2xl:px-2.5 2xl:text-[12px]"
                    />
                  </span>
                );
              },
            },
            {
              key: "assigned",
              header: "Assigned To",
              className: "hidden w-[8%] overflow-hidden px-2 py-2 lg:table-cell xl:px-2.5 2xl:py-3",
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
              className:
                "hidden w-[7%] whitespace-normal px-2 py-2 leading-tight xl:table-cell xl:px-2.5 2xl:py-3",
              render: (record) => formatDate(record.updatedAt),
            },
            {
              key: "action",
              header: "Action",
              className: "w-[9%] overflow-hidden px-1 py-2 text-center xl:w-[8%] xl:px-2 2xl:py-3",
              render: (record) => (
                <Link href={`/tender-management/tender-costing/add?costingId=${record.id}`}>
                  {record.status === "READY" ? (
                    <PrimaryButton className="h-7 max-w-full gap-1 whitespace-nowrap bg-biz-blue px-1.5 text-[9px] text-white shadow-sm hover:bg-biz-blue/90 xl:h-8 xl:px-2 xl:text-[10px] 2xl:text-[12px]">
                      <Calculator className="hidden h-3 w-3 shrink-0 2xl:block" />
                      <>
                        <span className="xl:hidden">Start</span>
                        <span className="hidden xl:inline">Start Costing</span>
                      </>
                    </PrimaryButton>
                  ) : (
                    <SecondaryButton className="h-7 max-w-full gap-1 whitespace-nowrap px-1.5 text-[9px] xl:h-8 xl:px-2 xl:text-[10px] 2xl:text-[12px]">
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
          <div className="shrink-0 border-t border-biz-border bg-slate-50/60 [&>div>span]:font-medium [&>div>span]:text-slate-600 2xl:[&>div>span]:text-[13px]">
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
          </div>
        )}
      </section>
    </div>
  );
}
