import { roundMoney } from "@/lib/money";

export type ProfitAndLossInput = {
  salesRevenue: number;
  salesReturns: number;
  costOfGoodsSold: number;
  purchaseReturnVariance: number;
  otherIncome: number;
  operatingExpenses: number;
};

export function roundStatementAmount(value: number) {
  return roundMoney(value);
}

/** Perpetual-inventory P&L. Purchases and opening/closing stock never appear
 * here because their effect is already represented by posted MWA COGS. */
export function calculateProfitAndLoss(input: ProfitAndLossInput) {
  const salesRevenue = roundStatementAmount(input.salesRevenue);
  const salesReturns = roundStatementAmount(input.salesReturns);
  const netSales = roundStatementAmount(salesRevenue - salesReturns);
  const costOfGoodsSold = roundStatementAmount(input.costOfGoodsSold);
  const purchaseReturnVariance = roundStatementAmount(input.purchaseReturnVariance);
  const grossProfit = roundStatementAmount(netSales - costOfGoodsSold + purchaseReturnVariance);
  const otherIncome = roundStatementAmount(input.otherIncome);
  const operatingExpenses = roundStatementAmount(input.operatingExpenses);
  const netProfit = roundStatementAmount(grossProfit + otherIncome - operatingExpenses);
  return { salesRevenue, salesReturns, netSales, costOfGoodsSold, purchaseReturnVariance, grossProfit, otherIncome, operatingExpenses, netProfit };
}

/** Bangladesh default financial year: 1 July through 30 June. */
export function getFinancialYearStart(toDate: string) {
  const [yearText, monthText] = toDate.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || month < 1 || month > 12) return `${toDate.slice(0, 4)}-01-01`;
  return `${month >= 7 ? year : year - 1}-07-01`;
}
