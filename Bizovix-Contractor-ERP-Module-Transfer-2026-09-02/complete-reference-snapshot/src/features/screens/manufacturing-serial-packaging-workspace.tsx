"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Barcode,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
  PackageOpen,
  ScanBarcode,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { ManufacturingEmptyState } from "@/components/shared/manufacturing-empty-state";
import { AppDateInput } from "@/components/shared/app-date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import {
  activateManufacturingSerialRule,
  allocateManufacturingSerials,
  confirmManufacturingPackagingReleaseReadiness,
  createManufacturingPackagingOrder,
  createManufacturingSerialRule,
  getManufacturingSerialPackagingWorkspace,
  reconcileManufacturingPackaging,
  recordManufacturingPackagingLineClearance,
  recordManufacturingSerialQc,
  registerManufacturingPackageUnits,
  registerManufacturingPackagingLabels,
  retryManufacturingPackagingMaterialReservation,
} from "@/services/manufacturing-packaging.service";
import type {
  ManufacturingLabelStatus,
  ManufacturingPackageLevel,
  ManufacturingPackagingOrderOption,
  ManufacturingPackagingOrderRecord,
  ManufacturingPendingSerialQcApproval,
  ManufacturingSerialPackagingWorkspace,
  ManufacturingSerialRecord,
  ManufacturingSignedInput,
} from "@/types/manufacturing-packaging";

const inputClass = "h-9 rounded-lg border-[#d7e1ee] bg-white text-xs";
const selectClass =
  "h-9 w-full rounded-lg border border-[#d7e1ee] bg-white px-3 text-xs text-[#334155] outline-none focus:border-[#8dbbf2]";

const packagingViews = new Set([
  "packaging-plan",
  "packaging-order",
  "batch-packaging-record-ebpr",
  "packaging-line-clearance",
  "coding-and-printing",
  "label-control",
  "packaging-execution",
  "packaging-reconciliation",
  "serialisation",
  "parent-child-aggregation",
  "carton-and-shipper-packing",
  "palletisation",
]);

export type ManufacturingSerialPackagingWorkspaceKind =
  "SERIAL_ALLOCATION" | "SERIAL_QC" | "PACKAGING";

export function manufacturingSerialPackagingWorkspaceKind(
  section: string,
  view: string,
): ManufacturingSerialPackagingWorkspaceKind | null {
  if (
    (section === "masters" && view === "batch-and-serial-number-rules") ||
    (section === "quality" && view === "serialisation-preallocation")
  ) {
    return "SERIAL_ALLOCATION";
  }
  if (section === "quality" && view === "finished-product-testing") {
    return "SERIAL_QC";
  }
  if (
    (section === "execution" && view === "batch-packaging-record-ebpr") ||
    (section === "packaging" && packagingViews.has(view))
  ) {
    return "PACKAGING";
  }
  return null;
}

export function isManufacturingSerialPackagingView(
  section: string,
  view: string,
) {
  return manufacturingSerialPackagingWorkspaceKind(section, view) !== null;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function idempotency(scope: string) {
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  return `manufacturing-ui:${scope}:${value}`;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function quantity(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })
    : "0";
}

function Field({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label
      className={`grid gap-1 text-[10px] font-semibold text-[#52647d] ${className}`}
    >
      <span>{label}</span>
      {children}
      {hint ? <span className="font-normal text-[#8a98aa]">{hint}</span> : null}
    </label>
  );
}

