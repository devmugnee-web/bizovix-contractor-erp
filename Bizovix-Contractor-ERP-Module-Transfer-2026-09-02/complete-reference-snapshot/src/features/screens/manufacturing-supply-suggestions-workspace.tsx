"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FilePlus2,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  Truck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useApproveManufacturingSupplySuggestionMutation,
  useCancelManufacturingSupplySuggestionMutation,
  useConvertManufacturingSupplySuggestionMutation,
  useCreateManufacturingSupplySuggestionMutation,
  useManufacturingSupplySuggestionsQuery,
} from "@/hooks/use-manufacturing-supply-query";
import { useManufacturingMrpRunsQuery } from "@/hooks/use-manufacturing-query";
import { formatDate } from "@/lib/format";
import type { WarehouseRecord } from "@/services/warehouse.service";
import type { ManufacturingMrpRunRecord } from "@/types/manufacturing";
import type {
  ManufacturingSupplySuggestionRecord,
  ManufacturingSupplySuggestionStatus,
  ManufacturingSupplySuggestionType,
} from "@/types/manufacturing-supply";

export interface ManufacturingSupplySuggestionsWorkspaceProps {
  workspaceId?: string;
  type: ManufacturingSupplySuggestionType;
  title: string;
  warehouses: WarehouseRecord[];
}

export interface RealMrpShortage {
  requirementId: string;
  runId: string;
  runNumber: string;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  warehouseId: string | null;
  requiredDate: string | null;
  unit: string;
  shortageQuantity: number;
}

export function collectRealMrpShortages(
  runs: ManufacturingMrpRunRecord[],
): RealMrpShortage[] {
  return runs
    .filter((run) => run.status === "COMPLETED" && !run.isWhatIfScenario)
    .flatMap((run) =>
      run.requirements
        .filter(
          (requirement) =>
            Number.isFinite(Number(requirement.shortageQuantity)) &&
            Number(requirement.shortageQuantity) > 0,
        )
        .map((requirement) => ({
          requirementId: requirement.id,
          runId: run.id,
          runNumber: run.runNumber,
          itemId: requirement.inventoryItemId,
          itemCode: requirement.itemCode,
          itemName: requirement.itemName,
          warehouseId: requirement.warehouseId,
          requiredDate: requirement.requiredDate,
          unit: requirement.unit,
          shortageQuantity: Number(requirement.shortageQuantity),
        })),
    )
    .sort((left, right) => {
      const dateOrder = (left.requiredDate ?? "9999-12-31").localeCompare(
        right.requiredDate ?? "9999-12-31",
      );
      if (dateOrder !== 0) return dateOrder;
      return `${left.itemCode ?? ""} ${left.itemName ?? ""}`.localeCompare(
        `${right.itemCode ?? ""} ${right.itemName ?? ""}`,
      );
    });
}

export interface SupplySuggestionDraftValidationInput {
  type: ManufacturingSupplySuggestionType;
  requirementId: string;
  requestedQuantity: string | number;
  remainingShortage: number;
  requirementWarehouseId: string | null;
  destinationWarehouseId: string;
  sourceWarehouseId?: string;
}

export function validateSupplySuggestionDraft(
  input: SupplySuggestionDraftValidationInput,
) {
  if (!input.requirementId) return "Select a real completed MRP shortage.";
  const requestedQuantity = Number(input.requestedQuantity);
  if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
    return "Requested quantity must be greater than zero.";
  }
  if (requestedQuantity > input.remainingShortage + 1e-9) {
    return `Requested quantity cannot exceed the unsuggested shortage (${formatQuantity(input.remainingShortage)}).`;
  }
  if (!input.requirementWarehouseId) {
    return "The selected MRP shortage has no destination warehouse.";
  }
  if (!input.destinationWarehouseId) {
    return "Select the destination warehouse.";
  }
  if (input.destinationWarehouseId !== input.requirementWarehouseId) {
    return "Destination warehouse must match the MRP shortage warehouse.";
  }
  if (input.type === "STOCK_TRANSFER") {
    if (!input.sourceWarehouseId) {
      return "Select the source warehouse for this transfer.";
    }
    if (input.sourceWarehouseId === input.destinationWarehouseId) {
      return "Source and destination warehouses must be different.";
    }
  }
  return null;
}

