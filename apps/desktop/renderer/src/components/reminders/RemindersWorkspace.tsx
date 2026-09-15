"use client";
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  CalendarClock,
  Check,
  Clock3,
  Link2,
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
  useReminderRelatedRecords,
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
const normalizeReminderText = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function reminderSupportingText(record: ReminderRecord) {
  const title = normalizeReminderText(record.title);
  const candidates = [
    record.type,
    record.relatedEntityName,
    sourceModuleLabel(record.relatedEntityType ?? record.sourceModule),
    record.referenceNo ? `Ref: ${record.referenceNo}` : "",
    record.organizationName,
  ];
  const used = new Set<string>();

  return candidates
    .filter((candidate) => {
      const normalized = normalizeReminderText(candidate);
      if (
        !normalized ||
        title.includes(normalized) ||
        used.has(normalized) ||
        [...used].some((item) => item.includes(normalized) || normalized.includes(item))
      )
        return false;
      used.add(normalized);
      return true;
    })
    .join(" · ");
}
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-3"
      onMouseDown={onClose}
    >
      <section
        className={cn(
          "max-h-[calc(100vh-1rem)] w-full rounded-lg bg-white p-4 shadow-card-hover",
          wide ? "max-w-4xl overflow-hidden" : "max-w-xl overflow-y-auto",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="-mx-4 -mt-4 mb-3 flex items-center justify-between rounded-t-lg border-b border-biz-border bg-slate-50/70 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-biz-blue">
              <Bell className="h-4 w-4" />
            </span>
            <h2 className="truncate text-[16px] font-bold text-biz-text xl:text-[18px] 2xl:text-[20px]">
              {title}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close"
            className="rounded-full p-1.5 text-biz-muted transition hover:bg-slate-200 hover:text-biz-text"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
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
    <label className="block text-[11px] font-semibold text-biz-text xl:text-[13px] 2xl:text-[14px]">
      {caption}
      {required && <span className="text-red-500"> *</span>}
      <div className="mt-1">{children}</div>
    </label>
  );
}
function FormSectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-full flex items-center gap-2 border-b border-biz-border pb-1.5 text-[11px] font-bold text-biz-text xl:text-[13px] 2xl:text-[14px]">
      <span className="h-3.5 w-1 rounded-full bg-biz-blue" />
      {children}
    </div>
  );
}
function DetailItem({
  caption,
  value,
  className,
}: {
  caption: string;
  value: React.ReactNode;
  className?: string;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[10px] font-semibold text-biz-muted xl:text-[12px] 2xl:text-[13px]">
        {caption}
      </dt>
      <dd className="mt-1 break-words text-[12px] font-medium leading-5 text-biz-text xl:text-[14px] 2xl:text-[15px]">
        {value}
      </dd>
    </div>
  );
}
const blank = (): SaveReminderInput => ({
  title: "",
  type: "General / Follow-up",
  description: "",
  dueDate: "",
  dueTime: "",
  priority: "MEDIUM",
  assignedToUserId: "",
  assignedToName: "",
  sourceModule: "MANUAL",
  sourceType: "MANUAL",
  relatedEntityType: "MANUAL",
  relatedEntityId: "",
  relatedEntityName: "",
  referenceNo: "",
  organizationMasterId: "",
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
            sourceId: record.sourceId ?? "",
            relatedEntityType: record.relatedEntityType ?? record.sourceModule,
            relatedEntityId: record.relatedEntityId ?? record.sourceId ?? "",
            relatedEntityName: record.relatedEntityName ?? "",
            referenceNo: record.referenceNo ?? "",
            organizationMasterId: record.organizationMasterId ?? "",
            organizationName: record.organizationName ?? "",
            notificationBefore: record.notificationBefore,
            repeatType: record.repeatType,
            remarks: record.remarks ?? "",
          }
        : blank(),
    );
  const relatedRecords = useReminderRelatedRecords(
    record && record.sourceModule !== "MANUAL" ? undefined : form.relatedEntityType,
  );
  const showLinkedMetadata =
    Boolean(record && record.sourceModule !== "MANUAL") || form.relatedEntityType !== "MANUAL";
  const set = (k: keyof SaveReminderInput, v: string | number) =>
    setForm((old) => ({ ...old, [k]: v }));
  async function save() {
    setError("");
    if (!form.title.trim() || !form.dueDate || !form.priority || !form.assignedToUserId) {
      setError("Title, date, priority and assignee are required.");
      return;
    }
    if (
      (!record || record.sourceModule === "MANUAL") &&
      form.relatedEntityType !== "MANUAL" &&
      !form.relatedEntityId
    ) {
      setError("Please select a related record for the selected module.");
      return;
    }
    const payload = { ...form, dueTime: form.dueTime || undefined };
    try {
      if (record) await update.mutateAsync({ id: record.id, body: payload });
      else await create.mutateAsync(payload);
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to save reminder.");
    }
  }
  return (
    <Overlay title={record ? "Edit Reminder" : "Add Reminder"} onClose={onClose} wide>
      <div className="rounded-lg border border-biz-border bg-slate-50/50 p-3">
        <div className="grid gap-x-3 gap-y-2.5 sm:grid-cols-2 md:grid-cols-4">
          <FormSectionHeading>Reminder Details</FormSectionHeading>
          <div className="md:col-span-2">
            <Field caption="Reminder Title" required>
              <TextInput value={form.title} onChange={(e) => set("title", e.target.value)} />
            </Field>
          </div>
          <Field caption="Reminder Type" required>
            <SelectInput
              value={form.type}
              onChange={(e) => set("type", e.target.value)}
              options={REMINDER_TYPES.map((x) => ({ value: x, label: x }))}
            />
          </Field>
          <Field caption="Priority" required>
            <SelectInput
              value={form.priority}
              onChange={(e) => set("priority", e.target.value)}
              options={PRIORITIES.map((x) => ({ value: x, label: label(x) }))}
            />
          </Field>

          <FormSectionHeading>Schedule &amp; Notification</FormSectionHeading>
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
            <p className="mt-1 text-[9px] font-normal text-biz-muted xl:text-[11px] 2xl:text-[12px]">
              Due notification is checked every minute.
            </p>
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
          <Field caption="Repeat">
            <SelectInput
              value={form.repeatType}
              onChange={(e) => set("repeatType", e.target.value)}
              disabled={Boolean(record && record.sourceModule !== "MANUAL")}
              options={["NONE", "DAILY", "WEEKLY", "MONTHLY"].map((x) => ({
                value: x,
                label: label(x),
              }))}
            />
            <p className="mt-1 text-[9px] font-normal text-biz-muted xl:text-[11px] 2xl:text-[12px]">
              The next reminder is created after completion.
            </p>
          </Field>

          <FormSectionHeading>Assignment &amp; Context</FormSectionHeading>
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
            {record && record.sourceModule !== "MANUAL" ? (
              <TextInput value={sourceModuleLabel(record.sourceModule)} readOnly />
            ) : (
              <SelectInput
                value={form.relatedEntityType ?? "MANUAL"}
                onChange={(e) =>
                  setForm((old) => ({
                    ...old,
                    relatedEntityType: e.target.value,
                    relatedEntityId: "",
                    relatedEntityName: "",
                    referenceNo: "",
                    organizationMasterId: "",
                    organizationName: "",
                  }))
                }
                options={SOURCE_MODULES.map((x) => ({ value: x, label: sourceModuleLabel(x) }))}
              />
            )}
          </Field>
          <div className="md:col-span-2">
            <Field caption="Related Record">
              {record && record.sourceModule !== "MANUAL" ? (
                <TextInput value={form.relatedEntityName} readOnly />
              ) : form.relatedEntityType === "MANUAL" ? (
                <TextInput
                  value={form.relatedEntityName}
                  onChange={(e) => set("relatedEntityName", e.target.value)}
                  placeholder="Optional record or subject"
                />
              ) : (
                <SelectInput
                  value={form.relatedEntityId ?? ""}
                  disabled={
                    relatedRecords.isLoading ||
                    relatedRecords.isError ||
                    !relatedRecords.data?.length
                  }
                  placeholder={
                    relatedRecords.isLoading
                      ? "Loading records..."
                      : relatedRecords.isError
                        ? "Unable to load records"
                        : relatedRecords.data?.length
                          ? "Select Record"
                          : "No records available"
                  }
                  onChange={(e) => {
                    const option = relatedRecords.data?.find((item) => item.id === e.target.value);
                    setForm((old) => ({
                      ...old,
                      relatedEntityId: option?.id ?? "",
                      relatedEntityName: option?.label ?? "",
                      referenceNo: option?.referenceNo ?? "",
                      organizationMasterId: option?.organizationMasterId ?? "",
                      organizationName: option?.organizationName ?? "",
                    }));
                  }}
                  options={(relatedRecords.data ?? []).map((item) => ({
                    value: item.id,
                    label: item.referenceNo ? `${item.label} (${item.referenceNo})` : item.label,
                  }))}
                />
              )}
            </Field>
          </div>
          {showLinkedMetadata && (
            <>
              <div className="md:col-span-2">
                <Field caption="Reference">
                  <TextInput
                    value={form.referenceNo}
                    onChange={(e) => set("referenceNo", e.target.value)}
                    readOnly={form.relatedEntityType !== "MANUAL" && Boolean(form.relatedEntityId)}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field caption="Organization">
                  <TextInput
                    value={form.organizationName}
                    onChange={(e) => set("organizationName", e.target.value)}
                    readOnly={form.relatedEntityType !== "MANUAL" && Boolean(form.relatedEntityId)}
                  />
                </Field>
              </div>
            </>
          )}

          <div className="col-span-full border-t border-biz-border pt-2">
            <Field caption="Description">
              <textarea
                className="min-h-16 w-full resize-none rounded-sm border border-biz-border bg-white p-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                value={form.description}
                placeholder="Add notes or follow-up details (optional)"
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
        </div>
      </div>
      {error && (
        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
      <div className="-mx-4 -mb-4 mt-3 flex justify-end gap-2 rounded-b-lg border-t border-biz-border bg-slate-50/70 px-4 py-3">
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
  const busy = complete.isPending || cancel.isPending || snooze.isPending;
  const relatedModule = sourceModuleLabel(record.relatedEntityType ?? record.sourceModule);
  const relatedRecord = record.relatedEntityName || relatedModule;
  async function run(kind: string) {
    if (kind === "complete") await complete.mutateAsync({ id: record.id });
    if (kind === "cancel") await cancel.mutateAsync({ id: record.id });
    if (kind === "snooze") await snooze.mutateAsync({ id: record.id, body: { until } });
    onClose();
  }
  return (
    <Overlay title="Reminder Details" onClose={onClose} wide>
      <section className="rounded-lg border border-biz-border bg-slate-50/60 p-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-wide text-biz-blue xl:text-[12px] 2xl:text-[13px]">
              {record.type}
            </p>
            <h3 className="mt-1 text-[14px] font-bold leading-5 text-biz-text xl:text-[17px] xl:leading-6 2xl:text-[18px]">
              {record.title}
            </h3>
            {record.description && (
              <p className="mt-2 border-l-2 border-biz-blue/30 pl-3 text-[11px] leading-5 text-biz-muted xl:text-[13px] 2xl:text-[14px]">
                {record.description}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <StatusBadge
              className="text-[10px] xl:text-[12px] 2xl:text-[13px]"
              label={label(record.priority)}
              tone={priorityTone(record.priority)}
            />
            <StatusBadge
              className="text-[10px] xl:text-[12px] 2xl:text-[13px]"
              label={label(record.status)}
              tone={statusTone(record.status)}
            />
          </div>
        </div>
        <dl className="mt-3 grid gap-3 border-t border-biz-border pt-3 sm:grid-cols-2">
          <DetailItem
            caption="Due Date"
            value={
              record.dueTime
                ? `${dateLabel(record.dueDate)} · ${record.dueTime}`
                : dateLabel(record.dueDate)
            }
          />
          <DetailItem caption="Assigned To" value={record.assignedToName || "Unassigned"} />
        </dl>
      </section>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <section className="rounded-lg border border-biz-border p-3">
          <h3 className="flex items-center gap-2 text-[11px] font-bold text-biz-text xl:text-[13px] 2xl:text-[14px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-biz-blue">
              <Link2 className="h-3.5 w-3.5" />
            </span>
            Related Information
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailItem caption="Related Module" value={relatedModule} />
            <DetailItem caption="Reference" value={record.referenceNo} />
            <DetailItem caption="Related Record" value={relatedRecord} className="sm:col-span-2" />
            <DetailItem
              caption="Organization"
              value={record.organizationName}
              className="sm:col-span-2"
            />
          </dl>
        </section>

        <section className="rounded-lg border border-biz-border p-3">
          <h3 className="flex items-center gap-2 text-[11px] font-bold text-biz-text xl:text-[13px] 2xl:text-[14px]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-50 text-violet-600">
              <Clock3 className="h-3.5 w-3.5" />
            </span>
            Activity Information
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailItem caption="Created By" value={record.createdByName} />
            <DetailItem caption="Created Date" value={dateLabel(record.createdAt)} />
            <DetailItem caption="Completed Date" value={dateLabel(record.completedAt)} />
            <DetailItem caption="Snoozed Until" value={dateLabel(record.snoozedUntil)} />
          </dl>
        </section>
      </div>

      {!done && (
        <section className="mt-3 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-biz-blue" />
            <div>
              <h3 className="text-[11px] font-bold text-biz-text xl:text-[13px] 2xl:text-[14px]">
                Snooze Reminder
              </h3>
              <p className="text-[9px] text-biz-muted xl:text-[11px] 2xl:text-[12px]">
                Choose a new date or use a quick option.
              </p>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <div className="w-40">
              <TextInput type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
            {[
              [1, "Tomorrow"],
              [3, "3 Days"],
              [7, "1 Week"],
              [15, "15 Days"],
            ].map(([days, quickLabel]) => (
              <button
                type="button"
                key={days}
                className="h-10 rounded-sm border border-biz-border bg-white px-3 text-[11px] font-medium text-biz-text transition hover:border-biz-blue hover:text-biz-blue xl:text-[13px] 2xl:text-[14px]"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + Number(days));
                  setUntil(d.toISOString().slice(0, 10));
                }}
              >
                {quickLabel}
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="-mx-4 -mb-4 mt-3 flex flex-wrap justify-end gap-2 rounded-b-lg border-t border-biz-border bg-slate-50/70 px-4 py-3">
        {done ? (
          <SecondaryButton onClick={onClose}>Close</SecondaryButton>
        ) : (
          <>
            <SecondaryButton
              className="mr-auto border-red-200 text-red-600 hover:bg-red-50"
              disabled={busy}
              onClick={() => run("cancel")}
            >
              Cancel Reminder
            </SecondaryButton>
            <SecondaryButton disabled={busy} onClick={onEdit}>
              Edit
            </SecondaryButton>
            <SecondaryButton disabled={busy || !until} onClick={() => run("snooze")}>
              <Clock3 className="h-4 w-4" />
              Snooze
            </SecondaryButton>
            <PrimaryButton disabled={busy} onClick={() => run("complete")}>
              <Check className="h-4 w-4" />
              Mark as Complete
            </PrimaryButton>
          </>
        )}
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
      <div className="shrink-0 border-b border-biz-border px-3 py-2.5 2xl:px-4 2xl:py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[13px] font-bold text-biz-text xl:text-[15px] 2xl:text-[16px]">
              Priority Queue
            </h2>
            <p className="text-[10px] text-biz-muted xl:text-[12px] 2xl:text-[13px]">
              Open the next reminder that needs attention.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 xl:text-[11px]">
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
                "rounded px-1.5 py-1.5 text-[10px] font-semibold transition-colors xl:text-[12px] 2xl:text-[13px]",
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
          active.items.map((r) => {
            const supportingText = reminderSupportingText(r);
            return (
              <button
                key={r.id}
                onClick={() => onView(r)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-slate-50 2xl:px-2.5 2xl:py-2.5"
              >
                <div className="min-w-0">
                  <p
                    title={r.title}
                    className="truncate text-[11px] font-bold text-biz-text xl:text-[13px] 2xl:text-[14px]"
                  >
                    {r.title}
                  </p>
                  {supportingText && (
                    <p
                      title={supportingText}
                      className="mt-0.5 truncate text-[10px] text-biz-muted xl:text-[12px] 2xl:text-[13px]"
                    >
                      {supportingText}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p
                    className={cn(
                      "whitespace-nowrap text-[10px] font-bold xl:text-[12px] 2xl:text-[13px]",
                      toneClass,
                    )}
                  >
                    {dateLabel(r.dueDate)}
                  </p>
                  <StatusBadge
                    className="text-[10px] xl:text-[12px] 2xl:text-[13px]"
                    label={label(r.priority)}
                    tone={priorityTone(r.priority)}
                  />
                </div>
              </button>
            );
          })
        ) : (
          <div className="flex h-full min-h-32 flex-col items-center justify-center px-3 text-center">
            <Check className="h-7 w-7 text-emerald-500" />
            <p className="mt-2 text-[11px] font-semibold text-biz-text xl:text-[13px] 2xl:text-[14px]">
              Nothing needs attention
            </p>
            <p className="mt-0.5 text-[10px] text-biz-muted xl:text-[12px] 2xl:text-[13px]">
              No reminders in this queue.
            </p>
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
    <div className="scrollbar-hidden flex h-full min-h-0 flex-col gap-2 overflow-y-auto xl:gap-3 xl:overflow-hidden">
      <header className="flex shrink-0 flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-page-title text-biz-text">Reminders</h1>
        </div>
        <PrimaryButton size="sm" onClick={() => setForm("new")}>
          <Plus className="h-4 w-4" />
          Add Reminder
        </PrimaryButton>
      </header>
      <div className="grid shrink-0 grid-cols-2 gap-2 lg:grid-cols-4 xl:gap-3">
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
              "flex min-w-0 items-center gap-2 rounded-lg border bg-white px-2.5 py-2 text-left shadow-card transition-colors hover:border-biz-blue/30 hover:bg-slate-50 xl:px-3 xl:py-2.5 2xl:px-3.5 2xl:py-3",
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
              <p className="truncate text-[10px] font-semibold text-biz-muted xl:text-[12px] 2xl:text-[14px]">
                {title}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-[16px] font-bold leading-none xl:text-[18px] 2xl:text-[21px]",
                  toneClass,
                )}
              >
                {stats.isLoading ? "-" : value}
              </p>
            </div>
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-[minmax(260px,0.33fr)_minmax(0,1fr)] xl:gap-3">
        <PriorityQueue
          activeTab={quickTab}
          onTabChange={setQuickTab}
          data={quick.data}
          loading={quick.isLoading}
          onView={setSelected}
        />
        <section className="flex h-[560px] min-h-0 flex-col overflow-hidden rounded-lg border border-biz-border bg-white shadow-card xl:h-full">
          <div className="shrink-0 border-b border-biz-border px-3 py-2.5 2xl:px-4 2xl:py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-bold text-biz-text xl:text-[15px] 2xl:text-[16px]">
                    All Reminders
                  </h2>
                  {list.data && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 xl:text-[11px]">
                      {list.data.meta.total}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-biz-muted xl:text-[12px] 2xl:text-[13px]">
                  Search, filter and manage every reminder.
                </p>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 sm:w-[min(100%,430px)]">
                <div className="min-w-0 flex-1">
                  <TextInput
                    icon={Search}
                    className="h-9 text-[11px] xl:text-[13px] 2xl:h-10 2xl:text-[14px]"
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
                  className={cn(
                    "h-9 px-2.5 text-[11px] xl:text-[13px] 2xl:h-10 2xl:text-[14px]",
                    filtersOpen && "border-biz-blue text-biz-blue",
                  )}
                  onClick={() => setFiltersOpen((open) => !open)}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filters
                </SecondaryButton>
                <SecondaryButton
                  size="sm"
                  className="h-9 w-9 px-0 2xl:h-10 2xl:w-10"
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
                    className="h-9 text-[11px] xl:text-[13px] 2xl:h-10 2xl:text-[14px]"
                    aria-label="From date"
                    value={draft.dateFrom ?? ""}
                    onChange={(e) => updateFilter("dateFrom", e.target.value || undefined)}
                  />
                  <TextInput
                    type="date"
                    className="h-9 text-[11px] xl:text-[13px] 2xl:h-10 2xl:text-[14px]"
                    aria-label="To date"
                    value={draft.dateTo ?? ""}
                    onChange={(e) => updateFilter("dateTo", e.target.value || undefined)}
                  />
                </div>
                <SelectInput
                  className="h-9 text-[11px] xl:text-[13px] 2xl:h-10 2xl:text-[14px]"
                  placeholder="Reminder Type"
                  value={draft.type ?? ""}
                  onChange={(e) => updateFilter("type", e.target.value || undefined)}
                  options={REMINDER_TYPES.map((x) => ({ value: x, label: x }))}
                />
                <SelectInput
                  className="h-9 text-[11px] xl:text-[13px] 2xl:h-10 2xl:text-[14px]"
                  placeholder="Status"
                  value={draft.status ?? ""}
                  onChange={(e) => updateFilter("status", e.target.value || undefined)}
                  options={STATUSES.map((x) => ({ value: x, label: label(x) }))}
                />
                <SelectInput
                  className="h-9 text-[11px] xl:text-[13px] 2xl:h-10 2xl:text-[14px]"
                  placeholder="Priority"
                  value={draft.priority ?? ""}
                  onChange={(e) => updateFilter("priority", e.target.value || undefined)}
                  options={PRIORITIES.map((x) => ({ value: x, label: label(x) }))}
                />
                <SelectInput
                  className="h-9 text-[11px] xl:text-[13px] 2xl:h-10 2xl:text-[14px]"
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
                <table className="w-full min-w-[680px] table-fixed text-left text-[10px] xl:text-[12px] 2xl:text-[14px]">
                  <colgroup>
                    <col className="w-[82px]" />
                    <col />
                    <col className="w-[72px]" />
                    <col className="w-[86px]" />
                    <col className="w-[104px]" />
                    <col className="w-[92px]" />
                    <col className="w-[48px]" />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-[#f4f7fb] text-[9px] font-bold uppercase tracking-wide text-biz-muted shadow-[0_1px_0_#e5eaf2] xl:text-[11px] 2xl:text-[12px]">
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
                    {list.data.items.map((r) => {
                      const supportingText = reminderSupportingText(r);
                      return (
                        <tr
                          key={r.id}
                          className="h-12 border-t border-biz-border transition-colors hover:bg-slate-50/70 2xl:h-14"
                        >
                          <td className="whitespace-nowrap px-2.5 font-semibold text-biz-text">
                            {dateLabel(r.dueDate)}
                            {r.dueTime && (
                              <span className="block text-[9px] font-normal text-biz-muted xl:text-[11px] 2xl:text-[12px]">
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
                            {supportingText && (
                              <p
                                className="mt-0.5 truncate text-[9px] text-biz-muted xl:text-[11px] 2xl:text-[13px]"
                                title={supportingText}
                              >
                                {supportingText}
                              </p>
                            )}
                          </td>
                          <td className="px-2">
                            <StatusBadge
                              className="text-[10px] xl:text-[12px] 2xl:text-[13px]"
                              label={label(r.priority)}
                              tone={priorityTone(r.priority)}
                            />
                          </td>
                          <td className="px-2">
                            <StatusBadge
                              className="text-[10px] xl:text-[12px] 2xl:text-[13px]"
                              label={label(r.status)}
                              tone={statusTone(r.status)}
                            />
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
                              ? "—"
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
                      );
                    })}
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
