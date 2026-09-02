"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AppDateInput } from "@/components/shared/app-date-input";
import { ManufacturingEmptyState } from "@/components/shared/manufacturing-empty-state";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Factory,
  FileCheck2,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
  Trash2,
  CalendarRange,
  ClipboardList,
  Compass,
  Gauge,
  Hash,
  Building2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManufacturingInventoryOption } from "@/features/screens/manufacturing-control-center-workspaces";
import { formatDate, formatDateTime } from "@/lib/format";
import { listManufacturingPlans } from "@/services/manufacturing.service";
import {
  approveManufacturingControlRecord,
  archiveManufacturingPeriod,
  configureManufacturingDocumentSequence,
  createArtworkSpecification,
  createDemandPlan,
  createManufacturingCampaign,
  createManufacturingReasonCode,
  createManufacturingResource,
  createManufacturingShift,
  createMasterProductionSchedule,
  createPackagingConfiguration,
  createQualitySpecification,
  createTestMethod,
  ensureManufacturingPeriod,
  listManufacturingCalendarSlots,
  listManufacturingCapacityChecks,
  listManufacturingControlRecords,
  listManufacturingDocumentSequences,
  listManufacturingPeriods,
  listManufacturingResources,
  listManufacturingShifts,
  lockManufacturingPeriod,
  runManufacturingCapacityCheck,
  updateManufacturingResourceReadiness,
  upsertManufacturingCalendarSlot,
  validateManufacturingPeriod,
} from "@/services/manufacturing-blueprint.service";
import type { WarehouseRecord } from "@/services/warehouse.service";
import type { ManufacturingPlanRecord } from "@/types/manufacturing";
import type {
  ManufacturingCalendarStatus,
  ManufacturingCleaningState,
  ManufacturingControlRecord,
  ManufacturingControlRecordKind,
  ManufacturingDocumentKind,
  ManufacturingReadinessState,
  ManufacturingResourceKind,
  ManufacturingResourceRecord,
} from "@/types/manufacturing-blueprint";

const inputClass = "h-9 rounded-lg border-[#d7e1ee] bg-white text-sm";
const selectClass =
  "h-9 w-full rounded-lg border border-[#d7e1ee] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#8dbbf2]";
const textareaClass =
  "min-h-20 w-full resize-y rounded-lg border border-[#d7e1ee] bg-white px-3 py-2 text-sm text-[#334155] outline-none focus:border-[#8dbbf2]";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function idempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `manufacturing-ui:${scope}:${suffix}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatMinute(value: number) {
  const hours = Math.floor(value / 60) % 24;
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`grid gap-1.5 text-xs font-medium text-[#52647d] ${className}`}
    >
      <span>{label}</span>
      {children}
    </label>
  );
}

