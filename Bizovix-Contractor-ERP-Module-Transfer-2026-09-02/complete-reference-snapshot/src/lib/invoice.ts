"use client";

import { appConfig } from "@/config/app";
import type { InvoiceExportPayload } from "@/lib/download";
import { formatCurrency, formatNumber } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import { readCompanyProfile } from "@/services/company-profile";
import type { DataMode, VoucherRecord, VoucherType } from "@/types/domain";

function getVoucherFlowLabels(voucherType: VoucherType) {
  const customerVoucher = voucherType === "sales" || voucherType === "receipt" || voucherType === "credit-note";
  const partyRoleLabel = customerVoucher ? "Customer" : "Supplier";
  const accountRoleLabel = customerVoucher ? "Accounts Receivable" : "Accounts Payable";
  const cashFlowLabel = customerVoucher ? "Cash Sale" : "Cash Purchase";

  return { partyRoleLabel, accountRoleLabel, cashFlowLabel };
}

export function buildInvoiceExportPayloadFromVoucher(mode: DataMode, voucher: VoucherRecord): InvoiceExportPayload {
  const { partyRoleLabel, accountRoleLabel, cashFlowLabel } = getVoucherFlowLabels(voucher.voucherType);
  const companyProfile = readCompanyProfile(mode, voucher.workspaceId);
  const items =
    voucher.inventoryItems?.length
      ? voucher.inventoryItems.map((item) => ({
          description: item.itemName,
          quantity: Number(item.quantity || 0),
          price: Number(item.unitPrice || 0),
          total: roundMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0)),
        }))
      : voucher.lines?.length
        ? voucher.lines.map((line) => {
            const lineTotal = roundMoney(Math.max(Number(line.debit || 0), Number(line.credit || 0)));
            return {
              description: line.description || line.ledger || voucher.particulars || voucher.voucherNumber,
              quantity: 1,
              price: lineTotal,
              total: lineTotal,
            };
          })
        : [
            {
              description: voucher.narration || voucher.particulars || voucher.voucherNumber,
              quantity: 1,
              price: Number(voucher.amount || 0),
              total: roundMoney(voucher.amount),
            },
          ];

  const subTotal = voucher.subtotal === undefined || voucher.subtotal === null
    ? sumMoney(items.map((item) => item.total))
    : roundMoney(voucher.subtotal);
  const discountAmount = roundMoney(voucher.discountAmount);
  const estimatedPercent = subTotal > 0 && discountAmount > 0 ? (discountAmount / subTotal) * 100 : 0;
  const discountLabel =
    voucher.discountType === "percent" && estimatedPercent > 0
      ? `${formatNumber(Number(estimatedPercent.toFixed(2)))}%`
      : formatCurrency(discountAmount);

  return {
    invoiceNumber: voucher.reference?.trim() || voucher.voucherNumber,
    companyName: companyProfile.companyName || appConfig.companyName,
    fromLabel: "From:",
    fromAddressLines: [companyProfile.businessAddress, companyProfile.phoneNumber, companyProfile.emailAddress].filter(Boolean),
    logoDataUrl: companyProfile.logoDataUrl,
    invoicePadDataUrl: companyProfile.invoicePadDataUrl,
    billToName: voucher.partyName || partyRoleLabel,
    billToAddressLines: [voucher.supplierAddress || "Address not provided"],
    dateLabel: voucher.voucherDate,
    note: voucher.condition || voucher.narration || voucher.particulars || "",
    paymentMode:
      voucher.settlementMode === "cash"
        ? cashFlowLabel
        : voucher.settlementMode === "bank"
          ? (voucher.lines.find((line) => line.ledger === "Mobile Financial Service Accounts") ? "MFS" : "Bank")
          : accountRoleLabel,
    paymentTarget:
      voucher.settlementMode === "cash"
        ? "Cash in Hand"
        : voucher.settlementMode === "bank"
          ? voucher.lines.find((line) => line.ledger === "Bank Accounts" || line.ledger === "Mobile Financial Service Accounts")?.ledger || "Bank Accounts"
          : `${accountRoleLabel} / ${partyRoleLabel}`,
    buyerSignature: voucher.buyerSignature || "",
    sellerSignature: voucher.sellerSignature || companyProfile.companyName || "",
    items,
    subTotal,
    discountLabel,
    discountAmount,
    total: roundMoney(voucher.amount),
  };
}
