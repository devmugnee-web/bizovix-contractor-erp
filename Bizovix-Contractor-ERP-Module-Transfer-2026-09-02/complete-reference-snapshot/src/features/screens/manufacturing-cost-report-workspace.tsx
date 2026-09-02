"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Calculator,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { ManufacturingEmptyState } from "@/components/shared/manufacturing-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatAmount, formatDate } from "@/lib/format";
import {
  approveManufacturingStandardCost,
  createManufacturingCostDriver,
  createManufacturingStandardCost,
  finalizeManufacturingActualCost,
  getManufacturingCostConfiguration,
  getManufacturingOrderCosting,
  getManufacturingReport,
  listManufacturingCostDrivers,
  listManufacturingStandardCosts,
  postManufacturingActualCost,
  updateManufacturingCostDriver,
} from "@/services/manufacturing-cost-report.service";
import { listManufacturingOrders } from "@/services/manufacturing.service";
import type {
  ManufacturingActualCostType,
  ManufacturingCostDriverBasis,
  ManufacturingReportColumn,
  ManufacturingReportQuery,
  ManufacturingStandardCostLineInput,
} from "@/types/manufacturing-cost-report";
import type { ManufacturingProductionOrderSummary } from "@/types/manufacturing";
import type { ManufacturingInventoryOption } from "./manufacturing-control-center-workspaces";

type CostReportWorkspaceProps = {
  workspaceId?: string;
  section: "masters" | "costing" | "reports";
  view: string;
  title: string;
  items: ManufacturingInventoryOption[];
};

const inputClass = "h-9 rounded-lg border-[#d7e1ee] bg-white text-sm";
const selectClass =
  "h-9 w-full rounded-lg border border-[#d7e1ee] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#8dbbf2]";
const textareaClass =
  "min-h-20 w-full resize-y rounded-lg border border-[#d7e1ee] bg-white px-3 py-2 text-sm text-[#334155] outline-none placeholder:text-[#94a3b8] focus:border-[#8dbbf2]";

const costTypeLabels: Record<ManufacturingActualCostType, string> = {
  LABOUR: "Labour",
  MACHINE: "Machine",
  OVERHEAD: "Factory overhead",
  SUBCONTRACT: "Subcontract",
  OTHER: "Other",
};

const basisLabels: Record<ManufacturingCostDriverBasis, string> = {
  FLAT: "Flat amount",
  OUTPUT_QUANTITY: "Output quantity",
  LABOUR_HOURS: "Labour hours",
  MACHINE_HOURS: "Machine hours",
  MATERIAL_COST_PERCENT: "Material cost %",
  PRIME_COST_PERCENT: "Prime cost %",
};

