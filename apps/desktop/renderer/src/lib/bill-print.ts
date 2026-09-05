import type { ProjectBillRecord } from "@bizovix/types";
import { BILL_STATUS_META } from "./project-bills";

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const amount = (value: string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Client-facing allowlist. Do not spread costing data or internal remarks into this document. */
export function billPrintHtml(bill: ProjectBillRecord) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(bill.billNo)}</title><style>
    body{font:12px Arial,sans-serif;color:#162447;margin:32px}h1{font-size:22px;margin-bottom:8px}p{line-height:1.6}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{border-bottom:1px solid #dde3ed;padding:9px 6px;text-align:left;vertical-align:top}th{background:#edf2f8;font-size:11px}.number{text-align:right;white-space:nowrap}.totals{margin:20px 0 0 auto;max-width:350px}.totals p{display:flex;justify-content:space-between;gap:20px;margin:8px 0}.net{font-size:15px;font-weight:bold;border-top:1px solid #aaa;padding-top:10px}@page{size:A4;margin:15mm}@media print{body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}
  </style></head><body><h1>Bill Submission</h1><p><strong>${escape(bill.billNo)}</strong> · ${escape(BILL_STATUS_META[bill.status].label)}<br>
  Project: ${escape(bill.cmsWork.workName)}<br>Organization: ${escape(bill.cmsWork.organizationMaster?.shortName ?? "—")}<br>
  Tender ID: ${escape(bill.cmsWork.tender?.egpTenderId ?? "—")} · Contract: ${escape(bill.contract.contractNo)}<br>Bill Date: ${escape(bill.billDate.slice(0, 10))}</p>
  <table><thead><tr><th>SL</th><th>Product / Work</th><th>Unit</th><th class="number">Previous Qty</th><th class="number">Current Qty</th><th class="number">Rate (BDT)</th><th class="number">Amount (BDT)</th></tr></thead><tbody>
  ${bill.items.map((item, index) => `<tr><td>${index + 1}</td><td>${escape(item.description)}</td><td>${escape(item.unit)}</td><td class="number">${Number(item.previousQty)}</td><td class="number">${Number(item.currentQty)}</td><td class="number">${amount(item.approvedRate)}</td><td class="number">${amount(item.currentValue)}</td></tr>`).join("")}
  </tbody></table><div class="totals">
  ${[["Work Value", bill.grossWorkValue], ["Approved Additions", bill.approvedAdditions], ["Gross Bill", bill.grossBillAmount], ["Retention", bill.retentionAmount], ["VAT", bill.vatAmount], ["Tax / AIT", bill.aitAmount], ["Other Deductions", bill.otherDeductionAmount]].map(([label, value]) => `<p><span>${label}</span><span>BDT ${amount(value!)}</span></p>`).join("")}
  <p class="net"><span>Net Amount</span><span>BDT ${amount(bill.netCertifiedAmount)}</span></p></div></body></html>`;
}
