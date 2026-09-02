"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { BellRing, Check, Info, Monitor, MoreVertical, Paperclip, Pencil, PlayCircle, PlusCircle, RefreshCw, Save, Search, Sparkles, Wrench, X } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { ConfirmationDialog } from "@/components/shared/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildWorkspaceRoute } from "@/config/routes";
import { useCurrentSessionQuery, useWorkflowSettingsQuery } from "@/hooks/use-app-query";
import { useEscapeDismiss } from "@/hooks/use-escape-dismiss";
import { useSessionContext } from "@/hooks/use-session-context";
import {
  formatDate,
  formatDateTime,
  setDateFormatPreference,
  type AppDateFormat,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { openVideoChannel } from "@/lib/app-actions";
import { WarehouseSettingsPanel } from "@/features/screens/warehouse-settings-panel";
import {
  getWorkspaceAutoBackupSettings,
  getWorkspaceCostingSettings,
  saveWorkspaceAutoBackupSettings,
  type CostingSettingsRecord,
} from "@/services/auto-backup-settings.service";
import {
  buildDefaultCloudConnection,
  sha256Hex,
  uploadWorkspaceBackupToCloud,
  type CloudSyncConnection,
} from "@/services/cloud-sync.service";
import {
  buildWorkspaceBackup,
  describeBackupCounts,
  downloadWorkspaceBackup,
  formatBackupSize,
  WORKSPACE_BACKUP_EXPORT_TYPE,
} from "@/services/workspace-backup";
import {
  defaultWorkflowSettings,
  isWorkflowSettingsQueryKeyForMode,
  saveWorkspaceWorkflowSettings,
  workflowPreset,
  workflowSettingsQueryKey,
  type WorkflowPolicy,
  type WorkflowSettingsRecord,
} from "@/services/workflow-settings.service";

type SettingsSectionKey =
  | "general"
  | "workflow"
  | "transaction"
  | "print"
  | "taxes"
  | "transaction-message"
  | "party"
  | "item"
  | "warehouse"
  | "service-reminders"
  | "multi-currency"
  | "date-format";

type AutoBackupSettings = {
  passcodeEnabled: boolean;
  businessCurrency: string;
  dateFormat: AppDateFormat;
  decimalPlaces: number;
  printerType: "regular" | "thermal";
  printerCustomizeMode: "layout" | "colors";
  printerTheme: string;
  thermalTheme: string;
  printerPrimaryColor: string;
  printerAccentColor: string;
  printerSurfaceColor: string;
  invoiceBillNumberEnabled: boolean;
  addTimeOnTransactions: boolean;
  cashSaleDefault: boolean;
  billingNameOfParties: boolean;
  customerPoDetails: boolean;
  tinNumberEnabled: boolean;
  stopSaleNegativeStock: boolean;
  blockNewItems: boolean;
  blockNewParties: boolean;
  multiFirmEnabled: boolean;
  selectedFirm: string;
  autoBackupEnabled: boolean;
  transactionHistoryEnabled: boolean;
  liveExchangeRateEnabled: boolean;
  estimateEnabled: boolean;
  proformaEnabled: boolean;
  orderEnabled: boolean;
  otherIncomeEnabled: boolean;
  fixedAssetsEnabled: boolean;
  inclusiveTaxOnRate: boolean;
  displayPurchasePrice: boolean;
  showLastFiveSalePrice: boolean;
  showLastFivePurchasePrice: boolean;
  freeItemQuantity: boolean;
  countTextEnabled: boolean;
  transactionWiseTax: boolean;
  transactionWiseDiscount: boolean;
  roundOffTotal: boolean;
  roundOffNearest: string;
  roundOffTo: string;
  quickEntry: boolean;
  hideInvoicePreview: boolean;
  passcodeForTransactionEditDelete: boolean;
  discountDuringPayments: boolean;
  linkPaymentsToInvoices: boolean;
  dueDatesAndPaymentTerms: boolean;
  showProfitWhileMakingSaleInvoice: boolean;
  termsAndConditionsEnabled: boolean;
  prefixSale: string;
  prefixCreditNote: string;
  prefixSaleOrder: string;
  prefixPurchaseOrder: string;
  prefixEstimate: string;
  prefixProformaInvoice: string;
  prefixDeliveryChallan: string;
  prefixPaymentIn: string;
  billingType: "lite-sale" | "full-sale";
  transactionMessageType: string;
  sendMessageToParty: boolean;
  sendTransactionUpdateMessage: boolean;
  sendMessageCopyToSelf: boolean;
  partyCurrentBalanceInMessage: boolean;
  webInvoiceLinkInMessage: boolean;
  autoMessageSales: boolean;
  autoMessagePurchase: boolean;
  autoMessageSalesReturn: boolean;
  autoMessagePurchaseReturn: boolean;
  autoMessagePaymentIn: boolean;
  autoMessagePaymentOut: boolean;
  autoMessageSaleOrder: boolean;
  autoMessagePurchaseOrder: boolean;
  autoMessageEstimate: boolean;
  autoMessageProformaInvoice: boolean;
  autoMessageDeliveryChallan: boolean;
  autoMessageCancelledInvoice: boolean;
  transactionMessageGreeting: string;
  transactionMessageDetails: string;
  transactionMessageFooter: string;
  partyGrouping: boolean;
  shippingAddressEnabled: boolean;
  printShippingAddress: boolean;
  managePartyStatus: boolean;
  enablePaymentReminder: boolean;
  paymentReminderDays: number;
  serviceRemindersEnabled: boolean;
  additionalField1Enabled: boolean;
  additionalField1Label: string;
  additionalField1ShowInPrint: boolean;
  additionalField2Enabled: boolean;
  additionalField2Label: string;
  additionalField2ShowInPrint: boolean;
  additionalField3Enabled: boolean;
  additionalField3Label: string;
  additionalField3ShowInPrint: boolean;
  additionalField4Enabled: boolean;
  additionalField4Label: string;
  additionalField4Format: string;
  additionalField4ShowInPrint: boolean;
  enableLoyaltyPoint: boolean;
  enableItem: boolean;
  itemSellType: string;
  barcodeScanEnabled: boolean;
  stockMaintenanceEnabled: boolean;
  manufacturingEnabled: boolean;
  showLowStockDialog: boolean;
  itemsUnitEnabled: boolean;
  defaultUnitEnabled: boolean;
  itemCategoryEnabled: boolean;
  partyWiseItemRateEnabled: boolean;
  itemDescriptionEnabled: boolean;
  itemDescriptionLabel: string;
  itemWiseTaxEnabled: boolean;
  itemWiseDiscountEnabled: boolean;
  updateSalePriceFromTransaction: boolean;
  itemQuantityDecimalPlaces: number;
  deadStockMonths: number;
  wholesalePriceEnabled: boolean;
  mrpEnabled: boolean;
  mrpLabel: string;
  serialTrackingEnabled: boolean;
  serialTrackingLabel: string;
  batchNoEnabled: boolean;
  batchNoLabel: string;
  expDateEnabled: boolean;
  expDateFormat: string;
  expDateLabel: string;
  mfgDateEnabled: boolean;
  mfgDateFormat: string;
  mfgDateLabel: string;
  modelNoEnabled: boolean;
  modelNoLabel: string;
  sizeEnabled: boolean;
  sizeLabel: string;
  deliveryChallanEnabled: boolean;
  goodsReturnEnabled: boolean;
  printAmountEnabled: boolean;
  regularPrinterDefault: boolean;
  repeatHeaderInAllPages: boolean;
  printCompanyName: boolean;
  companyDisplayName: string;
  printCompanyLogo: boolean;
  printCompanyAddress: boolean;
  companyAddress: string;
  printCompanyEmail: boolean;
  companyEmail: string;
  printCompanyPhone: boolean;
  companyPhone: string;
  paperSize: string;
  printOrientation: string;
  companyNameTextSize: string;
  invoiceTextSize: string;
  printOriginalDuplicate: boolean;
  extraTopPdfSpace: number;
  expandItemTable: boolean;
  minRowsInItemTable: number;
  totalItemQuantityEnabled: boolean;
  amountWithDecimalEnabled: boolean;
  receivedAmountEnabled: boolean;
  balanceAmountEnabled: boolean;
  currentBalancePartyEnabled: boolean;
  taxDetailsEnabled: boolean;
  taxCountry: string;
  taxSystem: string;
  taxRegistrationLabel: string;
  taxRegistrationNumber: string;
  youSavedEnabled: boolean;
  printAmountGrouping: boolean;
  amountInWordsFormat: string;
  printDescriptionEnabled: boolean;
  printTermsEnabled: boolean;
  printReceivedByDetails: boolean;
  printDeliveredByDetails: boolean;
  printSignatureTextEnabled: boolean;
  printSignatureText: string;
  paymentModeEnabled: boolean;
  printAcknowledgementEnabled: boolean;
  storeTransferEnabled: boolean;
  screenZoom: number;
  backupFrequency: "daily" | "weekly" | "monthly";
  backupWindow: string;
  lastBackupAt: string;
};

type BackupHistoryEntry = {
  id: string;
  label: string;
  status: "successful" | "pending" | "failed";
  timestamp: string;
};

type TaxRateEntry = {
  id: string;
  name: string;
  rate: string;
  kind: string;
};

type TaxGroupEntry = {
  id: string;
  name: string;
  taxRateIds: string[];
};

type CurrencyEntry = {
  id: string;
  name: string;
  code?: string;
  symbol: string;
  exchangeRate: string;
  bdtRate?: string;
  setOnDate: string;
  isBase: boolean;
};

type LiveExchangeQuote = {
  baseCode: string;
  quoteCode: string;
  rate: number;
};

const currencyCodeAliases: Record<string, string> = {
  dollar: "USD", "us dollar": "USD", usd: "USD", taka: "BDT", tk: "BDT", bdt: "BDT",
  euro: "EUR", eur: "EUR", pound: "GBP", "british pound": "GBP", gbp: "GBP",
  rupee: "INR", "indian rupee": "INR", inr: "INR", yen: "JPY", jpy: "JPY",
  yuan: "CNY", cny: "CNY", dirham: "AED", aed: "AED", riyal: "SAR", sar: "SAR",
};

const currencyInputCodeAliases: Record<string, string> = {
  YEN: "JPY",
  RMB: "CNY",
  UKP: "GBP",
};

function normalizeCurrencyCode(value: string | undefined) {
  const code = value?.trim().toUpperCase() ?? "";
  return currencyInputCodeAliases[code] ?? code;
}

function isSupportedCurrencyCode(code: string) {
  if (!/^[A-Z]{3}$/.test(code)) return false;
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: code }).format(1);
    return true;
  } catch {
    return false;
  }
}

function getCurrencyCode(currency: Pick<CurrencyEntry, "code" | "name" | "symbol">) {
  const explicit = normalizeCurrencyCode(currency.code);
  if (explicit && /^[A-Z]{3}$/.test(explicit)) return explicit;
  const name = currency.name.trim().toLowerCase();
  return currencyCodeAliases[name] ?? (currency.symbol === "$" ? "USD" : currency.symbol === "৳" ? "BDT" : "");
}

