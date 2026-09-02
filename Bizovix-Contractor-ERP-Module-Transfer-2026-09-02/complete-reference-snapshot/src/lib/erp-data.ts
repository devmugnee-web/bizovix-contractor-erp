import { formatCurrency, formatNumber } from "@/lib/format";
import { moneyAmountsEqual, roundMoney, sumMoney } from "@/lib/money";
import { slugify } from "@/lib/utils";
import type {
  PartyRecord,
  AppDataset,
  DashboardMetric,
  InventoryVoucherItem,
  PendingApprovalItem,
  StockItemRecord,
  SummaryMetric,
  TrialBalanceRow,
  VoucherRecord,
  VoucherStatus,
  VoucherType,
} from "@/types/domain";

const liveVoucherStatuses = new Set<VoucherStatus>(["posted"]);
// A Credit Note is a Sales Return — the goods come back into stock, same as a
// Purchase — so it must replay alongside purchase/sales/debit-note, not be
// silently skipped.
const inventoryVoucherTypes = new Set<VoucherType>(["purchase", "sales", "debit-note", "credit-note"]);
// Quotation/Proforma/Sale Order never move stock; a Delivery Note always does.
const NON_STOCK_EFFECT_SALES_DOCUMENT_KINDS = new Set(["quotation", "proforma", "sale-order"]);

/** Purchase and Credit Note (Sales Return) bring stock IN; Sales and Debit
 * Note (Purchase Return) take stock OUT. */
function isInboundStockVoucherType(voucherType: VoucherType) {
  return voucherType === "purchase" || voucherType === "credit-note";
}

/**
 * Whether a sales-side voucher should count for stock movement — mirrors the
 * real backend's rule: Quotation/Proforma/Sale Order never move stock; a
 * Delivery Note always does; an Invoice only does when it's a standalone sale
 * with no delivery note behind it (one converted FROM a delivery note has a
 * sourceVoucherId, and that note already moved the stock).
 */
