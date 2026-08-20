import { VendorBillingCycle } from "@bizovix/database";

export function addBillingPeriod(start: Date, billingCycle: VendorBillingCycle): Date {
  const end = new Date(start);
  if (billingCycle === "MONTHLY") end.setMonth(end.getMonth() + 1);
  else if (billingCycle === "QUARTERLY") end.setMonth(end.getMonth() + 3);
  else end.setFullYear(end.getFullYear() + 1);
  return end;
}
