import { BadRequestException } from "@nestjs/common";
import {
  calculateChallanItems,
  normalizeChallanSchedule,
  resolveApprovedAmount,
} from "./challan-calculations";

describe("challan calculations", () => {
  it("calculates every line and the authoritative total", () => {
    const result = calculateChallanItems([
      { itemCode: "CEM-01", description: "Cement", unit: "bag", quantity: 500, rate: 600 },
      { description: "Transport", unit: "trip", quantity: 2, rate: 5_000 },
      { description: "Loading", unit: "day", quantity: 1, rate: 10_000 },
    ]);

    expect(result.items.map((item) => item.amount.toFixed(2))).toEqual([
      "300000.00",
      "10000.00",
      "10000.00",
    ]);
    expect(result.totalAmount.toFixed(2)).toBe("320000.00");
  });

  it("rejects non-positive quantity and rate values", () => {
    expect(() =>
      calculateChallanItems([{ description: "Invalid", unit: "bag", quantity: 0, rate: 10 }]),
    ).toThrow(BadRequestException);
    expect(() =>
      calculateChallanItems([{ description: "Invalid", unit: "bag", quantity: 1, rate: 0 }]),
    ).toThrow(BadRequestException);
  });

  it("rejects item descriptions and units that are blank after trimming", () => {
    expect(() =>
      calculateChallanItems([{ description: "   ", unit: "bag", quantity: 1, rate: 10 }]),
    ).toThrow("Item description cannot be blank");
    expect(() =>
      calculateChallanItems([{ description: "Cement", unit: "   ", quantity: 1, rate: 10 }]),
    ).toThrow('Unit for "Cement" cannot be blank');
  });

  it("defaults approval to the backend total and rejects invalid overrides", () => {
    expect(resolveApprovedAmount(320_000).toFixed(2)).toBe("320000.00");
    expect(resolveApprovedAmount(320_000, 300_000).toFixed(2)).toBe("300000.00");
    expect(() => resolveApprovedAmount(320_000, 320_001)).toThrow(BadRequestException);
    expect(() => resolveApprovedAmount(320_000, 0)).toThrow(BadRequestException);
  });

  it("normalizes Challan Month to its UTC first day and accepts only periods within it", () => {
    const schedule = normalizeChallanSchedule(
      "2024-04-18T12:30:00.000Z",
      "2024-04-01T00:00:00.000Z",
      "2024-04-30T23:59:59.999Z",
    );

    expect(schedule.challanMonth.toISOString()).toBe("2024-04-01T00:00:00.000Z");
    expect(() => normalizeChallanSchedule("2024-04-01", "2024-03-31", "2024-04-30")).toThrow(
      "From Date and To Date must fall within Challan Month",
    );
    expect(() => normalizeChallanSchedule("2024-04-01", "2024-04-30", "2024-05-01")).toThrow(
      "From Date and To Date must fall within Challan Month",
    );
    expect(() => normalizeChallanSchedule("2024-04-01", "2024-04-20", "2024-04-10")).toThrow(
      "From Date cannot be after To Date",
    );
  });
});
