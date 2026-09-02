import { describe, expect, it, vi } from "vitest";

import { VoucherEntryStatus } from "../generated/prisma/index.js";
import { DIRECTLY_SETTABLE_STATUSES, PostingEngineService } from "./posting-engine.service.js";

// These three checks are pure — no Prisma/DB access — so they run as real unit
// tests without a database. transitionStatus()/reverseVoucher() need a live
// PrismaService and are exercised by the app's integration/e2e suite instead.
const engine = new PostingEngineService({} as never, { log: async () => undefined } as never, {} as never);

describe("PostingEngineService.assertBalanced", () => {
  it("accepts a voucher where total debit equals total credit", () => {
    expect(() =>
      engine.assertBalanced([
        { debit: 10000, credit: 0 },
        { debit: 0, credit: 10000 },
      ]),
    ).not.toThrow();
  });

  it("accepts a voucher with many lines that net to zero difference", () => {
    expect(() =>
      engine.assertBalanced([
        { debit: 6000, credit: 0 },
        { debit: 4000, credit: 0 },
        { debit: 0, credit: 7500 },
        { debit: 0, credit: 2500 },
      ]),
    ).not.toThrow();
  });

  it("rejects a voucher where debit does not equal credit", () => {
    expect(() =>
      engine.assertBalanced([
        { debit: 10000, credit: 0 },
        { debit: 0, credit: 9000 },
      ]),
    ).toThrow(/Unbalanced/);
  });

  it("tolerates sub-cent floating point noise from JSON-decoded numbers", () => {
    expect(() =>
      engine.assertBalanced([
        { debit: 0.1 + 0.2, credit: 0 }, // 0.30000000000000004 in IEEE754
        { debit: 0, credit: 0.3 },
      ]),
    ).not.toThrow();
  });

  it("balances using the same two-decimal amounts that will be persisted", () => {
    expect(() =>
      engine.assertBalanced([
        { debit: 280044.92, credit: 0 },
        { debit: 0, credit: 280044.91999999998 },
      ]),
    ).not.toThrow();
  });

  it("rejects a genuine one-paisa imbalance", () => {
    expect(() =>
      engine.assertBalanced([
        { debit: 100.01, credit: 0 },
        { debit: 0, credit: 100 },
      ]),
    ).toThrow(/Unbalanced/);
  });
});

describe("PostingEngineService.normalizeLines", () => {
  it("normalizes every debit and credit to two decimal places", () => {
    expect(engine.normalizeLines([
      { debit: 100.105, credit: 0 },
      { debit: 0, credit: 100.104 },
    ])).toEqual([
      { debit: 100.11, credit: 0 },
      { debit: 0, credit: 100.1 },
    ]);
  });
});

describe("PostingEngineService.assertPostableAccounts money-account linkage", () => {
  function buildEngine(accounts: Array<Record<string, unknown>>) {
    const prisma = {
      account: {
        findMany: async ({ where }: { where: { companyId?: string } }) =>
          where.companyId ? accounts.filter((account) => account.companyId === where.companyId) : accounts,
      },
    };
    return new PostingEngineService(prisma as never, { log: async () => undefined } as never, {} as never);
  }

  it("keeps every ledger below the fixed Bank Accounts category linked as BANK", async () => {
    const accounts = [
      { id: "bank-category", code: "1222100", companyId: "company-1", parentId: null, name: "Renamed Bank Category", level: "CATEGORY", status: "ACTIVE", bankDetails: null },
      { id: "bank-ledger", code: "1222101", companyId: "company-1", parentId: "bank-category", name: "Any Bank Ledger Name", level: "LEDGER", status: "ACTIVE", bankDetails: null },
    ];
    await expect(buildEngine(accounts).assertPostableAccounts("company-1", [{ accountId: "bank-ledger", moneyAccountType: "BANK" }])).resolves.toBeUndefined();
  });

  it("keeps every ledger below the fixed Mobile Financial Service Accounts category linked as MFS", async () => {
    const accounts = [
      { id: "mfs-category", code: "1222200", companyId: "company-1", parentId: null, name: "Renamed Wallet Category", level: "CATEGORY", status: "ACTIVE", bankDetails: null },
      { id: "mfs-ledger", code: "1222201", companyId: "company-1", parentId: "mfs-category", name: "Any Wallet Ledger Name", level: "LEDGER", status: "ACTIVE", bankDetails: null },
    ];
    await expect(buildEngine(accounts).assertPostableAccounts("company-1", [{ accountId: "mfs-ledger", moneyAccountType: "MFS" }])).resolves.toBeUndefined();
  });

  it("classifies cash by the immutable Cash Accounts code after a caption change", async () => {
    const accounts = [
      { id: "cash-category", code: "1221000", companyId: "company-1", parentId: null, name: "Till & Float", level: "CATEGORY", status: "ACTIVE", bankDetails: null },
      { id: "cash-ledger", code: "1221001", companyId: "company-1", parentId: "cash-category", name: "Front Counter", level: "LEDGER", status: "ACTIVE", bankDetails: null },
    ];
    await expect(buildEngine(accounts).assertPostableAccounts("company-1", [{ accountId: "cash-ledger", moneyAccountType: "CASH" }])).resolves.toBeUndefined();
  });

  it("does not treat a matching category caption as accounting identity", async () => {
    const accounts = [
      { id: "fake-bank-category", code: "9999000", companyId: "company-1", parentId: null, name: "Bank Accounts", level: "CATEGORY", status: "ACTIVE", bankDetails: null },
      { id: "fake-bank-ledger", code: "9999001", companyId: "company-1", parentId: "fake-bank-category", name: "Not A Core Bank", level: "LEDGER", status: "ACTIVE", bankDetails: null },
    ];
    await expect(buildEngine(accounts).assertPostableAccounts("company-1", [{ accountId: "fake-bank-ledger", moneyAccountType: "BANK" }])).rejects.toThrow(/not a valid BANK money account/);
  });

  it("uses the immutable accountKind tag even if a ledger is renamed", async () => {
    const accounts = [
      { id: "wallet", code: "custom-wallet", companyId: "company-1", parentId: null, name: "Renamed Wallet", level: "LEDGER", status: "ACTIVE", bankDetails: { accountKind: "MFS" } },
    ];
    await expect(buildEngine(accounts).assertPostableAccounts("company-1", [{ accountId: "wallet", moneyAccountType: "MFS" }])).resolves.toBeUndefined();
  });
});

