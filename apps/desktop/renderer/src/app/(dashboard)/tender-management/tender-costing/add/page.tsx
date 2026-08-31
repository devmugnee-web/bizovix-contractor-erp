"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  MoreVertical,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
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
  unitSalesPrice: string;
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
  customsDutyPercent: string;
  regulatoryDutyPercent: string;
  supplementaryDutyPercent: string;
  vatPercent: string;
  taxPercent: string;
}

let itemCounter = 0;
const SOURCING_OPTIONS = [
  { value: "LOCAL", label: "Local" },
  { value: "FOREIGN", label: "Foreign" },
  { value: "LOCAL_AND_FOREIGN", label: "Local & Foreign" },
];
const SOURCE_FILTER_OPTIONS = [
  { value: "ALL", label: "All Items" },
  ...SOURCING_OPTIONS,
  { value: "PENDING_COSTING", label: "Not Costed" },
  { value: "COSTED", label: "Costed" },
];
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
    unitSalesPrice: "",
    sourcingType,
    costingStatus: "NOT_COSTED",
    selectedSource: sourcingType === "FOREIGN" ? "FOREIGN" : sourcingType === "LOCAL" ? "LOCAL" : "",
    localSupplierName: "",
    localUnitPrice: "",
    localDiscountPercent: "0",
    localVatPercent: "0",
    localTaxPercent: "0",
    localTransportCost: "",
    localOtherCost: "",
    foreignSupplierName: "",
    foreignCountry: "",
    foreignCurrency: "USD",
    foreignUnitPrice: "",
    foreignExchangeRate: "1",
    exchangeRateDate: "",
    foreignFreightCost: "",
    foreignInsuranceCost: "",
    customsDutyPercent: "0",
    regulatoryDutyPercent: "0",
    supplementaryDutyPercent: "0",
    foreignVatPercent: "0",
    foreignTaxPercent: "0",
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

