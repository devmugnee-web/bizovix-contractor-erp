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
function QuickCard({
  title,
  items,
  toneClass,
  onView,
}: {
  title: string;
  items: ReminderRecord[];
  toneClass: string;
  onView: (r: ReminderRecord) => void;
}) {
  return (
    <section className="rounded-lg border border-biz-border bg-white shadow-card">
      <h2 className="border-b px-4 py-3 text-[13px] font-bold">{title}</h2>
      <div className="divide-y">
        {items.length ? (
          items.map((r) => (
            <button
              key={r.id}
              onClick={() => onView(r)}
              className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-slate-50"
            >
              <div className="min-w-0">
                <p className="truncate text-[11px] text-biz-muted">{r.type}</p>
                <p className="truncate text-[12px] font-bold">{r.title}</p>
                <p className="truncate text-[10px] text-biz-muted">
                  {r.referenceNo ?? r.relatedEntityName ?? "No reference"}
                </p>
              </div>
              <div className="text-right">
                <p className={cn("text-[11px] font-bold", toneClass)}>{dateLabel(r.dueDate)}</p>
                <StatusBadge label={label(r.priority)} tone={priorityTone(r.priority)} />
              </div>
            </button>
          ))
        ) : (
          <p className="p-8 text-center text-xs text-biz-muted">No reminders in this section.</p>
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
  const cards = [
    ["Due Today", stats.data?.dueToday ?? 0, "text-biz-blue", CalendarClock],
    ["Upcoming", stats.data?.upcoming ?? 0, "text-green-700", Bell],
    ["Overdue", stats.data?.overdue ?? 0, "text-red-600", Zap],
    ["Completed", stats.data?.completed ?? 0, "text-green-700", Check],
  ] as const;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col justify-between gap-3 sm:flex-row">
        <div>
          <h1 className="text-page-title text-biz-text">Reminders</h1>
          <p className="mt-1 text-[13px] text-biz-muted">
            Track upcoming deadlines, expiries, dues and important business follow-ups.
          </p>
        </div>
        <PrimaryButton onClick={() => setForm("new")}>
          <Plus className="h-4 w-4" />
          Add Reminder
        </PrimaryButton>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([title, value, toneClass, Icon]) => (
          <div
            key={title}
            className="flex items-center gap-3 rounded-lg border border-biz-border bg-white p-4 shadow-card"
          >
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded bg-slate-50",
                toneClass,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[11px] font-semibold text-biz-muted">{title}</p>
              <p className={cn("text-xl font-bold", toneClass)}>{stats.isLoading ? "—" : value}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {quick.isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-52 animate-pulse rounded-lg bg-slate-100" />
            ))
          : [
              <QuickCard
                key="today"
                title="Due Today"
                items={quick.data?.dueToday ?? []}
                toneClass="text-orange-600"
                onView={setSelected}
              />,
              <QuickCard
                key="upcoming"
                title="Upcoming 7 Days"
                items={quick.data?.upcoming ?? []}
                toneClass="text-biz-blue"
                onView={setSelected}
              />,
              <QuickCard
                key="overdue"
                title="Overdue"
                items={quick.data?.overdue ?? []}
                toneClass="text-red-600"
                onView={setSelected}
              />,
            ]}
      </div>
      <section className="overflow-hidden rounded-lg border border-biz-border bg-white shadow-card">
        <div className="border-b p-4">
          <h2 className="text-[14px] font-bold">All Reminders</h2>
          <p className="text-[11px] text-biz-muted">
            View and manage all reminders and scheduled follow-ups.
          </p>
          <div className="mt-4 grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-7">
            <div className="grid grid-cols-2 gap-1">
              <TextInput
                type="date"
                value={draft.dateFrom ?? ""}
                onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })}
              />
              <TextInput
                type="date"
                value={draft.dateTo ?? ""}
                onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })}
              />
            </div>
            <SelectInput
              placeholder="Reminder Type"
              value={draft.type ?? ""}
              onChange={(e) => setDraft({ ...draft, type: e.target.value })}
              options={REMINDER_TYPES.map((x) => ({ value: x, label: x }))}
            />
            <SelectInput
              placeholder="Status"
              value={draft.status ?? ""}
              onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              options={STATUSES.map((x) => ({ value: x, label: label(x) }))}
            />
            <SelectInput
              placeholder="Priority"
              value={draft.priority ?? ""}
              onChange={(e) => setDraft({ ...draft, priority: e.target.value })}
              options={PRIORITIES.map((x) => ({ value: x, label: label(x) }))}
            />
            <SelectInput
              placeholder="Assigned To"
              value={draft.assignedToUserId ?? ""}
              onChange={(e) => setDraft({ ...draft, assignedToUserId: e.target.value })}
              options={(users.data ?? []).map((x) => ({ value: x.id, label: x.name }))}
            />
            <TextInput
              icon={Search}
              placeholder="Search reminder, reference, organization..."
              value={draft.search ?? ""}
              onChange={(e) => setDraft({ ...draft, search: e.target.value })}
            />
            <div className="flex gap-2">
              <SecondaryButton
                onClick={() => {
                  setDraft({});
                  setFilters({});
                  setPage(1);
                }}
              >
                <RotateCcw className="h-4 w-4" />
              </SecondaryButton>
              <PrimaryButton
                className="flex-1"
                onClick={() => {
                  setFilters(draft);
                  setPage(1);
                }}
              >
                Filter
              </PrimaryButton>
            </div>
          </div>
        </div>
        {list.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-9 animate-pulse bg-slate-100" />
            ))}
          </div>
        ) : list.isError ? (
          <div className="p-12 text-center text-red-600">
            Unable to load reminders.{" "}
            <button className="font-semibold underline" onClick={() => list.refetch()}>
              Retry
            </button>
          </div>
        ) : !list.data?.items.length ? (
          <div className="p-14 text-center text-biz-muted">
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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-[11px]">
                <thead className="bg-[#f4f7fb]">
                  <tr>
                    {[
                      ["SL", "w-9"],
                      ["Reminder Date", "w-24"],
                      ["Reminder Type", "w-32"],
                      ["Title / Description", "min-w-[200px]"],
                      ["Related To", "w-36"],
                      ["Reference", "w-20"],
                      ["Organization", "w-20"],
                      ["Priority", "w-16"],
                      ["Status", "w-20"],
                      ["Days Left / Overdue", "w-28 whitespace-nowrap"],
                      ["Assigned To", "w-24"],
                      ["Action", "w-12"],
                    ].map(([x, w]) => (
                      <th key={x} className={cn("px-3 py-3", w)}>
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((r, i) => (
                    <tr key={r.id} className="border-t border-biz-border">
                      <td className="w-9 px-3 py-3">
                        {(list.data!.meta.page - 1) * list.data!.meta.limit + i + 1}
                      </td>
                      <td className="w-24 whitespace-nowrap px-3 font-semibold">{dateLabel(r.dueDate)}</td>
                      <td className="w-32 truncate px-3" title={r.type}>
                        {r.type}
                      </td>
                      <td className="min-w-[200px] max-w-64 px-3">
                        <button
                          onClick={() => setSelected(r)}
                          className="text-left font-semibold hover:text-biz-blue"
                        >
                          {r.title}
                        </button>
                        <p className="truncate text-biz-muted" title={r.description ?? undefined}>
                          {r.description ?? "—"}
                        </p>
                      </td>
                      <td className="w-36 truncate px-3" title={r.relatedEntityName || sourceModuleLabel(r.sourceModule)}>
                        {r.relatedEntityName || sourceModuleLabel(r.sourceModule)}
                      </td>
                      <td className="w-20 truncate px-3" title={r.referenceNo ?? undefined}>
                        {r.referenceNo ?? "—"}
                      </td>
                      <td className="w-20 truncate px-3" title={r.organizationName ?? undefined}>
                        {r.organizationName ?? "—"}
                      </td>
                      <td className="w-16 px-3">
                        <StatusBadge label={label(r.priority)} tone={priorityTone(r.priority)} />
                      </td>
                      <td className="w-20 px-3">
                        <StatusBadge label={label(r.status)} tone={statusTone(r.status)} />
                      </td>
                      <td
                        className={cn(
                          "w-28 whitespace-nowrap px-3 font-semibold",
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
                      <td className="w-24 truncate px-3" title={r.assignedToName ?? "Unassigned"}>
                        {r.assignedToName ?? "Unassigned"}
                      </td>
                      <td className="w-12 px-3">
                        <button
                          title="View and manage"
                          onClick={() => setSelected(r)}
                          className="rounded border p-1.5 hover:text-biz-blue"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={list.data.meta.page}
              limit={list.data.meta.limit}
              total={list.data.meta.total}
              totalPages={list.data.meta.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </section>
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
