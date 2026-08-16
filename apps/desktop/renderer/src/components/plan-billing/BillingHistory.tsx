"use client";
import * as React from "react";
import { StatusBadge } from "@bizovix/ui";
import { useInvoices } from "@bizovix/api-client";
import { Card, STATUS_TONE, formatDate, money } from "./shared";
import { InvoiceDetailModal } from "./InvoiceDetailModal";

export function BillingHistory() {
  const [page, setPage] = React.useState(1);
  const invoices = useInvoices({ page, limit: 10 });
  const [selected, setSelected] = React.useState<string | null>(null);

  return (
    <Card title="Billing History">
      {invoices.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-9 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : invoices.isError ? (
        <p className="p-8 text-center text-biz-muted">Unable to load billing information.</p>
      ) : !invoices.data?.items.length ? (
        <p className="p-8 text-center text-biz-muted">No billing history available yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-[11px]">
            <thead className="bg-[#f4f7fb] text-[10px]">
              <tr>
                {["Invoice", "Billing Date", "Plan", "Billing Period", "Amount", "Status", "Action"].map((h) => (
                  <th key={h} className="px-3 py-2.5">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.data.items.map((inv) => (
                <tr key={inv.id} className="border-t border-biz-border">
                  <td className="px-3 py-2.5 font-semibold">{inv.invoiceNumber}</td>
                  <td className="px-3 py-2.5">{formatDate(inv.issuedAt)}</td>
                  <td className="px-3 py-2.5">{inv.planNameSnapshot}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatDate(inv.billingPeriodStart)} - {formatDate(inv.billingPeriodEnd)}
                  </td>
                  <td className="px-3 py-2.5 font-semibold">{money(inv.currency, inv.total)}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge label={inv.status} tone={STATUS_TONE[inv.status] ?? "neutral"} />
                  </td>
                  <td className="px-3 py-2.5">
                    <button className="rounded border px-2 py-1 hover:text-biz-blue" onClick={() => setSelected(inv.id)}>
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {invoices.data && invoices.data.meta.totalPages > 1 && (
        <div className="mt-3 flex justify-end gap-2 text-[11px]">
          {Array.from({ length: invoices.data.meta.totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={p === page ? "font-bold text-biz-blue" : "text-biz-muted"}
            >
              {p}
            </button>
          ))}
        </div>
      )}
      {selected && <InvoiceDetailModal invoiceId={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}
