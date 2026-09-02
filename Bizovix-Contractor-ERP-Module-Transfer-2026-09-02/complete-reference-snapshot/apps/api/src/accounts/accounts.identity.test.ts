import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { AccountsService, classifyMoneyAccount } from "./accounts.service.js";

type AccountsInternals = {
  syncOpeningBalanceVoucher(tx: unknown, user: AuthenticatedRequestUser, account: unknown): Promise<void>;
  resolveAndValidateParent(...args: unknown[]): Promise<unknown>;
  computeAccountCode(...args: unknown[]): Promise<string>;
};

const currentUser: AuthenticatedRequestUser = {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner",
  initials: "OW",
  tenantId: "tenant-1",
  organizationId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

function account(id: string, code: string, name: string, parentId: string | null, bankDetails: unknown = null) {
  return { id, code, name, parentId, bankDetails } as never;
}

describe("AccountsService immutable account identity", () => {
  it("includes inactive managed Party ledgers only for history/report trees", async () => {
    const now = new Date();
    const base = {
      tenantId: "tenant-1", companyId: "company-1", nature: "ASSET", openingBalance: 0,
      openingBalanceDate: null, openingBalanceSourceAccountId: null, openingBalanceSources: [], isControlAccount: false,
      requiresItemDetails: false, printOnInvoices: false, sortOrder: 1, createdAt: now, updatedAt: now,
      managedRole: null, accountGroupId: null,
    };
    const accounts = [
      { ...base, id: "receivable-category", code: "1231000", name: "Customer Receivable", parentId: null, level: "CATEGORY", status: "ACTIVE", bankDetails: null, isSystem: true },
      { ...base, id: "archived-party-ledger", code: "1231009", name: "Archived Customer", parentId: "receivable-category", level: "LEDGER", status: "INACTIVE", bankDetails: { partyMaster: { partyId: "party-1" } }, isSystem: false },
    ];
    const service = new AccountsService({ account: { findMany: vi.fn(async () => accounts) } } as never, {} as never);

    const normalTree = await service.getTree(currentUser);
    const historyTree = await service.getTree(currentUser, true);

    expect(JSON.stringify(normalTree)).not.toContain("archived-party-ledger");
    expect(JSON.stringify(historyTree)).toContain("archived-party-ledger");
  });

  it("classifies renamed money ledgers by fixed COA ancestry code", () => {
    const cashCategory = account("cash-category", "1221000", "Localized liquid funds", null);
    const cashLedger = account("cash-ledger", "1221001", "Front counter", "cash-category");
    const accountsById = new Map([["cash-category", cashCategory], ["cash-ledger", cashLedger]]);

    expect(classifyMoneyAccount(cashLedger, accountsById)).toBe("CASH");
  });

  it("does not grant money-account identity to a lookalike mutable name", () => {
    const fakeCategory = account("fake-category", "9990000", "Cash Accounts", null);
    const fakeLedger = account("fake-ledger", "9990001", "Cash in drawer", "fake-category");
    const accountsById = new Map([["fake-category", fakeCategory], ["fake-ledger", fakeLedger]]);

    expect(classifyMoneyAccount(fakeLedger, accountsById)).toBeNull();
  });

  it("prevents moving, deactivating, or deleting a role-bound custom account", async () => {
    const managedAccount = {
      id: "managed-ledger",
      companyId: "company-1",
      level: "LEDGER",
      managedRole: "LC_GOODS_IN_TRANSIT",
      bankDetails: null,
      isSystem: false,
      name: "Renamed LC Transit",
    };
    const prisma = {
      account: {
        findUnique: vi.fn(async () => managedAccount),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    const service = new AccountsService(prisma as never, { log: vi.fn() } as never);

    await expect(service.reparent(currentUser, managedAccount.id, { parentId: "other" }))
      .rejects.toThrow(/module-managed accounts cannot be moved/i);
    await expect(service.setStatus(currentUser, managedAccount.id, { status: "INACTIVE" }))
      .rejects.toThrow(/module-managed accounts cannot be deactivated/i);
    await expect(service.remove(currentUser, managedAccount.id))
      .rejects.toThrow(/module-managed accounts cannot be deleted/i);
    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(prisma.account.delete).not.toHaveBeenCalled();
  });

  it("prevents moving or deactivating a custom ancestor of a protected COA node", async () => {
    const category = {
      id: "custom-category", companyId: "company-1", level: "CATEGORY", nature: "ASSET",
      parentId: null, managedRole: null, bankDetails: null, isSystem: false, name: "Legacy Wrapper",
    };
    const protectedChild = {
      ...category, id: "protected-child", code: "1231000", parentId: category.id,
      level: "CATEGORY", isSystem: true, name: "Customer Receivable",
    };
    const txUpdate = vi.fn();
    const tx = {
      account: {
        findMany: vi.fn(async () => [category, protectedChild]),
        update: txUpdate,
        updateMany: vi.fn(),
      },
    };
    const prisma = {
      account: {
        findUnique: vi.fn(async () => category),
        findMany: vi.fn(async () => [category, protectedChild]),
        update: vi.fn(),
      },
      voucherEntryLine: { count: vi.fn(async () => 0) },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = new AccountsService(prisma as never, { log: vi.fn() } as never);
    vi.spyOn(service as unknown as AccountsInternals, "resolveAndValidateParent").mockResolvedValue({
      id: "new-parent", level: "MAIN_CATEGORY", nature: "LIABILITY",
    });

    await expect(service.reparent(currentUser, category.id, { parentId: "new-parent" }))
      .rejects.toThrow(/contains protected Chart of Accounts nodes/i);
    await expect(service.setStatus(currentUser, category.id, { status: "INACTIVE" }))
      .rejects.toThrow(/contains protected Chart of Accounts nodes/i);
    expect(txUpdate).not.toHaveBeenCalled();
    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(prisma.voucherEntryLine.count).not.toHaveBeenCalled();
  });

  it("nets POSTED reversals with REVERSED originals and excludes unposted APPROVED money", async () => {
    const now = new Date();
    const accounts = [
      { id: "cash-category", tenantId: "tenant-1", companyId: "company-1", code: "1221000", name: "Renamed Cash", parentId: null, level: "CATEGORY", nature: "ASSET", status: "ACTIVE", bankDetails: null, openingBalance: 0, openingBalanceDate: null, openingBalanceSourceAccountId: null, openingBalanceSources: [], isSystem: true, isControlAccount: false, requiresItemDetails: false, printOnInvoices: false, sortOrder: 1, createdAt: now, updatedAt: now, managedRole: null, accountGroupId: null },
      { id: "cash-ledger", tenantId: "tenant-1", companyId: "company-1", code: "1221001", name: "Renamed Till", parentId: "cash-category", level: "LEDGER", nature: "ASSET", status: "ACTIVE", bankDetails: null, openingBalance: 0, openingBalanceDate: null, openingBalanceSourceAccountId: null, openingBalanceSources: [], isSystem: true, isControlAccount: false, requiresItemDetails: false, printOnInvoices: false, sortOrder: 1, createdAt: now, updatedAt: now, managedRole: null, accountGroupId: null },
    ];
    const groupBy = vi.fn(async () => [{ accountId: "cash-ledger", _sum: { debit: 100, credit: 100 } }]);
    const service = new AccountsService({
      account: { findMany: vi.fn(async () => accounts) },
      voucherEntryLine: { groupBy },
    } as never, {} as never);

    const result = await service.getMoneyAccounts(currentUser, "CASH");

    expect(result).toEqual([expect.objectContaining({ id: "cash-ledger", currentBalance: 0 })]);
    expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        accountId: { in: ["cash-ledger"] },
        voucher: { companyId: "company-1", status: { in: ["POSTED", "REVERSED"] } },
      }),
    }));
  });

  it.each([
    ["getById", async (service: AccountsService) => service.getById(currentUser, "target")],
    ["setStatus", async (service: AccountsService) => service.setStatus(currentUser, "target", { status: "INACTIVE" })],
    ["remove", async (service: AccountsService) => service.remove(currentUser, "target")],
  ])("gates the %s legacy same-name history fallback behind accountId=null", async (_operation, invoke) => {
    const now = new Date();
    const targetAccount = {
      id: "target", tenantId: "tenant-1", companyId: "company-1", code: "9990001", name: "Duplicate Caption",
      parentId: null, level: "LEDGER", nature: "ASSET", status: "ACTIVE", bankDetails: null, openingBalance: 0,
      openingBalanceDate: null, openingBalanceSourceAccountId: null, openingBalanceSources: [], isSystem: false,
      isControlAccount: false, requiresItemDetails: false, printOnInvoices: false, sortOrder: 1, createdAt: now,
      updatedAt: now, managedRole: null, accountGroupId: null,
    };
    const voucherLineCount = vi.fn(async (args: { where: { OR: unknown[] } }) => {
      void args;
      return 0;
    });
    const prisma = {
      account: {
        findUnique: vi.fn(async () => targetAccount),
        findMany: vi.fn(async () => [targetAccount]),
        count: vi.fn(async () => 0),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...targetAccount, ...data })),
        delete: vi.fn(async () => ({})),
      },
      voucherEntryLine: { count: voucherLineCount },
    };
    const service = new AccountsService(prisma as never, { log: vi.fn(async () => ({})) } as never);

    await invoke(service);

    expect(voucherLineCount).toHaveBeenCalled();
    const where = voucherLineCount.mock.calls[0]![0].where;
    expect(where.OR).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: null }),
    ]));
  });
});