const postingViews = new Set([
  "actual-batch-cost",
  "labour-cost",
  "machine-cost",
  "factory-overhead",
  "subcontract-cost",
]);

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function localDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function idempotencyKey(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return `${prefix}:${crypto.randomUUID()}`;
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function SectionCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[#d8e2ee] bg-white shadow-[0_8px_28px_rgba(30,64,175,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e4ebf3] bg-white px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[#1f314d]">{title}</h3>
          {description ? (
            <p className="mt-0.5 text-xs text-[#718096]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-[#64748b]">
      <RefreshCw className="h-4 w-4 animate-spin" /> Loading real manufacturing
      records…
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <ManufacturingEmptyState
      compact
      icon={FileSpreadsheet}
      title="No posted records found"
      description={message}
      className="border-transparent bg-transparent"
    />
  );
}

function filteredCostType(
  view: string,
): ManufacturingActualCostType | undefined {
  if (view === "labour-cost") return "LABOUR";
  if (view === "machine-cost") return "MACHINE";
  if (view === "factory-overhead") return "OVERHEAD";
  if (view === "subcontract-cost") return "SUBCONTRACT";
  return undefined;
}

function CostPostingWorkspace({
  workspaceId,
  view,
}: {
  workspaceId: string;
  view: string;
}) {
  const queryClient = useQueryClient();
  const typeFilter = filteredCostType(view);
  const [selectedOrderId, setSelectedOrderId] = useState("");
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [standardCostVersionId, setStandardCostVersionId] = useState("");
  const [transactionDate, setTransactionDate] = useState(localDate());
  const [basisQuantity, setBasisQuantity] = useState("1");
  const [description, setDescription] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");

  const configuration = useQuery({
    queryKey: ["manufacturing-cost-configuration", workspaceId],
    queryFn: () => getManufacturingCostConfiguration(workspaceId),
  });
  const drivers = useQuery({
    queryKey: ["manufacturing-cost-drivers", workspaceId],
    queryFn: () => listManufacturingCostDrivers(workspaceId),
  });
  const orders = useQuery({
    queryKey: ["manufacturing-cost-orders", workspaceId],
    queryFn: () => listManufacturingOrders({ workspaceId }),
  });
  const orderCosting = useQuery({
    queryKey: ["manufacturing-order-costing", workspaceId, selectedOrderId],
    queryFn: () => getManufacturingOrderCosting(workspaceId, selectedOrderId),
    enabled: Boolean(selectedOrderId),
  });

  const activeOrders = useMemo(
    () =>
      (orders.data ?? []).filter(
        (order) => !["CLOSED", "CANCELLED"].includes(order.status),
      ),
    [orders.data],
  );
  const activeDrivers = useMemo(
    () =>
      (drivers.data ?? []).filter(
        (driver) =>
          driver.isActive && (!typeFilter || driver.costType === typeFilter),
      ),
    [drivers.data, typeFilter],
  );
  const selectedDriver = activeDrivers.find(
    (driver) => driver.id === selectedDriverId,
  );
  const actualTotal = (orderCosting.data?.actualPostings ?? []).reduce(
    (sum, posting) => sum + posting.amount,
    0,
  );
  const latestSnapshot = orderCosting.data?.snapshots[0];
  const approvedStandards =
    orderCosting.data?.standardCosts.filter(
      (standard) => standard.status === "APPROVED",
    ) ?? [];

  const invalidateCosting = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["manufacturing-cost-drivers", workspaceId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["manufacturing-order-costing", workspaceId, selectedOrderId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["manufacturing-cost-report", workspaceId],
      }),
    ]);
  };

  const postCost = useMutation({
    mutationFn: () =>
      postManufacturingActualCost(selectedOrderId, {
        workspaceId,
        costDriverId: selectedDriverId,
        transactionDate,
        idempotencyKey: idempotencyKey("manufacturing-actual-cost"),
        basisQuantity: Number(basisQuantity || 0),
        description: description.trim() || selectedDriver?.name,
        referenceNo: referenceNo.trim() || null,
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      await invalidateCosting();
      setDescription("");
      setReferenceNo("");
      setNote("");
      toast.success(
        "Actual manufacturing cost posted to WIP with a balanced journal.",
      );
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Could not post the manufacturing cost."),
      ),
  });

  const finalizeCost = useMutation({
    mutationFn: () =>
      finalizeManufacturingActualCost(selectedOrderId, {
        workspaceId,
        transactionDate,
        idempotencyKey: idempotencyKey("manufacturing-cost-finalize"),
        standardCostVersionId: standardCostVersionId || null,
        note: note.trim() || null,
      }),
    onSuccess: async () => {
      await invalidateCosting();
      toast.success(
        "Actual cost snapshot finalized and finished-goods value reconciled.",
      );
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, "Could not finalize manufacturing cost."),
      ),
  });

  const readiness = configuration.data;
  const isReady = Boolean(
    readiness?.wipInventoryAccountId &&
    readiness?.finishedGoodsInventoryAccountId,
  );

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(390px,0.8fr)]">
      <div className="space-y-4">
        <SectionCard
          title="Post actual cost to production WIP"
          description="Labour, machine, overhead and external-service costs are journaled from configured clearing ledgers."
          action={
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${isReady ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
            >
              {isReady ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              {isReady ? "Accounting ready" : "Account setup required"}
            </span>
          }
        >
          <form
            className="grid gap-3 p-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedOrderId || !selectedDriverId)
                return toast.error(
                  "Select a production order and cost driver.",
                );
              postCost.mutate();
            }}
          >
            <label className="space-y-1 text-xs font-medium text-[#475569] md:col-span-2">
              Production order
              <select
                className={selectClass}
                value={selectedOrderId}
                onChange={(event) => {
                  setSelectedOrderId(event.target.value);
                  setStandardCostVersionId("");
                }}
              >
                <option value="">Select active production order</option>
                {activeOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.orderNumber} — {order.finishedProductName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-[#475569]">
              Cost driver
              <select
                className={selectClass}
                value={selectedDriverId}
                onChange={(event) => setSelectedDriverId(event.target.value)}
              >
                <option value="">Select configured driver</option>
                {activeDrivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.code} — {driver.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-[#475569]">
              Transaction date
              <AppDateInput
                aria-label="Transaction date"
                inputClassName={inputClass}
                value={transactionDate}
                onChange={(value) => setTransactionDate(value)}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[#475569]">
              {selectedDriver
                ? basisLabels[selectedDriver.basis]
                : "Basis quantity"}
              <Input
                className={inputClass}
                type="number"
                min="0"
                step="0.000001"
                value={basisQuantity}
                onChange={(event) => setBasisQuantity(event.target.value)}
                required
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[#475569]">
              External reference
              <Input
                className={inputClass}
                value={referenceNo}
                onChange={(event) => setReferenceNo(event.target.value)}
                placeholder="Timesheet, machine log or bill no."
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[#475569] md:col-span-2">
              Description / evidence note
              <textarea
                className={textareaClass}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What was incurred and the source evidence"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eef5] pt-3 md:col-span-2">
              <p className="text-xs text-[#64748b]">
                {selectedDriver
                  ? `${costTypeLabels[selectedDriver.costType]} · ${basisLabels[selectedDriver.basis]} · rate BDT ${formatAmount(selectedDriver.rate)}`
                  : "Only active configured drivers can be posted."}
              </p>
              <Button
                size="sm"
                type="submit"
                disabled={postCost.isPending || !isReady}
              >
                <Calculator className="h-4 w-4" />{" "}
                {postCost.isPending ? "Posting…" : "Post actual cost"}
              </Button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Order cost ledger"
          description="Immutable actual postings and versioned cost snapshots from the selected production order."
          action={
            selectedOrderId ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => orderCosting.refetch()}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Refresh
              </Button>
            ) : undefined
          }
        >
          {!selectedOrderId ? (
            <EmptyState message="Select a production order above to see its real postings and cost snapshots." />
          ) : orderCosting.isLoading ? (
            <LoadingState />
          ) : (
            <div>
              <div className="grid gap-3 border-b border-[#e5edf5] bg-[#fbfdff] p-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[#7b8ba3]">
                    Material snapshot
                  </p>
                  <p className="mt-1 text-base font-semibold text-[#1f314d]">
                    BDT {formatAmount(latestSnapshot?.materialCost ?? 0)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[#7b8ba3]">
                    Posted actuals
                  </p>
                  <p className="mt-1 text-base font-semibold text-[#1671e8]">
                    BDT {formatAmount(actualTotal)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-[#7b8ba3]">
                    Latest total
                  </p>
                  <p className="mt-1 text-base font-semibold text-[#0f766e]">
                    BDT {formatAmount(latestSnapshot?.totalCost ?? 0)}
                  </p>
                </div>
              </div>
              {(orderCosting.data?.actualPostings.length ?? 0) === 0 ? (
                <EmptyState message="No labour, machine, overhead, subcontract or other cost has been posted for this order." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    <thead className="bg-[#f5f8fc] text-left uppercase tracking-wide text-[#718096]">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Driver</th>
                        <th className="px-3 py-2">Basis</th>
                        <th className="px-3 py-2 text-right">Rate</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2">State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orderCosting.data?.actualPostings.map((posting) => (
                        <tr
                          key={posting.id}
                          className="border-t border-[#e6edf5] text-[#334155]"
                        >
                          <td className="px-3 py-2">
                            {formatDate(posting.transactionDate)}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium">
                              {posting.driver?.name ?? posting.description}
                            </p>
                            <p className="text-[10px] text-[#8291a6]">
                              {posting.referenceNo || posting.costType}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            {posting.basisQuantity}{" "}
                            {posting.driverBasis
                              .replaceAll("_", " ")
                              .toLowerCase()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {formatAmount(posting.rate)}
                          </td>
                          <td className="px-3 py-2 text-right font-medium tabular-nums">
                            {formatAmount(posting.amount)}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-1 text-[10px] ${posting.finalizedSnapshotId ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}
                            >
                              {posting.finalizedSnapshotId
                                ? "Finalized"
                                : "Posted"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap items-end justify-between gap-3 border-t border-[#e4ebf3] bg-[#fbfdff] p-4">
                <label className="min-w-64 flex-1 space-y-1 text-xs font-medium text-[#475569]">
                  Approved standard-cost version (optional for variance)
                  <select
                    className={selectClass}
                    value={standardCostVersionId}
                    onChange={(event) =>
                      setStandardCostVersionId(event.target.value)
                    }
                  >
                    <option value="">
                      Use effective approved version automatically
                    </option>
                    {approvedStandards.map((standard) => (
                      <option key={standard.id} value={standard.id}>
                        Version {standard.versionNumber} — BDT{" "}
                        {formatAmount(standard.totalUnitCost)} / unit
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  size="sm"
                  onClick={() => finalizeCost.mutate()}
                  disabled={
                    finalizeCost.isPending ||
                    latestSnapshot?.status === "FINALIZED"
                  }
                >
                  <ShieldCheck className="h-4 w-4" />{" "}
                  {latestSnapshot?.status === "FINALIZED"
                    ? "Cost finalized"
                    : finalizeCost.isPending
                      ? "Finalizing…"
                      : "Finalize actual cost"}
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <CostDriverManager
        workspaceId={workspaceId}
        typeFilter={typeFilter}
        configuration={configuration.data}
      />
    </div>
  );
}

function CostDriverManager({
  workspaceId,
  typeFilter,
  configuration,
}: {
  workspaceId: string;
  typeFilter?: ManufacturingActualCostType;
  configuration?: Awaited<ReturnType<typeof getManufacturingCostConfiguration>>;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    code: "",
    name: "",
    costType: typeFilter ?? ("LABOUR" as ManufacturingActualCostType),
    basis: "LABOUR_HOURS" as ManufacturingCostDriverBasis,
    unit: "hour",
    rate: "0",
    clearingAccountId: "",
    effectiveFrom: localDate(),
    effectiveTo: "",
  });
  const drivers = useQuery({
    queryKey: ["manufacturing-cost-drivers", workspaceId],
    queryFn: () => listManufacturingCostDrivers(workspaceId),
  });
  const visibleDrivers = (drivers.data ?? []).filter(
    (driver) => !typeFilter || driver.costType === typeFilter,
  );
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["manufacturing-cost-drivers", workspaceId],
    });
  const createDriver = useMutation({
    mutationFn: () =>
      createManufacturingCostDriver({
        workspaceId,
        code: form.code.trim(),
        name: form.name.trim(),
        costType: form.costType,
        basis: form.basis,
        unit: form.unit.trim() || null,
        rate: Number(form.rate || 0),
        clearingAccountId: form.clearingAccountId,
        effectiveFrom: form.effectiveFrom || null,
        effectiveTo: form.effectiveTo || null,
      }),
    onSuccess: async () => {
      await invalidate();
      setForm((current) => ({
        ...current,
        code: "",
        name: "",
        rate: "0",
        clearingAccountId: "",
      }));
      toast.success("Manufacturing cost driver saved.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not save cost driver.")),
  });
  const toggleDriver = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateManufacturingCostDriver(id, { workspaceId, isActive }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Cost driver status updated.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not update cost driver.")),
  });

  return (
    <SectionCard
      title="Cost drivers & rates"
      description="Configure real cost bases and the existing ledger credited when WIP is debited."
    >
      <form
        className="grid gap-3 p-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.code.trim() || !form.name.trim() || !form.clearingAccountId)
            return toast.error("Code, name and clearing ledger are required.");
          createDriver.mutate();
        }}
      >
        <label className="space-y-1 text-xs font-medium text-[#475569]">
          Driver code
          <Input
            className={inputClass}
            value={form.code}
            onChange={(event) =>
              setForm({ ...form, code: event.target.value.toUpperCase() })
            }
            placeholder="LAB-DIRECT"
            required
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-[#475569]">
          Driver name
          <Input
            className={inputClass}
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            placeholder="Direct labour"
            required
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-[#475569]">
          Cost type
          <select
            className={selectClass}
            value={form.costType}
            onChange={(event) =>
              setForm({
                ...form,
                costType: event.target.value as ManufacturingActualCostType,
              })
            }
          >
            {Object.entries(costTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-[#475569]">
          Calculation basis
          <select
            className={selectClass}
            value={form.basis}
            onChange={(event) =>
              setForm({
                ...form,
                basis: event.target.value as ManufacturingCostDriverBasis,
              })
            }
          >
            {Object.entries(basisLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-[#475569]">
          Rate
          <Input
            className={inputClass}
            type="number"
            min="0"
            step="0.00000001"
            value={form.rate}
            onChange={(event) => setForm({ ...form, rate: event.target.value })}
            required
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-[#475569]">
          Unit
          <Input
            className={inputClass}
            value={form.unit}
            onChange={(event) => setForm({ ...form, unit: event.target.value })}
            placeholder="hour, unit or %"
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-[#475569] sm:col-span-2">
          Clearing / accrued-cost ledger
          <select
            className={selectClass}
            value={form.clearingAccountId}
            onChange={(event) =>
              setForm({ ...form, clearingAccountId: event.target.value })
            }
            required
          >
            <option value="">Select existing postable ledger</option>
            {configuration?.ledgers.map((ledger) => (
              <option key={ledger.id} value={ledger.id}>
                {ledger.code} — {ledger.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs font-medium text-[#475569]">
          Effective from
          <AppDateInput
            aria-label="Effective from"
            inputClassName={inputClass}
            value={form.effectiveFrom}
            onChange={(value) =>
              setForm({ ...form, effectiveFrom: value })
            }
          />
        </label>
        <label className="space-y-1 text-xs font-medium text-[#475569]">
          Effective to
          <AppDateInput
            aria-label="Effective to"
            inputClassName={inputClass}
            value={form.effectiveTo}
            onChange={(value) =>
              setForm({ ...form, effectiveTo: value })
            }
          />
        </label>
        <Button
          size="sm"
          className="sm:col-span-2 sm:justify-self-end"
          type="submit"
          disabled={createDriver.isPending}
        >
          <Plus className="h-4 w-4" />{" "}
          {createDriver.isPending ? "Saving…" : "Add cost driver"}
        </Button>
      </form>
      <div className="border-t border-[#e4ebf3]">
        {drivers.isLoading ? (
          <LoadingState />
        ) : visibleDrivers.length === 0 ? (
          <EmptyState message="No cost driver has been configured for this cost type. Add one above using an existing ledger." />
        ) : (
          <div className="divide-y divide-[#e7edf4]">
            {visibleDrivers.map((driver) => (
              <div
                key={driver.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-[#27364e]">
                      {driver.name}
                    </p>
                    <span className="rounded-full bg-[#edf3fb] px-2 py-0.5 text-[10px] text-[#52657d]">
                      {driver.code}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${driver.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}
                    >
                      {driver.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <p className="mt-1 text-[#75859b]">
                    {basisLabels[driver.basis]} · BDT{" "}
                    {formatAmount(driver.rate)}
                    {driver.unit ? ` / ${driver.unit}` : ""}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-[#8b98aa]">
                    Cr{" "}
                    {driver.clearingAccount
                      ? `${driver.clearingAccount.code} — ${driver.clearingAccount.name}`
                      : driver.clearingAccountId}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8"
                  disabled={toggleDriver.isPending}
                  onClick={() =>
                    toggleDriver.mutate({
                      id: driver.id,
                      isActive: !driver.isActive,
                    })
                  }
                >
                  {driver.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function CostDriverSetupWorkspace({ workspaceId }: { workspaceId: string }) {
  const configuration = useQuery({
    queryKey: ["manufacturing-cost-configuration", workspaceId],
    queryFn: () => getManufacturingCostConfiguration(workspaceId),
  });

  return (
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(340px,0.7fr)]">
      <CostDriverManager
        workspaceId={workspaceId}
        configuration={configuration.data}
      />
      <SectionCard
        title="Accounting control"
        description="Cost drivers may reference existing postable ledgers only."
      >
        {configuration.isLoading ? (
          <LoadingState />
        ) : configuration.isError ? (
          <div className="p-5 text-sm text-rose-700">
            {errorMessage(
              configuration.error,
              "Could not load manufacturing accounting configuration.",
            )}
          </div>
        ) : (
          <div className="space-y-3 p-4 text-xs">
            {[
              ["WIP inventory", configuration.data?.wipInventoryAccountId],
              [
                "Finished-goods inventory",
                configuration.data?.finishedGoodsInventoryAccountId,
              ],
              [
                "Manufacturing variance",
                configuration.data?.manufacturingVarianceAccountId,
              ],
            ].map(([label, accountId]) => {
              const ledger = configuration.data?.ledgers.find(
                (entry) => entry.id === accountId,
              );
              return (
                <div
                  key={label}
                  className="rounded-xl border border-[#e1e9f2] bg-[#fbfdff] p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-[#40516a]">{label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] ${ledger ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}
                    >
                      {ledger ? "Configured" : "Required"}
                    </span>
                  </div>
                  <p className="mt-1 text-[#78889d]">
                    {ledger
                      ? `${ledger.code} — ${ledger.name}`
                      : "Not configured"}
                  </p>
                </div>
              );
            })}
            <div className="flex gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-blue-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                {configuration.data?.accountSafety ??
                  "This workspace does not create or change Chart of Accounts rows."}
              </p>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

type StandardLineDraft = ManufacturingStandardCostLineInput & {
  clientId: string;
  quantity: number;
  rate: number;
};

function StandardCostWorkspace({
  workspaceId,
  items,
}: {
  workspaceId: string;
  items: ManufacturingInventoryOption[];
}) {
  const queryClient = useQueryClient();
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(localDate());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<StandardLineDraft[]>([
    {
      clientId: "line-1",
      sequence: 1,
      costType: "MATERIAL",
      description: "Material standard",
      quantity: 1,
      rate: 0,
    },
  ]);
  const versions = useQuery({
    queryKey: ["manufacturing-standard-costs", workspaceId, inventoryItemId],
    queryFn: () =>
      listManufacturingStandardCosts(workspaceId, {
        inventoryItemId: inventoryItemId || undefined,
      }),
  });
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["manufacturing-standard-costs", workspaceId],
    });
  const createVersion = useMutation({
    mutationFn: () =>
      createManufacturingStandardCost({
        workspaceId,
        inventoryItemId,
        effectiveFrom,
        notes: notes.trim() || null,
        lines: lines.map((line, index) => ({
          sequence: index + 1,
          costType: line.costType,
          description: line.description,
          quantity: line.quantity,
          rate: line.rate,
          costDriverId: line.costDriverId,
          clearingAccountId: line.clearingAccountId,
        })),
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Draft standard-cost version saved.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not save standard-cost version.")),
  });
  const approveVersion = useMutation({
    mutationFn: (versionId: string) =>
      approveManufacturingStandardCost(versionId, {
        workspaceId,
        transactionDate: localDate(),
        idempotencyKey: idempotencyKey("manufacturing-standard-cost-approval"),
      }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Standard-cost version approved.");
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Could not approve standard cost.")),
  });
  const total = lines.reduce(
    (sum, line) => sum + Number(line.quantity || 0) * Number(line.rate || 0),
    0,
  );

  const updateLine = (clientId: string, patch: Partial<StandardLineDraft>) =>
    setLines((current) =>
      current.map((line) =>
        line.clientId === clientId ? { ...line, ...patch } : line,
      ),
    );

  return (
    <div className="space-y-4 p-4">
      <SectionCard
        title="Versioned standard cost"
        description="Build an auditable product cost; approval retires the prior effective version without deleting history."
      >
        <form
          className="space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (
              !inventoryItemId ||
              lines.some((line) => !line.description.trim())
            )
              return toast.error(
                "Select a product and complete every cost line.",
              );
            createVersion.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_180px_minmax(260px,1fr)]">
            <label className="space-y-1 text-xs font-medium text-[#475569]">
              Manufactured product
              <select
                className={selectClass}
                value={inventoryItemId}
                onChange={(event) => setInventoryItemId(event.target.value)}
                required
              >
                <option value="">Select inventory item</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemCode} — {item.itemName}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium text-[#475569]">
              Effective from
              <AppDateInput
                aria-label="Effective from"
                inputClassName={inputClass}
                value={effectiveFrom}
                onChange={(value) => setEffectiveFrom(value)}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-[#475569]">
              Version note
              <Input
                className={inputClass}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Basis, quotation or approval reference"
              />
            </label>
          </div>
          <div className="overflow-hidden rounded-xl border border-[#dfe7f0]">
            <div className="grid grid-cols-[155px_minmax(220px,1fr)_110px_140px_140px_40px] gap-2 bg-[#f3f7fb] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#718096]">
              <span>Cost type</span>
              <span>Description</span>
              <span className="text-right">Quantity</span>
              <span className="text-right">Rate</span>
              <span className="text-right">Amount</span>
              <span />
            </div>
            <div className="divide-y divide-[#e8eef5]">
              {lines.map((line) => (
                <div
                  key={line.clientId}
                  className="grid grid-cols-[155px_minmax(220px,1fr)_110px_140px_140px_40px] items-center gap-2 px-3 py-2"
                >
                  <select
                    className={selectClass}
                    value={line.costType}
                    onChange={(event) =>
                      updateLine(line.clientId, {
                        costType: event.target
                          .value as StandardLineDraft["costType"],
                      })
                    }
                  >
                    {[
                      "MATERIAL",
                      "LABOUR",
                      "MACHINE",
                      "OVERHEAD",
                      "PACKAGING",
                      "SUBCONTRACT",
                      "OTHER",
                    ].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <Input
                    className={inputClass}
                    value={line.description}
                    onChange={(event) =>
                      updateLine(line.clientId, {
                        description: event.target.value,
                      })
                    }
                  />
                  <Input
                    className={`${inputClass} text-right`}
                    type="number"
                    min="0"
                    step="0.000001"
                    value={line.quantity}
                    onChange={(event) =>
                      updateLine(line.clientId, {
                        quantity: Number(event.target.value),
                      })
                    }
                  />
                  <Input
                    className={`${inputClass} text-right`}
                    type="number"
                    min="0"
                    step="0.00000001"
                    value={line.rate}
                    onChange={(event) =>
                      updateLine(line.clientId, {
                        rate: Number(event.target.value),
                      })
                    }
                  />
                  <p className="text-right text-xs font-semibold tabular-nums text-[#27364e]">
                    {formatAmount(line.quantity * line.rate)}
                  </p>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-rose-600"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter(
                          (entry) => entry.clientId !== line.clientId,
                        ),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dfe7f0] bg-[#fbfdff] px-3 py-3">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    {
                      clientId: idempotencyKey("line"),
                      sequence: current.length + 1,
                      costType: "OTHER",
                      description: "",
                      quantity: 1,
                      rate: 0,
                    },
                  ])
                }
              >
                <Plus className="h-4 w-4" /> Add cost line
              </Button>
              <p className="text-sm font-semibold text-[#1f314d]">
                Standard unit cost:{" "}
                <span className="text-[#1671e8]">
                  BDT {formatAmount(total)}
                </span>
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" type="submit" disabled={createVersion.isPending}>
              {createVersion.isPending ? "Saving…" : "Save draft version"}
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Standard-cost register"
        description="Draft, approved and retired product-cost versions are retained as permanent history."
      >
        {versions.isLoading ? (
          <LoadingState />
        ) : (versions.data?.length ?? 0) === 0 ? (
          <EmptyState message="No standard-cost version has been saved. The register only shows real persisted versions." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#f4f7fb] text-left uppercase tracking-wide text-[#718096]">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">Version</th>
                  <th className="px-3 py-2">Effective</th>
                  <th className="px-3 py-2 text-right">Unit cost</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {versions.data?.map((version) => (
                  <tr key={version.id} className="border-t border-[#e5edf5]">
                    <td className="px-3 py-2 font-medium text-[#27364e]">
                      {version.inventoryItem?.itemName ??
                        version.inventoryItemId}
                    </td>
                    <td className="px-3 py-2">v{version.versionNumber}</td>
                    <td className="px-3 py-2">
                      {version.effectiveFrom
                        ? formatDate(version.effectiveFrom)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">
                      {formatAmount(version.totalUnitCost)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] ${version.status === "APPROVED" ? "bg-emerald-50 text-emerald-700" : version.status === "DRAFT" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
                      >
                        {version.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {version.status === "DRAFT" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={approveVersion.isPending}
                          onClick={() => approveVersion.mutate(version.id)}
                        >
                          Approve
                        </Button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function exportReportCsv(
  title: string,
  columns: ManufacturingReportColumn[],
  rows: Array<Record<string, unknown>>,
) {
  const csv = [
    columns.map((column) => csvCell(column.label)).join(","),
    ...rows.map((row) =>
      columns.map((column) => csvCell(row[column.key])).join(","),
    ),
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "manufacturing-report"
  }.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ReportWorkspace({
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
  const [draft, setDraft] = useState({
    search: "",
    from: "",
    to: "",
    orderId: "",
    inventoryItemId: "",
    status: "",
    lotNumber: "",
    serialNumber: "",
  });
  const [filters, setFilters] = useState(draft);
  const orders = useQuery({
    queryKey: ["manufacturing-cost-orders", workspaceId],
    queryFn: () => listManufacturingOrders({ workspaceId }),
  });
  const reportQuery: ManufacturingReportQuery = {
    workspaceId,
    ...filters,
    limit: 1000,
  };
  const report = useQuery({
    queryKey: ["manufacturing-cost-report", workspaceId, view, filters],
    queryFn: () => getManufacturingReport(view, reportQuery),
  });

  const formatCell = (column: ManufacturingReportColumn, value: unknown) => {
    if (value === null || value === undefined || value === "") return "—";
    if (column.type === "money") return `BDT ${formatAmount(value as number)}`;
    if (column.type === "date") return formatDate(String(value));
    if (column.type === "quantity" && typeof value === "number")
      return new Intl.NumberFormat("en-BD", {
        maximumFractionDigits: 6,
      }).format(value);
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value).replaceAll("_", " ");
  };

  return (
    <div className="p-4">
      <SectionCard
        title={title}
        description="Live register generated only from persisted manufacturing transactions, inspections, lots, serials and journals."
        action={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!report.data?.rows.length}
              onClick={() =>
                report.data &&
                exportReportCsv(title, report.data.columns, report.data.rows)
              }
            >
              <Download className="h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </div>
        }
      >
        <form
          className="grid gap-2 border-b border-[#e4ebf3] bg-[#fbfdff] p-3 md:grid-cols-2 xl:grid-cols-[minmax(240px,1.4fr)_150px_150px_220px_220px_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ ...draft });
          }}
        >
          <Input
            className={inputClass}
            value={draft.search}
            onChange={(event) =>
              setDraft({ ...draft, search: event.target.value })
            }
            placeholder="Search production, item, document, lot or serial…"
          />
          <AppDateInput
            inputClassName={inputClass}
            value={draft.from}
            onChange={(value) =>
              setDraft({ ...draft, from: value })
            }
            aria-label="From date"
          />
          <AppDateInput
            inputClassName={inputClass}
            value={draft.to}
            onChange={(value) => setDraft({ ...draft, to: value })}
            aria-label="To date"
          />
          <select
            className={selectClass}
            value={draft.orderId}
            onChange={(event) =>
              setDraft({ ...draft, orderId: event.target.value })
            }
          >
            <option value="">All production orders</option>
            {(orders.data ?? []).map(
              (order: ManufacturingProductionOrderSummary) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber}
                </option>
              ),
            )}
          </select>
          <select
            className={selectClass}
            value={draft.inventoryItemId}
            onChange={(event) =>
              setDraft({ ...draft, inventoryItemId: event.target.value })
            }
          >
            <option value="">All inventory items</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.itemCode} — {item.itemName}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Button size="sm" type="submit">
              <SlidersHorizontal className="h-4 w-4" /> Apply
            </Button>
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => {
                const empty = {
                  search: "",
                  from: "",
                  to: "",
                  orderId: "",
                  inventoryItemId: "",
                  status: "",
                  lotNumber: "",
                  serialNumber: "",
                };
                setDraft(empty);
                setFilters(empty);
              }}
            >
              Clear
            </Button>
          </div>
          <Input
            className={inputClass}
            value={draft.lotNumber}
            onChange={(event) =>
              setDraft({ ...draft, lotNumber: event.target.value })
            }
            placeholder="Lot / batch filter"
          />
          <Input
            className={inputClass}
            value={draft.serialNumber}
            onChange={(event) =>
              setDraft({ ...draft, serialNumber: event.target.value })
            }
            placeholder="Serial filter"
          />
          <Input
            className={inputClass}
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value.toUpperCase() })
            }
            placeholder="Exact status filter"
          />
        </form>

        {report.isLoading ? (
          <LoadingState />
        ) : report.isError ? (
          <div className="p-6 text-sm text-rose-700">
            {errorMessage(report.error, "Could not load manufacturing report.")}
          </div>
        ) : (report.data?.rows.length ?? 0) === 0 ? (
          <EmptyState message="Adjust the filters or complete and post the relevant manufacturing workflow. No demonstration data is inserted." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-[#f2f6fb] text-left uppercase tracking-wide text-[#65758b]">
                <tr>
                  {report.data?.columns.map((column) => (
                    <th
                      key={column.key}
                      className={`whitespace-nowrap border-b border-[#dce5ef] px-3 py-2.5 ${column.type === "money" || column.type === "quantity" ? "text-right" : ""}`}
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.data?.rows.map((row, rowIndex) => (
                  <tr
                    key={String(
                      row.id ??
                        row.orderId ??
                        row.transactionId ??
                        row.postingId ??
                        rowIndex,
                    )}
                    className="border-b border-[#e7edf4] text-[#334155] hover:bg-[#f9fbfe]"
                  >
                    {report.data?.columns.map((column) => (
                      <td
                        key={column.key}
                        className={`max-w-72 whitespace-nowrap px-3 py-2.5 ${column.type === "money" || column.type === "quantity" ? "text-right font-medium tabular-nums" : ""}`}
                      >
                        {formatCell(column, row[column.key])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {report.data && Object.keys(report.data.totals).length ? (
                <tfoot className="bg-[#f5f9ff] font-semibold text-[#1f314d]">
                  <tr>
                    {report.data.columns.map((column, index) => (
                      <td
                        key={column.key}
                        className={`border-t border-[#cfdced] px-3 py-2.5 ${column.type === "money" || column.type === "quantity" ? "text-right tabular-nums" : ""}`}
                      >
                        {index === 0
                          ? "Total"
                          : report.data?.totals[column.key] !== undefined
                            ? formatCell(column, report.data.totals[column.key])
                            : ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4ebf3] bg-[#fbfdff] px-4 py-2 text-[11px] text-[#708198]">
          <span>
            {report.data?.rowCount ?? 0} persisted rows
            {report.data?.truncated ? " · limited to first 1,000" : ""}
          </span>
          <span>
            {report.data?.generatedAt
              ? `Generated ${formatDate(report.data.generatedAt)}`
              : "Export-ready after loading"}
          </span>
        </div>
      </SectionCard>
    </div>
  );
}

export function ManufacturingCostReportWorkspace({
  workspaceId,
  section,
  view,
  title,
  items,
}: CostReportWorkspaceProps) {
  if (!workspaceId)
    return (
      <EmptyState message="Select an active company workspace before using manufacturing costing or reports." />
    );
  if (section === "masters" && view === "cost-drivers-and-overhead-rules")
    return <CostDriverSetupWorkspace workspaceId={workspaceId} />;
  if (section === "costing" && view === "standard-cost")
    return <StandardCostWorkspace workspaceId={workspaceId} items={items} />;
  if (section === "costing" && postingViews.has(view))
    return <CostPostingWorkspace workspaceId={workspaceId} view={view} />;
  return (
    <ReportWorkspace
      workspaceId={workspaceId}
      view={view}
      title={title}
      items={items}
    />
  );
}
