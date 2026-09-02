"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CalendarClock,
  ClipboardCheck,
  RefreshCw,
  Replace,
  ShieldAlert,
  Trash2,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { ManufacturingEmptyState } from "@/components/shared/manufacturing-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import {
  createMaterialException,
  decideMaterialException,
  getMaterialControlView,
  retestManufacturingInventoryLot,
} from "@/services/manufacturing-material-exceptions.service";
import type { MaterialExceptionKind } from "@/types/manufacturing-material-exceptions";

interface Props {
  workspaceId?: string;
  view: string;
  title: string;
}

const ROUTE_KIND: Record<string, MaterialExceptionKind | "RECONCILIATION"> = {
  "additional-material-issue": "ADDITIONAL_ISSUE",
  "material-consumption": "RECONCILIATION",
  "material-reconciliation": "RECONCILIATION",
  "material-substitution": "SUBSTITUTION",
  "stock-status-transfer": "STATUS_TRANSFER",
  "rejected-material-and-destruction": "DESTRUCTION",
};

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function key(prefix: string) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatQuantity(value: number | string) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(Number(value) || 0);
}

function isSelectableStatusDestination(
  sourceDisposition: string | null,
  destinationDisposition: string,
) {
  if (!sourceDisposition || ["REJECTED", "SCRAP"].includes(sourceDisposition))
    return false;
  if (destinationDisposition === "SCRAP") return false;
  if (sourceDisposition === destinationDisposition) return true;
  return (
    sourceDisposition === "RELEASED" &&
    ["QC_HOLD", "REJECTED"].includes(destinationDisposition)
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

function Pill({ value }: { value: string }) {
  const tone =
    value === "APPROVED" || value === "RECONCILED"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : value === "REJECTED" || value === "UNRECONCILED"
        ? "bg-rose-50 text-rose-700 ring-rose-200"
        : "bg-amber-50 text-amber-700 ring-amber-200";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-wide ring-1 ${tone}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function isMaterialExceptionView(view: string) {
  return Object.hasOwn(ROUTE_KIND, view);
}

function ReconciliationTable({
  order,
  consumptionOnly,
}: {
  order:
    | Awaited<ReturnType<typeof getMaterialControlView>>["orders"][number]
    | undefined;
  consumptionOnly: boolean;
}) {
  if (!order)
    return (
      <ManufacturingEmptyState
        icon={ClipboardList}
        title="No production order selected"
        description="Select a real production order to load its posted material balances."
      />
    );
  const totals = order.materials.reduce(
    (sum, row) => ({
      expected: sum.expected + row.expectedQuantity,
      issued: sum.issued + row.issuedQuantity,
      returned: sum.returned + row.returnedQuantity,
      consumed: sum.consumed + row.consumedQuantity,
      scrapped: sum.scrapped + row.scrappedQuantity,
      unaccounted: sum.unaccounted + row.unaccountedQuantity,
    }),
    {
      expected: 0,
      issued: 0,
      returned: 0,
      consumed: 0,
      scrapped: 0,
      unaccounted: 0,
    },
  );
  return (
    <div className="overflow-hidden rounded-xl border border-[#d8e3ef] bg-white">
      <table className="w-full text-left text-[11px]">
        <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wider text-[#66768c]">
          <tr>
            <th className="px-3 py-3">Material</th>
            <th className="px-3 py-3 text-right">Expected</th>
            <th className="px-3 py-3 text-right">Issued</th>
            <th className="px-3 py-3 text-right">Returned</th>
            <th className="px-3 py-3 text-right">Consumed</th>
            <th className="px-3 py-3 text-right">Scrapped</th>
            {!consumptionOnly ? (
              <>
                <th className="px-3 py-3 text-right">Unaccounted</th>
                <th className="px-3 py-3">Status</th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {order.materials.map((row) => (
            <tr key={row.id} className="border-t border-[#e6edf5]">
              <td className="px-3 py-3">
                <div className="font-semibold text-[#203651]">
                  {row.itemName}
                </div>
                <div className="text-[10px] text-[#718096]">
                  {row.itemCode} · {row.unit}
                </div>
              </td>
              <td className="px-3 py-3 text-right">
                {formatQuantity(row.expectedQuantity)}
              </td>
              <td className="px-3 py-3 text-right">
                {formatQuantity(row.issuedQuantity)}
              </td>
              <td className="px-3 py-3 text-right">
                {formatQuantity(row.returnedQuantity)}
              </td>
              <td className="px-3 py-3 text-right font-semibold text-blue-700">
                {formatQuantity(row.consumedQuantity)}
              </td>
              <td className="px-3 py-3 text-right text-rose-700">
                {formatQuantity(row.scrappedQuantity)}
              </td>
              {!consumptionOnly ? (
                <>
                  <td
                    className={`px-3 py-3 text-right font-semibold ${row.unaccountedQuantity === 0 ? "text-emerald-700" : "text-rose-700"}`}
                  >
                    {formatQuantity(row.unaccountedQuantity)}
                  </td>
                  <td className="px-3 py-3">
                    <Pill
                      value={row.reconciled ? "RECONCILED" : "UNRECONCILED"}
                    />
                  </td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-[#cbdced] bg-[#f7faff] font-semibold text-[#203651]">
          <tr>
            <td className="px-3 py-3">Order totals</td>
            <td className="px-3 py-3 text-right">
              {formatQuantity(totals.expected)}
            </td>
            <td className="px-3 py-3 text-right">
              {formatQuantity(totals.issued)}
            </td>
            <td className="px-3 py-3 text-right">
              {formatQuantity(totals.returned)}
            </td>
            <td className="px-3 py-3 text-right">
              {formatQuantity(totals.consumed)}
            </td>
            <td className="px-3 py-3 text-right">
              {formatQuantity(totals.scrapped)}
            </td>
            {!consumptionOnly ? (
              <>
                <td className="px-3 py-3 text-right">
                  {formatQuantity(totals.unaccounted)}
                </td>
                <td className="px-3 py-3">
                  <Pill
                    value={
                      totals.unaccounted === 0 ? "RECONCILED" : "UNRECONCILED"
                    }
                  />
                </td>
              </>
            ) : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function ManufacturingMaterialExceptionsWorkspace({
  workspaceId,
  view,
  title,
}: Props) {
  const client = useQueryClient();
  const kind = ROUTE_KIND[view];
  const [orderId, setOrderId] = useState("");
  const [sourceMaterialId, setSourceMaterialId] = useState("");
  const [substituteItemId, setSubstituteItemId] = useState("");
  const [inventoryLotId, setInventoryLotId] = useState("");
  const [destinationLocationId, setDestinationLocationId] = useState("");
  const [qualityCaseId, setQualityCaseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [reason, setReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [signatureMeaning, setSignatureMeaning] = useState("");
  const [password, setPassword] = useState("");
  const [retestLotId, setRetestLotId] = useState("");
  const [retestQualityCaseId, setRetestQualityCaseId] = useState("");
  const [nextRetestDueAt, setNextRetestDueAt] = useState("");
  const [retestReason, setRetestReason] = useState("");

  const query = useQuery({
    queryKey: ["manufacturing-material-controls", workspaceId],
    queryFn: () => getMaterialControlView({ workspaceId: workspaceId! }),
    enabled: Boolean(workspaceId),
  });
  const selectedOrder = query.data?.orders.find((row) => row.id === orderId);
  const selectedMaterial = selectedOrder?.materials.find(
    (row) => row.id === sourceMaterialId,
  );
  const authorizedSubstituteItemIds = new Set(
    query.data?.qualityCases
      .filter((record) => {
        const linkedOrder =
          (record.details.orderId as string | undefined) ??
          (record.details.productionOrderId as string | undefined);
        return (
          String(record.details.caseType ?? "").toUpperCase() ===
            "CHANGE_CONTROL" &&
          ["APPROVED", "CLOSED", "RESOLVED"].includes(
            String(record.details.state ?? "").toUpperCase(),
          ) &&
          linkedOrder === selectedOrder?.id &&
          record.details.inventoryItemId ===
            selectedMaterial?.inventoryItemId &&
          record.details.bomVersionId === selectedOrder?.bomVersionId &&
          record.details.bomComponentId === selectedMaterial?.bomComponentId &&
          Number(record.details.approvedSubstituteQuantity) > 0 &&
          Boolean(String(record.details.approvedSubstituteUnit ?? "").trim())
        );
      })
      .map((record) =>
        String(record.details.approvedSubstituteInventoryItemId ?? ""),
      ) ?? [],
  );
  const selectedLot = query.data?.lots.find((row) => row.id === inventoryLotId);
  const orderItemIds = useMemo(
    () =>
      new Set(selectedOrder?.materials.map((row) => row.inventoryItemId) ?? []),
    [selectedOrder],
  );
  const transactionDay = today();
  const eligibleLots =
    query.data?.lots.filter(
      (lot) =>
        orderItemIds.has(lot.inventoryItemId) &&
        (!lot.retestDueAt || lot.retestDueAt.slice(0, 10) >= transactionDay),
    ) ?? [];
  const additionalIssueLots = eligibleLots.filter(
    (lot) =>
      lot.inventoryItemId === selectedMaterial?.inventoryItemId &&
      lot.disposition === "RELEASED" &&
      lot.availableQuantity - lot.reservedQuantity > 0,
  );
  const rejectedLots = eligibleLots.filter(
    (lot) => lot.disposition === "REJECTED" && lot.rejectedQuantity > 0,
  );
  const statusLocations =
    query.data?.locations.filter(
      (location) =>
        location.warehouseId === selectedLot?.warehouseId &&
        location.id !== selectedLot.locationId &&
        isSelectableStatusDestination(
          selectedLot.disposition,
          location.disposition,
        ),
    ) ?? [];
  const authorizationItemId =
    kind === "SUBSTITUTION"
      ? selectedMaterial?.inventoryItemId
      : selectedLot?.inventoryItemId;
  const acceptedQualityCaseTypes =
    kind === "SUBSTITUTION"
      ? new Set(["CHANGE_CONTROL"])
      : kind === "STATUS_TRANSFER"
        ? new Set(["OOS", "OOT", "DEVIATION", "CAPA"])
        : kind === "DESTRUCTION"
          ? new Set(["DESTRUCTION"])
          : new Set<string>();
  const qualityCases =
    query.data?.qualityCases.filter((record) => {
      const linkedOrder =
        (record.details.orderId as string | undefined) ??
        (record.details.productionOrderId as string | undefined);
      const linkedItem = record.details.inventoryItemId as string | undefined;
      const caseType = String(record.details.caseType ?? "").toUpperCase();
      const caseState = String(record.details.state ?? "").toUpperCase();
      const linkedLot = record.details.inventoryLotId as string | undefined;
      const approvedSubstitute = record.details
        .approvedSubstituteInventoryItemId as string | undefined;
      const targetDisposition = String(
        record.details.targetDisposition ?? record.details.disposition ?? "",
      ).toUpperCase();
      const selectedDestination = query.data?.locations.find(
        (location) => location.id === destinationLocationId,
      );
      return (
        acceptedQualityCaseTypes.has(caseType) &&
        ["APPROVED", "CLOSED", "RESOLVED"].includes(caseState) &&
        linkedOrder === orderId &&
        linkedItem === authorizationItemId &&
        (kind !== "SUBSTITUTION" || approvedSubstitute === substituteItemId) &&
        (kind !== "SUBSTITUTION" ||
          (Number(record.details.approvedSubstituteQuantity) ===
            Number(quantity) &&
            String(
              record.details.approvedSubstituteUnit ?? "",
            ).toLowerCase() === unit.trim().toLowerCase())) &&
        (kind !== "STATUS_TRANSFER" ||
          !selectedDestination ||
          targetDisposition === selectedDestination.disposition) &&
        (kind !== "DESTRUCTION" || linkedLot === inventoryLotId)
      );
    }) ?? [];
  const requests =
    query.data?.requests.filter((request) => request.kind === kind) ?? [];
  const selectedRetestLot = query.data?.lots.find(
    (lot) => lot.id === retestLotId,
  );
  const consumedRetestCaseIds = new Set(
    query.data?.retestActions
      .map((action) => action.qualityCaseId)
      .filter((value): value is string => Boolean(value)) ?? [],
  );
  const retestQualityCases =
    query.data?.qualityCases.filter((record) => {
      const sourceReference = String(
        record.details.sourceReference ?? "",
      ).trim();
      return (
        String(record.details.caseType ?? "").toUpperCase() ===
          "CHANGE_CONTROL" &&
        ["APPROVED", "CLOSED", "RESOLVED"].includes(
          String(record.details.state ?? "").toUpperCase(),
        ) &&
        record.details.inventoryItemId === selectedRetestLot?.inventoryItemId &&
        (sourceReference === selectedRetestLot?.id ||
          sourceReference === selectedRetestLot?.lotNumber) &&
        !consumedRetestCaseIds.has(record.id)
      );
    }) ?? [];
  const retestActions =
    query.data?.retestActions.filter(
      (action) => !retestLotId || action.inventoryLotId === retestLotId,
    ) ?? [];

  useEffect(() => {
    setSourceMaterialId("");
    setSubstituteItemId("");
    setInventoryLotId("");
    setDestinationLocationId("");
    setQualityCaseId("");
    setQuantity("");
    setUnit("");
  }, [orderId, kind]);

  const create = useMutation({
    mutationFn: () => {
      if (!workspaceId || kind === "RECONCILIATION" || !orderId)
        throw new Error("Select a production order.");
      const parsed = Number(quantity);
      if (!Number.isFinite(parsed) || parsed <= 0)
        throw new Error("Enter a positive quantity.");
      if (!reason.trim()) throw new Error("Enter the control reason.");
      return createMaterialException({
        workspaceId,
        kind,
        orderId,
        sourceOrderMaterialId: sourceMaterialId || null,
        substituteInventoryItemId: substituteItemId || null,
        inventoryLotId: inventoryLotId || null,
        destinationLocationId: destinationLocationId || null,
        qualityCaseId: qualityCaseId || null,
        quantity: parsed,
        unit: unit || selectedLot?.unit || null,
        reason: reason.trim(),
        transactionDate: today(),
        idempotencyKey: key(`material-${kind.toLowerCase()}`),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["manufacturing-material-controls", workspaceId],
      });
      setReason("");
      toast.success("Controlled material request submitted for approval.");
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Material request could not be created."),
      ),
  });
  const decide = useMutation({
    mutationFn: ({
      requestId,
      action,
    }: {
      requestId: string;
      action: "APPROVE" | "REJECT";
    }) => {
      if (!workspaceId) throw new Error("Active workspace is required.");
      if (!decisionReason.trim() || !signatureMeaning.trim())
        throw new Error("Decision reason and signature meaning are required.");
      return decideMaterialException(requestId, {
        workspaceId,
        action,
        reason: decisionReason.trim(),
        signatureMeaning: signatureMeaning.trim(),
        reauthenticationPassword: password || null,
        transactionDate: today(),
        idempotencyKey: key(`material-${action.toLowerCase()}`),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["manufacturing-material-controls", workspaceId],
      });
      void client.invalidateQueries({ queryKey: ["manufacturing"] });
      setDecisionReason("");
      setPassword("");
      toast.success("Material control decision posted atomically.");
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Material decision could not be posted."),
      ),
  });
  const postRetest = useMutation({
    mutationFn: () => {
      if (!workspaceId || !selectedRetestLot)
        throw new Error("Select an inventory lot.");
      if (!retestQualityCaseId)
        throw new Error(
          "Select the approved CHANGE_CONTROL case linked to this exact lot.",
        );
      if (!nextRetestDueAt) throw new Error("Enter the new retest-due date.");
      if (!retestReason.trim())
        throw new Error("Enter the controlled retest or extension reason.");
      return retestManufacturingInventoryLot(selectedRetestLot.id, {
        workspaceId,
        qualityCaseId: retestQualityCaseId,
        retestDueAt: nextRetestDueAt,
        transactionDate: today(),
        reason: retestReason.trim(),
        idempotencyKey: key("material-lot-retest"),
      });
    },
    onSuccess: async () => {
      await client.invalidateQueries({
        queryKey: ["manufacturing-material-controls", workspaceId],
      });
      void client.invalidateQueries({ queryKey: ["manufacturing"] });
      setRetestQualityCaseId("");
      setNextRetestDueAt("");
      setRetestReason("");
      toast.success("Controlled lot retest/extension posted.");
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Lot retest/extension could not be posted."),
      ),
  });

  const icon =
    kind === "SUBSTITUTION"
      ? Replace
      : kind === "STATUS_TRANSFER"
        ? ArrowRightLeft
        : kind === "DESTRUCTION"
          ? Trash2
          : ClipboardCheck;
  const Icon = icon;
  const consumptionOnly = view === "material-consumption";

  return (
    <div className="space-y-3">
      <section className="overflow-hidden rounded-2xl border border-[#d5e2ef] bg-white shadow-[0_8px_20px_rgba(30,64,175,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e9f2] bg-white px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">{title}</h3>
              <p className="text-[11px] text-[#718096]">
                {kind === "RECONCILIATION"
                  ? "Derived only from posted issue, return, production receipt and scrap records; values are never invented."
                  : "Persisted maker-checker control with period, permission, signature, idempotency and audit enforcement."}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
            />{" "}
            Refresh
          </Button>
        </div>
        <div className="p-4">
          <div className="mb-4">
            <FieldLabel>Production order</FieldLabel>
            <NativeSelect
              value={orderId}
              onChange={(event) => setOrderId(event.target.value)}
            >
              <option value="">Select a real production order</option>
              {query.data?.orders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} · {order.finishedProduct} · {order.status}
                </option>
              ))}
            </NativeSelect>
          </div>
          {kind === "RECONCILIATION" ? (
            <ReconciliationTable
              order={selectedOrder}
              consumptionOnly={consumptionOnly}
            />
          ) : (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.65fr)]">
              <div className="grid content-start gap-3 rounded-xl border border-[#d8e3ef] bg-[#fbfdff] p-4 sm:grid-cols-2">
                {kind === "SUBSTITUTION" ? (
                  <>
                    <div>
                      <FieldLabel>Approved BOM material</FieldLabel>
                      <NativeSelect
                        value={sourceMaterialId}
                        onChange={(event) => {
                          setSourceMaterialId(event.target.value);
                          setSubstituteItemId("");
                          setQualityCaseId("");
                          const material = selectedOrder?.materials.find(
                            (row) => row.id === event.target.value,
                          );
                          setQuantity(
                            material ? String(material.expectedQuantity) : "",
                          );
                          setUnit(material?.unit ?? "");
                        }}
                        disabled={!selectedOrder}
                      >
                        <option value="">Select substitutable material</option>
                        {selectedOrder?.materials
                          .filter((row) => row.substitutionAllowed)
                          .map((row) => (
                            <option key={row.id} value={row.id}>
                              {row.itemCode} · {row.itemName} ·{" "}
                              {formatQuantity(row.expectedQuantity)} {row.unit}
                            </option>
                          ))}
                      </NativeSelect>
                    </div>
                    <div>
                      <FieldLabel>Substitute material</FieldLabel>
                      <NativeSelect
                        value={substituteItemId}
                        onChange={(event) => {
                          setSubstituteItemId(event.target.value);
                          setQualityCaseId("");
                          const item = query.data?.items.find(
                            (row) => row.id === event.target.value,
                          );
                          if (item) setUnit(item.unit);
                        }}
                        disabled={!selectedMaterial}
                      >
                        <option value="">
                          Select an approved alternate material
                        </option>
                        {query.data?.items
                          .filter(
                            (item) =>
                              item.id !== selectedMaterial?.inventoryItemId &&
                              authorizedSubstituteItemIds.has(item.id),
                          )
                          .map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.itemCode} · {item.itemName} · {item.unit}
                            </option>
                          ))}
                      </NativeSelect>
                    </div>
                    <div className="sm:col-span-2">
                      <FieldLabel>
                        Approved alternate-material change control
                      </FieldLabel>
                      <NativeSelect
                        value={qualityCaseId}
                        onChange={(event) =>
                          setQualityCaseId(event.target.value)
                        }
                        disabled={!selectedMaterial || !substituteItemId}
                      >
                        <option value="">
                          Select exact approved BOM/component mapping
                        </option>
                        {qualityCases.map((record) => (
                          <option key={record.id} value={record.id}>
                            {record.code} · {record.name} ·{" "}
                            {String(record.details.state ?? "")}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </>
                ) : (
                  <>
                    {kind === "ADDITIONAL_ISSUE" ? (
                      <div>
                        <FieldLabel>Original BOM / order material</FieldLabel>
                        <NativeSelect
                          value={sourceMaterialId}
                          onChange={(event) => {
                            setSourceMaterialId(event.target.value);
                            setInventoryLotId("");
                            setQuantity("");
                            const material = selectedOrder?.materials.find(
                              (row) => row.id === event.target.value,
                            );
                            setUnit(material?.unit ?? "");
                          }}
                          disabled={!selectedOrder}
                        >
                          <option value="">Select source material</option>
                          {selectedOrder?.materials
                            .filter((row) => row.status !== "CANCELLED")
                            .map((row) => (
                              <option key={row.id} value={row.id}>
                                {row.itemCode} · {row.itemName} · {row.unit}
                              </option>
                            ))}
                        </NativeSelect>
                      </div>
                    ) : null}
                    <div>
                      <FieldLabel>
                        {kind === "DESTRUCTION"
                          ? "Rejected source lot"
                          : kind === "ADDITIONAL_ISSUE"
                            ? "Exact released source lot"
                            : "Source inventory lot"}
                      </FieldLabel>
                      <NativeSelect
                        value={inventoryLotId}
                        onChange={(event) => {
                          setInventoryLotId(event.target.value);
                          const lot = query.data?.lots.find(
                            (row) => row.id === event.target.value,
                          );
                          setUnit(lot?.unit ?? "");
                          const maximum =
                            kind === "DESTRUCTION"
                              ? lot?.rejectedQuantity
                              : lot?.disposition === "QC_HOLD"
                                ? lot?.holdQuantity
                                : lot?.disposition === "REJECTED" ||
                                    lot?.disposition === "SCRAP"
                                  ? lot?.rejectedQuantity
                                  : Math.max(
                                      0,
                                      (lot?.availableQuantity ?? 0) -
                                        (lot?.reservedQuantity ?? 0),
                                    );
                          setQuantity(maximum ? String(maximum) : "");
                          setDestinationLocationId("");
                          setQualityCaseId("");
                        }}
                        disabled={
                          !selectedOrder ||
                          (kind === "ADDITIONAL_ISSUE" && !selectedMaterial)
                        }
                      >
                        <option value="">Select exact lot and location</option>
                        {(kind === "DESTRUCTION"
                          ? rejectedLots
                          : kind === "ADDITIONAL_ISSUE"
                            ? additionalIssueLots
                            : eligibleLots
                        ).map((lot) => (
                          <option key={lot.id} value={lot.id}>
                            {lot.itemCode} · {lot.lotNumber} · {lot.location} ·{" "}
                            {lot.disposition}
                            {lot.retestDueAt
                              ? ` · retest ${formatDate(lot.retestDueAt)}`
                              : ""}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                  </>
                )}
                {kind === "STATUS_TRANSFER" ? (
                  <div>
                    <FieldLabel>Destination status / location</FieldLabel>
                    <NativeSelect
                      value={destinationLocationId}
                      onChange={(event) => {
                        setDestinationLocationId(event.target.value);
                        setQualityCaseId("");
                      }}
                      disabled={!selectedLot}
                    >
                      <option value="">
                        Select same-warehouse destination
                      </option>
                      {statusLocations.map((location) => (
                        <option key={location.id} value={location.id}>
                          {location.code} · {location.name} ·{" "}
                          {location.disposition}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}
                {kind === "STATUS_TRANSFER" ? (
                  <div className="sm:col-span-2">
                    <FieldLabel>
                      Approved disposition quality case (when status changes)
                    </FieldLabel>
                    <NativeSelect
                      value={qualityCaseId}
                      onChange={(event) => setQualityCaseId(event.target.value)}
                      disabled={!selectedLot}
                    >
                      <option value="">
                        Not required for same-disposition relocation
                      </option>
                      {qualityCases.map((record) => (
                        <option key={record.id} value={record.id}>
                          {record.code} · {record.name} ·{" "}
                          {String(record.details.state ?? "")}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}
                {kind === "DESTRUCTION" ? (
                  <div>
                    <FieldLabel>Approved destruction quality case</FieldLabel>
                    <NativeSelect
                      value={qualityCaseId}
                      onChange={(event) => setQualityCaseId(event.target.value)}
                      disabled={!selectedLot}
                    >
                      <option value="">Select approved/resolved case</option>
                      {qualityCases.map((record) => (
                        <option key={record.id} value={record.id}>
                          {record.code} · {record.name} ·{" "}
                          {String(record.details.state ?? "")}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ) : null}
                {kind === "ADDITIONAL_ISSUE" ? (
                  <div className="sm:col-span-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] leading-4 text-blue-800">
                    Approval preserves the original BOM/order line, adds a
                    separately identified top-up line, and creates an approved
                    exact-lot requisition/reservation. Stock and the balanced
                    RM-to-WIP journal post only through the normal staged issue
                    action; its ordinary quantity cap is unchanged.
                  </div>
                ) : null}
                <div>
                  <FieldLabel>Exact quantity</FieldLabel>
                  <div className="grid grid-cols-[1fr_90px] gap-2">
                    <Input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={quantity}
                      onChange={(event) => setQuantity(event.target.value)}
                    />
                    <Input
                      value={unit}
                      onChange={(event) => setUnit(event.target.value)}
                      placeholder="Unit"
                      disabled={kind !== "SUBSTITUTION"}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <FieldLabel>Controlled reason</FieldLabel>
                  <Input
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Explain why this exception is required"
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    onClick={() => create.mutate()}
                    disabled={create.isPending || !selectedOrder}
                  >
                    <ShieldAlert className="h-4 w-4" /> Submit for approval
                  </Button>
                </div>
                {kind === "DESTRUCTION" ? (
                  <div className="sm:col-span-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[10px] leading-4 text-rose-800">
                    Approval posts a real inventory OUT at moving-average cost
                    and a balanced write-off journal. The lot and quality case
                    remain permanently auditable; no record is hard-deleted.
                  </div>
                ) : null}
              </div>
              <div className="space-y-3 rounded-xl border border-[#d8e3ef] bg-white p-4">
                <div>
                  <h4 className="text-xs font-semibold text-[#203651]">
                    Independent decision
                  </h4>
                  <p className="text-[10px] text-[#718096]">
                    Maker-checker and the approved electronic-signature policy
                    are enforced by the server.
                  </p>
                </div>
                <div>
                  <FieldLabel>Decision reason</FieldLabel>
                  <Input
                    value={decisionReason}
                    onChange={(event) => setDecisionReason(event.target.value)}
                  />
                </div>
                <div>
                  <FieldLabel>Signature meaning</FieldLabel>
                  <Input
                    value={signatureMeaning}
                    onChange={(event) =>
                      setSignatureMeaning(event.target.value)
                    }
                    placeholder="Must match approved policy"
                  />
                </div>
                <div>
                  <FieldLabel>
                    Current password (when policy requires)
                  </FieldLabel>
                  <Input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
      <section className="overflow-hidden rounded-2xl border border-[#d5e2ef] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e1e9f2] bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <CalendarClock className="h-4 w-4" />
            </span>
            <div>
              <h3 className="text-xs font-semibold text-[#203651]">
                Controlled lot retest / extension
              </h3>
              <p className="text-[10px] text-[#718096]">
                Requires an approved, electronically signed CHANGE_CONTROL case
                linked to the exact item and lot. One case can authorize one
                date action only.
              </p>
            </div>
          </div>
          <span className="rounded-full bg-violet-50 px-3 py-1 text-[9px] font-bold uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
            QA controlled
          </span>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div className="grid content-start gap-3 rounded-xl border border-[#d8e3ef] bg-[#fbfdff] p-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel>Inventory lot</FieldLabel>
              <NativeSelect
                value={retestLotId}
                onChange={(event) => {
                  setRetestLotId(event.target.value);
                  setRetestQualityCaseId("");
                  setNextRetestDueAt("");
                }}
              >
                <option value="">Select exact lot</option>
                {query.data?.lots.map((lot) => (
                  <option key={lot.id} value={lot.id}>
                    {lot.itemCode} · {lot.lotNumber} ·{" "}
                    {lot.disposition ?? "No location"}
                    {lot.retestDueAt
                      ? ` · current ${formatDate(lot.retestDueAt)}`
                      : " · no current retest date"}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="sm:col-span-2 grid grid-cols-3 gap-2 rounded-xl border border-[#e2e8f0] bg-white px-3 py-2 text-[10px]">
              <div>
                <div className="uppercase tracking-wide text-[#8492a6]">
                  Manufactured
                </div>
                <div className="mt-1 font-semibold text-[#203651]">
                  {selectedRetestLot?.manufacturedAt
                    ? formatDate(selectedRetestLot.manufacturedAt)
                    : "—"}
                </div>
              </div>
              <div>
                <div className="uppercase tracking-wide text-[#8492a6]">
                  Current retest
                </div>
                <div className="mt-1 font-semibold text-[#203651]">
                  {selectedRetestLot?.retestDueAt
                    ? formatDate(selectedRetestLot.retestDueAt)
                    : "—"}
                </div>
              </div>
              <div>
                <div className="uppercase tracking-wide text-[#8492a6]">
                  Expiry limit
                </div>
                <div className="mt-1 font-semibold text-[#203651]">
                  {selectedRetestLot?.expiresAt
                    ? formatDate(selectedRetestLot.expiresAt)
                    : "—"}
                </div>
              </div>
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Approved exact-lot CHANGE_CONTROL case</FieldLabel>
              <NativeSelect
                value={retestQualityCaseId}
                onChange={(event) => setRetestQualityCaseId(event.target.value)}
                disabled={!selectedRetestLot}
              >
                <option value="">Select approved case</option>
                {retestQualityCases.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.code} · {record.name} ·{" "}
                    {String(record.details.state ?? "")}
                  </option>
                ))}
              </NativeSelect>
              {selectedRetestLot && !retestQualityCases.length ? (
                <p className="mt-1 text-[10px] text-amber-700">
                  No unused approved case is listed. Create and independently
                  approve a CHANGE_CONTROL case whose source reference exactly
                  matches {selectedRetestLot.lotNumber} or its lot ID.
                </p>
              ) : null}
            </div>
            <div>
              <FieldLabel>New retest-due date</FieldLabel>
              <AppDateInput
                aria-label="New retest-due date"
                min={today()}
                max={selectedRetestLot?.expiresAt?.slice(0, 10)}
                value={nextRetestDueAt}
                onChange={(value) => setNextRetestDueAt(value)}
                disabled={!selectedRetestLot}
              />
            </div>
            <div>
              <FieldLabel>Controlled reason</FieldLabel>
              <Input
                value={retestReason}
                onChange={(event) => setRetestReason(event.target.value)}
                placeholder="Retest result / approved extension basis"
                disabled={!selectedRetestLot}
              />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button
                onClick={() => postRetest.mutate()}
                disabled={postRetest.isPending || !selectedRetestLot}
              >
                <CalendarClock className="h-4 w-4" /> Post controlled date
              </Button>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#d8e3ef]">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wider text-[#66768c]">
                <tr>
                  <th className="px-3 py-3">Action date</th>
                  <th className="px-3 py-3">Lot / case</th>
                  <th className="px-3 py-3">Retest date change</th>
                  <th className="px-3 py-3">Posted by</th>
                </tr>
              </thead>
              <tbody>
                {retestActions.map((action) => {
                  const lot = query.data?.lots.find(
                    (row) => row.id === action.inventoryLotId,
                  );
                  return (
                    <tr key={action.id} className="border-t border-[#e6edf5]">
                      <td className="px-3 py-3">
                        {formatDate(action.transactionDate)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#203651]">
                          {lot?.lotNumber ?? action.inventoryLotId ?? "—"}
                        </div>
                        <div className="text-[10px] text-[#718096]">
                          {action.qualityCaseCode ??
                            action.qualityCaseId ??
                            "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="text-[#718096]">
                          {action.previousRetestDueAt
                            ? formatDate(action.previousRetestDueAt)
                            : "—"}
                        </span>{" "}
                        →{" "}
                        <span className="font-semibold text-violet-700">
                          {action.retestDueAt
                            ? formatDate(action.retestDueAt)
                            : "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div>{action.createdBy.name}</div>
                        <div className="max-w-48 truncate text-[10px] text-[#718096]">
                          {action.reason ?? "—"}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!retestActions.length ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-10 text-center text-xs text-[#718096]"
                    >
                      No controlled retest/extension action has been posted.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      {kind !== "RECONCILIATION" ? (
        <section className="overflow-hidden rounded-2xl border border-[#d5e2ef] bg-white">
          <div className="border-b border-[#e1e9f2] px-4 py-3">
            <h3 className="text-xs font-semibold text-[#203651]">
              Persisted control register
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="bg-[#f4f7fb] text-[9px] uppercase tracking-wider text-[#66768c]">
                <tr>
                  <th className="px-4 py-3">Date / Request</th>
                  <th className="px-3 py-3">Reason</th>
                  <th className="px-3 py-3 text-right">Quantity</th>
                  <th className="px-3 py-3">Requested by</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Decision</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-t border-[#e6edf5]">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[#203651]">
                        {formatDate(request.transactionDate)}
                      </div>
                      <div className="max-w-72 truncate text-[10px] text-[#718096]">
                        {request.id}
                      </div>
                    </td>
                    <td className="px-3 py-3">{request.input.reason}</td>
                    <td className="px-3 py-3 text-right font-semibold">
                      {formatQuantity(request.input.quantity)}{" "}
                      {request.input.unit}
                    </td>
                    <td className="px-3 py-3">{request.createdBy.name}</td>
                    <td className="px-3 py-3">
                      <Pill value={request.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        {request.status === "PENDING" ? (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                decide.mutate({
                                  requestId: request.id,
                                  action: "REJECT",
                                })
                              }
                              disabled={decide.isPending}
                            >
                              Reject
                            </Button>
                            <Button
                              size="sm"
                              onClick={() =>
                                decide.mutate({
                                  requestId: request.id,
                                  action: "APPROVE",
                                })
                              }
                              disabled={decide.isPending}
                            >
                              Approve
                            </Button>
                          </>
                        ) : (
                          <span className="text-[10px] text-[#718096]">
                            {request.approvedBy?.name ??
                              request.note ??
                              "Decided"}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!requests.length ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-10 text-center text-xs text-[#718096]"
                    >
                      No persisted {title.toLowerCase()} controls yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
