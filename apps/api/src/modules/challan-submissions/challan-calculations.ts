import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";

const D = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

export interface ChallanItemCalculationInput {
  itemCode?: string;
  description: string;
  unit: string;
  quantity: Prisma.Decimal | number | string;
  rate: Prisma.Decimal | number | string;
  sortOrder?: number;
}

export interface CalculatedChallanItem {
  itemCode: string | null;
  description: string;
  unit: string;
  quantity: Prisma.Decimal;
  rate: Prisma.Decimal;
  amount: Prisma.Decimal;
  sortOrder: number;
}

function requiredDate(value: Date | string, field: string) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} must be a valid date`);
  return date;
}

export function normalizeChallanSchedule(
  challanMonthInput: Date | string,
  periodFromInput: Date | string,
  periodToInput: Date | string,
) {
  const monthInput = requiredDate(challanMonthInput, "Challan Month");
  const periodFrom = requiredDate(periodFromInput, "From Date");
  const periodTo = requiredDate(periodToInput, "To Date");
  if (periodFrom.getTime() > periodTo.getTime()) {
    throw new BadRequestException("From Date cannot be after To Date");
  }

  const challanMonth = new Date(Date.UTC(monthInput.getUTCFullYear(), monthInput.getUTCMonth(), 1));
  const nextMonth = new Date(
    Date.UTC(challanMonth.getUTCFullYear(), challanMonth.getUTCMonth() + 1, 1),
  );
  if (periodFrom < challanMonth || periodTo >= nextMonth) {
    throw new BadRequestException("From Date and To Date must fall within Challan Month");
  }

  return { challanMonth, periodFrom, periodTo };
}

export function calculateChallanItems(items: ChallanItemCalculationInput[]) {
  const calculated: CalculatedChallanItem[] = items.map((item, index) => {
    const description = item.description.trim();
    const unit = item.unit.trim();
    if (!description) throw new BadRequestException("Item description cannot be blank");
    if (!unit) throw new BadRequestException(`Unit for "${description}" cannot be blank`);
    const quantity = D(item.quantity);
    const rate = D(item.rate);
    if (!quantity.isFinite() || quantity.lte(0)) {
      throw new BadRequestException(`Quantity for "${item.description}" must be greater than zero`);
    }
    if (!rate.isFinite() || rate.lte(0)) {
      throw new BadRequestException(`Rate for "${item.description}" must be greater than zero`);
    }
    return {
      itemCode: item.itemCode?.trim() || null,
      description,
      unit,
      quantity,
      rate,
      amount: quantity.mul(rate).toDecimalPlaces(2),
      sortOrder: item.sortOrder ?? index,
    };
  });
  const totalAmount = calculated.reduce((sum, item) => sum.add(item.amount), D(0));
  return { items: calculated, totalAmount };
}

export function resolveApprovedAmount(
  totalAmount: Prisma.Decimal | number | string,
  requested?: Prisma.Decimal | number | string,
) {
  const total = D(totalAmount);
  const approved = requested === undefined ? total : D(requested);
  if (!approved.isFinite() || approved.lte(0)) {
    throw new BadRequestException("Approved amount must be greater than zero");
  }
  if (approved.gt(total)) {
    throw new BadRequestException(
      `Approved amount cannot exceed the challan total of ${total.toFixed(2)}`,
    );
  }
  return approved.toDecimalPlaces(2);
}
