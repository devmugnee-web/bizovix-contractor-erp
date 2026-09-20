import type { BidderRow, ClassifiedBidder } from "./types";

export function parseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Number.parseFloat(value.toString().replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
    ...options,
  }).format(Number.isFinite(value ?? Number.NaN) ? Number(value) : 0);
}

export function formatPercent(value: number | null | undefined): string {
  const safeValue = Number.isFinite(value ?? Number.NaN) ? Number(value) : 0;
  return `${safeValue > 0 ? "+" : ""}${formatNumber(safeValue, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

export function normalizeNumericInput(value: string, maxDecimals = 4): string {
  const sanitized = value.replace(/,/g, "").replace(/[^\d.]/g, "");
  const firstDecimal = sanitized.indexOf(".");
  const normalized =
    firstDecimal === -1
      ? sanitized
      : `${sanitized.slice(0, firstDecimal + 1)}${sanitized.slice(firstDecimal + 1).replace(/\./g, "")}`;
  const [integerPart = "", decimalPart = ""] = normalized.split(".");
  const integer =
    integerPart.replace(/^0+(?=\d)/, "") || (normalized.startsWith(".") ? "0" : integerPart);
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (normalized.endsWith(".")) return `${grouped}.`;
  return decimalPart ? `${grouped}.${decimalPart.slice(0, maxDecimals)}` : grouped;
}

export function calculateMetrics(bidders: BidderRow[], appAmount: number, nppiPercent: number) {
  const amounts = bidders
    .filter((bidder) => bidder.included)
    .map((bidder) => parseNumber(bidder.amount))
    .filter((amount) => amount > 0);
  const averageBid = amounts.length
    ? amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length
    : 0;
  const nppiAmount = appAmount > 0 ? (appAmount * nppiPercent) / 100 : 0;
  const weightedAverage = 0.5 * averageBid + 0.2 * appAmount + 0.3 * nppiAmount;
  const variance = amounts.length
    ? amounts.reduce((sum, amount) => sum + (amount - weightedAverage) ** 2, 0) / amounts.length
    : 0;
  const standardDeviation = Math.sqrt(variance);
  const sltPrice = Number.isFinite(weightedAverage - standardDeviation)
    ? weightedAverage - standardDeviation
    : 0;

  return {
    appAmount,
    nppiPercent,
    averageBid,
    nppiAmount,
    weightedAverage,
    standardDeviation,
    sltPrice,
    totalValidBidders: amounts.length,
  };
}

export function classifyBidders(
  bidders: BidderRow[],
  appAmount: number,
  sltPrice: number,
): {
  responsive: ClassifiedBidder[];
  nonResponsive: ClassifiedBidder[];
  valid: ClassifiedBidder[];
} {
  const valid = bidders
    .flatMap((bidder, index) => {
      const amount = parseNumber(bidder.amount);
      if (!bidder.included || amount <= 0) return [];
      return [
        {
          id: bidder.id,
          serial: index + 1,
          name: bidder.name.trim() || `Bidder ${index + 1}`,
          amount,
          status: amount >= sltPrice ? ("Responsive" as const) : ("Non Responsive" as const),
          vsApp: appAmount > 0 ? ((amount - appAmount) / appAmount) * 100 : null,
        },
      ];
    })
    .sort((left, right) => left.amount - right.amount);

  const withSerial = (rows: ClassifiedBidder[]) =>
    rows.map((row, index) => ({ ...row, serial: index + 1 }));
  return {
    valid,
    responsive: withSerial(valid.filter((bidder) => bidder.status === "Responsive")),
    nonResponsive: withSerial(valid.filter((bidder) => bidder.status === "Non Responsive")),
  };
}
