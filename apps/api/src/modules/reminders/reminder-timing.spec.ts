import {
  advanceRecurringDate,
  calendarDaysUntil,
  localDayRange,
  nextRecurringDate,
  reminderDueAt,
} from "./reminder-timing";

describe("reminder timing", () => {
  const timeZone = "Asia/Dhaka";

  it("converts a stored calendar date and local reminder time to UTC", () => {
    expect(
      reminderDueAt(new Date("2026-09-15T00:00:00.000Z"), "14:30", timeZone).toISOString(),
    ).toBe("2026-09-15T08:30:00.000Z");
  });

  it("builds the current local day range in the organization timezone", () => {
    const range = localDayRange(new Date("2026-09-15T19:00:00.000Z"), timeZone);
    expect(range.start.toISOString()).toBe("2026-09-15T18:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-16T18:00:00.000Z");
  });

  it("calculates notification windows by local calendar date", () => {
    expect(
      calendarDaysUntil(
        new Date("2026-09-18T00:00:00.000Z"),
        new Date("2026-09-15T19:00:00.000Z"),
        timeZone,
      ),
    ).toBe(2);
  });

  it("uses the local date of timestamped auto-generated reminders", () => {
    expect(
      calendarDaysUntil(
        new Date("2026-09-15T20:00:00.000Z"),
        new Date("2026-09-15T19:00:00.000Z"),
        timeZone,
        false,
      ),
    ).toBe(0);
  });

  it("clamps monthly repeats to the last valid day", () => {
    expect(
      advanceRecurringDate(new Date("2026-01-31T00:00:00.000Z"), "MONTHLY").toISOString(),
    ).toBe("2026-02-28T00:00:00.000Z");
  });

  it("skips missed repeat occurrences and returns the next future date", () => {
    expect(
      nextRecurringDate(
        new Date("2026-09-10T00:00:00.000Z"),
        "09:00",
        "DAILY",
        new Date("2026-09-15T04:00:01.000Z"),
        timeZone,
      ).toISOString(),
    ).toBe("2026-09-16T00:00:00.000Z");
  });
});
