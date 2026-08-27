"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Download,
  Filter,
  GripVertical,
  Pencil,
  Plus,
  Send,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useAllOrganizations, useTenders } from "@bizovix/api-client";
import { usePaymentTerms } from "@bizovix/api-client";
import {
  DateInput,
  IconButton,
  PrimaryButton,
  SearchSelect,
  SecondaryButton,
  SelectInput,
  TextInput,
  type SearchSelectOption,
} from "@bizovix/ui";
import { formatBDT } from "@bizovix/utils";
import type { TenderRecord } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { COSTING_ASSIGNEES, COSTING_ORGANIZATIONS, type TenderCostingRow } from "../mock-data";
import { useAddCostingRow } from "../use-costing-rows";

const SOURCE_OPTIONS = ["Vendor Quotation", "Market Survey", "Previous Project Reference", "Supplier Catalog", "Other"];

interface CostingItem {
  id: string;
  description: string;
  secondaryDescription: string;
  unit: string;
  quantity: string;
  unitCost: string;
  marginPercent: string;
  remarks: string;
}

let itemIdCounter = 0;
function nextItemId(): string {
  itemIdCounter += 1;
  return `item-${itemIdCounter}`;
}

let newRowCounter = 0;
function nextNewRowSuffix(): string {
  newRowCounter += 1;
  return String(newRowCounter);
}

function initialItems(): CostingItem[] {
  return [
    {
      id: nextItemId(),
      description: "LED Display (P2.5)",
      secondaryDescription: "Novastar VX400",
      unit: "Nos",
      quantity: "10.00",
      unitCost: "118000.00",
      marginPercent: "5.60",
      remarks: "Main Display",
    },
    {
      id: nextItemId(),
      description: "PA System 500W",
      secondaryDescription: "TOA A-2120",
      unit: "Set",
      quantity: "5.00",
      unitCost: "78500.00",
      marginPercent: "7.07",
      remarks: "Conference Hall",
    },
    {
      id: nextItemId(),
      description: "Access Control",
      secondaryDescription: "ZKTeco F18",
      unit: "Nos",
      quantity: "8.00",
      unitCost: "63000.00",
      marginPercent: "7.35",
      remarks: "Entrance",
    },
    {
      id: nextItemId(),
      description: "Solar Panel 550W",
      secondaryDescription: "Canadian Solar",
      unit: "Nos",
      quantity: "20.00",
      unitCost: "16200.00",
      marginPercent: "7.14",
      remarks: "Rooftop",
    },
    {
      id: nextItemId(),
      description: "UPS 3KVA",
      secondaryDescription: "APC Smart-UPS",
      unit: "Nos",
      quantity: "3.00",
      unitCost: "42000.00",
      marginPercent: "7.43",
      remarks: "Power Backup",
    },
  ];
}

function blankItem(): CostingItem {
  return {
    id: nextItemId(),
    description: "",
    secondaryDescription: "",
    unit: "Nos",
    quantity: "",
    unitCost: "",
    marginPercent: "0",
    remarks: "",
  };
}

interface HeaderForm {
  organizationId: string;
  preparedBy: string;
  costingDate: string;
  source: string;
  currency: string;
  exchangeRate: string;
  costingVersion: string;
  remarks: string;
}

