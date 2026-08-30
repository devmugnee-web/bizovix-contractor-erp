import { calculateSalesQuotationCosting } from "./sales-quotation-calculation";

describe("calculateSalesQuotationCosting", () => {
  it("rounds every line and computes tax, overhead, VAT and grand total authoritatively", () => {
    const result = calculateSalesQuotationCosting({
      items: [
        {
          description: "Work",
          quantity: "3.333",
          unit: "LS",
          unitCost: "10.005",
          taxPct: "5",
          unitPrice: "15.005",
        },
      ],
      overheads: [{ description: "Transport", amount: "4.445" }],
      vatApplicable: true,
      vatRate: "15",
    });
    expect(result.items[0].totalCost.toFixed(2)).toBe("33.35");
    expect(result.items[0].taxAmount.toFixed(2)).toBe("1.67");
    expect(result.items[0].totalPrice.toFixed(2)).toBe("50.01");
    expect(result.items[0].profit.toFixed(2)).toBe("16.66");
    expect(result.items[0].marginPct.toFixed(4)).toBe("33.3133");
    expect(result.subtotalBeforeVat.toFixed(2)).toBe("56.13");
    expect(result.vatAmount.toFixed(2)).toBe("8.42");
    expect(result.grandTotal.toFixed(2)).toBe("64.55");
  });

  it("uses zero margin when total selling is zero and ignores VAT when disabled", () => {
    const result = calculateSalesQuotationCosting({
      items: [{ description: "Free", quantity: "1", unit: "LS", unitCost: "10", unitPrice: "0" }],
      vatApplicable: false,
      vatRate: "15",
    });
    expect(result.items[0].marginPct.toFixed(4)).toBe("0.0000");
    expect(result.vatRate.toFixed(2)).toBe("0.00");
    expect(result.vatAmount.toFixed(2)).toBe("0.00");
  });
});
