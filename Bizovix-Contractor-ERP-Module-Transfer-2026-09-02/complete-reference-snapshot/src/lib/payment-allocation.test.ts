import { describe, expect, it } from "vitest";

import { getPaymentAllocationMismatch } from "@/lib/payment-allocation";

describe("payment allocation mismatch", () => {
  it("warns when part of a payment is not applied to outstanding bills", () => {
    expect(getPaymentAllocationMismatch(800_000, 500_000, true)).toEqual({
      paymentAmount: 800_000,
      allocatedAmount: 500_000,
      difference: 300_000,
    });
  });

  it("does not warn when payment and bill allocation are equal", () => {
    expect(getPaymentAllocationMismatch(800_000, 800_000, true)).toBeNull();
  });

  it("does not warn for an ordinary advance when there are no outstanding bills", () => {
    expect(getPaymentAllocationMismatch(800_000, 0, false)).toBeNull();
  });

  it("ignores binary floating artifacts and other sub-paisa noise", () => {
    expect(getPaymentAllocationMismatch(0.1 + 0.2, 0.3, true)).toBeNull();
    expect(getPaymentAllocationMismatch(100.004, 100, true)).toBeNull();
  });

  it("does not hide a real one-paisa allocation mismatch", () => {
    expect(getPaymentAllocationMismatch(100.01, 100, true)).toEqual({
      paymentAmount: 100.01,
      allocatedAmount: 100,
      difference: 0.01,
    });

    expect(getPaymentAllocationMismatch(100, 100.01, true)).toEqual({
      paymentAmount: 100,
      allocatedAmount: 100.01,
      difference: -0.01,
    });
  });

  it("treats an exact positive half-cent as a one-paisa mismatch", () => {
    expect(getPaymentAllocationMismatch(100.005, 100, true)).toEqual({
      paymentAmount: 100.01,
      allocatedAmount: 100,
      difference: 0.01,
    });
  });
});