function initialHeaderForm(): HeaderForm {
  return {
    organizationId: "",
    preparedBy: "",
    costingDate: new Date().toISOString().slice(0, 10),
    source: "",
    currency: "BDT",
    exchangeRate: "1.00",
    costingVersion: "1",
    remarks: "",
  };
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

function initialAdditionalForm(): AdditionalForm {
  return {
    freightCost: "",
    installationCost: "",
    otherCost: "",
    contingencyPercent: "0",
    validityDays: "",
    paymentTermId: "",
    deliveryTime: "",
    warranty: "",
  };
}

export default function AddNewCostingPage() {
  useSetBreadcrumb([
    { label: "Tender Management", href: "/tender-management" },
    { label: "Tender Costing", href: "/tender-management/tender-costing" },
    { label: "Add New Costing" },
  ]);

  const router = useRouter();
  const addCostingRow = useAddCostingRow();

  const organizations = useAllOrganizations();
  const paymentTerms = usePaymentTerms();

  const [tenderIdQuery, setTenderIdQuery] = React.useState("");
  const [workNameQuery, setWorkNameQuery] = React.useState("");
  const deferredTenderIdQuery = React.useDeferredValue(tenderIdQuery);
  const deferredWorkNameQuery = React.useDeferredValue(workNameQuery);
  const [selectedTender, setSelectedTender] = React.useState<TenderRecord | null>(null);

  const tenderIdResults = useTenders({ search: deferredTenderIdQuery, limit: 8 });
  const workNameResults = useTenders({ search: deferredWorkNameQuery, limit: 8 });

  const [header, setHeader] = React.useState<HeaderForm>(initialHeaderForm);
  const [items, setItems] = React.useState<CostingItem[]>(initialItems);
  const [additional, setAdditional] = React.useState<AdditionalForm>(initialAdditionalForm);
  const [attachments, setAttachments] = React.useState<File[]>([]);
  const [dateRangeOpen, setDateRangeOpen] = React.useState(false);
  const [dateRange, setDateRange] = React.useState({ from: "2024-05-01", to: "2024-05-31" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [savedMessage, setSavedMessage] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const descriptionRefs = React.useRef<Record<string, HTMLInputElement | null>>({});

  function selectTender(tender: TenderRecord) {
    setSelectedTender(tender);
    setHeader((h) => ({ ...h, organizationId: tender.organizationMasterId }));
    setErrors((e) => ({ ...e, tenderId: "", workName: "" }));
  }

  function updateItem(id: string, patch: Partial<CostingItem>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addItem() {
    setItems((current) => [...current, blankItem()]);
  }

  function removeItem(id: string) {
    setItems((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current));
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList) return;
    setAttachments((current) => [...current, ...Array.from(fileList)]);
  }

  function removeAttachment(index: number) {
    setAttachments((current) => current.filter((_, i) => i !== index));
  }

  const computedItems = items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitCost = Number(item.unitCost) || 0;
    const marginPercent = Number(item.marginPercent) || 0;
    const totalCost = quantity * unitCost;
    const ourCost = totalCost * (1 - marginPercent / 100);
    return { ...item, quantity, unitCost, marginPercent, totalCost, ourCost };
  });

  const totalItems = items.length;
  const totalQuantity = computedItems.reduce((sum, i) => sum + i.quantity, 0);
  const itemsSubtotal = computedItems.reduce((sum, i) => sum + i.totalCost, 0);
  const itemsOurCostSubtotal = computedItems.reduce((sum, i) => sum + i.ourCost, 0);

  const freightCost = Number(additional.freightCost) || 0;
  const installationCost = Number(additional.installationCost) || 0;
  const otherCost = Number(additional.otherCost) || 0;
  const contingencyPercent = Number(additional.contingencyPercent) || 0;

  const preContingencySubtotal = itemsSubtotal + freightCost + installationCost + otherCost;
  const contingencyAmount = preContingencySubtotal * (contingencyPercent / 100);
  const totalEstimatedCost = preContingencySubtotal + contingencyAmount;
  const totalOurCost = itemsOurCostSubtotal + freightCost + installationCost + otherCost;
  const totalMarginPercent = totalEstimatedCost > 0 ? ((totalEstimatedCost - totalOurCost) / totalEstimatedCost) * 100 : 0;

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (!selectedTender) nextErrors.tenderId = "Select a tender";
    if (!header.organizationId) nextErrors.organizationId = "Organization is required";
    if (!header.preparedBy) nextErrors.preparedBy = "Prepared By is required";
    if (!header.costingDate) nextErrors.costingDate = "Costing Date is required";
    if (!header.currency) nextErrors.currency = "Currency is required";
    const hasValidItem = computedItems.some((item) => item.description.trim() && item.quantity > 0 && item.unitCost > 0);
    if (!hasValidItem) nextErrors.items = "Add at least one item with description, quantity and unit cost";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function buildRow(status: TenderCostingRow["status"]): TenderCostingRow | null {
    const org =
      organizations.data?.find((o) => o.id === header.organizationId)?.shortName ??
      selectedTender?.organizationMaster.shortName ??
      COSTING_ORGANIZATIONS[0]!;
    const assignee = COSTING_ASSIGNEES.find((a) => a.name === header.preparedBy) ?? COSTING_ASSIGNEES[0]!;
    const rowSuffix = nextNewRowSuffix();
    const tenderId = selectedTender?.egpTenderId ?? selectedTender?.id ?? `TDR-NEW-${rowSuffix}`;
    const workName = selectedTender?.workName ?? "Untitled Costing";
    return {
      id: `${tenderId}-${rowSuffix}`,
      tenderId,
      workName,
      organization: org,
      estimatedValue: totalEstimatedCost,
      estimatedCost: totalEstimatedCost,
      ourCost: totalOurCost,
      marginPercent: Number(totalMarginPercent.toFixed(2)),
      status,
      assignedTo: assignee,
      lastUpdated: new Date().toISOString().slice(0, 10),
    };
  }

  function handleSaveDraft() {
    if (!selectedTender) {
      setErrors((e) => ({ ...e, tenderId: "Select a tender to save even as a draft" }));
      return;
    }
    const row = buildRow("Pending");
    if (!row) return;
    addCostingRow(row);
    setSavedMessage("Saved as draft");
    router.push("/tender-management/tender-costing");
  }

  function handleSubmit() {
    if (!validate()) return;
    const row = buildRow("In Progress");
    if (!row) return;
    addCostingRow(row);
    setSavedMessage("Costing submitted");
    router.push("/tender-management/tender-costing");
  }

  function handleReset() {
    setSelectedTender(null);
    setTenderIdQuery("");
    setWorkNameQuery("");
    setHeader(initialHeaderForm());
    setItems(initialItems());
    setAdditional(initialAdditionalForm());
    setAttachments([]);
    setErrors({});
  }

  const tenderIdOptions: SearchSelectOption[] = (tenderIdResults.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.egpTenderId ?? t.workName,
    sublabel: t.workName,
  }));
  const workNameOptions: SearchSelectOption[] = (workNameResults.data?.items ?? []).map((t) => ({
    value: t.id,
    label: t.workName,
    sublabel: t.organizationMaster.shortName,
  }));

  const tenderIdValue: SearchSelectOption | null = selectedTender
    ? { value: selectedTender.id, label: selectedTender.egpTenderId ?? selectedTender.workName }
    : null;
  const workNameValue: SearchSelectOption | null = selectedTender
    ? { value: selectedTender.id, label: selectedTender.workName }
    : null;

  function handleSelectFromResults(option: SearchSelectOption, results: TenderRecord[]) {
    const tender = results.find((t) => t.id === option.value);
    if (tender) selectTender(tender);
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-page-title text-biz-text">Add New Costing</h1>
          <p className="mt-0.5 text-[12.5px] text-biz-muted">
            Tender Management &gt; Tender Costing &gt; Add New Costing
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <SecondaryButton onClick={() => setDateRangeOpen((v) => !v)} className="h-9">
              <Calendar className="h-4 w-4" />
              {dateRange.from.split("-").reverse().join("/")} - {dateRange.to.split("-").reverse().join("/")}
            </SecondaryButton>
            {dateRangeOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-40"
                  onClick={() => setDateRangeOpen(false)}
                  aria-label="Close"
                />
                <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[240px] rounded-lg border border-biz-border bg-biz-surface p-3 shadow-card-hover">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-medium text-biz-muted">
                      From
                      <input
                        type="date"
                        value={dateRange.from}
                        onChange={(e) => setDateRange((r) => ({ ...r, from: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                    <label className="text-[11px] font-medium text-biz-muted">
                      To
                      <input
                        type="date"
                        value={dateRange.to}
                        onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
                        className="mt-1 h-9 w-full rounded-sm border border-biz-border bg-biz-surface px-2 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                      />
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>
          <SecondaryButton className="h-9" title="Filter (not applicable on this page)">
            <Filter className="h-4 w-4" />
            Filter
          </SecondaryButton>
          <SecondaryButton className="h-9" title="Export (not applicable on this page)">
            <Download className="h-4 w-4" />
            Export
          </SecondaryButton>
        </div>
      </div>

      <div className="flex justify-end">
        <Link href="/tender-management/tender-costing">
          <SecondaryButton className="h-9">
            <ArrowLeft className="h-4 w-4" />
            Back to List
          </SecondaryButton>
        </Link>
      </div>

      {/* Costing Information */}
      <div className="rounded-lg border border-biz-border bg-biz-surface">
        <div className="flex items-center gap-2 border-b border-biz-border px-4 py-3">
          <span className="h-4 w-1 rounded-full bg-biz-blue" />
          <h3 className="text-[14px] font-semibold text-biz-text">Costing Information</h3>
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">
                Tender ID <span className="text-biz-danger">*</span>
              </label>
              <SearchSelect
                value={tenderIdValue}
                query={tenderIdQuery}
                onQueryChange={setTenderIdQuery}
                onSelect={(opt) => handleSelectFromResults(opt, tenderIdResults.data?.items ?? [])}
                options={tenderIdOptions}
                isLoading={tenderIdResults.isLoading}
                placeholder="Select Tender ID"
                minChars={0}
              />
              {errors.tenderId && <p className="text-[11px] text-biz-danger">{errors.tenderId}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">
                Work / Tender Name <span className="text-biz-danger">*</span>
              </label>
              <SearchSelect
                value={workNameValue}
                query={workNameQuery}
                onQueryChange={setWorkNameQuery}
                onSelect={(opt) => handleSelectFromResults(opt, workNameResults.data?.items ?? [])}
                options={workNameOptions}
                isLoading={workNameResults.isLoading}
                placeholder="Select Work / Tender Name"
                minChars={0}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">
                Organization <span className="text-biz-danger">*</span>
              </label>
              <SelectInput
                placeholder="Select Organization"
                value={header.organizationId}
                onChange={(e) => setHeader((h) => ({ ...h, organizationId: e.target.value }))}
                options={(organizations.data ?? []).map((org) => ({ label: org.shortName, value: org.id }))}
              />
              {errors.organizationId && <p className="text-[11px] text-biz-danger">{errors.organizationId}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">
                Prepared By <span className="text-biz-danger">*</span>
              </label>
              <SelectInput
                placeholder="Select User"
                value={header.preparedBy}
                onChange={(e) => setHeader((h) => ({ ...h, preparedBy: e.target.value }))}
                options={COSTING_ASSIGNEES.map((a) => ({ label: a.name, value: a.name }))}
              />
              {errors.preparedBy && <p className="text-[11px] text-biz-danger">{errors.preparedBy}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">
                Costing Date <span className="text-biz-danger">*</span>
              </label>
              <DateInput
                value={header.costingDate}
                onChange={(e) => setHeader((h) => ({ ...h, costingDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Source</label>
              <SelectInput
                placeholder="Select Source"
                value={header.source}
                onChange={(e) => setHeader((h) => ({ ...h, source: e.target.value }))}
                options={SOURCE_OPTIONS.map((s) => ({ label: s, value: s }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">
                Currency <span className="text-biz-danger">*</span>
              </label>
              <SelectInput
                value={header.currency}
                onChange={(e) => setHeader((h) => ({ ...h, currency: e.target.value }))}
                options={[{ label: "BDT (৳)", value: "BDT" }]}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Exchange Rate</label>
              <TextInput
                type="number"
                step="0.01"
                value={header.exchangeRate}
                onChange={(e) => setHeader((h) => ({ ...h, exchangeRate: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-medium text-biz-muted">Costing Version</label>
              <TextInput
                type="number"
                value={header.costingVersion}
                onChange={(e) => setHeader((h) => ({ ...h, costingVersion: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
              <label className="text-[12px] font-medium text-biz-muted">Remarks</label>
              <div className="relative">
                <textarea
                  value={header.remarks}
                  maxLength={250}
                  onChange={(e) => setHeader((h) => ({ ...h, remarks: e.target.value }))}
                  placeholder="Enter remarks (optional)"
                  rows={3}
                  className="h-[74px] w-full resize-none rounded-sm border border-biz-border bg-biz-surface px-3 py-2 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                />
                <span className="pointer-events-none absolute bottom-1.5 right-2 text-[10px] text-biz-muted">
                  {header.remarks.length}/250
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Middle: item table + summary column */}
      <div className="grid grid-cols-1 items-start gap-3 xl:grid-cols-[73fr_27fr]">
        <div className="flex flex-col gap-3">
          {/* Item Costing Details */}
          <div className="rounded-lg border border-biz-border bg-biz-surface">
            <div className="flex items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-biz-blue" />
                <h3 className="text-[14px] font-semibold text-biz-text">Item Costing Details</h3>
              </div>
              <SecondaryButton onClick={addItem} className="h-8 gap-1.5 border-biz-blue px-2.5 text-[12px] text-biz-blue">
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </SecondaryButton>
            </div>

            {errors.items && <p className="px-4 pt-2 text-[11px] text-biz-danger">{errors.items}</p>}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-[12.5px]">
                <thead>
                  <tr className="bg-biz-bg">
                    <th className="whitespace-nowrap px-2 py-2 font-medium text-biz-muted">SL</th>
                    <th className="whitespace-nowrap px-2 py-2 font-medium text-biz-muted">
                      Item / Description <span className="text-biz-danger">*</span>
                      <div className="text-[10px] font-normal normal-case text-biz-muted">
                        Search item or select from master
                      </div>
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-medium text-biz-muted">
                      Unit <span className="text-biz-danger">*</span>
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-medium text-biz-muted">
                      Quantity <span className="text-biz-danger">*</span>
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-medium text-biz-muted">
                      Unit Cost (BDT) <span className="text-biz-danger">*</span>
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-medium text-biz-muted">
                      Total Cost (BDT) <span className="text-biz-danger">*</span>
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 font-medium text-biz-muted">Margin (%)</th>
                    <th className="whitespace-nowrap px-2 py-2 font-medium text-biz-muted">Remarks</th>
                    <th className="whitespace-nowrap px-2 py-2 text-center font-medium text-biz-muted">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {computedItems.map((item, index) => (
                    <tr key={item.id} className="border-t border-biz-border align-top">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-biz-muted" />
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border border-biz-border text-[11px] font-semibold text-biz-text">
                            {index + 1}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          ref={(el) => {
                            descriptionRefs.current[item.id] = el;
                          }}
                          value={item.description}
                          onChange={(e) => updateItem(item.id, { description: e.target.value })}
                          placeholder="Item description"
                          className="h-8 w-[170px] rounded-sm border border-biz-border bg-biz-surface px-2 text-[12.5px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                        <input
                          value={item.secondaryDescription}
                          onChange={(e) => updateItem(item.id, { secondaryDescription: e.target.value })}
                          placeholder="Model / brand (optional)"
                          className="mt-1 h-7 w-[170px] rounded-sm border border-biz-border bg-biz-surface px-2 text-[11px] text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={item.unit}
                          onChange={(e) => updateItem(item.id, { unit: e.target.value })}
                          className="h-8 w-[64px] rounded-sm border border-biz-border bg-biz-surface px-2 text-[12.5px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                          className="h-8 w-[76px] rounded-sm border border-biz-border bg-biz-surface px-2 text-[12.5px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) => updateItem(item.id, { unitCost: e.target.value })}
                          className="h-8 w-[100px] rounded-sm border border-biz-border bg-biz-surface px-2 text-[12.5px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 font-medium text-biz-text">
                        {item.totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          value={item.marginPercent}
                          onChange={(e) => updateItem(item.id, { marginPercent: e.target.value })}
                          className="h-8 w-[64px] rounded-sm border border-biz-border bg-biz-surface px-2 text-[12.5px] font-medium text-biz-success focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          value={item.remarks}
                          onChange={(e) => updateItem(item.id, { remarks: e.target.value })}
                          className="h-8 w-[120px] rounded-sm border border-biz-border bg-biz-surface px-2 text-[12.5px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-center gap-1">
                          <IconButton
                            aria-label="Edit item"
                            title="Edit"
                            className="h-7 w-7 border-biz-blue/40 text-biz-blue"
                            onClick={() => descriptionRefs.current[item.id]?.focus()}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            aria-label="Delete item"
                            title="Delete"
                            className="h-7 w-7 border-biz-danger/40 text-biz-danger"
                            onClick={() => removeItem(item.id)}
                            disabled={items.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3">
              <button
                type="button"
                onClick={addItem}
                className="flex w-full items-center justify-center gap-1.5 rounded-sm border border-dashed border-biz-blue/40 py-2.5 text-[12.5px] font-medium text-biz-blue transition-colors hover:bg-biz-blue-soft"
              >
                <Plus className="h-4 w-4" />
                Add Item
              </button>
            </div>
          </div>

          {/* Additional Information */}
          <div className="rounded-lg border border-biz-border bg-biz-surface">
            <div className="flex items-center gap-2 border-b border-biz-border px-4 py-3">
              <span className="h-4 w-1 rounded-full bg-biz-blue" />
              <h3 className="text-[14px] font-semibold text-biz-text">Additional Information (Optional)</h3>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-biz-muted">Freight Cost (BDT)</label>
                  <TextInput
                    type="number"
                    placeholder="Enter amount"
                    value={additional.freightCost}
                    onChange={(e) => setAdditional((a) => ({ ...a, freightCost: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-biz-muted">Installation Cost (BDT)</label>
                  <TextInput
                    type="number"
                    placeholder="Enter amount"
                    value={additional.installationCost}
                    onChange={(e) => setAdditional((a) => ({ ...a, installationCost: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-biz-muted">Other Cost (BDT)</label>
                  <TextInput
                    type="number"
                    placeholder="Enter amount"
                    value={additional.otherCost}
                    onChange={(e) => setAdditional((a) => ({ ...a, otherCost: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-biz-muted">Contingency (%)</label>
                  <TextInput
                    type="number"
                    step="0.1"
                    value={additional.contingencyPercent}
                    onChange={(e) => setAdditional((a) => ({ ...a, contingencyPercent: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-biz-muted">Validity Days</label>
                  <TextInput
                    type="number"
                    placeholder="Enter days"
                    value={additional.validityDays}
                    onChange={(e) => setAdditional((a) => ({ ...a, validityDays: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-biz-muted">Payment Terms</label>
                  <SelectInput
                    placeholder="Select Payment Terms"
                    value={additional.paymentTermId}
                    onChange={(e) => setAdditional((a) => ({ ...a, paymentTermId: e.target.value }))}
                    options={(paymentTerms.data ?? [])
                      .filter((term) => term.isActive)
                      .map((term) => ({ label: term.name, value: term.id }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-biz-muted">Delivery Time</label>
                  <TextInput
                    placeholder="Enter delivery time"
                    value={additional.deliveryTime}
                    onChange={(e) => setAdditional((a) => ({ ...a, deliveryTime: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[12px] font-medium text-biz-muted">Warranty / Guarantee</label>
                  <TextInput
                    placeholder="Enter warranty details"
                    value={additional.warranty}
                    onChange={(e) => setAdditional((a) => ({ ...a, warranty: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right summary column */}
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border border-biz-border bg-biz-surface">
            <div className="flex items-center gap-2 border-b border-biz-border px-3 py-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-biz-blue-soft text-biz-blue">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
              <h3 className="text-[13px] font-semibold text-biz-text">Costing Summary</h3>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-biz-muted">Total Items</span>
                <span className="font-semibold text-biz-text">{totalItems}</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-biz-muted">Total Quantity</span>
                <span className="font-semibold text-biz-text">{totalQuantity.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-biz-muted">Total Estimated Cost (BDT)</span>
                <span className="font-semibold text-biz-text">
                  {totalEstimatedCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex items-center justify-between text-[12.5px]">
                <span className="text-biz-muted">Total Margin (%)</span>
                <span className="font-semibold text-biz-success">{totalMarginPercent.toFixed(2)}%</span>
              </div>
            </div>
            <div className="mx-3 mb-3 rounded-md bg-biz-blue-soft px-3 py-2.5 text-center">
              <p className="text-[11px] text-biz-muted">Total Our Cost (BDT)</p>
              <p className="text-[18px] font-bold text-biz-blue">
                {totalOurCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-biz-border bg-biz-surface">
            <div className="border-b border-biz-border px-3 py-2.5">
              <h3 className="text-[13px] font-semibold text-biz-text">Attachment (Optional)</h3>
            </div>
            <div className="p-3">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFiles(e.dataTransfer.files);
                }}
                className="flex flex-col items-center gap-1.5 rounded-md border border-dashed border-biz-border bg-biz-bg/60 px-3 py-5 text-center"
              >
                <UploadCloud className="h-6 w-6 text-biz-muted" />
                <p className="text-[12px] text-biz-text">Drag &amp; drop files here</p>
                <p className="text-[11px] text-biz-muted">or</p>
                <SecondaryButton type="button" onClick={() => fileInputRef.current?.click()} className="h-8 px-3 text-[12px]">
                  Browse Files
                </SecondaryButton>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
              </div>
              <p className="mt-2 text-[10.5px] text-biz-muted">Supported formats: PDF, Excel, JPG, PNG</p>
              <p className="text-[10.5px] text-biz-muted">Max file size: 10MB</p>
              {attachments.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1">
                  {attachments.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-sm bg-biz-bg px-2 py-1 text-[11px] text-biz-text"
                    >
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => removeAttachment(index)}
                        aria-label={`Remove ${file.name}`}
                        className="text-biz-muted hover:text-biz-danger"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-biz-border bg-biz-surface">
            <div className="border-b border-biz-border px-3 py-2.5">
              <h3 className="text-[13px] font-semibold text-biz-text">Activity Log</h3>
            </div>
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-start gap-2 text-[11.5px] text-biz-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-biz-blue" />
                Costing will be saved as draft until submitted.
              </div>
              <div className="flex items-start gap-2 text-[11.5px] text-biz-muted">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-biz-blue" />
                You can edit costing before final submission.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-biz-border bg-biz-surface px-4 py-3">
        <div className="flex items-center gap-2">
          <SecondaryButton onClick={handleSaveDraft}>Save as Draft</SecondaryButton>
          <SecondaryButton onClick={handleReset}>Reset</SecondaryButton>
        </div>
        <div className="flex items-center gap-2">
          {savedMessage && <span className="text-[12px] text-biz-success">{savedMessage}</span>}
          <PrimaryButton onClick={handleSubmit}>
            <Send className="h-4 w-4" />
            Save &amp; Submit
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
