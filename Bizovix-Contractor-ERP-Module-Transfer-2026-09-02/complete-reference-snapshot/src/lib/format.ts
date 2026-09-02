import { format, isValid, parseISO } from "date-fns";
import { roundMoney } from "@/lib/money";

export type AppDateFormat = "DD/MM/YYYY";

export const DATE_FORMAT_STORAGE_KEY = "bizovix:date-format:v1";
export const DATE_FORMAT_CHANGE_EVENT = "bizovix:date-format-change";

export function normalizeDateFormat(value: unknown): AppDateFormat {
  void value;
  return "DD/MM/YYYY";
}

export function getDateFormatPreference(): AppDateFormat {
  if (typeof window === "undefined") return "DD/MM/YYYY";
  return normalizeDateFormat(window.localStorage.getItem(DATE_FORMAT_STORAGE_KEY));
}

export function setDateFormatPreference(value: unknown) {
  if (typeof window === "undefined") return;
  const normalized = normalizeDateFormat(value);
  window.localStorage.setItem(DATE_FORMAT_STORAGE_KEY, normalized);
  window.dispatchEvent(
    new CustomEvent(DATE_FORMAT_CHANGE_EVENT, { detail: normalized }),
  );
}

export function getDatePattern() {
  return "dd/MM/yyyy";
}

function toFiniteNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}

export function formatCurrencyUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}

/** Format a monetary amount without adding a currency symbol. */
export function formatAmount(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roundMoney(value));
}

export function formatDate(value: string | Date, pattern?: string) {
  const parsed = typeof value === "string" ? parseISO(value) : value;
  return isValid(parsed) ? format(parsed, pattern ?? getDatePattern()) : String(value || "-");
}

export function formatDateTime(value: string | Date) {
  return formatDate(value, `${getDatePattern()} HH:mm`);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(toFiniteNumber(value));
}

export function formatHoursFromMinutes(value: number) {
  return `${(toFiniteNumber(value) / 60).toFixed(2)}h`;
}

export function formatMoneyInput(
  value: string | number | null | undefined,
  options?: { fixedDecimals?: boolean },
) {
  if (typeof value === "number" || options?.fixedDecimals) {
    const normalized = typeof value === "string" ? value.replace(/,/g, "") : value;
    if (normalized !== "" && Number.isFinite(Number(normalized))) {
      return formatAmount(normalized);
    }
  }

  const source = String(value ?? "");
  const normalized = source.replace(/,/g, "");
  const match = normalized.match(/^(-?)(\d*)(\.\d*)?$/);

  if (!match) {
    return source;
  }

  const [, sign, integerPart, decimalPart = ""] = match;
  return `${sign}${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${decimalPart}`;
}

export function parseMoneyInput(value: string) {
  return value.replace(/,/g, "");
}
