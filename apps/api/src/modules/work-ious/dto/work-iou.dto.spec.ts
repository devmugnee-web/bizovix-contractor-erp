import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateWorkIouDto } from "./work-iou.dto";

const validDraft = {
  iouDate: "2026-08-30",
  paidOn: "2026-08-30",
  paidById: "user-1",
  paidToName: "Example Supplier",
  paymentMethod: "CASH",
  expenseFor: "PROJECT",
  workId: "work-1",
  purpose: "Site visit costs",
};

async function errorsFor(payload: Record<string, unknown>) {
  return validate(plainToInstance(CreateWorkIouDto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe("CreateWorkIouDto", () => {
  it("allows a draft with no items", async () => {
    await expect(errorsFor(validDraft)).resolves.toHaveLength(0);
  });

  it("rejects forged authoritative totals and status", async () => {
    const errors = await errorsFor({
      ...validDraft,
      subtotal: "1.00",
      totalAmount: "1.00",
      settledAmount: "1.00",
      status: "SUBMITTED",
    });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["subtotal", "totalAmount", "settledAmount", "status"]),
    );
  });

  it("requires every supplied item to be complete", async () => {
    const errors = await errorsFor({
      ...validDraft,
      items: [{ expenseDate: "2026-08-30", description: "Fuel" }],
    });
    const itemError = errors.find((error) => error.property === "items");
    expect(itemError?.children?.[0]?.children?.map((child) => child.property)).toEqual(
      expect.arrayContaining(["expenseHeadId", "paidToName", "amount"]),
    );
  });

  it("rejects whitespace-only required text", async () => {
    const errors = await errorsFor({
      ...validDraft,
      paidToName: "   ",
      purpose: "\t",
      items: [
        {
          expenseDate: "2026-08-30",
          description: "   ",
          expenseHeadId: "head-1",
          paidToName: "\n",
          amount: "10.00",
        },
      ],
    });
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(["paidToName", "purpose", "items"]),
    );
  });
});
