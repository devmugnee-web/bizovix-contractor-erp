"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import {
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  MoreVertical,
  Plus,
  RotateCcw,
  Settings2,
  ShoppingCart,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AppDateInput } from "@/components/shared/app-date-input";
import { purchaseWorkspaceSections, type PurchaseWorkspaceConfig, type PurchaseWorkspaceSection } from "@/config/purchase";
import { cn } from "@/lib/utils";
import { CollapsibleSearch } from "@/components/shared/collapsible-search";

const accentStyles = {
  sky: {
    soft: "bg-[#eef7ff]",
    softBorder: "border-[#d2e8fb]",
    text: "text-[#236db6]",
    icon: "bg-[#f2f8ff] text-[#236db6]",
  },
  emerald: {
    soft: "bg-[#edfdf4]",
    softBorder: "border-[#cfead8]",
    text: "text-[#177a48]",
    icon: "bg-[#eefcf4] text-[#177a48]",
  },
  amber: {
    soft: "bg-[#fff8e7]",
    softBorder: "border-[#f0dfb4]",
    text: "text-[#b66a10]",
    icon: "bg-[#fff8ef] text-[#b66a10]",
  },
  indigo: {
    soft: "bg-[#eef2ff]",
    softBorder: "border-[#d8defe]",
    text: "text-[#4d61d6]",
    icon: "bg-[#f3f5ff] text-[#4d61d6]",
  },
  red: {
    soft: "bg-[#fff1f1]",
    softBorder: "border-[#f4d4d4]",
    text: "text-[#c43f3f]",
    icon: "bg-[#fff5f5] text-[#c43f3f]",
  },
  teal: {
    soft: "bg-[#ecfffc]",
    softBorder: "border-[#cceae4]",
    text: "text-[#167e6b]",
    icon: "bg-[#effdfa] text-[#167e6b]",
  },
} as const;

export type FilterDraft = {
  preset:
    | "last-posting-month"
    | "today"
    | "yesterday"
    | "this-week"
    | "this-month"
    | "last-month"
    | "this-quarter"
    | "current-financial-year"
    | "previous-financial-year"
    | "custom";
  from: string;
  to: string;
  supplier: string;
  status: string;
  paymentMethod: string;
  voucherType: string;
  createdBy: string;
  branch: string;
  costCenter: string;
  savedFilter: "all" | "due" | "paid" | "draft" | "current-financial-year";
  firm: "active" | "all";
  searchQuery: string;
};

export type SummaryMetric = {
  id: string;
  label: string;
  value: string;
  note?: string;
  icon: LucideIcon;
  tone: "sky" | "emerald" | "amber" | "indigo" | "red" | "teal";
};

function IconHintButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  shortcut,
  className,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  shortcut?: string;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn("h-11 w-11 rounded-2xl", className)}
        >
          <Icon className="h-[18px] w-[18px]" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{shortcut ? `${label} (${shortcut})` : label}</TooltipContent>
    </Tooltip>
  );
}

