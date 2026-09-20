import { Prisma } from "@prisma/client";
import { ReportsService } from "./reports.service";

describe("ReportsService bill maturity report", () => {
  const organizationId = "org-1";
  const organizationMaster = { shortName: "Test Organization" };
  const project = { workName: "Test Project", organizationMaster };
  const payableFindMany = jest.fn();
  const receivableFindMany = jest.fn();
  const service = new ReportsService(
    {
      payable: { findMany: payableFindMany },
      receivable: { findMany: receivableFindMany },
    } as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 8, 12, 12));
    payableFindMany.mockReset();
    receivableFindMany.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calculates outstanding amounts and every maturity bucket from actual due dates", async () => {
    payableFindMany.mockResolvedValue([
      {
        billNo: "PAY-OVERDUE",
        partyName: "Vendor One",
        billDate: new Date(2026, 7, 1),
        dueDate: new Date(2026, 8, 11),
        amount: new Prisma.Decimal(1_000),
        paidAmount: new Prisma.Decimal(250),
        project,
      },
      {
        billNo: "PAY-TODAY",
        partyName: "Vendor Two",
        billDate: new Date(2026, 7, 2),
        dueDate: new Date(2026, 8, 12),
        amount: new Prisma.Decimal(500),
        paidAmount: new Prisma.Decimal(0),
        project: null,
      },
      {
        billNo: "PAY-NO-DATE",
        partyName: "Vendor Three",
        billDate: new Date(2026, 7, 3),
        dueDate: null,
        amount: new Prisma.Decimal(300),
        paidAmount: new Prisma.Decimal(0),
        project,
      },
    ]);
    receivableFindMany.mockResolvedValue([
      {
        billNo: "REC-7-DAYS",
        partyName: "Client One",
        billDate: new Date(2026, 7, 4),
        dueDate: new Date(2026, 8, 19),
        amount: new Prisma.Decimal(2_000),
        receivedAmount: new Prisma.Decimal(500),
        project,
      },
      {
        billNo: "REC-15-DAYS",
        partyName: "Client Two",
        billDate: new Date(2026, 7, 5),
        dueDate: new Date(2026, 8, 27),
        amount: new Prisma.Decimal(3_000),
        receivedAmount: new Prisma.Decimal(0),
        project,
      },
      {
        billNo: "REC-UPCOMING",
        partyName: "Client Three",
        billDate: new Date(2026, 7, 6),
        dueDate: new Date(2026, 8, 28),
        amount: new Prisma.Decimal(4_000),
        receivedAmount: new Prisma.Decimal(1_000),
        project,
      },
      {
        billNo: "REC-SETTLED",
        partyName: "Client Four",
        billDate: new Date(2026, 7, 7),
        dueDate: new Date(2026, 8, 10),
        amount: new Prisma.Decimal(100),
        receivedAmount: new Prisma.Decimal(100),
        project,
      },
    ]);

    const result = await service.run(organizationId, "expiry-due", "bill-maturity", {
      page: 1,
      limit: 5,
    });

    expect(result.meta).toEqual({ page: 1, limit: 5, total: 6, totalPages: 2 });
    expect(result.rows.map((row) => row.status)).toEqual([
      "OVERDUE",
      "DUE_TODAY",
      "DUE_WITHIN_7",
      "DUE_WITHIN_15",
      "UPCOMING",
    ]);
    expect(Object.fromEntries(result.kpis.map((kpi) => [kpi.label, kpi.value]))).toEqual({
      "Total Outstanding": "9050",
      "Payable Outstanding": "1550",
      "Receivable Outstanding": "7500",
      Overdue: "1",
      "Due in 1-7 Days": "1",
      "Due in 8-15 Days": "1",
      Upcoming: "1",
      "Date Not Set": "1",
    });
  });

  it("passes due-date, organization, project, and search filters to both bill sources", async () => {
    payableFindMany.mockResolvedValue([]);
    receivableFindMany.mockResolvedValue([]);

    await service.run(organizationId, "expiry-due", "bill-maturity", {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      organizationMasterId: "master-1",
      workId: "work-1",
      search: "invoice",
    });

    for (const finder of [payableFindMany, receivableFindMany]) {
      expect(finder).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            organizationId,
            dueDate: {
              gte: new Date("2026-09-01"),
              lte: new Date("2026-09-30T23:59:59.999Z"),
            },
            project: { id: "work-1", organizationMasterId: "master-1" },
            OR: expect.any(Array),
          }),
        }),
      );
    }
  });

  it("filters by bill type and maturity status", async () => {
    payableFindMany.mockResolvedValue([
      {
        billNo: "PAY-1",
        partyName: "Vendor",
        billDate: new Date(2026, 7, 1),
        dueDate: new Date(2026, 8, 13),
        amount: new Prisma.Decimal(1_000),
        paidAmount: new Prisma.Decimal(0),
        project,
      },
    ]);
    receivableFindMany.mockResolvedValue([
      {
        billNo: "REC-1",
        partyName: "Client",
        billDate: new Date(2026, 7, 1),
        dueDate: new Date(2026, 8, 13),
        amount: new Prisma.Decimal(2_000),
        receivedAmount: new Prisma.Decimal(0),
        project,
      },
    ]);

    const payable = await service.run(organizationId, "expiry-due", "bill-maturity", {
      status: "PAYABLE",
    });
    const dueWithinSeven = await service.run(organizationId, "expiry-due", "bill-maturity", {
      status: "DUE_WITHIN_7",
    });

    expect(payable.rows).toHaveLength(1);
    expect(payable.rows[0]).toEqual(expect.objectContaining({ type: "PAYABLE", bill: "PAY-1" }));
    expect(dueWithinSeven.rows).toHaveLength(2);
    expect(dueWithinSeven.rows.every((row) => row.status === "DUE_WITHIN_7")).toBe(true);
  });
});

