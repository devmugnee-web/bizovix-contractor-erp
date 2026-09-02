"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, MoreVertical, Plus, Save, Trash2, X } from "lucide-react";
import {
  ApiError,
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
const CURRENCY_OPTIONS = ["USD", "EUR", "CNY", "GBP", "INR", "JPY", "SGD", "AED"].map(
  (currency) => ({ value: currency, label: currency }),
);
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
const SHIPPING_METHOD_OPTIONS = [
  { value: "DOOR_TO_DOOR_SEA", label: "Door to Door - Sea Shipping" },
  { value: "DOOR_TO_DOOR_AIR", label: "Door to Door - Air Shipment" },
  { value: "LC_SEA", label: "LC - Sea Shipment" },
  { value: "LC_AIR", label: "LC - Air Shipment" },
];
function defaultShippingRateBasis(
  method: TenderCostingShippingMethod,
): TenderCostingShippingRateBasis {
  return method.startsWith("LC_") ? "FLAT" : "PER_KG";
}

function defaultShippingRate(method: TenderCostingShippingMethod): string {
  if (method.startsWith("LC_")) return "";
  return method.endsWith("AIR") ? "800" : "400";
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
    localUnitPrice: "",
    localDiscountPercent: "",
    localVatPercent: "",
    localTaxPercent: "",
    localTransportCost: "",
    localOtherCost: "",
    foreignSupplierName: "",
    foreignCountry: "China",
    foreignCurrency: "USD",
    foreignUnitPrice: "",
    foreignExchangeRate: "1",
    exchangeRateDate: "",
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
    foreignVatPercent: "",
    foreignTaxPercent: "",
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
  const [items, setItems] = React.useState<CostingItemForm[]>([blankItem()]);
  const [sourceFilter, setSourceFilter] = React.useState("ALL");
  const [bulkSourcingType, setBulkSourcingType] = React.useState<TenderCostingSourcingType | "">(
    "",
  );
  const [selectedItemIds, setSelectedItemIds] = React.useState<Set<string>>(new Set());
  const [activeCostingIds, setActiveCostingIds] = React.useState<Set<string>>(new Set());
  const [foreignEditReturnIds, setForeignEditReturnIds] = React.useState<Set<string>>(new Set());
  const [lastPreparedByUserId, setLastPreparedByUserId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saveError, setSaveError] = React.useState("");
  const [budgetInput, setBudgetInput] = React.useState("");
  const [budgetError, setBudgetError] = React.useState("");
  const [budgetNotice, setBudgetNotice] = React.useState("");
  const [budgetActionsOpen, setBudgetActionsOpen] = React.useState(false);
  const [budgetEditorOpen, setBudgetEditorOpen] = React.useState(false);
  const [isDirty, setIsDirty] = React.useState(false);
  const [profitSettingsOpen, setProfitSettingsOpen] = React.useState(false);
  const [localTargetMargin, setLocalTargetMargin] = React.useState("10");
  const [foreignTargetMargin, setForeignTargetMargin] = React.useState("10");
  const [commonVatPercent, setCommonVatPercent] = React.useState("");
  const [commonTaxPercent, setCommonTaxPercent] = React.useState("");
  const [bulkForeign, setBulkForeign] = React.useState<BulkForeignForm>({
    country: "China",
    currency: "USD",
    exchangeRate: "1",
    exchangeRateDate: localDate(),
    shippingMethod: "DOOR_TO_DOOR_SEA",
  });
  const [foreignCostingNotice, setForeignCostingNotice] = React.useState("");
  const [success, setSuccess] = React.useState<{ title: string; message: string } | null>(null);
  const hydratedId = React.useRef<string | undefined>(undefined);
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
    setItems(
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
            localUnitPrice: compactInputNumber(item.localUnitPrice, true),
            localDiscountPercent: compactInputNumber(item.localDiscountPercent, true),
            localVatPercent: compactInputNumber(item.localVatPercent, true),
            localTaxPercent: compactInputNumber(item.localTaxPercent, true),
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
            foreignVatPercent: compactInputNumber(item.foreignVatPercent, true),
            foreignTaxPercent: compactInputNumber(item.foreignTaxPercent, true),
            cnfCharge: compactInputNumber(item.cnfCharge, true),
            portHandlingCharge: compactInputNumber(item.portHandlingCharge, true),
            bankLcCharge: compactInputNumber(item.bankLcCharge, true),
            foreignLocalTransportCost: compactInputNumber(item.foreignLocalTransportCost, true),
            foreignOtherCost: compactInputNumber(item.foreignOtherCost, true),
            remarks: item.remarks ?? "",
          }))
        : [blankItem(record.tender.workName)],
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
          ? compactInputNumber(firstPricedItem.foreignVatPercent, true)
          : compactInputNumber(firstPricedItem.localVatPercent, true)
        : "",
    );
    setCommonTaxPercent(
      firstPricedItem
        ? useForeignRates
          ? compactInputNumber(firstPricedItem.foreignTaxPercent, true)
          : compactInputNumber(firstPricedItem.localTaxPercent, true)
        : "",
    );
    const firstForeignItem = record.items.find(
      (item) => item.sourcingType === "FOREIGN" || item.selectedSource === "FOREIGN",
    );
    setBulkForeign(
      firstForeignItem
        ? {
            country: firstForeignItem.foreignCountry ?? "China",
            currency: firstForeignItem.foreignCurrency,
            exchangeRate: compactInputNumber(firstForeignItem.foreignExchangeRate, true),
            exchangeRateDate: firstForeignItem.exchangeRateDate?.slice(0, 10) ?? localDate(),
            shippingMethod: firstForeignItem.foreignShippingMethod,
          }
        : {
            country: "China",
            currency: "USD",
            exchangeRate: "1",
            exchangeRateDate: localDate(),
            shippingMethod: "DOOR_TO_DOOR_SEA",
          },
    );
    setActiveCostingIds(new Set());
    setSelectedItemIds(new Set());
    setForeignEditReturnIds(new Set());
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

  function updateItem(id: string, patch: Partial<CostingItemForm>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
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
    setItems((current) => [
      ...current,
      {
        ...newItem,
        marginPercent: sourcingType === "FOREIGN" ? foreignTargetMargin : localTargetMargin,
        localVatPercent: commonVatPercent,
        localTaxPercent: commonTaxPercent,
        foreignVatPercent: commonVatPercent,
        foreignTaxPercent: commonTaxPercent,
        ...(sourcingType === "FOREIGN" ? currentForeignDefaults() : {}),
      },
    ]);
    setIsDirty(true);
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
    if (!item.description.trim() || !item.unit.trim() || Number(item.quantity) <= 0) {
      setSaveError("Enter Product Name, Quantity and Unit before opening costing.");
      return;
    }
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
    setItems((current) =>
      current.map((item) =>
        targetIds.has(item.id) && item.sourcingType === "FOREIGN"
          ? {
              ...applyCommonForeignValues(item),
              costingStatus: "DRAFT",
            }
          : item,
      ),
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

    const hasIncompleteLocalItem = localItemsToSave.some(
      (item) =>
        !item.costingDate ||
        !preparedByForItem(item) ||
        !item.description.trim() ||
        !item.unit.trim() ||
        Number(item.quantity) <= 0 ||
        Number(item.localUnitPrice) <= 0,
    );
    if (hasIncompleteLocalItem) {
      setSaveError(
        "Complete Product Name, Unit, Quantity and Unit Price for every Local item before saving.",
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
    setBudgetActionsOpen(false);
    setBudgetError("");
    setBudgetNotice("");
    setBudgetInput(costing.data?.costingBudget ? String(costing.data.costingBudget) : "");
    setBudgetEditorOpen(true);
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
              <div className="relative">
                <button
                  type="button"
                  aria-label="Total Costing Budget actions"
                  className="flex h-5 w-5 items-center justify-center rounded text-biz-muted hover:bg-biz-bg hover:text-biz-blue sm:h-6 sm:w-6"
                  onClick={() => setBudgetActionsOpen((open) => !open)}
                >
                  <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </button>
                {budgetActionsOpen && (
                  <div className="absolute right-0 top-7 z-30 w-36 rounded-md border border-biz-border bg-biz-surface p-1 shadow-card">
                    <button
                      type="button"
                      className="w-full rounded px-2.5 py-2 text-left text-[11px] font-medium text-biz-text hover:bg-biz-bg"
                      onClick={openBudgetEditor}
                    >
                      {hasCostingBudget ? "Update Budget" : "Set Budget"}
                    </button>
                  </div>
                )}
              </div>
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

      {!hasCostingBudget && !isReadOnly && (
        <div className="rounded-lg border border-biz-warning/35 bg-biz-warning/5 p-4 shadow-card">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="text-[14px] font-semibold text-biz-text">
                Set Total Costing Budget to Start
              </h2>
              <p className="mt-0.5 text-[11px] text-biz-muted">
                Enter and save the approved costing budget. The item costing section will unlock
                automatically.
              </p>
            </div>
            <div className="flex min-w-[360px] items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10.5px] font-medium text-biz-text">
                  Total Costing Budget (BDT) <RequiredMark />
                </span>
                <TextInput
                  autoFocus
                  className={`h-10 text-right font-semibold ${NUMBER_INPUT_CLASS}`}
                  type="number"
                  min="0.01"
                  step="any"
                  value={budgetInput}
                  placeholder="Enter costing budget"
                  disabled={setCostingBudget.isPending}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => {
                    setBudgetInput(event.target.value);
                    setBudgetError("");
                  }}
                  onKeyDown={(event) => event.key === "Enter" && saveBudget()}
                />
              </label>
              <PrimaryButton
                className="h-10 whitespace-nowrap"
                disabled={setCostingBudget.isPending || Number(budgetInput) <= 0}
                onClick={saveBudget}
              >
                <Save className="h-4 w-4" />
                {setCostingBudget.isPending ? "Unlocking..." : "Save & Unlock Costing"}
              </PrimaryButton>
            </div>
          </div>
          {budgetError && <p className="mt-2 text-[11px] text-biz-danger">{budgetError}</p>}
        </div>
      )}

      <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-biz-border bg-biz-surface">
        {[
          ["1", "Add Items", "Enter product, quantity and unit"],
          ["2", "Choose Source", "Select Local or Foreign"],
          ["3", "Cost & Save", "Open Cost, mark costed, then save"],
        ].map(([step, title, description], index) => (
          <div
            key={step}
            className={`flex min-w-0 items-center gap-2 px-3 py-2 ${index > 0 ? "border-l border-biz-border" : ""}`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-biz-blue text-[11px] font-bold text-white">
              {step}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold text-biz-text">{title}</p>
              <p className="truncate text-[9.5px] text-biz-muted">{description}</p>
            </div>
          </div>
        ))}
      </div>

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
                <PrimaryButton onClick={addAnotherItem}>
                  <Plus className="h-4 w-4" />
                  Add Another Row
                </PrimaryButton>
              </div>
            </div>
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
                  {filteredItems.map((item) => {
                    const originalIndex = items.findIndex((row) => row.id === item.id);
                    const preview = calculateItemPreview(item);
                    return (
                      <tr key={item.id} className="border-t border-biz-border">
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
                        <td className="px-1 py-2">{originalIndex + 1}</td>
                        <td className="px-1 py-2">
                          <RequiredRowField>
                            <TextInput
                              className="h-9 min-w-0 px-1.5 text-[10px]"
                              value={item.description}
                              placeholder="Enter product"
                              onChange={(event) =>
                                updateItem(item.id, {
                                  description: event.target.value,
                                  costingStatus: "NOT_COSTED",
                                })
                              }
                            />
                          </RequiredRowField>
                        </td>
                        <td className="px-0.5 py-2">
                          <SelectInput
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
                          />
                        </td>
                        <td className="px-0.5 py-2">
                          <RequiredRowField>
                            <SelectInput
                              className="h-9 min-w-0 px-1 pr-4 text-[9px] xl:text-[10px]"
                              value={item.unit}
                              options={
                                UNIT_OPTIONS.some((option) => option.value === item.unit)
                                  ? UNIT_OPTIONS
                                  : [{ value: item.unit, label: item.unit }, ...UNIT_OPTIONS]
                              }
                              onChange={(event) =>
                                updateItem(item.id, { unit: event.target.value })
                              }
                            />
                          </RequiredRowField>
                        </td>
                        <td className="px-1 py-2">
                          <RequiredRowField>
                            <TextInput
                              className={`h-9 min-w-0 px-1 text-[10px] ${NUMBER_INPUT_CLASS}`}
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
                            />
                          </RequiredRowField>
                        </td>
                        <td className="px-0.5 py-2">
                          {item.sourcingType === "LOCAL" ? (
                            <RequiredRowField>
                              <TextInput
                                className={`h-8 min-w-0 px-1 text-right text-[9px] ${NUMBER_INPUT_CLASS}`}
                                type="number"
                                min="0"
                                step="any"
                                value={item.localUnitPrice}
                                onChange={(event) =>
                                  updateItem(item.id, {
                                    localUnitPrice: event.target.value,
                                    costingStatus: "NOT_COSTED",
                                  })
                                }
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
                          />
                          <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-biz-muted">
                            %
                          </span>
                        </td>
                        <td className="relative px-0.5 py-2">
                          <TextInput
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
                            {items.length > 1 ? (
                              <IconButton
                                aria-label="Remove item"
                                onClick={() => {
                                  setItems((current) =>
                                    current.filter((row) => row.id !== item.id),
                                  );
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
                                  setIsDirty(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4 text-biz-danger" />
                              </IconButton>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredItems.length === 0 && (
                    <tr className="border-t border-biz-border">
                      <td colSpan={15} className="px-4 py-8 text-center text-[11px] text-biz-muted">
                        No pending items. Add another row or edit an item from the Costed Items
                        List.
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
              <div>
                <h2 className="text-[14px] font-semibold text-biz-text">Costing Workspace</h2>
                <p className="text-[11px] text-biz-muted">
                  Foreign prices are converted to BDT and all landed-cost charges are calculated
                  automatically.
                </p>
              </div>
              {activeForeignItems.length > 0 && (
                <div className="rounded-lg border border-biz-warning/35 border-l-4 border-l-biz-warning bg-gradient-to-r from-biz-warning/10 via-biz-surface to-biz-blue/5 p-3 shadow-card">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-[12px] font-semibold text-biz-text">
                        Common Foreign Settings ({activeForeignItems.length} items)
                      </h3>
                      <p className="text-[10px] text-biz-muted">
                        Set the shared country, currency, shipping method and exchange rate once.
                      </p>
                    </div>
                    <SecondaryButton
                      className="h-9 border-biz-warning bg-biz-warning font-semibold text-white shadow-sm hover:border-biz-warning/90 hover:bg-biz-warning/90 hover:text-white"
                      onClick={applyBulkForeignSettings}
                    >
                      Apply Common Settings
                    </SecondaryButton>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <MiniField label="Country" required>
                      <SelectInput
                        className="h-9 text-[10px]"
                        value={bulkForeign.country}
                        options={countryOptionsWithCurrent(bulkForeign.country)}
                        onChange={(event) =>
                          setBulkForeign((current) => ({ ...current, country: event.target.value }))
                        }
                      />
                    </MiniField>
                    <MiniField label="Currency">
                      <SelectInput
                        className="h-9 text-[10px]"
                        value={bulkForeign.currency}
                        options={CURRENCY_OPTIONS}
                        onChange={(event) =>
                          setBulkForeign((current) => ({
                            ...current,
                            currency: event.target.value,
                          }))
                        }
                      />
                    </MiniField>
                    <MiniField label="Default Shipping Method" required>
                      <SelectInput
                        className="h-9 text-[9px]"
                        value={bulkForeign.shippingMethod}
                        options={SHIPPING_METHOD_OPTIONS}
                        onChange={(event) =>
                          setBulkForeign((current) => ({
                            ...current,
                            shippingMethod: event.target.value as TenderCostingShippingMethod,
                          }))
                        }
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
                  </div>
                </div>
              )}
              {activeForeignItems.length > 0 && (
                <ForeignBatchTable
                  items={activeForeignItems}
                  saving={saveCosting.isPending}
                  onChange={(id, patch) => updateItem(id, { ...patch, costingStatus: "DRAFT" })}
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
        open={profitSettingsOpen}
        onClose={() => setProfitSettingsOpen(false)}
        title="Common Profit, VAT & Tax Settings"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[11.5px] text-biz-muted">
            Apply common rates to every costing item. Profit, VAT and Tax remain editable in each
            row afterward.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Local Target Profit Margin (%)">
              <TextInput
                type="number"
                min="0"
                max="99.99"
                step="any"
                className={NUMBER_INPUT_CLASS}
                value={localTargetMargin}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => setLocalTargetMargin(event.target.value)}
              />
            </Field>
            <Field label="Foreign Target Profit Margin (%)">
              <TextInput
                type="number"
                min="0"
                max="99.99"
                step="any"
                className={NUMBER_INPUT_CLASS}
                value={foreignTargetMargin}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => setForeignTargetMargin(event.target.value)}
              />
            </Field>
            <Field label="Common VAT (%)">
              <TextInput
                type="number"
                min="0"
                max="100"
                step="any"
                className={NUMBER_INPUT_CLASS}
                value={commonVatPercent}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => setCommonVatPercent(event.target.value)}
              />
            </Field>
            <Field label="Common Tax / AIT (%)">
              <TextInput
                type="number"
                min="0"
                max="100"
                step="any"
                className={NUMBER_INPUT_CLASS}
                value={commonTaxPercent}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => setCommonTaxPercent(event.target.value)}
              />
            </Field>
          </div>
          <p className="rounded-md border border-biz-blue/20 bg-biz-blue/5 px-3 py-2 text-[10.5px] text-biz-text">
            Apply & Save updates all current rows. You can then override Profit %, VAT % or Tax %
            directly in any row.
          </p>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setProfitSettingsOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton disabled={saveCosting.isPending} onClick={applyPricingSettings}>
              {saveCosting.isPending ? "Saving..." : "Apply & Save"}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal
        open={budgetEditorOpen}
        onClose={() => setBudgetEditorOpen(false)}
        title={hasCostingBudget ? "Update Total Costing Budget" : "Set Total Costing Budget"}
      >
        <div className="flex flex-col gap-4">
          <Field required label="Total Costing Budget (BDT)" error={budgetError}>
            <TextInput
              autoFocus
              type="number"
              min="0.01"
              step="any"
              className={NUMBER_INPUT_CLASS}
              disabled={setCostingBudget.isPending}
              value={budgetInput}
              placeholder="Enter total costing budget"
              onChange={(event) => {
                setBudgetInput(event.target.value);
                setBudgetError("");
              }}
              onKeyDown={(event) => event.key === "Enter" && saveBudget()}
            />
          </Field>
          <p className="text-[11px] text-biz-muted">
            Costing details remain locked until a valid budget is saved.
          </p>
          <div className="flex justify-end gap-2">
            <SecondaryButton
              disabled={setCostingBudget.isPending}
              onClick={() => setBudgetEditorOpen(false)}
            >
              Cancel
            </SecondaryButton>
            <PrimaryButton disabled={setCostingBudget.isPending} onClick={saveBudget}>
              <Save className="h-4 w-4" />
              {setCostingBudget.isPending ? "Saving..." : "Save Budget"}
            </PrimaryButton>
          </div>
        </div>
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
        primaryLabel="Back to Costing List"
        onPrimary={() => router.push(`/tender-management/tender-costing?costingId=${record.id}`)}
        secondaryLabel={success?.title === "Costing Completed" ? undefined : "Continue Editing"}
        onSecondary={() => setSuccess(null)}
      />

      {foreignCostingNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 top-1/2 z-[120] flex w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 items-start gap-3 rounded-lg border border-biz-success/30 bg-white p-3.5 shadow-2xl"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-biz-success-soft text-biz-success">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-biz-text">Foreign Costing Saved</p>
            <p className="mt-0.5 text-[11.5px] leading-4 text-biz-muted">
              {foreignCostingNotice}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close foreign costing notification"
            onClick={() => setForeignCostingNotice("")}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-biz-muted hover:bg-biz-bg hover:text-biz-text"
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
                <td
                  className="truncate px-1 py-2.5 font-medium text-biz-text"
                  title={item.description}
                >
                  {item.description}
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
    </div>
  );
}

function ForeignBatchTable({
  items,
  saving,
  onChange,
  onSaveAll,
}: {
  items: CostingItemForm[];
  saving: boolean;
  onChange: (id: string, patch: Partial<CostingItemForm>) => void;
  onSaveAll: () => void;
}) {
  const batchLandedCost = items.reduce(
    (total, item) => total + calculateItemPreview(item).foreignLanded,
    0,
  );

  return (
    <div className="overflow-hidden rounded-lg border border-biz-border bg-biz-surface shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-3 py-2.5">
        <div>
          <h3 className="text-[14px] font-semibold text-biz-text">Foreign Product Costing</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-biz-muted">
            Foreign-currency purchase costs are converted automatically. Shipping and local
            transport costs are entered in BDT.
          </p>
        </div>
        <PrimaryButton className="h-9" disabled={saving} onClick={onSaveAll}>
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save All Foreign Costing"}
        </PrimaryButton>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {items.map((item, index) => {
          const preview = calculateItemPreview(item);
          const currency = item.foreignCurrency || "USD";
          const isAir = item.foreignShippingMethod.endsWith("AIR");
          const isLc = item.foreignShippingMethod.startsWith("LC_");
          const rowTone = [
            "border-biz-blue/30 bg-biz-blue/5",
            "border-biz-success/30 bg-biz-success/5",
            "border-biz-purple/30 bg-biz-purple/5",
            "border-biz-warning/30 bg-biz-warning/5",
          ][index % 4];
          const headerTone = [
            "border-biz-blue/30 bg-biz-blue/10",
            "border-biz-success/30 bg-biz-success/10",
            "border-biz-purple/30 bg-biz-purple/10",
            "border-biz-warning/30 bg-biz-warning/10",
          ][index % 4];

          return (
            <section key={item.id} className={`rounded-lg border p-3 ${rowTone}`}>
              <div
                className={`mb-3 grid grid-cols-2 gap-2 rounded-md border px-3 py-2 sm:grid-cols-4 ${headerTone}`}
              >
                <div>
                  <span className="block text-[10.5px] font-medium text-biz-muted">SL</span>
                  <strong className="text-[12px] text-biz-text">{index + 1}</strong>
                </div>
                <div>
                  <span className="block text-[10.5px] font-medium text-biz-muted">
                    Product Name
                  </span>
                  <strong
                    className="block text-[12px] font-semibold text-biz-text"
                    title={item.description}
                  >
                    {item.description}
                  </strong>
                </div>
                <div>
                  <span className="block text-[10.5px] font-medium text-biz-muted">Qty</span>
                  <strong className="text-[12px] text-biz-text">{item.quantity}</strong>
                </div>
                <div>
                  <span className="block text-[10.5px] font-medium text-biz-muted">Unit</span>
                  <strong className="text-[12px] text-biz-text">{item.unit}</strong>
                </div>
              </div>

              <div className="mb-3">
                <h4 className="mb-2 text-[12px] font-semibold text-biz-text">
                  Foreign Currency Cost
                </h4>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-[1.1fr_1fr_1fr_1fr_0.85fr_1fr_1.55fr_1fr]">
                    <MiniField label="Supplier Name">
                      <TextInput
                        className="h-9 px-2 text-[11px]"
                        placeholder="Optional"
                        value={item.foreignSupplierName}
                        onChange={(event) =>
                          onChange(item.id, { foreignSupplierName: event.target.value })
                        }
                      />
                    </MiniField>
                    <MiniField label={`Unit Price (${currency})`} required>
                      <BatchNumberInput
                        value={item.foreignUnitPrice}
                        onChange={(value) => onChange(item.id, { foreignUnitPrice: value })}
                      />
                    </MiniField>
                    <MiniField label="Unit Price (BDT)">
                      <ReadOnlyCostValue value={formatCompactMoney(preview.foreignUnitValueBdt)} />
                    </MiniField>
                    <MiniField label={`Total (${currency})`}>
                      <ReadOnlyCostValue value={formatCompactMoney(preview.foreignProductTotal)} />
                    </MiniField>
                    <MiniField label="Currency" required>
                      <SelectInput
                        className="h-9 text-[11px]"
                        value={item.foreignCurrency}
                        options={CURRENCY_OPTIONS}
                        onChange={(event) =>
                          onChange(item.id, { foreignCurrency: event.target.value })
                        }
                      />
                    </MiniField>
                    <MiniField label="Exchange Rate (BDT)" required>
                      <BatchNumberInput
                        value={item.foreignExchangeRate}
                        onChange={(value) => onChange(item.id, { foreignExchangeRate: value })}
                      />
                    </MiniField>
                    <MiniField label="Shipping Method" required>
                      <SelectInput
                        className="h-9 text-[10.5px]"
                        value={item.foreignShippingMethod}
                        options={SHIPPING_METHOD_OPTIONS}
                        onChange={(event) => {
                          const shippingMethod = event.target.value as TenderCostingShippingMethod;
                          const nextIsLc = shippingMethod.startsWith("LC_");
                          const switchingFamily =
                            nextIsLc !== item.foreignShippingMethod.startsWith("LC_");
                          onChange(item.id, {
                            foreignShippingMethod: shippingMethod,
                            shippingRateBasis: defaultShippingRateBasis(shippingMethod),
                            shippingRate: defaultShippingRate(shippingMethod),
                            ...(switchingFamily
                              ? {
                                  shippingWeightKg: "",
                                  foreignTransportCharge: "",
                                  foreignFreightCost: "",
                                  cnfCharge: "",
                                  portHandlingCharge: "",
                                  bankLcCharge: "",
                                  foreignLocalTransportCost: "",
                                  domesticTransportCost: "",
                                }
                              : {}),
                          });
                        }}
                      />
                    </MiniField>
                    <MiniField label="Total (BDT)">
                      <ReadOnlyCostValue value={formatCompactMoney(preview.foreignProductValue)} />
                    </MiniField>
                </div>
              </div>

              {isLc ? (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-[12px] font-semibold text-biz-text">LC Charges (BDT)</h4>
                    <span className="text-[10.5px] leading-4 text-biz-muted">
                      Enter only applicable charges. Blank fields are treated as BDT 0.
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                      <MiniField label="Bank LC Fee (BDT)">
                        <BatchNumberInput
                          value={item.bankLcCharge}
                          onChange={(value) => onChange(item.id, { bankLcCharge: value })}
                        />
                      </MiniField>
                      <MiniField label="Agent Fee (BDT)">
                        <BatchNumberInput
                          value={item.portHandlingCharge}
                          onChange={(value) => onChange(item.id, { portHandlingCharge: value })}
                        />
                      </MiniField>
                      <MiniField label="Container Fee (BDT)">
                        <BatchNumberInput
                          value={item.foreignFreightCost}
                          onChange={(value) => onChange(item.id, { foreignFreightCost: value })}
                        />
                      </MiniField>
                      <MiniField label="C&F Charge (BDT)">
                        <BatchNumberInput
                          value={item.cnfCharge}
                          onChange={(value) => onChange(item.id, { cnfCharge: value })}
                        />
                      </MiniField>
                      <MiniField label="Transport Charge (BDT)">
                        <BatchNumberInput
                          value={item.foreignLocalTransportCost}
                          onChange={(value) =>
                            onChange(item.id, { foreignLocalTransportCost: value })
                          }
                        />
                      </MiniField>
                      <MiniField label="Other Cost (BDT)">
                        <BatchNumberInput
                          value={item.foreignOtherCost}
                          onChange={(value) => onChange(item.id, { foreignOtherCost: value })}
                        />
                      </MiniField>
                      <MiniField label="Total Price (BDT)">
                        <ReadOnlyCostValue
                          value={formatCompactMoney(preview.foreignLanded)}
                          emphasized
                        />
                      </MiniField>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-[12px] font-semibold text-biz-text">
                      Shipping & Bangladesh Cost (BDT)
                    </h4>
                    <span className="text-[10.5px] leading-4 text-biz-muted">
                      Default: {isAir ? "Air BDT 800/KG" : "Sea BDT 400/KG"} — editable
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                      <MiniField label={`Foreign Transport Fee (${currency})`}>
                        <BatchNumberInput
                          value={item.foreignTransportCharge}
                          onChange={(value) =>
                            onChange(item.id, { foreignTransportCharge: value })
                          }
                        />
                      </MiniField>
                      <MiniField label="Shipping Weight (KG)" required>
                        <BatchNumberInput
                          value={item.shippingWeightKg}
                          onChange={(value) =>
                            onChange(item.id, {
                              shippingWeightKg: value,
                              shippingRateBasis: "PER_KG",
                            })
                          }
                        />
                      </MiniField>
                      <MiniField label="Shipping Rate (BDT/KG)" required>
                        <BatchNumberInput
                          value={item.shippingRate}
                          onChange={(value) =>
                            onChange(item.id, {
                              shippingRate: value,
                              shippingRateBasis: "PER_KG",
                            })
                          }
                        />
                      </MiniField>
                      <MiniField label="Shipping Cost (BDT)">
                        <ReadOnlyCostValue value={formatCompactMoney(preview.shippingCostBdt)} />
                      </MiniField>
                      <MiniField label="Domestic Transport (BDT)">
                        <BatchNumberInput
                          value={item.foreignLocalTransportCost}
                          onChange={(value) =>
                            onChange(item.id, { foreignLocalTransportCost: value })
                          }
                        />
                      </MiniField>
                      <MiniField label="Warehouse to Project (BDT, Optional)">
                        <BatchNumberInput
                          value={item.domesticTransportCost}
                          onChange={(value) => onChange(item.id, { domesticTransportCost: value })}
                        />
                      </MiniField>
                      <MiniField label="Other Cost (BDT)">
                        <BatchNumberInput
                          value={item.foreignOtherCost}
                          onChange={(value) => onChange(item.id, { foreignOtherCost: value })}
                        />
                      </MiniField>
                      <MiniField label="Total Price (BDT)">
                        <ReadOnlyCostValue
                          value={formatCompactMoney(preview.foreignLanded)}
                          emphasized
                        />
                      </MiniField>
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-biz-border bg-biz-bg px-4 py-3">
        <span className="text-[10px] font-medium text-biz-muted">Batch Landed Cost</span>
        <strong className="text-[13px] text-biz-purple">
          BDT {formatCompactMoney(batchLandedCost)}
        </strong>
      </div>
    </div>
  );
}

function BatchNumberInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <TextInput
      className={`h-9 min-w-0 px-2 text-right text-[10.5px] ${NUMBER_INPUT_CLASS}`}
      type="number"
      min="0"
      step="any"
      value={value}
      placeholder={placeholder}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(event.target.value)}
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
  value,
  step = "any",
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <MiniField label={label} required={required}>
      <TextInput
        type="number"
        min="0"
        step={step}
        className={`h-9 min-w-0 px-2 text-[10.5px] ${NUMBER_INPUT_CLASS}`}
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        onChange={(event) => onChange(event.target.value)}
      />
    </MiniField>
  );
}

function ReadOnlyCostValue({ value, emphasized = false }: { value: string; emphasized?: boolean }) {
  return (
    <div
      className={`flex h-9 items-center justify-end rounded-md border border-biz-border bg-biz-bg px-2 text-[10.5px] ${
        emphasized ? "font-semibold text-biz-purple" : "font-medium text-biz-text"
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
