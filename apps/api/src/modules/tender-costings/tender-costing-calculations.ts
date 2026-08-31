import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";

interface CostingItemInput {
  quantity: string | number;
  unitCost: string | number;
  marginPercent: string | number;
}

interface CostingTotalsInput {
  items: CostingItemInput[];
  freightCost: string | number;
  installationCost: string | number;
  otherCost: string | number;
  contingencyPercent: string | number;
}

const HUNDRED = new Prisma.Decimal(100);
const ZERO = new Prisma.Decimal(0);

function percentage(value: string | number, label: string) {
  const decimal = new Prisma.Decimal(value);
  if (decimal.lt(0) || decimal.gt(100)) {
    throw new BadRequestException(`${label} must be between 0 and 100`);
  }
  return decimal;
}

export function calculateTenderCostingTotals(input: CostingTotalsInput) {
  const calculatedItems = input.items.map((item) => {
    const quantity = new Prisma.Decimal(item.quantity);
    const unitCost = new Prisma.Decimal(item.unitCost);
    const marginPercent = percentage(item.marginPercent, "Item margin percentage");
    if (quantity.lte(0)) throw new BadRequestException("Item quantity must be greater than zero");
    if (unitCost.lt(0)) throw new BadRequestException("Item unit cost cannot be negative");

    const totalCost = quantity.mul(unitCost).toDecimalPlaces(2);
    const ourCost = totalCost.mul(HUNDRED.minus(marginPercent)).div(HUNDRED).toDecimalPlaces(2);
    return { quantity, unitCost, marginPercent, totalCost, ourCost };
  });

  const freightCost = new Prisma.Decimal(input.freightCost);
  const installationCost = new Prisma.Decimal(input.installationCost);
  const otherCost = new Prisma.Decimal(input.otherCost);
  const contingencyPercent = percentage(input.contingencyPercent, "Contingency percentage");

  const itemTotal = calculatedItems.reduce((sum, item) => sum.plus(item.totalCost), ZERO);
  const itemOurCost = calculatedItems.reduce((sum, item) => sum.plus(item.ourCost), ZERO);
  const additionalCost = freightCost.plus(installationCost).plus(otherCost);
  const preContingency = itemTotal.plus(additionalCost);
  const contingencyAmount = preContingency.mul(contingencyPercent).div(HUNDRED).toDecimalPlaces(2);
  const estimatedCost = preContingency.plus(contingencyAmount).toDecimalPlaces(2);
  const ourCost = itemOurCost.plus(additionalCost).toDecimalPlaces(2);
  const marginPercent = estimatedCost.gt(0)
    ? estimatedCost.minus(ourCost).mul(HUNDRED).div(estimatedCost).toDecimalPlaces(4)
    : ZERO;

  return {
    calculatedItems,
    freightCost,
    installationCost,
    otherCost,
    contingencyPercent,
    contingencyAmount,
    estimatedCost,
    ourCost,
    marginPercent,
  };
}