describe("ReportsService expense category report", () => {
  const expenseFindMany = jest.fn();
  const service = new ReportsService(
    { expense: { findMany: expenseFindMany } } as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => {
    expenseFindMany.mockReset();
  });

  it("applies every visible filter and excludes reversed expense records", async () => {
    expenseFindMany.mockResolvedValue([]);

    await service.run("org-1", "expenses", "category", {
      dateFrom: "2026-09-01",
      dateTo: "2026-09-30",
      organizationMasterId: "master-1",
      workId: "work-1",
      accountId: "account-1",
      category: "head-1",
      search: "  equipment  ",
    });

    expect(expenseFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: "org-1",
          workId: "work-1",
          paidFromAccountId: "account-1",
          expenseHeadId: "head-1",
          work: { organizationMasterId: "master-1" },
          expenseDate: {
            gte: new Date("2026-09-01"),
            lte: new Date("2026-09-30T23:59:59.999Z"),
          },
          status: { notIn: ["REJECTED", "CANCELLED", "AMENDED"] },
          OR: expect.arrayContaining([
            { description: { contains: "equipment", mode: "insensitive" } },
            { referenceNo: { contains: "equipment", mode: "insensitive" } },
            { category: { contains: "equipment", mode: "insensitive" } },
          ]),
        }),
      }),
    );
  });

  it("sorts categories by contribution and calculates totals, percentages, and counts", async () => {
    const equipmentHead = { name: "Equipment" };
    const transportHead = { name: "Transport" };
    expenseFindMany.mockResolvedValue([
      { amount: new Prisma.Decimal(800), expenseHead: equipmentHead },
      { amount: new Prisma.Decimal(200), expenseHead: transportHead },
      { amount: new Prisma.Decimal(400), expenseHead: equipmentHead },
    ]);

    const result = await service.run("org-1", "expenses", "category", { page: 1, limit: 5 });

    expect(result.meta).toEqual({ page: 1, limit: 5, total: 2, totalPages: 1 });
    expect(result.rows).toEqual([
      { category: "Equipment", total: "1200", percentage: "85.71%", count: 2 },
      { category: "Transport", total: "200", percentage: "14.29%", count: 1 },
    ]);
    expect(Object.fromEntries(result.kpis.map((kpi) => [kpi.label, kpi.value]))).toEqual({
      "Total Expense": "1400",
      Categories: "2",
      Transactions: "3",
    });
  });
});

describe("ReportsService balance sheet report", () => {
  const journalLineFindMany = jest.fn();
  const service = new ReportsService(
    { journalLine: { findMany: journalLineFindMany } } as never,
    {} as never,
    {} as never,
  );
  const line = (
    accountId: string,
    code: string,
    name: string,
    accountType: string,
    debit: number,
    credit: number,
  ) => ({
    accountId,
    debit: new Prisma.Decimal(debit),
    credit: new Prisma.Decimal(credit),
    account: { code, name, accountType },
  });

  beforeEach(() => {
    journalLineFindMany.mockReset();
    journalLineFindMany.mockResolvedValue([
      line("bank", "1020", "Bank", "ASSET", 1_000, 0),
      line("receivable", "1100", "Accounts Receivable", "ASSET", 500, 0),
      line("payable", "2010", "Accounts Payable", "LIABILITY", 0, 200),
      line("capital", "3010", "Opening Capital", "EQUITY", 0, 1_000),
      line("revenue", "4010", "Project Revenue", "INCOME", 0, 600),
      line("expense", "5010", "Project Expense", "EXPENSE", 300, 0),
    ]);
  });

  it("adds unclosed earnings to equity and produces a balanced as-of statement", async () => {
    const result = await service.run("org-1", "financial", "balance-sheet", {
      dateFrom: "2026-01-01",
      dateTo: "2026-09-12",
      page: 1,
      limit: 10,
    });

    expect(journalLineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          journalEntry: {
            organizationId: "org-1",
            status: "POSTED",
            journalDate: { lte: new Date("2026-09-12T23:59:59.999Z") },
          },
        },
      }),
    );
    expect(Object.fromEntries(result.kpis.map((kpi) => [kpi.label, kpi.value]))).toEqual({
      "Total Assets": "1500",
      "Total Liabilities": "200",
      "Total Equity": "1300",
      "Current Earnings": "300",
      Difference: "0",
    });
    expect(result.rows).toEqual([
      expect.objectContaining({ section: "ASSET", account: "Bank", balance: "1000" }),
      expect.objectContaining({
        section: "ASSET",
        account: "Accounts Receivable",
        balance: "500",
      }),
      expect.objectContaining({ section: "LIABILITY", account: "Accounts Payable", balance: "200" }),
      expect.objectContaining({ section: "EQUITY", account: "Opening Capital", balance: "1000" }),
      expect.objectContaining({
        section: "EQUITY",
        account: "Current Earnings (Unclosed)",
        balance: "300",
      }),
    ]);
  });

  it("filters only the account breakdown while keeping full statement totals", async () => {
    const result = await service.run("org-1", "financial", "balance-sheet", {
      accountId: "bank",
      search: "bank",
    });

    expect(result.rows).toEqual([
      expect.objectContaining({ accountId: "bank", account: "Bank" }),
    ]);
    expect(result.kpis.find((kpi) => kpi.label === "Difference")?.value).toBe("0");
  });
});
