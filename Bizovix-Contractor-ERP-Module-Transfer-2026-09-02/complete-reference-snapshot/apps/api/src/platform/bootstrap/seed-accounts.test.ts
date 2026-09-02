import { describe, expect, it, vi } from "vitest";

import { accountCategorySeeds, accountGroupSeeds, systemAccountSeeds } from "./defaults.js";
import { seedAccountGroups, seedAccountHierarchy } from "./seed-accounts.js";

const tenantId = "tenant-1";
const companyId = "company-1";

function seededGroupIds() {
  return new Map(accountGroupSeeds.map((group) => [group.code, `group-${group.code}`]));
}

function exactCategoryRecord(category: (typeof accountCategorySeeds)[number]) {
  return {
    id: `account-${category.code}`,
    tenantId,
    companyId,
    accountGroupId: null,
    parentId: category.parentCode ? `account-${category.parentCode}` : null,
    level: category.level,
    code: category.code,
    name: category.name,
    nature: category.nature,
    isSystem: true,
    status: "ACTIVE",
  };
}

function exactLedgerRecord(
  ledger: (typeof systemAccountSeeds)[number],
  groupIds = seededGroupIds(),
) {
  return {
    id: `account-${ledger.code}`,
    tenantId,
    companyId,
    accountGroupId: groupIds.get(ledger.groupCode),
    parentId: `account-${ledger.parentCategoryCode}`,
    level: "LEDGER",
    code: ledger.code,
    name: ledger.name,
    nature: ledger.nature,
    isSystem: true,
    isControlAccount: ledger.isControlAccount,
    status: "ACTIVE",
  };
}

describe("protected Chart of Accounts bootstrap", () => {
  it("accepts an exactly matching existing protected hierarchy without modifying it", async () => {
    const groupIds = seededGroupIds();
    const categoryByCode = new Map(accountCategorySeeds.map((category) => [category.code, category]));
    const ledgerByCode = new Map(systemAccountSeeds.map((ledger) => [ledger.code, ledger]));
    const account = {
      findUnique: vi.fn(async ({ where }: { where: { companyId_code: { code: string } } }) => {
        const code = where.companyId_code.code;
        const category = categoryByCode.get(code);
        if (category) return exactCategoryRecord(category);
        const ledger = ledgerByCode.get(code);
        return ledger ? exactLedgerRecord(ledger, groupIds) : null;
      }),
      create: vi.fn(),
    };

    const created = await seedAccountHierarchy({ account }, tenantId, companyId, groupIds);

    expect(created).toBe(0);
    expect(account.create).not.toHaveBeenCalled();
  });

  it("fails closed instead of adopting a custom row that occupies a protected code", async () => {
    const root = accountCategorySeeds[0];
    const conflictingRoot = { ...exactCategoryRecord(root), isSystem: false };
    const account = {
      findUnique: vi.fn().mockResolvedValue(conflictingRoot),
      create: vi.fn(),
    };

    await expect(seedAccountHierarchy({ account }, tenantId, companyId, seededGroupIds()))
      .rejects.toThrow(`Protected Chart of Accounts code ${root.code} conflicts`);
    expect(account.findUnique).toHaveBeenCalledTimes(1);
    expect(account.create).not.toHaveBeenCalled();
  });

  it("rejects a protected category whose stored parent is not the seeded parent", async () => {
    const root = accountCategorySeeds[0];
    const child = accountCategorySeeds[1];
    const account = {
      findUnique: vi.fn(async ({ where }: { where: { companyId_code: { code: string } } }) => {
        const code = where.companyId_code.code;
        if (code === root.code) return exactCategoryRecord(root);
        if (code === child.code) return { ...exactCategoryRecord(child), parentId: "wrong-parent" };
        return null;
      }),
      create: vi.fn(),
    };

    await expect(seedAccountHierarchy({ account }, tenantId, companyId, seededGroupIds()))
      .rejects.toThrow("parentId");
    expect(account.create).not.toHaveBeenCalled();
  });

  it("rejects an existing protected ledger wired to the wrong Account Group", async () => {
    const groupIds = seededGroupIds();
    const categoryByCode = new Map(accountCategorySeeds.map((category) => [category.code, category]));
    const firstLedger = systemAccountSeeds[0];
    const account = {
      findUnique: vi.fn(async ({ where }: { where: { companyId_code: { code: string } } }) => {
        const code = where.companyId_code.code;
        const category = categoryByCode.get(code);
        if (category) return exactCategoryRecord(category);
        if (code === firstLedger.code) {
          return { ...exactLedgerRecord(firstLedger, groupIds), accountGroupId: "wrong-group" };
        }
        return null;
      }),
      create: vi.fn(),
    };

    await expect(seedAccountHierarchy({ account }, tenantId, companyId, groupIds))
      .rejects.toThrow("accountGroupId");
    expect(account.create).not.toHaveBeenCalled();
  });

  it("validates an existing Account Group before exposing its id to account seeding", async () => {
    const accountGroup = {
      upsert: vi.fn(async ({ create }: { create: Record<string, unknown> }) => ({
        id: "group-conflict",
        ...create,
        name: "Conflicting Group Name",
      })),
    };

    await expect(seedAccountGroups({ accountGroup }, tenantId, companyId))
      .rejects.toThrow(`Account Group code ${accountGroupSeeds[0].code} conflicts`);
    expect(accountGroup.upsert).toHaveBeenCalledTimes(1);
  });
});