function formatMoney(value: number): string {
  return `BDT ${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatCompactMoney(value: number): string {
  return value.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function salesPriceFromMargin(unitCost: number, marginPercent: number): number {
  if (unitCost <= 0 || marginPercent >= 100) return 0;
  return unitCost / (1 - Math.max(0, marginPercent) / 100);
}

function calculateItemPreview(item: CostingItemForm) {
  const quantity = Number(item.quantity) || 0;
  const localBase = quantity * (Number(item.localUnitPrice) || 0);
  const localTaxable = localBase * (1 - (Number(item.localDiscountPercent) || 0) / 100);
  const localTotal =
    localTaxable *
      (1 +
        (Number(item.localVatPercent) || 0) / 100 +
        (Number(item.localTaxPercent) || 0) / 100) +
    (Number(item.localTransportCost) || 0) +
    (Number(item.localOtherCost) || 0);
  const foreignProductValue =
    quantity *
    (Number(item.foreignUnitPrice) || 0) *
    (Number(item.foreignExchangeRate) || 1);
  const assessable =
    foreignProductValue +
    (Number(item.foreignFreightCost) || 0) +
    (Number(item.foreignInsuranceCost) || 0);
  const dutyRate =
    ((Number(item.customsDutyPercent) || 0) +
      (Number(item.regulatoryDutyPercent) || 0) +
      (Number(item.supplementaryDutyPercent) || 0)) /
    100;
  const taxBase = assessable * (1 + dutyRate);
  const foreignLanded =
    taxBase *
      (1 +
        (Number(item.foreignVatPercent) || 0) / 100 +
        (Number(item.foreignTaxPercent) || 0) / 100) +
    (Number(item.cnfCharge) || 0) +
    (Number(item.portHandlingCharge) || 0) +
    (Number(item.bankLcCharge) || 0) +
    (Number(item.foreignLocalTransportCost) || 0) +
    (Number(item.foreignOtherCost) || 0);
  const selectedSource =
    item.sourcingType === "LOCAL"
      ? "LOCAL"
      : item.sourcingType === "FOREIGN"
        ? "FOREIGN"
        : item.selectedSource;
  const selectedGrandTotal = selectedSource === "FOREIGN" ? foreignLanded : localTotal;
  const selectedTotal = item.costingStatus === "COSTED" ? selectedGrandTotal : 0;
  const selectedUnitCost = quantity > 0 ? selectedGrandTotal / quantity : 0;
  const marginPercent = Number(item.marginPercent) || 0;
  const unitSalesPrice =
    Number(item.unitSalesPrice) > 0
      ? Number(item.unitSalesPrice)
      : salesPriceFromMargin(selectedUnitCost, marginPercent);
  const totalSales = unitSalesPrice * quantity;
  const totalProfit = totalSales - selectedGrandTotal;
  const selectedVatPercent = selectedSource === "FOREIGN"
    ? Number(item.foreignVatPercent) || 0
    : Number(item.localVatPercent) || 0;
  const selectedTaxPercent = selectedSource === "FOREIGN"
    ? Number(item.foreignTaxPercent) || 0
    : Number(item.localTaxPercent) || 0;
  return {
    localTotal,
    foreignProductValue,
    foreignLanded,
    selectedTotal,
    selectedGrandTotal,
    selectedUnitCost,
    unitSalesPrice,
    totalSales,
    totalProfit,
    selectedVatPercent,
    selectedTaxPercent,
  };
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
  const [bulkSourcingType, setBulkSourcingType] = React.useState<TenderCostingSourcingType | "">("");
  const [selectedItemIds, setSelectedItemIds] = React.useState<Set<string>>(new Set());
  const [activeCostingIds, setActiveCostingIds] = React.useState<Set<string>>(new Set());
  const [lastPreparedByUserId, setLastPreparedByUserId] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saveError, setSaveError] = React.useState("");
  const [budgetInput, setBudgetInput] = React.useState("");
  const [budgetError, setBudgetError] = React.useState("");
  const [budgetNotice, setBudgetNotice] = React.useState("");
  const [budgetActionsOpen, setBudgetActionsOpen] = React.useState(false);
  const [budgetEditorOpen, setBudgetEditorOpen] = React.useState(false);
  const [isDirty, setIsDirty] = React.useState(false);
  const [completeReviewOpen, setCompleteReviewOpen] = React.useState(false);
  const [profitSettingsOpen, setProfitSettingsOpen] = React.useState(false);
  const [localTargetMargin, setLocalTargetMargin] = React.useState("10");
  const [foreignTargetMargin, setForeignTargetMargin] = React.useState("10");
  const [bulkForeign, setBulkForeign] = React.useState<BulkForeignForm>({
    country: "",
    currency: "USD",
    exchangeRate: "1",
    exchangeRateDate: localDate(),
    customsDutyPercent: "0",
    regulatoryDutyPercent: "0",
    supplementaryDutyPercent: "0",
    vatPercent: "0",
    taxPercent: "0",
  });
  const [success, setSuccess] = React.useState<{ title: string; message: string } | null>(null);
  const hydratedId = React.useRef<string | undefined>(undefined);
  const costingWorkspaceRef = React.useRef<HTMLDivElement | null>(null);

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
    setBudgetInput(record.costingBudget ?? "");
    setItems(
      record.items.length > 0
        ? record.items.map((item) => ({
            id: item.id,
            costingDate: item.costingDate.slice(0, 10),
            preparedByUserId: item.preparedByUserId ?? "",
            description: item.description,
            secondaryDescription: item.secondaryDescription ?? "",
            unit: item.unit,
            quantity: item.quantity,
            marginPercent: item.marginPercent,
            unitSalesPrice:
              Number(item.unitCost) > 0
                ? String(
                    salesPriceFromMargin(
                      Number(item.unitCost),
                      Number(item.marginPercent) || 0,
                    ),
                  )
                : "",
            sourcingType: item.sourcingType,
            costingStatus: item.costingStatus,
            selectedSource: item.selectedSource ?? "",
            localSupplierName: item.localSupplierName ?? "",
            localUnitPrice: item.localUnitPrice === "0.00" ? "" : item.localUnitPrice,
            localDiscountPercent: item.localDiscountPercent,
            localVatPercent: item.localVatPercent,
            localTaxPercent: item.localTaxPercent,
            localTransportCost: item.localTransportCost === "0.00" ? "" : item.localTransportCost,
            localOtherCost: item.localOtherCost === "0.00" ? "" : item.localOtherCost,
            foreignSupplierName: item.foreignSupplierName ?? "",
            foreignCountry: item.foreignCountry ?? "",
            foreignCurrency: item.foreignCurrency,
            foreignUnitPrice: item.foreignUnitPrice === "0.0000" ? "" : item.foreignUnitPrice,
            foreignExchangeRate: item.foreignExchangeRate,
            exchangeRateDate: item.exchangeRateDate?.slice(0, 10) ?? "",
            foreignFreightCost: item.foreignFreightCost === "0.00" ? "" : item.foreignFreightCost,
            foreignInsuranceCost:
              item.foreignInsuranceCost === "0.00" ? "" : item.foreignInsuranceCost,
            customsDutyPercent: item.customsDutyPercent,
            regulatoryDutyPercent: item.regulatoryDutyPercent,
            supplementaryDutyPercent: item.supplementaryDutyPercent,
            foreignVatPercent: item.foreignVatPercent,
            foreignTaxPercent: item.foreignTaxPercent,
            cnfCharge: item.cnfCharge === "0.00" ? "" : item.cnfCharge,
            portHandlingCharge:
              item.portHandlingCharge === "0.00" ? "" : item.portHandlingCharge,
            bankLcCharge: item.bankLcCharge === "0.00" ? "" : item.bankLcCharge,
            foreignLocalTransportCost:
              item.foreignLocalTransportCost === "0.00" ? "" : item.foreignLocalTransportCost,
            foreignOtherCost: item.foreignOtherCost === "0.00" ? "" : item.foreignOtherCost,
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
      record.items.find((item) => item.sourcingType !== "FOREIGN")?.marginPercent ?? "10",
    );
    setForeignTargetMargin(
      record.items.find((item) => item.sourcingType !== "LOCAL")?.marginPercent ?? "10",
    );
    setActiveCostingIds(new Set());
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

  function updateItem(id: string, patch: Partial<CostingItemForm>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    setIsDirty(true);
  }

  function preparedByForItem(item: CostingItemForm) {
    return item.preparedByUserId || effectivePreparedByUserId;
  }

  function addAnotherItem() {
    const lastItem = items.at(-1);
    const inheritedPreparedByUserId = lastPreparedByUserId || effectivePreparedByUserId;
    setItems((current) => [
      ...current,
      blankItem(
        "",
        inheritedPreparedByUserId,
        header.costingDate || localDate(),
        lastItem?.sourcingType || "LOCAL",
      ),
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

  function applyProfitSettings() {
    const localMargin = Math.min(99.99, Math.max(0, Number(localTargetMargin) || 0));
    const foreignMargin = Math.min(99.99, Math.max(0, Number(foreignTargetMargin) || 0));
    const updatedItems = items.map((item) => ({
        ...item,
        unitSalesPrice: "",
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
              unitSalesPrice: "",
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
    const candidateIds =
      selectedItemIds.size > 0
        ? [...selectedItemIds]
        : filteredItems
            .filter((item) => item.sourcingType === "FOREIGN")
            .map((item) => item.id);
    if (candidateIds.length === 0) {
      setSaveError("No item is available in the current filter.");
      return;
    }
    setSaveError("");
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
      markItemCosted(item);
      return;
    }
    setSaveError("");
    setActiveCostingIds((current) => new Set([...current, item.id]));
    window.setTimeout(
      () => costingWorkspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      0,
    );
  }

  function applyBulkForeignSettings() {
    const targetIds = activeCostingIds;
    if (targetIds.size === 0 || Number(bulkForeign.exchangeRate) <= 0) {
      setSaveError("Enter a valid Foreign exchange rate first.");
      return;
    }
    setItems((current) =>
      current.map((item) =>
        targetIds.has(item.id) && item.sourcingType === "FOREIGN"
          ? {
              ...item,
              foreignCountry: bulkForeign.country,
              foreignCurrency: bulkForeign.currency,
              foreignExchangeRate: bulkForeign.exchangeRate,
              exchangeRateDate: bulkForeign.exchangeRateDate,
              customsDutyPercent: bulkForeign.customsDutyPercent,
              regulatoryDutyPercent: bulkForeign.regulatoryDutyPercent,
              supplementaryDutyPercent: bulkForeign.supplementaryDutyPercent,
              foreignVatPercent: bulkForeign.vatPercent,
              foreignTaxPercent: bulkForeign.taxPercent,
              costingStatus: "DRAFT",
            }
          : item,
      ),
    );
    setSaveError("");
    setIsDirty(true);
  }

  async function markAllActiveForeignCosted() {
    const targetItems = items.filter(
      (item) => activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN",
    );
    const incomplete = targetItems.find((item) => Number(item.foreignUnitPrice) <= 0);
    if (targetItems.length === 0 || incomplete) {
      setSaveError(
        incomplete
          ? `Enter Foreign Unit Price for ${incomplete.description || "every selected item"}.`
          : "No Foreign item is open for costing.",
      );
      return;
    }
    const updatedItems: CostingItemForm[] = items.map((item) =>
        activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN"
          ? { ...item, selectedSource: "FOREIGN", costingStatus: "COSTED" }
          : item,
      );
    setItems(updatedItems);
    setActiveCostingIds((current) => {
      const next = new Set(current);
      items
        .filter((item) => item.sourcingType === "FOREIGN")
        .forEach((item) => next.delete(item.id));
      return next;
    });
    setSelectedItemIds((current) => {
      const next = new Set(current);
      targetItems.forEach((item) => next.delete(item.id));
      return next;
    });
    setSaveError("");
    setIsDirty(true);
    await save(costing.data?.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS", updatedItems);
  }

  function markItemCosted(item: CostingItemForm) {
    const source =
      item.sourcingType === "LOCAL"
        ? "LOCAL"
        : item.sourcingType === "FOREIGN"
          ? "FOREIGN"
          : item.selectedSource;
    if (!source) {
      setSaveError(`Select the final Local or Foreign source for ${item.description || "this item"}.`);
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
    setSaveError("");
    updateItem(item.id, { selectedSource: source, costingStatus: "COSTED" });
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

  async function save(status: TenderCostingStatus, itemsOverride?: CostingItemForm[]) {
    const record = costing.data;
    const itemsToSave = itemsOverride ?? items;
    if (!record || !validate(status, itemsToSave)) return;
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
      setCompleteReviewOpen(false);
      const isCompletedUpdate = record.status === "COMPLETED" && status === "COMPLETED";
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
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : "Could not save tender costing.");
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
  const filteredItems = items.filter((item) => {
    if (sourceFilter === "ALL") return true;
    if (sourceFilter === "COSTED") return item.costingStatus === "COSTED";
    if (sourceFilter === "PENDING_COSTING") return item.costingStatus !== "COSTED";
    return item.sourcingType === sourceFilter;
  });
  const costedItemCount = items.filter((item) => item.costingStatus === "COSTED").length;
  const activeForeignItems = items.filter(
    (item) => activeCostingIds.has(item.id) && item.sourcingType === "FOREIGN",
  );
  const hasCalculatedCost = costedItemCount > 0;
  const isPartialCosting = hasCalculatedCost && costedItemCount < items.length;
  const costingCandidateItems =
    selectedItemIds.size > 0
      ? items.filter((item) => selectedItemIds.has(item.id))
      : filteredItems.filter((item) => item.sourcingType === "FOREIGN");
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
      items[index]?.selectedSource === "LOCAL" || items[index]?.sourcingType === "LOCAL"
        ? sum + preview.totalProfit
        : sum,
    0,
  );
  const foreignProfit = computed.reduce(
    (sum, preview, index) =>
      items[index]?.selectedSource === "FOREIGN" || items[index]?.sourcingType === "FOREIGN"
        ? sum + preview.totalProfit
        : sum,
    0,
  );
  const totalSales = computed.reduce((sum, preview) => sum + preview.totalSales, 0);
  const totalProfit = localProfit + foreignProfit;
  const overallProfitMargin = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;

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
  const isCompleted = record.status === "COMPLETED";
  const isReadOnly = record.status === "CANCELLED";
  const costingBudget = Number(record.costingBudget) || 0;
  const hasCostingBudget = costingBudget > 0;
  const canComplete =
    hasCostingBudget &&
    items.length > 0 &&
    items.every(
      (item) =>
        item.costingDate &&
        preparedByForItem(item) &&
        item.description.trim() &&
        item.unit.trim() &&
        Number(item.quantity) > 0 &&
        item.costingStatus === "COSTED",
    );

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
          action={!isReadOnly ? <ProfitAction onClick={() => setProfitSettingsOpen(true)} /> : undefined}
        />
        <CostingKpi
          label="Foreign Profit"
          value={formatMoney(foreignProfit)}
          tone="success"
          action={!isReadOnly ? <ProfitAction onClick={() => setProfitSettingsOpen(true)} /> : undefined}
        />
        <CostingKpi
          label="Profit Margin"
          value={`${overallProfitMargin.toFixed(2)}%`}
          tone="blue"
          action={!isReadOnly ? <ProfitAction onClick={() => setProfitSettingsOpen(true)} /> : undefined}
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
                Enter and save the approved costing budget. The item costing section will unlock automatically.
              </p>
            </div>
            <div className="flex min-w-[360px] items-end gap-2">
              <label className="flex flex-1 flex-col gap-1">
                <span className="text-[10.5px] font-medium text-biz-text">
                  Total Costing Budget (BDT) *
                </span>
                <TextInput
                  autoFocus
                  className="h-10 text-right font-semibold"
                  type="number"
                  min="0.01"
                  step="0.01"
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
          ["2", "Choose Source", "Select Local, Foreign or compare both"],
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
        <div className="rounded-lg border border-biz-border bg-biz-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-biz-text">1. Costing Items Intake</h2>
              <p className="text-[11px] text-biz-muted">
                Add multiple products first; source prices and import charges are entered later.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-biz-muted">Costing Date *</span>
                <TextInput
                  className="h-9 w-[145px] px-2 text-[11px]"
                  type="date"
                  value={header.costingDate}
                  onChange={(event) => updateCommonCostingDate(event.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-medium text-biz-muted">Prepared By *</span>
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
                  <th className="w-[12%] px-1 py-2">Product Name *</th>
                  <th className="w-[6%] px-0.5 py-2">Qty *</th>
                  <th className="w-[7%] px-0.5 py-2">Unit *</th>
                  <th className="w-[9%] px-0.5 py-2">Product Type</th>
                  <th className="w-[9%] px-0.5 py-2">Final Source</th>
                  <th className="w-[8%] px-0.5 py-2 text-right">Unit Cost</th>
                  <th className="w-[5%] px-0.5 py-2 text-right">VAT</th>
                  <th className="w-[5%] px-0.5 py-2 text-right">Tax</th>
                  <th className="w-[9%] px-0.5 py-2 text-right">Grand Total</th>
                  <th className="w-[9%] px-0.5 py-2 text-right">Unit Sales</th>
                  <th className="w-[10%] px-0.5 py-2 text-right">Total Profit</th>
                  <th className="w-[7%] px-0.5 py-2 text-center">Action</th>
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
                        <TextInput
                          className="h-9 min-w-0 px-1.5 text-[10px]"
                          value={item.description}
                          placeholder="Enter product"
                          onChange={(event) =>
                            updateItem(item.id, {
                              description: event.target.value,
                              costingStatus: "NOT_COSTED",
                              unitSalesPrice: "",
                            })
                          }
                        />
                      </td>
                      <td className="px-1 py-2">
                        <TextInput
                          className="h-9 min-w-0 px-1 text-[10px]"
                          type="number"
                          min="0.001"
                          step="0.001"
                          value={item.quantity}
                          onChange={(event) =>
                            updateItem(item.id, {
                              quantity: event.target.value,
                              costingStatus: "NOT_COSTED",
                            })
                          }
                        />
                      </td>
                      <td className="px-0.5 py-2">
                        <SelectInput
                          className="h-9 min-w-0 px-1 pr-4 text-[9px] xl:text-[10px]"
                          value={item.unit}
                          options={
                            UNIT_OPTIONS.some((option) => option.value === item.unit)
                              ? UNIT_OPTIONS
                              : [{ value: item.unit, label: item.unit }, ...UNIT_OPTIONS]
                          }
                          onChange={(event) => updateItem(item.id, { unit: event.target.value })}
                        />
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
                            });
                          }}
                        />
                      </td>
                      <td className="px-0.5 py-2">
                        {item.sourcingType === "LOCAL_AND_FOREIGN" ? (
                          <SelectInput
                            className="h-9 min-w-0 px-1 pr-4 text-[9px] xl:text-[10px]"
                            placeholder="Choose"
                            value={item.selectedSource}
                            options={[
                              { value: "LOCAL", label: "Local" },
                              { value: "FOREIGN", label: "Foreign" },
                            ]}
                            onChange={(event) =>
                              updateItem(item.id, {
                                selectedSource: event.target.value as TenderCostingSelectedSource,
                                marginPercent:
                                  event.target.value === "FOREIGN"
                                    ? foreignTargetMargin
                                    : localTargetMargin,
                                costingStatus: "NOT_COSTED",
                                unitSalesPrice: "",
                              })
                            }
                          />
                        ) : (
                          <span className="block truncate rounded bg-biz-bg px-2 py-2.5 font-medium text-biz-text">
                            {item.sourcingType === "FOREIGN" ? "Foreign" : "Local"}
                          </span>
                        )}
                      </td>
                      <td className="px-0.5 py-2">
                        {item.sourcingType === "LOCAL" ? (
                          <TextInput
                            className="h-8 min-w-0 px-1 text-right text-[9px]"
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.localUnitPrice}
                            onChange={(event) =>
                              updateItem(item.id, {
                                localUnitPrice: event.target.value,
                                costingStatus: "NOT_COSTED",
                              })
                            }
                          />
                        ) : (
                          <span className="block text-right font-medium text-biz-text">
                            {preview.selectedUnitCost > 0
                              ? formatCompactMoney(preview.selectedUnitCost)
                              : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-0.5 py-2">
                        {item.sourcingType === "LOCAL" ? (
                          <TextInput
                            className="h-8 min-w-0 px-1 text-right text-[9px]"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.localVatPercent}
                            onChange={(event) =>
                              updateItem(item.id, {
                                localVatPercent: event.target.value,
                                costingStatus: "NOT_COSTED",
                              })
                            }
                          />
                        ) : (
                          <span className="block text-right">{preview.selectedVatPercent.toFixed(2)}%</span>
                        )}
                      </td>
                      <td className="px-0.5 py-2">
                        {item.sourcingType === "LOCAL" ? (
                          <TextInput
                            className="h-8 min-w-0 px-1 text-right text-[9px]"
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.localTaxPercent}
                            onChange={(event) =>
                              updateItem(item.id, {
                                localTaxPercent: event.target.value,
                                costingStatus: "NOT_COSTED",
                              })
                            }
                          />
                        ) : (
                          <span className="block text-right">{preview.selectedTaxPercent.toFixed(2)}%</span>
                        )}
                      </td>
                      <td className="px-0.5 py-2 text-right font-semibold">{formatCompactMoney(preview.selectedGrandTotal)}</td>
                      <td className="px-0.5 py-2">
                        {item.sourcingType === "LOCAL" ? (
                          <TextInput
                          className="h-8 min-w-0 px-1 text-right text-[9px] text-biz-blue"
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unitSalesPrice}
                          placeholder={formatCompactMoney(preview.unitSalesPrice)}
                          onChange={(event) => {
                            const unitSalesPrice = event.target.value;
                            const salesValue = Number(unitSalesPrice) || 0;
                            const marginPercent =
                              preview.selectedUnitCost > 0 && salesValue > 0
                                ? Math.max(
                                    0,
                                    ((salesValue - preview.selectedUnitCost) / salesValue) * 100,
                                  )
                                : Number(item.marginPercent) || 0;
                            updateItem(item.id, {
                              unitSalesPrice,
                              marginPercent: String(marginPercent),
                            });
                          }}
                          />
                        ) : (
                          <span className="block text-right font-medium text-biz-blue">
                            {preview.unitSalesPrice > 0
                              ? formatCompactMoney(preview.unitSalesPrice)
                              : "—"}
                          </span>
                        )}
                      </td>
                      <td className="px-0.5 py-2 text-right font-semibold text-biz-success">{formatCompactMoney(preview.totalProfit)}</td>
                      <td className="px-0.5 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            className="h-8 rounded border border-biz-blue px-2 text-[9px] font-semibold text-biz-blue hover:bg-biz-blue hover:text-white"
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
                                : item.costingStatus === "COSTED"
                                  ? "Edit Cost"
                                  : "Cost"}
                          </button>
                        {items.length > 1 ? (
                          <IconButton
                            aria-label="Remove item"
                            onClick={() => {
                              setItems((current) => current.filter((row) => row.id !== item.id));
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
                              setIsDirty(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-biz-danger" />
                          </IconButton>
                        ) : (
                          null
                        )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-biz-border px-3 py-2.5">
            <span className="text-[11px] text-biz-muted">
              {costedItemCount} of {items.length} items costed &middot; {selectedItemIds.size} selected
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {selectedItemIds.size > 0 && (
                <>
                  <SelectInput
                    className="h-9 w-[150px] text-[11px]"
                    placeholder="Set source"
                    value={bulkSourcingType}
                    options={SOURCING_OPTIONS}
                    onChange={(event) =>
                      setBulkSourcingType(
                        event.target.value as TenderCostingSourcingType | "",
                      )
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
              <h2 className="text-[14px] font-semibold text-biz-text">2. Local / Foreign Costing Workspace</h2>
              <p className="text-[11px] text-biz-muted">
                Foreign prices are converted to BDT and all landed-cost charges are calculated automatically.
              </p>
            </div>
            {activeForeignItems.length > 0 && (
              <div className="rounded-lg border border-biz-blue/25 bg-biz-blue/5 p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[12px] font-semibold text-biz-text">
                      Common Foreign Settings ({activeForeignItems.length} items)
                    </h3>
                    <p className="text-[10px] text-biz-muted">
                      Apply shared import rates once. Unit price, shipping and other amounts remain item-specific.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <SecondaryButton className="h-9" onClick={applyBulkForeignSettings}>
                      Apply Common Settings
                    </SecondaryButton>
                    <PrimaryButton
                      className="h-9"
                      disabled={saveCosting.isPending}
                      onClick={markAllActiveForeignCosted}
                    >
                      {saveCosting.isPending ? "Saving..." : "Save All Foreign Costing"}
                    </PrimaryButton>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
                  <MiniField label="Country">
                    <TextInput
                      className="h-9 px-2 text-[10px]"
                      value={bulkForeign.country}
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
                        setBulkForeign((current) => ({ ...current, currency: event.target.value }))
                      }
                    />
                  </MiniField>
                  <BulkForeignNumber label="Exchange Rate" field="exchangeRate" value={bulkForeign.exchangeRate} onChange={setBulkForeign} />
                  <MiniField label="Rate Date">
                    <TextInput
                      type="date"
                      className="h-9 px-1 text-[9px]"
                      value={bulkForeign.exchangeRateDate}
                      onChange={(event) =>
                        setBulkForeign((current) => ({ ...current, exchangeRateDate: event.target.value }))
                      }
                    />
                  </MiniField>
                  <BulkForeignNumber label="Customs %" field="customsDutyPercent" value={bulkForeign.customsDutyPercent} onChange={setBulkForeign} />
                  <BulkForeignNumber label="Regulatory %" field="regulatoryDutyPercent" value={bulkForeign.regulatoryDutyPercent} onChange={setBulkForeign} />
                  <BulkForeignNumber label="Supplementary %" field="supplementaryDutyPercent" value={bulkForeign.supplementaryDutyPercent} onChange={setBulkForeign} />
                  <BulkForeignNumber label="VAT %" field="vatPercent" value={bulkForeign.vatPercent} onChange={setBulkForeign} />
                  <BulkForeignNumber label="Tax %" field="taxPercent" value={bulkForeign.taxPercent} onChange={setBulkForeign} />
                </div>
              </div>
            )}
            {activeForeignItems.length > 0 && (
              <ForeignBatchTable
                items={activeForeignItems}
                onChange={(id, patch) =>
                  updateItem(id, { ...patch, costingStatus: "DRAFT" })
                }
              />
            )}
            {items
              .filter(
                (item) =>
                  activeCostingIds.has(item.id) && item.sourcingType !== "FOREIGN",
              )
              .map((item) => (
                <CostingWorkspaceCard
                  key={item.id}
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

      </fieldset>
      </div>

      {saveError && (
        <div className="rounded-md border border-biz-danger/20 bg-biz-danger/5 px-4 py-3 text-[12.5px] text-biz-danger">
          {saveError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-biz-border bg-biz-surface px-4 py-3">
        <SecondaryButton
          disabled={isReadOnly || !hasCostingBudget || !isDirty || saveCosting.isPending}
          title={
            isDirty
              ? isCompleted
                ? "Save changes and keep this costing completed"
                : "Save current costing progress"
              : "No unsaved changes"
          }
          onClick={() => save(isCompleted ? "COMPLETED" : "IN_PROGRESS")}
        >
          <Save className="h-4 w-4" />
          {saveCosting.isPending ? "Saving..." : isCompleted ? "Save Changes" : "Save Progress"}
        </SecondaryButton>
        {!isCompleted && (
          <PrimaryButton
            disabled={isReadOnly || !canComplete || saveCosting.isPending}
            title={
              !canComplete
                ? "Complete costing and select Prepared By for every item first"
                : "Save and complete this costing"
            }
            onClick={() => setCompleteReviewOpen(true)}
          >
            <Send className="h-4 w-4" />
            {saveCosting.isPending ? "Saving..." : "Save & Complete"}
          </PrimaryButton>
        )}
      </div>

      <Modal
        open={completeReviewOpen}
        onClose={() => setCompleteReviewOpen(false)}
        title="Review & Complete Costing"
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2">
            <CostingKpi label="Total Items" value={String(items.length)} />
            <CostingKpi
              label="Costed Items"
              value={`${costedItemCount}/${items.length}`}
              tone="success"
            />
            <CostingKpi label="Total Costing Budget" value={formatMoney(costingBudget)} />
            <CostingKpi
              label="Estimated Cost"
              value={formatMoney(estimatedTotal)}
              tone="blue"
            />
          </div>
          <p className="rounded-md border border-biz-warning/25 bg-biz-warning/5 px-3 py-2.5 text-[11.5px] text-biz-text">
            All items are costed. After completion, this tender costing will become read-only.
          </p>
          <div className="flex justify-end gap-2">
            <SecondaryButton
              disabled={saveCosting.isPending}
              onClick={() => setCompleteReviewOpen(false)}
            >
              Back
            </SecondaryButton>
            <PrimaryButton
              disabled={saveCosting.isPending}
              onClick={() => save("COMPLETED")}
            >
              <Send className="h-4 w-4" />
              {saveCosting.isPending ? "Completing..." : "Confirm & Complete"}
            </PrimaryButton>
          </div>
        </div>
      </Modal>

      <Modal
        open={profitSettingsOpen}
        onClose={() => setProfitSettingsOpen(false)}
        title="Profit Margin Settings"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[11.5px] text-biz-muted">
            These target margins calculate Unit Sales Price and Profit automatically for Local and Foreign items.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Local Target Profit Margin (%)">
              <TextInput
                type="number"
                min="0"
                max="99.99"
                step="0.01"
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
                step="0.01"
                value={foreignTargetMargin}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
                onChange={(event) => setForeignTargetMargin(event.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <SecondaryButton onClick={() => setProfitSettingsOpen(false)}>Cancel</SecondaryButton>
            <PrimaryButton
              disabled={saveCosting.isPending}
              onClick={applyProfitSettings}
            >
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
          <Field label="Total Costing Budget (BDT)" error={budgetError}>
            <TextInput
              autoFocus
              type="number"
              min="0.01"
              step="0.01"
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
        primaryLabel="Back to Costing List"
        onPrimary={() => router.push(`/tender-management/tender-costing?costingId=${record.id}`)}
        secondaryLabel={success?.title === "Costing Completed" ? undefined : "Continue Editing"}
        onSecondary={() => setSuccess(null)}
      />
    </div>
  );
}

function ForeignBatchTable({
  items,
  onChange,
}: {
  items: CostingItemForm[];
  onChange: (id: string, patch: Partial<CostingItemForm>) => void;
}) {
  const totals = items.reduce(
    (summary, item) => {
      const preview = calculateItemPreview(item);
      return {
        landed: summary.landed + preview.foreignLanded,
        sales: summary.sales + preview.totalSales,
        profit: summary.profit + preview.totalProfit,
      };
    },
    { landed: 0, sales: 0, profit: 0 },
  );
  return (
    <div className="overflow-hidden rounded-lg border border-biz-border bg-biz-surface shadow-card">
      <div className="border-b border-biz-border px-3 py-2">
        <h3 className="text-[12px] font-semibold text-biz-text">Foreign Product Costing</h3>
        <p className="text-[9.5px] text-biz-muted">
          Enter item-specific prices and charges; Landed Cost and Profit update automatically.
        </p>
      </div>
      <table className="w-full table-fixed text-left text-[8px] xl:text-[9px]">
        <thead className="bg-biz-bg text-biz-muted">
          <tr>
            <th className="w-[12%] px-1 py-2">Product</th>
            <th className="w-[4%] px-0.5 py-2">Qty</th>
            <th className="w-[10%] px-0.5 py-2">Supplier</th>
            <th className="w-[7%] px-0.5 py-2">Unit Price</th>
            <th className="w-[7%] px-0.5 py-2">Freight</th>
            <th className="w-[7%] px-0.5 py-2">Insurance</th>
            <th className="w-[6%] px-0.5 py-2">C&amp;F</th>
            <th className="w-[6%] px-0.5 py-2">Port</th>
            <th className="w-[6%] px-0.5 py-2">Bank/LC</th>
            <th className="w-[7%] px-0.5 py-2">Local Trans.</th>
            <th className="w-[6%] px-0.5 py-2">Other</th>
            <th className="w-[8%] px-0.5 py-2 text-right">Landed</th>
            <th className="w-[8%] px-0.5 py-2">Sales Price</th>
            <th className="w-[6%] px-0.5 py-2 text-right">Profit</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const preview = calculateItemPreview(item);
            return (
              <tr key={item.id} className="border-t border-biz-border">
                <td className="truncate px-1 py-1.5 font-medium text-biz-text" title={item.description}>
                  {item.description}
                </td>
                <td className="px-0.5 py-1.5 text-biz-muted">{item.quantity}</td>
                <td className="px-0.5 py-1.5">
                  <TextInput
                    className="h-8 min-w-0 px-1 text-[8.5px]"
                    value={item.foreignSupplierName}
                    onChange={(event) =>
                      onChange(item.id, { foreignSupplierName: event.target.value })
                    }
                  />
                </td>
                <td className="px-0.5 py-1.5"><BatchNumberInput value={item.foreignUnitPrice} onChange={(value) => onChange(item.id, { foreignUnitPrice: value })} /></td>
                <td className="px-0.5 py-1.5"><BatchNumberInput value={item.foreignFreightCost} onChange={(value) => onChange(item.id, { foreignFreightCost: value })} /></td>
                <td className="px-0.5 py-1.5"><BatchNumberInput value={item.foreignInsuranceCost} onChange={(value) => onChange(item.id, { foreignInsuranceCost: value })} /></td>
                <td className="px-0.5 py-1.5"><BatchNumberInput value={item.cnfCharge} onChange={(value) => onChange(item.id, { cnfCharge: value })} /></td>
                <td className="px-0.5 py-1.5"><BatchNumberInput value={item.portHandlingCharge} onChange={(value) => onChange(item.id, { portHandlingCharge: value })} /></td>
                <td className="px-0.5 py-1.5"><BatchNumberInput value={item.bankLcCharge} onChange={(value) => onChange(item.id, { bankLcCharge: value })} /></td>
                <td className="px-0.5 py-1.5"><BatchNumberInput value={item.foreignLocalTransportCost} onChange={(value) => onChange(item.id, { foreignLocalTransportCost: value })} /></td>
                <td className="px-0.5 py-1.5"><BatchNumberInput value={item.foreignOtherCost} onChange={(value) => onChange(item.id, { foreignOtherCost: value })} /></td>
                <td className="px-0.5 py-1.5 text-right font-semibold text-biz-purple">{formatCompactMoney(preview.foreignLanded)}</td>
                <td className="px-0.5 py-1.5">
                  <BatchNumberInput
                    value={item.unitSalesPrice}
                    placeholder={formatCompactMoney(preview.unitSalesPrice)}
                    onChange={(unitSalesPrice) => {
                      const salesValue = Number(unitSalesPrice) || 0;
                      const marginPercent =
                        preview.selectedUnitCost > 0 && salesValue > 0
                          ? ((salesValue - preview.selectedUnitCost) / salesValue) * 100
                          : Number(item.marginPercent) || 0;
                      onChange(item.id, {
                        unitSalesPrice,
                        marginPercent: String(Math.max(0, marginPercent)),
                      });
                    }}
                  />
                </td>
                <td className="px-0.5 py-1.5 text-right font-semibold text-biz-success">{formatCompactMoney(preview.totalProfit)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t border-biz-border bg-biz-bg font-semibold text-biz-text">
          <tr>
            <td colSpan={11} className="px-2 py-2 text-right">Batch Total</td>
            <td className="px-0.5 py-2 text-right">{formatCompactMoney(totals.landed)}</td>
            <td className="px-0.5 py-2 text-right">{formatCompactMoney(totals.sales)}</td>
            <td className="px-0.5 py-2 text-right text-biz-success">{formatCompactMoney(totals.profit)}</td>
          </tr>
        </tfoot>
      </table>
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
      className="h-8 min-w-0 px-1 text-right text-[8.5px]"
      type="number"
      min="0"
      step="0.01"
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
              label={SOURCING_OPTIONS.find((option) => option.value === item.sourcingType)?.label ?? item.sourcingType}
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

      <div className={`grid gap-3 p-3 ${showLocal && showForeign ? "xl:grid-cols-2" : "grid-cols-1"}`}>
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
              <NumberCostField label="Unit Price (BDT)" value={item.localUnitPrice} onChange={(value) => onChange({ localUnitPrice: value })} />
              <NumberCostField label="Discount %" value={item.localDiscountPercent} onChange={(value) => onChange({ localDiscountPercent: value })} />
              <NumberCostField label="VAT %" value={item.localVatPercent} onChange={(value) => onChange({ localVatPercent: value })} />
              <NumberCostField label="Tax / AIT %" value={item.localTaxPercent} onChange={(value) => onChange({ localTaxPercent: value })} />
              <NumberCostField label="Transport (BDT)" value={item.localTransportCost} onChange={(value) => onChange({ localTransportCost: value })} />
              <NumberCostField label="Other Cost (BDT)" value={item.localOtherCost} onChange={(value) => onChange({ localOtherCost: value })} />
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
                <TextInput className="h-9 px-2 text-[11px]" value={item.foreignSupplierName} onChange={(event) => onChange({ foreignSupplierName: event.target.value })} />
              </MiniField>
              <MiniField label="Country">
                <TextInput className="h-9 px-2 text-[11px]" value={item.foreignCountry} onChange={(event) => onChange({ foreignCountry: event.target.value })} />
              </MiniField>
              <MiniField label="Currency">
                <SelectInput className="h-9 text-[11px]" value={item.foreignCurrency} options={CURRENCY_OPTIONS} onChange={(event) => onChange({ foreignCurrency: event.target.value })} />
              </MiniField>
              <NumberCostField label="Foreign Unit Price" value={item.foreignUnitPrice} step="0.0001" onChange={(value) => onChange({ foreignUnitPrice: value })} />
              <NumberCostField label="1 Currency = BDT" value={item.foreignExchangeRate} step="0.000001" onChange={(value) => onChange({ foreignExchangeRate: value })} />
              <MiniField label="Rate Date">
                <TextInput type="date" className="h-9 px-2 text-[10px]" value={item.exchangeRateDate} onChange={(event) => onChange({ exchangeRateDate: event.target.value })} />
              </MiniField>
              <NumberCostField label="Freight / Shipping" value={item.foreignFreightCost} onChange={(value) => onChange({ foreignFreightCost: value })} />
              <NumberCostField label="Insurance" value={item.foreignInsuranceCost} onChange={(value) => onChange({ foreignInsuranceCost: value })} />
              <NumberCostField label="Customs Duty %" value={item.customsDutyPercent} onChange={(value) => onChange({ customsDutyPercent: value })} />
              <NumberCostField label="Regulatory Duty %" value={item.regulatoryDutyPercent} onChange={(value) => onChange({ regulatoryDutyPercent: value })} />
              <NumberCostField label="Supplementary Duty %" value={item.supplementaryDutyPercent} onChange={(value) => onChange({ supplementaryDutyPercent: value })} />
              <NumberCostField label="VAT %" value={item.foreignVatPercent} onChange={(value) => onChange({ foreignVatPercent: value })} />
              <NumberCostField label="Tax / AIT %" value={item.foreignTaxPercent} onChange={(value) => onChange({ foreignTaxPercent: value })} />
              <NumberCostField label="C&F Charge" value={item.cnfCharge} onChange={(value) => onChange({ cnfCharge: value })} />
              <NumberCostField label="Port / Handling" value={item.portHandlingCharge} onChange={(value) => onChange({ portHandlingCharge: value })} />
              <NumberCostField label="Bank / LC Charge" value={item.bankLcCharge} onChange={(value) => onChange({ bankLcCharge: value })} />
              <NumberCostField label="Local Transport" value={item.foreignLocalTransportCost} onChange={(value) => onChange({ foreignLocalTransportCost: value })} />
              <NumberCostField label="Other Cost" value={item.foreignOtherCost} onChange={(value) => onChange({ foreignOtherCost: value })} />
            </div>
          </div>
        )}
      </div>
      {showLocal && showForeign && (
        <div className="grid grid-cols-3 border-t border-biz-border bg-biz-bg/60 text-center text-[10.5px]">
          <div className="p-2">Local: <strong>{formatMoney(preview.localTotal)}</strong></div>
          <div className="border-x border-biz-border p-2">Foreign: <strong>{formatMoney(preview.foreignLanded)}</strong></div>
          <div className="p-2">Difference: <strong>{formatMoney(Math.abs(preview.localTotal - preview.foreignLanded))}</strong></div>
        </div>
      )}
    </div>
  );
}

function MiniField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block truncate text-[10px] text-biz-muted" title={label}>{label}</span>
      {children}
    </label>
  );
}

function NumberCostField({
  label,
  value,
  step = "0.01",
  onChange,
}: {
  label: string;
  value: string;
  step?: string;
  onChange: (value: string) => void;
}) {
  return (
    <MiniField label={label}>
      <TextInput
        type="number"
        min="0"
        step={step}
        className="h-9 min-w-0 px-2 text-[10.5px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </MiniField>
  );
}

function BulkForeignNumber({
  label,
  field,
  value,
  onChange,
}: {
  label: string;
  field: keyof BulkForeignForm;
  value: string;
  onChange: React.Dispatch<React.SetStateAction<BulkForeignForm>>;
}) {
  return (
    <MiniField label={label}>
      <TextInput
        type="number"
        min="0"
        step="0.0001"
        className="h-9 min-w-0 px-1.5 text-[10px]"
        value={value}
        onChange={(event) =>
          onChange((current) => ({ ...current, [field]: event.target.value }))
        }
      />
    </MiniField>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-biz-muted">{label}</span>
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
      aria-label="Edit profit margin settings"
      className="flex h-5 w-5 items-center justify-center rounded text-biz-muted hover:bg-biz-bg hover:text-biz-blue sm:h-6 sm:w-6"
      onClick={onClick}
    >
      <MoreVertical className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
    </button>
  );
}