function Status({ value }: { value: string }) {
  const ready = [
    "ACTIVE",
    "PASSED",
    "RECONCILED",
    "RELEASE_READY",
    "RELEASED",
  ].includes(value);
  const blocked = ["FAILED", "REWORK", "CANCELLED", "MATERIAL_SHORT"].includes(
    value,
  );
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ${ready ? "bg-emerald-50 text-emerald-700" : blocked ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

function SignedFields({
  date,
  signature,
  reauthenticationPassword,
  note,
  onChange,
}: {
  date: string;
  signature: string;
  reauthenticationPassword: string;
  note: string;
  onChange: (value: {
    date: string;
    signature: string;
    reauthenticationPassword: string;
    note: string;
  }) => void;
}) {
  return (
    <div className="grid gap-3 rounded-xl border border-[#dbe7f3] bg-[#f8fbff] p-3 md:grid-cols-4">
      <Field label="Posting date *">
        <AppDateInput
          inputClassName={inputClass}
          value={date}
          onChange={(value) =>
            onChange({
              date: value,
              signature,
              reauthenticationPassword,
              note,
            })
          }
          aria-label="Posting date"
        />
      </Field>
      <Field label="Electronic signature meaning *">
        <Input
          className={inputClass}
          placeholder="e.g. Performed and verified"
          value={signature}
          onChange={(event) =>
            onChange({
              date,
              signature: event.target.value,
              reauthenticationPassword,
              note,
            })
          }
        />
      </Field>
      <Field label="Current password (if policy requires)">
        <Input
          type="password"
          autoComplete="current-password"
          className={inputClass}
          value={reauthenticationPassword}
          onChange={(event) =>
            onChange({
              date,
              signature,
              reauthenticationPassword: event.target.value,
              note,
            })
          }
        />
      </Field>
      <Field label="Controlled note">
        <Input
          className={inputClass}
          value={note}
          onChange={(event) =>
            onChange({
              date,
              signature,
              reauthenticationPassword,
              note: event.target.value,
            })
          }
        />
      </Field>
    </div>
  );
}

function Empty({
  children,
  icon,
  title = "Nothing to show yet",
}: {
  children: ReactNode;
  icon?: LucideIcon;
  title?: string;
}) {
  return <ManufacturingEmptyState compact icon={icon} title={title} description={children} />;
}

type Props = {
  workspaceId: string;
  section: string;
  view: string;
  title: string;
};

export function ManufacturingSerialPackagingWorkspace({
  workspaceId,
  section,
  view,
  title,
}: Props) {
  const queryClient = useQueryClient();
  const [orderId, setOrderId] = useState("");
  const [packagingOrderId, setPackagingOrderId] = useState("");
  const [signed, setSigned] = useState({
    date: today(),
    signature: "",
    reauthenticationPassword: "",
    note: "",
  });
  const key = ["manufacturing-serial-packaging", workspaceId, orderId];
  const query = useQuery({
    queryKey: key,
    queryFn: () =>
      getManufacturingSerialPackagingWorkspace(
        workspaceId,
        orderId || undefined,
      ),
    enabled: Boolean(workspaceId),
  });
  const data = query.data;
  const orders = data?.orders ?? [];
  const selectedOrder = orders.find((order) => order.id === orderId) ?? null;
  const packagingOrders = data?.packagingOrders ?? [];
  const selectedPackagingOrder =
    packagingOrders.find((order) => order.id === packagingOrderId) ??
    packagingOrders[0] ??
    null;
  const serials = (data?.serials ?? []).filter(
    (serial) => !orderId || serial.orderId === orderId,
  );
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["manufacturing-serial-packaging", workspaceId],
    });
  const common = (scope: string): ManufacturingSignedInput => ({
    workspaceId,
    transactionDate: new Date(`${signed.date}T12:00:00`).toISOString(),
    signatureMeaning: signed.signature,
    reauthenticationPassword: signed.reauthenticationPassword || null,
    note: signed.note || null,
    idempotencyKey: idempotency(scope),
  });

  useEffect(() => {
    if (!packagingOrderId && packagingOrders[0])
      setPackagingOrderId(packagingOrders[0].id);
  }, [packagingOrderId, packagingOrders]);

  const requireSignature = () => {
    if (!signed.signature.trim()) {
      toast.error("Electronic signature meaning is required.");
      return false;
    }
    return true;
  };

  if (query.isLoading)
    return (
      <div className="flex min-h-48 items-center justify-center gap-2 rounded-xl border border-[#d9e5f1] bg-white text-sm text-[#607087]">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading real serial and packaging records...
      </div>
    );
  if (query.isError)
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
        <span>
          {errorText(
            query.error,
            "Serial and packaging records could not be loaded.",
          )}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void query.refetch()}
        >
          Retry
        </Button>
      </div>
    );

  const workspaceKind = manufacturingSerialPackagingWorkspaceKind(
    section,
    view,
  );
  const isRule = workspaceKind === "SERIAL_ALLOCATION";
  const isQc = workspaceKind === "SERIAL_QC";
  const isPackaging = workspaceKind === "PACKAGING";

  return (
    <section className="flex min-h-[610px] flex-1 flex-col overflow-hidden rounded-2xl border border-[#cfdeef] bg-white shadow-[0_8px_24px_rgba(30,64,175,0.05)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce7f3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2ff] text-[#2478df]">
            <PackageCheck className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[.14em] text-[#7b8da4]">
              Serial QC · Packaging · Release
            </div>
            <h2 className="text-base font-semibold text-[#203651]">{title}</h2>
          </div>
        </div>
        <div className="flex min-w-[260px] flex-wrap gap-2">
          <select
            className={selectClass}
            value={orderId}
            onChange={(event) => {
              setOrderId(event.target.value);
              setPackagingOrderId("");
            }}
          >
            <option value="">All production orders</option>
            {orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} · {order.finishedProduct.itemName}
              </option>
            ))}
          </select>
          {isPackaging ? (
            <select
              className={selectClass}
              value={selectedPackagingOrder?.id ?? ""}
              onChange={(event) => setPackagingOrderId(event.target.value)}
            >
              <option value="">Select packaging order</option>
              {packagingOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.packagingOrderNumber} ·{" "}
                  {order.status.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>
      <div className="grid gap-2 border-b border-[#dce7f3] bg-[#fbfdff] px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["Serials", String(serials.length), Barcode],
            [
              "QC passed",
              String(
                serials.filter(
                  (serial) => serial.qualityInspections[0]?.status === "PASSED",
                ).length,
              ),
              ClipboardCheck,
            ],
            [
              "Line cleared",
              selectedPackagingOrder?.lineClearedAt ? "Yes" : "No",
              CheckCircle2,
            ],
            [
              "Reconciled",
              selectedPackagingOrder?.reconciledAt ? "Yes" : "No",
              Boxes,
            ],
            [
              "Used labels",
              String(
                selectedPackagingOrder?.labels.filter(
                  (label) => label.status === "USED",
                ).length ?? 0,
              ),
              Barcode,
            ],
            [
              "Release",
              selectedPackagingOrder?.status === "RELEASE_READY"
                ? "Ready"
                : "Pending",
              ShieldCheck,
            ],
          ] as Array<[string, string, typeof Barcode]>
        ).map(([label, value, Icon]) => (
          <div
            key={label}
            className="rounded-lg border border-[#e1e9f2] bg-white px-3 py-2"
          >
            <div className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-[#7b8da4]">
              <Icon className="h-3 w-3" />
              {label}
            </div>
            <div className="mt-1 text-sm font-semibold text-[#203651]">
              {value}
            </div>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {isRule ? (
          <SerialRuleWorkspace
            workspaceId={workspaceId}
            orderId={orderId}
            data={data!}
            common={common}
            signed={signed}
            setSigned={setSigned}
            requireSignature={requireSignature}
            invalidate={invalidate}
          />
        ) : null}
        {isQc ? (
          <SerialQcWorkspace
            workspaceId={workspaceId}
            orderId={orderId}
            selectedOrder={selectedOrder}
            serials={serials}
            pendingApprovals={(data?.pendingSerialQcApprovals ?? []).filter(
              (approval) => approval.orderId === orderId,
            )}
            common={common}
            signed={signed}
            setSigned={setSigned}
            requireSignature={requireSignature}
            invalidate={invalidate}
          />
        ) : null}
        {isPackaging ? (
          <PackagingExecutionWorkspace
            workspaceId={workspaceId}
            view={view}
            orderId={orderId}
            selectedOrder={selectedOrder}
            data={data!}
            selected={selectedPackagingOrder}
            common={common}
            signed={signed}
            setSigned={setSigned}
            requireSignature={requireSignature}
            invalidate={invalidate}
          />
        ) : null}
      </div>
    </section>
  );
}

type CommonProps = {
  signed: {
    date: string;
    signature: string;
    reauthenticationPassword: string;
    note: string;
  };
  setSigned: (value: {
    date: string;
    signature: string;
    reauthenticationPassword: string;
    note: string;
  }) => void;
  common: (scope: string) => ManufacturingSignedInput;
  requireSignature: () => boolean;
  invalidate: () => void;
};

function SerialRuleWorkspace({
  workspaceId,
  orderId,
  data,
  common,
  signed,
  setSigned,
  requireSignature,
  invalidate,
}: CommonProps & {
  workspaceId: string;
  orderId: string;
  data: ManufacturingSerialPackagingWorkspace;
}) {
  const [form, setForm] = useState({
    orderId: orderId,
    code: "",
    name: "",
    inventoryItemId: "",
    prefix: "",
    suffix: "",
    start: "",
    end: "",
    padding: "6",
  });
  const [allocate, setAllocate] = useState({
    ruleId: "",
    orderId,
    orderLotId: "",
    quantity: "",
  });
  useEffect(() => {
    setForm((current) => ({ ...current, orderId }));
    setAllocate((current) => ({ ...current, orderId }));
  }, [orderId]);
  const create = useMutation({
    mutationFn: createManufacturingSerialRule,
    onSuccess: () => {
      invalidate();
      setForm({
        orderId,
        code: "",
        name: "",
        inventoryItemId: "",
        prefix: "",
        suffix: "",
        start: "",
        end: "",
        padding: "6",
      });
      toast.success("Serial-number rule saved as draft.");
    },
    onError: (error) =>
      toast.error(errorText(error, "Could not save serial rule.")),
  });
  const activate = useMutation({
    mutationFn: ({ ruleId }: { ruleId: string }) =>
      activateManufacturingSerialRule(ruleId, common("serial-rule-activate")),
    onSuccess: () => {
      invalidate();
      toast.success("Serial-number rule activated.");
    },
    onError: (error) =>
      toast.error(errorText(error, "Could not activate serial rule.")),
  });
  const allocateMutation = useMutation({
    mutationFn: () =>
      allocateManufacturingSerials(allocate.ruleId, {
        ...common("serial-allocate"),
        orderId: allocate.orderId,
        orderLotId: allocate.orderLotId || null,
        quantity: Number(allocate.quantity),
      }),
    onSuccess: (result) => {
      invalidate();
      toast.success(`${result.serials.length} real serial(s) allocated.`);
      setAllocate((current) => ({ ...current, quantity: "" }));
    },
    onError: (error) =>
      toast.error(errorText(error, "Could not allocate serials.")),
  });
  const selectedOrder = data.orders.find(
    (order) => order.id === allocate.orderId,
  );
  const serialItems = new Map(
    data.serialTrackedProducts.map((item) => [item.id, item]),
  );
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-2 xl:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({
            workspaceId,
            orderId: form.orderId || null,
            code: form.code,
            name: form.name,
            inventoryItemId: form.inventoryItemId,
            prefix: form.prefix,
            suffix: form.suffix || null,
            startNumber: Number(form.start),
            endNumber: Number(form.end),
            padding: Number(form.padding),
          });
        }}
      >
        <div className="md:col-span-2 xl:col-span-4">
          <h3 className="text-sm font-semibold text-[#203651]">
            Serial number rule master
          </h3>
          <p className="text-[10px] text-[#718096]">
            Define the user-owned prefix and bounded number range. Workspace
            uniqueness is enforced when serials are allocated.
          </p>
        </div>
        <Field label="Rule code *">
          <Input
            required
            className={inputClass}
            value={form.code}
            onChange={(event) => setForm({ ...form, code: event.target.value })}
          />
        </Field>
        <Field label="Rule name *">
          <Input
            required
            className={inputClass}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="Finished product *">
          <select
            required
            className={selectClass}
            value={form.inventoryItemId}
            onChange={(event) =>
              setForm({ ...form, inventoryItemId: event.target.value })
            }
          >
            <option value="">Select serial-tracked product</option>
            {[...serialItems.entries()].map(([id, item]) => (
              <option key={id} value={id}>
                {item.itemCode} · {item.itemName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Link to order">
          <select
            className={selectClass}
            value={form.orderId}
            onChange={(event) => {
              const linked = data.orders.find(
                (order) => order.id === event.target.value,
              );
              setForm({
                ...form,
                orderId: event.target.value,
                inventoryItemId:
                  linked?.finishedProductId ?? form.inventoryItemId,
              });
            }}
          >
            <option value="">Reusable for product</option>
            {data.orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prefix">
          <Input
            className={inputClass}
            value={form.prefix}
            onChange={(event) =>
              setForm({ ...form, prefix: event.target.value })
            }
          />
        </Field>
        <Field label="Suffix">
          <Input
            className={inputClass}
            value={form.suffix}
            onChange={(event) =>
              setForm({ ...form, suffix: event.target.value })
            }
          />
        </Field>
        <Field label="Start number *">
          <Input
            required
            type="number"
            min="0"
            className={inputClass}
            value={form.start}
            onChange={(event) =>
              setForm({ ...form, start: event.target.value })
            }
          />
        </Field>
        <Field label="End number *">
          <Input
            required
            type="number"
            min="0"
            className={inputClass}
            value={form.end}
            onChange={(event) => setForm({ ...form, end: event.target.value })}
          />
        </Field>
        <Field label="Number padding">
          <Input
            type="number"
            min="1"
            max="18"
            className={inputClass}
            value={form.padding}
            onChange={(event) =>
              setForm({ ...form, padding: event.target.value })
            }
          />
        </Field>
        <div className="flex items-end justify-end md:col-span-1 xl:col-span-3">
          <Button type="submit" size="sm" disabled={create.isPending}>
            <Plus className="h-4 w-4" />
            Save draft rule
          </Button>
        </div>
      </form>
      <SignedFields {...signed} onChange={setSigned} />
      <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
        <table className="w-full text-left text-[10px]">
          <thead className="bg-[#f3f7fb] uppercase tracking-wide text-[#64748b]">
            <tr>
              <th className="px-3 py-2.5">Rule / product</th>
              <th className="px-3 py-2.5">Format</th>
              <th className="px-3 py-2.5">Range</th>
              <th className="px-3 py-2.5">Next</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.serialRules.map((rule) => (
              <tr key={rule.id} className="border-t border-[#e3ebf3]">
                <td className="px-3 py-3">
                  <b>{rule.name}</b>
                  <div className="text-[#8290a4]">
                    {rule.code} ·{" "}
                    {rule.inventoryItem?.itemName ?? rule.inventoryItemId}
                  </div>
                </td>
                <td className="px-3 py-3 font-mono">
                  {rule.prefix}
                  {"#".repeat(Math.min(rule.padding, 8))}
                  {rule.suffix}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {rule.startNumber}–{rule.endNumber}
                </td>
                <td className="px-3 py-3 tabular-nums">{rule.nextNumber}</td>
                <td className="px-3 py-3">
                  <Status value={rule.status} />
                </td>
                <td className="px-3 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={rule.status !== "DRAFT" || activate.isPending}
                    onClick={() => {
                      if (requireSignature())
                        activate.mutate({ ruleId: rule.id });
                    }}
                  >
                    Activate
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.serialRules.length ? (
          <div className="p-6 text-center text-xs text-[#718096]">
            No serial rules have been created.
          </div>
        ) : null}
      </div>
      <form
        className="grid gap-3 rounded-xl border border-[#bfd8f5] bg-[#f4f9ff] p-4 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (requireSignature()) allocateMutation.mutate();
        }}
      >
        <div className="md:col-span-4">
          <h3 className="text-sm font-semibold text-[#203651]">
            Allocate serials to production
          </h3>
          <p className="text-[10px] text-[#718096]">
            Only the quantity entered here is allocated. The rule range and
            order quantity are enforced by the API.
          </p>
        </div>
        <Field label="Active rule *">
          <select
            required
            className={selectClass}
            value={allocate.ruleId}
            onChange={(event) =>
              setAllocate({ ...allocate, ruleId: event.target.value })
            }
          >
            <option value="">Select active rule</option>
            {data.serialRules
              .filter((rule) => rule.status === "ACTIVE")
              .map((rule) => (
                <option key={rule.id} value={rule.id}>
                  {rule.code} · next {rule.nextNumber}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Production order *">
          <select
            required
            className={selectClass}
            value={allocate.orderId}
            onChange={(event) =>
              setAllocate({
                ...allocate,
                orderId: event.target.value,
                orderLotId: "",
              })
            }
          >
            <option value="">Select order</option>
            {data.orders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} · target {quantity(order.plannedQuantity)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Production lot">
          <select
            className={selectClass}
            value={allocate.orderLotId}
            onChange={(event) =>
              setAllocate({ ...allocate, orderLotId: event.target.value })
            }
          >
            <option value="">Order level / only lot</option>
            {selectedOrder?.lots.map((lot) => (
              <option key={lot.id} value={lot.id}>
                {lot.lotNumber} · {quantity(lot.plannedQuantity)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Number of units *">
          <div className="flex gap-2">
            <Input
              required
              type="number"
              min="1"
              step="1"
              className={inputClass}
              value={allocate.quantity}
              onChange={(event) =>
                setAllocate({ ...allocate, quantity: event.target.value })
              }
            />
            <Button
              type="submit"
              size="sm"
              disabled={allocateMutation.isPending}
            >
              Allocate
            </Button>
          </div>
        </Field>
      </form>
    </div>
  );
}

function SerialQcWorkspace({
  orderId,
  selectedOrder,
  serials,
  pendingApprovals,
  common,
  signed,
  setSigned,
  requireSignature,
  invalidate,
}: CommonProps & {
  workspaceId: string;
  orderId: string;
  selectedOrder: ManufacturingPackagingOrderOption | null;
  serials: ManufacturingSerialRecord[];
  pendingApprovals: ManufacturingPendingSerialQcApproval[];
}) {
  const [rows, setRows] = useState<
    Record<
      string,
      {
        outcome: "" | "PASS" | "FAIL";
        parameter: string;
        actual: string;
        holdReason: string;
        pendingResults?: ManufacturingPendingSerialQcApproval["submission"][number]["results"];
      }
    >
  >({});
  const mutation = useMutation({
    mutationFn: () =>
      recordManufacturingSerialQc({
        ...common("serial-qc"),
        orderId,
        inspections: serials
          .filter((serial) => rows[serial.id]?.outcome)
          .map((serial) => {
            const row = rows[serial.id];
            const passed = row.outcome === "PASS";
            return {
              serialId: serial.id,
              passed,
              holdReason: passed ? null : row.holdReason,
              results: row.pendingResults ?? [
                {
                  parameterCode: row.parameter,
                  parameterName: row.parameter,
                  actualText: row.actual,
                  passed,
                },
              ],
            };
          }),
      }),
    onSuccess: (result) => {
      invalidate();
      if (result.approvalProgress && !result.approvalProgress.complete) {
        setSigned({
          ...signed,
          signature: "",
          reauthenticationPassword: "",
        });
        toast.success(
          `Serial QC inspection stage ${result.approvalProgress.completedStages} of ${result.approvalProgress.totalStages} recorded. An independent authorized user must submit the unchanged result for final approval.`,
        );
        return;
      }
      setRows({});
      toast.success("Serial-wise QC results posted.");
    },
    onError: (error) =>
      toast.error(errorText(error, "Could not post serial QC.")),
  });
  if (!orderId || !selectedOrder)
    return (
      <Empty icon={ScanBarcode} title="No production order selected">
        Select one production order to inspect its serials independently.
      </Empty>
    );
  return (
    <div className="grid gap-4">
      <SignedFields {...signed} onChange={setSigned} />
      {pendingApprovals.map((approval) => (
        <div
          key={approval.entityId}
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
        >
          <div>
            <div className="font-semibold">
              Independent serial QC approval pending
            </div>
            <div className="mt-0.5 text-[10px]">
              Inspector: {approval.inspectorName ?? "Recorded user"} · stage{" "}
              {approval.approvalProgress.completedStages} of{" "}
              {approval.approvalProgress.totalStages}. Final evidence must
              remain unchanged.
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const restored: typeof rows = {};
              for (const inspection of approval.submission) {
                const firstResult = inspection.results[0];
                restored[inspection.serialId] = {
                  outcome: inspection.passed ? "PASS" : "FAIL",
                  parameter: firstResult?.parameterCode ?? "",
                  actual:
                    firstResult?.actualText ??
                    (firstResult?.actualValue == null
                      ? ""
                      : String(firstResult.actualValue)),
                  holdReason: inspection.holdReason ?? "",
                  pendingResults: inspection.results,
                };
              }
              setRows(restored);
              setSigned({
                ...signed,
                date: approval.transactionDate.slice(0, 10),
                signature: "",
                reauthenticationPassword: "",
              });
              toast.success(
                "Pending serial QC evidence loaded unchanged for independent approval.",
              );
            }}
          >
            Load exact evidence
          </Button>
        </div>
      ))}
      {serials.length ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const selected = serials.filter(
              (serial) => rows[serial.id]?.outcome,
            );
            if (!selected.length)
              return toast.error(
                "Select PASS or FAIL for at least one serial.",
              );
            if (
              selected.some(
                (serial) =>
                  !rows[serial.id].parameter.trim() ||
                  !rows[serial.id].actual.trim() ||
                  (rows[serial.id].outcome === "FAIL" &&
                    !rows[serial.id].holdReason.trim()),
              )
            )
              return toast.error(
                "Parameter, actual result and failed-unit hold reason are required.",
              );
            if (requireSignature()) mutation.mutate();
          }}
          className="overflow-hidden rounded-xl border border-[#d8e5f2]"
        >
          <div className="flex items-center justify-between border-b border-[#dfe8f2] bg-[#f5f9fd] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                Finished-product serial inspection
              </h3>
              <p className="text-[10px] text-[#718096]">
                Each serial receives its own persisted inspection and result
                record.
              </p>
            </div>
            <Button size="sm" type="submit" disabled={mutation.isPending}>
              <Save className="h-4 w-4" />
              Post selected QC
            </Button>
          </div>
          <table className="w-full text-left text-[10px]">
            <thead className="bg-[#fbfcfe] uppercase text-[#64748b]">
              <tr>
                <th className="px-3 py-2">Serial</th>
                <th className="px-3 py-2">Current QC</th>
                <th className="px-3 py-2">Outcome *</th>
                <th className="px-3 py-2">Test parameter *</th>
                <th className="px-3 py-2">Actual result *</th>
                <th className="px-3 py-2">Failed-unit hold reason</th>
              </tr>
            </thead>
            <tbody>
              {serials.map((serial) => {
                const row = rows[serial.id] ?? {
                  outcome: "" as const,
                  parameter: "",
                  actual: "",
                  holdReason: "",
                };
                return (
                  <tr key={serial.id} className="border-t border-[#e7edf4]">
                    <td className="px-3 py-2.5 font-mono font-semibold">
                      {serial.serialNumber}
                    </td>
                    <td className="px-3 py-2.5">
                      <Status
                        value={
                          serial.qualityInspections[0]?.status ??
                          "NOT INSPECTED"
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        className={selectClass}
                        disabled={Boolean(row.pendingResults)}
                        value={row.outcome}
                        onChange={(event) =>
                          setRows({
                            ...rows,
                            [serial.id]: {
                              ...row,
                              outcome: event.target.value as
                                "" | "PASS" | "FAIL",
                            },
                          })
                        }
                      >
                        <option value="">Not posting</option>
                        <option value="PASS">PASS</option>
                        <option value="FAIL">FAIL</option>
                      </select>
                    </td>
                    <td className="px-3 py-2.5">
                      <Input
                        className={inputClass}
                        disabled={Boolean(row.pendingResults)}
                        value={row.parameter}
                        onChange={(event) =>
                          setRows({
                            ...rows,
                            [serial.id]: {
                              ...row,
                              parameter: event.target.value,
                            },
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Input
                        className={inputClass}
                        disabled={Boolean(row.pendingResults)}
                        value={row.actual}
                        onChange={(event) =>
                          setRows({
                            ...rows,
                            [serial.id]: { ...row, actual: event.target.value },
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Input
                        className={inputClass}
                        disabled={
                          row.outcome !== "FAIL" || Boolean(row.pendingResults)
                        }
                        value={row.holdReason}
                        onChange={(event) =>
                          setRows({
                            ...rows,
                            [serial.id]: {
                              ...row,
                              holdReason: event.target.value,
                            },
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </form>
      ) : (
        <Empty icon={ScanBarcode} title="No serials allocated">
          No allocated serials exist for this order. Allocate them from Batch
          and Serial Number Rules first.
        </Empty>
      )}
    </div>
  );
}

function PackagingExecutionWorkspace({
  view,
  orderId,
  selectedOrder,
  data,
  selected,
  common,
  signed,
  setSigned,
  requireSignature,
  invalidate,
}: CommonProps & {
  workspaceId: string;
  view: string;
  orderId: string;
  selectedOrder: ManufacturingPackagingOrderOption | null;
  data: ManufacturingSerialPackagingWorkspace;
  selected: ManufacturingPackagingOrderRecord | null;
}) {
  const [createForm, setCreateForm] = useState({
    lotId: "",
    configId: "",
    number: "",
    quantity: "",
    unit: "",
  });
  const [evidence, setEvidence] = useState("");
  const [reconciliation, setReconciliation] = useState<
    Record<
      string,
      { used: string; returned: string; rejected: string; destroyed: string }
    >
  >({});
  const [labels, setLabels] = useState<
    Record<
      string,
      { code: string; status: ManufacturingLabelStatus; reason: string }
    >
  >({});
  const [unit, setUnit] = useState<{
    code: string;
    level: ManufacturingPackageLevel;
    parentCode: string;
    serialId: string;
    quantity: string;
  }>({ code: "", level: "UNIT", parentCode: "", serialId: "", quantity: "1" });
  useEffect(() => {
    setCreateForm({
      lotId: "",
      configId: "",
      number: "",
      quantity: selectedOrder ? String(selectedOrder.plannedQuantity) : "",
      unit: selectedOrder?.unit ?? "",
    });
  }, [selectedOrder?.id]);
  useEffect(() => {
    setReconciliation(
      Object.fromEntries(
        (selected?.reconciliations ?? []).map((row) => [
          row.inventoryItemId,
          {
            used: String(row.usedQuantity),
            returned: String(row.returnedQuantity),
            rejected: String(row.rejectedQuantity),
            destroyed: String(row.destroyedQuantity),
          },
        ]),
      ),
    );
  }, [selected?.id, selected?.reconciledAt]);
  const refresh = (message: string) => {
    invalidate();
    toast.success(message);
  };
  const create = useMutation({
    mutationFn: () =>
      createManufacturingPackagingOrder({
        ...common("packaging-order"),
        orderId,
        orderLotId: createForm.lotId || null,
        packagingConfigurationId: createForm.configId,
        packagingOrderNumber: createForm.number || undefined,
        plannedQuantity: Number(createForm.quantity),
        unit: createForm.unit,
      }),
    onSuccess: ({ packagingOrder }) =>
      refresh(
        packagingOrder.status === "MATERIAL_SHORT"
          ? "Packaging order saved with the exact real-stock shortage. Reserve materials after stock arrives."
          : "Packaging order created.",
      ),
    onError: (error) =>
      toast.error(errorText(error, "Could not create packaging order.")),
  });
  const retryReservation = useMutation({
    mutationFn: (packagingOrderId: string) =>
      retryManufacturingPackagingMaterialReservation(
        packagingOrderId,
        common(`packaging-material-reserve-${packagingOrderId}`),
      ),
    onSuccess: ({ packagingOrder }) => {
      invalidate();
      if (packagingOrder.status === "MATERIAL_SHORT") {
        toast.error(
          "Packaging stock is still short. The refreshed exact shortage remains recorded.",
        );
      } else {
        toast.success(
          "All packaging materials were reserved atomically. The packaging order is ready in Draft.",
        );
      }
    },
    onError: (error) =>
      toast.error(
        errorText(error, "Packaging materials could not be reserved."),
      ),
  });
  const clearance = useMutation({
    mutationFn: () =>
      recordManufacturingPackagingLineClearance(selected!.id, {
        ...common("packaging-line-clearance"),
        evidenceReference: evidence,
      }),
    onSuccess: () => {
      refresh("Line-clearance evidence posted.");
      setEvidence("");
    },
    onError: (error) =>
      toast.error(errorText(error, "Could not post line clearance.")),
  });
  const reconcile = useMutation({
    mutationFn: () =>
      reconcileManufacturingPackaging(selected!.id, {
        ...common("packaging-reconciliation"),
        lines: selected!.packagingConfiguration.lines.map((component) => {
          const row = reconciliation[component.inventoryItemId];
          return {
            inventoryItemId: component.inventoryItemId,
            usedQuantity: Number(row.used),
            returnedQuantity: Number(row.returned),
            rejectedQuantity: Number(row.rejected),
            destroyedQuantity: Number(row.destroyed),
            unit: component.unit,
          };
        }),
      }),
    onSuccess: () =>
      refresh(
        "Packaging execution reconciled to posted issue and return transactions.",
      ),
    onError: (error) =>
      toast.error(errorText(error, "Could not reconcile packaging.")),
  });
  const labelMutation = useMutation({
    mutationFn: () =>
      registerManufacturingPackagingLabels(selected!.id, {
        ...common("packaging-labels"),
        labels: data.serials
          .filter((serial) => labels[serial.id]?.code.trim())
          .map((serial) => ({
            labelCode: labels[serial.id].code,
            serialId: serial.id,
            status: labels[serial.id].status,
            dispositionReason: labels[serial.id].reason || null,
          })),
      }),
    onSuccess: () => refresh("Label ledger updated."),
    onError: (error) =>
      toast.error(errorText(error, "Could not update labels.")),
  });
  const packageUnit = useMutation({
    mutationFn: () =>
      registerManufacturingPackageUnits(selected!.id, {
        ...common("package-aggregation"),
        units: [
          {
            code: unit.code,
            level: unit.level,
            parentCode: unit.parentCode || null,
            serialId: unit.serialId || null,
            quantity: Number(unit.quantity),
          },
        ],
      }),
    onSuccess: () => {
      refresh("Package hierarchy updated.");
      setUnit({
        code: "",
        level: "UNIT",
        parentCode: "",
        serialId: "",
        quantity: "1",
      });
    },
    onError: (error) =>
      toast.error(errorText(error, "Could not update package hierarchy.")),
  });
  const release = useMutation({
    mutationFn: () =>
      confirmManufacturingPackagingReleaseReadiness(
        selected!.id,
        common("packaging-release-readiness"),
      ),
    onSuccess: () => refresh("Packaging record is release-ready."),
    onError: (error) =>
      toast.error(errorText(error, "Release readiness failed.")),
  });
  const orderSerials = data.serials.filter(
    (serial) =>
      serial.orderId === selected?.orderId &&
      (!selected?.orderLotId || serial.orderLotId === selected.orderLotId),
  );

  if (view === "packaging-plan" || view === "packaging-order")
    return (
      <div className="grid gap-4">
        <SignedFields {...signed} onChange={setSigned} />
        <form
          className="grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-2 xl:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!orderId) return toast.error("Select a production order.");
            if (requireSignature()) create.mutate();
          }}
        >
          <div className="md:col-span-2 xl:col-span-3">
            <h3 className="text-sm font-semibold text-[#203651]">
              Create packaging plan / order
            </h3>
            <p className="text-[10px] text-[#718096]">
              The quantity must be entered by the user and must exactly match
              the selected production order or lot. Component requirements are
              calculated from the approved configuration using exact decimal
              quantities. When reservation is required, released packaging stock
              is reserved atomically (FEFO for lot-tracked items); the order is
              saved as Material Short if stock cannot yet be reserved; no
              partial or fake reservation is posted.
            </p>
          </div>
          <Field label="Production order *">
            <Input
              disabled
              className={inputClass}
              value={
                selectedOrder
                  ? `${selectedOrder.orderNumber} · ${selectedOrder.finishedProduct.itemName}`
                  : "Select an order above"
              }
            />
          </Field>
          <Field label="Production lot">
            <select
              className={selectClass}
              value={createForm.lotId}
              onChange={(event) => {
                const lotId = event.target.value;
                const lot = selectedOrder?.lots.find(
                  (candidate) => candidate.id === lotId,
                );
                setCreateForm({
                  ...createForm,
                  lotId,
                  quantity: String(
                    lot?.plannedQuantity ??
                      selectedOrder?.plannedQuantity ??
                      "",
                  ),
                  unit: selectedOrder?.unit ?? createForm.unit,
                });
              }}
            >
              <option value="">
                Order level — covers every production lot
              </option>
              {selectedOrder?.lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lotNumber} · planned {quantity(lot.plannedQuantity)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Approved packaging configuration *">
            <select
              required
              className={selectClass}
              value={createForm.configId}
              onChange={(event) =>
                setCreateForm({ ...createForm, configId: event.target.value })
              }
            >
              <option value="">Select approved configuration</option>
              {data.packagingConfigurations
                .filter(
                  (config) =>
                    !selectedOrder ||
                    config.inventoryItemId === selectedOrder.finishedProductId,
                )
                .map((config) => (
                  <option key={config.id} value={config.id}>
                    {config.code} v{config.versionNumber} · {config.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field
            label="Packaging order number"
            hint="Optional; generated only if left blank"
          >
            <Input
              className={inputClass}
              value={createForm.number}
              onChange={(event) =>
                setCreateForm({ ...createForm, number: event.target.value })
              }
            />
          </Field>
          <Field label="Planned quantity *">
            <Input
              required
              type="number"
              min="0.0001"
              step="0.0001"
              className={inputClass}
              value={createForm.quantity}
              onChange={(event) =>
                setCreateForm({ ...createForm, quantity: event.target.value })
              }
            />
          </Field>
          <Field label="Unit *">
            <Input
              required
              className={inputClass}
              value={createForm.unit}
              onChange={(event) =>
                setCreateForm({ ...createForm, unit: event.target.value })
              }
            />
          </Field>
          <div className="md:col-span-2 xl:col-span-3 flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={create.isPending || !selectedOrder}
            >
              <Plus className="h-4 w-4" />
              Create packaging order
            </Button>
          </div>
        </form>
        <PackagingRegister
          rows={data.packagingOrders}
          retryingId={retryReservation.variables ?? null}
          onRetry={(packagingOrderId) => {
            if (requireSignature()) retryReservation.mutate(packagingOrderId);
          }}
        />
      </div>
    );

  if (!selected)
    return (
      <Empty icon={PackageOpen} title="No packaging order selected">
        Create or select a real packaging order first.
      </Empty>
    );

  if (view === "batch-packaging-record-ebpr")
    return <EvidenceTimeline selected={selected} />;

  if (
    view === "packaging-line-clearance" ||
    view === "cleaning-and-line-clearance"
  )
    return (
      <div className="grid gap-4">
        <SignedFields {...signed} onChange={setSigned} />
        <form
          className="grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-[1fr_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!evidence.trim())
              return toast.error(
                "Line-clearance evidence reference is required.",
              );
            if (requireSignature()) clearance.mutate();
          }}
        >
          <Field
            label="Line-clearance evidence reference *"
            hint="Enter the real checklist/document/photo reference used on the floor."
          >
            <Input
              className={inputClass}
              required
              value={evidence}
              onChange={(event) => setEvidence(event.target.value)}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" size="sm" disabled={clearance.isPending}>
              <ClipboardCheck className="h-4 w-4" />
              Post clearance
            </Button>
          </div>
        </form>
        <EvidenceTimeline selected={selected} />
      </div>
    );

  if (["packaging-execution", "packaging-reconciliation"].includes(view))
    return (
      <div className="grid gap-4">
        <SignedFields {...signed} onChange={setSigned} />
        <form
          className="overflow-hidden rounded-xl border border-[#d8e5f2]"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              selected.packagingConfiguration.lines.some((component) => {
                const row = reconciliation[component.inventoryItemId];
                return (
                  !row ||
                  [row.used, row.returned, row.rejected, row.destroyed].some(
                    (value) => value === "",
                  )
                );
              })
            )
              return toast.error(
                "Enter every actual reconciliation quantity. Use 0 where applicable.",
              );
            if (requireSignature()) reconcile.mutate();
          }}
        >
          <div className="flex justify-between border-b border-[#dfe8f2] bg-[#f5f9fd] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                Packaging execution and material reconciliation
              </h3>
              <p className="text-[10px] text-[#718096]">
                Issued quantities are read from posted PACKAGING_ISSUE
                transactions; returned values must match posted PACKAGING_RETURN
                transactions.
              </p>
            </div>
            <Button type="submit" size="sm" disabled={reconcile.isPending}>
              Reconcile actuals
            </Button>
          </div>
          <table className="w-full text-left text-[10px]">
            <thead className="bg-[#fbfcfe] uppercase text-[#64748b]">
              <tr>
                <th className="px-3 py-2">Configured component</th>
                <th className="px-3 py-2">Posted issued</th>
                <th className="px-3 py-2">Used *</th>
                <th className="px-3 py-2">Returned *</th>
                <th className="px-3 py-2">Rejected *</th>
                <th className="px-3 py-2">Destroyed *</th>
                <th className="px-3 py-2">Unit</th>
              </tr>
            </thead>
            <tbody>
              {selected.packagingConfiguration.lines.map((component) => {
                const posted = selected.reconciliations.find(
                  (entry) =>
                    entry.inventoryItemId === component.inventoryItemId,
                );
                const row = reconciliation[component.inventoryItemId] ?? {
                  used: "",
                  returned: "",
                  rejected: "",
                  destroyed: "",
                };
                const set = (patch: Partial<typeof row>) =>
                  setReconciliation({
                    ...reconciliation,
                    [component.inventoryItemId]: { ...row, ...patch },
                  });
                return (
                  <tr key={component.id} className="border-t border-[#e7edf4]">
                    <td className="px-3 py-2.5">
                      <b>{component.inventoryItem.itemName}</b>
                      <div className="text-[#8290a4]">
                        {component.inventoryItem.itemCode} · configured{" "}
                        {quantity(component.quantity)} per finished unit
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {posted
                        ? quantity(posted.issuedQuantity)
                        : "Pending reconciliation"}
                    </td>
                    {(
                      ["used", "returned", "rejected", "destroyed"] as const
                    ).map((field) => (
                      <td key={field} className="px-3 py-2.5">
                        <Input
                          required
                          type="number"
                          min="0"
                          step="0.0001"
                          className={inputClass}
                          value={row[field]}
                          onChange={(event) =>
                            set({ [field]: event.target.value })
                          }
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2.5">{component.unit}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </form>
      </div>
    );

  if (["coding-and-printing", "label-control", "serialisation"].includes(view))
    return (
      <div className="grid gap-4">
        <SignedFields {...signed} onChange={setSigned} />
        {orderSerials.length ? (
          <form
            className="overflow-hidden rounded-xl border border-[#d8e5f2]"
            onSubmit={(event) => {
              event.preventDefault();
              const rows = orderSerials.filter((serial) =>
                labels[serial.id]?.code.trim(),
              );
              if (!rows.length)
                return toast.error("Enter at least one real label code.");
              if (requireSignature()) labelMutation.mutate();
            }}
          >
            <div className="flex justify-between border-b border-[#dfe8f2] bg-[#f5f9fd] px-4 py-3">
              <div>
                <h3 className="text-sm font-semibold text-[#203651]">
                  Label ledger and serialisation
                </h3>
                <p className="text-[10px] text-[#718096]">
                  One used label can be linked to each finished-product serial.
                  Returned, voided and destroyed labels retain disposition
                  evidence.
                </p>
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={labelMutation.isPending}
              >
                Post label ledger
              </Button>
            </div>
            <table className="w-full text-left text-[10px]">
              <thead className="bg-[#fbfcfe] uppercase text-[#64748b]">
                <tr>
                  <th className="px-3 py-2">Finished serial</th>
                  <th className="px-3 py-2">QC</th>
                  <th className="px-3 py-2">Label code *</th>
                  <th className="px-3 py-2">Disposition</th>
                  <th className="px-3 py-2">Reason when not used</th>
                </tr>
              </thead>
              <tbody>
                {orderSerials.map((serial) => {
                  const row = labels[serial.id] ?? {
                    code: "",
                    status: "USED" as const,
                    reason: "",
                  };
                  const set = (patch: Partial<typeof row>) =>
                    setLabels({ ...labels, [serial.id]: { ...row, ...patch } });
                  return (
                    <tr key={serial.id} className="border-t border-[#e7edf4]">
                      <td className="px-3 py-2.5 font-mono font-semibold">
                        {serial.serialNumber}
                      </td>
                      <td className="px-3 py-2.5">
                        <Status
                          value={
                            serial.qualityInspections[0]?.status ??
                            "NOT INSPECTED"
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          className={inputClass}
                          value={row.code}
                          onChange={(event) =>
                            set({ code: event.target.value })
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <select
                          className={selectClass}
                          value={row.status}
                          onChange={(event) =>
                            set({
                              status: event.target
                                .value as ManufacturingLabelStatus,
                            })
                          }
                        >
                          {[
                            "USED",
                            "ISSUED",
                            "RETURNED",
                            "VOIDED",
                            "DESTROYED",
                          ].map((status) => (
                            <option key={status}>{status}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2.5">
                        <Input
                          disabled={
                            !(
                              ["RETURNED", "VOIDED", "DESTROYED"] as string[]
                            ).includes(row.status)
                          }
                          className={inputClass}
                          value={row.reason}
                          onChange={(event) =>
                            set({ reason: event.target.value })
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </form>
        ) : (
          <Empty icon={ScanBarcode} title="No serials on this order">
            Allocate serials to this packaging order to see them here.
          </Empty>
        )}
        <LabelLedger rows={selected.labels} />
      </div>
    );

  if (
    [
      "parent-child-aggregation",
      "carton-and-shipper-packing",
      "palletisation",
    ].includes(view)
  )
    return (
      <div className="grid gap-4">
        <SignedFields {...signed} onChange={setSigned} />
        <form
          className="grid gap-3 rounded-xl border border-[#d8e5f2] bg-[#f9fbfe] p-4 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!unit.code.trim())
              return toast.error("Package code is required.");
            if (unit.level === "UNIT" && !unit.serialId)
              return toast.error("UNIT package requires a serial.");
            if (requireSignature()) packageUnit.mutate();
          }}
        >
          <Field label="Package code *">
            <Input
              className={inputClass}
              value={unit.code}
              onChange={(event) =>
                setUnit({ ...unit, code: event.target.value })
              }
            />
          </Field>
          <Field label="Level *">
            <select
              className={selectClass}
              value={unit.level}
              onChange={(event) =>
                setUnit({
                  ...unit,
                  level: event.target.value as ManufacturingPackageLevel,
                  serialId: event.target.value === "UNIT" ? unit.serialId : "",
                })
              }
            >
              {["UNIT", "CARTON", "SHIPPER", "PALLET"].map((level) => (
                <option key={level}>{level}</option>
              ))}
            </select>
          </Field>
          <Field label="Parent package code">
            <select
              className={selectClass}
              value={unit.parentCode}
              onChange={(event) =>
                setUnit({ ...unit, parentCode: event.target.value })
              }
            >
              <option value="">No parent</option>
              {selected.packageUnits
                .filter((row) => row.level !== "UNIT")
                .map((row) => (
                  <option key={row.id} value={row.code}>
                    {row.code} · {row.level}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Finished serial">
            <select
              disabled={unit.level !== "UNIT"}
              className={selectClass}
              value={unit.serialId}
              onChange={(event) =>
                setUnit({ ...unit, serialId: event.target.value })
              }
            >
              <option value="">Select serial</option>
              {orderSerials.map((serial) => (
                <option key={serial.id} value={serial.id}>
                  {serial.serialNumber}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity">
            <div className="flex gap-2">
              <Input
                className={inputClass}
                type="number"
                min="0.0001"
                step="0.0001"
                value={unit.quantity}
                onChange={(event) =>
                  setUnit({ ...unit, quantity: event.target.value })
                }
              />
              <Button type="submit" size="sm">
                Add
              </Button>
            </div>
          </Field>
        </form>
        <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
          <table className="w-full text-left text-[10px]">
            <thead className="bg-[#f3f7fb] uppercase text-[#64748b]">
              <tr>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Level</th>
                <th className="px-3 py-2">Serial</th>
                <th className="px-3 py-2">Parent</th>
                <th className="px-3 py-2">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {selected.packageUnits.map((row) => (
                <tr key={row.id} className="border-t border-[#e7edf4]">
                  <td className="px-3 py-2.5 font-mono font-semibold">
                    {row.code}
                  </td>
                  <td className="px-3 py-2.5">
                    <Status value={row.level} />
                  </td>
                  <td className="px-3 py-2.5">
                    {row.serial?.serialNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {selected.packageUnits.find(
                      (candidate) => candidate.id === row.parentId,
                    )?.code ?? "—"}
                  </td>
                  <td className="px-3 py-2.5">{quantity(row.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!selected.packageUnits.length ? (
            <div className="p-6 text-center text-xs text-[#718096]">
              No package hierarchy has been posted.
            </div>
          ) : null}
        </div>
      </div>
    );

  return (
    <div className="grid gap-4">
      <SignedFields {...signed} onChange={setSigned} />
      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["Line clearance", Boolean(selected.lineClearedAt)],
          ["Material reconciliation", Boolean(selected.reconciledAt)],
          [
            "Serial QC",
            orderSerials.length > 0 &&
              orderSerials.every(
                (serial) => serial.qualityInspections[0]?.status === "PASSED",
              ),
          ],
          [
            "Label control",
            orderSerials.length > 0 &&
              orderSerials.every((serial) =>
                selected.labels.some(
                  (label) =>
                    label.serialId === serial.id && label.status === "USED",
                ),
              ),
          ],
          [
            "Aggregation",
            orderSerials.length > 0 &&
              orderSerials.every((serial) =>
                selected.packageUnits.some(
                  (row) => row.serialId === serial.id && row.level === "UNIT",
                ),
              ),
          ],
        ].map(([label, ready]) => (
          <div
            key={String(label)}
            className={`rounded-xl border p-3 ${ready ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}
          >
            <div className="text-[10px] font-semibold text-[#52647d]">
              {label}
            </div>
            <div
              className={`mt-2 text-sm font-bold ${ready ? "text-emerald-700" : "text-amber-700"}`}
            >
              {ready ? "Ready" : "Pending"}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={release.isPending || selected.status === "RELEASE_READY"}
          onClick={() => {
            if (requireSignature()) release.mutate();
          }}
        >
          <ShieldCheck className="h-4 w-4" />
          Confirm release readiness
        </Button>
      </div>
      <EvidenceTimeline selected={selected} />
    </div>
  );
}

function PackagingRegister({
  rows,
  retryingId,
  onRetry,
}: {
  rows: ManufacturingPackagingOrderRecord[];
  retryingId: string | null;
  onRetry: (packagingOrderId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
      <table className="w-full text-left text-[10px]">
        <thead className="bg-[#f3f7fb] uppercase text-[#64748b]">
          <tr>
            <th className="px-3 py-2.5">Packaging order</th>
            <th className="px-3 py-2.5">Parent production order</th>
            <th className="px-3 py-2.5">Approved configuration</th>
            <th className="px-3 py-2.5">Planned</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              <tr className="border-t border-[#e3ebf3]">
                <td className="px-3 py-3 font-semibold">
                  {row.packagingOrderNumber}
                </td>
                <td className="px-3 py-3">
                  {row.order.orderNumber}
                  <div className="text-[#8290a4]">
                    {row.orderLot?.lotNumber ?? "Order level (all lots)"}
                  </div>
                </td>
                <td className="px-3 py-3">
                  {row.packagingConfiguration.code} v
                  {row.packagingConfiguration.versionNumber}
                </td>
                <td className="px-3 py-3 tabular-nums">
                  {quantity(row.plannedQuantity)} {row.unit}
                </td>
                <td className="px-3 py-3">
                  <Status value={row.status} />
                </td>
                <td className="px-3 py-3 text-right">
                  {row.status === "MATERIAL_SHORT" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={retryingId === row.id}
                      onClick={() => onRetry(row.id)}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${retryingId === row.id ? "animate-spin" : ""}`}
                      />
                      Reserve materials
                    </Button>
                  ) : (
                    <span className="text-[#94a3b8]">—</span>
                  )}
                </td>
              </tr>
              {row.status === "MATERIAL_SHORT" &&
              row.materialShortage?.lines.length ? (
                <tr className="border-t border-[#f5cfaa] bg-[#fff8ed]">
                  <td colSpan={6} className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-[10px] text-[#8a5714]">
                      {row.materialShortage.lines.map((line) => (
                        <span key={line.orderMaterialId}>
                          <strong>
                            {line.itemCode} · {line.itemName}
                          </strong>
                          : need {line.requiredQuantity}, available{" "}
                          {line.availableQuantity}, short{" "}
                          {line.shortageQuantity} {line.unit}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
      {!rows.length ? (
        <div className="p-6 text-center text-xs text-[#718096]">
          No packaging plans or orders have been created.
        </div>
      ) : null}
    </div>
  );
}

function LabelLedger({
  rows,
}: {
  rows: ManufacturingPackagingOrderRecord["labels"];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
      <div className="border-b border-[#dfe8f2] bg-[#f5f9fd] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#203651]">
          Posted label ledger
        </h3>
        <p className="text-[10px] text-[#718096]">
          Every used, returned, voided or destroyed label remains visible.
        </p>
      </div>
      <table className="w-full text-left text-[10px]">
        <thead className="bg-[#fbfcfe] uppercase text-[#64748b]">
          <tr>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Finished serial</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Disposition evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t border-[#e7edf4]">
              <td className="px-3 py-2.5 font-mono font-semibold">
                {row.labelCode}
              </td>
              <td className="px-3 py-2.5 font-mono">
                {row.serial?.serialNumber ?? "—"}
              </td>
              <td className="px-3 py-2.5">
                <Status value={row.status} />
              </td>
              <td className="px-3 py-2.5">{row.dispositionReason ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length ? (
        <div className="p-6 text-center text-xs text-[#718096]">
          No labels have been posted.
        </div>
      ) : null}
    </div>
  );
}

function EvidenceTimeline({
  selected,
}: {
  selected: ManufacturingPackagingOrderRecord;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#d8e5f2]">
      <div className="border-b border-[#dfe8f2] bg-[#f5f9fd] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#203651]">
          Electronic Batch Packaging Record (eBPR)
        </h3>
        <p className="text-[10px] text-[#718096]">
          Immutable, signed event sequence for this packaging order.
        </p>
      </div>
      {selected.events.length ? (
        selected.events.map((event) => (
          <div
            key={event.id}
            className="flex items-start gap-3 border-t border-[#e7edf4] px-4 py-3 text-[10px]"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#e8f2ff] font-bold text-[#2478df]">
              {event.sequence}
            </span>
            <div className="flex-1">
              <div className="font-semibold text-[#203651]">
                {event.eventType.replaceAll("_", " ")}
              </div>
              <div className="text-[#8290a4]">
                {formatDateTime(event.transactionDate)}
                {event.evidenceReference
                  ? ` · Evidence ${event.evidenceReference}`
                  : ""}
              </div>
              {event.note ? (
                <div className="mt-1 text-[#52647d]">{event.note}</div>
              ) : null}
            </div>
          </div>
        ))
      ) : (
        <div className="p-6 text-center text-xs text-[#718096]">
          No execution evidence has been posted.
        </div>
      )}
    </div>
  );
}
