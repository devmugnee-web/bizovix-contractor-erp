import { Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | number | string | null | undefined) =>
  new Prisma.Decimal(value ?? 0);

export function calculateCompletedProjectReceivable(input: {
  contractValue: Prisma.Decimal | number | string;
  receipts: Array<{
    amount: Prisma.Decimal | number | string;
    vatDeductedAmount: Prisma.Decimal | number | string;
    taxDeductedAmount: Prisma.Decimal | number | string;
    otherDeductionAmount: Prisma.Decimal | number | string;
    securityDepositDeductedAmount: Prisma.Decimal | number | string;
  }>;
  securityDepositReleasedAmount?: Prisma.Decimal | number | string | null;
}) {
  const receivedCash = input.receipts.reduce((sum, row) => sum.add(row.amount), D(0));
  const settledNonRefundable = input.receipts.reduce(
    (sum, row) =>
      sum
        .add(row.amount)
        .add(row.vatDeductedAmount)
        .add(row.taxDeductedAmount)
        .add(row.otherDeductionAmount),
    D(0),
  );
  const deductedSecurityDeposit = input.receipts.reduce(
    (sum, row) => sum.add(row.securityDepositDeductedAmount),
    D(0),
  );
  const sdReceivable = Prisma.Decimal.max(
    0,
    deductedSecurityDeposit.sub(input.securityDepositReleasedAmount ?? 0),
  );
  const outstanding = Prisma.Decimal.max(0, D(input.contractValue).sub(settledNonRefundable));

  return { receivedCash, sdReceivable, outstanding };
}
