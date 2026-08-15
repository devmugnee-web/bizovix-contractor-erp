"use client";
import * as React from "react";
import {
  CalendarDays,
  Download,
  Eye,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  UserRound,
  X,
} from "lucide-react";
import {
  useActivityLogStats,
  useActivityLogUsers,
  useActivityLogs,
  useExportActivityLogs,
} from "@bizovix/api-client";
import type { ActivityLogQuery, ActivityLogRecord } from "@bizovix/types";
import { SecondaryButton, SelectInput, TextInput, cn } from "@bizovix/ui";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const MODULES = [
  "Authentication",
  "Tender",
  "Document Purchase",
  "Tender Security",
  "Credit Commitment",
  "PG / BG",
  "Cms Work",
  "Project Expense",
  "General Expense",
  "Receipt",
  "Accounts",
  "Reports",
  "Documents",
  "Settings",
];
const ACTIONS = [
  "create",
  "update",
  "delete",
  "login",
  "export",
  "approve",
  "attach",
  "accept_noa",
  "reject_noa",
  "archive",
  "restore",
];
function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function dateTime(value: string) {
  const d = new Date(value);
  return {
    date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
  };
}
function objectEntries(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>).slice(0, 12)
    : [];
}
function display(value: unknown) {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ActivityLogPage() {
  useSetBreadcrumb([{ label: "Activity Log" }]);
  const [page, setPage] = React.useState(1);
  const [draft, setDraft] = React.useState({
    dateFrom: "2026-08-01",
    dateTo: "2026-08-15",
    userId: "",
    module: "",
    action: "",
    status: "",
    search: "",
  });
  const [filters, setFilters] = React.useState(draft);
  const [selected, setSelected] = React.useState<ActivityLogRecord | null>(null);
  const query: ActivityLogQuery = {
    page,
    limit: 20,
    ...Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v || undefined])),
  };
  const logs = useActivityLogs(query);
  const stats = useActivityLogStats();
  const users = useActivityLogUsers();
  const exporter = useExportActivityLogs();
  const rows = logs.data?.items ?? [];
  const meta = logs.data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 1 };
  async function exportLogs() {
    const result = await exporter.mutateAsync({ ...query, page: undefined, limit: undefined });
    download(result.filename, result.content);
  }
  const kpis = [
    [
      History,
      "Total Activities",
      stats.data?.total ?? 0,
      "All recorded activities",
      "border-blue-200 bg-blue-50/40 text-blue-600",
    ],
    [
      CalendarDays,
      "Today's Activities",
      stats.data?.today ?? 0,
      "Activities recorded today",
      "border-green-200 bg-green-50/40 text-green-600",
    ],
    [
      UserRound,
      "User Actions",
      stats.data?.userActions ?? 0,
      "Performed by users today",
      "border-purple-200 bg-purple-50/40 text-purple-600",
    ],
    [
      ShieldAlert,
      "Security Alerts",
      stats.data?.securityAlerts ?? 0,
      "Failed or sensitive activities",
      "border-orange-200 bg-orange-50/40 text-orange-600",
    ],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-page-title text-biz-text">Activity Log</h1>
          <p className="mt-1 text-[13px] font-medium text-biz-muted">
            Track all user activities and system changes across the ERP.
          </p>
        </div>
        <SecondaryButton onClick={exportLogs} disabled={exporter.isPending}>
          <Download className="h-4 w-4" />
          Export Logs
        </SecondaryButton>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(([Icon, title, value, helper, tone]) => (
          <div
            key={title}
            className={cn(
              "flex min-h-24 items-center gap-4 rounded-lg border p-4 shadow-card",
              tone,
            )}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-white/70">
              <Icon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-biz-text">{title}</p>
              <p className="mt-1 text-[22px] font-bold">{value.toLocaleString()}</p>
              <p className="text-[10px] font-medium text-biz-muted">{helper}</p>
            </div>
          </div>
        ))}
      </div>
      <section className="rounded-lg border border-biz-border bg-white p-4 shadow-card">
        <div className="grid grid-cols-2 items-end gap-3 lg:grid-cols-[1.3fr_1fr_1fr_0.8fr_0.8fr_1.5fr_auto]">
          <label className="text-[10px] font-semibold">
            Date Range
            <div className="mt-1 grid grid-cols-2 gap-1">
              <TextInput
                type="date"
                value={draft.dateFrom}
                onChange={(e) => setDraft((v) => ({ ...v, dateFrom: e.target.value }))}
              />
              <TextInput
                type="date"
                value={draft.dateTo}
                onChange={(e) => setDraft((v) => ({ ...v, dateTo: e.target.value }))}
              />
            </div>
          </label>
          <label className="text-[10px] font-semibold">
            User
            <SelectInput
              className="mt-1"
              placeholder="All Users"
              value={draft.userId}
              onChange={(e) => setDraft((v) => ({ ...v, userId: e.target.value }))}
              options={(users.data ?? []).map((u) => ({ value: u.id, label: u.name }))}
            />
          </label>
          <label className="text-[10px] font-semibold">
            Module
            <SelectInput
              className="mt-1"
              placeholder="All Modules"
              value={draft.module}
              onChange={(e) => setDraft((v) => ({ ...v, module: e.target.value }))}
              options={MODULES.map((v) => ({ value: v, label: v }))}
            />
          </label>
          <label className="text-[10px] font-semibold">
            Action
            <SelectInput
              className="mt-1"
              placeholder="All Actions"
              value={draft.action}
              onChange={(e) => setDraft((v) => ({ ...v, action: e.target.value }))}
              options={ACTIONS.map((v) => ({
                value: v,
                label: v.replaceAll("_", " ").toUpperCase(),
              }))}
            />
          </label>
          <label className="text-[10px] font-semibold">
            Status
            <SelectInput
              className="mt-1"
              placeholder="All Status"
              value={draft.status}
              onChange={(e) => setDraft((v) => ({ ...v, status: e.target.value }))}
              options={[
                { value: "SUCCESS", label: "Success" },
                { value: "WARNING", label: "Warning" },
                { value: "FAILED", label: "Failed" },
              ]}
            />
          </label>
          <TextInput
            icon={Search}
            placeholder="Search activity, user, reference..."
            value={draft.search}
            onChange={(e) => setDraft((v) => ({ ...v, search: e.target.value }))}
          />
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => {
                const empty = {
                  dateFrom: "",
                  dateTo: "",
                  userId: "",
                  module: "",
                  action: "",
                  status: "",
                  search: "",
                };
                setDraft(empty);
                setFilters(empty);
                setPage(1);
              }}
            >
              <RefreshCw className="h-4 w-4" />
              Clear
            </SecondaryButton>
            <button
              onClick={() => {
                setFilters(draft);
                setPage(1);
              }}
              className="h-10 rounded-md bg-biz-blue px-4 text-[12px] font-semibold text-white"
            >
              Apply
            </button>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
        <div className="flex items-center justify-between px-4 py-4">
          <div>
            <h2 className="text-[16px] font-bold">Activity History</h2>
            <p className="text-[11px] text-biz-muted">
              Complete audit trail of user and system activities.
            </p>
          </div>
          <button
            onClick={() => logs.refetch()}
            className="flex h-8 w-8 items-center justify-center rounded border border-biz-border"
            title="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {logs.isError && (
          <div className="mx-4 mb-3 rounded bg-red-50 p-3 text-[12px] text-red-600">
            Unable to load activity logs.{" "}
            <button onClick={() => logs.refetch()} className="font-semibold underline">
              Retry
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] text-left">
            <thead className="bg-[#f4f7fb] text-[10px] font-semibold">
              <tr>
                {[
                  "SL",
                  "Date & Time",
                  "User",
                  "Module",
                  "Action",
                  "Activity / Description",
                  "Reference",
                  "IP Address",
                  "Status",
                  "Action",
                ].map((h, index) => (
                  <th key={`${h}-${index}`} className="px-3 py-3">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-[11px]">
              {logs.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={10} className="p-2">
                      <div className="h-7 animate-pulse bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-14 text-center text-biz-muted">
                    No activity logs found. Try changing or clearing the filters.
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => {
                  const dt = dateTime(row.createdAt);
                  return (
                    <tr key={row.id} className="border-b border-biz-border last:border-0">
                      <td className="px-3 py-3">{(meta.page - 1) * meta.limit + index + 1}</td>
                      <td className="px-3 py-3">
                        <span className="block font-medium">{dt.date}</span>
                        <span className="text-[10px] text-biz-muted">{dt.time}</span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-biz-blue-soft font-bold text-biz-blue">
                            {row.user?.name?.[0] ?? "?"}
                          </span>
                          <span>
                            <b className="block">{row.user?.name ?? "Unknown User"}</b>
                            <small className="text-biz-muted">{row.user?.role ?? "System"}</small>
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded bg-blue-50 px-2 py-1 text-[10px] font-medium text-blue-700">
                          {row.module}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded px-2 py-1 text-[10px] font-semibold",
                            row.action === "delete"
                              ? "bg-red-50 text-red-600"
                              : row.action === "update"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-green-50 text-green-700",
                          )}
                        >
                          {row.action.toUpperCase()}
                        </span>
                      </td>
                      <td className="max-w-72 px-3 py-3">{row.description}</td>
                      <td className="px-3 py-3 font-medium text-biz-blue">
                        {row.referenceNo ?? "-"}
                      </td>
                      <td className="px-3 py-3 text-biz-muted">{row.ipAddress ?? "-"}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded px-2 py-1 text-[10px] font-medium",
                            row.status === "SUCCESS"
                              ? "bg-green-50 text-green-700"
                              : row.status === "WARNING"
                                ? "bg-orange-50 text-orange-600"
                                : "bg-red-50 text-red-600",
                          )}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          title="View Details"
                          onClick={() => setSelected(row)}
                          className="flex h-7 w-7 items-center justify-center rounded border border-blue-100 bg-blue-50 text-blue-600"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-biz-border px-4 py-4 text-[11px] text-biz-muted">
          <span>
            Showing {meta.total ? (meta.page - 1) * meta.limit + 1 : 0} to{" "}
            {Math.min(meta.page * meta.limit, meta.total)} of {meta.total.toLocaleString()} entries
          </span>
          <div className="flex gap-1">
            <button
              disabled={meta.page <= 1}
              onClick={() => setPage(1)}
              className="h-8 w-9 rounded border border-biz-border"
            >
              |&lt;
            </button>
            <button
              disabled={meta.page <= 1}
              onClick={() => setPage(meta.page - 1)}
              className="h-8 w-9 rounded border border-biz-border"
            >
              &lt;
            </button>
            {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                onClick={() => setPage(n)}
                className={cn(
                  "h-8 min-w-9 rounded border",
                  n === meta.page ? "border-biz-blue bg-biz-blue text-white" : "border-biz-border",
                )}
              >
                {n}
              </button>
            ))}
            <button
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage(meta.page + 1)}
              className="h-8 w-9 rounded border border-biz-border"
            >
              &gt;
            </button>
            <button
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage(meta.totalPages)}
              className="h-8 w-9 rounded border border-biz-border"
            >
              &gt;|
            </button>
          </div>
        </div>
      </section>
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-biz-navy/35 p-4">
          <div className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl">
            <div className="flex items-center justify-between border-b p-4">
              <h2 className="text-[17px] font-bold">Activity Details</h2>
              <button onClick={() => setSelected(null)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-5 text-[12px]">
              {[
                ["Activity ID", selected.id],
                ["Date & Time", new Date(selected.createdAt).toLocaleString()],
                ["User", selected.user?.name ?? "Unknown User"],
                ["Role", selected.user?.role ?? "System"],
                ["Module", selected.module],
                ["Action", selected.action.toUpperCase()],
                ["Status", selected.status],
                ["Reference", selected.referenceNo ?? "-"],
                ["IP Address", selected.ipAddress ?? "-"],
                ["Browser / Device", selected.userAgent ?? "-"],
              ].map(([k, v]) => (
                <div key={k} className="rounded border border-biz-border p-3">
                  <span className="block text-[10px] text-biz-muted">{k}</span>
                  <b>{v}</b>
                </div>
              ))}
            </div>
            <div className="px-5 pb-4">
              <h3 className="text-[12px] font-bold">Activity Description</h3>
              <p className="mt-2 rounded bg-biz-bg p-3 text-[12px]">{selected.description}</p>
            </div>
            {(objectEntries(selected.oldValue).length > 0 ||
              objectEntries(selected.newValue).length > 0) && (
              <div className="px-5 pb-5">
                <h3 className="mb-2 text-[12px] font-bold">Changes</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded border p-3">
                    <b className="text-[11px]">Before</b>
                    {objectEntries(selected.oldValue).map(([k, v]) => (
                      <p key={k} className="mt-2 text-[11px]">
                        <span className="text-biz-muted">{k}: </span>
                        {display(v)}
                      </p>
                    ))}
                  </div>
                  <div className="rounded border p-3">
                    <b className="text-[11px]">After</b>
                    {objectEntries(selected.newValue).map(([k, v]) => (
                      <p key={k} className="mt-2 text-[11px]">
                        <span className="text-biz-muted">{k}: </span>
                        {display(v)}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
