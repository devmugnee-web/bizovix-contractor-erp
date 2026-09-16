"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  FileCheck2,
  LoaderCircle,
  LockKeyhole,
  Plus,
  Save,
  Trash2,
  UploadCloud,
} from "lucide-react";
import {
  ApiError,
  extractTenderCostingPdfs,
  useSaveTenderCosting,
  useSetTenderCostingBudget,
  useTenderCosting,
  useTenderOptions,
} from "@bizovix/api-client";
import {
  IconButton,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type {
  SaveTenderCostingInput,
  TenderCostingItemStatus,
  TenderCostingLcAllocationMethod,
  TenderCostingSelectedSource,
  TenderCostingShippingMethod,
  TenderCostingShippingRateBasis,
  TenderCostingSourcingType,
  TenderCostingStatus,
} from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Modal } from "@/components/layout/Modal";
import { SuccessPopup } from "@/components/layout/SuccessPopup";

interface CostingItemForm {
  id: string;
  sourceItemNo?: string;
  costingDate: string;
  preparedByUserId: string;
  description: string;
  secondaryDescription: string;
  unit: string;
  quantity: string;
  marginPercent: string;
  sourcingType: TenderCostingSourcingType;
  costingStatus: TenderCostingItemStatus;
  selectedSource: TenderCostingSelectedSource | "";
  localSupplierName: string;
  localUnitPrice: string;
  localDiscountPercent: string;
  localVatPercent: string;
  localTaxPercent: string;
  localTransportCost: string;
  localOtherCost: string;
  foreignSupplierName: string;
  foreignCountry: string;
  foreignCurrency: string;
  foreignUnitPrice: string;
  foreignExchangeRate: string;
  exchangeRateDate: string;
  foreignShippingMethod: TenderCostingShippingMethod;
  foreignShippingProvider: string;
  foreignDoorToDoorCharge: string;
  foreignImportDutyIncluded: boolean;
  foreignTransitDays: string;
  foreignShippingReference: string;
  foreignTransportCharge: string;
  customsDeclarationCharge: string;
  shippingWeightKg: string;
  shippingVolumeCbm: string;
  shippingRateBasis: TenderCostingShippingRateBasis;
  shippingRate: string;
  domesticTransportCost: string;
  foreignFreightCost: string;
  foreignInsuranceCost: string;
  customsDutyPercent: string;
  regulatoryDutyPercent: string;
  supplementaryDutyPercent: string;
  foreignVatPercent: string;
  foreignTaxPercent: string;
  cnfCharge: string;
  portHandlingCharge: string;
  bankLcCharge: string;
  foreignLocalTransportCost: string;
  foreignOtherCost: string;
  remarks: string;
}

interface HeaderForm {
  costingDate: string;
  preparedByUserId: string;
  source: string;
  currency: string;
  exchangeRate: string;
  costingVersion: string;
  remarks: string;
}

interface AdditionalForm {
  freightCost: string;
  installationCost: string;
  otherCost: string;
  contingencyPercent: string;
  validityDays: string;
  paymentTermId: string;
  deliveryTime: string;
  warranty: string;
}

interface BulkForeignForm {
  country: string;
  currency: string;
  exchangeRate: string;
  exchangeRateDate: string;
  shippingMethod: TenderCostingShippingMethod;
}

interface ForeignBatchCostForm {
  originTransport: string;
  localTransport: string;
  projectTransport: string;
  otherCost: string;
  allocationMethod: TenderCostingLcAllocationMethod;
}

type PendingLcAction =
  | { kind: "ITEM"; itemId: string; shippingMethod: TenderCostingShippingMethod }
  | {
      kind: "BULK_SELECTION";
      previousShippingMethod: TenderCostingShippingMethod;
      shippingMethod: TenderCostingShippingMethod;
    }
  | { kind: "BULK_APPLY" }
  | null;

const SOURCING_OPTIONS = [
  { value: "LOCAL", label: "Local" },
  { value: "FOREIGN", label: "Foreign" },
];
const SOURCE_FILTER_OPTIONS = [{ value: "ALL", label: "All Items" }, ...SOURCING_OPTIONS];
const UNIT_OPTIONS = [
  "Nos",
  "Pcs",
  "Set",
  "Lot",
  "LS",
  "Kg",
  "MT",
  "Meter",
  "Sqft",
  "Cft",
  "Bag",
  "Box",
  "Pair",
  "Job",
  "Service",
].map((unit) => ({ value: unit, label: unit }));
const CURRENCY_OPTIONS = [
  "CNY",
  "USD",
  "EUR",
  "GBP",
  "INR",
  "JPY",
  "KRW",
  "AED",
  "TRY",
  "SGD",
  "MYR",
  "THB",
  "VND",
  "IDR",
  "TWD",
  "HKD",
  "CAD",
  "AUD",
].map((currency) => ({ value: currency, label: currency }));
const DEFAULT_CHINA_CURRENCY = "CNY";
const DEFAULT_CNY_TO_BDT_RATE = "19.50";
const COUNTRY_OPTIONS = [
  "China",
  "India",
  "United States",
  "United Kingdom",
  "Germany",
  "Italy",
  "Japan",
  "South Korea",
  "United Arab Emirates",
  "Turkey",
  "Singapore",
  "Malaysia",
  "Thailand",
  "Vietnam",
  "Indonesia",
  "Taiwan",
  "Hong Kong",
  "Canada",
  "Australia",
].map((country) => ({ value: country, label: country }));
const COUNTRY_CURRENCY: Record<string, string> = {
  China: "CNY",
  India: "INR",
  "United States": "USD",
  "United Kingdom": "GBP",
  Germany: "EUR",
  Italy: "EUR",
  Japan: "JPY",
  "South Korea": "KRW",
  "United Arab Emirates": "AED",
  Turkey: "TRY",
  Singapore: "SGD",
  Malaysia: "MYR",
  Thailand: "THB",
  Vietnam: "VND",
  Indonesia: "IDR",
  Taiwan: "TWD",
  "Hong Kong": "HKD",
  Canada: "CAD",
  Australia: "AUD",
};
const CURRENCY_COUNTRY: Record<string, string> = {
  CNY: "China",
  INR: "India",
  USD: "United States",
  GBP: "United Kingdom",
  EUR: "Germany",
  JPY: "Japan",
  KRW: "South Korea",
  AED: "United Arab Emirates",
  TRY: "Turkey",
  SGD: "Singapore",
  MYR: "Malaysia",
  THB: "Thailand",
  VND: "Vietnam",
  IDR: "Indonesia",
  TWD: "Taiwan",
  HKD: "Hong Kong",
  CAD: "Canada",
  AUD: "Australia",
};
const SHIPPING_METHOD_OPTIONS = [
  { value: "DOOR_TO_DOOR_SEA", label: "Door to Door - Sea Shipping" },
  { value: "DOOR_TO_DOOR_AIR", label: "Door to Door - Air Shipment" },
  { value: "LC_SEA", label: "LC - Sea Shipment" },
  { value: "LC_AIR", label: "LC - Air Shipment" },
];
const LC_ALLOCATION_OPTIONS = [
  { value: "EQUAL", label: "Equal Split" },
  { value: "WEIGHT", label: "By Shipping Weight" },
  { value: "VALUE", label: "By Product Value" },
];

function isLcForeignCostingItem(item: CostingItemForm): boolean {
  return item.sourcingType === "FOREIGN" && item.foreignShippingMethod.startsWith("LC_");
}

function lcAllocationLabel(method: TenderCostingLcAllocationMethod): string {
  if (method === "WEIGHT") return "By Weight";
  if (method === "VALUE") return "By Value";
  return "Equal Split";
}

function withShippingMethod(
  item: CostingItemForm,
  shippingMethod: TenderCostingShippingMethod,
): CostingItemForm {
  const nextIsLc = shippingMethod.startsWith("LC_");
  const switchingFamily = nextIsLc !== item.foreignShippingMethod.startsWith("LC_");
  return {
    ...item,
    foreignShippingMethod: shippingMethod,
    shippingRateBasis: defaultShippingRateBasis(shippingMethod),
    shippingRate: defaultShippingRate(shippingMethod),
    ...(switchingFamily
      ? {
          foreignFreightCost: "",
          cnfCharge: "",
          portHandlingCharge: "",
          bankLcCharge: "",
        }
      : {}),
  };
}

function allocateLcContainerFee(
  items: CostingItemForm[],
  totalFeeInput: string,
  allocationMethod: TenderCostingLcAllocationMethod,
): CostingItemForm[] {
  const totalFeeCents = Math.round((Number(totalFeeInput) || 0) * 100);
  if (totalFeeCents <= 0) return items;

  const lcItems = items.filter(isLcForeignCostingItem);
  if (lcItems.length === 0) return items;

  const submittedBases = lcItems.map((item) => {
    if (allocationMethod === "WEIGHT") return Math.max(0, Number(item.shippingWeightKg) || 0);
    if (allocationMethod === "VALUE") {
      return Math.max(
        0,
        (Number(item.quantity) || 0) *
          (Number(item.foreignUnitPrice) || 0) *
          (Number(item.foreignExchangeRate) || 0),
      );
    }
    return 1;
  });
  const submittedBasisTotal = submittedBases.reduce((sum, basis) => sum + basis, 0);
  const bases = submittedBasisTotal > 0 ? submittedBases : lcItems.map(() => 1);
  const basisTotal = bases.reduce((sum, basis) => sum + basis, 0);
  const allocationById = new Map<string, number>();
  let allocatedCents = 0;

  lcItems.forEach((item, index) => {
    const shareCents =
      index === lcItems.length - 1
        ? totalFeeCents - allocatedCents
        : Math.round((totalFeeCents * (bases[index] ?? 0)) / basisTotal);
    allocationById.set(item.id, shareCents);
    allocatedCents += shareCents;
  });

  return items.map((item) => {
    const shareCents = allocationById.get(item.id);
    return shareCents === undefined
      ? item
      : {
          ...item,
          shippingRateBasis: "FLAT",
          foreignFreightCost: compactInputNumber((shareCents / 100).toFixed(2), true),
        };
  });
}

function emptyForeignBatchCosts(): ForeignBatchCostForm {
  return {
    originTransport: "",
    localTransport: "",
    projectTransport: "",
    otherCost: "",
    allocationMethod: "WEIGHT",
  };
}

function foreignBatchCostsFromItems(
  items: CostingItemForm[],
  allocationMethod: TenderCostingLcAllocationMethod = "WEIGHT",
): ForeignBatchCostForm {
  const total = (
    field: keyof Pick<
      CostingItemForm,
      | "foreignTransportCharge"
      | "foreignLocalTransportCost"
      | "domesticTransportCost"
      | "foreignOtherCost"
    >,
  ) =>
    compactInputNumber(
      roundMoney(items.reduce((sum, item) => sum + (Number(item[field]) || 0), 0)).toFixed(2),
      true,
    );

  return {
    originTransport: total("foreignTransportCharge"),
    localTransport: total("foreignLocalTransportCost"),
    projectTransport: total("domesticTransportCost"),
    otherCost: total("foreignOtherCost"),
    allocationMethod,
  };
}

function hasInvalidForeignBatchCost(costs: ForeignBatchCostForm): boolean {
  return [costs.originTransport, costs.localTransport, costs.projectTransport, costs.otherCost]
    .filter((value) => value.trim())
    .some((value) => !Number.isFinite(Number(value)) || Number(value) < 0);
}

function foreignBatchAllocationBases(
  items: CostingItemForm[],
  allocationMethod: TenderCostingLcAllocationMethod,
): number[] {
  const productValues = items.map((item) =>
    Math.max(
      0,
      (Number(item.quantity) || 0) *
        (Number(item.foreignUnitPrice) || 0) *
        (Number(item.foreignExchangeRate) || 0),
    ),
  );

  if (allocationMethod === "WEIGHT") {
    const weights = items.map((item) => Math.max(0, Number(item.shippingWeightKg) || 0));
    if (weights.every((weight) => weight > 0)) return weights;
    if (productValues.every((value) => value > 0)) return productValues;
  }

  if (allocationMethod === "VALUE" && productValues.every((value) => value > 0)) {
    return productValues;
  }

  return items.map(() => 1);
}

function allocateForeignBatchAmount(
  items: CostingItemForm[],
  totalInput: string,
  allocationMethod: TenderCostingLcAllocationMethod,
): Map<string, string> {
  const totalMinorUnits = Math.round(Math.max(0, Number(totalInput) || 0) * 100);
  const bases = foreignBatchAllocationBases(items, allocationMethod);
  const basisTotal = bases.reduce((sum, basis) => sum + basis, 0);
  const allocations = new Map<string, string>();
  let allocatedMinorUnits = 0;

  items.forEach((item, index) => {
    const shareMinorUnits =
      index === items.length - 1
        ? totalMinorUnits - allocatedMinorUnits
        : Math.round((totalMinorUnits * (bases[index] ?? 0)) / basisTotal);
    allocatedMinorUnits += shareMinorUnits;
    allocations.set(item.id, compactInputNumber((shareMinorUnits / 100).toFixed(2), true));
  });

  return allocations;
}

function allocateForeignBatchCosts(
  items: CostingItemForm[],
  targetIds: ReadonlySet<string>,
  costs: ForeignBatchCostForm,
): CostingItemForm[] {
  const targetItems = items.filter(
    (item) => targetIds.has(item.id) && item.sourcingType === "FOREIGN",
  );
  if (targetItems.length === 0) return items;

  const originTransport = allocateForeignBatchAmount(
    targetItems,
    costs.originTransport,
    costs.allocationMethod,
  );
  const localTransport = allocateForeignBatchAmount(
    targetItems,
    costs.localTransport,
    costs.allocationMethod,
  );
  const projectTransport = allocateForeignBatchAmount(
    targetItems,
    costs.projectTransport,
    costs.allocationMethod,
  );
  const otherCost = allocateForeignBatchAmount(
    targetItems,
    costs.otherCost,
    costs.allocationMethod,
  );

  return items.map((item) =>
    targetIds.has(item.id) && item.sourcingType === "FOREIGN"
      ? {
          ...item,
          foreignTransportCharge: originTransport.get(item.id) ?? "",
          foreignLocalTransportCost: localTransport.get(item.id) ?? "",
          domesticTransportCost: projectTransport.get(item.id) ?? "",
          foreignOtherCost: otherCost.get(item.id) ?? "",
          costingStatus: "DRAFT",
        }
      : item,
  );
}
function defaultShippingRateBasis(
  method: TenderCostingShippingMethod,
): TenderCostingShippingRateBasis {
  return method.startsWith("LC_") ? "FLAT" : "PER_KG";
}

function defaultShippingRate(method: TenderCostingShippingMethod): string {
  if (method.startsWith("LC_")) return "";
  return method.endsWith("AIR") ? "800" : "400";
}

const DEFAULT_VAT_PERCENT = "10";
const DEFAULT_TAX_PERCENT = "5";
let costingItemIdSequence = 0;

