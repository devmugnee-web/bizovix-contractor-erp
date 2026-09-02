import { describe, expect, it } from "vitest";

import { getLatestPostingMonthRange } from "./posting-date-range";

describe("getLatestPostingMonthRange", () => {
  it("uses the full calendar month containing the latest posting date", () => {
    expect(getLatestPostingMonthRange(["2026-07-01", "2026-08-20", "2026-08-02"])).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("returns the correct month boundaries for a month-end posting", () => {
    expect(getLatestPostingMonthRange(["2026-03-31"])).toEqual({
      from: "2026-03-01",
      to: "2026-03-31",
    });
  });

  it("ignores invalid and duplicate date values", () => {
    expect(getLatestPostingMonthRange(["", "invalid", "2026-08-20", "2026-08-20"])).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("uses the leap-year month end for February", () => {
    expect(getLatestPostingMonthRange(["2024-02-10"])).toEqual({
      from: "2024-02-01",
      to: "2024-02-29",
    });
  });
});
