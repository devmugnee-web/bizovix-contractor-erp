import { calculateWorkIouTotals } from "./work-iou-calculation";

describe("calculateWorkIouTotals", () => {
  it("calculates authoritative subtotal and total", () => {
    const result = calculateWorkIouTotals(["1250.00", "2350.00", "450.00", "450.00"], "100", "50");
    expect(result.subtotal.toFixed(2)).toBe("4500.00");
    expect(result.otherCharges.toFixed(2)).toBe("100.00");
    expect(result.discount.toFixed(2)).toBe("50.00");
    expect(result.totalAmount.toFixed(2)).toBe("4550.00");
  });

  it("allows an empty draft to total zero", () => {
    const result = calculateWorkIouTotals([], "0", "0");
    expect(result.subtotal.toFixed(2)).toBe("0.00");
    expect(result.totalAmount.toFixed(2)).toBe("0.00");
  });

  it("rejects non-positive item amounts", () => {
    expect(() => calculateWorkIouTotals(["0"])).toThrow(
      "Each item amount must be greater than zero",
    );
  });

  it("rejects a discount greater than subtotal plus charges", () => {
    expect(() => calculateWorkIouTotals(["100"], "10", "111")).toThrow(
      "Discount cannot exceed subtotal plus other charges",
    );
  });
});

