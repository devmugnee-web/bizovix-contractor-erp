"use client";

import { addDays } from "date-fns";

import { getDashboardMetrics, getPartyOptions, getPendingApprovalRows, getSummaryMetrics, getTrialBalanceRows } from "@/lib/erp-data";
import { validateVoucherInput } from "@/lib/accounting";
import { getWorkspaceSubscriptionSnapshot, setWorkspaceSubscriptionSnapshot } from "@/lib/workspace-subscription";
import { delay, slugify } from "@/lib/utils";
import { createSeedDataset } from "@/mocks/seed-data";
import { readDataset, writeDataset } from "@/services/browser-dataset";
import type { DataProvider } from "@/types/api";
import type { AppDataset, DayBookFilters, SubscriptionUpgradeRequest, VoucherFormInput, VoucherRecord } from "@/types/domain";

function matchDayBookFilters(voucher: VoucherRecord, filters: DayBookFilters) {
  if (filters.workspaceId && voucher.workspaceId !== filters.workspaceId) {
    return false;
  }

  if (filters.voucherType && filters.voucherType !== "all" && voucher.voucherType !== filters.voucherType) {
    return false;
  }

  if (filters.enteredBy && filters.enteredBy !== "all" && voucher.enteredBy !== filters.enteredBy) {
    return false;
  }

  if (filters.status && filters.status !== "all" && voucher.status !== filters.status) {
    return false;
  }

  if (filters.query) {
    const needle = filters.query.toLowerCase();
    const haystack = `${voucher.voucherNumber} ${voucher.partyName} ${voucher.particulars}`.toLowerCase();
    if (!haystack.includes(needle)) {
      return false;
    }
  }

  if (filters.from && voucher.voucherDate < filters.from) {
    return false;
  }

  if (filters.to && voucher.voucherDate > filters.to) {
    return false;
  }

  return true;
}

function nextVoucherNumber(dataset: AppDataset, voucherType: VoucherFormInput["voucherType"], documentKind?: string | null) {
  const prefixMap = {
    contra: "CN",
    payment: "PV",
    receipt: "RV",
    journal: "JV",
    sales: "SI",
    purchase: "PI",
    expense: "EX",
    revenue: "RE",
    "credit-note": "CR",
    "debit-note": "PR",
  } as const;

  const sameType = dataset.vouchers.filter((voucher) => voucher.voucherType === voucherType && voucher.documentKind === documentKind);
  const sequence = String(sameType.length + 101).padStart(5, "0");
  const purchasePrefix = documentKind === "purchase-order" ? "PO" : documentKind === "receipt-note" ? "GRN" : "PB";
  const salesPrefix =
    documentKind === "quotation"
      ? "QT"
      : documentKind === "proforma"
        ? "PF"
        : documentKind === "sale-order"
          ? "SO"
          : documentKind === "delivery-note"
            ? "DN"
            : "SI";
  const prefix = voucherType === "purchase" ? purchasePrefix : voucherType === "sales" ? salesPrefix : prefixMap[voucherType];
  return `${prefix}-2505-${sequence}`;
}

