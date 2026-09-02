import { describe, expect, it } from "vitest";
import {
  calculateProfitAndLoss,
  getFinancialYearStart,
  roundStatementAmount,
} from "./financial-statements";

describe("financial statements", () => {
  it("uses perpetual MWA COGS without counting purchases or stock a second time", () => {
    expect(calculateProfitAndLoss({
      salesRevenue: 10_000,
      salesReturns: 500,
      costOfGoodsSold: 6_000,
      purchaseReturnVariance: -100,
      otherIncome: 250,
      operatingExpenses: 650,
    })).toEqual({
      salesRevenue: 10_000,
      salesReturns: 500,
      netSales: 9_500,
      costOfGoodsSold: 6_000,
      purchaseReturnVariance: -100,
      grossProfit: 3_400,
      otherIncome: 250,
      operatingExpenses: 650,
      netProfit: 3_000,
    });
  });

  it("uses the Bangladesh July-to-June financial year", () => {
    expect(getFinancialYearStart("2026-08-17")).toBe("2026-07-01");
    expect(getFinancialYearStart("2026-03-31")).toBe("2025-07-01");
  });

  it("rounds a negative half-cent away from zero through the shared money rule", () => {
    expect(roundStatementAmount(-1.005)).toBe(-1.01);

    expect(calculateProfitAndLoss({
      salesRevenue: 10,
      salesReturns: 0,
      costOfGoodsSold: 5,
      purchaseReturnVariance: -1.005,
      otherIncome: 0,
      operatingExpenses: 0,
    })).toMatchObject({
      purchaseReturnVariance: -1.01,
      grossProfit: 3.99,
      netProfit: 3.99,
    });
  });

  it("does not leak binary floating artifacts into statement totals", () => {
    expect(calculateProfitAndLoss({
      salesRevenue: 0.1 + 0.2,
      salesReturns: 0,
      costOfGoodsSold: 0.1,
      purchaseReturnVariance: 0,
      otherIncome: 0.2,
      operatingExpenses: 0.3,
    })).toEqual({
      salesRevenue: 0.3,
      salesReturns: 0,
      netSales: 0.3,
      costOfGoodsSold: 0.1,
      purchaseReturnVariance: 0,
      grossProfit: 0.2,
      otherIncome: 0.2,
      operatingExpenses: 0.3,
      netProfit: 0.1,
    });
  });
});