function createCostingItemId(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return `costing-item-${globalThis.crypto.randomUUID()}`;
  }
  costingItemIdSequence += 1;
  return `costing-item-${Date.now().toString(36)}-${costingItemIdSequence.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function countryOptionsWithCurrent(country: string) {
  return country && !COUNTRY_OPTIONS.some((option) => option.value === country)
    ? [{ value: country, label: country }, ...COUNTRY_OPTIONS]
    : COUNTRY_OPTIONS;
}

function blankItem(
  description = "",
  preparedByUserId = "",
  costingDate = localDate(),
  sourcingType: TenderCostingSourcingType = "LOCAL",
): CostingItemForm {
  return {
    id: createCostingItemId(),
    costingDate,
    preparedByUserId,
    description,
    secondaryDescription: "",
    unit: "Nos",
    quantity: "",
    marginPercent: "10",
    sourcingType,
    costingStatus: "NOT_COSTED",
    selectedSource:
      sourcingType === "FOREIGN" ? "FOREIGN" : sourcingType === "LOCAL" ? "LOCAL" : "",
    localSupplierName: "",
    localUnitPrice: "0",
    localDiscountPercent: "",
    localVatPercent: DEFAULT_VAT_PERCENT,
    localTaxPercent: DEFAULT_TAX_PERCENT,
    localTransportCost: "",
    localOtherCost: "",
    foreignSupplierName: "",
    foreignCountry: "China",
    foreignCurrency: DEFAULT_CHINA_CURRENCY,
    foreignUnitPrice: "",
    foreignExchangeRate: DEFAULT_CNY_TO_BDT_RATE,
    exchangeRateDate: localDate(),
    foreignShippingMethod: "DOOR_TO_DOOR_SEA",
    foreignShippingProvider: "",
    foreignDoorToDoorCharge: "",
    foreignImportDutyIncluded: false,
    foreignTransitDays: "",
    foreignShippingReference: "",
    foreignTransportCharge: "",
    customsDeclarationCharge: "",
    shippingWeightKg: "",
    shippingVolumeCbm: "",
    shippingRateBasis: "PER_KG",
    shippingRate: "400",
    domesticTransportCost: "",
    foreignFreightCost: "",
    foreignInsuranceCost: "",
    customsDutyPercent: "",
    regulatoryDutyPercent: "",
    supplementaryDutyPercent: "",
    foreignVatPercent: DEFAULT_VAT_PERCENT,
    foreignTaxPercent: DEFAULT_TAX_PERCENT,
    cnfCharge: "",
    portHandlingCharge: "",
    bankLcCharge: "",
    foreignLocalTransportCost: "",
    foreignOtherCost: "",
    remarks: "",
  };
}

function localDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function normalizedSourcingType(
  sourcingType: TenderCostingSourcingType,
  selectedSource?: TenderCostingSelectedSource | null,
): TenderCostingSelectedSource {
  if (sourcingType !== "LOCAL_AND_FOREIGN") return sourcingType;
  return selectedSource === "FOREIGN" ? "FOREIGN" : "LOCAL";
}

function formatMoney(value: number): string {
  return formatBDT(value);
}

function formatCompactMoney(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function compactInputNumber(value: string | number | null | undefined, blankZero = false): string {
  const text = String(value ?? "").trim();
  if (!text) return "";
  const numericValue = Number(text);
  if (!Number.isFinite(numericValue)) return text;
  if (blankZero && numericValue === 0) return "";
  if (!text.includes(".")) return text;
  return text.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function costingImportKey(
  item: Pick<CostingItemForm, "description" | "unit" | "quantity" | "sourceItemNo">,
) {
  const description = item.description.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
  return [
    item.sourceItemNo
      ?.trim()
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}.]+/gu, "") ?? "",
    description,
    item.unit.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""),
    compactInputNumber(item.quantity, true),
  ].join("|");
}

function isBlankCostingPlaceholder(item: CostingItemForm): boolean {
  return (
    !item.description.trim() &&
    !compactInputNumber(item.quantity, true) &&
    !compactInputNumber(item.localUnitPrice, true) &&
    !compactInputNumber(item.foreignUnitPrice, true)
  );
}

const NUMBER_INPUT_CLASS =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

function calculateItemPreview(item: CostingItemForm) {
  const quantity = Number(item.quantity) || 0;
  const localBase = quantity * (Number(item.localUnitPrice) || 0);
  const localTaxable = localBase * (1 - (Number(item.localDiscountPercent) || 0) / 100);
  const localCostBeforeProfit =
    localTaxable + (Number(item.localTransportCost) || 0) + (Number(item.localOtherCost) || 0);
  const foreignExchangeRate = Number(item.foreignExchangeRate) || 1;
  const foreignProductTotal = quantity * (Number(item.foreignUnitPrice) || 0);
  const foreignProductValue = roundMoney(foreignProductTotal * foreignExchangeRate);
  const isDoorToDoor = item.foreignShippingMethod.startsWith("DOOR_TO_DOOR");
  const isLc = item.foreignShippingMethod.startsWith("LC_");
  const shippingRate = Number(item.shippingRate) || 0;
  const shippingWeightKg = Number(item.shippingWeightKg) || 0;
  const totalShippingWeightKg = quantity * shippingWeightKg;
  const shippingCostBdt = totalShippingWeightKg * shippingRate;
  const foreignTransportFee = Number(item.foreignTransportCharge) || 0;
  const foreignTransportBdt = foreignTransportFee * foreignExchangeRate;
  const usesLegacyDetailedDoorShipping =
    !isLc &&
    (item.shippingRateBasis !== "PER_KG" ||
      item.foreignImportDutyIncluded ||
      Number(item.foreignDoorToDoorCharge) > 0 ||
      Number(item.foreignFreightCost) > 0 ||
      Number(item.shippingVolumeCbm) > 0 ||
      Number(item.customsDeclarationCharge) > 0 ||
      Number(item.customsDutyPercent) > 0 ||
      Number(item.regulatoryDutyPercent) > 0 ||
      Number(item.supplementaryDutyPercent) > 0 ||
      Number(item.foreignInsuranceCost) > 0 ||
      Number(item.cnfCharge) > 0 ||
      Number(item.portHandlingCharge) > 0 ||
      Number(item.bankLcCharge) > 0);
  const usesLegacyDetailedShipping = isLc
    ? item.shippingRateBasis !== "FLAT"
    : usesLegacyDetailedDoorShipping;
  const hasSubmittedKgShipping =
    !usesLegacyDetailedShipping && shippingWeightKg > 0 && shippingRate > 0;
  const legacyInternationalShippingBdt = isDoorToDoor
    ? Number(item.foreignDoorToDoorCharge) || 0
    : Number(item.foreignFreightCost) || 0;
  const internationalShippingBdt = hasSubmittedKgShipping
    ? shippingCostBdt
    : legacyInternationalShippingBdt;
  const legacyShippingCharge =
    item.shippingRateBasis === "PER_CBM"
      ? (Number(item.shippingVolumeCbm) || 0) * shippingRate
      : item.shippingRateBasis === "PER_KG"
        ? shippingWeightKg * shippingRate
        : shippingRate;
  const legacyShippingSubtotal =
    foreignTransportFee + (Number(item.customsDeclarationCharge) || 0) + legacyShippingCharge;
  const legacyShippingSubtotalBdt =
    legacyShippingSubtotal > 0
      ? legacyShippingSubtotal * foreignExchangeRate
      : Number(item.foreignDoorToDoorCharge) || 0;
  const legacyAssessableValue = isDoorToDoor
    ? foreignProductValue + legacyShippingSubtotalBdt
    : foreignProductValue +
      (Number(item.foreignFreightCost) || 0) +
      (Number(item.foreignInsuranceCost) || 0);
  const legacyDutyRate =
    ((Number(item.customsDutyPercent) || 0) +
      (Number(item.regulatoryDutyPercent) || 0) +
      (Number(item.supplementaryDutyPercent) || 0)) /
    100;
  const legacyTaxBase =
    isDoorToDoor && item.foreignImportDutyIncluded
      ? legacyAssessableValue
      : legacyAssessableValue * (1 + legacyDutyRate);
  const legacyCostBeforeProfit = isDoorToDoor
    ? legacyTaxBase +
      (Number(item.domesticTransportCost) || 0) +
      (Number(item.foreignOtherCost) || 0)
    : legacyTaxBase +
      (Number(item.cnfCharge) || 0) +
      (Number(item.portHandlingCharge) || 0) +
      (Number(item.bankLcCharge) || 0) +
      (Number(item.foreignLocalTransportCost) || 0) +
      (Number(item.foreignOtherCost) || 0);
  const simplifiedLcCostBeforeProfit =
    foreignProductValue +
    foreignTransportBdt +
    (Number(item.bankLcCharge) || 0) +
    (Number(item.portHandlingCharge) || 0) +
    (Number(item.foreignFreightCost) || 0) +
    (Number(item.cnfCharge) || 0) +
    (Number(item.foreignLocalTransportCost) || 0) +
    (Number(item.domesticTransportCost) || 0) +
    (Number(item.foreignOtherCost) || 0);
  const simplifiedDoorCostBeforeProfit =
    foreignProductValue +
    foreignTransportBdt +
    internationalShippingBdt +
    (Number(item.foreignLocalTransportCost) || 0) +
    (Number(item.domesticTransportCost) || 0) +
    (Number(item.foreignOtherCost) || 0);
  const simplifiedCostBeforeProfit = isLc
    ? simplifiedLcCostBeforeProfit
    : simplifiedDoorCostBeforeProfit;
  const foreignCostBeforeProfit = roundMoney(
    usesLegacyDetailedShipping ? legacyCostBeforeProfit : simplifiedCostBeforeProfit,
  );
  const selectedSource =
    item.sourcingType === "LOCAL"
      ? "LOCAL"
      : item.sourcingType === "FOREIGN"
        ? "FOREIGN"
        : item.selectedSource;
  const marginPercent = Number(item.marginPercent) || 0;
  const localTotal =
    localCostBeforeProfit *
    (1 + marginPercent / 100) *
    (1 + ((Number(item.localVatPercent) || 0) + (Number(item.localTaxPercent) || 0)) / 100);
  const foreignLanded = foreignCostBeforeProfit;
  const selectedCostBeforeProfit =
    selectedSource === "FOREIGN" ? foreignCostBeforeProfit : localCostBeforeProfit;
  const selectedUnitCost = quantity > 0 ? selectedCostBeforeProfit / quantity : 0;
  const selectedVatPercent =
    selectedSource === "FOREIGN"
      ? Number(item.foreignVatPercent) || 0
      : Number(item.localVatPercent) || 0;
  const selectedTaxPercent =
    selectedSource === "FOREIGN"
      ? Number(item.foreignTaxPercent) || 0
      : Number(item.localTaxPercent) || 0;
  const subtotalBeforeTax = selectedCostBeforeProfit * (1 + marginPercent / 100);
  const totalProfit = selectedCostBeforeProfit * (marginPercent / 100);
  const vatAmount = (subtotalBeforeTax * selectedVatPercent) / 100;
  const taxAmount = (subtotalBeforeTax * selectedTaxPercent) / 100;
  const selectedGrandTotal = roundMoney(subtotalBeforeTax + vatAmount + taxAmount);
  const totalSales = selectedGrandTotal;
  const unitSalesPrice = quantity > 0 ? selectedGrandTotal / quantity : 0;
  const selectedTotal = item.costingStatus === "COSTED" ? selectedGrandTotal : 0;
  return {
    localTotal,
    foreignProductTotal,
    foreignUnitValueBdt: roundMoney((Number(item.foreignUnitPrice) || 0) * foreignExchangeRate),
    foreignProductValue,
    foreignTransportBdt,
    totalShippingWeightKg,
    shippingCostBdt,
    foreignLanded,
    selectedCostBeforeProfit,
    selectedTotal,
    selectedGrandTotal,
    selectedUnitCost,
    unitSalesPrice,
    totalSales,
    totalProfit,
    subtotalBeforeTax,
    vatAmount,
    taxAmount,
    selectedVatPercent,
    selectedTaxPercent,
  };
}

function foreignCostingValidationError(item: CostingItemForm): string | null {
  const product = item.description || "the selected item";
  if (Number(item.foreignUnitPrice) <= 0) return `Enter Foreign Unit Price for ${product}.`;
  if (Number(item.foreignExchangeRate) <= 0) return `Enter a valid Exchange Rate for ${product}.`;
  if (!item.foreignCountry.trim()) return `Select Country for ${product}.`;
  if (item.foreignShippingMethod.startsWith("LC_")) return null;
  const usesLegacyShipping =
    Number(item.shippingWeightKg) <= 0 &&
    Number(item.shippingRate) <= 0 &&
    (Number(item.foreignDoorToDoorCharge) > 0 || Number(item.foreignFreightCost) > 0);
  if (usesLegacyShipping) return null;
  if (Number(item.shippingWeightKg) <= 0) return `Enter Shipping Weight (KG) for ${product}.`;
  if (Number(item.shippingRate) <= 0) return `Enter a Shipping Rate for ${product}.`;
  return null;
}

type ForeignCostingInputColumn =
  "unit-fx" | "currency" | "fx-rate" | "shipping-method" | "cost-2" | "cost-3";

type LocalCostingInputColumn =
  "costing-date" | "prepared-by" | "product" | "unit" | "quantity" | "unit-price";

interface ForeignCostingInputIssue {
  column: ForeignCostingInputColumn;
  message: string;
}

function foreignCostingInputIssues(item: CostingItemForm): ForeignCostingInputIssue[] {
  const product = item.description || "the selected item";
  const issues: ForeignCostingInputIssue[] = [];

  if (Number(item.foreignUnitPrice) <= 0) {
    issues.push({ column: "unit-fx", message: `Enter Foreign Unit Price for ${product}.` });
  }
  if (!item.foreignCurrency.trim()) {
    issues.push({ column: "currency", message: `Select Currency for ${product}.` });
  }
  if (Number(item.foreignExchangeRate) <= 0) {
    issues.push({ column: "fx-rate", message: `Enter a valid Exchange Rate for ${product}.` });
  }
  if (!item.foreignShippingMethod) {
    issues.push({ column: "shipping-method", message: `Select Shipping Method for ${product}.` });
    return issues;
  }
  if (item.foreignShippingMethod.startsWith("LC_")) return issues;

  const usesLegacyShipping =
    Number(item.shippingWeightKg) <= 0 &&
    Number(item.shippingRate) <= 0 &&
    (Number(item.foreignDoorToDoorCharge) > 0 || Number(item.foreignFreightCost) > 0);
  if (usesLegacyShipping) return issues;

  if (Number(item.shippingWeightKg) <= 0) {
    issues.push({ column: "cost-2", message: `Enter Shipping Weight (KG) for ${product}.` });
  }
  if (Number(item.shippingRate) <= 0) {
    issues.push({ column: "cost-3", message: `Enter a Shipping Rate for ${product}.` });
  }
  return issues;
}

export default function TenderCostingEditorPage() {
  useSetBreadcrumb([
    { label: "Tender Management", href: "/tender-management" },
    { label: "Tender Costing", href: "/tender-management/tender-costing" },
    { label: "Prepare Costing" },
  ]);

  const router = useRouter();
  const [costingId, setCostingId] = React.useState<string>();
  const [header, setHeader] = React.useState<HeaderForm>({
    costingDate: localDate(),
    preparedByUserId: "",
    source: "",
    currency: "BDT",
    exchangeRate: "1",
    costingVersion: "1",
    remarks: "",
  });
  const [additional, setAdditional] = React.useState<AdditionalForm>({
    freightCost: "",
    installationCost: "",
    otherCost: "",
    contingencyPercent: "0",
    validityDays: "",
    paymentTermId: "",
    deliveryTime: "",
    warranty: "",
  });
  const [items, setItems] = React.useState<CostingItemForm[]>([]);
  const [sourceFilter, setSourceFilter] = React.useState("ALL");
  const [bulkSourcingType, setBulkSourcingType] = React.useState<TenderCostingSourcingType | "">(
    "",
  );
  const [selectedItemIds, setSelectedItemIds] = React.useState<Set<string>>(new Set());
  const [activeCostingIds, setActiveCostingIds] = React.useState<Set<string>>(new Set());
  const [foreignEditReturnIds, setForeignEditReturnIds] = React.useState<Set<string>>(new Set());
  const [intakeValidationAttemptedIds, setIntakeValidationAttemptedIds] = React.useState<
    Set<string>
  >(new Set());
  const [commonIntakeValidationColumns, setCommonIntakeValidationColumns] = React.useState<
    Set<LocalCostingInputColumn>
  >(new Set());
  const [lastPreparedByUserId, setLastPreparedByUserId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saveError, setSaveError] = React.useState("");
  const [budgetInput, setBudgetInput] = React.useState("");
  const [budgetError, setBudgetError] = React.useState("");
  const [budgetNotice, setBudgetNotice] = React.useState("");
  const [budgetEditorOpen, setBudgetEditorOpen] = React.useState(false);
  const [isDirty, setIsDirty] = React.useState(false);
  const [profitSettingsOpen, setProfitSettingsOpen] = React.useState(false);
  const [localTargetMargin, setLocalTargetMargin] = React.useState("10");
  const [foreignTargetMargin, setForeignTargetMargin] = React.useState("10");
  const [commonVatPercent, setCommonVatPercent] = React.useState(DEFAULT_VAT_PERCENT);
  const [commonTaxPercent, setCommonTaxPercent] = React.useState(DEFAULT_TAX_PERCENT);
  const [bulkForeign, setBulkForeign] = React.useState<BulkForeignForm>({
    country: "China",
    currency: DEFAULT_CHINA_CURRENCY,
    exchangeRate: DEFAULT_CNY_TO_BDT_RATE,
    exchangeRateDate: localDate(),
    shippingMethod: "DOOR_TO_DOOR_SEA",
  });
  const [foreignBatchCosts, setForeignBatchCosts] =
    React.useState<ForeignBatchCostForm>(emptyForeignBatchCosts);
  const [lcContainerFee, setLcContainerFee] = React.useState("");
  const [lcContainerAllocationMethod, setLcContainerAllocationMethod] =
    React.useState<TenderCostingLcAllocationMethod>("EQUAL");
  const [lcContainerEditorOpen, setLcContainerEditorOpen] = React.useState(false);
  const [lcContainerFeeDraft, setLcContainerFeeDraft] = React.useState("");
  const [lcAllocationMethodDraft, setLcAllocationMethodDraft] =
    React.useState<TenderCostingLcAllocationMethod>("EQUAL");
  const [lcWeightDrafts, setLcWeightDrafts] = React.useState<Record<string, string>>({});
  const [lcEditorAttempted, setLcEditorAttempted] = React.useState(false);
  const [pendingLcAction, setPendingLcAction] = React.useState<PendingLcAction>(null);
  const [foreignCostingNotice, setForeignCostingNotice] = React.useState("");
  const [isReadingCostingPdfs, setIsReadingCostingPdfs] = React.useState(false);
  const [costingPdfNotice, setCostingPdfNotice] = React.useState("");
  const [costingPdfError, setCostingPdfError] = React.useState("");
  const [productEditor, setProductEditor] = React.useState<{
    itemId: string;
    value: string;
  } | null>(null);
  const [inlineProductEditIds, setInlineProductEditIds] = React.useState<Set<string>>(new Set());
  const [success, setSuccess] = React.useState<{ title: string; message: string } | null>(null);
  const hydratedId = React.useRef<string | undefined>(undefined);
  const costingPdfInputRef = React.useRef<HTMLInputElement | null>(null);
  const intakeSectionRef = React.useRef<HTMLDivElement | null>(null);
  const costingWorkspaceRef = React.useRef<HTMLDivElement | null>(null);
  const costedItemsListRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    const seenIds = new Set<string>();
    const replacements: Array<{ previousId: string; nextId: string }> = [];
    const normalizedItems = items.map((item) => {
      if (!seenIds.has(item.id)) {
        seenIds.add(item.id);
        return item;
      }
      const nextId = createCostingItemId();
      seenIds.add(nextId);
      replacements.push({ previousId: item.id, nextId });
      return { ...item, id: nextId };
    });
    if (replacements.length === 0) return;

    const includeReplacementIds = (current: Set<string>) => {
      const next = new Set(current);
      replacements.forEach(({ previousId, nextId }) => {
        if (current.has(previousId)) next.add(nextId);
      });
      return next;
    };
    const timer = window.setTimeout(() => {
      setItems(normalizedItems);
      setSelectedItemIds(includeReplacementIds);
      setActiveCostingIds(includeReplacementIds);
      setForeignEditReturnIds(includeReplacementIds);
      setIntakeValidationAttemptedIds(includeReplacementIds);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [items]);

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("costingId") ?? undefined;
    const timer = window.setTimeout(() => setCostingId(id), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const costing = useTenderCosting(costingId);
  const saveCosting = useSaveTenderCosting();
  const setCostingBudget = useSetTenderCostingBudget();
  const options = useTenderOptions();
  const effectivePreparedByUserId =
    header.preparedByUserId ||
    (options.data?.users.some((user) => user.id === options.data?.currentUserId)
      ? options.data.currentUserId
      : "");

  React.useEffect(() => {
    const record = costing.data;
    if (!record || hydratedId.current === record.id) return;
    hydratedId.current = record.id;
    setHeader({
      costingDate: record.costingDate.slice(0, 10),
      preparedByUserId: record.preparedByUserId ?? "",
      source: record.source ?? "",
      currency: record.currency,
      exchangeRate: record.exchangeRate,
      costingVersion: String(record.costingVersion),
      remarks: record.remarks ?? "",
    });
    setAdditional({
      freightCost: record.freightCost === "0" ? "" : record.freightCost,
      installationCost: record.installationCost === "0" ? "" : record.installationCost,
      otherCost: record.otherCost === "0" ? "" : record.otherCost,
      contingencyPercent: record.contingencyPercent,
      validityDays: record.validityDays ? String(record.validityDays) : "",
      paymentTermId: record.paymentTermId ?? "",
      deliveryTime: record.deliveryTime ?? "",
      warranty: record.warranty ?? "",
    });
    setBudgetInput(compactInputNumber(record.costingBudget, true));
    if (Number(record.costingBudget) <= 0 && record.status !== "CANCELLED") {
      window.setTimeout(() => setBudgetEditorOpen(true), 0);
    }
    const hydratedItems =
      record.items.length > 0
        ? record.items.map((item) => ({
            id: item.id,
            costingDate: item.costingDate.slice(0, 10),
            preparedByUserId: item.preparedByUserId ?? "",
            description: item.description,
            secondaryDescription: item.secondaryDescription ?? "",
            unit: item.unit,
            quantity: compactInputNumber(item.quantity, true),
            marginPercent: compactInputNumber(item.marginPercent, true),
            sourcingType: normalizedSourcingType(item.sourcingType, item.selectedSource),
            costingStatus: item.costingStatus,
            selectedSource: normalizedSourcingType(item.sourcingType, item.selectedSource),
            localSupplierName: item.localSupplierName ?? "",
            localUnitPrice: compactInputNumber(item.localUnitPrice),
            localDiscountPercent: compactInputNumber(item.localDiscountPercent, true),
            localVatPercent: compactInputNumber(item.localVatPercent, true) || DEFAULT_VAT_PERCENT,
            localTaxPercent: compactInputNumber(item.localTaxPercent, true) || DEFAULT_TAX_PERCENT,
            localTransportCost: compactInputNumber(item.localTransportCost, true),
            localOtherCost: compactInputNumber(item.localOtherCost, true),
            foreignSupplierName: item.foreignSupplierName ?? "",
            foreignCountry: item.foreignCountry ?? "",
            foreignCurrency: item.foreignCurrency,
            foreignUnitPrice: compactInputNumber(item.foreignUnitPrice, true),
            foreignExchangeRate: compactInputNumber(item.foreignExchangeRate, true),
            exchangeRateDate: item.exchangeRateDate?.slice(0, 10) ?? "",
            foreignShippingMethod: item.foreignShippingMethod,
            foreignShippingProvider: item.foreignShippingProvider ?? "",
            foreignDoorToDoorCharge: compactInputNumber(item.foreignDoorToDoorCharge, true),
            foreignImportDutyIncluded: item.foreignImportDutyIncluded,
            foreignTransitDays: item.foreignTransitDays ? String(item.foreignTransitDays) : "",
            foreignShippingReference: item.foreignShippingReference ?? "",
            foreignTransportCharge: compactInputNumber(item.foreignTransportCharge, true),
            customsDeclarationCharge: compactInputNumber(item.customsDeclarationCharge, true),
            shippingWeightKg: compactInputNumber(item.shippingWeightKg, true),
            shippingVolumeCbm: compactInputNumber(item.shippingVolumeCbm, true),
            shippingRateBasis: item.shippingRateBasis,
            shippingRate: compactInputNumber(item.shippingRate, true),
            domesticTransportCost: compactInputNumber(item.domesticTransportCost, true),
            foreignFreightCost: compactInputNumber(item.foreignFreightCost, true),
            foreignInsuranceCost: compactInputNumber(item.foreignInsuranceCost, true),
            customsDutyPercent: compactInputNumber(item.customsDutyPercent, true),
            regulatoryDutyPercent: compactInputNumber(item.regulatoryDutyPercent, true),
            supplementaryDutyPercent: compactInputNumber(item.supplementaryDutyPercent, true),
            foreignVatPercent:
              compactInputNumber(item.foreignVatPercent, true) || DEFAULT_VAT_PERCENT,
            foreignTaxPercent:
              compactInputNumber(item.foreignTaxPercent, true) || DEFAULT_TAX_PERCENT,
            cnfCharge: compactInputNumber(item.cnfCharge, true),
            portHandlingCharge: compactInputNumber(item.portHandlingCharge, true),
            bankLcCharge: compactInputNumber(item.bankLcCharge, true),
            foreignLocalTransportCost: compactInputNumber(item.foreignLocalTransportCost, true),
            foreignOtherCost: compactInputNumber(item.foreignOtherCost, true),
            remarks: item.remarks ?? "",
          }))
        : [];
    setItems(hydratedItems);
    const persistedContainerFee = Number(record.lcContainerFee) || 0;
    setLcContainerFee(compactInputNumber(String(persistedContainerFee), true));
    setLcContainerAllocationMethod(record.lcContainerAllocationMethod);
    setLastPreparedByUserId(
      [...record.items].reverse().find((item) => item.preparedByUserId)?.preparedByUserId ??
        record.preparedByUserId ??
        "",
    );
    setLocalTargetMargin(
      compactInputNumber(
        record.items.find((item) => item.sourcingType !== "FOREIGN")?.marginPercent ?? "10",
      ),
    );
    setForeignTargetMargin(
      compactInputNumber(
        record.items.find((item) => item.sourcingType !== "LOCAL")?.marginPercent ?? "10",
      ),
    );
    const firstPricedItem = record.items[0];
    const useForeignRates =
      firstPricedItem?.sourcingType === "FOREIGN" || firstPricedItem?.selectedSource === "FOREIGN";
    setCommonVatPercent(
      firstPricedItem
        ? useForeignRates
          ? compactInputNumber(firstPricedItem.foreignVatPercent, true) || DEFAULT_VAT_PERCENT
          : compactInputNumber(firstPricedItem.localVatPercent, true) || DEFAULT_VAT_PERCENT
        : DEFAULT_VAT_PERCENT,
    );
    setCommonTaxPercent(
      firstPricedItem
        ? useForeignRates
          ? compactInputNumber(firstPricedItem.foreignTaxPercent, true) || DEFAULT_TAX_PERCENT
          : compactInputNumber(firstPricedItem.localTaxPercent, true) || DEFAULT_TAX_PERCENT
        : DEFAULT_TAX_PERCENT,
    );
    const firstForeignItem = record.items.find(
      (item) => item.sourcingType === "FOREIGN" || item.selectedSource === "FOREIGN",
    );
    const usesUnusedLegacyChinaDefaults = Boolean(
      firstForeignItem &&
      (firstForeignItem.foreignCountry?.trim() || "China") === "China" &&
      firstForeignItem.foreignCurrency === "USD" &&
      Number(firstForeignItem.foreignExchangeRate) === 1 &&
      Number(firstForeignItem.foreignUnitPrice) <= 0,
    );
    setBulkForeign(
      firstForeignItem
        ? {
            country: firstForeignItem.foreignCountry?.trim() || "China",
            currency: usesUnusedLegacyChinaDefaults
              ? DEFAULT_CHINA_CURRENCY
              : firstForeignItem.foreignCurrency?.trim() || DEFAULT_CHINA_CURRENCY,
            exchangeRate: usesUnusedLegacyChinaDefaults
              ? DEFAULT_CNY_TO_BDT_RATE
              : Number(firstForeignItem.foreignExchangeRate) > 0
                ? compactInputNumber(firstForeignItem.foreignExchangeRate, true)
                : DEFAULT_CNY_TO_BDT_RATE,
            exchangeRateDate: usesUnusedLegacyChinaDefaults
              ? localDate()
              : (firstForeignItem.exchangeRateDate?.slice(0, 10) ?? localDate()),
            shippingMethod: firstForeignItem.foreignShippingMethod,
          }
        : {
            country: "China",
            currency: DEFAULT_CHINA_CURRENCY,
            exchangeRate: DEFAULT_CNY_TO_BDT_RATE,
            exchangeRateDate: localDate(),
            shippingMethod: "DOOR_TO_DOOR_SEA",
          },
    );
    setActiveCostingIds(new Set());
    setSelectedItemIds(new Set());
    setForeignEditReturnIds(new Set());
    setIntakeValidationAttemptedIds(new Set());
    setCommonIntakeValidationColumns(new Set());
    setCostingPdfNotice("");
    setCostingPdfError("");
    setIsDirty(false);
  }, [costing.data]);

  React.useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const warnBeforeLinkNavigation = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const link = target?.closest("a");
      if (!link || link.target === "_blank" || link.href === window.location.href) return;
      if (!window.confirm("You have unsaved costing changes. Leave this page?")) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", warnBeforeLinkNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", warnBeforeLinkNavigation, true);
    };
  }, [isDirty]);

  function itemsForLcAction(action: PendingLcAction): CostingItemForm[] {
    if (action?.kind === "ITEM") {
      return items.map((item) =>
        item.id === action.itemId ? withShippingMethod(item, action.shippingMethod) : item,
      );
    }
    if (action?.kind === "BULK_APPLY") {
      return items.map((item) =>
        activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN"
          ? { ...applyCommonForeignValues(item), costingStatus: "DRAFT" }
          : item,
      );
    }
    if (action?.kind === "BULK_SELECTION") {
      return items.map((item) =>
        activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN"
          ? withShippingMethod(item, action.shippingMethod)
          : item,
      );
    }
    return items;
  }

  function openLcContainerEditor(action: PendingLcAction = null) {
    const candidateItems = itemsForLcAction(action);
    setLcContainerFeeDraft(lcContainerFee);
    setLcAllocationMethodDraft(lcContainerAllocationMethod);
    setLcWeightDrafts(
      Object.fromEntries(
        candidateItems
          .filter(isLcForeignCostingItem)
          .map((item) => [item.id, item.shippingWeightKg]),
      ),
    );
    setLcEditorAttempted(false);
    setPendingLcAction(action);
    setLcContainerEditorOpen(false);
    if (action?.kind === "ITEM") {
      const targetIds = new Set([...activeCostingIds, action.itemId]);
      setActiveCostingIds(targetIds);
      setItems((current) =>
        allocateForeignBatchCosts(
          allocateLcContainerFee(
            current.map((item) =>
              item.id === action.itemId
                ? {
                    ...withShippingMethod(item, action.shippingMethod),
                    costingStatus: "DRAFT" as const,
                  }
                : item,
            ),
            lcContainerFee,
            lcContainerAllocationMethod,
          ),
          targetIds,
          foreignBatchCosts,
        ),
      );
    }
    setSaveError("Enter the LC Container Fee in the common costing row.");
  }

  function closeLcContainerEditor() {
    if (pendingLcAction?.kind === "BULK_SELECTION") {
      updateBulkForeignSettings({
        ...bulkForeign,
        shippingMethod: pendingLcAction.previousShippingMethod,
      });
    }
    setLcContainerEditorOpen(false);
    setPendingLcAction(null);
    setLcEditorAttempted(false);
  }

  function saveLcContainerSettings() {
    const normalizedFee = Number(lcContainerFeeDraft);
    const candidateItems = itemsForLcAction(pendingLcAction).map((item) =>
      isLcForeignCostingItem(item) && lcAllocationMethodDraft === "WEIGHT"
        ? { ...item, shippingWeightKg: lcWeightDrafts[item.id] ?? item.shippingWeightKg }
        : item,
    );
    const hasInvalidWeight =
      lcAllocationMethodDraft === "WEIGHT" &&
      candidateItems
        .filter(isLcForeignCostingItem)
        .some((item) => Number(item.shippingWeightKg) <= 0);

    if (!Number.isFinite(normalizedFee) || normalizedFee <= 0 || hasInvalidWeight) {
      setLcEditorAttempted(true);
      return;
    }

    const normalizedFeeInput = compactInputNumber(normalizedFee.toFixed(2), true);
    setItems(allocateLcContainerFee(candidateItems, normalizedFeeInput, lcAllocationMethodDraft));
    setLcContainerFee(normalizedFeeInput);
    setLcContainerAllocationMethod(lcAllocationMethodDraft);
    setLcContainerEditorOpen(false);
    setPendingLcAction(null);
    setLcEditorAttempted(false);
    setSaveError("");
    setIsDirty(true);
  }

  function handleForeignShippingMethodChange(
    item: CostingItemForm,
    shippingMethod: TenderCostingShippingMethod,
  ) {
    const selectingLc = shippingMethod.startsWith("LC_");
    const needsContainerSetup =
      selectingLc &&
      (Number(lcContainerFee) <= 0 ||
        (lcContainerAllocationMethod === "WEIGHT" && Number(item.shippingWeightKg) <= 0));
    if (needsContainerSetup) {
      openLcContainerEditor({ kind: "ITEM", itemId: item.id, shippingMethod });
      return;
    }
    updateItem(item.id, withShippingMethod(item, shippingMethod));
  }

  function updateItem(id: string, patch: Partial<CostingItemForm>) {
    setItems((current) =>
      allocateLcContainerFee(
        current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
        lcContainerFee,
        lcContainerAllocationMethod,
      ),
    );
    setIsDirty(true);
  }

  function updateItemRate(item: CostingItemForm, rate: "VAT" | "TAX", value: string) {
    const usesForeignRate = item.sourcingType === "FOREIGN" || item.selectedSource === "FOREIGN";
    updateItem(
      item.id,
      rate === "VAT"
        ? usesForeignRate
          ? { foreignVatPercent: value }
          : { localVatPercent: value }
        : usesForeignRate
          ? { foreignTaxPercent: value }
          : { localTaxPercent: value },
    );
  }

  function preparedByForItem(item: CostingItemForm) {
    return item.preparedByUserId || effectivePreparedByUserId;
  }

  function currentForeignDefaults(): Partial<CostingItemForm> {
    return {
      foreignCountry: bulkForeign.country,
      foreignCurrency: bulkForeign.currency,
      foreignExchangeRate: bulkForeign.exchangeRate,
      exchangeRateDate: bulkForeign.exchangeRateDate,
      foreignShippingMethod: bulkForeign.shippingMethod,
      shippingRateBasis: defaultShippingRateBasis(bulkForeign.shippingMethod),
      shippingRate: defaultShippingRate(bulkForeign.shippingMethod),
    };
  }

  function applyCommonForeignValues(
    item: CostingItemForm,
    settings: BulkForeignForm = bulkForeign,
  ): CostingItemForm {
    const isLc = settings.shippingMethod.startsWith("LC_");
    const preserveLcCharges = isLc && item.foreignShippingMethod.startsWith("LC_");
    const keepEditedRate =
      !isLc &&
      item.shippingRateBasis === "PER_KG" &&
      item.foreignShippingMethod === settings.shippingMethod &&
      Number(item.shippingRate) > 0;
    return {
      ...item,
      foreignCountry: settings.country,
      foreignCurrency: settings.currency,
      foreignExchangeRate: settings.exchangeRate,
      exchangeRateDate: settings.exchangeRateDate,
      foreignShippingMethod: settings.shippingMethod,
      shippingRateBasis: defaultShippingRateBasis(settings.shippingMethod),
      shippingRate: keepEditedRate
        ? item.shippingRate
        : defaultShippingRate(settings.shippingMethod),
      shippingWeightKg: item.shippingWeightKg,
      foreignTransportCharge: item.foreignTransportCharge,
      foreignDoorToDoorCharge: "",
      foreignImportDutyIncluded: false,
      customsDeclarationCharge: "",
      shippingVolumeCbm: "",
      foreignFreightCost: preserveLcCharges ? item.foreignFreightCost : "",
      foreignInsuranceCost: "",
      customsDutyPercent: "",
      regulatoryDutyPercent: "",
      supplementaryDutyPercent: "",
      cnfCharge: preserveLcCharges ? item.cnfCharge : "",
      portHandlingCharge: preserveLcCharges ? item.portHandlingCharge : "",
      bankLcCharge: preserveLcCharges ? item.bankLcCharge : "",
      foreignLocalTransportCost: isLc
        ? preserveLcCharges
          ? item.foreignLocalTransportCost
          : ""
        : item.foreignLocalTransportCost,
      domesticTransportCost: item.domesticTransportCost,
    };
  }

  function addAnotherItem() {
    const lastItem = items.at(-1);
    const inheritedPreparedByUserId = lastPreparedByUserId || effectivePreparedByUserId;
    const sourcingType = lastItem?.sourcingType || "LOCAL";
    const newItem = blankItem(
      "",
      inheritedPreparedByUserId,
      header.costingDate || localDate(),
      sourcingType,
    );
    setItems((current) =>
      allocateLcContainerFee(
        [
          ...current,
          {
            ...newItem,
            marginPercent: sourcingType === "FOREIGN" ? foreignTargetMargin : localTargetMargin,
            localVatPercent: commonVatPercent || DEFAULT_VAT_PERCENT,
            localTaxPercent: commonTaxPercent || DEFAULT_TAX_PERCENT,
            foreignVatPercent: commonVatPercent || DEFAULT_VAT_PERCENT,
            foreignTaxPercent: commonTaxPercent || DEFAULT_TAX_PERCENT,
            ...(sourcingType === "FOREIGN" ? currentForeignDefaults() : {}),
          },
        ],
        lcContainerFee,
        lcContainerAllocationMethod,
      ),
    );
    setIsDirty(true);
  }

  async function importCostingPdfFiles(selectedFiles: File[]) {
    if (selectedFiles.length === 0 || isReadingCostingPdfs) return;
    setCostingPdfNotice("");
    setCostingPdfError("");

    if (selectedFiles.length > 20) {
      setCostingPdfError("Select up to 20 BOQ PDF files at a time.");
      if (costingPdfInputRef.current) costingPdfInputRef.current.value = "";
      return;
    }
    const invalidFile = selectedFiles.find(
      (file) => file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf"),
    );
    if (invalidFile) {
      setCostingPdfError(`${invalidFile.name} is not a PDF file.`);
      if (costingPdfInputRef.current) costingPdfInputRef.current.value = "";
      return;
    }
    const oversizedFile = selectedFiles.find((file) => file.size > 10 * 1024 * 1024);
    if (oversizedFile) {
      setCostingPdfError(`${oversizedFile.name} must be 10 MB or smaller.`);
      if (costingPdfInputRef.current) costingPdfInputRef.current.value = "";
      return;
    }
    if (selectedFiles.reduce((total, file) => total + file.size, 0) > 50 * 1024 * 1024) {
      setCostingPdfError("The selected BOQ PDFs cannot exceed 50 MB in total.");
      if (costingPdfInputRef.current) costingPdfInputRef.current.value = "";
      return;
    }

    setIsReadingCostingPdfs(true);
    try {
      const result = await extractTenderCostingPdfs(selectedFiles);
      const onlyItem = items[0];
      const generatedTenderPlaceholder =
        items.length === 1 &&
        (costing.data?.items.length ?? 0) === 0 &&
        onlyItem?.description.trim().toLocaleLowerCase() ===
          costing.data?.tender.workName.trim().toLocaleLowerCase();
      const replacePlaceholder =
        items.length === 1 &&
        !!onlyItem &&
        (isBlankCostingPlaceholder(onlyItem) || generatedTenderPlaceholder);
      const existingItems = replacePlaceholder ? [] : items;
      const templateItem = items.at(-1) ?? blankItem();
      const existingKeys = new Set(existingItems.map(costingImportKey));
      let existingDuplicatesSkipped = 0;
      const importedItems = result.rows.flatMap((row) => {
        const key = costingImportKey({
          sourceItemNo: row.itemNo,
          description: row.description,
          unit: row.unit ?? "Nos",
          quantity: row.quantity === undefined ? "" : String(row.quantity),
        });
        if (existingKeys.has(key)) {
          existingDuplicatesSkipped += 1;
          return [];
        }
        const imported = blankItem(
          row.description,
          lastPreparedByUserId || effectivePreparedByUserId,
          header.costingDate || localDate(),
          templateItem.sourcingType,
        );
        const extractedUnitPrice =
          row.unitPrice ??
          (row.totalPrice && row.quantity ? row.totalPrice / row.quantity : undefined);
        return [
          {
            ...imported,
            sourceItemNo: row.itemNo ?? "",
            unit: row.unit ?? "Nos",
            quantity:
              row.quantity === undefined ? "" : compactInputNumber(String(row.quantity), true),
            marginPercent:
              templateItem.sourcingType === "FOREIGN" ? foreignTargetMargin : localTargetMargin,
            localVatPercent: commonVatPercent || DEFAULT_VAT_PERCENT,
            localTaxPercent: commonTaxPercent || DEFAULT_TAX_PERCENT,
            foreignVatPercent: commonVatPercent || DEFAULT_VAT_PERCENT,
            foreignTaxPercent: commonTaxPercent || DEFAULT_TAX_PERCENT,
            ...(templateItem.sourcingType === "FOREIGN" ? currentForeignDefaults() : {}),
            ...(extractedUnitPrice
              ? templateItem.sourcingType === "FOREIGN"
                ? { foreignUnitPrice: compactInputNumber(extractedUnitPrice.toFixed(4), true) }
                : { localUnitPrice: compactInputNumber(extractedUnitPrice.toFixed(4), true) }
              : {}),
          },
        ];
      });

      if (importedItems.length === 0) {
        setCostingPdfNotice("No new product row was added; matching rows already exist.");
        return;
      }
      setItems(
        allocateLcContainerFee(
          [...existingItems, ...importedItems],
          lcContainerFee,
          lcContainerAllocationMethod,
        ),
      );
      setSourceFilter("ALL");
      setSaveError("");
      setErrors({});
      setIsDirty(true);

      const failedFiles = result.files.filter((file) => file.error).length;
      const duplicateCount = result.duplicateRowsSkipped + existingDuplicatesSkipped;
      const details = [
        `${importedItems.length} product row${importedItems.length === 1 ? "" : "s"} added`,
        `${result.files.length - failedFiles} PDF${result.files.length - failedFiles === 1 ? "" : "s"} read`,
        ...(duplicateCount > 0
          ? [`${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} skipped`]
          : []),
        ...(failedFiles > 0
          ? [`${failedFiles} PDF${failedFiles === 1 ? "" : "s"} could not be read`]
          : []),
      ];
      setCostingPdfNotice(`${details.join(" · ")}. Review the rows before saving.`);
    } catch (error) {
      setCostingPdfError(
        error instanceof Error ? error.message : "Could not read the selected BOQ PDF files.",
      );
    } finally {
      setIsReadingCostingPdfs(false);
      if (costingPdfInputRef.current) costingPdfInputRef.current.value = "";
    }
  }

  function updateCommonCostingDate(costingDate: string) {
    setHeader((current) => ({ ...current, costingDate }));
    setItems((current) => current.map((item) => ({ ...item, costingDate })));
    setIsDirty(true);
  }

  function updateCommonPreparedBy(preparedByUserId: string) {
    setHeader((current) => ({ ...current, preparedByUserId }));
    setLastPreparedByUserId(preparedByUserId);
    setItems((current) => current.map((item) => ({ ...item, preparedByUserId })));
    setIsDirty(true);
  }

  function applyPricingSettings() {
    const localMargin = Math.min(99.99, Math.max(0, Number(localTargetMargin) || 0));
    const foreignMargin = Math.min(99.99, Math.max(0, Number(foreignTargetMargin) || 0));
    const vatPercent = Math.min(100, Math.max(0, Number(commonVatPercent) || 0));
    const taxPercent = Math.min(100, Math.max(0, Number(commonTaxPercent) || 0));
    const updatedItems = items.map((item) => ({
      ...item,
      localVatPercent: String(vatPercent),
      localTaxPercent: String(taxPercent),
      foreignVatPercent: String(vatPercent),
      foreignTaxPercent: String(taxPercent),
      marginPercent: String(
        item.sourcingType === "FOREIGN"
          ? foreignMargin
          : item.sourcingType === "LOCAL"
            ? localMargin
            : item.selectedSource === "FOREIGN"
              ? foreignMargin
              : localMargin,
      ),
    }));
    setLocalTargetMargin(String(localMargin));
    setForeignTargetMargin(String(foreignMargin));
    setCommonVatPercent(String(vatPercent));
    setCommonTaxPercent(String(taxPercent));
    setItems(updatedItems);
    setProfitSettingsOpen(false);
    setIsDirty(true);
    if (costing.data && costing.data.status !== "CANCELLED") {
      void save(costing.data.status, updatedItems);
    }
  }

  function applyBulkSourcingType() {
    if (!bulkSourcingType || selectedItemIds.size === 0) return;
    setItems((current) =>
      allocateLcContainerFee(
        current.map((item) =>
          selectedItemIds.has(item.id)
            ? {
                ...item,
                sourcingType: bulkSourcingType,
                selectedSource:
                  bulkSourcingType === "LOCAL"
                    ? "LOCAL"
                    : bulkSourcingType === "FOREIGN"
                      ? "FOREIGN"
                      : "",
                costingStatus: "NOT_COSTED",
                marginPercent:
                  bulkSourcingType === "FOREIGN" ? foreignTargetMargin : localTargetMargin,
              }
            : item,
        ),
        lcContainerFee,
        lcContainerAllocationMethod,
      ),
    );
    setActiveCostingIds((current) => {
      const next = new Set(current);
      selectedItemIds.forEach((id) => next.delete(id));
      return next;
    });
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      selectedItemIds.forEach((id) => next.delete(id));
      return next;
    });
    setBulkSourcingType("");
    setIsDirty(true);
  }

  function toggleItemSelection(id: string) {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startSelectedCosting() {
    const candidateIds = costingCandidateItems.map((item) => item.id);
    if (candidateIds.length === 0) {
      setSaveError("No item is available in the current filter.");
      return;
    }
    setSaveError("");
    setForeignCostingNotice("");
    const nextActiveIds = new Set([...activeCostingIds, ...candidateIds]);
    const nextForeignBatch = items.filter(
      (item) => nextActiveIds.has(item.id) && item.sourcingType === "FOREIGN",
    );
    if (nextForeignBatch.length > 0) {
      setForeignBatchCosts((current) =>
        foreignBatchCostsFromItems(nextForeignBatch, current.allocationMethod),
      );
    }
    setActiveCostingIds((current) => new Set([...current, ...candidateIds]));
    window.setTimeout(
      () => costingWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function openItemCosting(item: CostingItemForm) {
    const missingRequiredFields = [
      { column: "product", missing: !item.description.trim() },
      { column: "unit", missing: !item.unit.trim() },
      { column: "quantity", missing: Number(item.quantity) <= 0 },
    ].filter((field) => field.missing);
    if (missingRequiredFields.length > 0) {
      setSaveError("");
      setIntakeValidationAttemptedIds((current) => new Set(current).add(item.id));
      window.setTimeout(() => {
        const row = Array.from(
          intakeSectionRef.current?.querySelectorAll<HTMLElement>("[data-costing-row]") ?? [],
        ).find((candidate) => candidate.dataset.costingRowId === item.id);
        const firstMissingField = row?.querySelector<HTMLInputElement | HTMLSelectElement>(
          `[data-costing-column="${missingRequiredFields[0]?.column}"]`,
        );
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        firstMissingField?.focus();
      }, 0);
      return;
    }
    setIntakeValidationAttemptedIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    if (!item.costingDate || !preparedByForItem(item)) {
      setSaveError("Select the common Costing Date and Prepared By first.");
      return;
    }
    if (item.sourcingType === "LOCAL") {
      void markItemCosted(item);
      return;
    }
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      if (item.costingStatus === "DRAFT") next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    setSaveError("");
    setForeignCostingNotice("");
    if (item.sourcingType === "FOREIGN") {
      const nextActiveIds = new Set([...activeCostingIds, item.id]);
      setForeignBatchCosts((current) =>
        foreignBatchCostsFromItems(
          items.filter(
            (candidate) => nextActiveIds.has(candidate.id) && candidate.sourcingType === "FOREIGN",
          ),
          current.allocationMethod,
        ),
      );
    }
    setActiveCostingIds((current) => new Set([...current, item.id]));
    window.setTimeout(
      () => costingWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function updateBulkForeignSettings(nextSettings: BulkForeignForm) {
    const targetIds = activeCostingIds;
    setBulkForeign(nextSettings);
    if (targetIds.size === 0) {
      return;
    }
    const candidateItems = items.map((item) =>
      targetIds.has(item.id) && item.sourcingType === "FOREIGN"
        ? {
            ...applyCommonForeignValues(item, nextSettings),
            costingStatus: "DRAFT" as const,
          }
        : item,
    );
    setItems(
      allocateForeignBatchCosts(
        allocateLcContainerFee(candidateItems, lcContainerFee, lcContainerAllocationMethod),
        targetIds,
        foreignBatchCosts,
      ),
    );
    setSaveError("");
    setForeignCostingNotice("");
    setIsDirty(true);
  }

  function updateForeignBatchCosts(patch: Partial<ForeignBatchCostForm>) {
    const nextCosts = { ...foreignBatchCosts, ...patch };
    setForeignBatchCosts(nextCosts);
    setLcContainerAllocationMethod(nextCosts.allocationMethod);
    setItems((current) =>
      allocateForeignBatchCosts(
        allocateLcContainerFee(current, lcContainerFee, nextCosts.allocationMethod),
        activeCostingIds,
        nextCosts,
      ),
    );
    setSaveError("");
    setForeignCostingNotice("");
    setIsDirty(true);
  }

  function updateInlineLcContainerFee(value: string) {
    setLcContainerFee(value);
    setItems((current) =>
      allocateForeignBatchCosts(
        allocateLcContainerFee(current, value, foreignBatchCosts.allocationMethod),
        activeCostingIds,
        foreignBatchCosts,
      ),
    );
    setSaveError("");
    setForeignCostingNotice("");
    setIsDirty(true);
  }

  function updateForeignBatchItem(id: string, patch: Partial<CostingItemForm>) {
    setItems((current) =>
      allocateForeignBatchCosts(
        allocateLcContainerFee(
          current.map((item) =>
            item.id === id ? { ...item, ...patch, costingStatus: "DRAFT" } : item,
          ),
          lcContainerFee,
          lcContainerAllocationMethod,
        ),
        activeCostingIds,
        foreignBatchCosts,
      ),
    );
    setSaveError("");
    setForeignCostingNotice("");
    setIsDirty(true);
  }

  function saveAllActiveForeignCosting() {
    if (!bulkForeign.country || Number(bulkForeign.exchangeRate) <= 0) {
      setSaveError("Select Country and enter a valid Foreign exchange rate first.");
      return;
    }
    if (hasInvalidForeignBatchCost(foreignBatchCosts)) {
      setSaveError("Shipment common costs cannot contain a negative or invalid amount.");
      return;
    }
    const updatedItems: CostingItemForm[] = allocateForeignBatchCosts(
      items.map((item) =>
        activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN"
          ? {
              ...item,
              selectedSource: "FOREIGN" as const,
              costingStatus: "DRAFT" as const,
            }
          : item,
      ),
      activeCostingIds,
      foreignBatchCosts,
    );
    const targetItems = updatedItems.filter(
      (item) => activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN",
    );
    if (targetItems.some(isLcForeignCostingItem) && Number(lcContainerFee) <= 0) {
      setSaveError("Enter the LC Container Fee in the common costing row.");
      return;
    }
    const validationError = targetItems
      .map((item) => foreignCostingValidationError(item))
      .find((message): message is string => Boolean(message));
    if (targetItems.length === 0 || validationError) {
      setSaveError(validationError ?? "No Foreign item is open for costing.");
      return;
    }
    setSourceFilter("ALL");
    setItems(updatedItems);
    setActiveCostingIds((current) => {
      const next = new Set(current);
      targetItems.forEach((item) => next.delete(item.id));
      return next;
    });
    setSelectedItemIds((current) => {
      const next = new Set(current);
      targetItems.forEach((item) => next.delete(item.id));
      return next;
    });
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      targetItems.forEach((item) => next.delete(item.id));
      return next;
    });
    setErrors((current) => {
      if (!current.items) return current;
      const next = { ...current };
      delete next.items;
      return next;
    });
    setSaveError("");
    setForeignCostingNotice(
      "Foreign costing is ready in BDT. Review all items below, complete any Local field, then click Save All Costing.",
    );
    setIsDirty(true);
    window.setTimeout(
      () => intakeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  async function saveAllCosting() {
    const foreignItemsToSave = items.filter(
      (item) =>
        item.sourcingType === "FOREIGN" &&
        item.costingStatus === "DRAFT" &&
        !activeCostingIds.has(item.id),
    );
    const localItemsToSave = items.filter(
      (item) => item.sourcingType === "LOCAL" && item.costingStatus !== "COSTED",
    );
    const itemsToSave = [...localItemsToSave, ...foreignItemsToSave];
    if (itemsToSave.length === 0) return;

    const firstIncompleteLocalItem = localItemsToSave
      .map((item) => {
        const missingFields: Array<{
          column: LocalCostingInputColumn;
          label: string;
        }> = [];
        if (!item.costingDate) {
          missingFields.push({ column: "costing-date", label: "Costing Date" });
        }
        if (!preparedByForItem(item)) {
          missingFields.push({ column: "prepared-by", label: "Prepared By" });
        }
        if (!item.description.trim()) {
          missingFields.push({ column: "product", label: "Product Name" });
        }
        if (!item.unit.trim()) {
          missingFields.push({ column: "unit", label: "Unit" });
        }
        if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
          missingFields.push({ column: "quantity", label: "Quantity" });
        }
        if (!Number.isFinite(Number(item.localUnitPrice)) || Number(item.localUnitPrice) <= 0) {
          missingFields.push({ column: "unit-price", label: "Unit Price" });
        }
        return { item, missingFields };
      })
      .find(({ missingFields }) => missingFields.length > 0);
    if (firstIncompleteLocalItem) {
      const firstMissingField = firstIncompleteLocalItem.missingFields[0];
      setSourceFilter("ALL");
      setIntakeValidationAttemptedIds((current) =>
        new Set(current).add(firstIncompleteLocalItem.item.id),
      );
      setCommonIntakeValidationColumns(
        new Set(
          firstIncompleteLocalItem.missingFields
            .map(({ column }) => column)
            .filter((column) => column === "costing-date" || column === "prepared-by"),
        ),
      );
      setSaveError("");
      setErrors((current) => {
        if (!current.items) return current;
        const next = { ...current };
        delete next.items;
        return next;
      });
      window.setTimeout(() => {
        const intakeSection = intakeSectionRef.current;
        const row = Array.from(
          intakeSection?.querySelectorAll<HTMLElement>("[data-costing-row]") ?? [],
        ).find((candidate) => candidate.dataset.costingRowId === firstIncompleteLocalItem.item.id);
        const target = (
          firstMissingField?.column === "costing-date" ||
          firstMissingField?.column === "prepared-by"
            ? intakeSection
            : row
        )?.querySelector<HTMLElement>(`[data-costing-column="${firstMissingField?.column}"]`);
        (row ?? intakeSection)?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (target instanceof HTMLButtonElement) target.click();
        else target?.focus();
      }, 0);
      return;
    }

    const foreignValidationError = foreignItemsToSave
      .map((item) => foreignCostingValidationError(item))
      .find((message): message is string => Boolean(message));
    if (foreignValidationError) {
      setSaveError(foreignValidationError);
      return;
    }

    const localItemIds = new Set(localItemsToSave.map((item) => item.id));
    const foreignItemIds = new Set(foreignItemsToSave.map((item) => item.id));
    const updatedItems: CostingItemForm[] = items.map((item) =>
      localItemIds.has(item.id)
        ? {
            ...item,
            selectedSource: "LOCAL",
            costingStatus: "COSTED",
          }
        : foreignItemIds.has(item.id)
          ? { ...item, selectedSource: "FOREIGN", costingStatus: "COSTED" }
          : item,
    );
    const allItemsCosted = updatedItems.every((item) => item.costingStatus === "COSTED");
    const nextStatus = allItemsCosted ? "COMPLETED" : "IN_PROGRESS";
    const saved = await save(nextStatus, updatedItems, { showSuccess: false });
    if (!saved) return;

    setItems(updatedItems);
    setSelectedItemIds((current) => {
      const next = new Set(current);
      itemsToSave.forEach((item) => next.delete(item.id));
      return next;
    });
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      foreignItemsToSave.forEach((item) => next.delete(item.id));
      return next;
    });
    setSaveError("");
    setForeignCostingNotice("");
    setIsDirty(false);
    setSuccess({
      title: "Costing Saved",
      message: `${itemsToSave.length} item(s) saved successfully: ${localItemsToSave.length} local and ${foreignItemsToSave.length} foreign.`,
    });
    window.setTimeout(
      () => costedItemsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  async function markItemCosted(item: CostingItemForm) {
    const source =
      item.sourcingType === "LOCAL"
        ? "LOCAL"
        : item.sourcingType === "FOREIGN"
          ? "FOREIGN"
          : item.selectedSource;
    if (!source) {
      setSaveError(
        `Select the final Local or Foreign source for ${item.description || "this item"}.`,
      );
      return;
    }
    if (source === "LOCAL" && Number(item.localUnitPrice) <= 0) {
      setSaveError(`Enter a Local unit price for ${item.description || "this item"}.`);
      return;
    }
    if (source === "FOREIGN" && Number(item.foreignUnitPrice) <= 0) {
      setSaveError(`Enter a Foreign unit price for ${item.description || "this item"}.`);
      return;
    }
    const updatedItems: CostingItemForm[] = items.map((current) =>
      current.id === item.id
        ? { ...current, selectedSource: source, costingStatus: "COSTED" }
        : current,
    );
    const allItemsCosted = updatedItems.every((current) => current.costingStatus === "COSTED");
    const saved = await save(allItemsCosted ? "COMPLETED" : "IN_PROGRESS", updatedItems, {
      showSuccess: item.sourcingType !== "LOCAL",
    });
    if (!saved) return;

    setItems(updatedItems);
    setActiveCostingIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    setSelectedItemIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    setSaveError("");
    setIsDirty(false);
    if (item.sourcingType === "LOCAL") {
      setSuccess({
        title: "Local Costing Saved",
        message: `${item.description || "Local item"} saved successfully.`,
      });
      window.setTimeout(
        () => costedItemsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
        0,
      );
    }
  }

  async function saveCostedItemChanges() {
    const allItemsCosted = items.every((item) => item.costingStatus === "COSTED");
    await save(allItemsCosted ? "COMPLETED" : "IN_PROGRESS", items);
  }

  function moveCostedItemsToIntake(itemIds: string[]) {
    const targetIds = new Set(itemIds);
    const targetItems = items.filter((item) => targetIds.has(item.id));
    setItems((current) =>
      current.map((item) =>
        targetIds.has(item.id)
          ? {
              ...item,
              costingStatus: item.sourcingType === "FOREIGN" ? "DRAFT" : "NOT_COSTED",
            }
          : item,
      ),
    );
    setSelectedItemIds(new Set());
    setActiveCostingIds((current) => {
      const next = new Set(current);
      itemIds.forEach((itemId) => next.delete(itemId));
      return next;
    });
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      targetItems.forEach((item) => {
        if (item.sourcingType === "FOREIGN") next.add(item.id);
        else next.delete(item.id);
      });
      return next;
    });
    setSaveError("");
    setIsDirty(true);
    window.setTimeout(
      () => intakeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function finishCostingItemsRemoval(
    itemIds: Set<string>,
    remainingItems: CostingItemForm[],
    markSaved: boolean,
  ) {
    setItems(remainingItems);
    setSelectedItemIds((current) => {
      const next = new Set(current);
      itemIds.forEach((itemId) => next.delete(itemId));
      return next;
    });
    setActiveCostingIds((current) => {
      const next = new Set(current);
      itemIds.forEach((itemId) => next.delete(itemId));
      return next;
    });
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      itemIds.forEach((itemId) => next.delete(itemId));
      return next;
    });
    setIntakeValidationAttemptedIds((current) => {
      const next = new Set(current);
      itemIds.forEach((itemId) => next.delete(itemId));
      return next;
    });
    setErrors((current) => {
      if (!current.items) return current;
      const next = { ...current };
      delete next.items;
      return next;
    });
    setSaveError("");
    if (markSaved) setIsDirty(false);
  }

  async function removeCostingItem(itemId: string) {
    await removeCostingItems([itemId]);
  }

  async function removeCostingItems(itemIds: string[]) {
    const record = costing.data;
    if (!record || saveCosting.isPending || itemIds.length === 0) return;

    const itemIdSet = new Set(itemIds);
    const remainingItems = allocateLcContainerFee(
      items.filter((item) => !itemIdSet.has(item.id)),
      lcContainerFee,
      lcContainerAllocationMethod,
    );
    const hasPersistedItem = record.items.some((item) => itemIdSet.has(item.id));
    if (!hasPersistedItem) {
      finishCostingItemsRemoval(itemIdSet, remainingItems, false);
      return;
    }

    const allRemainingItemsCosted =
      remainingItems.length > 0 && remainingItems.every((item) => item.costingStatus === "COSTED");
    const nextStatus: TenderCostingStatus =
      remainingItems.length === 0
        ? "READY"
        : allRemainingItemsCosted
          ? "COMPLETED"
          : record.status === "READY"
            ? "READY"
            : "IN_PROGRESS";
    const saved = await save(nextStatus, remainingItems, { showSuccess: false });
    if (!saved) return;

    finishCostingItemsRemoval(itemIdSet, remainingItems, true);
  }

  function validate(status: TenderCostingStatus, candidateItems = items): boolean {
    const nextErrors: Record<string, string> = {};
    const validItems = candidateItems.filter(
      (item) =>
        item.costingDate &&
        item.description.trim() &&
        item.unit.trim() &&
        Number(item.quantity) > 0,
    );
    if (validItems.length === 0 && status !== "READY") {
      nextErrors.items = "Add at least one complete item";
    }
    if (validItems.length !== candidateItems.length)
      nextErrors.items = "Complete or remove every incomplete item";
    if (status === "COMPLETED" && candidateItems.some((item) => item.costingStatus !== "COSTED")) {
      nextErrors.items = "Complete costing and select the final source for every item";
    }
    if (status === "COMPLETED" && candidateItems.some((item) => !preparedByForItem(item))) {
      nextErrors.items = "Select Prepared By for every item";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function save(
    status: TenderCostingStatus,
    itemsOverride?: CostingItemForm[],
    saveOptions: { showSuccess?: boolean } = {},
  ): Promise<boolean> {
    const record = costing.data;
    const itemsToSave = itemsOverride ?? items;
    if (!record || !validate(status, itemsToSave)) return false;
    setSaveError("");
    const firstItem = itemsToSave[0];
    const firstPreparedByUserId = firstItem
      ? preparedByForItem(firstItem)
      : header.preparedByUserId || record.preparedByUserId || "";
    const selectedUser = options.data?.users.find((user) => user.id === firstPreparedByUserId);
    const payload: SaveTenderCostingInput = {
      version: record.version,
      status,
      costingDate: firstItem?.costingDate || header.costingDate || record.costingDate.slice(0, 10),
      preparedByUserId: firstPreparedByUserId,
      preparedByName: selectedUser?.name,
      source: header.source || undefined,
      currency: header.currency,
      exchangeRate: Number(header.exchangeRate) || 1,
      costingVersion: Number(header.costingVersion) || 1,
      remarks: header.remarks || undefined,
      freightCost: Number(additional.freightCost) || 0,
      installationCost: Number(additional.installationCost) || 0,
      otherCost: Number(additional.otherCost) || 0,
      contingencyPercent: Number(additional.contingencyPercent) || 0,
      validityDays: additional.validityDays ? Number(additional.validityDays) : undefined,
      paymentTermId: additional.paymentTermId || undefined,
      deliveryTime: additional.deliveryTime || undefined,
      warranty: additional.warranty || undefined,
      lcContainerFee: Number(lcContainerFee) || 0,
      lcContainerAllocationMethod,
      items: itemsToSave.map((item, index) => ({
        costingDate: item.costingDate,
        preparedByUserId: preparedByForItem(item),
        description: item.description.trim(),
        secondaryDescription: item.secondaryDescription.trim() || undefined,
        unit: item.unit.trim(),
        quantity: Number(item.quantity),
        unitCost: calculateItemPreview(item).selectedUnitCost,
        marginPercent: Number(item.marginPercent) || 0,
        sourcingType: item.sourcingType,
        costingStatus: item.costingStatus,
        selectedSource: item.selectedSource || undefined,
        localSupplierName: item.localSupplierName.trim() || undefined,
        localUnitPrice: Number(item.localUnitPrice) || 0,
        localDiscountPercent: Number(item.localDiscountPercent) || 0,
        localVatPercent: Number(item.localVatPercent) || 0,
        localTaxPercent: Number(item.localTaxPercent) || 0,
        localTransportCost: Number(item.localTransportCost) || 0,
        localOtherCost: Number(item.localOtherCost) || 0,
        foreignSupplierName: item.foreignSupplierName.trim() || undefined,
        foreignCountry: item.foreignCountry.trim() || undefined,
        foreignCurrency: item.foreignCurrency,
        foreignUnitPrice: Number(item.foreignUnitPrice) || 0,
        foreignExchangeRate: Number(item.foreignExchangeRate) || 1,
        exchangeRateDate: item.exchangeRateDate || undefined,
        foreignShippingMethod: item.foreignShippingMethod,
        foreignShippingProvider: item.foreignShippingProvider.trim() || undefined,
        foreignDoorToDoorCharge: Number(item.foreignDoorToDoorCharge) || 0,
        foreignTransportCharge: Number(item.foreignTransportCharge) || 0,
        customsDeclarationCharge: Number(item.customsDeclarationCharge) || 0,
        shippingWeightKg: Number(item.shippingWeightKg) || 0,
        shippingVolumeCbm: Number(item.shippingVolumeCbm) || 0,
        shippingRateBasis: item.shippingRateBasis,
        shippingRate: Number(item.shippingRate) || 0,
        domesticTransportCost: Number(item.domesticTransportCost) || 0,
        foreignImportDutyIncluded: item.foreignImportDutyIncluded,
        foreignTransitDays: item.foreignTransitDays ? Number(item.foreignTransitDays) : undefined,
        foreignShippingReference: item.foreignShippingReference.trim() || undefined,
        foreignFreightCost: Number(item.foreignFreightCost) || 0,
        foreignInsuranceCost: Number(item.foreignInsuranceCost) || 0,
        customsDutyPercent: Number(item.customsDutyPercent) || 0,
        regulatoryDutyPercent: Number(item.regulatoryDutyPercent) || 0,
        supplementaryDutyPercent: Number(item.supplementaryDutyPercent) || 0,
        foreignVatPercent: Number(item.foreignVatPercent) || 0,
        foreignTaxPercent: Number(item.foreignTaxPercent) || 0,
        cnfCharge: Number(item.cnfCharge) || 0,
        portHandlingCharge: Number(item.portHandlingCharge) || 0,
        bankLcCharge: Number(item.bankLcCharge) || 0,
        foreignLocalTransportCost: Number(item.foreignLocalTransportCost) || 0,
        foreignOtherCost: Number(item.foreignOtherCost) || 0,
        remarks: item.remarks.trim() || undefined,
        sortOrder: index,
      })),
    };

    try {
      const saved = await saveCosting.mutateAsync({ id: record.id, payload });
      hydratedId.current = undefined;
      setIsDirty(false);
      const isCompletedUpdate = record.status === "COMPLETED" && status === "COMPLETED";
      if (saveOptions.showSuccess !== false) {
        setSuccess({
          title: isCompletedUpdate
            ? "Costing Updated"
            : status === "COMPLETED"
              ? "Costing Completed"
              : "Costing Saved",
          message: isCompletedUpdate
            ? `${saved.tender.egpTenderId ?? saved.tender.workName} costing updated successfully.`
            : status === "COMPLETED"
              ? `${saved.tender.egpTenderId ?? saved.tender.workName} costing completed successfully.`
              : "Tender costing progress saved successfully.",
        });
      }
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        const validationDetails = Object.entries(error.errors ?? {})
          .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
          .join(" ");
        setSaveError(validationDetails || error.message);
      } else {
        setSaveError("Could not save tender costing.");
      }
      return false;
    }
  }

  async function saveBudget() {
    const record = costing.data;
    if (!record) return;
    const amount = Number(budgetInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      setBudgetError("Tender Costing Budget must be greater than zero");
      setBudgetNotice("");
      return;
    }
    setBudgetError("");
    setBudgetNotice("");
    try {
      await setCostingBudget.mutateAsync({
        id: record.id,
        payload: { version: record.version, costingBudget: amount },
      });
      setBudgetEditorOpen(false);
      setBudgetNotice("Total Costing Budget updated successfully.");
    } catch (error) {
      setBudgetError(error instanceof ApiError ? error.message : "Could not save costing budget.");
    }
  }

  function openBudgetEditor() {
    setBudgetError("");
    setBudgetNotice("");
    setBudgetInput(compactInputNumber(costing.data?.costingBudget, true));
    setBudgetEditorOpen(true);
  }

  function leaveBudgetEditor() {
    if (setCostingBudget.isPending) return;
    router.push("/tender-management/tender-costing");
  }

  const computed = items.map(calculateItemPreview);
  const costedItems = items.filter((item) => item.costingStatus === "COSTED");
  const filteredItems = items.filter((item) => {
    if (item.costingStatus === "COSTED") return false;
    if (sourceFilter === "ALL") return true;
    return item.sourcingType === sourceFilter;
  });
  const costedItemCount = costedItems.length;
  const activeForeignItems = items.filter(
    (item) => activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN",
  );
  const lcProducts = items.filter(isLcForeignCostingItem);
  const lcEditorItems = itemsForLcAction(pendingLcAction).filter(isLcForeignCostingItem);
  const pricingReadyItems = items.filter(
    (item) =>
      item.sourcingType === "FOREIGN" &&
      item.costingStatus === "DRAFT" &&
      !activeCostingIds.has(item.id),
  );
  const pendingForeignItems = items.filter(
    (item) => item.sourcingType === "FOREIGN" && item.costingStatus !== "COSTED",
  );
  const pendingLocalItems = items.filter(
    (item) => item.sourcingType === "LOCAL" && item.costingStatus !== "COSTED",
  );
  const readyToSaveCount = pendingLocalItems.length + pricingReadyItems.length;
  const reviewItems = items.filter(
    (item) => item.costingStatus !== "COSTED" && !activeCostingIds.has(item.id),
  );
  const isReviewMode =
    activeCostingIds.size === 0 &&
    pendingForeignItems.length > 0 &&
    pendingForeignItems.every((item) => item.costingStatus === "DRAFT");
  const hasCalculatedCost = costedItemCount > 0;
  const isPartialCosting = hasCalculatedCost && costedItemCount < items.length;
  const foreignEditCandidates = filteredItems.filter(
    (item) => item.sourcingType === "FOREIGN" && foreignEditReturnIds.has(item.id),
  );
  const costingCandidateItems =
    selectedItemIds.size > 0
      ? items.filter((item) => selectedItemIds.has(item.id))
      : foreignEditCandidates.length > 0
        ? foreignEditCandidates
        : filteredItems.filter(
            (item) => item.sourcingType === "FOREIGN" && item.costingStatus !== "DRAFT",
          );
  const shouldShowStartCosting = costingCandidateItems.length > 0;
  const canStartCosting =
    costingCandidateItems.length > 0 &&
    costingCandidateItems.every(
      (item) =>
        item.costingDate &&
        preparedByForItem(item) &&
        item.description.trim() &&
        item.unit.trim() &&
        Number(item.quantity) > 0,
    );
  const itemTotal = computed.reduce((sum, item) => sum + item.selectedTotal, 0);
  const directAdditional =
    Number(additional.freightCost) +
    Number(additional.installationCost) +
    Number(additional.otherCost);
  const contingencyAmount =
    (itemTotal + directAdditional) * ((Number(additional.contingencyPercent) || 0) / 100);
  const estimatedTotal = itemTotal + directAdditional + contingencyAmount;
  const localProfit = computed.reduce(
    (sum, preview, index) =>
      items[index]?.costingStatus === "COSTED" &&
      (items[index]?.selectedSource === "LOCAL" || items[index]?.sourcingType === "LOCAL")
        ? sum + preview.totalProfit
        : sum,
    0,
  );
  const foreignProfit = computed.reduce(
    (sum, preview, index) =>
      items[index]?.costingStatus === "COSTED" &&
      (items[index]?.selectedSource === "FOREIGN" || items[index]?.sourcingType === "FOREIGN")
        ? sum + preview.totalProfit
        : sum,
    0,
  );
  const totalBaseCost = computed.reduce(
    (sum, preview, index) =>
      items[index]?.costingStatus === "COSTED" ? sum + preview.selectedCostBeforeProfit : sum,
    0,
  );
  const totalProfit = localProfit + foreignProfit;
  const overallProfitMargin = totalBaseCost > 0 ? (totalProfit / totalBaseCost) * 100 : 0;

  if (!costingId) {
    return (
      <div className="rounded-xl border border-biz-border bg-biz-surface p-8 text-center shadow-card">
        <h1 className="text-[20px] font-bold text-biz-text">Select an approved tender costing</h1>
        <p className="mx-auto mt-2 max-w-lg text-[13px] text-biz-muted">
          Costing records are created when an authorized user approves a tender from the Tender
          List.
        </p>
        <Link href="/tender-management/tender-costing" className="mt-5 inline-flex">
          <PrimaryButton>
            <ArrowLeft className="h-4 w-4" />
            Back to Costing List
          </PrimaryButton>
        </Link>
      </div>
    );
  }

  if (costing.isLoading) {
    return (
      <div className="rounded-lg border border-biz-border bg-biz-surface p-10 text-center text-biz-muted">
        Loading costing...
      </div>
    );
  }

  if (costing.isError || !costing.data) {
    return (
      <div className="rounded-lg border border-biz-danger/30 bg-biz-danger/5 p-6 text-center text-biz-danger">
        Could not load this costing record.
      </div>
    );
  }

  const record = costing.data;
  const isReadOnly = record.status === "CANCELLED";
  const costingBudget = Number(record.costingBudget) || 0;
  const hasCostingBudget = costingBudget > 0;
  const enteredBudget = Number(budgetInput);
  const isBudgetValid = Number.isFinite(enteredBudget) && enteredBudget > 0;

  return (
    <div className="scrollbar-hidden flex min-h-full flex-col gap-2 overflow-y-auto subpixel-antialiased lg:h-full lg:min-h-0 lg:overflow-hidden 2xl:gap-3">
      <header className="shrink-0 rounded-lg border border-biz-border bg-white px-3 py-2.5 shadow-card xl:px-4 2xl:px-5 2xl:py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-biz-blue-soft text-biz-blue 2xl:h-10 2xl:w-10">
              <FileCheck2 className="h-[18px] w-[18px] 2xl:h-5 2xl:w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[20px] font-bold leading-tight text-biz-text xl:text-[22px] 2xl:text-[26px]">
                Prepare Tender Costing
              </h1>
              <p className="mt-0.5 truncate text-[11px] font-medium text-slate-500 xl:text-[12px] 2xl:text-[14px]">
                Live tender data with server-calculated costing values
              </p>
            </div>
          </div>
          <Link href="/tender-management/tender-costing" className="shrink-0">
            <SecondaryButton className="h-9 w-full px-3 text-[11px] sm:w-auto 2xl:h-10 2xl:text-[13px]">
              <ArrowLeft className="h-4 w-4" />
              Back to Costing List
            </SecondaryButton>
          </Link>
        </div>
      </header>

      <div className="grid shrink-0 min-w-0 grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7 2xl:gap-3">
        <CostingKpi
          className=""
          label="Tender ID"
          value={record.tender.egpTenderId ?? record.tender.id}
        />
        <CostingKpi
          className=""
          label="Work Name"
          value={record.tender.workName}
          tooltip={record.tender.workName}
        />
        <CostingKpi
          className=""
          label="Organization"
          value={record.tender.organizationMaster?.shortName ?? "Not set"}
          tooltip={
            record.tender.organizationMaster?.fullName ??
            record.tender.organizationMaster?.shortName ??
            "Not set"
          }
          tone={record.tender.organizationMaster ? "default" : "warning"}
        />
        <CostingKpi
          className=""
          label="Budget (BDT)"
          value={hasCostingBudget ? formatMoney(costingBudget) : "Not set"}
          tone="blue"
          action={
            !isReadOnly ? (
              <button
                type="button"
                aria-label={hasCostingBudget ? "Update costing budget" : "Set costing budget"}
                className="rounded bg-biz-blue-soft px-1.5 py-0.5 text-[8px] font-semibold text-biz-blue hover:bg-biz-blue/15 sm:text-[9px]"
                onClick={openBudgetEditor}
              >
                {hasCostingBudget ? "Edit" : "Set"}
              </button>
            ) : undefined
          }
        />
        <CostingKpi
          className=""
          label={isPartialCosting ? "Current Cost (BDT)" : "Estimated Cost (BDT)"}
          value={hasCalculatedCost ? formatMoney(estimatedTotal) : "Not calculated"}
        />
        <CostingKpi
          className=""
          label="Profit (BDT)"
          value={formatMoney(totalProfit)}
          tone="success"
          action={
            !isReadOnly ? <ProfitAction onClick={() => setProfitSettingsOpen(true)} /> : undefined
          }
        />
        <CostingKpi
          className="col-span-2 sm:col-span-1"
          label="Profit Margin"
          value={`${overallProfitMargin.toFixed(2)}%`}
          tone="blue"
          action={
            !isReadOnly ? <ProfitAction onClick={() => setProfitSettingsOpen(true)} /> : undefined
          }
        />
      </div>

      {budgetNotice && (
        <p className="shrink-0 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700 xl:text-[12px]">
          {budgetNotice}
        </p>
      )}

      <main className="scrollbar-hidden min-h-0 flex-1 overflow-y-auto rounded-xl border border-biz-border bg-slate-50/70 shadow-card">
        <div className="relative p-2.5 xl:p-3 2xl:p-4">
          <fieldset
            disabled={isReadOnly || !hasCostingBudget}
            className={`m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0 2xl:gap-3 ${!hasCostingBudget && !isReadOnly ? "opacity-55" : ""}`}
          >
            <div
              ref={intakeSectionRef}
              className="scroll-mt-20 overflow-hidden rounded-lg border border-biz-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)]"
            >
              <div className="flex flex-col gap-2.5 border-b border-biz-border bg-slate-50/60 px-3 py-2.5 xl:flex-row xl:items-center 2xl:px-4 2xl:py-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between xl:contents">
                  <div className="min-w-0 xl:order-1 xl:w-[190px] xl:shrink-0">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue 2xl:h-9 2xl:w-9">
                        <FileCheck2 className="h-4 w-4 2xl:h-[18px] 2xl:w-[18px]" />
                      </span>
                      <h2 className="text-[13px] font-bold leading-4 text-biz-text 2xl:text-[15px]">
                        Costing Items Intake
                      </h2>
                    </div>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto xl:order-3 xl:shrink-0">
                    <input
                      ref={costingPdfInputRef}
                      type="file"
                      accept=".pdf,application/pdf"
                      multiple
                      className="hidden"
                      onChange={(event) =>
                        void importCostingPdfFiles(Array.from(event.target.files ?? []))
                      }
                    />
                    <SecondaryButton
                      className="h-9 flex-1 border-biz-blue bg-biz-blue px-3 text-[11px] font-semibold text-white shadow-sm hover:bg-blue-700 hover:text-white sm:flex-none 2xl:h-10 2xl:text-[13px]"
                      disabled={isReadingCostingPdfs}
                      onClick={() => costingPdfInputRef.current?.click()}
                      title="Import product rows from one or more BOQ PDFs"
                    >
                      {isReadingCostingPdfs ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <UploadCloud className="h-4 w-4" />
                      )}
                      {isReadingCostingPdfs ? "Reading PDF..." : "Upload BOQ PDF"}
                    </SecondaryButton>
                    <PrimaryButton
                      className="h-9 flex-1 border border-blue-200 bg-white px-3 text-[11px] font-semibold text-biz-blue shadow-none hover:bg-blue-50 sm:flex-none 2xl:h-10 2xl:text-[13px]"
                      onClick={addAnotherItem}
                    >
                      <Plus className="h-4 w-4" />
                      Add Another Item
                    </PrimaryButton>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:order-2 xl:min-w-0 xl:flex-1 2xl:gap-3">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[10px] font-medium text-biz-muted">
                      Costing Date <RequiredMark />
                    </span>
                    <TextInput
                      data-costing-field
                      data-costing-column="costing-date"
                      aria-invalid={
                        commonIntakeValidationColumns.has("costing-date") && !header.costingDate
                      }
                      className={`h-9 w-full border-slate-200 bg-white px-2 text-[11px] focus:bg-white 2xl:h-10 2xl:text-[13px] ${
                        commonIntakeValidationColumns.has("costing-date") && !header.costingDate
                          ? "border-biz-danger bg-biz-danger/[0.03] ring-1 ring-biz-danger/20 focus:ring-biz-danger/30"
                          : ""
                      }`}
                      type="date"
                      value={header.costingDate}
                      onChange={(event) => updateCommonCostingDate(event.target.value)}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[10px] font-medium text-biz-muted">
                      Prepared By <RequiredMark />
                    </span>
                    <SelectInput
                      data-costing-field
                      data-costing-column="prepared-by"
                      aria-invalid={
                        commonIntakeValidationColumns.has("prepared-by") &&
                        !effectivePreparedByUserId
                      }
                      className={`h-9 w-full border-slate-200 bg-white text-[11px] focus:bg-white 2xl:h-10 2xl:text-[13px] ${
                        commonIntakeValidationColumns.has("prepared-by") &&
                        !effectivePreparedByUserId
                          ? "border-biz-danger bg-biz-danger/[0.03] ring-1 ring-biz-danger/20 focus:ring-biz-danger/30"
                          : ""
                      }`}
                      placeholder="Select user"
                      value={effectivePreparedByUserId}
                      options={(options.data?.users ?? []).map((user) => ({
                        value: user.id,
                        label: user.name,
                      }))}
                      onChange={(event) => updateCommonPreparedBy(event.target.value)}
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-[10px] font-medium text-biz-muted">Item View</span>
                    <SelectInput
                      className="h-9 w-full border-slate-200 bg-white text-[11px] focus:bg-white 2xl:h-10 2xl:text-[13px]"
                      value={sourceFilter}
                      options={SOURCE_FILTER_OPTIONS}
                      onChange={(event) => setSourceFilter(event.target.value)}
                    />
                  </label>
                </div>
              </div>
              {costingPdfNotice && (
                <p
                  aria-live="polite"
                  className="flex items-center gap-2 border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[11px] font-semibold text-emerald-700"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <FileCheck2 className="h-4 w-4" />
                  </span>
                  <span>{costingPdfNotice}</span>
                </p>
              )}
              {costingPdfError && (
                <p
                  role="alert"
                  className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-[11px] font-semibold text-biz-danger"
                >
                  {costingPdfError}
                </p>
              )}
              {foreignCostingNotice && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 border-b border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-semibold text-blue-700 xl:text-[11px]"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-biz-success" />
                  <span>{foreignCostingNotice}</span>
                </div>
              )}
              {isReviewMode ? (
                <CostedItemsList
                  mode="review"
                  items={reviewItems}
                  saving={saveCosting.isPending}
                  validationAttemptedIds={intakeValidationAttemptedIds}
                  onChange={(itemId, patch) => {
                    const item = items.find((candidate) => candidate.id === itemId);
                    updateItem(itemId, {
                      ...patch,
                      costingStatus: item?.sourcingType === "FOREIGN" ? "DRAFT" : "NOT_COSTED",
                    });
                  }}
                  onSave={() => undefined}
                  onDelete={() => undefined}
                  onMoveToIntake={() => undefined}
                  onEditForeign={openItemCosting}
                />
              ) : (
                <div className="overflow-x-hidden">
                  <table className="costing-responsive-table costing-intake-table text-left text-[10px] xl:text-[11px] 2xl:text-[11px]">
                    <thead className="border-b border-blue-100 bg-gradient-to-r from-blue-50/80 to-slate-50 text-biz-muted">
                      <tr>
                        <th className="w-[2%] px-0.5 py-2 text-center">
                          <input
                            type="checkbox"
                            aria-label="Select all visible items"
                            checked={
                              filteredItems.some((item) => item.sourcingType === "FOREIGN") &&
                              filteredItems
                                .filter((item) => item.sourcingType === "FOREIGN")
                                .every((item) => selectedItemIds.has(item.id))
                            }
                            onChange={(event) =>
                              setSelectedItemIds((current) => {
                                const next = new Set(current);
                                filteredItems
                                  .filter((item) => item.sourcingType === "FOREIGN")
                                  .forEach((item) =>
                                    event.target.checked ? next.add(item.id) : next.delete(item.id),
                                  );
                                return next;
                              })
                            }
                          />
                        </th>
                        <th className="w-[2%] px-0.5 py-2">SL</th>
                        <th className="w-[18%] px-2 py-2">
                          Product Name <RequiredMark />
                        </th>
                        <th className="w-[7%] px-0.5 py-2">Source of Product</th>
                        <th className="w-[6%] px-0.5 py-2">
                          Unit <RequiredMark />
                        </th>
                        <th className="w-[5%] px-0.5 py-2">
                          Qty <RequiredMark />
                        </th>
                        <th className="w-[7%] px-0.5 py-2 text-right">
                          Unit Price <RequiredMark />
                        </th>
                        <th className="w-[8%] px-0.5 py-2 text-right">Total Price</th>
                        <th className="w-[6%] px-0.5 py-2 text-right">Profit</th>
                        <th className="w-[8%] px-0.5 py-2 text-right">Sub Total</th>
                        <th className="w-[4%] px-0.5 py-2 text-right">VAT</th>
                        <th className="w-[4%] px-0.5 py-2 text-right">Tax</th>
                        <th className="w-[8%] px-0.5 py-2 text-right">Grand Total</th>
                        <th className="w-[8%] px-0.5 py-2 text-right">Unit Sales</th>
                        <th className="w-[7%] px-0.5 py-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredItems.map((item, visibleIndex) => {
                        const originalIndex = items.findIndex((row) => row.id === item.id);
                        const preview = calculateItemPreview(item);
                        const showRequiredErrors = intakeValidationAttemptedIds.has(item.id);
                        const productRequiredError = showRequiredErrors && !item.description.trim();
                        const unitRequiredError = showRequiredErrors && !item.unit.trim();
                        const quantityRequiredError =
                          showRequiredErrors && Number(item.quantity) <= 0;
                        const localUnitPriceRequiredError =
                          showRequiredErrors &&
                          item.sourcingType === "LOCAL" &&
                          Number(item.localUnitPrice) <= 0;
                        const hasProductName = Boolean(item.description.trim());
                        const isInlineProductEntry =
                          !hasProductName || inlineProductEditIds.has(item.id);
                        return (
                          <tr
                            key={`${item.id}-${visibleIndex}`}
                            data-costing-row
                            data-costing-row-id={item.id}
                            className="costing-record-row border-t border-biz-border"
                          >
                            <td data-label="Select" className="px-1 py-2 text-center">
                              {item.sourcingType !== "FOREIGN" ? (
                                <span className="text-biz-muted">-</span>
                              ) : (
                                <input
                                  type="checkbox"
                                  aria-label={`Select ${item.description || `item ${originalIndex + 1}`}`}
                                  checked={selectedItemIds.has(item.id)}
                                  onChange={() => toggleItemSelection(item.id)}
                                />
                              )}
                            </td>
                            <td data-label="SL" className="px-1 py-2">
                              {item.sourceItemNo || visibleIndex + 1}
                            </td>
                            <td
                              data-label="Product Name"
                              className="costing-wide-cell px-1 py-1 transition-colors focus-within:bg-blue-50/40"
                            >
                              <RequiredRowField>
                                <input
                                  type="text"
                                  data-costing-field
                                  data-costing-column="product"
                                  aria-invalid={productRequiredError}
                                  aria-label={
                                    isInlineProductEntry
                                      ? "Enter product name"
                                      : `View and edit full product name: ${item.description}`
                                  }
                                  aria-haspopup={isInlineProductEntry ? undefined : "dialog"}
                                  title={
                                    isInlineProductEntry
                                      ? "Type the product name"
                                      : `${item.description} — click to edit the full name`
                                  }
                                  readOnly={!isInlineProductEntry}
                                  className={`h-9 w-full truncate border-0 bg-transparent px-1 text-[10px] font-medium text-biz-text outline-none ${
                                    isInlineProductEntry
                                      ? "cursor-text"
                                      : "cursor-pointer hover:text-biz-blue"
                                  } ${
                                    productRequiredError
                                      ? "bg-biz-danger/[0.03] text-biz-danger placeholder:text-biz-danger/60"
                                      : ""
                                  }`}
                                  value={item.description}
                                  placeholder="Enter product"
                                  onFocus={() => {
                                    if (hasProductName) return;
                                    setInlineProductEditIds((current) =>
                                      new Set(current).add(item.id),
                                    );
                                  }}
                                  onClick={() => {
                                    if (isInlineProductEntry) return;
                                    setProductEditor({ itemId: item.id, value: item.description });
                                  }}
                                  onChange={(event) => {
                                    setInlineProductEditIds((current) =>
                                      new Set(current).add(item.id),
                                    );
                                    updateItem(item.id, {
                                      description: event.target.value,
                                      costingStatus: "NOT_COSTED",
                                    });
                                  }}
                                  onBlur={() =>
                                    setInlineProductEditIds((current) => {
                                      const next = new Set(current);
                                      next.delete(item.id);
                                      return next;
                                    })
                                  }
                                  onKeyDown={(event) => {
                                    if (isInlineProductEntry) {
                                      if (event.key === "Enter" || event.key === "Escape") {
                                        event.preventDefault();
                                        event.currentTarget.blur();
                                        return;
                                      }
                                      moveAcrossCostingRow(event);
                                      return;
                                    }
                                    if (event.key === "Enter" || event.key === " ") {
                                      event.preventDefault();
                                      setProductEditor({
                                        itemId: item.id,
                                        value: item.description,
                                      });
                                      return;
                                    }
                                    moveAcrossCostingRow(event);
                                  }}
                                />
                              </RequiredRowField>
                            </td>
                            <td data-label="Source" className="px-0.5 py-2">
                              <SelectInput
                                data-costing-field
                                data-costing-column="source"
                                className="h-9 min-w-0 px-1 pr-4 text-[9px]"
                                value={item.sourcingType}
                                options={SOURCING_OPTIONS}
                                onChange={(event) => {
                                  const sourcingType = event.target
                                    .value as TenderCostingSourcingType;
                                  if (sourcingType !== "FOREIGN") {
                                    setSelectedItemIds((current) => {
                                      const next = new Set(current);
                                      next.delete(item.id);
                                      return next;
                                    });
                                    setActiveCostingIds((current) => {
                                      const next = new Set(current);
                                      next.delete(item.id);
                                      return next;
                                    });
                                    setForeignEditReturnIds((current) => {
                                      const next = new Set(current);
                                      next.delete(item.id);
                                      return next;
                                    });
                                  }
                                  updateItem(item.id, {
                                    sourcingType,
                                    selectedSource:
                                      sourcingType === "LOCAL"
                                        ? "LOCAL"
                                        : sourcingType === "FOREIGN"
                                          ? "FOREIGN"
                                          : "",
                                    costingStatus: "NOT_COSTED",
                                    marginPercent:
                                      sourcingType === "FOREIGN"
                                        ? foreignTargetMargin
                                        : localTargetMargin,
                                    ...(sourcingType === "FOREIGN" ? currentForeignDefaults() : {}),
                                  });
                                }}
                                onKeyDown={moveAcrossCostingRow}
                              />
                            </td>
                            <td data-label="Unit" className="min-w-0 px-0.5 py-2">
                              <RequiredRowField>
                                <SelectInput
                                  data-costing-field
                                  data-costing-column="unit"
                                  aria-invalid={unitRequiredError}
                                  title={item.unit}
                                  className={`h-9 w-full min-w-0 px-1 pr-4 text-[8.5px] xl:text-[9px] ${
                                    unitRequiredError
                                      ? "border-biz-danger bg-biz-danger/[0.03] ring-1 ring-biz-danger/20 focus:ring-biz-danger/30"
                                      : ""
                                  }`}
                                  value={item.unit}
                                  options={
                                    UNIT_OPTIONS.some((option) => option.value === item.unit)
                                      ? UNIT_OPTIONS
                                      : [{ value: item.unit, label: item.unit }, ...UNIT_OPTIONS]
                                  }
                                  onChange={(event) =>
                                    updateItem(item.id, { unit: event.target.value })
                                  }
                                  onKeyDown={moveAcrossCostingRow}
                                />
                              </RequiredRowField>
                            </td>
                            <td data-label="Quantity" className="px-1 py-2">
                              <RequiredRowField>
                                <TextInput
                                  data-costing-field
                                  data-costing-column="quantity"
                                  aria-invalid={quantityRequiredError}
                                  hasError={quantityRequiredError}
                                  className={`h-9 min-w-0 px-1 text-[10px] ${NUMBER_INPUT_CLASS} ${
                                    quantityRequiredError
                                      ? "bg-biz-danger/[0.03] ring-1 ring-biz-danger/20 focus:ring-biz-danger/30"
                                      : ""
                                  }`}
                                  type="number"
                                  min="0.001"
                                  step="any"
                                  value={item.quantity}
                                  onChange={(event) =>
                                    updateItem(item.id, {
                                      quantity: event.target.value,
                                      costingStatus: "NOT_COSTED",
                                    })
                                  }
                                  onKeyDown={moveAcrossCostingRow}
                                />
                              </RequiredRowField>
                            </td>
                            <td data-label="Unit Price" className="px-0.5 py-2">
                              {item.sourcingType === "LOCAL" ? (
                                <RequiredRowField>
                                  <TextInput
                                    data-costing-field
                                    data-costing-column="unit-price"
                                    aria-invalid={localUnitPriceRequiredError}
                                    className={`h-8 min-w-0 px-1 text-right text-[9px] ${NUMBER_INPUT_CLASS} ${
                                      localUnitPriceRequiredError
                                        ? "border-biz-danger focus:border-biz-danger focus:ring-biz-danger/20"
                                        : ""
                                    }`}
                                    type="number"
                                    min="0.000001"
                                    step="any"
                                    required
                                    value={item.localUnitPrice}
                                    onFocus={(event) => {
                                      if (Number(item.localUnitPrice) === 0) {
                                        updateItem(item.id, {
                                          localUnitPrice: "",
                                          costingStatus: "NOT_COSTED",
                                        });
                                        return;
                                      }
                                      event.currentTarget.select();
                                    }}
                                    onChange={(event) =>
                                      updateItem(item.id, {
                                        localUnitPrice: event.target.value,
                                        costingStatus: "NOT_COSTED",
                                      })
                                    }
                                    onKeyDown={moveAcrossCostingRow}
                                  />
                                </RequiredRowField>
                              ) : (
                                <span className="block text-right font-medium text-biz-text">
                                  {preview.selectedUnitCost > 0
                                    ? formatCompactMoney(preview.selectedUnitCost)
                                    : "—"}
                                </span>
                              )}
                            </td>
                            <td
                              data-label="Total Price"
                              className="px-0.5 py-2 text-right font-medium text-biz-text"
                            >
                              {preview.selectedCostBeforeProfit > 0
                                ? formatCompactMoney(preview.selectedCostBeforeProfit)
                                : "—"}
                            </td>
                            <td data-label="Profit %" className="relative px-0.5 py-2">
                              <TextInput
                                data-costing-field
                                data-costing-column="profit"
                                aria-label={`Profit percentage for ${item.description || `item ${originalIndex + 1}`}`}
                                title={`Calculated profit: ${formatCompactMoney(preview.totalProfit)}`}
                                className={`h-8 min-w-0 pl-1 pr-3 text-right text-[9px] ${NUMBER_INPUT_CLASS}`}
                                type="number"
                                min="0"
                                max="99.99"
                                step="any"
                                value={item.marginPercent}
                                onFocus={(event) => event.currentTarget.select()}
                                onChange={(event) =>
                                  updateItem(item.id, {
                                    marginPercent: event.target.value,
                                  })
                                }
                                onKeyDown={moveAcrossCostingRow}
                              />
                              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-biz-muted">
                                %
                              </span>
                            </td>
                            <td
                              data-label="Sub Total"
                              className="px-0.5 py-2 text-right font-semibold text-biz-text"
                            >
                              {formatCompactMoney(preview.subtotalBeforeTax)}
                            </td>
                            <td data-label="VAT %" className="relative px-0.5 py-2">
                              <TextInput
                                data-costing-field
                                data-costing-column="vat"
                                aria-label={`VAT percentage for ${item.description || `item ${originalIndex + 1}`}`}
                                title={`VAT amount: ${formatCompactMoney(preview.vatAmount)}`}
                                className={`h-8 min-w-0 pl-1 pr-3 text-right text-[9px] ${NUMBER_INPUT_CLASS}`}
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={
                                  item.sourcingType === "FOREIGN" ||
                                  item.selectedSource === "FOREIGN"
                                    ? item.foreignVatPercent
                                    : item.localVatPercent
                                }
                                onFocus={(event) => event.currentTarget.select()}
                                onChange={(event) =>
                                  updateItemRate(item, "VAT", event.target.value)
                                }
                                onKeyDown={moveAcrossCostingRow}
                              />
                              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-biz-muted">
                                %
                              </span>
                            </td>
                            <td data-label="Tax %" className="relative px-0.5 py-2">
                              <TextInput
                                data-costing-field
                                data-costing-column="tax"
                                aria-label={`Tax percentage for ${item.description || `item ${originalIndex + 1}`}`}
                                title={`Tax amount: ${formatCompactMoney(preview.taxAmount)}`}
                                className={`h-8 min-w-0 pl-1 pr-3 text-right text-[9px] ${NUMBER_INPUT_CLASS}`}
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={
                                  item.sourcingType === "FOREIGN" ||
                                  item.selectedSource === "FOREIGN"
                                    ? item.foreignTaxPercent
                                    : item.localTaxPercent
                                }
                                onFocus={(event) => event.currentTarget.select()}
                                onChange={(event) =>
                                  updateItemRate(item, "TAX", event.target.value)
                                }
                                onKeyDown={moveAcrossCostingRow}
                              />
                              <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-biz-muted">
                                %
                              </span>
                            </td>
                            <td
                              data-label="Grand Total"
                              className="px-0.5 py-2 text-right font-semibold"
                            >
                              {formatCompactMoney(preview.selectedGrandTotal)}
                            </td>
                            <td data-label="Unit Sales" className="px-0.5 py-2">
                              <span className="block text-right font-medium text-biz-blue">
                                {preview.unitSalesPrice > 0
                                  ? formatCompactMoney(preview.unitSalesPrice)
                                  : "—"}
                              </span>
                            </td>
                            <td data-label="Action" className="px-0.5 py-2 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  className="h-8 rounded border border-biz-blue px-2 text-[9px] font-semibold text-biz-blue hover:bg-biz-blue hover:text-white"
                                  disabled={saveCosting.isPending}
                                  onClick={() => openItemCosting(item)}
                                >
                                  {item.sourcingType === "LOCAL"
                                    ? item.costingStatus === "COSTED"
                                      ? "Update"
                                      : "Add"
                                    : item.sourcingType === "LOCAL_AND_FOREIGN"
                                      ? item.costingStatus === "COSTED"
                                        ? "Edit Compare"
                                        : "Compare"
                                      : item.costingStatus === "DRAFT"
                                        ? "Edit"
                                        : item.costingStatus === "COSTED"
                                          ? "Edit Cost"
                                          : "Cost"}
                                </button>
                                <IconButton
                                  aria-label="Remove item"
                                  disabled={saveCosting.isPending}
                                  onClick={() => void removeCostingItem(item.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-biz-danger" />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredItems.length === 0 && (
                        <tr className="costing-empty-row border-t border-biz-border">
                          <td
                            colSpan={15}
                            className="px-4 py-8 text-center text-[11px] text-biz-muted"
                          >
                            {items.length === 0
                              ? "No items added yet."
                              : "No pending items. Add another row or edit an item from the Costed Items List."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-biz-border bg-slate-50/50 px-3 py-2">
                <span className="text-[11px] text-biz-muted">
                  {isReviewMode
                    ? `${reviewItems.length} item${reviewItems.length === 1 ? "" : "s"} ready for review in BDT`
                    : `${costedItemCount} of ${items.length} items costed · ${selectedItemIds.size} selected`}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {readyToSaveCount > 0 &&
                    activeForeignItems.length === 0 &&
                    !shouldShowStartCosting && (
                      <PrimaryButton
                        className="h-9 rounded-lg bg-biz-success px-4 hover:bg-biz-success/90"
                        disabled={saveCosting.isPending}
                        onClick={saveAllCosting}
                      >
                        <Save className="h-4 w-4" />
                        {saveCosting.isPending
                          ? "Saving All..."
                          : `Save All Costing (${readyToSaveCount})`}
                      </PrimaryButton>
                    )}
                  {selectedItemIds.size > 0 && (
                    <>
                      <SelectInput
                        className="h-9 w-[150px] text-[11px]"
                        placeholder="Set source"
                        value={bulkSourcingType}
                        options={SOURCING_OPTIONS}
                        onChange={(event) =>
                          setBulkSourcingType(event.target.value as TenderCostingSourcingType | "")
                        }
                      />
                      <SecondaryButton
                        className="h-9"
                        disabled={!bulkSourcingType}
                        onClick={applyBulkSourcingType}
                      >
                        Apply Source
                      </SecondaryButton>
                    </>
                  )}
                  {shouldShowStartCosting && (
                    <PrimaryButton
                      className="h-9"
                      disabled={!canStartCosting}
                      title={
                        !canStartCosting
                          ? "Complete Date, Prepared By, Product, Quantity and Unit for the selected or filtered items"
                          : selectedItemIds.size > 0
                            ? "Start costing selected items"
                            : "Start costing all items in the current filter"
                      }
                      onClick={startSelectedCosting}
                    >
                      {costingCandidateItems.every((item) => item.sourcingType === "FOREIGN")
                        ? "Start Foreign Costing"
                        : "Start Selected Costing"}{" "}
                      ({costingCandidateItems.length})
                    </PrimaryButton>
                  )}
                </div>
              </div>
              {errors.items && (
                <p className="border-t border-biz-border px-4 py-2 text-[12px] text-biz-danger">
                  {errors.items}
                </p>
              )}
            </div>

            {items.some((item) => activeCostingIds.has(item.id)) && (
              <div ref={costingWorkspaceRef} className="scroll-mt-20 flex flex-col gap-3">
                {activeForeignItems.length > 0 && (
                  <ForeignBatchTable
                    items={activeForeignItems}
                    saving={saveCosting.isPending}
                    settings={
                      <div
                        className={`grid min-w-0 grid-cols-2 gap-2 overflow-hidden border-b border-biz-border bg-biz-bg/60 px-3 py-3 sm:grid-cols-3 lg:grid-cols-5 xl:items-end ${
                          activeForeignItems.some(isLcForeignCostingItem)
                            ? "xl:grid-cols-11"
                            : "xl:grid-cols-10"
                        }`}
                      >
                        <div className="contents">
                          <MiniField label="Country" required>
                            <SelectInput
                              className="h-9 min-w-0 text-[10px]"
                              value={bulkForeign.country}
                              options={countryOptionsWithCurrent(bulkForeign.country)}
                              onChange={(event) => {
                                const country = event.target.value;
                                const currency = COUNTRY_CURRENCY[country] ?? bulkForeign.currency;
                                const currencyChanged = currency !== bulkForeign.currency;
                                updateBulkForeignSettings({
                                  ...bulkForeign,
                                  country,
                                  currency,
                                  exchangeRate: currencyChanged
                                    ? currency === DEFAULT_CHINA_CURRENCY
                                      ? DEFAULT_CNY_TO_BDT_RATE
                                      : ""
                                    : bulkForeign.exchangeRate,
                                  exchangeRateDate: currencyChanged
                                    ? localDate()
                                    : bulkForeign.exchangeRateDate,
                                });
                              }}
                            />
                          </MiniField>
                          <MiniField label="Currency">
                            <SelectInput
                              className="h-9 min-w-0 text-[10px]"
                              value={bulkForeign.currency}
                              options={CURRENCY_OPTIONS}
                              onChange={(event) => {
                                const currency = event.target.value;
                                updateBulkForeignSettings({
                                  ...bulkForeign,
                                  currency,
                                  country: CURRENCY_COUNTRY[currency] ?? bulkForeign.country,
                                  exchangeRate:
                                    currency === bulkForeign.currency
                                      ? bulkForeign.exchangeRate
                                      : currency === DEFAULT_CHINA_CURRENCY
                                        ? DEFAULT_CNY_TO_BDT_RATE
                                        : "",
                                  exchangeRateDate:
                                    currency === bulkForeign.currency
                                      ? bulkForeign.exchangeRateDate
                                      : localDate(),
                                });
                              }}
                            />
                          </MiniField>
                          <MiniField label="Shipping Method" required>
                            <SelectInput
                              className="h-9 min-w-0 text-[9px]"
                              value={bulkForeign.shippingMethod}
                              options={SHIPPING_METHOD_OPTIONS}
                              onChange={(event) => {
                                const shippingMethod = event.target
                                  .value as TenderCostingShippingMethod;
                                updateBulkForeignSettings({ ...bulkForeign, shippingMethod });
                              }}
                            />
                          </MiniField>
                          <BulkForeignNumber
                            required
                            label="Exchange Rate"
                            value={bulkForeign.exchangeRate}
                            onChange={(exchangeRate) =>
                              updateBulkForeignSettings({ ...bulkForeign, exchangeRate })
                            }
                          />
                          <MiniField label="Rate Date">
                            <TextInput
                              type="date"
                              className="h-9 min-w-0 px-1 text-[9px]"
                              value={bulkForeign.exchangeRateDate}
                              onChange={(event) =>
                                updateBulkForeignSettings({
                                  ...bulkForeign,
                                  exchangeRateDate: event.target.value,
                                })
                              }
                            />
                          </MiniField>
                        </div>
                        <div className="contents">
                          <div className="hidden">
                            <div>
                              <p className="text-[12px] font-bold text-biz-text">
                                Shipment Common Cost
                              </p>
                              <p className="text-[10px] text-biz-muted">
                                Enter each shared charge once. Product rows show only their
                                allocated share.
                              </p>
                            </div>
                            <span className="rounded-full bg-biz-blue/10 px-2.5 py-1 text-[10px] font-semibold text-biz-blue">
                              Current batch: {activeForeignItems.length}{" "}
                              {activeForeignItems.length === 1 ? "item" : "items"}
                            </span>
                          </div>
                          <div className="contents">
                            <ForeignBatchCostInput
                              label={`Transport (${bulkForeign.currency})`}
                              value={foreignBatchCosts.originTransport}
                              onChange={(originTransport) =>
                                updateForeignBatchCosts({ originTransport })
                              }
                            />
                            <ForeignBatchCostInput
                              label="Local Transport"
                              value={foreignBatchCosts.localTransport}
                              onChange={(localTransport) =>
                                updateForeignBatchCosts({ localTransport })
                              }
                            />
                            <ForeignBatchCostInput
                              label="Project Transport"
                              value={foreignBatchCosts.projectTransport}
                              onChange={(projectTransport) =>
                                updateForeignBatchCosts({ projectTransport })
                              }
                            />
                            <ForeignBatchCostInput
                              label="Other Cost"
                              value={foreignBatchCosts.otherCost}
                              onChange={(otherCost) => updateForeignBatchCosts({ otherCost })}
                            />
                            {activeForeignItems.some(isLcForeignCostingItem) && (
                              <ForeignBatchCostInput
                                label="Container Fee (BDT)"
                                value={lcContainerFee}
                                onChange={updateInlineLcContainerFee}
                              />
                            )}
                            <MiniField label="Allocation Basis">
                              <SelectInput
                                className="h-9 min-w-0 text-[10px]"
                                value={foreignBatchCosts.allocationMethod}
                                options={LC_ALLOCATION_OPTIONS}
                                onChange={(event) =>
                                  updateForeignBatchCosts({
                                    allocationMethod: event.target
                                      .value as TenderCostingLcAllocationMethod,
                                  })
                                }
                              />
                            </MiniField>
                          </div>
                          <p className="hidden">
                            Values are allocated automatically. Missing weight falls back to product
                            value, then equal split.
                          </p>
                        </div>
                      </div>
                    }
                    onChange={updateForeignBatchItem}
                    onShippingMethodChange={handleForeignShippingMethodChange}
                    lcContainerFee={lcContainerFee}
                    lcContainerAllocationMethod={lcContainerAllocationMethod}
                    lcProductCount={lcProducts.length}
                    onValidationBlocked={() => setSaveError("")}
                    onContainerFeeRequired={() =>
                      setSaveError("Enter the LC Container Fee in the common costing row.")
                    }
                    onSaveAll={saveAllActiveForeignCosting}
                  />
                )}
                {items
                  .filter(
                    (item) => activeCostingIds.has(item.id) && item.sourcingType !== "FOREIGN",
                  )
                  .map((item, itemIndex) => (
                    <CostingWorkspaceCard
                      key={`${item.id}-${itemIndex}`}
                      item={item}
                      preview={calculateItemPreview(item)}
                      onChange={(patch) =>
                        updateItem(item.id, { ...patch, costingStatus: "DRAFT" })
                      }
                      onMarkCosted={() => markItemCosted(item)}
                    />
                  ))}
              </div>
            )}

            {costedItems.length > 0 && (
              <div ref={costedItemsListRef} className="scroll-mt-20">
                <CostedItemsList
                  items={costedItems}
                  saving={saveCosting.isPending}
                  onChange={(itemId, patch) =>
                    updateItem(itemId, { ...patch, costingStatus: "COSTED" })
                  }
                  onSave={() => void saveCostedItemChanges()}
                  onDelete={(itemIds) => void removeCostingItems(itemIds)}
                  onMoveToIntake={moveCostedItemsToIntake}
                />
              </div>
            )}
          </fieldset>
        </div>

        {saveError && (
          <div className="mx-2.5 mb-2.5 rounded-md border border-biz-danger/20 bg-biz-danger/5 px-3 py-2 text-[11px] font-medium text-biz-danger xl:mx-3 xl:mb-3 xl:text-[12px]">
            {saveError}
          </div>
        )}
      </main>

      <Modal
        open={Boolean(productEditor)}
        onClose={() => setProductEditor(null)}
        title="View & Edit Full Product Name"
        contentClassName="max-w-[760px]"
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!productEditor?.value.trim()) return;
            updateItem(productEditor.itemId, {
              description: productEditor.value.trim(),
              costingStatus: "NOT_COSTED",
            });
            setProductEditor(null);
          }}
        >
          <label className="text-[11px] font-semibold text-biz-text" htmlFor="full-product-name">
            Full Product Name
          </label>
          <textarea
            id="full-product-name"
            autoFocus
            rows={12}
            value={productEditor?.value ?? ""}
            onChange={(event) =>
              setProductEditor((current) =>
                current ? { ...current, value: event.target.value } : current,
              )
            }
            className="min-h-[240px] w-full resize-y rounded-lg border border-biz-border bg-white px-3 py-2.5 text-[12px] leading-5 text-biz-text outline-none focus:border-biz-blue focus:ring-2 focus:ring-biz-blue/15"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-[10px] text-biz-muted">
              {productEditor?.value.length ?? 0} characters
            </span>
            <div className="flex items-center gap-2">
              <SecondaryButton type="button" onClick={() => setProductEditor(null)}>
                Cancel
              </SecondaryButton>
              <PrimaryButton type="submit" disabled={!productEditor?.value.trim()}>
                Save Product Name
              </PrimaryButton>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={lcContainerEditorOpen}
        onClose={closeLcContainerEditor}
        title={Number(lcContainerFee) > 0 ? "Edit Container Fee" : "Set Container Fee"}
        contentClassName="max-w-[440px]"
      >
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            saveLcContainerSettings();
          }}
        >
          <div className="grid grid-cols-1 gap-3 rounded-lg border border-biz-border bg-biz-bg/50 p-3 sm:grid-cols-2">
            <Field label="Total Container Fee (BDT)" required>
              <TextInput
                autoFocus
                type="number"
                min="0.01"
                step="0.01"
                hasError={lcEditorAttempted && Number(lcContainerFeeDraft) <= 0}
                className={`h-10 text-right font-semibold ${NUMBER_INPUT_CLASS}`}
                value={lcContainerFeeDraft}
                placeholder="0.00"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setLcContainerFeeDraft(event.target.value)}
              />
            </Field>
            <Field label="Cost Distribution" required>
              <SelectInput
                className="h-10"
                value={lcAllocationMethodDraft}
                options={LC_ALLOCATION_OPTIONS}
                onChange={(event) =>
                  setLcAllocationMethodDraft(event.target.value as TenderCostingLcAllocationMethod)
                }
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-biz-warning/25 bg-biz-warning/5 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-biz-muted">LC Products</p>
              <p className="text-[13px] font-bold text-biz-text">
                {lcEditorItems.length} {lcEditorItems.length === 1 ? "product" : "products"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium text-biz-muted">
                {lcAllocationLabel(lcAllocationMethodDraft)}
              </p>
              <p className="text-[13px] font-bold text-biz-warning">
                BDT {formatCompactMoney(Number(lcContainerFeeDraft) || 0)}
              </p>
            </div>
          </div>

          {lcAllocationMethodDraft === "WEIGHT" && lcEditorItems.length > 0 && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-biz-border">
              {lcEditorItems.map((item, index) => {
                const invalidWeight = lcEditorAttempted && Number(lcWeightDrafts[item.id]) <= 0;
                return (
                  <div
                    key={`${item.id}-${index}`}
                    className="grid grid-cols-[1fr_110px] items-center gap-3 border-b border-biz-border px-3 py-2 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[11px] font-semibold text-biz-text">
                        {index + 1}. {item.description || "LC Product"}
                      </p>
                    </div>
                    <TextInput
                      type="number"
                      min="0.001"
                      step="any"
                      aria-label={`Shipping weight for ${item.description || `LC product ${index + 1}`}`}
                      hasError={invalidWeight}
                      className={`h-8 text-right text-[11px] ${NUMBER_INPUT_CLASS}`}
                      value={lcWeightDrafts[item.id] ?? ""}
                      placeholder="Weight (KG)"
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        setLcWeightDrafts((current) => ({
                          ...current,
                          [item.id]: event.target.value,
                        }))
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-biz-border pt-3">
            <SecondaryButton type="button" onClick={closeLcContainerEditor}>
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit">
              <Save className="h-4 w-4" />
              Save Container Fee
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <Modal
        open={profitSettingsOpen}
        onClose={() => setProfitSettingsOpen(false)}
        title="Profit, VAT & Tax Settings"
        contentClassName="max-w-[400px]"
        draggable
      >
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-biz-border bg-biz-bg/50 p-3">
            <Field label="Local Profit">
              <div className="relative">
                <TextInput
                  type="number"
                  min="0"
                  max="99.99"
                  step="any"
                  className={`h-10 pr-8 font-semibold ${NUMBER_INPUT_CLASS}`}
                  value={localTargetMargin}
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                  onChange={(event) => setLocalTargetMargin(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-semibold text-biz-muted">
                  %
                </span>
              </div>
            </Field>
            <Field label="Foreign Profit">
              <div className="relative">
                <TextInput
                  type="number"
                  min="0"
                  max="99.99"
                  step="any"
                  className={`h-10 pr-8 font-semibold ${NUMBER_INPUT_CLASS}`}
                  value={foreignTargetMargin}
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                  onChange={(event) => setForeignTargetMargin(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-semibold text-biz-muted">
                  %
                </span>
              </div>
            </Field>
            <Field label="VAT">
              <div className="relative">
                <TextInput
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  className={`h-10 pr-8 font-semibold ${NUMBER_INPUT_CLASS}`}
                  value={commonVatPercent}
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                  onChange={(event) => setCommonVatPercent(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-semibold text-biz-muted">
                  %
                </span>
              </div>
            </Field>
            <Field label="Tax / AIT">
              <div className="relative">
                <TextInput
                  type="number"
                  min="0"
                  max="100"
                  step="any"
                  className={`h-10 pr-8 font-semibold ${NUMBER_INPUT_CLASS}`}
                  value={commonTaxPercent}
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                  onChange={(event) => setCommonTaxPercent(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12px] font-semibold text-biz-muted">
                  %
                </span>
              </div>
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-biz-border pt-3">
            <SecondaryButton onClick={() => setProfitSettingsOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton disabled={saveCosting.isPending} onClick={applyPricingSettings}>
              {saveCosting.isPending ? "Saving..." : "Apply & Save"}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal
        open={budgetEditorOpen}
        onClose={leaveBudgetEditor}
        title={hasCostingBudget ? "Update Total Costing Budget" : "Set Total Costing Budget"}
        contentClassName="max-w-lg"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void saveBudget();
          }}
        >
          <div className="grid grid-cols-1 gap-2 rounded-md border border-biz-border bg-biz-bg/60 p-3 sm:grid-cols-[105px_1fr]">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-biz-muted">
                Tender ID
              </p>
              <p className="mt-1 truncate text-[12px] font-semibold text-biz-text">
                {record.tender.egpTenderId ?? record.tender.id}
              </p>
            </div>
            <div className="min-w-0 border-t border-biz-border pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-biz-muted">
                Product / Work Name
              </p>
              <p
                className="mt-1 line-clamp-2 text-[12px] font-semibold leading-4 text-biz-text"
                title={record.tender.workName}
              >
                {record.tender.workName}
              </p>
            </div>
          </div>

          <Field required label="Total Costing Budget" error={budgetError}>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-px left-px flex w-14 items-center justify-center rounded-l-md border-r border-biz-border bg-biz-bg text-[11px] font-bold text-biz-muted">
                BDT
              </span>
              <TextInput
                autoFocus
                type="number"
                min="0.01"
                step="any"
                className={`h-12 pl-16 pr-3 text-right text-[18px] font-bold ${NUMBER_INPUT_CLASS}`}
                disabled={setCostingBudget.isPending}
                value={budgetInput}
                placeholder="Enter amount"
                onFocus={(event) => {
                  if (Number(event.currentTarget.value) === 0) {
                    setBudgetInput("");
                    return;
                  }
                  event.currentTarget.select();
                }}
                onChange={(event) => {
                  setBudgetInput(event.target.value);
                  setBudgetError("");
                }}
              />
            </div>
          </Field>

          <div
            className={`rounded-md px-3 py-2.5 text-[11.5px] ${isBudgetValid ? "bg-biz-success-soft text-biz-success" : "bg-biz-bg text-biz-muted"}`}
            aria-live="polite"
          >
            {isBudgetValid ? (
              <span>
                Budget to save: <strong>{formatMoney(enteredBudget)}</strong>
              </span>
            ) : (
              "Enter an amount greater than zero."
            )}
          </div>

          <div className="flex items-start gap-2 rounded-md border border-biz-border px-3 py-2.5 text-[11px] leading-4 text-biz-muted">
            <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-biz-blue" />
            <span>
              {hasCostingBudget
                ? "You can update this again from the Total Costing Budget card."
                : "Saving the budget will immediately unlock the costing workspace."}
            </span>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-biz-border pt-4 sm:flex-row sm:justify-end">
            <SecondaryButton
              type="button"
              disabled={setCostingBudget.isPending}
              onClick={leaveBudgetEditor}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton type="submit" disabled={setCostingBudget.isPending || !isBudgetValid}>
              <Save className="h-4 w-4" />
              {setCostingBudget.isPending
                ? "Saving Budget..."
                : hasCostingBudget
                  ? "Update Budget"
                  : "Save & Start Costing"}
            </PrimaryButton>
          </div>
        </form>
      </Modal>

      <SuccessPopup
        open={false}
        title={success?.title ?? "Success"}
        message={success?.message ?? ""}
        onClose={() => setSuccess(null)}
        showControls={success?.title !== "Local Costing Saved"}
        autoDismissMs={success?.title === "Local Costing Saved" ? 2000 : undefined}
        dismissOnBackdrop={success?.title !== "Local Costing Saved"}
        dismissOnEscape={success?.title !== "Local Costing Saved"}
        showActions={success?.title !== "Costing Updated"}
        primaryLabel="Back to Costing List"
        onPrimary={() => router.push(`/tender-management/tender-costing?costingId=${record.id}`)}
        secondaryLabel={success?.title === "Costing Completed" ? undefined : "Continue Editing"}
        onSecondary={() => setSuccess(null)}
      />
    </div>
  );
}

function CostedItemsList({
  items,
  saving,
  onChange,
  onSave,
  onDelete,
  onMoveToIntake,
  mode = "costed",
  validationAttemptedIds = new Set<string>(),
  onEditForeign,
}: {
  items: CostingItemForm[];
  saving: boolean;
  onChange: (itemId: string, patch: Partial<CostingItemForm>) => void;
  onSave: () => void;
  onDelete: (itemIds: string[]) => void;
  onMoveToIntake: (itemIds: string[]) => void;
  mode?: "costed" | "review";
  validationAttemptedIds?: Set<string>;
  onEditForeign?: (item: CostingItemForm) => void;
}) {
  const isReview = mode === "review";
  const [activeCell, setActiveCell] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const currentItemIds = new Set(items.map((item) => item.id));
  const effectiveSelectedIds = new Set(
    [...selectedIds].filter((itemId) => currentItemIds.has(itemId)),
  );
  const saveTimerRef = React.useRef<number | null>(null);
  const onSaveRef = React.useRef(onSave);
  React.useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);
  const inputClass =
    "h-7 w-full min-w-0 rounded border border-biz-blue bg-white px-1 text-[8px] outline-none ring-2 ring-biz-blue/15 xl:text-[9px] 2xl:text-[10px]";
  const beginCellEdit = (cell: string) => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    setActiveCell(cell);
  };
  const finishAndSave = () => {
    setActiveCell(null);
    if (isReview) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => onSaveRef.current(), 600);
  };
  const finishCellEdit = (event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      finishAndSave();
    }
  };
  const deleteSelectedItems = () => {
    if (effectiveSelectedIds.size === 0 || saving) return;
    const count = effectiveSelectedIds.size;
    if (!window.confirm(`Delete ${count} selected costing item${count === 1 ? "" : "s"}?`)) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    onDelete([...effectiveSelectedIds]);
    setSelectedIds(new Set());
  };
  const moveSelectedToIntake = () => {
    if (effectiveSelectedIds.size === 0 || saving) return;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    onMoveToIntake([...effectiveSelectedIds]);
    setSelectedIds(new Set());
  };

  React.useEffect(
    () => () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );
  const spreadsheetValues = (item: CostingItemForm) => {
    const preview = calculateItemPreview(item);
    const quantity = Number(item.quantity) || 0;
    const isForeign = item.selectedSource === "FOREIGN" || item.sourcingType === "FOREIGN";
    const unitUsd = isForeign ? Number(item.foreignUnitPrice) || 0 : 0;
    const unitBdt = isForeign ? preview.foreignUnitValueBdt : Number(item.localUnitPrice) || 0;
    const baseTotal = isForeign ? preview.foreignProductValue : roundMoney(quantity * unitBdt);
    const unitWeight = isForeign ? Number(item.shippingWeightKg) || 0 : 0;
    const totalWeight = isForeign ? quantity * unitWeight : 0;
    const shipping = isForeign ? preview.shippingCostBdt : 0;
    const landing = preview.selectedCostBeforeProfit;
    const profit = preview.totalProfit;
    const totalAfterProfit = preview.subtotalBeforeTax;
    const vatTax = preview.vatAmount + preview.taxAmount;

    return {
      preview,
      quantity,
      isForeign,
      unitUsd,
      unitBdt,
      baseTotal,
      unitWeight,
      totalWeight,
      shipping,
      landing,
      profit,
      totalAfterProfit,
      vatTax,
    };
  };

  const totals = items.reduce(
    (summary, item) => {
      const values = spreadsheetValues(item);
      summary.quantity += values.quantity;
      summary.baseTotal += values.baseTotal;
      summary.totalWeight += values.totalWeight;
      summary.shipping += values.shipping;
      summary.landing += values.landing;
      summary.profit += values.profit;
      summary.totalAfterProfit += values.totalAfterProfit;
      summary.vatTax += values.vatTax;
      summary.grandTotal += values.preview.selectedGrandTotal;
      return summary;
    },
    {
      quantity: 0,
      baseTotal: 0,
      totalWeight: 0,
      shipping: 0,
      landing: 0,
      profit: 0,
      totalAfterProfit: 0,
      vatTax: 0,
      grandTotal: 0,
    },
  );

  return (
    <div
      className={
        isReview
          ? "overflow-hidden bg-white"
          : "overflow-hidden rounded-lg border border-biz-border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)]"
      }
    >
      {!isReview && (
        <div className="flex flex-col gap-2 border-b border-biz-border bg-slate-50/60 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between 2xl:px-4 2xl:py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <h2 className="text-[13px] font-bold text-biz-text 2xl:text-[15px]">
                Costed Items List
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {saving && <span className="text-[10px] font-medium text-biz-blue">Saving...</span>}
            {effectiveSelectedIds.size > 0 && (
              <>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-md bg-biz-blue px-3 text-[9px] font-semibold text-white transition-colors hover:bg-blue-700"
                  disabled={saving}
                  onClick={moveSelectedToIntake}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Move to Costing Intake ({effectiveSelectedIds.size})
                </button>
                <button
                  type="button"
                  className="flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-white px-2 text-[9px] font-semibold text-biz-danger transition-colors hover:bg-red-50"
                  disabled={saving}
                  onClick={deleteSelectedItems}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete ({effectiveSelectedIds.size})
                </button>
              </>
            )}
            <StatusBadge label={`${items.length} Costed`} tone="success" />
          </div>
        </div>
      )}
      <div className="overflow-x-hidden">
        <table className="costing-responsive-table costing-costed-table text-left text-[10px] xl:text-[11px] 2xl:text-[11px]">
          <thead className="border-b border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100/80 text-slate-700">
            <tr className="align-bottom">
              <th className="w-[3.5%] px-1 py-2.5">
                <div className="flex min-h-8 items-start gap-1">
                  {!isReview && (
                    <input
                      type="checkbox"
                      aria-label="Select all costed items"
                      checked={items.length > 0 && effectiveSelectedIds.size === items.length}
                      onChange={(event) =>
                        setSelectedIds(
                          event.target.checked ? new Set(items.map((item) => item.id)) : new Set(),
                        )
                      }
                    />
                  )}
                  <span className="text-[9px] font-bold">SL</span>
                </div>
              </th>
              <th className="w-[13.5%] px-1 py-2.5">
                <CostedColumnHeader label="Item Description" align="left" />
              </th>
              <th className="w-[3.5%] px-0.5 py-2.5">
                <CostedColumnHeader label="Unit" align="left" />
              </th>
              <th className="w-[3.5%] px-0.5 py-2.5">
                <CostedColumnHeader label="Quantity" />
              </th>
              <th className="w-[5%] px-0.5 py-2.5">
                <CostedColumnHeader label="Unit Price" unit="USD" />
              </th>
              <th className="w-[5.5%] px-0.5 py-2.5">
                <CostedColumnHeader label="Unit Price" unit="BDT" />
              </th>
              <th className="w-[6%] px-0.5 py-2.5">
                <CostedColumnHeader label="Item Cost" unit="BDT" />
              </th>
              <th className="w-[4%] px-0.5 py-2.5">
                <CostedColumnHeader label="Unit Weight" unit="kg" />
              </th>
              <th className="w-[5%] px-0.5 py-2.5">
                <CostedColumnHeader label="Total Weight" unit="kg" />
              </th>
              <th className="w-[6%] px-0.5 py-2.5">
                <CostedColumnHeader label="Shipping" unit="BDT" />
              </th>
              <th className="w-[6%] px-0.5 py-2.5">
                <CostedColumnHeader label="Landed Cost" unit="BDT" />
              </th>
              <th className="w-[6%] px-0.5 py-2.5">
                <CostedColumnHeader label="Profit" unit="BDT / Margin %" />
              </th>
              <th className="w-[7%] px-0.5 py-2.5">
                <CostedColumnHeader label="Cost + Profit" unit="BDT" />
              </th>
              <th className="w-[7%] px-0.5 py-2.5">
                <CostedColumnHeader label="VAT + Tax" unit="BDT" />
              </th>
              <th className="w-[7%] px-0.5 py-2.5">
                <CostedColumnHeader label="Grand Total" unit="BDT" />
              </th>
              <th className="w-[8.5%] px-0.5 py-2.5">
                <CostedColumnHeader label="Quoted Unit Price" unit="BDT" />
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const values = spreadsheetValues(item);
              const showRequiredErrors = isReview && validationAttemptedIds.has(item.id);
              const productRequiredError = showRequiredErrors && !item.description.trim();
              const unitRequiredError = showRequiredErrors && !item.unit.trim();
              const quantityRequiredError = showRequiredErrors && Number(item.quantity) <= 0;
              const localUnitPriceRequiredError =
                showRequiredErrors && !values.isForeign && Number(item.localUnitPrice) <= 0;
              return (
                <tr
                  key={`${item.id}-${index}`}
                  data-costing-row={isReview || undefined}
                  data-costing-row-id={isReview ? item.id : undefined}
                  className="costing-record-row border-t border-biz-border transition-colors odd:bg-white even:bg-slate-50/35 hover:bg-blue-50/40"
                >
                  <td data-label="Item" className="px-0.5 py-2.5">
                    <div className="flex items-center gap-1">
                      {!isReview && (
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.description}`}
                          checked={effectiveSelectedIds.has(item.id)}
                          onChange={(event) =>
                            setSelectedIds((current) => {
                              const next = new Set(current);
                              if (event.target.checked) next.add(item.id);
                              else next.delete(item.id);
                              return next;
                            })
                          }
                        />
                      )}
                      <span>{item.sourceItemNo || index + 1}</span>
                    </div>
                  </td>
                  <td
                    data-label="Item Description"
                    className={`costing-wide-cell px-0.5 py-2 font-medium text-biz-text ${productRequiredError ? "costing-review-error" : ""}`}
                  >
                    <div className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                      {activeCell === `${item.id}:description` ? (
                        <input
                          autoFocus
                          data-costing-field={isReview || undefined}
                          data-costing-column={isReview ? "product" : undefined}
                          aria-invalid={productRequiredError}
                          className={`${inputClass} flex-1 font-medium`}
                          value={item.description}
                          onChange={(event) =>
                            onChange(item.id, { description: event.target.value })
                          }
                          onBlur={finishAndSave}
                          onKeyDown={finishCellEdit}
                        />
                      ) : (
                        <button
                          type="button"
                          data-costing-field={isReview || undefined}
                          data-costing-column={isReview ? "product" : undefined}
                          className="min-w-0 flex-1 cursor-text truncate rounded px-1 text-left hover:bg-blue-50 hover:text-biz-blue"
                          title={`${item.description} — click to edit`}
                          onClick={() => beginCellEdit(`${item.id}:description`)}
                        >
                          {item.description || "Enter product"}
                        </button>
                      )}
                      {isReview && values.isForeign && onEditForeign ? (
                        <button
                          type="button"
                          className="shrink-0 rounded bg-biz-purple/10 px-1 py-px text-[6px] font-semibold text-biz-purple hover:bg-biz-purple/20"
                          title="Edit Foreign Product Costing"
                          onClick={() => onEditForeign(item)}
                        >
                          Foreign · Edit
                        </button>
                      ) : (
                        <span
                          className={`shrink-0 rounded px-1 py-px text-[6px] font-semibold ${values.isForeign ? "bg-biz-purple/10 text-biz-purple" : "bg-biz-success/10 text-biz-success"}`}
                        >
                          {values.isForeign ? "Foreign" : "Local"}
                        </span>
                      )}
                    </div>
                  </td>
                  <td
                    data-label="Unit"
                    className={`px-0.5 py-1 ${unitRequiredError ? "costing-review-error" : ""}`}
                  >
                    {activeCell === `${item.id}:unit` ? (
                      <select
                        autoFocus
                        data-costing-field={isReview || undefined}
                        data-costing-column={isReview ? "unit" : undefined}
                        aria-invalid={unitRequiredError}
                        className={inputClass}
                        value={item.unit}
                        onChange={(event) => onChange(item.id, { unit: event.target.value })}
                        onBlur={finishAndSave}
                        onKeyDown={finishCellEdit}
                      >
                        {UNIT_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <button
                        type="button"
                        data-costing-field={isReview || undefined}
                        data-costing-column={isReview ? "unit" : undefined}
                        className="w-full cursor-text rounded px-1 text-left hover:bg-blue-50 hover:text-biz-blue"
                        onClick={() => beginCellEdit(`${item.id}:unit`)}
                      >
                        {item.unit}
                      </button>
                    )}
                  </td>
                  <td
                    data-label="Quantity"
                    className={`px-0.5 py-1 text-right tabular-nums ${quantityRequiredError ? "costing-review-error" : ""}`}
                  >
                    {activeCell === `${item.id}:quantity` ? (
                      <input
                        autoFocus
                        data-costing-field={isReview || undefined}
                        data-costing-column={isReview ? "quantity" : undefined}
                        aria-invalid={quantityRequiredError}
                        className={`${inputClass} text-right`}
                        type="number"
                        min="0.001"
                        step="any"
                        value={item.quantity}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) => onChange(item.id, { quantity: event.target.value })}
                        onBlur={finishAndSave}
                        onKeyDown={finishCellEdit}
                      />
                    ) : (
                      <button
                        type="button"
                        data-costing-field={isReview || undefined}
                        data-costing-column={isReview ? "quantity" : undefined}
                        className="w-full cursor-text rounded px-1 text-right hover:bg-blue-50 hover:text-biz-blue"
                        onClick={() => beginCellEdit(`${item.id}:quantity`)}
                      >
                        {formatCompactMoney(values.quantity)}
                      </button>
                    )}
                  </td>
                  <td data-label="Unit USD" className="px-0.5 py-1 text-right tabular-nums">
                    {values.isForeign && activeCell === `${item.id}:unitPrice` ? (
                      <input
                        autoFocus
                        className={`${inputClass} text-right`}
                        type="number"
                        min="0"
                        step="any"
                        value={item.foreignUnitPrice}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          onChange(item.id, { foreignUnitPrice: event.target.value })
                        }
                        onBlur={finishAndSave}
                        onKeyDown={finishCellEdit}
                      />
                    ) : values.isForeign ? (
                      <button
                        type="button"
                        className="w-full cursor-text rounded px-1 text-right hover:bg-blue-50 hover:text-biz-blue"
                        onClick={() => beginCellEdit(`${item.id}:unitPrice`)}
                      >
                        {formatCompactMoney(values.unitUsd)}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    data-label="Unit BDT"
                    className={`px-0.5 py-1 text-right tabular-nums ${localUnitPriceRequiredError ? "costing-review-error" : ""}`}
                  >
                    {!values.isForeign && activeCell === `${item.id}:unitPrice` ? (
                      <input
                        autoFocus
                        data-costing-field={isReview || undefined}
                        data-costing-column={isReview ? "unit-price" : undefined}
                        aria-invalid={localUnitPriceRequiredError}
                        className={`${inputClass} text-right`}
                        type="number"
                        min="0"
                        step="any"
                        value={item.localUnitPrice}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          onChange(item.id, { localUnitPrice: event.target.value })
                        }
                        onBlur={finishAndSave}
                        onKeyDown={finishCellEdit}
                      />
                    ) : !values.isForeign ? (
                      <button
                        type="button"
                        data-costing-field={isReview || undefined}
                        data-costing-column={isReview ? "unit-price" : undefined}
                        className="w-full cursor-text rounded px-1 text-right hover:bg-blue-50 hover:text-biz-blue"
                        onClick={() => beginCellEdit(`${item.id}:unitPrice`)}
                      >
                        {formatCompactMoney(values.unitBdt)}
                      </button>
                    ) : (
                      formatCompactMoney(values.unitBdt)
                    )}
                  </td>
                  <td
                    data-label="Product Total"
                    className="px-0.5 py-2.5 text-right font-semibold tabular-nums text-biz-navy"
                  >
                    {formatCompactMoney(values.baseTotal)}
                  </td>
                  <td data-label="Unit Weight" className="px-0.5 py-1 text-right tabular-nums">
                    {values.isForeign && activeCell === `${item.id}:weight` ? (
                      <input
                        autoFocus
                        className={`${inputClass} text-right`}
                        type="number"
                        min="0"
                        step="any"
                        value={item.shippingWeightKg}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          onChange(item.id, { shippingWeightKg: event.target.value })
                        }
                        onBlur={finishAndSave}
                        onKeyDown={finishCellEdit}
                      />
                    ) : values.isForeign ? (
                      <button
                        type="button"
                        className="w-full cursor-text rounded px-1 text-right hover:bg-blue-50 hover:text-biz-blue"
                        onClick={() => beginCellEdit(`${item.id}:weight`)}
                      >
                        {formatCompactMoney(values.unitWeight)}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    data-label="Total Weight"
                    className="px-0.5 py-2.5 text-right font-semibold tabular-nums"
                  >
                    {formatCompactMoney(values.totalWeight)}
                  </td>
                  <td data-label="Shipping" className="px-0.5 py-2.5 text-right tabular-nums">
                    {formatCompactMoney(values.shipping)}
                  </td>
                  <td
                    data-label="Landing"
                    className="px-0.5 py-2.5 text-right font-semibold tabular-nums"
                  >
                    {formatCompactMoney(values.landing)}
                  </td>
                  <td
                    data-label="Profit"
                    className="px-0.5 py-1 text-right font-semibold tabular-nums text-biz-success"
                  >
                    {activeCell === `${item.id}:profit` ? (
                      <input
                        autoFocus
                        className={`${inputClass} text-right font-semibold text-biz-success`}
                        type="number"
                        min="0"
                        max="99.99"
                        step="any"
                        value={item.marginPercent}
                        title={`Profit amount: ${formatCompactMoney(values.profit)}`}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          onChange(item.id, { marginPercent: event.target.value })
                        }
                        onBlur={finishAndSave}
                        onKeyDown={finishCellEdit}
                      />
                    ) : (
                      <button
                        type="button"
                        className="flex w-full cursor-text flex-col items-end rounded px-1 py-0.5 text-right hover:bg-blue-50"
                        title="Click to edit profit percentage"
                        onClick={() => beginCellEdit(`${item.id}:profit`)}
                      >
                        <span className="text-[10px] font-bold leading-tight text-biz-success xl:text-[11px]">
                          {formatCompactMoney(values.profit)}
                        </span>
                        <span className="mt-0.5 inline-flex rounded-full bg-emerald-100 px-1.5 py-0.5 text-[8px] font-bold leading-none text-emerald-700 xl:text-[9px]">
                          {formatCompactMoney(Number(item.marginPercent) || 0)}%
                        </span>
                      </button>
                    )}
                  </td>
                  <td
                    data-label="Cost + Profit"
                    className="px-0.5 py-2.5 text-right font-semibold tabular-nums"
                  >
                    {formatCompactMoney(values.totalAfterProfit)}
                  </td>
                  <td data-label="VAT + Tax" className="px-0.5 py-2 text-right tabular-nums">
                    {activeCell === `${item.id}:vatTax` ? (
                      <div className="flex items-center gap-px">
                        <input
                          autoFocus
                          className={`${inputClass} px-0 text-right`}
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          aria-label={`VAT percentage for ${item.description}`}
                          value={values.isForeign ? item.foreignVatPercent : item.localVatPercent}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            onChange(
                              item.id,
                              values.isForeign
                                ? { foreignVatPercent: event.target.value }
                                : { localVatPercent: event.target.value },
                            )
                          }
                          onKeyDown={finishCellEdit}
                        />
                        <span className="text-biz-muted">+</span>
                        <input
                          className={`${inputClass} px-0 text-right`}
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          aria-label={`Tax percentage for ${item.description}`}
                          value={values.isForeign ? item.foreignTaxPercent : item.localTaxPercent}
                          onFocus={(event) => event.currentTarget.select()}
                          onChange={(event) =>
                            onChange(
                              item.id,
                              values.isForeign
                                ? { foreignTaxPercent: event.target.value }
                                : { localTaxPercent: event.target.value },
                            )
                          }
                          onBlur={finishAndSave}
                          onKeyDown={finishCellEdit}
                        />
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="flex w-full cursor-text flex-col items-end rounded px-0.5 py-1 text-right hover:bg-blue-50 hover:text-biz-blue"
                        title={`VAT ${values.preview.selectedVatPercent.toFixed(0)}% + Tax ${values.preview.selectedTaxPercent.toFixed(0)}% — click to edit`}
                        onClick={() => beginCellEdit(`${item.id}:vatTax`)}
                      >
                        <span className="text-[10px] font-semibold leading-tight text-biz-text xl:text-[11px]">
                          {formatCompactMoney(values.vatTax)}
                        </span>
                        <span className="mt-1 inline-flex whitespace-nowrap rounded-md bg-slate-100 px-1.5 py-1 text-[9px] font-bold leading-none text-slate-600 ring-1 ring-inset ring-slate-200">
                          {values.preview.selectedVatPercent.toFixed(0)}% +{" "}
                          {values.preview.selectedTaxPercent.toFixed(0)}%
                        </span>
                      </button>
                    )}
                  </td>
                  <td
                    data-label="Grand Total"
                    className="px-0.5 py-2.5 text-right font-bold tabular-nums text-biz-blue"
                  >
                    {formatCompactMoney(values.preview.selectedGrandTotal)}
                  </td>
                  <td
                    data-label="Quoted Unit Price"
                    className="px-0.5 py-2.5 text-right font-semibold tabular-nums text-biz-blue"
                  >
                    {formatCompactMoney(values.preview.unitSalesPrice)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr className="costing-totals-row border-t-2 border-biz-border bg-biz-bg/70">
              <td colSpan={3} />
              <td className="bg-biz-bg px-0.5 py-2 text-right font-bold tabular-nums text-biz-text">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.quantity))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    Total Qty
                  </span>
                </div>
              </td>
              <td colSpan={2} />
              <td className="bg-biz-bg px-0.5 py-2 text-right font-bold tabular-nums text-biz-navy">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.baseTotal))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    Product Total
                  </span>
                </div>
              </td>
              <td />
              <td className="bg-biz-bg px-0.5 py-2 text-right font-bold tabular-nums text-biz-text">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.totalWeight))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    Total Weight
                  </span>
                </div>
              </td>
              <td className="bg-biz-warning/10 px-0.5 py-2 text-right font-bold tabular-nums text-biz-navy">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.shipping))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    Shipping
                  </span>
                </div>
              </td>
              <td className="bg-biz-warning/10 px-0.5 py-2 text-right font-bold tabular-nums text-biz-navy">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.landing))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    Landing
                  </span>
                </div>
              </td>
              <td className="bg-biz-success/10 px-0.5 py-2 text-right font-bold tabular-nums text-biz-success">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.profit))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    Profit
                  </span>
                </div>
              </td>
              <td className="bg-biz-blue/5 px-0.5 py-2 text-right font-bold tabular-nums text-biz-blue">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.totalAfterProfit))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    Cost + Profit
                  </span>
                </div>
              </td>
              <td className="bg-biz-warning/10 px-0.5 py-2 text-right font-bold tabular-nums text-biz-warning">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.vatTax))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    VAT + TAX
                  </span>
                </div>
              </td>
              <td className="bg-biz-blue/10 px-0.5 py-2 text-right font-bold tabular-nums text-biz-blue">
                <div className="flex min-h-[32px] flex-col items-end justify-center gap-1 leading-none">
                  <span>{formatCompactMoney(roundMoney(totals.grandTotal))}</span>
                  <span className="whitespace-nowrap text-[7px] font-semibold uppercase tracking-wide text-biz-muted">
                    Grand Total
                  </span>
                </div>
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function moveAcrossCostingRow(event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

  const current = event.currentTarget;
  if (
    (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
    current instanceof HTMLInputElement &&
    current.type !== "number"
  ) {
    const selectionStart = current.selectionStart ?? 0;
    const selectionEnd = current.selectionEnd ?? selectionStart;
    if (event.key === "ArrowLeft" && (selectionStart > 0 || selectionEnd > 0)) return;
    if (
      event.key === "ArrowRight" &&
      (selectionStart < current.value.length || selectionEnd < current.value.length)
    ) {
      return;
    }
  }

  const row = current.closest<HTMLElement>("[data-costing-row]");
  if (!row) return;

  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    const column = current.dataset.costingColumn;
    const rowContainer = row.parentElement;
    if (!column || !rowContainer) return;

    const rows = Array.from(rowContainer.querySelectorAll<HTMLElement>("[data-costing-row]"));
    const direction = event.key === "ArrowDown" ? 1 : -1;
    let rowIndex = rows.indexOf(row) + direction;
    while (rowIndex >= 0 && rowIndex < rows.length) {
      const candidateRow = rows[rowIndex];
      if (!candidateRow) break;
      const candidate = Array.from(
        candidateRow.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
          "[data-costing-field]:not(:disabled)",
        ),
      ).find((field) => field.dataset.costingColumn === column);
      if (candidate) {
        event.preventDefault();
        candidate.focus();
        return;
      }
      rowIndex += direction;
    }
    return;
  }

  const fields = Array.from(
    row.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
      "[data-costing-field]:not(:disabled)",
    ),
  );
  const currentIndex = fields.indexOf(current);
  const nextIndex = event.key === "ArrowRight" ? currentIndex + 1 : currentIndex - 1;
  const next = fields[nextIndex];
  if (!next) return;

  event.preventDefault();
  next.focus();
}

