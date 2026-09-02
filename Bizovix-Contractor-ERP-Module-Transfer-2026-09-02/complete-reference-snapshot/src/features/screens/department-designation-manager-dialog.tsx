"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  useBusinessUnitsQuery,
  useCostCentersQuery,
  useCreateBusinessUnitMutation,
  useCreateCostCenterMutation,
  useCreateDepartmentMutation,
  useCreateDesignationMutation,
  useCreateDivisionMutation,
  useCreateGradeMutation,
  useCreateLocationMutation,
  useDeleteBusinessUnitMutation,
  useDeleteCostCenterMutation,
  useDeleteDepartmentMutation,
  useDeleteDesignationMutation,
  useDeleteDivisionMutation,
  useDeleteGradeMutation,
  useDeleteLocationMutation,
  useDepartmentsQuery,
  useDesignationsQuery,
  useDivisionsQuery,
  useGradesQuery,
  useLocationsQuery,
} from "@/hooks/use-hr-query";
import type { BusinessUnitRecord, CostCenterRecord, DepartmentRecord, DesignationRecord, DivisionRecord, GradeRecord, LocationRecord } from "@/types/hr";

function ListPanel<T extends DepartmentRecord | DesignationRecord | GradeRecord | BusinessUnitRecord | DivisionRecord | LocationRecord | CostCenterRecord>({
  title,
  items,
  onAdd,
  onDelete,
  adding,
  deletingId,
}: {
  title: string;
  items: T[];
  onAdd: (name: string) => void;
  onDelete: (id: string) => void;
  adding: boolean;
  deletingId: string | null;
}) {
  const [draft, setDraft] = useState("");

  function submit() {
    const name = draft.trim();
    if (!name) return;
    onAdd(name);
    setDraft("");
  }

  return (
    <div className="flex-1">
      <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[#8592a5]">{title}</h3>
      <div className="mb-2 flex gap-2">
        <Input
          className="h-9 rounded-[8px] text-[13px]"
          placeholder={`Add new ${title.toLowerCase()}...`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button onClick={submit} disabled={adding || !draft.trim()} className="h-9 shrink-0 rounded-[8px] bg-[#2f67e8] px-3 text-white hover:bg-[#2459ce]">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="max-h-[280px] overflow-y-auto rounded-[10px] border border-[#e3e9f1]">
        {items.length === 0 ? (
          <p className="px-3 py-4 text-center text-[12px] text-[#8592a5]">None yet.</p>
        ) : (
          <ul className="divide-y divide-[#eef1f6]">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between px-3 py-2 text-[13px] text-[#223754]">
                {item.name}
                <button
                  type="button"
                  onClick={() => onDelete(item.id)}
                  disabled={deletingId === item.id}
                  className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#8592a5] hover:bg-[#fdecec] hover:text-[#c2410c]"
                  aria-label={`Delete ${item.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function useSimpleListPanel<T extends { id: string; name: string }>(
  useCreate: () => { mutateAsync: (name: string) => Promise<T>; isPending: boolean; variables?: string },
  useDelete: () => { mutateAsync: (id: string) => Promise<unknown>; isPending: boolean; variables?: string },
  label: string,
) {
  const createMutation = useCreate();
  const deleteMutation = useDelete();

  async function add(name: string) {
    try {
      await createMutation.mutateAsync(name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not add ${label}.`);
    }
  }

  async function remove(id: string) {
    try {
      await deleteMutation.mutateAsync(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : `Could not delete ${label}.`);
    }
  }

  return { add, remove, adding: createMutation.isPending, deletingId: deleteMutation.isPending ? (deleteMutation.variables ?? null) : null };
}

export function DepartmentDesignationManagerDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const departmentsQuery = useDepartmentsQuery(open);
  const designationsQuery = useDesignationsQuery(open);
  const gradesQuery = useGradesQuery(open);
  const businessUnitsQuery = useBusinessUnitsQuery(open);
  const divisionsQuery = useDivisionsQuery(open);
  const locationsQuery = useLocationsQuery(open);
  const costCentersQuery = useCostCentersQuery(open);

  const department = useSimpleListPanel(useCreateDepartmentMutation, useDeleteDepartmentMutation, "department");
  const designation = useSimpleListPanel(useCreateDesignationMutation, useDeleteDesignationMutation, "designation");
  const businessUnit = useSimpleListPanel(useCreateBusinessUnitMutation, useDeleteBusinessUnitMutation, "business unit");
  const division = useSimpleListPanel(useCreateDivisionMutation, useDeleteDivisionMutation, "division");
  const location = useSimpleListPanel(useCreateLocationMutation, useDeleteLocationMutation, "location");
  const costCenter = useSimpleListPanel(useCreateCostCenterMutation, useDeleteCostCenterMutation, "cost center");

  const createGradeMutation = useCreateGradeMutation();
  const deleteGradeMutation = useDeleteGradeMutation();
  async function addGrade(name: string) {
    try {
      await createGradeMutation.mutateAsync({ name });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add grade.");
    }
  }
  async function removeGrade(id: string) {
    try {
      await deleteGradeMutation.mutateAsync(id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete grade.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(94vw,860px)] max-h-[85vh] overflow-y-auto rounded-[16px] p-0">
        <div className="border-b border-[#e1e7f0] px-5 py-4">
          <DialogTitle className="text-[18px] font-semibold text-[#203553]">Organization & Job Structure</DialogTitle>
          <DialogDescription className="mt-1 text-[12px] text-[#77869c]">
            Add or remove the values employees can be assigned to. Deleting one clears it from employees that used it.
          </DialogDescription>
        </div>
        <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
          <ListPanel title="Departments" items={departmentsQuery.data ?? []} onAdd={department.add} onDelete={department.remove} adding={department.adding} deletingId={department.deletingId} />
          <ListPanel title="Designations" items={designationsQuery.data ?? []} onAdd={designation.add} onDelete={designation.remove} adding={designation.adding} deletingId={designation.deletingId} />
          <ListPanel title="Grades" items={gradesQuery.data ?? []} onAdd={addGrade} onDelete={removeGrade} adding={createGradeMutation.isPending} deletingId={deleteGradeMutation.isPending ? (deleteGradeMutation.variables ?? null) : null} />
          <ListPanel title="Business Units" items={businessUnitsQuery.data ?? []} onAdd={businessUnit.add} onDelete={businessUnit.remove} adding={businessUnit.adding} deletingId={businessUnit.deletingId} />
          <ListPanel title="Divisions" items={divisionsQuery.data ?? []} onAdd={division.add} onDelete={division.remove} adding={division.adding} deletingId={division.deletingId} />
          <ListPanel title="Locations" items={locationsQuery.data ?? []} onAdd={location.add} onDelete={location.remove} adding={location.adding} deletingId={location.deletingId} />
          <ListPanel title="Cost Centers" items={costCentersQuery.data ?? []} onAdd={costCenter.add} onDelete={costCenter.remove} adding={costCenter.adding} deletingId={costCenter.deletingId} />
        </div>
        <div className="flex justify-end border-t border-[#e1e7f0] bg-[#fbfcfe] px-5 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-[9px] px-4 text-[12px]">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
