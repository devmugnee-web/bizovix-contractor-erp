"use client";
import * as React from "react";
import { Download, Printer, X } from "lucide-react";
import { PrimaryButton, SecondaryButton, StatusBadge } from "@bizovix/ui";
import { downloadInvoicePdf, useBillingProfile, useInvoice } from "@bizovix/api-client";
import { STATUS_TONE, formatDate, money } from "./shared";

export function InvoiceDetailModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const invoice = useInvoice(invoiceId);
  const billingProfile = useBillingProfile();
  const [downloading, setDownloading] = React.useState(false);

  function printInvoice() {
    document.body.classList.add("print-document-only");
    const cleanup = () => document.body.classList.remove("print-document-only");
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
  }

  async function downloadPdf() {
    if (!invoice.data) return;
    setDownloading(true);
    try {
      await downloadInvoicePdf(invoice.data.id, invoice.data.invoiceNumber);
    } finally {
      setDownloading(false);
    }
  }

  const verifiedPayment = invoice.data?.payments.find((p) => p.status === "VERIFIED");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <section
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-card-hover"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-biz-border p-4 print:hidden">
          <h2 className="text-[16px] font-bold">Invoice {invoice.data?.invoiceNumber ?? ""}</h2>
          <div className="flex items-center gap-2">
            <SecondaryButton onClick={printInvoice} disabled={!invoice.data}>
              <Printer className="h-3.5 w-3.5" />
              Print
            </SecondaryButton>
            <PrimaryButton onClick={downloadPdf} disabled={!invoice.data || downloading}>
              <Download className="h-3.5 w-3.5" />
              {downloading ? "Downloading..." : "Download PDF"}
            </PrimaryButton>
            <button aria-label="Close" onClick={onClose}>
              <X className="h-5 w-5 text-biz-muted" />
            </button>
          </div>
        </div>

        {invoice.isLoading || !invoice.data ? (
          <div className="h-72 animate-pulse bg-slate-100" />
        ) : (
          <article className="printable-document p-6 text-biz-text">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[22px] font-black text-biz-blue">BIZOVIX</p>
                <p className="text-[10px] text-biz-muted">Contractor ERP</p>
              </div>
              <div className="text-right">
                <p className="text-[16px] font-bold">INVOICE</p>
                <p className="text-[12px] text-biz-muted">{invoice.data.invoiceNumber}</p>
                <p className="text-[11px] text-biz-muted">Issued: {formatDate(invoice.data.issuedAt)}</p>
              </div>
            </div>

            <div className="mt-6 flex justify-between gap-6 border-t border-biz-border pt-4">
              <div>
                <p className="text-[10px] font-bold uppercase text-biz-muted">Bill To</p>
                <p className="mt-1 text-[13px] font-semibold">{billingProfile.data?.billingName || "—"}</p>
                {billingProfile.data?.billingAddress && <p className="text-[11px] text-biz-muted">{billingProfile.data.billingAddress}</p>}
                {billingProfile.data?.billingEmail && <p className="text-[11px] text-biz-muted">{billingProfile.data.billingEmail}</p>}
                {billingProfile.data?.phone && <p className="text-[11px] text-biz-muted">{billingProfile.data.phone}</p>}
                {billingProfile.data?.tinNumber && <p className="text-[11px] text-biz-muted">TIN: {billingProfile.data.tinNumber}</p>}
                {billingProfile.data?.binNumber && <p className="text-[11px] text-biz-muted">BIN/VAT: {billingProfile.data.binNumber}</p>}
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase text-biz-muted">Billing Period</p>
                <p className="mt-1 text-[12px] font-semibold">
                  {formatDate(invoice.data.billingPeriodStart)} - {formatDate(invoice.data.billingPeriodEnd)}
                </p>
                <p className="mt-2 text-[10px] font-bold uppercase text-biz-muted">Subscription Plan</p>
                <p className="text-[12px] font-semibold">
                  {invoice.data.planNameSnapshot} ({invoice.data.billingCycle.toLowerCase()})
                </p>
              </div>
            </div>

            <table className="mt-6 w-full text-left text-[11px]">
              <thead>
                <tr className="border-b border-biz-border text-biz-muted">
                  <th className="py-2 font-semibold">Description</th>
                  <th className="py-2 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.data.items.map((item) => (
                  <tr key={item.id} className="border-b border-biz-border">
                    <td className="py-2">{item.description}</td>
                    <td className="py-2 text-right">{money(invoice.data!.currency, item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="ml-auto mt-3 w-56 space-y-1.5 text-[12px]">
              <div className="flex justify-between">
                <span className="text-biz-muted">Subtotal</span>
                <span>{money(invoice.data.currency, invoice.data.subtotal)}</span>
              </div>
              {Number(invoice.data.discount) > 0 && (
                <div className="flex justify-between">
                  <span className="text-biz-muted">Discount</span>
                  <span>-{money(invoice.data.currency, invoice.data.discount)}</span>
                </div>
              )}
              {Number(invoice.data.tax) > 0 && (
                <div className="flex justify-between">
                  <span className="text-biz-muted">Tax / VAT</span>
                  <span>{money(invoice.data.currency, invoice.data.tax)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-biz-border pt-1.5 text-[13px] font-bold">
                <span>Total</span>
                <span>{money(invoice.data.currency, invoice.data.total)}</span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 border-t border-biz-border pt-4 text-[11px]">
              <div>
                <p className="font-bold uppercase text-biz-muted">Payment Status</p>
                <div className="mt-1">
                  <StatusBadge label={invoice.data.status} tone={STATUS_TONE[invoice.data.status] ?? "neutral"} />
                </div>
              </div>
              <div>
                <p className="font-bold uppercase text-biz-muted">Payment Method</p>
                <p className="mt-1 font-semibold">{verifiedPayment?.method ?? billingProfile.data?.paymentMethodType ?? "—"}</p>
              </div>
              <div>
                <p className="font-bold uppercase text-biz-muted">Payment Date</p>
                <p className="mt-1 font-semibold">{formatDate(invoice.data.paidAt)}</p>
              </div>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