const statusOptions: Array<{
  value: "ALL" | ManufacturingSupplySuggestionStatus;
  label: string;
}> = [
  { value: "ALL", label: "All statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVAL_PENDING", label: "Approval pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "CONVERTED", label: "Converted" },
  { value: "REJECTED", label: "Cancelled" },
];

type RowAction = "APPROVE" | "CONVERT" | "CANCEL";

function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

function idempotencyKey(prefix: string) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat("en-BD", {
    maximumFractionDigits: 4,
  }).format(Number(value) || 0);
}

function actorName(value: ManufacturingSupplySuggestionRecord["createdBy"]) {
  if (!value) return "—";
  return typeof value === "string" ? value : value.name;
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#6b7d95]">
      {children}
    </label>
  );
}

function NativeSelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`h-10 min-w-0 rounded-xl border border-[#d3dfec] bg-white px-3 text-xs text-[#203651] outline-none transition focus:border-[#7db4f2] focus:ring-2 focus:ring-[#dbeafe] disabled:bg-[#f4f7fb] disabled:text-[#718096] ${props.className ?? ""}`}
    />
  );
}

function StatusPill({ value }: { value: ManufacturingSupplySuggestionStatus }) {
  const tone =
    value === "CONVERTED"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : value === "APPROVED"
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : value === "REJECTED"
          ? "bg-rose-50 text-rose-700 ring-rose-200"
          : value === "APPROVAL_PENDING"
            ? "bg-violet-50 text-violet-700 ring-violet-200"
            : "bg-amber-50 text-amber-700 ring-amber-200";
  const label = value === "REJECTED" ? "CANCELLED" : value.replaceAll("_", " ");
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[9px] font-bold tracking-wide ring-1 ${tone}`}
    >
      {label}
    </span>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "amber" | "green" | "slate";
}) {
  const styles = {
    blue: "border-blue-100 bg-blue-50/60 text-blue-700",
    amber: "border-amber-100 bg-amber-50/60 text-amber-700",
    green: "border-emerald-100 bg-emerald-50/60 text-emerald-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[tone];
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${styles}`}>
      <p className="text-[9px] font-bold uppercase tracking-[0.12em] opacity-75">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function QueryError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
      <span className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4" />
        {message}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </Button>
    </div>
  );
}

