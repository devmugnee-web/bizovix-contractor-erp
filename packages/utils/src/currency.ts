const exactValue = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function numericAmount(amount: number | string): number {
  const value = typeof amount === "string" ? Number(amount) : amount;
  return Number.isFinite(value) ? value : 0;
}

/**
 * Responsive-safe ERP money display:
 * BDT 95,000.00 -> BDT 1.25 Lakh -> BDT 2.50 Crore.
 * Only the presentation is compacted; stored/calculated values are never changed.
 */
export function formatBDT(amount: number | string): string {
  return `BDT ${formatAmount(amount)}`;
}

/** Adaptive amount without a currency prefix, for screens that render BDT/Tk separately. */
export function formatAmount(amount: number | string): string {
  const value = numericAmount(amount);
  const absolute = Math.abs(value);
  if (absolute >= 1e7) return `${exactValue.format(value / 1e7)} Crore`;
  if (absolute >= 1e5) return `${exactValue.format(value / 1e5)} Lakh`;
  return exactValue.format(value);
}

/** Backward-compatible aliases; all money now follows the same adaptive rule. */
export function formatBDTCompact(amount: number | string): string {
  return formatBDT(amount);
}

export function formatBDTLakh(amount: number | string): string {
  return formatBDT(amount);
}
