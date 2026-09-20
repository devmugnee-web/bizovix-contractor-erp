import { Prisma } from "@prisma/client";
import { ReportsService } from "./reports.service";

describe("All Transactions report", () => {
  it("shows each posted journal once and calculates its amount from one accounting side", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        journalNo: "JV-001",
        journalDate: new Date("2026-09-12T00:00:00.000Z"),
        sourceModule: "PROJECT_RECEIPT",
        status: "POSTED",
        referenceNo: "R-1",
        lines: [
          { debit: new Prisma.Decimal(100), credit: new Prisma.Decimal(0), partyName: "Client", account: { linkedBankAccountId: "bank-1", systemKey: null } },
          { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(100), partyName: null, account: { linkedBankAccountId: null, systemKey: null } },
        ],
      },
    ]);
    const hiddenQuery = jest.fn().mockResolvedValue([]);
    const service = new ReportsService({ journalEntry: { findMany }, $queryRaw: hiddenQuery } as never, {} as never, {} as never);
    const result = await service.run("org-1", "transactions", "all", { page: 1, limit: 20 });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1", status: "POSTED" }) }));
    expect(hiddenQuery).toHaveBeenCalled();
    expect(result.meta.total).toBe(1);
    expect(result.rows[0]).toEqual(expect.objectContaining({ voucher: "JV-001", amount: "100", party: "Client" }));
    expect(result.kpis).toEqual(expect.arrayContaining([{ label: "Inflow", value: "100", kind: "money" }, { label: "Outflow", value: "0", kind: "money" }]));
  });

  it("validates tenant ownership before hiding selected report rows", async () => {
    const transaction = jest.fn();
    const service = new ReportsService({
      journalEntry: { findMany: jest.fn().mockResolvedValue([{ id: "own-1" }]) },
      $transaction: transaction,
    } as never, {} as never, {} as never);
    await expect(service.hideTransactions("org-1", "user-1", ["own-1", "foreign-1"])).rejects.toThrow("unavailable");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("hides selected report rows in one transaction with an audit record", async () => {
    const executeRaw = jest.fn().mockResolvedValue(1);
    const transaction = jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback({ $executeRaw: executeRaw }));
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new ReportsService({
      journalEntry: { findMany: jest.fn().mockResolvedValue([{ id: "own-1" }, { id: "own-2" }]) },
      $transaction: transaction,
    } as never, audit as never, {} as never);
    await expect(service.hideTransactions("org-1", "user-1", ["own-1", "own-2"])).resolves.toEqual({ hidden: 2 });
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "REPORT_TRANSACTIONS_HIDDEN", organizationId: "org-1" }), expect.anything());
  });
});
