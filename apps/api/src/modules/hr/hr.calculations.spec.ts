import { calculateAttendanceDuration, calculatePayrollAmounts, normalizeSalaryComponents } from "./hr.calculations";

describe("HR calculations", () => {
  it("validates salary component totals", () => {
    expect(normalizeSalaryComponents([{ name: "Basic", percent: 50 }, { name: "Allowances", percent: 50 }])).toHaveLength(2);
    expect(() => normalizeSalaryComponents([{ name: "Basic", percent: 90 }])).toThrow("total 100");
  });
  it("calculates late, overtime and overnight worked minutes", () => {
    expect(calculateAttendanceDuration("09:20", "18:15", { startTime: "09:00", endTime: "18:00", gracePeriodMinutes: 10 })).toEqual({ workedMinutes: 535, lateMinutes: 10, overtimeMinutes: 15 });
    expect(calculateAttendanceDuration("22:00", "06:00", { startTime: "22:00", endTime: "06:00", gracePeriodMinutes: 0 }).workedMinutes).toBe(480);
  });
  it("prorates payroll and applies PF plus operational deductions", () => {
    const row = calculatePayrollAmounts({ grossSalary: 52_000, presentDays: 13, workingDays: 26, basicPercent: 50, pfRate: 10, loanDeduction: 1_000 });
    expect(row.proratedGross.toFixed(4)).toBe("26000.0000");
    expect(row.providentFund.toFixed(4)).toBe("2600.0000");
    expect(row.totalDeduction.toFixed(4)).toBe("3600.0000");
    expect(row.netPayable.toFixed(4)).toBe("22400.0000");
  });
  it("rejects deductions above prorated gross", () => {
    expect(() => calculatePayrollAmounts({ grossSalary: 10_000, presentDays: 1, workingDays: 30, loanDeduction: 1_000 })).toThrow("Deductions exceed");
  });
});