function affectsStockMovement(
  voucher: { voucherType: VoucherType; documentKind?: string | null; sourceVoucherId?: string | null },
  receiptNoteIds: Set<string>,
) {
  if (voucher.voucherType === "purchase") {
    if (voucher.documentKind === "purchase-order") return false;
    if (voucher.sourceVoucherId && receiptNoteIds.has(voucher.sourceVoucherId)) return false;
    return true;
  }
  if (voucher.voucherType === "debit-note") {
    return true;
  }
  if (voucher.voucherType !== "sales") {
    return true;
  }
  const documentKind = voucher.documentKind ?? undefined;
  if (documentKind) {
    return !NON_STOCK_EFFECT_SALES_DOCUMENT_KINDS.has(documentKind);
  }
  return !voucher.sourceVoucherId;
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function buildDerivedItemCode(itemName: string, usedCodes: Set<string>, fallbackIndex: number) {
  const compactStem = slugify(itemName).replace(/-/g, "").toUpperCase();
  const baseCode = `ITM-${compactStem || String(fallbackIndex + 1).padStart(4, "0")}`;

  if (!usedCodes.has(baseCode)) {
    usedCodes.add(baseCode);
    return baseCode;
  }

  let suffix = 2;
  while (usedCodes.has(`${baseCode}-${suffix}`)) {
    suffix += 1;
  }

  const resolvedCode = `${baseCode}-${suffix}`;
  usedCodes.add(resolvedCode);
  return resolvedCode;
}

function getVoucherLabel(voucherType: VoucherType) {
  const labels: Record<VoucherType, string> = {
    contra: "Contra Voucher",
    payment: "Payment Voucher",
    receipt: "Receipt Voucher",
    journal: "Journal Voucher",
    sales: "Sales Invoice",
    purchase: "Purchase Invoice",
    expense: "Expense Voucher",
    revenue: "Revenue Voucher",
    "credit-note": "Credit Note",
    "debit-note": "Purchase Return",
  };

  return labels[voucherType];
}

function getDefaultGroup(ledger: string) {
  const key = ledger.toLowerCase();
  if (key.includes("purchase bill pending") || key.includes("goods received not invoiced") || key.includes("grni")) {
    return "Sundry Creditors";
  }
  if (key.includes("inventory delivered pending invoice")) {
    return "Current Assets";
  }
  if (key.includes("cash")) {
    return "Cash-in-Hand";
  }
  if (key.includes("bank")) {
    return "Bank Accounts";
  }
  if (key.includes("sales")) {
    return "Revenue";
  }
  if (key.includes("purchase") || key.includes("stock")) {
    return "Direct Expenses";
  }
  if (key.includes("receivable") || key.includes("customer")) {
    return "Sundry Debtors";
  }
  if (key.includes("payable") || key.includes("supplier")) {
    return "Sundry Creditors";
  }
  return "General Ledger";
}

function getPartyTypeForVoucher(voucherType: VoucherType): PartyRecord["type"] | null {
  if (voucherType === "purchase" || voucherType === "payment" || voucherType === "debit-note") {
    return "supplier";
  }

  if (voucherType === "sales" || voucherType === "receipt" || voucherType === "credit-note") {
    return "customer";
  }

  return null;
}

function getLiveVouchers(dataset: AppDataset, workspaceId: string) {
  return dataset.vouchers.filter((voucher) => voucher.workspaceId === workspaceId && liveVoucherStatuses.has(voucher.status));
}

function getTodayDateKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDashboardMetricBadge(metricId: string) {
  if (metricId === "sales" || metricId === "purchase" || metricId === "receipt" || metricId === "payment") {
    return "Today";
  }

  if (metricId === "receivable" || metricId === "payable" || metricId === "cash" || metricId === "bank" || metricId === "mfs" || metricId === "cashAndBank") {
    return "Current Balance";
  }

  return "Updated Now";
}

function buildStockSnapshot(dataset: AppDataset, workspaceId: string, period?: { toDate?: string; beforeDate?: string }) {
  const hasCostedMovementFeed = dataset.inventoryMovements !== undefined;
  const stockMap = new Map<
    string,
    {
      itemCode: string;
      itemName: string;
      category: string;
      unit: string;
      qty: number;
      value: number;
      rate: number;
      reorderLevel: number;
      status: StockItemRecord["status"];
    }
  >();
  const usedCodes = new Set<string>();

  dataset.stockItems
    .filter((item) => item.workspaceId === workspaceId)
    .forEach((item) => {
      usedCodes.add(item.itemCode);
      stockMap.set(normalizeKey(item.itemName), {
        itemCode: item.itemCode,
        itemName: item.itemName,
        category: item.category,
        unit: item.unit,
        qty: hasCostedMovementFeed ? 0 : Number(item.openingQty || 0),
        value: hasCostedMovementFeed ? 0 : roundMoney(Number(item.openingQty || 0) * Number(item.openingRate || 0)),
        rate: Number(item.openingRate || 0),
        reorderLevel: Number(item.reorderLevel || 0),
        status: item.status,
      });
    });

  if (hasCostedMovementFeed) {
    const valueByItem = new Map<string, number>();
    const movements = (dataset.inventoryMovements ?? [])
      .filter((movement) => movement.workspaceId === workspaceId)
      .filter((movement) => !period?.toDate || movement.transactionDate <= period.toDate)
      .filter((movement) => !period?.beforeDate || movement.transactionDate < period.beforeDate)
      .sort((left, right) => left.transactionDate.localeCompare(right.transactionDate) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));

    movements.forEach((movement, index) => {
      const key = normalizeKey(movement.itemName);
      const existing = stockMap.get(key) ?? {
        itemCode: movement.itemCode || buildDerivedItemCode(movement.itemName, usedCodes, index),
        itemName: movement.itemName,
        category: "General Items",
        unit: movement.unit,
        qty: 0,
        value: 0,
        rate: 0,
        reorderLevel: 0,
        status: "active" as const,
      };
      const direction = movement.movementType === "IN" ? 1 : -1;
      existing.qty += direction * Number(movement.quantity || 0);
      const nextValue = sumMoney([
        valueByItem.get(key) ?? 0,
        direction * Number(movement.movementValue || 0),
      ]);
      valueByItem.set(key, nextValue);
      existing.value = nextValue;
      existing.rate = Math.abs(existing.qty) < 0.000001 ? 0 : nextValue / existing.qty;
      stockMap.set(key, existing);
    });

    return Array.from(stockMap.values())
      .filter((item) => item.status === "active" || Math.abs(item.qty) >= 0.000001 || Math.abs(item.value) >= 0.000001)
      .sort((left, right) => left.itemName.localeCompare(right.itemName));
  }

  const liveVouchers = getLiveVouchers(dataset, workspaceId);
  const receiptNoteIds = new Set(liveVouchers.filter((voucher) => voucher.voucherType === "purchase" && voucher.documentKind === "receipt-note").map((voucher) => voucher.id));
  const inventoryVouchers = liveVouchers
    .filter((voucher) => inventoryVoucherTypes.has(voucher.voucherType) && affectsStockMovement(voucher, receiptNoteIds))
    .filter((voucher) => !period?.toDate || voucher.voucherDate <= period.toDate)
    .filter((voucher) => !period?.beforeDate || voucher.voucherDate < period.beforeDate)
    .sort((left, right) => {
      if (left.voucherDate === right.voucherDate) {
        return left.id.localeCompare(right.id);
      }

      return left.voucherDate.localeCompare(right.voucherDate);
    });

  inventoryVouchers.forEach((voucher) => {
    const grossPurchaseValue = voucher.voucherType === "purchase"
      ? sumMoney((voucher.inventoryItems ?? []).map(
          (item) => Number(item.quantity || 0) * Number(item.unitPrice || 0),
        ))
      : 0;
    const acquisitionFactor = grossPurchaseValue > 0
      ? Math.max(0, roundMoney(grossPurchaseValue - roundMoney(voucher.discountAmount))) / grossPurchaseValue
      : 1;
    (voucher.inventoryItems ?? []).forEach((item: InventoryVoucherItem, index) => {
      if (!item.itemName.trim()) {
        return;
      }

      const key = normalizeKey(item.itemName);
      const existing = stockMap.get(key) ?? {
        itemCode: buildDerivedItemCode(item.itemName, usedCodes, index),
        itemName: item.itemName.trim(),
        category: "General Items",
        unit: "pcs",
        qty: 0,
        value: 0,
        rate: 0,
        reorderLevel: 0,
        status: "active" as const,
      };

      const quantity = Number(item.quantity || 0);
      const isInbound = isInboundStockVoucherType(voucher.voucherType);
      const currentAverage = Math.abs(existing.qty) < 0.000001 ? existing.rate : existing.value / existing.qty;
      const unitCost = voucher.voucherType === "purchase"
        ? Number(item.unitPrice || 0) * acquisitionFactor
        : voucher.voucherType === "debit-note" && Number(item.unitPrice || 0) > 0
          ? Number(item.unitPrice)
          : currentAverage;
      existing.qty += isInbound ? quantity : -quantity;
      existing.value = sumMoney([
        existing.value,
        (isInbound ? 1 : -1) * quantity * unitCost,
      ]);
      if (Math.abs(existing.qty) < 0.000001) {
        existing.qty = 0;
        existing.value = 0;
        existing.rate = 0;
      } else {
        existing.rate = existing.value / existing.qty;
      }
      stockMap.set(key, existing);
    });
  });

  return Array.from(stockMap.values())
    .filter((item) => item.status === "active" || Math.abs(item.qty) >= 0.000001 || Math.abs(item.value) >= 0.000001)
    .sort((left, right) => left.itemName.localeCompare(right.itemName));
}

