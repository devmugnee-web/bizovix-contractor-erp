import { Prisma } from "@bizovix/database";
import { calculateCompletedProjectReceivable } from "./completed-project-receivable";

const D = (value: number) => new Prisma.Decimal(value);

describe("completed project receivable", () => {
  it("reduces the contract balance by receipts and keeps deducted SD receivable", () => {
    const result = calculateCompletedProjectReceivable({
      contractValue: D(1_000_000),
      receipts: [{
        amount: D(700_000),
        vatDeductedAmount: D(30_000),
        taxDeductedAmount: D(20_000),
        otherDeductionAmount: D(0),
        securityDepositDeductedAmount: D(50_000),
      }],
    });

    expect(result.receivedCash.toFixed(2)).toBe("700000.00");
    expect(result.sdReceivable.toFixed(2)).toBe("50000.00");
    expect(result.outstanding.toFixed(2)).toBe("250000.00");
  });

  it("reduces SD receivable when SD is released", () => {
    const result = calculateCompletedProjectReceivable({
      contractValue: D(100_000),
      receipts: [{ amount: D(90_000), vatDeductedAmount: D(0), taxDeductedAmount: D(0), otherDeductionAmount: D(0), securityDepositDeductedAmount: D(10_000) }],
      securityDepositReleasedAmount: D(4_000),
    });

    expect(result.sdReceivable.toFixed(2)).toBe("6000.00");
    expect(result.outstanding.toFixed(2)).toBe("10000.00");
  });
});
