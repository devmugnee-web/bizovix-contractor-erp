"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CheckCheck,
  ChevronRight,
  Search,
  Settings2,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ManufacturingWorkflowConfigurationRecord } from "@/types/manufacturing";

export interface ManufacturingNavigationConfigurationStep {
  id: string;
  label: string;
  flowSerial: number;
  prerequisiteFlowSerials?: readonly number[];
}

export interface ManufacturingNavigationConfigurationGroup {
  id: string;
  code?: string;
  label: string;
  steps: readonly ManufacturingNavigationConfigurationStep[];
}

export interface ManufacturingNavigationConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly ManufacturingNavigationConfigurationGroup[];
  configuration: ManufacturingWorkflowConfigurationRecord | null | undefined;
  canConfigure: boolean;
  isSaving: boolean;
  onSave: (hiddenStepSerials: number[]) => void;
  presentation?: "dialog" | "page";
}

function ManufacturingConfigurationSurface({
  children,
  open,
  onOpenChange,
  isSaving,
  presentation,
}: {
  children: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSaving: boolean;
  presentation: "dialog" | "page";
}) {
  if (presentation === "page") {
    if (!open) return null;
    return (
      <section
        data-manufacturing-configuration-page
        className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border border-[#d4dfec] bg-white shadow-[0_10px_30px_rgba(35,57,85,0.07)]"
      >
        {children}
      </section>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSaving) onOpenChange(nextOpen);
      }}
    >
      <DialogContent data-manufacturing-configuration-dialog className="flex h-[min(92vh,650px)] max-h-[92vh] w-[min(96vw,1040px)] flex-col rounded-[20px] border-[#d4dfec] p-0">
        {children}
      </DialogContent>
    </Dialog>
  );
}

function normalizedSerials(
  serials: readonly number[] | undefined,
  knownSerials: ReadonlySet<number>,
) {
  return [...new Set(serials ?? [])]
    .filter(
      (serial) =>
        Number.isInteger(serial) && serial > 0 && knownSerials.has(serial),
    )
    .sort((left, right) => left - right);
}

function sameSerials(left: readonly number[], right: readonly number[]) {
  return (
    left.length === right.length &&
    left.every((serial, index) => serial === right[index])
  );
}

