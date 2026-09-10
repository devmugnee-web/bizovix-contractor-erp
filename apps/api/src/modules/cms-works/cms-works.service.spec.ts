import "reflect-metadata";
import { Prisma } from "@bizovix/database";
import { CmsWorksService } from "./cms-works.service";

describe("CmsWorksService", () => {
  it("shows newly-created ongoing works first", async () => {
    const prisma = {
      cmsWork: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new CmsWorksService(prisma as never, {} as never, {} as never);

    await service.findAll("org-1", { page: 1, limit: 12, status: "ONGOING" });

    expect(prisma.cmsWork.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
    );
  });

  it("calculates the remaining NOA from actual receipts and deductions", async () => {
    const decimal = (value: number) => new Prisma.Decimal(value);
    const prisma = {
      cmsWork: { findFirst: jest.fn().mockResolvedValue({
        id: "work-1", tenderId: "tender-1", workName: "Supply Work", workCategory: "Goods",
        contractValue: decimal(1000000), status: "ONGOING", startDate: null, expectedCompletionDate: null, completionDate: null,
        organizationMaster: { id: "client-1", shortName: "Client", fullName: "Client Organization" },
        pgBgWorkflow: { noaAmount: decimal(1000000), contactSnapshot: null, contact: null }, tender: null, contracts: [],
      }) },
      organizationContact: { findMany: jest.fn().mockResolvedValue([]) },
      expense: { findMany: jest.fn().mockResolvedValue([]) },
      receipt: { findMany: jest.fn().mockResolvedValue([{
        id: "receipt-1", status: "RECEIVED", amount: decimal(700000), vatDeductedAmount: decimal(100000),
        taxDeductedAmount: decimal(50000), securityDepositDeductedAmount: decimal(150000), otherDeductionAmount: decimal(0),
        receiptDate: new Date("2026-09-10T00:00:00.000Z"), createdAt: new Date("2026-09-10T00:00:00.000Z"),
        description: null, receiptType: "PROGRESS_PAYMENT", receivedFrom: "Client", referenceNo: null, receiptNo: "REC-1",
      }]) },
    };
    const service = new CmsWorksService(prisma as never, {} as never, {} as never);

    const overview = await service.overview("org-1", "work-1");

    expect(overview.summary.totalReceipt).toBe("700000.00");
    expect(overview.summary.totalVatDeducted).toBe("100000.00");
    expect(overview.summary.totalTaxDeducted).toBe("50000.00");
    expect(overview.summary.totalSecurityDepositDeducted).toBe("150000.00");
    expect(overview.summary.balanceReceivable).toBe("0.00");
    expect(overview.summary.totalRetentionReceived).toBe("0.00");
    expect(overview.summary.netContractAfterVatTax).toBe("850000.00");
    expect(overview.summary.regularPaymentReceivable).toBe("0.00");
    expect(overview.summary.securityDepositReceivable).toBe("150000.00");
    expect(overview.summary.totalOutstandingReceivable).toBe("150000.00");
    expect(overview.summary.currentCashProfit).toBe("700000.00");
    expect(overview.summary.projectedFinalProfit).toBe("850000.00");
  });
});
