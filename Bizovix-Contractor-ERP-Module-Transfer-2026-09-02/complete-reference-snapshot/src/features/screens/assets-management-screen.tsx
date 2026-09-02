"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Edit2, Landmark, Plus, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AppDateInput } from "@/components/shared/app-date-input";
import { AddAssetWizardDialog } from "@/features/screens/add-asset-wizard-dialog";
import { AssetCategoryManagerDialog } from "@/features/screens/asset-category-manager-dialog";
import { CoaViewerDialog } from "@/features/screens/coa-viewer-dialog";
import {
  useAssetCategoriesQuery,
  useDeleteFixedAssetMutation,
  useDepreciationPreviewQuery,
  useFixedAssetsQuery,
  usePostDepreciationMutation,
  useUpdateFixedAssetMutation,
} from "@/hooks/use-fixed-assets-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FixedAssetRecord, UpdateFixedAssetInput } from "@/types/fixed-assets";

function statusLabel(status: FixedAssetRecord["status"]) {
  if (status === "DISPOSED") return "Disposed";
  if (status === "FULLY_DEPRECIATED") return "Fully Depreciated";
  return "Active";
}

function statusTone(status: FixedAssetRecord["status"]) {
  if (status === "DISPOSED") return "border-[#c7d1df] bg-[#f1f4f8] text-[#4d6078]";
  if (status === "FULLY_DEPRECIATED") return "border-[#edc16e] bg-[#fff5df] text-[#995300]";
  return "border-[#8fd2ad] bg-[#e7f7ee] text-[#08783d]";
}

