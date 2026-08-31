import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";

interface CostingItemInput {
  quantity: string | number;
  unitCost?: string | number;
  marginPercent?: string | number;
  sourcingType?: "LOCAL" | "FOREIGN" | "LOCAL_AND_FOREIGN";
  costingStatus?: "NOT_COSTED" | "DRAFT" | "COSTED";
  selectedSource?: "LOCAL" | "FOREIGN" | null;
  localUnitPrice?: string | number;
  localDiscountPercent?: string | number;
  localVatPercent?: string | number;
  localTaxPercent?: string | number;
  localTransportCost?: string | number;
  localOtherCost?: string | number;
  foreignUnitPrice?: string | number;
  foreignExchangeRate?: string | number;
  foreignFreightCost?: string | number;
  foreignInsuranceCost?: string | number;
  customsDutyPercent?: string | number;
  regulatoryDutyPercent?: string | number;
  supplementaryDutyPercent?: string | number;
  foreignVatPercent?: string | number;
  foreignTaxPercent?: string | number;
  cnfCharge?: string | number;
  portHandlingCharge?: string | number;
  bankLcCharge?: string | number;
  foreignLocalTransportCost?: string | number;
  foreignOtherCost?: string | number;
}

interface CostingTotalsInput {
  items: CostingItemInput[];
  freightCost: string | number;
  installationCost: string | number;
  otherCost: string | number;
  contingencyPercent: string | number;
  costingBudget?: string | number | Prisma.Decimal | null;
}

const HUNDRED = new Prisma.Decimal(100);
const ZERO = new Prisma.Decimal(0);
const ONE = new Prisma.Decimal(1);

function amount(value: string | number | undefined, label: string) {
  const decimal = new Prisma.Decimal(value ?? 0);
  if (decimal.lt(0)) throw new BadRequestException(`${label} cannot be negative`);
  return decimal;
}

function percentage(value: string | number | undefined, label: string) {
  const decimal = new Prisma.Decimal(value ?? 0);
  if (decimal.lt(0) || decimal.gt(100)) {
    throw new BadRequestException(`${label} must be between 0 and 100`);
  }
  return decimal;
}

function calculateSourcingItem(item: CostingItemInput, quantity: Prisma.Decimal) {
  const sourcingType = item.sourcingType ?? "LOCAL";
  const costingStatus = item.costingStatus ?? "NOT_COSTED";
  const marginPercent = percentage(item.marginPercent, "Item profit margin percentage");
  const localUnitPrice = amount(item.localUnitPrice, "Local unit price");
  const localDiscountPercent = percentage(item.localDiscountPercent, "Local discount percentage");
  const localVatPercent = percentage(item.localVatPercent, "Local VAT percentage");
  const localTaxPercent = percentage(item.localTaxPercent, "Local Tax/AIT percentage");
  const localTransportCost = amount(item.localTransportCost, "Local transport cost");
  const localOtherCost = amount(item.localOtherCost, "Local other cost");
  const localBase = quantity.mul(localUnitPrice);
  const localTaxable = localBase.minus(localBase.mul(localDiscountPercent).div(HUNDRED));
  const localTotalCost = localTaxable
    .plus(localTaxable.mul(localVatPercent).div(HUNDRED))
    .plus(localTaxable.mul(localTaxPercent).div(HUNDRED))
    .plus(localTransportCost)
    .plus(localOtherCost)
    .toDecimalPlaces(2);

  const foreignUnitPrice = amount(item.foreignUnitPrice, "Foreign unit price");
  const foreignExchangeRate = new Prisma.Decimal(item.foreignExchangeRate ?? 1);
  if (foreignExchangeRate.lte(0)) {
    throw new BadRequestException("Foreign exchange rate must be greater than zero");
  }
  const foreignFreightCost = amount(item.foreignFreightCost, "Foreign freight cost");
  const foreignInsuranceCost = amount(item.foreignInsuranceCost, "Foreign insurance cost");
  const customsDutyPercent = percentage(item.customsDutyPercent, "Customs duty percentage");
  const regulatoryDutyPercent = percentage(item.regulatoryDutyPercent, "Regulatory duty percentage");
  const supplementaryDutyPercent = percentage(
    item.supplementaryDutyPercent,
    "Supplementary duty percentage",
  );
  const foreignVatPercent = percentage(item.foreignVatPercent, "Foreign VAT percentage");
  const foreignTaxPercent = percentage(item.foreignTaxPercent, "Foreign Tax/AIT percentage");
  const cnfCharge = amount(item.cnfCharge, "C&F charge");
  const portHandlingCharge = amount(item.portHandlingCharge, "Port handling charge");
  const bankLcCharge = amount(item.bankLcCharge, "Bank/LC charge");
  const foreignLocalTransportCost = amount(
    item.foreignLocalTransportCost,
    "Foreign local transport cost",
  );
  const foreignOtherCost = amount(item.foreignOtherCost, "Foreign other cost");
  const foreignProductValueBdt = quantity
    .mul(foreignUnitPrice)
    .mul(foreignExchangeRate)
    .toDecimalPlaces(2);
  const assessableValue = foreignProductValueBdt.plus(foreignFreightCost).plus(foreignInsuranceCost);
  const customsDuty = assessableValue.mul(customsDutyPercent).div(HUNDRED);
  const regulatoryDuty = assessableValue.mul(regulatoryDutyPercent).div(HUNDRED);
  const supplementaryDuty = assessableValue.mul(supplementaryDutyPercent).div(HUNDRED);
  const taxBase = assessableValue.plus(customsDuty).plus(regulatoryDuty).plus(supplementaryDuty);
  const foreignLandedCost = taxBase
    .plus(taxBase.mul(foreignVatPercent).div(HUNDRED))
    .plus(taxBase.mul(foreignTaxPercent).div(HUNDRED))
    .plus(cnfCharge)
    .plus(portHandlingCharge)
    .plus(bankLcCharge)
    .plus(foreignLocalTransportCost)
    .plus(foreignOtherCost)
    .toDecimalPlaces(2);

  let selectedSource = item.selectedSource ?? null;
  if (sourcingType === "LOCAL") selectedSource = "LOCAL";
  if (sourcingType === "FOREIGN") selectedSource = "FOREIGN";
  if (costingStatus === "COSTED") {
    if (selectedSource === "LOCAL" && localUnitPrice.lte(0)) {
      throw new BadRequestException("Local unit price must be greater than zero for a costed item");
    }
    if (selectedSource === "FOREIGN" && foreignUnitPrice.lte(0)) {
      throw new BadRequestException("Foreign unit price must be greater than zero for a costed item");
    }
    if (sourcingType === "LOCAL_AND_FOREIGN" && !selectedSource) {
      throw new BadRequestException("Select Local or Foreign for every compared costed item");
    }
  }
  const selectedCost =
    costingStatus === "COSTED"
      ? selectedSource === "FOREIGN"
        ? foreignLandedCost
        : localTotalCost
      : ZERO;
  const normalizedUnitCost = selectedCost.div(quantity).toDecimalPlaces(2);

  return {
    quantity,
    unitCost: normalizedUnitCost,
    marginPercent,
    totalCost: selectedCost,
    ourCost: selectedCost,
    sourcingType,
    costingStatus,
    selectedSource,
    localUnitPrice,
    localDiscountPercent,
    localVatPercent,
    localTaxPercent,
    localTransportCost,
    localOtherCost,
    localTotalCost,
    foreignUnitPrice,
    foreignExchangeRate,
    foreignFreightCost,
    foreignInsuranceCost,
    customsDutyPercent,
    regulatoryDutyPercent,
    supplementaryDutyPercent,
    foreignVatPercent,
    foreignTaxPercent,
    cnfCharge,
    portHandlingCharge,
    bankLcCharge,
    foreignLocalTransportCost,
    foreignOtherCost,
    foreignProductValueBdt,
    foreignLandedCost,
  };
}

