"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CalendarClock,
  Check,
  Clock3,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
  Zap,
} from "lucide-react";
import {
  Pagination,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
  cn,
} from "@bizovix/ui";
import {
  useCancelReminder,
  useCompleteReminder,
  useCreateReminder,
  useQuickReminders,
  useReminder,
  useReminderStats,
  useReminderUsers,
  useReminders,
  useSnoozeReminder,
  useUpdateReminder,
} from "@bizovix/api-client";
import type { ReminderQuery, ReminderRecord, SaveReminderInput } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import {
  PRIORITIES,
  REMINDER_TYPES,
  SOURCE_MODULES,
  STATUSES,
  dateLabel,
  daysLabel,
  label,
  sourceModuleLabel,
} from "@/lib/reminders";
const statusTone = (s: string) =>
  s === "COMPLETED"
    ? "success"
    : s === "OVERDUE"
      ? "danger"
      : s === "DUE_TODAY"
        ? "warning"
        : s === "SNOOZED"
          ? "purple"
          : s === "CANCELLED"
            ? "neutral"
            : "info";
const priorityTone = (p: string) =>
  p === "CRITICAL" ? "danger" : p === "HIGH" ? "warning" : p === "MEDIUM" ? "info" : "neutral";
function Overlay({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={onClose}
    >
      <section
        className={cn(
          "max-h-[92vh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-card-hover",
          wide ? "max-w-3xl" : "max-w-xl",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-bold">{title}</h2>
          <button aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5 text-biz-muted" />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Field({
  caption,
  children,
  required = false,
}: {
  caption: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="text-[11px] font-semibold">
      {caption}
      {required && <span className="text-red-500"> *</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
const blank = (): SaveReminderInput => ({
  title: "",
  type: "Tender Security",
  description: "",
  dueDate: "",
  dueTime: "",
  priority: "MEDIUM",
  assignedToUserId: "",
  assignedToName: "",
  sourceModule: "MANUAL",
  sourceType: "MANUAL",
  relatedEntityName: "",
  referenceNo: "",
  organizationName: "",
  notificationBefore: 0,
  repeatType: "NONE",
  remarks: "",
});
function ReminderForm({ record, onClose }: { record?: ReminderRecord; onClose: () => void }) {
  const users = useReminderUsers(),
    create = useCreateReminder(),
    update = useUpdateReminder(),
    [error, setError] = React.useState(""),
    [form, setForm] = React.useState<SaveReminderInput>(() =>
      record
        ? {
            title: record.title,
            type: record.type,
            description: record.description ?? "",
            dueDate: record.dueDate.slice(0, 10),
            dueTime: record.dueTime ?? "",
            priority: record.priority,
            assignedToUserId: record.assignedToUserId ?? "",
            assignedToName: record.assignedToName ?? "",
            sourceModule: record.sourceModule,
            sourceType: record.sourceType ?? "",
            relatedEntityName: record.relatedEntityName ?? "",
            referenceNo: record.referenceNo ?? "",
            organizationName: record.organizationName ?? "",
            notificationBefore: record.notificationBefore,
            repeatType: record.repeatType,
            remarks: record.remarks ?? "",
          }
        : blank(),
    );
  const set = (k: keyof SaveReminderInput, v: string | number) =>
    setForm((old) => ({ ...old, [k]: v }));
  async function save() {
    if (!form.title.trim() || !form.dueDate || !form.assignedToName) {
      setError("Title, date, priority and assignee are required.");
      return;
    }
    if (record) await update.mutateAsync({ id: record.id, body: form });
    else await create.mutateAsync(form);
    onClose();
  }
  return (
    <Overlay title={record ? "Edit Reminder" : "Add Manual Reminder"} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field caption="Reminder Title" required>
          <TextInput value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field caption="Reminder Type" required>
          <SelectInput
            value={form.type}
            onChange={(e) => set("type", e.target.value)}
            options={REMINDER_TYPES.map((x) => ({ value: x, label: x }))}
          />
        </Field>
        <Field caption="Reminder Date" required>
          <TextInput
            type="date"
            value={form.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </Field>
        <Field caption="Reminder Time">
          <TextInput
            type="time"
            value={form.dueTime}
            onChange={(e) => set("dueTime", e.target.value)}
          />
        </Field>
        <Field caption="Priority" required>
          <SelectInput
            value={form.priority}
            onChange={(e) => set("priority", e.target.value)}
            options={PRIORITIES.map((x) => ({ value: x, label: label(x) }))}
          />
        </Field>
        <Field caption="Assigned To" required>
          <SelectInput
            placeholder="Select User"
            value={form.assignedToUserId}
            onChange={(e) => {
              const u = users.data?.find((x) => x.id === e.target.value);
              setForm((old) => ({
                ...old,
                assignedToUserId: e.target.value,
                assignedToName: u?.name ?? "",
              }));
            }}
            options={(users.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
          />
        </Field>
        <Field caption="Related Module">
          <SelectInput
            value={form.sourceModule}
            onChange={(e) => set("sourceModule", e.target.value)}
            options={SOURCE_MODULES.map((x) => ({ value: x, label: sourceModuleLabel(x) }))}
          />
        </Field>
        <Field caption="Related Record">
          <TextInput
            value={form.relatedEntityName}
            onChange={(e) => set("relatedEntityName", e.target.value)}
          />
        </Field>
        <Field caption="Reference">
          <TextInput
            value={form.referenceNo}
            onChange={(e) => set("referenceNo", e.target.value)}
          />
        </Field>
        <Field caption="Organization">
          <TextInput
            value={form.organizationName}
            onChange={(e) => set("organizationName", e.target.value)}
          />
        </Field>
        <Field caption="Repeat">
          <SelectInput
            value={form.repeatType}
            onChange={(e) => set("repeatType", e.target.value)}
            options={["NONE", "DAILY", "WEEKLY", "MONTHLY", "CUSTOM"].map((x) => ({
              value: x,
              label: label(x),
            }))}
          />
        </Field>
        <Field caption="Notification Before">
          <SelectInput
            value={String(form.notificationBefore)}
            onChange={(e) => set("notificationBefore", Number(e.target.value))}
            options={[0, 1, 3, 7, 15, 30].map((x) => ({
              value: String(x),
              label: x ? `${x} Days Before` : "On Due Date",
            }))}
          />
        </Field>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field caption="Description">
          <textarea
            className="min-h-24 w-full rounded-sm border border-biz-border p-3 text-[13px]"
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
        <Field caption="Remarks">
          <textarea
            className="min-h-24 w-full rounded-sm border border-biz-border p-3 text-[13px]"
            value={form.remarks}
            onChange={(e) => set("remarks", e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        <PrimaryButton disabled={create.isPending || update.isPending} onClick={save}>
          {create.isPending || update.isPending ? "Saving..." : "Save Reminder"}
        </PrimaryButton>
      </div>
    </Overlay>
  );
}
function Details({
  record,
  onClose,
  onEdit,
}: {
  record: ReminderRecord;
  onClose: () => void;
  onEdit: () => void;
}) {
  const complete = useCompleteReminder(),
    cancel = useCancelReminder(),
    snooze = useSnoozeReminder(),
    [until, setUntil] = React.useState("");
  const done = ["COMPLETED", "CANCELLED"].includes(record.status);
  async function run(kind: string) {
    if (kind === "complete") await complete.mutateAsync({ id: record.id });
    if (kind === "cancel") await cancel.mutateAsync({ id: record.id });
    if (kind === "snooze") await snooze.mutateAsync({ id: record.id, body: { until } });
    onClose();
  }
  return (
    <Overlay title="Reminder Details" onClose={onClose} wide>
      <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Title", record.title],
          ["Reminder Type", record.type],
          ["Description", record.description],
          ["Due Date", dateLabel(record.dueDate)],
          ["Priority", label(record.priority)],
          ["Status", label(record.status)],
          ["Related Module", sourceModuleLabel(record.sourceModule)],
          ["Related Record", record.relatedEntityName || sourceModuleLabel(record.sourceModule)],
          ["Reference", record.referenceNo],
          ["Organization", record.organizationName],
          ["Assigned To", record.assignedToName],
          ["Created By", record.createdByName],
          ["Created Date", dateLabel(record.createdAt)],
          ["Completed Date", dateLabel(record.completedAt)],
          ["Snoozed Until", dateLabel(record.snoozedUntil)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="font-semibold text-biz-muted">{k}</dt>
            <dd className="mt-1">{v || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 rounded border border-biz-border p-3">
        <Field caption="Snooze Until">
          <div className="flex flex-wrap gap-2">
            <TextInput type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            {[1, 3, 7, 15].map((n) => (
              <button
                key={n}
                className="rounded border px-2 text-xs"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + n);
                  setUntil(d.toISOString().slice(0, 10));
                }}
              >
                {n}d
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <PrimaryButton disabled={done} onClick={() => run("complete")}>
          <Check className="h-4 w-4" />
          Mark as Complete
        </PrimaryButton>
        <SecondaryButton disabled={done || !until} onClick={() => run("snooze")}>
          <Clock3 className="h-4 w-4" />
          Snooze
        </SecondaryButton>
        <SecondaryButton disabled={done} onClick={onEdit}>
          Edit
        </SecondaryButton>
        <SecondaryButton disabled={done} onClick={() => run("cancel")}>
          Cancel Reminder
        </SecondaryButton>
      </div>
    </Overlay>
  );
}
type QuickTab = "today" | "upcoming" | "overdue";

function PriorityQueue({
  activeTab,
  onTabChange,
  data,
  loading,
  onView,
}: {
  activeTab: QuickTab;
  onTabChange: (tab: QuickTab) => void;
  data?: {
    dueToday: ReminderRecord[];
    upcoming: ReminderRecord[];
    overdue: ReminderRecord[];
  };
  loading: boolean;
  onView: (r: ReminderRecord) => void;
}) {
  const tabs: Array<{ key: QuickTab; label: string; items: ReminderRecord[] }> = [
    { key: "today", label: "Due Today", items: data?.dueToday ?? [] },
    { key: "upcoming", label: "Next 7 Days", items: data?.upcoming ?? [] },
    { key: "overdue", label: "Overdue", items: data?.overdue ?? [] },
  ];
  const active = tabs.find((tab) => tab.key === activeTab) ?? tabs[0]!;
  const toneClass =
    activeTab === "overdue"
      ? "text-red-600"
      : activeTab === "today"
        ? "text-orange-600"
        : "text-biz-blue";

  return (
    <section className="flex h-[270px] min-h-0 flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card xl:h-full">
      <div className="shrink-0 border-b border-biz-border px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-bold text-biz-text">Priority Queue</h2>
            <p className="text-[9px] text-biz-muted">
              Open the next reminder that needs attention.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
            {active.items.length}
          </span>
        </div>
        <div className="mt-2 grid grid-cols-3 rounded-md bg-slate-100 p-0.5">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={cn(
                "rounded px-1.5 py-1.5 text-[9px] font-semibold transition-colors",
                activeTab === tab.key
                  ? "bg-white text-biz-blue shadow-sm"
                  : "text-slate-600 hover:text-biz-text",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="scrollbar-hidden min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto p-1.5">
        {loading ? (
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="h-14 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : active.items.length ? (
          active.items.map((r) => (
            <button
              key={r.id}
              onClick={() => onView(r)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-[9px] font-semibold uppercase tracking-wide text-biz-muted">
                  {r.type}
                </p>
                <p title={r.title} className="mt-0.5 truncate text-[11px] font-bold text-biz-text">
                  {r.title}
                </p>
                <p className="mt-0.5 truncate text-[9px] text-biz-muted">
                  {r.referenceNo ?? r.relatedEntityName ?? sourceModuleLabel(r.sourceModule)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn("whitespace-nowrap text-[10px] font-bold", toneClass)}>
                  {dateLabel(r.dueDate)}
                </p>
                <StatusBadge label={label(r.priority)} tone={priorityTone(r.priority)} />
              </div>
            </button>
          ))
        ) : (
          <div className="flex h-full min-h-32 flex-col items-center justify-center px-3 text-center">
            <Check className="h-7 w-7 text-emerald-500" />
            <p className="mt-2 text-[11px] font-semibold text-biz-text">Nothing needs attention</p>
            <p className="mt-0.5 text-[9px] text-biz-muted">No reminders in this queue.</p>
          </div>
        )}
      </div>
    </section>
  );
}
export function RemindersWorkspace() {
  useSetBreadcrumb([{ label: "Reminders" }]);
  const router = useRouter(),
    searchParams = useSearchParams(),
    openId = searchParams.get("open"),
    [page, setPage] = React.useState(1),
    [draft, setDraft] = React.useState<ReminderQuery>({}),
    [filters, setFilters] = React.useState<ReminderQuery>({}),
    [quickTab, setQuickTab] = React.useState<QuickTab>("overdue"),
    [filtersOpen, setFiltersOpen] = React.useState(false),
    [form, setForm] = React.useState<ReminderRecord | "new" | null>(null),
    [selected, setSelected] = React.useState<ReminderRecord | null>(null),
    list = useReminders({ ...filters, page, limit: 10 }),
    stats = useReminderStats(),
    quick = useQuickReminders(),
    users = useReminderUsers(),
    deepLinked = useReminder(openId),
    [handledOpenId, setHandledOpenId] = React.useState<string | null>(null);
  if (deepLinked.data && deepLinked.data.id !== handledOpenId) {
    setHandledOpenId(deepLinked.data.id);
    setSelected(deepLinked.data);
  }
  React.useEffect(() => {
    if (deepLinked.data) router.replace("/reminders");
  }, [deepLinked.data, router]);
  React.useEffect(() => {
    const nextSearch = draft.search ?? "";
    if ((filters.search ?? "") === nextSearch) return;

    const timer = window.setTimeout(() => {
      setFilters((current) => ({ ...current, search: nextSearch || undefined }));
      setPage(1);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [draft.search, filters.search]);

  function updateFilter<K extends keyof ReminderQuery>(key: K, value: ReminderQuery[K]) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    setFilters(next);
    setPage(1);
  }

  const cards = [
    [
      "Due Today",
      stats.data?.dueToday ?? 0,
      "DUE_TODAY",
      "text-orange-700",
      "bg-orange-50",
      CalendarClock,
    ],
    ["Upcoming", stats.data?.upcoming ?? 0, "UPCOMING", "text-biz-blue", "bg-blue-50", Bell],
    ["Overdue", stats.data?.overdue ?? 0, "OVERDUE", "text-red-700", "bg-red-50", Zap],
    [
      "Completed",
      stats.data?.completed ?? 0,
      "COMPLETED",
      "text-emerald-700",
      "bg-emerald-50",
      Check,
    ],
  ] as const;
  return (
    <div className="scrollbar-hidden flex h-full min-h-0 flex-col gap-2 overflow-y-auto xl:overflow-hidden">
      <header className="flex shrink-0 flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-page-title text-biz-text">Reminders</h1>
          <p className="mt-0.5 text-[11px] text-biz-muted 2xl:text-[13px]">
            Track upcoming deadlines, expiries, dues and important business follow-ups.
          </p>
        </div>
        <PrimaryButton size="sm" onClick={() => setForm("new")}>
          <Plus className="h-4 w-4" />
          Add Reminder
        </PrimaryButton>
      </header>
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.map(([title, value, status, toneClass, iconClass, Icon]) => (
          <button
            key={title}
            type="button"
            onClick={() => {
              const next = { status };
              setDraft(next);
              setFilters(next);
              setPage(1);
              if (status === "DUE_TODAY") setQuickTab("today");
              if (status === "UPCOMING") setQuickTab("upcoming");
              if (status === "OVERDUE") setQuickTab("overdue");
            }}
            className={cn(
              "flex min-w-0 items-center gap-2 rounded-lg border bg-white px-2.5 py-2 text-left shadow-card transition-colors hover:border-biz-blue/30 hover:bg-slate-50 2xl:px-3 2xl:py-2.5",
              filters.status === status
                ? "border-biz-blue ring-1 ring-biz-blue/15"
                : "border-biz-border",
            )}
          >
            <span
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-md 2xl:h-9 2xl:w-9",
                iconClass,
                toneClass,
              )}
            >
              <Icon className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[9px] font-semibold text-biz-muted 2xl:text-[10px]">
                {title}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[16px] font-bold leading-none 2xl:text-[18px]",
                  toneClass,
                )}
              >
                {stats.isLoading ? "-" : value}
              </p>
            </div>
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[minmax(250px,0.32fr)_minmax(0,1fr)]">
        <PriorityQueue
          activeTab={quickTab}
          onTabChange={setQuickTab}
          data={quick.data}
          loading={quick.isLoading}
          onView={setSelected}
        />
        <section className="flex h-[560px] min-h-0 flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card xl:h-full">
          <div className="shrink-0 border-b border-biz-border px-3 py-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-bold text-biz-text">All Reminders</h2>
                  {list.data && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600">
                      {list.data.meta.total}
                    </span>
                  )}
                </div>
                <p className="text-[9px] text-biz-muted">
                  Search, filter and manage every reminder.
                </p>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 sm:w-[min(100%,430px)]">
                <div className="min-w-0 flex-1">
                  <TextInput
                    icon={Search}
                    className="h-9 text-[11px]"
                    placeholder="Search title, reference, project..."
                    title="Searches title, description, reference number, organization and related project or entity"
                    value={draft.search ?? ""}
                    onChange={(e) => setDraft({ ...draft, search: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setFilters(draft);
                        setPage(1);
                      }
                    }}
                  />
                </div>
                <SecondaryButton
                  size="sm"
                  className={cn("h-9 px-2.5", filtersOpen && "border-biz-blue text-biz-blue")}
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                </SecondaryButton>
                <SecondaryButton
                  size="sm"
                  className="h-9 w-9 px-0"
                  title="Clear filters"
                  aria-label="Clear filters"
                  onClick={() => {
                    setDraft({});
                    setFilters({});
                    setPage(1);
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </SecondaryButton>
              </div>
            </div>
            {filtersOpen && (
              <div className="mt-2 grid items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50/70 p-2 sm:grid-cols-2 lg:grid-cols-[minmax(190px,1.35fr)_repeat(4,minmax(105px,1fr))]">
                <div className="grid grid-cols-2 gap-1">
                  <TextInput
                    type="date"
                    className="h-9 text-[11px]"
                    aria-label="From date"
                    value={draft.dateFrom ?? ""}
                    onChange={(e) => updateFilter("dateFrom", e.target.value || undefined)}
                  />
                  <TextInput
                    type="date"
                    className="h-9 text-[11px]"
                    aria-label="To date"
                    value={draft.dateTo ?? ""}
                    onChange={(e) => updateFilter("dateTo", e.target.value || undefined)}
                  />
                </div>
                <SelectInput
                  className="h-9 text-[11px]"
                  placeholder="Reminder Type"
                  value={draft.type ?? ""}
                  onChange={(e) => updateFilter("type", e.target.value || undefined)}
                  options={REMINDER_TYPES.map((x) => ({ value: x, label: x }))}
                />
                <SelectInput
                  className="h-9 text-[11px]"
                  placeholder="Status"
                  value={draft.status ?? ""}
                  onChange={(e) => updateFilter("status", e.target.value || undefined)}
                  options={STATUSES.map((x) => ({ value: x, label: label(x) }))}
                />
                <SelectInput
                  className="h-9 text-[11px]"
                  placeholder="Priority"
                  value={draft.priority ?? ""}
                  onChange={(e) => updateFilter("priority", e.target.value || undefined)}
                  options={PRIORITIES.map((x) => ({ value: x, label: label(x) }))}
                />
                <SelectInput
                  className="h-9 text-[11px]"
                  placeholder="Assigned To"
                  value={draft.assignedToUserId ?? ""}
                  onChange={(e) => updateFilter("assignedToUserId", e.target.value || undefined)}
                  options={(users.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
                />
              </div>
            )}
          </div>
          {list.isLoading ? (
            <div className="min-h-0 flex-1 space-y-2 overflow-hidden p-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-11 animate-pulse rounded bg-slate-100" />
              ))}
            </div>
          ) : list.isError ? (
            <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center text-red-600">
              Unable to load reminders.{" "}
              <button className="font-semibold underline" onClick={() => list.refetch()}>
                Retry
              </button>
            </div>
          ) : !list.data?.items.length ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8 text-center text-biz-muted">
              No reminders found for the selected filters.
              <div className="mt-3 flex justify-center gap-2">
                <SecondaryButton
                  onClick={() => {
                    setDraft({});
                    setFilters({});
                  }}
                >
                  Clear Filters
                </SecondaryButton>
                <PrimaryButton onClick={() => setForm("new")}>Add Reminder</PrimaryButton>
              </div>
            </div>
          ) : (
            <>
              <div className="scrollbar-hidden min-h-0 flex-1 overflow-auto">
                <table className="w-full min-w-[680px] table-fixed text-left text-[10px] 2xl:text-[11px]">
                  <colgroup>
                    <col className="w-[82px]" />
                    <col />
                    <col className="w-[72px]" />
                    <col className="w-[86px]" />
                    <col className="w-[104px]" />
                    <col className="w-[92px]" />
                    <col className="w-[48px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#f4f7fb] shadow-[0_1px_0_#e5eaf2]">
                    <tr>
                      <th className="px-2.5 py-2.5">Date</th>
                      <th className="px-2.5 py-2.5">Reminder</th>
                      <th className="px-2 py-2.5">Priority</th>
                      <th className="px-2 py-2.5">Status</th>
                      <th className="px-2 py-2.5">Due</th>
                      <th className="px-2 py-2.5">Assigned</th>
                      <th className="px-2 py-2.5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.items.map((r) => (
                      <tr
                        key={r.id}
                        className="h-12 border-t border-biz-border transition-colors hover:bg-slate-50/70 2xl:h-14"
                      >
                        <td className="whitespace-nowrap px-2.5 font-semibold text-biz-text">
                          {dateLabel(r.dueDate)}
                          {r.dueTime && (
                            <span className="block text-[9px] font-normal text-biz-muted">
                              {r.dueTime}
                            </span>
                          )}
                        </td>
                        <td className="min-w-0 px-2.5">
                          <button
                            title={r.title}
                            onClick={() => setSelected(r)}
                            className="block w-full truncate text-left font-semibold text-biz-text hover:text-biz-blue"
                          >
                            {r.title}
                          </button>
                          <p
                            className="mt-0.5 truncate text-[9px] text-biz-muted"
                            title={[
                              r.type,
                              r.relatedEntityName || sourceModuleLabel(r.sourceModule),
                              r.referenceNo,
                              r.organizationName,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          >
                            {[
                              r.type,
                              r.relatedEntityName || sourceModuleLabel(r.sourceModule),
                              r.referenceNo,
                              r.organizationName,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </td>
                        <td className="px-2">
                          <StatusBadge label={label(r.priority)} tone={priorityTone(r.priority)} />
                        </td>
                        <td className="px-2">
                          <StatusBadge label={label(r.status)} tone={statusTone(r.status)} />
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-2 font-semibold",
                            r.status === "OVERDUE"
                              ? "text-red-600"
                              : r.status === "DUE_TODAY"
                                ? "text-orange-600"
                                : "",
                          )}
                        >
                          {["COMPLETED", "CANCELLED"].includes(r.status)
                            ? label(r.status)
                            : daysLabel(r.dueDate)}
                        </td>
                        <td className="truncate px-2" title={r.assignedToName ?? "Unassigned"}>
                          {r.assignedToName ?? "Unassigned"}
                        </td>
                        <td className="px-2 text-center">
                          <button
                            title="View and manage"
                            aria-label={`View ${r.title}`}
                            onClick={() => setSelected(r)}
                            className="rounded border border-biz-border p-1.5 text-biz-muted transition-colors hover:border-biz-blue/30 hover:bg-blue-50 hover:text-biz-blue"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="shrink-0 border-t border-biz-border bg-slate-50/50">
                <Pagination
                  page={list.data.meta.page}
                  limit={list.data.meta.limit}
                  total={list.data.meta.total}
                  totalPages={list.data.meta.totalPages}
                  onPageChange={setPage}
                />
              </div>
            </>
          )}
        </section>
      </div>
      {form && (
        <ReminderForm record={form === "new" ? undefined : form} onClose={() => setForm(null)} />
      )}{" "}
      {selected && (
        <Details
          record={selected}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setForm(selected);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}
