import { Prisma } from "@bizovix/database";
import type { SaveSalesQuotationCostingDto } from "./dto/sales-quotation.dto";
import {
  SALES_QUOTATION_MONEY_PATTERN,
  SALES_QUOTATION_PERCENT_PATTERN,
  SALES_QUOTATION_QUANTITY_PATTERN,
} from "./dto/sales-quotation.dto";

const MAX_MONEY = new Prisma.Decimal("9999999999999999.99");
const MAX_MARGIN = new Prisma.Decimal("999.9999");

function parse(value: string, pattern: RegExp, label: string) {
  if (!pattern.test(value)) throw new Error(`${label} has an invalid precision or range`);
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new Error(`${label} must be a valid decimal number`);
  }
}

export function validateCostingInput(dto: SaveSalesQuotationCostingDto) {
  if (!dto.items.length) throw new Error("At least one costing item is required");
  dto.items.forEach((item, index) => {
    const quantity = parse(
      item.quantity,
      SALES_QUOTATION_QUANTITY_PATTERN,
      `Item ${index + 1} quantity`,
    );
    if (!quantity.gt(0)) throw new Error(`Item ${index + 1} quantity must be greater than zero`);
    parse(item.unitCost, SALES_QUOTATION_MONEY_PATTERN, `Item ${index + 1} unit cost`);
    parse(item.unitPrice, SALES_QUOTATION_MONEY_PATTERN, `Item ${index + 1} unit price`);
    parse(item.taxPct ?? "0", SALES_QUOTATION_PERCENT_PATTERN, `Item ${index + 1} tax percentage`);
  });
  (dto.overheads ?? []).forEach((row, index) =>
    parse(row.amount, SALES_QUOTATION_MONEY_PATTERN, `Overhead ${index + 1} amount`),
  );
  parse(dto.vatRate ?? "0", SALES_QUOTATION_PERCENT_PATTERN, "VAT rate");
}

export function validateCalculatedCosting(
  result: ReturnType<typeof import("./sales-quotation-calculation").calculateSalesQuotationCosting>,
) {
  const moneyValues = [
    ...result.items.flatMap((row) => [row.totalCost, row.taxAmount, row.totalPrice, row.profit]),
    result.totalCost,
    result.itemTaxTotal,
    result.totalSelling,
    result.overheadTotal,
    result.subtotalBeforeVat,
    result.vatAmount,
    result.grandTotal,
  ];
  if (moneyValues.some((value) => value.abs().gt(MAX_MONEY)))
    throw new Error("Calculated costing exceeds the supported monetary range");
  if (result.items.some((row) => row.marginPct.abs().gt(MAX_MARGIN)))
    throw new Error("Calculated margin exceeds the supported range");
}

export function neutralizeCsvCell(value: unknown) {
  const raw = String(value ?? "");
  return /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
}