function WorkspaceShell({
  title,
  description,
  icon: Icon,
  actions,
  children,
}: {
  title: string;
  description: string;
  icon: typeof Factory;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-[#cfdeef] bg-white shadow-[0_6px_20px_rgba(30,64,175,0.05)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce7f3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e9f3ff] text-[#2478df]">
            <Icon className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-[#203651]">{title}</h2>
            <p className="mt-0.5 text-[11px] text-[#718096]">{description}</p>
          </div>
        </div>
        {actions}
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-4">{children}</div>
    </section>
  );
}

function Empty({
  text,
  icon,
  title = "Nothing to show yet",
}: {
  text: string;
  icon?: LucideIcon;
  title?: string;
}) {
  return <ManufacturingEmptyState compact icon={icon} title={title} description={text} />;
}

function LoadingOrError({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  if (loading)
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[#dbe7f3] bg-[#f8fbff] px-4 py-3 text-sm text-[#607087]">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading live manufacturing records…
      </div>
    );
  if (!error) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f0c6c0] bg-[#fff7f5] px-4 py-3 text-sm text-[#a33a2b]">
      <span>
        {errorMessage(error, "Manufacturing controls could not be loaded.")}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

const resourceViewKinds: Record<string, ManufacturingResourceKind> = {
  "work-centers": "WORK_CENTER",
  "rooms-and-production-lines": "PRODUCTION_LINE",
  "equipment-and-machines": "EQUIPMENT",
  "equipment-and-calibration-alerts": "EQUIPMENT",
};

function readinessTone(value: string) {
  return value === "READY" || value === "CLEAN"
    ? "bg-emerald-50 text-emerald-700"
    : value === "BLOCKED" || value === "DUE"
      ? "bg-red-50 text-red-700"
      : "bg-slate-100 text-slate-600";
}

function ResourceWorkspace({
  workspaceId,
  kind,
  title,
  warehouses,
  alertsOnly = false,
  allowedKinds,
}: {
  workspaceId: string;
  kind: ManufacturingResourceKind;
  title: string;
  warehouses: WarehouseRecord[];
  alertsOnly?: boolean;
  allowedKinds?: ManufacturingResourceKind[];
}) {
  const queryClient = useQueryClient();
  const [activeKind, setActiveKind] = useState<ManufacturingResourceKind>(kind);
  const key = ["manufacturing-blueprint", workspaceId, "resources", activeKind];
  const resources = useQuery({
    queryKey: key,
    queryFn: () =>
      listManufacturingResources({ workspaceId, kind: activeKind }),
    enabled: Boolean(workspaceId),
  });
  const [form, setForm] = useState({
    code: "",
    name: "",
    warehouseId: "",
    capacity: "480",
    evidence: "",
  });
  const [readinessTarget, setReadinessTarget] =
    useState<ManufacturingResourceRecord | null>(null);
  const [readiness, setReadiness] = useState<{
    qualification: ManufacturingReadinessState;
    calibration: ManufacturingReadinessState;
    maintenance: ManufacturingReadinessState;
    cleaning: ManufacturingCleaningState;
    evidence: string;
    note: string;
  }>({
    qualification: "NOT_REQUIRED",
    calibration: "NOT_REQUIRED",
    maintenance: "NOT_REQUIRED",
    cleaning: "NOT_REQUIRED",
    evidence: "",
    note: "",
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["manufacturing-blueprint", workspaceId],
    });
  const create = useMutation({
    mutationFn: createManufacturingResource,
    onSuccess: () => {
      invalidate();
      setForm({
        code: "",
        name: "",
        warehouseId: "",
        capacity: "480",
        evidence: "",
      });
      toast.success(`${title} saved.`);
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, `Could not save ${title.toLowerCase()}.`),
      ),
  });
  const updateReadiness = useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: Parameters<typeof updateManufacturingResourceReadiness>[1];
    }) => updateManufacturingResourceReadiness(id, input),
    onSuccess: () => {
      invalidate();
      setReadinessTarget(null);
      toast.success("Readiness evidence saved.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not update readiness.")),
  });
  const visibleResources = (resources.data ?? []).filter(
    (resource) =>
      !alertsOnly ||
      [
        resource.qualificationState,
        resource.calibrationState,
        resource.maintenanceState,
      ].some((state) => state === "DUE_SOON" || state === "BLOCKED") ||
      resource.cleaningState === "DUE" ||
      resource.cleaningState === "BLOCKED",
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.code.trim() || !form.name.trim())
      return toast.error("Code and name are required.");
    if (activeKind === "EQUIPMENT" && !form.evidence.trim())
      return toast.error("Equipment requires a readiness evidence reference.");
    create.mutate({
      workspaceId,
      kind: activeKind,
      code: form.code,
      name: form.name,
      warehouseId: form.warehouseId || null,
      capacityMinutesPerDay: Number(form.capacity || 0),
      readinessEvidenceReference: form.evidence || null,
    });
  };

  return (
    <WorkspaceShell
      title={title}
      description={
        alertsOnly
          ? "Live equipment qualification, calibration, maintenance and cleaning exceptions."
          : "Real resource master used by routing, capacity planning and readiness checks."
      }
      icon={Factory}
    >
      {allowedKinds && allowedKinds.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-2 rounded-xl border border-[#d8e5f2] bg-white p-2">
          {allowedKinds.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={activeKind === value ? "default" : "outline"}
              onClick={() => {
                setActiveKind(value);
                setReadinessTarget(null);
              }}
            >
              {value === "ROOM" ? "Rooms / assembly areas" : "Production lines"}
            </Button>
          ))}
        </div>
      ) : null}
      {!alertsOnly ? (
        <form
          onSubmit={submit}
          className="mb-4 grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-3 md:grid-cols-2 xl:grid-cols-5"
        >
          <Field label="Code *">
            <Input
              className={inputClass}
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value })
              }
            />
          </Field>
          <Field label="Name *">
            <Input
              className={inputClass}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
          <Field label="Warehouse">
            <select
              className={selectClass}
              value={form.warehouseId}
              onChange={(event) =>
                setForm({ ...form, warehouseId: event.target.value })
              }
            >
              <option value="">Not assigned</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacity minutes/day">
            <Input
              className={inputClass}
              type="number"
              min="0"
              max="1440"
              value={form.capacity}
              onChange={(event) =>
                setForm({ ...form, capacity: event.target.value })
              }
            />
          </Field>
          <Field
            label={
              activeKind === "EQUIPMENT"
                ? "Initial readiness evidence *"
                : "Readiness evidence"
            }
          >
            <div className="flex gap-2">
              <Input
                className={inputClass}
                value={form.evidence}
                onChange={(event) =>
                  setForm({ ...form, evidence: event.target.value })
                }
              />
              <Button type="submit" size="sm" disabled={create.isPending}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </Field>
        </form>
      ) : null}
      <LoadingOrError
        loading={resources.isLoading}
        error={resources.error}
        onRetry={() => void resources.refetch()}
      />
      {visibleResources.length ? (
        <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#f3f7fb] text-[10px] uppercase tracking-wide text-[#64748b]">
              <tr>
                <th className="px-3 py-2.5">Code / name</th>
                <th className="px-3 py-2.5">Capacity</th>
                <th className="px-3 py-2.5">Qualification</th>
                <th className="px-3 py-2.5">Calibration</th>
                <th className="px-3 py-2.5">Maintenance</th>
                <th className="px-3 py-2.5">Cleaning</th>
                <th className="px-3 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleResources.map((row) => (
                <tr key={row.id} className="border-t border-[#e3ebf3]">
                  <td className="px-3 py-3">
                    <div className="font-semibold text-[#203651]">
                      {row.name}
                    </div>
                    <div className="text-[10px] text-[#718096]">{row.code}</div>
                  </td>
                  <td className="px-3 py-3">
                    {row.capacityMinutesPerDay} min/day
                  </td>
                  {[
                    row.qualificationState,
                    row.calibrationState,
                    row.maintenanceState,
                    row.cleaningState,
                  ].map((state, index) => (
                    <td key={`${row.id}-${index}`} className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-medium ${readinessTone(state)}`}
                      >
                        {state.replaceAll("_", " ")}
                      </span>
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReadinessTarget(row);
                        setReadiness({
                          qualification: row.qualificationState,
                          calibration: row.calibrationState,
                          maintenance: row.maintenanceState,
                          cleaning: row.cleaningState,
                          evidence: row.readinessEvidenceReference ?? "",
                          note: row.readinessNote ?? "",
                        });
                      }}
                    >
                      Update readiness
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !resources.isLoading && !resources.error ? (
        <Empty
          icon={Wrench}
          text={
            alertsOnly
              ? "No equipment qualification, calibration, maintenance or cleaning alert is currently open."
              : `No ${title.toLowerCase()} configured yet.`
          }
        />
      ) : null}
      {readinessTarget ? (
        <form
          className="mt-4 grid gap-3 rounded-xl border border-[#bad4f2] bg-[#f3f8ff] p-4 md:grid-cols-2 xl:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!readiness.evidence.trim())
              return toast.error("Evidence reference is required.");
            updateReadiness.mutate({
              id: readinessTarget.id,
              input: {
                workspaceId,
                qualificationState: readiness.qualification,
                calibrationState: readiness.calibration,
                maintenanceState: readiness.maintenance,
                cleaningState: readiness.cleaning,
                evidenceReference: readiness.evidence,
                note: readiness.note || null,
                transactionDate: new Date().toISOString(),
                idempotencyKey: idempotencyKey("resource-readiness"),
              },
            });
          }}
        >
          <div className="md:col-span-2 xl:col-span-4 flex items-center justify-between">
            <div className="font-semibold text-[#203651]">
              Readiness: {readinessTarget.name}
            </div>
            <button
              type="button"
              className="text-xs text-[#64748b]"
              onClick={() => setReadinessTarget(null)}
            >
              Close
            </button>
          </div>
          {(["qualification", "calibration", "maintenance"] as const).map(
            (field) => (
              <Field
                key={field}
                label={`${field[0].toUpperCase()}${field.slice(1)} state`}
              >
                <select
                  className={selectClass}
                  value={readiness[field]}
                  onChange={(event) =>
                    setReadiness({
                      ...readiness,
                      [field]: event.target
                        .value as ManufacturingReadinessState,
                    })
                  }
                >
                  {["READY", "DUE_SOON", "BLOCKED", "NOT_REQUIRED"].map(
                    (state) => (
                      <option key={state}>{state}</option>
                    ),
                  )}
                </select>
              </Field>
            ),
          )}
          <Field label="Cleaning state">
            <select
              className={selectClass}
              value={readiness.cleaning}
              onChange={(event) =>
                setReadiness({
                  ...readiness,
                  cleaning: event.target.value as ManufacturingCleaningState,
                })
              }
            >
              {["CLEAN", "DUE", "BLOCKED", "NOT_REQUIRED"].map((state) => (
                <option key={state}>{state}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Evidence reference *"
            className="md:col-span-1 xl:col-span-2"
          >
            <Input
              className={inputClass}
              value={readiness.evidence}
              onChange={(event) =>
                setReadiness({ ...readiness, evidence: event.target.value })
              }
            />
          </Field>
          <Field label="Note" className="md:col-span-1 xl:col-span-2">
            <div className="flex gap-2">
              <Input
                className={inputClass}
                value={readiness.note}
                onChange={(event) =>
                  setReadiness({ ...readiness, note: event.target.value })
                }
              />
              <Button
                type="submit"
                size="sm"
                disabled={updateReadiness.isPending}
              >
                <Save className="h-4 w-4" />
                Save
              </Button>
            </div>
          </Field>
        </form>
      ) : null}
    </WorkspaceShell>
  );
}

function CalendarWorkspace({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const resources = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "calendar-resources"],
    queryFn: () => listManufacturingResources({ workspaceId, active: true }),
  });
  const shifts = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "shifts"],
    queryFn: () => listManufacturingShifts(workspaceId),
  });
  const slots = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "calendar-slots"],
    queryFn: () => listManufacturingCalendarSlots({ workspaceId }),
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["manufacturing-blueprint", workspaceId],
    });
  const [shift, setShift] = useState({
    code: "",
    name: "",
    start: "09:00",
    end: "17:00",
    breakMinutes: "60",
  });
  const [slot, setSlot] = useState<{
    resourceId: string;
    shiftId: string;
    date: string;
    minutes: string;
    status: ManufacturingCalendarStatus;
    note: string;
  }>({
    resourceId: "",
    shiftId: "",
    date: todayIso(),
    minutes: "420",
    status: "AVAILABLE",
    note: "",
  });
  const createShiftMutation = useMutation({
    mutationFn: createManufacturingShift,
    onSuccess: () => {
      invalidate();
      setShift({
        code: "",
        name: "",
        start: "09:00",
        end: "17:00",
        breakMinutes: "60",
      });
      toast.success("Shift saved.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not save shift.")),
  });
  const createSlotMutation = useMutation({
    mutationFn: upsertManufacturingCalendarSlot,
    onSuccess: () => {
      invalidate();
      toast.success("Calendar capacity saved.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not save calendar capacity.")),
  });
  return (
    <WorkspaceShell
      title="Manufacturing Calendar and Shifts"
      description="Define real shifts and dated capacity for work centers, lines and equipment."
      icon={CalendarClock}
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <form
          className="grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!shift.code || !shift.name)
              return toast.error("Shift code and name are required.");
            createShiftMutation.mutate({
              workspaceId,
              code: shift.code,
              name: shift.name,
              startMinute: minutesFromTime(shift.start),
              endMinute: minutesFromTime(shift.end),
              breakMinutes: Number(shift.breakMinutes || 0),
            });
          }}
        >
          <div className="md:col-span-2 font-semibold text-[#203651]">
            Add shift
          </div>
          <Field label="Code *">
            <Input
              className={inputClass}
              value={shift.code}
              onChange={(event) =>
                setShift({ ...shift, code: event.target.value })
              }
            />
          </Field>
          <Field label="Name *">
            <Input
              className={inputClass}
              value={shift.name}
              onChange={(event) =>
                setShift({ ...shift, name: event.target.value })
              }
            />
          </Field>
          <Field label="Start">
            <Input
              className={inputClass}
              type="time"
              value={shift.start}
              onChange={(event) =>
                setShift({ ...shift, start: event.target.value })
              }
            />
          </Field>
          <Field label="End">
            <Input
              className={inputClass}
              type="time"
              value={shift.end}
              onChange={(event) =>
                setShift({ ...shift, end: event.target.value })
              }
            />
          </Field>
          <Field label="Break minutes">
            <Input
              className={inputClass}
              type="number"
              min="0"
              value={shift.breakMinutes}
              onChange={(event) =>
                setShift({ ...shift, breakMinutes: event.target.value })
              }
            />
          </Field>
          <div className="flex items-end justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={createShiftMutation.isPending}
            >
              <Plus className="h-4 w-4" />
              Add shift
            </Button>
          </div>
        </form>
        <form
          className="grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!slot.resourceId || !slot.shiftId)
              return toast.error("Resource and shift are required.");
            createSlotMutation.mutate({
              workspaceId,
              resourceId: slot.resourceId,
              shiftId: slot.shiftId,
              workDate: slot.date,
              availableMinutes:
                slot.status === "AVAILABLE" ? Number(slot.minutes || 0) : 0,
              status: slot.status,
              note: slot.note || null,
            });
          }}
        >
          <div className="md:col-span-2 font-semibold text-[#203651]">
            Dated capacity
          </div>
          <Field label="Resource *">
            <select
              className={selectClass}
              value={slot.resourceId}
              onChange={(event) =>
                setSlot({ ...slot, resourceId: event.target.value })
              }
            >
              <option value="">Select resource</option>
              {resources.data?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Shift *">
            <select
              className={selectClass}
              value={slot.shiftId}
              onChange={(event) =>
                setSlot({ ...slot, shiftId: event.target.value })
              }
            >
              <option value="">Select shift</option>
              {shifts.data?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.code} — {row.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Work date">
            <AppDateInput
              aria-label="Work date"
              inputClassName={inputClass}
              value={slot.date}
              onChange={(value) =>
                setSlot({ ...slot, date: value })
              }
            />
          </Field>
          <Field label="Status">
            <select
              className={selectClass}
              value={slot.status}
              onChange={(event) =>
                setSlot({
                  ...slot,
                  status: event.target.value as ManufacturingCalendarStatus,
                })
              }
            >
              {["AVAILABLE", "NON_WORKING", "BLOCKED"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          <Field label="Available minutes">
            <Input
              className={inputClass}
              type="number"
              min="0"
              max="1440"
              disabled={slot.status !== "AVAILABLE"}
              value={slot.status === "AVAILABLE" ? slot.minutes : "0"}
              onChange={(event) =>
                setSlot({ ...slot, minutes: event.target.value })
              }
            />
          </Field>
          <div className="flex items-end justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={createSlotMutation.isPending}
            >
              <Save className="h-4 w-4" />
              Save capacity
            </Button>
          </div>
        </form>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
          <div className="bg-[#f3f7fb] px-3 py-2.5 text-xs font-semibold text-[#203651]">
            Active shifts
          </div>
          {shifts.data?.length ? (
            shifts.data.map((row) => (
              <div
                key={row.id}
                className="flex justify-between border-t border-[#e3ebf3] px-3 py-2.5 text-xs"
              >
                <span>
                  <b>{row.code}</b> — {row.name}
                </span>
                <span>
                  {formatMinute(row.startMinute)}–{formatMinute(row.endMinute)}{" "}
                  · {row.breakMinutes}m break
                </span>
              </div>
            ))
          ) : (
            <div className="p-4 text-xs text-[#718096]">
              No shifts configured.
            </div>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
          <div className="bg-[#f3f7fb] px-3 py-2.5 text-xs font-semibold text-[#203651]">
            Calendar slots
          </div>
          {slots.data?.length ? (
            slots.data.map((row) => (
              <div
                key={row.id}
                className="flex justify-between gap-3 border-t border-[#e3ebf3] px-3 py-2.5 text-xs"
              >
                <span>
                  <b>{row.resource.name}</b>
                  <br />
                  <span className="text-[10px] text-[#718096]">
                    {row.shift.name} · {formatDate(row.workDate)}
                  </span>
                </span>
                <span>
                  {row.status} · {row.availableMinutes} min
                </span>
              </div>
            ))
          ) : (
            <div className="p-4 text-xs text-[#718096]">
              No dated capacity configured.
            </div>
          )}
        </div>
      </div>
    </WorkspaceShell>
  );
}

const controlRecordKinds: Record<string, ManufacturingControlRecordKind> = {
  "demand-plan": "DEMAND_PLAN",
  "master-production-schedule": "MASTER_PRODUCTION_SCHEDULE",
  "campaign-planning": "CAMPAIGN",
  "quality-specifications": "QUALITY_SPECIFICATION",
  "test-methods": "TEST_METHOD",
  "packaging-configurations": "PACKAGING_CONFIGURATION",
  "label-and-artwork-versions": "ARTWORK_SPECIFICATION",
  "reason-codes": "REASON_CODE",
};

type PlanningLine = {
  inventoryItemId: string;
  quantity: string;
  unit: string;
  requiredDate: string;
  plannedStartDate: string;
  plannedEndDate: string;
};

type QualityLine = {
  name: string;
  testMethodRecordId: string;
  resultType: "NUMERIC" | "TEXT" | "BOOLEAN";
  unit: string;
  lowerLimit: string;
  upperLimit: string;
  expectedText: string;
  expectedBoolean: "true" | "false";
  critical: boolean;
};

type PackagingLine = {
  inventoryItemId: string;
  componentType: "PRIMARY" | "SECONDARY" | "TERTIARY" | "LABEL" | "INSERT";
  quantity: string;
  unit: string;
};

const blankPlanningLine = (): PlanningLine => ({
  inventoryItemId: "",
  quantity: "",
  unit: "pcs",
  requiredDate: todayIso(),
  plannedStartDate: todayIso(),
  plannedEndDate: todayIso(),
});
const blankQualityLine = (): QualityLine => ({
  name: "",
  testMethodRecordId: "",
  resultType: "NUMERIC",
  unit: "",
  lowerLimit: "",
  upperLimit: "",
  expectedText: "",
  expectedBoolean: "true",
  critical: false,
});
const blankPackagingLine = (): PackagingLine => ({
  inventoryItemId: "",
  componentType: "PRIMARY",
  quantity: "",
  unit: "pcs",
});

function ItemSelect({
  value,
  items,
  onChange,
}: {
  value: string;
  items: ManufacturingInventoryOption[];
  onChange: (id: string, unit: string) => void;
}) {
  return (
    <select
      className={selectClass}
      value={value}
      onChange={(event) => {
        const item = items.find((entry) => entry.id === event.target.value);
        onChange(event.target.value, item?.unit ?? "pcs");
      }}
    >
      <option value="">Select item</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.itemCode} — {item.itemName}
        </option>
      ))}
    </select>
  );
}

function RecordRegister({
  records,
  onApprove,
  approving,
}: {
  records: ManufacturingControlRecord[];
  onApprove: (record: ManufacturingControlRecord) => void;
  approving: boolean;
}) {
  if (!records.length)
    return (
      <Empty icon={ClipboardList} text="No controlled records have been posted for this step." />
    );
  return (
    <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
      <table className="w-full text-left text-xs">
        <thead className="bg-[#f3f7fb] text-[10px] uppercase tracking-wide text-[#64748b]">
          <tr>
            <th className="px-3 py-2.5">Code / name</th>
            <th className="px-3 py-2.5">Version</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">Effective period</th>
            <th className="px-3 py-2.5">Lines</th>
            <th className="px-3 py-2.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-t border-[#e3ebf3]">
              <td className="px-3 py-3">
                <div className="font-semibold text-[#203651]">
                  {record.name}
                </div>
                <div className="text-[10px] text-[#718096]">{record.code}</div>
              </td>
              <td className="px-3 py-3">v{record.versionNumber}</td>
              <td className="px-3 py-3">
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-medium ${record.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                >
                  {record.status}
                </span>
              </td>
              <td className="px-3 py-3">
                {record.effectiveFrom ? formatDate(record.effectiveFrom) : "—"} →{" "}
                {record.effectiveTo ? formatDate(record.effectiveTo) : "—"}
              </td>
              <td className="px-3 py-3">{record.lines?.length ?? 0}</td>
              <td className="px-3 py-3 text-right">
                {record.status === "DRAFT" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={approving}
                    onClick={() => onApprove(record)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Approve
                  </Button>
                ) : (
                  <span className="text-[10px] text-[#718096]">
                    Approved {record.approvedAt ? formatDate(record.approvedAt) : ""}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ControlledRecordWorkspace({
  workspaceId,
  view,
  title,
  items,
}: {
  workspaceId: string;
  view: string;
  title: string;
  items: ManufacturingInventoryOption[];
}) {
  const kind = controlRecordKinds[view];
  const queryClient = useQueryClient();
  const key = ["manufacturing-blueprint", workspaceId, "control-records", kind];
  const records = useQuery({
    queryKey: key,
    queryFn: () => listManufacturingControlRecords({ workspaceId, kind }),
    enabled: Boolean(kind),
  });
  const demands = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "approved-demands"],
    queryFn: () =>
      listManufacturingControlRecords({
        workspaceId,
        kind: "DEMAND_PLAN",
        status: "APPROVED",
      }),
    enabled: view === "master-production-schedule",
  });
  const schedules = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "approved-mps"],
    queryFn: () =>
      listManufacturingControlRecords({
        workspaceId,
        kind: "MASTER_PRODUCTION_SCHEDULE",
        status: "APPROVED",
      }),
    enabled: view === "campaign-planning",
  });
  const testMethods = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "approved-test-methods"],
    queryFn: () =>
      listManufacturingControlRecords({
        workspaceId,
        kind: "TEST_METHOD",
        status: "APPROVED",
      }),
    enabled: view === "quality-specifications",
  });
  const artworks = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "approved-artworks"],
    queryFn: () =>
      listManufacturingControlRecords({
        workspaceId,
        kind: "ARTWORK_SPECIFICATION",
        status: "APPROVED",
      }),
    enabled: view === "packaging-configurations",
  });
  const plans = useQuery({
    queryKey: ["manufacturing", workspaceId, "plans", "campaign-options"],
    queryFn: () => listManufacturingPlans({ workspaceId, status: "APPROVED" }),
    enabled: view === "campaign-planning",
  });
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["manufacturing-blueprint", workspaceId],
    });
  const [base, setBase] = useState({ code: "", name: "" });
  const [dates, setDates] = useState({
    from: todayIso(),
    to: todayIso(),
    customerReference: "",
    forecastReference: "",
  });
  const [planningLines, setPlanningLines] = useState<PlanningLine[]>([
    blankPlanningLine(),
  ]);
  const [demandPlanId, setDemandPlanId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [campaign, setCampaign] = useState({
    finishedProductId: "",
    quantity: "",
    unit: "pcs",
    start: todayIso(),
    end: todayIso(),
    planId: "",
    strategy: "",
  });
  const [test, setTest] = useState({
    procedure: "",
    instrument: "",
    sampling: "",
    effectiveFrom: todayIso(),
  });
  const [quality, setQuality] = useState({
    inventoryItemId: "",
    effectiveFrom: todayIso(),
  });
  const [qualityLines, setQualityLines] = useState<QualityLine[]>([
    blankQualityLine(),
  ]);
  const [artwork, setArtwork] = useState({
    finishedProductId: "",
    assetReference: "",
    approvalReference: "",
    market: "",
    language: "",
    labelCopyReference: "",
  });
  const [packaging, setPackaging] = useState({
    finishedProductId: "",
    artworkId: "",
    packSize: "1",
    packUnit: "pcs",
  });
  const [packagingLines, setPackagingLines] = useState<PackagingLine[]>([
    blankPackagingLine(),
  ]);
  const [reason, setReason] = useState({
    process: "MATERIAL_ISSUE",
    description: "",
    evidenceRequired: true,
    approvalRequired: false,
  });

  const create = useMutation({
    mutationFn: async () => {
      const common = {
        workspaceId,
        code: base.code.trim(),
        name: base.name.trim(),
      };
      if (!common.code || !common.name)
        throw new Error("Code and name are required.");
      if (view === "demand-plan")
        return createDemandPlan({
          ...common,
          demandFrom: dates.from,
          demandTo: dates.to,
          customerReference: dates.customerReference || null,
          forecastReference: dates.forecastReference || null,
          lines: planningLines.map((line, index) => ({
            sequence: index + 1,
            inventoryItemId: line.inventoryItemId,
            quantity: Number(line.quantity),
            unit: line.unit,
            requiredDate: line.requiredDate,
          })),
        });
      if (view === "master-production-schedule")
        return createMasterProductionSchedule({
          ...common,
          demandPlanId,
          lines: planningLines.map((line, index) => ({
            sequence: index + 1,
            inventoryItemId: line.inventoryItemId,
            quantity: Number(line.quantity),
            unit: line.unit,
            requiredDate: line.requiredDate || null,
            plannedStartDate: line.plannedStartDate,
            plannedEndDate: line.plannedEndDate,
          })),
        });
      if (view === "campaign-planning")
        return createManufacturingCampaign({
          ...common,
          masterProductionScheduleId: scheduleId,
          finishedProductId: campaign.finishedProductId,
          plannedQuantity: Number(campaign.quantity),
          unit: campaign.unit,
          plannedStartDate: campaign.start,
          plannedEndDate: campaign.end,
          manufacturingPlanId: campaign.planId || null,
          campaignStrategy: campaign.strategy || null,
        });
      if (view === "test-methods")
        return createTestMethod({
          ...common,
          procedureReference: test.procedure,
          instrumentRequirement: test.instrument || null,
          samplingInstruction: test.sampling || null,
          effectiveFrom: test.effectiveFrom || null,
        });
      if (view === "quality-specifications")
        return createQualitySpecification({
          ...common,
          inventoryItemId: quality.inventoryItemId,
          effectiveFrom: quality.effectiveFrom || null,
          parameters: qualityLines.map((line, index) => ({
            sequence: index + 1,
            name: line.name,
            testMethodRecordId: line.testMethodRecordId,
            resultType: line.resultType,
            unit: line.unit || null,
            lowerLimit:
              line.resultType === "NUMERIC" && line.lowerLimit !== ""
                ? Number(line.lowerLimit)
                : null,
            upperLimit:
              line.resultType === "NUMERIC" && line.upperLimit !== ""
                ? Number(line.upperLimit)
                : null,
            expectedText: line.resultType === "TEXT" ? line.expectedText : null,
            expectedBoolean:
              line.resultType === "BOOLEAN"
                ? line.expectedBoolean === "true"
                : null,
            critical: line.critical,
          })),
        });
      if (view === "label-and-artwork-versions")
        return createArtworkSpecification({
          ...common,
          finishedProductId: artwork.finishedProductId,
          assetReference: artwork.assetReference,
          approvalReference: artwork.approvalReference,
          market: artwork.market || null,
          language: artwork.language || null,
          labelCopyReference: artwork.labelCopyReference || null,
        });
      if (view === "packaging-configurations")
        return createPackagingConfiguration({
          ...common,
          finishedProductId: packaging.finishedProductId,
          artworkSpecificationId: packaging.artworkId || null,
          packSize: Number(packaging.packSize),
          packUnit: packaging.packUnit,
          components: packagingLines.map((line, index) => ({
            sequence: index + 1,
            inventoryItemId: line.inventoryItemId,
            componentType: line.componentType,
            quantityPerFinishedUnit: Number(line.quantity),
            unit: line.unit,
          })),
        });
      if (view === "reason-codes")
        return createManufacturingReasonCode({
          ...common,
          processes: [
            reason.process as Parameters<
              typeof createManufacturingReasonCode
            >[0]["processes"][number],
          ],
          description: reason.description || null,
          evidenceRequired: reason.evidenceRequired,
          approvalRequired: reason.approvalRequired,
        });
      throw new Error("This controlled record type is not configured.");
    },
    onSuccess: () => {
      invalidate();
      setBase({ code: "", name: "" });
      toast.success(
        `${title} draft saved. Review and approve it before downstream use.`,
      );
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, `Could not save ${title.toLowerCase()}.`),
      ),
  });
  const approve = useMutation({
    mutationFn: (record: ManufacturingControlRecord) => {
      const signatureMeaning = window.prompt(
        "Enter an exact signature meaning allowed by the approved manufacturing e-sign policy.",
      );
      if (!signatureMeaning?.trim())
        throw new Error(
          "Control-record approval was cancelled because a signature meaning was not provided.",
        );
      const reauthenticationPassword = window.prompt(
        "Enter your current password if the approved policy requires reauthentication. Leave blank only when it does not.",
      );
      if (reauthenticationPassword === null)
        throw new Error("Control-record approval was cancelled.");
      return approveManufacturingControlRecord(record.id, {
        workspaceId,
        transactionDate: new Date().toISOString(),
        idempotencyKey: idempotencyKey("control-approval"),
        signatureMeaning: signatureMeaning.trim(),
        reauthenticationPassword: reauthenticationPassword || null,
        note: "Approved from Manufacturing Control Center.",
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Controlled record approved.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not approve controlled record.")),
  });

  const updatePlanningLine = (index: number, patch: Partial<PlanningLine>) =>
    setPlanningLines((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  const updateQualityLine = (index: number, patch: Partial<QualityLine>) =>
    setQualityLines((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  const updatePackagingLine = (index: number, patch: Partial<PackagingLine>) =>
    setPackagingLines((rows) =>
      rows.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );

  const renderPlanningLines = (schedule: boolean) => (
    <div className="grid gap-2 md:col-span-2 xl:col-span-6">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#203651]">
          Product lines *
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() =>
            setPlanningLines((rows) => [...rows, blankPlanningLine()])
          }
        >
          <Plus className="h-4 w-4" />
          Add line
        </Button>
      </div>
      {planningLines.map((line, index) => (
        <div
          key={index}
          className={`grid gap-2 rounded-lg border border-[#dce7f3] bg-white p-2 ${schedule ? "md:grid-cols-6" : "md:grid-cols-4"}`}
        >
          <ItemSelect
            value={line.inventoryItemId}
            items={items}
            onChange={(id, unit) =>
              updatePlanningLine(index, { inventoryItemId: id, unit })
            }
          />
          <Input
            className={inputClass}
            type="number"
            min="0.0001"
            step="0.0001"
            placeholder="Quantity"
            value={line.quantity}
            onChange={(event) =>
              updatePlanningLine(index, { quantity: event.target.value })
            }
          />
          <Input
            className={inputClass}
            value={line.unit}
            onChange={(event) =>
              updatePlanningLine(index, { unit: event.target.value })
            }
          />
          <AppDateInput
            aria-label="Required date"
            inputClassName={inputClass}
            value={line.requiredDate}
            onChange={(value) =>
              updatePlanningLine(index, { requiredDate: value })
            }
          />
          {schedule ? (
            <>
              <AppDateInput
                aria-label="Planned start date"
                inputClassName={inputClass}
                value={line.plannedStartDate}
                onChange={(value) =>
                  updatePlanningLine(index, {
                    plannedStartDate: value,
                  })
                }
              />
              <div className="flex gap-1">
                <AppDateInput
                  aria-label="Planned end date"
                  inputClassName={inputClass}
                  value={line.plannedEndDate}
                  onChange={(value) =>
                    updatePlanningLine(index, {
                      plannedEndDate: value,
                    })
                  }
                />
                {planningLines.length > 1 ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={() =>
                      setPlanningLines((rows) =>
                        rows.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </>
          ) : planningLines.length > 1 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setPlanningLines((rows) =>
                  rows.filter((_, rowIndex) => rowIndex !== index),
                )
              }
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );

  return (
    <WorkspaceShell
      title={title}
      description="Version-controlled, auditable master/planning record. Drafts must be approved before downstream posting."
      icon={ClipboardCheck}
      actions={
        <span className="rounded-full bg-[#edf4fc] px-2.5 py-1 text-[10px] font-medium text-[#52647d]">
          {records.data?.length ?? 0} records
        </span>
      }
    >
      <form
        className="mb-4 grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-2 xl:grid-cols-6"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Code *" className="xl:col-span-2">
          <Input
            className={inputClass}
            value={base.code}
            onChange={(event) => setBase({ ...base, code: event.target.value })}
          />
        </Field>
        <Field label="Name *" className="xl:col-span-2">
          <Input
            className={inputClass}
            value={base.name}
            onChange={(event) => setBase({ ...base, name: event.target.value })}
          />
        </Field>
        {view === "demand-plan" ? (
          <>
            <Field label="Demand from *">
              <AppDateInput
                aria-label="Demand from"
                inputClassName={inputClass}
                value={dates.from}
                onChange={(value) =>
                  setDates({ ...dates, from: value })
                }
              />
            </Field>
            <Field label="Demand to *">
              <AppDateInput
                aria-label="Demand to"
                inputClassName={inputClass}
                value={dates.to}
                onChange={(value) =>
                  setDates({ ...dates, to: value })
                }
              />
            </Field>
            <Field label="Customer reference" className="xl:col-span-3">
              <Input
                className={inputClass}
                value={dates.customerReference}
                onChange={(event) =>
                  setDates({ ...dates, customerReference: event.target.value })
                }
              />
            </Field>
            <Field label="Forecast reference" className="xl:col-span-3">
              <Input
                className={inputClass}
                value={dates.forecastReference}
                onChange={(event) =>
                  setDates({ ...dates, forecastReference: event.target.value })
                }
              />
            </Field>
            {renderPlanningLines(false)}
          </>
        ) : null}
        {view === "master-production-schedule" ? (
          <>
            <Field label="Approved demand plan *" className="xl:col-span-2">
              <select
                className={selectClass}
                value={demandPlanId}
                onChange={(event) => setDemandPlanId(event.target.value)}
              >
                <option value="">Select approved demand</option>
                {demands.data?.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.code} — {record.name}
                  </option>
                ))}
              </select>
            </Field>
            {renderPlanningLines(true)}
          </>
        ) : null}
        {view === "campaign-planning" ? (
          <>
            <Field label="Approved MPS *" className="xl:col-span-2">
              <select
                className={selectClass}
                value={scheduleId}
                onChange={(event) => setScheduleId(event.target.value)}
              >
                <option value="">Select approved MPS</option>
                {schedules.data?.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.code} — {record.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Finished product *" className="xl:col-span-2">
              <ItemSelect
                value={campaign.finishedProductId}
                items={items}
                onChange={(id, unit) =>
                  setCampaign({ ...campaign, finishedProductId: id, unit })
                }
              />
            </Field>
            <Field label="Quantity *">
              <Input
                className={inputClass}
                type="number"
                min="0.0001"
                value={campaign.quantity}
                onChange={(event) =>
                  setCampaign({ ...campaign, quantity: event.target.value })
                }
              />
            </Field>
            <Field label="Unit">
              <Input
                className={inputClass}
                value={campaign.unit}
                onChange={(event) =>
                  setCampaign({ ...campaign, unit: event.target.value })
                }
              />
            </Field>
            <Field label="Start date">
              <AppDateInput
                aria-label="Start date"
                inputClassName={inputClass}
                value={campaign.start}
                onChange={(value) =>
                  setCampaign({ ...campaign, start: value })
                }
              />
            </Field>
            <Field label="End date">
              <AppDateInput
                aria-label="End date"
                inputClassName={inputClass}
                value={campaign.end}
                onChange={(value) =>
                  setCampaign({ ...campaign, end: value })
                }
              />
            </Field>
            <Field label="Approved production plan" className="xl:col-span-2">
              <select
                className={selectClass}
                value={campaign.planId}
                onChange={(event) =>
                  setCampaign({ ...campaign, planId: event.target.value })
                }
              >
                <option value="">Link later</option>
                {(plans.data as ManufacturingPlanRecord[] | undefined)?.map(
                  (plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.planNumber}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field label="Strategy" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={campaign.strategy}
                onChange={(event) =>
                  setCampaign({ ...campaign, strategy: event.target.value })
                }
              />
            </Field>
          </>
        ) : null}
        {view === "test-methods" ? (
          <>
            <Field label="Procedure reference *" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={test.procedure}
                onChange={(event) =>
                  setTest({ ...test, procedure: event.target.value })
                }
              />
            </Field>
            <Field label="Instrument requirement" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={test.instrument}
                onChange={(event) =>
                  setTest({ ...test, instrument: event.target.value })
                }
              />
            </Field>
            <Field label="Effective from">
              <AppDateInput
                aria-label="Effective from"
                inputClassName={inputClass}
                value={test.effectiveFrom}
                onChange={(value) =>
                  setTest({ ...test, effectiveFrom: value })
                }
              />
            </Field>
            <Field label="Sampling instruction" className="xl:col-span-6">
              <textarea
                className={textareaClass}
                value={test.sampling}
                onChange={(event) =>
                  setTest({ ...test, sampling: event.target.value })
                }
              />
            </Field>
          </>
        ) : null}
        {view === "quality-specifications" ? (
          <>
            <Field label="Finished/raw item *" className="xl:col-span-2">
              <ItemSelect
                value={quality.inventoryItemId}
                items={items}
                onChange={(id) =>
                  setQuality({ ...quality, inventoryItemId: id })
                }
              />
            </Field>
            <Field label="Effective from">
              <AppDateInput
                aria-label="Effective from"
                inputClassName={inputClass}
                value={quality.effectiveFrom}
                onChange={(value) =>
                  setQuality({ ...quality, effectiveFrom: value })
                }
              />
            </Field>
            <div className="grid gap-2 md:col-span-2 xl:col-span-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#203651]">
                  Test parameters *
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setQualityLines((rows) => [...rows, blankQualityLine()])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add parameter
                </Button>
              </div>
              {qualityLines.map((line, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-[#dce7f3] bg-white p-2 md:grid-cols-4 xl:grid-cols-8"
                >
                  <Input
                    className={inputClass}
                    placeholder="Parameter name"
                    value={line.name}
                    onChange={(event) =>
                      updateQualityLine(index, { name: event.target.value })
                    }
                  />
                  <select
                    className={selectClass}
                    value={line.testMethodRecordId}
                    onChange={(event) =>
                      updateQualityLine(index, {
                        testMethodRecordId: event.target.value,
                      })
                    }
                  >
                    <option value="">Approved test method</option>
                    {testMethods.data?.map((record) => (
                      <option key={record.id} value={record.id}>
                        {record.code} — {record.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={selectClass}
                    value={line.resultType}
                    onChange={(event) =>
                      updateQualityLine(index, {
                        resultType: event.target
                          .value as QualityLine["resultType"],
                      })
                    }
                  >
                    {["NUMERIC", "TEXT", "BOOLEAN"].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <Input
                    className={inputClass}
                    placeholder="Unit"
                    value={line.unit}
                    onChange={(event) =>
                      updateQualityLine(index, { unit: event.target.value })
                    }
                  />
                  {line.resultType === "NUMERIC" ? (
                    <>
                      <Input
                        className={inputClass}
                        type="number"
                        step="any"
                        placeholder="Lower limit"
                        value={line.lowerLimit}
                        onChange={(event) =>
                          updateQualityLine(index, {
                            lowerLimit: event.target.value,
                          })
                        }
                      />
                      <Input
                        className={inputClass}
                        type="number"
                        step="any"
                        placeholder="Upper limit"
                        value={line.upperLimit}
                        onChange={(event) =>
                          updateQualityLine(index, {
                            upperLimit: event.target.value,
                          })
                        }
                      />
                    </>
                  ) : line.resultType === "TEXT" ? (
                    <Input
                      className={`${inputClass} xl:col-span-2`}
                      placeholder="Expected text"
                      value={line.expectedText}
                      onChange={(event) =>
                        updateQualityLine(index, {
                          expectedText: event.target.value,
                        })
                      }
                    />
                  ) : (
                    <select
                      className={`${selectClass} xl:col-span-2`}
                      value={line.expectedBoolean}
                      onChange={(event) =>
                        updateQualityLine(index, {
                          expectedBoolean: event.target.value as
                            "true" | "false",
                        })
                      }
                    >
                      <option value="true">Expected: Yes</option>
                      <option value="false">Expected: No</option>
                    </select>
                  )}
                  <label className="flex items-center gap-2 px-2 text-xs">
                    <input
                      type="checkbox"
                      checked={line.critical}
                      onChange={(event) =>
                        updateQualityLine(index, {
                          critical: event.target.checked,
                        })
                      }
                    />
                    Critical
                  </label>
                  {qualityLines.length > 1 ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setQualityLines((rows) =>
                          rows.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          </>
        ) : null}
        {view === "label-and-artwork-versions" ? (
          <>
            <Field label="Finished product *" className="xl:col-span-2">
              <ItemSelect
                value={artwork.finishedProductId}
                items={items}
                onChange={(id) =>
                  setArtwork({ ...artwork, finishedProductId: id })
                }
              />
            </Field>
            <Field label="Asset/file reference *" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={artwork.assetReference}
                onChange={(event) =>
                  setArtwork({ ...artwork, assetReference: event.target.value })
                }
              />
            </Field>
            <Field label="Approval reference *" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={artwork.approvalReference}
                onChange={(event) =>
                  setArtwork({
                    ...artwork,
                    approvalReference: event.target.value,
                  })
                }
              />
            </Field>
            <Field label="Market" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={artwork.market}
                onChange={(event) =>
                  setArtwork({ ...artwork, market: event.target.value })
                }
              />
            </Field>
            <Field label="Language" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={artwork.language}
                onChange={(event) =>
                  setArtwork({ ...artwork, language: event.target.value })
                }
              />
            </Field>
            <Field label="Label copy reference" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={artwork.labelCopyReference}
                onChange={(event) =>
                  setArtwork({
                    ...artwork,
                    labelCopyReference: event.target.value,
                  })
                }
              />
            </Field>
          </>
        ) : null}
        {view === "packaging-configurations" ? (
          <>
            <Field label="Finished product *" className="xl:col-span-2">
              <ItemSelect
                value={packaging.finishedProductId}
                items={items}
                onChange={(id, unit) =>
                  setPackaging({
                    ...packaging,
                    finishedProductId: id,
                    packUnit: unit,
                  })
                }
              />
            </Field>
            <Field label="Approved artwork" className="xl:col-span-2">
              <select
                className={selectClass}
                value={packaging.artworkId}
                onChange={(event) =>
                  setPackaging({ ...packaging, artworkId: event.target.value })
                }
              >
                <option value="">No artwork required</option>
                {artworks.data?.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.code} — {record.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Pack size *">
              <Input
                className={inputClass}
                type="number"
                min="0.0001"
                value={packaging.packSize}
                onChange={(event) =>
                  setPackaging({ ...packaging, packSize: event.target.value })
                }
              />
            </Field>
            <Field label="Pack unit">
              <Input
                className={inputClass}
                value={packaging.packUnit}
                onChange={(event) =>
                  setPackaging({ ...packaging, packUnit: event.target.value })
                }
              />
            </Field>
            <div className="grid gap-2 md:col-span-2 xl:col-span-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#203651]">
                  Packaging components *
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setPackagingLines((rows) => [...rows, blankPackagingLine()])
                  }
                >
                  <Plus className="h-4 w-4" />
                  Add component
                </Button>
              </div>
              {packagingLines.map((line, index) => (
                <div
                  key={index}
                  className="grid gap-2 rounded-lg border border-[#dce7f3] bg-white p-2 md:grid-cols-5"
                >
                  <ItemSelect
                    value={line.inventoryItemId}
                    items={items}
                    onChange={(id, unit) =>
                      updatePackagingLine(index, { inventoryItemId: id, unit })
                    }
                  />
                  <select
                    className={selectClass}
                    value={line.componentType}
                    onChange={(event) =>
                      updatePackagingLine(index, {
                        componentType: event.target
                          .value as PackagingLine["componentType"],
                      })
                    }
                  >
                    {[
                      "PRIMARY",
                      "SECONDARY",
                      "TERTIARY",
                      "LABEL",
                      "INSERT",
                    ].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                  <Input
                    className={inputClass}
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    placeholder="Qty / finished unit"
                    value={line.quantity}
                    onChange={(event) =>
                      updatePackagingLine(index, {
                        quantity: event.target.value,
                      })
                    }
                  />
                  <Input
                    className={inputClass}
                    value={line.unit}
                    onChange={(event) =>
                      updatePackagingLine(index, { unit: event.target.value })
                    }
                  />
                  {packagingLines.length > 1 ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPackagingLines((rows) =>
                          rows.filter((_, rowIndex) => rowIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      Remove
                    </Button>
                  ) : (
                    <span />
                  )}
                </div>
              ))}
            </div>
          </>
        ) : null}
        {view === "reason-codes" ? (
          <>
            <Field label="Process *" className="xl:col-span-2">
              <select
                className={selectClass}
                value={reason.process}
                onChange={(event) =>
                  setReason({ ...reason, process: event.target.value })
                }
              >
                {[
                  "MATERIAL_ISSUE",
                  "MATERIAL_RETURN",
                  "SCRAP",
                  "DEVIATION",
                  "HOLD",
                  "REWORK",
                  "REJECTION",
                  "CANCELLATION",
                  "CLOSE",
                ].map((value) => (
                  <option key={value}>{value.replaceAll("_", " ")}</option>
                ))}
              </select>
            </Field>
            <Field label="Description" className="xl:col-span-2">
              <Input
                className={inputClass}
                value={reason.description}
                onChange={(event) =>
                  setReason({ ...reason, description: event.target.value })
                }
              />
            </Field>
            <label className="flex items-end gap-2 pb-2 text-xs">
              <input
                type="checkbox"
                checked={reason.evidenceRequired}
                onChange={(event) =>
                  setReason({
                    ...reason,
                    evidenceRequired: event.target.checked,
                  })
                }
              />
              Evidence required
            </label>
            <label className="flex items-end gap-2 pb-2 text-xs">
              <input
                type="checkbox"
                checked={reason.approvalRequired}
                onChange={(event) =>
                  setReason({
                    ...reason,
                    approvalRequired: event.target.checked,
                  })
                }
              />
              Approval required
            </label>
          </>
        ) : null}
        <div className="flex justify-end md:col-span-2 xl:col-span-6">
          <Button type="submit" size="sm" disabled={create.isPending}>
            <Save className="h-4 w-4" />
            Save draft
          </Button>
        </div>
      </form>
      <LoadingOrError
        loading={records.isLoading}
        error={records.error}
        onRetry={() => void records.refetch()}
      />
      {!records.isLoading && !records.error ? (
        <RecordRegister
          records={records.data ?? []}
          onApprove={(record) => approve.mutate(record)}
          approving={approve.isPending}
        />
      ) : null}
    </WorkspaceShell>
  );
}

const documentKinds: ManufacturingDocumentKind[] = [
  "BOM",
  "DEMAND_PLAN",
  "MASTER_PRODUCTION_SCHEDULE",
  "CAMPAIGN",
  "PRODUCTION_PLAN",
  "PRODUCTION_ORDER",
  "MATERIAL_REQUISITION",
  "MATERIAL_ISSUE",
  "MATERIAL_RETURN",
  "QC_INSPECTION",
  "PACKAGING_ORDER",
  "FINISHED_GOODS_RECEIPT",
  "QA_RELEASE",
  "CAPACITY_CHECK",
];

function CapacityWorkspace({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const plans = useQuery({
    queryKey: [
      "manufacturing",
      workspaceId,
      "plans",
      "approved-capacity-options",
    ],
    queryFn: () => listManufacturingPlans({ workspaceId, status: "APPROVED" }),
  });
  const checks = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "capacity-checks"],
    queryFn: () => listManufacturingCapacityChecks(workspaceId),
  });
  const [form, setForm] = useState({
    planId: "",
    asOfDate: todayIso(),
    note: "",
  });
  const run = useMutation({
    mutationFn: () =>
      runManufacturingCapacityCheck({
        workspaceId,
        planId: form.planId,
        asOfDate: form.asOfDate,
        note: form.note || null,
        idempotencyKey: idempotencyKey("capacity-check"),
      }),
    onSuccess: ({ check }) => {
      void queryClient.invalidateQueries({
        queryKey: ["manufacturing-blueprint", workspaceId, "capacity-checks"],
      });
      toast.success(
        check.status === "READY"
          ? "Capacity check passed."
          : "Capacity check completed with blockers.",
      );
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not run the capacity check.")),
  });

  return (
    <WorkspaceShell
      title="Capacity Planning"
      description="Validate an approved production plan against routing resources, dated calendar capacity and current readiness."
      icon={CalendarClock}
      actions={
        <span className="rounded-full bg-[#edf4fc] px-2.5 py-1 text-[10px] font-medium text-[#52647d]">
          {checks.data?.length ?? 0} checks
        </span>
      }
    >
      <form
        className="mb-4 grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-2 xl:grid-cols-[minmax(260px,2fr)_180px_minmax(240px,2fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.planId)
            return toast.error("Select an approved production plan.");
          run.mutate();
        }}
      >
        <Field label="Approved production plan *">
          <select
            className={selectClass}
            value={form.planId}
            onChange={(event) =>
              setForm({ ...form, planId: event.target.value })
            }
          >
            <option value="">Select approved plan</option>
            {plans.data?.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.planNumber} —{" "}
                {plan.finishedProduct?.itemName ?? "Product"} (
                {plan.plannedQuantity} {plan.unit})
              </option>
            ))}
          </select>
        </Field>
        <Field label="As-of date *">
          <AppDateInput
            aria-label="As-of date"
            inputClassName={inputClass}
            value={form.asOfDate}
            onChange={(value) =>
              setForm({ ...form, asOfDate: value })
            }
          />
        </Field>
        <Field label="Review note">
          <Input
            className={inputClass}
            value={form.note}
            onChange={(event) => setForm({ ...form, note: event.target.value })}
            placeholder="Capacity review reference"
          />
        </Field>
        <div className="flex items-end">
          <Button
            className="w-full"
            type="submit"
            size="sm"
            disabled={run.isPending || plans.isLoading}
          >
            <ShieldCheck className="h-4 w-4" />
            Run check
          </Button>
        </div>
      </form>
      <LoadingOrError
        loading={plans.isLoading || checks.isLoading}
        error={plans.error ?? checks.error}
        onRetry={() => {
          void plans.refetch();
          void checks.refetch();
        }}
      />
      {!plans.isLoading &&
      !checks.isLoading &&
      !plans.error &&
      !checks.error ? (
        checks.data?.length ? (
          <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f3f7fb] text-[10px] uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-3 py-2.5">Check</th>
                  <th className="px-3 py-2.5">Plan</th>
                  <th className="px-3 py-2.5">As of</th>
                  <th className="px-3 py-2.5 text-right">Required minutes</th>
                  <th className="px-3 py-2.5 text-right">Available minutes</th>
                  <th className="px-3 py-2.5">Result</th>
                </tr>
              </thead>
              <tbody>
                {checks.data.map((check) => (
                  <tr key={check.id} className="border-t border-[#e3ebf3]">
                    <td className="px-3 py-3 font-semibold text-[#203651]">
                      {check.checkNumber}
                    </td>
                    <td className="px-3 py-3">
                      {plans.data?.find((plan) => plan.id === check.planId)
                        ?.planNumber ?? check.planId}
                    </td>
                    <td className="px-3 py-3">{formatDate(check.asOfDate)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {check.requiredMinutes.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {check.availableMinutes.toLocaleString()}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${check.status === "READY" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
                      >
                        {check.status}
                      </span>
                      {check.status === "BLOCKED" ? (
                        <div
                          className="mt-1 max-w-lg truncate text-[10px] text-red-600"
                          title={JSON.stringify(check.blockers)}
                        >
                          {JSON.stringify(check.blockers)}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={Gauge} title="No capacity check yet" text="Approve a real plan, assign routing resources and calendar capacity, then run the check." />
        )
      ) : null}
    </WorkspaceShell>
  );
}

function DocumentNumberingWorkspace({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const sequences = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "document-sequences"],
    queryFn: () => listManufacturingDocumentSequences(workspaceId),
  });
  const [form, setForm] = useState<{
    documentKind: ManufacturingDocumentKind;
    prefix: string;
    nextNumber: string;
    padding: string;
    resetPeriod: "NEVER" | "ANNUAL" | "MONTHLY";
  }>({
    documentKind: "PRODUCTION_ORDER",
    prefix: "PO-",
    nextNumber: "1",
    padding: "6",
    resetPeriod: "MONTHLY",
  });
  const configure = useMutation({
    mutationFn: () =>
      configureManufacturingDocumentSequence({
        workspaceId,
        documentKind: form.documentKind,
        prefix: form.prefix,
        nextNumber: Number(form.nextNumber),
        padding: Number(form.padding),
        resetPeriod: form.resetPeriod,
        isActive: true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: [
          "manufacturing-blueprint",
          workspaceId,
          "document-sequences",
        ],
      });
      toast.success("Document numbering saved.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not save document numbering.")),
  });
  const selectExisting = (kind: ManufacturingDocumentKind) => {
    const existing = sequences.data?.find(
      (entry) => entry.documentKind === kind,
    );
    setForm(
      existing
        ? {
            documentKind: kind,
            prefix: existing.prefix,
            nextNumber: String(existing.nextNumber),
            padding: String(existing.padding),
            resetPeriod:
              existing.resetPeriod ??
              (existing.resetAnnually ? "ANNUAL" : "NEVER"),
          }
        : {
            documentKind: kind,
            prefix: `${kind}-`,
            nextNumber: "1",
            padding: "6",
            resetPeriod: "MONTHLY",
          },
    );
  };

  return (
    <WorkspaceShell
      title="Document Numbering"
      description="Configure auditable number sequences for every manufacturing posting document."
      icon={FileCheck2}
    >
      <form
        className="mb-4 grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-2 xl:grid-cols-[minmax(230px,1.5fr)_minmax(180px,1fr)_140px_120px_150px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.prefix.trim()) return toast.error("Prefix is required.");
          configure.mutate();
        }}
      >
        <Field label="Document type *">
          <select
            className={selectClass}
            value={form.documentKind}
            onChange={(event) =>
              selectExisting(event.target.value as ManufacturingDocumentKind)
            }
          >
            {documentKinds.map((kind) => (
              <option key={kind} value={kind}>
                {kind.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prefix *">
          <Input
            className={inputClass}
            value={form.prefix}
            onChange={(event) =>
              setForm({ ...form, prefix: event.target.value })
            }
          />
        </Field>
        <Field label="Next number">
          <Input
            className={inputClass}
            type="number"
            min="1"
            value={form.nextNumber}
            onChange={(event) =>
              setForm({ ...form, nextNumber: event.target.value })
            }
          />
        </Field>
        <Field label="Padding">
          <Input
            className={inputClass}
            type="number"
            min="1"
            max="12"
            value={form.padding}
            onChange={(event) =>
              setForm({ ...form, padding: event.target.value })
            }
          />
        </Field>
        <Field label="Reset period">
          <select
            className={selectClass}
            value={form.resetPeriod}
            onChange={(event) =>
              setForm({
                ...form,
                resetPeriod: event.target.value as typeof form.resetPeriod,
              })
            }
          >
            <option value="MONTHLY">Monthly (YYYY-MM)</option>
            <option value="ANNUAL">Annual (YYYY)</option>
            <option value="NEVER">Never</option>
          </select>
        </Field>
        <div className="flex items-end">
          <Button
            className="w-full"
            type="submit"
            size="sm"
            disabled={configure.isPending}
          >
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </form>
      <LoadingOrError
        loading={sequences.isLoading}
        error={sequences.error}
        onRetry={() => void sequences.refetch()}
      />
      {!sequences.isLoading && !sequences.error ? (
        sequences.data?.length ? (
          <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f3f7fb] text-[10px] uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-3 py-2.5">Document type</th>
                  <th className="px-3 py-2.5">Prefix</th>
                  <th className="px-3 py-2.5 text-right">Next number</th>
                  <th className="px-3 py-2.5 text-right">Padding</th>
                  <th className="px-3 py-2.5">Reset period</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sequences.data.map((row) => (
                  <tr key={row.id} className="border-t border-[#e3ebf3]">
                    <td className="px-3 py-3 font-semibold text-[#203651]">
                      {row.documentKind.replaceAll("_", " ")}
                    </td>
                    <td className="px-3 py-3">{row.prefix}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {row.nextNumber}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {row.padding}
                    </td>
                    <td className="px-3 py-3">
                      {row.resetPeriod ??
                        (row.resetAnnually ? "ANNUAL" : "NEVER")}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] ${row.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {row.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => selectExisting(row.documentKind)}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={Hash} title="No document sequence configured" text="Add a numbering series before posting controlled manufacturing documents." />
        )
      ) : null}
    </WorkspaceShell>
  );
}

function formatPeriodLabel(year: number, month: number) {
  return formatDate(new Date(year, month - 1, 1), "MMMM yyyy");
}

function PeriodWorkspace({
  workspaceId,
  archiveFocus,
}: {
  workspaceId: string;
  archiveFocus: boolean;
}) {
  const now = new Date();
  const queryClient = useQueryClient();
  const periods = useQuery({
    queryKey: ["manufacturing-blueprint", workspaceId, "periods"],
    queryFn: () => listManufacturingPeriods(workspaceId),
  });
  const [period, setPeriod] = useState({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
  });
  const [reason, setReason] = useState(
    archiveFocus
      ? "Manufacturing records verified and archived."
      : "All manufacturing postings and controls have been reviewed.",
  );
  const [validationReference, setValidationReference] = useState("");
  const [reauthenticationPassword, setReauthenticationPassword] = useState("");
  const [validation, setValidation] = useState<Awaited<
    ReturnType<typeof validateManufacturingPeriod>
  > | null>(null);
  const periodKey = {
    workspaceId,
    periodYear: Number(period.year),
    periodMonth: Number(period.month),
  };
  const invalidate = () =>
    void queryClient.invalidateQueries({
      queryKey: ["manufacturing-blueprint", workspaceId, "periods"],
    });
  const ensure = useMutation({
    mutationFn: () => ensureManufacturingPeriod(periodKey),
    onSuccess: () => {
      invalidate();
      toast.success("Manufacturing period is open.");
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Could not open the manufacturing period."),
      ),
  });
  const validate = useMutation({
    mutationFn: () =>
      validateManufacturingPeriod({
        ...periodKey,
        validationReference: validationReference || null,
      }),
    onSuccess: (snapshot) => {
      setValidation(snapshot);
      invalidate();
      toast.success(
        snapshot.lockable
          ? "Period validation passed."
          : `Validation found ${snapshot.blockerCount} blocker(s).`,
      );
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not validate the period.")),
  });
  const lock = useMutation({
    mutationFn: () =>
      lockManufacturingPeriod({
        ...periodKey,
        idempotencyKey: idempotencyKey("period-lock"),
        transactionDate: new Date().toISOString(),
        signatureMeaning: reason.trim(),
        reauthenticationPassword: reauthenticationPassword || null,
        reason,
        validationReference: validationReference || null,
      }),
    onSuccess: () => {
      setReauthenticationPassword("");
      invalidate();
      toast.success("Manufacturing period locked.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not lock the period.")),
  });
  const archive = useMutation({
    mutationFn: () =>
      archiveManufacturingPeriod({
        ...periodKey,
        idempotencyKey: idempotencyKey("period-archive"),
        transactionDate: new Date().toISOString(),
        signatureMeaning: reason.trim(),
        reauthenticationPassword: reauthenticationPassword || null,
        reason,
      }),
    onSuccess: () => {
      setReauthenticationPassword("");
      invalidate();
      toast.success("Manufacturing period archived.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not archive the period.")),
  });
  const selected = periods.data?.find(
    (entry) =>
      entry.periodYear === periodKey.periodYear &&
      entry.periodMonth === periodKey.periodMonth,
  );
  const busy =
    ensure.isPending ||
    validate.isPending ||
    lock.isPending ||
    archive.isPending;

  return (
    <WorkspaceShell
      title={
        archiveFocus
          ? "Data Retention and Archive"
          : "Manufacturing Period Lock"
      }
      description={
        archiveFocus
          ? "Archive only a locked manufacturing period after all post-lock checks remain clean."
          : "Open, validate and lock a month only after every operational, inventory, costing, quality and approval blocker is cleared."
      }
      icon={ShieldCheck}
      actions={
        selected ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${selected.status === "OPEN" ? "bg-blue-50 text-blue-700" : selected.status === "LOCKED" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-700"}`}
          >
            {selected.status}
          </span>
        ) : null
      }
    >
      <div className="mb-4 grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-2 xl:grid-cols-[120px_140px_minmax(240px,1fr)_minmax(300px,2fr)]">
        <Field label="Year">
          <Input
            className={inputClass}
            type="number"
            min="2000"
            max="2200"
            value={period.year}
            onChange={(event) => {
              setPeriod({ ...period, year: event.target.value });
              setValidation(null);
            }}
          />
        </Field>
        <Field label="Month">
          <select
            className={selectClass}
            value={period.month}
            onChange={(event) => {
              setPeriod({ ...period, month: event.target.value });
              setValidation(null);
            }}
          >
            {Array.from({ length: 12 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {String(index + 1).padStart(2, "0")}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Validation reference *">
          <Input
            className={inputClass}
            value={validationReference}
            onChange={(event) => {
              setValidationReference(event.target.value);
              setValidation(null);
            }}
            placeholder="Approved Day-29 evidence-pack reference"
          />
        </Field>
        <Field label="Reason / sign-off meaning *">
          <Input
            className={inputClass}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Field label="Current password (if policy requires)">
          <Input
            type="password"
            autoComplete="current-password"
            className={inputClass}
            value={reauthenticationPassword}
            onChange={(event) =>
              setReauthenticationPassword(event.target.value)
            }
          />
        </Field>
        <div className="flex flex-wrap gap-2 md:col-span-2 xl:col-span-4">
          {!selected ? (
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => ensure.mutate()}
            >
              <Plus className="h-4 w-4" />
              Open period
            </Button>
          ) : null}
          {selected?.status === "OPEN" ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy || !validationReference.trim()}
                onClick={() => validate.mutate()}
              >
                <ClipboardCheck className="h-4 w-4" />
                Validate
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={
                  busy ||
                  !reason.trim() ||
                  !validationReference.trim() ||
                  !validation?.lockable
                }
                onClick={() => lock.mutate()}
              >
                <ShieldCheck className="h-4 w-4" />
                Lock period
              </Button>
            </>
          ) : null}
          {selected?.status === "LOCKED" ? (
            <Button
              type="button"
              size="sm"
              disabled={busy || !reason.trim()}
              onClick={() => archive.mutate()}
            >
              <FileCheck2 className="h-4 w-4" />
              Archive period
            </Button>
          ) : null}
          {selected?.status === "ARCHIVED" ? (
            <span className="flex items-center gap-2 rounded-lg border border-[#d8e5f2] bg-white px-3 py-2 text-xs text-[#52647d]">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {formatPeriodLabel(
                periodKey.periodYear,
                periodKey.periodMonth,
              )}{" "}
              is permanently archived.
            </span>
          ) : null}
        </div>
      </div>
      {validation ? (
        <div
          className={`mb-4 rounded-xl border p-4 ${validation.lockable ? "border-emerald-200 bg-emerald-50/70" : "border-red-200 bg-red-50/70"}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold text-[#203651]">
              {validation.lockable ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-red-600" />
              )}
              {validation.lockable
                ? "No blockers — ready to lock"
                : `${validation.blockerCount} unresolved blocker(s)`}
            </div>
            <span className="text-[10px] text-[#64748b]">
              Validated {formatDateTime(validation.validatedAt)}
            </span>
          </div>
          {!validation.lockable ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(validation.counts)
                .filter(([, count]) => count > 0)
                .map(([key, count]) => (
                  <div
                    key={key}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2"
                  >
                    <div className="text-[10px] uppercase tracking-wide text-[#7b8798]">
                      {key.replace(/([A-Z])/g, " $1")}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-red-700">
                      {count}
                    </div>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">
        <div className="font-semibold">Day-29 evidence gate</div>
        <div className="mt-1">
          Validate first. Lock and archive require an approved Audit Evidence
          Pack covering this full month, at least one retrievable
          checksum-validated attachment, and a validation reference. Existing
          transaction, order, cost, reservation, operation, quality and approval
          blockers still apply.
        </div>
      </div>
      <LoadingOrError
        loading={periods.isLoading}
        error={periods.error}
        onRetry={() => void periods.refetch()}
      />
      {!periods.isLoading && !periods.error ? (
        periods.data?.length ? (
          <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f3f7fb] text-[10px] uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-3 py-2.5">Period</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Last validation</th>
                  <th className="px-3 py-2.5">Locked</th>
                  <th className="px-3 py-2.5">Archived</th>
                  <th className="px-3 py-2.5">Reason</th>
                </tr>
              </thead>
              <tbody>
                {periods.data.map((row) => (
                  <tr key={row.id} className="border-t border-[#e3ebf3]">
                    <td className="px-3 py-3 font-semibold text-[#203651]">
                      {formatPeriodLabel(row.periodYear, row.periodMonth)}
                    </td>
                    <td className="px-3 py-3">{row.status}</td>
                    <td className="px-3 py-3">
                      {row.lastValidatedAt
                        ? formatDateTime(row.lastValidatedAt)
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.lockedAt
                        ? formatDateTime(row.lockedAt)
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.archivedAt
                        ? formatDateTime(row.archivedAt)
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {row.archiveReason ?? row.lockReason ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon={CalendarRange} title="No manufacturing period opened" text="Open a period before costing, closing or archiving a production run." />
        )
      ) : null}
    </WorkspaceShell>
  );
}

const blueprintControlViews = new Set([
  ...Object.keys(resourceViewKinds),
  "shift-and-calendar",
  "manufacturing-calendar-and-shifts",
  ...Object.keys(controlRecordKinds),
  "capacity-planning",
  "document-numbering",
  "period-lock",
  "data-retention-and-archive",
]);

export function isManufacturingBlueprintView(view: string) {
  return blueprintControlViews.has(view);
}

export function ManufacturingBlueprintControlsWorkspace({
  workspaceId,
  view,
  title,
  items,
  warehouses,
}: {
  workspaceId?: string;
  view: string;
  title: string;
  items: ManufacturingInventoryOption[];
  warehouses: WarehouseRecord[];
}) {
  if (!workspaceId)
    return (
      <WorkspaceShell
        title={title}
        description="A workspace session is required before manufacturing records can be posted."
        icon={Settings2}
      >
        <Empty icon={Building2} title="No active workspace" text="Select or reopen the company workspace, then retry this manufacturing step." />
      </WorkspaceShell>
    );
  const resourceKind = resourceViewKinds[view];
  if (resourceKind)
    return (
      <ResourceWorkspace
        workspaceId={workspaceId}
        kind={resourceKind}
        title={title}
        warehouses={warehouses}
        alertsOnly={view === "equipment-and-calibration-alerts"}
        allowedKinds={
          view === "rooms-and-production-lines"
            ? ["PRODUCTION_LINE", "ROOM"]
            : undefined
        }
      />
    );
  if (
    view === "shift-and-calendar" ||
    view === "manufacturing-calendar-and-shifts"
  )
    return <CalendarWorkspace workspaceId={workspaceId} />;
  if (controlRecordKinds[view])
    return (
      <ControlledRecordWorkspace
        workspaceId={workspaceId}
        view={view}
        title={title}
        items={items}
      />
    );
  if (view === "capacity-planning")
    return <CapacityWorkspace workspaceId={workspaceId} />;
  if (view === "document-numbering")
    return <DocumentNumberingWorkspace workspaceId={workspaceId} />;
  if (view === "period-lock" || view === "data-retention-and-archive")
    return (
      <PeriodWorkspace
        workspaceId={workspaceId}
        archiveFocus={view === "data-retention-and-archive"}
      />
    );
  return (
    <WorkspaceShell
      title={title}
      description="This controlled manufacturing workspace is not available."
      icon={AlertTriangle}
    >
      <Empty icon={Compass} title="Nothing selected" text="Open another manufacturing workflow step." />
    </WorkspaceShell>
  );
}
