"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCreateLcCostHeadMutation, useDeleteLcCostHeadMutation, useLcCostHeadsQuery, useUpdateLcCostHeadMutation } from "@/hooks/use-lc-query";
import type { LcAllocationBasis, LcCostCategory } from "@/types/lc";

const CATEGORIES: LcCostCategory[] = ["LC_BANKING", "ORIGIN", "FREIGHT", "INSURANCE", "CUSTOMS", "TAX", "CNF", "PORT", "DESTINATION_TRANSPORT", "LOCAL", "OTHER"];
const BASES: LcAllocationBasis[] = ["PURCHASE_VALUE", "USD_VALUE", "QUANTITY", "WEIGHT", "CBM", "EQUAL"];

interface Props { open?: boolean; onOpenChange?: (open: boolean) => void; workspaceId: string; variant?: "dialog" | "page" }

export function LcCostHeadManagerDialog({ open = true, onOpenChange = () => undefined, workspaceId, variant = "dialog" }: Props) {
  const costHeadsQuery = useLcCostHeadsQuery(workspaceId, variant === "page" || open);
  const createMutation = useCreateLcCostHeadMutation();
  const updateMutation = useUpdateLcCostHeadMutation();
  const deleteMutation = useDeleteLcCostHeadMutation();
  const costHeads = costHeadsQuery.data ?? [];
  const [name, setName] = useState("");
  const [category, setCategory] = useState<LcCostCategory>("OTHER");
  const [basis, setBasis] = useState<LcAllocationBasis>("PURCHASE_VALUE");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  async function handleAdd() {
    if (!name.trim()) return setError("Cost head name is required.");
    setError(null);
    try {
      await createMutation.mutateAsync({ workspaceId, name: name.trim(), category, defaultAllocationMethod: basis });
      toast.success(`"${name.trim()}" added`);
      setName("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Cost head could not be added"); }
  }

  async function handleRename(id: string) {
    const nextName = editingName.trim();
    if (!nextName) return setError("Cost head name is required.");
    setError(null);
    try {
      await updateMutation.mutateAsync({ id, input: { name: nextName } });
      setEditingId(null); setEditingName("");
      toast.success("Cost head name updated");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Cost head name could not be updated"); }
  }

  const content = (
    <>
        <div className="border-b border-[#e3eaf3] px-6 py-5 pr-14">
          <h1 className="text-lg font-semibold text-[#14233b]">Cost Heads</h1>
          <p className="mt-1 text-sm text-[#6f7d91]">Configure the named import expenses available when entering LC costs.</p>
        </div>

        <div className="mx-6 mt-5 grid gap-3 rounded-[10px] border border-[#d7e1ee] bg-[#fbfdff] p-4">
          <div className="grid gap-2 md:grid-cols-3">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Cost head name" className="h-9" />
            <select value={category} onChange={(event) => setCategory(event.target.value as LcCostCategory)} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm">
              {CATEGORIES.map((entry) => <option key={entry} value={entry}>{entry.replace(/_/g, " ")}</option>)}
            </select>
            <select value={basis} onChange={(event) => setBasis(event.target.value as LcAllocationBasis)} className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-2 text-sm">
              {BASES.map((entry) => <option key={entry} value={entry}>{entry.replace(/_/g, " ")}</option>)}
            </select>
          </div>
          {error ? <p className="text-xs text-[#c63c3c]">{error}</p> : null}
          <div className="flex justify-end"><Button type="button" size="sm" onClick={() => void handleAdd()} disabled={createMutation.isPending}><Plus className="mr-1 h-3.5 w-3.5" /> Add Cost Head</Button></div>
        </div>

        <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-6 pb-6">
          <div className="overflow-hidden rounded-[10px] border border-[#dce5f0] bg-white">
            <table className="w-full table-fixed text-sm">
              <colgroup><col className="w-[27%]" /><col className="w-[18%]" /><col className="w-[22%]" /><col className="w-[11%]" /><col className="w-[10%]" /><col className="w-[12%]" /></colgroup>
              <thead className="sticky top-0 z-10 bg-[#f5f8fc] text-[11px] font-semibold uppercase tracking-[0.04em] text-[#718096]">
                <tr><th className="border-r border-[#e2e9f2] px-4 py-3 text-left">Cost Head Name</th><th className="border-r border-[#e2e9f2] px-4 py-3 text-left">Category</th><th className="border-r border-[#e2e9f2] px-4 py-3 text-left">Allocation Basis</th><th className="border-r border-[#e2e9f2] px-4 py-3 text-left">Type</th><th className="border-r border-[#e2e9f2] px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-[#e7edf5]">
                {costHeads.map((head) => (
                  <tr key={head.id} className="transition-colors hover:bg-[#f8fbff]">
                    <td className="border-r border-[#edf1f6] px-4 py-3 font-medium text-[#14233b]">
                      {editingId === head.id ? <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void handleRename(head.id); if (event.key === "Escape") { setEditingId(null); setEditingName(""); } }} className="h-8 w-full" autoFocus aria-label={`Edit name for ${head.name}`} /> : <span className="block truncate" title={head.name}>{head.name}</span>}
                    </td>
                    <td className="border-r border-[#edf1f6] px-4 py-3"><Badge tone="slate">{head.category.replace(/_/g, " ")}</Badge></td>
                    <td className="border-r border-[#edf1f6] px-4 py-3 text-[#52647d]"><div>{head.defaultAllocationMethod.replace(/_/g, " ")}</div>{head.fallbackAllocationMethod ? <div className="mt-0.5 text-[11px] text-[#8994a6]">Fallback: {head.fallbackAllocationMethod.replace(/_/g, " ")}</div> : null}</td>
                    <td className="border-r border-[#edf1f6] px-4 py-3">{head.isSystem ? <Badge tone="blue">Default</Badge> : <Badge tone="slate">Custom</Badge>}</td>
                    <td className="border-r border-[#edf1f6] px-4 py-3">{head.isActive ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Inactive</Badge>}</td>
                    <td className="px-4 py-3"><div className="flex items-center justify-end gap-2">
                      {editingId === head.id ? <><button type="button" disabled={updateMutation.isPending} onClick={() => void handleRename(head.id)} className="rounded-md p-1.5 text-[#16805a] hover:bg-[#ecfdf5]" title="Save name"><Check className="h-4 w-4" /></button><button type="button" onClick={() => { setEditingId(null); setEditingName(""); }} className="rounded-md p-1.5 text-[#64748b] hover:bg-[#f1f5f9]" title="Cancel"><X className="h-4 w-4" /></button></> : <button type="button" onClick={() => { setEditingId(head.id); setEditingName(head.name); setError(null); }} className="rounded-md p-1.5 text-[#315b91] hover:bg-[#eef5ff]" title="Edit name"><Pencil className="h-4 w-4" /></button>}
                      <button type="button" onClick={() => void updateMutation.mutateAsync({ id: head.id, input: { isActive: !head.isActive } })} className="whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium text-[#0f6cf6] hover:bg-[#eef5ff]">{head.isActive ? "Deactivate" : "Activate"}</button>
                      {!head.isSystem ? <button type="button" onClick={async () => { try { await deleteMutation.mutateAsync(head.id); toast.success("Cost head deleted"); } catch (cause) { toast.error(cause instanceof Error ? cause.message : "Could not delete cost head"); } }} className="rounded-md p-1.5 text-[#8994a6] hover:bg-[#fee2e2] hover:text-[#dc2626]" title="Delete"><Trash2 className="h-4 w-4" /></button> : null}
                    </div></td>
                  </tr>
                ))}
                {costHeads.length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-[#718096]">No cost heads found.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
    </>
  );

  if (variant === "page") {
    return <div className="flex h-full min-h-[720px] flex-col overflow-hidden rounded-[14px] border border-[#dce5f0] bg-white">{content}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100vh-24px)] w-[calc(100vw-24px)] max-w-none flex-col overflow-hidden p-0">{content}</DialogContent>
    </Dialog>
  );
}
