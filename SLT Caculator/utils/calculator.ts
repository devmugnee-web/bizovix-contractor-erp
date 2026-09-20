import type { BidderRow, ClassifiedBidder } from "@/types"

export function parseNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0
  }

  if (!value) {
    return 0
  }

  const sanitizedValue = value.toString().replace(/,/g, "").trim()
  const parsedValue = Number.parseFloat(sanitizedValue)

  return Number.isFinite(parsedValue) ? parsedValue : 0
}

export function formatNumber(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {}
): string {
  const safeValue = Number.isFinite(value ?? NaN) ? Number(value) : 0

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
    ...options
  }).format(safeValue)
}

export function formatCurrency(
  value: number | null | undefined,
  options: Intl.NumberFormatOptions = {}
): string {
  return `${formatNumber(value, options)} BDT`
}

export function formatPercent(
  value: number | null | undefined,
  options: { signed?: boolean } = {}
): string {
  const safeValue = Number.isFinite(value ?? NaN) ? Number(value) : 0
  const sign = options.signed && safeValue > 0 ? "+" : ""

  return `${sign}${formatNumber(safeValue, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`
}

export function calculateVsApp(bidAmount: number, appAmount: number): number | null {
  if (!Number.isFinite(bidAmount) || !Number.isFinite(appAmount) || appAmount <= 0) {
    return null
  }

  return ((bidAmount - appAmount) / appAmount) * 100
}

export function calculateAverageBid(amounts: number[]): number {
  if (amounts.length === 0) {
    return 0
  }

  return amounts.reduce((total, amount) => total + amount, 0) / amounts.length
}

export function calculateNPPIAmount(appAmount: number, nppiPercent: number): number {
  if (appAmount <= 0 || !Number.isFinite(nppiPercent)) {
    return 0
  }

  return (appAmount * nppiPercent) / 100
}

export function calculateWeightedAverage(
  averageBid: number,
  appAmount: number,
  nppiAmount: number
): number {
  return (0.5 * averageBid) + (0.2 * appAmount) + (0.3 * nppiAmount)
}

export function calculateStandardDeviation(amounts: number[], weightedAverage: number): number {
  if (amounts.length === 0) {
    return 0
  }

  const variance =
    amounts.reduce((total, amount) => total + (amount - weightedAverage) ** 2, 0) / amounts.length

  return Math.sqrt(variance)
}

export function calculateSLT(weightedAverage: number, standardDeviation: number): number {
  const sltValue = weightedAverage - standardDeviation

  return Number.isFinite(sltValue) ? sltValue : 0
}

export function normalizeNumericInput(
  value: string,
  options: { allowDecimal?: boolean; maxDecimals?: number } = {}
): string {
  const { allowDecimal = true, maxDecimals = 4 } = options
  const sanitized = value.replace(/,/g, "").replace(/[^\d.]/g, "")

  if (!allowDecimal) {
    return sanitized.replace(/\./g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",")
  }

  const firstDecimalIndex = sanitized.indexOf(".")
  const normalized =
    firstDecimalIndex === -1
      ? sanitized
      : `${sanitized.slice(0, firstDecimalIndex + 1)}${sanitized
          .slice(firstDecimalIndex + 1)
          .replace(/\./g, "")}`

  const [integerPart = "", decimalPart = ""] = normalized.split(".")
  const formattedInteger = integerPart.replace(/^0+(?=\d)/, "") || (normalized.startsWith(".") ? "0" : integerPart)
  const groupedInteger = formattedInteger.replace(/\B(?=(\d{3})+(?!\d))/g, ",")

  if (normalized.endsWith(".")) {
    return `${groupedInteger}.`
  }

  if (!decimalPart) {
    return groupedInteger
  }

  return `${groupedInteger}.${decimalPart.slice(0, maxDecimals)}`
}

export function classifyBidders(
  bidders: BidderRow[],
  appAmount: number,
  sltPrice: number
): { responsive: ClassifiedBidder[]; nonResponsive: ClassifiedBidder[]; validBidders: ClassifiedBidder[] } {
  const validBidders = bidders
    .map((bidder, index) => {
      if (bidder.checked === false) {
        return null
      }

      const amount = parseNumber(bidder.amount)

      if (amount <= 0) {
        return null
      }

      const status = amount >= sltPrice ? "Responsive" : "Non Responsive"

      return {
        id: bidder.id,
        serial: index + 1,
        name: bidder.name.trim() || `Bidder ${index + 1}`,
        amount,
        status,
        vsApp: calculateVsApp(amount, appAmount)
      } satisfies ClassifiedBidder
    })
    .filter((bidder): bidder is ClassifiedBidder => bidder !== null)
    .sort((left, right) => left.amount - right.amount)

  return {
    validBidders,
    responsive: validBidders
      .filter((bidder) => bidder.status === "Responsive")
      .map((bidder, index) => ({
        ...bidder,
        serial: index + 1
      })),
    nonResponsive: validBidders
      .filter((bidder) => bidder.status === "Non Responsive")
      .map((bidder, index) => ({
        ...bidder,
        serial: index + 1
      }))
  }
}
