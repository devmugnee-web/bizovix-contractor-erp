"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FlaskConical,
  PackageSearch,
  ScanLine,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { ManufacturingEmptyState } from "@/components/shared/manufacturing-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isMaterialExceptionView,
  ManufacturingMaterialExceptionsWorkspace,
} from "@/features/screens/manufacturing-material-exceptions-workspace";
import { formatDate } from "@/lib/format";
import {
  approveMaterialRequisition,
  createMaterialRequisition,
  getMaterialLotAllocation,
  inspectIncomingMaterialLot,
  listIncomingMaterialLots,
  listMaterialHandlingVerifiers,
  listMaterialRequisitions,
  listMaterialSourceMovements,
  recordMaterialHandlingEvidence,
  registerIncomingMaterialLot,
  submitMaterialRequisition,
} from "@/services/manufacturing-materials.service";
import {
  getManufacturingOrder,
  listManufacturingLocations,
  listManufacturingOrders,
  performManufacturingOrderAction,
} from "@/services/manufacturing.service";
import type { WarehouseRecord } from "@/services/warehouse.service";
import type {
  MaterialHandlingStage,
  MaterialLotAllocationMethod,
  MaterialRequisitionLineRecord,
} from "@/types/manufacturing-materials";

type ItemOption = {
  id: string;
  itemCode: string;
  itemName: string;
  unit: string;
};

export interface ManufacturingMaterialsWorkspaceProps {
  workspaceId?: string;
  view: string;
  title: string;
  items: ItemOption[];
  warehouses: WarehouseRecord[];
}

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function key(prefix: string) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function message(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function quantity(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-BD", { maximumFractionDigits: 4 }).format(
    value,
  );
}

function formatMoney(value: string | number) {
  return `BDT ${new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`;
}

export function materialHandlingStageForView(
  view: string,
): MaterialHandlingStage {
  if (view === "material-staging") return "STAGED";
  if (view === "dispensing-verification") return "VERIFIED";
  if (view === "unused-material-return") return "RETURN_SCAN";
  if (["material-issue", "weighing-and-dispensing"].includes(view))
    return "ISSUE_SCAN";
  throw new Error(`Unsupported material-handling route: ${view}`);
}

export function buildMaterialPostingLines(
  lines: MaterialRequisitionLineRecord[],
  quantities: Record<string, string>,
  orderLotId: string,
  kind: "ISSUE_MATERIALS" | "RETURN_MATERIALS",
) {
  const candidates = lines.filter((line) => {
    if (line.lotDisposition !== "STAGING") return false;
    return (
      kind === "ISSUE_MATERIALS" ||
      materialReturnableQuantity(line, orderLotId) > 0
    );
  });
  return candidates
    .map((line) => {
      const requested = quantity(quantities[line.id]);
      const maximum =
        kind === "ISSUE_MATERIALS"
          ? line.quantity
          : materialReturnableQuantity(line, orderLotId);
      if (requested > maximum + 0.0000001)
        throw new Error(
          `${line.itemName} exceeds the ${kind === "ISSUE_MATERIALS" ? "staged reserved" : "issued-but-not-returned"} balance (${formatQuantity(maximum)} ${line.unit}).`,
        );
      return {
        orderMaterialId: line.orderMaterialId,
        inventoryItemId: line.inventoryItemId,
        inventoryLotId: line.inventoryLotId,
        orderLotId,
        quantity: requested,
        unit: line.unit,
      };
    })
    .filter((line) => line.quantity > 0);
}

export function materialReturnableQuantity(
  line: MaterialRequisitionLineRecord,
  orderLotId: string,
) {
  return (
    line.lotBalances.find((balance) => balance.orderLotId === orderLotId)
      ?.returnableQuantity ?? 0
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#718096]">
      {children}
    </label>
  );
}

function NativeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 w-full rounded-xl border border-[#d3dfec] bg-white px-3 text-xs text-[#203651] outline-none focus:border-[#7db4f2] focus:ring-2 focus:ring-[#dbeafe] ${props.className ?? ""}`}
    />
  );
}