export function ManufacturingSupplySuggestionsWorkspace({
  workspaceId,
  type,
  title,
  warehouses,
}: ManufacturingSupplySuggestionsWorkspaceProps) {
  const isPurchase = type === "PURCHASE_REQUISITION";
  const Icon = isPurchase ? ShoppingCart : Truck;
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    "ALL" | ManufacturingSupplySuggestionStatus
  >("ALL");
  const [mrpRunId, setMrpRunId] = useState("ALL");
  const [requirementId, setRequirementId] = useState("");
  const [requestedQuantity, setRequestedQuantity] = useState("");
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationWarehouseId, setDestinationWarehouseId] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayIso);
  const [note, setNote] = useState("");
  const [activeAction, setActiveAction] = useState<{
    id: string;
    kind: RowAction;
  } | null>(null);
  const [actionDate, setActionDate] = useState(todayIso);
  const [actionNote, setActionNote] = useState("");
  const [signatureMeaning, setSignatureMeaning] = useState(
    "I approve this MRP supply suggestion",
  );
  const [password, setPassword] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [expectedReceiptDate, setExpectedReceiptDate] = useState("");
  const [cancelReason, setCancelReason] = useState("");

  const mrpRunsQuery = useManufacturingMrpRunsQuery(
    workspaceId ? { workspaceId, status: "COMPLETED" } : null,
  );
  const suggestionsQuery = useManufacturingSupplySuggestionsQuery(
    workspaceId
      ? {
          workspaceId,
          type,
          status: status === "ALL" ? undefined : status,
          mrpRunId: mrpRunId === "ALL" ? undefined : mrpRunId,
        }
      : null,
  );
  const allSuggestionsQuery = useManufacturingSupplySuggestionsQuery(
    workspaceId ? { workspaceId } : null,
  );
  const createMutation = useCreateManufacturingSupplySuggestionMutation();
  const approveMutation = useApproveManufacturingSupplySuggestionMutation();
  const convertMutation = useConvertManufacturingSupplySuggestionMutation();
  const cancelMutation = useCancelManufacturingSupplySuggestionMutation();

  const realShortages = useMemo(
    () => collectRealMrpShortages(mrpRunsQuery.data ?? []),
    [mrpRunsQuery.data],
  );
  const suggestedByRequirement = useMemo(() => {
    const result = new Map<string, number>();
    for (const suggestion of allSuggestionsQuery.data ?? []) {
      if (suggestion.status === "REJECTED") continue;
      result.set(
        suggestion.mrpRequirementId,
        (result.get(suggestion.mrpRequirementId) ?? 0) +
          Number(suggestion.requestedQuantity),
      );
    }
    return result;
  }, [allSuggestionsQuery.data]);
  const selectableShortages = useMemo(
    () =>
      realShortages
        .map((shortage) => ({
          ...shortage,
          remainingQuantity: Math.max(
            0,
            shortage.shortageQuantity -
              (suggestedByRequirement.get(shortage.requirementId) ?? 0),
          ),
        }))
        .filter((shortage) => shortage.remainingQuantity > 1e-9),
    [realShortages, suggestedByRequirement],
  );
  const selectedShortage = selectableShortages.find(
    (shortage) => shortage.requirementId === requirementId,
  );
  const destinationWarehouse = warehouses.find(
    (warehouse) => warehouse.id === selectedShortage?.warehouseId,
  );
  const suggestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return suggestionsQuery.data ?? [];
    return (suggestionsQuery.data ?? []).filter((suggestion) =>
      [
        suggestion.suggestionNumber,
        suggestion.mrpRunNumber,
        suggestion.item?.code,
        suggestion.item?.name,
        suggestion.sourceWarehouse?.code,
        suggestion.sourceWarehouse?.name,
        suggestion.destinationWarehouse?.code,
        suggestion.destinationWarehouse?.name,
        suggestion.externalReference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term),
    );
  }, [search, suggestionsQuery.data]);
  const summary = useMemo(() => {
    const rows =
      allSuggestionsQuery.data?.filter((row) => row.type === type) ?? [];
    return {
      total: rows.length,
      pending: rows.filter(
        (row) => row.status === "PENDING" || row.status === "APPROVAL_PENDING",
      ).length,
      approved: rows.filter((row) => row.status === "APPROVED").length,
      converted: rows.filter((row) => row.status === "CONVERTED").length,
    };
  }, [allSuggestionsQuery.data, type]);

  useEffect(() => {
    if (!selectedShortage) return;
    setRequestedQuantity(String(selectedShortage.remainingQuantity));
    setDestinationWarehouseId(selectedShortage.warehouseId ?? "");
    setSourceWarehouseId((current) =>
      current === selectedShortage.warehouseId ? "" : current,
    );
  }, [selectedShortage]);

  function resetCreateForm() {
    setRequirementId("");
    setRequestedQuantity("");
    setSourceWarehouseId("");
    setDestinationWarehouseId("");
    setNote("");
  }

  async function createSuggestion() {
    if (!workspaceId || !selectedShortage) {
      toast.error("Select a real completed MRP shortage.");
      return;
    }
    const validation = validateSupplySuggestionDraft({
      type,
      requirementId,
      requestedQuantity,
      remainingShortage: selectedShortage.remainingQuantity,
      requirementWarehouseId: selectedShortage.warehouseId,
      destinationWarehouseId,
      sourceWarehouseId,
    });
    if (validation) {
      toast.error(validation);
      return;
    }
    try {
      await createMutation.mutateAsync({
        workspaceId,
        mrpRequirementId: selectedShortage.requirementId,
        type,
        requestedQuantity: Number(requestedQuantity),
        sourceWarehouseId: isPurchase ? undefined : sourceWarehouseId,
        destinationWarehouseId,
        transactionDate,
        idempotencyKey: idempotencyKey(
          isPurchase
            ? "manufacturing-pr-suggestion"
            : "manufacturing-transfer-suggestion",
        ),
        note: note.trim() || undefined,
      });
      toast.success(
        isPurchase
          ? "Purchase requisition suggestion created."
          : "Stock transfer suggestion created.",
      );
      resetCreateForm();
    } catch (error) {
      toast.error(errorText(error, "Could not create the supply suggestion."));
    }
  }

  function openAction(id: string, kind: RowAction) {
    setActiveAction({ id, kind });
    setActionDate(todayIso());
    setActionNote("");
    setPassword("");
    setExternalReference("");
    setExpectedReceiptDate("");
    setCancelReason("");
  }

  async function submitAction() {
    if (!workspaceId || !activeAction) return;
    try {
      if (activeAction.kind === "APPROVE") {
        if (!signatureMeaning.trim()) {
          toast.error("Enter the electronic signature meaning.");
          return;
        }
        await approveMutation.mutateAsync({
          suggestionId: activeAction.id,
          body: {
            workspaceId,
            transactionDate: actionDate,
            idempotencyKey: idempotencyKey("manufacturing-supply-approval"),
            signatureMeaning: signatureMeaning.trim(),
            reauthenticationPassword: password || undefined,
            note: actionNote.trim() || undefined,
          },
        });
        toast.success("Supply suggestion approval posted.");
      } else if (activeAction.kind === "CONVERT") {
        await convertMutation.mutateAsync({
          suggestionId: activeAction.id,
          body: {
            workspaceId,
            transactionDate: actionDate,
            idempotencyKey: idempotencyKey("manufacturing-supply-conversion"),
            externalReference: externalReference.trim() || undefined,
            expectedReceiptDate: expectedReceiptDate || undefined,
            note: actionNote.trim() || undefined,
          },
        });
        toast.success(
          isPurchase
            ? "Approved suggestion converted to a purchase requisition."
            : "Approved suggestion converted to a warehouse transfer.",
        );
      } else {
        if (!cancelReason.trim()) {
          toast.error("A cancellation reason is required.");
          return;
        }
        await cancelMutation.mutateAsync({
          suggestionId: activeAction.id,
          body: {
            workspaceId,
            transactionDate: actionDate,
            idempotencyKey: idempotencyKey("manufacturing-supply-cancel"),
            reason: cancelReason.trim(),
          },
        });
        toast.success("Supply suggestion cancelled.");
      }
      setActiveAction(null);
    } catch (error) {
      toast.error(errorText(error, "Could not post the selected action."));
    }
  }

  const actionPending =
    approveMutation.isPending ||
    convertMutation.isPending ||
    cancelMutation.isPending;

  if (!workspaceId) {
    return (
      <QueryError
        message="Select a workspace before managing MRP supply suggestions."
        onRetry={() => undefined}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="overflow-hidden rounded-2xl border border-[#d6e2ef] bg-white shadow-[0_8px_24px_rgba(34,70,116,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2eaf3] bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8f3ff] text-[#2478df]">
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-[#718096]">
                Planning &amp; MRP · Real supply workflow
              </p>
              <h2 className="truncate text-sm font-semibold text-[#1e3552]">
                {title}
              </h2>
              <p className="mt-0.5 text-[10px] text-[#6d7f97]">
                Built only from completed, non-scenario MRP shortages and active
                warehouses.
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[10px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" /> No demo records
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
          <MetricCard
            label="All suggestions"
            value={summary.total}
            tone="blue"
          />
          <MetricCard
            label="Awaiting approval"
            value={summary.pending}
            tone="amber"
          />
          <MetricCard label="Approved" value={summary.approved} tone="green" />
          <MetricCard
            label="Converted"
            value={summary.converted}
            tone="slate"
          />
        </div>
      </section>

      {(mrpRunsQuery.isError || allSuggestionsQuery.isError) && (
        <QueryError
          message={errorText(
            mrpRunsQuery.error ?? allSuggestionsQuery.error,
            "Real MRP shortages could not be loaded.",
          )}
          onRetry={() => {
            void mrpRunsQuery.refetch();
            void allSuggestionsQuery.refetch();
          }}
        />
      )}

      <section className="rounded-2xl border border-[#d6e2ef] bg-white p-3 shadow-[0_6px_18px_rgba(34,70,116,0.04)]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold text-[#223a59]">
              <FilePlus2 className="h-4 w-4 text-[#2478df]" /> New{" "}
              {isPurchase ? "purchase requisition" : "stock transfer"}{" "}
              suggestion
            </h3>
            <p className="mt-0.5 text-[10px] text-[#718096]">
              The API rechecks shortage, warehouse and available-stock rules
              before posting.
            </p>
          </div>
          <span className="rounded-full bg-[#f0f5fb] px-2.5 py-1 text-[9px] font-semibold text-[#52647d]">
            {selectableShortages.length} actionable shortages
          </span>
        </div>
        <div className="grid gap-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <FieldLabel>Completed MRP shortage</FieldLabel>
            <NativeSelect
              className="w-full"
              value={requirementId}
              onChange={(event) => setRequirementId(event.target.value)}
              disabled={mrpRunsQuery.isLoading || allSuggestionsQuery.isLoading}
            >
              <option value="">Select shortage</option>
              {selectableShortages.map((shortage) => (
                <option
                  key={shortage.requirementId}
                  value={shortage.requirementId}
                >
                  {shortage.runNumber} ·{" "}
                  {shortage.itemCode ?? shortage.itemName ?? "Unnamed item"} ·{" "}
                  {formatQuantity(shortage.remainingQuantity)} {shortage.unit}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="lg:col-span-2">
            <FieldLabel>Requested quantity</FieldLabel>
            <Input
              type="number"
              min="0.0001"
              step="0.0001"
              value={requestedQuantity}
              onChange={(event) => setRequestedQuantity(event.target.value)}
              className="h-10 rounded-xl border-[#d3dfec] text-right text-xs"
              placeholder="0"
            />
          </div>
          {!isPurchase ? (
            <div className="lg:col-span-2">
              <FieldLabel>Source warehouse</FieldLabel>
              <NativeSelect
                className="w-full"
                value={sourceWarehouseId}
                onChange={(event) => setSourceWarehouseId(event.target.value)}
              >
                <option value="">Select source</option>
                {warehouses
                  .filter(
                    (warehouse) => warehouse.id !== destinationWarehouseId,
                  )
                  .map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.code} — {warehouse.name}
                    </option>
                  ))}
              </NativeSelect>
            </div>
          ) : null}
          <div className={isPurchase ? "lg:col-span-3" : "lg:col-span-2"}>
            <FieldLabel>Destination warehouse</FieldLabel>
            <NativeSelect
              className="w-full"
              value={destinationWarehouseId}
              onChange={(event) =>
                setDestinationWarehouseId(event.target.value)
              }
              disabled={!selectedShortage}
            >
              <option value="">MRP shortage warehouse</option>
              {warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} — {warehouse.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="lg:col-span-2">
            <FieldLabel>Transaction date</FieldLabel>
            <AppDateInput
              aria-label="Transaction date"
              value={transactionDate}
              onChange={(value) => setTransactionDate(value)}
              inputClassName="h-10 rounded-xl border-[#d3dfec] text-xs"
            />
          </div>
          <div className={isPurchase ? "lg:col-span-1" : "lg:col-span-2"}>
            <FieldLabel>&nbsp;</FieldLabel>
            <Button
              type="button"
              size="sm"
              className="w-full"
              disabled={
                createMutation.isPending ||
                allSuggestionsQuery.isLoading ||
                allSuggestionsQuery.isError
              }
              onClick={() => void createSuggestion()}
            >
              {createMutation.isPending ? "Posting…" : "Create"}
            </Button>
          </div>
          <div className="lg:col-span-12">
            <FieldLabel>Note (optional)</FieldLabel>
            <Input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="h-9 rounded-xl border-[#d3dfec] text-xs"
              placeholder="Reason, buyer/transfer instruction or planning note"
              maxLength={1000}
            />
          </div>
        </div>
        {selectedShortage ? (
          <div className="mt-3 grid gap-2 rounded-xl border border-[#dfe9f4] bg-[#f8fbff] p-3 text-[10px] text-[#52647d] sm:grid-cols-4">
            <span>
              <strong className="text-[#263c58]">Item:</strong>{" "}
              {selectedShortage.itemCode ?? "—"} ·{" "}
              {selectedShortage.itemName ?? "Unnamed item"}
            </span>
            <span>
              <strong className="text-[#263c58]">MRP run:</strong>{" "}
              {selectedShortage.runNumber}
            </span>
            <span>
              <strong className="text-[#263c58]">Required:</strong>{" "}
              {selectedShortage.requiredDate
                ? formatDate(selectedShortage.requiredDate)
                : "—"}
            </span>
            <span>
              <strong className="text-[#263c58]">Destination:</strong>{" "}
              {destinationWarehouse
                ? `${destinationWarehouse.code} — ${destinationWarehouse.name}`
                : "Not configured"}
            </span>
          </div>
        ) : null}
      </section>

      <section className="flex min-h-[330px] flex-1 flex-col overflow-hidden rounded-2xl border border-[#d6e2ef] bg-white shadow-[0_6px_18px_rgba(34,70,116,0.04)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2eaf3] px-3 py-2.5">
          <div>
            <h3 className="text-xs font-semibold text-[#223a59]">
              Suggestion register
            </h3>
            <p className="text-[10px] text-[#718096]">
              Approval, conversion and cancellation remain fully auditable.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <CollapsibleSearch
              value={search}
              onChange={setSearch}
              placeholder="Search suggestion, MRP, item or warehouse"
              label="Search supply suggestions"
              size="sm"
              expandedWidth="w-[280px]"
            />
            <NativeSelect
              className="h-8 w-[150px]"
              value={mrpRunId}
              onChange={(event) => setMrpRunId(event.target.value)}
            >
              <option value="ALL">All MRP runs</option>
              {(mrpRunsQuery.data ?? [])
                .filter(
                  (run) => run.status === "COMPLETED" && !run.isWhatIfScenario,
                )
                .map((run) => (
                  <option key={run.id} value={run.id}>
                    {run.runNumber}
                  </option>
                ))}
            </NativeSelect>
            <NativeSelect
              className="h-8 w-[150px]"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as typeof status)
              }
            >
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {suggestionsQuery.isError ? (
          <div className="p-3">
            <QueryError
              message={errorText(
                suggestionsQuery.error,
                "Suggestions could not be loaded.",
              )}
              onRetry={() => void suggestionsQuery.refetch()}
            />
          </div>
        ) : suggestionsQuery.isLoading ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-xs text-[#718096]">
            <RefreshCw className="h-4 w-4 animate-spin" /> Loading real
            suggestions…
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eef6ff] text-[#2478df]">
              <PackageSearch className="h-6 w-6" />
            </span>
            <p className="text-sm font-semibold text-[#263c58]">
              No matching suggestions
            </p>
            <p className="max-w-md text-[11px] leading-5 text-[#718096]">
              Create one from an unsupplied real MRP shortage above. No
              generated or demo records are shown.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#e5edf5]">
            <div className="hidden grid-cols-[1.1fr_1.15fr_0.65fr_1fr_0.75fr_1.1fr] gap-3 bg-[#f5f8fc] px-4 py-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#657994] lg:grid">
              <span>Suggestion / MRP</span>
              <span>Item / quantity</span>
              <span>Required</span>
              <span>Warehouse flow</span>
              <span>Status</span>
              <span className="text-right">Actions</span>
            </div>
            {suggestions.map((suggestion) => (
              <article
                key={suggestion.id}
                className="grid gap-3 px-4 py-3 text-[11px] text-[#52647d] transition hover:bg-[#fbfdff] lg:grid-cols-[1.1fr_1.15fr_0.65fr_1fr_0.75fr_1.1fr] lg:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[#203651]">
                    {suggestion.suggestionNumber}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[#8290a4]">
                    MRP {suggestion.mrpRunNumber} · by{" "}
                    {actorName(suggestion.createdBy)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="truncate font-medium text-[#2b405b]">
                    {suggestion.item?.code ?? "—"} ·{" "}
                    {suggestion.item?.name ?? "Unnamed item"}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[#718096]">
                    {formatQuantity(suggestion.requestedQuantity)}{" "}
                    {suggestion.unit} of{" "}
                    {formatQuantity(suggestion.shortageQuantity)} shortage
                  </p>
                </div>
                <span>
                  {suggestion.requiredDate
                    ? formatDate(suggestion.requiredDate)
                    : "—"}
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">
                    {suggestion.sourceWarehouse?.code ??
                      (isPurchase ? "Supplier" : "—")}
                  </span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-[#8da0b8]" />
                  <span className="truncate font-medium text-[#2b405b]">
                    {suggestion.destinationWarehouse?.code ?? "—"}
                  </span>
                  {suggestion.warehouseTransfer ? (
                    <span className="truncate text-[9px] text-blue-600">
                      · {suggestion.warehouseTransfer.transferNo}
                    </span>
                  ) : null}
                </div>
                <StatusPill value={suggestion.status} />
                <div className="flex flex-wrap justify-start gap-1.5 lg:justify-end">
                  {suggestion.status === "PENDING" ||
                  suggestion.status === "APPROVAL_PENDING" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => openAction(suggestion.id, "APPROVE")}
                    >
                      <ClipboardCheck className="h-3 w-3" /> Approve
                    </Button>
                  ) : null}
                  {suggestion.status === "APPROVED" ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 px-2 text-[10px]"
                      onClick={() => openAction(suggestion.id, "CONVERT")}
                    >
                      Convert
                    </Button>
                  ) : null}
                  {["PENDING", "APPROVAL_PENDING", "APPROVED"].includes(
                    suggestion.status,
                  ) ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-[10px] text-rose-600"
                      onClick={() => openAction(suggestion.id, "CANCEL")}
                    >
                      <XCircle className="h-3 w-3" /> Cancel
                    </Button>
                  ) : null}
                  {suggestion.status === "CONVERTED" &&
                  suggestion.externalReference ? (
                    <span className="self-center text-[10px] text-[#718096]">
                      Ref: {suggestion.externalReference}
                    </span>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}

        {activeAction ? (
          <div className="mt-auto border-t border-[#dbe6f1] bg-[#f8fbff] p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#203651]">
                  {activeAction.kind === "APPROVE"
                    ? "Approve suggestion"
                    : activeAction.kind === "CONVERT"
                      ? `Convert to ${isPurchase ? "purchase requisition" : "warehouse transfer"}`
                      : "Cancel suggestion"}
                </p>
                <p className="text-[10px] text-[#718096]">
                  This action is posted to the real workflow and recorded in the
                  audit trail.
                </p>
              </div>
              <button
                type="button"
                className="rounded-full p-1 text-[#718096] hover:bg-white"
                onClick={() => setActiveAction(null)}
                aria-label="Close action panel"
              >
                <XCircle className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 lg:grid-cols-12">
              <div className="lg:col-span-2">
                <FieldLabel>Transaction date</FieldLabel>
                <AppDateInput
                  aria-label="Transaction date"
                  value={actionDate}
                  onChange={(value) => setActionDate(value)}
                  inputClassName="h-9 rounded-xl border-[#d3dfec] text-xs"
                />
              </div>
              {activeAction.kind === "APPROVE" ? (
                <>
                  <div className="lg:col-span-4">
                    <FieldLabel>Electronic signature meaning</FieldLabel>
                    <Input
                      value={signatureMeaning}
                      onChange={(event) =>
                        setSignatureMeaning(event.target.value)
                      }
                      className="h-9 rounded-xl border-[#d3dfec] text-xs"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <FieldLabel>
                      Reauthentication password (if required)
                    </FieldLabel>
                    <Input
                      type="password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-9 rounded-xl border-[#d3dfec] text-xs"
                      autoComplete="current-password"
                    />
                  </div>
                </>
              ) : activeAction.kind === "CONVERT" ? (
                <>
                  <div className="lg:col-span-3">
                    <FieldLabel>External reference (optional)</FieldLabel>
                    <Input
                      value={externalReference}
                      onChange={(event) =>
                        setExternalReference(event.target.value)
                      }
                      className="h-9 rounded-xl border-[#d3dfec] text-xs"
                      maxLength={160}
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <FieldLabel>Expected receipt / movement date</FieldLabel>
                    <AppDateInput
                      aria-label="Expected receipt / movement date"
                      value={expectedReceiptDate}
                      onChange={(value) =>
                        setExpectedReceiptDate(value)
                      }
                      inputClassName="h-9 rounded-xl border-[#d3dfec] text-xs"
                    />
                  </div>
                </>
              ) : (
                <div className="lg:col-span-7">
                  <FieldLabel>Cancellation reason</FieldLabel>
                  <Input
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    className="h-9 rounded-xl border-rose-200 text-xs"
                    placeholder="Required reason"
                    maxLength={1000}
                  />
                </div>
              )}
              {activeAction.kind !== "CANCEL" ? (
                <div className="lg:col-span-2">
                  <FieldLabel>Note (optional)</FieldLabel>
                  <Input
                    value={actionNote}
                    onChange={(event) => setActionNote(event.target.value)}
                    className="h-9 rounded-xl border-[#d3dfec] text-xs"
                    maxLength={1000}
                  />
                </div>
              ) : null}
              <div className="flex items-end gap-2 lg:col-span-1 lg:justify-end">
                <Button
                  type="button"
                  size="sm"
                  disabled={actionPending}
                  onClick={() => void submitAction()}
                  className={
                    activeAction.kind === "CANCEL"
                      ? "bg-rose-600 hover:bg-rose-700"
                      : ""
                  }
                >
                  {actionPending ? "Posting…" : "Post"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
