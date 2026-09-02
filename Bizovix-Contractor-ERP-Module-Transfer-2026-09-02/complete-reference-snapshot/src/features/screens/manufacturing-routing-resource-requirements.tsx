"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Factory,
  RefreshCw,
  Save,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  assignManufacturingOperationResource,
  listManufacturingResources,
} from "@/services/manufacturing-blueprint.service";
import type {
  ManufacturingOperationResourceRequirementRecord,
  ManufacturingRoutingVersionRecord,
} from "@/types/manufacturing";
import type {
  ManufacturingResourceKind,
  ManufacturingResourceRecord,
} from "@/types/manufacturing-blueprint";

const inputClass = "h-9 rounded-lg border-[#d7e1ee] bg-white text-sm";
const selectClass =
  "h-9 w-full rounded-lg border border-[#d7e1ee] bg-white px-3 text-sm text-[#334155] outline-none focus:border-[#8dbbf2]";

const kindLabels: Record<ManufacturingResourceKind, string> = {
  WORK_CENTER: "Work centers",
  PRODUCTION_LINE: "Production lines",
  ROOM: "Rooms",
  EQUIPMENT: "Equipment and machines",
};

type RequirementForm = {
  resourceId: string;
  requiredUnits: string;
  capacityMultiplier: string;
  isMandatory: boolean;
  note: string;
};

const blankForm: RequirementForm = {
  resourceId: "",
  requiredUnits: "1",
  capacityMultiplier: "1",
  isMandatory: true,
  note: "",
};