export function calculateTenderCostingTotals(input: CostingTotalsInput) {
  const calculatedItems = input.items.map((item) => {
    const quantity = new Prisma.Decimal(item.quantity);
    if (quantity.lte(0)) throw new BadRequestException("Item quantity must be greater than zero");
    if (item.sourcingType) return calculateSourcingItem(item, quantity);

    const unitCost = amount(item.unitCost, "Item unit cost");
    const marginPercent = percentage(item.marginPercent, "Item margin percentage");
    const totalCost = quantity.mul(unitCost).toDecimalPlaces(2);
    const ourCost = totalCost.mul(HUNDRED.minus(marginPercent)).div(HUNDRED).toDecimalPlaces(2);
    return {
      quantity,
      unitCost,
      marginPercent,
      totalCost,
      ourCost,
      sourcingType: "LOCAL",
      costingStatus: unitCost.gt(0) ? "COSTED" : "NOT_COSTED",
      selectedSource: unitCost.gt(0) ? "LOCAL" : null,
      localUnitPrice: unitCost,
      localDiscountPercent: ZERO,
      localVatPercent: ZERO,
      localTaxPercent: ZERO,
      localTransportCost: ZERO,
      localOtherCost: ZERO,
      localTotalCost: totalCost,
      foreignUnitPrice: ZERO,
      foreignExchangeRate: ONE,
      foreignFreightCost: ZERO,
      foreignInsuranceCost: ZERO,
      customsDutyPercent: ZERO,
      regulatoryDutyPercent: ZERO,
      supplementaryDutyPercent: ZERO,
      foreignVatPercent: ZERO,
      foreignTaxPercent: ZERO,
      cnfCharge: ZERO,
      portHandlingCharge: ZERO,
      bankLcCharge: ZERO,
      foreignLocalTransportCost: ZERO,
      foreignOtherCost: ZERO,
      foreignProductValueBdt: ZERO,
      foreignLandedCost: ZERO,
    };
  });

  const freightCost = amount(input.freightCost, "Freight cost");
  const installationCost = amount(input.installationCost, "Installation cost");
  const otherCost = amount(input.otherCost, "Other cost");
  const contingencyPercent = percentage(input.contingencyPercent, "Contingency percentage");
  const itemTotal = calculatedItems.reduce((sum, item) => sum.plus(item.totalCost), ZERO);
  const itemOurCost = calculatedItems.reduce((sum, item) => sum.plus(item.ourCost), ZERO);
  const additionalCost = freightCost.plus(installationCost).plus(otherCost);
  const preContingency = itemTotal.plus(additionalCost);
  const contingencyAmount = preContingency.mul(contingencyPercent).div(HUNDRED).toDecimalPlaces(2);
  const estimatedCost = preContingency.plus(contingencyAmount).toDecimalPlaces(2);
  const hasSourcingItems = input.items.some((item) => !!item.sourcingType);
  const ourCost = hasSourcingItems ? estimatedCost : itemOurCost.plus(additionalCost).toDecimalPlaces(2);
  const budget = input.costingBudget ? new Prisma.Decimal(input.costingBudget) : ZERO;
  const marginPercent = hasSourcingItems && budget.gt(0)
    ? Prisma.Decimal.max(ZERO, budget.minus(estimatedCost).mul(HUNDRED).div(budget)).toDecimalPlaces(4)
    : estimatedCost.gt(0)
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
