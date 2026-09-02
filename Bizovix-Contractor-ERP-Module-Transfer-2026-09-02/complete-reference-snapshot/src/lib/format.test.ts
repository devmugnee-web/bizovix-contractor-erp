import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatCurrency,
  formatCurrencyUsd,
  formatMoneyInput,
  parseMoneyInput,
  normalizeDateFormat,
} from "@/lib/format";

describe("application date format", () => {
  it("always uses unambiguous day/month/year formatting", () => {
    expect(formatDate("2026-07-31")).toBe("31/07/2026");
    expect(normalizeDateFormat("MM/DD/YYYY")).toBe("DD/MM/YYYY");
  });

  it("keeps the same date order when a time is shown", () => {
    expect(formatDateTime("2026-08-31T19:05:00")).toBe("31/08/2026 19:05");
  });
});

describe("money input formatting", () => {
  it("groups thousands without changing the numeric value", () => {
    expect(formatMoneyInput("1000")).toBe("1,000");
    expect(formatMoneyInput("50000")).toBe("50,000");
    expect(parseMoneyInput("50,000")).toBe("50000");
  });

  it("preserves decimals while typing", () => {
    expect(formatMoneyInput("1234567.50")).toBe("1,234,567.50");
    expect(formatMoneyInput("1000.")).toBe("1,000.");
  });

  it("does not corrupt incomplete or non-numeric input", () => {
    expect(formatMoneyInput(0)).toBe("0.00");
    expect(formatMoneyInput("-")).toBe("-");
    expect(formatMoneyInput("abc")).toBe("abc");
  });
});

describe("currency display precision", () => {
  it.each([
    [0, "0.00"],
    [12, "12.00"],
    [1_234.5, "1,234.50"],
    [280_044.916687, "280,044.92"],
  ])("renders BDT %s with exactly two decimal places", (input, expectedAmount) => {
    expect(formatCurrency(input).replace(/\u00a0/g, " ")).toContain(expectedAmount);
  });

  it.each([
    [0, "0.00"],
    [125, "125.00"],
    [1_234.567, "1,234.57"],
  ])("renders USD %s with exactly two decimal places", (input, expectedAmount) => {
    expect(formatCurrencyUsd(input).replace(/\u00a0/g, " ")).toContain(expectedAmount);
  });

  it("renders numeric money-input values with two decimal places", () => {
    expect(formatMoneyInput(1_234)).toBe("1,234.00");
    expect(formatMoneyInput(1_234.5)).toBe("1,234.50");
  });
});
