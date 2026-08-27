const inrGrouping = new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: 0,
});

const croreValue = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const lakhValue = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** "BDT 75,00,000" - South Asian lakh/crore digit grouping used across the ERP. */
export function formatBDT(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `BDT ${inrGrouping.format(Math.round(n))}`;
}

/** "BDT 98.45 Cr" - used for large dashboard KPI values. */
export function formatBDTCompact(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `BDT ${croreValue.format(n / 1e7)} Cr`;
}

/** "BDT 984.50 Lakh" - fixed lakh unit for dashboard KPI comparisons. */
export function formatBDTLakh(amount: number | string): string {
  const n = typeof amount === "string" ? Number(amount) : amount;
  return `BDT ${lakhValue.format(n / 1e5)} Lakh`;
}
