"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  LockKeyhole,
  Plus,
  Save,
  Send,
  Trash2,
  WalletCards,
} from "lucide-react";
import {
  ApiError,
  usePaymentTerms,
  useSaveTenderCosting,
  useSetTenderCostingBudget,
  useTenderCosting,
  useTenderOptions,
} from "@bizovix/api-client";
import {
  DateInput,
  IconButton,
  PrimaryButton,
  SecondaryButton,
  SelectInput,
  StatusBadge,
  TextInput,
} from "@bizovix/ui";
import type { SaveTenderCostingInput, TenderCostingStatus } from "@bizovix/types";
import { useSetBreadcrumb } from "@/components/providers/BreadcrumbContext";
import { Modal } from "@/components/layout/Modal";
import { SuccessPopup } from "@/components/layout/SuccessPopup";

const SOURCE_OPTIONS = [
  "Vendor Quotation",
  "Market Survey",
  "Previous Project Reference",
  "Supplier Catalog",
  "Other",
];

interface CostingItemForm {
  id: string;
  description: string;
  secondaryDescription: string;
  unit: string;
  quantity: string;
  unitCost: string;
  marginPercent: string;
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

let itemCounter = 0;
function blankItem(): CostingItemForm {
  itemCounter += 1;
  return {
    id: `costing-item-${itemCounter}`,
    description: "",
    secondaryDescription: "",
    unit: "Nos",
    quantity: "",
    unitCost: "",
    marginPercent: "0",
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
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saveError, setSaveError] = React.useState("");
  const [budgetInput, setBudgetInput] = React.useState("");
  const [budgetError, setBudgetError] = React.useState("");
  const [budgetNotice, setBudgetNotice] = React.useState("");
  const [budgetLockMessageOpen, setBudgetLockMessageOpen] = React.useState(false);
  const [success, setSuccess] = React.useState<{ title: string; message: string } | null>(null);
  const hydratedId = React.useRef<string | undefined>(undefined);

  React.useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("costingId") ?? undefined;
    const timer = window.setTimeout(() => setCostingId(id), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const costing = useTenderCosting(costingId);
  const saveCosting = useSaveTenderCosting();
  const setCostingBudget = useSetTenderCostingBudget();
  const options = useTenderOptions();
  const paymentTerms = usePaymentTerms();

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
            description: item.description,
            secondaryDescription: item.secondaryDescription ?? "",
            unit: item.unit,
            quantity: item.quantity,
            unitCost: item.unitCost,
            marginPercent: item.marginPercent,
            remarks: item.remarks ?? "",
          }))
        : [blankItem()],
    );
  }, [costing.data]);

  function updateItem(id: string, patch: Partial<CostingItemForm>) {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function validate(): boolean {
    const nextErrors: Record<string, string> = {};
    if (!header.costingDate) nextErrors.costingDate = "Costing date is required";
    if (!header.preparedByUserId) nextErrors.preparedBy = "Prepared by is required";
    const validItems = items.filter(
      (item) => item.description.trim() && Number(item.quantity) > 0 && Number(item.unitCost) >= 0,
    );
    if (validItems.length === 0) nextErrors.items = "Add at least one complete item";
    if (validItems.length !== items.length)
      nextErrors.items = "Complete or remove every incomplete item";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function save(status: TenderCostingStatus) {
    const record = costing.data;
    if (!record || !validate()) return;
    setSaveError("");
    const selectedUser = options.data?.users.find((user) => user.id === header.preparedByUserId);
    const payload: SaveTenderCostingInput = {
      version: record.version,
      status,
      costingDate: header.costingDate,
      preparedByUserId: header.preparedByUserId,
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
      items: items.map((item, index) => ({
        description: item.description.trim(),
        secondaryDescription: item.secondaryDescription.trim() || undefined,
        unit: item.unit.trim(),
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
        marginPercent: Number(item.marginPercent) || 0,
        remarks: item.remarks.trim() || undefined,
        sortOrder: index,
      })),
    };

    try {
      const saved = await saveCosting.mutateAsync({ id: record.id, payload });
      hydratedId.current = undefined;
      setSuccess({
        title: status === "COMPLETED" ? "Costing Completed" : "Costing Saved",
        message:
          status === "COMPLETED"
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
      setBudgetNotice("Tender Costing Budget saved. You can now prepare the costing details.");
    } catch (error) {
      setBudgetError(error instanceof ApiError ? error.message : "Could not save costing budget.");
    }
  }

  const computed = items.map((item) => {
    const quantity = Number(item.quantity) || 0;
    const unitCost = Number(item.unitCost) || 0;
    const margin = Number(item.marginPercent) || 0;
    const total = quantity * unitCost;
    return { total, ourCost: total * (1 - margin / 100) };
  });
  const itemTotal = computed.reduce((sum, item) => sum + item.total, 0);
  const itemOurCost = computed.reduce((sum, item) => sum + item.ourCost, 0);
  const directAdditional =
    Number(additional.freightCost) +
    Number(additional.installationCost) +
    Number(additional.otherCost);
  const contingencyAmount =
    (itemTotal + directAdditional) * ((Number(additional.contingencyPercent) || 0) / 100);
  const estimatedTotal = itemTotal + directAdditional + contingencyAmount;
  const ourCostTotal = itemOurCost + directAdditional;
  const marginPercent =
    estimatedTotal > 0 ? ((estimatedTotal - ourCostTotal) / estimatedTotal) * 100 : 0;

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
  const isReadOnly = record.status === "COMPLETED" || record.status === "CANCELLED";
  const costingBudget = Number(record.costingBudget) || 0;
  const hasCostingBudget = costingBudget > 0;
  const remainingBudget = costingBudget - estimatedTotal;
  const expectedProfit = estimatedTotal - ourCostTotal;

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Summary label="Tender ID" value={record.tender.egpTenderId ?? record.tender.id} />
        <Summary label="Product / Work Name" value={record.tender.workName} />
        <Summary
          label="Organization"
          value={record.tender.organizationMaster?.shortName ?? "Not set"}
        />
        <Summary label="Work Category" value={record.tender.category ?? "Not set"} />
        <div className="rounded-lg border border-biz-border bg-biz-surface p-3">
          <p className="text-[11px] text-biz-muted">Status</p>
          <div className="mt-2">
            <StatusBadge
              label={
                record.status === "READY" ? "Ready for Costing" : record.status.replace("_", " ")
              }
              tone={
                record.status === "COMPLETED"
                  ? "success"
                  : record.status === "IN_PROGRESS"
                    ? "warning"
                    : "info"
              }
            />
          </div>
        </div>
      </div>

      {isReadOnly && (
        <div className="rounded-md border border-biz-success/30 bg-biz-success/5 px-4 py-3 text-[12.5px] text-biz-text">
          This costing is {record.status.toLowerCase()} and is now read-only.
        </div>
      )}

      <div className="rounded-lg border border-biz-blue/25 bg-biz-surface p-3 shadow-card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="flex items-center gap-2">
              <WalletCards className="h-4 w-4 text-biz-blue" />
              <h2 className="text-[14px] font-semibold text-biz-text">Costing Setup</h2>
            </div>
            <p className="mt-1 text-[11px] text-biz-muted">
              Enter and save the Tender Costing Budget before preparing item-wise costing.
            </p>
          </div>
          <div className="flex min-w-[280px] items-end gap-2">
            <Field label="Tender Costing Budget (BDT)" error={budgetError}>
              <TextInput
                type="number"
                min="0.01"
                step="0.01"
                disabled={isReadOnly || setCostingBudget.isPending}
                value={budgetInput}
                placeholder="Enter budget amount"
                onChange={(event) => {
                  setBudgetInput(event.target.value);
                  setBudgetError("");
                  setBudgetNotice("");
                }}
                onKeyDown={(event) => event.key === "Enter" && saveBudget()}
              />
            </Field>
            <PrimaryButton
              className="h-11 whitespace-nowrap"
              disabled={isReadOnly || setCostingBudget.isPending}
              onClick={saveBudget}
            >
              <Save className="h-4 w-4" />
              {setCostingBudget.isPending
                ? "Saving..."
                : hasCostingBudget
                  ? "Update Budget"
                  : "Save Budget"}
            </PrimaryButton>
          </div>
        </div>
        {budgetNotice && (
          <p className="mt-2 rounded-md bg-biz-success/10 px-3 py-2 text-[11.5px] text-biz-success">
            {budgetNotice}
          </p>
        )}
      </div>

      {hasCostingBudget && (
        <div className="grid grid-cols-5 gap-1.5 lg:gap-2">
          <CostingKpi label="Costing Budget" value={formatMoney(costingBudget)} tone="blue" />
          <CostingKpi label="Estimated Cost" value={formatMoney(estimatedTotal)} />
          <CostingKpi
            label="Remaining Budget"
            value={formatMoney(remainingBudget)}
            tone={remainingBudget < 0 ? "danger" : "success"}
          />
          <CostingKpi
            label="Expected Profit"
            value={formatMoney(expectedProfit)}
            tone={expectedProfit < 0 ? "danger" : "success"}
          />
          <CostingKpi label="Profit Margin" value={`${marginPercent.toFixed(2)}%`} tone="blue" />
        </div>
      )}

      {hasCostingBudget && remainingBudget < 0 && (
        <div className="flex items-center gap-2 rounded-md border border-biz-warning/30 bg-biz-warning/10 px-3 py-2 text-[11.5px] text-biz-text">
          <AlertTriangle className="h-4 w-4 shrink-0 text-biz-warning" />
          Estimated cost exceeds the Tender Costing Budget by {formatMoney(Math.abs(remainingBudget))}.
        </div>
      )}

      <div className="relative">
      <fieldset
        disabled={isReadOnly || !hasCostingBudget}
        className={`m-0 flex min-w-0 flex-col gap-3 border-0 p-0 ${!hasCostingBudget && !isReadOnly ? "opacity-55" : ""}`}
      >
        <div className="rounded-lg border border-biz-border bg-biz-surface">
          <div className="border-b border-biz-border px-4 py-3">
            <h2 className="text-[14px] font-semibold text-biz-text">Costing Information</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Costing Date" error={errors.costingDate}>
              <DateInput
                value={header.costingDate}
                onChange={(event) =>
                  setHeader((current) => ({ ...current, costingDate: event.target.value }))
                }
              />
            </Field>
            <Field label="Prepared By" error={errors.preparedBy}>
              <SelectInput
                placeholder="Select user"
                value={header.preparedByUserId}
                onChange={(event) =>
                  setHeader((current) => ({ ...current, preparedByUserId: event.target.value }))
                }
                options={(options.data?.users ?? []).map((user) => ({
                  value: user.id,
                  label: user.name,
                }))}
              />
            </Field>
            <Field label="Cost Source">
              <SelectInput
                placeholder="Select source"
                value={header.source}
                onChange={(event) =>
                  setHeader((current) => ({ ...current, source: event.target.value }))
                }
                options={SOURCE_OPTIONS.map((source) => ({ value: source, label: source }))}
              />
            </Field>
            <Field label="Costing Version">
              <TextInput
                type="number"
                min="1"
                value={header.costingVersion}
                onChange={(event) =>
                  setHeader((current) => ({ ...current, costingVersion: event.target.value }))
                }
              />
            </Field>
          </div>
        </div>

        <div className="rounded-lg border border-biz-border bg-biz-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-biz-border px-4 py-3">
            <div>
              <h2 className="text-[14px] font-semibold text-biz-text">Costing Items</h2>
              <p className="text-[11px] text-biz-muted">
                Add actual items - no sample rows are inserted.
              </p>
            </div>
            <PrimaryButton onClick={() => setItems((current) => [...current, blankItem()])}>
              <Plus className="h-4 w-4" />
              Add Item
            </PrimaryButton>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] text-left text-[12px]">
              <thead className="bg-biz-bg text-biz-muted">
                <tr>
                  <th className="px-3 py-2">SL</th>
                  <th className="px-3 py-2">Item / Description *</th>
                  <th className="px-3 py-2">Specification</th>
                  <th className="px-3 py-2">Unit *</th>
                  <th className="px-3 py-2">Quantity *</th>
                  <th className="px-3 py-2">Unit Cost *</th>
                  <th className="px-3 py-2">Margin %</th>
                  <th className="px-3 py-2 text-right">Total Cost</th>
                  <th className="px-3 py-2">Remarks</th>
                  <th className="px-3 py-2 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="border-t border-biz-border">
                    <td className="px-3 py-2">{index + 1}</td>
                    <td className="px-3 py-2">
                      <TextInput
                        value={item.description}
                        placeholder="Enter item"
                        onChange={(event) =>
                          updateItem(item.id, { description: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        value={item.secondaryDescription}
                        placeholder="Brand / model"
                        onChange={(event) =>
                          updateItem(item.id, { secondaryDescription: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        className="w-20"
                        value={item.unit}
                        onChange={(event) => updateItem(item.id, { unit: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        className="w-24"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.quantity}
                        onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        className="w-32"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.unitCost}
                        onChange={(event) => updateItem(item.id, { unitCost: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        className="w-20"
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={item.marginPercent}
                        onChange={(event) =>
                          updateItem(item.id, { marginPercent: event.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {computed[index]!.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <TextInput
                        value={item.remarks}
                        placeholder="Optional"
                        onChange={(event) => updateItem(item.id, { remarks: event.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <IconButton
                        aria-label="Remove item"
                        disabled={items.length === 1}
                        onClick={() =>
                          setItems((current) => current.filter((row) => row.id !== item.id))
                        }
                      >
                        <Trash2 className="h-4 w-4 text-biz-danger" />
                      </IconButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {errors.items && (
            <p className="border-t border-biz-border px-4 py-2 text-[12px] text-biz-danger">
              {errors.items}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_320px]">
          <div className="rounded-lg border border-biz-border bg-biz-surface p-4">
            <h2 className="mb-4 text-[14px] font-semibold text-biz-text">
              Additional Costs & Terms
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Freight Cost">
                <TextInput
                  type="number"
                  min="0"
                  value={additional.freightCost}
                  onChange={(event) =>
                    setAdditional((current) => ({ ...current, freightCost: event.target.value }))
                  }
                />
              </Field>
              <Field label="Installation Cost">
                <TextInput
                  type="number"
                  min="0"
                  value={additional.installationCost}
                  onChange={(event) =>
                    setAdditional((current) => ({
                      ...current,
                      installationCost: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Other Cost">
                <TextInput
                  type="number"
                  min="0"
                  value={additional.otherCost}
                  onChange={(event) =>
                    setAdditional((current) => ({ ...current, otherCost: event.target.value }))
                  }
                />
              </Field>
              <Field label="Contingency %">
                <TextInput
                  type="number"
                  min="0"
                  max="100"
                  value={additional.contingencyPercent}
                  onChange={(event) =>
                    setAdditional((current) => ({
                      ...current,
                      contingencyPercent: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Validity Days">
                <TextInput
                  type="number"
                  min="1"
                  value={additional.validityDays}
                  onChange={(event) =>
                    setAdditional((current) => ({ ...current, validityDays: event.target.value }))
                  }
                />
              </Field>
              <Field label="Payment Terms">
                <SelectInput
                  placeholder="Select terms"
                  value={additional.paymentTermId}
                  onChange={(event) =>
                    setAdditional((current) => ({ ...current, paymentTermId: event.target.value }))
                  }
                  options={(paymentTerms.data ?? [])
                    .filter((term) => term.isActive)
                    .map((term) => ({ value: term.id, label: term.name }))}
                />
              </Field>
              <Field label="Delivery Time">
                <TextInput
                  value={additional.deliveryTime}
                  onChange={(event) =>
                    setAdditional((current) => ({ ...current, deliveryTime: event.target.value }))
                  }
                />
              </Field>
              <Field label="Warranty / Guarantee">
                <TextInput
                  value={additional.warranty}
                  onChange={(event) =>
                    setAdditional((current) => ({ ...current, warranty: event.target.value }))
                  }
                />
              </Field>
              <Field label="Remarks">
                <TextInput
                  value={header.remarks}
                  onChange={(event) =>
                    setHeader((current) => ({ ...current, remarks: event.target.value }))
                  }
                />
              </Field>
            </div>
          </div>

          <div className="rounded-lg border border-biz-border bg-biz-surface p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-biz-success" />
              <h2 className="text-[14px] font-semibold text-biz-text">Costing Summary</h2>
            </div>
            <dl className="mt-4 flex flex-col gap-3 text-[12.5px]">
              <SummaryLine label="Items" value={String(items.length)} />
              <SummaryLine
                label="Item Total"
                value={itemTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              />
              <SummaryLine
                label="Additional Costs"
                value={directAdditional.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              />
              <SummaryLine
                label="Contingency"
                value={contingencyAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              />
              <SummaryLine
                label="Estimated Cost"
                value={estimatedTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                strong
              />
              <SummaryLine
                label="Our Cost"
                value={ourCostTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                strong
              />
              <SummaryLine label="Margin" value={`${marginPercent.toFixed(2)}%`} strong />
            </dl>
          </div>
        </div>
      </fieldset>
        {!hasCostingBudget && !isReadOnly && (
          <button
            type="button"
            aria-label="Tender Costing Budget required"
            className="absolute inset-0 z-20 flex cursor-not-allowed items-start justify-center rounded-lg bg-biz-bg/20 pt-5 text-left"
            onClick={() => setBudgetLockMessageOpen(true)}
          >
            <span className="sticky top-4 flex items-center gap-2 rounded-md border border-biz-warning/30 bg-biz-surface px-4 py-2.5 text-[12px] font-medium text-biz-text shadow-card">
              <LockKeyhole className="h-4 w-4 text-biz-warning" />
              Save the Tender Costing Budget to unlock costing details.
            </span>
          </button>
        )}
      </div>

      {saveError && (
        <div className="rounded-md border border-biz-danger/20 bg-biz-danger/5 px-4 py-3 text-[12.5px] text-biz-danger">
          {saveError}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2 rounded-lg border border-biz-border bg-biz-surface px-4 py-3">
        <SecondaryButton
          disabled={isReadOnly || !hasCostingBudget || saveCosting.isPending}
          onClick={() => save("IN_PROGRESS")}
        >
          <Save className="h-4 w-4" />
          {saveCosting.isPending ? "Saving..." : "Save Progress"}
        </SecondaryButton>
        <PrimaryButton
          disabled={isReadOnly || !hasCostingBudget || saveCosting.isPending}
          onClick={() => save("COMPLETED")}
        >
          <Send className="h-4 w-4" />
          {saveCosting.isPending ? "Saving..." : "Save & Complete"}
        </PrimaryButton>
      </div>

      <Modal
        open={budgetLockMessageOpen}
        onClose={() => setBudgetLockMessageOpen(false)}
        title="Tender Costing Budget Required"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-md border border-biz-warning/30 bg-biz-warning/10 p-3 text-[13px] text-biz-text">
            <LockKeyhole className="mt-0.5 h-5 w-5 shrink-0 text-biz-warning" />
            <div>
              <p className="font-semibold">Enter and save the Tender Costing Budget first.</p>
              <p className="mt-1 text-biz-muted">
                Item costing, additional costs, terms and completion actions will unlock after the
                budget is saved.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <PrimaryButton onClick={() => setBudgetLockMessageOpen(false)}>Enter Budget</PrimaryButton>
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-biz-border bg-biz-surface p-3">
      <p className="text-[11px] text-biz-muted">{label}</p>
      <p className="mt-1 truncate text-[13px] font-semibold text-biz-text" title={value}>
        {value}
      </p>
    </div>
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

function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${strong ? "border-t border-biz-border pt-3 font-semibold text-biz-text" : "text-biz-muted"}`}
    >
      <dt>{label}</dt>
      <dd className={strong ? "text-biz-blue" : "font-medium text-biz-text"}>{value}</dd>
    </div>
  );
}

function CostingKpi({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "blue" | "success" | "danger";
}) {
  const valueTone =
    tone === "blue"
      ? "text-biz-blue"
      : tone === "success"
        ? "text-biz-success"
        : tone === "danger"
          ? "text-biz-danger"
          : "text-biz-text";
  return (
    <div className="min-w-0 rounded-md border border-biz-border bg-biz-surface p-2 shadow-card">
      <p className="truncate text-[9px] text-biz-muted" title={label}>
        {label}
      </p>
      <p className={`mt-0.5 truncate text-[13px] font-bold ${valueTone}`} title={value}>
        {value}
      </p>
    </div>
  );
}