describe("PostingEngineService.transitionStatus Account identity boundary", () => {
  it("locks the voucher and revalidates the final persisted Account ids inside the posting transaction", async () => {
    const voucher = {
      id: "voucher-1", tenantId: "tenant-1", companyId: "company-1", workspaceId: "workspace-1",
      voucherNumber: "JV-1", status: VoucherEntryStatus.PENDING, voucherType: "JOURNAL",
      documentKind: null, workflowOrigin: "DIRECT",
    };
    const rootLines = [{ accountId: "ledger-1", debit: 100, credit: 0 }];
    const lockedLines = [{ accountId: "foreign-ledger", debit: 100, credit: 0 }];
    const queryRaw = vi.fn(async () => [{ id: voucher.id }]);
    const update = vi.fn();
    const tx = {
      $queryRaw: queryRaw,
      voucherEntry: {
        findUniqueOrThrow: vi.fn(async () => ({
          status: voucher.status,
          companyId: voucher.companyId,
          voucherType: voucher.voucherType,
          documentKind: voucher.documentKind,
          workflowOrigin: voucher.workflowOrigin,
        })),
        update,
      },
      voucherEntryLine: { findMany: vi.fn(async () => lockedLines) },
      account: {
        findMany: vi.fn(async () => [{
          id: "foreign-ledger", companyId: "company-2", level: "LEDGER", status: "ACTIVE",
          parentId: null, bankDetails: null,
        }]),
      },
    };
    const prisma = {
      voucherEntry: { findUnique: vi.fn(async () => voucher) },
      voucherEntryLine: { findMany: vi.fn(async () => rootLines) },
      account: {
        findMany: vi.fn(async () => [{
          id: "ledger-1", companyId: "company-1", level: "LEDGER", status: "ACTIVE",
          parentId: null, bankDetails: null,
        }]),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const inventory = { postVoucherMovements: vi.fn() };
    const service = new PostingEngineService(prisma as never, { log: vi.fn() } as never, inventory as never);

    await expect(service.transitionStatus({ id: "user-1" } as never, voucher.id, VoucherEntryStatus.POSTED))
      .rejects.toThrow(/active Ledger account/i);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.voucherEntryLine.findMany).toHaveBeenCalledTimes(1);
    expect(inventory.postVoucherMovements).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("PostingEngineService.assertDirectlySettable", () => {
  it("allows draft, pending, rejected and cancelled to be set directly", () => {
    for (const status of DIRECTLY_SETTABLE_STATUSES) {
      expect(() => engine.assertDirectlySettable(status)).not.toThrow();
    }
  });

  it("blocks approved from being set directly", () => {
    expect(() => engine.assertDirectlySettable(VoucherEntryStatus.APPROVED)).toThrow(/cannot be set directly/);
  });

  it("blocks posted from being set directly", () => {
    expect(() => engine.assertDirectlySettable(VoucherEntryStatus.POSTED)).toThrow(/cannot be set directly/);
  });

  it("blocks reversed and superseded from being set directly", () => {
    expect(() => engine.assertDirectlySettable(VoucherEntryStatus.REVERSED)).toThrow(/cannot be set directly/);
    expect(() => engine.assertDirectlySettable(VoucherEntryStatus.SUPERSEDED_BY_ALTERATION)).toThrow(/cannot be set directly/);
  });
});

describe("PostingEngineService.assertEditable", () => {
  it("allows editing draft, pending and rejected vouchers", () => {
    expect(() => engine.assertEditable(VoucherEntryStatus.DRAFT)).not.toThrow();
    expect(() => engine.assertEditable(VoucherEntryStatus.PENDING)).not.toThrow();
    expect(() => engine.assertEditable(VoucherEntryStatus.REJECTED)).not.toThrow();
  });

  it("blocks editing an approved or posted voucher", () => {
    expect(() => engine.assertEditable(VoucherEntryStatus.APPROVED)).toThrow(/cannot be edited/);
    expect(() => engine.assertEditable(VoucherEntryStatus.POSTED)).toThrow(/cannot be edited/);
  });

  it("blocks editing a cancelled, reversed or superseded voucher", () => {
    expect(() => engine.assertEditable(VoucherEntryStatus.CANCELLED)).toThrow(/cannot be edited/);
    expect(() => engine.assertEditable(VoucherEntryStatus.REVERSED)).toThrow(/cannot be edited/);
    expect(() => engine.assertEditable(VoucherEntryStatus.SUPERSEDED_BY_ALTERATION)).toThrow(/cannot be edited/);
  });
});

describe("PostingEngineService.reverseVoucher Account identity", () => {
  function reversalHarness(
    lines: Array<Record<string, unknown>>,
    ledgerIds: string[],
  ) {
    const original = {
      id: "voucher-1",
      tenantId: "tenant-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      voucherType: "JOURNAL",
      workflowOrigin: "DIRECT",
      documentKind: null,
      voucherNumber: "JV-1",
      partyName: "Journal",
      partyId: null,
      settlementMode: "on_account",
      currency: "BDT",
      totalAmount: 100,
      sourceType: null,
      sourceId: null,
      fiscalYearId: null,
      branchId: null,
      status: VoucherEntryStatus.POSTED,
      lines: lines.map((line, index) => ({
        id: `line-${index + 1}`,
        accountId: null,
        ledger: "Same historical caption",
        description: null,
        debit: 0,
        credit: 0,
        costCenter: null,
        project: null,
        billReference: null,
        ...line,
      })),
    };
    const create = vi.fn(async () => ({ id: "reversal-1" }));
    const update = vi.fn(async () => ({}));
    const findAccounts = vi.fn(async () => ledgerIds.map((id) => ({ id })));
    const tx = {
      voucherEntry: {
        findUnique: vi.fn(async () => original),
        findFirst: vi.fn(async () => null),
        create,
        update,
      },
      account: { findMany: findAccounts },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const audit = { log: vi.fn(async () => undefined) };
    const inventory = { reverseVoucherMovements: vi.fn(async () => undefined) };
    const service = new PostingEngineService(prisma as never, audit as never, inventory as never);
    return { service, create, findAccounts, inventory };
  }

  const user = { id: "user-1" } as never;

  it("rejects a legacy value line without Account id instead of resolving its caption", async () => {
    const { service, create, findAccounts, inventory } = reversalHarness([
      { debit: 100, credit: 0 },
      { accountId: "ledger-2", debit: 0, credit: 100 },
    ], ["ledger-2"]);

    await expect(service.reverseVoucher(user, "voucher-1")).rejects.toThrow(
      /every non-zero line has a Chart of Accounts ledger ID/,
    );
    expect(findAccounts).not.toHaveBeenCalled();
    expect(inventory.reverseVoucherMovements).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects an Account id outside the original voucher company", async () => {
    const { service, create, inventory } = reversalHarness([
      { accountId: "ledger-1", debit: 100, credit: 0 },
      { accountId: "foreign-ledger", debit: 0, credit: 100 },
    ], ["ledger-1"]);

    await expect(service.reverseVoucher(user, "voucher-1")).rejects.toThrow(
      /missing or foreign Chart of Accounts ledger/,
    );
    expect(inventory.reverseVoucherMovements).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("mirrors debit and credit using Account ids even when captions are identical", async () => {
    const { service, create } = reversalHarness([
      { accountId: "ledger-1", debit: 100, credit: 0 },
      { accountId: "ledger-2", debit: 0, credit: 100 },
    ], ["ledger-1", "ledger-2"]);

    await service.reverseVoucher(user, "voucher-1");

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lines: {
          create: [
            expect.objectContaining({ accountId: "ledger-1", debit: 0, credit: 100 }),
            expect.objectContaining({ accountId: "ledger-2", debit: 100, credit: 0 }),
          ],
        },
      }),
    }));
  });
});
