import { Prisma } from "@bizovix/database";
import { assertBillQuantities, billQuantities } from "./bill-availability";

const D = (n: number) => new Prisma.Decimal(n);
describe("Bill quantity reservations", () => {
  it("keeps certified history separate from draft/submitted reservations", () => {
    const result = billQuantities(D(100), [
      { currentQty: D(20), bill: { status: "CERTIFIED" } },
      { currentQty: D(10), bill: { status: "RECEIVED" } },
      { currentQty: D(5), bill: { status: "PARTIALLY_RECEIVED" } },
      { currentQty: D(10), bill: { status: "DRAFT" } },
      { currentQty: D(5), bill: { status: "SUBMITTED" } },
      { currentQty: D(5), bill: { status: "UNDER_REVIEW" } },
      { currentQty: D(90), bill: { status: "REJECTED" } },
      { currentQty: D(90), bill: { status: "CANCELLED" } },
    ]);
    expect(result.previous.toString()).toBe("35");
    expect(result.pending.toString()).toBe("20");
    expect(result.remaining.toString()).toBe("45");
  });
  it("handles decimals and legacy over-reservations without negative availability", () => {
    expect(billQuantities(D(0.3), [{ currentQty: D(0.1), bill: { status: "DRAFT" } }]).remaining.toString()).toBe("0.2");
    expect(billQuantities(D(1), [{ currentQty: D(2), bill: { status: "DRAFT" } }]).remaining.toString()).toBe("0");
  });
  it("rejects empty, zero-only, duplicate, negative and non-finite rows", () => {
    for (const items of [[], [{ boqItemId: "a", currentQty: 0 }], [{ boqItemId: "a", currentQty: 1 }, { boqItemId: "a", currentQty: 2 }], [{ boqItemId: "a", currentQty: -1 }], [{ boqItemId: "a", currentQty: Infinity }]]) expect(() => assertBillQuantities(items)).toThrow();
    expect(() => assertBillQuantities([{ boqItemId: "a", currentQty: 0.1 }])).not.toThrow();
  });
});
