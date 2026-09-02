import { describe, expect, it, vi } from "vitest";
import { PartyType, VoucherEntryStatus } from "../generated/prisma/index.js";
import { deactivatePartyAccount, ensurePartyAccount, removePartyAccountSafely } from "./party-account-sync.js";

const party = {
  id: "customer-1",
  tenantId: "tenant-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  name: "Bikrampur",
  type: PartyType.CUSTOMER,
};

function mockTx(options?: {
  status?: "ACTIVE" | "INACTIVE";
  partyVouchers?: number;
  linkedLines?: number;
  tagged?: boolean;
  accountName?: string;
  duplicateTag?: boolean;
}) {
  const account = {
    id: "ledger-1",
    companyId: party.companyId,
    parentId: "parent-1",
    level: "LEDGER",
    code: "1231001",
    name: options?.accountName ?? party.name,
    nature: "ASSET",
    isSystem: false,
    status: options?.status ?? "INACTIVE",
    bankDetails: options?.tagged
      ? { partyMaster: { partyId: party.id, partyType: party.type, workspaceId: party.workspaceId } }
      : null,
  };
  const duplicateTaggedAccount = {
    ...account,
    id: "ledger-duplicate",
    code: "1231002",
  };
  const createdAccount = {
    ...account,
    id: "ledger-new",
    code: "1231002",
    status: "ACTIVE",
  };
  return {
    account: {
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(
        where?.code === "3100001"
          ? { id: "opening-equity", name: "Opening Balance Equity" }
          : where?.id
            ? where.id === account.id ? account : null
            : { id: "parent-1" },
      )),
      findMany: vi.fn().mockResolvedValue(options?.duplicateTag ? [account, duplicateTaggedAccount] : [account]),
      findUnique: vi.fn(),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...createdAccount, ...data })),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...account, ...data })),
      delete: vi.fn().mockResolvedValue(account),
    },
    accountGroup: { findUnique: vi.fn().mockResolvedValue({ id: "ar-group" }) },
    party: { update: vi.fn().mockResolvedValue({ ...party, ledgerAccountId: "ledger-1" }) },
    voucherEntry: {
      count: vi.fn().mockResolvedValue(options?.partyVouchers ?? 0),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "opening-voucher" }),
      update: vi.fn(),
    },
    voucherEntryLine: { count: vi.fn().mockResolvedValue(options?.linkedLines ?? 0) },
  };
}

