"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { m, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Boxes,
  Building2,
  CalendarDays,
  CalendarClock,
  ChevronDown,
  HandCoins,
  Landmark,
  PiggyBank,
  PencilLine,
  ShoppingCart,
  Truck,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import gsap from "gsap";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { ErrorPanel } from "@/components/shared/error-panel";
import { AppDateInput } from "@/components/shared/app-date-input";
import { LoadingPanel } from "@/components/shared/loading-panel";
import { TablePagination } from "@/components/shared/table-pagination";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { buildVoucherRoute, buildWorkspaceRoute } from "@/config/routes";
import { loadInventoryItems } from "@/features/screens/inventory-screen";
import { useDashboardQuery } from "@/hooks/use-app-query";
import { useSessionContext } from "@/hooks/use-session-context";
import { useTransientScrollbar } from "@/hooks/use-transient-scrollbar";
import { useViewportScale } from "@/hooks/use-viewport-scale";
import { downloadCsv } from "@/lib/download";
import { formatCurrency, formatDate } from "@/lib/format";
import { roundMoney, sumMoney } from "@/lib/money";
import { pageItemVariants, pageStaggerVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { VoucherRecord } from "@/types/domain";

type DashboardRangePreset = "today" | "monthly" | "six-months" | "year" | "custom";
type DashboardStandardPreset = Exclude<DashboardRangePreset, "custom">;

const RECENT_TRANSACTIONS_PER_PAGE = 25;

type EmiReminderSummary = {
  activeLoans: number;
  dueSoon: number;
  overdue: number;
  nextDueDate: string | null;
  nextAmount: number;
};

type OtherPaymentSummary = {
  count: number;
  nextDueDate: string | null;
  amount: number;
};

type DashboardRangeSelection = {
  preset: DashboardRangePreset;
  lastPreset: DashboardStandardPreset;
  customStartDate: string;
  customEndDate: string;
};

const metricCardStyles: Record<
  string,
  {
    backgroundColor: string;
    borderColor: string;
    textColor: string;
    labelColor: string;
    badgeBackground: string;
    badgeColor: string;
    sparklineColor: string;
    sparklineFill: string;
    accentGlow: string;
  }
> = {
  sales: {
    backgroundColor: "#ffffff",
    borderColor: "#cfe8da",
    textColor: "#1f2f28",
    labelColor: "#5f746a",
    badgeBackground: "#e8f8ef",
    badgeColor: "#1b7d52",
    sparklineColor: "#22a064",
    sparklineFill: "rgba(34,160,100,0.12)",
    accentGlow: "rgba(34,160,100,0.18)",
  },
  purchase: {
    backgroundColor: "#ffffff",
    borderColor: "#f5debd",
    textColor: "#33271a",
    labelColor: "#7b6852",
    badgeBackground: "#fff2e2",
    badgeColor: "#ca7a0a",
    sparklineColor: "#eb940f",
    sparklineFill: "rgba(235,148,15,0.12)",
    accentGlow: "rgba(235,148,15,0.18)",
  },
  receipt: {
    backgroundColor: "#ffffff",
    borderColor: "#d6e4ff",
    textColor: "#1d2d4a",
    labelColor: "#62738f",
    badgeBackground: "#edf4ff",
    badgeColor: "#2867df",
    sparklineColor: "#3b76eb",
    sparklineFill: "rgba(59,118,235,0.12)",
    accentGlow: "rgba(59,118,235,0.18)",
  },
  payment: {
    backgroundColor: "#ffffff",
    borderColor: "#f0d7df",
    textColor: "#3a2630",
    labelColor: "#826775",
    badgeBackground: "#feeff4",
    badgeColor: "#c85373",
    sparklineColor: "#d56786",
    sparklineFill: "rgba(213,103,134,0.12)",
    accentGlow: "rgba(213,103,134,0.18)",
  },
  "stock-items": {
    backgroundColor: "#ffffff",
    borderColor: "#e2dafc",
    textColor: "#30264a",
    labelColor: "#75698f",
    badgeBackground: "#f4efff",
    badgeColor: "#7b46df",
    sparklineColor: "#8a5cf0",
    sparklineFill: "rgba(138,92,240,0.12)",
    accentGlow: "rgba(138,92,240,0.18)",
  },
  cash: {
    backgroundColor: "#ffffff",
    borderColor: "#cfeff4",
    textColor: "#183845",
    labelColor: "#5b7885",
    badgeBackground: "#e9f9fc",
    badgeColor: "#1487a0",
    sparklineColor: "#1f9bb5",
    sparklineFill: "rgba(31,155,181,0.12)",
    accentGlow: "rgba(31,155,181,0.18)",
  },
  receivable: {
    backgroundColor: "#ffffff",
    borderColor: "#cdeff2",
    textColor: "#183742",
    labelColor: "#5d7983",
    badgeBackground: "#e9fbfd",
    badgeColor: "#0d93a6",
    sparklineColor: "#16a6bb",
    sparklineFill: "rgba(22,166,187,0.12)",
    accentGlow: "rgba(22,166,187,0.18)",
  },
  payable: {
    backgroundColor: "#ffffff",
    borderColor: "#dfd7f2",
    textColor: "#31294a",
    labelColor: "#746c8a",
    badgeBackground: "#f3effb",
    badgeColor: "#7752bd",
    sparklineColor: "#8865cc",
    sparklineFill: "rgba(136,101,204,0.12)",
    accentGlow: "rgba(136,101,204,0.18)",
  },
  bank: {
    backgroundColor: "#ffffff",
    borderColor: "#d9d7ff",
    textColor: "#2d275f",
    labelColor: "#726b9e",
    badgeBackground: "#f1efff",
    badgeColor: "#6554d4",
    sparklineColor: "#7867ea",
    sparklineFill: "rgba(120,103,234,0.12)",
    accentGlow: "rgba(120,103,234,0.18)",
  },
  cashAndBank: {
    backgroundColor: "#ffffff",
    borderColor: "#c9e9d9",
    textColor: "#173a2c",
    labelColor: "#5c8271",
    badgeBackground: "#e8f7f0",
    badgeColor: "#1a8f5c",
    sparklineColor: "#22a06f",
    sparklineFill: "rgba(34,160,111,0.12)",
    accentGlow: "rgba(34,160,111,0.18)",
  },
};

const metricCardIcons: Record<string, LucideIcon> = {
  sales: ShoppingCart,
  purchase: Truck,
  receipt: ArrowDownToLine,
  payment: ArrowUpFromLine,
  "stock-items": Boxes,
  cash: Wallet,
  receivable: HandCoins,
  payable: Landmark,
  bank: Building2,
  cashAndBank: PiggyBank,
};

const defaultMetricIcon = Wallet;

const defaultMetricPalette = {
  backgroundColor: "#ffffff",
  borderColor: "#dbe5ef",
  textColor: "#223555",
  labelColor: "#667892",
  badgeBackground: "#eef4ff",
  badgeColor: "#2a68d7",
  sparklineColor: "#4e8ef7",
  sparklineFill: "rgba(78,142,247,0.12)",
  accentGlow: "rgba(78,142,247,0.16)",
};

const movementMetricIds = ["sales", "purchase", "receipt", "payment"] as const;

const movementChartColors: Record<(typeof movementMetricIds)[number], string> = {
  sales: "#14804a",
  purchase: "#d78a16",
  receipt: "#2563eb",
  payment: "#cf5e78",
};

const dashboardRangeOptions: Array<{ value: DashboardRangePreset; label: string }> = [
  { value: "today", label: "Today" },
  { value: "monthly", label: "Monthly" },
  { value: "six-months", label: "Six Months" },
  { value: "year", label: "1 Year" },
  { value: "custom", label: "Custom" },
];

const dashboardDropdownOptions = dashboardRangeOptions.filter((option) => option.value !== "custom");

// The API hands metrics back in accounting order (receivable, payable, sales...).
// Owners read the board differently: what came in, who still owes me, what I am
// holding, then what I owe — so the cards are re-sequenced for that flow. The
// Upcoming Dues card is rendered after this list and closes the second row.
const dashboardMetricCardOrder = ["sales", "receivable", "cash", "payable", "purchase", "receipt", "payment"];

function parseDashboardDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0);
}

function formatDashboardDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDashboardDays(value: string, days: number) {
  const nextDate = parseDashboardDate(value);
  nextDate.setDate(nextDate.getDate() + days);
  return formatDashboardDateValue(nextDate);
}

function shiftDashboardMonths(value: string, months: number) {
  const nextDate = parseDashboardDate(value);
  nextDate.setMonth(nextDate.getMonth() + months);
  return formatDashboardDateValue(nextDate);
}

