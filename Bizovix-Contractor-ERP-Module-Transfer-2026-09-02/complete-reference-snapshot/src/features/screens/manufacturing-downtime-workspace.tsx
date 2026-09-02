"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Clock3,
  Factory,
  History,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  TimerReset,
} from "lucide-react";
import { toast } from "sonner";

import { AppDateTimeInput } from "@/components/shared/app-date-time-input";
import { ManufacturingEmptyState } from "@/components/shared/manufacturing-empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import {
  endManufacturingDowntime,
  listManufacturingDowntimeCandidates,
  listManufacturingDowntimeEvents,
  listManufacturingDowntimeReasonCodes,
  startManufacturingDowntime,
} from "@/services/manufacturing-downtime.service";
import type { ManufacturingDowntimeEvent } from "@/types/manufacturing-downtime";

export interface ManufacturingDowntimeWorkspaceProps {
  workspaceId?: string;
}

const selectClass =
  "h-10 w-full rounded-xl border border-[#d3dfec] bg-white px-3 text-xs text-[#203651] outline-none focus:border-[#7db4f2] focus:ring-2 focus:ring-[#dbeafe]";
const textareaClass =
  "min-h-20 w-full resize-y rounded-xl border border-[#d3dfec] bg-white px-3 py-2 text-xs text-[#203651] outline-none focus:border-[#7db4f2] focus:ring-2 focus:ring-[#dbeafe]";

function localDateTimeNow() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function toIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()))
    throw new Error("Enter a valid date and time.");
  return date.toISOString();
}

function idempotencyKey(prefix: string) {
  return `${prefix}:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function formatDuration(minutes: string | null) {
  if (minutes === null) return "Running";
  const numeric = Number(minutes);
  if (!Number.isFinite(numeric)) return minutes;
  if (numeric < 60) return `${numeric.toFixed(2)} min`;
  const hours = Math.floor(numeric / 60);
  const remainder = numeric - hours * 60;
  return `${hours}h ${remainder.toFixed(2)}m`;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#718096]">
      {children}
    </label>
  );
}

function StatusPill({ status }: { status: "OPEN" | "ENDED" }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[9px] font-bold tracking-wide ring-1 ${
        status === "OPEN"
          ? "bg-amber-50 text-amber-700 ring-amber-200"
          : "bg-emerald-50 text-emerald-700 ring-emerald-200"
      }`}
    >
      {status}
    </span>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <ManufacturingEmptyState
      compact
      icon={Clock3}
      title="No downtime recorded"
      description={children}
    />
  );
}

