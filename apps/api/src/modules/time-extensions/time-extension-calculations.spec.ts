import { calculateRevisedCompletionDate } from "./time-extension-calculations";

describe("calculateRevisedCompletionDate (master task test case 60 — EOT date arithmetic)", () => {
  it("adds 45 days across a month boundary using real calendar-day counting, not approximate month lengths", () => {
    // Original: 2027-06-30. Approved Extension: 45 days. Expected Revised: 2027-08-14.
    const revised = calculateRevisedCompletionDate(new Date("2027-06-30T00:00:00.000Z"), 45);
    expect(revised.toISOString().slice(0, 10)).toBe("2027-08-14");
  });

  it("matches the seeded demo fixture: 2025-05-15 + 45 days = 2025-06-29", () => {
    const revised = calculateRevisedCompletionDate(new Date("2025-05-15T00:00:00.000Z"), 45);
    expect(revised.toISOString().slice(0, 10)).toBe("2025-06-29");
  });

  it("correctly rolls over a year boundary", () => {
    const revised = calculateRevisedCompletionDate(new Date("2026-12-20T00:00:00.000Z"), 20);
    expect(revised.toISOString().slice(0, 10)).toBe("2027-01-09");
  });

  it("returns the same date for a zero-day extension", () => {
    const revised = calculateRevisedCompletionDate(new Date("2027-06-30T00:00:00.000Z"), 0);
    expect(revised.toISOString().slice(0, 10)).toBe("2027-06-30");
  });
});