function StatusPill({ value }: { value: string }) {
  const tone =
    value === "RELEASED" || value === "APPROVED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : value === "REJECTED" || value === "CANCELLED"
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : value === "QUARANTINE" || value === "SUBMITTED"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-slate-50 text-slate-600 ring-slate-200";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[9px] font-bold tracking-wide ring-1 ${tone}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

function Empty({
  children,
  icon = PackageSearch,
  title = "Nothing to show yet",
}: {
  children: React.ReactNode;
  icon?: LucideIcon;
  title?: string;
}) {
  return <ManufacturingEmptyState compact icon={icon} title={title} description={children} />;
}

function IncomingMaterialWorkspace({
  workspaceId,
}: Omit<ManufacturingMaterialsWorkspaceProps, "view" | "title">) {
  const client = useQueryClient();
  const [sourceId, setSourceId] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [sourceReference, setSourceReference] = useState("");
  const [receiptQuantity, setReceiptQuantity] = useState("");
  const [manufacturedAt, setManufacturedAt] = useState("");
  const [retestDueAt, setRetestDueAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [decision, setDecision] = useState<"RELEASED" | "REJECTED">("RELEASED");
  const [sampleQuantity, setSampleQuantity] = useState("1");
  const [parameterName, setParameterName] = useState(
    "Visual and specification check",
  );
  const [actualResult, setActualResult] = useState("");
  const [resultPassed, setResultPassed] = useState(true);
  const [reason, setReason] = useState("");

  const sources = useQuery({
    queryKey: ["manufacturing-materials", "source-movements", workspaceId],
    queryFn: () => listMaterialSourceMovements({ workspaceId: workspaceId! }),
    enabled: Boolean(workspaceId),
  });
  const lots = useQuery({
    queryKey: ["manufacturing-materials", "incoming-lots", workspaceId],
    queryFn: () => listIncomingMaterialLots({ workspaceId: workspaceId! }),
    enabled: Boolean(workspaceId),
  });
  const source = sources.data?.find((row) => row.id === sourceId);
  const selectedLot = lots.data?.find((row) => row.id === selectedLotId);
  const quarantineLots =
    lots.data?.filter((row) => row.status === "QUARANTINE") ?? [];

  useEffect(() => {
    if (!source) return;
    setSourceReference(
      source.referenceNo ?? `${source.transactionType}:${source.transactionId}`,
    );
    setReceiptQuantity(String(source.unregisteredQuantity));
  }, [source]);

  const register = useMutation({
    mutationFn: () => {
      if (!workspaceId || !source)
        throw new Error("Select a real incoming stock movement first.");
      if (
        !lotNumber.trim() ||
        !sourceReference.trim() ||
        quantity(receiptQuantity) <= 0
      )
        throw new Error(
          "Lot number, source reference and a positive quantity are required.",
        );
      return registerIncomingMaterialLot({
        workspaceId,
        inventoryItemId: source.inventoryItemId,
        warehouseId: source.warehouseId,
        sourceStockMovementId: source.id,
        sourceReference: sourceReference.trim(),
        lotNumber: lotNumber.trim(),
        quantity: quantity(receiptQuantity),
        unit: source.unit,
        manufacturedAt: manufacturedAt || null,
        retestDueAt: retestDueAt || null,
        expiresAt: expiresAt || null,
        transactionDate: today(),
        idempotencyKey: key("incoming-lot"),
      });
    },
    onSuccess: ({ lot }) => {
      toast.success(`${lot.lotNumber} registered in quarantine.`);
      setLotNumber("");
      setManufacturedAt("");
      setRetestDueAt("");
      setExpiresAt("");
      setSelectedLotId(lot.id);
      void client.invalidateQueries({ queryKey: ["manufacturing-materials"] });
    },
    onError: (error) =>
      toast.error(message(error, "Incoming lot could not be registered.")),
  });

  const inspect = useMutation({
    mutationFn: () => {
      if (!workspaceId || !selectedLot)
        throw new Error("Select a quarantined incoming lot.");
      const held = selectedLot.holdQuantity;
      return inspectIncomingMaterialLot(selectedLot.id, {
        workspaceId,
        decision,
        sampleQuantity: quantity(sampleQuantity),
        acceptedQuantity: decision === "RELEASED" ? held : 0,
        rejectedQuantity: decision === "REJECTED" ? held : 0,
        results: [
          {
            parameterCode:
              parameterName
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "_")
                .replace(/(^_|_$)/g, "") || "ACTUAL_RESULT",
            parameterName: parameterName.trim(),
            actualText: actualResult.trim(),
            passed: resultPassed,
          },
        ],
        reason: reason.trim() || null,
        transactionDate: today(),
        idempotencyKey: key("incoming-qc"),
      });
    },
    onSuccess: ({ lot }) => {
      toast.success(
        `${lot.lotNumber} is now ${lot.status.toLowerCase().replaceAll("_", " ")}.`,
      );
      setSelectedLotId("");
      setActualResult("");
      setReason("");
      void client.invalidateQueries({ queryKey: ["manufacturing-materials"] });
    },
    onError: (error) =>
      toast.error(message(error, "Incoming inspection could not be posted.")),
  });

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
      <section className="rounded-2xl border border-[#d5e2ef] bg-white p-4 shadow-[0_8px_20px_rgba(30,64,175,0.04)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ArrowDownToLine className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#203651]">
              Register incoming source lot
            </h3>
            <p className="text-[11px] text-[#718096]">
              Links a real stock receipt to a quarantined manufacturing lot. No
              stock is invented.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <FieldLabel>Source stock receipt</FieldLabel>
            <NativeSelect
              value={sourceId}
              onChange={(event) => setSourceId(event.target.value)}
            >
              <option value="">Select non-voided IN movement</option>
              {sources.data
                ?.filter((row) => row.unregisteredQuantity > 0)
                .map((row) => (
                  <option key={row.id} value={row.id}>
                    {formatDate(row.transactionDate)} · {row.itemCode} ·{" "}
                    {row.warehouseCode} ·{" "}
                    {formatQuantity(row.unregisteredQuantity)} {row.unit}
                  </option>
                ))}
            </NativeSelect>
          </div>
          {source ? (
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-[11px]">
              <div>
                <span className="text-[#718096]">Material</span>
                <div className="mt-0.5 font-semibold text-[#203651]">
                  {source.itemName}
                </div>
              </div>
              <div>
                <span className="text-[#718096]">Warehouse</span>
                <div className="mt-0.5 font-semibold text-[#203651]">
                  {source.warehouseName}
                </div>
              </div>
              <div>
                <span className="text-[#718096]">Receipt quantity</span>
                <div className="mt-0.5 font-semibold text-[#203651]">
                  {formatQuantity(source.quantity)} {source.unit}
                </div>
              </div>
              <div>
                <span className="text-[#718096]">Unit cost</span>
                <div className="mt-0.5 font-semibold text-[#203651]">
                  {formatMoney(source.unitCost)}
                </div>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel>Lot number</FieldLabel>
              <Input
                value={lotNumber}
                onChange={(event) => setLotNumber(event.target.value)}
                placeholder="Supplier / internal lot"
              />
            </div>
            <div>
              <FieldLabel>Retest due date</FieldLabel>
              <AppDateInput
                aria-label="Retest due date"
                value={retestDueAt}
                onChange={(value) => setRetestDueAt(value)}
              />
            </div>
            <div>
              <FieldLabel>Quantity to register</FieldLabel>
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={receiptQuantity}
                onChange={(event) => setReceiptQuantity(event.target.value)}
              />
            </div>
          </div>
          <div>
            <FieldLabel>Source reference</FieldLabel>
            <Input
              value={sourceReference}
              onChange={(event) => setSourceReference(event.target.value)}
              placeholder="GRN, supplier batch or receipt reference"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Manufactured date</FieldLabel>
              <AppDateInput
                aria-label="Manufactured date"
                value={manufacturedAt}
                onChange={(value) => setManufacturedAt(value)}
              />
            </div>
            <div>
              <FieldLabel>Expiry date</FieldLabel>
              <AppDateInput
                aria-label="Expiry date"
                value={expiresAt}
                onChange={(value) => setExpiresAt(value)}
              />
            </div>
          </div>
          <Button
            className="w-full"
            onClick={() => register.mutate()}
            disabled={register.isPending || !source}
          >
            {register.isPending ? "Registering…" : "Register lot in quarantine"}
          </Button>
        </div>
      </section>

      <section className="rounded-2xl border border-[#d5e2ef] bg-white p-4 shadow-[0_8px_20px_rgba(30,64,175,0.04)]">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <FlaskConical className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#203651]">
              Incoming inspection and disposition
            </h3>
            <p className="text-[11px] text-[#718096]">
              Records actual inspection evidence before a full RELEASED or
              REJECTED decision.
            </p>
          </div>
        </div>
        {quarantineLots.length ? (
          <div className="space-y-3">
            <div>
              <FieldLabel>Quarantined lot</FieldLabel>
              <NativeSelect
                value={selectedLotId}
                onChange={(event) => setSelectedLotId(event.target.value)}
              >
                <option value="">Select lot awaiting QC</option>
                {quarantineLots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.lotNumber} · {lot.itemName} ·{" "}
                    {formatQuantity(lot.holdQuantity)} {lot.unit}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel>Final decision</FieldLabel>
                <NativeSelect
                  value={decision}
                  onChange={(event) => {
                    const next = event.target.value as "RELEASED" | "REJECTED";
                    setDecision(next);
                    setResultPassed(next === "RELEASED");
                  }}
                >
                  <option value="RELEASED">Release full lot</option>
                  <option value="REJECTED">Reject full lot</option>
                </NativeSelect>
              </div>
              <div>
                <FieldLabel>Sample quantity</FieldLabel>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  value={sampleQuantity}
                  onChange={(event) => setSampleQuantity(event.target.value)}
                />
              </div>
            </div>
            <div>
              <FieldLabel>Inspection parameter</FieldLabel>
              <Input
                value={parameterName}
                onChange={(event) => setParameterName(event.target.value)}
              />
            </div>
            <div>
              <FieldLabel>Actual result</FieldLabel>
              <Input
                value={actualResult}
                onChange={(event) => setActualResult(event.target.value)}
                placeholder="Record the actual observed result"
              />
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[#d8e3ef] bg-[#f8fbfe] px-3 py-2 text-xs text-[#203651]">
              <input
                type="checkbox"
                checked={resultPassed}
                onChange={(event) => setResultPassed(event.target.checked)}
              />
              Actual result passed specification
            </label>
            {decision === "REJECTED" ? (
              <div>
                <FieldLabel>Rejection reason</FieldLabel>
                <Input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Required controlled reason"
                />
              </div>
            ) : null}
            <Button
              className="w-full"
              onClick={() => inspect.mutate()}
              disabled={inspect.isPending || !selectedLot}
            >
              {inspect.isPending
                ? "Posting inspection…"
                : decision === "RELEASED"
                  ? "Release inspected lot"
                  : "Reject inspected lot"}
            </Button>
          </div>
        ) : (
          <Empty>No quarantined lots are awaiting incoming inspection.</Empty>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#d5e2ef] bg-white xl:col-span-2">
        <div className="flex items-center justify-between border-b border-[#e1e9f2] px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-[#203651]">
              Incoming lot register
            </h3>
            <p className="text-[10px] text-[#718096]">
              Only persisted, source-linked lots are shown.
            </p>
          </div>
          <span className="text-[10px] font-semibold text-[#718096]">
            {lots.data?.length ?? 0} lots
          </span>
        </div>
        {lots.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wider text-[#66768c]">
                <tr>
                  <th className="px-4 py-3">Lot / material</th>
                  <th className="px-3 py-3">Warehouse</th>
                  <th className="px-3 py-3 text-right">Received</th>
                  <th className="px-3 py-3 text-right">Available</th>
                  <th className="px-3 py-3 text-right">Reserved</th>
                  <th className="px-3 py-3">Expiry</th>
                  <th className="px-3 py-3">Retest due</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {lots.data.map((lot) => (
                  <tr key={lot.id} className="border-t border-[#e6edf5]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#203651]">
                        {lot.lotNumber}
                      </div>
                      <div className="text-[10px] text-[#718096]">
                        {lot.itemCode} · {lot.itemName}
                      </div>
                    </td>
                    <td className="px-3 py-3">{lot.warehouseName}</td>
                    <td className="px-3 py-3 text-right">
                      {formatQuantity(lot.receivedQuantity)} {lot.unit}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-emerald-700">
                      {formatQuantity(lot.availableQuantity)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatQuantity(lot.reservedQuantity)}
                    </td>
                    <td className="px-3 py-3">
                      {lot.expiresAt ? formatDate(lot.expiresAt) : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {lot.retestDueAt ? formatDate(lot.retestDueAt) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill value={lot.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-4">
            <Empty>No source-linked incoming lots have been registered.</Empty>
          </div>
        )}
      </section>
    </div>
  );
}

function AllocationWorkspace({
  workspaceId,
  items,
  warehouses,
  defaultMethod,
}: Omit<ManufacturingMaterialsWorkspaceProps, "view" | "title"> & {
  defaultMethod: MaterialLotAllocationMethod;
}) {
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [requiredQuantity, setRequiredQuantity] = useState("10");
  const [method, setMethod] =
    useState<MaterialLotAllocationMethod>(defaultMethod);
  const result = useQuery({
    queryKey: [
      "manufacturing-materials",
      "allocation",
      workspaceId,
      inventoryItemId,
      warehouseId,
      method,
      requiredQuantity,
    ],
    queryFn: () =>
      getMaterialLotAllocation({
        workspaceId: workspaceId!,
        inventoryItemId,
        warehouseId,
        method,
        requiredQuantity: quantity(requiredQuantity),
        asOf: today(),
      }),
    enabled: Boolean(
      workspaceId &&
      inventoryItemId &&
      warehouseId &&
      quantity(requiredQuantity) > 0,
    ),
  });
  return (
    <section className="overflow-hidden rounded-2xl border border-[#d5e2ef] bg-white shadow-[0_8px_20px_rgba(30,64,175,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e9f2] bg-white px-4 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#203651]">
              Controlled source-lot allocation
            </h3>
            <p className="text-[11px] text-[#718096]">
              Released and unexpired lots only; available stock is reduced by
              existing reservations.
            </p>
          </div>
        </div>
        <div className="flex rounded-xl border border-[#cfddec] bg-white p-1">
          {(["FIFO", "FEFO"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMethod(value)}
              className={`rounded-lg px-4 py-2 text-xs font-semibold ${method === value ? "bg-blue-600 text-white" : "text-[#53647b]"}`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3 border-b border-[#e1e9f2] p-4 md:grid-cols-[1fr_1fr_180px]">
        <div>
          <FieldLabel>Material</FieldLabel>
          <NativeSelect
            value={inventoryItemId}
            onChange={(event) => setInventoryItemId(event.target.value)}
          >
            <option value="">Select inventory material</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemCode} · {item.itemName}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <FieldLabel>Source warehouse</FieldLabel>
          <NativeSelect
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
          >
            <option value="">Select warehouse</option>
            {warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.code} · {warehouse.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <FieldLabel>Required quantity</FieldLabel>
          <Input
            type="number"
            min="0.0001"
            step="0.0001"
            value={requiredQuantity}
            onChange={(event) => setRequiredQuantity(event.target.value)}
          />
        </div>
      </div>
      {result.data ? (
        <>
          <div className="grid grid-cols-3 gap-px bg-[#dce7f2]">
            <div className="bg-white p-4">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#718096]">
                Required
              </div>
              <div className="mt-1 text-lg font-semibold text-[#203651]">
                {formatQuantity(result.data.requiredQuantity)}
              </div>
            </div>
            <div className="bg-emerald-50/40 p-4">
              <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-700">
                Allocated
              </div>
              <div className="mt-1 text-lg font-semibold text-emerald-700">
                {formatQuantity(result.data.allocatedQuantity)}
              </div>
            </div>
            <div
              className={
                result.data.shortageQuantity > 0
                  ? "bg-rose-50 p-4"
                  : "bg-white p-4"
              }
            >
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#718096]">
                Shortage
              </div>
              <div
                className={`mt-1 text-lg font-semibold ${result.data.shortageQuantity > 0 ? "text-rose-700" : "text-[#203651]"}`}
              >
                {formatQuantity(result.data.shortageQuantity)}
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wider text-[#66768c]">
                <tr>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-3 py-3">Lot</th>
                  <th className="px-3 py-3">Received</th>
                  <th className="px-3 py-3">Expiry</th>
                  <th className="px-3 py-3 text-right">Allocatable</th>
                  <th className="px-4 py-3 text-right">Suggested</th>
                </tr>
              </thead>
              <tbody>
                {result.data.allocations.map((lot, index) => (
                  <tr key={lot.id} className="border-t border-[#e6edf5]">
                    <td className="px-4 py-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 font-bold text-blue-600">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-[#203651]">
                        {lot.lotNumber}
                      </div>
                      <div className="text-[10px] text-[#718096]">
                        {lot.itemName}
                      </div>
                    </td>
                    <td className="px-3 py-3">{formatDate(lot.receivedAt)}</td>
                    <td className="px-3 py-3">
                      {lot.expiresAt ? formatDate(lot.expiresAt) : "No expiry"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {formatQuantity(lot.allocatableQuantity)} {lot.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-blue-700">
                      {formatQuantity(lot.suggestedQuantity)} {lot.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="p-4">
          <Empty>
            Select a material, warehouse and required quantity to calculate the
            real {method} allocation.
          </Empty>
        </div>
      )}
    </section>
  );
}

function RequisitionWorkspace({
  workspaceId,
}: Pick<ManufacturingMaterialsWorkspaceProps, "workspaceId">) {
  const client = useQueryClient();
  const [orderId, setOrderId] = useState("");
  const [lineLots, setLineLots] = useState<Record<string, string>>({});
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>(
    {},
  );
  const [note, setNote] = useState("");
  const orders = useQuery({
    queryKey: ["manufacturing", "material-orders", workspaceId],
    queryFn: () => listManufacturingOrders({ workspaceId: workspaceId! }),
    enabled: Boolean(workspaceId),
  });
  const order = useQuery({
    queryKey: ["manufacturing", "order", orderId],
    queryFn: () => getManufacturingOrder(orderId),
    enabled: Boolean(orderId),
  });
  const lots = useQuery({
    queryKey: [
      "manufacturing-materials",
      "released-lots",
      workspaceId,
      order.data?.sourceWarehouseId,
    ],
    queryFn: () =>
      listIncomingMaterialLots({
        workspaceId: workspaceId!,
        warehouseId: order.data!.sourceWarehouseId,
        status: "RELEASED",
      }),
    enabled: Boolean(workspaceId && order.data?.sourceWarehouseId),
  });
  const requisitions = useQuery({
    queryKey: ["manufacturing-materials", "requisitions", workspaceId],
    queryFn: () => listMaterialRequisitions({ workspaceId: workspaceId! }),
    enabled: Boolean(workspaceId),
  });
  const eligibleOrders =
    orders.data?.filter((row) =>
      ["APPROVED", "RESERVED", "ISSUED", "IN_PRODUCTION"].includes(row.status),
    ) ?? [];

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const material of order.data?.materials ?? [])
      next[material.id] = String(
        Math.max(
          0,
          material.plannedQuantity -
            material.issuedQuantity -
            material.reservedQuantity,
        ),
      );
    setLineQuantities(next);
    setLineLots({});
  }, [order.data?.id]);

  const create = useMutation({
    mutationFn: () => {
      if (!workspaceId || !order.data)
        throw new Error("Select an approved production order.");
      const lines = order.data.materials
        .map((material) => ({
          orderMaterialId: material.id,
          inventoryLotId: lineLots[material.id],
          quantity: quantity(lineQuantities[material.id]),
          unit: material.unit,
        }))
        .filter((line) => line.inventoryLotId && line.quantity > 0);
      if (!lines.length)
        throw new Error(
          "Select a released source lot and positive quantity for at least one material.",
        );
      return createMaterialRequisition({
        workspaceId,
        orderId: order.data.id,
        transactionDate: today(),
        idempotencyKey: key("material-requisition"),
        lines,
        note: note.trim() || null,
      });
    },
    onSuccess: ({ requisition }) => {
      toast.success(`${requisition.requisitionNumber} created as draft.`);
      setNote("");
      void client.invalidateQueries({ queryKey: ["manufacturing-materials"] });
    },
    onError: (error) =>
      toast.error(message(error, "Material requisition could not be created.")),
  });
  const transition = useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: "submit" | "approve";
    }) => {
      if (!workspaceId) throw new Error("Workspace is required.");
      const input = {
        workspaceId,
        transactionDate: today(),
        idempotencyKey: key(`requisition-${action}`),
      };
      return action === "submit"
        ? submitMaterialRequisition(id, input)
        : approveMaterialRequisition(id, input);
    },
    onSuccess: ({ requisition }) => {
      toast.success(
        `${requisition.requisitionNumber} is ${requisition.status.toLowerCase()}.`,
      );
      void client.invalidateQueries({ queryKey: ["manufacturing-materials"] });
      void client.invalidateQueries({ queryKey: ["manufacturing"] });
    },
    onError: (error) =>
      toast.error(message(error, "Requisition status could not be updated.")),
  });

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="overflow-hidden rounded-2xl border border-[#d5e2ef] bg-white">
        <div className="border-b border-[#e1e9f2] bg-white px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                Numbered material requisition
              </h3>
              <p className="text-[11px] text-[#718096]">
                Selects released source lots; stock is reserved only after
                independent approval.
              </p>
            </div>
          </div>
        </div>
        <div className="p-4">
          <div>
            <FieldLabel>Production order</FieldLabel>
            <NativeSelect
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Select approved production order</option>
              {eligibleOrders.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.orderNumber} · {row.finishedProductName} · {row.status}
                </option>
              ))}
            </NativeSelect>
          </div>
          {order.data ? (
            <div className="mt-4 overflow-hidden rounded-xl border border-[#d8e3ef]">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wider text-[#66768c]">
                  <tr>
                    <th className="px-3 py-3">Required material</th>
                    <th className="px-3 py-3">Released source lot</th>
                    <th className="px-3 py-3 text-right">Requisition qty</th>
                  </tr>
                </thead>
                <tbody>
                  {order.data.materials.map((material) => {
                    const candidates =
                      lots.data?.filter(
                        (lot) =>
                          lot.inventoryItemId === material.inventoryItemId &&
                          lot.allocatableQuantity > 0,
                      ) ?? [];
                    const outstanding = Math.max(
                      0,
                      material.plannedQuantity -
                        material.issuedQuantity -
                        material.reservedQuantity,
                    );
                    return (
                      <tr
                        key={material.id}
                        className="border-t border-[#e6edf5]"
                      >
                        <td className="px-3 py-3">
                          <div className="font-semibold text-[#203651]">
                            {material.itemName}
                          </div>
                          <div className="text-[10px] text-[#718096]">
                            Need {formatQuantity(outstanding)} {material.unit}
                          </div>
                        </td>
                        <td className="min-w-56 px-3 py-3">
                          <NativeSelect
                            value={lineLots[material.id] ?? ""}
                            onChange={(event) =>
                              setLineLots((current) => ({
                                ...current,
                                [material.id]: event.target.value,
                              }))
                            }
                          >
                            <option value="">Select released lot</option>
                            {candidates.map((lot) => (
                              <option key={lot.id} value={lot.id}>
                                {lot.lotNumber} · free{" "}
                                {formatQuantity(lot.allocatableQuantity)} · exp{" "}
                                {lot.expiresAt ? formatDate(lot.expiresAt) : "N/A"}
                              </option>
                            ))}
                          </NativeSelect>
                        </td>
                        <td className="w-40 px-3 py-3">
                          <Input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={lineQuantities[material.id] ?? ""}
                            onChange={(event) =>
                              setLineQuantities((current) => ({
                                ...current,
                                [material.id]: event.target.value,
                              }))
                            }
                            className="text-right"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4">
              <Empty>
                Select an eligible production order to build its real material
                lines.
              </Empty>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <FieldLabel>Requisition note</FieldLabel>
              <Input
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Purpose, shift or controlled instruction"
              />
            </div>
            <Button
              onClick={() => create.mutate()}
              disabled={create.isPending || !order.data}
            >
              {create.isPending ? "Creating…" : "Create draft requisition"}
            </Button>
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-[#d5e2ef] bg-white">
        <div className="border-b border-[#e1e9f2] px-4 py-4">
          <h3 className="text-sm font-semibold text-[#203651]">
            Requisition approval queue
          </h3>
          <p className="text-[11px] text-[#718096]">
            Submit creates no stock effect. Approval atomically reserves each
            selected lot.
          </p>
        </div>
        <div className="max-h-[620px] space-y-2 overflow-y-auto p-3">
          {requisitions.data?.length ? (
            requisitions.data.map((row) => (
              <div
                key={row.id}
                className="rounded-xl border border-[#dbe5f0] p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-[#203651]">
                      {row.requisitionNumber}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#718096]">
                      {row.orderNumber} · {formatDate(row.transactionDate)}
                    </div>
                  </div>
                  <StatusPill value={row.status} />
                </div>
                <div className="mt-2 space-y-1">
                  {row.lines.map((line) => (
                    <div
                      key={line.id}
                      className="flex justify-between gap-3 text-[10px]"
                    >
                      <span className="truncate text-[#53647b]">
                        {line.itemName} · {line.lotNumber}
                      </span>
                      <span className="shrink-0 font-semibold text-[#203651]">
                        {formatQuantity(line.quantity)} {line.unit}
                      </span>
                    </div>
                  ))}
                </div>
                {row.status === "DRAFT" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() =>
                      transition.mutate({ id: row.id, action: "submit" })
                    }
                  >
                    Submit for approval
                  </Button>
                ) : null}
                {row.status === "SUBMITTED" ? (
                  <Button
                    size="sm"
                    className="mt-3 w-full"
                    onClick={() =>
                      transition.mutate({ id: row.id, action: "approve" })
                    }
                  >
                    <ShieldCheck className="h-4 w-4" />
                    Approve & reserve lots
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <Empty>No material requisitions have been created.</Empty>
          )}
        </div>
      </section>
    </div>
  );
}

function MaterialHandlingWorkspace({
  workspaceId,
  title,
  view,
}: Pick<
  ManufacturingMaterialsWorkspaceProps,
  "workspaceId" | "title" | "view"
>) {
  const client = useQueryClient();
  const likelyReturn = view.includes("return");
  const [requisitionId, setRequisitionId] = useState("");
  const [orderLotId, setOrderLotId] = useState("");
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>(
    {},
  );
  const [stage, setStage] = useState<MaterialHandlingStage>(() =>
    materialHandlingStageForView(view),
  );
  const [barcode, setBarcode] = useState("");
  const [verifierUserId, setVerifierUserId] = useState("");
  const [linkedTransactionId, setLinkedTransactionId] = useState("");
  const [evidenceLineId, setEvidenceLineId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [handlingIdempotencyKey, setHandlingIdempotencyKey] = useState(() =>
    key("handling-staged"),
  );
  const requisitionsKey = [
    "manufacturing-materials",
    "requisitions",
    workspaceId,
    "APPROVED",
  ] as const;
  const requisitions = useQuery({
    queryKey: requisitionsKey,
    queryFn: () =>
      listMaterialRequisitions({
        workspaceId: workspaceId!,
        status: "APPROVED",
      }),
    enabled: Boolean(workspaceId),
  });
  const selected = requisitions.data?.find((row) => row.id === requisitionId);
  const order = useQuery({
    queryKey: ["manufacturing", "order", selected?.orderId],
    queryFn: () => getManufacturingOrder(selected!.orderId),
    enabled: Boolean(selected?.orderId),
  });
  const locations = useQuery({
    queryKey: ["manufacturing", "locations", workspaceId],
    queryFn: () =>
      listManufacturingLocations({ workspaceId: workspaceId!, active: true }),
    enabled: Boolean(workspaceId),
  });
  const verifiers = useQuery({
    queryKey: ["manufacturing-materials", "verifiers", workspaceId],
    queryFn: () => listMaterialHandlingVerifiers(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const evidenceLine = selected?.lines.find(
    (line) => line.id === evidenceLineId,
  );
  const selectedLineSignature = selected?.lines
    .map(
      (line) =>
        `${line.id}:${line.inventoryLotId}:${line.quantity}:${line.lotDisposition}:${line.lotBalances.map((balance) => `${balance.orderLotId}:${balance.returnableQuantity}`).join(",")}`,
    )
    .join("|");
  const desiredSourceDisposition = stage === "STAGED" ? "RELEASED" : "STAGING";
  const eligibleEvidenceLines = useMemo(
    () =>
      selected?.lines.filter(
        (line) =>
          line.lotDisposition === desiredSourceDisposition &&
          (stage === "RETURN_SCAN"
            ? materialReturnableQuantity(line, orderLotId) > 0
            : stage === "ISSUE_SCAN"
              ? (line.lotBalances.find(
                  (balance) => balance.orderLotId === orderLotId,
                )?.issuedQuantity ?? 0) > 0
              : line.quantity > 0),
      ) ?? [],
    [orderLotId, selected?.lines, stage],
  );
  const postingLines = useMemo(
    () =>
      selected?.lines.filter(
        (line) =>
          line.lotDisposition === "STAGING" &&
          (likelyReturn
            ? materialReturnableQuantity(line, orderLotId) > 0
            : line.quantity > 0),
      ) ?? [],
    [likelyReturn, orderLotId, selected?.lines],
  );

  useEffect(() => {
    setOrderLotId(order.data?.lots[0]?.id ?? "");
  }, [selected?.id, order.data?.id]);

  useEffect(() => {
    setLineQuantities(
      Object.fromEntries(
        (selected?.lines ?? []).map((line) => [
          line.id,
          String(
            likelyReturn
              ? materialReturnableQuantity(line, orderLotId)
              : line.quantity,
          ),
        ]),
      ),
    );
    const preferred =
      selected?.lines.find(
        (line) =>
          (materialHandlingStageForView(view) === "RETURN_SCAN"
            ? materialReturnableQuantity(line, orderLotId) > 0
            : line.quantity > 0) &&
          line.lotDisposition ===
            (materialHandlingStageForView(view) === "STAGED"
              ? "RELEASED"
              : "STAGING"),
      ) ?? eligibleEvidenceLines[0];
    setEvidenceLineId(preferred?.id ?? "");
    setBarcode(preferred?.lotNumber ?? "");
  }, [
    eligibleEvidenceLines,
    likelyReturn,
    orderLotId,
    selected?.id,
    selectedLineSignature,
    view,
  ]);

  useEffect(() => {
    const requestedStage = materialHandlingStageForView(view);
    setStage(requestedStage);
  }, [view]);

  useEffect(() => {
    const preferred =
      eligibleEvidenceLines.find((line) => line.id === evidenceLineId) ??
      eligibleEvidenceLines[0];
    if (preferred && preferred.id !== evidenceLineId) {
      setEvidenceLineId(preferred.id);
      setBarcode(preferred.lotNumber ?? "");
    }
  }, [eligibleEvidenceLines, evidenceLineId]);

  useEffect(() => {
    const expectedDisposition =
      stage === "STAGED" || stage === "VERIFIED"
        ? "STAGING"
        : stage === "ISSUE_SCAN"
          ? "WIP"
          : "STAGING";
    const current = locations.data?.find(
      (location) => location.id === locationId,
    );
    if (
      current?.disposition === expectedDisposition &&
      (stage !== "STAGED" ||
        !evidenceLine ||
        current.warehouseId === selected?.warehouseId)
    )
      return;
    const preferred = locations.data?.find(
      (location) =>
        location.disposition === expectedDisposition &&
        (stage !== "STAGED" ||
          !evidenceLine ||
          location.warehouseId === selected?.warehouseId),
    );
    setLocationId(preferred?.id ?? "");
  }, [evidenceLine, locationId, locations.data, selected?.warehouseId, stage]);

  useEffect(() => {
    setHandlingIdempotencyKey(key(`handling-${stage.toLowerCase()}`));
  }, [
    barcode,
    evidenceLineId,
    lineQuantities,
    linkedTransactionId,
    locationId,
    orderLotId,
    stage,
    verifierUserId,
  ]);

  const postStock = useMutation({
    mutationFn: async (kind: "ISSUE_MATERIALS" | "RETURN_MATERIALS") => {
      if (!selected || !orderLotId)
        throw new Error("Select an approved requisition and production lot.");
      const lines = buildMaterialPostingLines(
        selected.lines,
        lineQuantities,
        orderLotId,
        kind,
      );
      if (!lines.length)
        throw new Error(
          kind === "ISSUE_MATERIALS"
            ? "Stage and verify a reserved lot, then enter a positive staged-lot issue quantity."
            : "No posted issued-but-not-returned staged-lot balance is available for this production lot.",
        );
      return performManufacturingOrderAction(selected.orderId, {
        kind,
        transactionDate: today(),
        idempotencyKey: key(kind.toLowerCase()),
        lines,
        payload: { orderLotId },
        note: `${selected.requisitionNumber} · ${title}`,
      });
    },
    onSuccess: (result) => {
      const transactionId = result.transactionIds[0] ?? "";
      setLinkedTransactionId(transactionId);
      toast.success(
        `${result.action.kind.replaceAll("_", " ")} posted atomically.`,
      );
      void client.invalidateQueries({ queryKey: ["manufacturing"] });
      void client.invalidateQueries({ queryKey: ["manufacturing-materials"] });
    },
    onError: (error) =>
      toast.error(message(error, "Lot-specific stock posting failed.")),
  });
  const evidence = useMutation({
    mutationFn: () => {
      if (
        !workspaceId ||
        !selected ||
        !evidenceLine ||
        !orderLotId ||
        !barcode.trim() ||
        !locationId
      )
        throw new Error(
          "Approved requisition line, production lot, scanned source lot and location are required.",
        );
      return recordMaterialHandlingEvidence({
        workspaceId,
        requisitionId: selected.id,
        requisitionLineId: evidenceLine.id,
        orderLotId,
        stage,
        barcode: barcode.trim(),
        quantity:
          stage === "STAGED" ? quantity(lineQuantities[evidenceLine.id]) : null,
        locationId,
        verifierUserId: verifierUserId.trim() || null,
        transactionId: ["ISSUE_SCAN", "RETURN_SCAN"].includes(stage)
          ? linkedTransactionId || null
          : null,
        transactionDate: today(),
        idempotencyKey: handlingIdempotencyKey,
      });
    },
    onSuccess: async (result) => {
      await client.invalidateQueries({
        queryKey: ["manufacturing-materials", "requisitions", workspaceId],
      });
      void client.invalidateQueries({ queryKey: ["manufacturing"] });
      const refreshed = await listMaterialRequisitions({
        workspaceId: workspaceId!,
        status: "APPROVED",
      });
      client.setQueryData(requisitionsKey, refreshed);
      if (result.stagedRequisitionLineId) {
        const stagedLine = refreshed
          .find((row) => row.id === selected?.id)
          ?.lines.find((line) => line.id === result.stagedRequisitionLineId);
        setEvidenceLineId(result.stagedRequisitionLineId);
        setBarcode(stagedLine?.lotNumber ?? "");
        setStage("VERIFIED");
        setLocationId(result.stagedLocationId ?? "");
      }
      setHandlingIdempotencyKey(key(`handling-${stage.toLowerCase()}`));
      toast.success(
        result.transaction
          ? `${result.transaction.transactionNumber} posted; reserved stock is now at staging.`
          : `${stage.replaceAll("_", " ")} evidence recorded.`,
      );
    },
    onError: (error) =>
      toast.error(message(error, "Handling evidence could not be recorded.")),
  });
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
      <section className="overflow-hidden rounded-2xl border border-[#d5e2ef] bg-white">
        <div className="border-b border-[#e1e9f2] bg-white px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <ScanLine className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                Lot-specific material issue and return
              </h3>
              <p className="text-[11px] text-[#718096]">
                Uses the approved source-lot reservation and existing atomic
                stock + balanced journal posting.
              </p>
            </div>
          </div>
        </div>
        <div className="space-y-4 p-4">
          <div>
            <FieldLabel>Approved material requisition</FieldLabel>
            <NativeSelect
              value={requisitionId}
              onChange={(event) => setRequisitionId(event.target.value)}
            >
              <option value="">Select approved requisition</option>
              {requisitions.data?.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.requisitionNumber} · {row.orderNumber}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Production lot / batch</FieldLabel>
            <NativeSelect
              value={orderLotId}
              onChange={(event) => setOrderLotId(event.target.value)}
              disabled={!order.data}
            >
              <option value="">Select production lot</option>
              {order.data?.lots.map((lot) => (
                <option key={lot.id} value={lot.id}>
                  {lot.lotNumber} · planned{" "}
                  {formatQuantity(lot.plannedQuantity)}
                </option>
              ))}
            </NativeSelect>
          </div>
          {selected ? (
            <div className="overflow-hidden rounded-xl border border-[#d8e3ef]">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wider text-[#66768c]">
                  <tr>
                    <th className="px-3 py-3">
                      Reserved material / source lot
                    </th>
                    <th className="px-3 py-3 text-right">Posting qty</th>
                  </tr>
                </thead>
                <tbody>
                  {postingLines.map((line) => (
                    <tr key={line.id} className="border-t border-[#e6edf5]">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#203651]">
                          {line.itemName}
                        </div>
                        <div className="text-[10px] text-[#718096]">
                          Lot {line.lotNumber} · reserved{" "}
                          {formatQuantity(
                            likelyReturn
                              ? materialReturnableQuantity(line, orderLotId)
                              : line.quantity,
                          )}{" "}
                          {line.unit}
                        </div>
                        <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-blue-700">
                          {line.lotDisposition ?? "Unmapped"} /{" "}
                          {line.lotLocationCode ?? "No location"}
                        </div>
                      </td>
                      <td className="w-44 px-3 py-3">
                        <Input
                          type="number"
                          min="0"
                          step="0.0001"
                          max={
                            likelyReturn
                              ? materialReturnableQuantity(line, orderLotId)
                              : line.quantity
                          }
                          value={lineQuantities[line.id] ?? ""}
                          onChange={(event) =>
                            setLineQuantities((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                          className="text-right"
                        />
                      </td>
                    </tr>
                  ))}
                  {!postingLines.length ? (
                    <tr className="border-t border-[#e6edf5]">
                      <td
                        colSpan={2}
                        className="px-3 py-8 text-center text-xs text-[#718096]"
                      >
                        {likelyReturn
                          ? "No posted issued-but-not-returned staged lot exists for this production lot."
                          : "No staged reserved balance is available for material issue."}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>
              Select an approved requisition to load reserved source lots.
            </Empty>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              onClick={() => postStock.mutate("ISSUE_MATERIALS")}
              disabled={
                postStock.isPending ||
                !selected ||
                (!likelyReturn && !postingLines.length)
              }
            >
              <ArrowUpFromLine className="h-4 w-4" />
              Post material issue
            </Button>
            <Button
              variant={likelyReturn ? "default" : "outline"}
              onClick={() => postStock.mutate("RETURN_MATERIALS")}
              disabled={
                postStock.isPending ||
                !selected ||
                (likelyReturn && !postingLines.length)
              }
            >
              <ArrowDownToLine className="h-4 w-4" />
              Post unused return to staging
            </Button>
          </div>
        </div>
      </section>
      <section className="rounded-2xl border border-[#d5e2ef] bg-white p-4">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#203651]">
              Controlled staging, verification and scan
            </h3>
            <p className="text-[11px] text-[#718096]">
              STAGED posts a same-warehouse location transfer; later controls
              retain the exact staged child-lot lineage.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <FieldLabel>Reserved material / source lot</FieldLabel>
            <NativeSelect
              value={evidenceLineId}
              onChange={(event) => {
                const id = event.target.value;
                setEvidenceLineId(id);
                setBarcode(
                  selected?.lines.find((line) => line.id === id)?.lotNumber ??
                    "",
                );
              }}
            >
              <option value="">
                Select exact {desiredSourceDisposition.toLowerCase()} lot
              </option>
              {eligibleEvidenceLines.map((line) => (
                <option key={line.id} value={line.id}>
                  {line.itemName} - {line.lotNumber} ({line.lotLocationCode})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Manufacturing location</FieldLabel>
            <NativeSelect
              value={locationId}
              onChange={(event) => setLocationId(event.target.value)}
            >
              <option value="">Select the exact controlled location</option>
              {locations.data
                ?.filter((location) => {
                  const disposition =
                    stage === "STAGED" || stage === "VERIFIED"
                      ? "STAGING"
                      : stage === "ISSUE_SCAN"
                        ? "WIP"
                        : "STAGING";
                  return (
                    location.disposition === disposition &&
                    (stage !== "STAGED" ||
                      location.warehouseId === selected?.warehouseId)
                  );
                })
                .map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.code} - {location.name} ({location.disposition})
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Evidence stage</FieldLabel>
            <NativeSelect
              value={stage}
              onChange={(event) =>
                setStage(event.target.value as MaterialHandlingStage)
              }
            >
              <option value="STAGED">Staged</option>
              <option value="VERIFIED">Verified</option>
              <option value="ISSUE_SCAN">Issue scan</option>
              <option value="RETURN_SCAN">Return scan</option>
            </NativeSelect>
          </div>
          <div>
            <FieldLabel>Scanned code</FieldLabel>
            <Input
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              placeholder="Scan or enter requisition / container barcode"
            />
          </div>
          {stage === "STAGED" ? (
            <div>
              <FieldLabel>Reserved quantity to stage</FieldLabel>
              <Input
                type="number"
                min="0.0001"
                step="0.0001"
                max={evidenceLine?.quantity}
                value={
                  evidenceLine ? (lineQuantities[evidenceLine.id] ?? "") : ""
                }
                onChange={(event) => {
                  if (!evidenceLine) return;
                  setLineQuantities((current) => ({
                    ...current,
                    [evidenceLine.id]: event.target.value,
                  }));
                }}
              />
              <p className="mt-1 text-[10px] leading-4 text-[#718096]">
                Moves only this reserved quantity into a traceable child lot;
                warehouse stock and GL value remain unchanged.
              </p>
            </div>
          ) : null}
          {stage === "VERIFIED" ? (
            <div>
              <FieldLabel>Independent workspace verifier</FieldLabel>
              <NativeSelect
                value={verifierUserId}
                onChange={(event) => setVerifierUserId(event.target.value)}
              >
                <option value="">Select a different workspace member</option>
                {verifiers.data?.map((verifier) => (
                  <option key={verifier.id} value={verifier.id}>
                    {verifier.name} ({verifier.membershipRole})
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}
          {["ISSUE_SCAN", "RETURN_SCAN"].includes(stage) ? (
            <div>
              <FieldLabel>Posted transaction ID</FieldLabel>
              <Input
                value={linkedTransactionId}
                onChange={(event) => setLinkedTransactionId(event.target.value)}
                placeholder="Auto-filled after issue / return posting"
              />
            </div>
          ) : null}
          <Button
            className="w-full"
            variant="outline"
            onClick={() => evidence.mutate()}
            disabled={evidence.isPending || !selected}
          >
            <CheckCircle2 className="h-4 w-4" />
            {stage === "STAGED"
              ? "Post staging transfer"
              : "Record controlled evidence"}
          </Button>
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-800">
            Staging moves the reserved lot between locations inside one
            warehouse with no stock movement or journal. Material issue then
            posts from that staged reserved lot to WIP with the normal balanced
            journal. Unused material returns to the same staged child lot and
            STAGING location; inspection/re-release is a separate controlled
            step.
          </div>
        </div>
      </section>
    </div>
  );
}

const INCOMING_VIEWS = new Set([
  "incoming-material-sampling",
  "qc-sample-management",
  "test-result-entry",
  "material-release-or-rejection",
]);
const REQUISITION_VIEWS = new Set([
  "material-reservation",
  "material-requisition",
]);
const ALLOCATION_VIEWS = new Set(["batch-lot-allocation", "fefo-allocation"]);

export function isManufacturingMaterialsOperationalView(
  section: string,
  view: string,
) {
  return (
    (section === "materials" && view !== "destruction-approval") ||
    (section === "quality" && INCOMING_VIEWS.has(view))
  );
}

export function ManufacturingMaterialsWorkspace(
  props: ManufacturingMaterialsWorkspaceProps,
) {
  const { view, title } = props;
  const body = INCOMING_VIEWS.has(view) ? (
    <IncomingMaterialWorkspace
      workspaceId={props.workspaceId}
      items={props.items}
      warehouses={props.warehouses}
    />
  ) : REQUISITION_VIEWS.has(view) ? (
    <RequisitionWorkspace workspaceId={props.workspaceId} />
  ) : ALLOCATION_VIEWS.has(view) ? (
    <AllocationWorkspace
      workspaceId={props.workspaceId}
      items={props.items}
      warehouses={props.warehouses}
      defaultMethod={view === "fefo-allocation" ? "FEFO" : "FIFO"}
    />
  ) : isMaterialExceptionView(view) ? (
    <ManufacturingMaterialExceptionsWorkspace
      workspaceId={props.workspaceId}
      view={view}
      title={title}
    />
  ) : (
    <MaterialHandlingWorkspace
      workspaceId={props.workspaceId}
      title={title}
      view={view}
    />
  );
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-[#cfdeef] bg-[#f8fbfe] p-3 shadow-[0_6px_20px_rgba(30,64,175,0.04)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#7a8ba1]">
            Materials & dispensing · operational workflow
          </div>
          <h2 className="mt-0.5 text-base font-semibold text-[#203651]">
            {title}
          </h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          Real persisted records only
        </span>
      </div>
      {body}
    </div>
  );
}
