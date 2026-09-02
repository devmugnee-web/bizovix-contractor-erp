"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { AppDateInput } from "@/components/shared/app-date-input";
import { ErrorPanel } from "@/components/shared/error-panel";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLcDetailQuery, useUpdateLcMutation } from "@/hooks/use-lc-query";
import { formatCurrency } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import type { CreateLcItemInput } from "@/types/lc";

const initialForm = {
  lcDate: "",
  supplierName: "",
  supplierCountry: "",
  lcType: "",
  purchaseOrderRef: "",
  piReference: "",
  bankName: "",
  bankBranch: "",
  exchangeRate: "",
  incoterm: "",
  originPort: "",
  destinationPort: "",
  expiryDate: "",
  remarks: "",
};

type DraftItem = CreateLcItemInput & { key: string };

function emptyItem(): DraftItem {
  return { key: Math.random().toString(36).slice(2), productName: "", unit: "pcs", quantity: 1, usdUnitPrice: 0 };
}

export function EditLcPageScreen({ lcId }: { lcId: string }) {
  const router = useRouter();
  const query = useLcDetailQuery(lcId, true);
  const updateMutation = useUpdateLcMutation();
  const lc = query.data;

  const [form, setForm] = useState(initialForm);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lc) return;
    setForm({
      lcDate: lc.lcDate.slice(0, 10),
      supplierName: lc.supplierName,
      supplierCountry: lc.supplierCountry ?? "",
      lcType: lc.lcType ?? "",
      purchaseOrderRef: lc.purchaseOrderRef ?? "",
      piReference: lc.piReference ?? "",
      bankName: lc.bankName ?? "",
      bankBranch: lc.bankBranch ?? "",
      exchangeRate: String(lc.exchangeRate),
      incoterm: lc.incoterm ?? "",
      originPort: lc.originPort ?? "",
      destinationPort: lc.destinationPort ?? "",
      expiryDate: lc.expiryDate?.slice(0, 10) ?? "",
      remarks: lc.remarks ?? "",
    });
    setItems(
      lc.items.map((item) => ({
        key: item.id,
        inventoryItemId: item.inventoryItemId ?? undefined,
        productName: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        usdUnitPrice: item.usdUnitPrice,
        acceptedBdtUnitPrice: item.acceptedBdtUnitPrice ?? undefined,
        weight: item.weight ?? undefined,
        cbm: item.cbm ?? undefined,
        hsCode: item.hsCode ?? undefined,
      })),
    );
    setError(null);
  }, [lc]);

  if (query.isLoading) return <LoadingPanel lines={8} />;
  if (query.error || !lc) {
    return <ErrorPanel title="LC unavailable" description="This LC could not be loaded for editing." onRetry={() => query.refetch()} />;
  }

  const productsLocked = lc.grns.length > 0;
  const exchangeRate = Number(form.exchangeRate || 0);

  function updateField<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateItem(key: string, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function itemTotalBdt(item: DraftItem) {
    const effectiveUnit = roundMoney(
      item.acceptedBdtUnitPrice && item.acceptedBdtUnitPrice > 0 ? item.acceptedBdtUnitPrice : item.usdUnitPrice * exchangeRate,
    );
    return roundMoney(effectiveUnit * item.quantity);
  }

  const grandTotalBdt = sumMoney(items.map(itemTotalBdt));

  async function handleSave() {
    if (!form.supplierName.trim() || exchangeRate <= 0) {
      setError("Supplier name and a valid exchange rate are required.");
      return;
    }
    if (!productsLocked) {
      if (!items.length) {
        setError("Add at least one product.");
        return;
      }
      for (const item of items) {
        if (!item.productName.trim()) { setError("Every product needs a name."); return; }
        if (!item.quantity || item.quantity <= 0) { setError("Every product needs a quantity greater than zero."); return; }
      }
    }
    setError(null);
    try {
      await updateMutation.mutateAsync({
        id: lcId,
        input: {
          lcDate: form.lcDate,
          supplierName: form.supplierName.trim(),
          supplierCountry: form.supplierCountry.trim() || undefined,
          lcType: form.lcType.trim() || undefined,
          purchaseOrderRef: form.purchaseOrderRef.trim() || undefined,
          piReference: form.piReference.trim() || undefined,
          bankName: form.bankName.trim() || undefined,
          bankBranch: form.bankBranch.trim() || undefined,
          exchangeRate,
          incoterm: form.incoterm.trim() || undefined,
          originPort: form.originPort.trim() || undefined,
          destinationPort: form.destinationPort.trim() || undefined,
          expiryDate: form.expiryDate || undefined,
          remarks: form.remarks.trim() || undefined,
          items: productsLocked
            ? undefined
            : items.map((item) => ({
                inventoryItemId: item.inventoryItemId || undefined,
                productName: item.productName.trim(),
                unit: item.unit || "pcs",
                quantity: item.quantity,
                usdUnitPrice: item.usdUnitPrice,
                acceptedBdtUnitPrice: item.acceptedBdtUnitPrice,
                weight: item.weight,
                cbm: item.cbm,
                hsCode: item.hsCode,
              })),
        },
      });
      toast.success(`LC "${lc!.lcNumber}" updated`);
      router.push(`/app/lc-management/${lcId}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "LC could not be updated");
    }
  }

  return (
    <section className="h-full rounded-[12px] border border-[#d7e1ee] bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#14233b]">Edit LC · {lc.lcNumber}</h1>
          <p className="mt-1 text-sm text-[#6f7d91]">Update LC information{productsLocked ? "" : " and products"}. Cost postings and allocations are managed separately.</p>
        </div>
        <button
          type="button"
          onClick={() => router.push(`/app/lc-management/${lcId}`)}
          aria-label="Close LC edit"
          title="Close"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#cbd5e1] bg-white text-[#475569] shadow-sm transition-colors hover:border-[#ef9a9a] hover:bg-[#fff1f1] hover:text-[#c62828]"
        >
          <X className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>

      <div className="mt-5 grid gap-3">
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">LC Date *</span><AppDateInput value={form.lcDate} onChange={(value) => updateField("lcDate", value)} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Supplier Name *</span><Input value={form.supplierName} onChange={(event) => updateField("supplierName", event.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Supplier Country</span><Input value={form.supplierCountry} onChange={(event) => updateField("supplierCountry", event.target.value)} /></label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">LC Type</span><Input value={form.lcType} onChange={(event) => updateField("lcType", event.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Purchase Order Ref</span><Input value={form.purchaseOrderRef} onChange={(event) => updateField("purchaseOrderRef", event.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">PI Reference</span><Input value={form.piReference} onChange={(event) => updateField("piReference", event.target.value)} /></label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Bank</span><Input value={form.bankName} onChange={(event) => updateField("bankName", event.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Bank Branch</span><Input value={form.bankBranch} onChange={(event) => updateField("bankBranch", event.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Exchange Rate (1 {lc.currency} = ? BDT) *</span><Input type="number" step="0.0001" value={form.exchangeRate} onChange={(event) => updateField("exchangeRate", event.target.value)} /></label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Incoterm</span><Input value={form.incoterm} onChange={(event) => updateField("incoterm", event.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Origin Port</span><Input value={form.originPort} onChange={(event) => updateField("originPort", event.target.value)} /></label>
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Destination Port</span><Input value={form.destinationPort} onChange={(event) => updateField("destinationPort", event.target.value)} /></label>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Expiry Date</span><AppDateInput value={form.expiryDate} onChange={(value) => updateField("expiryDate", value)} /></label>
        </div>
        <label className="grid gap-1.5"><span className="text-sm font-medium text-[#334155]">Remarks</span><Input value={form.remarks} onChange={(event) => updateField("remarks", event.target.value)} /></label>

        <div className="mt-2 flex items-center justify-between">
          <span className="text-sm font-medium text-[#334155]">Products *</span>
          {!productsLocked ? (
            <button type="button" onClick={() => setItems((current) => [...current, emptyItem()])} className="inline-flex items-center gap-1 text-xs font-semibold text-[#0f6cf6] hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add product
            </button>
          ) : null}
        </div>
        {productsLocked ? (
          <p className="rounded-lg border border-[#ead7b0] bg-[#fff8e8] px-3 py-2 text-sm text-[#8a5a13]">
            Products are locked — goods have already been received (GRN recorded) against this LC, so quantities and prices can no longer be changed here.
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-[8px] border border-[#e7edf5]">
          <table className="w-full min-w-[1150px] table-fixed text-sm">
            <colgroup>
              <col className="w-[20%]" /><col className="w-[8%]" /><col className="w-[8%]" /><col className="w-[12%]" /><col className="w-[14%]" /><col className="w-[9%]" /><col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[4%]" />
            </colgroup>
            <thead className="bg-[#f7faff] text-xs uppercase text-[#8994a6]">
              <tr>
                <th className="px-2 py-2 text-left">Product Name</th>
                <th className="px-2 py-2 text-left">Unit</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">USD/Unit</th>
                <th className="px-2 py-2 text-right">Accepted BDT/Unit</th>
                <th className="px-2 py-2 text-right">Weight</th>
                <th className="px-2 py-2 text-right">CBM</th>
                <th className="px-2 py-2 text-left">HS Code</th>
                <th className="px-2 py-2 text-right">Total BDT</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.key} className="border-t border-[#eef2f7]">
                  <td className="px-2 py-1.5"><Input disabled={productsLocked} value={item.productName} onChange={(event) => updateItem(item.key, { productName: event.target.value })} className="h-9 w-full" /></td>
                  <td className="px-2 py-1.5"><Input disabled={productsLocked} value={item.unit} onChange={(event) => updateItem(item.key, { unit: event.target.value })} className="h-9 w-full" /></td>
                  <td className="px-2 py-1.5"><Input disabled={productsLocked} type="number" value={item.quantity} onChange={(event) => updateItem(item.key, { quantity: Number(event.target.value) || 0 })} className="h-9 w-full text-right" /></td>
                  <td className="px-2 py-1.5"><Input disabled={productsLocked} money type="number" value={item.usdUnitPrice > 0 ? item.usdUnitPrice : ""} onChange={(event) => updateItem(item.key, { usdUnitPrice: Number(event.target.value) || 0 })} className="h-9 w-full text-right" /></td>
                  <td className="px-2 py-1.5"><Input disabled={productsLocked} money type="number" value={item.acceptedBdtUnitPrice && item.acceptedBdtUnitPrice > 0 ? item.acceptedBdtUnitPrice : ""} onChange={(event) => updateItem(item.key, { acceptedBdtUnitPrice: event.target.value ? Number(event.target.value) : undefined })} className="h-9 w-full text-right" /></td>
                  <td className="px-2 py-1.5"><Input disabled={productsLocked} type="number" value={item.weight ?? ""} onChange={(event) => updateItem(item.key, { weight: event.target.value ? Number(event.target.value) : undefined })} className="h-9 w-full text-right" /></td>
                  <td className="px-2 py-1.5"><Input disabled={productsLocked} type="number" value={item.cbm ?? ""} onChange={(event) => updateItem(item.key, { cbm: event.target.value ? Number(event.target.value) : undefined })} className="h-9 w-full text-right" /></td>
                  <td className="px-2 py-1.5"><Input disabled={productsLocked} value={item.hsCode ?? ""} onChange={(event) => updateItem(item.key, { hsCode: event.target.value })} className="h-9 w-full" /></td>
                  <td className="px-2 py-1.5"><div className="flex h-9 items-center justify-end rounded-[6px] border border-[#e7edf5] bg-[#f8fafc] px-3 font-medium text-[#334155]">{formatCurrency(itemTotalBdt(item))}</div></td>
                  <td className="px-2 py-1.5">
                    {!productsLocked ? (
                      <button type="button" onClick={() => setItems((current) => (current.length === 1 ? current : current.filter((entry) => entry.key !== item.key)))} disabled={items.length === 1} className="rounded-md p-1.5 text-[#8994a6] hover:bg-[#fee2e2] hover:text-[#dc2626] disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-[#e7edf5] bg-[#fbfdff]">
                <td colSpan={8} className="px-2 py-2 text-right text-sm font-medium text-[#6f7d91]">Total Purchase Cost</td>
                <td className="px-2 py-2 text-right font-semibold text-[#14233b]">{formatCurrency(grandTotalBdt)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>

        {error ? <p className="text-sm text-[#c63c3c]">{error}</p> : null}
      </div>

      <div className="mt-5 flex justify-end gap-3 border-t border-[#e9edf3] pt-4">
        <Button type="button" variant="outline" onClick={() => router.push(`/app/lc-management/${lcId}`)}>Cancel</Button>
        <Button type="button" onClick={() => void handleSave()} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </section>
  );
}