export function getPartyOptions(dataset: AppDataset, workspaceId: string, voucherType: VoucherType) {
  const requiredType = getPartyTypeForVoucher(voucherType);

  return dataset.parties
    .filter((party) => party.workspaceId === workspaceId && party.status === "active")
    .filter((party) => (requiredType ? party.type === requiredType : true))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function getPartyRows(dataset: AppDataset, workspaceId: string) {
  return dataset.parties
    .filter((party) => party.workspaceId === workspaceId)
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((party) => ({
      "Party Name": party.name,
      Type: party.type === "customer" ? "Customer" : "Supplier",
      Contact: party.contact,
      "Credit Limit": formatCurrency(party.creditLimit),
      Status: party.status === "active" ? "Active" : "Inactive",
    }));
}

export function getInventoryRows(dataset: AppDataset, workspaceId: string) {
  return buildStockSnapshot(dataset, workspaceId).map((item) => ({
    "Item Code": item.itemCode,
    "Item Name": item.itemName,
    Category: item.category,
    Stock: `${formatNumber(item.qty)} ${item.unit}`,
    "Reorder Level": `${formatNumber(item.reorderLevel)} ${item.unit}`,
  }));
}

export function getInventoryOptions(dataset: AppDataset, workspaceId: string) {
  return buildStockSnapshot(dataset, workspaceId);
}

export function getInventoryOptionsAsOf(dataset: AppDataset, workspaceId: string, toDate: string) {
  return buildStockSnapshot(dataset, workspaceId, { toDate });
}

export function getInventoryOptionsBefore(dataset: AppDataset, workspaceId: string, beforeDate: string) {
  return buildStockSnapshot(dataset, workspaceId, { beforeDate });
}

export interface ItemWiseMovementRow {
  itemCode: string;
  itemName: string;
  date: string;
  voucherNumber: string;
  voucherType: string;
  inQty: number;
  outQty: number;
  rate: number;
  balanceQty: number;
  balanceValue: number;
}

/** Per-item stock card: every posted movement between fromDate/toDate, with a
 * running quantity/value balance seeded from the item's real opening stock. */
export function getItemWiseMovementRows(
  dataset: AppDataset,
  workspaceId: string,
  fromDate: string,
  toDate: string,
): ItemWiseMovementRow[] {
  if (dataset.inventoryMovements !== undefined) {
    const runningQty = new Map<string, number>();
    const runningValue = new Map<string, number>();
    const movements = dataset.inventoryMovements
      .filter((movement) => movement.workspaceId === workspaceId)
      .sort((left, right) => left.transactionDate.localeCompare(right.transactionDate) || left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id));
    const applyMovement = (movement: (typeof movements)[number]) => {
      const key = movement.inventoryItemId || normalizeKey(movement.itemName);
      const direction = movement.movementType === "IN" ? 1 : -1;
      runningQty.set(key, (runningQty.get(key) ?? 0) + direction * Number(movement.quantity || 0));
      runningValue.set(key, sumMoney([
        runningValue.get(key) ?? 0,
        direction * Number(movement.movementValue || 0),
      ]));
      return key;
    };

    movements.filter((movement) => movement.transactionDate < fromDate).forEach(applyMovement);
    return movements
      .filter((movement) => movement.transactionDate >= fromDate && movement.transactionDate <= toDate)
      .map((movement) => {
        const key = applyMovement(movement);
        return {
          itemCode: movement.itemCode,
          itemName: movement.itemName,
          date: movement.transactionDate,
          voucherNumber: movement.referenceNo,
          voucherType: movement.transactionType.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
          inQty: movement.movementType === "IN" ? movement.quantity : 0,
          outQty: movement.movementType === "OUT" ? movement.quantity : 0,
          rate: movement.unitCost,
          balanceQty: runningQty.get(key) ?? 0,
          balanceValue: runningValue.get(key) ?? 0,
        };
      })
      .sort((left, right) => left.itemName.localeCompare(right.itemName) || left.date.localeCompare(right.date));
  }

  const openingSnapshot = buildStockSnapshot(dataset, workspaceId, { beforeDate: fromDate });
  const runningQty = new Map<string, number>();
  const runningValue = new Map<string, number>();
  const itemInfo = new Map<string, { itemCode: string; itemName: string; rate: number }>();
  openingSnapshot.forEach((item) => {
    const key = normalizeKey(item.itemName);
    runningQty.set(key, item.qty);
    runningValue.set(key, roundMoney(item.qty * item.rate));
    itemInfo.set(key, { itemCode: item.itemCode, itemName: item.itemName, rate: item.rate });
  });

  const usedCodes = new Set(
    dataset.stockItems.filter((item) => item.workspaceId === workspaceId).map((item) => item.itemCode),
  );
  const liveVouchers = getLiveVouchers(dataset, workspaceId);
  const receiptNoteIds = new Set(
    liveVouchers
      .filter((voucher) => voucher.voucherType === "purchase" && voucher.documentKind === "receipt-note")
      .map((voucher) => voucher.id),
  );
  const movementVouchers = liveVouchers
    .filter((voucher) => inventoryVoucherTypes.has(voucher.voucherType) && affectsStockMovement(voucher, receiptNoteIds))
    .filter((voucher) => voucher.voucherDate >= fromDate && voucher.voucherDate <= toDate)
    .sort((left, right) => (left.voucherDate === right.voucherDate ? left.id.localeCompare(right.id) : left.voucherDate.localeCompare(right.voucherDate)));

  const rows: ItemWiseMovementRow[] = [];
  const voucherTypeLabel: Record<string, string> = {
    purchase: "Purchase",
    sales: "Sales",
    "debit-note": "Purchase Return",
    "credit-note": "Sales Return",
  };

  movementVouchers.forEach((voucher) => {
    const grossPurchaseValue = voucher.voucherType === "purchase"
      ? sumMoney((voucher.inventoryItems ?? []).map(
          (item) => Number(item.quantity || 0) * Number(item.unitPrice || 0),
        ))
      : 0;
    const acquisitionFactor = grossPurchaseValue > 0
      ? Math.max(0, roundMoney(grossPurchaseValue - roundMoney(voucher.discountAmount))) / grossPurchaseValue
      : 1;
    (voucher.inventoryItems ?? []).forEach((item: InventoryVoucherItem, index) => {
      if (!item.itemName.trim()) return;

      const key = normalizeKey(item.itemName);
      const quantity = Number(item.quantity || 0);
      const isInbound = isInboundStockVoucherType(voucher.voucherType);
      const existing = itemInfo.get(key) ?? {
        itemCode: buildDerivedItemCode(item.itemName, usedCodes, index),
        itemName: item.itemName.trim(),
        rate: 0,
      };
      const currentQty = runningQty.get(key) ?? 0;
      const currentValue = runningValue.get(key) ?? 0;
      const currentAverage = Math.abs(currentQty) < 0.000001 ? existing.rate : currentValue / currentQty;
      const unitCost = voucher.voucherType === "purchase"
        ? Number(item.unitPrice || 0) * acquisitionFactor
        : voucher.voucherType === "debit-note" && Number(item.unitPrice || 0) > 0
          ? Number(item.unitPrice)
          : currentAverage;
      const balanceQty = currentQty + (isInbound ? quantity : -quantity);
      let balanceValue = sumMoney([
        currentValue,
        (isInbound ? 1 : -1) * quantity * unitCost,
      ]);
      if (Math.abs(balanceQty) < 0.000001) balanceValue = 0;
      existing.rate = Math.abs(balanceQty) < 0.000001 ? 0 : balanceValue / balanceQty;
      itemInfo.set(key, existing);
      runningQty.set(key, balanceQty);
      runningValue.set(key, balanceValue);

      rows.push({
        itemCode: existing.itemCode,
        itemName: existing.itemName,
        date: voucher.voucherDate,
        voucherNumber: voucher.voucherNumber,
        voucherType: voucherTypeLabel[voucher.voucherType] ?? voucher.voucherType,
        inQty: isInbound ? quantity : 0,
        outQty: isInbound ? 0 : quantity,
        rate: unitCost,
        balanceQty,
        balanceValue,
      });
    });
  });

  return rows.sort((left, right) => left.itemName.localeCompare(right.itemName) || left.date.localeCompare(right.date));
}

