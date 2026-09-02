import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(value ?? 0);

export function normalizeSalaryComponents(components: Array<{ name: string; percent: number }>) {
  const normalized = components.map((component) => ({ name: component.name.trim(), percent: Number(component.percent) }));
  if (normalized.some((component) => !component.name || component.percent < 0)) throw new BadRequestException("Salary components are invalid");
  const total = normalized.reduce((sum, component) => sum + component.percent, 0);
  if (Math.abs(total - 100) > 0.001) throw new BadRequestException("Salary component percentages must total 100");
  return normalized;
}

function clockMinutes(value?: string | null) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function calculateAttendanceDuration(checkIn: string | null, checkOut: string | null, shift?: { startTime: string; endTime: string; gracePeriodMinutes: number } | null) {
  const input = clockMinutes(checkIn), output = clockMinutes(checkOut);
  const shiftStart = clockMinutes(shift?.startTime), shiftEnd = clockMinutes(shift?.endTime);
  let workedMinutes = input !== null && output !== null ? output - input : 0;
  if (workedMinutes < 0) workedMinutes += 1440;
  const lateMinutes = input !== null && shiftStart !== null ? Math.max(0, input - shiftStart - (shift?.gracePeriodMinutes ?? 0)) : 0;
  let scheduledEnd = shiftEnd;
  if (scheduledEnd !== null && shiftStart !== null && scheduledEnd < shiftStart && output !== null && output < shiftStart) scheduledEnd += 1440;
  const normalizedOut = output !== null && shiftStart !== null && output < shiftStart ? output + 1440 : output;
  const overtimeMinutes = normalizedOut !== null && scheduledEnd !== null ? Math.max(0, normalizedOut - scheduledEnd) : 0;
  return { workedMinutes, lateMinutes, overtimeMinutes };
}

export function calculatePayrollAmounts(input: { grossSalary: Prisma.Decimal | number | string; presentDays: Prisma.Decimal | number | string; workingDays: Prisma.Decimal | number | string; basicPercent?: number | null; pfRate?: Prisma.Decimal | number | string | null; iouDeduction?: number; loanDeduction?: number; fineDeduction?: number; lunchBillDeduction?: number }) {
  const gross = D(input.grossSalary), workingDays = D(input.workingDays);
  if (workingDays.lte(0)) throw new BadRequestException("Working days must be positive");
  const presentDays = Prisma.Decimal.min(Prisma.Decimal.max(D(0), D(input.presentDays)), workingDays);
  const proratedGross = gross.mul(presentDays).div(workingDays).toDecimalPlaces(4);
  const baseAmount = input.basicPercent === null || input.basicPercent === undefined ? gross : gross.mul(input.basicPercent).div(100);
  const providentFund = baseAmount.mul(input.pfRate ?? 0).div(100).toDecimalPlaces(4);
  const iouDeduction = D(input.iouDeduction), loanDeduction = D(input.loanDeduction), fineDeduction = D(input.fineDeduction), lunchBillDeduction = D(input.lunchBillDeduction);
  const totalDeduction = providentFund.add(iouDeduction).add(loanDeduction).add(fineDeduction).add(lunchBillDeduction).toDecimalPlaces(4);
  if (totalDeduction.gt(proratedGross)) throw new BadRequestException("Deductions exceed prorated gross");
  return { presentDays, proratedGross, providentFund, iouDeduction, loanDeduction, fineDeduction, lunchBillDeduction, totalDeduction, netPayable: proratedGross.sub(totalDeduction).toDecimalPlaces(4) };
}
