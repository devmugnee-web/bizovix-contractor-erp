import { BILL_PAGE_MARGINS, BILL_PAYMENT_REQUEST, billAmountInWords, billLetterTotals, billNumber, generateBillLetterPdf } from "./bill-letter-pdf";
import type { ProjectCostingReport } from "@bizovix/types";

describe("Bill letter PDF", () => {
  it("uses 1.25 inches above and 1 inch on the other three sides", () => {
    expect(BILL_PAGE_MARGINS).toEqual({ top: 90, bottom: 72, left: 72, right: 72 });
  });
  it("uses the user's exact payment request wording", () => {
    expect(BILL_PAYMENT_REQUEST).toBe("Therefore, you are kindly requested to pay the above bill in favor of Mugnee Multiple.");
  });
  it("shows the requested discount directly below Total without inventing an amount", () => {
    expect(billLetterTotals({ rows: [], itemsTotalPrice: "100.00", totalPrice: "110.00", adjustments: [{ label: "Freight Cost", amount: "10.00" }] })).toEqual([
      { label: "Total=", amount: "100.00", digits: 3 },
      { label: "Discount for Extended LED Display", amount: null, digits: 3 },
      { label: "Freight Cost", amount: "10.00", digits: 3 },
      { label: "Grand Total =", amount: "110.00", digits: 2 },
    ]);
  });
  it("preserves an existing discount once, other charges and the saved grand total", () => {
    const report = { rows: [], itemsTotalPrice: "100.00", totalPrice: "105.00", adjustments: [{ label: "Freight Cost", amount: "10.00" }, { label: "Discount for Extended LED Display", amount: "-5.00" }] };
    const before = JSON.stringify(report);
    const totals = billLetterTotals(report);
    expect(totals.filter((entry) => entry.label === "Discount for Extended LED Display")).toEqual([{ label: "Discount for Extended LED Display", amount: "-5.00", digits: 3 }]);
    expect(totals[1]?.label).toBe("Discount for Extended LED Display");
    expect(totals.at(-1)?.amount).toBe("105.00");
    expect(JSON.stringify(report)).toBe(before);
  });
  it.each([
    ["0", "Zero Taka Only."],
    ["19", "Nineteen Taka Only."],
    ["100.05", "One Hundred Taka and Five Paisa Only."],
    ["2840000", "Twenty-Eight Lakh Forty Thousand Taka Only."],
    ["100190.12", "One Lakh One Hundred Ninety Taka and Twelve Paisa Only."],
    ["10000000", "One Crore Taka Only."],
    ["1000000000", "One Hundred Crore Taka Only."],
    ["-12.50", "Minus Twelve Taka and Fifty Paisa Only."],
    ["99.995", "One Hundred Taka Only."],
  ])("writes %s using BDT lakh/crore and exact paisa", (value, expected) => {
    expect(billAmountInWords(value)).toBe(expected);
  });
  it("retains six-decimal saved rates and formats reference-style totals without floating-point loss", () => {
    expect(billNumber("33.333333", 3, 6)).toBe("33.333333");
    expect(billNumber("122500.3")).toBe("122500.300");
    expect(billNumber("2840000", 2, 2, true)).toBe("2,840,000.00");
    expect(billNumber("9007199254740993.12", 2, 2, true)).toBe("9,007,199,254,740,993.12");
    expect(billNumber("39.600", 0, 3)).toBe("39.6");
  });
  it("generates the letter without changing saved report rows or totals", async () => {
    const report: ProjectCostingReport = {
      source: "TENDER_COSTING", project: { id: "test", workName: "Supply of equipment", organizationName: "Saved Authority" },
      tenderNumber: "TEST-1", pa: { name: "Saved PA", designation: "Engineer", phone: null, email: null, address: "Saved Address" },
      rows: [{ id: "item-1", productName: "Display", unit: "Nos", quantity: "2", unitPrice: "50.000000", totalPrice: "100.00" }],
      itemsTotalPrice: "100.00", totalPrice: "100.00", emptyReason: null,
    };
    const before = JSON.stringify(report);
    const pdf = await generateBillLetterPdf(report, { productDetails: { "item-1": "Brand: Saved Brand\nModel: Saved Model" } });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.toString("latin1")).toContain("/Times-Roman");
    expect(pdf.toString("latin1")).toContain("/Times-Bold");
    expect(pdf.toString("latin1").match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
    expect(JSON.stringify(report)).toBe(before);
  });
});
