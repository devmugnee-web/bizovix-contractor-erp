import { CashBankService } from "./cash-bank.service";

describe("CashBankService Account ID routing", () => {
  it("resolves Main Cash through the configured Chart of Accounts ID after a display-name change", async () => {
    const bankAccount = {
      id: "bank-main-id",
      organizationId: "org-1",
      accountName: "Head Office Drawer",
      accountType: "CASH",
      isActive: true,
    };
    const prisma = {
      financeSetting: {
        findUnique: jest.fn().mockResolvedValue({
          defaultCashAccountId: "ledger-main-id",
          defaultPettyCashAccountId: "ledger-petty-id",
        }),
      },
      ledgerAccount: {
        findFirst: jest.fn().mockResolvedValue({ id: "ledger-main-id", bankAccount }),
      },
    };
    const service = new CashBankService(prisma as never, {} as never, {} as never);
    jest.spyOn(service, "ensureCashAccounts").mockResolvedValue(undefined);

    await expect(service.configuredCashAccount("org-1", "MAIN_CASH")).resolves.toBe(bankAccount);
    expect(prisma.ledgerAccount.findFirst).toHaveBeenCalledWith({
      where: { id: "ledger-main-id", organizationId: "org-1", isActive: true },
      include: { bankAccount: true },
    });
  });
});
