import { describe, expect, it } from "vitest";

import { parseAppDateTimeInput } from "./app-date-time-input";

describe("parseAppDateTimeInput", () => {
  it.each([
    ["31/08/2026 17:05", "2026-08-31T17:05"],
    ["31.08.2026 7:05", "2026-08-31T07:05"],
    ["31-08-26 07:05", "2026-08-31T07:05"],
  ])(
    "normalizes %s without converting its local wall-clock time",
    (input, expected) => {
      expect(parseAppDateTimeInput(input)).toBe(expected);
    },
  );

  it.each([
    "31/02/2026 12:00",
    "29/02/2025 12:00",
    "31/08/2026 24:00",
    "31/08/2026 12:60",
    "2026-08-31T12:00",
    "31/08/2026",
  ])("rejects invalid or unsupported input %s", (input) => {
    expect(parseAppDateTimeInput(input)).toBeNull();
  });

  it("accepts a leap-day local time", () => {
    expect(parseAppDateTimeInput("29/02/2024 23:59")).toBe("2024-02-29T23:59");
  });

  it("uses day/month/year order for ambiguous dates", () => {
    expect(parseAppDateTimeInput("08/01/2026 09:30")).toBe("2026-01-08T09:30");
  });
});