function createLocalProvider(mode: "mock" | "demo"): DataProvider {
  return {
    auth: {
      async login(credentials) {
        await delay();
        const dataset = readDataset(mode);
        const user = dataset.users.find((entry) => entry.email === credentials.email) ?? dataset.users[0];
        return user;
      },
      async demoLogin() {
        await delay();
        const dataset = readDataset(mode);
        return dataset.users[0];
      },
    },
    workspaces: {
      async list() {
        await delay();
        return readDataset(mode).workspaces;
      },
      async listShareUsers() {
        await delay();
        return [];
      },
      async createShareUser(_workspaceId, input) {
        await delay();
        return {
          id: `share-user-${Date.now()}`,
          ...input,
          status: "Invite Sent",
          device: "Local Browser",
          lastSync: new Date().toISOString(),
        };
      },
      async updateShareUser(_workspaceId, userId, input) {
        await delay();
        return {
          id: userId,
          ...input,
          status: "Invite Sent",
          device: "Local Browser",
          lastSync: new Date().toISOString(),
        };
      },
      async removeShareUser(_workspaceId, userId) {
        await delay();
        return { success: true, removedUserId: userId };
      },
      async resetShareUserPassword(_workspaceId, userId) {
        await delay();
        return {
          id: userId,
          name: "Preview User",
          contact: "preview@bizovix.app",
          temporaryPassword: "Preview-mode-only",
        };
      },
    },
    dashboard: {
      async get(workspaceId) {
        await delay();
        const dataset = readDataset(mode);
        const recentTransactions = dataset.vouchers
          .filter((voucher) => voucher.workspaceId === workspaceId)
          .filter((voucher) => voucher.status !== "reversed" && voucher.status !== "superseded_by_alteration")
          .filter((voucher) => !voucher.reversalOfId && !/-REV(-REV)*$/.test(voucher.voucherNumber))
          .sort((left, right) => {
            if (left.createdAt === right.createdAt) {
              return right.voucherDate.localeCompare(left.voucherDate) || right.voucherNumber.localeCompare(left.voucherNumber);
            }
            return right.createdAt.localeCompare(left.createdAt);
          });

        return {
          metrics: getDashboardMetrics(dataset, workspaceId),
          trend: [],
          recentTransactions,
          quickShortcuts: dataset.quickShortcuts,
          summary: getSummaryMetrics(dataset, workspaceId),
          approvals: getPendingApprovalRows(dataset, workspaceId),
        };
      },
    },
    vouchers: {
      async listDayBook(filters) {
        await delay();
        const dataset = readDataset(mode);
        return dataset.vouchers.filter((voucher) => matchDayBookFilters(voucher, filters));
      },
      async getById(voucherId, workspaceId) {
        await delay();
        const dataset = readDataset(mode);
        const voucher = dataset.vouchers.find((entry) => entry.id === voucherId && entry.workspaceId === workspaceId);
        if (!voucher) {
          throw new Error("Voucher not found");
        }

        return voucher;
      },
      async create(input) {
        await delay();
        const dataset = readDataset(mode);
        const validated = validateVoucherInput(input);
        const normalizedInput = validated.input;
        const allowedParties = getPartyOptions(dataset, input.workspaceId, input.voucherType);
        const matchedParty = allowedParties.find((party) => party.name.trim().toLowerCase() === input.partyName.trim().toLowerCase());
        if (input.partyName.trim() && !matchedParty) {
          throw new Error("Create the buyer / party first from Parties master.");
        }

        const debit = validated.debit;
        const credit = validated.credit;
        const voucher: VoucherRecord = {
          id: `voucher-${Date.now()}`,
          workspaceId: input.workspaceId,
          voucherType: input.voucherType,
          documentKind: input.documentKind,
          sourceVoucherId: input.sourceVoucherId,
          voucherNumber: input.voucherNumber?.trim() || nextVoucherNumber(dataset, input.voucherType, input.documentKind),
          voucherDate: input.voucherDate,
          createdAt: new Date().toISOString(),
          partyName: input.partyName,
          particulars: input.narration || `${input.voucherType} voucher`,
          debit,
          credit,
          amount: Math.max(debit, credit),
          status: input.status,
          enteredBy: "Accounts Officer",
          reference: input.reference,
          narration: input.narration,
          settlementMode: input.settlementMode ?? null,
          paidAmount: normalizedInput.paidAmount ?? null,
          supplierAddress: input.supplierAddress ?? "",
          condition: input.condition ?? "",
          buyerSignature: input.buyerSignature ?? "",
          sellerSignature: input.sellerSignature ?? "",
          discountType: input.discountType ?? null,
          discountAmount: normalizedInput.discountAmount ?? null,
          loyaltyPointsRedeemed: normalizedInput.loyaltyPointsRedeemed,
          loyaltyDiscountAmount: normalizedInput.loyaltyDiscountAmount,
          subtotal: normalizedInput.subtotal ?? null,
          currency: "BDT",
          inventoryItems: normalizedInput.inventoryItems?.map((item, index) => ({
            ...item,
            id: item.id || `inventory-item-${index + 1}`,
          })),
          lines: validated.lines.map((line, index) => ({
            ...line,
            id: line.id || `${slugify(line.ledger)}-${index + 1}`,
          })),
        };
        dataset.vouchers = [voucher, ...dataset.vouchers];
        writeDataset(mode, dataset);
        return voucher;
      },
      async update(voucherId, input) {
        await delay();
        const dataset = readDataset(mode);
        const currentIndex = dataset.vouchers.findIndex((entry) => entry.id === voucherId && entry.workspaceId === input.workspaceId);
        if (currentIndex < 0) {
          throw new Error("Voucher not found");
        }

        const validated = validateVoucherInput(input);
        const normalizedInput = validated.input;
        const allowedParties = getPartyOptions(dataset, input.workspaceId, input.voucherType);
        const matchedParty = allowedParties.find((party) => party.name.trim().toLowerCase() === input.partyName.trim().toLowerCase());
        if (input.partyName.trim() && !matchedParty) {
          throw new Error("Create the buyer / party first from Parties master.");
        }

        const current = dataset.vouchers[currentIndex];
        const updated: VoucherRecord = {
          ...current,
          workspaceId: input.workspaceId,
          voucherType: input.voucherType,
          voucherDate: input.voucherDate,
          partyName: input.partyName,
          particulars: input.narration || `${input.voucherType} voucher`,
          debit: validated.debit,
          credit: validated.credit,
          amount: normalizedInput.totalAmount ?? Math.max(validated.debit, validated.credit),
          status: input.status,
          reference: input.reference,
          narration: input.narration,
          settlementMode: input.settlementMode ?? null,
          paidAmount: normalizedInput.paidAmount ?? null,
          supplierAddress: input.supplierAddress ?? "",
          condition: input.condition ?? "",
          buyerSignature: input.buyerSignature ?? "",
          sellerSignature: input.sellerSignature ?? "",
          discountType: input.discountType ?? null,
          discountAmount: normalizedInput.discountAmount ?? null,
          loyaltyPointsRedeemed: normalizedInput.loyaltyPointsRedeemed,
          loyaltyDiscountAmount: normalizedInput.loyaltyDiscountAmount,
          subtotal: normalizedInput.subtotal ?? null,
          inventoryItems: normalizedInput.inventoryItems?.map((item, index) => ({
            ...item,
            id: item.id || current.inventoryItems?.[index]?.id || `inventory-item-${index + 1}`,
          })),
          lines: validated.lines.map((line, index) => ({
            ...line,
            id: line.id || current.lines[index]?.id || `${slugify(line.ledger)}-${index + 1}`,
          })),
        };

        dataset.vouchers[currentIndex] = updated;
        writeDataset(mode, dataset);
        return updated;
      },
      async delete(voucherId, workspaceId) {
        await delay();
        const dataset = readDataset(mode);
        const currentIndex = dataset.vouchers.findIndex((entry) => entry.id === voucherId && entry.workspaceId === workspaceId);
        if (currentIndex < 0) {
          throw new Error("Voucher not found");
        }

        const [deleted] = dataset.vouchers.splice(currentIndex, 1);
        writeDataset(mode, dataset);
        return deleted;
      },
    },
    reports: {
      async getTrialBalance(workspaceId) {
        await delay();
        return getTrialBalanceRows(readDataset(mode), workspaceId);
      },
    },
    subscription: {
      async get(workspaceId) {
        await delay();
        const dataset = readDataset(mode);
        return getWorkspaceSubscriptionSnapshot(dataset, workspaceId);
      },
      async requestUpgrade(input, workspaceId) {
        await delay();
        const dataset = readDataset(mode);
        const targetWorkspaceId = workspaceId ?? dataset.workspaces[0]?.id;
        if (!targetWorkspaceId) {
          throw new Error("No workspace available for subscription request");
        }

        const snapshot = getWorkspaceSubscriptionSnapshot(dataset, targetWorkspaceId);
        const requestedPlan = snapshot.plans.find((plan) => plan.code === input.planCode);
        if (!requestedPlan) {
          throw new Error("Requested plan is not available");
        }

        if (snapshot.currentPlan.code === requestedPlan.code || requestedPlan.isCurrent) {
          throw new Error("Current plan is already active");
        }

        const upgradeRequest: SubscriptionUpgradeRequest = {
          id: `upgrade-${Date.now()}`,
          requestedPlanCode: requestedPlan.code,
          requestedPlanName: requestedPlan.name,
          status: "open",
          note: input.note ?? null,
          submittedAt: new Date().toISOString(),
        };
        setWorkspaceSubscriptionSnapshot(dataset, targetWorkspaceId, {
          ...snapshot,
          upgradeRequest,
        });
        writeDataset(mode, dataset);
        return upgradeRequest;
      },
    },
    demo: {
      async reset() {
        await delay();
        const seed = createSeedDataset();
        const refreshed = {
          ...seed,
          vouchers: createSeedDataset().vouchers.map((voucher) => ({
            ...voucher,
            voucherDate: addDays(new Date(voucher.voucherDate), 0).toISOString().slice(0, 10),
          })),
        };
        writeDataset(mode, refreshed);
        return refreshed;
      },
    },
  };
}

export const mockProvider = createLocalProvider("mock");
export const demoProvider = createLocalProvider("demo");
