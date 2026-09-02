import { BadRequestException } from "@nestjs/common";
import { LcAllocationBasis, LcAllocationMode, Prisma } from "@bizovix/database";
import type { SaveAllocationDto } from "./dto/lc.dto";

const D = (value: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(value ?? 0);
const money = (value: Prisma.Decimal | number | string) => D(value).toDecimalPlaces(4);

export interface LcAllocationItem {
  id: string;
  totalPurchaseCostBdt: Prisma.Decimal;
  foreignUnitPrice: Prisma.Decimal;
  quantity: Prisma.Decimal;
  weight: Prisma.Decimal | null;
  cbm: Prisma.Decimal | null;
}

export function lcBasisValue(item: LcAllocationItem, basis: LcAllocationBasis) {
  if (basis === "PURCHASE_VALUE") return item.totalPurchaseCostBdt;
  if (basis === "USD_VALUE") return item.foreignUnitPrice.mul(item.quantity);
  if (basis === "QUANTITY") return item.quantity;
  if (basis === "WEIGHT") return item.weight ?? D(0);
  if (basis === "CBM") return item.cbm ?? D(0);
  return D(1);
}

export function allocateLcCost(items: LcAllocationItem[], amount: Prisma.Decimal, dto: SaveAllocationDto) {
  if (!items.length) throw new BadRequestException("LC has no products to allocate");
  const rowById = new Map(dto.rows.map((row) => [row.lcItemId, row]));
  if (rowById.size !== items.length || items.some((item) => !rowById.has(item.id))) throw new BadRequestException("Allocation must contain every LC product exactly once");
  const basis = (dto.allocationBasis ?? "PURCHASE_VALUE") as LcAllocationBasis;
  const mode = dto.allocationMode as LcAllocationMode;
  const values = items.map((item) => lcBasisValue(item, basis));
  const basisTotal = values.reduce((sum, value) => sum.add(value), D(0));
  const effectiveValues = basisTotal.gt(0) ? values : items.map(() => D(1));
  const effectiveTotal = effectiveValues.reduce((sum, value) => sum.add(value), D(0));
  let results = items.map((item, index) => {
    const input = rowById.get(item.id)!;
    const suggested = money(amount.mul(effectiveValues[index]).div(effectiveTotal));
    let final = suggested;
    if (mode === "MANUAL_AMOUNT" || mode === "DIRECT_PRODUCT") {
      if (input.manualAmount === undefined) throw new BadRequestException("Manual amount is required for every product");
      final = money(input.manualAmount);
    } else if (mode === "MANUAL_PERCENTAGE") {
      if (input.manualPercentage === undefined) throw new BadRequestException("Manual percentage is required for every product");
      final = money(amount.mul(input.manualPercentage).div(100));
    }
    return { item, input, basisValue: effectiveValues[index], suggested, final, overridden: !final.eq(suggested) };
  });
  if (mode === "HYBRID") {
    const fixed = results.filter((row) => row.input.manualAmount !== undefined);
    const auto = results.filter((row) => row.input.manualAmount === undefined);
    const fixedTotal = fixed.reduce((sum, row) => sum.add(row.input.manualAmount!), D(0));
    if (fixedTotal.gt(amount) || (!auto.length && !fixedTotal.eq(amount))) throw new BadRequestException("Hybrid manual amounts exceed or do not reconcile to the cost");
    const remainder = amount.sub(fixedTotal), autoBasis = auto.reduce((sum, row) => sum.add(row.basisValue), D(0));
    results = results.map((row) => row.input.manualAmount !== undefined ? { ...row, final: money(row.input.manualAmount), overridden: true } : { ...row, final: money(remainder.mul(row.basisValue).div(autoBasis.gt(0) ? autoBasis : auto.length)), overridden: false });
  }
  const allocated = results.reduce((sum, row) => sum.add(row.final), D(0));
  const difference = amount.sub(allocated);
  results[results.length - 1].final = results[results.length - 1].final.add(difference);
  if (!results.reduce((sum, row) => sum.add(row.final), D(0)).eq(amount)) throw new BadRequestException("Allocation does not reconcile to the cost amount");
  return results.map((row) => ({ lcItemId: row.item.id, basisValue: row.basisValue, basisPercentage: row.basisValue.mul(100).div(effectiveTotal), autoSuggestedAmount: row.suggested, manualAmount: row.input.manualAmount, finalAmount: row.final, isDirect: mode === "DIRECT_PRODUCT", isOverridden: row.overridden, overrideReason: row.input.overrideReason?.trim(), originalMode: mode, originalBasis: basis, originalAutoAmount: row.suggested }));
}