export function getClosingStockRows(dataset: AppDataset, workspaceId: string) {
  return buildStockSnapshot(dataset, workspaceId).map((item) => ({
    Item: item.itemName,
    "Closing Qty": formatNumber(item.qty),
    Unit: item.unit,
    Rate: formatCurrency(item.rate),
    "Closing Value": formatCurrency(roundMoney(item.qty * item.rate)),
  }));
}

export function getPendingApprovalRows(dataset: AppDataset, workspaceId: string): PendingApprovalItem[] {
  const pendingMap = new Map<VoucherType, PendingApprovalItem>();

  dataset.vouchers
    .filter((voucher) => voucher.workspaceId === workspaceId && voucher.status === "pending")
    .forEach((voucher) => {
      const current = pendingMap.get(voucher.voucherType) ?? {
        id: `approval-${voucher.voucherType}`,
        label: getVoucherLabel(voucher.voucherType),
        count: 0,
        amount: 0,
      };

      current.count += 1;
      current.amount = sumMoney([current.amount, voucher.amount]);
      pendingMap.set(voucher.voucherType, current);
    });

  return Array.from(pendingMap.values()).sort((left, right) => right.amount - left.amount);
}

export function getSummaryMetrics(dataset: AppDataset, workspaceId: string): SummaryMetric[] {
  const liveVouchers = getLiveVouchers(dataset, workspaceId);
  const totals = {
    sales: 0,
    purchase: 0,
    receipt: 0,
    payment: 0,
  };

  liveVouchers.forEach((voucher) => {
    if (voucher.voucherType === "sales") {
      totals.sales = sumMoney([totals.sales, voucher.amount]);
    } else if (voucher.voucherType === "purchase") {
      totals.purchase = sumMoney([totals.purchase, voucher.amount]);
    } else if (voucher.voucherType === "receipt") {
      totals.receipt = sumMoney([totals.receipt, voucher.amount]);
    } else if (voucher.voucherType === "payment") {
      totals.payment = sumMoney([totals.payment, voucher.amount]);
    }
  });

  const trialBalance = getTrialBalanceRows(dataset, workspaceId);
  const cashInHand =
    sumMoney(trialBalance
      .filter((row) => row.ledger.toLowerCase().includes("cash"))
      .map((row) => Math.max(row.debit - row.credit, 0)));
  const bankBalance =
    sumMoney(trialBalance
      .filter((row) => row.ledger.toLowerCase().includes("bank"))
      .map((row) => Math.max(row.debit - row.credit, 0)));

  return [
    { label: "Total Sales", value: totals.sales, icon: "sales" },
    { label: "Total Purchase", value: totals.purchase, icon: "purchase" },
    { label: "Total Receipt", value: totals.receipt, icon: "receipt" },
    { label: "Total Payment", value: totals.payment, icon: "payment" },
    { label: "Cash in Hand", value: cashInHand, icon: "cash" },
    { label: "Bank Balance", value: bankBalance, icon: "bank" },
  ];
}

