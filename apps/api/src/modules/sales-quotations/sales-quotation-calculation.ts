import { Prisma } from "@bizovix/database";

export interface CostingInput {
  items: Array<{ description: string; quantity: string; unit: string; unitCost: string; taxPct?: string; unitPrice: string }>;
  overheads?: Array<{ description: string; amount: string }>;
  vatApplicable?: boolean;
  vatRate?: string;
}

const ZERO = new Prisma.Decimal(0);
const money = (value: Prisma.Decimal) => value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const percent = (value: Prisma.Decimal) => value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);

export function calculateSalesQuotationCosting(input: CostingInput) {
  const items = input.items.map((item, sortOrder) => {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitCost = new Prisma.Decimal(item.unitCost);
    const taxPct = new Prisma.Decimal(item.taxPct ?? 0);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    const totalCost = money(quantity.mul(unitCost));
    const taxAmount = money(totalCost.mul(taxPct).div(100));
    const totalPrice = money(quantity.mul(unitPrice));
    const profit = money(totalPrice.sub(totalCost));
    const marginPct = totalPrice.isZero() ? ZERO : percent(profit.div(totalPrice).mul(100));
    return { ...item, quantity, unitCost, taxPct, unitPrice, totalCost, taxAmount, totalPrice, profit, marginPct, sortOrder };
  });
  const overheads = (input.overheads ?? []).map((row, sortOrder) => ({ ...row, amount: money(new Prisma.Decimal(row.amount)), sortOrder }));
  const sum = (values: Prisma.Decimal[]) => values.reduce((total, value) => total.add(value), ZERO);
  const totalCost = money(sum(items.map((item) => item.totalCost)));
  const itemTaxTotal = money(sum(items.map((item) => item.taxAmount)));
  const totalSelling = money(sum(items.map((item) => item.totalPrice)));
  const overheadTotal = money(sum(overheads.map((item) => item.amount)));
  const subtotalBeforeVat = money(totalSelling.add(itemTaxTotal).add(overheadTotal));
  const vatApplicable = input.vatApplicable ?? false;
  const vatRate = vatApplicable ? new Prisma.Decimal(input.vatRate ?? 0) : ZERO;
  const vatAmount = vatApplicable ? money(subtotalBeforeVat.mul(vatRate).div(100)) : ZERO;
  const grandTotal = money(subtotalBeforeVat.add(vatAmount));
  return { items, overheads, totalCost, itemTaxTotal, totalSelling, overheadTotal, subtotalBeforeVat, vatApplicable, vatRate, vatAmount, grandTotal };
}
