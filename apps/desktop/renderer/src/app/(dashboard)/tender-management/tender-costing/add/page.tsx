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
  MoreVertical,
  Plus,
  Save,
  Trash2,
  UploadCloud,
  X,
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

type PendingLcAction =
  | { kind: "ITEM"; itemId: string; shippingMethod: TenderCostingShippingMethod }
  | {
      kind: "BULK_SELECTION";
      previousShippingMethod: TenderCostingShippingMethod;
      shippingMethod: TenderCostingShippingMethod;
    }
  | { kind: "BULK_APPLY" }
  | null;

let itemCounter = 0;
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
          foreignTransportCharge: "",
          foreignFreightCost: "",
          cnfCharge: "",
          portHandlingCharge: "",
          bankLcCharge: "",
          foreignLocalTransportCost: "",
          domesticTransportCost: "",
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
  itemCounter += 1;
  return {
    id: `costing-item-${itemCounter}`,
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
  return `BDT ${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function costingImportKey(item: Pick<CostingItemForm, "description" | "unit" | "quantity">) {
  return [
    item.description.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ""),
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
  const shippingCostBdt = shippingWeightKg * shippingRate;
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
    (Number(item.bankLcCharge) || 0) +
    (Number(item.portHandlingCharge) || 0) +
    (Number(item.foreignFreightCost) || 0) +
    (Number(item.cnfCharge) || 0) +
    (Number(item.foreignLocalTransportCost) || 0) +
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
  | "unit-fx"
  | "currency"
  | "fx-rate"
  | "shipping-method"
  | "cost-2"
  | "cost-3";

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
  const [success, setSuccess] = React.useState<{ title: string; message: string } | null>(null);
  const hydratedId = React.useRef<string | undefined>(undefined);
  const costingPdfInputRef = React.useRef<HTMLInputElement | null>(null);
  const intakeSectionRef = React.useRef<HTMLDivElement | null>(null);
  const costingWorkspaceRef = React.useRef<HTMLDivElement | null>(null);
  const costedItemsListRef = React.useRef<HTMLDivElement | null>(null);

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
            localVatPercent:
              compactInputNumber(item.localVatPercent, true) || DEFAULT_VAT_PERCENT,
            localTaxPercent:
              compactInputNumber(item.localTaxPercent, true) || DEFAULT_TAX_PERCENT,
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
    setLcContainerAllocationMethod(
      record.lcContainerAllocationMethod,
    );
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
            exchangeRate:
              usesUnusedLegacyChinaDefaults
                ? DEFAULT_CNY_TO_BDT_RATE
                : Number(firstForeignItem.foreignExchangeRate) > 0
                ? compactInputNumber(firstForeignItem.foreignExchangeRate, true)
                : DEFAULT_CNY_TO_BDT_RATE,
            exchangeRateDate: usesUnusedLegacyChinaDefaults
              ? localDate()
              : firstForeignItem.exchangeRateDate?.slice(0, 10) ?? localDate(),
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

  React.useEffect(() => {
    if (!foreignCostingNotice) return;
    const timer = window.setTimeout(() => setForeignCostingNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [foreignCostingNotice]);

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
    setLcContainerEditorOpen(true);
  }

  function closeLcContainerEditor() {
    if (pendingLcAction?.kind === "BULK_SELECTION") {
      setBulkForeign((current) => ({
        ...current,
        shippingMethod: pendingLcAction.previousShippingMethod,
      }));
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
    setItems(
      allocateLcContainerFee(candidateItems, normalizedFeeInput, lcAllocationMethodDraft),
    );
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

  function applyCommonForeignValues(item: CostingItemForm): CostingItemForm {
    const isLc = bulkForeign.shippingMethod.startsWith("LC_");
    const preserveLcCharges = isLc && item.foreignShippingMethod.startsWith("LC_");
    const keepEditedRate =
      !isLc &&
      item.shippingRateBasis === "PER_KG" &&
      item.foreignShippingMethod === bulkForeign.shippingMethod &&
      Number(item.shippingRate) > 0;
    return {
      ...item,
      foreignCountry: bulkForeign.country,
      foreignCurrency: bulkForeign.currency,
      foreignExchangeRate: bulkForeign.exchangeRate,
      exchangeRateDate: bulkForeign.exchangeRateDate,
      foreignShippingMethod: bulkForeign.shippingMethod,
      shippingRateBasis: defaultShippingRateBasis(bulkForeign.shippingMethod),
      shippingRate: keepEditedRate
        ? item.shippingRate
        : defaultShippingRate(bulkForeign.shippingMethod),
      shippingWeightKg: isLc ? "" : item.shippingWeightKg,
      foreignTransportCharge: isLc ? "" : item.foreignTransportCharge,
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
      domesticTransportCost: isLc ? "" : item.domesticTransportCost,
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

    if (selectedFiles.length > 10) {
      setCostingPdfError("Select up to 10 BOQ PDF files at a time.");
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
          description: row.description,
          unit: row.unit ?? "Nos",
          quantity: row.quantity === undefined ? "" : String(row.quantity),
        });
        if (existingKeys.has(key)) {
          existingDuplicatesSkipped += 1;
          return [];
        }
        existingKeys.add(key);

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
            unit: row.unit ?? templateItem.unit ?? "Nos",
            quantity:
              row.quantity === undefined ? "" : compactInputNumber(String(row.quantity), true),
            marginPercent:
              templateItem.sourcingType === "FOREIGN"
                ? foreignTargetMargin
                : localTargetMargin,
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
        ...(duplicateCount > 0 ? [`${duplicateCount} duplicate${duplicateCount === 1 ? "" : "s"} skipped`] : []),
        ...(failedFiles > 0 ? [`${failedFiles} PDF${failedFiles === 1 ? "" : "s"} could not be read`] : []),
      ];
      setCostingPdfNotice(`${details.join(" · ")}. Review the rows before saving.`);
    } catch (error) {
      setCostingPdfError(
        error instanceof ApiError ? error.message : "Could not read the selected BOQ PDF files.",
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
    setActiveCostingIds((current) => new Set([...current, item.id]));
    window.setTimeout(
      () => costingWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function applyBulkForeignSettings() {
    const targetIds = activeCostingIds;
    if (!bulkForeign.country || targetIds.size === 0 || Number(bulkForeign.exchangeRate) <= 0) {
      setSaveError("Select Country and enter a valid Foreign exchange rate first.");
      return;
    }
    const candidateItems = items.map((item) =>
      targetIds.has(item.id) && item.sourcingType === "FOREIGN"
        ? { ...applyCommonForeignValues(item), costingStatus: "DRAFT" as const }
        : item,
    );
    const lcCandidates = candidateItems.filter(isLcForeignCostingItem);
    if (
      lcCandidates.length > 0 &&
      (Number(lcContainerFee) <= 0 ||
        (lcContainerAllocationMethod === "WEIGHT" &&
          lcCandidates.some((item) => Number(item.shippingWeightKg) <= 0)))
    ) {
      openLcContainerEditor({ kind: "BULK_APPLY" });
      return;
    }
    setItems(
      allocateLcContainerFee(candidateItems, lcContainerFee, lcContainerAllocationMethod),
    );
    setSaveError("");
    setIsDirty(true);
  }

  async function saveAllActiveForeignCosting() {
    if (!bulkForeign.country || Number(bulkForeign.exchangeRate) <= 0) {
      setSaveError("Select Country and enter a valid Foreign exchange rate first.");
      return;
    }
    const updatedItems: CostingItemForm[] = items.map((item) =>
      activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN"
        ? {
            ...item,
            selectedSource: "FOREIGN",
            costingStatus: "DRAFT",
          }
        : item,
    );
    const targetItems = updatedItems.filter(
      (item) => activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN",
    );
    if (targetItems.some(isLcForeignCostingItem) && Number(lcContainerFee) <= 0) {
      openLcContainerEditor();
      return;
    }
    const validationError = targetItems
      .map((item) => foreignCostingValidationError(item))
      .find((message): message is string => Boolean(message));
    if (targetItems.length === 0 || validationError) {
      setSaveError(validationError ?? "No Foreign item is open for costing.");
      return;
    }
    const isCompletedEdit = costing.data?.status === "COMPLETED";
    const persistedItems = isCompletedEdit
      ? updatedItems.map((item) =>
          targetItems.some((target) => target.id === item.id)
            ? { ...item, costingStatus: "COSTED" as const }
            : item,
        )
      : updatedItems;
    const saved = await save(isCompletedEdit ? "COMPLETED" : "IN_PROGRESS", persistedItems, {
      showSuccess: false,
    });
    if (!saved) return;
    if (isCompletedEdit && costing.data) hydratedId.current = costing.data.id;
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
    setSaveError("");
    setForeignCostingNotice(
      "Foreign costing saved. Add Profit, VAT and Tax in Costing Items Intake, then click Save All.",
    );
    setIsDirty(isCompletedEdit);
    window.setTimeout(
      () => intakeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  async function saveAllPricing() {
    const pricingReadyItems = items.filter(
      (item) =>
        item.sourcingType === "FOREIGN" &&
        item.costingStatus === "DRAFT" &&
        !activeCostingIds.has(item.id),
    );
    if (pricingReadyItems.length === 0) {
      setSaveError("Save Foreign Costing first, then add Profit, VAT and Tax.");
      return;
    }
    const validationError = pricingReadyItems
      .map((item) => foreignCostingValidationError(item))
      .find((message): message is string => Boolean(message));
    if (validationError) {
      setSaveError(validationError);
      return;
    }
    const pricingReadyIds = new Set(pricingReadyItems.map((item) => item.id));
    const updatedItems: CostingItemForm[] = items.map((item) =>
      pricingReadyIds.has(item.id) ? { ...item, costingStatus: "COSTED" } : item,
    );
    const allItemsCosted = updatedItems.every((item) => item.costingStatus === "COSTED");
    const nextStatus = allItemsCosted ? "COMPLETED" : "IN_PROGRESS";
    const saved = await save(nextStatus, updatedItems, { showSuccess: false });
    if (!saved) return;
    setItems(updatedItems);
    setSelectedItemIds((current) => {
      const next = new Set(current);
      pricingReadyItems.forEach((item) => next.delete(item.id));
      return next;
    });
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      pricingReadyItems.forEach((item) => next.delete(item.id));
      return next;
    });
    setForeignCostingNotice(
      `${pricingReadyItems.length} foreign item(s) moved to Costed Items List.`,
    );
    setSaveError("");
    setIsDirty(false);
    window.setTimeout(
      () => costedItemsListRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  async function saveAllLocalCosting() {
    const localItemsToSave = items.filter(
      (item) => item.sourcingType === "LOCAL" && item.costingStatus !== "COSTED",
    );
    if (localItemsToSave.length === 0) return;

    const firstIncompleteLocalItem = localItemsToSave
      .map((item) => {
        const missingFields: string[] = [];
        if (!item.costingDate) missingFields.push("Costing Date");
        if (!preparedByForItem(item)) missingFields.push("Prepared By");
        if (!item.description.trim()) missingFields.push("Product Name");
        if (!item.unit.trim()) missingFields.push("Unit");
        if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
          missingFields.push("Quantity");
        }
        if (!Number.isFinite(Number(item.localUnitPrice)) || Number(item.localUnitPrice) <= 0) {
          missingFields.push("Unit Price");
        }
        return { item, missingFields };
      })
      .find(({ missingFields }) => missingFields.length > 0);
    if (firstIncompleteLocalItem) {
      const rowNumber = items.findIndex((item) => item.id === firstIncompleteLocalItem.item.id) + 1;
      setSaveError(
        `Local row ${rowNumber}: enter ${firstIncompleteLocalItem.missingFields.join(", ")} before saving.`,
      );
      return;
    }

    const localItemIds = new Set(localItemsToSave.map((item) => item.id));
    const updatedItems: CostingItemForm[] = items.map((item) =>
      localItemIds.has(item.id)
        ? {
            ...item,
            selectedSource: "LOCAL",
            costingStatus: "COSTED",
          }
        : item,
    );
    const allItemsCosted = updatedItems.every((item) => item.costingStatus === "COSTED");
    const nextStatus = allItemsCosted ? "COMPLETED" : "IN_PROGRESS";
    const saved = await save(nextStatus, updatedItems, { showSuccess: false });
    if (!saved) return;

    setItems(updatedItems);
    setSelectedItemIds((current) => {
      const next = new Set(current);
      localItemsToSave.forEach((item) => next.delete(item.id));
      return next;
    });
    setSaveError("");
    setIsDirty(false);
    setSuccess({
      title: "Local Costing Saved",
      message: `${localItemsToSave.length} local item(s) saved successfully.`,
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

  function editCostedItem(item: CostingItemForm) {
    const isForeignItem = item.sourcingType === "FOREIGN";
    updateItem(item.id, {
      costingStatus: isForeignItem ? "DRAFT" : "NOT_COSTED",
    });
    setActiveCostingIds((current) => {
      const next = new Set(current);
      next.delete(item.id);
      return next;
    });
    setSelectedItemIds(new Set());
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      if (isForeignItem) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    setSaveError("");
    window.setTimeout(
      () => intakeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function finishCostingItemRemoval(
    itemId: string,
    remainingItems: CostingItemForm[],
    markSaved: boolean,
  ) {
    setItems(remainingItems);
    setSelectedItemIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
    setActiveCostingIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
    setForeignEditReturnIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
      return next;
    });
    setIntakeValidationAttemptedIds((current) => {
      const next = new Set(current);
      next.delete(itemId);
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
    const record = costing.data;
    if (!record || saveCosting.isPending) return;

    const remainingItems = allocateLcContainerFee(
      items.filter((item) => item.id !== itemId),
      lcContainerFee,
      lcContainerAllocationMethod,
    );
    const isPersistedItem = record.items.some((item) => item.id === itemId);
    if (!isPersistedItem) {
      finishCostingItemRemoval(itemId, remainingItems, false);
      return;
    }

    const allRemainingItemsCosted =
      remainingItems.length > 0 &&
      remainingItems.every((item) => item.costingStatus === "COSTED");
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

    finishCostingItemRemoval(itemId, remainingItems, true);
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
    if (validItems.length === 0) nextErrors.items = "Add at least one complete item";
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
    const firstItem = itemsToSave[0]!;
    const firstPreparedByUserId = preparedByForItem(firstItem);
    const selectedUser = options.data?.users.find((user) => user.id === firstPreparedByUserId);
    const payload: SaveTenderCostingInput = {
      version: record.version,
      status,
      costingDate: firstItem.costingDate,
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
      setSaveError(error instanceof ApiError ? error.message : "Could not save tender costing.");
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
  const pendingLocalItems = items.filter(
    (item) => item.sourcingType === "LOCAL" && item.costingStatus !== "COSTED",
  );
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
  const shouldShowStartCosting =
    costingCandidateItems.length > 0 &&
    (pricingReadyItems.length === 0 || foreignEditCandidates.length > 0);
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title text-biz-text">Prepare Tender Costing</h1>
          <p className="mt-0.5 text-[12.5px] text-biz-muted">
            Use live tender data and save server-calculated costing values.
          </p>
        </div>
        <Link href="/tender-management/tender-costing">
          <SecondaryButton>
            <ArrowLeft className="h-4 w-4" />
            Back to Costing List
          </SecondaryButton>
        </Link>
      </div>

      <div className="grid min-w-0 grid-cols-8 gap-1 sm:gap-2">
        <CostingKpi label="Tender ID" value={record.tender.egpTenderId ?? record.tender.id} />
        <CostingKpi label="Product / Work Name" value={record.tender.workName} />
        <CostingKpi
          label="Organization"
          value={record.tender.organizationMaster?.shortName ?? "Not set"}
          tone={record.tender.organizationMaster ? "default" : "warning"}
        />
        <CostingKpi
          label="Total Costing Budget"
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
          label={isPartialCosting ? "Current Estimated Cost" : "Estimated Cost"}
          value={hasCalculatedCost ? formatMoney(estimatedTotal) : "Not calculated"}
        />
        <CostingKpi
          label="Local Profit"
          value={formatMoney(localProfit)}
          tone="success"
          action={
            !isReadOnly ? <ProfitAction onClick={() => setProfitSettingsOpen(true)} /> : undefined
          }
        />
        <CostingKpi
          label="Foreign Profit"
          value={formatMoney(foreignProfit)}
          tone="success"
          action={
            !isReadOnly ? <ProfitAction onClick={() => setProfitSettingsOpen(true)} /> : undefined
          }
        />
        <CostingKpi
          label="Profit Margin"
          value={`${overallProfitMargin.toFixed(2)}%`}
          tone="blue"
          action={
            !isReadOnly ? <ProfitAction onClick={() => setProfitSettingsOpen(true)} /> : undefined
          }
        />
      </div>

      {budgetNotice && (
        <p className="rounded-md bg-biz-success/10 px-3 py-2 text-[11.5px] text-biz-success">
          {budgetNotice}
        </p>
      )}

      <div className="relative">
        <fieldset
          disabled={isReadOnly || !hasCostingBudget}
          className={`m-0 flex min-w-0 flex-col gap-3 border-0 p-0 ${!hasCostingBudget && !isReadOnly ? "opacity-55" : ""}`}
        >
          <div
            ref={intakeSectionRef}
            className="scroll-mt-20 rounded-lg border border-biz-border bg-biz-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
              <div>
                <h2 className="text-[14px] font-semibold text-biz-text">1. Costing Items Intake</h2>
                <p className="text-[11px] text-biz-muted">
                  Add multiple products first; source prices and import charges are entered later.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-biz-muted">
                    Costing Date <RequiredMark />
                  </span>
                  <TextInput
                    className="h-9 w-[145px] px-2 text-[11px]"
                    type="date"
                    value={header.costingDate}
                    onChange={(event) => updateCommonCostingDate(event.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-medium text-biz-muted">
                    Prepared By <RequiredMark />
                  </span>
                  <SelectInput
                    className="h-9 w-[180px] text-[11px]"
                    placeholder="Select user"
                    value={effectivePreparedByUserId}
                    options={(options.data?.users ?? []).map((user) => ({
                      value: user.id,
                      label: user.name,
                    }))}
                    onChange={(event) => updateCommonPreparedBy(event.target.value)}
                  />
                </label>
                <SelectInput
                  className="h-9 w-[170px] text-[11px]"
                  value={sourceFilter}
                  options={SOURCE_FILTER_OPTIONS}
                  onChange={(event) => setSourceFilter(event.target.value)}
                />
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
                <PrimaryButton onClick={addAnotherItem}>
                  <Plus className="h-4 w-4" />
                  Add Another Row
                </PrimaryButton>
              </div>
            </div>
            {costingPdfNotice && (
              <p
                aria-live="polite"
                className="flex items-center gap-2 border-b border-biz-success/20 bg-biz-success/5 px-4 py-2 text-[10.5px] font-medium text-biz-success"
              >
                <FileCheck2 className="h-4 w-4 shrink-0" />
                <span>{costingPdfNotice}</span>
              </p>
            )}
            {costingPdfError && (
              <p
                role="alert"
                className="border-b border-biz-danger/20 bg-biz-danger/5 px-4 py-2 text-[10.5px] font-medium text-biz-danger"
              >
                {costingPdfError}
              </p>
            )}
            <div className="overflow-hidden">
              <table className="w-full table-fixed text-left text-[9px] xl:text-[10px]">
                <thead className="bg-biz-bg text-biz-muted">
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
                    <th className="w-[12%] px-1 py-2">
                      Product Name <RequiredMark />
                    </th>
                    <th className="w-[8%] px-0.5 py-2">Source of Product</th>
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
                    <th className="w-[7%] px-0.5 py-2 text-right">Profit</th>
                    <th className="w-[8%] px-0.5 py-2 text-right">Sub Total</th>
                    <th className="w-[5%] px-0.5 py-2 text-right">VAT</th>
                    <th className="w-[5%] px-0.5 py-2 text-right">Tax</th>
                    <th className="w-[8%] px-0.5 py-2 text-right">Grand Total</th>
                    <th className="w-[8%] px-0.5 py-2 text-right">Unit Sales</th>
                    <th className="w-[9%] px-0.5 py-2 text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item, visibleIndex) => {
                    const originalIndex = items.findIndex((row) => row.id === item.id);
                    const preview = calculateItemPreview(item);
                    const showRequiredErrors = intakeValidationAttemptedIds.has(item.id);
                    const productRequiredError =
                      showRequiredErrors && !item.description.trim();
                    const unitRequiredError = showRequiredErrors && !item.unit.trim();
                    const quantityRequiredError =
                      showRequiredErrors && Number(item.quantity) <= 0;
                    return (
                      <tr
                        key={item.id}
                        data-costing-row
                        data-costing-row-id={item.id}
                        className="border-t border-biz-border"
                      >
                        <td className="px-1 py-2 text-center">
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
                        <td className="px-1 py-2">{visibleIndex + 1}</td>
                        <td className="px-1 py-2">
                          <RequiredRowField>
                            <TextInput
                              data-costing-field
                              data-costing-column="product"
                              aria-invalid={productRequiredError}
                              hasError={productRequiredError}
                              className={`h-9 min-w-0 px-1.5 text-[10px] ${
                                productRequiredError
                                  ? "bg-biz-danger/[0.03] ring-1 ring-biz-danger/20 focus:ring-biz-danger/30"
                                  : ""
                              }`}
                              value={item.description}
                              placeholder="Enter product"
                              onChange={(event) =>
                                updateItem(item.id, {
                                  description: event.target.value,
                                  costingStatus: "NOT_COSTED",
                                })
                              }
                              onKeyDown={moveAcrossCostingRow}
                            />
                          </RequiredRowField>
                        </td>
                        <td className="px-0.5 py-2">
                          <SelectInput
                            data-costing-field
                            data-costing-column="source"
                            className="h-9 min-w-0 px-1 pr-4 text-[9px]"
                            value={item.sourcingType}
                            options={SOURCING_OPTIONS}
                            onChange={(event) => {
                              const sourcingType = event.target.value as TenderCostingSourcingType;
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
                        <td className="px-0.5 py-2">
                          <RequiredRowField>
                            <SelectInput
                              data-costing-field
                              data-costing-column="unit"
                              aria-invalid={unitRequiredError}
                              className={`h-9 min-w-0 px-1 pr-4 text-[9px] xl:text-[10px] ${
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
                        <td className="px-1 py-2">
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
                        <td className="px-0.5 py-2">
                          {item.sourcingType === "LOCAL" ? (
                            <RequiredRowField>
                              <TextInput
                                data-costing-field
                                data-costing-column="unit-price"
                                aria-invalid={Number(item.localUnitPrice) <= 0}
                                className={`h-8 min-w-0 px-1 text-right text-[9px] ${NUMBER_INPUT_CLASS} ${
                                  Number(item.localUnitPrice) <= 0
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
                        <td className="px-0.5 py-2 text-right font-medium text-biz-text">
                          {preview.selectedCostBeforeProfit > 0
                            ? formatCompactMoney(preview.selectedCostBeforeProfit)
                            : "—"}
                        </td>
                        <td className="relative px-0.5 py-2">
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
                        <td className="px-0.5 py-2 text-right font-semibold text-biz-text">
                          {formatCompactMoney(preview.subtotalBeforeTax)}
                        </td>
                        <td className="relative px-0.5 py-2">
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
                              item.sourcingType === "FOREIGN" || item.selectedSource === "FOREIGN"
                                ? item.foreignVatPercent
                                : item.localVatPercent
                            }
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => updateItemRate(item, "VAT", event.target.value)}
                            onKeyDown={moveAcrossCostingRow}
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-biz-muted">
                            %
                          </span>
                        </td>
                        <td className="relative px-0.5 py-2">
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
                              item.sourcingType === "FOREIGN" || item.selectedSource === "FOREIGN"
                                ? item.foreignTaxPercent
                                : item.localTaxPercent
                            }
                            onFocus={(event) => event.currentTarget.select()}
                            onChange={(event) => updateItemRate(item, "TAX", event.target.value)}
                            onKeyDown={moveAcrossCostingRow}
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-biz-muted">
                            %
                          </span>
                        </td>
                        <td className="px-0.5 py-2 text-right font-semibold">
                          {formatCompactMoney(preview.selectedGrandTotal)}
                        </td>
                        <td className="px-0.5 py-2">
                          <span className="block text-right font-medium text-biz-blue">
                            {preview.unitSalesPrice > 0
                              ? formatCompactMoney(preview.unitSalesPrice)
                              : "—"}
                          </span>
                        </td>
                        <td className="px-0.5 py-2 text-center">
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
                                    ? "Edit Foreign Cost"
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
                    <tr className="border-t border-biz-border">
                      <td colSpan={15} className="px-4 py-8 text-center text-[11px] text-biz-muted">
                        {items.length === 0
                          ? "No items added yet."
                          : "No pending items. Add another row or edit an item from the Costed Items List."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-biz-border px-3 py-2.5">
              <span className="text-[11px] text-biz-muted">
                {costedItemCount} of {items.length} items costed &middot; {selectedItemIds.size}{" "}
                selected
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {pendingLocalItems.length > 0 && activeForeignItems.length === 0 && (
                  <PrimaryButton
                    className="h-9 bg-biz-success hover:bg-biz-success/90"
                    disabled={saveCosting.isPending}
                    onClick={saveAllLocalCosting}
                  >
                    <Save className="h-4 w-4" />
                    {saveCosting.isPending
                      ? "Saving..."
                      : `Save All Local (${pendingLocalItems.length})`}
                  </PrimaryButton>
                )}
                {pricingReadyItems.length > 0 && activeForeignItems.length === 0 && (
                  <PrimaryButton
                    className="h-9 bg-biz-success hover:bg-biz-success/90"
                    disabled={saveCosting.isPending}
                    onClick={saveAllPricing}
                  >
                    <Save className="h-4 w-4" />
                    {saveCosting.isPending ? "Saving..." : `Save All (${pricingReadyItems.length})`}
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
                    <div className="grid grid-cols-1 gap-2 border-b border-biz-border bg-biz-bg/60 px-3 py-2.5 sm:grid-cols-2 lg:grid-cols-[minmax(120px,1fr)_minmax(100px,0.8fr)_minmax(180px,1.35fr)_minmax(110px,0.8fr)_minmax(145px,1fr)_auto] lg:items-end">
                      <MiniField label="Country" required>
                        <SelectInput
                          className="h-9 text-[10px]"
                          value={bulkForeign.country}
                          options={countryOptionsWithCurrent(bulkForeign.country)}
                          onChange={(event) => {
                            const country = event.target.value;
                            setBulkForeign((current) => {
                              const currency = COUNTRY_CURRENCY[country] ?? current.currency;
                              const currencyChanged = currency !== current.currency;
                              return {
                                ...current,
                                country,
                                currency,
                                exchangeRate: currencyChanged
                                  ? currency === DEFAULT_CHINA_CURRENCY
                                    ? DEFAULT_CNY_TO_BDT_RATE
                                    : ""
                                  : current.exchangeRate,
                                exchangeRateDate: currencyChanged
                                  ? localDate()
                                  : current.exchangeRateDate,
                              };
                            });
                          }}
                        />
                      </MiniField>
                      <MiniField label="Currency">
                        <SelectInput
                          className="h-9 text-[10px]"
                          value={bulkForeign.currency}
                          options={CURRENCY_OPTIONS}
                          onChange={(event) => {
                            const currency = event.target.value;
                            setBulkForeign((current) => ({
                              ...current,
                              currency,
                              country: CURRENCY_COUNTRY[currency] ?? current.country,
                              exchangeRate:
                                currency === current.currency
                                  ? current.exchangeRate
                                  : currency === DEFAULT_CHINA_CURRENCY
                                    ? DEFAULT_CNY_TO_BDT_RATE
                                    : "",
                              exchangeRateDate:
                                currency === current.currency
                                  ? current.exchangeRateDate
                                  : localDate(),
                            }));
                          }}
                        />
                      </MiniField>
                      <MiniField label="Shipping Method" required>
                        <SelectInput
                          className="h-9 text-[9px]"
                          value={bulkForeign.shippingMethod}
                          options={SHIPPING_METHOD_OPTIONS}
                          onChange={(event) => {
                            const shippingMethod = event.target
                              .value as TenderCostingShippingMethod;
                            const previousShippingMethod = bulkForeign.shippingMethod;
                            setBulkForeign((current) => ({ ...current, shippingMethod }));
                            if (shippingMethod.startsWith("LC_") && Number(lcContainerFee) <= 0) {
                              openLcContainerEditor({
                                kind: "BULK_SELECTION",
                                previousShippingMethod,
                                shippingMethod,
                              });
                            }
                          }}
                        />
                      </MiniField>
                      <BulkForeignNumber
                        required
                        label="Exchange Rate"
                        field="exchangeRate"
                        value={bulkForeign.exchangeRate}
                        onChange={setBulkForeign}
                      />
                      <MiniField label="Rate Date">
                        <TextInput
                          type="date"
                          className="h-9 px-1 text-[9px]"
                          value={bulkForeign.exchangeRateDate}
                          onChange={(event) =>
                            setBulkForeign((current) => ({
                              ...current,
                              exchangeRateDate: event.target.value,
                            }))
                          }
                        />
                      </MiniField>
                      <div className="flex min-w-0 flex-col">
                        <span className="mb-1.5 flex min-h-[28px] items-end text-[11px] font-bold text-biz-text">
                          Common Settings
                        </span>
                        <PrimaryButton
                          className="h-9 whitespace-nowrap bg-biz-warning px-4 text-white hover:bg-biz-warning/90"
                          onClick={applyBulkForeignSettings}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Apply to {activeForeignItems.length}{" "}
                          {activeForeignItems.length === 1 ? "Item" : "Items"}
                        </PrimaryButton>
                      </div>
                    </div>
                  }
                  onChange={(id, patch) => updateItem(id, { ...patch, costingStatus: "DRAFT" })}
                  onShippingMethodChange={handleForeignShippingMethodChange}
                  lcContainerFee={lcContainerFee}
                  lcContainerAllocationMethod={lcContainerAllocationMethod}
                  lcProductCount={lcProducts.length}
                  onEditLcContainer={() => openLcContainerEditor()}
                  onValidationBlocked={() => setSaveError("")}
                  onContainerFeeRequired={() => openLcContainerEditor()}
                  onSaveAll={saveAllActiveForeignCosting}
                />
              )}
              {items
                .filter((item) => activeCostingIds.has(item.id) && item.sourcingType !== "FOREIGN")
                .map((item) => (
                  <CostingWorkspaceCard
                    key={item.id}
                    item={item}
                    preview={calculateItemPreview(item)}
                    onChange={(patch) => updateItem(item.id, { ...patch, costingStatus: "DRAFT" })}
                    onMarkCosted={() => markItemCosted(item)}
                  />
                ))}
            </div>
          )}

          {costedItems.length > 0 && (
            <div ref={costedItemsListRef} className="scroll-mt-20">
              <CostedItemsList items={costedItems} onEdit={editCostedItem} />
            </div>
          )}
        </fieldset>
      </div>

      {saveError && (
        <div className="rounded-md border border-biz-danger/20 bg-biz-danger/5 px-4 py-3 text-[12.5px] text-biz-danger">
          {saveError}
        </div>
      )}

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
                  setLcAllocationMethodDraft(
                    event.target.value as TenderCostingLcAllocationMethod,
                  )
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
                const invalidWeight =
                  lcEditorAttempted && Number(lcWeightDrafts[item.id]) <= 0;
                return (
                  <div
                    key={item.id}
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
            <PrimaryButton
              type="submit"
              disabled={setCostingBudget.isPending || !isBudgetValid}
            >
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
        open={!!success}
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

      {foreignCostingNotice && (
        <div
          role="status"
          aria-live="polite"
          aria-label="Foreign costing saved successfully"
          className="fixed left-1/2 top-1/2 z-[120] flex aspect-square w-[260px] max-w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-xl border border-biz-success/30 bg-white p-6 text-center shadow-2xl"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-biz-success-soft text-biz-success ring-4 ring-biz-success/5">
            <CheckCircle2 className="h-8 w-8" />
          </span>
          <p className="mt-4 text-[16px] font-bold text-biz-navy">Foreign Costing Saved</p>
          <button
            type="button"
            aria-label="Close foreign costing notification"
            onClick={() => setForeignCostingNotice("")}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-biz-muted transition-colors hover:bg-biz-bg hover:text-biz-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function CostedItemsList({
  items,
  onEdit,
}: {
  items: CostingItemForm[];
  onEdit: (item: CostingItemForm) => void;
}) {
  const totals = items.reduce(
    (summary, item) => {
      const preview = calculateItemPreview(item);
      summary.grandTotal += preview.selectedGrandTotal;
      summary.profit += preview.totalProfit;
      return summary;
    },
    { grandTotal: 0, profit: 0 },
  );

  return (
    <div className="overflow-hidden rounded-lg border border-biz-border bg-biz-surface shadow-card">
      <div className="flex items-center justify-between gap-3 border-b border-biz-border px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold text-biz-text">Costed Items List</h2>
          <p className="text-[10.5px] text-biz-muted">
            Completed item costings are listed here. Edit Cost reopens an item without losing its
            data.
          </p>
        </div>
        <StatusBadge label={`${items.length} Costed`} tone="success" />
      </div>
      <table className="w-full table-fixed text-left text-[9px] xl:text-[10px]">
        <thead className="bg-biz-bg text-biz-muted">
          <tr>
            <th className="w-[3%] px-1 py-2">SL</th>
            <th className="w-[16%] px-1 py-2">Product</th>
            <th className="w-[7%] px-1 py-2">Source</th>
            <th className="w-[6%] px-1 py-2 text-right">Qty</th>
            <th className="w-[6%] px-1 py-2">Unit</th>
            <th className="w-[10%] px-1 py-2 text-right">Unit Cost</th>
            <th className="w-[6%] px-1 py-2 text-right">Profit %</th>
            <th className="w-[5%] px-1 py-2 text-right">VAT %</th>
            <th className="w-[5%] px-1 py-2 text-right">Tax %</th>
            <th className="w-[11%] px-1 py-2 text-right">Grand Total</th>
            <th className="w-[10%] px-1 py-2 text-right">Unit Sales</th>
            <th className="w-[9%] px-1 py-2 text-right">Profit</th>
            <th className="w-[6%] px-1 py-2 text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => {
            const preview = calculateItemPreview(item);
            const isForeign = item.selectedSource === "FOREIGN" || item.sourcingType === "FOREIGN";
            return (
              <tr key={item.id} className="border-t border-biz-border">
                <td className="px-1 py-2.5">{index + 1}</td>
                <td className="px-1 py-2.5 font-medium text-biz-text">
                  <span
                    className="block cursor-help truncate"
                    title={item.description}
                    aria-label={item.description}
                  >
                    {item.description}
                  </span>
                </td>
                <td className="px-1 py-2.5">
                  <span
                    className={`rounded-full px-2 py-1 text-[8.5px] font-semibold ${isForeign ? "bg-biz-purple/10 text-biz-purple" : "bg-biz-success/10 text-biz-success"}`}
                  >
                    {isForeign ? "Foreign" : "Local"}
                  </span>
                </td>
                <td className="px-1 py-2.5 text-right">
                  {formatCompactMoney(Number(item.quantity) || 0)}
                </td>
                <td className="px-1 py-2.5">{item.unit}</td>
                <td className="px-1 py-2.5 text-right">
                  {formatCompactMoney(preview.selectedUnitCost)}
                </td>
                <td className="px-1 py-2.5 text-right">
                  {formatCompactMoney(Number(item.marginPercent) || 0)}%
                </td>
                <td className="px-1 py-2.5 text-right">{preview.selectedVatPercent.toFixed(2)}%</td>
                <td className="px-1 py-2.5 text-right">{preview.selectedTaxPercent.toFixed(2)}%</td>
                <td className="px-1 py-2.5 text-right font-semibold">
                  {formatCompactMoney(preview.selectedGrandTotal)}
                </td>
                <td className="px-1 py-2.5 text-right font-medium text-biz-blue">
                  {formatCompactMoney(preview.unitSalesPrice)}
                </td>
                <td className="px-1 py-2.5 text-right font-semibold text-biz-success">
                  {formatCompactMoney(preview.totalProfit)}
                </td>
                <td className="px-1 py-2 text-center">
                  <button
                    type="button"
                    className="h-8 rounded border border-biz-blue px-2 text-[9px] font-semibold text-biz-blue hover:bg-biz-blue hover:text-white"
                    onClick={() => onEdit(item)}
                  >
                    Edit Cost
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex flex-col items-stretch justify-end gap-2 border-t border-biz-border bg-biz-bg/70 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex min-w-[190px] items-center justify-between gap-5 rounded-md border border-biz-blue/20 bg-biz-surface px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-biz-muted">
            Total Grand Total
          </span>
          <span className="text-[13px] font-bold text-biz-blue">
            BDT {formatCompactMoney(roundMoney(totals.grandTotal))}
          </span>
        </div>
        <div className="flex min-w-[175px] items-center justify-between gap-5 rounded-md border border-biz-success/25 bg-biz-success/5 px-3 py-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-biz-muted">
            Total Profit
          </span>
          <span className="text-[13px] font-bold text-biz-success">
            BDT {formatCompactMoney(roundMoney(totals.profit))}
          </span>
        </div>
      </div>
    </div>
  );
}

function moveAcrossCostingRow(
  event: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>,
) {
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

function CostingColumnHeader({
  label,
  required = false,
}: {
  label: string;
  required?: boolean;
}) {
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
  onEditLcContainer,
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
  onEditLcContainer: () => void;
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
  const currencies = Array.from(
    new Set(items.map((item) => item.foreignCurrency).filter(Boolean)),
  );
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
          { label: "Weight (KG)", required: true },
          { label: "Rate (BDT/KG)", required: true },
          { label: "Shipping (BDT)" },
          { label: "Local Transport" },
          { label: "Project Transport" },
          { label: "Other Cost" },
          { label: "Landed Cost" },
        ]
      : [
          { label: "Transport / Bank LC" },
          { label: "Weight / Agent Fee" },
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
                {lcProductCount} {lcProductCount === 1 ? "product" : "products"} · {lcAllocationLabel(lcContainerAllocationMethod)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <strong className="text-[12px] text-biz-text">
              BDT {formatCompactMoney(Number(lcContainerFee) || 0)}
            </strong>
            <button
              type="button"
              className="h-7 rounded-md border border-biz-warning/40 bg-white px-3 text-[10px] font-semibold text-biz-warning hover:bg-biz-warning hover:text-white"
              onClick={onEditLcContainer}
            >
              {Number(lcContainerFee) > 0 ? "Edit" : "Set Fee"}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-hidden">
        <div className="flex w-full min-w-0 gap-1 border-b border-[#25549B] bg-[#2F66BC] px-1 py-1.5">
          <div className="min-w-0 basis-[20%]">
            <div className="grid grid-cols-[0.3fr_1.35fr_0.7fr_0.55fr] gap-1">
              {["SL", "Product / Work", "Quantity", "Unit"].map((label) => (
                <CostingColumnHeader key={label} label={label} />
              ))}
            </div>
          </div>
          <div className="min-w-0 basis-[40%]">
            <div className="grid grid-cols-[1.15fr_0.85fr_0.85fr_0.75fr_0.75fr_0.9fr_1.3fr_0.85fr] gap-1">
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
            <div className="grid grid-cols-[1fr_0.8fr_0.85fr_0.85fr_0.95fr_1.1fr_0.8fr_0.9fr] gap-1">
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
                key={item.id}
                data-costing-row
                data-costing-row-id={item.id}
                className={`bg-white px-1 py-2 ${invalidColumns.size > 0 ? "bg-biz-danger/[0.025]" : ""}`}
              >
                <div className="flex min-w-0 items-start gap-1 [&_label>span]:hidden">
              <div className="min-w-0 basis-[20%]">
                <div className="grid grid-cols-[0.3fr_1.35fr_0.7fr_0.55fr] gap-1">
                <div>
                  <span className="sr-only">SL</span>
                  <strong className="flex h-7 items-center text-[9px] text-biz-text">
                    {index + 1}
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
                <div className="grid grid-cols-[1.15fr_0.85fr_0.85fr_0.75fr_0.75fr_0.9fr_1.3fr_0.85fr] gap-1">
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
                      <ReadOnlyCostValue value={formatCompactMoney(preview.foreignUnitValueBdt)} />
                    </MiniField>
                    <MiniField label={`Total/${currency}`}>
                      <ReadOnlyCostValue value={formatCompactMoney(preview.foreignProductTotal)} />
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
                          const shippingMethod = event.target.value as TenderCostingShippingMethod;
                          onShippingMethodChange(item, shippingMethod);
                        }}
                        onKeyDown={moveAcrossCostingRow}
                      />
                    </MiniField>
                    <MiniField label="Product BDT">
                      <ReadOnlyCostValue value={formatCompactMoney(preview.foreignProductValue)} />
                    </MiniField>
                </div>
              </div>

              {isLc ? (
                <div className="min-w-0 flex-1">
                  <div className="grid grid-cols-[1fr_0.8fr_0.85fr_0.85fr_0.95fr_1.1fr_0.8fr_0.9fr] gap-1">
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
                      <MiniField label="Transport">
                        <BatchNumberInput
                          column="cost-5"
                          value={item.foreignLocalTransportCost}
                          onChange={(value) =>
                            onChange(item.id, { foreignLocalTransportCost: value })
                          }
                        />
                      </MiniField>
                      <MiniField label="To Project">
                        <ReadOnlyCostValue value="—" />
                      </MiniField>
                      <MiniField label="Other">
                        <BatchNumberInput
                          column="cost-7"
                          value={item.foreignOtherCost}
                          onChange={(value) => onChange(item.id, { foreignOtherCost: value })}
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
                  <div className="grid grid-cols-[1fr_0.8fr_0.85fr_0.85fr_0.95fr_1.1fr_0.8fr_0.9fr] gap-1">
                      <MiniField label={`Transport/${currency}`}>
                        <BatchNumberInput
                          column="cost-1"
                          value={item.foreignTransportCharge}
                          onChange={(value) =>
                            onChange(item.id, { foreignTransportCharge: value })
                          }
                        />
                      </MiniField>
                      <MiniField label="Weight KG" required>
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
                        <ReadOnlyCostValue value={formatCompactMoney(preview.shippingCostBdt)} />
                      </MiniField>
                      <MiniField label="Local Transport">
                        <BatchNumberInput
                          column="cost-5"
                          value={item.foreignLocalTransportCost}
                          onChange={(value) =>
                            onChange(item.id, { foreignLocalTransportCost: value })
                          }
                        />
                      </MiniField>
                      <MiniField label="To Project">
                        <BatchNumberInput
                          column="cost-6"
                          value={item.domesticTransportCost}
                          onChange={(value) => onChange(item.id, { domesticTransportCost: value })}
                        />
                      </MiniField>
                      <MiniField label="Other">
                        <BatchNumberInput
                          column="cost-7"
                          value={item.foreignOtherCost}
                          onChange={(value) => onChange(item.id, { foreignOtherCost: value })}
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
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save All Foreign Costing"}
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
      className={`flex h-7 items-center justify-end overflow-hidden rounded-sm border border-biz-border bg-biz-bg px-1 text-[8.5px] ${
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
  field,
  value,
  onChange,
}: {
  label: string;
  required?: boolean;
  field: keyof BulkForeignForm;
  value: string;
  onChange: React.Dispatch<React.SetStateAction<BulkForeignForm>>;
}) {
  return (
    <MiniField label={label} required={required}>
      <TextInput
        type="number"
        min="0"
        step="any"
        className={`h-9 min-w-0 px-1.5 text-[10px] ${NUMBER_INPUT_CLASS}`}
        value={value}
        onChange={(event) => onChange((current) => ({ ...current, [field]: event.target.value }))}
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
  tone = "default",
  action,
}: {
  label: string;
  value: string;
  tone?: "default" | "blue" | "success" | "danger" | "warning";
  action?: React.ReactNode;
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
      className={`relative min-w-0 rounded-md border p-1.5 shadow-card sm:p-2 ${tone === "warning" ? "border-biz-warning/30 bg-biz-warning/5" : "border-biz-border bg-biz-surface"}`}
    >
      <div className="flex min-w-0 items-start justify-between gap-1">
        <p className="truncate text-[7px] text-biz-muted sm:text-[9px]" title={label}>
          {label}
        </p>
        {action}
      </div>
      <p
        className={`mt-0.5 truncate text-[9px] font-bold sm:text-[13px] ${valueTone}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function ProfitAction({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Edit common profit, VAT and tax settings"
      className="flex h-5 w-5 items-center justify-center rounded text-biz-muted hover:bg-biz-bg hover:text-biz-blue sm:h-6 sm:w-6"
      onClick={onClick}
    >
      <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </button>
  );
}