describe("AccountsService immutable opening-balance postings", () => {
  const cashCategory = { id: "cash-category", code: "1221000", name: "Renamed Cash Category", parentId: null, bankDetails: null };
  const cash = { id: "cash-1", code: "1221001", name: "Renamed Till", parentId: "cash-category", bankDetails: null, level: "LEDGER", status: "ACTIVE", companyId: "company-1" };
  const bankCategory = { id: "bank-category", code: "1222100", name: "Renamed Bank Category", parentId: null, bankDetails: null };
  const bank = { id: "bank-1", code: "1222101", name: "Renamed Bank", parentId: "bank-category", bankDetails: null, level: "LEDGER", status: "ACTIVE", companyId: "company-1" };

  function target(overrides: Record<string, unknown> = {}) {
    return {
      id: "target-1",
      tenantId: "tenant-1",
      companyId: "company-1",
      code: "1232009",
      name: "Opening Debtor",
      level: "LEDGER",
      nature: "ASSET",
      openingBalance: 100,
      openingBalanceDate: new Date("2026-01-01T00:00:00.000Z"),
      openingBalanceSources: [{ accountId: "cash-1", amount: 100 }],
      ...overrides,
    };
  }

  function activeRoot(overrides: Record<string, unknown> = {}) {
    return {
      id: "opening-v1",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      voucherNumber: "OB-ACCOUNT-1232009",
      voucherDate: new Date("2026-01-01T00:00:00.000Z"),
      status: "POSTED",
      postingVersion: 1,
      totalAmount: 100,
      debit: 100,
      credit: 100,
      currency: "BDT",
      lines: [
        { accountId: "target-1", ledger: "Opening Debtor", description: "Opening balance", debit: 100, credit: 0, costCenter: "Assets", project: null, billReference: null },
        { accountId: "cash-1", ledger: "Old Till", description: "Opening source", debit: 0, credit: 100, costCenter: "Cash-in-Hand", project: null, billReference: null },
      ],
      ...overrides,
    };
  }

  function openingHarness(root: ReturnType<typeof activeRoot> | null, existingReversal: unknown = null) {
    const voucherCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: `created-${String(data.voucherNumber)}` }));
    const voucherUpdate = vi.fn(async () => ({}));
    const voucherFindFirst = vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      if (where.reversalOfId) return existingReversal;
      if (where.idempotencyKey) return null;
      return root;
    });
    const tx = {
      voucherEntry: { findFirst: voucherFindFirst, create: voucherCreate, update: voucherUpdate },
      account: {
        findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => where.id?.in
          ? [cash, bank].filter((row) => where.id!.in.includes(row.id))
          : [cashCategory, cash, bankCategory, bank]),
      },
      company: { findUnique: vi.fn(async () => ({ currencyCode: "BDT" })) },
    };
    const service = new AccountsService({} as never, {} as never);
    return { service: service as unknown as AccountsInternals, tx, voucherCreate, voucherUpdate };
  }

  it("creates version 1 with immutable target/source Account IDs and an idempotency key", async () => {
    const { service, tx, voucherCreate } = openingHarness(null);

    await service.syncOpeningBalanceVoucher(tx, currentUser, target());

    expect(voucherCreate).toHaveBeenCalledTimes(1);
    expect(voucherCreate.mock.calls[0]?.[0].data).toEqual(expect.objectContaining({
      sourceType: "ACCOUNT_OPENING_BALANCE",
      sourceId: "target-1",
      postingVersion: 1,
      idempotencyKey: "account-opening:target-1:v1",
      currency: "BDT",
    }));
    expect(voucherCreate.mock.calls[0]?.[0].data).not.toHaveProperty("reversalOfId");
    expect((voucherCreate.mock.calls[0]?.[0].data.lines as { create: Array<{ accountId: string }> }).create.map((line) => line.accountId))
      .toEqual(["target-1", "cash-1"]);
  });

  it("rejects a non-ledger target before creating an opening journal", async () => {
    const { service, tx, voucherCreate } = openingHarness(null);

    await expect(service.syncOpeningBalanceVoucher(tx, currentUser, target({ level: "CATEGORY" })))
      .rejects.toThrow(/only be posted to a Ledger account/i);

    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it("reverses version 1 at its original date and posts version 2 for amount/date/source edits", async () => {
    const root = activeRoot({ workspaceId: "original-workspace" });
    const { service, tx, voucherCreate, voucherUpdate } = openingHarness(root);

    await service.syncOpeningBalanceVoucher(tx, currentUser, target({
      openingBalance: 120,
      openingBalanceDate: new Date("2026-02-01T00:00:00.000Z"),
      openingBalanceSources: [{ accountId: "cash-1", amount: 70 }, { accountId: "bank-1", amount: 50 }],
    }));

    expect(voucherCreate).toHaveBeenCalledTimes(2);
    const reversal = voucherCreate.mock.calls[0]?.[0].data;
    const replacement = voucherCreate.mock.calls[1]?.[0].data;
    expect(reversal).toEqual(expect.objectContaining({
      voucherDate: root.voucherDate,
      reversalOfId: "opening-v1",
      postingVersion: 1,
      idempotencyKey: "account-opening:target-1:v1:reversal",
    }));
    expect(replacement).toEqual(expect.objectContaining({
      voucherDate: new Date("2026-02-01T00:00:00.000Z"),
      postingVersion: 2,
      idempotencyKey: "account-opening:target-1:v2",
      totalAmount: 120,
      workspaceId: "original-workspace",
      currency: "BDT",
    }));
    expect((replacement.lines as { create: Array<{ accountId: string; credit: number }> }).create)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ accountId: "cash-1", credit: 70 }),
        expect.objectContaining({ accountId: "bank-1", credit: 50 }),
      ]));
    expect(voucherUpdate).toHaveBeenCalledWith({ where: { id: "opening-v1" }, data: { status: "REVERSED" } });
  });

  it("zeroes an opening balance by reversal without deleting or replacing posted history", async () => {
    const { service, tx, voucherCreate, voucherUpdate } = openingHarness(activeRoot());

    await service.syncOpeningBalanceVoucher(tx, currentUser, target({
      openingBalance: 0,
      openingBalanceDate: null,
      openingBalanceSources: [],
    }));

    expect(voucherCreate).toHaveBeenCalledTimes(1);
    expect(voucherCreate.mock.calls[0]?.[0].data).toEqual(expect.objectContaining({ reversalOfId: "opening-v1" }));
    expect(voucherUpdate).toHaveBeenCalledWith({ where: { id: "opening-v1" }, data: { status: "REVERSED" } });
  });

  it("is a no-op when a retry carries the already-posted financial state", async () => {
    const { service, tx, voucherCreate, voucherUpdate } = openingHarness(activeRoot());

    await service.syncOpeningBalanceVoucher(tx, currentUser, target());

    expect(voucherCreate).not.toHaveBeenCalled();
    expect(voucherUpdate).not.toHaveBeenCalled();
  });

  it("creates the Account and its opening synchronization inside one transaction", async () => {
    const txAccountCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "new-account",
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    const tx = {
      account: { create: txAccountCreate },
      voucherEntry: { findFirst: vi.fn(async () => null) },
    };
    const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    const prisma = { account: { count: vi.fn(async () => 0) }, $transaction: transaction };
    const service = new AccountsService(prisma as never, { log: vi.fn(async () => ({})) } as never);
    vi.spyOn(service as unknown as AccountsInternals, "resolveAndValidateParent").mockResolvedValue({
      id: "parent-1", code: "1232000", parentId: null, level: "CATEGORY", nature: "ASSET",
    });
    vi.spyOn(service as unknown as AccountsInternals, "computeAccountCode").mockResolvedValue("1232009");

    await service.create(currentUser, { level: "LEDGER", parentId: "parent-1", name: "Atomic Account", nature: "ASSET" });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txAccountCreate).toHaveBeenCalledTimes(1);
  });

  it("updates Account metadata and its opening synchronization inside one transaction", async () => {
    const now = new Date();
    const existing = {
      id: "target-1", tenantId: "tenant-1", companyId: "company-1", code: "1232009", name: "Old Caption",
      managedRole: null, parentId: null, level: "LEDGER", nature: "ASSET", isSystem: false, isControlAccount: false,
      requiresItemDetails: false, openingBalance: 0, openingBalanceDate: null, openingBalanceSourceAccountId: null,
      openingBalanceSources: [], bankDetails: null, printOnInvoices: false, status: "ACTIVE", sortOrder: 1,
      accountGroupId: null, createdAt: now, updatedAt: now,
    };
    const txAccountUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...existing, ...data, name: "New Caption" }));
    const tx = {
      account: { update: txAccountUpdate },
      voucherEntry: { findFirst: vi.fn(async () => null) },
    };
    const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    const prisma = {
      account: { findUnique: vi.fn(async () => existing), update: vi.fn() },
      $transaction: transaction,
    };
    const service = new AccountsService(prisma as never, { log: vi.fn(async () => ({})) } as never);

    await service.update(currentUser, "target-1", { name: "New Caption" });

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(txAccountUpdate).toHaveBeenCalledTimes(1);
    expect(prisma.account.update).not.toHaveBeenCalled();
  });
});