function message(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function readinessState(resource: ManufacturingResourceRecord) {
  if (!resource.isActive)
    return { label: "Inactive", className: "bg-slate-100 text-slate-600" };
  if (
    resource.qualificationState === "BLOCKED" ||
    resource.calibrationState === "BLOCKED" ||
    resource.maintenanceState === "BLOCKED" ||
    resource.cleaningState === "BLOCKED"
  ) {
    return { label: "Blocked", className: "bg-red-50 text-red-700" };
  }
  if (
    resource.qualificationState === "DUE_SOON" ||
    resource.calibrationState === "DUE_SOON" ||
    resource.maintenanceState === "DUE_SOON" ||
    resource.cleaningState === "DUE"
  ) {
    return { label: "Attention due", className: "bg-amber-50 text-amber-700" };
  }
  return { label: "Ready", className: "bg-emerald-50 text-emerald-700" };
}

function requirementSummary(
  requirement: ManufacturingOperationResourceRequirementRecord,
) {
  const units = `${requirement.requiredUnits} unit${requirement.requiredUnits === 1 ? "" : "s"}`;
  const capacity = `capacity × ${requirement.capacityMultiplier}`;
  return `${units} · ${capacity}`;
}

export function ManufacturingRoutingResourceRequirements({
  workspaceId,
  routingName,
  versions,
}: {
  workspaceId: string;
  routingName: string;
  versions: ManufacturingRoutingVersionRecord[];
}) {
  const queryClient = useQueryClient();
  const resourcesQuery = useQuery({
    queryKey: [
      "manufacturing-blueprint",
      workspaceId,
      "routing-resource-options",
    ],
    queryFn: () => listManufacturingResources({ workspaceId, active: true }),
    enabled: Boolean(workspaceId),
  });
  const orderedVersions = useMemo(
    () =>
      [...versions].sort(
        (left, right) => right.versionNumber - left.versionNumber,
      ),
    [versions],
  );
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [selectedOperationId, setSelectedOperationId] = useState("");
  const [form, setForm] = useState<RequirementForm>(blankForm);
  const [editingRequirementId, setEditingRequirementId] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (orderedVersions.some((version) => version.id === selectedVersionId))
      return;
    setSelectedVersionId(
      orderedVersions.find((version) => version.status === "DRAFT")?.id ??
        orderedVersions[0]?.id ??
        "",
    );
  }, [orderedVersions, selectedVersionId]);

  const selectedVersion =
    orderedVersions.find((version) => version.id === selectedVersionId) ?? null;

  useEffect(() => {
    if (
      selectedVersion?.operations.some(
        (operation) => operation.id === selectedOperationId,
      )
    )
      return;
    setSelectedOperationId(selectedVersion?.operations[0]?.id ?? "");
    setForm(blankForm);
    setEditingRequirementId(null);
  }, [selectedOperationId, selectedVersion]);

  const selectedOperation =
    selectedVersion?.operations.find(
      (operation) => operation.id === selectedOperationId,
    ) ?? null;
  const resources = resourcesQuery.data ?? [];
  const missingCount =
    selectedVersion?.operations.filter(
      (operation) => (operation.resourceRequirements ?? []).length === 0,
    ).length ?? 0;
  const groupedResources = useMemo(
    () =>
      (Object.keys(kindLabels) as ManufacturingResourceKind[])
        .map((kind) => ({
          kind,
          rows: resources.filter((resource) => resource.kind === kind),
        }))
        .filter((group) => group.rows.length > 0),
    [resources],
  );

  const assign = useMutation({
    mutationFn: ({
      operationId,
      input,
    }: {
      operationId: string;
      input: Parameters<typeof assignManufacturingOperationResource>[1];
    }) => assignManufacturingOperationResource(operationId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["manufacturing", workspaceId],
      });
      setForm(blankForm);
      setEditingRequirementId(null);
      toast.success("Operation resource requirement saved.");
    },
    onError: (error) =>
      toast.error(message(error, "Resource requirement could not be saved.")),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      !selectedOperation ||
      selectedVersion?.status !== "DRAFT" ||
      !form.resourceId
    )
      return;
    const requiredUnits = Number(form.requiredUnits);
    const capacityMultiplier = Number(form.capacityMultiplier);
    if (
      !Number.isInteger(requiredUnits) ||
      requiredUnits < 1 ||
      requiredUnits > 1000
    ) {
      toast.error("Required units must be a whole number from 1 to 1000.");
      return;
    }
    if (
      !Number.isFinite(capacityMultiplier) ||
      capacityMultiplier <= 0 ||
      capacityMultiplier > 1000
    ) {
      toast.error(
        "Capacity multiplier must be greater than zero and no more than 1000.",
      );
      return;
    }
    assign.mutate({
      operationId: selectedOperation.id,
      input: {
        workspaceId,
        resourceId: form.resourceId,
        requiredUnits,
        capacityMultiplier,
        isMandatory: form.isMandatory,
        note: form.note.trim() || null,
      },
    });
  };

  const editRequirement = (
    operationId: string,
    requirement: ManufacturingOperationResourceRequirementRecord,
  ) => {
    if (selectedVersion?.status !== "DRAFT") return;
    setSelectedOperationId(operationId);
    setEditingRequirementId(requirement.id);
    setForm({
      resourceId: requirement.resourceId,
      requiredUnits: String(requirement.requiredUnits),
      capacityMultiplier: String(requirement.capacityMultiplier),
      isMandatory: requirement.isMandatory,
      note: requirement.note ?? "",
    });
  };

  if (!versions.length) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-[#dce5ef] bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5ebf3] bg-[#f7faff] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#e8f2ff] text-[#2478df]">
            <Settings2 className="h-4 w-4" />
          </span>
          <div>
            <h3 className="text-sm font-semibold text-[#203651]">
              Operation resource requirements
            </h3>
            <p className="text-[10px] text-[#718096]">
              Assign real resources to every operation before approving{" "}
              {routingName}.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedVersion ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${missingCount ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
            >
              {missingCount
                ? `${missingCount} operation${missingCount === 1 ? "" : "s"} unassigned`
                : "All operations assigned"}
            </span>
          ) : null}
          <select
            aria-label="Routing version"
            value={selectedVersionId}
            onChange={(event) => setSelectedVersionId(event.target.value)}
            className="h-8 rounded-lg border border-[#d7e1ee] bg-white px-2.5 text-xs text-[#334155] outline-none"
          >
            {orderedVersions.map((version) => (
              <option key={version.id} value={version.id}>
                v{version.versionNumber} · {version.status}
              </option>
            ))}
          </select>
        </div>
      </header>

      {selectedVersion ? (
        <>
          {selectedVersion.status === "DRAFT" ? (
            <form
              onSubmit={submit}
              className="grid gap-3 border-b border-[#e5ebf3] bg-[#fbfdff] p-4 lg:grid-cols-2 2xl:grid-cols-[minmax(180px,1.2fr)_minmax(200px,1.4fr)_110px_130px_130px_minmax(180px,1fr)_auto]"
            >
              <label className="grid gap-1 text-[10px] font-medium text-[#52647d]">
                <span>Routing operation *</span>
                <select
                  required
                  value={selectedOperationId}
                  onChange={(event) => {
                    setSelectedOperationId(event.target.value);
                    setForm(blankForm);
                    setEditingRequirementId(null);
                  }}
                  className={selectClass}
                >
                  {selectedVersion.operations.map((operation) => (
                    <option key={operation.id} value={operation.id}>
                      {operation.sequence}. {operation.code} — {operation.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[10px] font-medium text-[#52647d]">
                <span>Active resource *</span>
                <select
                  required
                  disabled={Boolean(editingRequirementId)}
                  value={form.resourceId}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      resourceId: event.target.value,
                    }))
                  }
                  className={selectClass}
                >
                  <option value="">Select a real resource…</option>
                  {groupedResources.map((group) => (
                    <optgroup key={group.kind} label={kindLabels[group.kind]}>
                      {group.rows.map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.code} — {resource.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-[10px] font-medium text-[#52647d]">
                <span>Required units *</span>
                <Input
                  required
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  value={form.requiredUnits}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      requiredUnits: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="grid gap-1 text-[10px] font-medium text-[#52647d]">
                <span>Capacity multiplier *</span>
                <Input
                  required
                  type="number"
                  min="0.000001"
                  max="1000"
                  step="0.000001"
                  value={form.capacityMultiplier}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      capacityMultiplier: event.target.value,
                    }))
                  }
                  className={inputClass}
                />
              </label>
              <label className="flex h-9 items-center gap-2 self-end rounded-lg border border-[#d7e1ee] bg-white px-3 text-xs text-[#52647d]">
                <input
                  type="checkbox"
                  checked={form.isMandatory}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isMandatory: event.target.checked,
                    }))
                  }
                />
                Mandatory
              </label>
              <label className="grid gap-1 text-[10px] font-medium text-[#52647d]">
                <span>Requirement note</span>
                <Input
                  value={form.note}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      note: event.target.value,
                    }))
                  }
                  className={inputClass}
                  placeholder="Crew, tooling or capacity note"
                />
              </label>
              <Button
                type="submit"
                size="sm"
                className="self-end"
                disabled={
                  assign.isPending ||
                  !form.resourceId ||
                  resourcesQuery.isLoading
                }
              >
                <Save className="h-3.5 w-3.5" />
                {editingRequirementId ? "Update assignment" : "Save assignment"}
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2 border-b border-[#e5ebf3] bg-[#f8fafc] px-4 py-3 text-xs text-[#60718a]">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Approved and retired routing versions are immutable. Create a new
              draft version to change resources.
            </div>
          )}

          {resourcesQuery.isError ? (
            <div className="flex items-center justify-between gap-3 border-b border-[#f0c6c0] bg-[#fff7f5] px-4 py-3 text-xs text-[#a33a2b]">
              <span>
                {message(
                  resourcesQuery.error,
                  "Resource master could not be loaded.",
                )}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void resourcesQuery.refetch()}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Retry
              </Button>
            </div>
          ) : null}
          {!resourcesQuery.isLoading &&
          !resourcesQuery.isError &&
          !resources.length &&
          selectedVersion.status === "DRAFT" ? (
            <div className="flex items-center gap-2 border-b border-[#f5d5a5] bg-[#fffaf1] px-4 py-3 text-xs text-[#9a5b08]">
              <AlertTriangle className="h-4 w-4" />
              Create at least one work center, production line, room or
              equipment master before assigning operations.
            </div>
          ) : null}

          <div className="overflow-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-[11px]">
              <thead className="bg-[#f3f7fc] text-[9px] uppercase tracking-wide text-[#718096]">
                <tr>
                  <th className="px-3 py-2.5">Seq.</th>
                  <th className="px-3 py-2.5">Operation</th>
                  <th className="px-3 py-2.5">Work center / line</th>
                  <th className="px-3 py-2.5">Assigned resources</th>
                  <th className="px-3 py-2.5">Requirement</th>
                  <th className="px-3 py-2.5">Readiness</th>
                  <th className="px-3 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {selectedVersion.operations.map((operation) => {
                  const requirements = operation.resourceRequirements ?? [];
                  return requirements.length ? (
                    requirements.map((requirement, index) => {
                      const liveResource = resources.find(
                        (resource) => resource.id === requirement.resourceId,
                      );
                      const state = liveResource
                        ? readinessState(liveResource)
                        : requirement.resource.isActive
                          ? {
                              label: "Saved",
                              className: "bg-slate-100 text-slate-600",
                            }
                          : {
                              label: "Inactive",
                              className: "bg-red-50 text-red-700",
                            };
                      return (
                        <tr
                          key={requirement.id}
                          className="border-t border-[#e5ebf3] hover:bg-[#f9fbfe]"
                        >
                          {index === 0 ? (
                            <td
                              rowSpan={requirements.length}
                              className="px-3 py-3 align-top font-semibold text-[#334155]"
                            >
                              {operation.sequence}
                            </td>
                          ) : null}
                          {index === 0 ? (
                            <td
                              rowSpan={requirements.length}
                              className="px-3 py-3 align-top"
                            >
                              <div className="font-semibold text-[#203651]">
                                {operation.name}
                              </div>
                              <div className="font-mono text-[9px] text-[#8290a4]">
                                {operation.code}
                              </div>
                            </td>
                          ) : null}
                          {index === 0 ? (
                            <td
                              rowSpan={requirements.length}
                              className="px-3 py-3 align-top text-[#60718a]"
                            >
                              <div>{operation.workCenterCode || "—"}</div>
                              <div className="text-[9px]">
                                {operation.productionLineCode || "—"}
                              </div>
                            </td>
                          ) : null}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <Factory className="h-3.5 w-3.5 text-[#2478df]" />
                              <div>
                                <div className="font-semibold text-[#334155]">
                                  {requirement.resource.name}
                                </div>
                                <div className="font-mono text-[9px] text-[#8290a4]">
                                  {requirement.resource.code} ·{" "}
                                  {kindLabels[requirement.resource.kind]}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div>{requirementSummary(requirement)}</div>
                            <div className="mt-0.5 text-[9px] text-[#718096]">
                              {requirement.isMandatory
                                ? "Mandatory"
                                : "Optional"}
                              {requirement.note ? ` · ${requirement.note}` : ""}
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span
                              className={`rounded-full px-2 py-1 text-[9px] font-semibold ${state.className}`}
                            >
                              {state.label}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            {selectedVersion.status === "DRAFT" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  editRequirement(operation.id, requirement)
                                }
                              >
                                Edit
                              </Button>
                            ) : (
                              <span className="text-[9px] text-[#8290a4]">
                                Read only
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr
                      key={operation.id}
                      className="border-t border-[#f0d8ad] bg-[#fffaf2]"
                    >
                      <td className="px-3 py-3 font-semibold text-[#334155]">
                        {operation.sequence}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-[#203651]">
                          {operation.name}
                        </div>
                        <div className="font-mono text-[9px] text-[#8290a4]">
                          {operation.code}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-[#60718a]">
                        <div>{operation.workCenterCode || "—"}</div>
                        <div className="text-[9px]">
                          {operation.productionLineCode || "—"}
                        </div>
                      </td>
                      <td colSpan={3} className="px-3 py-3 text-amber-700">
                        <span className="inline-flex items-center gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          No resource assigned
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        {selectedVersion.status === "DRAFT" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedOperationId(operation.id);
                              setForm(blankForm);
                              setEditingRequirementId(null);
                            }}
                          >
                            Assign
                          </Button>
                        ) : (
                          <span className="text-[9px] text-red-600">
                            New version required
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </section>
  );
}
