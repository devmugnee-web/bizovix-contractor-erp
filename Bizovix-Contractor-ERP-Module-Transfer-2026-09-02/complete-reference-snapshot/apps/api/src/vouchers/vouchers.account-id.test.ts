import { describe, expect, it, vi } from "vitest";

import type { CreateVoucherDto } from "./dto/create-voucher.dto.js";
import { VouchersService } from "./vouchers.service.js";

type AccountFixture = {
  id: string;
  code: string;
  name: string;
  isSystem?: boolean;
  accountGroup?: { code: string } | null;
};

function dto(lines: CreateVoucherDto["lines"]): CreateVoucherDto {
  return {
    workspaceId: "workspace-1",
    voucherType: "purchase",
    voucherDate: "2026-08-31",
    partyName: "Supplier One",
    status: "draft",
    lines,
  };
}

function buildBinder(accounts: AccountFixture[]) {
  const prisma = {
    account: {
      findMany: vi.fn(async ({ where }: { where: { code?: { in: string[] } } }) => {
        if (where.code?.in) {
          return accounts.filter((account) => account.isSystem && where.code?.in.includes(account.code));
        }
        return [];
      }),
    },
  };
  const service = new VouchersService(prisma as never, {} as never, {} as never, {} as never);
  return (input: CreateVoucherDto, partyAccount: { id: string; name: string; accountGroup: { code: string } | null } | null = null) =>
    (service as unknown as {
      bindLinesToAccountIds(
        companyId: string,
        value: CreateVoucherDto,
        account: { id: string; name: string; accountGroup: { code: string } | null } | null,
      ): Promise<void>;
    }).bindLinesToAccountIds("company-1", input, partyAccount);
}

describe("VouchersService account-id binding", () => {
  it("binds protected posting roles by immutable code", async () => {
    const input = dto([
      { id: "inventory", ledger: "Inventory Control", description: "Stock", debit: 100, credit: 0 },
      { id: "supplier", ledger: "Supplier One", description: "Due", debit: 0, credit: 100 },
    ]);
    const bind = buildBinder([
      { id: "inventory-id", code: "1210001", name: "Inventory Control", isSystem: true },
      { id: "unrelated-same-name", code: "4200001", name: "Supplier One" },
    ]);

    await bind(input, { id: "supplier-id", name: "Supplier One", accountGroup: { code: "AP" } });

    expect(input.lines).toEqual([
      expect.objectContaining({ accountId: "inventory-id", ledger: "Inventory Control" }),
      expect.objectContaining({ accountId: "supplier-id", ledger: "Supplier One" }),
    ]);
  });

  it("rejects a supplied id that tries to redirect a protected role", async () => {
    const input = dto([
      { id: "inventory", accountId: "expense-id", ledger: "Inventory Control", description: "Stock", debit: 100, credit: 0 },
      { id: "supplier", accountId: "supplier-id", ledger: "Supplier One", description: "Due", debit: 0, credit: 100 },
    ]);
    const bind = buildBinder([
      { id: "inventory-id", code: "1210001", name: "Inventory Control", isSystem: true },
    ]);

    await expect(bind(input, { id: "supplier-id", name: "Supplier One", accountGroup: { code: "AP" } }))
      .rejects.toThrow("must post to protected account 1210001");
  });

  it("rejects even a unique custom caption when its Account id is absent", async () => {
    const input = dto([
      { id: "one", ledger: "Freight Expense", description: "Freight", debit: 50, credit: 0 },
      { id: "two", accountId: "supplier-id", ledger: "Supplier One", description: "Due", debit: 0, credit: 50 },
    ]);
    const bind = buildBinder([
      { id: "freight-id", code: "5120001", name: "Freight Expense" },
    ]);

    await expect(bind(input, { id: "supplier-id", name: "Supplier One", accountGroup: { code: "AP" } }))
      .rejects.toThrow("Select one active Chart of Accounts ledger by ID for Freight Expense");
  });

  it("rejects ambiguous or unknown free-text ledgers", async () => {
    const input = dto([
      { id: "one", ledger: "Duplicate", description: "Ambiguous", debit: 50, credit: 0 },
      { id: "two", accountId: "supplier-id", ledger: "Supplier One", description: "Due", debit: 0, credit: 50 },
    ]);
    const bind = buildBinder([
      { id: "duplicate-1", code: "5120001", name: "Duplicate" },
      { id: "duplicate-2", code: "5210001", name: "Duplicate" },
    ]);

    await expect(bind(input, { id: "supplier-id", name: "Supplier One", accountGroup: { code: "AP" } }))
      .rejects.toThrow("Select one active Chart of Accounts ledger by ID for Duplicate");
  });
});
