import type { VoucherFormInput, VoucherLine, VoucherType } from "@/types/domain";
import { MONEY_MINOR_UNIT_SCALE, moneyToMinorUnits, normalizeBalancedMoneyLines, roundMoney } from "@/lib/money";

export { roundMoney as roundCurrencyAmount } from "@/lib/money";

export interface VoucherTemplate {
  partyLabel: string;
  narration: string;
  lines: Array<Pick<VoucherLine, "ledger" | "description" | "debit" | "credit" | "costCenter" | "project" | "billReference">>;
}

export type PostingSide = "debit" | "credit";

const templateMap: Record<VoucherType, VoucherTemplate> = {
  contra: {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Dutch Bangla Bank", description: "Bank deposit", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Cash in Hand", description: "Cash transferred", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  payment: {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Accounts Payable", description: "Supplier payment", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Dutch Bangla Bank", description: "Bank payment", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  receipt: {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Cash in Hand", description: "Cash received", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Accounts Receivable", description: "Customer receipt", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  journal: {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Office Expense", description: "Expense booked", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Outstanding Liability", description: "Accrual posted", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  sales: {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Accounts Receivable", description: "Customer receivable", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Sales Account", description: "Sales revenue", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  purchase: {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Purchase Account", description: "Purchase booked", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Accounts Payable", description: "Supplier payable", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  expense: {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Office Expense", description: "Operating expense booked", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Cash in Hand", description: "Cash paid", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  revenue: {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Accounts Receivable", description: "Revenue receivable raised", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Consultancy Income", description: "Revenue recognized", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  "credit-note": {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Sales Return", description: "Sales return booked", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Accounts Receivable", description: "Customer adjusted", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
  "debit-note": {
    partyLabel: "",
    narration: "",
    lines: [
      { ledger: "Accounts Payable", description: "Supplier adjusted", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
      { ledger: "Purchase Return", description: "Purchase return booked", debit: 0, credit: 0, costCenter: "Head Office", project: "Trading", billReference: "" },
    ],
  },
};

export function getVoucherTemplate(voucherType: VoucherType) {
  return templateMap[voucherType];
}

export function inferLinePostingSide(voucherType: VoucherType, index: number): PostingSide {
  if (voucherType === "contra" || voucherType === "journal") {
    return index === 0 ? "debit" : "credit";
  }

  return index === 0 ? "debit" : "credit";
}

export function resolveLinePostingSide(
  voucherType: VoucherType,
  index: number,
  line: Pick<VoucherLine, "debit" | "credit"> | undefined,
): PostingSide {
  if (line && Number(line.debit || 0) > 0 && Number(line.credit || 0) <= 0) {
    return "debit";
  }

  if (line && Number(line.credit || 0) > 0 && Number(line.debit || 0) <= 0) {
    return "credit";
  }

  return inferLinePostingSide(voucherType, index);
}

// documentKind values for the sales-order-to-invoice chain that must never
// carry a financial (debit/credit) effect — mirrors NON_FINANCIAL_SALES_DOCUMENT_KINDS
// in apps/api/src/vouchers/vouchers.service.ts so the local/demo data mode enforces
// the same "record of intent, not a ledger entry" rule as the real API.
const NON_FINANCIAL_SALES_DOCUMENT_KINDS = new Set(["quotation", "proforma", "sale-order", "delivery-note"]);

function roundOptionalMoney(value: number | null | undefined): number | undefined {
  return value === null || value === undefined ? undefined : roundMoney(value);
}

/**
 * Normalize every persisted document-money field at the same boundary as its
 * debit/credit lines. Quantities and loyalty point counts are deliberately not
 * rounded as currency.
 */
export function normalizeVoucherMoneyInput(input: VoucherFormInput): VoucherFormInput {
  return {
    ...input,
    paidAmount: roundOptionalMoney(input.paidAmount),
    discountAmount: roundOptionalMoney(input.discountAmount),
    roundOffAmount: roundOptionalMoney(input.roundOffAmount),
    loyaltyDiscountAmount: roundOptionalMoney(input.loyaltyDiscountAmount),
    subtotal: roundOptionalMoney(input.subtotal),
    totalAmount: roundOptionalMoney(input.totalAmount),
    lines: normalizeBalancedMoneyLines(input.lines),
    // Unit price is a valuation rate, not a posted line total. It may need
    // 4-6 decimal places so quantity x rate can reconcile with the rounded GL
    // amount; the final monetary posting is rounded separately.
    inventoryItems: input.inventoryItems?.map((item) => ({ ...item })),
  };
}

export function validateVoucherInput(input: VoucherFormInput) {
  const normalizedInput = normalizeVoucherMoneyInput(input);

  if (normalizedInput.voucherType === "sales" && NON_FINANCIAL_SALES_DOCUMENT_KINDS.has(normalizedInput.documentKind?.trim() ?? "")) {
    return { debit: 0, credit: 0, lines: [], input: normalizedInput };
  }

  const nonEmptyLines = normalizedInput.lines.filter((line) => {
    const amountPresent = Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0;
    return line.ledger.trim().length > 0 || amountPresent;
  });

  if (nonEmptyLines.length < 2) {
    throw new Error("At least two accounting lines are required.");
  }

  const invalidLedger = nonEmptyLines.find((line) => !line.ledger.trim());
  if (invalidLedger) {
    throw new Error("Each active row must include a ledger name.");
  }

  const twoSidedLine = nonEmptyLines.find((line) => Number(line.debit || 0) > 0 && Number(line.credit || 0) > 0);
  if (twoSidedLine) {
    throw new Error("A single line cannot contain both debit and credit.");
  }

  const emptyAmountLine = nonEmptyLines.find((line) => Number(line.debit || 0) <= 0 && Number(line.credit || 0) <= 0);
  if (emptyAmountLine) {
    throw new Error("Each active row must carry either a debit or a credit amount.");
  }

  // Sum integer minor units instead of raw JavaScript decimals. LC-derived unit
  // costs can carry more than two decimals internally even though BDT postings
  // and the UI use two decimals.
  const debitMinorUnits = nonEmptyLines.reduce((total, line) => total + moneyToMinorUnits(line.debit || 0), 0);
  const creditMinorUnits = nonEmptyLines.reduce((total, line) => total + moneyToMinorUnits(line.credit || 0), 0);
  const debit = debitMinorUnits / MONEY_MINOR_UNIT_SCALE;
  const credit = creditMinorUnits / MONEY_MINOR_UNIT_SCALE;

  if (debit <= 0 || credit <= 0) {
    throw new Error("A voucher must contain both debit and credit sides.");
  }

  if (debitMinorUnits !== creditMinorUnits) {
    throw new Error("Total debit and total credit must be equal.");
  }

  switch (normalizedInput.voucherType) {
    // Sales and purchase direction is determined by their generated ledger
    // lines. Comparing total debit with total credit cannot validate direction
    // because every valid voucher must have equal totals; the old raw-number
    // comparison only rejected harmless floating-point residue.
    case "sales":
    case "purchase":
      break;
    case "expense":
      if (!nonEmptyLines.some((line) => Number(line.debit || 0) > 0) || !nonEmptyLines.some((line) => Number(line.credit || 0) > 0)) {
        throw new Error("Expense voucher must debit the expense ledger and credit cash, bank, or payable.");
      }
      break;
    case "revenue":
      if (!nonEmptyLines.some((line) => Number(line.debit || 0) > 0) || !nonEmptyLines.some((line) => Number(line.credit || 0) > 0)) {
        throw new Error("Revenue voucher must debit receivable or cash and credit the revenue ledger.");
      }
      break;
    case "receipt":
      if (!nonEmptyLines.some((line) => Number(line.debit || 0) > 0) || !nonEmptyLines.some((line) => Number(line.credit || 0) > 0)) {
        throw new Error("Receipt voucher must debit cash/bank and credit the source ledger.");
      }
      break;
    case "payment":
      if (!nonEmptyLines.some((line) => Number(line.credit || 0) > 0) || !nonEmptyLines.some((line) => Number(line.debit || 0) > 0)) {
        throw new Error("Payment voucher must credit cash/bank and debit the destination ledger.");
      }
      break;
    default:
      break;
  }

  const lines = nonEmptyLines.map((line) => ({
    ...line,
    ledger: line.ledger.trim(),
    description: line.description.trim(),
    debit: roundMoney(line.debit || 0),
    credit: roundMoney(line.credit || 0),
    costCenter: line.costCenter?.trim(),
    project: line.project?.trim(),
    billReference: line.billReference?.trim(),
  }));

  return {
    debit,
    credit,
    lines,
    input: { ...normalizedInput, lines },
  };
}
