import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import type {
  TenderCostingShippingMethod,
  TenderCostingShippingRateBasis,
} from "@bizovix/types";

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
  foreignShippingMethod?: TenderCostingShippingMethod;
  foreignDoorToDoorCharge?: string | number;
  foreignImportDutyIncluded?: boolean;
  foreignTransportCharge?: string | number;
  customsDeclarationCharge?: string | number;
  shippingWeightKg?: string | number;
  shippingVolumeCbm?: string | number;
  shippingRateBasis?: TenderCostingShippingRateBasis;
  shippingRate?: string | number;
  domesticTransportCost?: string | number;
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
  const localCostBeforeProfit = localTaxable
    .plus(localTransportCost)
    .plus(localOtherCost);
  const localProfit = localCostBeforeProfit.mul(marginPercent).div(HUNDRED);
  const localSubtotal = localCostBeforeProfit.plus(localProfit);
  const localTotalCost = localSubtotal
    .plus(localSubtotal.mul(localVatPercent).div(HUNDRED))
    .plus(localSubtotal.mul(localTaxPercent).div(HUNDRED))
    .toDecimalPlaces(2);

  const foreignUnitPrice = amount(item.foreignUnitPrice, "Foreign unit price");
  const foreignExchangeRate = new Prisma.Decimal(item.foreignExchangeRate ?? 1);
  if (foreignExchangeRate.lte(0)) {
    throw new BadRequestException("Foreign exchange rate must be greater than zero");
  }
  const foreignFreightCost = amount(item.foreignFreightCost, "Foreign freight cost");
  const foreignInsuranceCost = amount(item.foreignInsuranceCost, "Foreign insurance cost");
  const foreignShippingMethod = item.foreignShippingMethod ?? "LC_SEA";
  const foreignDoorToDoorCharge = amount(
    item.foreignDoorToDoorCharge,
    "Door-to-door shipping charge",
  );
  const foreignImportDutyIncluded = item.foreignImportDutyIncluded ?? false;
  const isDoorToDoor = foreignShippingMethod.startsWith("DOOR_TO_DOOR");
  const foreignTransportCharge = amount(
    item.foreignTransportCharge,
    "Foreign transport charge",
  );
  const customsDeclarationCharge = amount(
    item.customsDeclarationCharge,
    "Customs declaration charge",
  );
  const shippingWeightKg = amount(item.shippingWeightKg, "Shipping weight");
  const shippingVolumeCbm = amount(item.shippingVolumeCbm, "Shipping volume");
  const shippingRateBasis = item.shippingRateBasis ?? (
    foreignShippingMethod.endsWith("AIR") ? "PER_KG" : "PER_CBM"
  );
  const shippingRate = amount(item.shippingRate, "Shipping rate");
  const domesticTransportCost = amount(
    item.domesticTransportCost,
    "Domestic transport cost",
  );
  const shippingCostBdt = shippingWeightKg.mul(shippingRate);
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
  const usesLegacyDetailedDoorShipping =
    isDoorToDoor &&
    (shippingRateBasis !== "PER_KG" ||
      foreignImportDutyIncluded ||
      foreignDoorToDoorCharge.gt(0) ||
      foreignFreightCost.gt(0) ||
      shippingVolumeCbm.gt(0) ||
      customsDeclarationCharge.gt(0) ||
      customsDutyPercent.gt(0) ||
      regulatoryDutyPercent.gt(0) ||
      supplementaryDutyPercent.gt(0) ||
      foreignInsuranceCost.gt(0) ||
      cnfCharge.gt(0) ||
      portHandlingCharge.gt(0) ||
      bankLcCharge.gt(0) ||
      foreignOtherCost.gt(0));
  const usesLegacyDetailedLcShipping = !isDoorToDoor && shippingRateBasis !== "FLAT";
  const usesLegacyDetailedShipping = isDoorToDoor
    ? usesLegacyDetailedDoorShipping
    : usesLegacyDetailedLcShipping;
  // Door rows use submitted BDT/kg shipping. FLAT is an explicit marker for
  // the new fixed-fee LC model; older PER_CBM/PER_KG LC rows remain legacy.
  const hasSubmittedKgShipping =
    isDoorToDoor &&
    !usesLegacyDetailedDoorShipping &&
    shippingWeightKg.gt(0) &&
    shippingRate.gt(0);
  const foreignOriginTransportBdt = foreignTransportCharge.mul(foreignExchangeRate);
  const legacyInternationalShippingBdt = isDoorToDoor
    ? foreignDoorToDoorCharge
    : foreignFreightCost;
  const internationalShippingBdt = hasSubmittedKgShipping
    ? shippingCostBdt
    : legacyInternationalShippingBdt;
  const simplifiedDoorCostBeforeProfit = foreignProductValueBdt
    .plus(foreignOriginTransportBdt)
    .plus(internationalShippingBdt)
    .plus(foreignLocalTransportCost)
    .plus(domesticTransportCost)
    .toDecimalPlaces(2);
  const simplifiedLcCostBeforeProfit = foreignProductValueBdt
    .plus(bankLcCharge)
    .plus(portHandlingCharge)
    .plus(foreignFreightCost)
    .plus(cnfCharge)
    .plus(foreignLocalTransportCost)
    .toDecimalPlaces(2);

  const legacyShippingCharge =
    shippingRateBasis === "PER_CBM"
      ? shippingVolumeCbm.mul(shippingRate)
      : shippingRateBasis === "PER_KG"
        ? shippingWeightKg.mul(shippingRate)
        : shippingRate;
  const legacyShippingSubtotal = foreignTransportCharge
    .plus(customsDeclarationCharge)
    .plus(legacyShippingCharge);
  const legacyShippingSubtotalBdt = legacyShippingSubtotal.gt(0)
    ? legacyShippingSubtotal.mul(foreignExchangeRate)
    : foreignDoorToDoorCharge;
  const legacyAssessableValue = isDoorToDoor
    ? foreignProductValueBdt.plus(legacyShippingSubtotalBdt)
    : foreignProductValueBdt.plus(foreignFreightCost).plus(foreignInsuranceCost);
  const legacyCustomsDuty = legacyAssessableValue.mul(customsDutyPercent).div(HUNDRED);
  const legacyRegulatoryDuty = legacyAssessableValue
    .mul(regulatoryDutyPercent)
    .div(HUNDRED);
  const legacySupplementaryDuty = legacyAssessableValue
    .mul(supplementaryDutyPercent)
    .div(HUNDRED);
  const legacyTaxBase = isDoorToDoor && foreignImportDutyIncluded
    ? legacyAssessableValue
    : legacyAssessableValue
        .plus(legacyCustomsDuty)
        .plus(legacyRegulatoryDuty)
        .plus(legacySupplementaryDuty);
  const legacyCostBeforeProfit = isDoorToDoor
    ? legacyTaxBase.plus(domesticTransportCost).plus(foreignOtherCost)
    : legacyTaxBase
        .plus(cnfCharge)
        .plus(portHandlingCharge)
        .plus(bankLcCharge)
        .plus(foreignLocalTransportCost)
        .plus(domesticTransportCost)
        .plus(foreignOtherCost);
  const foreignCostBeforeProfit = (
    usesLegacyDetailedShipping
      ? legacyCostBeforeProfit
      : isDoorToDoor
        ? simplifiedDoorCostBeforeProfit
        : simplifiedLcCostBeforeProfit
  ).toDecimalPlaces(2);
  const foreignProfit = foreignCostBeforeProfit.mul(marginPercent).div(HUNDRED);
  const foreignSubtotal = foreignCostBeforeProfit.plus(foreignProfit);
  const foreignQuotedTotal = foreignSubtotal
    .plus(foreignSubtotal.mul(foreignVatPercent).div(HUNDRED))
    .plus(foreignSubtotal.mul(foreignTaxPercent).div(HUNDRED))
    .toDecimalPlaces(2);
  const foreignLandedCost = usesLegacyDetailedShipping
    ? foreignQuotedTotal
    : foreignCostBeforeProfit;

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
  const selectedTotal =
    costingStatus === "COSTED"
      ? selectedSource === "FOREIGN"
        ? foreignQuotedTotal
        : localTotalCost
      : ZERO;
  const selectedOurCost =
    costingStatus === "COSTED"
      ? selectedSource === "FOREIGN"
        ? foreignCostBeforeProfit
        : localCostBeforeProfit
      : ZERO;
  const selectedProfit =
    costingStatus === "COSTED"
      ? selectedSource === "FOREIGN"
        ? foreignProfit
        : localProfit
      : ZERO;
  const normalizedUnitCost = selectedOurCost.div(quantity).toDecimalPlaces(2);

  return {
    quantity,
    unitCost: normalizedUnitCost,
    marginPercent,
    totalCost: selectedTotal,
    ourCost: selectedOurCost.toDecimalPlaces(2),
    profitAmount: selectedProfit.toDecimalPlaces(2),
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
    foreignShippingMethod,
    foreignDoorToDoorCharge,
    foreignImportDutyIncluded,
    foreignTransportCharge,
    customsDeclarationCharge,
    shippingWeightKg,
    shippingVolumeCbm,
    shippingRateBasis,
    shippingRate,
    domesticTransportCost,
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
      profitAmount: totalCost.minus(ourCost).toDecimalPlaces(2),
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
      foreignShippingMethod: "LC_SEA",
      foreignDoorToDoorCharge: ZERO,
      foreignImportDutyIncluded: false,
      foreignTransportCharge: ZERO,
      customsDeclarationCharge: ZERO,
      shippingWeightKg: ZERO,
      shippingVolumeCbm: ZERO,
      shippingRateBasis: "PER_CBM",
      shippingRate: ZERO,
      domesticTransportCost: ZERO,
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
  const itemProfit = calculatedItems.reduce((sum, item) => sum.plus(item.profitAmount), ZERO);
  const additionalCost = freightCost.plus(installationCost).plus(otherCost);
  const preContingency = itemTotal.plus(additionalCost);
  const contingencyAmount = preContingency.mul(contingencyPercent).div(HUNDRED).toDecimalPlaces(2);
  const estimatedCost = preContingency.plus(contingencyAmount).toDecimalPlaces(2);
  const hasSourcingItems = input.items.some((item) => !!item.sourcingType);
  const ourCost = itemOurCost.plus(additionalCost).toDecimalPlaces(2);
  const marginPercent = hasSourcingItems && itemOurCost.gt(0)
    ? itemProfit.mul(HUNDRED).div(itemOurCost).toDecimalPlaces(4)
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