function getCurrencyName(code: string) {
  try {
    return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function getCurrencySymbol(code: string) {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((part) => part.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

type ExitAction =
  | { type: "route"; href: string }
  | { type: "close" }
  | { type: "history-back" }
  | null;

const settingsSections: Array<{ key: SettingsSectionKey; label: string; keywords: string }> = [
  { key: "general", label: "GENERAL", keywords: "application passcode business currency amount decimal tin firm backup zoom stock" },
  { key: "workflow", label: "SALES & PURCHASE FLOW", keywords: "workflow direct advanced order purchase receipt delivery invoice small business" },
  { key: "transaction", label: "TRANSACTION", keywords: "invoice billing sale purchase payment discount due round off quick entry" },
  { key: "print", label: "PRINT", keywords: "printer thermal theme color invoice document layout" },
  { key: "taxes", label: "TAXES", keywords: "tax vat gst rate group inclusive" },
  { key: "transaction-message", label: "TRANSACTION MESSAGE", keywords: "message whatsapp customer party greeting footer notification" },
  { key: "party", label: "PARTY", keywords: "customer supplier shipping address balance" },
  { key: "item", label: "ITEM", keywords: "product inventory stock price quantity" },
  { key: "warehouse", label: "WAREHOUSE", keywords: "warehouse godown location stock transfer inventory" },
  { key: "service-reminders", label: "SERVICE REMINDERS", keywords: "service reminder notification schedule" },
  { key: "multi-currency", label: "MULTI CURRENCY", keywords: "currency exchange rate symbol base" },
  { key: "date-format", label: "DATE FORMAT", keywords: "date day month year dd mm yyyy display format" },
];

const zoomSteps = [70, 80, 90, 100, 110, 115, 120, 130] as const;
const regularPrintThemes = [
  { id: "tally", label: "Tally Theme" },
  { id: "landscape-1", label: "Landscape Theme 1" },
  { id: "landscape-2", label: "Landscape Theme 2" },
  { id: "tax-theme", label: "Tax Theme 1" },
] as const;
const thermalPrintThemes = [
  { id: "thermal-classic", label: "Classic Roll" },
  { id: "thermal-bold", label: "Bold Counter" },
  { id: "thermal-clean", label: "Clean Receipt" },
] as const;
const taxCountryPresets = [
  {
    code: "BD",
    label: "Bangladesh",
    taxSystem: "VAT",
    registrationLabel: "BIN / VAT Registration No.",
    defaultRates: [
      { name: "Standard VAT", rate: "15", kind: "VAT" },
      { name: "Zero Rated VAT", rate: "0", kind: "VAT" },
    ],
    defaultGroupName: "Bangladesh VAT",
  },
  {
    code: "IN",
    label: "India",
    taxSystem: "GST",
    registrationLabel: "GSTIN",
    defaultRates: [
      { name: "GST 5%", rate: "5", kind: "GST" },
      { name: "GST 12%", rate: "12", kind: "GST" },
      { name: "GST 18%", rate: "18", kind: "GST" },
    ],
    defaultGroupName: "India GST",
  },
  {
    code: "AE",
    label: "United Arab Emirates",
    taxSystem: "VAT",
    registrationLabel: "TRN",
    defaultRates: [
      { name: "UAE VAT", rate: "5", kind: "VAT" },
      { name: "Zero Rated", rate: "0", kind: "VAT" },
    ],
    defaultGroupName: "UAE VAT",
  },
  {
    code: "UK",
    label: "United Kingdom",
    taxSystem: "VAT",
    registrationLabel: "VAT Number",
    defaultRates: [
      { name: "Standard VAT", rate: "20", kind: "VAT" },
      { name: "Reduced VAT", rate: "5", kind: "VAT" },
      { name: "Zero Rated", rate: "0", kind: "VAT" },
    ],
    defaultGroupName: "UK VAT",
  },
  {
    code: "SA",
    label: "Saudi Arabia",
    taxSystem: "VAT",
    registrationLabel: "VAT Registration No.",
    defaultRates: [
      { name: "Saudi VAT", rate: "15", kind: "VAT" },
      { name: "Zero Rated", rate: "0", kind: "VAT" },
    ],
    defaultGroupName: "Saudi VAT",
  },
  {
    code: "US",
    label: "United States",
    taxSystem: "Sales Tax",
    registrationLabel: "Sales Tax Permit",
    defaultRates: [
      { name: "State Sales Tax", rate: "8", kind: "Sales Tax" },
      { name: "Zero Rated", rate: "0", kind: "Sales Tax" },
    ],
    defaultGroupName: "US Sales Tax",
  },
] as const;

function buildDefaultSettings(): AutoBackupSettings {
  return {
    passcodeEnabled: false,
    businessCurrency: "Tk",
    dateFormat: "DD/MM/YYYY",
    decimalPlaces: 2,
    printerType: "regular",
    printerCustomizeMode: "layout",
    printerTheme: "tally",
    thermalTheme: "thermal-classic",
    printerPrimaryColor: "#0f4fe3",
    printerAccentColor: "#f07d11",
    printerSurfaceColor: "#f5f7fb",
    invoiceBillNumberEnabled: true,
    addTimeOnTransactions: false,
    cashSaleDefault: false,
    billingNameOfParties: false,
    customerPoDetails: false,
    tinNumberEnabled: false,
    stopSaleNegativeStock: false,
    blockNewItems: false,
    blockNewParties: false,
    multiFirmEnabled: false,
    selectedFirm: "Bizovix Trading Limited",
    autoBackupEnabled: true,
    transactionHistoryEnabled: true,
    liveExchangeRateEnabled: false,
    estimateEnabled: true,
    proformaEnabled: true,
    orderEnabled: true,
    otherIncomeEnabled: false,
    fixedAssetsEnabled: false,
    inclusiveTaxOnRate: true,
    displayPurchasePrice: true,
    showLastFiveSalePrice: false,
    showLastFivePurchasePrice: false,
    freeItemQuantity: false,
    countTextEnabled: false,
    transactionWiseTax: true,
    transactionWiseDiscount: true,
    roundOffTotal: true,
    roundOffNearest: "Nearest",
    roundOffTo: "1",
    quickEntry: false,
    hideInvoicePreview: false,
    passcodeForTransactionEditDelete: false,
    discountDuringPayments: false,
    linkPaymentsToInvoices: true,
    dueDatesAndPaymentTerms: false,
    showProfitWhileMakingSaleInvoice: false,
    termsAndConditionsEnabled: true,
    prefixSale: "None",
    prefixCreditNote: "None",
    prefixSaleOrder: "None",
    prefixPurchaseOrder: "None",
    prefixEstimate: "None",
    prefixProformaInvoice: "None",
    prefixDeliveryChallan: "None",
    prefixPaymentIn: "None",
    billingType: "full-sale",
    transactionMessageType: "Sales Transaction",
    sendMessageToParty: true,
    sendTransactionUpdateMessage: false,
    sendMessageCopyToSelf: false,
    partyCurrentBalanceInMessage: false,
    webInvoiceLinkInMessage: true,
    autoMessageSales: true,
    autoMessagePurchase: true,
    autoMessageSalesReturn: true,
    autoMessagePurchaseReturn: true,
    autoMessagePaymentIn: true,
    autoMessagePaymentOut: true,
    autoMessageSaleOrder: true,
    autoMessagePurchaseOrder: false,
    autoMessageEstimate: false,
    autoMessageProformaInvoice: false,
    autoMessageDeliveryChallan: false,
    autoMessageCancelledInvoice: true,
    transactionMessageGreeting: "Thanks for your purchase with us!!\nPurchase Details:",
    transactionMessageDetails: "Invoice Amount: 792\nReceived: 300\nBalance: 492\nTotal Balance: 800",
    transactionMessageFooter: "Footer",
    partyGrouping: false,
    shippingAddressEnabled: true,
    printShippingAddress: true,
    managePartyStatus: false,
    enablePaymentReminder: true,
    paymentReminderDays: 1,
    serviceRemindersEnabled: false,
    additionalField1Enabled: false,
    additionalField1Label: "Additional Field 1",
    additionalField1ShowInPrint: false,
    additionalField2Enabled: false,
    additionalField2Label: "Additional Field 2",
    additionalField2ShowInPrint: false,
    additionalField3Enabled: false,
    additionalField3Label: "Additional Field 3",
    additionalField3ShowInPrint: false,
    additionalField4Enabled: false,
    additionalField4Label: "Additional Field 4",
    additionalField4Format: "dd/mm/yyyy",
    additionalField4ShowInPrint: false,
    enableLoyaltyPoint: true,
    enableItem: true,
    itemSellType: "Product/Service",
    barcodeScanEnabled: false,
    stockMaintenanceEnabled: true,
    manufacturingEnabled: false,
    showLowStockDialog: true,
    itemsUnitEnabled: true,
    defaultUnitEnabled: false,
    itemCategoryEnabled: true,
    partyWiseItemRateEnabled: false,
    itemDescriptionEnabled: false,
    itemDescriptionLabel: "Description",
    itemWiseTaxEnabled: false,
    itemWiseDiscountEnabled: false,
    updateSalePriceFromTransaction: false,
    itemQuantityDecimalPlaces: 2,
    deadStockMonths: 12,
    wholesalePriceEnabled: false,
    mrpEnabled: false,
    mrpLabel: "MRP",
    serialTrackingEnabled: false,
    serialTrackingLabel: "Serial No.",
    batchNoEnabled: false,
    batchNoLabel: "Batch No.",
    expDateEnabled: false,
    expDateFormat: "dd/mm/yyyy",
    expDateLabel: "Exp. Date",
    mfgDateEnabled: false,
    mfgDateFormat: "dd/mm/yyyy",
    mfgDateLabel: "Mfg. Date",
    modelNoEnabled: false,
    modelNoLabel: "Model No.",
    sizeEnabled: false,
    sizeLabel: "Size",
    deliveryChallanEnabled: true,
    goodsReturnEnabled: true,
    printAmountEnabled: false,
    regularPrinterDefault: true,
    repeatHeaderInAllPages: true,
    printCompanyName: true,
    companyDisplayName: "Bizovix Trading Limited",
    printCompanyLogo: true,
    printCompanyAddress: true,
    companyAddress: "",
    printCompanyEmail: true,
    companyEmail: "accounts@bizovix.com",
    printCompanyPhone: true,
    companyPhone: "",
    paperSize: "A4",
    printOrientation: "Portrait",
    companyNameTextSize: "Large",
    invoiceTextSize: "Medium",
    printOriginalDuplicate: false,
    extraTopPdfSpace: 0,
    expandItemTable: true,
    minRowsInItemTable: 0,
    totalItemQuantityEnabled: true,
    amountWithDecimalEnabled: true,
    receivedAmountEnabled: true,
    balanceAmountEnabled: true,
    currentBalancePartyEnabled: false,
    taxDetailsEnabled: true,
    taxCountry: "BD",
    taxSystem: "VAT",
    taxRegistrationLabel: "BIN / VAT Registration No.",
    taxRegistrationNumber: "",
    youSavedEnabled: true,
    printAmountGrouping: true,
    amountInWordsFormat: "Bangladesh",
    printDescriptionEnabled: true,
    printTermsEnabled: true,
    printReceivedByDetails: true,
    printDeliveredByDetails: true,
    printSignatureTextEnabled: true,
    printSignatureText: "Authorized Signatory",
    paymentModeEnabled: false,
    printAcknowledgementEnabled: false,
    storeTransferEnabled: false,
    screenZoom: 100,
    backupFrequency: "daily",
    backupWindow: "04:07 PM",
    lastBackupAt: "",
  };
}

function buildDefaultHistory(): BackupHistoryEntry[] {
  return [];
}

function buildDefaultTaxRates(): TaxRateEntry[] {
  return [];
}

function buildDefaultTaxGroups(): TaxGroupEntry[] {
  return [];
}

function buildDefaultCurrencies(): CurrencyEntry[] {
  return [];
}

function buildTaxPresetEntries(countryCode: string) {
  const preset = taxCountryPresets.find((entry) => entry.code === countryCode) ?? taxCountryPresets[0];
  const rates = preset.defaultRates.map((rate) => ({
    id: crypto.randomUUID(),
    name: rate.name,
    rate: rate.rate,
    kind: rate.kind,
  }));

  return {
    preset,
    rates,
    groups: [
      {
        id: crypto.randomUUID(),
        name: preset.defaultGroupName,
        taxRateIds: rates.map((rate) => rate.id),
      },
    ] as TaxGroupEntry[],
  };
}

function sanitizeSettings(rawSettings: Partial<AutoBackupSettings> | null | undefined): AutoBackupSettings {
  const defaults = buildDefaultSettings();

  if (!rawSettings) {
    return defaults;
  }

  const nextSettings = { ...defaults } as Record<keyof AutoBackupSettings, AutoBackupSettings[keyof AutoBackupSettings]>;

  for (const [key, defaultValue] of Object.entries(defaults) as Array<[keyof AutoBackupSettings, AutoBackupSettings[keyof AutoBackupSettings]]>) {
    const incomingValue = rawSettings[key];

    if (incomingValue === undefined || incomingValue === null) {
      nextSettings[key] = defaultValue;
      continue;
    }

    if (typeof defaultValue === "boolean") {
      nextSettings[key] = Boolean(incomingValue) as AutoBackupSettings[keyof AutoBackupSettings];
      continue;
    }

    if (typeof defaultValue === "number") {
      nextSettings[key] = (typeof incomingValue === "number" && Number.isFinite(incomingValue) ? incomingValue : defaultValue) as AutoBackupSettings[keyof AutoBackupSettings];
      continue;
    }

    nextSettings[key] = String(incomingValue) as AutoBackupSettings[keyof AutoBackupSettings];
  }

  if (!zoomSteps.includes(nextSettings.screenZoom as (typeof zoomSteps)[number])) {
    nextSettings.screenZoom = defaults.screenZoom;
  }

  if (!["daily", "weekly", "monthly"].includes(String(nextSettings.backupFrequency))) {
    nextSettings.backupFrequency = defaults.backupFrequency;
  }

  if (!["lite-sale", "full-sale"].includes(String(nextSettings.billingType))) {
    nextSettings.billingType = defaults.billingType;
  }

  if (!["regular", "thermal"].includes(String(nextSettings.printerType))) {
    nextSettings.printerType = defaults.printerType;
  }

  if (!["layout", "colors"].includes(String(nextSettings.printerCustomizeMode))) {
    nextSettings.printerCustomizeMode = defaults.printerCustomizeMode;
  }
  if (String(nextSettings.dateFormat) !== "DD/MM/YYYY") {
    nextSettings.dateFormat = defaults.dateFormat;
  }
  nextSettings.additionalField4Format = "dd/mm/yyyy";
  nextSettings.expDateFormat = "dd/mm/yyyy";
  nextSettings.mfgDateFormat = "dd/mm/yyyy";
  const deadStockMonths = Number(nextSettings.deadStockMonths);
  if (!Number.isSafeInteger(deadStockMonths) || deadStockMonths < 1) {
    nextSettings.deadStockMonths = defaults.deadStockMonths;
  } else {
    nextSettings.deadStockMonths = deadStockMonths;
  }

  return nextSettings as AutoBackupSettings;
}

function formatBackupStamp(value: string) {
  if (!value) {
    return "Never";
  }

  return formatDateTime(value);
}

function getDesktopDeviceId() {
  if (typeof window === "undefined") {
    return "desktop-device";
  }

  const key = "bizovix:desktop-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

function getCloudSyncStorageKey(mode: string, workspaceId: string) {
  return `bizovix:cloud-sync:${mode}:${workspaceId}`;
}

function readStoredCloudConnection(mode: string, workspaceId: string): CloudSyncConnection {
  const fallback = buildDefaultCloudConnection();

  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = window.localStorage.getItem(getCloudSyncStorageKey(mode, workspaceId));
  if (!raw) {
    return fallback;
  }

  try {
    return { ...fallback, ...(JSON.parse(raw) as Partial<CloudSyncConnection>) };
  } catch {
    return fallback;
  }
}

function writeStoredCloudConnection(mode: string, workspaceId: string, connection: CloudSyncConnection) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(getCloudSyncStorageKey(mode, workspaceId), JSON.stringify(connection));
}

function coerceArray<T>(value: unknown, fallback: T[]): T[] {
  return Array.isArray(value) ? (value as T[]) : fallback;
}

function coerceSettingsObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Partial<AutoBackupSettings>) : null;
}

function SettingCheckboxRow({
  checked,
  label,
  hint,
  onChange,
}: {
  checked: boolean;
  label: string;
  hint?: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-w-0 items-start gap-3 py-2">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 rounded border-[#b7c5da]" />
      <span className="min-w-0 flex-1">
        <span className="inline-flex max-w-full flex-wrap items-center gap-1 text-[15px] text-[#132949]">
          {label}
          <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
        </span>
        {hint ? <span className="mt-1 block text-sm leading-5 text-[#73819b]">{hint}</span> : null}
      </span>
    </label>
  );
}

function SettingToggleInputRow({
  checked,
  label,
  value,
  placeholder,
  onToggle,
  onChange,
  type = "text",
  trailing,
}: {
  checked: boolean;
  label: string;
  value: string | number;
  placeholder?: string;
  onToggle: (checked: boolean) => void;
  onChange: (value: string) => void;
  type?: "text" | "number";
  trailing?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 py-2">
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onToggle(event.target.checked)} className="h-5 w-5 shrink-0 rounded border-[#b7c5da]" />
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 text-xs font-medium text-[#7b879c]">{label}</div>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Input
            type={type}
            value={value}
            placeholder={placeholder}
            disabled={!checked}
            onChange={(event) => onChange(event.target.value)}
            className="h-10 min-w-0 flex-1 rounded-[8px] border-[#d7dfeb] disabled:cursor-not-allowed disabled:bg-[#f6f8fc] disabled:text-[#9aa7bb]"
          />
          {trailing}
        </div>
      </div>
    </div>
  );
}

function SettingSelectRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[15px] text-[#132949]">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="h-10 min-w-0 w-full rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949]">
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function PrintThemeCard({
  label,
  selected,
  onClick,
  accentColor,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  accentColor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative rounded-[12px] border bg-white p-3 text-left transition",
        selected ? "border-transparent shadow-[0_0_0_2px_rgba(15,79,227,0.18)]" : "border-[#d7dfeb] hover:border-[#c5d4eb]",
      )}
      style={selected ? { boxShadow: `0 0 0 2px ${accentColor}22` } : undefined}
    >
      <div className="mb-3 flex h-[88px] items-center justify-center rounded-[10px] border border-[#e7edf6] bg-[#f8fafc]">
        <div className="w-[74px] rounded-[8px] border border-[#c9d3e5] bg-white p-2 shadow-sm">
          <div className="mb-1 h-2 rounded" style={{ backgroundColor: selected ? accentColor : "#b8c4d8" }} />
          <div className="space-y-1">
            <div className="h-1 rounded bg-[#dbe3f0]" />
            <div className="h-1 rounded bg-[#dbe3f0]" />
            <div className="grid grid-cols-3 gap-1">
              <div className="h-1 rounded bg-[#eef3fa]" />
              <div className="h-1 rounded bg-[#eef3fa]" />
              <div className="h-1 rounded bg-[#eef3fa]" />
            </div>
          </div>
        </div>
      </div>
      <div className="text-sm font-medium text-[#132949]">{label}</div>
      {selected ? (
        <span className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-white" style={{ backgroundColor: accentColor }}>
          <Check className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </button>
  );
}

export function AutoBackupScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isUtilityAutoBackupPage = pathname.includes("/utilities/auto-backup");
  const isFullSettingsPage = pathname.includes("/masters/settings") || isUtilityAutoBackupPage;
  const { mode, session } = useSessionContext();
  const currentSessionQuery = useCurrentSessionQuery(mode);
  const activeSession = currentSessionQuery.data;
  const workflowWorkspaceId = session?.workspaceId ?? (mode === "api" ? "" : "workspace");
  const workflowSettingsQuery = useWorkflowSettingsQuery(mode, workflowWorkspaceId || null);
  const skipPopConfirmationRef = useRef(false);
  const exitActionHandledRef = useRef(false);
  const storageKey = `bizovix:auto-backup:${mode}:${session?.workspaceId ?? "default"}`;
  const historyKey = `${storageKey}:history`;
  const taxRatesKey = `${storageKey}:tax-rates`;
  const taxGroupsKey = `${storageKey}:tax-groups`;
  const currenciesKey = `${storageKey}:currencies`;
  const activeSectionStorageKey = `${storageKey}:active-section`;
  const requestedSettingsSection = searchParams.get("section");
  const [mounted, setMounted] = useState(false);
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("general");
  const [menuQuery, setMenuQuery] = useState("");
  const [settings, setSettings] = useState<AutoBackupSettings>(buildDefaultSettings);
  const [history, setHistory] = useState<BackupHistoryEntry[]>(buildDefaultHistory);
  const [taxRates, setTaxRates] = useState<TaxRateEntry[]>(buildDefaultTaxRates);
  const [taxGroups, setTaxGroups] = useState<TaxGroupEntry[]>(buildDefaultTaxGroups);
  const [currencies, setCurrencies] = useState<CurrencyEntry[]>(buildDefaultCurrencies);
  const [currencyModal, setCurrencyModal] = useState<"base" | "new" | null>(null);
  const [currencyName, setCurrencyName] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [currencySymbol, setCurrencySymbol] = useState("");
  const [currencyExchangeRate, setCurrencyExchangeRate] = useState("1");
  const [isRefreshingExchangeRates, setIsRefreshingExchangeRates] = useState(false);
  const [lastExchangeRateUpdate, setLastExchangeRateUpdate] = useState<string | null>(null);
  const [liveExchangeQuote, setLiveExchangeQuote] = useState<LiveExchangeQuote | null>(null);
  const [availableCurrencyCodes, setAvailableCurrencyCodes] = useState<string[]>([]);
  const [isLoadingCurrencyCatalog, setIsLoadingCurrencyCatalog] = useState(false);
  const liveRateAutoRefreshRef = useRef("");
  const [taxModal, setTaxModal] = useState<"rate" | "group" | null>(null);
  const [taxRateName, setTaxRateName] = useState("");
  const [taxRateValue, setTaxRateValue] = useState("");
  const [taxRateKind, setTaxRateKind] = useState("Other");
  const [taxGroupName, setTaxGroupName] = useState("");
  const [taxGroupSelections, setTaxGroupSelections] = useState<string[]>([]);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const [exitAction, setExitAction] = useState<ExitAction>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isLoadingPersistedSettings, setIsLoadingPersistedSettings] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isRunningBackup, setIsRunningBackup] = useState(false);
  const [costingSettings, setCostingSettings] = useState<CostingSettingsRecord | null>(null);
  const [workflowSettings, setWorkflowSettings] = useState<WorkflowSettingsRecord>(defaultWorkflowSettings);
  const [workflowSettingsDirty, setWorkflowSettingsDirty] = useState(false);

  useEscapeDismiss(Boolean(taxModal), closeTaxModal);
  useEscapeDismiss(Boolean(currencyModal), closeCurrencyModal);

  useEffect(() => {
    if (!workflowSettingsQuery.data || workflowSettingsDirty) return;
    setWorkflowSettings(workflowSettingsQuery.data);
  }, [workflowSettingsDirty, workflowSettingsQuery.data]);

  useEffect(() => {
    const savedSection = window.localStorage.getItem(activeSectionStorageKey);
    const initialSection = settingsSections.some((section) => section.key === requestedSettingsSection)
      ? requestedSettingsSection
      : savedSection;
    if (initialSection && settingsSections.some((section) => section.key === initialSection)) {
      setActiveSection(initialSection as SettingsSectionKey);
      if (requestedSettingsSection === initialSection) {
        window.localStorage.setItem(activeSectionStorageKey, initialSection);
      }
    }
    setMounted(true);

    if (isFullSettingsPage) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeSectionStorageKey, isFullSettingsPage, requestedSettingsSection]);

  useEffect(() => {
    if (mode !== "api" || !session?.workspaceId) {
      return;
    }

    let cancelled = false;
    getWorkspaceCostingSettings(session.workspaceId)
      .then((record) => {
        if (!cancelled) setCostingSettings(record);
      })
      .catch(() => {
        // Non-critical read — the Item Settings screen simply omits the row.
      });

    return () => {
      cancelled = true;
    };
  }, [mode, session?.workspaceId]);

  useEffect(() => {
    if (!isFullSettingsPage || typeof window === "undefined") {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    const handleDocumentClick = (event: MouseEvent) => {
      if (!hasUnsavedChanges) {
        return;
      }

      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || anchor.target === "_blank") {
        return;
      }

      const nextUrl = new URL(anchor.href, window.location.origin);
      const currentUrl = new URL(window.location.href);
      if (nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search) {
        return;
      }

      event.preventDefault();
      exitActionHandledRef.current = false;
      setExitAction({ type: "route", href: `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}` });
      setExitDialogOpen(true);
    };

    const handlePopState = () => {
      if (skipPopConfirmationRef.current) {
        skipPopConfirmationRef.current = false;
        return;
      }

      window.history.pushState({ confirmExit: true }, "", window.location.href);

      if (!hasUnsavedChanges) {
        return;
      }

      exitActionHandledRef.current = false;
      setExitAction({ type: "history-back" });
      setExitDialogOpen(true);
    };

    window.history.pushState({ confirmExit: true }, "", window.location.href);
    window.addEventListener("beforeunload", handleBeforeUnload);
    window.addEventListener("popstate", handlePopState);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      window.removeEventListener("popstate", handlePopState);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [isFullSettingsPage, hasUnsavedChanges]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let cancelled = false;

    const rawSettings = window.localStorage.getItem(storageKey);
    const rawHistory = window.localStorage.getItem(historyKey);
    const rawTaxRates = window.localStorage.getItem(taxRatesKey);
    const rawTaxGroups = window.localStorage.getItem(taxGroupsKey);
    const rawCurrencies = window.localStorage.getItem(currenciesKey);

    if (rawSettings) {
      try {
      const normalizedSettings = sanitizeSettings(JSON.parse(rawSettings) as Partial<AutoBackupSettings>);
      setSettings(normalizedSettings);
      applyScreenZoom(normalizedSettings.screenZoom);
      setDateFormatPreference(normalizedSettings.dateFormat);
    } catch {
      window.localStorage.removeItem(storageKey);
      const defaultSettings = buildDefaultSettings();
      applyScreenZoom(defaultSettings.screenZoom);
      setDateFormatPreference(defaultSettings.dateFormat);
    }
  } else {
    const defaultSettings = buildDefaultSettings();
    applyScreenZoom(defaultSettings.screenZoom);
    setDateFormatPreference(defaultSettings.dateFormat);
    }

    if (rawHistory) {
      try {
        const parsed = JSON.parse(rawHistory) as BackupHistoryEntry[];
        setHistory(Array.isArray(parsed) ? parsed : buildDefaultHistory());
      } catch {
        window.localStorage.removeItem(historyKey);
      }
    }

    if (rawTaxRates) {
      try {
        const parsed = JSON.parse(rawTaxRates) as TaxRateEntry[];
        setTaxRates(Array.isArray(parsed) ? parsed : buildDefaultTaxRates());
      } catch {
        window.localStorage.removeItem(taxRatesKey);
      }
    }

    if (rawTaxGroups) {
      try {
        const parsed = JSON.parse(rawTaxGroups) as TaxGroupEntry[];
        setTaxGroups(Array.isArray(parsed) ? parsed : buildDefaultTaxGroups());
      } catch {
        window.localStorage.removeItem(taxGroupsKey);
      }
    }

    if (rawCurrencies) {
      try {
        const parsed = JSON.parse(rawCurrencies) as CurrencyEntry[];
        setCurrencies(Array.isArray(parsed) ? parsed : buildDefaultCurrencies());
      } catch {
        window.localStorage.removeItem(currenciesKey);
      }
    }

    if (mode !== "api" || !session?.workspaceId) {
      return;
    }

    setIsLoadingPersistedSettings(true);
    void getWorkspaceAutoBackupSettings(session.workspaceId)
      .then((record) => {
        if (cancelled) {
          return;
        }

        const remoteSettings = coerceSettingsObject(record.settings);
        if (remoteSettings) {
      const normalizedSettings = sanitizeSettings(remoteSettings);
      setSettings(normalizedSettings);
      applyScreenZoom(normalizedSettings.screenZoom);
      setDateFormatPreference(normalizedSettings.dateFormat);
        }

        setHistory(coerceArray<BackupHistoryEntry>(record.history, buildDefaultHistory()));
        setTaxRates(coerceArray<TaxRateEntry>(record.taxRates, buildDefaultTaxRates()));
        setTaxGroups(coerceArray<TaxGroupEntry>(record.taxGroups, buildDefaultTaxGroups()));
        setCurrencies(coerceArray<CurrencyEntry>(record.currencies, buildDefaultCurrencies()));
        setHasUnsavedChanges(false);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : "Could not load saved settings");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingPersistedSettings(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currenciesKey, historyKey, mode, session?.workspaceId, storageKey, taxGroupsKey, taxRatesKey]);

  useEffect(() => {
    const companyName = activeSession?.company.name?.trim();
    if (!companyName) {
      return;
    }

    setSettings((current) => {
      const shouldReplaceFirm = !current.selectedFirm || current.selectedFirm === "Bizovix Trading Limited" || current.selectedFirm === "ACA Enterprise";
      const shouldReplaceDisplayName = !current.companyDisplayName || current.companyDisplayName === "Bizovix Trading Limited" || current.companyDisplayName === "ACA Enterprise";

      if (!shouldReplaceFirm && !shouldReplaceDisplayName) {
        return current;
      }

      return {
        ...current,
        selectedFirm: shouldReplaceFirm ? companyName : current.selectedFirm,
        companyDisplayName: shouldReplaceDisplayName ? companyName : current.companyDisplayName,
      };
    });
  }, [activeSession?.company.name]);

  const filteredSections = useMemo(() => {
    const query = menuQuery.trim().toLowerCase();
    if (!query) {
      return settingsSections;
    }

    return settingsSections.filter((section) => `${section.label} ${section.keywords}`.toLowerCase().includes(query));
  }, [menuQuery]);

  function handleSectionSearch(value: string) {
    setMenuQuery(value);
    const query = value.trim().toLowerCase();
    if (!query) return;

    const firstMatch = settingsSections.find((section) =>
      `${section.label} ${section.keywords}`.toLowerCase().includes(query),
    );
    if (firstMatch) selectSettingsSection(firstMatch.key);
  }

  function selectSettingsSection(section: SettingsSectionKey) {
    setActiveSection(section);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(activeSectionStorageKey, section);
    }
  }
  const availableFirmOptions = useMemo(() => {
    return Array.from(
      new Set(
        [
          activeSession?.company.name,
          settings.selectedFirm,
        ].filter((value): value is string => Boolean(value?.trim())),
      ),
    );
  }, [activeSession?.company.name, settings.selectedFirm]);
  const pageTitle = isUtilityAutoBackupPage ? "Automatic Backup" : "Settings";
  const pageDescription = isUtilityAutoBackupPage
    ? "Manage backup schedules, workspace history, and safety controls from a full page instead of a popup."
    : "";

  function applyScreenZoom(zoomLevel: number) {
    if (typeof document === "undefined") {
      return;
    }

    document.documentElement.style.zoom = `${zoomLevel}%`;
  }

  function focusSettingsSection(section: SettingsSectionKey) {
    setMenuQuery("");
    selectSettingsSection(section);
  }

  function openCompanyProfileEditor() {
    router.push(buildWorkspaceRoute(mode, "/company-profile"));
  }

  function openWhatsappWeb() {
    if (typeof window === "undefined") {
      return;
    }

    window.open("https://web.whatsapp.com/", "_blank", "noopener,noreferrer");
  }

  function openServiceRemindersGuide() {
    if (typeof window === "undefined") {
      return;
    }

    window.open("https://www.youtube.com/results?search_query=service+reminders+business", "_blank", "noopener,noreferrer");
  }

  function patchSettings(patch: Partial<AutoBackupSettings>) {
    setSettings((current) => ({
      ...current,
      ...patch,
    }));
    setHasUnsavedChanges(true);
  }

  function patchWorkflowSettings(
    patch: Partial<Pick<WorkflowSettingsRecord, "purchaseWorkflow" | "salesWorkflow">>,
  ) {
    setWorkflowSettings((current) => ({ ...current, ...patch }));
    setWorkflowSettingsDirty(true);
    setHasUnsavedChanges(true);
  }

  function selectWorkflowPreset(preset: "DIRECT" | "ADVANCED" | "CUSTOM") {
    if (preset === "DIRECT") {
      patchWorkflowSettings({ purchaseWorkflow: "DIRECT", salesWorkflow: "DIRECT" });
      return;
    }
    if (preset === "ADVANCED") {
      patchWorkflowSettings({ purchaseWorkflow: "ORDER_BASED", salesWorkflow: "ORDER_BASED" });
      return;
    }
    if (workflowPreset(workflowSettings) !== "CUSTOM") {
      patchWorkflowSettings({ purchaseWorkflow: "BOTH", salesWorkflow: "BOTH" });
    }
  }

  async function persistSettingsSnapshot(
    nextSettings: AutoBackupSettings,
    nextHistory: BackupHistoryEntry[],
    nextTaxRates: TaxRateEntry[],
    nextTaxGroups: TaxGroupEntry[],
    nextCurrencies: CurrencyEntry[],
  ) {
    if (typeof window !== "undefined") {
    window.localStorage.setItem(storageKey, JSON.stringify(nextSettings));
    setDateFormatPreference(nextSettings.dateFormat);
      window.localStorage.setItem(historyKey, JSON.stringify(nextHistory));
      window.localStorage.setItem(taxRatesKey, JSON.stringify(nextTaxRates));
      window.localStorage.setItem(taxGroupsKey, JSON.stringify(nextTaxGroups));
      window.localStorage.setItem(currenciesKey, JSON.stringify(nextCurrencies));
    }

    if (mode === "api" && session?.workspaceId) {
      await saveWorkspaceAutoBackupSettings(session.workspaceId, {
        settings: nextSettings as unknown as Record<string, unknown>,
        history: nextHistory,
        taxRates: nextTaxRates,
        taxGroups: nextTaxGroups,
        currencies: nextCurrencies,
      });
    }
  }

  async function handleSave(showToast = true) {
    try {
      setIsSavingSettings(true);
      if (workflowSettingsDirty && !workflowWorkspaceId) {
        throw new Error("Active workspace is not ready");
      }
      const [settingsSaveResult, workflowSaveResult] = await Promise.allSettled([
        persistSettingsSnapshot(settings, history, taxRates, taxGroups, currencies),
        workflowSettingsDirty && workflowWorkspaceId
          ? saveWorkspaceWorkflowSettings(mode, workflowWorkspaceId, {
              purchaseWorkflow: workflowSettings.purchaseWorkflow,
              salesWorkflow: workflowSettings.salesWorkflow,
            })
          : Promise.resolve(null),
      ]);
      const savedWorkflowSettings = workflowSaveResult.status === "fulfilled"
        ? workflowSaveResult.value
        : null;
      if (savedWorkflowSettings) {
        setWorkflowSettings(savedWorkflowSettings);
        setWorkflowSettingsDirty(false);
        queryClient.setQueryData(
          workflowSettingsQueryKey(mode, workflowWorkspaceId),
          savedWorkflowSettings,
        );
        // The backend stores this preference on Company. Other workspaces of the
        // same company therefore hold aliases of the same value; mark every cached
        // workspace alias stale so switching firms cannot revive an older policy.
        void queryClient.invalidateQueries({
          predicate: (query) => isWorkflowSettingsQueryKeyForMode(query.queryKey, mode),
        });
      }
      const failedSave = [settingsSaveResult, workflowSaveResult].find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
      );
      if (failedSave) {
        throw failedSave.reason;
      }
      applyScreenZoom(settings.screenZoom);
      setHasUnsavedChanges(false);
      if (showToast) {
        toast.success("Settings saved successfully");
      }
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved");
      return false;
    } finally {
      setIsSavingSettings(false);
    }
  }

  async function handleRunBackupNow() {
    if (!session?.workspaceId) {
      toast.error("Active workspace is not ready");
      return;
    }

    if (mode === "api" && !activeSession) {
      toast.error("Active company session is not ready");
      return;
    }

    try {
      setIsRunningBackup(true);
      const backup = await buildWorkspaceBackup(mode, session.workspaceId);
      const connection = readStoredCloudConnection(mode, session.workspaceId);
      let backupTimestamp = new Date().toISOString();
      let historyLabel = `Local backup downloaded (${formatBackupSize(backup.sizeBytes)})`;
      let cloudUploaded = false;

      if (mode === "api" && activeSession && connection.connected && connection.cloudUrl && connection.accessToken) {
        const checksumSha256 = await sha256Hex(backup.text);
        const workspaceName = String((backup.payload.scope as { workspaceName?: string } | undefined)?.workspaceName ?? session.workspaceId);
        const record = await uploadWorkspaceBackupToCloud(connection, {
          tenantId: activeSession.tenant.id,
          companyId: activeSession.company.id,
          workspaceId: session.workspaceId,
          workspaceName,
          sourceDeviceId: getDesktopDeviceId(),
          backupVersion: Number(backup.payload.backupVersion ?? 2),
          exportType: WORKSPACE_BACKUP_EXPORT_TYPE,
          checksumSha256,
          sizeBytes: backup.sizeBytes,
          counts: backup.counts,
          payload: backup.payload,
        });

        backupTimestamp = record.createdAt;
        historyLabel = `Cloud backup uploaded (${formatBackupSize(record.sizeBytes)})`;
        cloudUploaded = true;
        writeStoredCloudConnection(mode, session.workspaceId, {
          ...connection,
          connected: true,
          lastBackupAt: record.createdAt,
          lastChecksumSha256: record.checksumSha256,
          lastError: null,
        });
      } else {
        downloadWorkspaceBackup(backup);
      }

      const nextSettings = { ...settings, lastBackupAt: backupTimestamp };
      const nextHistory = [
        {
          id: crypto.randomUUID(),
          label: historyLabel,
          status: "successful" as const,
          timestamp: backupTimestamp,
        },
        ...history,
      ].slice(0, 20);

      setSettings(nextSettings);
      setHistory(nextHistory);
      await persistSettingsSnapshot(nextSettings, nextHistory, taxRates, taxGroups, currencies);
      setHasUnsavedChanges(false);
      toast.success(cloudUploaded ? `Cloud backup completed: ${describeBackupCounts(backup.counts)}` : `Local backup created: ${describeBackupCounts(backup.counts)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Backup failed";
      const failedAt = new Date().toISOString();
      const nextHistory = [
        {
          id: crypto.randomUUID(),
          label: message,
          status: "failed" as const,
          timestamp: failedAt,
        },
        ...history,
      ].slice(0, 20);
      setHistory(nextHistory);
      toast.error(message);
    } finally {
      setIsRunningBackup(false);
    }
  }

  function proceedWithClose() {
    if (isFullSettingsPage) {
      router.push(buildWorkspaceRoute(mode, "/dashboard"));
      return;
    }

    router.push(buildWorkspaceRoute(mode, "/utilities/sync-share"));
  }

  function handleClose() {
    if (!hasUnsavedChanges) {
      proceedWithClose();
      return;
    }

    exitActionHandledRef.current = false;
    setExitAction({ type: "close" });
    setExitDialogOpen(true);
  }

  function handleExitDialogOpenChange(open: boolean) {
    setExitDialogOpen(open);
    if (!open) {
      setExitAction(null);
    }
  }

  function proceedWithPendingAction() {
    if (exitActionHandledRef.current) {
      return;
    }
    exitActionHandledRef.current = true;

    const pendingAction = exitAction;
    setExitDialogOpen(false);
    setExitAction(null);

    if (!pendingAction) {
      return;
    }

    if (pendingAction.type === "route") {
      router.push(pendingAction.href);
      return;
    }

    if (pendingAction.type === "history-back") {
      skipPopConfirmationRef.current = true;
      window.history.back();
      return;
    }

    proceedWithClose();
  }

  async function handleConfirmExit() {
    const saved = await handleSave(false);
    if (saved) {
      proceedWithPendingAction();
    }
  }

  function handleDiscardExit() {
    setHasUnsavedChanges(false);
    proceedWithPendingAction();
  }

  function openTaxModal(type: "rate" | "group") {
    setTaxModal(type);
    if (type === "rate") {
      setTaxRateName("");
      setTaxRateValue("");
      setTaxRateKind("Other");
      return;
    }

    setTaxGroupName("");
    setTaxGroupSelections([]);
  }

  function closeTaxModal() {
    setTaxModal(null);
  }

  function handleSaveTaxRate() {
    const trimmedName = taxRateName.trim();
    const trimmedRate = taxRateValue.trim();

    if (!trimmedName || !trimmedRate) {
      toast.error("Tax name and rate are required");
      return;
    }

    setTaxRates((current) => [
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        rate: trimmedRate,
        kind: taxRateKind,
      },
      ...current,
    ]);
    setHasUnsavedChanges(true);

    closeTaxModal();
    toast.success("Tax rate added");
  }

  function handleSaveTaxGroup() {
    const trimmedName = taxGroupName.trim();

    if (!trimmedName) {
      toast.error("Tax group name is required");
      return;
    }

    if (!taxGroupSelections.length) {
      toast.error("Select at least one tax rate");
      return;
    }

    setTaxGroups((current) => [
      {
        id: crypto.randomUUID(),
        name: trimmedName,
        taxRateIds: taxGroupSelections,
      },
      ...current,
    ]);
    setHasUnsavedChanges(true);

    closeTaxModal();
    toast.success("Tax group added");
  }

  function handleApplyTaxCountryPreset() {
    const { preset, rates, groups } = buildTaxPresetEntries(settings.taxCountry);
    patchSettings({
      taxSystem: preset.taxSystem,
      taxRegistrationLabel: preset.registrationLabel,
    });
    setTaxRates(rates);
    setTaxGroups(groups);
    toast.success(`${preset.label} tax preset loaded`);
  }

  function toggleTaxGroupSelection(taxRateId: string) {
    setTaxGroupSelections((current) => (current.includes(taxRateId) ? current.filter((item) => item !== taxRateId) : [...current, taxRateId]));
  }

  async function loadCurrencyCatalog() {
    if (availableCurrencyCodes.length) return;
    try {
      setIsLoadingCurrencyCatalog(true);
      const response = await fetch("/api/exchange-rates?base=USD");
      const payload = await response.json() as { rates?: Record<string, number>; message?: string };
      if (!response.ok || !payload.rates) throw new Error(payload.message || "Could not load currencies");
      setAvailableCurrencyCodes(Object.keys(payload.rates).filter((code) => /^[A-Z]{3}$/.test(code)).sort());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load supported currencies");
    } finally {
      setIsLoadingCurrencyCatalog(false);
    }
  }

  function openCurrencyModal(type: "base" | "new") {
    setCurrencyModal(type);
    setCurrencyName("");
    setCurrencyCode("");
    setCurrencySymbol("");
    setCurrencyExchangeRate(type === "base" ? "1" : "");
    void loadCurrencyCatalog();
  }

  function closeCurrencyModal() {
    setCurrencyModal(null);
  }

  async function refreshLiveExchangeRates(currencySelection: CurrencyEntry[] = currencies) {
    // Old builds briefly generated every provider currency with a `live-` id. Keep
    // only currencies the user actually selected, plus the base currency.
    const selectedCurrencies = currencySelection.filter((currency) => currency.isBase || !currency.id.startsWith("live-"));
    const baseCurrency = selectedCurrencies.find((currency) => currency.isBase);
    if (!baseCurrency) {
      toast.error("Add a base currency before loading live rates");
      return;
    }

    const baseCode = getCurrencyCode(baseCurrency);
    if (!baseCode) {
      toast.error("Add a valid ISO currency code to the base currency");
      return;
    }

    try {
      setIsRefreshingExchangeRates(true);
      const response = await fetch(`/api/exchange-rates?base=${encodeURIComponent(baseCode)}`);
      const payload = await response.json() as {
        rates?: Record<string, number>;
        updatedAt?: string;
        message?: string;
      };
      if (!response.ok || !payload.rates) throw new Error(payload.message || "Could not load live exchange rates");
      setAvailableCurrencyCodes(Object.keys(payload.rates).filter((code) => /^[A-Z]{3}$/.test(code)).sort());

      const rateDate = (payload.updatedAt ?? new Date().toISOString()).slice(0, 10);
      const preferredQuoteCode = baseCode === "BDT" ? "USD" : "BDT";
      const preferredQuoteRate = payload.rates[preferredQuoteCode];
      setLiveExchangeQuote(
        Number.isFinite(preferredQuoteRate)
          ? { baseCode, quoteCode: preferredQuoteCode, rate: preferredQuoteRate }
          : null,
      );
      const nextCurrencies = selectedCurrencies.map((currency) => {
        const code = getCurrencyCode(currency);
        const rate = code ? payload.rates?.[code] : undefined;
        const bdtRate = payload.rates?.BDT;
        const rateInBdt = code === "BDT" ? 1 : Number.isFinite(rate) && Number.isFinite(bdtRate) ? bdtRate! / rate! : undefined;
        return {
          ...currency,
          code,
          name: getCurrencyName(code) || currency.name,
          symbol: getCurrencySymbol(code) || currency.symbol,
          exchangeRate: currency.isBase ? "1" : Number.isFinite(rate) ? String(Number(rate!.toFixed(6))) : currency.exchangeRate,
          bdtRate: Number.isFinite(rateInBdt) ? String(Number(rateInBdt!.toFixed(6))) : currency.bdtRate,
          setOnDate: rateDate,
        };
      });
      const changed = JSON.stringify(nextCurrencies) !== JSON.stringify(currencySelection);
      setCurrencies(nextCurrencies);
      setLastExchangeRateUpdate(payload.updatedAt ?? new Date().toISOString());
      if (changed) {
        await persistSettingsSnapshot(
          { ...settings, liveExchangeRateEnabled: true },
          history,
          taxRates,
          taxGroups,
          nextCurrencies,
        );
        setHasUnsavedChanges(false);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load live exchange rates");
    } finally {
      setIsRefreshingExchangeRates(false);
    }
  }

  const liveRateCurrencyFingerprint = currencies
    .map((currency) => `${currency.id}:${getCurrencyCode(currency)}:${currency.isBase}`)
    .join("|");

  useEffect(() => {
    if (!mounted || !settings.liveExchangeRateEnabled || !currencies.some((currency) => currency.isBase)) return;
    const refreshKey = `${mode}:${session?.workspaceId ?? "default"}:${liveRateCurrencyFingerprint}`;
    if (liveRateAutoRefreshRef.current === refreshKey) return;
    liveRateAutoRefreshRef.current = refreshKey;
    void refreshLiveExchangeRates();
    // The fingerprint intentionally excludes rates, preventing the refresh result
    // from starting another request while still reacting to currency-list changes.
  }, [liveRateCurrencyFingerprint, mode, mounted, session?.workspaceId, settings.liveExchangeRateEnabled]);

  async function handleSaveCurrency() {
    const trimmedName = currencyName.trim();
    const trimmedCode = normalizeCurrencyCode(currencyCode);
    const trimmedSymbol = currencySymbol.trim();
    const trimmedRate = currencyExchangeRate.trim();

    if (!trimmedName || !trimmedSymbol || !isSupportedCurrencyCode(trimmedCode)) {
      toast.error("Enter a valid ISO currency code, for example JPY, EUR, USD, or BDT");
      return;
    }

    const isBase = currencyModal === "base";

    if (currencies.some((currency) => getCurrencyCode(currency) === trimmedCode)) {
      toast.error(`${trimmedCode} is already in your currency list`);
      return;
    }

    const nextItems = isBase ? currencies.map((item) => ({ ...item, isBase: false })) : currencies;
    const nextCurrencies = [
        {
          id: crypto.randomUUID(),
          name: trimmedName,
          code: trimmedCode,
          symbol: trimmedSymbol,
          exchangeRate: isBase ? "1" : trimmedRate || "Fetching...",
          setOnDate: new Date().toISOString().slice(0, 10),
          isBase,
        },
        ...nextItems,
      ];

    try {
      setCurrencies(nextCurrencies);
      await persistSettingsSnapshot(settings, history, taxRates, taxGroups, nextCurrencies);
      setHasUnsavedChanges(false);
      closeCurrencyModal();
      toast.success(isBase ? "Base currency added and saved" : "Currency added and saved");
      if (settings.liveExchangeRateEnabled || !isBase) {
        await refreshLiveExchangeRates(nextCurrencies);
      }
    } catch (error) {
      setHasUnsavedChanges(true);
      toast.error(error instanceof Error ? error.message : "Currency could not be saved");
    }
  }

  async function handleDeleteCurrency(currencyId: string) {
    const nextCurrencies = currencies.filter((item) => item.id !== currencyId);
    try {
      setCurrencies(nextCurrencies);
      await persistSettingsSnapshot(settings, history, taxRates, taxGroups, nextCurrencies);
      setHasUnsavedChanges(false);
      toast.success("Currency deleted and saved");
    } catch (error) {
      setCurrencies(currencies);
      toast.error(error instanceof Error ? error.message : "Currency could not be deleted");
    }
  }

  function renderGeneralSection() {
    return (
      <div className="grid gap-8 xl:grid-cols-3">
        <section className="space-y-7">
          <div className="border-b border-[#d8dfe9] pb-4 text-[16px] font-semibold text-[#132949]">Application</div>
          <SettingCheckboxRow checked={settings.passcodeEnabled} label="Enable Passcode" onChange={(checked) => patchSettings({ passcodeEnabled: checked })} />

          <div className="space-y-4">
            <div className="inline-flex items-center gap-1 text-[15px] text-[#132949]">
              Business Currency
              <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
            </div>
            <div className="grid max-w-[260px] grid-cols-[auto_110px] items-center gap-5">
              <div className="text-[22px] text-[#132949]">{settings.businessCurrency}</div>
              <select
                value={settings.businessCurrency}
                onChange={(event) => patchSettings({ businessCurrency: event.target.value })}
                className="h-9 border-0 border-b border-[#d5dce8] bg-transparent px-1 text-[15px] text-[#132949] outline-none"
              >
                <option value="Tk">Tk</option>
                <option value="BDT">BDT</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="text-[15px] text-[#132949]">Amount</div>
            <div className="grid grid-cols-[160px_72px_1fr] items-center gap-3">
              <span className="text-[11px] leading-4 text-[#73819b]">(Upto Decimal Places)</span>
              <Input
                type="number"
                min={0}
                max={4}
                value={settings.decimalPlaces}
                onChange={(event) => patchSettings({ decimalPlaces: Number(event.target.value || 0) })}
                className="h-10 rounded-[4px] border-[#d7dfeb] px-3 text-center"
              />
              <span className="text-[15px] text-[#73819b]">e.g. 0.00</span>
            </div>
          </div>

          <SettingCheckboxRow checked={settings.tinNumberEnabled} label="TIN Number" onChange={(checked) => patchSettings({ tinNumberEnabled: checked })} />
          <SettingCheckboxRow checked={settings.stopSaleNegativeStock} label="Stop Sale on Negative Stock" onChange={(checked) => patchSettings({ stopSaleNegativeStock: checked })} />
          <SettingCheckboxRow checked={settings.blockNewItems} label="Block New Items from Txn Form" onChange={(checked) => patchSettings({ blockNewItems: checked })} />
          <SettingCheckboxRow checked={settings.blockNewParties} label="Block New Parties from Txn Form" onChange={(checked) => patchSettings({ blockNewParties: checked })} />

          <div className="border-b border-[#d8dfe9] pb-4 pt-3 text-[16px] font-semibold text-[#132949]">More Transactions</div>
          <SettingCheckboxRow checked={settings.estimateEnabled} label="Estimate/Quotation" onChange={(checked) => patchSettings({ estimateEnabled: checked })} />
          <SettingCheckboxRow checked={settings.proformaEnabled} label="Proforma Invoice" onChange={(checked) => patchSettings({ proformaEnabled: checked })} />
          <SettingCheckboxRow checked={settings.otherIncomeEnabled} label="Other Income" onChange={(checked) => patchSettings({ otherIncomeEnabled: checked })} />
          <SettingCheckboxRow checked={settings.fixedAssetsEnabled} label="Fixed Assets (FA)" onChange={(checked) => patchSettings({ fixedAssetsEnabled: checked })} />
          <button
            type="button"
            className="mt-2 w-full rounded-lg border border-[#bdd5fb] bg-[#f2f7ff] px-4 py-3 text-left text-sm font-semibold text-[#195bbf] transition hover:bg-[#e8f1ff]"
            onClick={() => focusSettingsSection("workflow")}
          >
            Configure Purchase Orders, Receipt Notes, Sales Orders and Delivery Notes
          </button>
        </section>

        <section className="space-y-7">
          <div className="flex items-center gap-3 border-b border-[#d8dfe9] pb-4">
            <input
              type="checkbox"
              checked={Boolean(settings.multiFirmEnabled)}
              onChange={(event) => patchSettings({ multiFirmEnabled: event.target.checked })}
              className="h-5 w-5 rounded border-[#b7c5da]"
            />
            <span className="text-[16px] font-semibold text-[#132949]">Multi Firm</span>
          </div>

          <div className="rounded-[4px] border border-[#d7dfeb] bg-white px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-3 text-[15px] text-[#132949]">
                <input
                  type="radio"
                  name="firm"
                  checked
                  onChange={() => patchSettings({ selectedFirm: settings.selectedFirm })}
                  className="h-5 w-5"
                />
                <span>{settings.selectedFirm}</span>
              </label>
              <span className="inline-flex items-center gap-3">
                <span className="text-xs uppercase tracking-[0.08em] text-[#8a97b1]">Default</span>
                <Pencil className="h-4 w-4 cursor-pointer text-[#2477ff]" onClick={openCompanyProfileEditor} />
              </span>
            </div>
          </div>

          <div className="border-b border-[#d8dfe9] pb-4 pt-1 text-[16px] font-semibold text-[#132949]">Stock Transfer Between Stores</div>
          <div className="max-w-[520px] text-[14px] leading-6 text-[#73819b]">
            Manage all your stores/godowns and transfer stock seamlessly between them. Using this feature, you can transfer stock between stores/godowns and manage your inventory more efficiently.
          </div>
          <div className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              checked={Boolean(settings.storeTransferEnabled)}
              onChange={(event) => patchSettings({ storeTransferEnabled: event.target.checked })}
              className="h-5 w-5 rounded border-[#b7c5da]"
            />
            <span className="inline-flex items-center gap-2 text-[15px] text-[#132949]">
              Store management &amp; Stock transfer
              <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#ff4f5e] transition hover:bg-[#fff0f1] hover:text-[#e33445] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff9ca5]"
                onClick={() => openVideoChannel("Bizovix store management stock transfer tutorial")}
                aria-label="Watch store management and stock transfer video"
                title="Watch video"
              >
                <PlayCircle className="h-5 w-5 fill-[#ff4f5e] text-white" />
              </button>
            </span>
          </div>
        </section>

        <section className="space-y-7">
          <div className="border-b border-[#d8dfe9] pb-4 text-[16px] font-semibold text-[#132949]">Backup &amp; History</div>
          <label className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              checked={Boolean(settings.autoBackupEnabled)}
              onChange={(event) => patchSettings({ autoBackupEnabled: event.target.checked })}
              className="h-5 w-5 rounded border-[#b7c5da]"
            />
            <span className="inline-flex items-center gap-1 text-[15px] text-[#132949]">
              Auto Backup
              <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
            </span>
          </label>
          <div className="pl-8 text-[14px] text-[#132949]">
            Last Backup {formatBackupStamp(settings.lastBackupAt)}
            <Info className="ml-1 inline-flex h-3.5 w-3.5 text-[#b0b7c7]" />
          </div>
          <label className="flex items-center gap-3 py-1">
            <input
              type="checkbox"
              checked={Boolean(settings.transactionHistoryEnabled)}
              onChange={(event) => patchSettings({ transactionHistoryEnabled: event.target.checked })}
              className="h-5 w-5 rounded border-[#b7c5da]"
            />
            <span className="inline-flex items-center gap-1 text-[15px] text-[#132949]">
              Transaction History
              <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
            </span>
          </label>

          <div className="border-b border-[#d8dfe9] pb-4 pt-3 text-[16px] font-semibold text-[#132949]">Customize Your View</div>
          <div className="space-y-3">
            <div className="text-[15px] text-[#132949]">Choose Your Screen Zoom/Scale</div>
            <div className="max-w-[520px] text-[14px] leading-6 text-[#73819b]">
              You can use this setting to resize the Bizovix screen, making it larger or smaller to fit your preferences.
            </div>
            <div className="flex items-end gap-4 pt-2">
              <div className="min-w-0 flex-1">
                <input
                  type="range"
                  min={0}
                  max={zoomSteps.length - 1}
                  step={1}
                  value={zoomSteps.indexOf(settings.screenZoom as (typeof zoomSteps)[number])}
                  onChange={(event) => patchSettings({ screenZoom: zoomSteps[Number(event.target.value)] })}
                  className="w-full accent-[#4d7be6]"
                />
                <div className="mt-2 flex items-center justify-between pr-1 text-[11px] text-[#73819b]">
                  {zoomSteps.map((step) => (
                    <span key={step} className={cn(step === settings.screenZoom ? "font-semibold text-[#132949]" : "")}>
                      {step}%
                    </span>
                  ))}
                </div>
              </div>
              <Button type="button" variant="outline" className="rounded-full border-[#d7dfeb] bg-[#eef6ff] px-6 text-[#2477ff] hover:bg-[#e6f1ff]" onClick={() => {
                applyScreenZoom(settings.screenZoom);
                toast.success(`Screen zoom applied at ${settings.screenZoom}%`);
              }}>
                Apply
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  function renderWorkflowSection() {
    const activePreset = workflowPreset(workflowSettings);
    const presets: Array<{
      id: "DIRECT" | "ADVANCED" | "CUSTOM";
      title: string;
      badge: string;
      description: string;
    }> = [
      {
        id: "DIRECT",
        title: "Direct Mode",
        badge: "Small business",
        description: "Start with a Purchase Bill or Sales Invoice. Order and goods-receipt/delivery steps stay out of the daily menu.",
      },
      {
        id: "ADVANCED",
        title: "Advanced Mode",
        badge: "Structured control",
        description: "New purchases follow PO → Receipt Note → Bill, and new sales follow SO → Delivery Note → Invoice.",
      },
      {
        id: "CUSTOM",
        title: "Custom Mode",
        badge: "Flexible",
        description: "Choose a separate workflow for Purchase and Sales, including both paths when a company needs flexibility.",
      },
    ];
    const policyOptions: Array<{ value: WorkflowPolicy; label: string; description: string }> = [
      { value: "DIRECT", label: "Direct", description: "Bill / Invoice starts the transaction" },
      { value: "ORDER_BASED", label: "Order Based", description: "Order and goods movement documents are required" },
      { value: "BOTH", label: "Both", description: "Allow either path; quick create starts Direct" },
    ];

    return (
      <div className="max-w-5xl space-y-7">
        <section className="space-y-2 border-b border-[#d8dfe9] pb-5">
          <h2 className="text-[18px] font-semibold text-[#132949]">Sales &amp; Purchase Workflow</h2>
          <p className="max-w-3xl text-sm leading-6 text-[#6f7e99]">
            Select how new transactions begin. You can change this later without converting, deleting, or reposting existing documents.
          </p>
        </section>

        <div className="grid gap-4 lg:grid-cols-3">
          {presets.map((preset) => {
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                onClick={() => selectWorkflowPreset(preset.id)}
                className={cn(
                  "relative min-h-44 rounded-xl border p-5 text-left transition",
                  active
                    ? "border-[#2c6fe8] bg-[#eef5ff] shadow-[0_8px_22px_rgba(44,111,232,0.12)]"
                    : "border-[#d7dfeb] bg-white hover:border-[#a9c5f2] hover:bg-[#f8fbff]",
                )}
              >
                <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-[#547099] ring-1 ring-inset ring-[#d7e2f1]">
                  {preset.badge}
                </span>
                <span className="mt-4 block text-base font-semibold text-[#132949]">{preset.title}</span>
                <span className="mt-2 block text-sm leading-5 text-[#6f7e99]">{preset.description}</span>
                {active ? (
                  <span className="absolute right-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[#246ee9] text-white">
                    <Check className="h-4 w-4" />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {activePreset === "CUSTOM" ? (
          <section className="grid gap-5 rounded-xl border border-[#d7dfeb] bg-[#fbfcfe] p-5 md:grid-cols-2">
            {([
              ["purchaseWorkflow", "Purchase workflow"],
              ["salesWorkflow", "Sales workflow"],
            ] as const).map(([field, label]) => (
              <label key={field} className="space-y-2">
                <span className="block text-sm font-semibold text-[#132949]">{label}</span>
                <select
                  value={workflowSettings[field]}
                  onChange={(event) => patchWorkflowSettings({ [field]: event.target.value as WorkflowPolicy })}
                  className="h-11 w-full rounded-lg border border-[#cfd9e8] bg-white px-3 text-sm text-[#132949] outline-none focus:border-[#3973e8]"
                >
                  {policyOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label} — {option.description}</option>
                  ))}
                </select>
              </label>
            ))}
          </section>
        ) : null}

        <section className="rounded-xl border border-[#b9d6ff] bg-[#edf5ff] p-5 text-sm leading-6 text-[#355b87]">
          <div className="font-semibold text-[#174f98]">Safe to switch at any time</div>
          <p className="mt-1">
            The selection applies only to new root transactions. Existing Purchase Orders, Receipt Notes, Sales Orders and Delivery Notes remain visible through their history and can still be completed under their original workflow.
          </p>
          <p className="mt-2">
            Journal entries and stock movements are posted from the actual document path, so switching this preference does not change Trial Balance, Profit &amp; Loss, Balance Sheet, supplier/customer balances, or inventory already posted.
          </p>
          <div className="mt-4">
            <div className="mb-2 text-xs font-bold uppercase tracking-[0.06em] text-[#466b98]">
              Existing advanced workflow history
            </div>
            <div className="flex flex-wrap gap-2">
              {([
                ["Purchase Orders", "/purchase/orders"],
                ["Receipt Notes", "/purchase/receipt-notes"],
                ["Sales Orders", "/sales/sale-order"],
                ["Delivery Notes", "/sales/delivery-challan"],
              ] as const).map(([label, route]) => (
                <button
                  key={route}
                  type="button"
                  onClick={() => router.push(buildWorkspaceRoute(mode, route))}
                  className="rounded-full border border-[#9fc4f5] bg-white px-3 py-1.5 text-xs font-semibold text-[#195bbf] transition hover:bg-[#f5f9ff]"
                >
                  View {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[#d7dfeb]">
          <div className="grid grid-cols-[minmax(130px,0.8fr)_repeat(2,minmax(0,1fr))] bg-[#f5f8fc] px-4 py-3 text-xs font-bold uppercase tracking-[0.06em] text-[#60708a]">
            <span>Area</span><span>Direct</span><span>Order Based</span>
          </div>
          {[
            ["Purchase", "Purchase Bill", "Purchase Order → Receipt Note → Purchase Bill"],
            ["Sales", "Sales Invoice", "Sales Order → Delivery Note → Sales Invoice"],
            ["Stock", "Bill / Invoice posts stock", "Receipt / Delivery posts stock once"],
            ["Accounting", "Bill / Invoice posts ledger", "Final Bill / Invoice settles the workflow ledger"],
          ].map(([area, direct, advanced]) => (
            <div key={area} className="grid grid-cols-[minmax(130px,0.8fr)_repeat(2,minmax(0,1fr))] gap-3 border-t border-[#e1e7f0] px-4 py-3 text-sm text-[#465773]">
              <span className="font-semibold text-[#132949]">{area}</span><span>{direct}</span><span>{advanced}</span>
            </div>
          ))}
        </section>
      </div>
    );
  }

  function renderTransactionSection() {
    return (
      <div data-settings-transaction-grid className="grid gap-5 xl:grid-cols-[repeat(3,minmax(0,1fr))] 2xl:gap-8">
        <section className="min-w-0 space-y-5">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Transaction Header</div>
          <SettingCheckboxRow checked={settings.invoiceBillNumberEnabled} label="Invoice/Bill No." onChange={(checked) => patchSettings({ invoiceBillNumberEnabled: checked })} />
          <SettingCheckboxRow checked={settings.addTimeOnTransactions} label="Add Time on Transactions" onChange={(checked) => patchSettings({ addTimeOnTransactions: checked })} />
          <SettingCheckboxRow checked={settings.cashSaleDefault} label="Cash Sale by default" onChange={(checked) => patchSettings({ cashSaleDefault: checked })} />
          <SettingCheckboxRow checked={settings.billingNameOfParties} label="Billing Name of Parties" onChange={(checked) => patchSettings({ billingNameOfParties: checked })} />
          <SettingCheckboxRow checked={settings.customerPoDetails} label="Customers P.O. Details on Transactions" onChange={(checked) => patchSettings({ customerPoDetails: checked })} />

          <div className="border-b border-[#dde4ef] pb-3 pt-4 text-[15px] font-semibold text-[#132949]">More Transaction Features</div>
          <SettingCheckboxRow checked={settings.quickEntry} label="Quick Entry" onChange={(checked) => patchSettings({ quickEntry: checked })} />
          <SettingCheckboxRow checked={settings.hideInvoicePreview} label="Do not Show Invoice Preview" onChange={(checked) => patchSettings({ hideInvoicePreview: checked })} />
          <SettingCheckboxRow checked={settings.passcodeForTransactionEditDelete} label="Enable Passcode for transaction edit/delete" onChange={(checked) => patchSettings({ passcodeForTransactionEditDelete: checked })} />
          <SettingCheckboxRow checked={settings.discountDuringPayments} label="Discount During Payments" onChange={(checked) => patchSettings({ discountDuringPayments: checked })} />
          <SettingCheckboxRow checked={settings.linkPaymentsToInvoices} label="Link Payments to Invoices" onChange={(checked) => patchSettings({ linkPaymentsToInvoices: checked })} />
          <SettingCheckboxRow checked={settings.dueDatesAndPaymentTerms} label="Due Dates and Payment Terms" onChange={(checked) => patchSettings({ dueDatesAndPaymentTerms: checked })} />
          <SettingCheckboxRow checked={settings.showProfitWhileMakingSaleInvoice} label="Show Profit while making Sale Invoice" onChange={(checked) => patchSettings({ showProfitWhileMakingSaleInvoice: checked })} />
          <SettingCheckboxRow checked={settings.termsAndConditionsEnabled} label="Terms and Conditions" onChange={(checked) => patchSettings({ termsAndConditionsEnabled: checked })} />

          <div className="ml-11 flex flex-wrap gap-3 pt-1">
            <button type="button" className="rounded-[8px] bg-[#f3f6fb] px-4 py-2 text-sm font-medium text-[#2477ff]" onClick={() => focusSettingsSection("print")}>
              Set Terms and Conditions
            </button>
            <button type="button" className="rounded-[8px] bg-[#f3f6fb] px-4 py-2 text-sm font-medium text-[#2477ff]" onClick={() => focusSettingsSection("party")}>
              Additional Fields &gt;
            </button>
            <button type="button" className="rounded-[8px] bg-[#f3f6fb] px-4 py-2 text-sm font-medium text-[#2477ff]" onClick={() => focusSettingsSection("transaction")}>
              Transportation Details &gt;
            </button>
            <button type="button" className="rounded-[8px] bg-[#f3f6fb] px-4 py-2 text-sm font-medium text-[#2477ff]" onClick={() => focusSettingsSection("transaction")}>
              Additional Charges &gt;
            </button>
          </div>
        </section>

        <section className="min-w-0 space-y-5">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Items Table</div>
          <div className="rounded-[10px] border border-[#d7dfeb] bg-[#f8fbff] p-3 2xl:p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-[#132949]">Dead Stock Period</div>
                <div className="mt-1 text-xs text-[#64748b]">Positive stock will appear in the Dead Stock Report after this many months without a sale.</div>
              </div>
              <label className="flex items-center gap-2">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={settings.deadStockMonths}
                  onChange={(event) => {
                    const months = Number(event.target.value);
                    if (Number.isSafeInteger(months) && months >= 1) patchSettings({ deadStockMonths: months });
                  }}
                  className="h-10 w-24 bg-white text-right"
                  aria-label="Dead stock period in months"
                />
                <span className="text-sm font-medium text-[#475569]">months</span>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {[3, 6, 9, 12].map((months) => (
                <button
                  type="button"
                  key={months}
                  onClick={() => patchSettings({ deadStockMonths: months })}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-semibold transition",
                    settings.deadStockMonths === months
                      ? "border-[#2563eb] bg-[#2563eb] text-white"
                      : "border-[#cbd5e1] bg-white text-[#475569] hover:border-[#2563eb] hover:text-[#2563eb]",
                  )}
                >
                  {months} months
                </button>
              ))}
            </div>
          </div>
          <SettingCheckboxRow checked={settings.inclusiveTaxOnRate} label="Inclusive/Exclusive Tax on Rate(Price/Unit)" onChange={(checked) => patchSettings({ inclusiveTaxOnRate: checked })} />
          <SettingCheckboxRow checked={settings.displayPurchasePrice} label="Display Purchase Price of Items" onChange={(checked) => patchSettings({ displayPurchasePrice: checked })} />
          <SettingCheckboxRow checked={settings.showLastFiveSalePrice} label="Show last 5 Sale Price of Items" onChange={(checked) => patchSettings({ showLastFiveSalePrice: checked })} />
          <SettingCheckboxRow checked={settings.showLastFivePurchasePrice} label="Show last 5 Purchase Price of Items" onChange={(checked) => patchSettings({ showLastFivePurchasePrice: checked })} />
          <SettingCheckboxRow checked={settings.freeItemQuantity} label="Free Item Quantity" onChange={(checked) => patchSettings({ freeItemQuantity: checked })} />
          <SettingCheckboxRow checked={settings.countTextEnabled} label="Count" hint="Change Text" onChange={(checked) => patchSettings({ countTextEnabled: checked })} />

          <div className="border-b border-[#dde4ef] pb-3 pt-4 text-[15px] font-semibold text-[#132949]">Transaction Prefixes</div>
          <div className="space-y-4 rounded-[10px] border border-[#d7dfeb] p-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium uppercase tracking-[0.08em] text-[#8a97b1]">Firm</span>
              <select
                value={settings.selectedFirm}
                onChange={(event) => patchSettings({ selectedFirm: event.target.value })}
                className="h-11 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949]"
              >
                {availableFirmOptions.map((firm) => (
                  <option key={firm} value={firm}>
                    {firm}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                ["prefixSale", "Sale"],
                ["prefixCreditNote", "Credit Note"],
                ["prefixSaleOrder", "Sale Order"],
                ["prefixPurchaseOrder", "Purchase Order"],
                ["prefixEstimate", "Estimate"],
                ["prefixProformaInvoice", "Proforma Invoice"],
                ["prefixDeliveryChallan", "Delivery Note"],
                ["prefixPaymentIn", "Payment In"],
              ].map(([key, label]) => (
                <label key={key} className="grid gap-1.5">
                  <span className="text-xs font-medium uppercase tracking-[0.08em] text-[#8a97b1]">{label}</span>
                  <select
                    value={settings[key as keyof AutoBackupSettings] as string}
                    onChange={(event) => patchSettings({ [key]: event.target.value } as Partial<AutoBackupSettings>)}
                    className="h-10 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949]"
                  >
                    <option value="None">None</option>
                    <option value="Auto">Auto</option>
                    <option value="Manual">Manual</option>
                  </select>
                </label>
              ))}
            </div>
          </div>
        </section>

        <section className="min-w-0 space-y-5">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Taxes, Discount & Totals</div>
          <SettingCheckboxRow checked={settings.transactionWiseTax} label="Transaction wise Tax" onChange={(checked) => patchSettings({ transactionWiseTax: checked })} />
          <SettingCheckboxRow checked={settings.transactionWiseDiscount} label="Transaction wise Discount" onChange={(checked) => patchSettings({ transactionWiseDiscount: checked })} />
          <SettingCheckboxRow checked={settings.roundOffTotal} label="Round Off Total" onChange={(checked) => patchSettings({ roundOffTotal: checked })} />

          <div className="grid grid-cols-[minmax(0,1fr)_auto_72px] items-center gap-2 pl-6 2xl:grid-cols-[1fr_50px_100px] 2xl:gap-3 2xl:pl-11">
            <select
              value={settings.roundOffNearest}
              onChange={(event) => patchSettings({ roundOffNearest: event.target.value })}
              className="h-10 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949]"
            >
              <option value="Nearest">Nearest</option>
              <option value="Upward">Upward</option>
              <option value="Downward">Downward</option>
            </select>
            <span className="text-sm text-[#132949]">To</span>
            <select
              value={settings.roundOffTo}
              onChange={(event) => patchSettings({ roundOffTo: event.target.value })}
              className="h-10 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949]"
            >
              <option value="1">1</option>
              <option value="5">5</option>
              <option value="10">10</option>
            </select>
          </div>

          <div className="border-b border-[#dde4ef] pb-3 pt-4 text-[15px] font-semibold text-[#132949]">Billing Type</div>
          <div className="space-y-3">
            <label className="flex items-center gap-3 text-[15px] text-[#132949]">
              <input
                type="radio"
                name="billing-type"
                checked={settings.billingType === "lite-sale"}
                onChange={() => patchSettings({ billingType: "lite-sale" })}
                className="h-5 w-5"
              />
              Lite Sale
            </label>
            <label className="flex items-center gap-3 text-[15px] text-[#132949]">
              <input
                type="radio"
                name="billing-type"
                checked={settings.billingType === "full-sale"}
                onChange={() => patchSettings({ billingType: "full-sale" })}
                className="h-5 w-5"
              />
              Full Sale
            </label>
          </div>
        </section>
      </div>
    );
  }

  function renderPrintSection() {
    const isThermalPrinter = settings.printerType === "thermal";
    const themeOptions = isThermalPrinter ? thermalPrintThemes : regularPrintThemes;
    const previewWidthClass = isThermalPrinter ? "mx-auto max-w-[430px]" : "max-w-none";
    const regularPreviewBaseWidth = 860;
    const regularPreviewBaseHeight = 1180;
    const regularPreviewScale = 0.62;
    const previewOuterStyle = isThermalPrinter
      ? undefined
      : {
          width: `${regularPreviewBaseWidth * regularPreviewScale}px`,
          height: `${regularPreviewBaseHeight * regularPreviewScale}px`,
        };
    const previewInnerStyle = isThermalPrinter
      ? undefined
      : {
          width: `${regularPreviewBaseWidth}px`,
          minHeight: `${regularPreviewBaseHeight}px`,
          transform: `scale(${regularPreviewScale})`,
          transformOrigin: "top left",
        };
    const totalRows = [
      settings.totalItemQuantityEnabled ? ["Total Item Quantity", "2 + 1"] : null,
      settings.amountWithDecimalEnabled ? ["Amount with Decimal", settings.printAmountGrouping ? "45.80" : "46"] : null,
      settings.receivedAmountEnabled ? ["Received", "12.00"] : null,
      settings.balanceAmountEnabled ? ["Balance", "30.32"] : null,
      settings.currentBalancePartyEnabled ? ["Current Balance of Party", "16,000.00"] : null,
      settings.taxDetailsEnabled ? ["Tax Details", "9.92"] : null,
      settings.youSavedEnabled ? ["You Saved", "111.60"] : null,
    ].filter(Boolean) as Array<[string, string]>;

    return (
      <div data-settings-print-grid className="grid min-w-0 gap-4 xl:grid-cols-[minmax(330px,0.75fr)_minmax(0,1.25fr)] 2xl:gap-6 2xl:grid-cols-[minmax(0,0.9fr)_minmax(640px,1.1fr)]">
        <div data-settings-print-controls className="min-w-0 space-y-6">
          <div className="flex flex-wrap gap-5 border-b border-[#d7dfeb] pb-2">
            {[
              ["regular", "REGULAR PRINTER"],
              ["thermal", "THERMAL PRINTER"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => patchSettings({ printerType: value as AutoBackupSettings["printerType"] })}
                className={cn(
                  "border-b-2 px-3 pb-3 text-lg font-semibold transition",
                  settings.printerType === value ? "border-[#2f66f3] text-[#2f66f3]" : "border-transparent text-[#132949] hover:text-[#2f66f3]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-5 border-b border-[#d7dfeb] pb-4">
            {[
              ["layout", "CHANGE LAYOUT"],
              ["colors", "CHANGE COLORS"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => patchSettings({ printerCustomizeMode: value as AutoBackupSettings["printerCustomizeMode"] })}
                className={cn(
                  "border-b-2 px-2 pb-3 text-sm font-semibold tracking-[0.04em] transition",
                  settings.printerCustomizeMode === value ? "border-[#ff2c55] text-[#2477ff]" : "border-transparent text-[#132949] hover:text-[#2477ff]",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {settings.printerCustomizeMode === "layout" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                {themeOptions.map((theme) => (
                  <PrintThemeCard
                    key={theme.id}
                    label={theme.label}
                    selected={theme.id === (isThermalPrinter ? settings.thermalTheme : settings.printerTheme)}
                    onClick={() => patchSettings(isThermalPrinter ? { thermalTheme: theme.id } : { printerTheme: theme.id })}
                    accentColor={settings.printerPrimaryColor}
                  />
                ))}
              </div>

              <section className="space-y-5">
                <div className="border-b border-[#d7dfeb] pb-3 text-[15px] font-semibold text-[#132949]">Print Company Info / Header</div>
                <SettingCheckboxRow checked={settings.regularPrinterDefault} label={isThermalPrinter ? "Make Thermal Printer Default" : "Make Regular Printer Default"} onChange={(checked) => patchSettings({ regularPrinterDefault: checked })} />
                <SettingCheckboxRow checked={settings.repeatHeaderInAllPages} label="Print repeat header in all pages" onChange={(checked) => patchSettings({ repeatHeaderInAllPages: checked })} />

                <SettingToggleInputRow
                  checked={settings.printCompanyName}
                  label="Company Name"
                  value={settings.companyDisplayName}
                  onToggle={(checked) => patchSettings({ printCompanyName: checked })}
                  onChange={(value) => patchSettings({ companyDisplayName: value })}
                />
                <div className="flex items-center gap-3 py-2">
                  <input type="checkbox" checked={settings.printCompanyLogo} onChange={(event) => patchSettings({ printCompanyLogo: event.target.checked })} className="h-5 w-5 rounded border-[#b7c5da]" />
                  <div className="flex-1">
                    <div className="text-[15px] text-[#132949]">
                      Company Logo <button type="button" className="ml-1 text-sm font-medium text-[#2477ff]" onClick={openCompanyProfileEditor}>Change</button>
                    </div>
                  </div>
                </div>
                <SettingToggleInputRow
                  checked={settings.printCompanyAddress}
                  label="Address"
                  value={settings.companyAddress}
                  onToggle={(checked) => patchSettings({ printCompanyAddress: checked })}
                  onChange={(value) => patchSettings({ companyAddress: value })}
                />
                <SettingToggleInputRow
                  checked={settings.printCompanyEmail}
                  label="Email"
                  value={settings.companyEmail}
                  onToggle={(checked) => patchSettings({ printCompanyEmail: checked })}
                  onChange={(value) => patchSettings({ companyEmail: value })}
                />
                <SettingToggleInputRow
                  checked={settings.printCompanyPhone}
                  label="Phone Number"
                  value={settings.companyPhone}
                  onToggle={(checked) => patchSettings({ printCompanyPhone: checked })}
                  onChange={(value) => patchSettings({ companyPhone: value })}
                />

                <div data-settings-print-page-options className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-4">
                  <SettingSelectRow label="Paper Size" value={settings.paperSize} options={["A4", "A5", "Letter"]} onChange={(value) => patchSettings({ paperSize: value })} />
                  <SettingSelectRow label="Orientation" value={settings.printOrientation} options={["Portrait", "Landscape"]} onChange={(value) => patchSettings({ printOrientation: value })} />
                  <SettingSelectRow label="Company Name Text Size" value={settings.companyNameTextSize} options={["Small", "Medium", "Large"]} onChange={(value) => patchSettings({ companyNameTextSize: value })} />
                  <SettingSelectRow label="Invoice Text Size" value={settings.invoiceTextSize} options={["Small", "Medium", "Large"]} onChange={(value) => patchSettings({ invoiceTextSize: value })} />
                </div>

                <SettingCheckboxRow checked={settings.printOriginalDuplicate} label="Print Original/Duplicate" onChange={(checked) => patchSettings({ printOriginalDuplicate: checked })} />
                <label className="grid max-w-[260px] gap-1.5">
                  <span className="text-[15px] text-[#132949]">Extra space on Top of PDF</span>
                  <Input type="number" min={0} value={settings.extraTopPdfSpace} onChange={(event) => patchSettings({ extraTopPdfSpace: Number(event.target.value || 0) })} className="h-10 rounded-[8px] border-[#d7dfeb]" />
                </label>

                <div className="flex flex-wrap gap-3 pt-1">
                  <button type="button" className="text-sm font-medium text-[#2477ff]" onClick={() => focusSettingsSection("transaction")}>
                    Change Transaction Names &gt;
                  </button>
                </div>
              </section>

              <section className="space-y-5">
                <div className="border-b border-[#d7dfeb] pb-3 text-[15px] font-semibold text-[#132949]">Item Table</div>
                <SettingCheckboxRow checked={settings.expandItemTable} label="Expand table to print on whole page" onChange={(checked) => patchSettings({ expandItemTable: checked })} />
                <label className="grid max-w-[260px] gap-1.5">
                  <span className="text-[15px] text-[#132949]">Min No. of Rows in Item Table</span>
                  <Input type="number" min={0} value={settings.minRowsInItemTable} onChange={(event) => patchSettings({ minRowsInItemTable: Number(event.target.value || 0) })} className="h-10 rounded-[8px] border-[#d7dfeb]" />
                </label>
                <button type="button" className="text-sm font-medium text-[#2477ff]" onClick={() => focusSettingsSection("print")}>
                  Item Table Customization &gt;
                </button>
              </section>

              <section className="space-y-5">
                <div className="border-b border-[#d7dfeb] pb-3 text-[15px] font-semibold text-[#132949]">Totals & Taxes</div>
                <SettingCheckboxRow checked={settings.totalItemQuantityEnabled} label="Total Item Quantity" onChange={(checked) => patchSettings({ totalItemQuantityEnabled: checked })} />
                <SettingCheckboxRow checked={settings.amountWithDecimalEnabled} label="Amount with Decimal" hint="e.g. 0.00" onChange={(checked) => patchSettings({ amountWithDecimalEnabled: checked })} />
                <SettingCheckboxRow checked={settings.receivedAmountEnabled} label="Received Amount" onChange={(checked) => patchSettings({ receivedAmountEnabled: checked })} />
                <SettingCheckboxRow checked={settings.balanceAmountEnabled} label="Balance Amount" onChange={(checked) => patchSettings({ balanceAmountEnabled: checked })} />
                <SettingCheckboxRow checked={settings.currentBalancePartyEnabled} label="Current Balance of Party" onChange={(checked) => patchSettings({ currentBalancePartyEnabled: checked })} />
                <SettingCheckboxRow checked={settings.taxDetailsEnabled} label="Tax Details" onChange={(checked) => patchSettings({ taxDetailsEnabled: checked })} />
                <SettingCheckboxRow checked={settings.youSavedEnabled} label="You Saved" onChange={(checked) => patchSettings({ youSavedEnabled: checked })} />
                <SettingCheckboxRow checked={settings.printAmountGrouping} label="Print Amount with Grouping" onChange={(checked) => patchSettings({ printAmountGrouping: checked })} />
                <div className="max-w-[260px]">
                  <SettingSelectRow label="Amount in Words" value={settings.amountInWordsFormat} options={["Bangladesh", "International"]} onChange={(value) => patchSettings({ amountInWordsFormat: value })} />
                </div>
              </section>

              <section className="space-y-5">
                <div className="border-b border-[#d7dfeb] pb-3 text-[15px] font-semibold text-[#132949]">Footer</div>
                <SettingCheckboxRow checked={settings.printDescriptionEnabled} label="Print Description" onChange={(checked) => patchSettings({ printDescriptionEnabled: checked })} />
                <SettingCheckboxRow checked={settings.printTermsEnabled} label="Print Terms and Conditions" onChange={(checked) => patchSettings({ printTermsEnabled: checked })} />
                <SettingCheckboxRow checked={settings.printReceivedByDetails} label="Print Received by details" onChange={(checked) => patchSettings({ printReceivedByDetails: checked })} />
                <SettingCheckboxRow checked={settings.printDeliveredByDetails} label="Print Delivered by details" onChange={(checked) => patchSettings({ printDeliveredByDetails: checked })} />
                <SettingToggleInputRow
                  checked={settings.printSignatureTextEnabled}
                  label="Print Signature Text"
                  value={settings.printSignatureText}
                  onToggle={(checked) => patchSettings({ printSignatureTextEnabled: checked })}
                  onChange={(value) => patchSettings({ printSignatureText: value })}
                  trailing={
                    <button type="button" className="shrink-0 text-sm font-medium text-[#2477ff]" onClick={openCompanyProfileEditor}>
                      Change Signature
                    </button>
                  }
                />
                <SettingCheckboxRow checked={settings.paymentModeEnabled} label="Payment Mode" onChange={(checked) => patchSettings({ paymentModeEnabled: checked })} />
                <SettingCheckboxRow checked={settings.printAcknowledgementEnabled} label="Print Acknowledgement" onChange={(checked) => patchSettings({ printAcknowledgementEnabled: checked })} />
              </section>
            </>
          ) : (
            <section className="space-y-5">
              <div className="border-b border-[#d7dfeb] pb-3 text-[15px] font-semibold text-[#132949]">Print Colors</div>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  ["Primary Color", "printerPrimaryColor"],
                  ["Accent Color", "printerAccentColor"],
                  ["Surface Color", "printerSurfaceColor"],
                ].map(([label, key]) => (
                  <label key={key} className="rounded-[12px] border border-[#d7dfeb] p-4">
                    <span className="mb-3 block text-sm font-medium text-[#132949]">{label}</span>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={settings[key as keyof AutoBackupSettings] as string}
                        onChange={(event) => patchSettings({ [key]: event.target.value } as Partial<AutoBackupSettings>)}
                        className="h-12 w-16 rounded border border-[#d7dfeb] bg-white p-1"
                      />
                      <Input
                        value={settings[key as keyof AutoBackupSettings] as string}
                        onChange={(event) => patchSettings({ [key]: event.target.value } as Partial<AutoBackupSettings>)}
                        className="h-10 rounded-[8px] border-[#d7dfeb]"
                      />
                    </div>
                  </label>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {["#0f4fe3|#f07d11|#f5f7fb", "#0c8b5d|#e5532f|#f5fbf8", "#111827|#2563eb|#f3f4f6"].map((palette) => {
                  const [primary, accent, surface] = palette.split("|");
                  return (
                    <button
                      key={palette}
                      type="button"
                      onClick={() => patchSettings({ printerPrimaryColor: primary, printerAccentColor: accent, printerSurfaceColor: surface })}
                      className="rounded-[12px] border border-[#d7dfeb] p-4 text-left transition hover:border-[#c4d2ea]"
                    >
                      <div className="mb-3 flex gap-2">
                        {[primary, accent, surface].map((color) => (
                          <span key={color} className="h-8 flex-1 rounded-full border border-black/5" style={{ backgroundColor: color }} />
                        ))}
                      </div>
                      <div className="text-sm font-medium text-[#132949]">Apply Palette</div>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div data-settings-print-preview-panel className="min-w-0 xl:sticky xl:top-0 xl:self-start">
          <div className="min-w-0 overflow-hidden rounded-[18px] border border-[#d7dfeb] bg-[#eef3f9] p-3">
            <div className={cn("min-w-0", previewWidthClass)}>
              <div className="mx-auto overflow-hidden" style={previewOuterStyle}>
                <div className={cn("rounded-[10px] border border-[#b5c3da] bg-white p-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)]", isThermalPrinter ? "min-h-[820px]" : "")} style={previewInnerStyle}>
                  <div className="mx-auto flex h-full flex-col">
                  <div className="mb-3 text-center text-[13px] font-bold tracking-[0.02em] text-[#132949]">Tax Invoice</div>
                  <div className="flex-1 overflow-hidden border border-[#7f8ea7] bg-white">
                    <div className="grid h-full grid-rows-[auto_auto_auto_auto_1fr_auto] text-[11px] text-[#09182d]">
                      <div className="flex border-b border-[#7f8ea7]" style={{ backgroundColor: settings.printerSurfaceColor }}>
                        <div className="flex flex-1 items-start gap-2 px-2 py-2.5">
                          {settings.printCompanyLogo ? <div className="flex h-12 w-12 items-center justify-center bg-[#e5e7eb] text-[9px] text-[#a2adbf]">Image</div> : null}
                          <div className="min-w-0">
                            {settings.printCompanyName ? (
                              <div
                                className={cn(
                                  "font-black text-[#020817]",
                                  settings.companyNameTextSize === "Large" ? "text-[18px]" : settings.companyNameTextSize === "Medium" ? "text-[16px]" : "text-[14px]",
                                )}
                              >
                                {settings.companyDisplayName}
                              </div>
                            ) : null}
                            {settings.printCompanyPhone ? <div className="mt-1 text-[10px] font-semibold text-[#0f172a]">Phone: {settings.companyPhone}</div> : null}
                            {settings.printCompanyEmail ? <div className="text-[9px] text-[#5e6b81]">{settings.companyEmail}</div> : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid border-b border-[#7f8ea7] md:grid-cols-2">
                        <div className="border-b border-[#7f8ea7] md:border-b-0 md:border-r">
                          <div className="border-b border-[#7f8ea7] px-2 py-1 font-semibold">Bill To:</div>
                          <div className="space-y-1 px-2 py-2">
                            <div>Classic Enterprise</div>
                            <div>12 Lake View Road, Dhaka 1212, Bangladesh</div>
                            {settings.printCompanyAddress ? <div className="text-[#5e6b81]">{settings.companyAddress}</div> : null}
                          </div>
                        </div>
                        <div>
                          <div className="border-b border-[#7f8ea7] px-2 py-1 font-semibold">Invoice Details:</div>
                          <div className="space-y-1 px-2 py-2">
                            <div>Invoice No.: Inv. 101</div>
                            <div>Date: 19/07/2026</div>
                            <div>Time: 12:30 PM</div>
                            <div>Due Date: 26/07/2026</div>
                            {settings.printOriginalDuplicate ? <div className="font-medium text-[#c76925]">Original / Duplicate</div> : null}
                          </div>
                        </div>
                      </div>

                      <div className="border-b border-[#7f8ea7]">
                        <div className="border-b border-[#7f8ea7] px-2 py-1 font-semibold">Ship To:</div>
                        <div className="px-2 py-2">Meghna Textiles, Motijheel Commercial Area, Dhaka 1000, Bangladesh</div>
                      </div>

                      <div className="border-b border-[#7f8ea7]">
                        <div className="grid grid-cols-[0.45fr_2fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.95fr] border-b border-[#7f8ea7] px-2 py-1.5 font-semibold" style={{ backgroundColor: settings.printerSurfaceColor }}>
                          <div>#</div>
                          <div>Item name</div>
                          <div>HSC/SAC</div>
                          <div>Quantity</div>
                          <div>Price/unit</div>
                          <div>Discount</div>
                          <div>GST</div>
                          <div>Amount</div>
                        </div>
                        {[
                          ["1", "ITEM 1", "1234", "1+1", "10.00", "0.10 (1%)", "0.50 (5%)", "10.40"],
                          ["2", "ITEM 2", "6325", "1", "30.00", "0.00 (0%)", "5.40 (18%)", "35.40"],
                        ].map((row) => (
                          <div key={row[0]} className="grid grid-cols-[0.45fr_2fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.95fr] border-b border-[#dde5f0] px-2 py-1.5">
                            {row.map((cell) => (
                              <div key={cell}>{cell}</div>
                            ))}
                          </div>
                        ))}
                        <div className="grid grid-cols-[0.45fr_2fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.95fr] px-2 py-1.5 font-bold">
                          <div />
                          <div>TOTAL</div>
                          <div />
                          <div>2 + 1</div>
                          <div />
                          <div>0.10</div>
                          <div>5.90</div>
                          <div>45.80</div>
                        </div>
                      </div>

                      <div className="grid border-b border-[#7f8ea7] md:grid-cols-[1.45fr_0.9fr]">
                        <div className="border-b border-[#7f8ea7] md:border-b-0 md:border-r">
                          <div className="px-2 py-1 font-semibold">Tax Summary:</div>
                          <div className="grid grid-cols-5 text-[10px]">
                            <div className="border-t border-[#dde5f0] px-2 py-1 font-semibold">HSN / SAC</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1 font-semibold">Taxable amount</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1 font-semibold">CGST</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1 font-semibold">SGST</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1 font-semibold">Total Tax</div>
                            <div className="border-t border-[#dde5f0] px-2 py-1">1234</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1">50.20</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1">3.96</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1">3.96</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1">9.92</div>
                            <div className="border-t border-[#dde5f0] px-2 py-1">6325</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1">30.00</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1">2.70</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1">2.70</div>
                            <div className="border-l border-t border-[#dde5f0] px-2 py-1">5.40</div>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <div className="border-b border-[#dde5f0] px-2 py-1 font-semibold">Totals</div>
                          <div className="space-y-1 px-2 py-2 text-[10.5px]">
                            {totalRows.map(([label, value]) => (
                              <div key={label} className="flex items-center justify-between gap-3">
                                <span>{label}</span>
                                <span className={cn(label === "You Saved" ? "font-bold" : "")} style={label === "You Saved" ? { color: settings.printerAccentColor } : undefined}>
                                  {value}
                                </span>
                              </div>
                            ))}
                            {settings.printAmountGrouping ? <div className="border-t border-[#dde5f0] pt-2 text-[10px] text-[#5e6b81]">Invoice Amount In Words: Forty Two Rupees and Thirty Two Paisa only</div> : null}
                          </div>
                        </div>
                      </div>

                      <div className="grid flex-1 md:grid-cols-2">
                        <div className="border-b border-[#7f8ea7] md:border-b-0 md:border-r">
                          <div className="border-b border-[#7f8ea7] px-2 py-1 font-semibold">Description:</div>
                          <div className="px-2 py-2 text-[10.5px]">
                            {settings.printDescriptionEnabled ? <div>Sale Description</div> : <div className="text-[#94a3b8]">Description hidden</div>}
                            {settings.printReceivedByDetails ? (
                              <div className="mt-3">
                                <div className="font-semibold">Received By:</div>
                                <div>Cash counter / Store desk</div>
                              </div>
                            ) : null}
                            {settings.printDeliveredByDetails ? (
                              <div className="mt-3">
                                <div className="font-semibold">Delivered By:</div>
                                <div>Rahim Warehouse Team</div>
                              </div>
                            ) : null}
                            <div className="mt-3">
                              <div className="font-semibold">Bank Details:</div>
                              <div className="mt-1">Bank Name: 123123123123</div>
                              <div>Bank Account No.: 12312312312</div>
                              <div>Bank IFSC code: 123123123</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <div className="border-b border-[#7f8ea7] px-2 py-1 font-semibold">Terms & Conditions:</div>
                          <div className="flex flex-1 flex-col justify-between px-2 py-2 text-[10.5px]">
                            <div>
                              {settings.printTermsEnabled ? <div>Thanks for doing business with us!</div> : <div className="text-[#94a3b8]">Terms hidden</div>}
                              {settings.paymentModeEnabled ? <div className="mt-3">Payment Mode: Cash</div> : null}
                              {settings.printAcknowledgementEnabled ? <div className="mt-1">Acknowledgement required on delivery.</div> : null}
                            </div>
                            {settings.printSignatureTextEnabled ? (
                              <div className="mt-6 flex flex-col items-center justify-end">
                                <div className="mb-2 h-16 w-20 bg-[#e5e7eb]" />
                                <div className="font-medium">{settings.printSignatureText}</div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-[#73819b]">
                  <span>
                    {settings.paperSize} / {settings.printOrientation} / {settings.invoiceTextSize}
                  </span>
                  <span style={{ color: settings.printerPrimaryColor }}>{isThermalPrinter ? "Thermal preview" : "Regular preview"}</span>
                </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderTaxesSection() {
    return (
      <>
        <section className="mb-8 rounded-[16px] border border-[#d7dfeb] bg-[#fbfdff] p-5 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
          <div className="border-b border-[#d7dfeb] pb-3 text-[18px] font-semibold text-[#132949]">Tax Configuration</div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5">
              <span className="text-[15px] text-[#132949]">Country</span>
              <select
                value={settings.taxCountry}
                onChange={(event) => {
                  const nextCountryCode = event.target.value;
                  const preset = taxCountryPresets.find((entry) => entry.code === nextCountryCode);
                  patchSettings({
                    taxCountry: nextCountryCode,
                    taxSystem: preset?.taxSystem ?? settings.taxSystem,
                    taxRegistrationLabel: preset?.registrationLabel ?? settings.taxRegistrationLabel,
                  });
                }}
                className="h-10 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949]"
              >
                {taxCountryPresets.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-[15px] text-[#132949]">Tax System</span>
              <select
                value={settings.taxSystem}
                onChange={(event) => patchSettings({ taxSystem: event.target.value })}
                className="h-10 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949]"
              >
                {["VAT", "GST", "Sales Tax", "Custom"].map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-1.5">
              <span className="text-[15px] text-[#132949]">{settings.taxRegistrationLabel}</span>
              <Input
                value={settings.taxRegistrationNumber}
                onChange={(event) => patchSettings({ taxRegistrationNumber: event.target.value })}
                placeholder={`Enter ${settings.taxRegistrationLabel}`}
                className="h-10 rounded-[8px] border-[#d7dfeb]"
              />
            </label>

            <div className="grid gap-1.5">
              <span className="text-[15px] text-[#132949]">Country Preset</span>
              <Button type="button" variant="outline" className="h-10 rounded-[8px] border-[#d7dfeb] bg-white text-[#2477ff] hover:bg-[#f4f8ff]" onClick={handleApplyTaxCountryPreset}>
                Load {settings.taxSystem} Preset
              </Button>
            </div>
          </div>

          <div className="mt-4 rounded-[12px] border border-[#e4ebf5] bg-white px-4 py-3 text-sm leading-6 text-[#6f7e99]">
            Start with a country-based VAT/GST configuration, then add or edit custom tax rates and tax groups below.
          </div>
        </section>

        <div className="grid gap-8 xl:grid-cols-2">
          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#d7dfeb] pb-3">
              <div className="text-[18px] font-semibold text-[#132949]">Tax Rates</div>
              <button
                type="button"
                onClick={() => openTaxModal("rate")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#7c8699] transition hover:bg-[#f4f7fb] hover:text-[#132949]"
                aria-label="Add tax rate"
              >
                <PlusCircle className="h-7 w-7" />
              </button>
            </div>

            {taxRates.length ? (
              <div className="space-y-3">
                {taxRates.map((taxRate) => (
                  <div key={taxRate.id} className="rounded-[12px] border border-[#d7dfeb] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[16px] font-semibold text-[#132949]">{taxRate.name}</div>
                        <div className="mt-1 text-sm text-[#73819b]">{taxRate.kind}</div>
                      </div>
                      <div className="rounded-full bg-[#fff6ea] px-3 py-1 text-sm font-semibold text-[#d86d0f]">{taxRate.rate}%</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="min-h-[280px] rounded-[14px] border border-dashed border-[#d9e1ee] bg-[#fbfcfe]" />
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2 border-b border-[#d7dfeb] pb-3">
              <div className="text-[18px] font-semibold text-[#132949]">Tax Group</div>
              <button
                type="button"
                onClick={() => openTaxModal("group")}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#7c8699] transition hover:bg-[#f4f7fb] hover:text-[#132949]"
                aria-label="Add tax group"
              >
                <PlusCircle className="h-7 w-7" />
              </button>
            </div>

            {taxGroups.length ? (
              <div className="space-y-3">
                {taxGroups.map((taxGroup) => (
                  <div key={taxGroup.id} className="rounded-[12px] border border-[#d7dfeb] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                    <div className="text-[16px] font-semibold text-[#132949]">{taxGroup.name}</div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {taxGroup.taxRateIds.map((taxRateId) => {
                        const matchedTaxRate = taxRates.find((item) => item.id === taxRateId);
                        if (!matchedTaxRate) {
                          return null;
                        }

                        return (
                          <span key={taxRateId} className="rounded-full bg-[#eff4fb] px-3 py-1 text-xs font-semibold text-[#30527f]">
                            {matchedTaxRate.name} ({matchedTaxRate.rate}%)
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="min-h-[280px] rounded-[14px] border border-dashed border-[#d9e1ee] bg-[#fbfcfe]" />
            )}
          </section>
        </div>

        {taxModal === "rate" ? (
          <div className="fixed inset-0 z-[76] flex items-center justify-center bg-[rgba(15,23,42,0.46)] px-4" onClick={closeTaxModal}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-tax-rate-title"
              className="w-full max-w-[350px] rounded-[10px] bg-white p-5 shadow-[0_24px_50px_rgba(15,23,42,0.2)]"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSaveTaxRate();
                }
              }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div id="add-tax-rate-title" className="text-[16px] font-semibold text-[#132949]">
                  Add Tax Rate
                </div>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f4f8] text-[#8b97aa] transition hover:text-[#132949]" onClick={closeTaxModal}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <Input value={taxRateName} onChange={(event) => setTaxRateName(event.target.value)} placeholder="Tax Name" className="h-10 rounded-[6px] border-[#cad5e5]" />
                <div className="grid grid-cols-[1fr_100px] gap-2">
                  <Input value={taxRateValue} onChange={(event) => setTaxRateValue(event.target.value)} placeholder="Rate" className="h-10 rounded-[6px] border-[#cad5e5]" />
                  <select value={taxRateKind} onChange={(event) => setTaxRateKind(event.target.value)} className="h-10 rounded-[6px] border border-[#cad5e5] bg-white px-3 text-sm text-[#132949]">
                    <option value="Other">Other</option>
                    <option value="GST">GST</option>
                    <option value="VAT">VAT</option>
                    <option value="Service">Service</option>
                  </select>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-3">
                <Button type="button" variant="outline" className="rounded-[6px] border-[#d7dfeb] px-5" onClick={closeTaxModal}>
                  Cancel
                </Button>
                <Button type="button" className="rounded-[6px] bg-primary px-5 hover:bg-[#cf670f]" onClick={handleSaveTaxRate}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {taxModal === "group" ? (
          <div className="fixed inset-0 z-[76] flex items-center justify-center bg-[rgba(15,23,42,0.46)] px-4" onClick={closeTaxModal}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-tax-group-title"
              className="w-full max-w-[420px] rounded-[10px] bg-white p-5 shadow-[0_24px_50px_rgba(15,23,42,0.2)]"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSaveTaxGroup();
                }
              }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div id="add-tax-group-title" className="text-[16px] font-semibold text-[#132949]">
                  Add Tax Group
                </div>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f4f8] text-[#8b97aa] transition hover:text-[#132949]" onClick={closeTaxModal}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <Input value={taxGroupName} onChange={(event) => setTaxGroupName(event.target.value)} placeholder="Tax Group Name" className="h-10 rounded-[6px] border-[#cad5e5]" />
                <div className="max-h-[240px] space-y-2 overflow-y-auto rounded-[8px] border border-[#d7dfeb] p-3">
                  {taxRates.length ? (
                    taxRates.map((taxRate) => (
                      <label key={taxRate.id} className="flex items-center justify-between gap-3 rounded-[8px] px-2 py-2 transition hover:bg-[#f8fbff]">
                        <span>
                          <span className="block text-sm font-medium text-[#132949]">{taxRate.name}</span>
                          <span className="block text-xs text-[#73819b]">
                            {taxRate.rate}% • {taxRate.kind}
                          </span>
                        </span>
                        <input type="checkbox" checked={taxGroupSelections.includes(taxRate.id)} onChange={() => toggleTaxGroupSelection(taxRate.id)} className="h-4 w-4 rounded border-[#b7c5da]" />
                      </label>
                    ))
                  ) : (
                    <div className="py-6 text-center text-sm text-[#73819b]">Create a tax rate first, then build a tax group.</div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-3">
                <Button type="button" variant="outline" className="rounded-[6px] border-[#d7dfeb] px-5" onClick={closeTaxModal}>
                  Cancel
                </Button>
                <Button type="button" className="rounded-[6px] bg-primary px-5 hover:bg-[#cf670f]" disabled={!taxRates.length} onClick={handleSaveTaxGroup}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  function renderTransactionMessageSection() {
    const automaticMessageOptions: Array<{ key: keyof AutoBackupSettings; label: string }> = [
      { key: "autoMessageSales", label: "Sales" },
      { key: "autoMessagePurchase", label: "Purchase" },
      { key: "autoMessageSalesReturn", label: "Sales Return" },
      { key: "autoMessagePurchaseReturn", label: "Purchase Return" },
      { key: "autoMessagePaymentIn", label: "Payment In" },
      { key: "autoMessagePaymentOut", label: "Payment Out" },
      { key: "autoMessageSaleOrder", label: "Sale Order" },
      { key: "autoMessagePurchaseOrder", label: "Purchase Order" },
      { key: "autoMessageEstimate", label: "Estimate" },
      { key: "autoMessageProformaInvoice", label: "Proforma Invoice" },
      { key: "autoMessageDeliveryChallan", label: "Delivery Note" },
      { key: "autoMessageCancelledInvoice", label: "Cancelled Invoice" },
    ];

    return (
      <div className="grid gap-0 overflow-hidden rounded-[14px] border border-[#d7e1ee] xl:grid-cols-[1.25fr_0.95fr]">
        <div className="space-y-0 border-r border-[#d7e1ee] bg-white">
          <section className="border-b border-[#d7e1ee] p-4">
            <div className="mb-4 text-[15px] font-semibold text-[#6f7e99]">Select Message Type:</div>
            <div className="inline-flex overflow-hidden rounded-[8px] border border-[#d7dfeb] bg-white">
              <div className="flex items-center gap-3 px-4 py-3 text-[15px] text-[#132949]">
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[#20c45a] text-[10px] font-bold text-[#20c45a]">w</span>
                Send via Personal WhatsApp
              </div>
              <button type="button" className="border-l border-[#d7dfeb] bg-[#eff7ff] px-4 text-sm font-semibold text-[#2477ff]" onClick={openWhatsappWeb}>
                Login
              </button>
            </div>

            <div className="mt-8 text-[15px] font-semibold text-[#6f7e99]">Message Recipient Settings:</div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="flex items-center gap-3 text-[15px] text-[#46536b]">
                <input type="checkbox" checked={settings.sendMessageToParty} onChange={(event) => patchSettings({ sendMessageToParty: event.target.checked })} className="h-5 w-5 rounded border-[#b7c5da]" />
                <span className="inline-flex items-center gap-1">
                  Send Message to Party
                  <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
                </span>
              </label>
              <label className="flex items-center gap-3 text-[15px] text-[#46536b]">
                <input type="checkbox" checked={settings.sendTransactionUpdateMessage} onChange={(event) => patchSettings({ sendTransactionUpdateMessage: event.target.checked })} className="h-5 w-5 rounded border-[#b7c5da]" />
                <span className="inline-flex items-center gap-1">
                  Send Transaction Update Message
                  <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
                  <span className="inline-flex h-2 w-2 rounded-full bg-[#ff335f]" />
                </span>
              </label>
              <label className="flex items-center gap-3 text-[15px] text-[#46536b]">
                <input type="checkbox" checked={settings.sendMessageCopyToSelf} onChange={(event) => patchSettings({ sendMessageCopyToSelf: event.target.checked })} className="h-5 w-5 rounded border-[#b7c5da]" />
                <span className="inline-flex items-center gap-1">
                  Send Message Copy to Self
                  <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
                </span>
              </label>
            </div>
          </section>

          <section className="p-4">
            <div className="border-b border-[#d7e1ee] pb-3 text-[15px] font-semibold text-[#6f7e99]">Message Content:</div>
            <div className="mt-4 flex flex-wrap gap-x-8 gap-y-4">
              <label className="flex items-center gap-3 text-[15px] text-[#46536b]">
                <input type="checkbox" checked={settings.partyCurrentBalanceInMessage} onChange={(event) => patchSettings({ partyCurrentBalanceInMessage: event.target.checked })} className="h-5 w-5 rounded border-[#b7c5da]" />
                <span className="inline-flex items-center gap-1">
                  Party Current Balance in Message
                  <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
                </span>
              </label>
              <label className="flex items-center gap-3 text-[15px] text-[#46536b]">
                <input type="checkbox" checked={settings.webInvoiceLinkInMessage} onChange={(event) => patchSettings({ webInvoiceLinkInMessage: event.target.checked })} className="h-5 w-5 rounded border-[#b7c5da]" />
                <span className="inline-flex items-center gap-1">
                  Web invoice link in Message
                  <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
                </span>
              </label>
            </div>

            <div className="mt-8 border-b border-[#d7e1ee] pb-3 text-[15px] font-semibold text-[#6f7e99]">Send Automatic Message for:</div>
            <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-3">
              {automaticMessageOptions.map((option) => (
                <label key={option.key} className="flex items-center gap-3 text-[15px] text-[#46536b]">
                  <input
                    type="checkbox"
                    checked={Boolean(settings[option.key])}
                    onChange={(event) => patchSettings({ [option.key]: event.target.checked } as Partial<AutoBackupSettings>)}
                    className="h-5 w-5 rounded border-[#b7c5da]"
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </section>
        </div>

        <div className="space-y-6 bg-white p-5">
          <div className="flex items-center justify-center gap-3 text-[15px] text-[#5c6980]">
            <span className="font-semibold">Transaction Type :</span>
            <select
              value={settings.transactionMessageType}
              onChange={(event) => patchSettings({ transactionMessageType: event.target.value })}
              className="h-10 rounded-full border border-[#d7dfeb] bg-[#eff7ff] px-4 text-sm font-semibold text-[#132949]"
            >
              <option value="Sales Transaction">Sales Transaction</option>
              <option value="Purchase Transaction">Purchase Transaction</option>
              <option value="Payment In">Payment In</option>
              <option value="Payment Out">Payment Out</option>
              <option value="Sale Order">Sale Order</option>
            </select>
          </div>

          <div className="text-center text-[16px] font-semibold text-[#233754]">Edit Message</div>
          <div className="mx-auto max-w-[320px] rounded-[14px] border border-[#dce4ef] bg-white p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)]">
            <textarea
              value={settings.transactionMessageGreeting}
              onChange={(event) => patchSettings({ transactionMessageGreeting: event.target.value })}
              className="min-h-[80px] w-full resize-none rounded-[10px] border border-[#e0e7f1] px-4 py-3 text-[14px] text-[#132949] outline-none placeholder:text-[#a2adbf]"
              placeholder="Greeting"
            />
            <textarea
              value={settings.transactionMessageDetails}
              onChange={(event) => patchSettings({ transactionMessageDetails: event.target.value })}
              className="mt-3 min-h-[120px] w-full resize-none rounded-[10px] border border-[#e0e7f1] px-4 py-3 text-[14px] text-[#132949] outline-none placeholder:text-[#a2adbf]"
              placeholder="Message details"
            />
            <Input
              value={settings.transactionMessageFooter}
              onChange={(event) => patchSettings({ transactionMessageFooter: event.target.value })}
              className="mt-3 h-11 rounded-[10px] border-[#84b5ff] border-dashed"
              placeholder="Footer"
            />
          </div>

          <div className="text-center text-[16px] font-semibold text-[#8d97ab]">Message Preview</div>
          <div className="mx-auto max-w-[320px] rounded-[12px] bg-[#d8f4c9] p-4 shadow-[0_10px_24px_rgba(97,165,65,0.16)]">
            {settings.webInvoiceLinkInMessage ? (
              <div className="mb-3 inline-flex w-full items-center gap-2 rounded-[10px] bg-[#c9eeb8] px-3 py-2 text-sm font-semibold text-[#1970ff]">
                <Paperclip className="h-4 w-4" />
                Transaction Image Attached
              </div>
            ) : null}
            <div className="whitespace-pre-line text-[14px] leading-7 text-[#1d2b12]">
              {settings.transactionMessageGreeting}
              {"\n"}
              {settings.transactionMessageDetails}
              {settings.partyCurrentBalanceInMessage ? "\nParty Current Balance: 800.00" : ""}
              {settings.sendMessageCopyToSelf ? "\nCopy marked to self." : ""}
              {settings.sendTransactionUpdateMessage ? "\nUpdate messages enabled." : ""}
              {settings.transactionMessageFooter ? `\n${settings.transactionMessageFooter}` : ""}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderPartySection() {
    const additionalFields: Array<{
      enabledKey: keyof AutoBackupSettings;
      labelKey: keyof AutoBackupSettings;
      printKey: keyof AutoBackupSettings;
      placeholder: string;
      withFormat?: boolean;
    }> = [
      { enabledKey: "additionalField1Enabled", labelKey: "additionalField1Label", printKey: "additionalField1ShowInPrint", placeholder: "Additional Field 1" },
      { enabledKey: "additionalField2Enabled", labelKey: "additionalField2Label", printKey: "additionalField2ShowInPrint", placeholder: "Additional Field 2" },
      { enabledKey: "additionalField3Enabled", labelKey: "additionalField3Label", printKey: "additionalField3ShowInPrint", placeholder: "Additional Field 3" },
      { enabledKey: "additionalField4Enabled", labelKey: "additionalField4Label", printKey: "additionalField4ShowInPrint", placeholder: "Additional Field 4", withFormat: true },
    ];

    return (
      <div className="grid gap-8 xl:grid-cols-[1fr_1fr_0.95fr]">
        <section className="space-y-6">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Party Settings</div>

          <SettingCheckboxRow checked={settings.partyGrouping} label="Party Grouping" onChange={(checked) => patchSettings({ partyGrouping: checked })} />
          <SettingCheckboxRow checked={settings.shippingAddressEnabled} label="Shipping Address" onChange={(checked) => patchSettings({ shippingAddressEnabled: checked })} />
          <SettingCheckboxRow checked={settings.printShippingAddress} label="Print Shipping Address" onChange={(checked) => patchSettings({ printShippingAddress: checked })} />
          <SettingCheckboxRow checked={settings.managePartyStatus} label="Manage Party Status" onChange={(checked) => patchSettings({ managePartyStatus: checked })} />
          <SettingCheckboxRow checked={settings.enablePaymentReminder} label="Enable Payment Reminder" onChange={(checked) => patchSettings({ enablePaymentReminder: checked })} />

          <div className="pl-11">
            <div className="grid max-w-[320px] grid-cols-[1fr_60px_auto] items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[15px] text-[#132949]">
                Remind me for payment due in
                <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
              </span>
              <Input
                type="number"
                min={1}
                value={settings.paymentReminderDays}
                disabled={!settings.enablePaymentReminder}
                onChange={(event) => patchSettings({ paymentReminderDays: Number(event.target.value || 1) })}
                className="h-10 rounded-[8px] border-[#d7dfeb] disabled:bg-[#f6f8fc]"
              />
              <span className="text-sm text-[#132949]">(days)</span>
            </div>
            <button type="button" className="mt-6 rounded-[8px] bg-[#f3f6fb] px-4 py-2 text-sm font-medium text-[#2477ff]" onClick={() => focusSettingsSection("transaction-message")}>
              Reminder Message &gt;
            </button>
          </div>
        </section>

        <section className="space-y-6">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Additional Fields</div>

          <div className="space-y-8">
            {additionalFields.map((field) => {
              const enabled = Boolean(settings[field.enabledKey]);
              const label = String(settings[field.labelKey]);
              const showInPrint = Boolean(settings[field.printKey]);

              return (
                <div key={String(field.labelKey)} className="space-y-3">
                  <div className="grid grid-cols-[auto_1fr] items-center gap-3">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => patchSettings({ [field.enabledKey]: event.target.checked } as Partial<AutoBackupSettings>)}
                      className="h-5 w-5 rounded border-[#b7c5da]"
                    />
                    <div className={cn("grid gap-2", field.withFormat ? "grid-cols-[1fr_120px]" : "grid-cols-1")}>
                      <Input
                        value={label}
                        onChange={(event) => patchSettings({ [field.labelKey]: event.target.value } as Partial<AutoBackupSettings>)}
                        disabled={!enabled}
                        placeholder={field.placeholder}
                        className="h-10 rounded-[8px] border-[#d7dfeb] disabled:bg-[#f6f8fc]"
                      />
                      {field.withFormat ? (
                        <select
                          value={settings.additionalField4Format}
                          onChange={(event) => patchSettings({ additionalField4Format: event.target.value })}
                          disabled={!enabled}
                          className="h-10 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949] disabled:bg-[#f6f8fc]"
                        >
                          <option value="dd/mm/yyyy">DD/MM/YYYY</option>
                        </select>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <label className="inline-flex items-center gap-3 text-[15px] text-[#132949]">
                      <button
                        type="button"
                        aria-pressed={showInPrint}
                        onClick={() => patchSettings({ [field.printKey]: !showInPrint } as Partial<AutoBackupSettings>)}
                        className={cn(
                          "relative inline-flex h-6 w-10 rounded-full transition",
                          showInPrint ? "bg-[#2477ff]" : "bg-[#d8dbe2]",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-1 h-4 w-4 rounded-full bg-white transition",
                            showInPrint ? "left-5" : "left-1",
                          )}
                        />
                      </button>
                      Show In Print
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-6">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Enable Loyalty Point</div>
          <SettingCheckboxRow checked={settings.enableLoyaltyPoint} label="Enable Loyalty Point" onChange={(checked) => patchSettings({ enableLoyaltyPoint: checked })} />
        </section>
      </div>
    );
  }

  function renderItemSection() {
    const additionalItemFields: Array<{
      enabledKey: keyof AutoBackupSettings;
      labelKey: keyof AutoBackupSettings;
      formatKey?: keyof AutoBackupSettings;
      formatOptions?: string[];
    }> = [
      { enabledKey: "mrpEnabled", labelKey: "mrpLabel" },
      { enabledKey: "serialTrackingEnabled", labelKey: "serialTrackingLabel" },
      { enabledKey: "batchNoEnabled", labelKey: "batchNoLabel" },
      { enabledKey: "expDateEnabled", labelKey: "expDateLabel", formatKey: "expDateFormat", formatOptions: ["dd/mm/yyyy"] },
      { enabledKey: "mfgDateEnabled", labelKey: "mfgDateLabel", formatKey: "mfgDateFormat", formatOptions: ["dd/mm/yyyy"] },
      { enabledKey: "modelNoEnabled", labelKey: "modelNoLabel" },
      { enabledKey: "sizeEnabled", labelKey: "sizeLabel" },
    ];

    return (
      <div className="grid gap-8 xl:grid-cols-[1fr_1fr_0.95fr]">
        <section className="space-y-6">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Item Settings</div>

          <SettingCheckboxRow checked={settings.enableItem} label="Enable Item" onChange={(checked) => patchSettings({ enableItem: checked })} />

          <div className="pl-11">
            <label className="inline-flex items-center gap-3 text-[15px] text-[#132949]">
              <span className="inline-flex items-center gap-1">
                What do you sell?
                <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
              </span>
              <select value={settings.itemSellType} onChange={(event) => patchSettings({ itemSellType: event.target.value })} className="h-10 border-b border-[#d7dfeb] bg-transparent px-1 text-[15px] text-[#132949] outline-none">
                <option value="Product/Service">Product/Service</option>
                <option value="Product">Product</option>
                <option value="Service">Service</option>
              </select>
            </label>
          </div>

          <SettingCheckboxRow checked={settings.barcodeScanEnabled} label="Barcode Scan" onChange={(checked) => patchSettings({ barcodeScanEnabled: checked })} />
          <SettingCheckboxRow checked={settings.stockMaintenanceEnabled} label="Stock Maintenance" onChange={(checked) => patchSettings({ stockMaintenanceEnabled: checked })} />

          {costingSettings ? (
            <div className="pl-11">
              <label className="inline-flex items-center gap-3 text-[15px] text-[#132949]">
                <span className="inline-flex items-center gap-1">
                  Costing Method
                  <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
                </span>
                <select
                  value={costingSettings.costingMethod}
                  disabled
                  title="Only Moving Weighted Average is available today; the other methods are planned."
                  className="h-10 cursor-not-allowed border-b border-[#d7dfeb] bg-transparent px-1 text-[15px] text-[#132949] opacity-70 outline-none"
                >
                  {(
                    [
                      { value: "MOVING_WEIGHTED_AVERAGE", label: "Moving Weighted Average" },
                      { value: "PERIODIC_WEIGHTED_AVERAGE", label: "Periodic Weighted Average" },
                      { value: "FIFO", label: "FIFO" },
                      { value: "LIFO", label: "LIFO" },
                    ] as const
                  ).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                      {costingSettings.supportedCostingMethods.includes(option.value) ? "" : " (Coming soon)"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <SettingCheckboxRow checked={settings.manufacturingEnabled} label="Manufacturing" onChange={(checked) => patchSettings({ manufacturingEnabled: checked })} />
          <SettingCheckboxRow checked={settings.showLowStockDialog} label="Show Low Stock Dialog" onChange={(checked) => patchSettings({ showLowStockDialog: checked })} />
          <SettingCheckboxRow checked={settings.itemsUnitEnabled} label="Items Unit" onChange={(checked) => patchSettings({ itemsUnitEnabled: checked })} />
          <SettingCheckboxRow checked={settings.defaultUnitEnabled} label="Default Unit" onChange={(checked) => patchSettings({ defaultUnitEnabled: checked })} />
          <SettingCheckboxRow checked={settings.itemCategoryEnabled} label="Item Category" onChange={(checked) => patchSettings({ itemCategoryEnabled: checked })} />
          <SettingCheckboxRow checked={settings.partyWiseItemRateEnabled} label="Party Wise Item Rate" onChange={(checked) => patchSettings({ partyWiseItemRateEnabled: checked })} />

          <SettingToggleInputRow
            checked={settings.itemDescriptionEnabled}
            label="Description"
            value={settings.itemDescriptionLabel}
            onToggle={(checked) => patchSettings({ itemDescriptionEnabled: checked })}
            onChange={(value) => patchSettings({ itemDescriptionLabel: value })}
          />

          <SettingCheckboxRow checked={settings.itemWiseTaxEnabled} label="Item wise Tax" onChange={(checked) => patchSettings({ itemWiseTaxEnabled: checked })} />
          <SettingCheckboxRow checked={settings.itemWiseDiscountEnabled} label="Item wise Discount" onChange={(checked) => patchSettings({ itemWiseDiscountEnabled: checked })} />
          <SettingCheckboxRow checked={settings.updateSalePriceFromTransaction} label="Update Sale Price from Transaction" onChange={(checked) => patchSettings({ updateSalePriceFromTransaction: checked })} />

          <div className="pl-11">
            <div className="grid max-w-[320px] grid-cols-[1fr_50px_1fr] items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[15px] text-[#132949]">
                Quantity
                <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
              </span>
              <Input
                type="number"
                min={0}
                max={4}
                value={settings.itemQuantityDecimalPlaces}
                onChange={(event) => patchSettings({ itemQuantityDecimalPlaces: Number(event.target.value || 0) })}
                className="h-10 rounded-[8px] border-[#d7dfeb]"
              />
              <span className="text-sm text-[#73819b]">e.g 0.00</span>
            </div>
            <div className="mt-1 text-xs text-[#73819b]">(upto Decimal Places)</div>
          </div>

          <SettingCheckboxRow checked={settings.wholesalePriceEnabled} label="Wholesale Price" onChange={(checked) => patchSettings({ wholesalePriceEnabled: checked })} />
        </section>

        <section className="space-y-6">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Additional Item Fields</div>

          <div className="space-y-7">
            <div className="text-[15px] font-semibold text-[#5f6f8b]">MRP/Price</div>
            {additionalItemFields.map((field) => {
              const enabled = Boolean(settings[field.enabledKey]);
              const label = String(settings[field.labelKey]);
              const formatKey = field.formatKey;

              return (
                <div key={String(field.labelKey)} className="grid grid-cols-[auto_1fr] items-center gap-3">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => patchSettings({ [field.enabledKey]: event.target.checked } as Partial<AutoBackupSettings>)}
                    className="h-5 w-5 rounded border-[#b7c5da]"
                  />
                  <div className={cn("grid items-center gap-2", field.formatKey ? "grid-cols-[110px_1fr]" : "grid-cols-1")}>
                    {formatKey ? (
                      <select
                        value={String(settings[formatKey])}
                        onChange={(event) => patchSettings({ [formatKey]: event.target.value } as Partial<AutoBackupSettings>)}
                        disabled={!enabled}
                        className="h-10 rounded-[8px] border border-[#d7dfeb] bg-white px-3 text-sm text-[#132949] disabled:bg-[#f6f8fc]"
                      >
                        {field.formatOptions?.map((option) => (
                          <option key={option} value={option}>
                            {option.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <Input
                      value={label}
                      onChange={(event) => patchSettings({ [field.labelKey]: event.target.value } as Partial<AutoBackupSettings>)}
                      disabled={!enabled}
                      placeholder={label}
                      className="h-10 rounded-[8px] border-[#d7dfeb] disabled:bg-[#f6f8fc]"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="space-y-6">
          <div className="border-b border-[#dde4ef] pb-3 text-[15px] font-semibold text-[#132949]">Item Custom Fields</div>
          <button type="button" className="rounded-[8px] bg-[#f3f6fb] px-4 py-2 text-sm font-medium text-[#2477ff]" onClick={() => focusSettingsSection("item")}>
            Add Custom Fields &gt;
          </button>
        </section>
      </div>
    );
  }

  function renderServiceRemindersSection() {
    const reminderHighlights = [
      { icon: BellRing, label: "Remind your parties" },
      { icon: Sparkles, label: "Don't lose customers" },
      { icon: Wrench, label: "Grow your Business" },
    ];

    return (
      <div data-service-reminders-layout className="space-y-3 2xl:space-y-8">
        <div className="overflow-hidden rounded-[16px] bg-[linear-gradient(90deg,#1497f4_0%,#167ff0_48%,#1a6be8_100%)] text-white shadow-[0_18px_40px_rgba(23,110,227,0.22)]">
          <div className="flex flex-row items-center justify-between gap-3 px-4 py-3 2xl:gap-6 2xl:px-8 2xl:py-6">
            <div className="max-w-[760px] space-y-2">
              <div className="text-[15px] font-semibold 2xl:text-[20px]">How does Service Reminders feature work in Bizovix?</div>
              <div className="text-[11px] text-white/90 2xl:text-[15px]">Watch the video and see how you can grow your business using Service Reminders.</div>
            </div>

            <div className="flex shrink-0 items-center gap-2 rounded-full border border-white/20 bg-white/10 px-2 py-1.5 backdrop-blur-sm 2xl:gap-4 2xl:px-4 2xl:py-2">
              <div className="flex h-10 w-16 items-center justify-center rounded-[10px] border border-white/20 bg-[radial-gradient(circle_at_center,#1f2937_0%,#0f172a_62%,#09111f_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)] 2xl:h-16 2xl:w-28 2xl:rounded-[18px]">
                <button
                  type="button"
                  aria-label="Play service reminders video"
                  onClick={openServiceRemindersGuide}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[#ff4a63] transition hover:scale-105 2xl:h-11 2xl:w-11"
                >
                  <PlayCircle className="h-4 w-4 2xl:h-6 2xl:w-6" />
                </button>
              </div>
              <Button
                type="button"
                className="h-8 rounded-full bg-[#ff4a63] px-3 text-xs font-semibold text-white hover:bg-[#f23651] 2xl:h-10 2xl:px-6 2xl:text-[15px]"
                onClick={openServiceRemindersGuide}
              >
                <PlayCircle className="mr-1 h-3.5 w-3.5 2xl:mr-2 2xl:h-4 2xl:w-4" />
                Play Video
              </Button>
            </div>
          </div>
        </div>

        <div data-service-reminders-card className="flex min-h-[350px] flex-col items-center justify-center rounded-[18px] border border-[#edf1f7] bg-white px-4 py-3 text-center 2xl:min-h-[620px] 2xl:px-6 2xl:py-10">
          <div className="relative mb-3 flex h-[150px] w-full max-w-[500px] items-end justify-center overflow-hidden 2xl:mb-8 2xl:h-[280px] 2xl:max-w-[640px]">
            <div className="absolute inset-x-12 bottom-1 h-[125px] rounded-t-[150px] bg-[radial-gradient(circle_at_top,#ffeeb4_0%,#ffe39a_48%,#ffce63_100%)] shadow-[0_30px_80px_rgba(255,195,77,0.24)] 2xl:inset-x-8 2xl:bottom-2 2xl:h-[230px] 2xl:rounded-t-[220px]" />
            <div className="absolute bottom-1 left-1/2 h-4 w-[72%] -translate-x-1/2 rounded-full bg-[rgba(217,120,31,0.22)] blur-xl 2xl:bottom-2 2xl:h-7 2xl:w-[78%]" />

            <div className="absolute left-[14%] top-[42%] flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-[#f29a16] shadow-[0_12px_30px_rgba(255,187,72,0.35)] backdrop-blur-sm 2xl:h-16 2xl:w-16">
              <Wrench className="h-5 w-5 2xl:h-8 2xl:w-8" />
            </div>
            <div className="absolute left-[38%] top-[8%] flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-[#ef8f16] shadow-[0_12px_30px_rgba(255,187,72,0.35)] backdrop-blur-sm 2xl:h-16 2xl:w-16">
              <BellRing className="h-5 w-5 2xl:h-8 2xl:w-8" />
            </div>
            <div className="absolute right-[15%] top-[42%] flex h-10 w-10 items-center justify-center rounded-full bg-white/70 text-[#ef8f16] shadow-[0_12px_30px_rgba(255,187,72,0.35)] backdrop-blur-sm 2xl:h-16 2xl:w-16">
              <Sparkles className="h-5 w-5 2xl:h-8 2xl:w-8" />
            </div>

            <div className="relative z-10 mb-4 flex w-[140px] flex-col items-center 2xl:mb-8 2xl:w-[210px]">
              <div className="flex h-[78px] w-[112px] items-center justify-center rounded-[10px] border-4 border-[#d97728] bg-white shadow-[0_24px_50px_rgba(217,119,40,0.12)] 2xl:h-[122px] 2xl:w-[170px] 2xl:rounded-[14px] 2xl:border-[6px]">
                <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[linear-gradient(135deg,#ff8f2f_0%,#ff3e5a_55%,#f7b733_100%)] text-white shadow-[0_16px_30px_rgba(255,103,73,0.28)] 2xl:h-16 2xl:w-16 2xl:rounded-[18px]">
                  <Monitor className="h-6 w-6 2xl:h-8 2xl:w-8" />
                </div>
              </div>
              <div className="h-3 w-14 rounded-b-[8px] bg-[#e0a25e] 2xl:h-5 2xl:w-20 2xl:rounded-b-[10px]" />
              <div className="h-2.5 w-20 rounded-full bg-[#d97728] 2xl:h-4 2xl:w-32" />
            </div>
          </div>

          <div className="flex items-center gap-2 text-[24px] font-semibold text-[#132949] 2xl:text-[32px]">
            <span>Service Reminders</span>
            <span className="rounded-full bg-[#ff344f] px-3 py-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-white">New</span>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[13px] text-[#93a0b8] 2xl:mt-3 2xl:gap-3 2xl:text-[17px]">
            {reminderHighlights.map(({ icon: Icon, label }) => (
              <div key={label} className="inline-flex items-center gap-2">
                <Icon className="h-4 w-4 text-[#f28a1d]" />
                <span>{label}</span>
              </div>
            ))}
          </div>

          <Button
            type="button"
            className={cn(
              "mt-4 rounded-full px-6 py-4 text-[14px] font-semibold shadow-[0_16px_30px_rgba(243,114,44,0.24)] transition 2xl:mt-8 2xl:px-8 2xl:py-6 2xl:text-[16px]",
              settings.serviceRemindersEnabled ? "bg-[#eaf7ef] text-[#16964a] hover:bg-[#daf0e2]" : "bg-primary text-white hover:bg-[#cf670f]",
            )}
            onClick={() => {
              const nextValue = !settings.serviceRemindersEnabled;
              patchSettings({ serviceRemindersEnabled: nextValue });
              toast.success(nextValue ? "Service Reminders enabled" : "Service Reminders disabled");
            }}
          >
            <BellRing className="mr-2 h-4 w-4" />
            {settings.serviceRemindersEnabled ? "Service Reminders Enabled" : "Enable Service Reminders"}
          </Button>
        </div>
      </div>
    );
  }

  function renderMultiCurrencySection() {
    const hasBaseCurrency = currencies.some((currency) => currency.isBase);

    return (
      <>
        <div className="space-y-6">
          <div className="rounded-[12px] border border-[#edf1f7] bg-[#fbfcff] px-4 py-3 text-[15px] font-semibold text-[#132949]">Multi-Currency</div>

          <div className="rounded-[12px] bg-[#fff1d1] px-5 py-4 text-[15px] text-[#132949]">
            <span className="mr-2 text-[#f2b325]">✦</span>
            Bizovix now supports <span className="font-semibold">Multi-Currency</span>, so you can manage all your bills & transactions in any currency you need!
          </div>

          <div className="flex flex-wrap items-center justify-end gap-5">
            <label className="inline-flex items-center gap-3 text-[15px] text-[#132949]">
              <button
                type="button"
                aria-pressed={settings.liveExchangeRateEnabled}
                onClick={() => {
                  const enabled = !settings.liveExchangeRateEnabled;
                  patchSettings({ liveExchangeRateEnabled: enabled });
                  if (enabled) void refreshLiveExchangeRates();
                }}
                className={cn("relative inline-flex h-5 w-10 rounded-full transition", settings.liveExchangeRateEnabled ? "bg-[#2477ff]" : "bg-[#d8dbe2]")}
              >
                <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition", settings.liveExchangeRateEnabled ? "left-5" : "left-0.5")} />
              </button>
              Get Live Exchange Rate
              <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
            </label>

            {settings.liveExchangeRateEnabled ? (
              <Button type="button" variant="outline" className="rounded-full border-[#cdd9eb]" disabled={isRefreshingExchangeRates} onClick={() => void refreshLiveExchangeRates()}>
                <RefreshCw className={cn("mr-2 h-4 w-4", isRefreshingExchangeRates ? "animate-spin" : "")} />
                {isRefreshingExchangeRates ? "Updating..." : "Refresh Rates"}
              </Button>
            ) : null}

            <Button
              type="button"
              className="rounded-full bg-primary px-5 hover:bg-[#cf670f] disabled:cursor-not-allowed disabled:bg-[#eceff5] disabled:text-[#9aa5b7]"
              disabled={!hasBaseCurrency}
              onClick={() => openCurrencyModal("new")}
            >
              + Add New Currency
            </Button>
            <Info className="h-3.5 w-3.5 text-[#b0b7c7]" />
          </div>

          {settings.liveExchangeRateEnabled && liveExchangeQuote ? (
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[12px] border border-[#b9d6ff] bg-[#edf5ff] px-5 py-4 text-[#17365f]">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.1em] text-[#5c78a0]">Current live exchange rate</div>
                <div className="mt-1 text-[22px] font-bold">
                  1 {liveExchangeQuote.baseCode} = {new Intl.NumberFormat("en-BD", { maximumFractionDigits: 6 }).format(liveExchangeQuote.rate)} {liveExchangeQuote.quoteCode}
                </div>
              </div>
              <div className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-[#246ee9] shadow-sm">LIVE</div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[12px] border border-[#e7edf6] bg-white">
            <div className="grid grid-cols-[2fr_0.8fr_0.9fr_0.8fr_0.8fr] border-b border-[#eef2f8] bg-[#fbfcff] px-3 py-3 text-sm font-medium text-[#6d7d98]">
              <div>Name</div>
              <div>Symbol</div>
              <div>Rate in BDT</div>
              <div>Set on Date</div>
              <div className="flex justify-center"><MoreVertical className="h-4 w-4" aria-label="More actions" /></div>
            </div>

            {currencies.length ? (
              <div className="divide-y divide-[#eef2f8]">
                {currencies.map((currency) => (
                  <div key={currency.id} className="grid grid-cols-[2fr_0.8fr_0.9fr_0.8fr_0.8fr] items-center px-3 py-4 text-[15px] text-[#132949]">
                    <div className="flex items-center gap-3">
                      <span>{currency.name} <span className="text-xs text-[#7b8aa2]">({getCurrencyCode(currency) || "No code"})</span></span>
                      {currency.isBase ? <span className="rounded-full bg-[#eff4fb] px-2 py-1 text-[11px] font-semibold text-[#35598a]">Base</span> : null}
                    </div>
                    <div>{currency.symbol}</div>
                    <div className="font-semibold whitespace-nowrap">
                      {currency.bdtRate
                        ? `1 ${getCurrencyCode(currency)} = ${new Intl.NumberFormat("en-BD", { maximumFractionDigits: 6 }).format(Number(currency.bdtRate))} BDT`
                        : "Rate unavailable"}
                    </div>
                    <div>{formatDate(currency.setOnDate)}</div>
                    <div className="text-center">
                      <button
                        type="button"
                        className="text-sm font-medium text-[#e45757]"
                        onClick={() => void handleDeleteCurrency(currency.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex min-h-[720px] flex-col items-center justify-center px-6 text-center">
                <div className="mb-5 flex h-24 w-24 items-center justify-center rounded-full bg-[#ffd166] text-[42px] text-white shadow-[0_12px_30px_rgba(255,194,70,0.35)]">
                  ✈
                </div>
                <div className="text-[30px] font-semibold text-[#132949]">No Currencies to show</div>
                <div className="mt-2 max-w-[420px] text-[15px] text-[#92a0b5]">Add your Base currency to start adding more currencies.</div>
                <Button type="button" className="mt-6 rounded-full bg-primary px-7 hover:bg-[#cf670f]" onClick={() => openCurrencyModal("base")}>
                  + Add Base Currency
                </Button>
              </div>
            )}
          </div>
          {settings.liveExchangeRateEnabled ? (
            <div className="text-xs text-[#73819b]">
              <span>{lastExchangeRateUpdate ? `Last live update: ${formatDateTime(lastExchangeRateUpdate)}` : "Live rates will update when enabled or refreshed."}</span>
            </div>
          ) : null}
        </div>

        {currencyModal ? (
          <div className="fixed inset-0 z-[76] flex items-center justify-center bg-[rgba(15,23,42,0.46)] px-4" onClick={closeCurrencyModal}>
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="currency-modal-title"
              className="w-full max-w-[420px] rounded-[12px] bg-white p-5 shadow-[0_24px_50px_rgba(15,23,42,0.2)]"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleSaveCurrency();
                }
              }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div id="currency-modal-title" className="text-[18px] font-semibold text-[#132949]">
                  {currencyModal === "base" ? "Add Base Currency" : "Add New Currency"}
                </div>
                <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#f2f4f8] text-[#8b97aa] transition hover:text-[#132949]" onClick={closeCurrencyModal}>
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <select
                  value={currencyCode}
                  disabled={isLoadingCurrencyCatalog}
                  onChange={(event) => {
                    const code = event.target.value;
                    setCurrencyCode(code);
                    setCurrencyName(getCurrencyName(code));
                    setCurrencySymbol(getCurrencySymbol(code));
                  }}
                  className="h-11 w-full rounded-[8px] border border-[#cad5e5] bg-white px-3 text-sm text-[#132949] outline-none focus:border-[#3973e8] disabled:opacity-60"
                >
                  <option value="">{isLoadingCurrencyCatalog ? "Loading supported currencies..." : "Select currency"}</option>
                  {availableCurrencyCodes
                    .filter((code) => !currencies.some((currency) => getCurrencyCode(currency) === code))
                    .map((code) => <option key={code} value={code}>{code} — {getCurrencyName(code)}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <Input value={currencyName} readOnly placeholder="Currency Name" className="h-11 rounded-[8px] border-[#cad5e5] bg-[#f8fafc]" />
                  <Input value={currencySymbol} readOnly placeholder="Symbol" className="h-11 rounded-[8px] border-[#cad5e5] bg-[#f8fafc]" />
                </div>
                {!currencyModal || currencyModal === "new" ? (
                  <div className="rounded-[8px] border border-[#b9d6ff] bg-[#edf5ff] px-3 py-2.5 text-xs leading-5 text-[#355b87]">
                    Exchange rate and update date will be fetched automatically from the live API after saving.
                  </div>
                ) : null}
              </div>

              <div className="mt-5 flex justify-end gap-3">
                <Button type="button" variant="outline" className="rounded-[8px] border-[#d7dfeb] px-5" onClick={closeCurrencyModal}>
                  Cancel
                </Button>
                <Button type="button" className="rounded-[8px] bg-primary px-5 hover:bg-[#cf670f]" onClick={handleSaveCurrency}>
                  Save
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  function renderDateFormatSection() {
    return (
      <section className="max-w-2xl space-y-6">
        <div className="border-b border-[#d8dfe9] pb-4">
          <h2 className="text-[18px] font-semibold text-[#132949]">Date Format</h2>
          <p className="mt-1 text-sm text-[#73819b]">
            Choose how dates appear throughout vouchers, tables, reports and print views.
          </p>
        </div>
        <div className="space-y-3">
          <label htmlFor="application-date-format" className="block text-[15px] font-medium text-[#132949]">
            Display format
          </label>
          <select
            id="application-date-format"
            value={settings.dateFormat}
            onChange={(event) => patchSettings({ dateFormat: event.target.value as AppDateFormat })}
            className="h-11 w-full max-w-[360px] rounded-[6px] border border-[#d7dfeb] bg-white px-3 text-[14px] text-[#132949] outline-none focus:border-[#3973e8]"
          >
            <option value="DD/MM/YYYY">Day / Month / Year — 31/12/2026</option>
          </select>
          <p className="text-xs leading-5 text-[#73819b]">
            Click Save Changes to apply it everywhere. The saved format remains active until you save another one.
          </p>
        </div>
      </section>
    );
  }

  function renderSectionContent() {
    if (activeSection === "general") {
      return renderGeneralSection();
    }

    if (activeSection === "workflow") {
      return renderWorkflowSection();
    }

    if (activeSection === "transaction") {
      return renderTransactionSection();
    }

    if (activeSection === "print") {
      return renderPrintSection();
    }

    if (activeSection === "taxes") {
      return renderTaxesSection();
    }

    if (activeSection === "transaction-message") {
      return renderTransactionMessageSection();
    }

    if (activeSection === "party") {
      return renderPartySection();
    }

    if (activeSection === "item") {
      return renderItemSection();
    }

    if (activeSection === "warehouse") {
      return <WarehouseSettingsPanel />;
    }

    if (activeSection === "service-reminders") {
      return renderServiceRemindersSection();
    }

    if (activeSection === "date-format") {
      return renderDateFormatSection();
    }

    return renderMultiCurrencySection();
  }

  if (!mounted) {
    return null;
  }

  const settingsShell = (
    <form
      data-settings-shell
      className={cn(
        "flex flex-col rounded-[18px] border border-[#d7dfeb] bg-white",
        isFullSettingsPage
          ? "h-full min-h-0 overflow-hidden shadow-[0_18px_45px_rgba(15,23,42,0.08)]"
          : "fixed inset-[14px] z-[71] overflow-hidden shadow-[0_24px_70px_rgba(15,23,42,0.18)] md:inset-[20px] xl:inset-[28px]",
      )}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSave();
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={cn("z-10 flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[#d7dfeb] bg-white px-4", isFullSettingsPage && !isUtilityAutoBackupPage ? "py-3" : "py-4")}>
        <div>
          <div className="text-[18px] font-semibold text-[#132949]">{pageTitle}</div>
          {isFullSettingsPage && (isLoadingPersistedSettings || pageDescription) ? (
            <div className="mt-1 text-sm text-[#6f7e99]">
              {isLoadingPersistedSettings ? "Loading saved workspace settings..." : pageDescription}
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" className="rounded-full border-[#d7dfeb]" onClick={() => void handleRunBackupNow()} disabled={isRunningBackup || isSavingSettings}>
            <RefreshCw className={cn("mr-2 h-4 w-4", isRunningBackup ? "animate-spin" : "")} />
            {isRunningBackup ? "Backing Up..." : "Backup Now"}
          </Button>
          <Button type="submit" className="rounded-full bg-primary px-6 hover:bg-[#cf670f]" disabled={isSavingSettings || isRunningBackup}>
            <Save className={cn("mr-2 h-4 w-4", isSavingSettings ? "animate-pulse" : "")} />
            {isSavingSettings ? "Saving..." : "Save Changes"}
          </Button>
          {!isFullSettingsPage ? (
            <button
              type="button"
              aria-label="Close auto backup settings"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[#7b879c] transition hover:bg-[#f5f8fc] hover:text-[#132949]"
              onClick={handleClose}
            >
              <X className="h-6 w-6" />
            </button>
          ) : null}
        </div>
      </div>

      <div data-settings-layout className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[clamp(230px,19vw,330px)_minmax(0,1fr)]">
        <aside
          data-settings-navigation
          className={cn(
            "border-r border-[#d7dfeb] bg-white text-[#132949]",
            isFullSettingsPage ? "h-full overflow-y-auto" : "",
          )}
        >
          <div className="px-4 pb-4 pt-5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-[#7b879c]" />
            <Input
              value={menuQuery}
              onChange={(event) => handleSectionSearch(event.target.value)}
              placeholder="Search sections"
              aria-label="Search settings sections"
              className="h-10 border-[#d7dfeb] bg-white pl-9 pr-9 text-[#132949] placeholder:text-[#93a0b5]"
            />
              {menuQuery ? (
                <button
                  type="button"
                  aria-label="Clear settings search"
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[#7b879c] transition hover:bg-[#eef3f9] hover:text-[#132949]"
                  onClick={() => setMenuQuery("")}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="space-y-1 px-1 pb-5">
            {filteredSections.length ? (
              filteredSections.map((section) => (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => selectSettingsSection(section.key)}
                  aria-current={activeSection === section.key ? "page" : undefined}
                  className={cn(
                    "relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-lg px-5 py-3 text-left text-sm font-semibold tracking-[0.02em] transition",
                    activeSection === section.key
                      ? "bg-[#eaf2ff] text-[#145ac4] shadow-[inset_0_0_0_1px_#b9d2ff]"
                      : "text-[#56657f] hover:bg-[#f8fbff] hover:text-[#132949]",
                  )}
                >
                  {activeSection === section.key ? (
                    <span aria-hidden className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-[#246ee9]" />
                  ) : null}
                  <span>{section.label}</span>
                  {activeSection === section.key ? (
                    <span className="rounded-full bg-[#246ee9] px-2 py-0.5 text-[9px] font-bold tracking-[0.08em] text-white">
                      CURRENT
                    </span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="px-5 py-4 text-sm text-[#7b879c]">No matching section found.</div>
            )}
          </div>
        </aside>

        <div data-settings-content className="h-full min-h-0 overflow-x-hidden overflow-y-auto overscroll-contain px-3 pb-10 pt-4 2xl:px-5">
          {renderSectionContent()}
        </div>
      </div>
    </form>
  );

  if (isFullSettingsPage) {
    return (
      <div className="relative h-full min-h-0">
        {settingsShell}
        <ConfirmationDialog
          open={exitDialogOpen}
          onOpenChange={handleExitDialogOpenChange}
          title="Want to save your changes?"
          description="You've changed some settings. Save them before leaving, or leave without saving."
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={handleConfirmExit}
          onCancel={handleDiscardExit}
        />
      </div>
    );
  }

  return createPortal(
    <div className="relative min-h-[calc(100vh-9rem)]">
      <div className="fixed inset-0 z-[70] bg-[rgba(15,23,42,0.24)] backdrop-blur-[1px]" onClick={handleClose} />
      {settingsShell}
      <ConfirmationDialog
        open={exitDialogOpen}
        onOpenChange={handleExitDialogOpenChange}
        title="Want to save your changes?"
        description="You've changed some settings. Save them before leaving, or leave without saving."
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={handleConfirmExit}
        onCancel={handleDiscardExit}
      />
    </div>,
    document.body,
  );
}
