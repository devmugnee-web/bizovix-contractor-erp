import { describe, expect, it } from "vitest";
import { calculateAttendanceDurations } from "./attendance-time.util.js";

describe("calculateAttendanceDurations", () => {
  const shift = { startTime: "09:00", endTime: "18:00", gracePeriodMinutes: 15 };

  it("calculates late arrival after grace", () => {
    expect(calculateAttendanceDurations("10:01", "18:00", shift)).toEqual({ lateMinutes: 46, overtimeMinutes: 0 });
  });

  it("calculates overtime after shift end", () => {
    expect(calculateAttendanceDurations("09:10", "19:30", shift)).toEqual({ lateMinutes: 0, overtimeMinutes: 90 });
  });

  it("supports overnight shifts", () => {
    expect(calculateAttendanceDurations("22:20", "07:30", { startTime: "22:00", endTime: "06:00", gracePeriodMinutes: 10 })).toEqual({ lateMinutes: 10, overtimeMinutes: 90 });
  });
});