export function ManufacturingNavigationConfigurationDialog({
  open,
  onOpenChange,
  groups,
  configuration,
  canConfigure,
  isSaving,
  onSave,
  presentation = "dialog",
}: ManufacturingNavigationConfigurationDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [hiddenStepSerials, setHiddenStepSerials] = useState<Set<number>>(
    () => new Set(),
  );

  const knownSerials = useMemo(
    () =>
      new Set(
        groups.flatMap((group) => group.steps.map((step) => step.flowSerial)),
      ),
    [groups],
  );
  const catalogSignature = useMemo(
    () => [...knownSerials].sort((left, right) => left - right).join(","),
    [knownSerials],
  );
  const persistedHiddenSerials = useMemo(
    () => normalizedSerials(configuration?.hiddenStepSerials, knownSerials),
    [configuration?.hiddenStepSerials, knownSerials],
  );
  const persistedSignature = persistedHiddenSerials.join(",");

  useEffect(() => {
    if (!open) return;
    setHiddenStepSerials(
      new Set(persistedSignature.split(",").filter(Boolean).map(Number)),
    );
    setSearch("");
    setSelectedGroupId(groups[0]?.id ?? "");
  }, [
    open,
    configuration?.revision,
    configuration?.workflowDefinitionVersion,
    persistedSignature,
    catalogSignature,
    groups,
  ]);

  const draftHiddenSerials = useMemo(
    () => normalizedSerials([...hiddenStepSerials], knownSerials),
    [hiddenStepSerials, knownSerials],
  );
  const dirty = !sameSerials(draftHiddenSerials, persistedHiddenSerials);
  const enabledCount = Math.max(
    0,
    knownSerials.size - draftHiddenSerials.length,
  );
  const hasVisibleStep = enabledCount > 0;
  const enabledWithHiddenPrerequisiteCount = useMemo(
    () =>
      groups.reduce(
        (count, group) =>
          count +
          group.steps.filter(
            (step) =>
              !hiddenStepSerials.has(step.flowSerial) &&
              step.prerequisiteFlowSerials?.some((serial) =>
                hiddenStepSerials.has(serial),
              ),
          ).length,
        0,
      ),
    [groups, hiddenStepSerials],
  );
  const controlsDisabled =
    !canConfigure || isSaving || configuration === undefined;
  const term = search.trim().toLowerCase();

  const filteredGroups = useMemo(
    () =>
      groups.flatMap((group) => {
        const groupMatches = group.label.toLowerCase().includes(term);
        const matchingSteps =
          !term || groupMatches
            ? group.steps
            : group.steps.filter((step) =>
                `${step.flowSerial} ${step.label}`.toLowerCase().includes(term),
              );
        return matchingSteps.length ? [{ group, matchingSteps }] : [];
      }),
    [groups, term],
  );
  const selectedGroupEntry =
    filteredGroups.find(({ group }) => group.id === selectedGroupId) ??
    filteredGroups[0] ??
    null;
  const selectedSteps = selectedGroupEntry?.matchingSteps ?? [];

  const toggleGroup = (group: ManufacturingNavigationConfigurationGroup) => {
    setHiddenStepSerials((current) => {
      const next = new Set(current);
      const allEnabled = group.steps.every(
        (step) => !next.has(step.flowSerial),
      );
      for (const step of group.steps) {
        if (allEnabled) next.add(step.flowSerial);
        else next.delete(step.flowSerial);
      }
      return next;
    });
  };

  const toggleStep = (flowSerial: number, enabled: boolean) => {
    setHiddenStepSerials((current) => {
      const next = new Set(current);
      if (enabled) next.delete(flowSerial);
      else next.add(flowSerial);
      return next;
    });
  };

  return (
    <ManufacturingConfigurationSurface
      open={open}
      onOpenChange={onOpenChange}
      isSaving={isSaving}
      presentation={presentation}
    >
        <div className={`border-b border-[#dde6f0] bg-[linear-gradient(135deg,#f7fbff,#fffaf4)] px-5 py-4 ${presentation === "dialog" ? "pr-14" : ""}`}>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eaf4ff] text-[#1f73d8]">
              <Settings2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              {presentation === "dialog" ? (
                <DialogTitle className="text-lg font-semibold text-[#172b47]">
                  Manufacturing configuration
                </DialogTitle>
              ) : (
                <h1 className="text-lg font-semibold text-[#172b47]">
                  Manufacturing configuration
                </h1>
              )}
              {presentation === "dialog" ? (
                <DialogDescription className="mt-1 max-w-3xl text-xs leading-5 text-[#62738a]">
                  Choose which workflow screens this company sees in Manufacturing. This is a navigation preference only; saved records, workflow controls, stock and accounting postings are never removed or rewritten.
                </DialogDescription>
              ) : (
                <p className="mt-1 max-w-4xl text-xs leading-5 text-[#62738a]">
                  Choose which workflow screens this company sees in Manufacturing. This is a navigation preference only; saved records, workflow controls, stock and accounting postings are never removed or rewritten.
                </p>
              )}
            </div>
            {presentation === "page" ? (
              <button
                type="button"
                aria-label="Close manufacturing configuration"
                title="Back to Manufacturing Control Center"
                disabled={isSaving}
                onClick={() => onOpenChange(false)}
                className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#d7e1ec] bg-white text-[#53647b] shadow-sm transition hover:border-[#f5b9b9] hover:bg-[#fff1f2] hover:text-[#c83d3d]"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-[#e1e8f1] bg-white px-5 py-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a98aa]" />
            <Input
              aria-label="Search manufacturing configuration"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search groups or workflow screens..."
              className="h-9 rounded-lg border-[#cfdbe8] pl-9 text-xs"
            />
          </div>
          <span className="rounded-full border border-[#c9dcf3] bg-[#f2f8ff] px-3 py-1.5 text-[11px] font-semibold text-[#1767c5]">
            Enabled {enabledCount} of {knownSerials.size}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={controlsDisabled || hiddenStepSerials.size === 0}
            onClick={() => setHiddenStepSerials(new Set())}
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Enable all
          </Button>
        </div>

        {!canConfigure ? (
          <div className="mx-5 mt-3 flex items-center gap-2 rounded-lg border border-[#d8e3ef] bg-[#f8fafc] px-3 py-2 text-[11px] text-[#617187]">
            <ShieldCheck className="h-4 w-4 text-[#3277c7]" />
            You can review this company configuration. The
            manufacturing.configure permission is required to change it.
          </div>
        ) : null}

        {enabledWithHiddenPrerequisiteCount > 0 ? (
          <div
            role="status"
            className="mx-5 mt-3 flex items-start gap-2 rounded-lg border border-[#efd6a8] bg-[#fffaf0] px-3 py-2 text-[11px] leading-4 text-[#805500]"
          >
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#c47a05]" />
            <span>
              {enabledWithHiddenPrerequisiteCount} enabled process
              {enabledWithHiddenPrerequisiteCount === 1 ? "" : "es"} reference
              {enabledWithHiddenPrerequisiteCount === 1 ? "s" : ""} hidden
              prerequisites. Those prerequisites will auto-reveal when required;
              workflow enforcement is unchanged.
            </span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden bg-[#f7f9fc] p-3 sm:p-4">
          {configuration === undefined ? (
            <div className="rounded-xl border border-[#dce5ef] bg-white px-4 py-10 text-center text-sm text-[#64748b]">
              Loading the company&apos;s Manufacturing configuration...
            </div>
          ) : filteredGroups.length ? (
            <div data-manufacturing-configuration-master-detail className="grid h-full min-h-0 grid-cols-[320px_minmax(0,1fr)] gap-3">
              <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#d8e2ed] bg-white shadow-[0_3px_12px_rgba(30,64,175,0.04)]">
                <div className="flex items-center justify-between border-b border-[#e6ecf3] bg-[#fbfdff] px-3 py-2">
                  <div>
                    <div className="text-xs font-semibold text-[#263a55]">Manufacturing groups</div>
                    <div className="mt-0.5 text-[10px] text-[#7a899c]">Select a group to view its workflow items</div>
                  </div>
                  <span className="rounded-full bg-[#edf4fc] px-2 py-1 text-[10px] font-semibold text-[#2478df]">{filteredGroups.length}</span>
                </div>
                <div data-manufacturing-group-list className="min-h-0 flex-1 space-y-0.5 overflow-y-auto p-2">
                  {filteredGroups.map(({ group }) => {
                    const enabledInGroup = group.steps.filter(
                      (step) => !hiddenStepSerials.has(step.flowSerial),
                    ).length;
                    const allEnabled = enabledInGroup === group.steps.length;
                    const partiallyEnabled = enabledInGroup > 0 && enabledInGroup < group.steps.length;
                    const selected = selectedGroupEntry?.group.id === group.id;

                    return (
                      <div
                        key={group.id}
                        className={`flex items-center gap-2 rounded-lg border px-2 py-1 transition ${selected ? "border-[#9fc3ef] bg-[#edf5ff]" : "border-transparent hover:border-[#e0e8f2] hover:bg-[#f8fafc]"}`}
                      >
                        <input
                          ref={(element) => {
                            if (element) element.indeterminate = partiallyEnabled;
                          }}
                          type="checkbox"
                          aria-label={`${group.label} group`}
                          checked={allEnabled}
                          disabled={controlsDisabled}
                          onChange={() => toggleGroup(group)}
                          className="h-4 w-4 shrink-0 accent-[#2478df]"
                        />
                        <button
                          type="button"
                          aria-label={`Expand ${group.label}`}
                          aria-pressed={selected}
                          onClick={() => {
                            setSelectedGroupId(group.id);
                          }}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          {group.code ? (
                            <span className="shrink-0 rounded-md bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[#2478df] shadow-sm">
                              {group.code}
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#263a55]">{group.label}</span>
                          <span className="shrink-0 text-[10px] font-medium text-[#7a899c]">{enabledInGroup}/{group.steps.length}</span>
                          <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-[#7a899c] ${selected ? "text-[#2478df]" : ""}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section data-manufacturing-group-details className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-[#d8e2ed] bg-white shadow-[0_3px_12px_rgba(30,64,175,0.04)]">
                {selectedGroupEntry ? (
                  <>
                    <div className="flex items-center justify-between gap-3 border-b border-[#e6ecf3] bg-[#fbfdff] px-4 py-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {selectedGroupEntry.group.code ? <span className="rounded-md bg-[#eaf3ff] px-1.5 py-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[#2478df]">{selectedGroupEntry.group.code}</span> : null}
                          <h3 className="truncate text-sm font-semibold text-[#263a55]">{selectedGroupEntry.group.label}</h3>
                        </div>
                        <div className="mt-1 text-[10px] text-[#7a899c]">Workflow items for the selected group</div>
                      </div>
                      <span className="shrink-0 rounded-full border border-[#d8e3ef] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#617187]">{selectedSteps.length} items</span>
                    </div>

                    <div key={`${selectedGroupEntry.group.id}:${term}`} data-manufacturing-visible-steps className="min-h-0 flex-1 space-y-0.5 overflow-x-hidden overflow-y-scroll p-2 [scrollbar-gutter:stable]">
                      {selectedSteps.map((step) => {
                        const enabled = !hiddenStepSerials.has(step.flowSerial);
                        return (
                          <label key={step.flowSerial} className="flex h-[36px] cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2.5 text-[11px] text-[#465a73] hover:border-[#e3eaf3] hover:bg-[#f3f7fc]">
                            <input
                              type="checkbox"
                              aria-label={step.label}
                              checked={enabled}
                              disabled={controlsDisabled}
                              onChange={(event) => toggleStep(step.flowSerial, event.target.checked)}
                              className="h-4 w-4 shrink-0 accent-[#2478df]"
                            />
                            <span className="flex h-5 min-w-9 shrink-0 items-center justify-center rounded-md bg-[#edf2f7] px-1 text-[9px] font-bold text-[#6c7b8f]">{String(step.flowSerial).padStart(3, "0")}</span>
                            <span className="min-w-0 flex-1 truncate leading-4">{step.label}</span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ${enabled ? "bg-[#eaf7ef] text-[#178447]" : "bg-[#f1f3f6] text-[#7a899c]"}`}>{enabled ? "Enabled" : "Hidden"}</span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="flex min-h-[42px] items-center justify-between border-t border-[#e6ecf3] bg-[#fbfdff] px-3 py-2">
                      <span className="text-[10px] text-[#7a899c]">{selectedSteps.length} workflow items in this group</span>
                      <span className="text-[10px] font-medium text-[#617187]">{selectedSteps.length > 7 ? "Scroll to view all items" : "All items are visible"}</span>
                    </div>
                  </>
                ) : null}
              </section>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-[#ccd9e7] bg-white px-4 py-10 text-center text-sm text-[#64748b]">
              No Manufacturing workflow screen matches this search.
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dde6f0] bg-white px-5 py-3.5">
          <p
            className={`max-w-2xl text-[10px] leading-4 ${hasVisibleStep ? "text-[#718096]" : "font-semibold text-[#b54735]"}`}
          >
            {hasVisibleStep
              ? "Turning a screen off only hides it from normal Manufacturing navigation. Required setup and active workflow safety remain enforced by the server."
              : "Select at least one workflow screen before saving this configuration."}
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isSaving}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={controlsDisabled || !dirty || !hasVisibleStep}
              onClick={() => onSave(draftHiddenSerials)}
            >
              {isSaving ? "Saving..." : "Save configuration"}
            </Button>
          </div>
        </div>
    </ManufacturingConfigurationSurface>
  );
}