function operationalStatusLabel(status: FixedAssetRecord["operationalStatus"]) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function AssetsManagementScreen() {
  const searchParams = useSearchParams();
  const { session } = useSessionContext();
  const assetsQuery = useFixedAssetsQuery(Boolean(session?.workspaceId));
  const categoriesQuery = useAssetCategoriesQuery(Boolean(session?.workspaceId));
  const postDepreciationMutation = usePostDepreciationMutation();
  const updateMutation = useUpdateFixedAssetMutation();
  const deleteMutation = useDeleteFixedAssetMutation();

  const [wizardOpen, setWizardOpen] = useState(false);
  const assetPrefill = useMemo(() => {
    if (searchParams.get("create") !== "asset") return undefined;
    return {
      name: searchParams.get("name") ?? "",
      purchaseDate: searchParams.get("purchaseDate") ?? new Date().toISOString().slice(0, 10),
      purchaseCost: searchParams.get("purchaseCost") ?? "",
    };
  }, [searchParams]);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [coaViewerOpen, setCoaViewerOpen] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [deleteConfirmAssetId, setDeleteConfirmAssetId] = useState<string | null>(null);

  const [depreciationAssetId, setDepreciationAssetId] = useState<string | null>(null);
  const previewQuery = useDepreciationPreviewQuery(depreciationAssetId, Boolean(session?.workspaceId));
  const [periodEnd, setPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [customDepreciationAmount, setCustomDepreciationAmount] = useState("");

  const [viewAssetId, setViewAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (assetPrefill) setWizardOpen(true);
  }, [assetPrefill]);

  const assets = assetsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const depreciationAsset = assets.find((asset) => asset.id === depreciationAssetId) ?? null;
  const viewAsset = assets.find((asset) => asset.id === viewAssetId) ?? null;

  const filteredAssets = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return assets.filter((asset) => {
      if (categoryFilter !== "all" && asset.categoryId !== categoryFilter) return false;
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;
      if (!term) return true;
      return (
        asset.name.toLowerCase().includes(term) ||
        asset.assetCode.toLowerCase().includes(term) ||
        (asset.serialNumber ?? "").toLowerCase().includes(term) ||
        (asset.registrationNumber ?? "").toLowerCase().includes(term)
      );
    });
  }, [assets, categoryFilter, statusFilter, searchTerm]);

  async function handlePostDepreciation() {
    if (!session?.workspaceId || !depreciationAssetId) return;
    try {
      const customAmount = customDepreciationAmount ? Number(customDepreciationAmount) : undefined;
      const updated = await postDepreciationMutation.mutateAsync({
        assetId: depreciationAssetId,
        input: { workspaceId: session.workspaceId, periodEnd, customAmount },
      });
      toast.success(`Depreciation posted for ${updated.name} — ${formatCurrency(updated.accumulatedDepreciation - (depreciationAsset?.accumulatedDepreciation ?? 0))}`);
      setDepreciationAssetId(null);
      setCustomDepreciationAmount("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Depreciation could not be posted");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#eaf1ff] text-[#2f67e8]">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[1.6rem] font-semibold text-[#14233b]">Assets Management</div>
            <p className="mt-0.5 text-sm text-[#6f7d91]">
              Fixed assets from the Chart of Accounts, with straight-line depreciation posting.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setCoaViewerOpen(true)} className="rounded-md">
            <Landmark className="h-4 w-4" />
            Chart of Accounts
          </Button>
          <Button type="button" variant="outline" onClick={() => setCategoryManagerOpen(true)} className="rounded-md">
            <Settings2 className="h-4 w-4" />
            Categories
          </Button>
          <Button type="button" onClick={() => setWizardOpen(true)} className="rounded-md">
            <Plus className="h-4 w-4" />
            Add Asset
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[8px] border border-[#d7e1ee] bg-white p-3">
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by name, asset code, serial or registration number"
          className="h-9 max-w-xs"
        />
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
          className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm text-[#3c4a60]"
        >
          <option value="all">All Categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          className="h-9 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm text-[#3c4a60]"
        >
          <option value="all">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="FULLY_DEPRECIATED">Fully Depreciated</option>
          <option value="DISPOSED">Disposed</option>
        </select>
        <span className="text-xs text-[#8994a6]">{filteredAssets.length} of {assets.length} assets</span>
      </div>

      <div className="overflow-hidden rounded-[8px] border border-[#d7e1ee] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="bg-[#fbfdff] text-xs font-semibold uppercase tracking-[0.06em] text-[#6f7d91]">
              <tr>
                <th className="border-b border-[#e7edf5] px-4 py-3 text-left">Asset</th>
                <th className="border-b border-[#e7edf5] px-4 py-3 text-left">Category</th>
                <th className="border-b border-[#e7edf5] px-4 py-3 text-left">Purchase Date</th>
                <th className="border-b border-[#e7edf5] px-4 py-3 text-right">Cost</th>
                <th className="border-b border-[#e7edf5] px-4 py-3 text-right">Accum. Depreciation</th>
                <th className="border-b border-[#e7edf5] px-4 py-3 text-right">Net Book Value</th>
                <th className="border-b border-[#e7edf5] px-4 py-3 text-center">Status</th>
                <th className="border-b border-[#e7edf5] px-4 py-3 text-center">Depreciation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f8]">
              {assetsQuery.isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#8994a6]">
                    Loading assets...
                  </td>
                </tr>
              ) : filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-[#8994a6]">
                    {assets.length === 0 ? 'No fixed assets yet. Click "+ Add Asset" to register one.' : "No assets match your filters."}
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset) => (
                  <tr key={asset.id} className="cursor-pointer hover:bg-[#fbfdff]" onClick={() => setViewAssetId(asset.id)}>
                    <td className="px-4 py-3">
                      <button type="button" className="font-medium text-[#0f6cf6] hover:underline" onClick={(event) => { event.stopPropagation(); setViewAssetId(asset.id); }}>
                        {asset.name}
                      </button>
                      <div className="text-xs text-[#8994a6]">{asset.assetCode} · Ledger {asset.assetLedgerCode}</div>
                    </td>
                    <td className="px-4 py-3 text-[#3c4a60]">{asset.categoryName ?? asset.category ?? "—"}</td>
                    <td className="px-4 py-3 text-[#3c4a60]">{formatDate(asset.purchaseDate)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{formatCurrency(asset.capitalizedCost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#c9682c]">{formatCurrency(asset.accumulatedDepreciation)}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#14233b]">{formatCurrency(asset.netBookValue)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", statusTone(asset.status))}>
                        {statusLabel(asset.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditAssetId(asset.id)}
                          className="px-2"
                          title="Edit asset details"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirmAssetId(asset.id)}
                          className="px-2 text-[#dc2626] hover:bg-[#fee2e2]"
                          title="Delete asset"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={asset.status !== "ACTIVE"}
                          onClick={() => {
                            setDepreciationAssetId(asset.id);
                            setPeriodEnd(new Date().toISOString().slice(0, 10));
                            setCustomDepreciationAmount("");
                          }}
                        >
                          Post Depreciation
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AddAssetWizardDialog open={wizardOpen} onOpenChange={setWizardOpen} initialValues={assetPrefill} />
      <AssetCategoryManagerDialog open={categoryManagerOpen} onOpenChange={setCategoryManagerOpen} />
      <CoaViewerDialog open={coaViewerOpen} onOpenChange={setCoaViewerOpen} />

      <Dialog open={Boolean(depreciationAssetId)} onOpenChange={(open) => !open && setDepreciationAssetId(null)}>
        <DialogContent className="w-[min(92vw,460px)]">
          <DialogTitle>Post Depreciation</DialogTitle>
          <DialogDescription className="mt-1">{depreciationAsset?.name}</DialogDescription>

          <div className="mt-4 grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Period Ending</span>
              <AppDateInput value={periodEnd} onChange={setPeriodEnd} />
            </label>
            {previewQuery.data ? (
              previewQuery.data.fullyDepreciated ? (
                <p className="rounded-[6px] bg-[#fff5df] px-3 py-2 text-sm text-[#995300]">This asset is already fully depreciated.</p>
              ) : (
                <>
                  <div className="rounded-[6px] border border-[#d7e1ee] bg-[#fbfdff] px-3 py-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#6f7d91]">Suggested amount (straight-line)</span>
                      <span className="font-semibold text-[#14233b]">{formatCurrency(previewQuery.data.suggestedAmount)}</span>
                    </div>
                    <div className="mt-1 flex justify-between">
                      <span className="text-[#6f7d91]">Remaining before salvage value</span>
                      <span className="text-[#3c4a60]">{formatCurrency(previewQuery.data.remaining)}</span>
                    </div>
                  </div>
                  <label className="grid gap-1.5">
                    <span className="text-sm font-medium text-[#334155]">Custom Amount (optional)</span>
                    <Input
                      money
                      type="number"
                      min="0"
                      step="0.01"
                      value={customDepreciationAmount}
                      onChange={(event) => setCustomDepreciationAmount(event.target.value)}
                      placeholder={`Leave blank to use suggested ${formatCurrency(previewQuery.data.suggestedAmount)}`}
                    />
                    <span className="text-xs text-[#8994a6]">For accelerated depreciation, adjustments, or catch-up entries. Must not exceed remaining amount.</span>
                  </label>
                </>
              )
            ) : null}
          </div>

          <div className="mt-5 flex justify-end gap-3 border-t border-[#e9edf3] pt-4">
            <Button type="button" variant="outline" onClick={() => setDepreciationAssetId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handlePostDepreciation()}
              disabled={postDepreciationMutation.isPending || previewQuery.data?.fullyDepreciated}
            >
              {postDepreciationMutation.isPending ? "Posting..." : "Post Depreciation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewAssetId)} onOpenChange={(open) => !open && setViewAssetId(null)}>
        <DialogContent className="w-[min(92vw,680px)] max-h-[85vh] overflow-y-auto">
          {viewAsset ? (
            <>
              <div className="flex items-start justify-between gap-4 pr-8">
                <div>
                  <DialogTitle>{viewAsset.name}</DialogTitle>
                  <DialogDescription className="mt-1 flex items-center gap-2">
                    <span>{viewAsset.assetCode} · Ledger {viewAsset.assetLedgerCode} · {viewAsset.categoryName ?? viewAsset.category ?? "Uncategorized"}</span>
                    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", statusTone(viewAsset.status))}>
                      {statusLabel(viewAsset.status)}
                    </span>
                  </DialogDescription>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 rounded-[8px] border border-[#e7edf5] bg-[#fbfdff] p-4 text-sm sm:grid-cols-3">
                <div>
                  <div className="text-xs text-[#8994a6]">Purchase Date</div>
                  <div className="font-medium text-[#1f2f46]">{formatDate(viewAsset.purchaseDate)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#8994a6]">Capitalized Cost</div>
                  <div className="font-medium text-[#1f2f46]">{formatCurrency(viewAsset.capitalizedCost)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#8994a6]">Salvage Value</div>
                  <div className="font-medium text-[#1f2f46]">{formatCurrency(viewAsset.salvageValue)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#8994a6]">Useful Life</div>
                  <div className="font-medium text-[#1f2f46]">{viewAsset.usefulLifeMonths} months</div>
                </div>
                <div>
                  <div className="text-xs text-[#8994a6]">Accumulated Depreciation</div>
                  <div className="font-medium text-[#c9682c]">{formatCurrency(viewAsset.accumulatedDepreciation)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#8994a6]">Net Book Value</div>
                  <div className="font-semibold text-[#14233b]">{formatCurrency(viewAsset.netBookValue)}</div>
                </div>
                <div>
                  <div className="text-xs text-[#8994a6]">Condition</div>
                  <div className="font-medium text-[#1f2f46]">{viewAsset.condition.replace(/_/g, " ")}</div>
                </div>
                <div>
                  <div className="text-xs text-[#8994a6]">Operational Status</div>
                  <div className="font-medium text-[#1f2f46]">{operationalStatusLabel(viewAsset.operationalStatus)}</div>
                </div>
                {viewAsset.supplierName ? (
                  <div>
                    <div className="text-xs text-[#8994a6]">Supplier (on credit)</div>
                    <div className="font-medium text-[#1f2f46]">{viewAsset.supplierName}</div>
                  </div>
                ) : null}
                {viewAsset.brand || viewAsset.model || viewAsset.manufacturer ? (
                  <div className="col-span-full">
                    <div className="text-xs text-[#8994a6]">Brand / Model / Manufacturer</div>
                    <div className="font-medium text-[#1f2f46]">{[viewAsset.brand, viewAsset.model, viewAsset.manufacturer].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                ) : null}
                {viewAsset.serialNumber || viewAsset.registrationNumber ? (
                  <div className="col-span-full">
                    <div className="text-xs text-[#8994a6]">Serial / Registration Number</div>
                    <div className="font-medium text-[#1f2f46]">{[viewAsset.serialNumber, viewAsset.registrationNumber].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                ) : null}
                {viewAsset.location || viewAsset.department || viewAsset.assignedToName ? (
                  <div className="col-span-full">
                    <div className="text-xs text-[#8994a6]">Location / Department / Assigned To</div>
                    <div className="font-medium text-[#1f2f46]">{[viewAsset.location, viewAsset.department, viewAsset.assignedToName].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                ) : null}
                {viewAsset.notes ? (
                  <div className="col-span-full">
                    <div className="text-xs text-[#8994a6]">Notes</div>
                    <div className="text-[#3c4a60]">{viewAsset.notes}</div>
                  </div>
                ) : null}
              </div>

              <div className="mt-4">
                <div className="mb-2 text-sm font-semibold text-[#334155]">Depreciation History</div>
                {viewAsset.depreciationHistory.length === 0 ? (
                  <p className="rounded-[6px] border border-[#e7edf5] px-3 py-4 text-center text-sm text-[#8994a6]">
                    No depreciation posted yet.
                  </p>
                ) : (
                  <div className="overflow-hidden rounded-[6px] border border-[#e7edf5]">
                    <table className="w-full text-sm">
                      <thead className="bg-[#fbfdff] text-xs font-semibold uppercase tracking-[0.05em] text-[#8994a6]">
                        <tr>
                          <th className="border-b border-[#e7edf5] px-3 py-2 text-left">Period</th>
                          <th className="border-b border-[#e7edf5] px-3 py-2 text-left">Voucher</th>
                          <th className="border-b border-[#e7edf5] px-3 py-2 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#edf2f8]">
                        {viewAsset.depreciationHistory.map((entry) => (
                          <tr key={entry.voucherNumber}>
                            <td className="px-3 py-2 text-[#3c4a60]">{formatDate(entry.periodStart)} – {formatDate(entry.periodEnd)}</td>
                            <td className="px-3 py-2 text-[#3c4a60]">{entry.voucherNumber}</td>
                            <td className="px-3 py-2 text-right font-medium tabular-nums text-[#1f2f46]">{formatCurrency(entry.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="mt-5 flex justify-end border-t border-[#e9edf3] pt-4">
                <Button type="button" variant="outline" onClick={() => setViewAssetId(null)}>
                  Close
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Edit Asset Dialog */}
      <EditAssetDialog
        assetId={editAssetId}
        assets={assets}
        categories={categories}
        onOpenChange={(open) => !open && setEditAssetId(null)}
        onSave={async (input) => {
          try {
            await updateMutation.mutateAsync({ assetId: editAssetId!, input });
            toast.success("Asset details updated");
            setEditAssetId(null);
          } catch (error) {
            toast.error(error instanceof Error ? error.message : "Update failed");
          }
        }}
        isPending={updateMutation.isPending}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={Boolean(deleteConfirmAssetId)} onOpenChange={(open) => !open && setDeleteConfirmAssetId(null)}>
        <DialogContent className="w-[min(92vw,420px)]">
          <DialogTitle>Delete Asset</DialogTitle>
          {deleteConfirmAssetId && assets.find((a) => a.id === deleteConfirmAssetId) && (
            <DialogDescription className="mt-2">
              Delete <strong>{assets.find((a) => a.id === deleteConfirmAssetId)?.name}</strong>? This cannot be undone. If the opening balance is already posted, use Dispose instead.
            </DialogDescription>
          )}

          <div className="mt-6 flex justify-end gap-3 border-t border-[#e9edf3] pt-4">
            <Button type="button" variant="outline" onClick={() => setDeleteConfirmAssetId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#dc2626] hover:bg-[#b91c1c]"
              onClick={() => {
                if (!deleteConfirmAssetId) return;
                void (async () => {
                  try {
                    await deleteMutation.mutateAsync(deleteConfirmAssetId);
                    toast.success("Asset deleted");
                    setDeleteConfirmAssetId(null);
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Delete failed");
                  }
                })();
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface EditAssetDialogProps {
  assetId: string | null;
  assets: FixedAssetRecord[];
  categories: Array<{ id: string; name: string }> | undefined;
  onOpenChange: (open: boolean) => void;
  onSave: (input: UpdateFixedAssetInput) => Promise<void>;
  isPending: boolean;
}

function EditAssetDialog({ assetId, assets, categories, onOpenChange, onSave, isPending }: EditAssetDialogProps) {
  const asset = assets.find((a) => a.id === assetId) ?? null;
  const [form, setForm] = useState({
    name: asset?.name ?? "",
    categoryId: asset?.categoryId ?? "",
    location: asset?.location ?? "",
    department: asset?.department ?? "",
    assignedToName: asset?.assignedToName ?? "",
    brand: asset?.brand ?? "",
    model: asset?.model ?? "",
    manufacturer: asset?.manufacturer ?? "",
    serialNumber: asset?.serialNumber ?? "",
    registrationNumber: asset?.registrationNumber ?? "",
    condition: asset?.condition ?? "GOOD",
    operationalStatus: asset?.operationalStatus ?? "AVAILABLE",
    notes: asset?.notes ?? "",
    salvageValue: asset?.salvageValue?.toString() ?? "0",
    usefulLifeMonths: asset?.usefulLifeMonths?.toString() ?? "60",
  });

  if (!asset) return null;

  const handleSubmit = async () => {
    const input: UpdateFixedAssetInput = {
      name: form.name.trim() || asset.name,
      categoryId: form.categoryId || null,
      location: form.location.trim() || undefined,
      department: form.department.trim() || undefined,
      assignedToName: form.assignedToName.trim() || undefined,
      brand: form.brand.trim() || undefined,
      model: form.model.trim() || undefined,
      manufacturer: form.manufacturer.trim() || undefined,
      serialNumber: form.serialNumber.trim() || undefined,
      registrationNumber: form.registrationNumber.trim() || undefined,
      condition: form.condition as "NEW" | "EXCELLENT" | "GOOD" | "FAIR" | "POOR" | "DAMAGED",
      operationalStatus: form.operationalStatus as "AVAILABLE" | "ASSIGNED" | "ACTIVE" | "UNDER_MAINTENANCE" | "DAMAGED" | "LOST" | "RETIRED",
      notes: form.notes.trim() || undefined,
      salvageValue: Number(form.salvageValue) || 0,
      usefulLifeMonths: Math.round(Number(form.usefulLifeMonths)) || 60,
    };
    await onSave(input);
  };

  return (
    <Dialog open={Boolean(assetId)} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(92vw,640px)] max-h-[90vh] overflow-y-auto">
        <div className="pr-8">
          <DialogTitle>Edit Asset</DialogTitle>
          <DialogDescription className="mt-1">{asset.assetCode} — {asset.name}</DialogDescription>
        </div>

        <div className="mt-4 grid gap-4">
          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[#334155]">Asset Name</span>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[#334155]">Category</span>
            <select
              value={form.categoryId}
              onChange={(event) => setForm({ ...form, categoryId: event.target.value })}
              className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm"
            >
              <option value="">Uncategorized</option>
              {categories?.map((category: { id: string; name: string }) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Location</span>
              <Input value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Department</span>
              <Input value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} />
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[#334155]">Assigned To</span>
            <Input value={form.assignedToName} onChange={(event) => setForm({ ...form, assignedToName: event.target.value })} />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Brand</span>
              <Input value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Model</span>
              <Input value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Manufacturer</span>
              <Input value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Serial Number</span>
              <Input value={form.serialNumber} onChange={(event) => setForm({ ...form, serialNumber: event.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Registration Number</span>
              <Input value={form.registrationNumber} onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })} />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Condition</span>
              <select value={form.condition} onChange={(event) => setForm({ ...form, condition: event.target.value as any })} className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm">
                {["NEW", "EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"].map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Operational Status</span>
              <select value={form.operationalStatus} onChange={(event) => setForm({ ...form, operationalStatus: event.target.value as any })} className="h-10 rounded-[6px] border border-[#d7e1ee] bg-white px-3 text-sm">
                {["AVAILABLE", "ASSIGNED", "ACTIVE", "UNDER_MAINTENANCE", "DAMAGED", "LOST", "RETIRED"].map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="grid gap-1.5">
            <span className="text-sm font-medium text-[#334155]">Notes</span>
            <textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="rounded-[6px] border border-[#d7e1ee] px-3 py-2 text-sm" />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Salvage Value</span>
              <Input money type="number" min="0" step="0.01" value={form.salvageValue} onChange={(event) => setForm({ ...form, salvageValue: event.target.value })} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm font-medium text-[#334155]">Useful Life (months)</span>
              <Input type="number" min="1" step="1" value={form.usefulLifeMonths} onChange={(event) => setForm({ ...form, usefulLifeMonths: event.target.value })} />
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-[#e9edf3] pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