export function ManufacturingDowntimeWorkspace({
  workspaceId,
}: ManufacturingDowntimeWorkspaceProps) {
  const client = useQueryClient();
  const [candidateKey, setCandidateKey] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [reason, setReason] = useState("");
  const [startAt, setStartAt] = useState(localDateTimeNow);
  const [startSignature, setStartSignature] = useState("");
  const [startPassword, setStartPassword] = useState("");
  const [startKey, setStartKey] = useState(() =>
    idempotencyKey("downtime-start"),
  );
  const [endingEventId, setEndingEventId] = useState<string | null>(null);
  const [endAt, setEndAt] = useState(localDateTimeNow);
  const [endNote, setEndNote] = useState("");
  const [endSignature, setEndSignature] = useState("");
  const [endPassword, setEndPassword] = useState("");
  const [endKey, setEndKey] = useState(() => idempotencyKey("downtime-end"));

  const candidatesQuery = useQuery({
    queryKey: ["manufacturing", workspaceId, "downtime", "candidates"],
    queryFn: () => listManufacturingDowntimeCandidates(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const eventsQuery = useQuery({
    queryKey: ["manufacturing", workspaceId, "downtime", "events"],
    queryFn: () => listManufacturingDowntimeEvents(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const reasonsQuery = useQuery({
    queryKey: ["manufacturing", workspaceId, "downtime", "reason-codes"],
    queryFn: () => listManufacturingDowntimeReasonCodes(workspaceId!),
    enabled: Boolean(workspaceId),
  });

  const startCandidates = useMemo(
    () =>
      (candidatesQuery.data ?? []).filter(
        (candidate) =>
          candidate.operationStatus === "IN_PROGRESS" &&
          !candidate.openDowntimeEvent,
      ),
    [candidatesQuery.data],
  );
  const selectedCandidate = startCandidates.find(
    (candidate) =>
      `${candidate.operationExecutionId}:${candidate.resource.id}` ===
      candidateKey,
  );
  const openEvents = (eventsQuery.data ?? []).filter(
    (event) => event.status === "OPEN",
  );
  const endedEvents = (eventsQuery.data ?? []).filter(
    (event) => event.status === "ENDED",
  );

  const refresh = async () => {
    await client.invalidateQueries({
      queryKey: ["manufacturing", workspaceId],
    });
  };
  const startMutation = useMutation({
    mutationFn: startManufacturingDowntime,
    onSuccess: async () => {
      toast.success("Downtime started; the linked operation is now paused.");
      setCandidateKey("");
      setReasonCode("");
      setReason("");
      setStartPassword("");
      setStartKey(idempotencyKey("downtime-start"));
      await refresh();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Downtime could not be started.")),
  });
  const endMutation = useMutation({
    mutationFn: ({
      eventId,
      input,
    }: {
      eventId: string;
      input: Parameters<typeof endManufacturingDowntime>[1];
    }) => endManufacturingDowntime(eventId, input),
    onSuccess: async () => {
      toast.success(
        "Downtime ended; duration was calculated and the operation resumed.",
      );
      setEndingEventId(null);
      setEndNote("");
      setEndPassword("");
      setEndKey(idempotencyKey("downtime-end"));
      await refresh();
    },
    onError: (error) =>
      toast.error(errorMessage(error, "Downtime could not be ended.")),
  });

  const submitStart = (event: FormEvent) => {
    event.preventDefault();
    if (!workspaceId || !selectedCandidate) {
      toast.error(
        "Select a running operation and its assigned machine or line.",
      );
      return;
    }
    if (!reason.trim()) {
      toast.error("Enter the downtime reason.");
      return;
    }
    try {
      startMutation.mutate({
        workspaceId,
        orderId: selectedCandidate.orderId,
        operationExecutionId: selectedCandidate.operationExecutionId,
        resourceId: selectedCandidate.resource.id,
        reasonCode: reasonCode || null,
        reason: reason.trim(),
        transactionDate: toIso(startAt),
        idempotencyKey: startKey,
        signatureMeaning: startSignature.trim() || null,
        reauthenticationPassword: startPassword || null,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Enter a valid downtime start time."));
    }
  };

  const submitEnd = (
    event: FormEvent,
    downtime: ManufacturingDowntimeEvent,
  ) => {
    event.preventDefault();
    if (!workspaceId) return;
    try {
      endMutation.mutate({
        eventId: downtime.id,
        input: {
          workspaceId,
          transactionDate: toIso(endAt),
          idempotencyKey: endKey,
          endNote: endNote.trim() || null,
          signatureMeaning: endSignature.trim() || null,
          reauthenticationPassword: endPassword || null,
        },
      });
    } catch (error) {
      toast.error(errorMessage(error, "Enter a valid downtime end time."));
    }
  };

  if (!workspaceId) {
    return (
      <EmptyState>
        Select an active workspace to record production downtime.
      </EmptyState>
    );
  }

  const loading = candidatesQuery.isLoading || eventsQuery.isLoading;
  const failed = candidatesQuery.isError || eventsQuery.isError;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <section className="overflow-hidden rounded-2xl border border-[#cfdeef] bg-white shadow-[0_6px_18px_rgba(30,64,175,0.05)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dce7f3] bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#2478df] text-white">
              <TimerReset className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-[#18304f]">
                Machine / Line Downtime
              </h2>
              <p className="text-[11px] text-[#718096]">
                Stop and resume only real, running operations with assigned
                resources.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
              {openEvents.length} open
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {failed ? (
          <div className="m-4 flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
            <span>Downtime operations could not be loaded.</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void refresh()}
            >
              Retry
            </Button>
          </div>
        ) : (
          <form
            onSubmit={submitStart}
            className="grid gap-3 p-4 lg:grid-cols-12"
          >
            <div className="lg:col-span-6">
              <FieldLabel>Running operation and assigned resource *</FieldLabel>
              <select
                className={selectClass}
                value={candidateKey}
                onChange={(event) => setCandidateKey(event.target.value)}
              >
                <option value="">Select running operation…</option>
                {startCandidates.map((candidate) => (
                  <option
                    key={`${candidate.operationExecutionId}:${candidate.resource.id}`}
                    value={`${candidate.operationExecutionId}:${candidate.resource.id}`}
                  >
                    {candidate.orderNumber} ·{" "}
                    {candidate.finishedProduct.itemName} ·{" "}
                    {candidate.operation.code} {candidate.operation.name} ·{" "}
                    {candidate.resource.code} {candidate.resource.name}
                  </option>
                ))}
              </select>
              {!loading && startCandidates.length === 0 ? (
                <p className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-700">
                  <AlertTriangle className="h-3 w-3" />
                  No IN_PROGRESS operation has an active assigned machine or
                  production line.
                </p>
              ) : null}
            </div>
            <div className="lg:col-span-3">
              <FieldLabel>Started at *</FieldLabel>
              <AppDateTimeInput
                aria-label="Started at"
                value={startAt}
                onChange={setStartAt}
                inputClassName="h-10 rounded-xl"
              />
            </div>
            <div className="lg:col-span-3">
              <FieldLabel>Approved reason code</FieldLabel>
              <select
                className={selectClass}
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value)}
              >
                <option value="">No controlled code</option>
                {(reasonsQuery.data ?? []).map((entry) => (
                  <option key={entry.id} value={entry.code}>
                    {entry.code} — {entry.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="lg:col-span-6">
              <FieldLabel>Downtime reason *</FieldLabel>
              <textarea
                className={textareaClass}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Describe the machine/line stop and immediate condition."
                maxLength={1000}
              />
            </div>
            <div className="lg:col-span-3">
              <FieldLabel>Electronic-signature meaning</FieldLabel>
              <Input
                value={startSignature}
                onChange={(event) => setStartSignature(event.target.value)}
                placeholder="Exact approved meaning"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="lg:col-span-3">
              <FieldLabel>Current password (if required)</FieldLabel>
              <Input
                type="password"
                value={startPassword}
                onChange={(event) => setStartPassword(event.target.value)}
                autoComplete="current-password"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="flex items-center justify-end lg:col-span-12">
              <Button
                type="submit"
                size="sm"
                disabled={
                  !selectedCandidate ||
                  !reason.trim() ||
                  startMutation.isPending
                }
              >
                <PauseCircle className="h-4 w-4" />
                {startMutation.isPending ? "Starting…" : "Start Downtime"}
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#cfdeef] bg-white">
        <div className="flex items-center gap-2 border-b border-[#dce7f3] px-4 py-3">
          <Factory className="h-4 w-4 text-amber-600" />
          <h3 className="text-xs font-semibold text-[#203651]">
            Open downtime
          </h3>
        </div>
        {openEvents.length === 0 ? (
          <div className="p-4">
            <EmptyState>
              No machine or line is currently stopped through this workflow.
            </EmptyState>
          </div>
        ) : (
          <div className="divide-y divide-[#e2eaf3]">
            {openEvents.map((downtime) => (
              <div key={downtime.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-[#18304f]">
                        {downtime.resource.code} · {downtime.resource.name}
                      </span>
                      <StatusPill status={downtime.status} />
                    </div>
                    <p className="mt-1 text-[11px] text-[#52647d]">
                      {downtime.order.orderNumber} ·{" "}
                      {downtime.order.finishedProduct.itemName} ·{" "}
                      {downtime.operationExecution.routingOperation.code}{" "}
                      {downtime.operationExecution.routingOperation.name}
                    </p>
                    <p className="mt-1 text-[11px] text-[#718096]">
                      Started {formatDateTime(downtime.startedAt)} by{" "}
                      {downtime.startedBy.name} · {downtime.reason}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEndingEventId(
                        endingEventId === downtime.id ? null : downtime.id,
                      );
                      setEndAt(localDateTimeNow());
                      setEndNote("");
                      setEndPassword("");
                      setEndKey(idempotencyKey("downtime-end"));
                    }}
                  >
                    <PlayCircle className="h-4 w-4" />
                    End & Resume
                  </Button>
                </div>
                {endingEventId === downtime.id ? (
                  <form
                    onSubmit={(event) => submitEnd(event, downtime)}
                    className="mt-4 grid gap-3 rounded-xl border border-[#d8e5f3] bg-[#f8fbff] p-3 md:grid-cols-4"
                  >
                    <div>
                      <FieldLabel>Ended at *</FieldLabel>
                      <AppDateTimeInput
                        aria-label="Ended at"
                        value={endAt}
                        onChange={setEndAt}
                        inputClassName="h-10 rounded-xl"
                      />
                    </div>
                    <div>
                      <FieldLabel>Electronic-signature meaning</FieldLabel>
                      <Input
                        value={endSignature}
                        onChange={(event) =>
                          setEndSignature(event.target.value)
                        }
                        placeholder="Exact approved meaning"
                        className="h-10 rounded-xl"
                      />
                    </div>
                    <div>
                      <FieldLabel>Current password (if required)</FieldLabel>
                      <Input
                        type="password"
                        value={endPassword}
                        onChange={(event) => setEndPassword(event.target.value)}
                        autoComplete="current-password"
                        className="h-10 rounded-xl"
                      />
                    </div>
                    <div>
                      <FieldLabel>Resolution note</FieldLabel>
                      <Input
                        value={endNote}
                        onChange={(event) => setEndNote(event.target.value)}
                        placeholder="Repair/action taken"
                        className="h-10 rounded-xl"
                      />
                    </div>
                    <div className="flex justify-end gap-2 md:col-span-4">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEndingEventId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={endMutation.isPending}
                      >
                        <PlayCircle className="h-4 w-4" />
                        {endMutation.isPending
                          ? "Ending…"
                          : "End Downtime & Resume"}
                      </Button>
                    </div>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="min-h-0 overflow-hidden rounded-2xl border border-[#cfdeef] bg-white">
        <div className="flex items-center justify-between gap-2 border-b border-[#dce7f3] px-4 py-3">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-[#2478df]" />
            <h3 className="text-xs font-semibold text-[#203651]">
              Downtime history
            </h3>
          </div>
          <span className="text-[10px] text-[#718096]">
            {endedEvents.length} ended
          </span>
        </div>
        {endedEvents.length === 0 ? (
          <div className="p-4">
            <EmptyState>
              Ended downtime events will appear here with server-calculated
              duration.
            </EmptyState>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-[11px]">
              <thead className="bg-[#f3f7fb] text-[9px] uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-3 py-2.5">Order / operation</th>
                  <th className="px-3 py-2.5">Machine / line</th>
                  <th className="px-3 py-2.5">Reason</th>
                  <th className="px-3 py-2.5">Started</th>
                  <th className="px-3 py-2.5">Ended</th>
                  <th className="px-3 py-2.5 text-right">Duration</th>
                  <th className="px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e2eaf3] text-[#334155]">
                {endedEvents.map((downtime) => (
                  <tr key={downtime.id} className="hover:bg-[#f9fbfe]">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-[#203651]">
                        {downtime.order.orderNumber}
                      </div>
                      <div className="text-[10px] text-[#718096]">
                        {downtime.operationExecution.routingOperation.code} ·{" "}
                        {downtime.operationExecution.routingOperation.name}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium">
                        {downtime.resource.name}
                      </div>
                      <div className="text-[10px] text-[#718096]">
                        {downtime.resource.code} ·{" "}
                        {downtime.resource.kind.replaceAll("_", " ")}
                      </div>
                    </td>
                    <td className="max-w-[280px] px-3 py-3">
                      <div>{downtime.reason}</div>
                      {downtime.reasonCode ? (
                        <div className="text-[10px] text-[#718096]">
                          Code: {downtime.reasonCode}
                        </div>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {formatDateTime(downtime.startedAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      {downtime.endedAt
                        ? formatDateTime(downtime.endedAt)
                        : "—"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[#18304f]">
                      {formatDuration(downtime.durationMinutes)}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={downtime.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
