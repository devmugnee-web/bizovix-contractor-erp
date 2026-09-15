"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Calculator, PackageCheck, Plus, Save } from "lucide-react";
import { useAssetCategories, useAssetDashboard, useBankAccounts, useCreateAssetCategory, useCreateFixedAsset, useFixedAssets, useParties, usePostAssetDepreciation } from "@bizovix/api-client";
import { FormField, PrimaryButton, SecondaryButton, SelectInput, TextInput } from "@bizovix/ui";
import { formatAmount } from "@bizovix/utils";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";

const today = () => new Date().toISOString().slice(0, 10);
const money = (value: string | number | undefined) => formatAmount(value ?? 0);

export function FixedAssetsWorkspace() {
  useSetBreadcrumb([{ label: "Assets Management" }, { label: "Asset Register" }]);
  const searchParams = useSearchParams();
  const dashboard = useAssetDashboard(), categories = useAssetCategories(), assets = useFixedAssets({ limit: 100 });
  const banks = useBankAccounts(), suppliers = useParties({ roles: "SUPPLIER,VENDOR", status: "ACTIVE", limit: 200 });
  const createCategory = useCreateAssetCategory(), createAsset = useCreateFixedAsset(), depreciate = usePostAssetDepreciation();
  const [showAssetForm, setShowAssetForm] = React.useState(() => searchParams.get("action") === "new"), [showCategoryForm, setShowCategoryForm] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [category, setCategory] = React.useState({ name: "", code: "", defaultUsefulLifeMonths: "60" });
  const [asset, setAsset] = React.useState({ name: "", categoryId: "", supplierId: "", fundingMode: "CASH_BANK", fundingBankAccountId: "", purchaseDate: today(), purchaseCost: "", salvageValue: "0", usefulLifeMonths: "60", location: "", department: "" });
  const stats = dashboard.data;

  React.useEffect(() => {
    if (searchParams.get("view") === "depreciation") document.querySelector("section:last-of-type")?.scrollIntoView({ block: "start" });
  }, [searchParams]);

  async function saveCategory(event: React.FormEvent) {
    event.preventDefault();
    try { await createCategory.mutateAsync({ name: category.name, code: category.code, defaultUsefulLifeMonths: Number(category.defaultUsefulLifeMonths) }); setCategory({ name: "", code: "", defaultUsefulLifeMonths: "60" }); setShowCategoryForm(false); setNotice("Asset category created."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not create category."); }
  }
  async function saveAsset(event: React.FormEvent) {
    event.preventDefault();
    try { await createAsset.mutateAsync({ name: asset.name, categoryId: asset.categoryId, supplierId: asset.supplierId || undefined, fundingMode: asset.fundingMode as "CASH_BANK" | "CREDIT" | "OPENING_BALANCE", fundingBankAccountId: asset.fundingMode === "CASH_BANK" ? asset.fundingBankAccountId : undefined, purchaseDate: asset.purchaseDate, purchaseCost: Number(asset.purchaseCost), salvageValue: Number(asset.salvageValue), usefulLifeMonths: Number(asset.usefulLifeMonths), location: asset.location || undefined, department: asset.department || undefined }); setAsset((value) => ({ ...value, name: "", purchaseCost: "", salvageValue: "0" })); setShowAssetForm(false); setNotice("Asset acquired and accounting entry posted."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not acquire asset."); }
  }
  async function postMonthly(id: string) {
    const now = new Date(), start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10), end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    try { await depreciate.mutateAsync({ id, periodStart: start, periodEnd: end }); setNotice("Monthly depreciation posted."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Could not post depreciation."); }
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-page-title text-biz-text">Assets Management</h1><p className="mt-1 text-sm text-biz-muted">Asset register, acquisition and depreciation posting</p></div><div className="flex gap-2"><SecondaryButton onClick={() => setShowCategoryForm((value) => !value)}><Plus className="h-4 w-4" /> Category</SecondaryButton><PrimaryButton onClick={() => setShowAssetForm((value) => !value)}><PackageCheck className="h-4 w-4" /> Acquire Asset</PrimaryButton></div></div>
    {notice && <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-biz-blue">{notice}</div>}
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ["Total Assets", stats?.totalAssets ?? 0], ["Capitalized Cost", `৳ ${money(stats?.capitalizedCost)}`], ["Accumulated Depreciation", `৳ ${money(stats?.accumulatedDepreciation)}`], ["Net Book Value", `৳ ${money(stats?.netBookValue)}`],
    ].map(([label, value]) => <div key={label} className="rounded-lg border border-biz-border bg-white p-4 shadow-card"><p className="text-xs font-semibold text-biz-muted">{label}</p><p className="mt-2 text-xl font-bold text-biz-text">{value}</p></div>)}</div>

    {showCategoryForm && <form onSubmit={saveCategory} className="grid gap-3 rounded-lg border border-biz-border bg-white p-4 shadow-card md:grid-cols-4"><FormField label="Category Name" required><TextInput value={category.name} onChange={(event) => setCategory({ ...category, name: event.target.value })} required /></FormField><FormField label="Code" required><TextInput value={category.code} onChange={(event) => setCategory({ ...category, code: event.target.value.toUpperCase() })} required /></FormField><FormField label="Useful Life (months)" required><TextInput type="number" min="1" value={category.defaultUsefulLifeMonths} onChange={(event) => setCategory({ ...category, defaultUsefulLifeMonths: event.target.value })} required /></FormField><div className="flex items-end"><PrimaryButton type="submit" disabled={createCategory.isPending}><Save className="h-4 w-4" /> Save Category</PrimaryButton></div></form>}

    {showAssetForm && <form onSubmit={saveAsset} className="rounded-lg border border-biz-border bg-white p-4 shadow-card"><h2 className="font-bold text-biz-text">Acquire Fixed Asset</h2><div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4"><FormField label="Asset Name" required><TextInput value={asset.name} onChange={(event) => setAsset({ ...asset, name: event.target.value })} required /></FormField><FormField label="Category" required><SelectInput value={asset.categoryId} onChange={(event) => { const selected = categories.data?.find((row) => row.id === event.target.value); setAsset({ ...asset, categoryId: event.target.value, usefulLifeMonths: String(selected?.defaultUsefulLifeMonths ?? asset.usefulLifeMonths) }); }} options={(categories.data ?? []).filter((row) => row.isActive).map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` }))} placeholder="Select category" required /></FormField><FormField label="Purchase Date" required><TextInput type="date" value={asset.purchaseDate} onChange={(event) => setAsset({ ...asset, purchaseDate: event.target.value })} required /></FormField><FormField label="Purchase Cost" required><TextInput type="number" min="0.01" step="0.01" value={asset.purchaseCost} onChange={(event) => setAsset({ ...asset, purchaseCost: event.target.value })} required /></FormField><FormField label="Funding Mode" required><SelectInput value={asset.fundingMode} onChange={(event) => setAsset({ ...asset, fundingMode: event.target.value })} options={[{ value: "CASH_BANK", label: "Cash / Bank" }, { value: "CREDIT", label: "Supplier Credit" }, { value: "OPENING_BALANCE", label: "Opening Asset" }]} /></FormField>{asset.fundingMode === "CASH_BANK" && <FormField label="Paid From" required><SelectInput value={asset.fundingBankAccountId} onChange={(event) => setAsset({ ...asset, fundingBankAccountId: event.target.value })} options={(banks.data ?? []).map((row) => ({ value: row.id, label: row.accountName }))} placeholder="Select account" required /></FormField>}{asset.fundingMode === "CREDIT" && <FormField label="Supplier" required><SelectInput value={asset.supplierId} onChange={(event) => setAsset({ ...asset, supplierId: event.target.value })} options={(suppliers.data?.items ?? []).map((row) => ({ value: row.id, label: `${row.code} - ${row.name}` }))} placeholder="Select supplier" required /></FormField>}<FormField label="Salvage Value"><TextInput type="number" min="0" step="0.01" value={asset.salvageValue} onChange={(event) => setAsset({ ...asset, salvageValue: event.target.value })} /></FormField><FormField label="Useful Life (months)" required><TextInput type="number" min="1" value={asset.usefulLifeMonths} onChange={(event) => setAsset({ ...asset, usefulLifeMonths: event.target.value })} required /></FormField><FormField label="Location"><TextInput value={asset.location} onChange={(event) => setAsset({ ...asset, location: event.target.value })} /></FormField><FormField label="Department"><TextInput value={asset.department} onChange={(event) => setAsset({ ...asset, department: event.target.value })} /></FormField></div><div className="mt-4 flex justify-end"><PrimaryButton type="submit" disabled={createAsset.isPending}><Save className="h-4 w-4" /> {createAsset.isPending ? "Posting..." : "Save & Post Acquisition"}</PrimaryButton></div></form>}

    <section className="rounded-lg border border-biz-border bg-white shadow-card"><div className="border-b border-biz-border p-4"><h2 className="font-bold text-biz-text">Asset Register</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-biz-bg"><tr>{["Code", "Asset", "Category", "Location", "Capitalized", "Accum. Dep.", "Net Book Value", "Status", "Action"].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{assets.isLoading ? <tr><td colSpan={9} className="p-8 text-center text-biz-muted">Loading asset register…</td></tr> : !assets.data?.items.length ? <tr><td colSpan={9} className="p-8 text-center text-biz-muted">No fixed assets recorded yet.</td></tr> : assets.data.items.map((row) => <tr key={row.id} className="border-t border-biz-border"><td className="px-4 py-3 font-semibold">{row.assetCode}</td><td className="px-4 py-3">{row.name}</td><td className="px-4 py-3">{row.assetCategory?.name ?? "—"}</td><td className="px-4 py-3">{row.location ?? "—"}</td><td className="px-4 py-3 text-right">{money(row.capitalizedCost)}</td><td className="px-4 py-3 text-right">{money(row.accumulatedDepreciation)}</td><td className="px-4 py-3 text-right font-semibold">{money(row.netBookValue)}</td><td className="px-4 py-3">{row.status.replaceAll("_", " ")}</td><td className="px-4 py-3"><SecondaryButton size="sm" onClick={() => postMonthly(row.id)} disabled={row.status !== "ACTIVE" || depreciate.isPending}><Calculator className="h-3.5 w-3.5" /> Depreciate</SecondaryButton></td></tr>)}</tbody></table></div></section>
  </div>;
}