function countDashboardDays(startDate: string, endDate: string) {
  const start = parseDashboardDate(startDate);
  const end = parseDashboardDate(endDate);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

function countDashboardMonths(startDate: string, endDate: string) {
  const start = parseDashboardDate(startDate);
  const end = parseDashboardDate(endDate);
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
}

function isDashboardDateComplete(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function createRangeSelection(preset: DashboardRangePreset, endDate = formatDashboardDateValue(new Date())): DashboardRangeSelection {
  return {
    preset,
    lastPreset: preset === "custom" ? "today" : preset,
    customStartDate: shiftDashboardDays(endDate, -29),
    customEndDate: endDate,
  };
}

function resolveRangeBounds(selection: DashboardRangeSelection, latestDate: string) {
  if (selection.preset === "today") {
    return { startDate: latestDate, endDate: latestDate };
  }

  if (selection.preset === "monthly") {
    return { startDate: shiftDashboardDays(latestDate, -29), endDate: latestDate };
  }

  if (selection.preset === "six-months") {
    return { startDate: shiftDashboardMonths(latestDate, -5), endDate: latestDate };
  }

  if (selection.preset === "year") {
    return { startDate: shiftDashboardMonths(latestDate, -11), endDate: latestDate };
  }

  const startDate = selection.customStartDate || shiftDashboardDays(latestDate, -29);
  const endDate = selection.customEndDate || latestDate;
  return startDate <= endDate ? { startDate, endDate } : { startDate: endDate, endDate: startDate };
}

function getRangeLabel(preset: DashboardRangePreset) {
  return dashboardRangeOptions.find((option) => option.value === preset)?.label ?? "Selected Range";
}

// The trend card heading has to follow the range selector sitting next to it —
// a "Monthly Trend" title above an hour-by-hour Today chart just reads wrong.
function getTrendTitle(preset: DashboardRangePreset) {
  if (preset === "today") return "Today's Trend";
  if (preset === "six-months") return "Six Month Trend";
  if (preset === "year") return "1 Year Trend";
  if (preset === "custom") return "Custom Range Trend";
  return "Monthly Trend";
}

function formatDashboardRangeLabel(startDate: string, endDate: string) {
  const hasStartDate = isDashboardDateComplete(startDate);
  const hasEndDate = isDashboardDateComplete(endDate);

  if (!hasStartDate && !hasEndDate) return "Select dates";
  if (!hasStartDate) return formatDate(endDate);
  if (!hasEndDate) return formatDate(startDate);

  const [firstDate, lastDate] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  return firstDate === lastDate ? formatDate(firstDate) : `${formatDate(firstDate)} – ${formatDate(lastDate)}`;
}

// A Purchase Order and a Receipt Note both carry voucherType "purchase" (same for
// Quotation/Proforma/Sale Order/Delivery Note under "sales") — documentKind is what
// actually distinguishes them. Falling back to voucherType alone here showed every
// pre-bill purchase document as plain "Purchase", even when no bill had been raised yet.
const documentKindTransactionLabels: Record<string, string> = {
  "purchase-order": "Purchase Order",
  "receipt-note": "Receipt Note",
  quotation: "Quotation",
  proforma: "Proforma Invoice",
  "sale-order": "Sale Order",
  "delivery-note": "Delivery Note",
};

function getRecentTransactionTypeLabel(voucher: { voucherType: string; documentKind?: string | null }) {
  if (voucher.documentKind && documentKindTransactionLabels[voucher.documentKind]) {
    return documentKindTransactionLabels[voucher.documentKind];
  }

  return voucher.voucherType === "debit-note" ? "Purchase Return" : voucher.voucherType.replace("-", " ");
}

/** Real transaction totals can run into the hundreds of millions, and the raw
 * comma-formatted string is wider than the axis column reserves — it overflows
 * past the chart's clipped edge and the leading digits get cut off. Abbreviating
 * to K/M keeps every tick short enough to fit. */
// Axis ticks carry no currency prefix - the unit is printed once as the axis
// title, so every tick stays short (0 / 250K / 500K / 1M) instead of repeating
// "BDT" down the whole left edge.
function formatChartAxisAmount(value: number) {
  const roundedValue = roundMoney(value);
  if (roundedValue === 0) {
    return "0";
  }

  const abs = Math.abs(roundedValue);
  const sign = roundedValue < 0 ? "-" : "";
  const unit =
    abs >= 1_000_000_000
      ? { divisor: 1_000_000_000, suffix: "B" }
      : abs >= 1_000_000
        ? { divisor: 1_000_000, suffix: "M" }
        : abs >= 1_000
          ? { divisor: 1_000, suffix: "K" }
          : { divisor: 1, suffix: "" };
  const scaled = abs / unit.divisor;

  return `${sign}${scaled.toLocaleString("en-US", { maximumFractionDigits: scaled < 10 ? 2 : 1 })}${unit.suffix}`;
}

// Rounds a raw step up to the nearest 1 / 2 / 2.5 / 5 x power-of-ten so every
// tick lands on a value a reader recognises at a glance.
function roundAxisStep(rawStep: number) {
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const roundedNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;

  return roundedNormalized * magnitude;
}

// Builds a zero-based axis on rounded intervals instead of letting the top tick
// land on the raw data maximum (962.48K), which reads as noise on a chart.
function buildChartAxisScale(maxValue: number, tickCount = 4) {
  const safeMax = Number.isFinite(maxValue) && maxValue > 0 ? maxValue : 0;
  if (safeMax === 0) {
    return { domain: [0, 1] as [number, number], ticks: [0] };
  }

  const step = roundAxisStep(safeMax / tickCount);
  const upperBound = Math.ceil(safeMax / step) * step;
  const ticks: number[] = [];
  for (let tick = 0; tick <= upperBound + step / 2; tick += step) {
    ticks.push(roundMoney(tick));
  }

  return { domain: [0, upperBound] as [number, number], ticks };
}

function formatEntityCountLabel(count: number, pluralLabel: string) {
  if (Math.abs(count) !== 1) {
    return pluralLabel;
  }

  if (/ies$/i.test(pluralLabel)) {
    return pluralLabel.replace(/ies$/i, "y");
  }

  if (/(ches|shes|sses|xes|zes)$/i.test(pluralLabel)) {
    return pluralLabel.slice(0, -2);
  }

  if (/s$/i.test(pluralLabel) && !/ss$/i.test(pluralLabel)) {
    return pluralLabel.slice(0, -1);
  }

  return pluralLabel;
}

function ChartRangeSelector({
  value,
  minDate,
  maxDate,
  customOpen,
  onPresetChange,
  onCustomToggle,
  onCustomStartDateChange,
  onCustomEndDateChange,
}: {
  value: DashboardRangeSelection;
  minDate: string;
  maxDate: string;
  customOpen: boolean;
  onPresetChange: (next: DashboardStandardPreset) => void;
  onCustomToggle: () => void;
  onCustomStartDateChange: (next: string) => void;
  onCustomEndDateChange: (next: string) => void;
}) {
  const customRangeLabel = formatDashboardRangeLabel(value.customStartDate, value.customEndDate);

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-[#e2e9f2] bg-white p-1 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
        {value.preset !== "custom" ? <div className="relative">
          <select
            value={value.preset}
            onChange={(event) => {
              if (event.target.value === "__custom__") {
                return;
              }

              onPresetChange(event.target.value as DashboardStandardPreset);
            }}
            className="h-[clamp(25px,17px+0.78vw,32px)] appearance-none rounded-full border border-[#e7edf5] bg-[#fbfdff] pl-3 pr-8 text-[clamp(9.5px,7px+0.23vw,11.5px)] font-semibold text-[#2458cf] outline-none transition"
            aria-label="Select dashboard date range"
          >
            {dashboardDropdownOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6b7c95]" />
        </div> : null}
        <button
          type="button"
          onClick={onCustomToggle}
          aria-label={value.preset === "custom" ? `Selected date range: ${customRangeLabel}` : "Select custom date range"}
          className={[
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[clamp(9.5px,7px+0.23vw,11.5px)] font-semibold transition",
            value.preset === "custom" ? "bg-[#eff5ff] text-[#2458cf] shadow-[0_3px_10px_rgba(37,99,235,0.12)]" : "text-[#6b7c95] hover:bg-[#f8fafc]",
          ].join(" ")}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {value.preset === "custom" ? customRangeLabel : "Custom"}
        </button>
      </div>
      {customOpen ? (
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-[16px] border border-[#e8eef6] bg-[#fbfdff] px-3 py-2">
          <label className="flex items-center gap-1.5 text-[clamp(9px,6.5px+0.23vw,11px)] font-medium text-[#6b7c95]">
            <span>From</span>
            <AppDateInput
              min={minDate}
              max={maxDate}
              value={value.customStartDate}
              onChange={onCustomStartDateChange}
              className="w-[132px]"
              inputClassName="h-7 rounded-lg border-[#dbe5ef] bg-white px-2 pr-8 text-[clamp(9.5px,7px+0.23vw,11.5px)] font-semibold text-[#223555] focus:border-[#b7c8e3]"
              aria-label="Dashboard custom range from date"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[clamp(9px,6.5px+0.23vw,11px)] font-medium text-[#6b7c95]">
            <span>To</span>
            <AppDateInput
              min={minDate}
              max={maxDate}
              value={value.customEndDate}
              onChange={onCustomEndDateChange}
              className="w-[132px]"
              inputClassName="h-7 rounded-lg border-[#dbe5ef] bg-white px-2 pr-8 text-[clamp(9.5px,7px+0.23vw,11.5px)] font-semibold text-[#223555] focus:border-[#b7c8e3]"
              aria-label="Dashboard custom range to date"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export function DashboardScreen() {
  const router = useRouter();
  const { mode, session } = useSessionContext();
  const query = useDashboardQuery(mode, session?.workspaceId ?? "");
  const shouldReduceMotion = useReducedMotion();
  const chartScale = useViewportScale();
  const metricValueRefs = useRef<Array<HTMLElement | null>>([]);
  const previousMetricValuesRef = useRef<Record<string, number>>({});
  const transactionsScrollRef = useTransientScrollbar<HTMLDivElement>();
  const [transactionsPage, setTransactionsPage] = useState(1);
  const transactionsPageSize = RECENT_TRANSACTIONS_PER_PAGE;
  const getRecentTransactionHref = (voucher: VoucherRecord) => {
    const params = new URLSearchParams({
      edit: voucher.id,
      returnTo: buildWorkspaceRoute(mode, "/dashboard"),
    });
    if (voucher.voucherType === "journal") params.set("adjustment", "1");
    return `${buildVoucherRoute(mode, voucher.voucherType)}?${params.toString()}`;
  };
  const [selectedMetricId, setSelectedMetricId] = useState<string | null>(null);
  const [trendRange, setTrendRange] = useState<DashboardRangeSelection>(() => createRangeSelection("today"));
  const [movementRange] = useState<DashboardRangeSelection>(() => createRangeSelection("today"));
  const [trendCustomOpen, setTrendCustomOpen] = useState(false);
  const [emiReminder, setEmiReminder] = useState<EmiReminderSummary>({
    activeLoans: 0,
    dueSoon: 0,
    overdue: 0,
    nextDueDate: null,
    nextAmount: 0,
  });
  const [otherPaymentReminder, setOtherPaymentReminder] = useState<OtherPaymentSummary>({
    count: 0,
    nextDueDate: null,
    amount: 0,
  });
  const [lowStockCount, setLowStockCount] = useState(0);
  const [outOfStockCount, setOutOfStockCount] = useState(0);
  // Cheques that already went wrong, as opposed to the ones merely coming due
  // (those belong to the Upcoming Dues card, not to Needs Attention).
  const [chequeAlerts, setChequeAlerts] = useState({ bounced: 0, pastDue: 0 });
  const [, setTrendCustomTouched] = useState({ start: false, end: false });
  // Sales/Purchase/Receipt/Payment carry a real this-month total alongside their
  // today total (see dashboard.service.ts) — each card remembers its own choice
  // independently, defaulting to "today" to match the badge that showed there before.
  const [metricPeriod, setMetricPeriod] = useState<Record<string, "today" | "month">>({});
  // A brand-new/empty workspace should show its real (zero) numbers, not a
  // fabricated "preview" dataset with made-up customers and sales figures.
  const dashboardData = query.data;
  // Bank Balance and Total Cash & Bank fold into the Cash in Hand card instead of
  // rendering as their own tiles — this is the list both the count-up animation
  // and the card grid render from, so their indices always stay in sync with
  // whatever cards actually appear. Togglable cards swap in their this-month total
  // here so the count-up animation and every downstream consumer of `.value` just
  // works without knowing about periods at all.
  const visibleMetrics = useMemo(() => {
    const metrics = dashboardData?.metrics.filter((metric) => metric.id !== "bank" && metric.id !== "mfs" && metric.id !== "cashAndBank") ?? [];
    const rank = (id: string) => {
      const position = dashboardMetricCardOrder.indexOf(id);
      return position === -1 ? dashboardMetricCardOrder.length : position;
    };
    return [...metrics].sort((left, right) => rank(left.id) - rank(right.id)).map((metric) => {
      if (metric.monthValue === undefined || (metricPeriod[metric.id] ?? "today") !== "month") {
        return metric;
      }
      return { ...metric, value: metric.monthValue };
    });
  }, [dashboardData?.metrics, metricPeriod]);

  useEffect(() => {
    if (typeof window === "undefined" || !session?.workspaceId) {
      return;
    }

    const raw = window.localStorage.getItem(`bizovix:loan-accounts:${mode}:${session.workspaceId}`);
    if (!raw) {
      setEmiReminder({ activeLoans: 0, dueSoon: 0, overdue: 0, nextDueDate: null, nextAmount: 0 });
      return;
    }

    try {
      const accounts = JSON.parse(raw) as Array<{
        status?: string;
        currentBalance?: number | string;
        balanceAsOf?: string;
        interestRate?: number | string;
        termMonths?: number | string;
        transactions?: Array<{ date?: string }>;
      }>;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueDates = accounts
        .filter((account) => account.status === "Running" && Number(account.currentBalance ?? 0) > 0)
        .map((account) => {
          const dates = [account.balanceAsOf, ...(account.transactions ?? []).map((entry) => entry.date)]
            .filter((value): value is string => Boolean(value))
            .map((value) => new Date(`${value}T00:00:00`))
            .filter((value) => !Number.isNaN(value.getTime()));
          const anchor = dates.sort((left, right) => right.getTime() - left.getTime())[0] ?? today;
          const nextDue = new Date(anchor);
          nextDue.setMonth(nextDue.getMonth() + 1);
          const balance = Number(account.currentBalance ?? 0);
          const termMonths = Math.max(1, Number(account.termMonths ?? 1));
          const monthlyRate = Number(account.interestRate ?? 0) / 100 / 12;
          const factor = Math.pow(1 + monthlyRate, termMonths);
          const amount = monthlyRate > 0 ? (balance * monthlyRate * factor) / (factor - 1) : balance / termMonths;
          return { date: nextDue, amount: Number.isFinite(amount) ? amount : 0 };
        })
        .sort((left, right) => left.date.getTime() - right.date.getTime());
      const dayInMs = 86_400_000;
      const daysUntilDue = dueDates.map(({ date }) => Math.ceil((date.getTime() - today.getTime()) / dayInMs));

      setEmiReminder({
        activeLoans: dueDates.length,
        dueSoon: daysUntilDue.filter((days) => days >= 0 && days <= 7).length,
        overdue: daysUntilDue.filter((days) => days < 0).length,
        nextDueDate: dueDates[0]
          ? `${dueDates[0].date.getFullYear()}-${String(dueDates[0].date.getMonth() + 1).padStart(2, "0")}-${String(dueDates[0].date.getDate()).padStart(2, "0")}`
          : null,
        nextAmount: roundMoney(dueDates[0]?.amount ?? 0),
      });
    } catch {
      setEmiReminder({ activeLoans: 0, dueSoon: 0, overdue: 0, nextDueDate: null, nextAmount: 0 });
    }
  }, [mode, session?.workspaceId]);

  useEffect(() => {
    if (typeof window === "undefined" || !session?.workspaceId) return;

    const raw = window.localStorage.getItem(`bizovix:cheques:${mode}:${session.workspaceId}`);
    if (!raw) {
      setOtherPaymentReminder({ count: 0, nextDueDate: null, amount: 0 });
      setChequeAlerts({ bounced: 0, pastDue: 0 });
      return;
    }

    try {
      const cheques = JSON.parse(raw) as Array<{
        amount?: number | string;
        dueDate?: string;
        direction?: string;
        status?: string;
      }>;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dueWindowEnd = new Date(today);
      dueWindowEnd.setDate(dueWindowEnd.getDate() + 7);
      const upcomingPayments = (Array.isArray(cheques) ? cheques : [])
        .filter((cheque) => {
          if (cheque.direction !== "Payment" || !cheque.dueDate) return false;
          if (["Cleared", "Cancelled", "Bounced"].includes(cheque.status ?? "")) return false;
          const dueDate = new Date(`${cheque.dueDate}T00:00:00`);
          return !Number.isNaN(dueDate.getTime()) && dueDate >= today && dueDate <= dueWindowEnd;
        })
        .sort((left, right) => String(left.dueDate).localeCompare(String(right.dueDate)));

      setOtherPaymentReminder({
        count: upcomingPayments.length,
        nextDueDate: upcomingPayments[0]?.dueDate ?? null,
        amount: sumMoney(upcomingPayments.map((cheque) => Math.max(0, roundMoney(Number(cheque.amount ?? 0) || 0)))),
      });

      const allCheques = Array.isArray(cheques) ? cheques : [];
      // Both directions count: a bounced cheque we received is as broken as one we issued.
      const settledStatuses = ["Cleared", "Cancelled", "Bounced"];
      setChequeAlerts({
        bounced: allCheques.filter((cheque) => cheque.status === "Bounced").length,
        pastDue: allCheques.filter((cheque) => {
          if (!cheque.dueDate || settledStatuses.includes(cheque.status ?? "")) return false;
          const chequeDueDate = new Date(cheque.dueDate + "T00:00:00");
          return !Number.isNaN(chequeDueDate.getTime()) && chequeDueDate < today;
        }).length,
      });
    } catch {
      setOtherPaymentReminder({ count: 0, nextDueDate: null, amount: 0 });
      setChequeAlerts({ bounced: 0, pastDue: 0 });
    }
  }, [mode, session?.workspaceId]);

  useEffect(() => {
    if (!session?.workspaceId) return;

    let active = true;
    void loadInventoryItems(mode, session.workspaceId)
      .then((items) => {
        if (active) {
          const activeItems = items.filter((item) => item.status === "active");
          // Out of stock gets its own line, so keep it out of the low-stock count.
          setLowStockCount(activeItems.filter((item) => item.reorderLevel > 0 && item.quantity > 0 && item.quantity <= item.reorderLevel).length);
          setOutOfStockCount(activeItems.filter((item) => item.quantity <= 0).length);
        }
      })
      .catch(() => {
        if (active) {
          setLowStockCount(0);
          setOutOfStockCount(0);
        }
      });

    return () => {
      active = false;
    };
  }, [mode, session?.workspaceId]);

  useEffect(() => {
    const exportHandler = () => {
      if (!dashboardData?.metrics.length) {
        return;
      }

      downloadCsv(
        "dashboard-metrics.csv",
        dashboardData.metrics.map((metric) => ({
          Metric: metric.label,
          Value: metric.value,
          Change: metric.change,
        })),
      );
      toast.success("Dashboard metrics exported");
    };

    window.addEventListener("erp-export-request", exportHandler as EventListener);
    return () => window.removeEventListener("erp-export-request", exportHandler as EventListener);
  }, [dashboardData]);

  useEffect(() => {
    if (!visibleMetrics.length) {
      return;
    }

    const nextMetricValues = Object.fromEntries(
      visibleMetrics.map((metric) => [metric.id, metric.value]),
    );

    if (shouldReduceMotion) {
      visibleMetrics.forEach((metric, index) => {
        const node = metricValueRefs.current[index];
        if (node) {
          node.textContent = formatCurrency(metric.value);
        }
      });
      previousMetricValuesRef.current = nextMetricValues;
      return;
    }

    const animations = visibleMetrics.map((metric, index) => {
      const node = metricValueRefs.current[index];
      if (!node) {
        return null;
      }

      const previousValue = previousMetricValuesRef.current[metric.id];
      if (previousValue !== undefined && previousValue === metric.value) {
        node.textContent = formatCurrency(metric.value);
        return null;
      }

      const state = { value: previousValue ?? 0 };
      node.textContent = formatCurrency(state.value);

      return gsap.to(state, {
        value: metric.value,
        duration: 1.05,
        delay: previousValue === undefined ? index * 0.08 : 0,
        ease: "power2.out",
        onUpdate: () => {
          node.textContent = formatCurrency(state.value);
        },
      });
    });

    previousMetricValuesRef.current = nextMetricValues;

    return () => {
      animations.forEach((animation) => {
        animation?.kill();
      });
    };
  }, [shouldReduceMotion, visibleMetrics]);

  const pagedRecentTransactions = useMemo(() => {
    const rows = dashboardData?.recentTransactions ?? [];
    return rows.slice((transactionsPage - 1) * transactionsPageSize, transactionsPage * transactionsPageSize);
  }, [dashboardData?.recentTransactions, transactionsPage, transactionsPageSize]);
  const totalTransactionPages = Math.max(1, Math.ceil((dashboardData?.recentTransactions.length ?? 0) / transactionsPageSize));
  const sortedTransactions = useMemo(() => {
    return (dashboardData?.recentTransactions ?? [])
      .filter((voucher) => voucher.status === "posted" || voucher.status === "approved")
      .filter((voucher) => !["purchase-order", "receipt-note", "quotation", "proforma", "sale-order", "delivery-note"].includes(voucher.documentKind ?? ""))
      .sort((left, right) => {
      const dateCompare = left.voucherDate.localeCompare(right.voucherDate);
      if (dateCompare !== 0) {
        return dateCompare;
      }

      return left.voucherNumber.localeCompare(right.voucherNumber);
      });
  }, [dashboardData?.recentTransactions]);
  const dashboardTodayDate = formatDashboardDateValue(new Date());
  const earliestTransactionDate = sortedTransactions.at(0)?.voucherDate ?? dashboardTodayDate;
  const rangeEndDate = dashboardTodayDate;
  const monthlyMovementData = useMemo(() => {
    return movementMetricIds.map((metricId) => {
      const metric = dashboardData?.metrics.find((entry) => entry.id === metricId);

      return {
        name: (metric?.label ?? metricId).replace("Total ", ""),
        value: metric?.monthValue ?? 0,
        change: "Monthly",
        color: movementChartColors[metricId],
      };
    });
  }, [dashboardData?.metrics]);
  const trendChartData = useMemo(() => {
    if (!dashboardData) {
      return [];
    }

    if (trendRange.preset === "today") {
      const todayRows = sortedTransactions.filter((voucher) => voucher.voucherDate === dashboardTodayDate);
      // Real clock hours from each voucher's createdAt, not its position in the
      // list — a voucher entered at 2 PM must land in the 1 PM/3 PM bucket, never
      // wherever it happened to sort in the array.
      const hourSlots = [
        { name: "9 AM", startHour: 0, endHour: 10 },
        { name: "11 AM", startHour: 10, endHour: 12 },
        { name: "1 PM", startHour: 12, endHour: 14 },
        { name: "3 PM", startHour: 14, endHour: 16 },
        { name: "5 PM", startHour: 16, endHour: 24 },
      ].map((slot) => ({ ...slot, sales: 0, purchase: 0, collection: 0 }));

      todayRows.forEach((voucher) => {
        const hour = new Date(voucher.createdAt).getHours();
        const slot = hourSlots.find((entry) => hour >= entry.startHour && hour < entry.endHour) ?? hourSlots[hourSlots.length - 1];

        if (voucher.voucherType === "sales") {
          slot.sales += Number(voucher.amount || 0);
        }

        if (voucher.voucherType === "purchase") {
          slot.purchase += Number(voucher.amount || 0);
        }

        if (voucher.voucherType === "receipt") {
          slot.collection += Number(voucher.amount || 0);
        }
      });

      return hourSlots.map(({ name, sales, purchase, collection }) => ({ name, sales, purchase, collection }));
    }

    const { startDate, endDate } = resolveRangeBounds(trendRange, rangeEndDate);
    const daySpan = countDashboardDays(startDate, endDate);
    const bucketByMonth = trendRange.preset === "six-months" || trendRange.preset === "year" || (trendRange.preset === "custom" && daySpan > 45);
    const filteredTransactions = sortedTransactions.filter((voucher) => voucher.voucherDate >= startDate && voucher.voucherDate <= endDate);

    // Every bucket across the whole selected range starts at zero — a genuinely
    // quiet week/month reads as a flat zero line, never a gap and never a
    // fabricated value. Real transactions below are the only thing that raises
    // a bucket above zero.
    const grouped = new Map<string, { sortKey: string; name: string; sales: number; purchase: number; collection: number }>();
    const bucketCount = bucketByMonth ? countDashboardMonths(startDate, endDate) : daySpan;
    for (let index = 0; index < bucketCount; index += 1) {
      const pointDate = bucketByMonth ? shiftDashboardMonths(startDate, index) : shiftDashboardDays(startDate, index);
      const sortKey = bucketByMonth ? pointDate.slice(0, 7) : pointDate;
      const name = bucketByMonth ? formatDate(`${sortKey}-01`) : formatDate(pointDate);
      grouped.set(sortKey, { sortKey, name, sales: 0, purchase: 0, collection: 0 });
    }

    filteredTransactions.forEach((voucher) => {
      const sortKey = bucketByMonth ? voucher.voucherDate.slice(0, 7) : voucher.voucherDate;
      const name = bucketByMonth ? formatDate(`${sortKey}-01`) : formatDate(voucher.voucherDate);
      const current = grouped.get(sortKey) ?? { sortKey, name, sales: 0, purchase: 0, collection: 0 };

      if (voucher.voucherType === "sales") {
        current.sales += Number(voucher.amount || 0);
      }

      if (voucher.voucherType === "purchase") {
        current.purchase += Number(voucher.amount || 0);
      }

      if (voucher.voucherType === "receipt") {
        current.collection += Number(voucher.amount || 0);
      }

      grouped.set(sortKey, current);
    });

    return Array.from(grouped.values())
      .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
      .map((entry) => ({ name: entry.name, sales: entry.sales, purchase: entry.purchase, collection: entry.collection }));
  }, [dashboardData, dashboardTodayDate, rangeEndDate, sortedTransactions, trendRange]);
  const trendAxisScale = useMemo(
    () =>
      buildChartAxisScale(
        trendChartData.reduce((highest, point) => Math.max(highest, point.sales, point.purchase, point.collection), 0),
      ),
    [trendChartData],
  );
  const movementChartData = useMemo(() => {
    if (!dashboardData) {
      return [];
    }

    if (movementRange.preset === "monthly") {
      return monthlyMovementData;
    }

    const { startDate, endDate } = resolveRangeBounds(movementRange, rangeEndDate);
    const filteredTransactions = sortedTransactions.filter((voucher) => voucher.voucherDate >= startDate && voucher.voucherDate <= endDate);

    // No real vouchers fell in this range — the honest total is zero, not a
    // guess scaled off today's numbers.
    if (!filteredTransactions.length) {
      return monthlyMovementData.map((entry) => ({
        ...entry,
        change: getRangeLabel(movementRange.preset),
        value: 0,
      }));
    }

    const totals = {
      sales: 0,
      purchase: 0,
      receipt: 0,
      payment: 0,
    };

    filteredTransactions.forEach((voucher) => {
      if (voucher.voucherType === "sales") {
        totals.sales += Number(voucher.amount || 0);
      } else if (voucher.voucherType === "purchase") {
        totals.purchase += Number(voucher.amount || 0);
      } else if (voucher.voucherType === "receipt") {
        totals.receipt += Number(voucher.amount || 0);
      } else if (voucher.voucherType === "payment") {
        totals.payment += Number(voucher.amount || 0);
      }
    });

    return movementMetricIds.map((metricId) => ({
      ...monthlyMovementData.find((entry) => entry.name.toLowerCase() === metricId) ?? {
        name: metricId[0].toUpperCase() + metricId.slice(1),
        change: getRangeLabel(movementRange.preset),
        color: movementChartColors[metricId],
      },
      value: totals[metricId],
      color: movementChartColors[metricId],
    }));
  }, [dashboardData, monthlyMovementData, movementRange, rangeEndDate, sortedTransactions]);
  void movementChartData;
  const metricTargets: Record<string, { href: string; description: string }> = {
    receivable: {
      href: `${buildWorkspaceRoute(mode, "/reports/account-receivable")}`,
      description: "Current customer receivable balance",
    },
    payable: {
      href: `${buildWorkspaceRoute(mode, "/reports/account-payable")}`,
      description: "Current supplier payable balance",
    },
    sales: {
      href: `${buildWorkspaceRoute(mode, "/day-book")}?voucherType=sales`,
      description: "Today's sales vouchers in Day Book",
    },
    purchase: {
      href: `${buildWorkspaceRoute(mode, "/day-book")}?voucherType=purchase`,
      description: "Today's purchase vouchers in Day Book",
    },
    receipt: {
      href: `${buildWorkspaceRoute(mode, "/day-book")}?voucherType=receipt`,
      description: "Today's receipt vouchers in Day Book",
    },
    payment: {
      href: `${buildWorkspaceRoute(mode, "/day-book")}?voucherType=payment`,
      description: "Today's payment vouchers in Day Book",
    },
    cash: {
      href: `${buildWorkspaceRoute(mode, "/reports/trial-balance")}`,
      description: "Cash in hand, bank balance, and their combined total",
    },
    bank: {
      href: `${buildWorkspaceRoute(mode, "/utilities/bank-accounts")}`,
      description: "Current bank account balance",
    },
    cashAndBank: {
      href: `${buildWorkspaceRoute(mode, "/reports/trial-balance")}`,
      description: "Combined cash-in-hand and bank account balance",
    },
  };
  const metricManageTargets: Record<string, { href: string; label: string }> = {
    receivable: { href: buildWorkspaceRoute(mode, "/masters/customers"), label: "Manage customers" },
    payable: { href: buildWorkspaceRoute(mode, "/masters/suppliers"), label: "Manage suppliers" },
    sales: { href: buildVoucherRoute(mode, "sales"), label: "Add sale" },
    purchase: { href: buildVoucherRoute(mode, "purchase"), label: "Add purchase" },
    receipt: { href: buildVoucherRoute(mode, "receipt"), label: "Add receipt" },
    payment: { href: buildVoucherRoute(mode, "payment"), label: "Add payment" },
    cash: { href: `${buildWorkspaceRoute(mode, "/utilities/cash-in-hand")}?account=main`, label: "Adjust cash" },
    emi: { href: `${buildWorkspaceRoute(mode, "/utilities/loan-accounts")}?create=1`, label: "Manage EMI" },
  };
  const selectedMetric = selectedMetricId && selectedMetricId !== "emi"
    ? dashboardData?.metrics.find((metric) => metric.id === selectedMetricId) ?? null
    : null;
  const selectedMetricTarget = selectedMetricId === "emi"
    ? {
        href: buildWorkspaceRoute(mode, "/utilities/loan-accounts"),
        description: "Upcoming EMI, supplier, and other scheduled payments based on current records.",
      }
    : selectedMetricId
      ? metricTargets[selectedMetricId]
      : null;
  const selectedMetricTitle = selectedMetricId === "emi" ? "Upcoming Dues" : selectedMetric?.label ?? "KPI details";
  const supplierDueSoon = dashboardData?.metrics.find((metric) => metric.id === "payable")?.attention;
  // Single source for the Upcoming Dues card. A lone due gets an amount-first
  // layout that fills the card; two or more stay in the compact list.
  const upcomingDueRows: Array<{ key: string; label: string; amount: number; dueDate: string | null }> = [];
  if (emiReminder.nextDueDate) {
    upcomingDueRows.push({ key: "emi", label: "EMI", amount: emiReminder.nextAmount, dueDate: emiReminder.nextDueDate });
  }
  if (supplierDueSoon?.count) {
    const supplierLabel = formatEntityCountLabel(supplierDueSoon.count, supplierDueSoon.entityLabel);
    upcomingDueRows.push({
      key: "supplier",
      label: supplierDueSoon.count > 1 ? `${supplierDueSoon.count} ${supplierLabel}` : supplierLabel,
      amount: supplierDueSoon.value,
      dueDate: supplierDueSoon.nextDueDate ?? null,
    });
  }
  if (otherPaymentReminder.count) {
    upcomingDueRows.push({ key: "other", label: "Other Payment", amount: otherPaymentReminder.amount, dueDate: otherPaymentReminder.nextDueDate ?? null });
  }
  const hasUpcomingDues = upcomingDueRows.length > 0;
  const soleUpcomingDue = upcomingDueRows.length === 1 ? upcomingDueRows[0] : null;
  const emiTone = emiReminder.overdue
    ? {
        iconBackground: "#feeceb",
        color: "#bd3028",
        labelColor: "#8f332e",
        badgeLabel: "Overdue",
      }
    : emiReminder.dueSoon || supplierDueSoon?.count || otherPaymentReminder.count
      ? {
          iconBackground: "#fff2df",
          color: "#ad6100",
          labelColor: "#8b5a17",
          badgeLabel: "Due soon",
        }
      : emiReminder.activeLoans
        ? {
            iconBackground: "#e9f7ef",
            color: "#18794e",
            labelColor: "#39715a",
            badgeLabel: "On track",
          }
        : {
            iconBackground: "#f1f4f7",
            color: "#64748b",
            labelColor: "#64748b",
            badgeLabel: "All Clear",
          };

  // Needs Attention answers "what is already broken", so it deliberately drops the
  // supplier/EMI due-soon figures the Upcoming Dues card above already carries.
  // Rows with a real count float to the top; the rest stay visible but dimmed, so the
  // panel keeps a stable height and still says what is being watched.
  const overdueReceivable = dashboardData?.metrics.find((metric) => metric.id === "receivable")?.attention;
  const overdueReceivableCount = overdueReceivable?.count ?? 0;
  const overdueReceivableValue = overdueReceivable?.value ?? 0;
  const attentionItems = useMemo(() => {
    const rows = [
      { key: "receivable", dot: "#d74343", label: "Overdue Receivables", count: overdueReceivableCount, amount: overdueReceivableValue, href: buildWorkspaceRoute(mode, "/reports/account-receivable") },
      { key: "bounced", dot: "#d74343", label: "Bounced Cheques", count: chequeAlerts.bounced, amount: 0, href: buildWorkspaceRoute(mode, "/utilities/cheques") },
      { key: "emi", dot: "#d74343", label: "EMI Overdue", count: emiReminder.overdue, amount: 0, href: buildWorkspaceRoute(mode, "/utilities/loan-accounts") },
      { key: "cheque-past-due", dot: "#e69322", label: "Cheques Past Due", count: chequeAlerts.pastDue, amount: 0, href: buildWorkspaceRoute(mode, "/utilities/cheques") },
      { key: "out-of-stock", dot: "#e69322", label: "Out of Stock", count: outOfStockCount, amount: 0, href: buildWorkspaceRoute(mode, "/masters/inventory") },
      { key: "low-stock", dot: "#d5a018", label: "Low Stock Items", count: lowStockCount, amount: 0, href: buildWorkspaceRoute(mode, "/masters/inventory") },
    ];
    return [...rows].sort((left, right) => (right.count > 0 ? 1 : 0) - (left.count > 0 ? 1 : 0));
  }, [chequeAlerts.bounced, chequeAlerts.pastDue, emiReminder.overdue, lowStockCount, mode, outOfStockCount, overdueReceivableCount, overdueReceivableValue]);
  const attentionTotal = attentionItems.reduce((sum, item) => sum + item.count, 0);

  useEffect(() => {
    if (transactionsPage > totalTransactionPages) {
      setTransactionsPage(totalTransactionPages);
    }
  }, [totalTransactionPages, transactionsPage]);

  if (!session || query.isLoading) {
    return <LoadingPanel lines={6} />;
  }

  if (query.error || !dashboardData) {
    return (
      <ErrorPanel
        title="Dashboard unavailable"
        description="The owner dashboard could not be loaded in the current data mode."
        onRetry={() => query.refetch()}
      />
    );
  }

  return (
    <m.div
      initial="hidden"
      animate="show"
      variants={pageStaggerVariants}
      className="w-full max-w-full space-y-2 xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:space-y-1.5"
    >
      <m.div
        variants={pageItemVariants}
        className="grid auto-rows-fr grid-cols-2 gap-[clamp(4px,-2px+0.63vw,10px)] md:flex-none md:grid-cols-4 xl:auto-rows-[clamp(100px,14.5vh,136px)]"
      >
        {visibleMetrics.map((metric, index) => {
          const palette = metricCardStyles[metric.id] ?? defaultMetricPalette;
          const target = metricTargets[metric.id];
          const MetricIcon = metricCardIcons[metric.id] ?? defaultMetricIcon;
          const isCashSummary = metric.id === "cash";
          const isAttentionMetric = metric.id === "receivable" || metric.id === "payable";
          const bankValue = isCashSummary ? dashboardData.metrics.find((entry) => entry.id === "bank")?.value ?? 0 : 0;
          const mfsValue = isCashSummary ? dashboardData.metrics.find((entry) => entry.id === "mfs")?.value ?? 0 : 0;
          const cashAndBankValue = isCashSummary ? dashboardData.metrics.find((entry) => entry.id === "cashAndBank")?.value ?? 0 : 0;

          return (
            <m.div
              key={metric.id}
            >
	            <Card
                className="relative flex h-full min-h-[clamp(82px,min(12.3vh,34px+4.2vw),116px)] flex-col cursor-pointer overflow-hidden rounded-none transition-transform"
                style={{
                  background: "#ffffff",
                  backgroundColor: "#ffffff",
                  backgroundImage: "none",
                  filter: "none",
                  backdropFilter: "none",
                  border: "1px solid #e8edf3",
                  borderRadius: 0,
                  boxShadow: "0 1px 2px rgba(15,23,42,0.025), 0 8px 22px -14px rgba(15,23,42,0.12)",
                }}
                role="button"
                tabIndex={0}
                aria-label={target?.description ?? `Open ${metric.label}`}
                onClick={() => setSelectedMetricId(metric.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedMetricId(metric.id);
                  }
                }}
              >
	                <CardHeader className="items-center gap-[clamp(4px,-1px+0.55vw,8px)] px-[clamp(8px,0px+0.78vw,14px)] py-[clamp(6px,1.2vh,11px)]">
                  <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                    <div
                      className="flex h-[clamp(27px,10px+1.45vw,38px)] w-[clamp(27px,10px+1.45vw,38px)] shrink-0 items-center justify-center rounded-[11px]"
                      style={{ backgroundColor: palette.badgeBackground, color: palette.badgeColor }}
                      aria-hidden
                    >
                      <MetricIcon className="h-[clamp(15px,6px+0.9vw,23px)] w-[clamp(15px,6px+0.9vw,23px)] stroke-[2.2]" />
                    </div>
                    <CardDescription
                      className="truncate text-[clamp(10px,6px+0.38vw,13px)] font-medium leading-4"
                      style={{ color: palette.labelColor }}
                    >
                      {isCashSummary ? "Cash, Bank & MFS" : metric.label}
                    </CardDescription>
                  </div>
                  {metric.monthValue !== undefined ? (
                    <div
                      className="hidden shrink-0 items-center gap-0.5 rounded-full border p-0.5 xl:flex"
                      style={{ backgroundColor: "#ffffff", borderColor: `${palette.badgeColor}33`, boxShadow: "0 1px 2px rgba(15,23,42,0.08)" }}
                    >
                      {(["today", "month"] as const).map((period) => {
                        const isActive = (metricPeriod[metric.id] ?? "today") === period;
                        return (
                          <button
                            key={period}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setMetricPeriod((current) => ({ ...current, [metric.id]: period }));
                            }}
                            className={cn(
                              "cursor-pointer rounded-full px-2 py-0.5 text-[clamp(7.5px,5px+0.23vw,9.5px)] font-semibold transition",
                              isActive ? "shadow-sm" : "opacity-60 hover:opacity-100",
                            )}
                            style={{
                              backgroundColor: isActive ? palette.badgeColor : "transparent",
                              color: isActive ? "#ffffff" : palette.badgeColor,
                            }}
                          >
                            {period === "today" ? "Today" : "This Month"}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <m.div
                      className="hidden shrink-0 rounded-full px-2 py-0.5 text-[clamp(7.5px,5px+0.23vw,9.5px)] font-semibold xl:block"
                      style={{
                        backgroundColor: "#ffffff",
                        border: `1px solid ${palette.badgeColor}33`,
                        boxShadow: "0 1px 2px rgba(15,23,42,0.08)",
                        color: palette.badgeColor,
                      }}
                    >
                      {metric.change}
                    </m.div>
                  )}
                </CardHeader>
		                <CardContent className="relative flex flex-1 flex-col justify-center px-[clamp(8px,0px+0.78vw,14px)] pb-[clamp(6px,1.25vh,12px)]">
                  {isCashSummary ? (
                    <div>
                      <div className="text-[clamp(8.5px,5px+0.3vw,10.5px)] font-semibold uppercase tracking-wide" style={{ color: palette.labelColor }}>Available Balance</div>
                      <div className="mt-0.5 tabular-nums text-[clamp(1.14rem,0.8rem+0.46vw,1.48rem)] font-semibold leading-tight tracking-tight" style={{ color: palette.textColor }}>
                        {formatCurrency(cashAndBankValue)}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1 text-[clamp(8px,5px+0.28vw,10px)] font-medium leading-4" style={{ color: palette.labelColor }}>
                        <span>Cash</span>
                        <span
                          ref={(node) => {
                            metricValueRefs.current[index] = node;
                          }}
                          className="tabular-nums font-semibold"
                          style={{ color: palette.textColor }}
                        >
                          {formatCurrency(metric.value)}
                        </span>
                        <span aria-hidden>·</span><span>Bank</span><strong className="tabular-nums" style={{ color: palette.textColor }}>{formatCurrency(bankValue)}</strong>
                        <span aria-hidden>·</span><span>MFS</span><strong className="tabular-nums" style={{ color: palette.textColor }}>{formatCurrency(mfsValue)}</strong>
                      </div>
                    </div>
                  ) : isAttentionMetric ? (
                    <div>
                      <div
                        ref={(node) => {
                          metricValueRefs.current[index] = node;
                        }}
                        className="overflow-hidden text-left tabular-nums text-[clamp(1.14rem,0.8rem+0.46vw,1.48rem)] font-semibold leading-tight tracking-tight"
                        style={{ color: palette.textColor }}
                      >
                        {formatCurrency(metric.value)}
                      </div>
                      <div className="mt-1 truncate text-left text-[clamp(8.5px,5px+0.3vw,10.5px)] font-semibold leading-4" style={{ color: metric.attention?.value ? "#b45309" : palette.labelColor }}>
                        {metric.attention?.label ?? (metric.id === "receivable" ? "Overdue" : "Due Soon")} {formatCurrency(metric.attention?.value ?? 0)} · {metric.attention?.count ?? 0} {formatEntityCountLabel(metric.attention?.count ?? 0, metric.attention?.entityLabel ?? (metric.id === "receivable" ? "Customers" : "Suppliers"))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        ref={(node) => {
                          metricValueRefs.current[index] = node;
                        }}
	                        className="overflow-hidden text-left tabular-nums text-[clamp(1.14rem,0.8rem+0.46vw,1.48rem)] font-semibold leading-tight tracking-tight"
                        style={{ color: palette.textColor }}
                      >
                        {formatCurrency(metric.value)}
                      </div>
                      <div className="mt-0.5 truncate text-left text-[clamp(8.5px,5px+0.3vw,10.5px)] font-medium leading-4" style={{ color: palette.labelColor }}>
                        {metric.monthValue !== undefined
                          ? (metricPeriod[metric.id] ?? "today") === "month"
                            ? (target?.description ?? "").replace("Today's", "This month's")
                            : target?.description
                          : (target?.description ?? "Open details")}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </m.div>
          );
        })}
        <m.div>
          <Card
            className="relative flex h-full min-h-[clamp(82px,min(12.3vh,34px+4.2vw),116px)] cursor-pointer flex-col overflow-hidden rounded-none transition-transform"
            style={{
              background: "#ffffff",
              backgroundColor: "#ffffff",
              backgroundImage: "none",
              filter: "none",
              backdropFilter: "none",
              border: "1px solid #e8edf3",
              borderRadius: 0,
              boxShadow: "0 1px 2px rgba(15,23,42,0.025), 0 8px 22px -14px rgba(15,23,42,0.12)",
            }}
            role="button"
            tabIndex={0}
            aria-label="Open upcoming dues"
            onClick={() => setSelectedMetricId("emi")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedMetricId("emi");
              }
            }}
          >
            <CardHeader className="items-center gap-[clamp(4px,-1px+0.55vw,8px)] px-[clamp(8px,0px+0.78vw,14px)] py-[clamp(6px,1.2vh,11px)]">
              <div className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                <div
                  className="flex h-[clamp(27px,10px+1.45vw,38px)] w-[clamp(27px,10px+1.45vw,38px)] shrink-0 items-center justify-center rounded-[11px]"
                  style={{ backgroundColor: emiTone.iconBackground, color: emiTone.color }}
                >
                  <CalendarClock className="h-[clamp(15px,6px+0.9vw,23px)] w-[clamp(15px,6px+0.9vw,23px)] stroke-[2.2]" />
                </div>
                <CardDescription
                  className="truncate text-[clamp(10px,6px+0.38vw,13px)] font-medium leading-4"
                  style={{ color: emiTone.labelColor }}
                >
                  Upcoming Dues
                </CardDescription>
              </div>
              <span
                className="hidden shrink-0 rounded-full px-2 py-0.5 text-[clamp(7.5px,5px+0.23vw,9.5px)] font-semibold xl:block"
                style={{ backgroundColor: "#ffffff", border: `1px solid ${emiTone.color}33`, boxShadow: "0 1px 2px rgba(15,23,42,0.08)", color: emiTone.color }}
              >
                {emiTone.badgeLabel}
              </span>
            </CardHeader>
            <CardContent className="relative flex flex-1 flex-col justify-center px-[clamp(8px,0px+0.78vw,14px)] pb-[clamp(6px,1.25vh,12px)] text-left">
              {soleUpcomingDue ? (
                <div>
                  <div className="truncate tabular-nums text-[clamp(1.08rem,0.78rem+0.42vw,1.4rem)] font-semibold leading-tight tracking-tight text-[#263852]">
                    {formatCurrency(soleUpcomingDue.amount)}
                  </div>
                  <div className="mt-0.5 truncate text-[clamp(9px,5px+0.32vw,11.5px)] font-medium leading-4" style={{ color: emiTone.labelColor }}>
                    {soleUpcomingDue.label} · {soleUpcomingDue.dueDate ? `Due ${formatDate(soleUpcomingDue.dueDate)}` : "Due soon"}
                  </div>
                </div>
              ) : hasUpcomingDues ? (
                <div className="space-y-1 text-[clamp(8.5px,5px+0.3vw,10.5px)] leading-4 text-[#5d6e86]">
                  {upcomingDueRows.map((row) => (
                    <div key={row.key} className="truncate">
                      <strong className="text-[#263852]">{row.label}</strong> — {row.dueDate ? formatDate(row.dueDate) : "Due soon"} · <span className="tabular-nums font-semibold text-[#263852]">{formatCurrency(row.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div>
                  <div className="text-[clamp(1.08rem,0.78rem+0.42vw,1.4rem)] font-semibold leading-tight tracking-tight text-[#18794e]">All Clear ✓</div>
                  <div className="mt-0.5 text-[clamp(8.5px,5px+0.3vw,10.5px)] font-medium italic leading-4 text-[#64748b]">No payments due soon.</div>
                </div>
              )}
            </CardContent>
          </Card>
        </m.div>
      </m.div>
      <div className="grid items-stretch gap-[clamp(4px,-2px+0.63vw,10px)] xl:min-h-0 xl:flex-1 xl:grid-cols-[minmax(0,1.12fr)_minmax(340px,0.88fr)]">
        <m.div variants={pageItemVariants} className="flex flex-col gap-[clamp(4px,-2px+0.63vw,10px)] xl:h-full xl:min-h-0">
          <Card className="relative overflow-hidden xl:flex xl:flex-[1.05] xl:flex-col xl:overflow-visible">
	            <CardHeader className="relative flex-col gap-1 px-[clamp(9px,3px+0.55vw,14px)] py-[clamp(6px,2px+0.31vw,9px)] sm:flex-row sm:items-start sm:justify-between">
	              <div>
	                <CardTitle className="flex items-baseline gap-1.5 text-[clamp(0.85rem,0.52rem+0.03125vw,1.12rem)]">
	                  {getTrendTitle(trendRange.preset)}
	                  <span className="text-[clamp(8.5px,5px+0.3125vw,11px)] font-semibold uppercase tracking-wide text-muted">BDT</span>
	                </CardTitle>
	                <div className="mt-1.5 flex flex-wrap gap-1.5 text-[clamp(8.5px,5px+0.3125vw,11px)] text-muted">
	                  <span className="rounded-full bg-[#eef8f2] px-2.5 py-0.5 font-medium text-[#14804a]">Sales Momentum</span>
	                  <span className="rounded-full bg-[#fff2e2] px-2.5 py-0.5 font-medium text-[#ca7a0a]">Purchase Pace</span>
                  <span className="rounded-full bg-[#eaf1ff] px-2.5 py-0.5 font-medium text-[#2563eb]">Collection</span>
	                </div>
	              </div>
	              <ChartRangeSelector
                  value={trendRange}
                  minDate={earliestTransactionDate}
                  maxDate={dashboardTodayDate}
                  customOpen={trendCustomOpen}
                  onPresetChange={(preset) => {
                    setTrendCustomOpen(false);
                    setTrendCustomTouched({ start: false, end: false });
                    setTrendRange((current) => ({ ...current, preset, lastPreset: preset }));
                  }}
                  onCustomToggle={() => {
                    setTrendRange((current) => ({ ...current, preset: "custom" }));
                    setTrendCustomOpen((current) => {
                      const nextOpen = !current;
                      if (nextOpen) {
                        setTrendCustomTouched({ start: false, end: false });
                      }
                      return nextOpen;
                    });
                  }}
                  onCustomStartDateChange={(customStartDate) => {
                    setTrendRange((current) => ({ ...current, preset: "custom", customStartDate }));
                    setTrendCustomTouched((current) => ({ ...current, start: isDashboardDateComplete(customStartDate) || current.start }));
                  }}
                  onCustomEndDateChange={(customEndDate) => {
                    setTrendRange((current) => ({ ...current, preset: "custom", customEndDate }));
                    setTrendCustomTouched((current) => {
                      const nextTouched = { ...current, end: isDashboardDateComplete(customEndDate) || current.end };
                      if (nextTouched.start && nextTouched.end) {
                        setTrendCustomOpen(false);
                      }
                      return nextTouched;
                    });
                  }}
                />
	            </CardHeader>
	            <CardContent className="h-[clamp(178px,26vh,290px)] pl-1 pr-1 pb-2 sm:pl-2 sm:pr-2 sm:pb-2 xl:h-auto xl:min-h-0 xl:flex-1">
              <div className="dashboard-chart h-full w-full overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
	                  <AreaChart data={trendChartData} margin={{ left: 0, right: 2, top: 10, bottom: 6 }}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#14804a" stopOpacity={0.32} />
                        <stop offset="95%" stopColor="#14804a" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="purchaseGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#d78a16" stopOpacity={0.22} />
                        <stop offset="95%" stopColor="#d78a16" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="collectionGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.24} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="#edf2f0" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
	                      padding={{ left: 2, right: 1 }}
                      tick={{ fill: "#61738f", fontSize: 12 * chartScale }}
                    />
                    <YAxis
	                      width={Math.round(42 * chartScale)}
	                      tickLine={false}
	                      axisLine={false}
	                      tick={{ fill: "#7b8aa3", fontSize: 10.5 * chartScale }}
	                      tickMargin={4}
                      tickFormatter={(value: number) => formatChartAxisAmount(Number(value ?? 0))}
                      domain={trendAxisScale.domain}
                      ticks={trendAxisScale.ticks}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "18px",
                        border: "1px solid #d9e5db",
                        boxShadow: "0 20px 45px rgba(15, 23, 42, 0.08)",
                      }}
                      labelStyle={{ color: "#5d6d86", fontWeight: 600 }}
                      formatter={(value, name) => [
                        formatCurrency(Number(value ?? 0)),
                        name === "sales" ? "Sales" : name === "purchase" ? "Purchase" : "Collection",
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="sales"
                      stroke="#14804a"
                      fill="url(#salesGradient)"
                      strokeWidth={2.2}
                      activeDot={{ r: 4, fill: "#14804a", stroke: "#ffffff", strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="purchase"
                      stroke="#d78a16"
                      fill="url(#purchaseGradient)"
                      strokeWidth={2.1}
                      activeDot={{ r: 4, fill: "#d78a16", stroke: "#ffffff", strokeWidth: 2 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="collection"
                      stroke="#2563eb"
                      fill="url(#collectionGradient)"
                      strokeWidth={2.1}
                      activeDot={{ r: 4, fill: "#2563eb", stroke: "#ffffff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
	          <Card className="overflow-hidden xl:flex xl:flex-[0.95] xl:flex-col">
	            <CardHeader className="px-[clamp(10px,4px+0.55vw,14px)] py-[clamp(5px,2px+0.25vw,7px)]">
	              <CardTitle className="text-[clamp(0.85rem,0.52rem+0.03125vw,1.12rem)]">Transaction Overview</CardTitle>
	            </CardHeader>
	            <CardContent className="grid min-h-[clamp(150px,19.1vh,180px)] flex-1 gap-0 p-0 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <div className="flex flex-col justify-start border-b border-[#edf1f5] px-[clamp(10px,0.9vw,16px)] py-2 sm:border-b-0 sm:border-r">
                  <div className="mb-2 text-[clamp(10px,7px+0.3vw,12px)] font-semibold uppercase tracking-[0.12em] text-[#74839a]">Cash In vs Cash Out</div>
                  {[
                    { label: "Receipt", value: dashboardData.metrics.find((metric) => metric.id === "receipt")?.monthValue ?? 0, color: "#238b5c", bg: "#e9f7ef", icon: ArrowDownToLine, href: `${buildWorkspaceRoute(mode, "/day-book")}?voucherType=receipt` },
                    { label: "Payment", value: dashboardData.metrics.find((metric) => metric.id === "payment")?.monthValue ?? 0, color: "#cf5e78", bg: "#fff0f4", icon: ArrowUpFromLine, href: `${buildWorkspaceRoute(mode, "/day-book")}?voucherType=payment` },
                  ].map((entry) => {
                    const Icon = entry.icon;
                    const receipt = dashboardData.metrics.find((metric) => metric.id === "receipt")?.monthValue ?? 0;
                    const payment = dashboardData.metrics.find((metric) => metric.id === "payment")?.monthValue ?? 0;
                    const maxCashflow = Math.max(receipt, payment, 1);
                    // A genuinely zero amount draws no bar at all. The 4% floor
                    // only protects a real-but-tiny value from disappearing - it
                    // must never paint a sliver next to "BDT 0.00".
                    const barValue = roundMoney(entry.value);
                    const barWidth = barValue <= 0 ? 0 : Math.min(100, Math.max(4, (barValue / maxCashflow) * 100));
                    return (
                      <button key={entry.label} type="button" onClick={() => router.push(entry.href)} className="group mb-2 text-left last:mb-0" aria-label={`Open ${entry.label} transactions`}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-[clamp(11px,8px+0.32vw,13px)] font-semibold text-[#53647c]">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ color: entry.color, backgroundColor: entry.bg }}><Icon className="h-4 w-4" /></span>
                            {entry.label}
                          </span>
                          <strong className="tabular-nums text-[clamp(0.95rem,0.7rem+0.45vw,1.25rem)] text-[#20324d]">{formatCurrency(entry.value)}</strong>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#eef2f6]"><div className="h-full rounded-full transition-all group-hover:brightness-95" style={{ width: `${barWidth}%`, backgroundColor: entry.color }} /></div>
                      </button>
                    );
                  })}
                </div>
                <div data-dashboard-attention-panel className="bg-[#fffdfb] px-[clamp(10px,0.9vw,16px)] py-2">
                  <div className="mb-1 flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-[#27364d]"><AlertTriangle className={"h-4 w-4 " + (attentionTotal > 0 ? "text-[#d25b4b]" : "text-[#94a3b8]")} /> Needs Attention</div>
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-bold " + (attentionTotal > 0 ? "bg-[#feeeeb] text-[#c6473a]" : "bg-[#e9f7ef] text-[#18794e]")}>{attentionTotal > 0 ? attentionTotal : "All clear"}</span>
                  </div>
                  <div data-dashboard-attention-list className="space-y-0.5">
                    {attentionItems.map((item) => (
                      <button key={item.key} type="button" onClick={() => router.push(item.href)} className="group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white hover:shadow-[0_2px_10px_rgba(31,41,55,0.06)]">
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.count > 0 ? item.dot : "#cbd5e1" }} />
                        <span className={"min-w-0 flex-1 truncate text-[clamp(10px,7px+0.3vw,12.5px)] " + (item.count > 0 ? "font-medium text-[#52627a]" : "text-[#9aa6b6]")}>
                          <strong className={item.count > 0 ? "text-[#263750]" : "font-medium text-[#9aa6b6]"}>{item.count}</strong> {item.label}
                          {item.count > 0 && item.amount > 0 ? <> — <strong className="tabular-nums text-[#263750]">{formatCurrency(item.amount)}</strong></> : null}
                        </span>
                        <ArrowRight className={"h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-[#52627a] " + (item.count > 0 ? "text-[#9aa6b6]" : "text-[#cbd5e1]")} />
                      </button>
                    ))}
                  </div>
                </div>
            </CardContent>
          </Card>
        </m.div>
	        <m.div variants={pageItemVariants} className="min-w-0 self-start overflow-hidden xl:h-full xl:min-h-0 xl:self-stretch">
	          <Card className="min-w-0 overflow-hidden xl:flex xl:h-full xl:flex-col">
            <CardHeader className="px-[clamp(10px,4px+0.63vw,16px)] py-[clamp(6px,2px+0.31vw,9px)]">
              <CardTitle className="text-[clamp(0.85rem,0.52rem+0.03125vw,1.12rem)]">Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent
              ref={transactionsScrollRef}
	              className="transient-scrollbar h-[clamp(230px,42vh,460px)] min-w-0 overflow-x-hidden overflow-y-auto px-[clamp(10px,4px+0.63vw,16px)] pb-0 xl:h-auto xl:min-h-0 xl:flex-1"
            >
              <table className="w-full min-w-[580px] table-fixed border-collapse text-[clamp(9.5px,5.5px+0.39vw,13px)]">
                <colgroup>
                  <col style={{ width: "16%" }} />
    <col style={{ width: "31%" }} />
    <col style={{ width: "21%" }} />
    <col style={{ width: "32%" }} />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-white">
                  <tr className="h-8 border-b border-border text-left text-[clamp(8.5px,4.5px+0.39vw,12px)] font-semibold uppercase tracking-wide text-[#5f6f86]">
                    <th className="h-8 whitespace-nowrap py-0 pr-2 font-semibold">Date</th>
                    <th className="h-8 whitespace-nowrap py-0 pr-2 font-semibold">Transaction Number</th>
                    <th className="h-8 whitespace-nowrap py-0 pr-2 font-semibold">Transaction Type</th>
                    <th className="h-8 whitespace-nowrap py-0 pl-2 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRecentTransactions.slice(0, RECENT_TRANSACTIONS_PER_PAGE).map((voucher) => (
                    <m.tr
                      key={voucher.id}
                      role="button"
                      tabIndex={0}
                      className="h-8 cursor-pointer border-b border-border/60"
                      whileHover={shouldReduceMotion ? undefined : { backgroundColor: "#f3f8f5" }}
                      onClick={() => router.push(getRecentTransactionHref(voucher))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          router.push(getRecentTransactionHref(voucher));
                        }
                      }}
                    >
                      <td className="h-8 overflow-hidden text-ellipsis whitespace-nowrap py-0 pr-2 text-[#5b6880]">{formatDate(voucher.voucherDate)}</td>
                      <td className="h-8 truncate py-0 pr-2 font-medium text-[#43526b]">{voucher.voucherNumber}</td>
                      <td className="h-8 overflow-hidden text-ellipsis whitespace-nowrap py-0 pr-2 capitalize text-[#20324f]">{getRecentTransactionTypeLabel(voucher)}</td>
                      <td className="h-8 overflow-hidden text-ellipsis whitespace-nowrap py-0 pl-2 text-right font-semibold tabular-nums text-[#223555]">{formatCurrency(voucher.amount)}</td>
                    </m.tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
            <TablePagination
              dense
              className="h-7 min-h-7 border-t-0 px-[clamp(10px,4px+0.63vw,16px)] py-0 text-[clamp(9.5px,5.5px+0.39vw,13px)]"
              page={transactionsPage}
              pageSize={transactionsPageSize}
              totalItems={dashboardData.recentTransactions.length}
              summary={`Showing ${pagedRecentTransactions.length} transactions on this page · Total ${dashboardData.recentTransactions.length}`}
              pageSizeOptions={[transactionsPageSize]}
              onPageChange={setTransactionsPage}
              onPageSizeChange={() => setTransactionsPage(1)}
              showPageSizeSelector={false}
              showPageIndicator={false}
              iconOnlyNavigation
            />
          </Card>
        </m.div>
      </div>
      <Dialog open={Boolean(selectedMetricId)} onOpenChange={(open) => !open && setSelectedMetricId(null)}>
        <DialogContent className="w-[min(92vw,620px)] rounded-[22px] border-[#dfe7f1] p-0 shadow-[0_28px_70px_rgba(15,23,42,0.22)]">
          <div className="border-b border-[#e7edf5] bg-[#f8fbff] px-6 py-5 pr-14">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#eaf2ff] text-[#2867c9]">
                {selectedMetricId === "emi" ? <CalendarClock className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <DialogTitle className="truncate text-xl font-semibold text-[#1c2f4d]">{selectedMetricTitle}</DialogTitle>
                <DialogDescription className="mt-0.5 text-sm text-[#687a94]">
                  {selectedMetricTarget?.description ?? "Current workspace KPI details."}
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="px-6 py-5">
            <div className="flex items-end justify-between gap-4 border-b border-[#e9eef5] pb-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8290a5]">Current status</div>
                <div className="mt-1 text-[28px] font-semibold leading-none tracking-tight text-[#1d304e]">
                  {selectedMetricId === "emi"
                    ? emiReminder.overdue
                      ? `${emiReminder.overdue} overdue`
                      : emiReminder.dueSoon
                        ? `${emiReminder.dueSoon} due soon`
                        : supplierDueSoon?.count || otherPaymentReminder.count
                          ? `${(supplierDueSoon?.count ?? 0) + otherPaymentReminder.count} due soon`
                          : emiReminder.activeLoans
                          ? `${emiReminder.activeLoans} active loan${emiReminder.activeLoans === 1 ? "" : "s"}`
                          : "All Clear ✓"
                    : formatCurrency(selectedMetric?.value ?? 0)}
                </div>
              </div>
              <span className="rounded-full bg-[#edf5ff] px-3 py-1 text-xs font-semibold text-[#2867c9]">
                {selectedMetricId === "emi"
                  ? emiReminder.overdue
                    ? "Action required"
                    : emiReminder.dueSoon || supplierDueSoon?.count || otherPaymentReminder.count
                      ? "Due within 7 days"
                      : "On track"
                  : selectedMetric?.change ?? "Current balance"}
              </span>
            </div>

            <div className="divide-y divide-[#edf1f6] py-2 text-sm">
              {selectedMetricId === "cash" ? (
                <>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Cash in Hand</span><strong className="tabular-nums text-[#203451]">{formatCurrency(dashboardData.metrics.find((entry) => entry.id === "cash")?.value ?? 0)}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Bank Balance</span><strong className="tabular-nums text-[#203451]">{formatCurrency(dashboardData.metrics.find((entry) => entry.id === "bank")?.value ?? 0)}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>MFS Balance</span><strong className="tabular-nums text-[#203451]">{formatCurrency(dashboardData.metrics.find((entry) => entry.id === "mfs")?.value ?? 0)}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Total Cash, Bank &amp; MFS</span><strong className="tabular-nums text-[#203451]">{formatCurrency(dashboardData.metrics.find((entry) => entry.id === "cashAndBank")?.value ?? 0)}</strong></div>
                </>
              ) : selectedMetricId === "emi" ? (
                <>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Active loan accounts</span><strong className="text-[#203451]">{emiReminder.activeLoans}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Due within 7 days</span><strong className="text-[#ad6100]">{emiReminder.dueSoon}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Overdue installments</span><strong className="text-[#bd3028]">{emiReminder.overdue}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Next installment</span><strong className="text-[#203451]">{emiReminder.nextDueDate ? formatDate(emiReminder.nextDueDate) : "Not scheduled"}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Supplier payments due soon</span><strong className="tabular-nums text-[#203451]">{supplierDueSoon?.count ? formatCurrency(supplierDueSoon.value) : "None"}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Other payments due soon</span><strong className="tabular-nums text-[#203451]">{otherPaymentReminder.count ? formatCurrency(otherPaymentReminder.amount) : "None"}</strong></div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Reporting basis</span><strong className="text-[#203451]">{selectedMetric?.change ?? "Current balance"}</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Workspace currency</span><strong className="text-[#203451]">BDT</strong></div>
                  <div className="flex items-center justify-between py-3 text-[#556984]"><span>Last refreshed</span><strong className="text-[#203451]">Today</strong></div>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e7edf5] bg-[#fbfcfe] px-6 py-4">
            <Button variant="outline" onClick={() => setSelectedMetricId(null)}>Close</Button>
            {selectedMetricId && metricManageTargets[selectedMetricId] ? (
              <Button
                variant="outline"
                onClick={() => {
                  const target = metricManageTargets[selectedMetricId];
                  setSelectedMetricId(null);
                  router.push(target.href);
                }}
              >
                <PencilLine className="h-4 w-4" />
                {metricManageTargets[selectedMetricId].label}
              </Button>
            ) : null}
            {selectedMetricTarget ? (
              <Button
                onClick={() => {
                  setSelectedMetricId(null);
                  router.push(selectedMetricTarget.href);
                }}
              >
                Open full page
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </m.div>
  );
}
