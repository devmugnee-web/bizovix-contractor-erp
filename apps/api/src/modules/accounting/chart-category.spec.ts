import { AccountingService } from "./accounting.service";

describe("Chart of Accounts category ledgers", () => {
  const parent = { id: "fixed-assets", organizationId: "org-1", code: "1100000", name: "Fixed Assets", accountType: "ASSET", isSystem: true };
  const findFirst = jest.fn().mockResolvedValue(parent);
  const create = jest.fn().mockResolvedValue({ id: "ledger-1", code: "11100001" });
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AccountingService({ ledgerAccount: { findFirst, create } } as never, audit as never, {} as never, {} as never);

  beforeEach(() => { findFirst.mockReset().mockResolvedValue(parent); create.mockClear(); audit.record.mockClear(); });

  it("creates an asset ledger under the Fixed Assets category", async () => {
    await service.createAccount("org-1", "user-1", { code: "11100001", name: "Equipment", parentId: parent.id, accountType: "ASSET", normalBalance: "DEBIT" });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: "org-1", parentId: parent.id, accountType: "ASSET", isSystem: false }) });
  });

  it("rejects a ledger with a different type from its parent category", async () => {
    await expect(service.createAccount("org-1", "user-1", { code: "11100002", name: "Wrong type", parentId: parent.id, accountType: "EXPENSE", normalBalance: "DEBIT" })).rejects.toThrow("must match");
    expect(create).not.toHaveBeenCalled();
  });

  it("allows a ledger directly under a main class", async () => {
    findFirst.mockResolvedValue({ ...parent, id: "assets", code: "1000000", name: "Assets", parentId: null });
    await service.createAccount("org-1", "user-1", { code: "11100003", name: "Asset Ledger", parentId: "assets", accountType: "ASSET", normalBalance: "DEBIT" });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ parentId: "assets" }) });
  });

  it("rejects a ledger as the parent of another ledger", async () => {
    findFirst.mockResolvedValue({ ...parent, id: "ledger-1", code: "11100001", isSystem: false });
    await expect(service.createAccount("org-1", "user-1", { code: "11100004", name: "Nested", parentId: "ledger-1", accountType: "ASSET", normalBalance: "DEBIT" })).rejects.toThrow("cannot be created under another ledger");
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects moving an existing ledger under another ledger", async () => {
    findFirst.mockReset()
      .mockResolvedValueOnce({ id: "ledger-2", code: "11100002", isSystem: false, accountType: "ASSET", normalBalance: "DEBIT", parentId: parent.id })
      .mockResolvedValueOnce({ id: "ledger-1", code: "11100001", isSystem: false, accountType: "ASSET" });
    await expect(service.updateAccount("org-1", "user-1", "ledger-2", { parentId: "ledger-1" })).rejects.toThrow("must be under a class or category");
  });
});
