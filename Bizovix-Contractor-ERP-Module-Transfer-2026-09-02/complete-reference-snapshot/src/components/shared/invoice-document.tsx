import type { InvoiceExportPayload } from "@/lib/download";
import { formatCurrency } from "@/lib/format";

function InvoiceBody({ payload }: { payload: InvoiceExportPayload }) {
  const quantityTotal = payload.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return (
    <>
      <div className="grid grid-cols-2 border border-[#5f6774] text-[12px] text-[#111827]">
        <div className="border-r border-[#5f6774]">
          <div className="border-b border-[#5f6774] px-3 py-1 font-semibold">{payload.billToLabel ?? "Bill To:"}</div>
          <div className="space-y-1 px-3 py-2">
            <div className="font-semibold">{payload.billToName}</div>
            {payload.billToAddressLines.map((line) => (
              <div key={line}>{line}</div>
            ))}
          </div>
        </div>
        <div>
          <div className="border-b border-[#5f6774] px-3 py-1 font-semibold">{payload.detailsLabel ?? "Invoice Details:"}</div>
          <div className="grid gap-1 px-3 py-2">
            <div>
              <span className="font-semibold">Date: </span>
              {payload.dateLabel}
            </div>
            <div>
              <span className="font-semibold">Invoice No: </span>
              {payload.invoiceNumber}
            </div>
            <div>
              <span className="font-semibold">Settlement: </span>
              {payload.paymentMode}
            </div>
          </div>
        </div>
      </div>

      <div className="border-x border-b border-[#5f6774] px-3 py-1 text-[12px] font-semibold text-[#111827]">{payload.shipToLabel ?? "Ship To:"}</div>
      <div className="border-x border-b border-[#5f6774] px-3 py-2 text-[12px] text-[#111827]">{payload.billToAddressLines.join(", ") || "N/A"}</div>

      <table className="w-full border-collapse text-[12px] text-[#111827]">
        <thead>
          <tr>
            <th className="w-[48px] border border-[#5f6774] px-2 py-2 text-left font-semibold">#</th>
            <th className="border border-[#5f6774] px-2 py-2 text-left font-semibold">Item name</th>
            <th className="w-[96px] border border-[#5f6774] px-2 py-2 text-right font-semibold">Quantity</th>
            <th className="w-[120px] border border-[#5f6774] px-2 py-2 text-right font-semibold">{payload.priceColumnLabel ?? "Price/ Unit(Tk)"}</th>
            <th className="w-[120px] border border-[#5f6774] px-2 py-2 text-right font-semibold">Amount(Tk)</th>
          </tr>
        </thead>
        <tbody>
          {payload.items.map((item, index) => (
            <tr key={`${item.description}-${index}`}>
              <td className="border border-[#5f6774] px-2 py-2 align-top">{index + 1}</td>
              <td className="border border-[#5f6774] px-2 py-2 align-top">{item.description}</td>
              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{item.quantity}</td>
              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{formatCurrency(item.price || 0)}</td>
              <td className="border border-[#5f6774] px-2 py-2 text-right align-top">{formatCurrency(item.total || 0)}</td>
            </tr>
          ))}
          <tr>
            <td className="border border-[#5f6774]" />
            <td className="border border-[#5f6774] px-2 py-2 font-semibold">Total</td>
            <td className="border border-[#5f6774] px-2 py-2 text-right font-semibold">{quantityTotal}</td>
            <td className="border border-[#5f6774]" />
            <td className="border border-[#5f6774] px-2 py-2 text-right font-semibold">{formatCurrency(payload.total)}</td>
          </tr>
        </tbody>
      </table>

      <div className="grid grid-cols-[minmax(0,1fr)_240px] border-x border-b border-[#5f6774]">
        <div className="min-h-[120px] border-r border-[#5f6774] px-3 py-3 text-[12px] text-[#111827]">
          <div className="font-semibold">{payload.noteLabel ?? "Invoice Note:"}</div>
          <div className="mt-2 whitespace-pre-wrap text-[#374151]">{payload.note || "Invoice generated from voucher editor."}</div>
        </div>
        <div className="px-3 py-3 text-[12px]">
          <div className="flex items-center justify-between border-b border-[#d7dde7] py-1">
            <span className="font-semibold">Sub Total</span>
            <span>{formatCurrency(payload.subTotal)}</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#d7dde7] py-1">
            <span className="font-semibold">Discount</span>
            <span>{payload.discountLabel}</span>
          </div>
          <div className="flex items-center justify-between border-b border-[#d7dde7] py-1">
            <span className="font-semibold">Discount Amount</span>
            <span>{formatCurrency(payload.discountAmount)}</span>
          </div>
          <div className="flex items-center justify-between py-2 text-[15px] font-bold text-[#1d3258]">
            <span>Total</span>
            <span>{formatCurrency(payload.total)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

export function InvoiceDocument({ payload, theme = "auto" }: { payload: InvoiceExportPayload; theme?: "auto" | "default" | "pad" }) {
  const hasPad = theme === "pad" ? Boolean(payload.invoicePadDataUrl) : theme === "default" ? false : Boolean(payload.invoicePadDataUrl);

  if (hasPad) {
    return (
      <div
        className="relative w-[1050px] overflow-hidden text-[#111827]"
        style={{ aspectRatio: "210 / 297", fontFamily: "Arial, Helvetica, sans-serif" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={payload.invoicePadDataUrl ?? undefined} alt="Company letterhead" className="absolute inset-0 h-full w-full object-cover" />
        {/* Page width is fixed at 1050px with a 210:297 (A4) aspect ratio, giving a
            constant 1485px height, so top/bottom offsets are hardcoded in pixels here
            rather than as CSS percentages (which resolve against the container's
            *width*, not height, and would misalign against the pad's header/footer). */}
        <div className="relative flex h-full flex-col gap-2 px-6" style={{ paddingTop: "238px", paddingBottom: "163px" }}>
          <div className="flex flex-col gap-2 bg-[rgba(255,255,255,0.95)]">
            <InvoiceBody payload={payload} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[1050px] rounded-[10px] border border-[#b6beca] bg-white p-4 text-[#111827]" style={{ fontFamily: "Arial, Helvetica, sans-serif" }}>
      <div className="pb-3 text-center text-[18px] font-bold text-[#30446b]">{payload.documentTitle ?? "Invoice"}</div>

      <div className="grid grid-cols-[96px_minmax(0,1fr)] border border-[#5f6774]">
        {payload.logoDataUrl ? (
          <div className="flex min-h-[96px] items-center justify-center bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={payload.logoDataUrl} alt="Company logo" className="max-h-full max-w-full object-contain" />
          </div>
        ) : (
          <div className="flex min-h-[96px] items-center justify-center bg-[#a7a1a1] text-[16px] font-bold tracking-[0.08em] text-white">LOGO</div>
        )}
        <div className="px-4 py-3">
          <div className="text-[18px] font-bold text-[#30446b]">{payload.companyName}</div>
          <div className="mt-2 text-[12px] text-[#111827]">{payload.fromAddressLines.join(", ") || "Trading ERP Workspace"}</div>
        </div>
      </div>

      <InvoiceBody payload={payload} />
    </div>
  );
}
