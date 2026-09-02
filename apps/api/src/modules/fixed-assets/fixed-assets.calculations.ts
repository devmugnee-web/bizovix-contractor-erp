import { Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

export function calculateCapitalizedCost(input: {
  purchaseCost: Prisma.Decimal.Value;
  transportationCost?: Prisma.Decimal.Value;
  installationCost?: Prisma.Decimal.Value;
  importDuty?: Prisma.Decimal.Value;
  registrationCost?: Prisma.Decimal.Value;
  otherCapitalizedCost?: Prisma.Decimal.Value;
  discountAmount?: Prisma.Decimal.Value;
}) {
  return [input.purchaseCost, input.transportationCost ?? 0, input.installationCost ?? 0, input.importDuty ?? 0, input.registrationCost ?? 0, input.otherCapitalizedCost ?? 0]
    .reduce<Prisma.Decimal>((sum, value) => sum.add(value), D(0))
    .sub(input.discountAmount ?? 0)
    .toDecimalPlaces(4);
}

export function calculateDepreciationAmount(input: {
  capitalizedCost: Prisma.Decimal.Value;
  salvageValue: Prisma.Decimal.Value;
  usefulLifeMonths: number;
  priorDepreciation?: Prisma.Decimal.Value;
  manualAnnualDepreciation?: Prisma.Decimal.Value | null;
}) {
  const capitalized = D(input.capitalizedCost), salvage = D(input.salvageValue), prior = D(input.priorDepreciation ?? 0);
  const depreciable = Prisma.Decimal.max(D(0), capitalized.sub(salvage));
  const remaining = Prisma.Decimal.max(D(0), depreciable.sub(prior));
  const standardMonthly = input.manualAnnualDepreciation !== null && input.manualAnnualDepreciation !== undefined
    ? D(input.manualAnnualDepreciation).div(12)
    : depreciable.div(input.usefulLifeMonths);
  return { depreciable, remaining, standardMonthly: standardMonthly.toDecimalPlaces(4), nextAmount: Prisma.Decimal.min(remaining, standardMonthly).toDecimalPlaces(4) };
}
