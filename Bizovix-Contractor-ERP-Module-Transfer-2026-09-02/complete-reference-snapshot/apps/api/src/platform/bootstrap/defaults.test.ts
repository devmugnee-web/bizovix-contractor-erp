import { describe, expect, it } from "vitest";

import { accountCategorySeeds, accountGroupSeeds, freeYearlyPlanSeed, freeYearlyFeatureKeys, getIndustryPackSeed, permissionSeeds, roleSeeds, systemAccountSeeds } from "./defaults.js";

describe("industry pack defaults", () => {
  it("maps trading to the trading ERP workspace", () => {
    expect(getIndustryPackSeed("TRADING")?.workspaceName).toBe("Trading ERP Workspace");
  });

  it("maps tender to the tender ERP workspace", () => {
    expect(getIndustryPackSeed("TENDER")?.workspaceName).toBe("Tender ERP Workspace");
  });

  it("maps rental to the rental ERP workspace", () => {
    expect(getIndustryPackSeed("RENTAL")?.workspaceName).toBe("Rental ERP Workspace");
  });

  it("maps service to the service ERP workspace", () => {
    expect(getIndustryPackSeed("SERVICE")?.workspaceName).toBe("Service ERP Workspace");
  });
});

describe("free yearly foundation", () => {
  it("keeps the expected tenant and workspace limits", () => {
    expect(freeYearlyPlanSeed.maxOrganizations).toBe(1);
    expect(freeYearlyPlanSeed.maxCompanies).toBe(1);
    expect(freeYearlyPlanSeed.maxWorkspaces).toBe(1);
    expect(freeYearlyPlanSeed.maxUsers).toBe(2);
    expect(freeYearlyPlanSeed.maxMonthlyVouchers).toBe(300);
  });

  it("enables only the basic feature set", () => {
    expect(freeYearlyFeatureKeys).toContain("dashboard.access");
    expect(freeYearlyFeatureKeys).toContain("accounting.basic");
    expect(freeYearlyFeatureKeys).not.toContain("api.access");
  });

  it("ships owner and viewer roles", () => {
    expect(roleSeeds.some((role) => role.code === "OWNER")).toBe(true);
    expect(roleSeeds.some((role) => role.code === "VIEWER")).toBe(true);
  });

  it("ships an explicit quality-manager role and quality-master permission", () => {
    expect(roleSeeds.some((role) => role.code === "QUALITY_MANAGER")).toBe(true);
    expect(permissionSeeds.some((permission) => permission.key === "manufacturing.quality.manage")).toBe(true);
  });
});

describe("system account seeds (Section 6 chart of accounts)", () => {
  it("keeps the fixed business hierarchy as protected system nodes", () => {
    const names = new Set(accountCategorySeeds.map((account) => account.name));
    for (const name of ["Assets", "Fixed Assets", "Current Assets", "Liabilities", "Equity", "Income", "Expenses", "Purchase Accounts", "Administrative Expenses"]) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("models bank, receivable, advance and deposit containers as categories rather than ledgers", () => {
    const categories = new Set(accountCategorySeeds.map((account) => account.name));
    for (const name of ["Bank Accounts", "Mobile Financial Service Accounts", "Accounts Receivables Control (Customers)", "Others Receivables", "Advance & IOU", "Deposit & Others", "Goods in Transit", "Bank Loan", "Accounts Payable Controls (Supplier)", "Short Term Loan"]) {
      expect(categories.has(name)).toBe(true);
      expect(systemAccountSeeds.some((account) => account.name === name)).toBe(false);
    }
    expect(categories.has("Sales Return")).toBe(true);
    expect(systemAccountSeeds.some((account) => account.name === "Sales Return" && account.parentCategoryCode === "4120000")).toBe(true);
  });

  it("has no duplicate account codes", () => {
    const codes = systemAccountSeeds.map((account) => account.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("references only account groups that actually exist in accountGroupSeeds", () => {
    const groupCodes = new Set(accountGroupSeeds.map((group) => group.code));
    for (const account of systemAccountSeeds) {
      expect(groupCodes.has(account.groupCode)).toBe(true);
    }
  });

  it("seeds the protected operational ledgers required by financial posting", () => {
    expect(systemAccountSeeds.map((account) => account.name)).toEqual([
      "Cash in Hand",
      "Petty Cash",
      "Inventory Control",
      "Inventory Delivered Pending Invoice",
      "Purchase Bill Pending",
      "Opening Balance Equity",
      "Sales Account",
      "Sales Return",
      "Inventory Adjustment Gain",
      "Cost of Goods Sold",
      "Provident Fund Payable",
      "Provident Fund Expense",
      "Round Off",
      "Inventory Adjustment Loss",
    ]);
  });
});