export function getDashboardMetrics(dataset: AppDataset, workspaceId: string): DashboardMetric[] {
  const liveVouchers = getLiveVouchers(dataset, workspaceId);
  const todayKey = getTodayDateKey();
  const monthKey = todayKey.slice(0, 7);
  const todayVouchers = liveVouchers.filter((voucher) => voucher.voucherDate === todayKey);
  const monthVouchers = liveVouchers.filter((voucher) => voucher.voucherDate.slice(0, 7) === monthKey);
  const totals = {
    sales: 0,
    purchase: 0,
    receipt: 0,
    payment: 0,
  };
  const monthTotals = {
    sales: 0,
    purchase: 0,
    receipt: 0,
    payment: 0,
  };
  const trialBalance = getTrialBalanceRows(dataset, workspaceId);
  const receivable =
    sumMoney(trialBalance
      .filter((row) => row.group === "Sundry Debtors")
      .map((row) => row.debit - row.credit));
  const payable =
    sumMoney(trialBalance
      .filter((row) => row.group === "Sundry Creditors")
      .map((row) => row.credit - row.debit));
  const cashInHand =
    sumMoney(trialBalance
      .filter((row) => row.group === "Cash-in-Hand")
      .map((row) => Math.max(row.debit - row.credit, 0)));
  const isMfsLedger = (ledger: string) => /bkash|nagad|rocket|mobile financial|\bmfs\b/i.test(ledger);
  const mfsBalance =
    sumMoney(trialBalance
      .filter((row) => isMfsLedger(row.ledger))
      .map((row) => row.debit - row.credit));
  const bankBalance =
    sumMoney(trialBalance
      .filter((row) => row.group === "Bank Accounts" && !isMfsLedger(row.ledger))
      .map((row) => row.debit - row.credit));

  todayVouchers.forEach((voucher) => {
    if (voucher.voucherType === "sales") {
      totals.sales = sumMoney([totals.sales, voucher.amount]);
    } else if (voucher.voucherType === "purchase") {
      totals.purchase = sumMoney([totals.purchase, voucher.amount]);
    } else if (voucher.voucherType === "receipt") {
      totals.receipt = sumMoney([totals.receipt, voucher.amount]);
    } else if (voucher.voucherType === "payment") {
      totals.payment = sumMoney([totals.payment, voucher.amount]);
    }
  });

  monthVouchers.forEach((voucher) => {
    if (voucher.voucherType === "sales") {
      monthTotals.sales = sumMoney([monthTotals.sales, voucher.amount]);
    } else if (voucher.voucherType === "purchase") {
      monthTotals.purchase = sumMoney([monthTotals.purchase, voucher.amount]);
    } else if (voucher.voucherType === "receipt") {
      monthTotals.receipt = sumMoney([monthTotals.receipt, voucher.amount]);
    } else if (voucher.voucherType === "payment") {
      monthTotals.payment = sumMoney([monthTotals.payment, voucher.amount]);
    }
  });

  return [
    { id: "receivable", label: "Total Receivable", value: roundMoney(Math.max(receivable, 0)), change: getDashboardMetricBadge("receivable") },
    { id: "payable", label: "Total Payable", value: roundMoney(Math.max(payable, 0)), change: getDashboardMetricBadge("payable") },
    { id: "sales", label: "Total Sales", value: totals.sales, monthValue: monthTotals.sales, change: getDashboardMetricBadge("sales") },
    { id: "purchase", label: "Total Purchase", value: totals.purchase, monthValue: monthTotals.purchase, change: getDashboardMetricBadge("purchase") },
    { id: "receipt", label: "Total Receipt", value: totals.receipt, monthValue: monthTotals.receipt, change: getDashboardMetricBadge("receipt") },
    { id: "payment", label: "Total Payment", value: totals.payment, monthValue: monthTotals.payment, change: getDashboardMetricBadge("payment") },
    { id: "cash", label: "Cash in Hand", value: cashInHand, change: getDashboardMetricBadge("cash") },
    { id: "bank", label: "Bank Balance", value: bankBalance, change: getDashboardMetricBadge("bank") },
    { id: "mfs", label: "MFS Balance", value: mfsBalance, change: getDashboardMetricBadge("mfs") },
    { id: "cashAndBank", label: "Total Cash, Bank & MFS", value: sumMoney([cashInHand, bankBalance, mfsBalance]), change: getDashboardMetricBadge("cashAndBank") },
  ];
}

