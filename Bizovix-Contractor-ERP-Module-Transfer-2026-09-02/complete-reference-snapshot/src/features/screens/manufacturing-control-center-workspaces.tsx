"use client";

import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  CalendarClock,
  BookOpen,
  Boxes,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Factory,
  FileClock,
  FlaskConical,
  Gauge,
  History,
  Layers3,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Route,
  Settings2,
  ShieldCheck,
  Trash2,
  Warehouse,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { ManufacturingEmptyState } from "@/components/shared/manufacturing-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  buildManufacturingOrderAmendmentPayload,
  resolveManufacturingOrderAction,
} from "@/features/screens/manufacturing-order-amendment";
import {
  isManufacturingDispositionAction,
  manufacturingDispositionCandidates,
  type ManufacturingDispositionCandidate,
} from "@/features/screens/manufacturing-operation-disposition";
import { ManufacturingRoutingResourceRequirements } from "@/features/screens/manufacturing-routing-resource-requirements";
import { usePostableLedgersQuery } from "@/hooks/use-accounts-query";
import {
  useApproveManufacturingBomVersionMutation,
  useApproveManufacturingPlanMutation,
  useApproveManufacturingRoutingVersionMutation,
  useCalculateManufacturingMrpMutation,
  useCreateManufacturingBomMutation,
  useCreateManufacturingBomVersionMutation,
  useCreateManufacturingItemProfileMutation,
  useCreateManufacturingLocationMutation,
  useCreateManufacturingOrderMutation,
  useCreateManufacturingPlanMutation,
  useCreateManufacturingRoutingMutation,
  useCreateManufacturingRoutingVersionMutation,
  useCreateManufacturingWorkflowReviewMutation,
  useManufacturingAvailabilityQuery,
  useManufacturingBomsQuery,
  useManufacturingDashboardQuery,
  useManufacturingItemProfilesQuery,
  useManufacturingLocationsQuery,
  useManufacturingMrpRunsQuery,
  useManufacturingOrderActionMutation,
  useManufacturingOrderQualitySpecificationQuery,
  useManufacturingOrderQuery,
  useManufacturingOrdersQuery,
  useManufacturingPlansQuery,
  useManufacturingReadinessQuery,
  useManufacturingRoutingsQuery,
  useManufacturingRoutingAssigneesQuery,
  useManufacturingRunPreflightQuery,
  useManufacturingSettingsQuery,
  useManufacturingWorkflowReviewsQuery,
  useTransitionManufacturingWorkflowReviewMutation,
  useUpdateManufacturingSettingsMutation,
  useUpdateManufacturingItemProfileMutation,
  useUpdateManufacturingLocationMutation,
} from "@/hooks/use-manufacturing-query";
import {
  formatAmount,
  formatDate,
  formatDateTime as formatCanonicalDateTime,
} from "@/lib/format";
import type { WarehouseRecord } from "@/services/warehouse.service";
import type { LedgerOption } from "@/types/accounts";
import type {
  ManufacturingAvailabilityQuery,
  ManufacturingApplicableQualitySpecification,
  ManufacturingBomComponentInput,
  ManufacturingBomRecord,
  ManufacturingBomVersionRecord,
  ManufacturingItemProfileRecord,
  ManufacturingItemRole,
  ManufacturingJsonObject,
  ManufacturingLocationDisposition,
  ManufacturingLocationRecord,
  ManufacturingMode,
  ManufacturingOrderActionKind,
  ManufacturingOrderActionLineInput,
  ManufacturingOrderStatus,
  ManufacturingOrderType,
  ManufacturingPlanLotInput,
  ManufacturingPlanRecord,
  ManufacturingProductionOrderRecord,
  ManufacturingReworkDispositionPayload,
  ManufacturingRoutingRecord,
  ManufacturingRoutingOperationInput,
  ManufacturingScrapDispositionPayload,
  ManufacturingSettingsRecord,
  ManufacturingWorkflowGroup,
  ManufacturingWorkflowOutcome,
  ManufacturingWorkflowReviewRecord,
  ManufacturingWorkflowReviewStatus,
} from "@/types/manufacturing";

export type ManufacturingInventoryOption = {
  id: string;
  itemCode: string;
  itemName: string;
  unit: string;
};

type OpenTarget = (group: ManufacturingWorkflowGroup, view: string) => void;

const inputClass = "h-9 rounded-lg border-[#d7e1ee] bg-white text-sm";
const selectClass =
  "h-9 w-full rounded-lg border border-[#d7e1ee] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#8dbbf2]";
const textareaClass =
  "min-h-20 w-full resize-y rounded-lg border border-[#d7e1ee] bg-white px-3 py-2 text-sm text-[#334155] outline-none placeholder:text-[#94a3b8] focus:border-[#8dbbf2]";

const orderStatusLabels: Record<ManufacturingOrderStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  APPROVED: "Approved",
  RESERVED: "Reserved",
  ISSUED: "Materials issued",
  IN_PRODUCTION: "In production",
  QC_HOLD: "QC hold",
  QA_RELEASED: "QA released",
  COMPLETED: "Completed",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const orderTypeLabels: Record<ManufacturingOrderType, string> = {
  ASSEMBLY: "Assembly",
  PHARMACEUTICAL: "Pharmaceutical batch",
  PACKAGING: "Packaging",
  REWORK: "Rework",
  REPROCESSING: "Reprocessing",
  SUBCONTRACT: "Subcontract",
};

const itemRoleLabels: Record<ManufacturingItemRole, string> = {
  RAW_MATERIAL: "Raw material",
  PACKAGING_MATERIAL: "Packaging material",
  INTERMEDIATE: "Intermediate",
  BULK: "Bulk product",
  FINISHED_GOOD: "Finished good",
  BY_PRODUCT: "By-product",
  CONSUMABLE: "Consumable",
};

const workflowOutcomeLabels: Record<ManufacturingWorkflowOutcome, string> = {
  EXECUTED: "Executed",
  ZERO_REVIEW: "Zero-activity review",
  NOT_APPLICABLE: "Not applicable",
};

const workflowStatusLabels: Record<ManufacturingWorkflowReviewStatus, string> =
  {
    PENDING: "Pending",
    REVIEWED: "Reviewed",
    APPROVED: "Approved",
    REJECTED: "Rejected",
  };

const allOrderTypes = Object.keys(orderTypeLabels) as ManufacturingOrderType[];
const allOrderStatuses = Object.keys(
  orderStatusLabels,
) as ManufacturingOrderStatus[];
const allItemRoles = Object.keys(itemRoleLabels) as ManufacturingItemRole[];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function makeIdempotencyKey(scope: string) {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `manufacturing-ui:${scope}:${suffix}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return formatCanonicalDateTime(value);
}

function formatQuantity(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function statusTone(status: string) {
  if (
    [
      "READY",
      "APPROVED",
      "QA_RELEASED",
      "COMPLETED",
      "CLOSED",
      "EXECUTED",
    ].includes(status)
  ) {
    return "border-[#bde5cf] bg-[#edf9f2] text-[#08783d]";
  }
  if (["BLOCKED", "QC_HOLD", "CANCELLED", "REJECTED"].includes(status)) {
    return "border-[#f1c4c4] bg-[#fff1f1] text-[#b42318]";
  }
  if (["WARNING", "ZERO_REVIEW", "NOT_APPLICABLE"].includes(status)) {
    return "border-[#f3d5a7] bg-[#fff8eb] text-[#9a5b0a]";
  }
  return "border-[#cfe0f4] bg-[#f1f7ff] text-[#2563eb]";
}

function StatusPill({ value, label }: { value: string; label?: string }) {
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold ${statusTone(value)}`}
    >
      {label ?? value.replaceAll("_", " ")}
    </span>
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
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#f2c7c1] bg-[#fff7f5] px-4 py-3 text-sm text-[#a33a2b]">
      <span className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" />
        {message}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={onRetry}>
        <RefreshCw className="h-3.5 w-3.5" />
        Retry
      </Button>
    </div>
  );
}

function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-xl border border-[#dbe4ef] bg-white text-sm text-[#718096]">
      <RefreshCw className="mr-2 h-4 w-4 animate-spin text-[#2478df]" />
      {label}
    </div>
  );
}

function EmptyRegister({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Factory;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#d7e6f7] bg-[#f0f7ff] text-[#2478df]">
        <Icon className="h-7 w-7" />
      </span>
      <h3 className="mt-3 text-sm font-semibold text-[#172b49]">{title}</h3>
      <p className="mt-1 max-w-lg text-xs leading-5 text-[#718096]">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[11px] font-semibold text-[#52647d]">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[10px] leading-4 text-[#8290a4]">
          {hint}
        </span>
      ) : null}
    </label>
  );
}

function CheckboxField({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[#dce5ef] bg-white p-3 hover:bg-[#f8fbff]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[#2478df]"
      />
      <span>
        <span className="block text-xs font-semibold text-[#334155]">
          {label}
        </span>
        <span className="mt-0.5 block text-[10px] leading-4 text-[#7b8798]">
          {description}
        </span>
      </span>
    </label>
  );
}

export function ManufacturingDashboardWorkspace({
  workspaceId,
  onOpenOrder,
  onOpenTarget,
  warehouses,
}: {
  workspaceId?: string;
  onOpenOrder: (orderId: string) => void;
  onOpenTarget: OpenTarget;
  warehouses: WarehouseRecord[];
}) {
  const dashboardQuery = useManufacturingDashboardQuery(workspaceId);
  const readinessQuery = useManufacturingReadinessQuery(workspaceId);
  const finishedProfilesQuery = useManufacturingItemProfilesQuery(
    workspaceId ? { workspaceId, role: "FINISHED_GOOD", active: true } : null,
  );
  const [preflightProductId, setPreflightProductId] = useState("");
  const [preflightQuantity, setPreflightQuantity] = useState("1");
  const [preflightAsOf, setPreflightAsOf] = useState(todayIso());
  const [preflightWarehouseId, setPreflightWarehouseId] = useState("");
  const [preflightEnabled, setPreflightEnabled] = useState(false);
  const finishedProfiles = (finishedProfilesQuery.data ?? []).filter(
    (profile) => profile.makeBuy === "MAKE" || profile.makeBuy === "BOTH",
  );
  const selectedPreflightProductId =
    preflightProductId || finishedProfiles[0]?.inventoryItemId || "";
  const preflightQuery = useManufacturingRunPreflightQuery(
    workspaceId && selectedPreflightProductId
      ? {
          workspaceId,
          finishedProductId: selectedPreflightProductId,
          quantity: Number(preflightQuantity) || 0,
          sourceWarehouseId: preflightWarehouseId || undefined,
          asOf: preflightAsOf,
        }
      : null,
    preflightEnabled,
  );
  const dashboard = dashboardQuery.data;
  const readiness = readinessQuery.data;
  const kpis = dashboard
    ? [
        {
          label: "Planned orders",
          value: dashboard.plannedOrders,
          icon: ClipboardList,
          tone: "bg-[#eff6ff] text-[#2563eb]",
        },
        {
          label: "Ready to start",
          value: dashboard.readyToStart,
          icon: CheckCircle2,
          tone: "bg-[#ecfdf5] text-[#059669]",
        },
        {
          label: "Material shortage",
          value: dashboard.materialShortage,
          icon: AlertTriangle,
          tone: "bg-[#fff7ed] text-[#d97706]",
        },
        {
          label: "In production",
          value: dashboard.inProduction,
          icon: Factory,
          tone: "bg-[#f5f3ff] text-[#7c3aed]",
        },
        {
          label: "QC / IPC hold",
          value: dashboard.qualityHold,
          icon: FlaskConical,
          tone: "bg-[#fef2f2] text-[#dc2626]",
        },
        {
          label: "QA release pending",
          value: dashboard.releasePending,
          icon: ShieldCheck,
          tone: "bg-[#f0fdfa] text-[#0f766e]",
        },
        {
          label: "Completed today",
          value: dashboard.completedToday,
          icon: Gauge,
          tone: "bg-[#edf5ff] text-[#1767c5]",
        },
        {
          label: "WIP value",
          value: `BDT ${formatAmount(dashboard.wipValue)}`,
          icon: Settings2,
          tone: "bg-[#fff7ed] text-[#c26b0a]",
        },
      ]
    : [];

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;

  return (
    <div className="flex min-h-max flex-none flex-col gap-3">
      {dashboardQuery.isError ? (
        <QueryError
          message={getErrorMessage(
            dashboardQuery.error,
            "Manufacturing dashboard could not be loaded.",
          )}
          onRetry={() => void dashboardQuery.refetch()}
        />
      ) : null}
      {readinessQuery.isError ? (
        <QueryError
          message={getErrorMessage(
            readinessQuery.error,
            "Manufacturing readiness could not be evaluated.",
          )}
          onRetry={() => void readinessQuery.refetch()}
        />
      ) : null}

      {dashboardQuery.isLoading ? (
        <LoadingPanel label="Loading live manufacturing dashboard…" />
      ) : dashboard ? (
        <>
          {/* Keep the KPI strip compact so the operational workspace remains visible
           * without sacrificing any metric or forcing an extra dashboard scroll. */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {kpis.map(({ label, value, icon: Icon, tone }) => (
              <div
                key={label}
                className="rounded-xl border border-[#dbe4ef] bg-white p-2 shadow-[0_3px_12px_rgba(30,64,175,0.04)]"
              >
                <div className="flex items-start justify-between gap-1.5 sm:gap-2">
                  <span className="text-[11px] font-medium leading-4 text-[#60718a] sm:text-xs">
                    {label}
                  </span>
                  <span className={`shrink-0 rounded-lg p-1.5 ${tone}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="mt-1 text-lg font-semibold leading-6 text-[#14233b] sm:text-xl">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-[#dbe4ef] bg-white p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-semibold text-[#14233b]">
                  Production Pipeline
                </h2>
                <p className="text-xs text-[#7b8798]">
                  Live order counts by controlled status as of{" "}
                  {formatDateTime(dashboard.asOf)}.
                </p>
              </div>
              <span className="rounded-full bg-[#f1f5f9] px-3 py-1 text-xs text-[#64748b]">
                {dashboard.activeOrders} active orders
              </span>
            </div>
            {dashboard.orderPipeline.length ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-11">
                {dashboard.orderPipeline.map((stage, index) => (
                  <div
                    key={stage.status}
                    className="relative rounded-lg border border-[#e5ebf3] bg-[#fbfdff] px-2 py-2 text-center sm:py-3"
                  >
                    <div className="text-base font-semibold text-[#2563eb] sm:text-lg">
                      {stage.count}
                    </div>
                    <div className="mt-1 text-[10px] font-medium leading-4 text-[#53647b]">
                      {orderStatusLabels[stage.status]}
                    </div>
                    {index < dashboard.orderPipeline.length - 1 ? (
                      <span className="absolute -right-2 top-1/2 z-10 hidden h-px w-2 bg-[#cbd5e1] 2xl:block" />
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <ManufacturingEmptyState
                compact
                icon={Factory}
                title="No production orders yet"
                description="The API returned no production-order status rows for this workspace."
              />
            )}
          </div>

          <div className="grid min-h-0 gap-3 2xl:grid-cols-[minmax(0,1.5fr)_minmax(330px,0.7fr)]">
            <div className="flex min-h-[290px] flex-col overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
              <div className="border-b border-[#e5ebf3] px-4 py-3">
                <h2 className="font-semibold text-[#14233b]">
                  Recent Production Orders
                </h2>
                <p className="text-xs text-[#7b8798]">
                  Latest posted order records from the manufacturing register.
                </p>
              </div>
              {dashboard.recentOrders.length ? (
                <div className="overflow-x-auto">
                  <div className="min-w-[760px]">
                    <div className="grid grid-cols-[1fr_1.4fr_0.8fr_0.8fr_0.85fr_28px] gap-2 bg-[#f5f8fc] px-4 py-2.5 text-[10px] font-semibold uppercase text-[#64748b]">
                      <span>Order</span>
                      <span>Finished product</span>
                      <span className="text-right">Planned</span>
                      <span>Materials</span>
                      <span>Status</span>
                      <span />
                    </div>
                    {dashboard.recentOrders.map((order) => (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => onOpenOrder(order.id)}
                        className="grid w-full grid-cols-[1fr_1.4fr_0.8fr_0.8fr_0.85fr_28px] items-center gap-2 border-t border-[#eef2f7] px-4 py-3 text-left text-xs hover:bg-[#f8fbff]"
                      >
                        <span>
                          <span className="block font-semibold text-[#203651]">
                            {order.orderNumber}
                          </span>
                          <span className="text-[10px] text-[#8290a4]">
                            {orderTypeLabels[order.orderType]}
                          </span>
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-[#334155]">
                            {order.finishedProductName}
                          </span>
                          <span className="text-[10px] text-[#8290a4]">
                            {order.finishedProductCode}
                          </span>
                        </span>
                        <span className="text-right font-medium tabular-nums">
                          {formatQuantity(order.plannedQuantity)} {order.unit}
                        </span>
                        <StatusPill value={order.materialStatus} />
                        <StatusPill
                          value={order.status}
                          label={orderStatusLabels[order.status]}
                        />
                        <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyRegister
                  icon={ClipboardList}
                  title="No production orders returned"
                  description="Create a production order after an approved BOM is available; it will appear here directly from the manufacturing API."
                />
              )}
            </div>

            <div className="flex min-h-[290px] flex-col overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
              <div className="border-b border-[#e5ebf3] px-4 py-3">
                <h2 className="font-semibold text-[#14233b]">
                  Recent Manufacturing Activity
                </h2>
                <p className="text-xs text-[#7b8798]">
                  Audited events returned by the control-center feed.
                </p>
              </div>
              {dashboard.recentActivity.length ? (
                <div className="max-h-[360px] overflow-y-auto p-3">
                  {dashboard.recentActivity.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex gap-3 border-b border-[#eef2f7] py-3 first:pt-0 last:border-b-0 last:pb-0"
                    >
                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#edf5ff] text-[#2478df]">
                        <History className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#334155]">
                          {activity.description}
                        </div>
                        <div className="mt-1 text-[10px] text-[#8290a4]">
                          {activity.referenceNumber ?? activity.eventType} ·{" "}
                          {formatDateTime(activity.occurredAt)}
                        </div>
                        {activity.performedBy ? (
                          <div className="mt-0.5 text-[10px] text-[#718096]">
                            By {activity.performedBy}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyRegister
                  icon={History}
                  title="No recent activity returned"
                  description="Manufacturing actions will be listed here once real workflow events are posted."
                />
              )}
            </div>
          </div>
        </>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-[#14233b]">
              <ClipboardCheck className="h-4 w-4 text-[#2478df]" />
              Manufacturing Run Preflight
            </h2>
            <p className="text-xs text-[#7b8798]">
              Read-only posting confidence check against live setup, approved
              masters and released stock.
            </p>
          </div>
          {preflightQuery.data ? (
            <StatusPill
              value={preflightQuery.data.ready ? "READY" : "WARNING"}
              label={
                preflightQuery.data.ready
                  ? "Ready to post"
                  : `${preflightQuery.data.blockerCount} action(s) needed`
              }
            />
          ) : null}
        </div>
        <div className="grid gap-2 border-b border-[#e5ebf3] p-3 md:grid-cols-[minmax(220px,1fr)_minmax(190px,0.8fr)_120px_160px_auto]">
          <select
            value={selectedPreflightProductId}
            onChange={(event) => {
              setPreflightProductId(event.target.value);
              setPreflightEnabled(false);
            }}
            className={selectClass}
          >
            <option value="">Select finished product…</option>
            {finishedProfiles.map((profile) => (
              <option key={profile.id} value={profile.inventoryItemId}>
                {profile.itemCode} — {profile.itemName}
              </option>
            ))}
          </select>
          <select
            value={preflightWarehouseId}
            onChange={(event) => {
              setPreflightWarehouseId(event.target.value);
              setPreflightEnabled(false);
            }}
            className={selectClass}
          >
            <option value="">Configured default source warehouse</option>
            {warehouses
              .filter(
                (warehouse) =>
                  warehouse.isActive && warehouse.allowMaterialIssue,
              )
              .map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.code} — {warehouse.name}
                </option>
              ))}
          </select>
          <Input
            type="number"
            min="0.0001"
            step="0.0001"
            value={preflightQuantity}
            onChange={(event) => {
              setPreflightQuantity(event.target.value);
              setPreflightEnabled(false);
            }}
            className={inputClass}
            aria-label="Run quantity"
          />
          <AppDateInput
            value={preflightAsOf}
            onChange={(value) => {
              setPreflightAsOf(value);
              setPreflightEnabled(false);
            }}
            inputClassName={inputClass}
            aria-label="Preflight as-of date"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => setPreflightEnabled(true)}
            disabled={
              !selectedPreflightProductId || !(Number(preflightQuantity) > 0)
            }
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Run preflight
          </Button>
        </div>
        {preflightQuery.isFetching ? (
          <div className="p-5 text-center text-xs text-[#718096]">
            Checking live manufacturing readiness…
          </div>
        ) : preflightQuery.isError ? (
          <div className="p-3">
            <QueryError
              message={getErrorMessage(
                preflightQuery.error,
                "Run preflight could not be completed.",
              )}
              onRetry={() => void preflightQuery.refetch()}
            />
          </div>
        ) : preflightQuery.data ? (
          <div className="grid gap-2 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {preflightQuery.data.checks.map((check) => (
              <button
                key={check.code}
                type="button"
                onClick={() =>
                  onOpenTarget(check.actionGroup, check.actionView)
                }
                className="flex items-start justify-between gap-3 rounded-lg border border-[#e5ebf3] p-3 text-left hover:border-[#b9d6f6] hover:bg-[#f8fbff]"
              >
                <span>
                  <span className="block text-xs font-semibold text-[#334155]">
                    {check.label}
                  </span>
                  <span className="mt-1 block text-[10px] leading-4 text-[#718096]">
                    {check.message}
                  </span>
                </span>
                <StatusPill
                  value={check.state === "BLOCKED" ? "WARNING" : check.state}
                  label={
                    check.state === "BLOCKED" ? "ACTION NEEDED" : check.state
                  }
                />
              </button>
            ))}
          </div>
        ) : (
          <div className="p-5 text-center text-xs text-[#718096]">
            Select the real finished product and quantity, then run the check.
            No record or stock is changed.
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ebf3] bg-white px-4 py-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-[#14233b]">
              <ShieldCheck className="h-4 w-4 text-[#2478df]" />
              Foundation Readiness
            </h2>
            <p className="text-xs text-[#7b8798]">
              Live setup checks from the manufacturing API. They guide safe
              posting and do not lock workflow navigation.
            </p>
          </div>
          {readiness ? (
            <div className="flex items-center gap-2">
              <StatusPill
                value={readiness.ready ? "READY" : "WARNING"}
                label={
                  readiness.ready
                    ? "Ready"
                    : `${readiness.blockerCount} action${readiness.blockerCount === 1 ? "" : "s"} needed`
                }
              />
              {readiness.warningCount ? (
                <StatusPill
                  value="WARNING"
                  label={`${readiness.warningCount} warning${readiness.warningCount === 1 ? "" : "s"}`}
                />
              ) : null}
            </div>
          ) : null}
        </div>
        {readinessQuery.isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-[#718096]">
            Evaluating manufacturing readiness…
          </div>
        ) : readiness?.checks.length ? (
          <div className="grid gap-2 p-3 md:grid-cols-2 2xl:grid-cols-3">
            {readiness.checks.map((check) => (
              <button
                key={check.code}
                type="button"
                disabled={!check.actionGroup || !check.actionView}
                onClick={() =>
                  check.actionGroup &&
                  check.actionView &&
                  onOpenTarget(check.actionGroup, check.actionView)
                }
                className="flex items-start justify-between gap-3 rounded-lg border border-[#e5ebf3] p-3 text-left enabled:hover:border-[#b9d6f6] enabled:hover:bg-[#f8fbff]"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-[#334155]">
                    {check.label}
                  </span>
                  <span className="mt-1 block text-[10px] leading-4 text-[#718096]">
                    {check.message ??
                      (check.count === null
                        ? "Validated by the readiness service."
                        : `${check.count} record${check.count === 1 ? "" : "s"}`)}
                  </span>
                </span>
                <StatusPill
                  value={check.state === "BLOCKED" ? "WARNING" : check.state}
                  label={
                    check.state === "BLOCKED"
                      ? "ACTION NEEDED"
                      : check.state.replaceAll("_", " ")
                  }
                />
              </button>
            ))}
          </div>
        ) : !readinessQuery.isLoading && !readinessQuery.isError ? (
          <div className="px-4 py-8 text-center text-sm text-[#718096]">
            No readiness checks were returned by the API.
          </div>
        ) : null}
        {readiness ? (
          <div className="border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-2 text-[10px] text-[#8290a4]">
            Evaluated {formatDateTime(readiness.evaluatedAt)}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ManufacturingAvailabilityWorkspace({
  workspaceId,
  warehouses,
  title,
  defaultRole,
  shortageOnly = false,
}: {
  workspaceId?: string;
  warehouses: WarehouseRecord[];
  title: string;
  defaultRole?: ManufacturingItemRole;
  shortageOnly?: boolean;
}) {
  const [warehouseId, setWarehouseId] = useState("");
  const [itemRole, setItemRole] = useState<ManufacturingItemRole | "">(
    defaultRole ?? "",
  );
  const [search, setSearch] = useState("");
  const [asOf, setAsOf] = useState("");
  const [includeZeroStock, setIncludeZeroStock] = useState(shortageOnly);
  const queryInput: ManufacturingAvailabilityQuery | null = workspaceId
    ? {
        workspaceId,
        warehouseId: warehouseId || undefined,
        itemRole: itemRole || undefined,
        search: search.trim() || undefined,
        asOf: asOf || undefined,
        includeZeroStock,
      }
    : null;
  const availabilityQuery = useManufacturingAvailabilityQuery(queryInput);
  const snapshot = availabilityQuery.data;
  const rows = useMemo(
    () =>
      shortageOnly
        ? (snapshot?.rows ?? []).filter(
            (row) => row.availableQuantity <= 0 || row.qualityHoldQuantity > 0,
          )
        : (snapshot?.rows ?? []),
    [shortageOnly, snapshot],
  );
  const availabilityWarehouses = useMemo(
    () =>
      warehouses.filter(
        (warehouse) =>
          warehouse.type === "RAW_MATERIAL" || warehouse.allowMaterialIssue,
      ),
    [warehouses],
  );

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f2ff] text-[#2478df]">
              <Boxes className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-[#172b49]">{title}</h2>
              <p className="text-xs text-[#718096]">
                Live on-hand, reservation, quality-hold and available quantities
                from manufacturing inventory.
              </p>
            </div>
          </div>
          {snapshot ? (
            <span className="rounded-full border border-[#cfe0f4] bg-[#f1f7ff] px-3 py-1.5 text-[11px] font-semibold text-[#2563eb]">
              As of {formatDateTime(snapshot.asOf)}
            </span>
          ) : null}
        </div>
        <div className="grid gap-2 bg-[#fbfcfe] p-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr_180px_auto]">
          <select
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
            className={selectClass}
          >
            <option value="">All eligible material warehouses</option>
            {availabilityWarehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name} ({warehouse.code})
              </option>
            ))}
          </select>
          <select
            value={itemRole}
            onChange={(event) =>
              setItemRole(event.target.value as ManufacturingItemRole | "")
            }
            className={selectClass}
          >
            <option value="">All manufacturing roles</option>
            {allItemRoles.map((role) => (
              <option key={role} value={role}>
                {itemRoleLabels[role]}
              </option>
            ))}
          </select>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
            placeholder="Search item name, code or category…"
          />
          <AppDateInput
            value={asOf}
            onChange={setAsOf}
            inputClassName={inputClass}
            aria-label="Availability as-of date"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setWarehouseId("");
              setItemRole(defaultRole ?? "");
              setSearch("");
              setAsOf("");
              setIncludeZeroStock(shortageOnly);
            }}
          >
            Clear filters
          </Button>
        </div>
        <label className="flex items-center gap-2 border-t border-[#edf1f6] bg-[#fbfcfe] px-4 py-2 text-[11px] text-[#60718a]">
          <input
            type="checkbox"
            checked={includeZeroStock}
            onChange={(event) => setIncludeZeroStock(event.target.checked)}
            className="h-4 w-4 accent-[#2478df]"
          />
          Include zero-stock item/warehouse rows
        </label>
      </div>

      {availabilityQuery.isError ? (
        <QueryError
          message={getErrorMessage(
            availabilityQuery.error,
            "Manufacturing availability could not be loaded.",
          )}
          onRetry={() => void availabilityQuery.refetch()}
        />
      ) : null}
      {availabilityQuery.isLoading ? (
        <LoadingPanel label="Loading manufacturing availability…" />
      ) : snapshot ? (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <AvailabilityMetric
              label={
                shortageOnly ? "Rows requiring attention" : "Items returned"
              }
              value={
                shortageOnly
                  ? rows.length.toLocaleString()
                  : snapshot.totalItems.toLocaleString()
              }
              icon={Boxes}
            />
            <AvailabilityMetric
              label="Available quantity"
              value={formatQuantity(snapshot.totalAvailableQuantity)}
              icon={CheckCircle2}
            />
            <AvailabilityMetric
              label="Stock value"
              value={`BDT ${formatAmount(snapshot.totalStockValue)}`}
              icon={Warehouse}
            />
          </div>
          <div className="flex min-h-[320px] flex-1 flex-col overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
            <div className="overflow-x-auto">
              <div className="min-w-[1020px]">
                <div className="grid grid-cols-[1.35fr_1fr_0.75fr_0.62fr_0.62fr_0.62fr_0.7fr_0.8fr] gap-2 border-b border-[#e5ebf3] bg-[#f5f8fc] px-4 py-2.5 text-[10px] font-bold uppercase text-[#64748b]">
                  <span>Material / item</span>
                  <span>Warehouse</span>
                  <span>Role</span>
                  <span className="text-right">On hand</span>
                  <span className="text-right">Reserved</span>
                  <span className="text-right">QC hold</span>
                  <span className="text-right">Available</span>
                  <span className="text-right">Stock value</span>
                </div>
                {rows.map((row, index) => (
                  <div
                    key={`${row.inventoryItemId}-${row.warehouseId}-${row.lotNumber ?? index}`}
                    className="grid grid-cols-[1.35fr_1fr_0.75fr_0.62fr_0.62fr_0.62fr_0.7fr_0.8fr] items-center gap-2 border-b border-[#eef2f7] px-4 py-3 text-xs last:border-b-0 hover:bg-[#f8fbff]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[#203651]">
                        {row.itemName}
                      </span>
                      <span className="text-[10px] text-[#8290a4]">
                        {row.itemCode}
                        {row.lotNumber ? ` · Lot ${row.lotNumber}` : ""}
                        {row.expiryDate
                          ? ` · Exp ${formatDate(row.expiryDate)}`
                          : ""}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[#334155]">
                        {row.warehouseName}
                      </span>
                      <span className="text-[10px] text-[#8290a4]">
                        {row.warehouseCode}
                      </span>
                    </span>
                    <span className="text-[10px] font-medium text-[#60718a]">
                      {itemRoleLabels[row.itemRole]}
                    </span>
                    <span className="text-right tabular-nums">
                      {formatQuantity(row.onHandQuantity)} {row.unit}
                    </span>
                    <span className="text-right tabular-nums text-[#9a5b0a]">
                      {formatQuantity(row.reservedQuantity)}
                    </span>
                    <span className="text-right tabular-nums text-[#b42318]">
                      {formatQuantity(row.qualityHoldQuantity)}
                    </span>
                    <span
                      className={`text-right font-semibold tabular-nums ${row.availableQuantity > 0 ? "text-[#08783d]" : "text-[#b42318]"}`}
                    >
                      {formatQuantity(row.availableQuantity)}
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {formatAmount(row.stockValue)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {!rows.length ? (
              <EmptyRegister
                icon={Boxes}
                title={
                  shortageOnly
                    ? "No shortage rows returned"
                    : "No availability rows returned"
                }
                description={
                  shortageOnly
                    ? "No zero-available or quality-hold rows match the current live filters."
                    : "No manufacturing inventory rows match the selected warehouse, role, date and search filters."
                }
              />
            ) : null}
            <div className="mt-auto border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-2.5 text-[11px] text-[#718096]">
              Showing {rows.length} API row{rows.length === 1 ? "" : "s"}
              {shortageOnly && rows.length !== snapshot.rows.length
                ? ` from ${snapshot.rows.length} availability rows`
                : ""}
              .
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function AvailabilityMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Boxes;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#dbe4ef] bg-white p-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edf5ff] text-[#2478df]">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#8290a4]">
          {label}
        </div>
        <div className="mt-0.5 text-lg font-semibold text-[#172b49]">
          {value}
        </div>
      </div>
    </div>
  );
}

type BomComponentDraft = {
  key: string;
  inventoryItemId: string;
  quantity: string;
  unit: string;
  scrapPercentage: string;
  isOptional: boolean;
};

function newBomComponent(key: string): BomComponentDraft {
  return {
    key,
    inventoryItemId: "",
    quantity: "",
    unit: "",
    scrapPercentage: "0",
    isOptional: false,
  };
}

export function ManufacturingBomWorkspace({
  workspaceId,
  items,
  title,
}: {
  workspaceId?: string;
  items: ManufacturingInventoryOption[];
  title: string;
}) {
  const [search, setSearch] = useState("");
  const [selectedBomId, setSelectedBomId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() =>
    makeIdempotencyKey("create-bom"),
  );
  const [bomForm, setBomForm] = useState({
    name: "",
    finishedProductId: "",
    makeBuy: "MAKE" as "MAKE" | "BOTH",
    notes: "",
  });
  const [versionForm, setVersionForm] = useState({
    versionNumber: "",
    outputQuantity: "1",
    outputUnit: "",
    effectiveFrom: "",
    effectiveTo: "",
    changeReason: "",
  });
  const [components, setComponents] = useState<BomComponentDraft[]>([
    newBomComponent("component-1"),
  ]);
  const [approvalDate, setApprovalDate] = useState(todayIso());
  const [approvalNote, setApprovalNote] = useState("");
  const [approvalPassword, setApprovalPassword] = useState("");
  const bomsQuery = useManufacturingBomsQuery(
    workspaceId ? { workspaceId, search: search.trim() || undefined } : null,
  );
  const createBom = useCreateManufacturingBomMutation();
  const createVersion = useCreateManufacturingBomVersionMutation();
  const approveVersion = useApproveManufacturingBomVersionMutation();
  const boms = bomsQuery.data ?? [];
  const selectedBom =
    boms.find((bom) => bom.id === selectedBomId) ?? boms[0] ?? null;

  const resetBomForm = () =>
    setBomForm({
      name: "",
      finishedProductId: "",
      makeBuy: "MAKE",
      notes: "",
    });
  const resetVersionForm = (bom?: ManufacturingBomRecord | null) => {
    setVersionForm({
      versionNumber: "",
      outputQuantity: "1",
      outputUnit: bom
        ? (items.find((item) => item.id === bom.finishedProductId)?.unit ?? "")
        : "",
      effectiveFrom: "",
      effectiveTo: "",
      changeReason: "",
    });
    setComponents([newBomComponent("component-1")]);
  };

  const submitBom = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId) return;
    if (!bomForm.name.trim() || !bomForm.finishedProductId) {
      toast.error("BOM name and finished product are required.");
      return;
    }
    createBom.mutate(
      {
        workspaceId,
        idempotencyKey: createIdempotencyKey,
        name: bomForm.name.trim(),
        finishedProductId: bomForm.finishedProductId,
        makeBuy: bomForm.makeBuy,
        notes: bomForm.notes.trim() || undefined,
      },
      {
        onSuccess: (record) => {
          toast.success(`${record.bomNumber} was created.`);
          setSelectedBomId(record.id);
          setCreateOpen(false);
          resetBomForm();
          setCreateIdempotencyKey(makeIdempotencyKey("create-bom"));
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "BOM / Formula could not be created."),
          ),
      },
    );
  };

  const submitVersion = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !selectedBom) return;
    const outputQuantity = Number(versionForm.outputQuantity);
    if (
      !Number.isFinite(outputQuantity) ||
      outputQuantity <= 0 ||
      !versionForm.outputUnit.trim()
    ) {
      toast.error("A positive output quantity and output unit are required.");
      return;
    }
    if (
      versionForm.effectiveFrom &&
      versionForm.effectiveTo &&
      versionForm.effectiveTo < versionForm.effectiveFrom
    ) {
      toast.error("Effective-to date cannot be before effective-from date.");
      return;
    }
    const normalizedComponents: ManufacturingBomComponentInput[] = [];
    for (const row of components) {
      const quantity = Number(row.quantity);
      const scrapPercentage = Number(row.scrapPercentage || 0);
      if (
        !row.inventoryItemId ||
        !row.unit.trim() ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !Number.isFinite(scrapPercentage) ||
        scrapPercentage < 0 ||
        scrapPercentage > 100
      ) {
        toast.error(
          "Every component needs an item, positive quantity, unit and scrap percentage from 0 to 100.",
        );
        return;
      }
      normalizedComponents.push({
        inventoryItemId: row.inventoryItemId,
        quantity,
        unit: row.unit.trim(),
        scrapPercentage,
        isOptional: row.isOptional,
      });
    }
    if (!normalizedComponents.length) {
      toast.error("At least one BOM component is required.");
      return;
    }
    if (normalizedComponents.every((component) => component.isOptional)) {
      toast.error("At least one non-optional BOM component is required.");
      return;
    }
    if (
      new Set(
        normalizedComponents.map((component) => component.inventoryItemId),
      ).size !== normalizedComponents.length
    ) {
      toast.error(
        "Each material can appear only once in a BOM version; combine duplicate quantities into one line.",
      );
      return;
    }
    const versionNumber = versionForm.versionNumber
      ? Number(versionForm.versionNumber)
      : undefined;
    if (
      versionNumber !== undefined &&
      (!Number.isInteger(versionNumber) || versionNumber <= 0)
    ) {
      toast.error("Version number must be a positive whole number.");
      return;
    }
    createVersion.mutate(
      {
        bomId: selectedBom.id,
        input: {
          workspaceId,
          versionNumber,
          outputQuantity,
          outputUnit: versionForm.outputUnit.trim(),
          effectiveFrom: versionForm.effectiveFrom || null,
          effectiveTo: versionForm.effectiveTo || null,
          changeReason: versionForm.changeReason.trim() || null,
          components: normalizedComponents,
        },
      },
      {
        onSuccess: (record) => {
          toast.success(
            `Version ${record.versionNumber} was created in draft.`,
          );
          setVersionOpen(false);
          resetVersionForm(selectedBom);
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "BOM version could not be created."),
          ),
      },
    );
  };

  const approve = (version: ManufacturingBomVersionRecord) => {
    if (!workspaceId) return;
    const signatureMeaning = window.prompt(
      "Enter the exact configured signature meaning for the next BOM approval stage.",
    );
    if (signatureMeaning === null) return;
    approveVersion.mutate(
      {
        versionId: version.id,
        input: {
          workspaceId,
          idempotencyKey: makeIdempotencyKey(
            `approve-bom-version-${version.id}`,
          ),
          transactionDate: approvalDate,
          note: approvalNote.trim() || undefined,
          signatureMeaning: signatureMeaning.trim() || undefined,
          reauthenticationPassword: approvalPassword || undefined,
        },
      },
      {
        onSuccess: (record) => {
          toast.success(
            record.approvalProgress && !record.approvalProgress.complete
              ? `BOM approval stage ${record.approvalProgress.completedStages} of ${record.approvalProgress.totalStages} recorded. Next-stage approval is pending.`
              : `BOM version ${record.versionNumber} was approved.`,
          );
          setApprovalNote("");
          setApprovalPassword("");
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "BOM version could not be approved."),
          ),
      },
    );
  };

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f2ff] text-[#2478df]">
              <BookOpen className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-[#172b49]">{title}</h2>
              <p className="text-xs text-[#718096]">
                Create formulas, issue controlled versions and approve an
                immutable production basis.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCreateOpen((open) => !open)}
            >
              {createOpen ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {createOpen ? "Close form" : "New BOM / Formula"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={!selectedBom}
              onClick={() => {
                setVersionOpen((open) => !open);
                if (!versionOpen) resetVersionForm(selectedBom);
              }}
            >
              {versionOpen ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <Layers3 className="h-3.5 w-3.5" />
              )}
              {versionOpen ? "Close version" : "New version"}
            </Button>
          </div>
        </div>
        <div className="p-3">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
            placeholder="Search BOM number, name or finished product…"
          />
        </div>
      </div>

      {createOpen ? (
        <form
          onSubmit={submitBom}
          className="rounded-xl border border-[#bdd6f2] bg-[#f8fbff] p-4"
        >
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-[#172b49]">
              Create BOM / Master Formula
            </h3>
            <p className="text-[11px] text-[#718096]">
              The base record is created first; add and approve a version before
              production use.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field
              label="BOM number"
              hint="Allocated from the controlled BOM sequence."
            >
              <Input
                disabled
                value=""
                className={`${inputClass} bg-[#f3f6fa]`}
                placeholder="Generated on create"
              />
            </Field>
            <Field label="Name">
              <Input
                required
                value={bomForm.name}
                onChange={(event) =>
                  setBomForm((form) => ({ ...form, name: event.target.value }))
                }
                className={inputClass}
                placeholder="Finished product formula"
              />
            </Field>
            <Field label="Finished product">
              <select
                required
                value={bomForm.finishedProductId}
                onChange={(event) =>
                  setBomForm((form) => ({
                    ...form,
                    finishedProductId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Select inventory item…</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemCode} — {item.itemName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Make / buy policy">
              <select
                value={bomForm.makeBuy}
                onChange={(event) =>
                  setBomForm((form) => ({
                    ...form,
                    makeBuy: event.target.value as typeof form.makeBuy,
                  }))
                }
                className={selectClass}
              >
                <option value="MAKE">Make</option>
                <option value="BOTH">Make or buy</option>
              </select>
            </Field>
          </div>
          <div className="mt-3">
            <Field label="Notes">
              <textarea
                value={bomForm.notes}
                onChange={(event) =>
                  setBomForm((form) => ({ ...form, notes: event.target.value }))
                }
                className={textareaClass}
                placeholder="Controlled formula notes (optional)"
              />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="sm" disabled={createBom.isPending}>
              <Save className="h-3.5 w-3.5" />
              {createBom.isPending ? "Creating…" : "Create BOM / Formula"}
            </Button>
          </div>
        </form>
      ) : null}

      {versionOpen && selectedBom ? (
        <form
          onSubmit={submitVersion}
          className="rounded-xl border border-[#c9ddf5] bg-white p-4 shadow-[0_5px_20px_rgba(30,64,175,0.06)]"
        >
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-[#172b49]">
              New version for {selectedBom.bomNumber}
            </h3>
            <p className="text-[11px] text-[#718096]">
              Define output and actual component requirements. Approval is a
              separate controlled action.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <Field label="Version number">
              <Input
                type="number"
                min="1"
                step="1"
                value={versionForm.versionNumber}
                onChange={(event) =>
                  setVersionForm((form) => ({
                    ...form,
                    versionNumber: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="Auto"
              />
            </Field>
            <Field label="Output quantity">
              <Input
                required
                type="number"
                min="0.000001"
                step="any"
                value={versionForm.outputQuantity}
                onChange={(event) =>
                  setVersionForm((form) => ({
                    ...form,
                    outputQuantity: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Output unit">
              <Input
                required
                value={versionForm.outputUnit}
                onChange={(event) =>
                  setVersionForm((form) => ({
                    ...form,
                    outputUnit: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Effective from">
              <AppDateInput
                aria-label="Effective from"
                value={versionForm.effectiveFrom}
                onChange={(value) =>
                  setVersionForm((form) => ({
                    ...form,
                    effectiveFrom: value,
                  }))
                }
                inputClassName={inputClass}
              />
            </Field>
            <Field label="Effective to">
              <AppDateInput
                aria-label="Effective to"
                value={versionForm.effectiveTo}
                onChange={(value) =>
                  setVersionForm((form) => ({
                    ...form,
                    effectiveTo: value,
                  }))
                }
                inputClassName={inputClass}
              />
            </Field>
            <Field label="Change reason">
              <Input
                value={versionForm.changeReason}
                onChange={(event) =>
                  setVersionForm((form) => ({
                    ...form,
                    changeReason: event.target.value,
                  }))
                }
                className={inputClass}
                placeholder="Why this version?"
              />
            </Field>
          </div>
          <div className="mt-4 overflow-x-auto rounded-lg border border-[#dce5ef]">
            <div className="min-w-[800px]">
              <div className="grid grid-cols-[1.5fr_0.65fr_0.55fr_0.55fr_80px_42px] gap-2 bg-[#f5f8fc] px-3 py-2 text-[10px] font-bold uppercase text-[#64748b]">
                <span>Component item</span>
                <span>Quantity</span>
                <span>Unit</span>
                <span>Scrap %</span>
                <span>Optional</span>
                <span />
              </div>
              {components.map((row, index) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[1.5fr_0.65fr_0.55fr_0.55fr_80px_42px] items-center gap-2 border-t border-[#e8eef5] p-2"
                >
                  <select
                    required
                    value={row.inventoryItemId}
                    onChange={(event) => {
                      const item = items.find(
                        (entry) => entry.id === event.target.value,
                      );
                      setComponents((current) =>
                        current.map((entry) =>
                          entry.key === row.key
                            ? {
                                ...entry,
                                inventoryItemId: event.target.value,
                                unit: item?.unit ?? entry.unit,
                              }
                            : entry,
                        ),
                      );
                    }}
                    className={selectClass}
                  >
                    <option value="">Select material…</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemCode} — {item.itemName}
                      </option>
                    ))}
                  </select>
                  <Input
                    required
                    type="number"
                    min="0.000001"
                    step="any"
                    value={row.quantity}
                    onChange={(event) =>
                      setComponents((current) =>
                        current.map((entry) =>
                          entry.key === row.key
                            ? { ...entry, quantity: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                  <Input
                    required
                    value={row.unit}
                    onChange={(event) =>
                      setComponents((current) =>
                        current.map((entry) =>
                          entry.key === row.key
                            ? { ...entry, unit: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={row.scrapPercentage}
                    onChange={(event) =>
                      setComponents((current) =>
                        current.map((entry) =>
                          entry.key === row.key
                            ? { ...entry, scrapPercentage: event.target.value }
                            : entry,
                        ),
                      )
                    }
                    className={inputClass}
                  />
                  <label className="flex justify-center">
                    <input
                      type="checkbox"
                      checked={row.isOptional}
                      onChange={(event) =>
                        setComponents((current) =>
                          current.map((entry) =>
                            entry.key === row.key
                              ? { ...entry, isOptional: event.target.checked }
                              : entry,
                          ),
                        )
                      }
                      className="h-4 w-4 accent-[#2478df]"
                    />
                  </label>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-[#b42318]"
                    disabled={components.length === 1}
                    onClick={() =>
                      setComponents((current) =>
                        current.filter((entry) => entry.key !== row.key),
                      )
                    }
                    aria-label={`Remove component ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setComponents((current) => [
                  ...current,
                  newBomComponent(`component-${Date.now()}-${current.length}`),
                ])
              }
            >
              <Plus className="h-3.5 w-3.5" />
              Add component
            </Button>
            <Button type="submit" size="sm" disabled={createVersion.isPending}>
              <Layers3 className="h-3.5 w-3.5" />
              {createVersion.isPending
                ? "Creating version…"
                : "Create draft version"}
            </Button>
          </div>
        </form>
      ) : null}

      {bomsQuery.isError ? (
        <QueryError
          message={getErrorMessage(
            bomsQuery.error,
            "BOM register could not be loaded.",
          )}
          onRetry={() => void bomsQuery.refetch()}
        />
      ) : null}
      {bomsQuery.isLoading ? (
        <LoadingPanel label="Loading live BOM / Formula register…" />
      ) : (
        <div className="grid min-h-[420px] flex-1 gap-3 xl:grid-cols-[330px_minmax(0,1fr)]">
          <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
            <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
              <div className="text-sm font-semibold text-[#172b49]">
                BOM / Formula register
              </div>
              <div className="text-[10px] text-[#8290a4]">
                {boms.length} live record{boms.length === 1 ? "" : "s"}
              </div>
            </div>
            {boms.length ? (
              <div className="max-h-[520px] overflow-y-auto p-2">
                {boms.map((bom) => (
                  <button
                    key={bom.id}
                    type="button"
                    onClick={() => setSelectedBomId(bom.id)}
                    className={`mb-1.5 w-full rounded-lg border p-3 text-left last:mb-0 ${selectedBom?.id === bom.id ? "border-[#9bc5f7] bg-[#f5f9ff]" : "border-[#e1e8f0] bg-white hover:bg-[#f8fbff]"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span>
                        <span className="block text-xs font-semibold text-[#203651]">
                          {bom.bomNumber}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[#52647d]">
                          {bom.name}
                        </span>
                      </span>
                      <StatusPill
                        value={bom.approvedVersion ? "APPROVED" : "DRAFT"}
                        label={
                          bom.approvedVersion
                            ? `v${bom.approvedVersion.versionNumber}`
                            : "No approved version"
                        }
                      />
                    </div>
                    <div className="mt-2 truncate text-[10px] text-[#8290a4]">
                      {bom.finishedProductCode} — {bom.finishedProductName}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyRegister
                icon={BookOpen}
                title="No BOM / Formula returned"
                description="Create the first controlled BOM base record using the form above."
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New BOM / Formula
                  </Button>
                }
              />
            )}
          </div>
          <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
            {selectedBom ? (
              <BomDetail
                bom={selectedBom}
                approvalDate={approvalDate}
                approvalNote={approvalNote}
                approvalPassword={approvalPassword}
                approving={approveVersion.isPending}
                onApprovalDateChange={setApprovalDate}
                onApprovalNoteChange={setApprovalNote}
                onApprovalPasswordChange={setApprovalPassword}
                onApprove={approve}
                onNewVersion={() => {
                  resetVersionForm(selectedBom);
                  setVersionOpen(true);
                }}
              />
            ) : (
              <EmptyRegister
                icon={Layers3}
                title="Select a BOM / Formula"
                description="Choose a live record from the register to inspect versions and components."
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function BomDetail({
  bom,
  approvalDate,
  approvalNote,
  approvalPassword,
  approving,
  onApprovalDateChange,
  onApprovalNoteChange,
  onApprovalPasswordChange,
  onApprove,
  onNewVersion,
}: {
  bom: ManufacturingBomRecord;
  approvalDate: string;
  approvalNote: string;
  approvalPassword: string;
  approving: boolean;
  onApprovalDateChange: (value: string) => void;
  onApprovalNoteChange: (value: string) => void;
  onApprovalPasswordChange: (value: string) => void;
  onApprove: (version: ManufacturingBomVersionRecord) => void;
  onNewVersion: () => void;
}) {
  const versions = [...bom.versions].sort(
    (a, b) => b.versionNumber - a.versionNumber,
  );
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wide text-[#8290a4]">
            {bom.bomNumber}
          </div>
          <h3 className="text-base font-semibold text-[#172b49]">{bom.name}</h3>
          <p className="text-xs text-[#718096]">
            {bom.finishedProductCode} — {bom.finishedProductName} ·{" "}
            {bom.makeBuy.replaceAll("_", " /")}
          </p>
        </div>
        <Button type="button" size="sm" onClick={onNewVersion}>
          <Plus className="h-3.5 w-3.5" />
          New version
        </Button>
      </div>
      {versions.length ? (
        <div className="max-h-[560px] overflow-y-auto p-3">
          {versions.map((version) => (
            <div
              key={version.id}
              className="mb-3 overflow-hidden rounded-xl border border-[#dce5ef] last:mb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[#f7faff] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#203651]">
                    Version {version.versionNumber}
                  </span>
                  <StatusPill value={version.status} />
                </div>
                <div className="text-[10px] text-[#718096]">
                  Output {formatQuantity(version.outputQuantity)}{" "}
                  {version.outputUnit}
                  {version.effectiveFrom
                    ? ` · Effective ${formatDate(version.effectiveFrom)}`
                    : ""}
                </div>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[650px]">
                  <div className="grid grid-cols-[1.35fr_0.7fr_0.55fr_0.55fr] gap-2 border-t border-[#e8eef5] bg-[#fbfcfe] px-3 py-2 text-[9px] font-bold uppercase text-[#718096]">
                    <span>Component</span>
                    <span className="text-right">Quantity</span>
                    <span className="text-right">Scrap %</span>
                    <span>Optional</span>
                  </div>
                  {version.components.map((component) => (
                    <div
                      key={component.id}
                      className="grid grid-cols-[1.35fr_0.7fr_0.55fr_0.55fr] items-center gap-2 border-t border-[#eef2f7] px-3 py-2.5 text-[11px]"
                    >
                      <span>
                        <span className="block font-medium text-[#334155]">
                          {component.itemName}
                        </span>
                        <span className="text-[9px] text-[#8290a4]">
                          {component.itemCode}
                        </span>
                      </span>
                      <span className="text-right font-medium tabular-nums">
                        {formatQuantity(component.quantity)} {component.unit}
                      </span>
                      <span className="text-right tabular-nums">
                        {formatQuantity(component.scrapPercentage)}
                      </span>
                      <span className="text-[#60718a]">
                        {component.isOptional ? "Yes" : "No"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              {version.status === "DRAFT" ? (
                <div className="grid gap-2 border-t border-[#dfe7f0] bg-[#fffdf8] p-3 sm:grid-cols-[170px_1fr_220px_auto]">
                  <AppDateInput
                    value={approvalDate}
                    onChange={(value) => onApprovalDateChange(value)}
                    inputClassName={inputClass}
                    aria-label="BOM approval transaction date"
                  />
                  <Input
                    value={approvalNote}
                    onChange={(event) =>
                      onApprovalNoteChange(event.target.value)
                    }
                    className={inputClass}
                    placeholder="Approval note (optional)"
                  />
                  <Input
                    type="password"
                    autoComplete="current-password"
                    value={approvalPassword}
                    onChange={(event) =>
                      onApprovalPasswordChange(event.target.value)
                    }
                    className={inputClass}
                    placeholder="Current password (if policy requires)"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={approving || !approvalDate}
                    onClick={() => onApprove(version)}
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    {approving ? "Approving…" : "Approve version"}
                  </Button>
                </div>
              ) : (
                <div className="border-t border-[#eef2f7] bg-[#fbfcfe] px-3 py-2 text-[10px] text-[#718096]">
                  {version.approvedAt
                    ? `Approved ${formatDateTime(version.approvedAt)}${version.approvedBy ? ` by ${version.approvedBy}` : ""}`
                    : `Created ${formatDateTime(version.createdAt)}`}
                  {version.changeReason ? ` · ${version.changeReason}` : ""}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyRegister
          icon={Layers3}
          title="No versions returned"
          description="Create the first component-controlled version for this BOM / Formula."
          action={
            <Button type="button" size="sm" onClick={onNewVersion}>
              <Plus className="h-3.5 w-3.5" />
              Create version
            </Button>
          }
        />
      )}
    </>
  );
}

type OrderListPreset = {
  orderType?: ManufacturingOrderType;
  orderTypes?: ManufacturingOrderType[];
  status?: ManufacturingOrderStatus;
  statuses?: ManufacturingOrderStatus[];
  terminalOnly?: boolean;
  preferredAction?: ManufacturingOrderActionKind;
};

type ApprovedBomOption = {
  bom: ManufacturingBomRecord;
  version: ManufacturingBomVersionRecord;
};

type ApprovedRoutingOption = {
  routingId: string;
  routingCode: string;
  routingName: string;
  finishedProductId: string;
  versionId: string;
  versionNumber: number;
};

type ManufacturingOrderLotDraft = {
  id: string;
  lotNumber: string;
  plannedQuantity: string;
};

let manufacturingOrderLotDraftSequence = 0;

function nextManufacturingOrderLotDraftId() {
  manufacturingOrderLotDraftSequence += 1;
  return `order-lot-draft-${manufacturingOrderLotDraftSequence}`;
}

function editableQuantity(value: number) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function quantityMicrounits(value: string) {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,6})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
}

function formatQuantityMicrounits(value: bigint | null) {
  if (value === null) return "Invalid";
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function ManufacturingOrdersWorkspace({
  workspaceId,
  items,
  warehouses,
  title,
  preset,
  selectedOrderId,
  onOpenOrder,
  onCloseOrder,
  onConfigureBom,
  onRunPreflight,
}: {
  workspaceId?: string;
  items: ManufacturingInventoryOption[];
  warehouses: WarehouseRecord[];
  title: string;
  preset?: OrderListPreset;
  selectedOrderId?: string;
  onOpenOrder: (orderId: string) => void;
  onCloseOrder: () => void;
  onConfigureBom: () => void;
  onRunPreflight: () => void;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ManufacturingOrderStatus | "">(
    preset?.status ?? "",
  );
  const [orderType, setOrderType] = useState<ManufacturingOrderType | "">(
    preset?.orderType ?? "",
  );
  const [createOpen, setCreateOpen] = useState(false);
  const ordersQuery = useManufacturingOrdersQuery(
    workspaceId
      ? {
          workspaceId,
          search: search.trim() || undefined,
          status: preset?.terminalOnly ? undefined : status || undefined,
          orderType: orderType || undefined,
        }
      : null,
  );
  const rows = useMemo(() => {
    const records = ordersQuery.data ?? [];
    return records.filter((order) => {
      if (
        preset?.terminalOnly &&
        order.status !== "CANCELLED" &&
        order.status !== "CLOSED"
      )
        return false;
      if (preset?.statuses?.length && !preset.statuses.includes(order.status))
        return false;
      if (
        preset?.orderTypes?.length &&
        !preset.orderTypes.includes(order.orderType)
      )
        return false;
      return true;
    });
  }, [
    ordersQuery.data,
    preset?.orderTypes,
    preset?.statuses,
    preset?.terminalOnly,
  ]);
  const statusOptions = preset?.statuses?.length
    ? preset.statuses
    : allOrderStatuses;

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  if (selectedOrderId) {
    return (
      <ManufacturingOrderDetailWorkspace
        workspaceId={workspaceId}
        orderId={selectedOrderId}
        preferredAction={preset?.preferredAction}
        onBack={onCloseOrder}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f2ff] text-[#2478df]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-[#172b49]">{title}</h2>
              <p className="text-xs text-[#718096]">
                Real assembly, batch, packaging, rework and subcontract
                production orders.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {ordersQuery.data ? (
              <span className="rounded-full bg-[#eef3f8] px-3 py-1.5 text-[11px] font-semibold text-[#60718a]">
                {rows.length} order{rows.length === 1 ? "" : "s"}
              </span>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={() => setCreateOpen((open) => !open)}
            >
              {createOpen ? (
                <X className="h-3.5 w-3.5" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              {createOpen ? "Close form" : "New production order"}
            </Button>
          </div>
        </div>
        <div className="grid gap-2 bg-[#fbfcfe] p-3 md:grid-cols-[minmax(260px,1fr)_220px_220px_auto]">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className={inputClass}
            placeholder="Search order number, product or BOM…"
          />
          <select
            value={orderType}
            disabled={Boolean(preset?.orderType)}
            onChange={(event) =>
              setOrderType(event.target.value as ManufacturingOrderType | "")
            }
            className={selectClass}
          >
            <option value="">All order types</option>
            {allOrderTypes.map((type) => (
              <option key={type} value={type}>
                {orderTypeLabels[type]}
              </option>
            ))}
          </select>
          <select
            value={status}
            disabled={Boolean(preset?.status) || Boolean(preset?.terminalOnly)}
            onChange={(event) =>
              setStatus(event.target.value as ManufacturingOrderStatus | "")
            }
            className={selectClass}
          >
            <option value="">All order statuses</option>
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {orderStatusLabels[value]}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSearch("");
              setStatus(preset?.status ?? "");
              setOrderType(preset?.orderType ?? "");
            }}
          >
            Clear filters
          </Button>
        </div>
      </div>

      {createOpen ? (
        <ManufacturingOrderCreateForm
          workspaceId={workspaceId}
          items={items}
          warehouses={warehouses}
          initialType={preset?.orderType}
          onCreated={(order) => {
            setCreateOpen(false);
            onOpenOrder(order.id);
          }}
          onConfigureBom={onConfigureBom}
          onRunPreflight={onRunPreflight}
        />
      ) : null}
      {ordersQuery.isError ? (
        <QueryError
          message={getErrorMessage(
            ordersQuery.error,
            "Production orders could not be loaded.",
          )}
          onRetry={() => void ordersQuery.refetch()}
        />
      ) : null}
      {ordersQuery.isLoading ? (
        <LoadingPanel label="Loading production-order register…" />
      ) : (
        <div className="flex min-h-[390px] flex-1 flex-col overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
          {rows.length ? (
            <div className="overflow-x-auto">
              <div className="min-w-[1100px]">
                <div className="grid grid-cols-[1fr_0.85fr_1.25fr_1fr_0.7fr_1fr_0.8fr_0.8fr_36px] gap-2 border-b border-[#dfe7f0] bg-[#f3f7fb] px-4 py-2.5 text-[10px] font-bold uppercase text-[#64748b]">
                  <span>Production no.</span>
                  <span>Type</span>
                  <span>Finished product</span>
                  <span>BOM / Formula</span>
                  <span className="text-right">Planned qty</span>
                  <span>Source → destination</span>
                  <span>Materials</span>
                  <span>Status</span>
                  <span />
                </div>
                {rows.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => onOpenOrder(order.id)}
                    className="grid w-full grid-cols-[1fr_0.85fr_1.25fr_1fr_0.7fr_1fr_0.8fr_0.8fr_36px] items-center gap-2 border-b border-[#eef2f7] px-4 py-3 text-left text-xs last:border-b-0 hover:bg-[#f8fbff]"
                  >
                    <span>
                      <span className="block font-semibold text-[#203651]">
                        {order.orderNumber}
                      </span>
                      <span className="text-[10px] text-[#8290a4]">
                        {formatDate(order.plannedStartDate)} →{" "}
                        {formatDate(order.plannedEndDate)}
                      </span>
                    </span>
                    <span className="text-[11px] text-[#53647b]">
                      {orderTypeLabels[order.orderType]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-[#334155]">
                        {order.finishedProductName}
                      </span>
                      <span className="text-[10px] text-[#8290a4]">
                        {order.finishedProductCode}
                      </span>
                    </span>
                    <span>
                      <span className="block text-[#334155]">
                        {order.bomNumber}
                      </span>
                      <span className="text-[10px] text-[#8290a4]">
                        Version {order.bomVersionNumber}
                      </span>
                    </span>
                    <span className="text-right font-semibold tabular-nums">
                      {formatQuantity(order.plannedQuantity)} {order.unit}
                    </span>
                    <span className="min-w-0 text-[10px] text-[#60718a]">
                      <span className="block truncate">
                        {order.sourceWarehouseName}
                      </span>
                      <span className="block truncate">
                        → {order.destinationWarehouseName}
                      </span>
                    </span>
                    <StatusPill value={order.materialStatus} />
                    <StatusPill
                      value={order.status}
                      label={orderStatusLabels[order.status]}
                    />
                    <ChevronRight className="h-4 w-4 text-[#94a3b8]" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <EmptyRegister
              icon={ClipboardList}
              title="No production orders returned"
              description="No real production orders match this register and its active filters."
              action={
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onConfigureBom}
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Review BOMs
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Create order
                  </Button>
                </div>
              }
            />
          )}
          <div className="mt-auto border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-2.5 text-[11px] text-[#718096]">
            Showing {rows.length} live API record{rows.length === 1 ? "" : "s"}.
          </div>
        </div>
      )}
    </div>
  );
}

function ManufacturingOrderCreateForm({
  workspaceId,
  items,
  warehouses,
  initialType,
  onCreated,
  onConfigureBom,
  onRunPreflight,
}: {
  workspaceId?: string;
  items: ManufacturingInventoryOption[];
  warehouses: WarehouseRecord[];
  initialType?: ManufacturingOrderType;
  onCreated: (order: ManufacturingProductionOrderRecord) => void;
  onConfigureBom: () => void;
  onRunPreflight: () => void;
}) {
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() =>
    makeIdempotencyKey("create-production-order"),
  );
  const [form, setForm] = useState({
    orderType: initialType ?? ("ASSEMBLY" as ManufacturingOrderType),
    planId: "",
    bomVersionId: "",
    routingVersionId: "",
    plannedQuantity: "",
    unit: "",
    sourceWarehouseId: "",
    destinationWarehouseId: "",
    sourceLocationId: "",
    destinationLocationId: "",
    plannedStartDate: todayIso(),
    plannedEndDate: todayIso(),
    notes: "",
  });
  const [lotRows, setLotRows] = useState<ManufacturingOrderLotDraft[]>([]);
  const bomsQuery = useManufacturingBomsQuery(
    workspaceId ? { workspaceId, activeOnly: true } : null,
  );
  const plansQuery = useManufacturingPlansQuery(
    workspaceId ? { workspaceId } : null,
  );
  const routingsQuery = useManufacturingRoutingsQuery(
    workspaceId ? { workspaceId, active: true } : null,
  );
  const settingsQuery = useManufacturingSettingsQuery(workspaceId);
  const locationsQuery = useManufacturingLocationsQuery(
    workspaceId ? { workspaceId, active: true } : null,
  );
  const createOrder = useCreateManufacturingOrderMutation();
  const approvedOptions = useMemo<ApprovedBomOption[]>(
    () =>
      (bomsQuery.data ?? []).flatMap((bom) =>
        bom.versions
          .filter((version) => version.status === "APPROVED")
          .map((version) => ({ bom, version })),
      ),
    [bomsQuery.data],
  );
  const approvedRoutingOptions = useMemo<ApprovedRoutingOption[]>(
    () =>
      (routingsQuery.data ?? []).flatMap((routing) =>
        routing.versions
          .filter(
            (version) =>
              version.status === "APPROVED" && version.operations.length > 0,
          )
          .map((version) => ({
            routingId: routing.id,
            routingCode: routing.code,
            routingName: routing.name,
            finishedProductId: routing.finishedProductId,
            versionId: version.id,
            versionNumber: version.versionNumber,
          })),
      ),
    [routingsQuery.data],
  );
  const executablePlans = useMemo(
    () =>
      (plansQuery.data ?? []).filter(
        (plan) =>
          ["APPROVED", "RELEASED", "IN_PROGRESS"].includes(plan.status) &&
          approvedOptions.some(
            (option) =>
              option.version.id === plan.bomVersionId &&
              option.bom.finishedProductId === plan.finishedProductId,
          ) &&
          approvedRoutingOptions.some(
            (option) =>
              option.versionId === plan.routingVersionId &&
              option.finishedProductId === plan.finishedProductId,
          ),
      ),
    [approvedOptions, approvedRoutingOptions, plansQuery.data],
  );
  const selectedOption = approvedOptions.find(
    (option) => option.version.id === form.bomVersionId,
  );
  const selectedPlan = executablePlans.find((plan) => plan.id === form.planId);
  const finishedProduct = selectedOption
    ? items.find((item) => item.id === selectedOption.bom.finishedProductId)
    : undefined;
  const routingOptions = approvedRoutingOptions.filter(
    (option) =>
      option.finishedProductId === selectedOption?.bom.finishedProductId,
  );
  const plannedMicrounits = quantityMicrounits(form.plannedQuantity);
  const lotMicrounits = lotRows.reduce<bigint | null>((total, row) => {
    if (total === null) return null;
    const quantity = quantityMicrounits(row.plannedQuantity);
    return quantity === null ? null : total + quantity;
  }, 0n);
  const lotsMatchPlannedQuantity =
    !lotRows.length ||
    (plannedMicrounits !== null && lotMicrounits === plannedMicrounits);

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    setForm((current) => ({
      ...current,
      sourceWarehouseId:
        current.sourceWarehouseId || settings.rawMaterialWarehouseId || "",
      destinationWarehouseId:
        current.destinationWarehouseId ||
        settings.finishedGoodsQualityWarehouseId ||
        "",
      sourceLocationId:
        current.sourceLocationId ||
        settingsString(settings, "defaultRawMaterialLocationId") ||
        "",
      destinationLocationId:
        current.destinationLocationId ||
        settingsString(settings, "defaultFinishedGoodsHoldLocationId") ||
        "",
    }));
  }, [settingsQuery.data]);

  const selectPlan = (planId: string) => {
    if (!planId) {
      setForm((current) => ({ ...current, planId: "" }));
      return;
    }
    const plan = executablePlans.find((entry) => entry.id === planId);
    if (!plan) return;
    setForm((current) => ({
      ...current,
      planId: plan.id,
      bomVersionId: plan.bomVersionId,
      routingVersionId: plan.routingVersionId ?? "",
      plannedQuantity: editableQuantity(plan.plannedQuantity),
      unit: plan.unit,
      plannedStartDate: plan.plannedStartDate?.slice(0, 10) ?? "",
      plannedEndDate: plan.plannedEndDate?.slice(0, 10) ?? "",
      notes: plan.notes ?? current.notes,
    }));
    setLotRows(
      [...plan.lots]
        .sort((left, right) => left.sequence - right.sequence)
        .map((lot) => ({
          id: nextManufacturingOrderLotDraftId(),
          lotNumber: lot.lotNumber,
          plannedQuantity: editableQuantity(lot.plannedQuantity),
        })),
    );
  };

  const selectBom = (bomVersionId: string) => {
    const option = approvedOptions.find(
      (entry) => entry.version.id === bomVersionId,
    );
    setForm((current) => ({
      ...current,
      planId: "",
      bomVersionId,
      routingVersionId: "",
      unit: option?.version.outputUnit ?? current.unit,
    }));
    setLotRows([]);
  };

  const updateLot = (
    id: string,
    patch: Partial<Omit<ManufacturingOrderLotDraft, "id">>,
  ) => {
    setLotRows((current) =>
      current.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const addLot = () => {
    setLotRows((current) => [
      ...current,
      {
        id: nextManufacturingOrderLotDraftId(),
        lotNumber: "",
        plannedQuantity: "",
      },
    ]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !selectedOption) {
      toast.error("Select an approved BOM / Formula version.");
      return;
    }
    const plannedQuantity = Number(form.plannedQuantity);
    if (
      plannedMicrounits === null ||
      plannedMicrounits <= 0n ||
      !Number.isFinite(plannedQuantity) ||
      plannedQuantity <= 0 ||
      !form.unit.trim() ||
      !form.routingVersionId ||
      !form.sourceWarehouseId ||
      !form.destinationWarehouseId ||
      !form.sourceLocationId ||
      !form.destinationLocationId ||
      !form.plannedStartDate ||
      !form.plannedEndDate
    ) {
      toast.error(
        "Approved routing, quantity, unit, source/FG-Q warehouses, logical locations and planned dates are required.",
      );
      return;
    }
    if (
      form.sourceWarehouseId === form.destinationWarehouseId &&
      form.sourceLocationId === form.destinationLocationId
    ) {
      toast.error(
        "A shared physical warehouse requires distinct RM source and FG-Q receipt locations.",
      );
      return;
    }
    if (form.plannedEndDate < form.plannedStartDate) {
      toast.error("Planned end date cannot be before planned start date.");
      return;
    }
    const lots: Array<{
      lotNumber: string;
      plannedQuantity: number;
    }> = [];
    const lotNumbers = new Set<string>();
    for (const row of lotRows) {
      const normalizedLotNumber = row.lotNumber.trim();
      const quantityUnits = quantityMicrounits(row.plannedQuantity);
      const quantity = Number(row.plannedQuantity);
      if (
        !normalizedLotNumber ||
        quantityUnits === null ||
        quantityUnits <= 0n ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        toast.error(
          "Every lot needs a unique number and a positive quantity with up to 6 decimal places.",
        );
        return;
      }
      const duplicateKey = normalizedLotNumber.toLocaleLowerCase();
      if (lotNumbers.has(duplicateKey)) {
        toast.error(`Lot number ${normalizedLotNumber} is duplicated.`);
        return;
      }
      lotNumbers.add(duplicateKey);
      lots.push({
        lotNumber: normalizedLotNumber,
        plannedQuantity: quantity,
      });
    }
    if (!lotsMatchPlannedQuantity) {
      toast.error(
        "The exact sum of all lot quantities must equal the production order quantity.",
      );
      return;
    }
    createOrder.mutate(
      {
        workspaceId,
        idempotencyKey: createIdempotencyKey,
        orderType: form.orderType,
        finishedProductId: selectedOption.bom.finishedProductId,
        bomVersionId: selectedOption.version.id,
        routingVersionId: form.routingVersionId,
        planId: form.planId || null,
        plannedQuantity,
        unit: form.unit.trim(),
        sourceWarehouseId: form.sourceWarehouseId,
        destinationWarehouseId: form.destinationWarehouseId,
        sourceLocationId: form.sourceLocationId,
        destinationLocationId: form.destinationLocationId,
        plannedStartDate: form.plannedStartDate,
        plannedEndDate: form.plannedEndDate,
        notes: form.notes.trim() || null,
        lots: lots.length ? lots : undefined,
      },
      {
        onSuccess: (order) => {
          toast.success(`${order.orderNumber} was created.`);
          setCreateIdempotencyKey(
            makeIdempotencyKey("create-production-order"),
          );
          onCreated(order);
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Production order could not be created."),
          ),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-[#bdd6f2] bg-[#f8fbff] p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-[#172b49]">
            Create production / batch order
          </h3>
          <p className="text-[11px] text-[#718096]">
            An approved BOM version is mandatory; no provisional or generated
            recipe is used.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRunPreflight}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Run preflight
          </Button>
          {bomsQuery.isError ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void bomsQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry BOMs
            </Button>
          ) : null}
        </div>
      </div>
      {bomsQuery.isLoading ? (
        <div className="my-4 rounded-lg border border-[#dce5ef] bg-white p-4 text-center text-xs text-[#718096]">
          Loading approved BOM versions…
        </div>
      ) : !approvedOptions.length ? (
        <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#f3d5a7] bg-[#fffaf0] p-3 text-xs text-[#8a5714]">
          <span>
            No approved BOM version is available. Approve a real formula before
            creating an order.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onConfigureBom}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Configure BOM / Formula
          </Button>
        </div>
      ) : null}
      {plansQuery.isError ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#f3d5a7] bg-[#fffaf0] px-3 py-2 text-[11px] text-[#8a5714]">
          <span>
            Approved production plans could not be loaded. You can still create
            an unlinked order.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void plansQuery.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry plans
          </Button>
        </div>
      ) : null}
      {settingsQuery.isError || locationsQuery.isError ? (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-[#f1c4c4] bg-[#fff7f5] px-3 py-2 text-[11px] text-[#a33a2b]">
          <span>
            Manufacturing warehouse/location defaults could not be loaded. Order
            creation remains blocked.
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void settingsQuery.refetch();
              void locationsQuery.refetch();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Retry setup
          </Button>
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Approved production plan"
          hint="Optional; selecting one loads its approved foundation."
        >
          <select
            value={form.planId}
            onChange={(event) => selectPlan(event.target.value)}
            disabled={plansQuery.isLoading}
            className={selectClass}
          >
            <option value="">
              {plansQuery.isLoading
                ? "Loading approved plans…"
                : "No plan link"}
            </option>
            {executablePlans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.planNumber} —{" "}
                {plan.finishedProduct?.itemName ?? plan.finishedProductId} ·{" "}
                {formatQuantity(plan.plannedQuantity)} {plan.unit}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Order number"
          hint="Allocated from the controlled production-order sequence."
        >
          <Input
            disabled
            value=""
            className={`${inputClass} bg-[#f3f6fa]`}
            placeholder="Generated on create"
          />
        </Field>
        <Field label="Order type">
          <select
            value={form.orderType}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                orderType: event.target.value as ManufacturingOrderType,
              }))
            }
            className={selectClass}
          >
            {allOrderTypes.map((type) => (
              <option key={type} value={type}>
                {orderTypeLabels[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Approved BOM / Formula">
          <select
            required
            value={form.bomVersionId}
            onChange={(event) => selectBom(event.target.value)}
            className={selectClass}
          >
            <option value="">Select approved version…</option>
            {approvedOptions.map((option) => (
              <option key={option.version.id} value={option.version.id}>
                {option.bom.bomNumber} v{option.version.versionNumber} —{" "}
                {option.bom.finishedProductName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Finished product">
          <Input
            readOnly
            value={
              finishedProduct
                ? `${finishedProduct.itemCode} — ${finishedProduct.itemName}`
                : (selectedOption?.bom.finishedProductName ??
                  "Select a BOM version")
            }
            className={`${inputClass} bg-[#f3f6fa]`}
          />
        </Field>
        <Field
          label="Approved routing"
          hint={
            routingsQuery.isError
              ? "Routing list unavailable"
              : routingOptions.length
                ? "Required; filtered by finished product and executable operations."
                : "No approved routing with operations for this product."
          }
        >
          <select
            required
            value={form.routingVersionId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                routingVersionId: event.target.value,
              }))
            }
            disabled={
              !selectedOption ||
              routingsQuery.isLoading ||
              !routingOptions.length
            }
            className={selectClass}
          >
            <option value="">
              {routingsQuery.isLoading
                ? "Loading routings…"
                : "Select approved routing"}
            </option>
            {routingOptions.map((option) => (
              <option key={option.versionId} value={option.versionId}>
                {option.routingCode} — {option.routingName} · v
                {option.versionNumber}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Planned quantity" hint="Maximum 6 decimal places">
          <Input
            required
            type="number"
            min="0.000001"
            step="0.000001"
            value={form.plannedQuantity}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                plannedQuantity: event.target.value,
              }))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Unit">
          <Input
            required
            value={form.unit}
            onChange={(event) =>
              setForm((current) => ({ ...current, unit: event.target.value }))
            }
            className={inputClass}
          />
        </Field>
        <Field label="Source warehouse">
          <select
            required
            value={form.sourceWarehouseId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sourceWarehouseId: event.target.value,
                sourceLocationId: locationsQuery.data?.some(
                  (location) =>
                    location.id === current.sourceLocationId &&
                    location.warehouseId === event.target.value,
                )
                  ? current.sourceLocationId
                  : "",
              }))
            }
            className={selectClass}
          >
            <option value="">Select material-issue source…</option>
            {warehouses
              .filter(
                (warehouse) =>
                  warehouse.id === settingsQuery.data?.rawMaterialWarehouseId &&
                  (warehouse.type === "RAW_MATERIAL" ||
                    warehouse.allowMaterialIssue),
              )
              .map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
          </select>
        </Field>
        <Field label="RM source location">
          <select
            required
            value={form.sourceLocationId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                sourceLocationId: event.target.value,
              }))
            }
            className={selectClass}
          >
            <option value="">Select released RM location…</option>
            {(locationsQuery.data ?? [])
              .filter(
                (location) =>
                  location.warehouseId === form.sourceWarehouseId &&
                  location.disposition === "RELEASED",
              )
              .map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.name}
                </option>
              ))}
          </select>
        </Field>
        <Field
          label="FG-Q warehouse"
          hint="May be the same physical warehouse as the RM source."
        >
          <select
            required
            value={form.destinationWarehouseId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                destinationWarehouseId: event.target.value,
                destinationLocationId: locationsQuery.data?.some(
                  (location) =>
                    location.id === current.destinationLocationId &&
                    location.warehouseId === event.target.value,
                )
                  ? current.destinationLocationId
                  : "",
              }))
            }
            className={selectClass}
          >
            <option value="">Select finished-goods quality warehouse…</option>
            {warehouses
              .filter(
                (warehouse) =>
                  warehouse.id ===
                  settingsQuery.data?.finishedGoodsQualityWarehouseId,
              )
              .map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name} ({warehouse.code})
                </option>
              ))}
          </select>
        </Field>
        <Field label="FG-Q receipt location">
          <select
            required
            value={form.destinationLocationId}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                destinationLocationId: event.target.value,
              }))
            }
            className={selectClass}
          >
            <option value="">Select QC-hold location…</option>
            {(locationsQuery.data ?? [])
              .filter(
                (location) =>
                  location.warehouseId === form.destinationWarehouseId &&
                  location.disposition === "QC_HOLD",
              )
              .map((location) => (
                <option key={location.id} value={location.id}>
                  {location.code} — {location.name}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Planned start">
          <AppDateInput
            aria-label="Planned start"
            value={form.plannedStartDate}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                plannedStartDate: value,
              }))
            }
            inputClassName={inputClass}
          />
        </Field>
        <Field label="Planned end">
          <AppDateInput
            aria-label="Planned end"
            value={form.plannedEndDate}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                plannedEndDate: value,
              }))
            }
            inputClassName={inputClass}
          />
        </Field>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-[#d7e1ee] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-3 py-2.5">
          <div>
            <div className="text-xs font-semibold text-[#203651]">
              Production lots / batches
            </div>
            <div className="text-[10px] text-[#718096]">
              {selectedPlan
                ? `Loaded from ${selectedPlan.planNumber}; every row remains editable.`
                : "Optional. Add as many controlled lots as the order needs."}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${!lotRows.length ? "border-[#dce5ef] bg-white text-[#718096]" : lotsMatchPlannedQuantity ? "border-[#bde5cf] bg-[#edf9f2] text-[#08783d]" : "border-[#f1c4c4] bg-[#fff1f1] text-[#b42318]"}`}
            >
              {!lotRows.length
                ? "No explicit lots"
                : `${formatQuantityMicrounits(lotMicrounits)} / ${form.plannedQuantity || "—"} ${form.unit || "units"}`}
            </span>
            <Button type="button" size="sm" variant="outline" onClick={addLot}>
              <Plus className="h-3.5 w-3.5" />
              Add lot
            </Button>
          </div>
        </div>
        {lotRows.length ? (
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <div className="grid grid-cols-[36px_minmax(240px,1.2fr)_180px_40px] gap-2 bg-[#fbfcfe] px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-[#718096]">
                <span>#</span>
                <span>Lot / batch number</span>
                <span>Planned quantity</span>
                <span />
              </div>
              {lotRows.map((row, index) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[36px_minmax(240px,1.2fr)_180px_40px] items-center gap-2 border-t border-[#eef2f7] px-3 py-2"
                >
                  <span className="text-center text-[10px] font-semibold text-[#8290a4]">
                    {index + 1}
                  </span>
                  <Input
                    required
                    value={row.lotNumber}
                    onChange={(event) =>
                      updateLot(row.id, { lotNumber: event.target.value })
                    }
                    className={inputClass}
                    placeholder="Enter unique lot number"
                    aria-label={`Lot ${index + 1} number`}
                  />
                  <Input
                    required
                    type="number"
                    min="0.000001"
                    step="0.000001"
                    value={row.plannedQuantity}
                    onChange={(event) =>
                      updateLot(row.id, { plannedQuantity: event.target.value })
                    }
                    className={inputClass}
                    aria-label={`Lot ${index + 1} planned quantity`}
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-[#b42318]"
                    onClick={() =>
                      setLotRows((current) =>
                        current.filter((candidate) => candidate.id !== row.id),
                      )
                    }
                    aria-label={`Remove lot ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-3 py-3 text-[11px] text-[#718096]">
            Without explicit rows, the API creates its controlled default lot.
            Add rows for day-wise or batch-wise execution.
          </div>
        )}
        {lotRows.length && !lotsMatchPlannedQuantity ? (
          <div className="border-t border-[#f1c4c4] bg-[#fff7f5] px-3 py-2 text-[10px] font-medium text-[#b42318]">
            Lot quantities must add up exactly to{" "}
            {form.plannedQuantity || "the planned order quantity"} {form.unit}.
          </div>
        ) : null}
      </div>
      <div className="mt-3">
        <Field label="Order notes">
          <textarea
            value={form.notes}
            onChange={(event) =>
              setForm((current) => ({ ...current, notes: event.target.value }))
            }
            className={textareaClass}
            placeholder="Production instructions or planning note (optional)"
          />
        </Field>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          type="submit"
          size="sm"
          disabled={
            createOrder.isPending ||
            settingsQuery.isLoading ||
            locationsQuery.isLoading ||
            settingsQuery.isError ||
            locationsQuery.isError ||
            !approvedOptions.length ||
            !form.routingVersionId ||
            !lotsMatchPlannedQuantity
          }
        >
          <ClipboardCheck className="h-3.5 w-3.5" />
          {createOrder.isPending ? "Creating order…" : "Create draft order"}
        </Button>
      </div>
    </form>
  );
}

const actionsByStatus: Record<
  ManufacturingOrderStatus,
  ManufacturingOrderActionKind[]
> = {
  DRAFT: ["SUBMIT", "AMEND", "CANCEL"],
  SUBMITTED: ["APPROVE", "AMEND", "CANCEL"],
  APPROVED: ["RESERVE_MATERIALS", "START_PRODUCTION", "AMEND", "CANCEL"],
  RESERVED: [
    "ISSUE_MATERIALS",
    "PACKAGING_ISSUE",
    "RELEASE_RESERVATION",
    "START_PRODUCTION",
    "AMEND",
    "CANCEL",
  ],
  ISSUED: [
    "START_PRODUCTION",
    "ISSUE_MATERIALS",
    "PACKAGING_ISSUE",
    "RETURN_MATERIALS",
    "PACKAGING_RETURN",
  ],
  IN_PRODUCTION: [
    "START_PRODUCTION",
    "START_OPERATION",
    "COMPLETE_OPERATION",
    "POST_SCRAP_DISPOSITION",
    "CREATE_REWORK_DISPOSITION",
    "COMPLETE_PRODUCTION",
    "PLACE_QC_HOLD",
    "RECORD_IN_PROCESS_RESULT",
    "ISSUE_MATERIALS",
    "PACKAGING_ISSUE",
    "RETURN_MATERIALS",
    "PACKAGING_RETURN",
  ],
  QC_HOLD: [
    "RECORD_IN_PROCESS_RESULT",
    "RECORD_QUALITY_RESULT",
    "POST_PRODUCTION_RECEIPT",
    "QA_RELEASE",
    "RETURN_MATERIALS",
    "PACKAGING_RETURN",
  ],
  QA_RELEASED: ["CLOSE"],
  COMPLETED: [
    "PLACE_QC_HOLD",
    "RECORD_QUALITY_RESULT",
    "POST_PRODUCTION_RECEIPT",
    "QA_RELEASE",
    "RETURN_MATERIALS",
    "PACKAGING_RETURN",
  ],
  CLOSED: [],
  CANCELLED: [],
};

const postingActions = new Set<ManufacturingOrderActionKind>([
  "ISSUE_MATERIALS",
  "RETURN_MATERIALS",
  "PACKAGING_ISSUE",
  "PACKAGING_RETURN",
  "POST_PRODUCTION_RECEIPT",
  "POST_SCRAP_DISPOSITION",
  "CREATE_REWORK_DISPOSITION",
  "QA_RELEASE",
  "CLOSE",
]);
const approvalSensitiveActions = new Set<ManufacturingOrderActionKind>([
  "APPROVE",
  "AMEND",
  "CANCEL",
  "POST_SCRAP_DISPOSITION",
  "CREATE_REWORK_DISPOSITION",
  "RECORD_IN_PROCESS_RESULT",
  "RECORD_QUALITY_RESULT",
  "QA_RELEASE",
  "CLOSE",
]);
const stagedApprovalActions = new Set<ManufacturingOrderActionKind>([
  "ISSUE_MATERIALS",
  "COMPLETE_PRODUCTION",
  "RECORD_IN_PROCESS_RESULT",
  "RECORD_QUALITY_RESULT",
  "QA_RELEASE",
]);
const materialLineActions = new Set<ManufacturingOrderActionKind>([
  "ISSUE_MATERIALS",
  "RETURN_MATERIALS",
  "PACKAGING_ISSUE",
  "PACKAGING_RETURN",
]);
const lotLineActions = new Set<ManufacturingOrderActionKind>([
  "COMPLETE_PRODUCTION",
  "POST_PRODUCTION_RECEIPT",
]);
const orderLotActions = new Set<ManufacturingOrderActionKind>([
  "ISSUE_MATERIALS",
  "RETURN_MATERIALS",
  "PACKAGING_ISSUE",
  "PACKAGING_RETURN",
  "START_PRODUCTION",
  "PLACE_QC_HOLD",
  "RECORD_QUALITY_RESULT",
]);
const operationActions = new Set<ManufacturingOrderActionKind>([
  "START_OPERATION",
  "COMPLETE_OPERATION",
  "RECORD_IN_PROCESS_RESULT",
]);
const actionLabels: Partial<Record<ManufacturingOrderActionKind, string>> = {
  SUBMIT: "Submit for approval",
  APPROVE: "Approve order",
  RESERVE_MATERIALS: "Reserve materials",
  RELEASE_RESERVATION: "Release reservation",
  ISSUE_MATERIALS: "Issue raw materials",
  RETURN_MATERIALS: "Return raw materials",
  PACKAGING_ISSUE: "Issue packaging materials",
  PACKAGING_RETURN: "Return packaging materials",
  START_PRODUCTION: "Start production lot",
  START_OPERATION: "Start operation",
  PAUSE_PRODUCTION: "Pause operation",
  RESUME_PRODUCTION: "Resume operation",
  COMPLETE_OPERATION: "Complete operation",
  POST_SCRAP_DISPOSITION: "Post scrap disposition",
  CREATE_REWORK_DISPOSITION: "Create rework disposition",
  COMPLETE_PRODUCTION: "Complete production lot",
  PLACE_QC_HOLD: "Place lot on QC hold",
  RECORD_IN_PROCESS_RESULT: "Record in-process quality result",
  RECORD_QUALITY_RESULT: "Record actual QC result",
  POST_PRODUCTION_RECEIPT: "Receive finished goods into FG-Q",
  QA_RELEASE: "Release finished goods to FG-R",
  CLOSE: "Close production order",
  AMEND: "Amend production order",
  CANCEL: "Cancel production order",
};

function actionLabel(kind: ManufacturingOrderActionKind) {
  return actionLabels[kind] ?? kind.replaceAll("_", " ").toLowerCase();
}

const scrapDispositionReasons = [
  ["PROCESS_LOSS", "Process loss"],
  ["MATERIAL_DAMAGE", "Material damage"],
  ["QUALITY_REJECT", "Quality rejection"],
  ["HANDLING_DAMAGE", "Handling damage"],
  ["OTHER_SCRAP", "Other controlled scrap"],
] as const;

const reworkDispositionReasons = [
  ["PROCESS_DEVIATION", "Process deviation"],
  ["QUALITY_DEVIATION", "Quality deviation"],
  ["SPECIFICATION_FAILURE", "Specification failure"],
  ["REPAIR_REQUIRED", "Repair required"],
  ["OTHER_REWORK", "Other controlled rework"],
] as const;

type OperationDispositionDraft = {
  reasonCode: string;
  scrapInventoryItemId: string;
  scrapDestinationLocationId: string;
  scrapLotNumber: string;
  recoveryUnitCost: string;
  reworkType: "REWORK" | "REPROCESSING";
  bomVersionId: string;
  routingVersionId: string;
  plannedStartDate: string;
  plannedEndDate: string;
};

function blankOperationDispositionDraft(): OperationDispositionDraft {
  const today = todayIso();
  return {
    reasonCode: "",
    scrapInventoryItemId: "",
    scrapDestinationLocationId: "",
    scrapLotNumber: "",
    recoveryUnitCost: "0",
    reworkType: "REWORK",
    bomVersionId: "",
    routingVersionId: "",
    plannedStartDate: today,
    plannedEndDate: today,
  };
}

function parseSerialNumbers(value: string) {
  return value
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function settingsString(
  settings: ManufacturingSettingsRecord | null | undefined,
  key: string,
) {
  const value = settings?.settings?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

type QcResultDraft = {
  id: string;
  parameterCode: string;
  parameterName: string;
  resultType: "NUMERIC" | "TEXT" | "BOOLEAN";
  unit: string | null;
  specificationText: string;
  testMethodSnapshot: string;
  critical: boolean;
  actualValue: string;
  actualText: string;
  remarks: string;
};

function createQcResultDrafts(
  specification: ManufacturingApplicableQualitySpecification,
): QcResultDraft[] {
  return specification.parameters.map((parameter) => ({
    id: parameter.parameterCode,
    parameterCode: parameter.parameterCode,
    parameterName: parameter.parameterName,
    resultType: parameter.resultType,
    unit: parameter.unit,
    specificationText: parameter.specificationText,
    testMethodSnapshot: parameter.testMethodSnapshot,
    critical: parameter.critical,
    actualValue: "",
    actualText: "",
    remarks: "",
  }));
}

export function ManufacturingOrderDetailWorkspace({
  workspaceId,
  orderId,
  preferredAction,
  onBack,
}: {
  workspaceId?: string;
  orderId: string;
  preferredAction?: ManufacturingOrderActionKind;
  onBack: () => void;
}) {
  const orderQuery = useManufacturingOrderQuery(workspaceId, orderId);
  const readinessQuery = useManufacturingReadinessQuery(workspaceId);
  const settingsQuery = useManufacturingSettingsQuery(workspaceId);
  const finishedProductProfilesQuery = useManufacturingItemProfilesQuery(
    orderQuery.data && workspaceId
      ? {
          workspaceId,
          role: "FINISHED_GOOD",
          active: true,
          search: orderQuery.data.finishedProductCode,
        }
      : null,
  );
  const actionMutation = useManufacturingOrderActionMutation();
  const [actionKind, setActionKind] = useState<
    ManufacturingOrderActionKind | ""
  >("");
  const [transactionDate, setTransactionDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [signatureMeaning, setSignatureMeaning] = useState("");
  const [reauthenticationPassword, setReauthenticationPassword] = useState("");
  const [lineQuantities, setLineQuantities] = useState<Record<string, string>>(
    {},
  );
  const [lineRejectedQuantities, setLineRejectedQuantities] = useState<
    Record<string, string>
  >({});
  const [lineSerialNumbers, setLineSerialNumbers] = useState<
    Record<string, string>
  >({});
  const [outputLotNumbers, setOutputLotNumbers] = useState<
    Record<string, string>
  >({});
  const [selectedOrderLotId, setSelectedOrderLotId] = useState("");
  const [selectedOperationExecutionId, setSelectedOperationExecutionId] =
    useState("");
  const [operationActuals, setOperationActuals] = useState({
    inputQuantity: "",
    goodQuantity: "",
    rejectedQuantity: "0",
    scrapQuantity: "0",
    reworkQuantity: "0",
  });
  const [qcActuals, setQcActuals] = useState({
    sampleQuantity: "",
    acceptedQuantity: "",
    rejectedQuantity: "0",
    holdQuantity: "0",
    holdReason: "",
  });
  const [qcResults, setQcResults] = useState<QcResultDraft[]>([]);
  const [closeAttestation, setCloseAttestation] = useState("");
  const [amendmentDraft, setAmendmentDraft] = useState({
    plannedQuantity: "",
    plannedStartDate: "",
    plannedEndDate: "",
    priority: "0",
    notes: "",
  });
  const [dispositionDraft, setDispositionDraft] =
    useState<OperationDispositionDraft>(blankOperationDispositionDraft);
  const [dispositionIdempotencyKey, setDispositionIdempotencyKey] = useState(
    () => makeIdempotencyKey("operation-disposition"),
  );
  const order = orderQuery.data;
  const settings = settingsQuery.data;
  useEffect(() => {
    if (!order) return;
    setAmendmentDraft({
      plannedQuantity: String(order.plannedQuantity),
      plannedStartDate: order.plannedStartDate,
      plannedEndDate: order.plannedEndDate,
      priority: String(order.priority ?? 0),
      notes: order.notes ?? "",
    });
  }, [order]);
  const finishedProductProfile = finishedProductProfilesQuery.data?.find(
    (profile) => profile.inventoryItemId === order?.finishedProductId,
  );
  const serialTrackingRequired = Boolean(
    settings?.serialTrackingRequired || finishedProductProfile?.serialTracked,
  );
  const hasPackagingMaterials = Boolean(
    order?.materials.some(
      (material) => material.itemRole === "PACKAGING_MATERIAL",
    ),
  );
  const availableActions = useMemo(() => {
    if (!order) return [];
    const actions = [...actionsByStatus[order.status]];
    if (order.status === "APPROVED" && settings?.reservationRequired === false)
      actions.splice(1, 0, "ISSUE_MATERIALS");
    return actions.filter(
      (kind) =>
        hasPackagingMaterials ||
        (kind !== "PACKAGING_ISSUE" && kind !== "PACKAGING_RETURN"),
    );
  }, [hasPackagingMaterials, order, settings?.reservationRequired]);
  const selectedAction = resolveManufacturingOrderAction(
    availableActions,
    actionKind,
    preferredAction,
  );
  const isDisposition = isManufacturingDispositionAction(selectedAction);
  const scrapProfilesQuery = useManufacturingItemProfilesQuery(
    workspaceId && order && selectedAction === "POST_SCRAP_DISPOSITION"
      ? { workspaceId, role: "BY_PRODUCT", active: true }
      : null,
  );
  const scrapLocationsQuery = useManufacturingLocationsQuery(
    workspaceId && order && selectedAction === "POST_SCRAP_DISPOSITION"
      ? { workspaceId, disposition: "SCRAP", active: true }
      : null,
  );
  const dispositionBomsQuery = useManufacturingBomsQuery(
    workspaceId && order && selectedAction === "CREATE_REWORK_DISPOSITION"
      ? {
          workspaceId,
          finishedProductId: order.finishedProductId,
          activeOnly: true,
        }
      : null,
  );
  const dispositionRoutingsQuery = useManufacturingRoutingsQuery(
    workspaceId && order && selectedAction === "CREATE_REWORK_DISPOSITION"
      ? {
          workspaceId,
          finishedProductId: order.finishedProductId,
          active: true,
        }
      : null,
  );
  const dispositionCandidates = useMemo(
    () =>
      order && isDisposition
        ? manufacturingDispositionCandidates(order, selectedAction)
        : [],
    [isDisposition, order, selectedAction],
  );
  const compatibleScrapProfiles = useMemo(
    () =>
      (scrapProfilesQuery.data ?? []).filter(
        (profile) =>
          profile.inventoryItemId !== order?.finishedProductId &&
          profile.unit === order?.unit,
      ),
    [order?.finishedProductId, order?.unit, scrapProfilesQuery.data],
  );
  const scrapLocations = useMemo(
    () =>
      (scrapLocationsQuery.data ?? []).filter(
        (location) =>
          location.warehouseId === settings?.scrapWarehouseId &&
          location.disposition === "SCRAP" &&
          location.isActive,
      ),
    [scrapLocationsQuery.data, settings?.scrapWarehouseId],
  );
  const approvedDispositionBoms = useMemo(
    () =>
      (dispositionBomsQuery.data ?? []).flatMap((bom) =>
        bom.versions
          .filter((version) => version.status === "APPROVED")
          .map((version) => ({ bom, version })),
      ),
    [dispositionBomsQuery.data],
  );
  const approvedDispositionRoutings = useMemo(
    () =>
      (dispositionRoutingsQuery.data ?? []).flatMap((routing) =>
        routing.versions
          .filter(
            (version) =>
              version.status === "APPROVED" && version.operations.length > 0,
          )
          .map((version) => ({ routing, version })),
      ),
    [dispositionRoutingsQuery.data],
  );
  const independentQualityApprovalRequired =
    (selectedAction === "RECORD_QUALITY_RESULT" ||
      selectedAction === "RECORD_IN_PROCESS_RESULT") &&
    (settings?.mode === "PHARMACEUTICAL" || settings?.mode === "HYBRID");
  const fallbackElectronicSignatureRequired =
    selectedAction === "QA_RELEASE" ||
    selectedAction === "RECORD_IN_PROCESS_RESULT" ||
    independentQualityApprovalRequired;
  const qualitySpecificationQuery =
    useManufacturingOrderQualitySpecificationQuery(
      workspaceId,
      order?.id,
      transactionDate,
      selectedAction === "RECORD_QUALITY_RESULT" ||
        selectedAction === "RECORD_IN_PROCESS_RESULT",
    );
  const needsMaterialLines = selectedAction
    ? materialLineActions.has(selectedAction)
    : false;
  const needsLotLines = selectedAction
    ? lotLineActions.has(selectedAction)
    : false;
  const needsOrderLot = selectedAction
    ? orderLotActions.has(selectedAction)
    : false;
  const needsOperation = selectedAction
    ? operationActions.has(selectedAction)
    : false;
  const postingBlocked = Boolean(
    selectedAction &&
    postingActions.has(selectedAction) &&
    (readinessQuery.isLoading ||
      readinessQuery.isError ||
      readinessQuery.data?.ready !== true),
  );
  const settingsBlocked = Boolean(
    selectedAction &&
    ((selectedAction === "POST_PRODUCTION_RECEIPT" &&
      (settingsQuery.isLoading ||
        settingsQuery.isError ||
        finishedProductProfilesQuery.isLoading ||
        finishedProductProfilesQuery.isError ||
        !settings?.finishedGoodsQualityWarehouseId)) ||
      (selectedAction === "QA_RELEASE" &&
        (settingsQuery.isLoading ||
          settingsQuery.isError ||
          !settings?.finishedGoodsReleasedWarehouseId))),
  );
  const qualitySpecificationBlocked =
    (selectedAction === "RECORD_QUALITY_RESULT" ||
      selectedAction === "RECORD_IN_PROCESS_RESULT") &&
    (qualitySpecificationQuery.isLoading ||
      qualitySpecificationQuery.isError ||
      !qualitySpecificationQuery.data);
  const approvalControlBlocked = Boolean(
    selectedAction &&
    approvalSensitiveActions.has(selectedAction) &&
    (settingsQuery.isLoading || settingsQuery.isError || !settings),
  );
  const dispositionControlsBlocked = Boolean(
    selectedAction === "POST_SCRAP_DISPOSITION"
      ? settingsQuery.isLoading ||
          settingsQuery.isError ||
          !settings?.scrapWarehouseId ||
          !settings?.wipWarehouseId ||
          !settings?.scrapRecoveryAccountId ||
          !settings?.wipInventoryAccountId ||
          scrapProfilesQuery.isLoading ||
          scrapProfilesQuery.isError ||
          scrapLocationsQuery.isLoading ||
          scrapLocationsQuery.isError ||
          compatibleScrapProfiles.length === 0 ||
          scrapLocations.length === 0 ||
          dispositionCandidates.length === 0
      : selectedAction === "CREATE_REWORK_DISPOSITION"
        ? dispositionBomsQuery.isLoading ||
          dispositionBomsQuery.isError ||
          dispositionRoutingsQuery.isLoading ||
          dispositionRoutingsQuery.isError ||
          approvedDispositionBoms.length === 0 ||
          approvedDispositionRoutings.length === 0 ||
          dispositionCandidates.length === 0
        : false,
  );
  const actionMaterials = useMemo(() => {
    if (!order || !selectedAction || !needsMaterialLines) return [];
    const packaging =
      selectedAction === "PACKAGING_ISSUE" ||
      selectedAction === "PACKAGING_RETURN";
    return order.materials.filter((material) =>
      packaging
        ? material.itemRole === "PACKAGING_MATERIAL"
        : material.itemRole !== "PACKAGING_MATERIAL" &&
          material.itemRole !== "FINISHED_GOOD" &&
          material.itemRole !== "BY_PRODUCT",
    );
  }, [needsMaterialLines, order, selectedAction]);
  const operationCandidates = useMemo(() => {
    if (!order || !selectedAction) return [];
    const status =
      selectedAction === "START_OPERATION"
        ? "READY"
        : selectedAction === "RESUME_PRODUCTION"
          ? "PAUSED"
          : selectedAction === "RECORD_IN_PROCESS_RESULT"
            ? null
            : selectedAction === "PAUSE_PRODUCTION" ||
                selectedAction === "COMPLETE_OPERATION"
              ? "IN_PROGRESS"
              : null;
    if (selectedAction === "RECORD_IN_PROCESS_RESULT") {
      return order.operationExecutions.filter(
        (execution) =>
          execution.status === "IN_PROGRESS" || execution.status === "PAUSED",
      );
    }
    return status
      ? order.operationExecutions.filter(
          (execution) => execution.status === status,
        )
      : [];
  }, [order, selectedAction]);
  const pendingReleaseLines = useMemo(() => {
    if (!order) return [];
    const releasedLotIds = new Set(
      order.transactions
        .filter(
          (transaction) =>
            transaction.status === "POSTED" &&
            transaction.transactionType === "QA_RELEASE",
        )
        .flatMap((transaction) =>
          transaction.lines
            .map((line) => line.sourceInventoryLotId)
            .filter((value): value is string => Boolean(value)),
        ),
    );
    return order.transactions
      .filter(
        (transaction) =>
          transaction.status === "POSTED" &&
          transaction.transactionType === "PRODUCTION_RECEIPT",
      )
      .flatMap((transaction) =>
        transaction.lines
          .filter(
            (line) =>
              !line.orderMaterialId &&
              line.inventoryItemId === order.finishedProductId &&
              line.destinationInventoryLot &&
              !releasedLotIds.has(line.destinationInventoryLot.id),
          )
          .map((line) => ({
            transactionId: transaction.id,
            orderLotId: transaction.orderLotId,
            line,
          })),
      );
  }, [order]);
  const latestCostSnapshot = order?.costSnapshots.at(-1);

  useEffect(() => {
    if (!order?.lots.length) {
      setSelectedOrderLotId("");
      return;
    }
    if (!order.lots.some((lot) => lot.id === selectedOrderLotId))
      setSelectedOrderLotId(order.lots[0].id);
  }, [order, selectedOrderLotId]);

  useEffect(() => {
    if (!operationCandidates.length) {
      setSelectedOperationExecutionId("");
      return;
    }
    if (
      !operationCandidates.some(
        (execution) => execution.id === selectedOperationExecutionId,
      )
    )
      setSelectedOperationExecutionId(operationCandidates[0].id);
  }, [operationCandidates, selectedOperationExecutionId]);

  useEffect(() => {
    if (!isDisposition) return;
    if (!dispositionCandidates.length) {
      setSelectedOperationExecutionId("");
      return;
    }
    if (
      !dispositionCandidates.some(
        (candidate) => candidate.execution.id === selectedOperationExecutionId,
      )
    ) {
      setSelectedOperationExecutionId(
        dispositionCandidates.length === 1
          ? dispositionCandidates[0].execution.id
          : "",
      );
    }
  }, [dispositionCandidates, isDisposition, selectedOperationExecutionId]);

  useEffect(() => {
    if (selectedAction !== "POST_SCRAP_DISPOSITION") return;
    setDispositionDraft((current) => ({
      ...current,
      scrapInventoryItemId: compatibleScrapProfiles.some(
        (profile) => profile.inventoryItemId === current.scrapInventoryItemId,
      )
        ? current.scrapInventoryItemId
        : compatibleScrapProfiles.length === 1
          ? compatibleScrapProfiles[0].inventoryItemId
          : "",
      scrapDestinationLocationId: scrapLocations.some(
        (location) => location.id === current.scrapDestinationLocationId,
      )
        ? current.scrapDestinationLocationId
        : scrapLocations.length === 1
          ? scrapLocations[0].id
          : "",
    }));
  }, [compatibleScrapProfiles, scrapLocations, selectedAction]);

  useEffect(() => {
    if (selectedAction !== "CREATE_REWORK_DISPOSITION") return;
    setDispositionDraft((current) => ({
      ...current,
      bomVersionId: approvedDispositionBoms.some(
        ({ version }) => version.id === current.bomVersionId,
      )
        ? current.bomVersionId
        : approvedDispositionBoms.length === 1
          ? approvedDispositionBoms[0].version.id
          : "",
      routingVersionId: approvedDispositionRoutings.some(
        ({ version }) => version.id === current.routingVersionId,
      )
        ? current.routingVersionId
        : approvedDispositionRoutings.length === 1
          ? approvedDispositionRoutings[0].version.id
          : "",
    }));
  }, [approvedDispositionBoms, approvedDispositionRoutings, selectedAction]);

  useEffect(() => {
    if (!order || selectedAction !== "COMPLETE_PRODUCTION") return;
    setLineQuantities((current) => {
      const next = { ...current };
      for (const lot of order.lots) {
        const finalExecution = order.operationExecutions
          .filter(
            (execution) =>
              execution.orderLotId === lot.id &&
              execution.status === "COMPLETED",
          )
          .sort(
            (left, right) =>
              (left.operationSequence ?? 0) - (right.operationSequence ?? 0),
          )
          .at(-1);
        if (finalExecution && next[`lot:${lot.id}`] === undefined)
          next[`lot:${lot.id}`] = String(finalExecution.goodQuantity);
      }
      return next;
    });
    setLineRejectedQuantities((current) => {
      const next = { ...current };
      for (const lot of order.lots) {
        const finalExecution = order.operationExecutions
          .filter(
            (execution) =>
              execution.orderLotId === lot.id &&
              execution.status === "COMPLETED",
          )
          .sort(
            (left, right) =>
              (left.operationSequence ?? 0) - (right.operationSequence ?? 0),
          )
          .at(-1);
        if (finalExecution && next[`lot:${lot.id}`] === undefined)
          next[`lot:${lot.id}`] = String(
            finalExecution.rejectedQuantity + finalExecution.scrapQuantity,
          );
      }
      return next;
    });
  }, [order, selectedAction]);

  useEffect(() => {
    if (
      !order ||
      !selectedOrderLotId ||
      (selectedAction !== "PLACE_QC_HOLD" &&
        selectedAction !== "RECORD_QUALITY_RESULT" &&
        selectedAction !== "RECORD_IN_PROCESS_RESULT")
    )
      return;
    const execution = order.operationExecutions.find(
      (entry) => entry.id === selectedOperationExecutionId,
    );
    const lot = order.lots.find((entry) => entry.id === selectedOrderLotId);
    const presentedQuantity =
      selectedAction === "RECORD_IN_PROCESS_RESULT"
        ? execution?.inputQuantity || execution?.plannedQuantity
        : lot?.completedQuantity;
    if (presentedQuantity)
      setQcActuals((current) => ({
        ...current,
        sampleQuantity: String(presentedQuantity),
      }));
  }, [order, selectedAction, selectedOperationExecutionId, selectedOrderLotId]);

  useEffect(() => {
    const specification = qualitySpecificationQuery.data;
    if (
      (selectedAction !== "RECORD_QUALITY_RESULT" &&
        selectedAction !== "RECORD_IN_PROCESS_RESULT") ||
      !specification
    )
      return;
    setQcResults((current) => {
      const expectedCodes = specification.parameters.map(
        (parameter) => parameter.parameterCode,
      );
      if (
        current.length === expectedCodes.length &&
        current.every(
          (row, index) => row.parameterCode === expectedCodes[index],
        )
      ) {
        return current;
      }
      return createQcResultDrafts(specification);
    });
  }, [qualitySpecificationQuery.data, selectedAction]);

  const resetActionForm = () => {
    setActionKind("");
    setNote("");
    setSignatureMeaning("");
    setReauthenticationPassword("");
    setLineQuantities({});
    setLineRejectedQuantities({});
    setLineSerialNumbers({});
    setOutputLotNumbers({});
    setOperationActuals({
      inputQuantity: "",
      goodQuantity: "",
      rejectedQuantity: "0",
      scrapQuantity: "0",
      reworkQuantity: "0",
    });
    setQcActuals({
      sampleQuantity: "",
      acceptedQuantity: "",
      rejectedQuantity: "0",
      holdQuantity: "0",
      holdReason: "",
    });
    setQcResults([]);
    setCloseAttestation("");
    setDispositionDraft(blankOperationDispositionDraft());
    setDispositionIdempotencyKey(makeIdempotencyKey("operation-disposition"));
  };

  const submitAction = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !order || !selectedAction) return;
    if (approvalControlBlocked) {
      toast.error(
        "Manufacturing approval and electronic-signature controls could not be verified. Retry settings before this controlled action.",
      );
      return;
    }
    if (dispositionControlsBlocked) {
      toast.error(
        dispositionCandidates.length === 0
          ? "Complete an operation with a positive undisposed scrap or rework quantity first."
          : selectedAction === "POST_SCRAP_DISPOSITION"
            ? "Scrap posting is blocked until SCRAP/WIP warehouses, Scrap-recovery/WIP ledgers, an active SCRAP location and a compatible BY_PRODUCT item are configured."
            : "Rework posting is blocked until approved BOM and routing versions exist for this finished product.",
      );
      return;
    }
    if (
      (((settings?.electronicSignatureRequired ||
        selectedAction === "APPROVE") &&
        approvalSensitiveActions.has(selectedAction)) ||
        fallbackElectronicSignatureRequired) &&
      !signatureMeaning.trim()
    ) {
      toast.error(
        `Enter the electronic-signature meaning for ${actionLabel(selectedAction)}.`,
      );
      return;
    }
    if (postingBlocked) {
      toast.error(
        "Manufacturing readiness is blocked. Complete required warehouse and account settings before posting this action.",
      );
      return;
    }
    if (settingsBlocked) {
      toast.error(
        "Verify the finished-product controls and configure the required FG-Q / FG-R warehouse mapping before this posting action.",
      );
      return;
    }
    const lines: ManufacturingOrderActionLineInput[] = [];
    const payload: ManufacturingJsonObject = {};

    if (needsOrderLot) {
      if (!selectedOrderLotId) {
        toast.error("Select the production lot / batch for this action.");
        return;
      }
      payload.orderLotId = selectedOrderLotId;
    }

    if (needsOperation) {
      if (!selectedOperationExecutionId) {
        toast.error(
          `No operation is currently eligible to ${actionLabel(selectedAction).toLowerCase()}.`,
        );
        return;
      }
      payload.operationExecutionId = selectedOperationExecutionId;
    }

    if (isManufacturingDispositionAction(selectedAction)) {
      const candidate = dispositionCandidates.find(
        (entry) => entry.execution.id === selectedOperationExecutionId,
      );
      if (!candidate) {
        toast.error(
          "Select a completed operation with an undisposed recorded quantity.",
        );
        return;
      }
      if (!candidate.execution.orderLotId) {
        toast.error(
          "The selected operation is not linked to an auditable production lot.",
        );
        return;
      }
      if (!dispositionDraft.reasonCode) {
        toast.error("Select a controlled disposition reason code.");
        return;
      }
      if (!note.trim()) {
        toast.error("Enter the required disposition note.");
        return;
      }
      if (
        !Number.isFinite(candidate.remainingQuantity) ||
        candidate.remainingQuantity <= 0
      ) {
        toast.error("No positive undisposed operation quantity remains.");
        return;
      }

      if (selectedAction === "POST_SCRAP_DISPOSITION") {
        const scrapProfile = compatibleScrapProfiles.find(
          (profile) =>
            profile.inventoryItemId === dispositionDraft.scrapInventoryItemId,
        );
        const scrapLocation = scrapLocations.find(
          (location) =>
            location.id === dispositionDraft.scrapDestinationLocationId,
        );
        const recoveryUnitCost = Number(dispositionDraft.recoveryUnitCost);
        const recoveryDecimals =
          dispositionDraft.recoveryUnitCost.trim().split(".")[1]?.length ?? 0;
        if (!scrapProfile) {
          toast.error(
            `Select an active BY_PRODUCT item whose base unit is ${order.unit}.`,
          );
          return;
        }
        if (!scrapLocation) {
          toast.error(
            "Select an active SCRAP location in the configured scrap warehouse.",
          );
          return;
        }
        if (!dispositionDraft.scrapLotNumber.trim()) {
          toast.error("Enter a unique scrap lot number.");
          return;
        }
        if (
          !Number.isFinite(recoveryUnitCost) ||
          recoveryUnitCost < 0 ||
          recoveryDecimals > 6
        ) {
          toast.error(
            "Recovery unit cost must be non-negative with no more than six decimal places; enter 0 when no value is recoverable.",
          );
          return;
        }
        const scrapPayload: ManufacturingScrapDispositionPayload = {
          operationExecutionId: candidate.execution.id,
          destinationLocationId: scrapLocation.id,
          scrapInventoryItemId: scrapProfile.inventoryItemId,
          scrapLotNumber: dispositionDraft.scrapLotNumber.trim(),
          recoveryUnitCost,
          reasonCode: dispositionDraft.reasonCode,
        };
        Object.assign(payload, scrapPayload);
        lines.push({
          orderLotId: candidate.execution.orderLotId,
          inventoryItemId: scrapProfile.inventoryItemId,
          lotNumber: dispositionDraft.scrapLotNumber.trim(),
          destinationWarehouseId: settings?.scrapWarehouseId ?? undefined,
          destinationLocationId: scrapLocation.id,
          quantity: candidate.remainingQuantity,
          unit: order.unit,
          unitCost: recoveryUnitCost,
          reasonCode: dispositionDraft.reasonCode,
        });
      } else {
        const bomOption = approvedDispositionBoms.find(
          ({ version }) => version.id === dispositionDraft.bomVersionId,
        );
        const routingOption = approvedDispositionRoutings.find(
          ({ version }) => version.id === dispositionDraft.routingVersionId,
        );
        if (!bomOption) {
          toast.error(
            "Select an approved BOM / Formula for the same finished product.",
          );
          return;
        }
        if (!routingOption) {
          toast.error(
            "Select an approved routing with operations for the same finished product.",
          );
          return;
        }
        if (
          !dispositionDraft.plannedStartDate ||
          !dispositionDraft.plannedEndDate ||
          dispositionDraft.plannedEndDate < dispositionDraft.plannedStartDate
        ) {
          toast.error(
            "Rework planned end date cannot be earlier than its start date.",
          );
          return;
        }
        const reworkPayload: ManufacturingReworkDispositionPayload = {
          operationExecutionId: candidate.execution.id,
          reworkType: dispositionDraft.reworkType,
          bomVersionId: bomOption.version.id,
          routingVersionId: routingOption.version.id,
          plannedStartDate: dispositionDraft.plannedStartDate,
          plannedEndDate: dispositionDraft.plannedEndDate,
          reasonCode: dispositionDraft.reasonCode,
        };
        Object.assign(payload, reworkPayload);
        lines.push({
          orderLotId: candidate.execution.orderLotId,
          inventoryItemId: order.finishedProductId,
          quantity: candidate.remainingQuantity,
          unit: order.unit,
          reasonCode: dispositionDraft.reasonCode,
        });
      }
    }

    if (needsMaterialLines) {
      for (const material of actionMaterials) {
        const raw = lineQuantities[`material:${material.id}`];
        if (!raw) continue;
        const quantity = Number(raw);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          toast.error("Entered material quantities must be positive numbers.");
          return;
        }
        lines.push({
          orderMaterialId: material.id,
          orderLotId: selectedOrderLotId,
          inventoryItemId: material.inventoryItemId,
          sourceWarehouseId:
            material.sourceWarehouseId ?? order.sourceWarehouseId,
          quantity,
          unit: material.unit,
        });
      }
    }

    if (selectedAction === "COMPLETE_PRODUCTION") {
      for (const lot of order.lots) {
        if (lot.completedQuantity + lot.rejectedQuantity > 0) continue;
        const goodRaw = lineQuantities[`lot:${lot.id}`];
        const rejectedRaw = lineRejectedQuantities[`lot:${lot.id}`];
        if (!goodRaw && !rejectedRaw) continue;
        const quantity = Number(goodRaw || 0);
        const rejectedQuantity = Number(rejectedRaw || 0);
        if (
          !Number.isFinite(quantity) ||
          quantity < 0 ||
          !Number.isFinite(rejectedQuantity) ||
          rejectedQuantity < 0 ||
          quantity + rejectedQuantity <= 0
        ) {
          toast.error(
            "Lot good and rejected quantities must be non-negative and have a positive combined quantity.",
          );
          return;
        }
        lines.push({
          orderLotId: lot.id,
          lotId: lot.id,
          lotNumber: lot.lotNumber,
          quantity,
          unit: order.unit,
          payload: { rejectedQuantity },
        });
      }
    }

    if (selectedAction === "POST_PRODUCTION_RECEIPT") {
      if (!settings?.finishedGoodsQualityWarehouseId) {
        toast.error("Configure the FG-Q warehouse before production receipt.");
        return;
      }
      for (const lot of order.lots) {
        const alreadyReceived = order.transactions
          .filter(
            (transaction) =>
              transaction.status === "POSTED" &&
              transaction.transactionType === "PRODUCTION_RECEIPT" &&
              transaction.orderLotId === lot.id,
          )
          .flatMap((transaction) => transaction.lines)
          .filter(
            (line) =>
              !line.orderMaterialId &&
              line.inventoryItemId === order.finishedProductId,
          )
          .reduce((total, line) => total + line.quantity, 0);
        const quantity = lot.completedQuantity - alreadyReceived;
        if (quantity <= 0) continue;
        const serialNumbers = parseSerialNumbers(
          lineSerialNumbers[`lot:${lot.id}`] ?? "",
        );
        if (
          serialTrackingRequired &&
          (!Number.isInteger(quantity) || serialNumbers.length !== quantity)
        ) {
          toast.error(
            `Lot ${lot.lotNumber} requires exactly ${formatQuantity(quantity)} unique serial number(s).`,
          );
          return;
        }
        if (new Set(serialNumbers).size !== serialNumbers.length) {
          toast.error(
            `Serial numbers for lot ${lot.lotNumber} must be unique.`,
          );
          return;
        }
        const outputLotNumber =
          outputLotNumbers[`lot:${lot.id}`]?.trim() || lot.lotNumber;
        lines.push({
          orderLotId: lot.id,
          lotId: lot.id,
          lotNumber: outputLotNumber,
          destinationWarehouseId: settings.finishedGoodsQualityWarehouseId,
          destinationLocationId: settingsString(
            settings,
            "defaultFinishedGoodsHoldLocationId",
          ),
          quantity,
          unit: order.unit,
          serialNumbers: serialNumbers.length ? serialNumbers : undefined,
          payload: { outputLotNumber },
        });
      }
    }

    if (selectedAction === "QA_RELEASE") {
      if (!settings?.finishedGoodsReleasedWarehouseId) {
        toast.error("Configure the FG-R warehouse before quality release.");
        return;
      }
      for (const pending of pendingReleaseLines) {
        if (!pending.line.destinationInventoryLot) continue;
        lines.push({
          orderLotId: pending.orderLotId ?? undefined,
          inventoryLotId: pending.line.destinationInventoryLot.id,
          sourceWarehouseId: pending.line.destinationInventoryLot.warehouseId,
          destinationWarehouseId: settings.finishedGoodsReleasedWarehouseId,
          destinationLocationId: settingsString(
            settings,
            "defaultFinishedGoodsReleaseLocationId",
          ),
          quantity: pending.line.quantity,
          unit: pending.line.unit,
          serialNumbers: pending.line.serialNumbers.length
            ? pending.line.serialNumbers
            : undefined,
        });
      }
      if (!lines.length) {
        toast.error(
          "No unreleased posted FG-Q receipt lot is available for QA release.",
        );
        return;
      }
    }

    if (selectedAction === "COMPLETE_OPERATION") {
      const inputQuantity = Number(operationActuals.inputQuantity);
      const goodQuantity = Number(operationActuals.goodQuantity);
      const rejectedQuantity = Number(operationActuals.rejectedQuantity || 0);
      const scrapQuantity = Number(operationActuals.scrapQuantity || 0);
      const reworkQuantity = Number(operationActuals.reworkQuantity || 0);
      const outputs =
        goodQuantity + rejectedQuantity + scrapQuantity + reworkQuantity;
      if (
        ![
          inputQuantity,
          goodQuantity,
          rejectedQuantity,
          scrapQuantity,
          reworkQuantity,
        ].every(Number.isFinite) ||
        inputQuantity <= 0 ||
        goodQuantity < 0 ||
        rejectedQuantity < 0 ||
        scrapQuantity < 0 ||
        reworkQuantity < 0
      ) {
        toast.error(
          "Enter valid non-negative operation actuals and a positive input quantity.",
        );
        return;
      }
      if (Math.abs(outputs - inputQuantity) > 0.000001) {
        toast.error(
          "Good + rejected + scrap + rework must exactly equal operation input.",
        );
        return;
      }
      Object.assign(payload, {
        inputQuantity,
        goodQuantity,
        rejectedQuantity,
        scrapQuantity,
        reworkQuantity,
      });
    }

    if (selectedAction === "PLACE_QC_HOLD") {
      const sampleQuantity = Number(qcActuals.sampleQuantity);
      if (!Number.isFinite(sampleQuantity) || sampleQuantity <= 0) {
        toast.error("Enter the positive quantity being presented for QC hold.");
        return;
      }
      payload.sampleQuantity = sampleQuantity;
      if (qcActuals.holdReason.trim())
        payload.holdReason = qcActuals.holdReason.trim();
    }

    if (
      selectedAction === "RECORD_QUALITY_RESULT" ||
      selectedAction === "RECORD_IN_PROCESS_RESULT"
    ) {
      const specification = qualitySpecificationQuery.data;
      if (!specification) {
        toast.error(
          selectedAction === "RECORD_IN_PROCESS_RESULT"
            ? "Approve an effective Quality Specification with approved Test Methods before recording in-process results."
            : "Approve an effective Quality Specification with approved Test Methods before recording finished-good QC results.",
        );
        return;
      }
      const sampleQuantity = Number(qcActuals.sampleQuantity);
      const acceptedQuantity = Number(qcActuals.acceptedQuantity);
      const rejectedQuantity = Number(qcActuals.rejectedQuantity || 0);
      const holdQuantity = Number(qcActuals.holdQuantity || 0);
      if (
        ![
          sampleQuantity,
          acceptedQuantity,
          rejectedQuantity,
          holdQuantity,
        ].every(Number.isFinite) ||
        sampleQuantity <= 0 ||
        acceptedQuantity < 0 ||
        rejectedQuantity < 0 ||
        holdQuantity < 0
      ) {
        toast.error(
          "Enter valid non-negative QC quantities and a positive sample quantity.",
        );
        return;
      }
      if (
        Math.abs(
          acceptedQuantity + rejectedQuantity + holdQuantity - sampleQuantity,
        ) > 0.000001
      ) {
        toast.error(
          "Accepted + rejected + hold must exactly equal the QC sample quantity.",
        );
        return;
      }
      const resultRows: ManufacturingJsonObject[] = [];
      for (const result of qcResults) {
        const actualValue =
          result.resultType === "NUMERIC" && result.actualValue.trim()
            ? Number(result.actualValue)
            : undefined;
        const actualText = result.actualText.trim();
        if (result.resultType === "NUMERIC" && actualValue === undefined) {
          toast.error(
            `${result.parameterName} requires a numeric actual result.`,
          );
          return;
        }
        if (actualValue !== undefined && !Number.isFinite(actualValue)) {
          toast.error(
            `${result.parameterName} has an invalid numeric actual value.`,
          );
          return;
        }
        if (result.resultType !== "NUMERIC" && !actualText) {
          toast.error(`${result.parameterName} requires an actual result.`);
          return;
        }
        resultRows.push({
          parameterCode: result.parameterCode,
          ...(actualValue === undefined ? {} : { actualValue }),
          ...(actualText ? { actualText } : {}),
          ...(result.remarks.trim() ? { remarks: result.remarks.trim() } : {}),
        });
      }
      if (resultRows.length !== specification.parameters.length) {
        toast.error(
          "Every approved quality-specification parameter requires an actual result.",
        );
        return;
      }
      Object.assign(payload, {
        qualitySpecificationId: specification.id,
        sampleQuantity,
        acceptedQuantity,
        rejectedQuantity,
        holdQuantity,
        results: resultRows,
      });
      if (holdQuantity > 0 && qcActuals.holdReason.trim())
        payload.holdReason = qcActuals.holdReason.trim();
    }

    if (selectedAction === "AMEND") {
      if (!note.trim()) {
        toast.error(
          "Enter the controlled reason for amending this production order.",
        );
        return;
      }
      const amendment = buildManufacturingOrderAmendmentPayload(
        amendmentDraft,
        order,
      );
      if (!amendment.ok) {
        toast.error(amendment.message);
        return;
      }
      Object.assign(payload, amendment.payload);
    }

    if (selectedAction === "CANCEL" && !note.trim()) {
      toast.error(
        "Enter the controlled reason for cancelling this production order.",
      );
      return;
    }

    if (selectedAction === "CLOSE") {
      if (!note.trim()) {
        toast.error(
          "Enter a controlled close reason before closing this production order.",
        );
        return;
      }
      if (latestCostSnapshot?.status === "PROVISIONAL") {
        if (!closeAttestation.trim()) {
          toast.error(
            "Explain why labour, machine, overhead, subcontract and other actual costs are not applicable.",
          );
          return;
        }
        payload.extraCostsNotApplicableReason = closeAttestation.trim();
      }
    }

    if (needsMaterialLines && !actionMaterials.length) {
      toast.error(
        `No applicable ${selectedAction === "PACKAGING_ISSUE" || selectedAction === "PACKAGING_RETURN" ? "packaging" : "raw-material"} requirement exists for this order.`,
      );
      return;
    }
    const hasApplicableLineRows =
      (needsMaterialLines && actionMaterials.length > 0) ||
      (needsLotLines && order.lots.length > 0);
    if (hasApplicableLineRows && !lines.length) {
      toast.error(
        `Enter or confirm at least one valid ${needsMaterialLines ? "material" : "lot"} row for this action.`,
      );
      return;
    }
    actionMutation.mutate(
      {
        workspaceId,
        orderId: order.id,
        input: {
          kind: selectedAction,
          idempotencyKey: isManufacturingDispositionAction(selectedAction)
            ? dispositionIdempotencyKey
            : makeIdempotencyKey(
                `order-${order.id}-${selectedAction.toLowerCase()}`,
              ),
          transactionDate,
          lines: lines.length ? lines : undefined,
          payload: Object.keys(payload).length ? payload : undefined,
          note: note.trim() || undefined,
          signatureMeaning: signatureMeaning.trim() || undefined,
          reauthenticationPassword: reauthenticationPassword || undefined,
        },
      },
      {
        onSuccess: (result) => {
          if (
            result.action.approvalProgress &&
            !result.action.approvalProgress.complete
          ) {
            toast.success(
              `Approval stage ${result.action.approvalProgress.completedStages} of ${result.action.approvalProgress.totalStages} recorded for ${result.order.orderNumber}. Update the signature meaning for the next stage and submit the unchanged action again.`,
            );
            return;
          }
          toast.success(
            `${actionLabel(selectedAction)} recorded for ${result.order.orderNumber}.`,
          );
          resetActionForm();
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(
              error,
              "Production-order action could not be completed.",
            ),
          ),
      },
    );
  };

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  if (orderQuery.isLoading)
    return <LoadingPanel label="Loading production-order detail…" />;
  if (orderQuery.isError)
    return (
      <div className="flex flex-col gap-3">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to orders
        </Button>
        <QueryError
          message={getErrorMessage(
            orderQuery.error,
            "Production order could not be loaded.",
          )}
          onRetry={() => void orderQuery.refetch()}
        />
      </div>
    );
  if (!order)
    return (
      <EmptyRegister
        icon={ClipboardList}
        title="Production order was not returned"
        description="Return to the register and select an available API record."
        action={
          <Button type="button" size="sm" variant="outline" onClick={onBack}>
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to orders
          </Button>
        }
      />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
        <div className="flex flex-wrap items-start justify-between gap-3 bg-white px-4 py-3">
          <div className="flex items-start gap-3">
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-9 w-9"
              onClick={onBack}
              aria-label="Back to order register"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wide text-[#8290a4]">
                {orderTypeLabels[order.orderType]} production order
              </div>
              <h2 className="text-lg font-semibold text-[#172b49]">
                {order.orderNumber}
              </h2>
              <p className="text-xs text-[#718096]">
                {order.finishedProductCode} — {order.finishedProductName}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill value={order.materialStatus} />
            <StatusPill
              value={order.status}
              label={orderStatusLabels[order.status]}
            />
          </div>
        </div>
        <div className="grid gap-px border-t border-[#e5ebf3] bg-[#e5ebf3] sm:grid-cols-2 xl:grid-cols-6">
          <OrderFact
            label="Planned quantity"
            value={`${formatQuantity(order.plannedQuantity)} ${order.unit}`}
          />
          <OrderFact
            label="Completed quantity"
            value={`${formatQuantity(order.completedQuantity)} ${order.unit}`}
          />
          <OrderFact
            label="BOM / Formula"
            value={`${order.bomNumber} v${order.bomVersionNumber}`}
          />
          <OrderFact label="Source" value={order.sourceWarehouseName} />
          <OrderFact
            label="Destination"
            value={order.destinationWarehouseName}
          />
          <OrderFact
            label="Planned dates"
            value={`${formatDate(order.plannedStartDate)} → ${formatDate(order.plannedEndDate)}`}
          />
        </div>
      </div>

      <div className="grid gap-3 2xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,0.65fr)]">
        <div className="space-y-3">
          <OrderMaterialsTable order={order} />
          <OrderLotsTable order={order} />
          <OperationExecutionsTable order={order} />
          <ProductionEvidenceTables order={order} />
        </div>
        <form
          onSubmit={submitAction}
          className="h-fit overflow-hidden rounded-xl border border-[#dbe4ef] bg-white"
        >
          <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[#172b49]">
              <ClipboardCheck className="h-4 w-4 text-[#2478df]" />
              Controlled order action
            </h3>
            <p className="text-[10px] leading-4 text-[#718096]">
              The API validates state transitions, stock, quality, accounting
              and idempotency.
            </p>
          </div>
          <div className="space-y-3 p-4">
            {readinessQuery.isError ? (
              <div className="rounded-lg border border-[#f1c4c4] bg-[#fff7f5] p-3 text-[11px] leading-4 text-[#a33a2b]">
                Readiness could not be verified. Posting actions remain disabled
                for safety.{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => void readinessQuery.refetch()}
                >
                  Retry readiness
                </button>
              </div>
            ) : null}
            {readinessQuery.data && !readinessQuery.data.ready ? (
              <div className="rounded-lg border border-[#f3d5a7] bg-[#fff8eb] p-3 text-[11px] leading-4 text-[#8a5714]">
                <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                Readiness is blocked by {readinessQuery.data.blockerCount} check
                {readinessQuery.data.blockerCount === 1 ? "" : "s"}. Posting
                actions stay disabled until warehouse and ledger mappings are
                complete.
              </div>
            ) : null}
            {settingsQuery.isError ? (
              <div className="rounded-lg border border-[#f1c4c4] bg-[#fff7f5] p-3 text-[11px] leading-4 text-[#a33a2b]">
                Manufacturing settings could not be verified. Receipt, QA
                release and controlled approval/signature actions stay disabled.{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => void settingsQuery.refetch()}
                >
                  Retry settings
                </button>
              </div>
            ) : null}
            {finishedProductProfilesQuery.isError ? (
              <div className="rounded-lg border border-[#f1c4c4] bg-[#fff7f5] p-3 text-[11px] leading-4 text-[#a33a2b]">
                Finished-product lot and serial controls could not be verified.
                Production receipt stays disabled.{" "}
                <button
                  type="button"
                  className="font-semibold underline"
                  onClick={() => void finishedProductProfilesQuery.refetch()}
                >
                  Retry product controls
                </button>
              </div>
            ) : null}
            {availableActions.length ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Action">
                    <select
                      value={selectedAction}
                      onChange={(event) => {
                        resetActionForm();
                        setActionKind(
                          event.target.value as ManufacturingOrderActionKind,
                        );
                      }}
                      className={selectClass}
                    >
                      {availableActions.map((kind) => (
                        <option key={kind} value={kind}>
                          {actionLabel(kind)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Transaction date">
                    <AppDateInput
                      aria-label="Transaction date"
                      value={transactionDate}
                      onChange={(value) => setTransactionDate(value)}
                      inputClassName={inputClass}
                    />
                  </Field>
                </div>
                {needsOrderLot ? (
                  <Field label="Production lot / batch">
                    <select
                      required
                      value={selectedOrderLotId}
                      onChange={(event) =>
                        setSelectedOrderLotId(event.target.value)
                      }
                      className={selectClass}
                    >
                      <option value="">Select lot / batch</option>
                      {order.lots.map((lot) => (
                        <option key={lot.id} value={lot.id}>
                          {lot.lotNumber} — planned{" "}
                          {formatQuantity(lot.plannedQuantity)} {order.unit}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
                {selectedAction === "AMEND" ? (
                  <div className="space-y-3 rounded-xl border border-[#cfe0f5] bg-[#f7faff] p-3">
                    <div>
                      <p className="text-xs font-semibold text-[#172b49]">
                        Controlled amendment
                      </p>
                      <p className="mt-0.5 text-[10px] leading-4 text-[#718096]">
                        Saving resets the order to draft, releases unposted
                        reservations, recalculates BOM requirements and requires
                        approval again. Posted effects cannot be amended here.
                      </p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label={`Planned quantity (${order.unit}) *`}>
                        <Input
                          required
                          type="number"
                          min="0.0001"
                          step="0.0001"
                          value={amendmentDraft.plannedQuantity}
                          onChange={(event) =>
                            setAmendmentDraft((current) => ({
                              ...current,
                              plannedQuantity: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Priority (0-9999) *">
                        <Input
                          required
                          type="number"
                          min="0"
                          max="9999"
                          step="1"
                          value={amendmentDraft.priority}
                          onChange={(event) =>
                            setAmendmentDraft((current) => ({
                              ...current,
                              priority: event.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Planned start date *">
                        <AppDateInput
                          aria-label="Planned start date"
                          value={amendmentDraft.plannedStartDate}
                          onChange={(value) =>
                            setAmendmentDraft((current) => ({
                              ...current,
                              plannedStartDate: value,
                            }))
                          }
                          inputClassName={inputClass}
                        />
                      </Field>
                      <Field label="Planned end date *">
                        <AppDateInput
                          aria-label="Planned end date"
                          min={amendmentDraft.plannedStartDate || undefined}
                          value={amendmentDraft.plannedEndDate}
                          onChange={(value) =>
                            setAmendmentDraft((current) => ({
                              ...current,
                              plannedEndDate: value,
                            }))
                          }
                          inputClassName={inputClass}
                        />
                      </Field>
                    </div>
                    <Field label="Order notes after amendment">
                      <textarea
                        value={amendmentDraft.notes}
                        onChange={(event) =>
                          setAmendmentDraft((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                        className={textareaClass}
                        maxLength={5000}
                        placeholder="Updated production-order notes (optional)"
                      />
                    </Field>
                  </div>
                ) : null}
                {needsOperation ? (
                  <ActionOperationFields
                    action={selectedAction}
                    order={order}
                    candidates={operationCandidates}
                    selectedId={selectedOperationExecutionId}
                    onSelect={setSelectedOperationExecutionId}
                    actuals={operationActuals}
                    onActualChange={(key, value) =>
                      setOperationActuals((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                  />
                ) : null}
                {isManufacturingDispositionAction(selectedAction) ? (
                  <ActionOperationDispositionFields
                    action={selectedAction}
                    order={order}
                    candidates={dispositionCandidates}
                    selectedId={selectedOperationExecutionId}
                    onSelect={setSelectedOperationExecutionId}
                    draft={dispositionDraft}
                    onChange={(patch) =>
                      setDispositionDraft((current) => ({
                        ...current,
                        ...patch,
                      }))
                    }
                    scrapProfiles={compatibleScrapProfiles}
                    scrapLocations={scrapLocations}
                    approvedBoms={approvedDispositionBoms}
                    approvedRoutings={approvedDispositionRoutings}
                    loading={
                      selectedAction === "POST_SCRAP_DISPOSITION"
                        ? settingsQuery.isLoading ||
                          scrapProfilesQuery.isLoading ||
                          scrapLocationsQuery.isLoading
                        : dispositionBomsQuery.isLoading ||
                          dispositionRoutingsQuery.isLoading
                    }
                    loadError={
                      selectedAction === "POST_SCRAP_DISPOSITION"
                        ? settingsQuery.isError ||
                          scrapProfilesQuery.isError ||
                          scrapLocationsQuery.isError
                        : dispositionBomsQuery.isError ||
                          dispositionRoutingsQuery.isError
                    }
                    scrapPostingMappingsConfigured={Boolean(
                      settings?.scrapWarehouseId &&
                      settings.wipWarehouseId &&
                      settings.scrapRecoveryAccountId &&
                      settings.wipInventoryAccountId,
                    )}
                  />
                ) : null}
                {needsMaterialLines ? (
                  <ActionMaterialLines
                    action={selectedAction}
                    order={order}
                    materials={actionMaterials}
                    selectedOrderLotId={selectedOrderLotId}
                    quantities={lineQuantities}
                    onChange={(key, value) =>
                      setLineQuantities((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                  />
                ) : null}
                {needsLotLines ? (
                  <ActionLotLines
                    action={selectedAction}
                    order={order}
                    settings={settings}
                    serialTrackingRequired={serialTrackingRequired}
                    quantities={lineQuantities}
                    rejectedQuantities={lineRejectedQuantities}
                    serialNumbers={lineSerialNumbers}
                    outputLotNumbers={outputLotNumbers}
                    onQuantityChange={(key, value) =>
                      setLineQuantities((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                    onRejectedChange={(key, value) =>
                      setLineRejectedQuantities((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                    onSerialChange={(key, value) =>
                      setLineSerialNumbers((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                    onOutputLotChange={(key, value) =>
                      setOutputLotNumbers((current) => ({
                        ...current,
                        [key]: value,
                      }))
                    }
                  />
                ) : null}
                {selectedAction === "PLACE_QC_HOLD" ? (
                  <ActionQualityFields
                    action={selectedAction}
                    actuals={qcActuals}
                    onActualChange={(key, value) =>
                      setQcActuals((current) => ({ ...current, [key]: value }))
                    }
                    results={qcResults}
                    onResultsChange={setQcResults}
                  />
                ) : null}
                {(selectedAction === "RECORD_QUALITY_RESULT" ||
                  selectedAction === "RECORD_IN_PROCESS_RESULT") &&
                qualitySpecificationQuery.isLoading ? (
                  <div className="rounded-lg border border-[#cfe0f5] bg-[#f5f9ff] p-3 text-[11px] text-[#52647d]">
                    Loading the approved quality specification and linked test
                    methods...
                  </div>
                ) : null}
                {(selectedAction === "RECORD_QUALITY_RESULT" ||
                  selectedAction === "RECORD_IN_PROCESS_RESULT") &&
                qualitySpecificationQuery.isError ? (
                  <div className="rounded-lg border border-[#f1c4c4] bg-[#fff7f5] p-3 text-[11px] leading-4 text-[#a33a2b]">
                    <span className="block font-semibold">
                      QC result posting is blocked safely.
                    </span>
                    <span className="block">
                      {getErrorMessage(
                        qualitySpecificationQuery.error,
                        "Create and approve an effective Quality Specification with approved Test Methods for this finished product.",
                      )}
                    </span>
                    <button
                      type="button"
                      className="mt-1 font-semibold underline"
                      onClick={() => void qualitySpecificationQuery.refetch()}
                    >
                      Retry specification check
                    </button>
                  </div>
                ) : null}
                {(selectedAction === "RECORD_QUALITY_RESULT" ||
                  selectedAction === "RECORD_IN_PROCESS_RESULT") &&
                qualitySpecificationQuery.data ? (
                  <ActionQualityFields
                    action={selectedAction}
                    actuals={qcActuals}
                    onActualChange={(key, value) =>
                      setQcActuals((current) => ({ ...current, [key]: value }))
                    }
                    specification={qualitySpecificationQuery.data}
                    results={qcResults}
                    onResultsChange={setQcResults}
                  />
                ) : null}
                {selectedAction === "QA_RELEASE" ? (
                  <QaReleasePreview
                    order={order}
                    pending={pendingReleaseLines}
                    destinationWarehouseId={
                      settings?.finishedGoodsReleasedWarehouseId ?? null
                    }
                  />
                ) : null}
                {selectedAction === "CLOSE" &&
                latestCostSnapshot?.status === "PROVISIONAL" ? (
                  <Field label="Extra-cost not-applicable attestation">
                    <textarea
                      required
                      value={closeAttestation}
                      onChange={(event) =>
                        setCloseAttestation(event.target.value)
                      }
                      className={textareaClass}
                      placeholder="Explain why labour, machine, overhead, subcontract and other actual costs are not applicable."
                    />
                  </Field>
                ) : null}
                {selectedAction &&
                (stagedApprovalActions.has(selectedAction) ||
                  fallbackElectronicSignatureRequired ||
                  ((settings?.electronicSignatureRequired ||
                    selectedAction === "APPROVE") &&
                    approvalSensitiveActions.has(selectedAction))) ? (
                  <Field
                    label={
                      stagedApprovalActions.has(selectedAction) &&
                      !approvalSensitiveActions.has(selectedAction)
                        ? "Approval signature meaning"
                        : "Electronic signature meaning *"
                    }
                  >
                    <Input
                      required={
                        fallbackElectronicSignatureRequired ||
                        (approvalSensitiveActions.has(selectedAction) &&
                          Boolean(
                            settings?.electronicSignatureRequired ||
                            selectedAction === "APPROVE",
                          ))
                      }
                      value={signatureMeaning}
                      onChange={(event) =>
                        setSignatureMeaning(event.target.value)
                      }
                      className={inputClass}
                      placeholder={
                        selectedAction === "QA_RELEASE"
                          ? "Released by Quality Assurance"
                          : selectedAction === "ISSUE_MATERIALS" ||
                              selectedAction === "COMPLETE_PRODUCTION"
                            ? "Enter the configured approval-stage meaning, if applicable"
                            : selectedAction === "APPROVE"
                              ? "Approved as checker"
                              : selectedAction === "CLOSE"
                                ? "Reviewed and closed"
                                : selectedAction === "AMEND"
                                  ? "Reviewed and approved this controlled amendment"
                                  : selectedAction === "CANCEL"
                                    ? "Reviewed and approved this controlled cancellation"
                                    : isManufacturingDispositionAction(
                                          selectedAction,
                                        )
                                      ? "Reviewed and approved this operation disposition"
                                      : "Quality results reviewed and recorded"
                      }
                    />
                    <p className="mt-1 text-[10px] leading-4 text-[#718096]">
                      {independentQualityApprovalRequired
                        ? "Pharmaceutical and hybrid QC requires two different authorized users: inspection first, then independent approval. Keep the QC submission unchanged for the next stage."
                        : "For configured staged approvals, enter the exact meaning defined for the next stage. The fallback workflow keeps the current signature rules."}
                    </p>
                  </Field>
                ) : null}
                {selectedAction &&
                (stagedApprovalActions.has(selectedAction) ||
                  fallbackElectronicSignatureRequired ||
                  ((settings?.electronicSignatureRequired ||
                    selectedAction === "APPROVE") &&
                    approvalSensitiveActions.has(selectedAction))) ? (
                  <Field label="Current password (when policy requires reauthentication)">
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={reauthenticationPassword}
                      onChange={(event) =>
                        setReauthenticationPassword(event.target.value)
                      }
                      className={inputClass}
                      placeholder="Current account password"
                    />
                  </Field>
                ) : null}
                <Field
                  label={
                    selectedAction === "CLOSE"
                      ? "Close reason *"
                      : selectedAction === "AMEND"
                        ? "Amendment reason *"
                        : selectedAction === "CANCEL"
                          ? "Cancellation reason *"
                          : isManufacturingDispositionAction(selectedAction)
                            ? "Disposition note *"
                            : selectedAction === "PAUSE_PRODUCTION"
                              ? "Pause reason *"
                              : "Action note"
                  }
                >
                  <textarea
                    required={
                      selectedAction === "CLOSE" ||
                      selectedAction === "AMEND" ||
                      selectedAction === "CANCEL" ||
                      isManufacturingDispositionAction(selectedAction) ||
                      selectedAction === "PAUSE_PRODUCTION"
                    }
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    className={textareaClass}
                    placeholder={
                      selectedAction === "CLOSE"
                        ? "Controlled reason for closing this production order"
                        : selectedAction === "AMEND"
                          ? "Why this production order is being amended"
                          : selectedAction === "CANCEL"
                            ? "Why this unposted production order is being cancelled"
                            : isManufacturingDispositionAction(selectedAction)
                              ? "Explain the source, condition and authorization for this disposition"
                              : "Controlled note or reason"
                    }
                  />
                </Field>
                <Button
                  type="submit"
                  size="sm"
                  className="w-full"
                  disabled={
                    actionMutation.isPending ||
                    postingBlocked ||
                    settingsBlocked ||
                    qualitySpecificationBlocked ||
                    approvalControlBlocked ||
                    dispositionControlsBlocked ||
                    !transactionDate
                  }
                >
                  <ShieldCheck
                    className={
                      actionMutation.isPending
                        ? "h-3.5 w-3.5 animate-spin"
                        : "h-3.5 w-3.5"
                    }
                  />
                  {actionMutation.isPending
                    ? "Recording action…"
                    : postingBlocked
                      ? "Readiness required"
                      : settingsBlocked
                        ? "Posting controls required"
                        : qualitySpecificationBlocked
                          ? "Approved QC specification required"
                          : approvalControlBlocked
                            ? "Approval controls required"
                            : dispositionControlsBlocked
                              ? "Disposition prerequisites required"
                              : selectedAction
                                ? actionLabel(selectedAction)
                                : "Select action"}
                </Button>
              </>
            ) : (
              <div className="rounded-lg border border-[#dce5ef] bg-[#fbfcfe] p-4 text-center text-xs text-[#718096]">
                This order is terminal; no further actions are available.
              </div>
            )}
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
        <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[#172b49]">
            <History className="h-4 w-4 text-[#2478df]" />
            Action history
          </h3>
        </div>
        {order.actionHistory.length ? (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-[0.9fr_0.7fr_0.7fr_1fr_1fr] gap-2 bg-[#fbfcfe] px-4 py-2 text-[9px] font-bold uppercase text-[#718096]">
                <span>Action</span>
                <span>From</span>
                <span>To</span>
                <span>Transaction</span>
                <span>Audit</span>
              </div>
              {order.actionHistory.map((action) => (
                <div
                  key={action.id}
                  className="grid grid-cols-[0.9fr_0.7fr_0.7fr_1fr_1fr] items-center gap-2 border-t border-[#eef2f7] px-4 py-3 text-[11px]"
                >
                  <span className="font-semibold text-[#334155]">
                    {action.kind.replaceAll("_", " ")}
                  </span>
                  <span>
                    {action.fromStatus
                      ? orderStatusLabels[action.fromStatus]
                      : "—"}
                  </span>
                  <span>{orderStatusLabels[action.toStatus]}</span>
                  <span>{formatDate(action.transactionDate)}</span>
                  <span>
                    <span className="block">
                      {action.performedBy ?? "Recorded user"}
                    </span>
                    <span className="text-[9px] text-[#8290a4]">
                      {formatDateTime(action.createdAt)}
                      {action.note ? ` · ${action.note}` : ""}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <EmptyRegister
            icon={History}
            title="No order actions returned"
            description="The action ledger will populate as controlled transitions are recorded."
          />
        )}
      </div>
    </div>
  );
}

function OrderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-3 py-3">
      <div className="text-[9px] font-bold uppercase tracking-wide text-[#8290a4]">
        {label}
      </div>
      <div
        className="mt-1 truncate text-xs font-semibold text-[#334155]"
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

function OrderMaterialsTable({
  order,
}: {
  order: ManufacturingProductionOrderRecord;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
      <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#172b49]">
          Material requirements
        </h3>
      </div>
      {order.materials.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr_0.75fr] gap-2 bg-[#fbfcfe] px-4 py-2 text-[9px] font-bold uppercase text-[#718096]">
              <span>Material</span>
              <span className="text-right">Planned</span>
              <span className="text-right">Available</span>
              <span className="text-right">Reserved</span>
              <span className="text-right">Issued</span>
              <span>Status</span>
            </div>
            {order.materials.map((material) => (
              <div
                key={material.id}
                className="grid grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_0.7fr_0.75fr] items-center gap-2 border-t border-[#eef2f7] px-4 py-3 text-[11px]"
              >
                <span>
                  <span className="block font-medium text-[#334155]">
                    {material.itemName}
                  </span>
                  <span className="text-[9px] text-[#8290a4]">
                    {material.itemCode} ·{" "}
                    {material.sourceWarehouseName ?? "Order source"}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {formatQuantity(material.plannedQuantity)} {material.unit}
                </span>
                <span className="text-right tabular-nums">
                  {formatQuantity(material.availableQuantity)}
                </span>
                <span className="text-right tabular-nums">
                  {formatQuantity(material.reservedQuantity)}
                </span>
                <span className="text-right tabular-nums">
                  {formatQuantity(material.issuedQuantity)}
                </span>
                <StatusPill value={material.status} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[#718096]">
          No material requirement rows were returned for this order.
        </div>
      )}
    </div>
  );
}

function OrderLotsTable({
  order,
}: {
  order: ManufacturingProductionOrderRecord;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
      <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#172b49]">
          Production lots / batches
        </h3>
      </div>
      {order.lots.length ? (
        <div className="overflow-x-auto">
          <div className="min-w-[700px]">
            <div className="grid grid-cols-[1fr_0.7fr_0.7fr_0.7fr_0.7fr] gap-2 bg-[#fbfcfe] px-4 py-2 text-[9px] font-bold uppercase text-[#718096]">
              <span>Lot / batch</span>
              <span className="text-right">Planned</span>
              <span className="text-right">Completed</span>
              <span className="text-right">Rejected</span>
              <span>Status</span>
            </div>
            {order.lots.map((lot) => (
              <div
                key={lot.id}
                className="grid grid-cols-[1fr_0.7fr_0.7fr_0.7fr_0.7fr] items-center gap-2 border-t border-[#eef2f7] px-4 py-3 text-[11px]"
              >
                <span>
                  <span className="block font-medium text-[#334155]">
                    {lot.lotNumber}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  {formatQuantity(lot.plannedQuantity)}
                </span>
                <span className="text-right tabular-nums">
                  {formatQuantity(lot.completedQuantity)}
                </span>
                <span className="text-right tabular-nums">
                  {formatQuantity(lot.rejectedQuantity)}
                </span>
                <StatusPill value={lot.status} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[#718096]">
          No production lots were returned for this order.
        </div>
      )}
    </div>
  );
}

function ActionOperationFields({
  action,
  order,
  candidates,
  selectedId,
  onSelect,
  actuals,
  onActualChange,
}: {
  action: ManufacturingOrderActionKind | undefined;
  order: ManufacturingProductionOrderRecord;
  candidates: ManufacturingProductionOrderRecord["operationExecutions"];
  selectedId: string;
  onSelect: (value: string) => void;
  actuals: {
    inputQuantity: string;
    goodQuantity: string;
    rejectedQuantity: string;
    scrapQuantity: string;
    reworkQuantity: string;
  };
  onActualChange: (
    key:
      | "inputQuantity"
      | "goodQuantity"
      | "rejectedQuantity"
      | "scrapQuantity"
      | "reworkQuantity",
    value: string,
  ) => void;
}) {
  const lotNames = new Map(order.lots.map((lot) => [lot.id, lot.lotNumber]));
  return (
    <div className="space-y-2 rounded-lg border border-[#dce5ef] bg-[#fbfcfe] p-3">
      <Field label="Eligible routing operation">
        <select
          required
          value={selectedId}
          onChange={(event) => onSelect(event.target.value)}
          className={selectClass}
        >
          <option value="">Select operation</option>
          {candidates.map((execution) => (
            <option key={execution.id} value={execution.id}>
              {execution.operationSequence ?? "—"} ·{" "}
              {execution.operationCode ?? "Operation"} ·{" "}
              {execution.operationName ?? "Unnamed"} ·{" "}
              {execution.orderLotId
                ? (lotNames.get(execution.orderLotId) ?? "Unknown lot")
                : "Order level"}
            </option>
          ))}
        </select>
      </Field>
      {!candidates.length ? (
        <div className="rounded-md border border-[#f3d5a7] bg-[#fff8eb] p-2 text-[10px] text-[#8a5714]">
          No operation is currently eligible for this action. Complete the
          preceding controlled operation first.
        </div>
      ) : null}
      {action === "COMPLETE_OPERATION" ? (
        <div>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#718096]">
            Actual operation reconciliation
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {(
              [
                ["inputQuantity", "Input"],
                ["goodQuantity", "Good"],
                ["rejectedQuantity", "Rejected"],
                ["scrapQuantity", "Scrap"],
                ["reworkQuantity", "Rework"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <Input
                  required
                  type="number"
                  min={key === "inputQuantity" ? "0.000001" : "0"}
                  step="any"
                  value={actuals[key]}
                  onChange={(event) => onActualChange(key, event.target.value)}
                  className={inputClass}
                />
              </Field>
            ))}
          </div>
          <p className="mt-2 text-[9px] text-[#718096]">
            Good + rejected + scrap + rework must exactly equal input. The API
            rejects an unreconciled operation.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ActionOperationDispositionFields({
  action,
  order,
  candidates,
  selectedId,
  onSelect,
  draft,
  onChange,
  scrapProfiles,
  scrapLocations,
  approvedBoms,
  approvedRoutings,
  loading,
  loadError,
  scrapPostingMappingsConfigured,
}: {
  action: "POST_SCRAP_DISPOSITION" | "CREATE_REWORK_DISPOSITION";
  order: ManufacturingProductionOrderRecord;
  candidates: ManufacturingDispositionCandidate[];
  selectedId: string;
  onSelect: (value: string) => void;
  draft: OperationDispositionDraft;
  onChange: (patch: Partial<OperationDispositionDraft>) => void;
  scrapProfiles: ManufacturingItemProfileRecord[];
  scrapLocations: ManufacturingLocationRecord[];
  approvedBoms: Array<{
    bom: ManufacturingBomRecord;
    version: ManufacturingBomVersionRecord;
  }>;
  approvedRoutings: Array<{
    routing: ManufacturingRoutingRecord;
    version: ManufacturingRoutingRecord["versions"][number];
  }>;
  loading: boolean;
  loadError: boolean;
  scrapPostingMappingsConfigured: boolean;
}) {
  const selected = candidates.find(
    (candidate) => candidate.execution.id === selectedId,
  );
  const lotNames = new Map(order.lots.map((lot) => [lot.id, lot.lotNumber]));
  const reasons =
    action === "POST_SCRAP_DISPOSITION"
      ? scrapDispositionReasons
      : reworkDispositionReasons;

  return (
    <div className="space-y-3 rounded-xl border border-[#f3d5a7] bg-[#fffaf1] p-3">
      <div>
        <p className="text-xs font-semibold text-[#172b49]">
          {action === "POST_SCRAP_DISPOSITION"
            ? "Operation scrap disposition"
            : "Operation rework disposition"}
        </p>
        <p className="mt-0.5 text-[10px] leading-4 text-[#718096]">
          Only a completed operation's exact remaining recorded quantity can be
          posted. The API rejects partial, excess or repeated disposition.
        </p>
      </div>

      {loading ? (
        <div className="rounded-lg border border-[#cfe0f5] bg-white p-2 text-[10px] text-[#52647d]">
          Loading controlled disposition masters...
        </div>
      ) : null}
      {loadError ? (
        <div className="rounded-lg border border-[#f1c4c4] bg-[#fff7f5] p-2 text-[10px] text-[#a33a2b]">
          Required disposition masters could not be verified. Posting remains
          disabled for safety.
        </div>
      ) : null}

      <Field label="Completed operation with undisposed quantity *">
        <select
          required
          value={selectedId}
          onChange={(event) => onSelect(event.target.value)}
          className={selectClass}
        >
          <option value="">Select completed operation</option>
          {candidates.map((candidate) => (
            <option key={candidate.execution.id} value={candidate.execution.id}>
              {candidate.execution.operationSequence ?? "-"} ·{" "}
              {candidate.execution.operationCode ?? "Operation"} ·{" "}
              {candidate.execution.orderLotId
                ? (lotNames.get(candidate.execution.orderLotId) ??
                  "Unknown lot")
                : "Order level"}{" "}
              · remaining {formatQuantity(candidate.remainingQuantity)}{" "}
              {order.unit}
            </option>
          ))}
        </select>
      </Field>

      {!candidates.length && !loading ? (
        <div className="rounded-lg border border-[#f3d5a7] bg-white p-2 text-[10px] text-[#8a5714]">
          No completed operation has an undisposed{" "}
          {action === "POST_SCRAP_DISPOSITION" ? "scrap" : "rework"} quantity.
          Record and complete operation actuals first.
        </div>
      ) : null}

      {selected ? (
        <div className="grid gap-2 rounded-lg border border-[#e2e8f0] bg-white p-2 sm:grid-cols-3">
          <OrderFact
            label="Recorded"
            value={`${formatQuantity(selected.recordedQuantity)} ${order.unit}`}
          />
          <OrderFact
            label="Already posted"
            value={`${formatQuantity(selected.postedQuantity)} ${order.unit}`}
          />
          <OrderFact
            label="Post now (exact)"
            value={`${formatQuantity(selected.remainingQuantity)} ${order.unit}`}
          />
        </div>
      ) : null}

      <Field label="Controlled reason code *">
        <select
          required
          value={draft.reasonCode}
          onChange={(event) => onChange({ reasonCode: event.target.value })}
          className={selectClass}
        >
          <option value="">Select reason</option>
          {reasons.map(([value, label]) => (
            <option key={value} value={value}>
              {value} — {label}
            </option>
          ))}
        </select>
      </Field>

      {action === "POST_SCRAP_DISPOSITION" ? (
        <>
          {!scrapPostingMappingsConfigured && !loading ? (
            <div className="rounded-lg border border-[#f1c4c4] bg-[#fff7f5] p-2 text-[10px] text-[#a33a2b]">
              Configure the default SCRAP/WIP warehouses and Scrap-recovery/WIP
              ledger mappings before posting scrap.
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Scrap BY_PRODUCT (${order.unit}) *`}>
              <select
                required
                value={draft.scrapInventoryItemId}
                onChange={(event) =>
                  onChange({ scrapInventoryItemId: event.target.value })
                }
                className={selectClass}
              >
                <option value="">Select scrap item</option>
                {scrapProfiles.map((profile) => (
                  <option
                    key={profile.inventoryItemId}
                    value={profile.inventoryItemId}
                  >
                    {profile.itemCode ?? "No code"} —{" "}
                    {profile.itemName ?? "Unnamed by-product"} ({profile.unit})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="SCRAP destination location *">
              <select
                required
                value={draft.scrapDestinationLocationId}
                onChange={(event) =>
                  onChange({ scrapDestinationLocationId: event.target.value })
                }
                className={selectClass}
              >
                <option value="">Select scrap location</option>
                {scrapLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.warehouseCode ??
                      location.warehouseName ??
                      "Scrap warehouse"}{" "}
                    · {location.code} — {location.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Unique scrap lot number *">
              <Input
                required
                value={draft.scrapLotNumber}
                onChange={(event) =>
                  onChange({ scrapLotNumber: event.target.value })
                }
                className={inputClass}
                maxLength={120}
                placeholder="Controlled scrap lot / batch number"
              />
            </Field>
            <Field label={`Recovery unit cost (${order.unit}) *`}>
              <Input
                required
                type="number"
                min="0"
                step="0.000001"
                value={draft.recoveryUnitCost}
                onChange={(event) =>
                  onChange({ recoveryUnitCost: event.target.value })
                }
                className={inputClass}
              />
              <p className="mt-1 text-[9px] text-[#718096]">
                Enter 0 explicitly when scrap has no recoverable value.
              </p>
            </Field>
          </div>
          {!loading && (!scrapProfiles.length || !scrapLocations.length) ? (
            <div className="rounded-lg border border-[#f3d5a7] bg-white p-2 text-[10px] text-[#8a5714]">
              A compatible active BY_PRODUCT item and active SCRAP-disposition
              location are both required.
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Disposition output *">
            <select
              required
              value={draft.reworkType}
              onChange={(event) =>
                onChange({
                  reworkType: event.target.value as "REWORK" | "REPROCESSING",
                })
              }
              className={selectClass}
            >
              <option value="REWORK">Rework order</option>
              <option value="REPROCESSING">Reprocessing order</option>
            </select>
          </Field>
          <Field label="Approved BOM / Formula *">
            <select
              required
              value={draft.bomVersionId}
              onChange={(event) =>
                onChange({ bomVersionId: event.target.value })
              }
              className={selectClass}
            >
              <option value="">Select approved BOM</option>
              {approvedBoms.map(({ bom, version }) => (
                <option key={version.id} value={version.id}>
                  {bom.bomNumber} · {bom.name} · v{version.versionNumber}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Approved routing *">
            <select
              required
              value={draft.routingVersionId}
              onChange={(event) =>
                onChange({ routingVersionId: event.target.value })
              }
              className={selectClass}
            >
              <option value="">Select approved routing</option>
              {approvedRoutings.map(({ routing, version }) => (
                <option key={version.id} value={version.id}>
                  {routing.code} · {routing.name} · v{version.versionNumber}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rework planned start *">
            <AppDateInput
              aria-label="Rework planned start"
              value={draft.plannedStartDate}
              onChange={(value) => onChange({ plannedStartDate: value })}
              inputClassName={inputClass}
            />
          </Field>
          <Field label="Rework planned end *">
            <AppDateInput
              aria-label="Rework planned end"
              min={draft.plannedStartDate || undefined}
              value={draft.plannedEndDate}
              onChange={(value) => onChange({ plannedEndDate: value })}
              inputClassName={inputClass}
            />
          </Field>
          {!loading && (!approvedBoms.length || !approvedRoutings.length) ? (
            <div className="rounded-lg border border-[#f3d5a7] bg-white p-2 text-[10px] text-[#8a5714] sm:col-span-2">
              An approved BOM and approved routing with operations for this same
              finished product are required.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function ActionMaterialLines({
  action,
  order,
  materials,
  selectedOrderLotId,
  quantities,
  onChange,
}: {
  action: ManufacturingOrderActionKind | undefined;
  order: ManufacturingProductionOrderRecord;
  materials: ManufacturingProductionOrderRecord["materials"];
  selectedOrderLotId: string;
  quantities: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const lot = order.lots.find((entry) => entry.id === selectedOrderLotId);
  const isReturn =
    action === "RETURN_MATERIALS" || action === "PACKAGING_RETURN";
  const issueType =
    action === "PACKAGING_ISSUE" || action === "PACKAGING_RETURN"
      ? "PACKAGING_ISSUE"
      : "MATERIAL_ISSUE";
  const returnType =
    issueType === "PACKAGING_ISSUE" ? "PACKAGING_RETURN" : "MATERIAL_RETURN";
  const transactionQuantity = (materialId: string, type: string) =>
    order.transactions
      .filter(
        (transaction) =>
          transaction.status === "POSTED" &&
          transaction.orderLotId === selectedOrderLotId &&
          transaction.transactionType === type,
      )
      .flatMap((transaction) => transaction.lines)
      .filter((line) => line.orderMaterialId === materialId)
      .reduce((total, line) => total + line.quantity, 0);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-2 text-[11px] font-semibold text-[#52647d]">
        <span>
          {isReturn
            ? "Return quantities from WIP"
            : "Lot-specific issue quantities"}
        </span>
        {lot ? (
          <span className="text-[9px] font-normal text-[#8290a4]">
            {lot.lotNumber}
          </span>
        ) : null}
      </div>
      {issueType === "PACKAGING_ISSUE" ? (
        <div className="mb-2 rounded-lg border border-[#cfe0f4] bg-[#f3f8ff] px-3 py-2 text-[10px] leading-4 text-[#47627f]">
          Packaging quantities come from the approved configuration for this
          production lot. If reservations are required, packaging-order creation
          atomically reserves the outstanding components (FEFO for lot-tracked
          stock); posting remains blocked when released stock is insufficient.
        </div>
      ) : null}
      {!lot ? (
        <div className="rounded-lg border border-[#f3d5a7] bg-[#fff8eb] p-3 text-[10px] text-[#8a5714]">
          Select a production lot before entering material quantities.
        </div>
      ) : materials.length ? (
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-[#dce5ef] bg-[#fbfcfe] p-2">
          {materials.map((material) => {
            const configuredPackagingRequirement = lot
              ? material.packagingLotRequirements?.[lot.id]
              : undefined;
            const lotRequirement =
              issueType === "PACKAGING_ISSUE" &&
              configuredPackagingRequirement != null
                ? configuredPackagingRequirement
                : order.plannedQuantity > 0 && lot
                  ? (material.plannedQuantity * lot.plannedQuantity) /
                    order.plannedQuantity
                  : 0;
            const issued = transactionQuantity(material.id, issueType);
            const returned = transactionQuantity(material.id, returnType);
            const netIssued = Math.max(0, issued - returned);
            const availableForAction = isReturn
              ? netIssued
              : Math.max(0, lotRequirement - netIssued);
            const key = `material:${material.id}`;
            return (
              <label
                key={material.id}
                className="grid grid-cols-[minmax(0,1fr)_112px] items-center gap-2 rounded-md border border-[#edf1f6] bg-white p-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-medium text-[#334155]">
                    {material.itemCode} — {material.itemName}
                  </span>
                  <span className="text-[9px] text-[#8290a4]">
                    Lot need {formatQuantity(lotRequirement)} · net issued{" "}
                    {formatQuantity(netIssued)} · max{" "}
                    {isReturn ? "return" : "issue"}{" "}
                    {formatQuantity(availableForAction)} {material.unit}
                  </span>
                </span>
                <Input
                  type="number"
                  min="0.000001"
                  max={availableForAction || undefined}
                  step="any"
                  value={quantities[key] ?? ""}
                  onChange={(event) => onChange(key, event.target.value)}
                  className={inputClass}
                  placeholder="Quantity"
                />
              </label>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-[#dce5ef] bg-[#fbfcfe] p-3 text-center text-[10px] text-[#718096]">
          No applicable {issueType === "PACKAGING_ISSUE" ? "packaging" : "raw"}{" "}
          material rows were returned.
        </div>
      )}
    </div>
  );
}

function ActionLotLines({
  action,
  order,
  settings,
  serialTrackingRequired,
  quantities,
  rejectedQuantities,
  serialNumbers,
  outputLotNumbers,
  onQuantityChange,
  onRejectedChange,
  onSerialChange,
  onOutputLotChange,
}: {
  action: ManufacturingOrderActionKind | undefined;
  order: ManufacturingProductionOrderRecord;
  settings: ManufacturingSettingsRecord | null | undefined;
  serialTrackingRequired: boolean;
  quantities: Record<string, string>;
  rejectedQuantities: Record<string, string>;
  serialNumbers: Record<string, string>;
  outputLotNumbers: Record<string, string>;
  onQuantityChange: (key: string, value: string) => void;
  onRejectedChange: (key: string, value: string) => void;
  onSerialChange: (key: string, value: string) => void;
  onOutputLotChange: (key: string, value: string) => void;
}) {
  const receiptQuantity = (lotId: string) =>
    order.transactions
      .filter(
        (transaction) =>
          transaction.status === "POSTED" &&
          transaction.transactionType === "PRODUCTION_RECEIPT" &&
          transaction.orderLotId === lotId,
      )
      .flatMap((transaction) => transaction.lines)
      .filter(
        (line) =>
          !line.orderMaterialId &&
          line.inventoryItemId === order.finishedProductId,
      )
      .reduce((total, line) => total + line.quantity, 0);
  const eligibleLots = order.lots.filter((lot) =>
    action === "POST_PRODUCTION_RECEIPT"
      ? lot.completedQuantity - receiptQuantity(lot.id) > 0
      : lot.completedQuantity + lot.rejectedQuantity === 0,
  );
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold text-[#52647d]">
        {action === "POST_PRODUCTION_RECEIPT"
          ? "Completed output receipt by lot"
          : "Good and rejected output by lot"}
      </div>
      {eligibleLots.length ? (
        <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-lg border border-[#dce5ef] bg-[#fbfcfe] p-2">
          {eligibleLots.map((lot) => {
            const key = `lot:${lot.id}`;
            const finalExecution = order.operationExecutions
              .filter(
                (execution) =>
                  execution.orderLotId === lot.id &&
                  execution.status === "COMPLETED",
              )
              .sort(
                (left, right) =>
                  (left.operationSequence ?? 0) -
                  (right.operationSequence ?? 0),
              )
              .at(-1);
            const alreadyReceived = receiptQuantity(lot.id);
            const remaining = Math.max(
              0,
              lot.completedQuantity - alreadyReceived,
            );
            return (
              <div
                key={lot.id}
                className="space-y-2 rounded-md border border-[#edf1f6] bg-white p-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span>
                    <span className="block text-[11px] font-semibold text-[#334155]">
                      {lot.lotNumber}
                    </span>
                    <span className="text-[9px] text-[#8290a4]">
                      Planned {formatQuantity(lot.plannedQuantity)} {order.unit}
                      {finalExecution
                        ? ` · final operation ${formatQuantity(finalExecution.inputQuantity)} input / ${formatQuantity(finalExecution.goodQuantity)} good / ${formatQuantity(finalExecution.rejectedQuantity + finalExecution.scrapQuantity)} rejected + scrap`
                        : ""}
                    </span>
                  </span>
                  <StatusPill value={lot.status} />
                </div>
                {action === "COMPLETE_PRODUCTION" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Good quantity">
                      <Input
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={quantities[key] ?? ""}
                        onChange={(event) =>
                          onQuantityChange(key, event.target.value)
                        }
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Rejected quantity">
                      <Input
                        required
                        type="number"
                        min="0"
                        step="any"
                        value={rejectedQuantities[key] ?? "0"}
                        onChange={(event) =>
                          onRejectedChange(key, event.target.value)
                        }
                        className={inputClass}
                      />
                    </Field>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Receipt quantity">
                        <Input
                          readOnly
                          value={formatQuantity(remaining)}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="FG-Q output lot">
                        <Input
                          required
                          value={outputLotNumbers[key] ?? lot.lotNumber}
                          onChange={(event) =>
                            onOutputLotChange(key, event.target.value)
                          }
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <Field
                      label={
                        serialTrackingRequired
                          ? `Serial numbers * (exactly ${formatQuantity(remaining)})`
                          : "Serial numbers (optional)"
                      }
                    >
                      <textarea
                        required={serialTrackingRequired}
                        value={serialNumbers[key] ?? ""}
                        onChange={(event) =>
                          onSerialChange(key, event.target.value)
                        }
                        className={textareaClass}
                        placeholder="One serial per line or comma-separated"
                      />
                    </Field>
                    <p className="text-[9px] text-[#718096]">
                      Already received {formatQuantity(alreadyReceived)} ·
                      destination FG-Q{" "}
                      {settings?.finishedGoodsQualityWarehouseId ??
                        "not configured"}
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-[#dce5ef] bg-[#fbfcfe] p-3 text-center text-[10px] text-[#718096]">
          {action === "POST_PRODUCTION_RECEIPT"
            ? "All completed lot output has already been received, or no completed lot exists."
            : "No incomplete production lot is available for completion."}
        </div>
      )}
    </div>
  );
}

function ActionQualityFields({
  action,
  actuals,
  onActualChange,
  specification,
  results,
  onResultsChange,
}: {
  action:
    "PLACE_QC_HOLD" | "RECORD_IN_PROCESS_RESULT" | "RECORD_QUALITY_RESULT";
  actuals: {
    sampleQuantity: string;
    acceptedQuantity: string;
    rejectedQuantity: string;
    holdQuantity: string;
    holdReason: string;
  };
  onActualChange: (
    key:
      | "sampleQuantity"
      | "acceptedQuantity"
      | "rejectedQuantity"
      | "holdQuantity"
      | "holdReason",
    value: string,
  ) => void;
  specification?: ManufacturingApplicableQualitySpecification;
  results: QcResultDraft[];
  onResultsChange: (rows: QcResultDraft[]) => void;
}) {
  const recordsMeasuredResults =
    action === "RECORD_QUALITY_RESULT" || action === "RECORD_IN_PROCESS_RESULT";
  const updateResult = (id: string, patch: Partial<QcResultDraft>) =>
    onResultsChange(
      results.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    );
  return (
    <div className="space-y-3 rounded-lg border border-[#dce5ef] bg-[#fbfcfe] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#718096]">
          {action === "PLACE_QC_HOLD"
            ? "QC hold evidence"
            : action === "RECORD_IN_PROCESS_RESULT"
              ? "In-process approved-specification result entry"
              : "Finished-good approved-specification result entry"}
        </div>
        {specification ? (
          <span className="rounded-full border border-[#b9d7fb] bg-[#eaf3ff] px-2 py-1 text-[9px] font-semibold text-[#1f6fc6]">
            {specification.code} v{specification.versionNumber}
          </span>
        ) : null}
      </div>
      <div
        className={
          recordsMeasuredResults
            ? "grid grid-cols-2 gap-2 sm:grid-cols-4"
            : "grid grid-cols-1 gap-2"
        }
      >
        <Field label="Sample / presented quantity">
          <Input
            required
            type="number"
            min="0.000001"
            step="any"
            value={actuals.sampleQuantity}
            onChange={(event) =>
              onActualChange("sampleQuantity", event.target.value)
            }
            className={inputClass}
          />
        </Field>
        {recordsMeasuredResults ? (
          <>
            <Field label="Accepted">
              <Input
                required
                type="number"
                min="0"
                step="any"
                value={actuals.acceptedQuantity}
                onChange={(event) =>
                  onActualChange("acceptedQuantity", event.target.value)
                }
                className={inputClass}
              />
            </Field>
            <Field label="Rejected">
              <Input
                required
                type="number"
                min="0"
                step="any"
                value={actuals.rejectedQuantity}
                onChange={(event) =>
                  onActualChange("rejectedQuantity", event.target.value)
                }
                className={inputClass}
              />
            </Field>
            <Field label="Hold">
              <Input
                required
                type="number"
                min="0"
                step="any"
                value={actuals.holdQuantity}
                onChange={(event) =>
                  onActualChange("holdQuantity", event.target.value)
                }
                className={inputClass}
              />
            </Field>
          </>
        ) : null}
      </div>
      <Field
        label={
          action === "PLACE_QC_HOLD"
            ? "Hold reason"
            : "Hold reason (required when hold quantity is positive)"
        }
      >
        <Input
          required={
            action === "PLACE_QC_HOLD" || Number(actuals.holdQuantity) > 0
          }
          value={actuals.holdReason}
          onChange={(event) => onActualChange("holdReason", event.target.value)}
          className={inputClass}
        />
      </Field>
      {recordsMeasuredResults ? (
        <div className="space-y-2">
          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#718096]">
              Required measured parameters
            </span>
            <p className="mt-0.5 text-[9px] text-[#8290a4]">
              Parameter identity, method and limits come from the approved
              record. Pass/fail is calculated by the API.
            </p>
          </div>
          {results.map((result) => (
            <div
              key={result.id}
              className="space-y-2 rounded-md border border-[#e2e8f0] bg-white p-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="block text-[11px] font-semibold text-[#334155]">
                    {result.parameterCode} · {result.parameterName}
                  </span>
                  <span className="block text-[9px] text-[#718096]">
                    {result.testMethodSnapshot}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <span className="rounded-full bg-[#eef3f8] px-2 py-1 text-[9px] font-semibold text-[#52647d]">
                    Spec: {result.specificationText}
                    {result.unit ? ` ${result.unit}` : ""}
                  </span>
                  {result.critical ? (
                    <span className="rounded-full bg-[#fff0f0] px-2 py-1 text-[9px] font-semibold text-[#b42318]">
                      Critical
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {result.resultType === "NUMERIC" ? (
                  <Field
                    label={`Actual value${result.unit ? ` (${result.unit})` : ""}`}
                  >
                    <Input
                      required
                      type="number"
                      step="any"
                      value={result.actualValue}
                      onChange={(event) =>
                        updateResult(result.id, {
                          actualValue: event.target.value,
                        })
                      }
                      className={inputClass}
                      placeholder="Enter measured value"
                    />
                  </Field>
                ) : null}
                {result.resultType === "TEXT" ? (
                  <Field label="Actual text">
                    <Input
                      required
                      value={result.actualText}
                      onChange={(event) =>
                        updateResult(result.id, {
                          actualText: event.target.value,
                        })
                      }
                      className={inputClass}
                      placeholder="Enter observed text"
                    />
                  </Field>
                ) : null}
                {result.resultType === "BOOLEAN" ? (
                  <Field label="Actual result">
                    <select
                      required
                      value={result.actualText}
                      onChange={(event) =>
                        updateResult(result.id, {
                          actualText: event.target.value,
                        })
                      }
                      className={selectClass}
                    >
                      <option value="">Select Yes / No</option>
                      <option value="true">Yes</option>
                      <option value="false">No</option>
                    </select>
                  </Field>
                ) : null}
                <Field label="Remarks">
                  <Input
                    value={result.remarks}
                    onChange={(event) =>
                      updateResult(result.id, { remarks: event.target.value })
                    }
                    className={inputClass}
                    placeholder="Optional observation"
                  />
                </Field>
              </div>
            </div>
          ))}
          <p className="text-[9px] text-[#718096]">
            Accepted + rejected + hold must exactly equal the sample quantity.
            The server validates the exact approved parameter set and calculates
            every decision.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function QaReleasePreview({
  order,
  pending,
  destinationWarehouseId,
}: {
  order: ManufacturingProductionOrderRecord;
  pending: Array<{
    transactionId: string;
    orderLotId: string | null;
    line: ManufacturingProductionOrderRecord["transactions"][number]["lines"][number];
  }>;
  destinationWarehouseId: string | null;
}) {
  const lotNames = new Map(order.lots.map((lot) => [lot.id, lot.lotNumber]));
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold text-[#52647d]">
        Posted FG-Q lots ready for full release
      </div>
      {pending.length ? (
        <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-[#dce5ef] bg-[#fbfcfe] p-2">
          {pending.map(({ transactionId, orderLotId, line }) => (
            <div
              key={line.id}
              className="flex items-center justify-between gap-3 rounded-md border border-[#edf1f6] bg-white p-2 text-[10px]"
            >
              <span>
                <span className="block font-semibold text-[#334155]">
                  {line.destinationInventoryLot?.lotNumber ??
                    lotNames.get(orderLotId ?? "") ??
                    "Posted output lot"}
                </span>
                <span className="text-[#8290a4]">
                  {line.serialNumbers.length} serial(s) · receipt{" "}
                  {transactionId.slice(0, 8)}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-semibold tabular-nums">
                  {formatQuantity(line.quantity)} {line.unit}
                </span>
                <span className="text-[#8290a4]">
                  to {destinationWarehouseId ?? "FG-R not configured"}
                </span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-[#f3d5a7] bg-[#fff8eb] p-3 text-[10px] text-[#8a5714]">
          No posted and unreleased FG-Q inventory lot is available. Post the
          production receipt first.
        </div>
      )}
    </div>
  );
}

function OperationExecutionsTable({
  order,
}: {
  order: ManufacturingProductionOrderRecord;
}) {
  const lotNames = new Map(order.lots.map((lot) => [lot.id, lot.lotNumber]));
  return (
    <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#172b49]">
          Routing operation execution
        </h3>
        <span className="rounded-full bg-[#eaf3ff] px-2 py-1 text-[9px] font-semibold text-[#1f6fc6]">
          {order.operationExecutions.length} operation
          {order.operationExecutions.length === 1 ? "" : "s"}
        </span>
      </div>
      {order.operationExecutions.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left text-[10px]">
            <thead className="bg-[#fbfcfe] text-[9px] uppercase tracking-wide text-[#718096]">
              <tr>
                <th className="px-3 py-2">Lot / batch</th>
                <th className="px-3 py-2">Operation</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Planned</th>
                <th className="px-3 py-2 text-right">Input</th>
                <th className="px-3 py-2 text-right">Good</th>
                <th className="px-3 py-2 text-right">Rejected</th>
                <th className="px-3 py-2 text-right">Scrap</th>
                <th className="px-3 py-2 text-right">Rework</th>
                <th className="px-3 py-2">Evidence time</th>
              </tr>
            </thead>
            <tbody>
              {order.operationExecutions.map((execution) => (
                <tr
                  key={execution.id}
                  className="border-t border-[#eef2f7] hover:bg-[#f9fbfe]"
                >
                  <td className="px-3 py-2.5 font-medium text-[#334155]">
                    {execution.orderLotId
                      ? (lotNames.get(execution.orderLotId) ?? "Unknown lot")
                      : "Order level"}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-[#334155]">
                      {execution.operationSequence ?? "—"} ·{" "}
                      {execution.operationCode ?? "—"}
                    </span>
                    <span className="block text-[9px] text-[#8290a4]">
                      {execution.operationName ?? "Unnamed operation"}
                      {execution.qcRequired ? " · QC required" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill value={execution.status} />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatQuantity(execution.plannedQuantity)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatQuantity(execution.inputQuantity)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#08783d]">
                    {formatQuantity(execution.goodQuantity)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[#b42318]">
                    {formatQuantity(execution.rejectedQuantity)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatQuantity(execution.scrapQuantity)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatQuantity(execution.reworkQuantity)}
                  </td>
                  <td className="px-3 py-2.5 text-[9px] text-[#718096]">
                    <span className="block">
                      Start {formatDateTime(execution.startedAt)}
                    </span>
                    <span className="block">
                      Finish {formatDateTime(execution.completedAt)}
                    </span>
                    {execution.pauseReason ? (
                      <span className="block text-[#9a5b0a]">
                        Pause: {execution.pauseReason}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-6 text-center text-xs text-[#718096]">
          No routing-operation execution rows were returned. Approve a
          routing-backed order to create controlled operation evidence.
        </div>
      )}
    </div>
  );
}

function ProductionEvidenceTables({
  order,
}: {
  order: ManufacturingProductionOrderRecord;
}) {
  const lotNames = new Map(order.lots.map((lot) => [lot.id, lot.lotNumber]));
  const materialNames = new Map(
    order.materials.map((material) => [
      material.inventoryItemId,
      `${material.itemCode} · ${material.itemName}`,
    ]),
  );
  const latestCost = order.costSnapshots.at(-1);
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
          <h3 className="text-sm font-semibold text-[#172b49]">
            Posted inventory & accounting evidence
          </h3>
          <div className="flex gap-2">
            <span className="rounded-full bg-[#eaf3ff] px-2 py-1 text-[9px] font-semibold text-[#1f6fc6]">
              {order.transactions.length} transaction
              {order.transactions.length === 1 ? "" : "s"}
            </span>
            <span className="rounded-full bg-[#eefaf3] px-2 py-1 text-[9px] font-semibold text-[#08783d]">
              {order.serials.length} serial
              {order.serials.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        {order.transactions.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-left text-[10px]">
              <thead className="bg-[#fbfcfe] text-[9px] uppercase tracking-wide text-[#718096]">
                <tr>
                  <th className="px-3 py-2">Document</th>
                  <th className="px-3 py-2">Type / status</th>
                  <th className="px-3 py-2">Lot / item</th>
                  <th className="px-3 py-2 text-right">Quantity</th>
                  <th className="px-3 py-2 text-right">Value</th>
                  <th className="px-3 py-2">Inventory evidence</th>
                  <th className="px-3 py-2">Journal</th>
                </tr>
              </thead>
              <tbody>
                {order.transactions.map((transaction) => (
                  <Fragment key={transaction.id}>
                    {transaction.lines.map((line, index) => (
                      <tr
                        key={line.id}
                        className="border-t border-[#eef2f7] hover:bg-[#f9fbfe]"
                      >
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-[#334155]">
                            {index === 0 ? transaction.transactionNumber : "↳"}
                          </span>
                          {index === 0 ? (
                            <span className="block text-[9px] text-[#8290a4]">
                              {formatDate(transaction.transactionDate)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-[#334155]">
                            {transaction.transactionType.replaceAll("_", " ")}
                          </span>
                          <span className="block text-[9px] text-[#8290a4]">
                            {transaction.status}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-medium text-[#334155]">
                            {line.inventoryItemId === order.finishedProductId
                              ? `${order.finishedProductCode} · ${order.finishedProductName}`
                              : (materialNames.get(line.inventoryItemId) ??
                                line.inventoryItemId)}
                          </span>
                          <span className="block text-[9px] text-[#8290a4]">
                            {transaction.orderLotId
                              ? (lotNames.get(transaction.orderLotId) ??
                                "Unknown order lot")
                              : "Order level"}
                            {line.destinationInventoryLot
                              ? ` · To lot ${line.destinationInventoryLot.lotNumber}`
                              : ""}
                            {line.sourceInventoryLot
                              ? ` · From lot ${line.sourceInventoryLot.lotNumber}`
                              : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatQuantity(line.quantity)} {line.unit}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {formatAmount(line.totalCost)}
                        </td>
                        <td className="px-3 py-2.5 text-[9px] text-[#718096]">
                          {line.stockMovements.length} movement
                          {line.stockMovements.length === 1 ? "" : "s"} ·{" "}
                          {line.serialNumbers.length} serial
                          {line.serialNumbers.length === 1 ? "" : "s"}
                        </td>
                        <td className="px-3 py-2.5 text-[9px]">
                          {transaction.journal ? (
                            <span>
                              <span className="font-semibold text-[#08783d]">
                                {transaction.journal.status}
                              </span>
                              <span className="block text-[#718096]">
                                Dr {formatAmount(transaction.journal.debit)} =
                                Cr {formatAmount(transaction.journal.credit)}
                              </span>
                            </span>
                          ) : (
                            <span className="text-[#94a3b8]">
                              No journal for this event
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-6 text-center text-xs text-[#718096]">
            No posted inventory or accounting evidence has been returned for
            this order.
          </div>
        )}
      </div>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.65fr)]">
        <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
          <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#172b49]">
              Quality inspection evidence
            </h3>
          </div>
          {order.qualityInspections.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[10px]">
                <thead className="bg-[#fbfcfe] text-[9px] uppercase text-[#718096]">
                  <tr>
                    <th className="px-3 py-2">Inspection</th>
                    <th className="px-3 py-2">Lot</th>
                    <th className="px-3 py-2 text-right">Sample</th>
                    <th className="px-3 py-2 text-right">Accepted</th>
                    <th className="px-3 py-2 text-right">Rejected</th>
                    <th className="px-3 py-2 text-right">Hold</th>
                    <th className="px-3 py-2">Actual results</th>
                  </tr>
                </thead>
                <tbody>
                  {order.qualityInspections.map((inspection) => (
                    <tr
                      key={inspection.id}
                      className="border-t border-[#eef2f7] align-top"
                    >
                      <td className="px-3 py-2.5">
                        <span className="font-semibold text-[#334155]">
                          {inspection.inspectionNumber}
                        </span>
                        <span className="block text-[9px] text-[#8290a4]">
                          {inspection.status} ·{" "}
                          {formatDateTime(inspection.inspectedAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {inspection.orderLotId
                          ? (lotNames.get(inspection.orderLotId) ??
                            "Unknown lot")
                          : "Order level"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatQuantity(inspection.sampleQuantity)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#08783d]">
                        {formatQuantity(inspection.acceptedQuantity)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-[#b42318]">
                        {formatQuantity(inspection.rejectedQuantity)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatQuantity(inspection.holdQuantity)}
                      </td>
                      <td className="px-3 py-2.5">
                        {inspection.results.length ? (
                          inspection.results.map((result) => (
                            <span key={result.id} className="mb-1 block">
                              <span
                                className={
                                  result.passed
                                    ? "font-semibold text-[#08783d]"
                                    : "font-semibold text-[#b42318]"
                                }
                              >
                                {result.parameterCode}:{" "}
                                {result.actualValue ?? result.actualText ?? "—"}{" "}
                                · {result.passed ? "Pass" : "Fail"}
                              </span>
                              {result.remarks ? (
                                <span className="block text-[9px] text-[#8290a4]">
                                  {result.remarks}
                                </span>
                              ) : null}
                            </span>
                          ))
                        ) : (
                          <span className="text-[#94a3b8]">
                            {inspection.holdReason ?? "No measured result rows"}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-xs text-[#718096]">
              No QC inspection evidence has been recorded.
            </div>
          )}
        </div>
        <div className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white">
          <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#172b49]">
              Latest cost evidence
            </h3>
          </div>
          {latestCost ? (
            <div className="grid grid-cols-2 gap-px bg-[#e5ebf3] text-[10px]">
              {[
                ["Status", latestCost.status],
                ["Version", String(latestCost.versionNumber)],
                ["Material", formatAmount(latestCost.materialCost)],
                ["Packaging", formatAmount(latestCost.packagingCost)],
                ["Labour", formatAmount(latestCost.labourCost)],
                ["Machine", formatAmount(latestCost.machineCost)],
                ["Overhead", formatAmount(latestCost.overheadCost)],
                ["Subcontract", formatAmount(latestCost.subcontractCost)],
                ["Other", formatAmount(latestCost.otherCost)],
                ["Total", formatAmount(latestCost.totalCost)],
                ["Completed", formatQuantity(latestCost.completedQuantity)],
                ["Unit cost", formatAmount(latestCost.unitCost)],
              ].map(([label, value]) => (
                <div key={label} className="bg-white p-3">
                  <span className="block text-[9px] uppercase text-[#8290a4]">
                    {label}
                  </span>
                  <span className="mt-1 block font-semibold tabular-nums text-[#334155]">
                    {value}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-xs text-[#718096]">
              No production cost snapshot has been recorded.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export type ManufacturingSettingsAccountKey =
  | "rawMaterialInventoryAccountId"
  | "packagingInventoryAccountId"
  | "wipInventoryAccountId"
  | "finishedGoodsInventoryAccountId"
  | "manufacturingVarianceAccountId"
  | "labourClearingAccountId"
  | "overheadAbsorptionAccountId"
  | "scrapRecoveryAccountId";

export const MANUFACTURING_INVENTORY_CONTROL_CODE = "1210001";

const inventoryControlAccountKeys = new Set<ManufacturingSettingsAccountKey>([
  "rawMaterialInventoryAccountId",
  "packagingInventoryAccountId",
  "finishedGoodsInventoryAccountId",
  "scrapRecoveryAccountId",
]);

export function manufacturingInventoryControlLedger(
  ledgers: readonly LedgerOption[],
) {
  return (
    ledgers.find(
      (ledger) =>
        ledger.code === MANUFACTURING_INVENTORY_CONTROL_CODE &&
        ledger.level === "LEDGER" &&
        ledger.status === "ACTIVE" &&
        ledger.nature === "ASSET" &&
        ledger.isSystem &&
        ledger.isControlAccount,
    ) ?? null
  );
}

export function manufacturingSettingsLedgerOptions(
  key: ManufacturingSettingsAccountKey,
  ledgers: readonly LedgerOption[],
) {
  const inventoryControl = manufacturingInventoryControlLedger(ledgers);
  if (inventoryControlAccountKeys.has(key))
    return inventoryControl ? [inventoryControl] : [];
  if (key === "wipInventoryAccountId")
    return ledgers.filter(
      (ledger) =>
        ledger.level === "LEDGER" &&
        ledger.status === "ACTIVE" &&
        ledger.nature === "ASSET" &&
        !ledger.isControlAccount &&
        ledger.id !== inventoryControl?.id,
    );
  return ledgers.filter(
    (ledger) =>
      ledger.level === "LEDGER" &&
      ledger.status === "ACTIVE" &&
      !ledger.isControlAccount,
  );
}

const settingsAccountFields: Array<{
  key: ManufacturingSettingsAccountKey;
  label: string;
  hint: string;
  requirement: "CORE" | "REGULATED" | "OPTIONAL";
}> = [
  {
    key: "rawMaterialInventoryAccountId",
    label: "Raw material inventory",
    hint: "Server-owned stock value; fixed to protected Inventory Control (1210001).",
    requirement: "CORE",
  },
  {
    key: "packagingInventoryAccountId",
    label: "Packaging inventory",
    hint: "Server-owned stock value; fixed to protected Inventory Control (1210001).",
    requirement: "REGULATED",
  },
  {
    key: "wipInventoryAccountId",
    label: "Work in progress (WIP)",
    hint: "Select a distinct non-control ASSET ledger for issued production cost.",
    requirement: "CORE",
  },
  {
    key: "finishedGoodsInventoryAccountId",
    label: "Finished goods inventory",
    hint: "Server-owned stock value; fixed to protected Inventory Control (1210001).",
    requirement: "CORE",
  },
  {
    key: "manufacturingVarianceAccountId",
    label: "Manufacturing variance",
    hint: "Select a non-control ledger for controlled production variances.",
    requirement: "OPTIONAL",
  },
  {
    key: "labourClearingAccountId",
    label: "Labour clearing",
    hint: "Select a non-control ledger for applied production labour.",
    requirement: "OPTIONAL",
  },
  {
    key: "overheadAbsorptionAccountId",
    label: "Overhead absorption",
    hint: "Select a non-control ledger for absorbed production overhead.",
    requirement: "OPTIONAL",
  },
  {
    key: "scrapRecoveryAccountId",
    label: "Stocked scrap / by-product inventory",
    hint: "Server-owned stocked recovery value; fixed to protected Inventory Control (1210001).",
    requirement: "OPTIONAL",
  },
];

export function manufacturingSettingRequirement(
  mode: ManufacturingMode,
  requirement: "CORE" | "REGULATED" | "OPTIONAL",
) {
  if (requirement === "CORE") return "Required for readiness";
  if (requirement === "REGULATED")
    return mode === "GENERAL"
      ? "Optional in General mode"
      : "Required in Pharmaceutical / Hybrid mode";
  return "Optional until the related cost or exception is used";
}

export function ManufacturingSettingsWorkspace({
  workspaceId,
  warehouses,
}: {
  workspaceId?: string;
  warehouses: WarehouseRecord[];
}) {
  const settingsQuery = useManufacturingSettingsQuery(workspaceId);
  const locationsQuery = useManufacturingLocationsQuery(
    workspaceId ? { workspaceId, active: true } : null,
  );
  const ledgersQuery = usePostableLedgersQuery(Boolean(workspaceId));
  const activeLedgers = useMemo(
    () =>
      (ledgersQuery.data ?? []).filter((ledger) => ledger.status === "ACTIVE"),
    [ledgersQuery.data],
  );

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  if (
    settingsQuery.isLoading ||
    locationsQuery.isLoading ||
    ledgersQuery.isLoading
  )
    return (
      <LoadingPanel label="Loading manufacturing configuration, logical locations and active ledgers…" />
    );
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {settingsQuery.isError ? (
        <QueryError
          message={getErrorMessage(
            settingsQuery.error,
            "Manufacturing settings could not be loaded.",
          )}
          onRetry={() => void settingsQuery.refetch()}
        />
      ) : null}
      {locationsQuery.isError ? (
        <QueryError
          message={getErrorMessage(
            locationsQuery.error,
            "Manufacturing logical locations could not be loaded.",
          )}
          onRetry={() => void locationsQuery.refetch()}
        />
      ) : null}
      {ledgersQuery.isError ? (
        <QueryError
          message={getErrorMessage(
            ledgersQuery.error,
            "Active posting ledgers could not be loaded.",
          )}
          onRetry={() => void ledgersQuery.refetch()}
        />
      ) : null}
      {!settingsQuery.isError &&
      !locationsQuery.isError &&
      !ledgersQuery.isError ? (
        <ManufacturingSettingsForm
          key={settingsQuery.data?.updatedAt ?? `unconfigured:${workspaceId}`}
          workspaceId={workspaceId}
          settings={settingsQuery.data ?? null}
          warehouses={warehouses}
          locations={locationsQuery.data ?? []}
          activeLedgers={activeLedgers}
        />
      ) : null}
    </div>
  );
}

function ManufacturingSettingsForm({
  workspaceId,
  settings,
  warehouses,
  locations,
  activeLedgers,
}: {
  workspaceId: string;
  settings: ManufacturingSettingsRecord | null;
  warehouses: WarehouseRecord[];
  locations: ManufacturingLocationRecord[];
  activeLedgers: LedgerOption[];
}) {
  const inventoryControl = useMemo(
    () => manufacturingInventoryControlLedger(activeLedgers),
    [activeLedgers],
  );
  const inventoryControlAccountId = inventoryControl?.id ?? "";
  const [form, setForm] = useState(() => ({
    mode: settings?.mode ?? ("GENERAL" as const),
    rawMaterialWarehouseId: settings?.rawMaterialWarehouseId ?? "",
    wipWarehouseId: settings?.wipWarehouseId ?? "",
    finishedGoodsQualityWarehouseId:
      settings?.finishedGoodsQualityWarehouseId ?? "",
    finishedGoodsReleasedWarehouseId:
      settings?.finishedGoodsReleasedWarehouseId ?? "",
    rejectedWarehouseId: settings?.rejectedWarehouseId ?? "",
    scrapWarehouseId: settings?.scrapWarehouseId ?? "",
    defaultRawMaterialLocationId:
      settingsString(settings, "defaultRawMaterialLocationId") ?? "",
    defaultWipLocationId:
      settingsString(settings, "defaultWipLocationId") ?? "",
    defaultFinishedGoodsHoldLocationId:
      settingsString(settings, "defaultFinishedGoodsHoldLocationId") ?? "",
    defaultFinishedGoodsReleaseLocationId:
      settingsString(settings, "defaultFinishedGoodsReleaseLocationId") ?? "",
    rawMaterialInventoryAccountId: inventoryControlAccountId,
    packagingInventoryAccountId: inventoryControlAccountId,
    wipInventoryAccountId: settings?.wipInventoryAccountId ?? "",
    finishedGoodsInventoryAccountId: inventoryControlAccountId,
    manufacturingVarianceAccountId:
      settings?.manufacturingVarianceAccountId ?? "",
    labourClearingAccountId: settings?.labourClearingAccountId ?? "",
    overheadAbsorptionAccountId: settings?.overheadAbsorptionAccountId ?? "",
    scrapRecoveryAccountId: inventoryControlAccountId,
    reservationRequired: settings?.reservationRequired ?? true,
    issueBeforeProduction: settings?.issueBeforeProduction ?? true,
    negativeStockAllowed: settings?.negativeStockAllowed ?? false,
    serialTrackingRequired: settings?.serialTrackingRequired ?? false,
    qualityReleaseRequired: settings?.qualityReleaseRequired ?? true,
    partialProductionAllowed: settings?.partialProductionAllowed ?? true,
    electronicSignatureRequired: settings?.electronicSignatureRequired ?? true,
    approvalRequired: settings?.approvalRequired ?? true,
  }));
  const updateSettings = useUpdateManufacturingSettingsMutation();
  useEffect(() => {
    setForm((current) => {
      if (
        current.rawMaterialInventoryAccountId === inventoryControlAccountId &&
        current.packagingInventoryAccountId === inventoryControlAccountId &&
        current.finishedGoodsInventoryAccountId === inventoryControlAccountId &&
        current.scrapRecoveryAccountId === inventoryControlAccountId
      )
        return current;
      return {
        ...current,
        rawMaterialInventoryAccountId: inventoryControlAccountId,
        packagingInventoryAccountId: inventoryControlAccountId,
        finishedGoodsInventoryAccountId: inventoryControlAccountId,
        scrapRecoveryAccountId: inventoryControlAccountId,
      };
    });
  }, [inventoryControlAccountId]);
  const warehouseFields: Array<{
    key: keyof Pick<
      typeof form,
      | "rawMaterialWarehouseId"
      | "wipWarehouseId"
      | "finishedGoodsQualityWarehouseId"
      | "finishedGoodsReleasedWarehouseId"
      | "rejectedWarehouseId"
      | "scrapWarehouseId"
    >;
    label: string;
    requirement: "CORE" | "OPTIONAL";
  }> = [
    {
      key: "rawMaterialWarehouseId",
      label: "Raw material warehouse",
      requirement: "CORE",
    },
    {
      key: "wipWarehouseId",
      label: "Work in progress warehouse",
      requirement: "CORE",
    },
    {
      key: "finishedGoodsQualityWarehouseId",
      label: "Finished goods — quality / quarantine",
      requirement: "CORE",
    },
    {
      key: "finishedGoodsReleasedWarehouseId",
      label: "Finished goods — released",
      requirement: "CORE",
    },
    {
      key: "rejectedWarehouseId",
      label: "Rejected material warehouse",
      requirement: "OPTIONAL",
    },
    {
      key: "scrapWarehouseId",
      label: "Scrap warehouse",
      requirement: "OPTIONAL",
    },
  ];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!inventoryControl) {
      toast.error(
        "Protected Inventory Control (1210001) is missing or inactive. Restore the fixed Chart of Accounts before saving manufacturing settings.",
      );
      return;
    }
    if (
      form.rawMaterialInventoryAccountId !== inventoryControl.id ||
      form.packagingInventoryAccountId !== inventoryControl.id ||
      form.finishedGoodsInventoryAccountId !== inventoryControl.id ||
      form.scrapRecoveryAccountId !== inventoryControl.id
    ) {
      toast.error(
        "RM, packaging, finished goods and stocked scrap must use protected Inventory Control (1210001).",
      );
      return;
    }
    const invalidAccount = settingsAccountFields.find(
      (field) =>
        Boolean(form[field.key]) &&
        !manufacturingSettingsLedgerOptions(field.key, activeLedgers).some(
          (ledger) => ledger.id === form[field.key],
        ),
    );
    if (invalidAccount) {
      toast.error(
        `${invalidAccount.label} must reference an existing active postable ledger.`,
      );
      return;
    }
    const invalidWarehouse = warehouseFields.find(
      (field) =>
        Boolean(form[field.key]) &&
        !warehouses.some((warehouse) => warehouse.id === form[field.key]),
    );
    if (invalidWarehouse) {
      toast.error(
        `${invalidWarehouse.label} must reference an existing active warehouse.`,
      );
      return;
    }
    const locationMappings = [
      [
        form.defaultRawMaterialLocationId,
        form.rawMaterialWarehouseId,
        "Raw-material default location",
      ],
      [form.defaultWipLocationId, form.wipWarehouseId, "WIP default location"],
      [
        form.defaultFinishedGoodsHoldLocationId,
        form.finishedGoodsQualityWarehouseId,
        "FG-Q default location",
      ],
      [
        form.defaultFinishedGoodsReleaseLocationId,
        form.finishedGoodsReleasedWarehouseId,
        "FG-R default location",
      ],
    ] as const;
    const invalidLocation = locationMappings.find(
      ([locationId, warehouseId]) =>
        Boolean(locationId) &&
        (!warehouseId ||
          !locations.some(
            (location) =>
              location.id === locationId &&
              location.warehouseId === warehouseId &&
              location.isActive,
          )),
    );
    if (invalidLocation) {
      toast.error(
        `${invalidLocation[2]} must be an active logical location in its selected warehouse.`,
      );
      return;
    }
    if (
      form.finishedGoodsQualityWarehouseId &&
      form.finishedGoodsReleasedWarehouseId &&
      form.defaultFinishedGoodsHoldLocationId &&
      form.defaultFinishedGoodsReleaseLocationId &&
      form.finishedGoodsQualityWarehouseId ===
        form.finishedGoodsReleasedWarehouseId &&
      form.defaultFinishedGoodsHoldLocationId ===
        form.defaultFinishedGoodsReleaseLocationId
    ) {
      toast.error(
        "FG-Q and FG-R must use distinct logical locations when they share one physical warehouse.",
      );
      return;
    }
    updateSettings.mutate(
      {
        workspaceId,
        mode: form.mode,
        rawMaterialWarehouseId: form.rawMaterialWarehouseId || null,
        wipWarehouseId: form.wipWarehouseId || null,
        finishedGoodsQualityWarehouseId:
          form.finishedGoodsQualityWarehouseId || null,
        finishedGoodsReleasedWarehouseId:
          form.finishedGoodsReleasedWarehouseId || null,
        rejectedWarehouseId: form.rejectedWarehouseId || null,
        scrapWarehouseId: form.scrapWarehouseId || null,
        rawMaterialInventoryAccountId: inventoryControl.id,
        packagingInventoryAccountId: inventoryControl.id,
        wipInventoryAccountId: form.wipInventoryAccountId || null,
        finishedGoodsInventoryAccountId: inventoryControl.id,
        manufacturingVarianceAccountId:
          form.manufacturingVarianceAccountId || null,
        labourClearingAccountId: form.labourClearingAccountId || null,
        overheadAbsorptionAccountId: form.overheadAbsorptionAccountId || null,
        scrapRecoveryAccountId: inventoryControl.id,
        reservationRequired: form.reservationRequired,
        issueBeforeProduction: form.issueBeforeProduction,
        negativeStockAllowed: form.negativeStockAllowed,
        serialTrackingRequired: form.serialTrackingRequired,
        qualityReleaseRequired: form.qualityReleaseRequired,
        partialProductionAllowed: form.partialProductionAllowed,
        electronicSignatureRequired: form.electronicSignatureRequired,
        approvalRequired: form.approvalRequired,
        settings: {
          ...(settings?.settings ?? {}),
          defaultRawMaterialLocationId:
            form.defaultRawMaterialLocationId || null,
          defaultWipLocationId: form.defaultWipLocationId || null,
          defaultFinishedGoodsHoldLocationId:
            form.defaultFinishedGoodsHoldLocationId || null,
          defaultFinishedGoodsReleaseLocationId:
            form.defaultFinishedGoodsReleaseLocationId || null,
        },
      },
      {
        onSuccess: () => toast.success("Manufacturing settings were saved."),
        onError: (error) =>
          toast.error(
            getErrorMessage(
              error,
              "Manufacturing settings could not be saved.",
            ),
          ),
      },
    );
  };

  return (
    <form
      onSubmit={submit}
      className="overflow-hidden rounded-xl border border-[#dbe4ef] bg-white"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8f2ff] text-[#2478df]">
            <Settings2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-semibold text-[#172b49]">
              Manufacturing Settings
            </h2>
            <p className="text-xs text-[#718096]">
              Explicit warehouse, posting-ledger and control policy mapping.
              Inventory Control is server-owned; accounts are never generated
              automatically.
            </p>
          </div>
        </div>
        <Button
          type="submit"
          size="sm"
          disabled={updateSettings.isPending || !inventoryControl}
        >
          <Save className="h-3.5 w-3.5" />
          {updateSettings.isPending ? "Saving…" : "Save configuration"}
        </Button>
      </div>
      <div className="space-y-5 p-4">
        <section>
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-[#203651]">
              Operating mode and warehouses
            </h3>
            <p className="text-[10px] text-[#718096]">
              All warehouse choices come from the active inventory warehouse
              register.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field
              label="Manufacturing mode"
              hint={
                form.mode === "GENERAL"
                  ? "Core RM, WIP and finished-goods mappings are required. Packaging is optional until used."
                  : "Pharmaceutical / Hybrid also requires packaging inventory and controlled QC / packaging numbering."
              }
            >
              <select
                value={form.mode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mode: event.target.value as ManufacturingMode,
                  }))
                }
                className={selectClass}
              >
                <option value="GENERAL">General manufacturing</option>
                <option value="PHARMACEUTICAL">Pharmaceutical</option>
                <option value="HYBRID">Hybrid</option>
              </select>
            </Field>
            {warehouseFields.map((field) => (
              <Field
                key={field.key}
                label={field.label}
                hint={
                  field.requirement === "CORE"
                    ? "Required for readiness; partial setup can still be saved."
                    : "Optional until rejection or scrap handling is used."
                }
              >
                <select
                  value={form[field.key]}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      [field.key]: event.target.value,
                    }))
                  }
                  className={selectClass}
                >
                  <option value="">Select active warehouse…</option>
                  {warehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} ({warehouse.code}) —{" "}
                      {warehouse.type.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </Field>
            ))}
          </div>
        </section>
        <section className="border-t border-[#e5ebf3] pt-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-[#203651]">
              Default logical stock locations
            </h3>
            <p className="text-[10px] text-[#718096]">
              Required for auditable RM → WIP → FG-Q → FG-R movement, including
              one physical warehouse with separate locations.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field
              label="Raw material — released"
              hint="Required for readiness; partial setup can still be saved."
            >
              <select
                value={form.defaultRawMaterialLocationId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultRawMaterialLocationId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Select RM location…</option>
                {locations
                  .filter(
                    (location) =>
                      location.warehouseId === form.rawMaterialWarehouseId &&
                      location.disposition === "RELEASED",
                  )
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Work in progress"
              hint="Required for readiness; partial setup can still be saved."
            >
              <select
                value={form.defaultWipLocationId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultWipLocationId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Select WIP location…</option>
                {locations
                  .filter(
                    (location) =>
                      location.warehouseId === form.wipWarehouseId &&
                      location.disposition === "WIP",
                  )
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Finished goods — quality hold"
              hint="Required for readiness; keep FG-Q distinct from FG-R."
            >
              <select
                value={form.defaultFinishedGoodsHoldLocationId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultFinishedGoodsHoldLocationId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Select FG-Q location…</option>
                {locations
                  .filter(
                    (location) =>
                      location.warehouseId ===
                        form.finishedGoodsQualityWarehouseId &&
                      location.disposition === "QC_HOLD",
                  )
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.name}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Finished goods — released"
              hint="Required for readiness; keep FG-R distinct from FG-Q."
            >
              <select
                value={form.defaultFinishedGoodsReleaseLocationId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultFinishedGoodsReleaseLocationId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Select FG-R location…</option>
                {locations
                  .filter(
                    (location) =>
                      location.warehouseId ===
                        form.finishedGoodsReleasedWarehouseId &&
                      location.disposition === "RELEASED",
                  )
                  .map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.code} — {location.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        </section>
        <section className="border-t border-[#e5ebf3] pt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                Posting account mappings
              </h3>
              <p className="text-[10px] text-[#718096]">
                RM, packaging, finished goods and stocked scrap are bound to
                server-owned Inventory Control (1210001). WIP and other manual
                mappings only offer eligible non-control ledgers.
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${activeLedgers.length ? "border-[#bde5cf] bg-[#edf9f2] text-[#08783d]" : "border-[#f1c4c4] bg-[#fff1f1] text-[#b42318]"}`}
            >
              {activeLedgers.length} active ledger
              {activeLedgers.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {settingsAccountFields.map((field) => {
              const serverOwned = inventoryControlAccountKeys.has(field.key);
              const ledgerOptions = manufacturingSettingsLedgerOptions(
                field.key,
                activeLedgers,
              );
              return (
                <Field
                  key={field.key}
                  label={field.label}
                  hint={`${field.hint} ${manufacturingSettingRequirement(form.mode, field.requirement)}.`}
                >
                  <select
                    value={form[field.key]}
                    disabled={serverOwned}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        [field.key]: event.target.value,
                      }))
                    }
                    className={selectClass}
                  >
                    <option value="">Select existing active ledger…</option>
                    {ledgerOptions.map((ledger) => (
                      <option key={ledger.id} value={ledger.id}>
                        {ledger.code} — {ledger.path || ledger.name} (
                        {ledger.nature.replaceAll("_", " ")})
                      </option>
                    ))}
                  </select>
                </Field>
              );
            })}
          </div>
          {!inventoryControl ? (
            <div className="mt-3 rounded-lg border border-[#f1c4c4] bg-[#fff7f5] p-3 text-xs text-[#a33a2b]">
              Protected Inventory Control (1210001) is missing, inactive or no
              longer marked as the fixed system control account. Restore the
              Chart of Accounts backbone before saving manufacturing mappings.
            </div>
          ) : !activeLedgers.length ? (
            <div className="mt-3 rounded-lg border border-[#f1c4c4] bg-[#fff7f5] p-3 text-xs text-[#a33a2b]">
              No active postable ledger is available. Configure the Chart of
              Accounts before posting. Warehouse and policy setup can still be
              saved incrementally; this screen will not create accounts
              automatically.
            </div>
          ) : null}
        </section>
        <section className="border-t border-[#e5ebf3] pt-5">
          <div className="mb-3">
            <h3 className="text-sm font-semibold text-[#203651]">
              Workflow controls
            </h3>
            <p className="text-[10px] text-[#718096]">
              These policies are persisted by the manufacturing settings API and
              enforced by transactional actions.
            </p>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            <CheckboxField
              checked={form.reservationRequired}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  reservationRequired: value,
                }))
              }
              label="Reservation required"
              description="Reserve components before issue."
            />
            <CheckboxField
              checked={form.issueBeforeProduction}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  issueBeforeProduction: value,
                }))
              }
              label="Issue before production"
              description="Require posted material issue before start."
            />
            <CheckboxField
              checked={form.negativeStockAllowed}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  negativeStockAllowed: value,
                }))
              }
              label="Allow negative stock"
              description="Permit controlled issues beyond availability."
            />
            <CheckboxField
              checked={form.serialTrackingRequired}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  serialTrackingRequired: value,
                }))
              }
              label="Serial tracking required"
              description="Require serial traceability for configured outputs."
            />
            <CheckboxField
              checked={form.qualityReleaseRequired}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  qualityReleaseRequired: value,
                }))
              }
              label="Quality release required"
              description="Block release until quality workflow passes."
            />
            <CheckboxField
              checked={form.partialProductionAllowed}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  partialProductionAllowed: value,
                }))
              }
              label="Partial completion allowed"
              description="Permit controlled partial production receipts."
            />
            <CheckboxField
              checked={form.electronicSignatureRequired}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  electronicSignatureRequired: value,
                }))
              }
              label="Electronic signature"
              description="Require signature controls where supported."
            />
            <CheckboxField
              checked={form.approvalRequired}
              onChange={(value) =>
                setForm((current) => ({ ...current, approvalRequired: value }))
              }
              label="Order approval required"
              description="Require approved orders before execution."
            />
          </div>
        </section>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-3 text-[10px] text-[#718096]">
        <span>
          {settings
            ? `Last updated ${formatDateTime(settings.updatedAt)}`
            : "Not configured yet — saving creates this workspace's first settings record."}
        </span>
        <Button
          type="submit"
          size="sm"
          disabled={updateSettings.isPending || !inventoryControl}
        >
          <Save className="h-3.5 w-3.5" />
          {updateSettings.isPending ? "Saving…" : "Save manufacturing settings"}
        </Button>
      </div>
    </form>
  );
}

type ManufacturingWorkflowReviewTransitionAction =
  "REVIEW" | "APPROVE" | "REJECT";

export function manufacturingWorkflowReviewTransitionActions(
  status: ManufacturingWorkflowReviewStatus,
): readonly ManufacturingWorkflowReviewTransitionAction[] {
  if (status === "PENDING") return ["REVIEW", "REJECT"];
  if (status === "REVIEWED") return ["APPROVE", "REJECT"];
  return [];
}

function ManufacturingWorkflowReviewTransitionControls({
  workspaceId,
  review,
}: {
  workspaceId: string;
  review: ManufacturingWorkflowReviewRecord;
}) {
  const actions = manufacturingWorkflowReviewTransitionActions(review.status);
  const [form, setForm] = useState({
    action: "" as "" | ManufacturingWorkflowReviewTransitionAction,
    reason: "",
    signatureMeaning: "",
    reauthenticationPassword: "",
  });
  const transitionReview = useTransitionManufacturingWorkflowReviewMutation();

  if (!actions.length) return null;

  const reset = () =>
    setForm({
      action: "",
      reason: "",
      signatureMeaning: "",
      reauthenticationPassword: "",
    });
  const submit = () => {
    if (!form.action || transitionReview.isPending) return;
    if (form.action === "REJECT" && !form.reason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    transitionReview.mutate(
      {
        reviewId: review.id,
        input: {
          workspaceId,
          action: form.action,
          reason: form.reason.trim() || null,
          signatureMeaning: form.signatureMeaning.trim() || null,
          reauthenticationPassword: form.reauthenticationPassword || null,
          transactionDate: todayIso(),
        },
      },
      {
        onSuccess: () => {
          toast.success("Workflow-review status was updated.");
          reset();
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Workflow-review transition failed."),
          ),
      },
    );
  };

  return (
    <div className="mt-3 border-t border-[#e8edf3] pt-3">
      {form.action ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Input
            value={form.reason}
            disabled={transitionReview.isPending}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                reason: event.target.value,
              }))
            }
            className={inputClass}
            placeholder={
              form.action === "REJECT"
                ? "Rejection reason (required)"
                : "Transition note (optional)"
            }
          />
          <Input
            value={form.signatureMeaning}
            disabled={transitionReview.isPending}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                signatureMeaning: event.target.value,
              }))
            }
            className={inputClass}
            placeholder="Signature meaning (if required)"
          />
          <Input
            type="password"
            autoComplete="current-password"
            value={form.reauthenticationPassword}
            disabled={transitionReview.isPending}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                reauthenticationPassword: event.target.value,
              }))
            }
            className={inputClass}
            placeholder="Current password (if policy requires)"
          />
          <div className="flex gap-2 sm:col-span-2">
            <Button
              type="button"
              size="sm"
              disabled={transitionReview.isPending}
              onClick={submit}
            >
              {transitionReview.isPending
                ? "Saving…"
                : `Confirm ${form.action.toLowerCase()}`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={transitionReview.isPending}
              onClick={reset}
            >
              Cancel
            </Button>
          </div>
          <p className="text-[10px] leading-4 text-[#718096] sm:col-span-2">
            Permission, maker-checker and approved electronic-signature policy
            are revalidated by the server before this transition is saved.
          </p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <Button
              key={action}
              type="button"
              size="sm"
              variant="outline"
              disabled={transitionReview.isPending}
              className={
                action === "REJECT" ? "border-[#f1c4c4] text-[#b42318]" : ""
              }
              onClick={() =>
                setForm({
                  action,
                  reason: "",
                  signatureMeaning: "",
                  reauthenticationPassword: "",
                })
              }
            >
              {action === "REVIEW"
                ? "Mark reviewed"
                : action === "APPROVE"
                  ? "Approve decision"
                  : "Reject"}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ManufacturingWorkflowReviewAdjunct({
  workspaceId,
  group,
  workflowKey,
  title,
}: {
  workspaceId?: string;
  group: ManufacturingWorkflowGroup;
  workflowKey: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    outcome: "ZERO_REVIEW" as ManufacturingWorkflowOutcome,
    transactionDate: todayIso(),
    entityType: "",
    entityId: "",
    reason: "",
    note: "",
  });
  const reviewsQuery = useManufacturingWorkflowReviewsQuery(
    workspaceId ? { workspaceId, group, workflowKey } : null,
  );
  const packagingOrdersQuery = useManufacturingOrdersQuery(
    workspaceId ? { workspaceId } : null,
    group === "PACKAGING_RELEASE" && workflowKey === "qa-release",
  );
  const createReview = useCreateManufacturingWorkflowReviewMutation();
  const isPackagingQaReleaseReview =
    group === "PACKAGING_RELEASE" && workflowKey === "qa-release";

  if (!workspaceId) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!form.reason.trim()) {
      toast.error(
        `${workflowOutcomeLabels[form.outcome]} requires an explicit reason.`,
      );
      return;
    }
    if (
      isPackagingQaReleaseReview &&
      form.outcome === "NOT_APPLICABLE" &&
      (form.entityType.trim() !== "MANUFACTURING_ORDER" ||
        !form.entityId.trim())
    ) {
      toast.error(
        "Packaging N/A evidence must link the exact production order using entity type MANUFACTURING_ORDER and its record ID.",
      );
      return;
    }
    createReview.mutate(
      {
        workspaceId,
        group,
        workflowKey,
        entityType: form.entityType.trim() || null,
        entityId: form.entityId.trim() || null,
        outcome: form.outcome,
        status: "PENDING",
        reason: form.reason.trim(),
        note: form.note.trim() || null,
        transactionDate: form.transactionDate,
        idempotencyKey: makeIdempotencyKey(`workflow-review-${workflowKey}`),
      },
      {
        onSuccess: () => {
          toast.success(
            `${title} review was submitted for independent review.`,
          );
          setForm((current) => ({
            ...current,
            outcome: "ZERO_REVIEW",
            entityType: "",
            entityId: "",
            reason: "",
            note: "",
          }));
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Workflow review could not be recorded."),
          ),
      },
    );
  };
  return (
    <section className="overflow-hidden rounded-xl border border-[#d6e1ef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#f8fbff]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#edf5ff] text-[#2478df]">
            <ClipboardCheck className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-[#203651]">
              Zero / N/A workflow review
            </span>
            <span className="block truncate text-[10px] text-[#718096]">
              {isPackagingQaReleaseReview
                ? "Non-packaged products require independently approved N/A evidence linked to the exact production order."
                : "Use only for verified zero activity or a genuinely not-applicable step."}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-[#f1f5f9] px-2.5 py-1 text-[10px] font-semibold text-[#60718a]">
            {reviewsQuery.data?.length ?? 0} records
          </span>
          <span className="text-xs font-semibold text-[#2478df]">
            {open ? "Hide" : "Open review"}
          </span>
        </span>
      </button>
      {open ? (
        <div className="grid gap-3 border-t border-[#e5ebf3] bg-[#fbfcfe] p-4 2xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
          <form
            onSubmit={submit}
            className="h-fit space-y-3 rounded-xl border border-[#dce5ef] bg-white p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Review outcome">
                <select
                  value={form.outcome}
                  onChange={(event) =>
                    setForm((current) => {
                      const outcome = event.target
                        .value as ManufacturingWorkflowOutcome;
                      return {
                        ...current,
                        outcome,
                        entityType:
                          isPackagingQaReleaseReview &&
                          outcome === "NOT_APPLICABLE"
                            ? "MANUFACTURING_ORDER"
                            : current.entityType,
                      };
                    })
                  }
                  className={selectClass}
                >
                  <option value="ZERO_REVIEW">Zero-activity review</option>
                  <option value="NOT_APPLICABLE">Not applicable</option>
                </select>
              </Field>
              <Field label="Transaction date">
                <AppDateInput
                  aria-label="Transaction date"
                  value={form.transactionDate}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      transactionDate: value,
                    }))
                  }
                  inputClassName={inputClass}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Entity type"
                hint={
                  isPackagingQaReleaseReview
                    ? "Required as MANUFACTURING_ORDER for packaging N/A."
                    : "Optional business-record link."
                }
              >
                <Input
                  value={form.entityType}
                  readOnly={
                    isPackagingQaReleaseReview &&
                    form.outcome === "NOT_APPLICABLE"
                  }
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      entityType: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder={
                    isPackagingQaReleaseReview
                      ? "MANUFACTURING_ORDER"
                      : "e.g. ProductionOrder"
                  }
                />
              </Field>
              {isPackagingQaReleaseReview &&
              form.outcome === "NOT_APPLICABLE" ? (
                <Field
                  label="Production order"
                  hint="Select the exact production order for this packaging N/A exception."
                >
                  <select
                    required
                    value={form.entityId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        entityType: "MANUFACTURING_ORDER",
                        entityId: event.target.value,
                      }))
                    }
                    className={selectClass}
                    disabled={packagingOrdersQuery.isLoading}
                  >
                    <option value="">
                      {packagingOrdersQuery.isLoading
                        ? "Loading production orders..."
                        : "Select production order"}
                    </option>
                    {(packagingOrdersQuery.data ?? []).map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.orderNumber} — {order.finishedProductName} (
                        {order.status})
                      </option>
                    ))}
                  </select>
                  {packagingOrdersQuery.isError ? (
                    <p className="mt-1 text-[10px] text-[#b42318]">
                      Production orders could not be loaded. Retry before
                      submitting this exception.
                    </p>
                  ) : null}
                </Field>
              ) : (
                <Field label="Entity ID">
                  <Input
                    value={form.entityId}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        entityId: event.target.value,
                      }))
                    }
                    className={inputClass}
                    placeholder="Record ID or reference"
                  />
                </Field>
              )}
            </div>
            <Field
              label="Reason (required)"
              hint="State the evidence for zero activity or why this step is not applicable."
            >
              <textarea
                required
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                className={textareaClass}
                placeholder="Verified reason…"
              />
            </Field>
            <Field label="Review note">
              <textarea
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                className={textareaClass}
                placeholder="Evidence, reference or follow-up"
              />
            </Field>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={createReview.isPending || !form.transactionDate}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {createReview.isPending
                ? "Recording review…"
                : "Submit for review"}
            </Button>
          </form>
          <div className="flex min-h-[260px] flex-col overflow-hidden rounded-xl border border-[#dce5ef] bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-[#203651]">
                  <FileClock className="h-4 w-4 text-[#2478df]" />
                  Review register
                </h3>
                <p className="text-[10px] text-[#718096]">
                  Persisted records for{" "}
                  <span className="font-mono">{workflowKey}</span>.
                </p>
              </div>
            </div>
            {reviewsQuery.isError ? (
              <div className="p-3">
                <QueryError
                  message={getErrorMessage(
                    reviewsQuery.error,
                    "Workflow-review history could not be loaded.",
                  )}
                  onRetry={() => void reviewsQuery.refetch()}
                />
              </div>
            ) : reviewsQuery.isLoading ? (
              <div className="flex flex-1 items-center justify-center text-xs text-[#718096]">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Loading review history…
              </div>
            ) : reviewsQuery.data?.length ? (
              <div className="max-h-[520px] overflow-y-auto p-3">
                {reviewsQuery.data.map((review) => (
                  <div
                    key={review.id}
                    className="mb-2.5 rounded-lg border border-[#dfe7f0] p-3 last:mb-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-xs font-semibold text-[#334155]">
                          {workflowOutcomeLabels[review.outcome]}
                        </div>
                        <div className="mt-0.5 text-[10px] text-[#8290a4]">
                          {formatDate(review.transactionDate)}
                        </div>
                      </div>
                      <StatusPill
                        value={review.status}
                        label={workflowStatusLabels[review.status]}
                      />
                    </div>
                    <div className="mt-2 rounded-md bg-[#f8fafc] px-2.5 py-2 text-[11px] leading-4 text-[#52647d]">
                      {review.reason}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 text-[9px] text-[#8290a4]">
                      {review.reviewedBy ? (
                        <span>Reviewed by {review.reviewedBy}</span>
                      ) : null}
                      {review.approvedBy ? (
                        <span>Approved by {review.approvedBy}</span>
                      ) : null}
                    </div>
                    <ManufacturingWorkflowReviewTransitionControls
                      workspaceId={workspaceId}
                      review={review}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRegister
                icon={FileClock}
                title="No review records returned"
                description="Submit the first real Zero/N/A decision for this workflow step."
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ManufacturingWorkflowReviewWorkspace({
  workspaceId,
  group,
  workflowKey,
  groupLabel,
  title,
  icon: Icon,
  step,
  total,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
}: {
  workspaceId?: string;
  group: ManufacturingWorkflowGroup;
  workflowKey: string;
  groupLabel: string;
  title: string;
  icon: typeof Factory;
  step: number;
  total: number;
  previousLabel?: string;
  nextLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
}) {
  const [form, setForm] = useState({
    outcome: "ZERO_REVIEW" as ManufacturingWorkflowOutcome,
    status: "PENDING" as ManufacturingWorkflowReviewStatus,
    transactionDate: todayIso(),
    entityType: "",
    entityId: "",
    reason: "",
    note: "",
  });
  const reviewsQuery = useManufacturingWorkflowReviewsQuery(
    workspaceId ? { workspaceId, group, workflowKey } : null,
  );
  const createReview = useCreateManufacturingWorkflowReviewMutation();
  const reasonRequired =
    form.outcome === "ZERO_REVIEW" || form.outcome === "NOT_APPLICABLE";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId) return;
    if (reasonRequired && !form.reason.trim()) {
      toast.error(
        `${workflowOutcomeLabels[form.outcome]} requires an explicit reason.`,
      );
      return;
    }
    createReview.mutate(
      {
        workspaceId,
        group,
        workflowKey,
        entityType: form.entityType.trim() || null,
        entityId: form.entityId.trim() || null,
        outcome: form.outcome,
        status: "PENDING",
        reason: form.reason.trim() || null,
        note: form.note.trim() || null,
        transactionDate: form.transactionDate,
        idempotencyKey: makeIdempotencyKey(`workflow-review-${workflowKey}`),
      },
      {
        onSuccess: () => {
          toast.success(`${title} review was recorded.`);
          setForm((current) => ({
            ...current,
            outcome: "ZERO_REVIEW",
            status: "PENDING",
            reason: "",
            note: "",
            entityType: "",
            entityId: "",
          }));
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Workflow review could not be recorded."),
          ),
      },
    );
  };

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-xl border border-[#d6e1ef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2478df]">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#718096]">
              {groupLabel}
            </div>
            <h2 className="truncate text-base font-semibold text-[#172b49]">
              {title}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#cfe0f4] bg-[#f1f7ff] px-3 py-1 text-[11px] font-medium text-[#2563eb]">
            Audited workflow review
          </span>
          <span className="rounded-full border border-[#dbe4ef] bg-white px-3 py-1 text-[11px] font-medium text-[#64748b]">
            Step {step} of {total}
          </span>
        </div>
      </div>
      <div className="grid flex-1 gap-3 p-4 2xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <form
          onSubmit={submit}
          className="h-fit overflow-hidden rounded-xl border border-[#dce5ef] bg-[#fbfcfe]"
        >
          <div className="border-b border-[#e5ebf3] bg-white px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-[#203651]">
              <ClipboardCheck className="h-4 w-4 text-[#2478df]" />
              Record controlled review
            </h3>
            <p className="mt-1 text-[10px] leading-4 text-[#718096]">
              Record a verified zero-activity review or a documented
              not-applicable decision. Real execution and approval evidence is
              created only by its controlled transaction.
            </p>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Review outcome">
                <select
                  value={form.outcome}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      outcome: event.target
                        .value as ManufacturingWorkflowOutcome,
                    }))
                  }
                  className={selectClass}
                >
                  <option value="ZERO_REVIEW">Zero-activity review</option>
                  <option value="NOT_APPLICABLE">Not applicable</option>
                </select>
              </Field>
              <Field label="Review status">
                <div className="flex h-9 items-center rounded-lg border border-[#d7e1ee] bg-[#f8fafc] px-3 text-sm text-[#52647d]">
                  Pending independent review
                </div>
              </Field>
              <Field label="Transaction date">
                <AppDateInput
                  aria-label="Transaction date"
                  value={form.transactionDate}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      transactionDate: value,
                    }))
                  }
                  inputClassName={inputClass}
                />
              </Field>
              <div />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                label="Entity type"
                hint="Optional link to the reviewed business record."
              >
                <Input
                  value={form.entityType}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      entityType: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="e.g. ProductionOrder"
                />
              </Field>
              <Field label="Entity ID">
                <Input
                  value={form.entityId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      entityId: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="Record ID or controlled reference"
                />
              </Field>
            </div>
            <Field
              label="Reason (required)"
              hint="State the evidence for zero activity or why this step is not applicable."
            >
              <textarea
                required
                value={form.reason}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                className={textareaClass}
                placeholder="Explain the verified zero activity or why this workflow is not applicable…"
              />
            </Field>
            <Field label="Review note">
              <textarea
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                className={textareaClass}
                placeholder="Evidence, references, observations or follow-up"
              />
            </Field>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={createReview.isPending || !form.transactionDate}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {createReview.isPending
                ? "Recording review…"
                : "Submit for review"}
            </Button>
          </div>
        </form>
        <div className="flex min-h-[360px] flex-col overflow-hidden rounded-xl border border-[#dce5ef] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-[#203651]">
                <FileClock className="h-4 w-4 text-[#2478df]" />
                Review register
              </h3>
              <p className="text-[10px] text-[#718096]">
                Live records for workflow key{" "}
                <span className="font-mono">{workflowKey}</span>.
              </p>
            </div>
            {reviewsQuery.data ? (
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#60718a] ring-1 ring-[#dce5ef]">
                {reviewsQuery.data.length} record
                {reviewsQuery.data.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
          {reviewsQuery.isError ? (
            <div className="p-3">
              <QueryError
                message={getErrorMessage(
                  reviewsQuery.error,
                  "Workflow-review history could not be loaded.",
                )}
                onRetry={() => void reviewsQuery.refetch()}
              />
            </div>
          ) : reviewsQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center text-xs text-[#718096]">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading review history…
            </div>
          ) : reviewsQuery.data?.length ? (
            <div className="max-h-[520px] overflow-y-auto p-3">
              {reviewsQuery.data.map((review) => (
                <div
                  key={review.id}
                  className="mb-2.5 rounded-lg border border-[#dfe7f0] p-3 last:mb-0"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-[#334155]">
                        {workflowOutcomeLabels[review.outcome]}
                      </div>
                      <div className="mt-0.5 text-[10px] text-[#8290a4]">
                        Transaction {formatDate(review.transactionDate)}
                      </div>
                    </div>
                    <div className="flex gap-1.5">
                      <StatusPill
                        value={review.outcome}
                        label={review.outcome.replaceAll("_", " ")}
                      />
                      <StatusPill
                        value={review.status}
                        label={workflowStatusLabels[review.status]}
                      />
                    </div>
                  </div>
                  {review.reason ? (
                    <div className="mt-2 rounded-md bg-[#f8fafc] px-2.5 py-2 text-[11px] leading-4 text-[#52647d]">
                      <span className="font-semibold">Reason:</span>{" "}
                      {review.reason}
                    </div>
                  ) : null}
                  {review.note ? (
                    <p className="mt-2 text-[11px] leading-4 text-[#60718a]">
                      {review.note}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-[#8290a4]">
                    <span>Created {formatDateTime(review.createdAt)}</span>
                    {review.reviewedBy ? (
                      <span>Reviewed by {review.reviewedBy}</span>
                    ) : null}
                    {review.approvedBy ? (
                      <span>Approved by {review.approvedBy}</span>
                    ) : null}
                    {review.entityId ? (
                      <span>
                        {review.entityType ?? "Entity"}: {review.entityId}
                      </span>
                    ) : null}
                  </div>
                  <ManufacturingWorkflowReviewTransitionControls
                    workspaceId={workspaceId}
                    review={review}
                  />
                </div>
              ))}
            </div>
          ) : (
            <EmptyRegister
              icon={FileClock}
              title="No review records returned"
              description="Submit the form to create the first real, auditable outcome for this workflow step."
            />
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!onPrevious}
          onClick={onPrevious}
          title={previousLabel}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Previous step
        </Button>
        <div className="hidden text-center text-[11px] text-[#7b8798] sm:block">
          Verified no-event and not-applicable steps use this persisted review
          control.
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!onNext}
          onClick={onNext}
          title={nextLabel}
        >
          Next step
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ManufacturingSetupBlockerWorkspace({
  workspaceId,
  groupLabel,
  title,
  icon: Icon,
  description,
  step,
  total,
  previousLabel,
  nextLabel,
  onPrevious,
  onNext,
  onOpenTarget,
}: {
  workspaceId?: string;
  groupLabel: string;
  title: string;
  icon: typeof Factory;
  description: string;
  step: number;
  total: number;
  previousLabel?: string;
  nextLabel?: string;
  onPrevious?: () => void;
  onNext?: () => void;
  onOpenTarget: OpenTarget;
}) {
  const readinessQuery = useManufacturingReadinessQuery(workspaceId);
  const readiness = readinessQuery.data;
  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-xl border border-[#d6e1ef] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2478df]">
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#718096]">
              {groupLabel}
            </div>
            <h2 className="truncate text-base font-semibold text-[#172b49]">
              {title}
            </h2>
          </div>
        </div>
        <span className="rounded-full border border-[#f3d5a7] bg-[#fff8eb] px-3 py-1 text-[11px] font-semibold text-[#9a5b0a]">
          Setup/API guidance · Step {step} of {total}
        </span>
      </div>
      <div className="grid flex-1 gap-4 p-5 xl:grid-cols-[minmax(300px,0.75fr)_minmax(0,1.25fr)]">
        <div className="flex flex-col items-center justify-center rounded-xl border border-[#f3d5a7] bg-[radial-gradient(circle_at_50%_0%,#fffaf0,#ffffff_60%)] px-6 py-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#f0cf9d] bg-[#fff8eb] text-[#c26b0a]">
            <AlertTriangle className="h-8 w-8" />
          </span>
          <h3 className="mt-4 text-base font-semibold text-[#172b49]">
            This operation needs a live integration
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#60718a]">
            {description}
          </p>
          <div className="mt-4 rounded-lg border border-[#dce5ef] bg-white px-3 py-2 text-[11px] leading-5 text-[#53647b]">
            No demo plan, local calculation, generated lot, or pretend execution
            record is created from this screen.
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#dce5ef] bg-white">
          <div className="flex items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                Setup and integration checks
              </h3>
              <p className="text-[10px] text-[#718096]">
                Review the API-reported setup before this operation can execute;
                the workflow screen itself remains available.
              </p>
            </div>
            {readiness ? (
              <StatusPill
                value={readiness.ready ? "READY" : "WARNING"}
                label={
                  readiness.ready
                    ? "Foundation ready"
                    : `${readiness.blockerCount} action${readiness.blockerCount === 1 ? "" : "s"} needed`
                }
              />
            ) : null}
          </div>
          {readinessQuery.isError ? (
            <div className="p-3">
              <QueryError
                message={getErrorMessage(
                  readinessQuery.error,
                  "Readiness checks could not be loaded.",
                )}
                onRetry={() => void readinessQuery.refetch()}
              />
            </div>
          ) : readinessQuery.isLoading ? (
            <div className="flex min-h-52 items-center justify-center text-xs text-[#718096]">
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Evaluating readiness…
            </div>
          ) : readiness?.checks.length ? (
            <div className="max-h-[430px] overflow-y-auto p-3">
              {readiness.checks.map((check) => (
                <button
                  key={check.code}
                  type="button"
                  disabled={!check.actionGroup || !check.actionView}
                  onClick={() =>
                    check.actionGroup &&
                    check.actionView &&
                    onOpenTarget(check.actionGroup, check.actionView)
                  }
                  className="mb-2 flex w-full items-start justify-between gap-3 rounded-lg border border-[#e5ebf3] p-3 text-left last:mb-0 enabled:hover:border-[#b9d6f6] enabled:hover:bg-[#f8fbff]"
                >
                  <span>
                    <span className="block text-xs font-semibold text-[#334155]">
                      {check.label}
                    </span>
                    <span className="mt-1 block text-[10px] leading-4 text-[#718096]">
                      {check.message ??
                        (check.count === null
                          ? "Readiness service validation"
                          : `${check.count} record${check.count === 1 ? "" : "s"}`)}
                    </span>
                  </span>
                  <StatusPill
                    value={check.state === "BLOCKED" ? "WARNING" : check.state}
                    label={
                      check.state === "BLOCKED"
                        ? "ACTION NEEDED"
                        : check.state.replaceAll("_", " ")
                    }
                  />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-52 items-center justify-center px-4 text-center text-xs text-[#718096]">
              The readiness API returned no checks. Execution remains
              unavailable until a typed planning/routing API is integrated.
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!onPrevious}
          onClick={onPrevious}
          title={previousLabel}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Previous step
        </Button>
        <div className="hidden text-center text-[11px] text-[#7b8798] sm:block">
          Execution becomes available through a real typed planning/routing
          integration; navigation remains open.
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!onNext}
          onClick={onNext}
          title={nextLabel}
        >
          Next step
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

const locationDispositionLabels: Record<
  ManufacturingLocationDisposition,
  string
> = {
  RELEASED: "Released stock",
  RESERVED: "Reserved stock",
  STAGING: "Production staging",
  WIP: "Work in progress",
  QC_HOLD: "Quality hold",
  REWORK: "Rework",
  REJECTED: "Rejected",
  SCRAP: "Scrap",
};

const allLocationDispositions = Object.keys(
  locationDispositionLabels,
) as ManufacturingLocationDisposition[];

type ItemProfileFormState = {
  inventoryItemId: string;
  role: ManufacturingItemRole;
  makeBuy: "MAKE" | "BUY" | "BOTH";
  lotTracked: boolean;
  serialTracked: boolean;
  expiryTracked: boolean;
  qcRequired: boolean;
  shelfLifeDays: string;
  standardYieldPercent: string;
  defaultIssueLocationId: string;
  defaultReceiptLocationId: string;
  isActive: boolean;
};

function blankItemProfile(role: ManufacturingItemRole): ItemProfileFormState {
  return {
    inventoryItemId: "",
    role,
    makeBuy:
      role === "FINISHED_GOOD" || role === "INTERMEDIATE" || role === "BULK"
        ? "MAKE"
        : "BUY",
    lotTracked: false,
    serialTracked: false,
    expiryTracked: false,
    qcRequired: false,
    shelfLifeDays: "",
    standardYieldPercent: "100",
    defaultIssueLocationId: "",
    defaultReceiptLocationId: "",
    isActive: true,
  };
}

export function ManufacturingItemProfilesWorkspace({
  workspaceId,
  items,
  title,
  role,
  onCreateInventoryItem,
}: {
  workspaceId?: string;
  items: ManufacturingInventoryOption[];
  title: string;
  role: ManufacturingItemRole;
  onCreateInventoryItem?: () => void;
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ManufacturingItemProfileRecord | null>(
    null,
  );
  const [form, setForm] = useState<ItemProfileFormState>(() =>
    blankItemProfile(role),
  );
  const profilesQuery = useManufacturingItemProfilesQuery(
    workspaceId
      ? { workspaceId, role, search: search.trim() || undefined }
      : null,
  );
  const locationsQuery = useManufacturingLocationsQuery(
    workspaceId ? { workspaceId, active: true } : null,
  );
  const createProfile = useCreateManufacturingItemProfileMutation();
  const updateProfile = useUpdateManufacturingItemProfileMutation();
  const profiles = profilesQuery.data ?? [];
  const locations = locationsQuery.data ?? [];
  const assignedItemIds = useMemo(
    () => new Set(profiles.map((profile) => profile.inventoryItemId)),
    [profiles],
  );
  const availableItems = items.filter(
    (item) =>
      !assignedItemIds.has(item.id) || item.id === editing?.inventoryItemId,
  );

  const reset = () => {
    setEditing(null);
    setForm(blankItemProfile(role));
  };

  const beginEdit = (profile: ManufacturingItemProfileRecord) => {
    setEditing(profile);
    setForm({
      inventoryItemId: profile.inventoryItemId,
      role: profile.role,
      makeBuy: profile.makeBuy,
      lotTracked: profile.lotTracked,
      serialTracked: profile.serialTracked,
      expiryTracked: profile.expiryTracked,
      qcRequired: profile.qcRequired,
      shelfLifeDays: profile.shelfLifeDays ? String(profile.shelfLifeDays) : "",
      standardYieldPercent: String(profile.standardYieldPercent),
      defaultIssueLocationId: profile.defaultIssueLocation?.id ?? "",
      defaultReceiptLocationId: profile.defaultReceiptLocation?.id ?? "",
      isActive: profile.isActive,
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !form.inventoryItemId) return;
    const yieldPercent = Number(form.standardYieldPercent);
    if (
      !Number.isFinite(yieldPercent) ||
      yieldPercent <= 0 ||
      yieldPercent > 100
    ) {
      toast.error(
        "Standard yield must be greater than 0 and no more than 100%.",
      );
      return;
    }
    const shelfLifeDays = form.shelfLifeDays
      ? Number(form.shelfLifeDays)
      : null;
    if (form.expiryTracked && (!shelfLifeDays || shelfLifeDays < 1)) {
      toast.error(
        "Shelf-life days are required when expiry tracking is enabled.",
      );
      return;
    }
    const common = {
      workspaceId,
      role: form.role,
      makeBuy: form.makeBuy,
      lotTracked: form.lotTracked,
      serialTracked: form.serialTracked,
      expiryTracked: form.expiryTracked,
      qcRequired: form.qcRequired,
      shelfLifeDays,
      standardYieldPercent: yieldPercent,
      defaultIssueLocationId: form.defaultIssueLocationId || null,
      defaultReceiptLocationId: form.defaultReceiptLocationId || null,
      isActive: form.isActive,
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(
          editing
            ? "Manufacturing item profile updated."
            : "Manufacturing item profile created.",
        );
        reset();
      },
      onError: (error: unknown) =>
        toast.error(
          getErrorMessage(
            error,
            "Manufacturing item profile could not be saved.",
          ),
        ),
    };
    if (editing)
      updateProfile.mutate({ profileId: editing.id, input: common }, callbacks);
    else
      createProfile.mutate(
        { ...common, inventoryItemId: form.inventoryItemId },
        callbacks,
      );
  };

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-xl border border-[#d6e1ef] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2478df]">
            <Boxes className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#172b49]">{title}</h2>
            <p className="text-[11px] text-[#718096]">
              Classify live inventory items for manufacturing, traceability, QC
              and default logical locations.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[#cfe0f4] bg-[#f1f7ff] px-3 py-1 text-[10px] font-semibold text-[#2563eb]">
          {profiles.length} configured
        </span>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 2xl:grid-cols-[390px_minmax(0,1fr)]">
        <form
          onSubmit={submit}
          className="h-fit overflow-hidden rounded-xl border border-[#dce5ef] bg-[#fbfcfe]"
        >
          <div className="flex items-center justify-between gap-2 border-b border-[#e5ebf3] bg-white px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                {editing ? "Edit profile" : "Add profile"}
              </h3>
              <p className="text-[10px] text-[#718096]">
                Create the inventory product first, then classify it here.
              </p>
            </div>
            {editing ? (
              <Button type="button" size="sm" variant="ghost" onClick={reset}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            ) : onCreateInventoryItem ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={onCreateInventoryItem}
              >
                <Plus className="h-3.5 w-3.5" />
                Create product
              </Button>
            ) : null}
          </div>
          <div className="space-y-3 p-4">
            <Field label="Inventory item">
              <select
                required
                disabled={Boolean(editing)}
                value={form.inventoryItemId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    inventoryItemId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Select an existing inventory item…</option>
                {availableItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.itemCode} — {item.itemName} ({item.unit})
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Manufacturing role">
                <select
                  disabled
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value as ManufacturingItemRole,
                    }))
                  }
                  className={selectClass}
                >
                  {allItemRoles.map((value) => (
                    <option key={value} value={value}>
                      {itemRoleLabels[value]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Make / buy">
                <select
                  value={form.makeBuy}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      makeBuy: event.target
                        .value as ItemProfileFormState["makeBuy"],
                    }))
                  }
                  className={selectClass}
                >
                  <option value="MAKE">Make</option>
                  <option value="BUY">Buy</option>
                  <option value="BOTH">Make and buy</option>
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <CheckboxField
                checked={form.lotTracked}
                onChange={(value) =>
                  setForm((current) => ({ ...current, lotTracked: value }))
                }
                label="Lot tracked"
                description="Require material or product lot traceability."
              />
              <CheckboxField
                checked={form.serialTracked}
                onChange={(value) =>
                  setForm((current) => ({ ...current, serialTracked: value }))
                }
                label="Serial tracked"
                description="Require unit-level serial traceability."
              />
              <CheckboxField
                checked={form.expiryTracked}
                onChange={(value) =>
                  setForm((current) => ({ ...current, expiryTracked: value }))
                }
                label="Expiry tracked"
                description="Track expiry and shelf-life controls."
              />
              <CheckboxField
                checked={form.qcRequired}
                onChange={(value) =>
                  setForm((current) => ({ ...current, qcRequired: value }))
                }
                label="QC required"
                description="Require quality control before release."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Standard yield %">
                <Input
                  required
                  min="0.000001"
                  max="100"
                  step="0.000001"
                  type="number"
                  value={form.standardYieldPercent}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      standardYieldPercent: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field
                label="Shelf-life days"
                hint={form.expiryTracked ? "Required" : "Optional"}
              >
                <Input
                  disabled={!form.expiryTracked}
                  min="1"
                  step="1"
                  type="number"
                  value={form.shelfLifeDays}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      shelfLifeDays: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Default issue location">
              <select
                value={form.defaultIssueLocationId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultIssueLocationId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">No default selected</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.warehouseCode} / {location.code} — {location.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Default receipt location">
              <select
                value={form.defaultReceiptLocationId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    defaultReceiptLocationId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">No default selected</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.warehouseCode} / {location.code} — {location.name}
                  </option>
                ))}
              </select>
            </Field>
            <CheckboxField
              checked={form.isActive}
              onChange={(value) =>
                setForm((current) => ({ ...current, isActive: value }))
              }
              label="Active profile"
              description="Only active profiles are usable in planning and execution."
            />
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={
                createProfile.isPending ||
                updateProfile.isPending ||
                !form.inventoryItemId
              }
            >
              <Save className="h-3.5 w-3.5" />
              {editing
                ? "Save profile changes"
                : "Create manufacturing profile"}
            </Button>
          </div>
        </form>
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-[#dce5ef]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-3 py-2.5">
            <div className="relative min-w-[220px] flex-1">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search item code or name…"
                className={inputClass}
              />
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void profilesQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
          {profilesQuery.isError ? (
            <div className="p-3">
              <QueryError
                message={getErrorMessage(
                  profilesQuery.error,
                  "Item profiles could not be loaded.",
                )}
                onRetry={() => void profilesQuery.refetch()}
              />
            </div>
          ) : profilesQuery.isLoading ? (
            <LoadingPanel label="Loading manufacturing profiles…" />
          ) : profiles.length ? (
            <div className="min-w-0 overflow-auto">
              <table className="w-full min-w-[850px] border-collapse text-left text-[11px]">
                <thead className="sticky top-0 bg-[#f3f7fc] text-[9px] uppercase tracking-wide text-[#718096]">
                  <tr>
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5">Make / buy</th>
                    <th className="px-3 py-2.5">Controls</th>
                    <th className="px-3 py-2.5">Issue location</th>
                    <th className="px-3 py-2.5">Receipt location</th>
                    <th className="px-3 py-2.5">Yield</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr
                      key={profile.id}
                      className="border-t border-[#e5ebf3] hover:bg-[#f9fbfe]"
                    >
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#263b59]">
                          {profile.itemName ?? "Unnamed item"}
                        </div>
                        <div className="mt-0.5 font-mono text-[9px] text-[#8290a4]">
                          {profile.itemCode ?? profile.inventoryItemId} ·{" "}
                          {profile.unit ?? "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill
                          value={profile.makeBuy}
                          label={profile.makeBuy.replaceAll("_", " ")}
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {profile.lotTracked ? (
                            <span className="rounded bg-[#eef4fb] px-1.5 py-0.5">
                              Lot
                            </span>
                          ) : null}
                          {profile.serialTracked ? (
                            <span className="rounded bg-[#eef4fb] px-1.5 py-0.5">
                              Serial
                            </span>
                          ) : null}
                          {profile.expiryTracked ? (
                            <span className="rounded bg-[#eef4fb] px-1.5 py-0.5">
                              Expiry
                            </span>
                          ) : null}
                          {profile.qcRequired ? (
                            <span className="rounded bg-[#fff4e5] px-1.5 py-0.5 text-[#9a5b0a]">
                              QC
                            </span>
                          ) : null}
                          {!profile.lotTracked &&
                          !profile.serialTracked &&
                          !profile.expiryTracked &&
                          !profile.qcRequired
                            ? "—"
                            : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#52647d]">
                        {profile.defaultIssueLocation
                          ? `${profile.defaultIssueLocation.code} — ${profile.defaultIssueLocation.name}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-[#52647d]">
                        {profile.defaultReceiptLocation
                          ? `${profile.defaultReceiptLocation.code} — ${profile.defaultReceiptLocation.name}`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {formatQuantity(profile.standardYieldPercent)}%
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill
                          value={profile.isActive ? "READY" : "CANCELLED"}
                          label={profile.isActive ? "Active" : "Inactive"}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => beginEdit(profile)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyRegister
              icon={Boxes}
              title={`No ${itemRoleLabels[role].toLowerCase()} profiles yet`}
              description="Select an existing live inventory item and configure its manufacturing controls. No demo records are created."
            />
          )}
        </div>
      </div>
    </div>
  );
}

type LocationFormState = {
  warehouseId: string;
  code: string;
  name: string;
  disposition: ManufacturingLocationDisposition;
  description: string;
  isActive: boolean;
};
const blankLocation: LocationFormState = {
  warehouseId: "",
  code: "",
  name: "",
  disposition: "RELEASED",
  description: "",
  isActive: true,
};

export function ManufacturingLocationsWorkspace({
  workspaceId,
  warehouses,
}: {
  workspaceId?: string;
  warehouses: WarehouseRecord[];
}) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<ManufacturingLocationRecord | null>(
    null,
  );
  const [form, setForm] = useState<LocationFormState>(blankLocation);
  const locationsQuery = useManufacturingLocationsQuery(
    workspaceId ? { workspaceId, search: search.trim() || undefined } : null,
  );
  const createLocation = useCreateManufacturingLocationMutation();
  const updateLocation = useUpdateManufacturingLocationMutation();
  const locations = locationsQuery.data ?? [];
  const reset = () => {
    setEditing(null);
    setForm(blankLocation);
  };
  const beginEdit = (location: ManufacturingLocationRecord) => {
    setEditing(location);
    setForm({
      warehouseId: location.warehouseId,
      code: location.code,
      name: location.name,
      disposition: location.disposition,
      description: location.description ?? "",
      isActive: location.isActive,
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !workspaceId ||
      !form.warehouseId ||
      !form.code.trim() ||
      !form.name.trim()
    )
      return;
    const input = {
      workspaceId,
      code: form.code.trim(),
      name: form.name.trim(),
      disposition: form.disposition,
      description: form.description.trim() || null,
      isActive: form.isActive,
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(
          editing ? "Logical location updated." : "Logical location created.",
        );
        reset();
      },
      onError: (error: unknown) =>
        toast.error(
          getErrorMessage(error, "Logical location could not be saved."),
        ),
    };
    if (editing)
      updateLocation.mutate({ locationId: editing.id, input }, callbacks);
    else
      createLocation.mutate(
        { ...input, warehouseId: form.warehouseId },
        callbacks,
      );
  };
  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-xl border border-[#d6e1ef] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2478df]">
            <MapPin className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#172b49]">
              Manufacturing logical locations
            </h2>
            <p className="text-[11px] text-[#718096]">
              Create controlled locations inside existing warehouses for
              release, reservation, staging, WIP, QC, rework and scrap.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[#cfe0f4] bg-[#f1f7ff] px-3 py-1 text-[10px] font-semibold text-[#2563eb]">
          {locations.length} locations
        </span>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 2xl:grid-cols-[360px_minmax(0,1fr)]">
        <form
          onSubmit={submit}
          className="h-fit overflow-hidden rounded-xl border border-[#dce5ef] bg-[#fbfcfe]"
        >
          <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-white px-4 py-3">
            <h3 className="text-sm font-semibold text-[#203651]">
              {editing ? "Edit location" : "Add logical location"}
            </h3>
            {editing ? (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
            ) : null}
          </div>
          <div className="space-y-3 p-4">
            <Field label="Warehouse">
              <select
                required
                disabled={Boolean(editing)}
                value={form.warehouseId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    warehouseId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Select an existing warehouse…</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} — {warehouse.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Location code">
                <Input
                  required
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="e.g. RM-REL"
                />
              </Field>
              <Field label="Name">
                <Input
                  required
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="Location name"
                />
              </Field>
            </div>
            <Field label="Stock disposition">
              <select
                value={form.disposition}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    disposition: event.target
                      .value as ManufacturingLocationDisposition,
                  }))
                }
                className={selectClass}
              >
                {allLocationDispositions.map((value) => (
                  <option key={value} value={value}>
                    {locationDispositionLabels[value]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description">
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                className={textareaClass}
                placeholder="Purpose and control notes"
              />
            </Field>
            <CheckboxField
              checked={form.isActive}
              onChange={(value) =>
                setForm((current) => ({ ...current, isActive: value }))
              }
              label="Active location"
              description="Active locations can be selected in manufacturing transactions."
            />
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={
                createLocation.isPending ||
                updateLocation.isPending ||
                !form.warehouseId
              }
            >
              <Save className="h-3.5 w-3.5" />
              {editing ? "Save location changes" : "Create logical location"}
            </Button>
          </div>
        </form>
        <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-[#dce5ef]">
          <div className="flex items-center gap-2 border-b border-[#e5ebf3] bg-[#f7faff] p-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search location, code or warehouse…"
              className={inputClass}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void locationsQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          {locationsQuery.isError ? (
            <div className="p-3">
              <QueryError
                message={getErrorMessage(
                  locationsQuery.error,
                  "Logical locations could not be loaded.",
                )}
                onRetry={() => void locationsQuery.refetch()}
              />
            </div>
          ) : locationsQuery.isLoading ? (
            <LoadingPanel label="Loading logical locations…" />
          ) : locations.length ? (
            <div className="overflow-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[11px]">
                <thead className="bg-[#f3f7fc] text-[9px] uppercase tracking-wide text-[#718096]">
                  <tr>
                    <th className="px-3 py-2.5">Warehouse</th>
                    <th className="px-3 py-2.5">Location</th>
                    <th className="px-3 py-2.5">Disposition</th>
                    <th className="px-3 py-2.5">Description</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((location) => (
                    <tr
                      key={location.id}
                      className="border-t border-[#e5ebf3] hover:bg-[#f9fbfe]"
                    >
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#334155]">
                          {location.warehouseName ?? "—"}
                        </div>
                        <div className="font-mono text-[9px] text-[#8290a4]">
                          {location.warehouseCode ?? location.warehouseId}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#334155]">
                          {location.name}
                        </div>
                        <div className="font-mono text-[9px] text-[#8290a4]">
                          {location.code}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill
                          value={location.disposition}
                          label={
                            locationDispositionLabels[location.disposition]
                          }
                        />
                      </td>
                      <td className="max-w-[280px] px-3 py-3 text-[#60718a]">
                        {location.description ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill
                          value={location.isActive ? "READY" : "CANCELLED"}
                          label={location.isActive ? "Active" : "Inactive"}
                        />
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => beginEdit(location)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyRegister
              icon={MapPin}
              title="No manufacturing logical locations yet"
              description="Create locations inside a real warehouse. This screen does not create warehouse or stock records."
            />
          )}
        </div>
      </div>
    </div>
  );
}

type RoutingOperationForm = {
  sequence: string;
  code: string;
  name: string;
  workCenterCode: string;
  productionLineCode: string;
  setupMinutes: string;
  runMinutesPerUnit: string;
  queueMinutes: string;
  isSubcontracted: boolean;
  qcRequired: boolean;
  instructions: string;
  responsibleUserId: string;
};

function blankRoutingOperation(sequence: number): RoutingOperationForm {
  return {
    sequence: String(sequence),
    code: "",
    name: "",
    workCenterCode: "",
    productionLineCode: "",
    setupMinutes: "0",
    runMinutesPerUnit: "0",
    queueMinutes: "0",
    isSubcontracted: false,
    qcRequired: false,
    instructions: "",
    responsibleUserId: "",
  };
}

export function ManufacturingRoutingWorkspace({
  workspaceId,
}: {
  workspaceId?: string;
}) {
  const profilesQuery = useManufacturingItemProfilesQuery(
    workspaceId ? { workspaceId, active: true } : null,
  );
  const routingsQuery = useManufacturingRoutingsQuery(
    workspaceId ? { workspaceId, active: "all" } : null,
  );
  const assigneesQuery = useManufacturingRoutingAssigneesQuery(workspaceId);
  const createRouting = useCreateManufacturingRoutingMutation();
  const createVersion = useCreateManufacturingRoutingVersionMutation();
  const approveVersion = useApproveManufacturingRoutingVersionMutation();
  const [routingForm, setRoutingForm] = useState({
    code: "",
    name: "",
    finishedProductId: "",
    description: "",
  });
  const [selectedRoutingId, setSelectedRoutingId] = useState("");
  const [versionForm, setVersionForm] = useState({
    versionNumber: "",
    effectiveFrom: "",
    effectiveTo: "",
    changeReason: "",
  });
  const [operations, setOperations] = useState<RoutingOperationForm[]>([
    blankRoutingOperation(10),
  ]);
  const profiles = (profilesQuery.data ?? []).filter(
    (profile) =>
      profile.role === "FINISHED_GOOD" ||
      profile.role === "INTERMEDIATE" ||
      profile.role === "BULK",
  );
  const routings = routingsQuery.data ?? [];
  const assignees = assigneesQuery.data ?? [];
  const selectedRouting =
    routings.find((routing) => routing.id === selectedRoutingId) ??
    routings[0] ??
    null;

  useEffect(() => {
    if (!selectedRoutingId && routings.length)
      setSelectedRoutingId(routings[0].id);
  }, [routings, selectedRoutingId]);

  const updateOperation = <K extends keyof RoutingOperationForm>(
    index: number,
    key: K,
    value: RoutingOperationForm[K],
  ) => {
    setOperations((current) =>
      current.map((operation, operationIndex) =>
        operationIndex === index ? { ...operation, [key]: value } : operation,
      ),
    );
  };

  const submitRouting = (event: FormEvent) => {
    event.preventDefault();
    if (
      !workspaceId ||
      !routingForm.name.trim() ||
      !routingForm.finishedProductId
    )
      return;
    createRouting.mutate(
      {
        workspaceId,
        code: routingForm.code.trim() || undefined,
        name: routingForm.name.trim(),
        finishedProductId: routingForm.finishedProductId,
        description: routingForm.description.trim() || null,
      },
      {
        onSuccess: (routing) => {
          toast.success(
            "Production routing created. Add its first controlled version next.",
          );
          setSelectedRoutingId(routing.id);
          setRoutingForm({
            code: "",
            name: "",
            finishedProductId: "",
            description: "",
          });
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Production routing could not be created."),
          ),
      },
    );
  };

  const submitVersion = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !selectedRouting) return;
    const seenSequences = new Set<number>();
    const seenCodes = new Set<string>();
    const parsedOperations: ManufacturingRoutingOperationInput[] = [];
    for (const operation of operations) {
      const sequence = Number(operation.sequence);
      const code = operation.code.trim().toUpperCase();
      const name = operation.name.trim();
      if (!operation.responsibleUserId) {
        toast.error(
          `Select a responsible person for operation ${code || operation.sequence}.`,
        );
        return;
      }
      const setupMinutes = Number(operation.setupMinutes || 0);
      const runMinutesPerUnit = Number(operation.runMinutesPerUnit || 0);
      const queueMinutes = Number(operation.queueMinutes || 0);
      if (!Number.isInteger(sequence) || sequence < 1 || !code || !name) {
        toast.error(
          "Each operation requires a positive sequence, code and name.",
        );
        return;
      }
      if (seenSequences.has(sequence) || seenCodes.has(code)) {
        toast.error(
          "Operation sequence and code must be unique within a routing version.",
        );
        return;
      }
      if (
        [setupMinutes, runMinutesPerUnit, queueMinutes].some(
          (value) => !Number.isFinite(value) || value < 0,
        )
      ) {
        toast.error("Operation time values cannot be negative.");
        return;
      }
      seenSequences.add(sequence);
      seenCodes.add(code);
      parsedOperations.push({
        sequence,
        code,
        name,
        workCenterCode: operation.workCenterCode.trim() || null,
        productionLineCode: operation.productionLineCode.trim() || null,
        setupMinutes,
        runMinutesPerUnit,
        queueMinutes,
        isSubcontracted: operation.isSubcontracted,
        qcRequired: operation.qcRequired,
        instructions: operation.instructions.trim() || null,
        responsibleUserId: operation.responsibleUserId,
      });
    }
    if (
      versionForm.effectiveFrom &&
      versionForm.effectiveTo &&
      versionForm.effectiveFrom > versionForm.effectiveTo
    ) {
      toast.error("Effective-to date cannot be before effective-from date.");
      return;
    }
    createVersion.mutate(
      {
        routingId: selectedRouting.id,
        input: {
          workspaceId,
          versionNumber: versionForm.versionNumber
            ? Number(versionForm.versionNumber)
            : undefined,
          effectiveFrom: versionForm.effectiveFrom || null,
          effectiveTo: versionForm.effectiveTo || null,
          changeReason: versionForm.changeReason.trim() || null,
          operations: parsedOperations.sort((a, b) => a.sequence - b.sequence),
        },
      },
      {
        onSuccess: () => {
          toast.success("Draft routing version created.");
          setVersionForm({
            versionNumber: "",
            effectiveFrom: "",
            effectiveTo: "",
            changeReason: "",
          });
          setOperations([blankRoutingOperation(10)]);
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Routing version could not be created."),
          ),
      },
    );
  };

  const approve = (versionId: string) => {
    if (!workspaceId) return;
    const version = selectedRouting?.versions.find(
      (candidate) => candidate.id === versionId,
    );
    const unassigned =
      version?.operations.filter(
        (operation) => (operation.resourceRequirements ?? []).length === 0,
      ) ?? [];
    if (unassigned.length) {
      toast.error(
        `Assign resources to every operation first. Missing: ${unassigned.map((operation) => operation.code).join(", ")}.`,
      );
      return;
    }
    const signatureMeaning = window.prompt(
      "Enter the exact configured signature meaning for the next routing approval stage.",
    );
    if (signatureMeaning === null) return;
    const reauthenticationPassword = window.prompt(
      "Enter your current password if the approved electronic-signature policy requires reauthentication. Leave blank only when the policy does not require it.",
    );
    if (reauthenticationPassword === null) return;
    approveVersion.mutate(
      {
        versionId,
        input: {
          workspaceId,
          transactionDate: todayIso(),
          idempotencyKey: makeIdempotencyKey(`approve-routing-${versionId}`),
          signatureMeaning: signatureMeaning.trim() || undefined,
          reauthenticationPassword: reauthenticationPassword || undefined,
        },
      },
      {
        onSuccess: (result) =>
          toast.success(
            result.approvalProgress && !result.approvalProgress.complete
              ? `Routing approval stage ${result.approvalProgress.completedStages} of ${result.approvalProgress.totalStages} recorded. Next-stage approval is pending.`
              : "Routing version approved and available for production planning.",
          ),
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Routing version could not be approved."),
          ),
      },
    );
  };

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-[560px] flex-1 flex-col overflow-hidden rounded-xl border border-[#d6e1ef] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2478df]">
            <Route className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#172b49]">
              Production routing and operations
            </h2>
            <p className="text-[11px] text-[#718096]">
              Create a route, version its day-to-day operations, then approve
              the exact version used by a plan.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[#cfe0f4] bg-[#f1f7ff] px-3 py-1 text-[10px] font-semibold text-[#2563eb]">
          {routings.length} routes
        </span>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="space-y-3">
          <form
            onSubmit={submitRouting}
            className="overflow-hidden rounded-xl border border-[#dce5ef] bg-[#fbfcfe]"
          >
            <div className="border-b border-[#e5ebf3] bg-white px-4 py-3">
              <h3 className="text-sm font-semibold text-[#203651]">
                Create route header
              </h3>
              <p className="text-[10px] text-[#718096]">
                Select a configured make item; no product is generated here.
              </p>
            </div>
            <div className="space-y-3 p-4">
              <Field label="Finished product">
                <select
                  required
                  value={routingForm.finishedProductId}
                  onChange={(event) =>
                    setRoutingForm((current) => ({
                      ...current,
                      finishedProductId: event.target.value,
                    }))
                  }
                  className={selectClass}
                >
                  <option value="">Select a manufacturing item profile…</option>
                  {profiles.map((profile) => (
                    <option
                      key={profile.inventoryItemId}
                      value={profile.inventoryItemId}
                    >
                      {profile.itemCode} — {profile.itemName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Routing name">
                <Input
                  required
                  value={routingForm.name}
                  onChange={(event) =>
                    setRoutingForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="Controlled route name"
                />
              </Field>
              <Field
                label="Routing code"
                hint="Optional; generated by the API when blank"
              >
                <Input
                  value={routingForm.code}
                  onChange={(event) =>
                    setRoutingForm((current) => ({
                      ...current,
                      code: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={routingForm.description}
                  onChange={(event) =>
                    setRoutingForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  className={textareaClass}
                />
              </Field>
              <Button
                type="submit"
                size="sm"
                className="w-full"
                disabled={
                  createRouting.isPending || !routingForm.finishedProductId
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Create route
              </Button>
            </div>
          </form>
          <div className="overflow-hidden rounded-xl border border-[#dce5ef]">
            <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-3 py-2.5 text-xs font-semibold text-[#334155]">
              Routing register
            </div>
            {routingsQuery.isLoading ? (
              <LoadingPanel label="Loading routings…" />
            ) : routingsQuery.isError ? (
              <div className="p-3">
                <QueryError
                  message={getErrorMessage(
                    routingsQuery.error,
                    "Routings could not be loaded.",
                  )}
                  onRetry={() => void routingsQuery.refetch()}
                />
              </div>
            ) : routings.length ? (
              <div className="max-h-[340px] overflow-y-auto p-2">
                {routings.map((routing) => (
                  <button
                    key={routing.id}
                    type="button"
                    onClick={() => setSelectedRoutingId(routing.id)}
                    className={`mb-1.5 w-full rounded-lg border px-3 py-2.5 text-left last:mb-0 ${selectedRouting?.id === routing.id ? "border-[#8dbbf2] bg-[#eff6ff]" : "border-[#e3e9f1] bg-white hover:bg-[#f8fafc]"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#263b59]">
                        {routing.name}
                      </span>
                      <span className="text-[9px] text-[#718096]">
                        {routing.versions.length} version
                        {routing.versions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[9px] text-[#8290a4]">
                      {routing.code} ·{" "}
                      {routing.finishedProduct?.itemCode ??
                        routing.finishedProductId}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center text-[11px] text-[#718096]">
                No real routing has been created yet.
              </div>
            )}
          </div>
        </div>
        {selectedRouting ? (
          <div className="min-w-0 space-y-3">
            <form
              onSubmit={submitVersion}
              className="overflow-hidden rounded-xl border border-[#dce5ef]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#203651]">
                    New version · {selectedRouting.name}
                  </h3>
                  <p className="text-[10px] text-[#718096]">
                    Operations are executed in sequence. Work-center and
                    production-line codes remain explicit until dedicated
                    masters are available.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setOperations((current) => [
                      ...current,
                      blankRoutingOperation((current.length + 1) * 10),
                    ])
                  }
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add operation
                </Button>
              </div>
              <div className="grid gap-3 border-b border-[#e5ebf3] p-4 md:grid-cols-4">
                <Field label="Version" hint="Optional">
                  <Input
                    min="1"
                    step="1"
                    type="number"
                    value={versionForm.versionNumber}
                    onChange={(event) =>
                      setVersionForm((current) => ({
                        ...current,
                        versionNumber: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
                <Field label="Effective from">
                  <AppDateInput
                    aria-label="Effective from"
                    value={versionForm.effectiveFrom}
                    onChange={(value) =>
                      setVersionForm((current) => ({
                        ...current,
                        effectiveFrom: value,
                      }))
                    }
                    inputClassName={inputClass}
                  />
                </Field>
                <Field label="Effective to">
                  <AppDateInput
                    aria-label="Effective to"
                    value={versionForm.effectiveTo}
                    onChange={(value) =>
                      setVersionForm((current) => ({
                        ...current,
                        effectiveTo: value,
                      }))
                    }
                    inputClassName={inputClass}
                  />
                </Field>
                <Field label="Change reason">
                  <Input
                    value={versionForm.changeReason}
                    onChange={(event) =>
                      setVersionForm((current) => ({
                        ...current,
                        changeReason: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </Field>
              </div>
              <div className="space-y-2 p-3">
                {operations.map((operation, index) => (
                  <div
                    key={index}
                    className="rounded-lg border border-[#e1e8f1] bg-[#fbfcfe] p-3"
                  >
                    <div className="grid gap-2 xl:grid-cols-[74px_120px_minmax(150px,1fr)_150px_150px_95px_95px_95px_36px]">
                      <Input
                        required
                        min="1"
                        step="1"
                        type="number"
                        value={operation.sequence}
                        onChange={(event) =>
                          updateOperation(index, "sequence", event.target.value)
                        }
                        className={inputClass}
                        title="Sequence"
                      />
                      <Input
                        required
                        value={operation.code}
                        onChange={(event) =>
                          updateOperation(index, "code", event.target.value)
                        }
                        className={inputClass}
                        placeholder="Code"
                      />
                      <Input
                        required
                        value={operation.name}
                        onChange={(event) =>
                          updateOperation(index, "name", event.target.value)
                        }
                        className={inputClass}
                        placeholder="Operation name"
                      />
                      <Input
                        value={operation.workCenterCode}
                        onChange={(event) =>
                          updateOperation(
                            index,
                            "workCenterCode",
                            event.target.value,
                          )
                        }
                        className={inputClass}
                        placeholder="Work center"
                      />
                      <Input
                        value={operation.productionLineCode}
                        onChange={(event) =>
                          updateOperation(
                            index,
                            "productionLineCode",
                            event.target.value,
                          )
                        }
                        className={inputClass}
                        placeholder="Production line"
                      />
                      <Input
                        min="0"
                        step="0.01"
                        type="number"
                        value={operation.setupMinutes}
                        onChange={(event) =>
                          updateOperation(
                            index,
                            "setupMinutes",
                            event.target.value,
                          )
                        }
                        className={inputClass}
                        title="Setup minutes"
                      />
                      <Input
                        min="0"
                        step="0.01"
                        type="number"
                        value={operation.runMinutesPerUnit}
                        onChange={(event) =>
                          updateOperation(
                            index,
                            "runMinutesPerUnit",
                            event.target.value,
                          )
                        }
                        className={inputClass}
                        title="Run minutes per unit"
                      />
                      <Input
                        min="0"
                        step="0.01"
                        type="number"
                        value={operation.queueMinutes}
                        onChange={(event) =>
                          updateOperation(
                            index,
                            "queueMinutes",
                            event.target.value,
                          )
                        }
                        className={inputClass}
                        title="Queue minutes"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={operations.length === 1}
                        onClick={() =>
                          setOperations((current) =>
                            current.filter(
                              (_, operationIndex) => operationIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-[150px_150px_minmax(220px,1fr)_minmax(0,1fr)]">
                      <label className="flex items-center gap-2 text-[10px] text-[#52647d]">
                        <input
                          type="checkbox"
                          checked={operation.qcRequired}
                          onChange={(event) =>
                            updateOperation(
                              index,
                              "qcRequired",
                              event.target.checked,
                            )
                          }
                        />
                        QC required
                      </label>
                      <label className="flex items-center gap-2 text-[10px] text-[#52647d]">
                        <input
                          type="checkbox"
                          checked={operation.isSubcontracted}
                          onChange={(event) =>
                            updateOperation(
                              index,
                              "isSubcontracted",
                              event.target.checked,
                            )
                          }
                        />
                        Subcontracted
                      </label>
                      <select
                        required
                        value={operation.responsibleUserId}
                        onChange={(event) =>
                          updateOperation(
                            index,
                            "responsibleUserId",
                            event.target.value,
                          )
                        }
                        className={selectClass}
                        aria-label="Responsible person"
                      >
                        <option value="">Responsible person…</option>
                        {assignees.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.name} — {user.email}
                          </option>
                        ))}
                      </select>
                      <Input
                        value={operation.instructions}
                        onChange={(event) =>
                          updateOperation(
                            index,
                            "instructions",
                            event.target.value,
                          )
                        }
                        className={inputClass}
                        placeholder="Operation instructions"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-3">
                <Button
                  type="submit"
                  size="sm"
                  disabled={createVersion.isPending}
                >
                  <Save className="h-3.5 w-3.5" />
                  Create draft version
                </Button>
              </div>
            </form>
            <div className="overflow-hidden rounded-xl border border-[#dce5ef]">
              <div className="border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3 text-sm font-semibold text-[#203651]">
                Version history and approval
              </div>
              {selectedRouting.versions.length ? (
                <div className="max-h-[330px] overflow-auto">
                  <table className="w-full min-w-[760px] border-collapse text-left text-[11px]">
                    <thead className="bg-[#f3f7fc] text-[9px] uppercase text-[#718096]">
                      <tr>
                        <th className="px-3 py-2">Version</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Effective period</th>
                        <th className="px-3 py-2">Operations</th>
                        <th className="px-3 py-2">Approval</th>
                        <th className="px-3 py-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRouting.versions.map((version) => (
                        <tr
                          key={version.id}
                          className="border-t border-[#e5ebf3]"
                        >
                          <td className="px-3 py-3 font-semibold">
                            v{version.versionNumber}
                          </td>
                          <td className="px-3 py-3">
                            <StatusPill
                              value={version.status}
                              label={version.status}
                            />
                          </td>
                          <td className="px-3 py-3 text-[#60718a]">
                            {version.effectiveFrom
                              ? formatDate(version.effectiveFrom)
                              : "Open"}{" "}
                            →{" "}
                            {version.effectiveTo
                              ? formatDate(version.effectiveTo)
                              : "Open"}
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex flex-wrap gap-1">
                              {version.operations.map((operation) => (
                                <span
                                  key={operation.id}
                                  className="rounded-full border border-[#dbe4ef] bg-white px-2 py-1 text-[9px]"
                                >
                                  {operation.sequence}. {operation.name}
                                  {operation.qcRequired ? " · QC" : ""}
                                  {operation.responsibleUserId
                                    ? ` · ${assignees.find((user) => user.id === operation.responsibleUserId)?.name ?? "Assigned user"}`
                                    : ""}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-3 py-3 text-[#60718a]">
                            {version.approvedAt
                              ? `${version.approvedBy?.name ?? "Approved"} · ${formatDateTime(version.approvedAt)}`
                              : "—"}
                          </td>
                          <td className="px-3 py-3 text-right">
                            {version.status === "DRAFT" ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => approve(version.id)}
                                disabled={approveVersion.isPending}
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-5 text-center text-xs text-[#718096]">
                  Create the first routing version above.
                </div>
              )}
            </div>
            <ManufacturingRoutingResourceRequirements
              workspaceId={workspaceId}
              routingName={selectedRouting.name}
              versions={selectedRouting.versions}
            />
          </div>
        ) : (
          <EmptyRegister
            icon={Route}
            title="Create a production route first"
            description="A real finished-product profile is required before routing operations can be versioned and approved."
          />
        )}
      </div>
    </div>
  );
}

type PlanLotForm = {
  lotNumber: string;
  sequence: string;
  plannedQuantity: string;
  plannedStartDate: string;
  plannedEndDate: string;
  notes: string;
};

function blankPlanLot(sequence: number): PlanLotForm {
  return {
    lotNumber: "",
    sequence: String(sequence),
    plannedQuantity: "",
    plannedStartDate: "",
    plannedEndDate: "",
    notes: "",
  };
}

export function ManufacturingPlanWorkspace({
  workspaceId,
  onOpenMrp,
}: {
  workspaceId?: string;
  onOpenMrp: (planId: string) => void;
}) {
  const bomsQuery = useManufacturingBomsQuery(
    workspaceId ? { workspaceId, activeOnly: true } : null,
  );
  const routingsQuery = useManufacturingRoutingsQuery(
    workspaceId ? { workspaceId, active: true } : null,
  );
  const plansQuery = useManufacturingPlansQuery(
    workspaceId ? { workspaceId } : null,
  );
  const createPlan = useCreateManufacturingPlanMutation();
  const approvePlan = useApproveManufacturingPlanMutation();
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState(() =>
    makeIdempotencyKey("create-production-plan"),
  );
  const [form, setForm] = useState({
    bomVersionId: "",
    routingVersionId: "",
    plannedQuantity: "",
    plannedStartDate: "",
    plannedEndDate: "",
    notes: "",
  });
  const [lots, setLots] = useState<PlanLotForm[]>([blankPlanLot(1)]);
  const [expandedPlanId, setExpandedPlanId] = useState("");
  const boms = bomsQuery.data ?? [];
  const routings = routingsQuery.data ?? [];
  const plans = plansQuery.data ?? [];
  const approvedBomOptions = useMemo(
    () =>
      boms.flatMap((bom) =>
        bom.versions
          .filter((version) => version.status === "APPROVED")
          .map((version) => ({ bom, version })),
      ),
    [boms],
  );
  const selectedBom =
    approvedBomOptions.find(
      (option) => option.version.id === form.bomVersionId,
    ) ?? null;
  const approvedRoutingOptions = useMemo(() => {
    if (!selectedBom) return [];
    return routings
      .filter(
        (routing) =>
          routing.finishedProductId === selectedBom.bom.finishedProductId,
      )
      .flatMap((routing) =>
        routing.versions
          .filter((version) => version.status === "APPROVED")
          .map((version) => ({ routing, version })),
      );
  }, [routings, selectedBom]);
  const lotTotal = lots.reduce(
    (total, lot) => total + (Number(lot.plannedQuantity) || 0),
    0,
  );
  const plannedQuantity = Number(form.plannedQuantity) || 0;
  const quantityBalanced =
    plannedQuantity > 0 && Math.abs(lotTotal - plannedQuantity) < 0.000001;

  const updateLot = <K extends keyof PlanLotForm>(
    index: number,
    key: K,
    value: PlanLotForm[K],
  ) => {
    setLots((current) =>
      current.map((lot, lotIndex) =>
        lotIndex === index ? { ...lot, [key]: value } : lot,
      ),
    );
  };

  const reset = () => {
    setForm({
      bomVersionId: "",
      routingVersionId: "",
      plannedQuantity: "",
      plannedStartDate: "",
      plannedEndDate: "",
      notes: "",
    });
    setLots([blankPlanLot(1)]);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !workspaceId ||
      !selectedBom ||
      !form.plannedStartDate ||
      !form.plannedEndDate
    )
      return;
    if (!Number.isFinite(plannedQuantity) || plannedQuantity <= 0) {
      toast.error("Planned quantity must be greater than zero.");
      return;
    }
    if (form.plannedStartDate > form.plannedEndDate) {
      toast.error("Plan end date cannot be before its start date.");
      return;
    }
    if (!quantityBalanced) {
      toast.error(
        `Lot quantities must equal the planned quantity. Current lot total: ${formatQuantity(lotTotal)}.`,
      );
      return;
    }
    const seenNumbers = new Set<string>();
    const seenSequences = new Set<number>();
    const parsedLots: ManufacturingPlanLotInput[] = [];
    for (const lot of lots) {
      const lotNumber = lot.lotNumber.trim();
      const sequence = Number(lot.sequence);
      const quantity = Number(lot.plannedQuantity);
      if (
        !lotNumber ||
        !Number.isInteger(sequence) ||
        sequence < 1 ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        !lot.plannedStartDate ||
        !lot.plannedEndDate
      ) {
        toast.error(
          "Each day-wise lot needs a number, positive sequence, quantity, start date and end date.",
        );
        return;
      }
      if (
        seenNumbers.has(lotNumber.toUpperCase()) ||
        seenSequences.has(sequence)
      ) {
        toast.error("Lot number and sequence must be unique within the plan.");
        return;
      }
      if (
        lot.plannedStartDate > lot.plannedEndDate ||
        lot.plannedStartDate < form.plannedStartDate ||
        lot.plannedEndDate > form.plannedEndDate
      ) {
        toast.error(
          `Lot ${lotNumber} dates must stay inside the plan date range.`,
        );
        return;
      }
      seenNumbers.add(lotNumber.toUpperCase());
      seenSequences.add(sequence);
      parsedLots.push({
        lotNumber,
        sequence,
        plannedQuantity: quantity,
        plannedStartDate: lot.plannedStartDate,
        plannedEndDate: lot.plannedEndDate,
        notes: lot.notes.trim() || null,
      });
    }
    createPlan.mutate(
      {
        workspaceId,
        idempotencyKey: createIdempotencyKey,
        finishedProductId: selectedBom.bom.finishedProductId,
        bomVersionId: selectedBom.version.id,
        routingVersionId: form.routingVersionId || null,
        plannedQuantity,
        unit: selectedBom.version.outputUnit,
        plannedStartDate: form.plannedStartDate,
        plannedEndDate: form.plannedEndDate,
        notes: form.notes.trim() || null,
        lots: parsedLots.sort((a, b) => a.sequence - b.sequence),
      },
      {
        onSuccess: (plan) => {
          toast.success("Day-wise production plan created as draft.");
          setExpandedPlanId(plan.id);
          setCreateIdempotencyKey(makeIdempotencyKey("create-production-plan"));
          reset();
        },
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Production plan could not be created."),
          ),
      },
    );
  };

  const approve = (plan: ManufacturingPlanRecord) => {
    if (!workspaceId) return;
    const signatureMeaning = window.prompt(
      "Enter the exact configured signature meaning for the next production-plan approval stage.",
    );
    if (signatureMeaning === null) return;
    const reauthenticationPassword = window.prompt(
      "Enter your current password if the approved electronic-signature policy requires reauthentication. Leave blank only when the policy does not require it.",
    );
    if (reauthenticationPassword === null) return;
    approvePlan.mutate(
      {
        planId: plan.id,
        input: {
          workspaceId,
          transactionDate: todayIso(),
          idempotencyKey: makeIdempotencyKey(`approve-plan-${plan.id}`),
          note: "Approved from Manufacturing Control Center",
          signatureMeaning: signatureMeaning.trim() || undefined,
          reauthenticationPassword: reauthenticationPassword || undefined,
        },
      },
      {
        onSuccess: (result) =>
          toast.success(
            result.approvalProgress && !result.approvalProgress.complete
              ? `Plan approval stage ${result.approvalProgress.completedStages} of ${result.approvalProgress.totalStages} recorded. Next-stage approval is pending.`
              : "Production plan approved. Live MRP can now be calculated.",
          ),
        onError: (error) =>
          toast.error(
            getErrorMessage(error, "Production plan could not be approved."),
          ),
      },
    );
  };

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-[580px] flex-1 flex-col overflow-hidden rounded-xl border border-[#d6e1ef] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2478df]">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#172b49]">
              Day-wise production planning
            </h2>
            <p className="text-[11px] text-[#718096]">
              Use approved BOM and routing versions, split any plan quantity
              into exact dated lots, then persist approval.
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[#cfe0f4] bg-[#f1f7ff] px-3 py-1 text-[10px] font-semibold text-[#2563eb]">
          {plans.length} plans
        </span>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 p-4 2xl:grid-cols-[minmax(500px,0.95fr)_minmax(0,1.05fr)]">
        <form
          onSubmit={submit}
          className="h-fit overflow-hidden rounded-xl border border-[#dce5ef] bg-[#fbfcfe]"
        >
          <div className="border-b border-[#e5ebf3] bg-white px-4 py-3">
            <h3 className="text-sm font-semibold text-[#203651]">
              Create production plan
            </h3>
            <p className="text-[10px] text-[#718096]">
              The controlled plan number is allocated on create. Lot identifiers
              are saved exactly as entered.
            </p>
          </div>
          <div className="space-y-3 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Field
                label="Plan number"
                hint="Allocated from the controlled production-plan sequence."
              >
                <Input
                  disabled
                  value=""
                  className={`${inputClass} bg-[#f3f6fa]`}
                  placeholder="Generated on create"
                />
              </Field>
              <Field label="Approved BOM version">
                <select
                  required
                  value={form.bomVersionId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      bomVersionId: event.target.value,
                      routingVersionId: "",
                    }))
                  }
                  className={selectClass}
                >
                  <option value="">Select approved BOM…</option>
                  {approvedBomOptions.map(({ bom, version }) => (
                    <option key={version.id} value={version.id}>
                      {bom.finishedProductCode} · {bom.name} · v
                      {version.versionNumber}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Approved routing version"
                hint={
                  approvedRoutingOptions.length
                    ? "Optional"
                    : "No approved route available for this product"
                }
              >
                <select
                  disabled={!approvedRoutingOptions.length}
                  value={form.routingVersionId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      routingVersionId: event.target.value,
                    }))
                  }
                  className={selectClass}
                >
                  <option value="">No route selected</option>
                  {approvedRoutingOptions.map(({ routing, version }) => (
                    <option key={version.id} value={version.id}>
                      {routing.code} · {routing.name} · v{version.versionNumber}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Planned quantity"
                hint={selectedBom ? selectedBom.version.outputUnit : undefined}
              >
                <Input
                  required
                  min="0.000001"
                  step="0.000001"
                  type="number"
                  value={form.plannedQuantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      plannedQuantity: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>
              <Field label="Plan start">
                <AppDateInput
                  aria-label="Plan start"
                  value={form.plannedStartDate}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      plannedStartDate: value,
                    }))
                  }
                  inputClassName={inputClass}
                />
              </Field>
              <Field label="Plan end">
                <AppDateInput
                  aria-label="Plan end"
                  value={form.plannedEndDate}
                  onChange={(value) =>
                    setForm((current) => ({
                      ...current,
                      plannedEndDate: value,
                    }))
                  }
                  inputClassName={inputClass}
                />
              </Field>
            </div>
            <Field label="Plan notes">
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
                className={textareaClass}
                placeholder="Planning assumptions, campaign reference or control note"
              />
            </Field>
            <div className="overflow-hidden rounded-lg border border-[#dce5ef] bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e5ebf3] bg-[#f7faff] px-3 py-2.5">
                <div>
                  <h4 className="text-xs font-semibold text-[#334155]">
                    Day-wise lots
                  </h4>
                  <p className="text-[9px] text-[#718096]">
                    Any split is accepted when lot quantities exactly equal the
                    plan quantity.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] font-semibold ${quantityBalanced ? "bg-[#e8f7ef] text-[#08783d]" : "bg-[#fff4e5] text-[#9a5b0a]"}`}
                  >
                    {formatQuantity(lotTotal)} /{" "}
                    {plannedQuantity ? formatQuantity(plannedQuantity) : "—"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setLots((current) => [
                        ...current,
                        blankPlanLot(current.length + 1),
                      ])
                    }
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add lot
                  </Button>
                </div>
              </div>
              <div className="space-y-2 p-3">
                {lots.map((lot, index) => (
                  <div
                    key={index}
                    className="grid gap-2 rounded-lg border border-[#e5ebf3] bg-[#fbfcfe] p-2 md:grid-cols-[54px_minmax(120px,1fr)_110px_145px_145px_36px]"
                  >
                    <Input
                      required
                      min="1"
                      step="1"
                      type="number"
                      value={lot.sequence}
                      onChange={(event) =>
                        updateLot(index, "sequence", event.target.value)
                      }
                      className={inputClass}
                      title="Sequence"
                    />
                    <Input
                      required
                      value={lot.lotNumber}
                      onChange={(event) =>
                        updateLot(index, "lotNumber", event.target.value)
                      }
                      className={inputClass}
                      placeholder="Lot / batch number"
                    />
                    <Input
                      required
                      min="0.000001"
                      step="0.000001"
                      type="number"
                      value={lot.plannedQuantity}
                      onChange={(event) =>
                        updateLot(index, "plannedQuantity", event.target.value)
                      }
                      className={inputClass}
                      placeholder="Qty"
                    />
                    <AppDateInput
                      aria-label="Lot start"
                      value={lot.plannedStartDate}
                      onChange={(value) =>
                        updateLot(index, "plannedStartDate", value)
                      }
                      inputClassName={inputClass}
                    />
                    <AppDateInput
                      aria-label="Lot end"
                      value={lot.plannedEndDate}
                      onChange={(value) =>
                        updateLot(index, "plannedEndDate", value)
                      }
                      inputClassName={inputClass}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={lots.length === 1}
                      onClick={() =>
                        setLots((current) =>
                          current.filter((_, lotIndex) => lotIndex !== index),
                        )
                      }
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    <Input
                      value={lot.notes}
                      onChange={(event) =>
                        updateLot(index, "notes", event.target.value)
                      }
                      className={`${inputClass} md:col-span-6`}
                      placeholder="Lot notes (optional)"
                    />
                  </div>
                ))}
              </div>
            </div>
            <Button
              type="submit"
              size="sm"
              className="w-full"
              disabled={
                createPlan.isPending || !quantityBalanced || !selectedBom
              }
            >
              <Save className="h-3.5 w-3.5" />
              Create draft production plan
            </Button>
          </div>
        </form>
        <div className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-[#dce5ef]">
          <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                Production plan register
              </h3>
              <p className="text-[10px] text-[#718096]">
                Approval and MRP actions operate only on persisted records.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void plansQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
          {plansQuery.isError ? (
            <div className="p-3">
              <QueryError
                message={getErrorMessage(
                  plansQuery.error,
                  "Production plans could not be loaded.",
                )}
                onRetry={() => void plansQuery.refetch()}
              />
            </div>
          ) : plansQuery.isLoading ? (
            <LoadingPanel label="Loading production plans…" />
          ) : plans.length ? (
            <div className="overflow-auto">
              <table className="w-full min-w-[820px] border-collapse text-left text-[11px]">
                <thead className="sticky top-0 bg-[#f3f7fc] text-[9px] uppercase text-[#718096]">
                  <tr>
                    <th className="px-3 py-2.5">Plan</th>
                    <th className="px-3 py-2.5">Product</th>
                    <th className="px-3 py-2.5">Quantity</th>
                    <th className="px-3 py-2.5">Period</th>
                    <th className="px-3 py-2.5">Lots</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <Fragment key={plan.id}>
                      <tr className="border-t border-[#e5ebf3] hover:bg-[#f9fbfe]">
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() =>
                              setExpandedPlanId((current) =>
                                current === plan.id ? "" : plan.id,
                              )
                            }
                            className="font-semibold text-[#1d5fae] hover:underline"
                          >
                            {plan.planNumber}
                          </button>
                          <div className="mt-0.5 text-[9px] text-[#8290a4]">
                            {plan.bom
                              ? `${plan.bom.code} · v${plan.bom.versionNumber}`
                              : plan.bomVersionId}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {plan.finishedProduct?.itemCode} —{" "}
                          {plan.finishedProduct?.itemName}
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {formatQuantity(plan.plannedQuantity)} {plan.unit}
                        </td>
                        <td className="px-3 py-3 text-[#60718a]">
                          {plan.plannedStartDate
                            ? formatDate(plan.plannedStartDate)
                            : "—"}{" "}
                          →{" "}
                          {plan.plannedEndDate
                            ? formatDate(plan.plannedEndDate)
                            : "—"}
                        </td>
                        <td className="px-3 py-3">{plan.lots.length}</td>
                        <td className="px-3 py-3">
                          <StatusPill
                            value={plan.status}
                            label={plan.status.replaceAll("_", " ")}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1.5">
                            {plan.status === "DRAFT" ? (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => approve(plan)}
                                disabled={approvePlan.isPending}
                              >
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Approve
                              </Button>
                            ) : null}
                            {plan.status !== "CANCELLED" &&
                            plan.status !== "CLOSED" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => onOpenMrp(plan.id)}
                              >
                                <Calculator className="h-3.5 w-3.5" />
                                MRP
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {expandedPlanId === plan.id ? (
                        <tr className="border-t border-[#d9e5f2] bg-[#f8fbff]">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                              {[...plan.lots]
                                .sort((a, b) => a.sequence - b.sequence)
                                .map((lot) => (
                                  <div
                                    key={lot.id}
                                    className="rounded-lg border border-[#dce5ef] bg-white p-3"
                                  >
                                    <div className="flex items-center justify-between">
                                      <span className="text-xs font-semibold text-[#263b59]">
                                        {lot.sequence}. {lot.lotNumber}
                                      </span>
                                      <StatusPill
                                        value={lot.status}
                                        label={lot.status.replaceAll("_", " ")}
                                      />
                                    </div>
                                    <div className="mt-2 text-[11px] tabular-nums text-[#334155]">
                                      {formatQuantity(lot.plannedQuantity)}{" "}
                                      {plan.unit}
                                    </div>
                                    <div className="mt-1 text-[9px] text-[#718096]">
                                      {lot.plannedStartDate
                                        ? formatDate(lot.plannedStartDate)
                                        : "—"}{" "}
                                      →{" "}
                                      {lot.plannedEndDate
                                        ? formatDate(lot.plannedEndDate)
                                        : "—"}
                                    </div>
                                    {lot.notes ? (
                                      <div className="mt-2 text-[10px] text-[#60718a]">
                                        {lot.notes}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyRegister
              icon={CalendarClock}
              title="No production plans yet"
              description="Approve a real BOM (and optionally a routing), then create the first day-wise plan. No demo plans are shown."
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function ManufacturingProductionScheduleWorkspace({
  workspaceId,
}: {
  workspaceId?: string;
}) {
  const plansQuery = useManufacturingPlansQuery(
    workspaceId ? { workspaceId } : null,
  );
  const rows = useMemo(
    () =>
      (plansQuery.data ?? [])
        .filter(
          (plan) => plan.status !== "CANCELLED" && plan.status !== "CLOSED",
        )
        .flatMap((plan) =>
          plan.lots.map((lot) => ({
            id: lot.id,
            planNumber: plan.planNumber,
            product: plan.finishedProduct?.itemName ?? plan.finishedProductId,
            unit: plan.unit,
            planStatus: plan.status,
            lotNumber: lot.lotNumber,
            lotStatus: lot.status,
            quantity: lot.plannedQuantity,
            start: lot.plannedStartDate ?? plan.plannedStartDate ?? "",
            end: lot.plannedEndDate ?? plan.plannedEndDate ?? "",
          })),
        )
        .sort(
          (left, right) =>
            left.start.localeCompare(right.start) ||
            left.lotNumber.localeCompare(right.lotNumber),
        ),
    [plansQuery.data],
  );

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-[520px] flex-1 flex-col overflow-hidden rounded-xl border border-[#d6e1ef] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2478df]">
            <CalendarClock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#172b49]">
              Production schedule calendar
            </h2>
            <p className="text-[11px] text-[#718096]">
              Date-wise schedule from persisted production-plan lots. No
              generated schedule or demo row is shown.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-[#cfe0f4] bg-[#f1f7ff] px-3 py-1 text-[10px] font-semibold text-[#2563eb]">
            {rows.length} scheduled lots
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void plansQuery.refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>
      {plansQuery.isError ? (
        <div className="p-4">
          <QueryError
            message={getErrorMessage(
              plansQuery.error,
              "Production schedule could not be loaded.",
            )}
            onRetry={() => void plansQuery.refetch()}
          />
        </div>
      ) : plansQuery.isLoading ? (
        <LoadingPanel label="Loading production schedule…" />
      ) : rows.length ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[920px] border-collapse text-left text-[11px]">
            <thead className="sticky top-0 bg-[#f3f7fc] text-[9px] uppercase tracking-wide text-[#718096]">
              <tr>
                <th className="px-4 py-3">Start date</th>
                <th className="px-3 py-3">End date</th>
                <th className="px-3 py-3">Plan</th>
                <th className="px-3 py-3">Lot / batch</th>
                <th className="px-3 py-3">Finished product</th>
                <th className="px-3 py-3 text-right">Planned quantity</th>
                <th className="px-3 py-3">Plan status</th>
                <th className="px-4 py-3">Lot status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-t border-[#e5ebf3] hover:bg-[#f9fbfe]"
                >
                  <td className="px-4 py-3 font-semibold text-[#203651]">
                    {formatDate(row.start)}
                  </td>
                  <td className="px-3 py-3 text-[#60718a]">
                    {formatDate(row.end)}
                  </td>
                  <td className="px-3 py-3 font-mono text-[#334155]">
                    {row.planNumber}
                  </td>
                  <td className="px-3 py-3 font-semibold text-[#334155]">
                    {row.lotNumber}
                  </td>
                  <td className="px-3 py-3">{row.product}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {formatQuantity(row.quantity)} {row.unit}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill
                      value={row.planStatus}
                      label={row.planStatus.replaceAll("_", " ")}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      value={row.lotStatus}
                      label={row.lotStatus.replaceAll("_", " ")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyRegister
          icon={CalendarClock}
          title="No production lots are scheduled"
          description="Create and approve a real production plan with dated lots; they will appear here automatically."
        />
      )}
      <div className="mt-auto border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-2.5 text-[10px] text-[#718096]">
        Showing only active persisted plan lots, ordered by planned start date.
      </div>
    </div>
  );
}

export function ManufacturingMrpWorkspace({
  workspaceId,
  warehouses,
  initialPlanId,
  scenarioMode = false,
}: {
  workspaceId?: string;
  warehouses: WarehouseRecord[];
  initialPlanId?: string;
  scenarioMode?: boolean;
}) {
  const plansQuery = useManufacturingPlansQuery(
    workspaceId ? { workspaceId } : null,
  );
  const runsQuery = useManufacturingMrpRunsQuery(
    workspaceId ? { workspaceId } : null,
  );
  const calculateMrp = useCalculateManufacturingMrpMutation();
  const [form, setForm] = useState({
    planId: initialPlanId ?? "",
    warehouseId: "",
    runNumber: "",
    asOfDate: todayIso(),
    horizonEndDate: "",
    scenarioQuantity: "",
    note: "",
  });
  const [selectedRunId, setSelectedRunId] = useState("");
  const plans = plansQuery.data ?? [];
  const runs = runsQuery.data ?? [];
  const executablePlans = plans.filter(
    (plan) =>
      plan.status === "APPROVED" ||
      plan.status === "RELEASED" ||
      plan.status === "IN_PROGRESS",
  );
  const selectedRun =
    runs.find((run) => run.id === selectedRunId) ?? runs[0] ?? null;
  const selectedRunPlan = selectedRun
    ? plans.find((plan) => plan.id === selectedRun.planId)
    : null;
  const requirements = selectedRun?.requirements ?? [];
  const capacityRatios = requirements
    .filter((requirement) => requirement.grossRequirement > 0)
    .map((requirement) => ({
      id: requirement.id,
      ratio: requirement.availableQuantity / requirement.grossRequirement,
    }));
  const minimumCapacityRatio = capacityRatios.length
    ? Math.min(...capacityRatios.map((entry) => entry.ratio))
    : null;
  const capacityBottleneckIds = new Set(
    capacityRatios
      .filter(
        (entry) =>
          minimumCapacityRatio !== null &&
          Math.abs(entry.ratio - minimumCapacityRatio) < 0.000001,
      )
      .map((entry) => entry.id),
  );

  useEffect(() => {
    if (initialPlanId)
      setForm((current) =>
        current.planId ? current : { ...current, planId: initialPlanId },
      );
  }, [initialPlanId]);
  useEffect(() => {
    if (!selectedRunId && runs.length) setSelectedRunId(runs[0].id);
  }, [runs, selectedRunId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !form.planId || !form.asOfDate) return;
    const plan = executablePlans.find(
      (candidate) => candidate.id === form.planId,
    );
    if (!plan) {
      toast.error("Approve the production plan before calculating MRP.");
      return;
    }
    if (form.horizonEndDate && form.horizonEndDate < form.asOfDate) {
      toast.error("MRP horizon end cannot be before the as-of date.");
      return;
    }
    const scenarioQuantity = form.scenarioQuantity
      ? Number(form.scenarioQuantity)
      : undefined;
    if (
      scenarioMode &&
      (!scenarioQuantity ||
        !Number.isFinite(scenarioQuantity) ||
        scenarioQuantity <= 0)
    ) {
      toast.error("Enter a scenario quantity greater than zero.");
      return;
    }
    calculateMrp.mutate(
      {
        workspaceId,
        planId: form.planId,
        scenarioQuantity,
        warehouseId: form.warehouseId || null,
        runNumber: form.runNumber.trim() || undefined,
        asOfDate: form.asOfDate,
        horizonEndDate: form.horizonEndDate || null,
        idempotencyKey: makeIdempotencyKey(`mrp-${form.planId}`),
        note: form.note.trim() || null,
      },
      {
        onSuccess: (result) => {
          setSelectedRunId(result.run.id);
          toast.success(
            result.replayed
              ? "Existing MRP result reopened."
              : "Live material requirements calculated and persisted.",
          );
        },
        onError: (error) =>
          toast.error(getErrorMessage(error, "MRP could not be calculated.")),
      },
    );
  };

  if (!workspaceId)
    return <LoadingPanel label="Waiting for an active workspace…" />;
  return (
    <div className="flex min-h-[580px] flex-1 flex-col overflow-hidden rounded-xl border border-[#d6e1ef] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf3ff] text-[#2478df]">
            <Calculator className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#172b49]">
              {scenarioMode
                ? "What-if production planning"
                : "Live material requirements planning"}
            </h2>
            <p className="text-[11px] text-[#718096]">
              {scenarioMode
                ? "Test a quantity against an approved plan and captured live stock; every result is persisted as an MRP run."
                : "Calculate from an approved plan, approved BOM, current warehouse stock and active reservations—never from demo inventory."}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-[#cfe0f4] bg-[#f1f7ff] px-3 py-1 text-[10px] font-semibold text-[#2563eb]">
          {runs.length} persisted runs
        </span>
      </div>
      <div className="grid gap-3 border-b border-[#e5ebf3] bg-[#fbfcfe] p-4 xl:grid-cols-[minmax(480px,0.9fr)_minmax(0,1.1fr)]">
        <form
          onSubmit={submit}
          className="overflow-hidden rounded-xl border border-[#dce5ef] bg-white"
        >
          <div className="border-b border-[#e5ebf3] px-4 py-3">
            <h3 className="text-sm font-semibold text-[#203651]">
              {scenarioMode
                ? "Run a controlled what-if scenario"
                : "Calculate a controlled MRP run"}
            </h3>
            <p className="text-[10px] text-[#718096]">
              Only approved or released production plans are selectable.
            </p>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <Field label="Approved production plan">
              <select
                required
                value={form.planId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    planId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Select approved plan…</option>
                {executablePlans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.planNumber} · {plan.finishedProduct?.itemName} ·{" "}
                    {formatQuantity(plan.plannedQuantity)} {plan.unit}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Material warehouse"
              hint="Optional; manufacturing default is used when blank"
            >
              <select
                value={form.warehouseId}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    warehouseId: event.target.value,
                  }))
                }
                className={selectClass}
              >
                <option value="">Use configured raw-material warehouse</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.code} — {warehouse.name}
                  </option>
                ))}
              </select>
            </Field>
            {scenarioMode ? (
              <Field
                label="Scenario quantity"
                hint="Required; the approved plan is not changed"
              >
                <Input
                  required
                  min="0.0001"
                  step="0.0001"
                  type="number"
                  value={form.scenarioQuantity}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scenarioQuantity: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </Field>
            ) : null}
            <Field label="As-of date">
              <AppDateInput
                aria-label="As-of date"
                value={form.asOfDate}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    asOfDate: value,
                  }))
                }
                inputClassName={inputClass}
              />
            </Field>
            <Field label="Horizon end" hint="Optional">
              <AppDateInput
                aria-label="Horizon end"
                value={form.horizonEndDate}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    horizonEndDate: value,
                  }))
                }
                inputClassName={inputClass}
              />
            </Field>
            <Field label="Run number" hint="Optional; generated when blank">
              <Input
                value={form.runNumber}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    runNumber: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </Field>
            <Field label="Control note">
              <Input
                value={form.note}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                className={inputClass}
              />
            </Field>
            <Button
              type="submit"
              size="sm"
              className="md:col-span-2"
              disabled={
                calculateMrp.isPending ||
                !form.planId ||
                (scenarioMode && !form.scenarioQuantity)
              }
            >
              <Calculator className="h-3.5 w-3.5" />
              {calculateMrp.isPending
                ? "Calculating live MRP…"
                : scenarioMode
                  ? "Calculate and persist scenario"
                  : "Calculate and persist MRP"}
            </Button>
          </div>
        </form>
        <div className="overflow-hidden rounded-xl border border-[#dce5ef] bg-white">
          <div className="flex items-center justify-between border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold text-[#203651]">
                MRP run history
              </h3>
              <p className="text-[10px] text-[#718096]">
                Choose a run to inspect its immutable stock snapshot.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void runsQuery.refetch()}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          {runsQuery.isLoading ? (
            <LoadingPanel label="Loading MRP history…" />
          ) : runsQuery.isError ? (
            <div className="p-3">
              <QueryError
                message={getErrorMessage(
                  runsQuery.error,
                  "MRP history could not be loaded.",
                )}
                onRetry={() => void runsQuery.refetch()}
              />
            </div>
          ) : runs.length ? (
            <div className="max-h-[245px] overflow-y-auto p-2">
              {runs.map((run) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className={`mb-1.5 w-full rounded-lg border px-3 py-2.5 text-left last:mb-0 ${selectedRun?.id === run.id ? "border-[#8dbbf2] bg-[#eff6ff]" : "border-[#e3e9f1] bg-white hover:bg-[#f8fafc]"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-semibold text-[#263b59]">
                      {run.runNumber}
                    </span>
                    <StatusPill value={run.status} label={run.status} />
                  </div>
                  <div className="mt-1 flex flex-wrap justify-between gap-2 text-[9px] text-[#718096]">
                    <span>{run.planNumber ?? run.planId}</span>
                    <span>
                      {formatDateTime(run.completedAt ?? run.createdAt)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-xs text-[#718096]">
              No MRP run has been calculated yet.
            </div>
          )}
        </div>
      </div>
      {selectedRun ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="grid gap-2 border-b border-[#e5ebf3] bg-white p-4 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-lg border border-[#dce5ef] bg-[#f8fbff] p-3">
              <div className="text-[9px] uppercase tracking-wide text-[#718096]">
                Plan
              </div>
              <div className="mt-1 text-xs font-semibold text-[#203651]">
                {selectedRun.planNumber ?? selectedRun.planId}
              </div>
            </div>
            <div className="rounded-lg border border-[#dce5ef] bg-[#f8fbff] p-3">
              <div className="text-[9px] uppercase tracking-wide text-[#718096]">
                {selectedRun.isWhatIfScenario
                  ? "Scenario quantity"
                  : "Planned quantity"}
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-[#203651]">
                {selectedRun.scenarioQuantity === null
                  ? "—"
                  : formatQuantity(selectedRun.scenarioQuantity)}{" "}
                <span className="text-[10px] font-normal text-[#718096]">
                  {selectedRunPlan?.unit}
                </span>
              </div>
            </div>
            <div className="rounded-lg border border-[#dce5ef] bg-[#f8fbff] p-3">
              <div className="text-[9px] uppercase tracking-wide text-[#718096]">
                Max producible
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-[#1d5fae]">
                {selectedRun.maxProducibleQuantity === null
                  ? "—"
                  : formatQuantity(selectedRun.maxProducibleQuantity)}{" "}
                <span className="text-[10px] font-normal text-[#718096]">
                  {selectedRunPlan?.unit}
                </span>
              </div>
            </div>
            <div
              className={`rounded-lg border p-3 ${selectedRun.canFulfillPlan ? "border-[#bde5cf] bg-[#edf9f2]" : "border-[#f3d5a7] bg-[#fff8eb]"}`}
            >
              <div className="text-[9px] uppercase tracking-wide text-[#718096]">
                {selectedRun.isWhatIfScenario
                  ? "Scenario readiness"
                  : "Plan readiness"}
              </div>
              <div
                className={`mt-1 text-xs font-semibold ${selectedRun.canFulfillPlan ? "text-[#08783d]" : "text-[#a15c08]"}`}
              >
                {selectedRun.canFulfillPlan
                  ? "Materials available"
                  : "Material shortfall"}
              </div>
            </div>
            <div className="rounded-lg border border-[#f3d5a7] bg-[#fff8eb] p-3">
              <div className="text-[9px] uppercase tracking-wide text-[#718096]">
                Shortage items
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-[#a15c08]">
                {selectedRun.shortageItemCount ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-[#dce5ef] bg-[#f8fbff] p-3">
              <div className="text-[9px] uppercase tracking-wide text-[#718096]">
                Warehouse snapshot
              </div>
              <div className="mt-1 truncate text-xs font-semibold text-[#203651]">
                {warehouses.find(
                  (warehouse) => warehouse.id === selectedRun.warehouseId,
                )?.name ??
                  selectedRun.warehouseId ??
                  "Configured default"}
              </div>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full min-w-[1180px] border-collapse text-left text-[11px]">
              <thead className="sticky top-0 bg-[#f3f7fc] text-[9px] uppercase tracking-wide text-[#718096]">
                <tr>
                  <th className="px-3 py-2.5">Material</th>
                  <th className="px-3 py-2.5 text-right">Gross required</th>
                  <th className="px-3 py-2.5 text-right">On hand</th>
                  <th className="px-3 py-2.5 text-right">Reserved</th>
                  <th className="px-3 py-2.5 text-right">Scheduled receipt</th>
                  <th className="px-3 py-2.5 text-right">Available</th>
                  <th className="px-3 py-2.5 text-right">Net required</th>
                  <th className="px-3 py-2.5 text-right">Shortage</th>
                  <th className="px-3 py-2.5 text-right">Unit cost</th>
                  <th className="px-3 py-2.5">Constraint signal</th>
                </tr>
              </thead>
              <tbody>
                {requirements.map((requirement) => (
                  <tr
                    key={requirement.id}
                    className={`border-t border-[#e5ebf3] ${requirement.shortageQuantity > 0 ? "bg-[#fff8f5]" : "hover:bg-[#f9fbfe]"}`}
                  >
                    <td className="px-3 py-3">
                      <div className="font-semibold text-[#263b59]">
                        {requirement.itemName ?? "Unnamed material"}
                      </div>
                      <div className="font-mono text-[9px] text-[#8290a4]">
                        {requirement.itemCode ?? requirement.inventoryItemId} ·{" "}
                        {requirement.unit}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatQuantity(requirement.grossRequirement)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatQuantity(requirement.onHandQuantity)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatQuantity(requirement.activeReservationQty)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatQuantity(requirement.scheduledReceiptQty)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-[#08783d]">
                      {formatQuantity(requirement.availableQuantity)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatQuantity(requirement.netRequirement)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right font-semibold tabular-nums ${requirement.shortageQuantity > 0 ? "text-[#c2410c]" : "text-[#08783d]"}`}
                    >
                      {formatQuantity(requirement.shortageQuantity)}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {formatAmount(requirement.snapshotUnitCost)}
                    </td>
                    <td className="px-3 py-3">
                      {requirement.shortageQuantity > 0 ? (
                        <span className="rounded-full bg-[#feece7] px-2 py-1 text-[9px] font-semibold text-[#b42318]">
                          Shortage blocker
                        </span>
                      ) : capacityBottleneckIds.has(requirement.id) ? (
                        <span className="rounded-full bg-[#fff0d8] px-2 py-1 text-[9px] font-semibold text-[#9a5b0a]">
                          Lowest live stock ratio
                        </span>
                      ) : (
                        <span className="text-[#94a3b8]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!requirements.length ? (
              <EmptyRegister
                icon={Calculator}
                title="No material requirement rows returned"
                description="The selected run completed without component requirements. Verify that its approved BOM contains active components."
              />
            ) : null}
          </div>
          <div className="border-t border-[#e5ebf3] bg-[#fbfcfe] px-4 py-2.5 text-[10px] text-[#718096]">
            Constraint signal uses only returned live gross and available
            quantities. Explicit capacity, shift, line and equipment scheduling
            remain separate backend blockers and are not inferred here.
          </div>
        </div>
      ) : (
        <EmptyRegister
          icon={Calculator}
          title="Calculate or select an MRP run"
          description="The result will show gross demand, on-hand, reservations, scheduled receipts, net requirement, shortages and maximum producible quantity."
        />
      )}
    </div>
  );
}