function CostingColumnHeader({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <span
      className="flex min-h-12 min-w-0 items-center whitespace-normal break-normal px-1 text-[9px] font-bold leading-[12px] text-white antialiased [hyphens:none] [overflow-wrap:normal]"
      title={`${label}${required ? " (Required)" : ""}`}
    >
      <span className="min-w-0">
        {label}{" "}
        {required ? (
          <span className="text-[10px] font-black leading-none text-[#FF3B30]">*</span>
        ) : null}
      </span>
    </span>
  );
}

function ForeignBatchTable({
  items,
  saving,
  settings,
  onChange,
  onShippingMethodChange,
  lcContainerFee,
  lcContainerAllocationMethod,
  lcProductCount,
  onValidationBlocked,
  onContainerFeeRequired,
  onSaveAll,
}: {
  items: CostingItemForm[];
  saving: boolean;
  settings: React.ReactNode;
  onChange: (id: string, patch: Partial<CostingItemForm>) => void;
  onShippingMethodChange: (
    item: CostingItemForm,
    shippingMethod: TenderCostingShippingMethod,
  ) => void;
  lcContainerFee: string;
  lcContainerAllocationMethod: TenderCostingLcAllocationMethod;
  lcProductCount: number;
  onValidationBlocked: () => void;
  onContainerFeeRequired: () => void;
  onSaveAll: () => void;
}) {
  const tableRef = React.useRef<HTMLDivElement | null>(null);
  const [validationAttempted, setValidationAttempted] = React.useState(false);
  const batchLandedCost = items.reduce(
    (total, item) => total + calculateItemPreview(item).foreignLanded,
    0,
  );
  const validationIssues = items.flatMap((item) =>
    foreignCostingInputIssues(item).map((issue) => ({ ...issue, itemId: item.id })),
  );
  const firstValidationIssue = validationIssues[0];
  const currencies = Array.from(new Set(items.map((item) => item.foreignCurrency).filter(Boolean)));
  const foreignCurrencyLabel = currencies.length === 1 ? currencies[0] : "Foreign Currency";
  const allItemsUseLc =
    items.length > 0 && items.every((item) => item.foreignShippingMethod.startsWith("LC_"));
  const allItemsUseDoorToDoor =
    items.length > 0 && items.every((item) => !item.foreignShippingMethod.startsWith("LC_"));
  const logisticsColumnHeaders = allItemsUseLc
    ? [
        { label: "Bank LC Fee" },
        { label: "Agent Fee" },
        { label: "Container Fee" },
        { label: "C&F Charge" },
        { label: "Local Transport" },
        { label: "Project Transport" },
        { label: "Other Cost" },
        { label: "Landed Cost" },
      ]
    : allItemsUseDoorToDoor
      ? [
          { label: `Transport (${foreignCurrencyLabel})` },
          { label: "Unit Weight (KG)", required: true },
          { label: "Rate (BDT/KG)", required: true },
          { label: "Shipping (BDT)" },
          { label: "Local Transport" },
          { label: "Project Transport" },
          { label: "Other Cost" },
          { label: "Landed Cost" },
        ]
      : [
          { label: "Transport / Bank LC" },
          { label: "Unit Weight / Agent Fee" },
          { label: "Rate / Container" },
          { label: "Shipping / C&F" },
          { label: "Local Transport" },
          { label: "Project Transport" },
          { label: "Other Cost" },
          { label: "Landed Cost" },
        ];

  function saveAllRows() {
    if (items.some(isLcForeignCostingItem) && Number(lcContainerFee) <= 0) {
      onValidationBlocked();
      onContainerFeeRequired();
      return;
    }
    if (firstValidationIssue) {
      onValidationBlocked();
      setValidationAttempted(true);
      window.setTimeout(() => {
        const row = Array.from(
          tableRef.current?.querySelectorAll<HTMLElement>("[data-costing-row]") ?? [],
        ).find((candidate) => candidate.dataset.costingRowId === firstValidationIssue.itemId);
        const field = row?.querySelector<HTMLInputElement | HTMLSelectElement>(
          `[data-costing-column="${firstValidationIssue.column}"]`,
        );
        row?.scrollIntoView({ behavior: "smooth", block: "center" });
        field?.focus();
      }, 0);
      return;
    }

    setValidationAttempted(false);
    onSaveAll();
  }

  return (
    <div
      ref={tableRef}
      className="overflow-hidden rounded-lg border border-biz-border bg-biz-surface shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-3 py-2.5">
        <div>
          <h3 className="text-[14px] font-semibold text-biz-text">Foreign Product Costing</h3>
        </div>
        <span className="rounded-full bg-biz-bg px-2.5 py-1 text-[10px] font-semibold text-biz-muted">
          {items.length} {items.length === 1 ? "product" : "products"}
        </span>
      </div>
      {settings}
      {lcProductCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-warning/25 bg-biz-warning/5 px-3 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-biz-warning/15 font-bold text-biz-warning">
              LC
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-biz-text">LC Container Cost</p>
              <p className="truncate text-[9.5px] text-biz-muted">
                {lcProductCount} {lcProductCount === 1 ? "product" : "products"} ·{" "}
                {lcAllocationLabel(lcContainerAllocationMethod)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <strong className="text-[12px] text-biz-text">
              BDT {formatCompactMoney(Number(lcContainerFee) || 0)}
            </strong>
          </div>
        </div>
      )}

      <div className="foreign-costing-sheet overflow-x-hidden">
        <div className="w-full min-w-0">
          <div className="foreign-costing-header flex w-full min-w-0 gap-0 border-b border-[#25549B] bg-[#2F66BC]">
            <div className="foreign-costing-core min-w-0 basis-[20%] bg-[#2F66BC]">
              <div className="foreign-costing-columns grid grid-cols-[0.3fr_1.35fr_0.7fr_0.55fr] gap-0">
                {["SL", "Product / Work", "Quantity", "Unit"].map((label) => (
                  <CostingColumnHeader key={label} label={label} />
                ))}
              </div>
            </div>
            <div className="min-w-0 basis-[40%]">
              <div className="foreign-costing-columns grid grid-cols-[1.15fr_0.85fr_0.85fr_0.75fr_0.75fr_0.9fr_1.3fr_0.85fr] gap-0">
                {[
                  { label: "Supplier" },
                  { label: `Unit Price (${foreignCurrencyLabel})`, required: true },
                  { label: "Unit Price (BDT)" },
                  { label: `Total (${foreignCurrencyLabel})` },
                  { label: "Currency", required: true },
                  { label: "Exchange Rate", required: true },
                  { label: "Shipping Method", required: true },
                  { label: "Product Cost (BDT)" },
                ].map(({ label, required }) => (
                  <CostingColumnHeader key={label} label={label} required={required} />
                ))}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="foreign-costing-columns grid grid-cols-[1fr_0.8fr_0.85fr_0.85fr_0.95fr_1.1fr_0.8fr_0.9fr] gap-0">
                {logisticsColumnHeaders.map(({ label, required }) => (
                  <CostingColumnHeader key={label} label={label} required={required} />
                ))}
              </div>
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-col divide-y divide-biz-border">
            {items.map((item, index) => {
              const preview = calculateItemPreview(item);
              const currency = item.foreignCurrency || "USD";
              const isLc = item.foreignShippingMethod.startsWith("LC_");
              const invalidColumns = new Set(
                validationAttempted
                  ? foreignCostingInputIssues(item).map((issue) => issue.column)
                  : [],
              );

              return (
                <section
                  key={`${item.id}-${index}`}
                  data-costing-row
                  data-costing-row-id={item.id}
                  className={`foreign-costing-row bg-white ${invalidColumns.size > 0 ? "bg-biz-danger/[0.025]" : ""}`}
                >
                  <div className="flex min-w-0 items-stretch gap-0 [&_label>span]:hidden">
                    <div className="foreign-costing-core min-w-0 basis-[20%] bg-white">
                      <div className="foreign-costing-columns grid h-full grid-cols-[0.3fr_1.35fr_0.7fr_0.55fr] gap-0">
                        <div>
                          <span className="sr-only">SL</span>
                          <strong className="flex h-7 items-center text-[9px] text-biz-text">
                            {item.sourceItemNo || index + 1}
                          </strong>
                        </div>
                        <div>
                          <span className="sr-only">Product Name</span>
                          <strong
                            className="line-clamp-2 h-7 text-[9px] font-semibold leading-[14px] text-biz-text"
                            title={item.description}
                          >
                            {item.description}
                          </strong>
                        </div>
                        <div>
                          <span className="sr-only">Quantity</span>
                          <strong className="flex h-7 items-center text-[9px] text-biz-text">
                            {item.quantity}
                          </strong>
                        </div>
                        <div>
                          <span className="sr-only">Unit</span>
                          <strong className="flex h-7 items-center text-[9px] text-biz-text">
                            {item.unit}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 basis-[40%]">
                      <div className="foreign-costing-columns grid h-full grid-cols-[1.15fr_0.85fr_0.85fr_0.75fr_0.75fr_0.9fr_1.3fr_0.85fr] gap-0">
                        <MiniField label="Supplier">
                          <TextInput
                            data-costing-field
                            data-costing-column="supplier"
                            className="h-7 rounded-sm px-1 text-[8.5px]"
                            placeholder="Optional"
                            value={item.foreignSupplierName}
                            onChange={(event) =>
                              onChange(item.id, { foreignSupplierName: event.target.value })
                            }
                            onKeyDown={moveAcrossCostingRow}
                          />
                        </MiniField>
                        <MiniField label={`Unit/FX (${currency})`} required>
                          <BatchNumberInput
                            column="unit-fx"
                            hasError={invalidColumns.has("unit-fx")}
                            value={item.foreignUnitPrice}
                            onChange={(value) => onChange(item.id, { foreignUnitPrice: value })}
                          />
                        </MiniField>
                        <MiniField label="Unit/BDT">
                          <ReadOnlyCostValue
                            value={formatCompactMoney(preview.foreignUnitValueBdt)}
                          />
                        </MiniField>
                        <MiniField label={`Total/${currency}`}>
                          <ReadOnlyCostValue
                            value={formatCompactMoney(preview.foreignProductTotal)}
                          />
                        </MiniField>
                        <MiniField label="Currency" required>
                          <SelectInput
                            data-costing-field
                            data-costing-column="currency"
                            aria-invalid={invalidColumns.has("currency")}
                            className={`h-7 rounded-sm px-1 pr-4 text-[8px] ${invalidColumns.has("currency") ? "border-biz-danger ring-1 ring-biz-danger/20 focus:ring-biz-danger/30" : ""}`}
                            value={item.foreignCurrency}
                            options={CURRENCY_OPTIONS}
                            onChange={(event) =>
                              onChange(item.id, { foreignCurrency: event.target.value })
                            }
                            onKeyDown={moveAcrossCostingRow}
                          />
                        </MiniField>
                        <MiniField label="FX Rate" required>
                          <BatchNumberInput
                            column="fx-rate"
                            hasError={invalidColumns.has("fx-rate")}
                            value={item.foreignExchangeRate}
                            onChange={(value) => onChange(item.id, { foreignExchangeRate: value })}
                          />
                        </MiniField>
                        <MiniField label="Shipping" required>
                          <SelectInput
                            data-costing-field
                            data-costing-column="shipping-method"
                            aria-invalid={invalidColumns.has("shipping-method")}
                            className={`h-7 rounded-sm px-1 pr-4 text-[8px] ${invalidColumns.has("shipping-method") ? "border-biz-danger ring-1 ring-biz-danger/20 focus:ring-biz-danger/30" : ""}`}
                            value={item.foreignShippingMethod}
                            options={SHIPPING_METHOD_OPTIONS}
                            onChange={(event) => {
                              const shippingMethod = event.target
                                .value as TenderCostingShippingMethod;
                              onShippingMethodChange(item, shippingMethod);
                            }}
                            onKeyDown={moveAcrossCostingRow}
                          />
                        </MiniField>
                        <MiniField label="Product BDT">
                          <ReadOnlyCostValue
                            value={formatCompactMoney(preview.foreignProductValue)}
                          />
                        </MiniField>
                      </div>
                    </div>

                    {isLc ? (
                      <div className="min-w-0 flex-1">
                        <div className="foreign-costing-columns grid h-full grid-cols-[1fr_0.8fr_0.85fr_0.85fr_0.95fr_1.1fr_0.8fr_0.9fr] gap-0">
                          <MiniField label="Bank LC">
                            <BatchNumberInput
                              column="cost-1"
                              value={item.bankLcCharge}
                              onChange={(value) => onChange(item.id, { bankLcCharge: value })}
                            />
                          </MiniField>
                          <MiniField label="Agent Fee">
                            <BatchNumberInput
                              column="cost-2"
                              value={item.portHandlingCharge}
                              onChange={(value) => onChange(item.id, { portHandlingCharge: value })}
                            />
                          </MiniField>
                          <MiniField label="Container">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(Number(item.foreignFreightCost) || 0)}
                              emphasized
                            />
                          </MiniField>
                          <MiniField label="C&F">
                            <BatchNumberInput
                              column="cost-4"
                              value={item.cnfCharge}
                              onChange={(value) => onChange(item.id, { cnfCharge: value })}
                            />
                          </MiniField>
                          <MiniField label="Local Transport">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(
                                Number(item.foreignLocalTransportCost) || 0,
                              )}
                            />
                          </MiniField>
                          <MiniField label="Project Transport">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(Number(item.domesticTransportCost) || 0)}
                            />
                          </MiniField>
                          <MiniField label="Other Cost">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(Number(item.foreignOtherCost) || 0)}
                            />
                          </MiniField>
                          <MiniField label="Landed Total">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(preview.foreignLanded)}
                              emphasized
                            />
                          </MiniField>
                        </div>
                      </div>
                    ) : (
                      <div className="min-w-0 flex-1">
                        <div className="foreign-costing-columns grid h-full grid-cols-[1fr_0.8fr_0.85fr_0.85fr_0.95fr_1.1fr_0.8fr_0.9fr] gap-0">
                          <MiniField label={`Transport/${currency}`}>
                            <ReadOnlyCostValue
                              value={formatCompactMoney(Number(item.foreignTransportCharge) || 0)}
                            />
                          </MiniField>
                          <MiniField label="Unit Weight KG" required>
                            <BatchNumberInput
                              column="cost-2"
                              hasError={invalidColumns.has("cost-2")}
                              value={item.shippingWeightKg}
                              onChange={(value) =>
                                onChange(item.id, {
                                  shippingWeightKg: value,
                                  shippingRateBasis: "PER_KG",
                                })
                              }
                            />
                          </MiniField>
                          <MiniField label="Rate/KG" required>
                            <BatchNumberInput
                              column="cost-3"
                              hasError={invalidColumns.has("cost-3")}
                              value={item.shippingRate}
                              onChange={(value) =>
                                onChange(item.id, {
                                  shippingRate: value,
                                  shippingRateBasis: "PER_KG",
                                })
                              }
                            />
                          </MiniField>
                          <MiniField label="Shipping BDT">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(preview.shippingCostBdt)}
                            />
                          </MiniField>
                          <MiniField label="Local Transport">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(
                                Number(item.foreignLocalTransportCost) || 0,
                              )}
                            />
                          </MiniField>
                          <MiniField label="Project Transport">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(Number(item.domesticTransportCost) || 0)}
                            />
                          </MiniField>
                          <MiniField label="Other Cost">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(Number(item.foreignOtherCost) || 0)}
                            />
                          </MiniField>
                          <MiniField label="Landed Total">
                            <ReadOnlyCostValue
                              value={formatCompactMoney(preview.foreignLanded)}
                              emphasized
                            />
                          </MiniField>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-biz-border bg-biz-bg px-3 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-right">
            <span className="block text-[9px] font-medium uppercase tracking-wide text-biz-muted">
              Batch Landed Cost
            </span>
            <strong className="block text-[13px] text-biz-text">
              BDT {formatCompactMoney(batchLandedCost)}
            </strong>
          </div>
          <PrimaryButton className="h-9 whitespace-nowrap" disabled={saving} onClick={saveAllRows}>
            <CheckCircle2 className="h-4 w-4" />
            {saving ? "Preparing..." : "Done - Review in BDT"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function BatchNumberInput({
  column,
  hasError = false,
  value,
  placeholder,
  onChange,
}: {
  column: string;
  hasError?: boolean;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextInput
      data-costing-field
      data-costing-column={column}
      aria-invalid={hasError}
      hasError={hasError}
      className={`h-7 min-w-0 rounded-sm px-1 text-right text-[8.5px] ${NUMBER_INPUT_CLASS}`}
      type="number"
      min="0"
      step="any"
      value={value}
      placeholder={placeholder}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={moveAcrossCostingRow}
    />
  );
}

function CostingWorkspaceCard({
  item,
  preview,
  onChange,
  onMarkCosted,
}: {
  item: CostingItemForm;
  preview: ReturnType<typeof calculateItemPreview>;
  onChange: (patch: Partial<CostingItemForm>) => void;
  onMarkCosted: () => void;
}) {
  const showLocal = item.sourcingType !== "FOREIGN";
  const showForeign = item.sourcingType !== "LOCAL";
  return (
    <div className="rounded-lg border border-biz-border bg-biz-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-biz-text">
              {item.description || "Unnamed Product"}
            </h3>
            <StatusBadge
              label={
                SOURCING_OPTIONS.find((option) => option.value === item.sourcingType)?.label ??
                item.sourcingType
              }
              tone="info"
            />
          </div>
          <p className="mt-0.5 text-[10.5px] text-biz-muted">
            {item.quantity || "0"} {item.unit}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {item.sourcingType === "LOCAL_AND_FOREIGN" && (
            <SelectInput
              className="h-9 w-[170px] text-[11px]"
              placeholder="Select final source"
              value={item.selectedSource}
              options={[
                { value: "LOCAL", label: "Select Local" },
                { value: "FOREIGN", label: "Select Foreign" },
              ]}
              onChange={(event) =>
                onChange({ selectedSource: event.target.value as TenderCostingSelectedSource })
              }
            />
          )}
          <PrimaryButton className="h-9" onClick={onMarkCosted}>
            <CheckCircle2 className="h-4 w-4" />
            {item.costingStatus === "COSTED" ? "Recalculate" : "Mark Costed"}
          </PrimaryButton>
        </div>
      </div>

      <div
        className={`grid gap-3 p-3 ${showLocal && showForeign ? "xl:grid-cols-2" : "grid-cols-1"}`}
      >
        {showLocal && (
          <div className="rounded-md border border-biz-success/25 bg-biz-success/5 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h4 className="text-[12px] font-semibold text-biz-text">Local Costing</h4>
              <span className="text-[12px] font-bold text-biz-success">
                {formatMoney(preview.localTotal)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <MiniField label="Supplier">
                <TextInput
                  className="h-9 px-2 text-[11px]"
                  value={item.localSupplierName}
                  onChange={(event) => onChange({ localSupplierName: event.target.value })}
                />
              </MiniField>
              <NumberCostField
                required
                clearZeroOnFocus
                label="Unit Price (BDT)"
                value={item.localUnitPrice}
                onChange={(value) => onChange({ localUnitPrice: value })}
              />
              <NumberCostField
                label="Discount %"
                value={item.localDiscountPercent}
                onChange={(value) => onChange({ localDiscountPercent: value })}
              />
              <NumberCostField
                label="VAT %"
                value={item.localVatPercent}
                onChange={(value) => onChange({ localVatPercent: value })}
              />
              <NumberCostField
                label="Tax / AIT %"
                value={item.localTaxPercent}
                onChange={(value) => onChange({ localTaxPercent: value })}
              />
              <NumberCostField
                label="Transport (BDT)"
                value={item.localTransportCost}
                onChange={(value) => onChange({ localTransportCost: value })}
              />
              <NumberCostField
                label="Other Cost (BDT)"
                value={item.localOtherCost}
                onChange={(value) => onChange({ localOtherCost: value })}
              />
            </div>
          </div>
        )}

        {showForeign && (
          <div className="rounded-md border border-biz-purple/25 bg-biz-purple/5 p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-[12px] font-semibold text-biz-text">Foreign Landed Costing</h4>
                <p className="text-[9.5px] text-biz-muted">
                  Product value in BDT: {formatMoney(preview.foreignProductValue)}
                </p>
              </div>
              <span className="text-[12px] font-bold text-biz-purple">
                {formatMoney(preview.foreignLanded)}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              <MiniField label="Supplier">
                <TextInput
                  className="h-9 px-2 text-[11px]"
                  value={item.foreignSupplierName}
                  onChange={(event) => onChange({ foreignSupplierName: event.target.value })}
                />
              </MiniField>
              <MiniField label="Country">
                <TextInput
                  className="h-9 px-2 text-[11px]"
                  value={item.foreignCountry}
                  onChange={(event) => onChange({ foreignCountry: event.target.value })}
                />
              </MiniField>
              <MiniField label="Currency">
                <SelectInput
                  className="h-9 text-[11px]"
                  value={item.foreignCurrency}
                  options={CURRENCY_OPTIONS}
                  onChange={(event) => onChange({ foreignCurrency: event.target.value })}
                />
              </MiniField>
              <NumberCostField
                required
                label="Foreign Unit Price"
                value={item.foreignUnitPrice}
                step="0.0001"
                onChange={(value) => onChange({ foreignUnitPrice: value })}
              />
              <NumberCostField
                required
                label="1 Currency = BDT"
                value={item.foreignExchangeRate}
                step="0.000001"
                onChange={(value) => onChange({ foreignExchangeRate: value })}
              />
              <MiniField label="Rate Date">
                <TextInput
                  type="date"
                  className="h-9 px-2 text-[10px]"
                  value={item.exchangeRateDate}
                  onChange={(event) => onChange({ exchangeRateDate: event.target.value })}
                />
              </MiniField>
              <NumberCostField
                label="Freight / Shipping"
                value={item.foreignFreightCost}
                onChange={(value) => onChange({ foreignFreightCost: value })}
              />
              <NumberCostField
                label="Insurance"
                value={item.foreignInsuranceCost}
                onChange={(value) => onChange({ foreignInsuranceCost: value })}
              />
              <NumberCostField
                label="Customs Duty %"
                value={item.customsDutyPercent}
                onChange={(value) => onChange({ customsDutyPercent: value })}
              />
              <NumberCostField
                label="Regulatory Duty %"
                value={item.regulatoryDutyPercent}
                onChange={(value) => onChange({ regulatoryDutyPercent: value })}
              />
              <NumberCostField
                label="Supplementary Duty %"
                value={item.supplementaryDutyPercent}
                onChange={(value) => onChange({ supplementaryDutyPercent: value })}
              />
              <NumberCostField
                label="VAT %"
                value={item.foreignVatPercent}
                onChange={(value) => onChange({ foreignVatPercent: value })}
              />
              <NumberCostField
                label="Tax / AIT %"
                value={item.foreignTaxPercent}
                onChange={(value) => onChange({ foreignTaxPercent: value })}
              />
              <NumberCostField
                label="C&F Charge"
                value={item.cnfCharge}
                onChange={(value) => onChange({ cnfCharge: value })}
              />
              <NumberCostField
                label="Port / Handling"
                value={item.portHandlingCharge}
                onChange={(value) => onChange({ portHandlingCharge: value })}
              />
              <NumberCostField
                label="Bank / LC Charge"
                value={item.bankLcCharge}
                onChange={(value) => onChange({ bankLcCharge: value })}
              />
              <NumberCostField
                label="Local Transport"
                value={item.foreignLocalTransportCost}
                onChange={(value) => onChange({ foreignLocalTransportCost: value })}
              />
              <NumberCostField
                label="Other Cost"
                value={item.foreignOtherCost}
                onChange={(value) => onChange({ foreignOtherCost: value })}
              />
            </div>
          </div>
        )}
      </div>
      {showLocal && showForeign && (
        <div className="grid grid-cols-3 border-t border-biz-border bg-biz-bg/60 text-center text-[10.5px]">
          <div className="p-2">
            Local: <strong>{formatMoney(preview.localTotal)}</strong>
          </div>
          <div className="border-x border-biz-border p-2">
            Foreign: <strong>{formatMoney(preview.foreignLanded)}</strong>
          </div>
          <div className="p-2">
            Difference:{" "}
            <strong>{formatMoney(Math.abs(preview.localTotal - preview.foreignLanded))}</strong>
          </div>
        </div>
      )}
    </div>
  );
}

function RequiredMark() {
  return (
    <span className="font-bold text-biz-danger" aria-hidden="true">
      *
    </span>
  );
}

function RequiredRowField({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-0.5">
      <RequiredMark />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function MiniField({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="min-w-0">
      <span
        className="mb-1.5 block min-h-[28px] whitespace-normal text-[11px] font-medium leading-[14px] text-biz-text/75"
        title={label}
      >
        {label} {required && <RequiredMark />}
      </span>
      {children}
    </label>
  );
}

function NumberCostField({
  label,
  required = false,
  clearZeroOnFocus = false,
  value,
  step = "any",
  onChange,
}: {
  label: string;
  required?: boolean;
  clearZeroOnFocus?: boolean;
  value: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <MiniField label={label} required={required}>
      <TextInput
        type="number"
        min={required ? "0.000001" : "0"}
        step={step}
        required={required}
        aria-invalid={required && Number(value) <= 0}
        className={`h-9 min-w-0 px-2 text-[10.5px] ${NUMBER_INPUT_CLASS} ${
          required && Number(value) <= 0
            ? "border-biz-danger focus:border-biz-danger focus:ring-biz-danger/20"
            : ""
        }`}
        value={value}
        onFocus={(event) => {
          if (clearZeroOnFocus && Number(value) === 0) {
            onChange("");
            return;
          }
          event.currentTarget.select();
        }}
        onChange={(event) => onChange(event.target.value)}
      />
    </MiniField>
  );
}

function ReadOnlyCostValue({ value, emphasized = false }: { value: string; emphasized?: boolean }) {
  return (
    <div
      title={value}
      className={`foreign-readonly-value flex h-7 items-center justify-end overflow-hidden rounded-sm border border-biz-border bg-biz-bg px-1 text-[8.5px] ${
        emphasized ? "font-semibold text-biz-text" : "font-medium text-biz-text"
      }`}
    >
      {value}
    </div>
  );
}

function BulkForeignNumber({
  label,
  required = false,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <MiniField label={label} required={required}>
      <TextInput
        type="number"
        min="0"
        step="any"
        className={`h-9 min-w-0 px-1.5 text-[10px] ${NUMBER_INPUT_CLASS}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </MiniField>
  );
}

function ForeignBatchCostInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <MiniField label={label}>
      <TextInput
        type="number"
        min="0"
        step="any"
        className={`h-9 min-w-0 px-2 text-[10px] ${NUMBER_INPUT_CLASS}`}
        placeholder="0.00"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </MiniField>
  );
}

function Field({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-biz-muted">
        {label} {required && <RequiredMark />}
      </span>
      {children}
      {error && <span className="text-[11px] text-biz-danger">{error}</span>}
    </label>
  );
}

function CostingKpi({
  label,
  value,
  tooltip,
  tone = "default",
  action,
  className = "",
}: {
  label: string;
  value: string;
  tooltip?: string;
  tone?: "default" | "blue" | "success" | "danger" | "warning";
  action?: React.ReactNode;
  className?: string;
}) {
  const valueTone =
    tone === "blue"
      ? "text-biz-blue"
      : tone === "success"
        ? "text-biz-success"
        : tone === "danger"
          ? "text-biz-danger"
          : tone === "warning"
            ? "text-biz-warning"
            : "text-biz-text";
  return (
    <div
      className={`group relative min-w-0 rounded-lg border px-3 py-2.5 shadow-card transition-shadow hover:z-30 hover:shadow-card-hover ${
        tone === "warning"
          ? "border-biz-warning/30 bg-gradient-to-br from-white to-biz-warning/5"
          : tone === "blue"
            ? "border-blue-200/80 bg-gradient-to-br from-white to-blue-50/70"
            : tone === "success"
              ? "border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/70"
              : "border-biz-border bg-biz-surface"
      } ${className}`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-0.5 ${tone === "success" ? "bg-emerald-500" : tone === "blue" ? "bg-biz-blue" : tone === "warning" ? "bg-biz-warning" : "bg-slate-200"}`}
      />
      <div className="flex min-w-0 items-start justify-between gap-2">
        <p
          className="min-w-0 whitespace-normal text-[9px] font-bold uppercase leading-tight tracking-[0.04em] text-slate-500 xl:text-[10px] 2xl:text-[11px]"
          title={label}
        >
          {label}
        </p>
        {action}
      </div>
      <p
        className={`mt-1.5 truncate text-[11px] font-bold tabular-nums xl:text-[12px] 2xl:text-[14px] ${valueTone}`}
        title={tooltip ?? value}
      >
        {value}
      </p>
      {tooltip ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-[calc(100%+0.4rem)] z-50 hidden w-max max-w-[min(28rem,80vw)] -translate-x-1/2 whitespace-normal rounded-md bg-slate-900 px-2.5 py-1.5 text-center text-[10px] font-medium normal-case leading-4 text-white shadow-lg group-hover:block"
        >
          {tooltip}
        </span>
      ) : null}
    </div>
  );
}

function ProfitAction({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Edit common profit, VAT and tax settings"
      title="Edit profit, VAT and tax settings"
      className="flex h-6 shrink-0 items-center justify-center rounded-md border border-biz-blue/30 bg-white px-2 text-[8px] font-bold text-biz-blue shadow-sm transition-colors hover:border-biz-blue hover:bg-biz-blue-soft sm:h-7 sm:text-[9px]"
      onClick={onClick}
    >
      Edit
    </button>
  );
}

function CostedColumnHeader({
  label,
  unit,
  align = "right",
}: {
  label: string;
  unit?: string;
  align?: "left" | "right";
}) {
  return (
    <span
      className={`flex min-h-8 min-w-0 flex-col justify-start gap-0.5 whitespace-normal leading-[1.05] ${align === "right" ? "items-end text-right" : "items-start text-left"}`}
      title={unit ? `${label} (${unit})` : label}
    >
      <span className="whitespace-nowrap text-[8px] font-bold text-slate-700 2xl:text-[9px]">
        {label}
      </span>
      {unit ? (
        <span className="text-[7px] font-semibold tracking-wide text-slate-500 2xl:text-[8px]">
          {unit}
        </span>
      ) : null}
    </span>
  );
}