export function PurchaseWorkspaceHeader({
  config,
  activeSection,
  workflowMenuOpen,
  setWorkflowMenuOpen,
  searchQuery,
  onSearchQueryChange,
  onNavigateSection,
  onPrimaryAction,
  onAddSale,
  onOpenQuickCreate,
  onOpenSettings,
  onOpenMore,
  footerContent,
}: {
  config: PurchaseWorkspaceConfig;
  activeSection: PurchaseWorkspaceSection;
  workflowMenuOpen: boolean;
  setWorkflowMenuOpen: Dispatch<SetStateAction<boolean>>;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  onNavigateSection: (section: PurchaseWorkspaceSection) => void;
  onPrimaryAction: () => void;
  onAddSale: () => void;
  onOpenQuickCreate: () => void;
  onOpenSettings: () => void;
  onOpenMore: () => void;
  footerContent?: ReactNode;
}) {
  const theme = accentStyles[config.accent];

  return (
    <TooltipProvider delayDuration={180}>
      <section className="rounded-[28px] border border-[#d7e1ee] bg-white px-5 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.06)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start gap-3">
              <div className={cn("flex items-center justify-center border", config.slug === "revenue" ? "h-10 w-10 rounded-xl" : "h-14 w-14 rounded-2xl", theme.soft, theme.softBorder)}>
                <config.icon className={cn(config.slug === "revenue" ? "h-5 w-5" : "h-6 w-6", theme.text)} />
              </div>
              <div className="min-w-0 flex-1">
                {config.slug === "revenue" ? null : (
                  <div className={cn("mb-1 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em]", theme.soft, theme.text)}>
                    Purchase Workspace
                  </div>
                )}
                <div className="relative inline-flex max-w-full items-center">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex max-w-full items-center gap-2 rounded-xl px-1 py-1 text-left font-semibold tracking-[-0.03em] text-[#12284a] transition hover:bg-[#f7faff]",
                      config.slug === "revenue" ? "text-[18px]" : "text-[2rem]",
                    )}
                    aria-haspopup="menu"
                    aria-expanded={workflowMenuOpen}
                    onClick={() => setWorkflowMenuOpen((current) => !current)}
                  >
                    <span className="truncate">{config.label}</span>
                    <ChevronDown className={cn("h-5 w-5 shrink-0 text-[#61708a] transition-transform", workflowMenuOpen ? "rotate-180" : "")} />
                  </button>
                  {workflowMenuOpen ? (
                    <div className="absolute left-0 top-full z-30 mt-2 w-[280px] rounded-2xl border border-[#d5dfeb] bg-white p-2 shadow-[0_18px_34px_rgba(15,23,42,0.12)]">
                      {purchaseWorkspaceSections.map((section) => (
                        <button
                          key={section.slug}
                          type="button"
                          className={cn(
                            "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition",
                            section.slug === activeSection ? "bg-[#fff7ef] text-primary" : "text-[#24364f] hover:bg-[#fffaf4] hover:text-primary",
                          )}
                          onClick={() => {
                            setWorkflowMenuOpen(false);
                            onNavigateSection(section.slug);
                          }}
                        >
                          <section.icon className="h-[17px] w-[17px] shrink-0" />
                          <span className="flex-1">{section.label}</span>
                          {section.slug === activeSection ? <span className="text-xs font-semibold">Current</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {config.slug === "revenue" ? null : <p className="mt-2 max-w-3xl text-sm text-[#52637f]">{config.description}</p>}
              </div>
            </div>
          </div>

          <div className="flex w-full flex-col gap-3 xl:max-w-[760px]">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
              <CollapsibleSearch
                value={searchQuery}
                onChange={onSearchQueryChange}
                label="Search transactions"
                placeholder="Search by voucher no., supplier, amount, reference, narration, or payment method"
                expandedWidth="min-w-0 flex-1 lg:max-w-[420px]"
              />
              <div className="flex flex-wrap items-center gap-2">
                {config.slug === "revenue" ? null : (
                  <Button type="button" variant="outline" className="h-11 rounded-2xl" onClick={onAddSale}>
                    <ShoppingCart className="h-[17px] w-[17px]" />
                    Add Sale
                  </Button>
                )}
                <Button type="button" className="h-11 rounded-2xl bg-primary px-4 text-white hover:bg-[#cf670f]" onClick={onPrimaryAction}>
                  <Plus className="h-[18px] w-[18px]" />
                  {config.createLabel}
                </Button>
                {config.slug === "revenue" ? null : <IconHintButton icon={Sparkles} label="Quick Create" shortcut="Alt + C" onClick={onOpenQuickCreate} />}
                {config.slug === "revenue" ? null : <IconHintButton icon={Settings2} label="Page Settings" onClick={onOpenSettings} />}
                <IconHintButton icon={MoreVertical} label="More Actions" onClick={onOpenMore} />
              </div>
            </div>
          </div>
        </div>
        {footerContent ? <div className="mt-4 border-t border-[#e3ebf4] pt-3">{footerContent}</div> : null}
      </section>
    </TooltipProvider>
  );
}

export function PurchaseFilterBar({
  draftFilters,
  setDraftFilters,
  partyLabel = "Supplier",
  supplierOptions,
  statusOptions,
  paymentMethodOptions,
  voucherTypeOptions,
  createdByOptions,
  costCenterOptions,
  presetOptions,
  savedFilterOptions,
  onApply,
  onReset,
}: {
  draftFilters: FilterDraft;
  setDraftFilters: Dispatch<SetStateAction<FilterDraft>>;
  partyLabel?: string;
  supplierOptions: string[];
  statusOptions: string[];
  paymentMethodOptions: string[];
  voucherTypeOptions: string[];
  createdByOptions: string[];
  costCenterOptions: string[];
  presetOptions: Array<{ value: string; label: string }>;
  savedFilterOptions: Array<{ value: string; label: string }>;
  onApply: () => void;
  onReset: () => void;
}) {
  const showCustomDates = draftFilters.preset === "custom";

  return (
    <section className="rounded-[24px] border border-[#d8e1ee] bg-white px-4 py-4 shadow-[0_10px_26px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-[#152b4c]">Filter and summary</h2>
          <p className="text-sm text-[#61708a]">Apply date windows, supplier rules, payment context, and saved views without wasting vertical space.</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full bg-[#fff4f6] px-3 py-1 text-xs font-semibold text-[#d54769]">
          <CalendarDays className="h-4 w-4" />
          Active filters
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
        <CompactSelect
          label="Date preset"
          value={draftFilters.preset}
          onChange={(value) => setDraftFilters((current) => ({ ...current, preset: value as FilterDraft["preset"] }))}
          options={presetOptions}
        />
        {showCustomDates ? (
          <>
            <CompactInput
              label="From date"
              type="date"
              value={draftFilters.from}
              onChange={(value) => setDraftFilters((current) => ({ ...current, from: value }))}
            />
            <CompactInput
              label="To date"
              type="date"
              value={draftFilters.to}
              onChange={(value) => setDraftFilters((current) => ({ ...current, to: value }))}
            />
          </>
        ) : (
          <>
            <CompactInput label="From date" type="date" value={draftFilters.from} readOnly />
            <CompactInput label="To date" type="date" value={draftFilters.to} readOnly />
          </>
        )}
        <CompactSelect
          label="Firm / Workspace"
          value={draftFilters.firm}
          onChange={(value) => setDraftFilters((current) => ({ ...current, firm: value as FilterDraft["firm"] }))}
          options={[
            { value: "active", label: "Active Workspace" },
            { value: "all", label: "All Firms" },
          ]}
        />
        <CompactSelect
          label={partyLabel}
          value={draftFilters.supplier}
          onChange={(value) => setDraftFilters((current) => ({ ...current, supplier: value }))}
          options={[{ value: "all", label: `All ${partyLabel}s` }, ...supplierOptions.map((entry) => ({ value: entry, label: entry }))]}
        />
        <CompactSelect
          label="Payment status"
          value={draftFilters.status}
          onChange={(value) => setDraftFilters((current) => ({ ...current, status: value }))}
          options={[{ value: "all", label: "All Status" }, ...statusOptions.map((entry) => ({ value: entry, label: entry }))]}
        />
        <CompactSelect
          label="Payment method"
          value={draftFilters.paymentMethod}
          onChange={(value) => setDraftFilters((current) => ({ ...current, paymentMethod: value }))}
          options={[{ value: "all", label: "All Methods" }, ...paymentMethodOptions.map((entry) => ({ value: entry, label: entry }))]}
        />
        <CompactSelect
          label="Voucher type"
          value={draftFilters.voucherType}
          onChange={(value) => setDraftFilters((current) => ({ ...current, voucherType: value }))}
          options={[{ value: "all", label: "All Voucher Types" }, ...voucherTypeOptions.map((entry) => ({ value: entry, label: entry }))]}
        />
        <CompactSelect
          label="Created by"
          value={draftFilters.createdBy}
          onChange={(value) => setDraftFilters((current) => ({ ...current, createdBy: value }))}
          options={[{ value: "all", label: "All Users" }, ...createdByOptions.map((entry) => ({ value: entry, label: entry }))]}
        />
        <CompactSelect
          label="Branch"
          value={draftFilters.branch}
          onChange={(value) => setDraftFilters((current) => ({ ...current, branch: value }))}
          options={[
            { value: "all", label: "All Branches" },
            { value: "main", label: "Main Branch" },
          ]}
        />
        <CompactSelect
          label="Cost center"
          value={draftFilters.costCenter}
          onChange={(value) => setDraftFilters((current) => ({ ...current, costCenter: value }))}
          options={[{ value: "all", label: "All Cost Centers" }, ...costCenterOptions.map((entry) => ({ value: entry, label: entry }))]}
        />
        <CompactSelect
          label="Saved filters"
          value={draftFilters.savedFilter}
          onChange={(value) => setDraftFilters((current) => ({ ...current, savedFilter: value as FilterDraft["savedFilter"] }))}
          options={savedFilterOptions}
        />
        <div className="flex items-end gap-2 xl:col-span-1">
          <Button type="button" className="h-11 flex-1 rounded-2xl bg-primary text-white hover:bg-[#cf670f]" onClick={onApply}>
            <CheckCircle2 className="h-5 w-5" />
            Apply
          </Button>
          <Button type="button" variant="outline" className="h-11 flex-1 rounded-2xl" onClick={onReset}>
            <RotateCcw className="h-5 w-5" />
            Reset
          </Button>
        </div>
      </div>
    </section>
  );
}

function CompactSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="grid gap-1.5 text-sm text-[#4c5d78]">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#74839b]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-2xl border border-[#d6dfeb] bg-white px-3 text-sm text-[#163052] outline-none transition focus:border-[#7aa7dc] focus:ring-2 focus:ring-[rgba(37,99,235,0.14)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompactInput({
  label,
  value,
  type,
  readOnly = false,
  onChange,
}: {
  label: string;
  value: string;
  type: string;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm text-[#4c5d78]">
      <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[#74839b]">{label}</span>
      {type === "date" ? (
        <AppDateInput
          readOnly={readOnly}
          value={value}
          onChange={onChange}
          inputClassName="h-11 rounded-2xl border-[#f0c9a4] bg-white text-sm text-[#163052] read-only:bg-[#fff7ef] read-only:text-[#8d735d]"
          aria-label={label}
        />
      ) : (
        <Input
          type={type}
          readOnly={readOnly}
          value={value}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
          className="h-11 rounded-2xl border-[#f0c9a4] bg-white text-sm text-[#163052] read-only:bg-[#fff7ef] read-only:text-[#8d735d]"
        />
      )}
    </label>
  );
}

export function PurchaseSummaryMetrics({ metrics }: { metrics: SummaryMetric[] }) {
  return (
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const tone = accentStyles[metric.tone];
        return (
          <div key={metric.id} className="rounded-[22px] border border-[#d8e1ee] bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#6d7d95]">{metric.label}</div>
                <div className="mt-2 text-[1.85rem] font-semibold tracking-[-0.03em] text-[#132949]">{metric.value}</div>
                {metric.note ? <div className="mt-1 text-xs text-[#64748b]">{metric.note}</div> : null}
              </div>
              <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl", tone.icon)}>
                <metric.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function DocumentStatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "blue" | "amber" | "red" | "slate";
}) {
  const toneClass =
    tone === "green"
      ? "border-[#a8e2c4] bg-[#e8f9f0] text-[#117548]"
      : tone === "blue"
        ? "border-[#b9d5f7] bg-[#edf4ff] text-[#1d66b1]"
        : tone === "amber"
          ? "border-[#f1d08a] bg-[#fff7e6] text-[#a85d08]"
          : tone === "red"
            ? "border-[#f2b6b6] bg-[#fff0f0] text-[#c63c3c]"
            : "border-[#d8dee8] bg-[#f2f4f7] text-[#576579]";

  const dotClass = tone === "green" ? "bg-[#18a567]" : tone === "blue" ? "bg-[#3283d8]" : tone === "amber" ? "bg-[#e08a18]" : tone === "red" ? "bg-[#dc4b4b]" : "bg-[#7b8799]";

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize", toneClass)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClass)} />
      {label}
    </span>
  );
}

export function EmptyTransactionState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 rounded-[26px] border border-dashed border-[#d2ddec] bg-white px-6 py-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#eef5ff] text-[#2b76ca]">
        <Icon className="h-11 w-11" />
      </div>
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-[#12284a]">{title}</h3>
        <p className="max-w-lg text-sm text-[#61708a]">{description}</p>
      </div>
      <Button type="button" className="h-11 rounded-2xl bg-primary px-5 text-white hover:bg-[#cf670f]" onClick={onAction}>
        <Plus className="h-[18px] w-[18px]" />
        {actionLabel}
      </Button>
    </div>
  );
}