export function getTrialBalanceRows(dataset: AppDataset, workspaceId: string, fromDate?: string, toDate?: string): TrialBalanceRow[] {
  const ledgerMap = new Map<string, TrialBalanceRow>();
  // A voucher reversed later must remain in a historical trial balance until
  // the reversal date. Include both sides of the audit pair and let the date
  // cutoff decide whether only the original or original + reversal applies.
  // Filtering only current POSTED rows erased July activity after an August
  // reversal because the original's current status becomes REVERSED.
  const liveVouchers = dataset.vouchers
    .filter(
      (voucher) =>
        voucher.workspaceId === workspaceId
        && (voucher.status === "posted" || voucher.status === "reversed"),
    )
    // A deleted original leaves its reversal row behind with reversalOfId set
    // to null by the database. Such an orphan is audit metadata, not a
    // standalone accounting entry; including only its mirror-image lines
    // distorts every historical balance. The immutable -REV suffix lets us
    // identify it even after the foreign key has been cleared. Valid reversal
    // pairs keep reversalOfId and remain included so original + reversal net.
    .filter(
      (voucher) =>
        !/-REV(?:-REV)*$/i.test(voucher.voucherNumber.trim())
        || Boolean(voucher.reversalOfId),
    )
    .filter((voucher) => !toDate || voucher.voucherDate <= toDate);
  const receiptNoteIds = new Set(liveVouchers.filter((voucher) => voucher.voucherType === "purchase" && voucher.documentKind === "receipt-note").map((voucher) => voucher.id));

  const addLine = (ledger: string, debit: number, credit: number, voucherDate: string, group?: string, accountId?: string) => {
    const ledgerName = ledger.trim();
    const stableAccountId = accountId?.trim() || undefined;
    // A COA rename changes the display name, never the accounting identity.
    // Aggregate account-linked postings by their stable account id so old and
    // new ledger captions cannot split one balance into separate rows.
    // A party that both buys from us and sells to us posts under a single name.
    // On legacy lines that carry no accountId the name alone would fold that
    // party's receivable into its payable row (whichever voucher was seen
    // first wins the group), so the control group joins the key. Only the two
    // party control groups split - every other ledger keeps one row per name.
    const partyGroupKey = group === "Sundry Creditors" || group === "Sundry Debtors" ? `${group}:` : "";
    const key = stableAccountId ? `account:${stableAccountId}` : `ledger:${partyGroupKey}${ledgerName}`;
    const current = ledgerMap.get(key) ?? {
      id: stableAccountId ? `tb-account-${stableAccountId}` : `tb-${slugify(`${partyGroupKey}${ledgerName}`)}`,
      accountId: stableAccountId,
      ledger: ledgerName,
      group: group || getDefaultGroup(ledgerName),
      debit: 0,
      credit: 0,
      openingBalance: 0,
      closingBalance: 0,
    };
    const normalizedDebit = roundMoney(debit);
    const normalizedCredit = roundMoney(credit);
    if (fromDate && voucherDate < fromDate) {
      current.openingBalance = sumMoney([current.openingBalance, normalizedDebit, -normalizedCredit]);
    } else {
      current.debit = sumMoney([current.debit, normalizedDebit]);
      current.credit = sumMoney([current.credit, normalizedCredit]);
    }
    current.closingBalance = sumMoney([current.closingBalance, normalizedDebit, -normalizedCredit]);
    ledgerMap.set(key, current);
  };

  const reversedOriginalIds = new Set(
    liveVouchers
      .map((voucher) => voucher.reversalOfId)
      .filter((voucherId): voucherId is string => Boolean(voucherId)),
  );
  const addPersistedLines = (voucher: VoucherRecord) => {
    voucher.lines.forEach((line) => {
      // Caption matching is a compatibility path for genuinely legacy rows.
      // Once an Account id exists, downstream report/tree code owns the
      // classification and a coincidentally matching display name must not.
      const isPartyLedger = !line.accountId && line.ledger.trim().toLowerCase() === voucher.partyName?.trim().toLowerCase();
      const partyGroup =
        voucher.voucherType === "purchase" || voucher.voucherType === "payment" || voucher.voucherType === "debit-note"
          ? "Sundry Creditors"
          : voucher.voucherType === "sales" || voucher.voucherType === "receipt" || voucher.voucherType === "credit-note"
            ? "Sundry Debtors"
            : undefined;
      const explicitMoneyGroup = line.costCenter === "Cash-in-Hand" || line.costCenter === "Bank Accounts" ? line.costCenter : undefined;
      addLine(
        line.ledger,
        Number(line.debit || 0),
        Number(line.credit || 0),
        voucher.voucherDate,
        isPartyLedger ? partyGroup : explicitMoneyGroup,
        line.accountId,
      );
    });
  };
  const hasBalancedPersistedLines = (voucher: VoucherRecord) => {
    const debit = sumMoney(voucher.lines.map((line) => Number(line.debit || 0)));
    const credit = sumMoney(voucher.lines.map((line) => Number(line.credit || 0)));
    return debit > 0 && moneyAmountsEqual(debit, credit);
  };
  const belongsToReversalPair = (voucher: VoucherRecord) =>
    Boolean(voucher.reversalOfId) || reversedOriginalIds.has(voucher.id);

  liveVouchers.forEach((voucher) => {
    if (voucher.voucherType === "purchase" && voucher.documentKind === "purchase-order") return;
    if (voucher.voucherType === "purchase" && voucher.documentKind === "receipt-note") {
      // Current Receipt Notes already persist the authoritative Inventory/GRNI
      // pair. Reading it preserves account ids and lets reversal mirrors net the
      // original exactly; synthesis remains only for genuinely old local rows.
      if (hasBalancedPersistedLines(voucher) || belongsToReversalPair(voucher)) {
        addPersistedLines(voucher);
        return;
      }
      addLine("Inventory Control", Number(voucher.amount || 0), 0, voucher.voucherDate);
      addLine("Purchase Bill Pending", 0, Number(voucher.amount || 0), voucher.voucherDate);
      return;
    }
    if (voucher.voucherType === "purchase" && voucher.sourceVoucherId && receiptNoteIds.has(voucher.sourceVoucherId)) {
      // A billed Receipt Note can be settled across Cash, Bank, MFS and payable
      // in the same voucher. Persisted lines are the only lossless source.
      if (hasBalancedPersistedLines(voucher) || belongsToReversalPair(voucher)) {
        addPersistedLines(voucher);
        return;
      }
      addLine("Purchase Bill Pending", Number(voucher.amount || 0), 0, voucher.voucherDate);
      const persistedCredits = voucher.lines.filter((line) => Number(line.credit || 0) > 0);
      const persistedCreditTotal = sumMoney(persistedCredits.map((line) => Number(line.credit || 0)));
      if (persistedCredits.length && moneyAmountsEqual(persistedCreditTotal, Number(voucher.amount || 0))) {
        persistedCredits.forEach((line) => {
          const isPartyLedger = !line.accountId && line.ledger.trim().toLowerCase() === voucher.partyName.trim().toLowerCase();
          const explicitMoneyGroup = line.costCenter === "Cash-in-Hand" || line.costCenter === "Bank Accounts" ? line.costCenter : undefined;
          addLine(line.ledger, 0, Number(line.credit || 0), voucher.voucherDate, isPartyLedger ? "Sundry Creditors" : explicitMoneyGroup, line.accountId);
        });
      } else {
        const settlementLedger = voucher.settlementMode === "cash" ? "Cash in Hand" : voucher.partyName;
        addLine(
          settlementLedger,
          0,
          Number(voucher.amount || 0),
          voucher.voucherDate,
          voucher.settlementMode === "cash" ? "Cash-in-Hand" : "Sundry Creditors",
        );
      }
      return;
    }
    addPersistedLines(voucher);
  });

  return Array.from(ledgerMap.values())
    .map((row) => ({
      ...row,
      debit: roundMoney(row.debit),
      credit: roundMoney(row.credit),
      openingBalance: roundMoney(row.openingBalance),
      closingBalance: roundMoney(row.closingBalance),
    }))
    .sort((left, right) => left.ledger.localeCompare(right.ledger));
}