describe("party account synchronization", () => {
  it("reactivates and permanently tags the explicitly linked customer ledger", async () => {
    const tx = mockTx();
    await ensurePartyAccount(tx as never, { ...party, ledgerAccountId: "ledger-1" });
    expect(tx.party.update).not.toHaveBeenCalled();
    expect(tx.account.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ledger-1" },
      data: expect.objectContaining({
        parentId: "parent-1",
        name: "Bikrampur",
        status: "ACTIVE",
        bankDetails: { partyMaster: { partyId: party.id, partyType: "CUSTOMER", workspaceId: party.workspaceId } },
      }),
    }));
  });

  it("reconnects an exact partyMaster-tagged ledger and preserves Party rename behavior", async () => {
    const tx = mockTx({ tagged: true, accountName: "Old Customer Name" });

    await ensurePartyAccount(tx as never, party);

    expect(tx.account.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "ledger-1" },
      data: expect.objectContaining({ name: party.name }),
    }));
    expect(tx.party.update).toHaveBeenCalledWith({ where: { id: party.id }, data: { ledgerAccountId: "ledger-1" } });
  });

  it("creates a fresh Party ledger instead of adopting a same-named untagged ledger", async () => {
    const tx = mockTx();

    await ensurePartyAccount(tx as never, party);

    expect(tx.account.update).not.toHaveBeenCalled();
    expect(tx.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: "1231002",
        name: party.name,
        parentId: "parent-1",
        bankDetails: { partyMaster: { partyId: party.id, partyType: "CUSTOMER", workspaceId: party.workspaceId } },
      }),
    });
    expect(tx.party.update).toHaveBeenCalledWith({ where: { id: party.id }, data: { ledgerAccountId: "ledger-new" } });
  });

  it("fails closed when duplicate ledgers carry the same exact Party tag", async () => {
    const tx = mockTx({ tagged: true, duplicateTag: true });

    await expect(ensurePartyAccount(tx as never, party)).rejects.toThrow("multiple tagged Chart of Accounts ledgers");
    expect(tx.account.update).not.toHaveBeenCalled();
    expect(tx.account.create).not.toHaveBeenCalled();
  });

  it("deactivates the linked ledger when its party moves to Recycle Bin", async () => {
    const tx = mockTx({ status: "ACTIVE" });
    await deactivatePartyAccount(tx as never, { ...party, ledgerAccountId: "ledger-1" });
    expect(tx.account.update).toHaveBeenCalledWith({ where: { id: "ledger-1" }, data: { status: "INACTIVE" } });
  });

  it("does not deactivate a coincidentally same-named untagged ledger", async () => {
    const tx = mockTx({ status: "ACTIVE" });

    await deactivatePartyAccount(tx as never, party);

    expect(tx.account.update).not.toHaveBeenCalled();
  });

  it("keeps an inactive historical ledger when the party has vouchers", async () => {
    const tx = mockTx({ partyVouchers: 1 });
    await removePartyAccountSafely(tx as never, { ...party, ledgerAccountId: "ledger-1" });
    expect(tx.account.delete).not.toHaveBeenCalled();
    expect(tx.account.update).toHaveBeenCalledWith({ where: { id: "ledger-1" }, data: { status: "INACTIVE" } });
  });

  it("deletes only an unused ledger during permanent Party deletion", async () => {
    const tx = mockTx();
    await removePartyAccountSafely(tx as never, { ...party, ledgerAccountId: "ledger-1" });
    expect(tx.party.update).toHaveBeenCalledWith({ where: { id: party.id }, data: { ledgerAccountId: null } });
    expect(tx.account.delete).toHaveBeenCalledWith({ where: { id: "ledger-1" } });
  });

  it("does not permanently delete a coincidentally same-named untagged ledger", async () => {
    const tx = mockTx();

    await removePartyAccountSafely(tx as never, party);

    expect(tx.voucherEntry.count).not.toHaveBeenCalled();
    expect(tx.account.delete).not.toHaveBeenCalled();
    expect(tx.party.update).not.toHaveBeenCalled();
  });

  it("posts a customer opening balance to immutable account IDs", async () => {
    const tx = mockTx();
    const openingParty = {
      ...party,
      openingBalance: 250,
      openingBalanceDate: new Date("2026-01-01T00:00:00.000Z"),
      createdByUserId: "user-1",
    };

    await ensurePartyAccount(tx as never, { ...openingParty, ledgerAccountId: "ledger-1" }, "user-1");

    expect(tx.voucherEntry.create).toHaveBeenCalledTimes(1);
    expect(tx.voucherEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        voucherNumber: "OB-PARTY-1231001",
        partyId: party.id,
        sourceType: "PARTY_OPENING_BALANCE",
        sourceId: party.id,
        status: VoucherEntryStatus.POSTED,
        debit: 250,
        credit: 250,
        lines: {
          create: [
            expect.objectContaining({ accountId: "ledger-1", debit: 250, credit: 0 }),
            expect.objectContaining({ accountId: "opening-equity", debit: 0, credit: 250 }),
          ],
        },
      }),
    });
  });

  it("reverses a changed opening balance and posts a new version without deleting history", async () => {
    const tx = mockTx();
    tx.voucherEntry.findFirst.mockResolvedValue({
      id: "opening-v1",
      voucherNumber: "OB-PARTY-1231001",
      voucherDate: new Date("2026-01-01T00:00:00.000Z"),
      status: VoucherEntryStatus.POSTED,
      postingVersion: 1,
      totalAmount: 100,
      debit: 100,
      credit: 100,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      lines: [
        { accountId: "ledger-1", ledger: party.name, description: "Opening balance", debit: 100, credit: 0, costCenter: null, project: null, billReference: null },
        { accountId: "opening-equity", ledger: "Opening Balance Equity", description: "Opening offset", debit: 0, credit: 100, costCenter: null, project: null, billReference: null },
      ],
    });

    await ensurePartyAccount(tx as never, {
      ...party,
      ledgerAccountId: "ledger-1",
      openingBalance: 175,
      openingBalanceDate: new Date("2026-01-01T00:00:00.000Z"),
      createdByUserId: "user-1",
    }, "user-1");

    expect(tx.voucherEntry.create).toHaveBeenCalledTimes(2);
    expect(tx.voucherEntry.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        voucherNumber: "OB-PARTY-1231001-REV",
        reversalOfId: "opening-v1",
        lines: {
          create: [
            expect.objectContaining({ accountId: "ledger-1", debit: 0, credit: 100 }),
            expect.objectContaining({ accountId: "opening-equity", debit: 100, credit: 0 }),
          ],
        },
      }),
    });
    expect(tx.voucherEntry.update).toHaveBeenCalledWith({
      where: { id: "opening-v1" },
      data: { status: VoucherEntryStatus.REVERSED },
    });
    expect(tx.voucherEntry.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        voucherNumber: "OB-PARTY-1231001-V2",
        postingVersion: 2,
        totalAmount: 175,
      }),
    });
  });
});
