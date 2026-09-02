import { describe, expect, it, vi } from "vitest";

import {
  TransactionWorkflowPolicy,
  VoucherEntryStatus,
  VoucherEntryType,
  VoucherWorkflowOrigin,
} from "../generated/prisma/index.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { CreateVoucherDto } from "./dto/create-voucher.dto.js";
import { VouchersService } from "./vouchers.service.js";

const currentUser: AuthenticatedRequestUser = {
  id: "user-1",
  email: "owner@example.com",
  name: "Owner",
  initials: "OW",
  tenantId: "tenant-1",
  organizationId: "organization-1",
  companyId: "company-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
};

function dto(overrides: Partial<CreateVoucherDto> = {}): CreateVoucherDto {
  return {
    workspaceId: "workspace-1",
    voucherType: "sales",
    voucherDate: "2026-08-31",
    partyName: "Customer One",
    status: "draft",
    totalAmount: 100,
    lines: [
      { id: "customer", ledger: "Customer One", description: "Receivable", debit: 100, credit: 0 },
      { id: "sales", ledger: "Sales Account", description: "Sale", debit: 0, credit: 100 },
    ],
    ...overrides,
  };
}

type WorkflowInternals = {
  resolveVoucherScope(
    granted: Set<string>,
    voucherType: VoucherEntryType,
    action: "view" | "create" | "edit" | "delete",
    documentKind?: string | null,
  ): { resource: string | null; scope: "full" | "own" | "none" };
  resolveWorkflowOrigin(
    user: AuthenticatedRequestUser,
    input: CreateVoucherDto,
    voucherType: VoucherEntryType,
    existing?: {
      workflowOrigin?: VoucherWorkflowOrigin | null;
      sourceVoucherId?: string | null;
    },
  ): Promise<VoucherWorkflowOrigin>;
  validateSalesWorkflowLink(
    input: CreateVoucherDto,
    origin: VoucherWorkflowOrigin,
    existingId?: string,
    existingSourceVoucherId?: string | null,
  ): Promise<void>;
  assertReceiptNoteAgainstPurchaseOrder(
    input: CreateVoucherDto,
    inventoryItems: Array<{
      inventoryItemId: string | null;
      sourceInventoryLineId: string | null;
      itemName: string;
      quantity: number;
      unitPrice: number;
    }>,
    excludeVoucherId?: string,
    existingSourceVoucherId?: string | null,
  ): Promise<void>;
};

function workflowHarness(options: {
  purchaseWorkflow?: TransactionWorkflowPolicy;
  salesWorkflow?: TransactionWorkflowPolicy;
  voucherFindFirst?: (args: { where: Record<string, unknown> }) => Promise<unknown>;
} = {}) {
  const companyFindUnique = vi.fn(async () => ({
    purchaseWorkflow: options.purchaseWorkflow ?? TransactionWorkflowPolicy.BOTH,
    salesWorkflow: options.salesWorkflow ?? TransactionWorkflowPolicy.BOTH,
  }));
  const voucherEntryFindFirst = vi.fn(options.voucherFindFirst ?? (async () => null));
  const service = new VouchersService({
    company: { findUnique: companyFindUnique },
    voucherEntry: { findFirst: voucherEntryFindFirst },
  } as never, {} as never, {} as never, {} as never) as unknown as WorkflowInternals;
  return { service, companyFindUnique, voucherEntryFindFirst };
}

describe("VouchersService workflow policy and immutable origin", () => {
  it("uses the document stage permission for generic sales workflow vouchers", () => {
    const { service } = workflowHarness();
    const granted = new Set(["sale_order.create"]);

    expect(service.resolveVoucherScope(granted, VoucherEntryType.SALES, "create", "sale-order")).toEqual({
      resource: "sale_order",
      scope: "full",
    });
    expect(service.resolveVoucherScope(granted, VoucherEntryType.SALES, "create", "delivery-note")).toEqual({
      resource: "delivery_challan",
      scope: "none",
    });
    expect(service.resolveVoucherScope(granted, VoucherEntryType.SALES, "create")).toEqual({
      resource: "sale",
      scope: "none",
    });
  });

  it("keeps existing Direct drafts editable after switching the company to Order Based", async () => {
    const { service, companyFindUnique } = workflowHarness({
      purchaseWorkflow: TransactionWorkflowPolicy.ORDER_BASED,
    });
    const input = dto({ voucherType: "purchase", documentKind: "bill", sourceVoucherId: undefined });

    await expect(service.resolveWorkflowOrigin(
      currentUser,
      input,
      VoucherEntryType.PURCHASE,
      { workflowOrigin: VoucherWorkflowOrigin.DIRECT },
    )).resolves.toBe(VoucherWorkflowOrigin.DIRECT);
    expect(companyFindUnique).not.toHaveBeenCalled();
  });

  it("rejects changing an existing voucher from Direct to Order Flow", async () => {
    const { service } = workflowHarness();
    const input = dto({ voucherType: "purchase", documentKind: "bill", sourceVoucherId: "receipt-note-1" });

    await expect(service.resolveWorkflowOrigin(
      currentUser,
      input,
      VoucherEntryType.PURCHASE,
      { workflowOrigin: VoucherWorkflowOrigin.DIRECT },
    )).rejects.toThrow("workflow origin cannot be changed");
  });

  it("keeps a legacy Sales-Order-linked Invoice Direct when its source is unchanged", async () => {
    const { service } = workflowHarness();
    const input = dto({ sourceVoucherId: "sales-order-legacy" });

    await expect(service.resolveWorkflowOrigin(
      currentUser,
      input,
      VoucherEntryType.SALES,
      {
        workflowOrigin: VoucherWorkflowOrigin.DIRECT,
        sourceVoucherId: "sales-order-legacy",
      },
    )).resolves.toBe(VoucherWorkflowOrigin.DIRECT);

    await expect(service.validateSalesWorkflowLink(
      input,
      VoucherWorkflowOrigin.DIRECT,
      "invoice-legacy",
      "sales-order-legacy",
    )).resolves.toBeUndefined();
  });

  it("does not let a legacy Direct Invoice replace its captured source", async () => {
    const { service } = workflowHarness();

    await expect(service.resolveWorkflowOrigin(
      currentUser,
      dto({ sourceVoucherId: "different-source" }),
      VoucherEntryType.SALES,
      {
        workflowOrigin: VoucherWorkflowOrigin.DIRECT,
        sourceVoucherId: "sales-order-legacy",
      },
    )).rejects.toThrow("workflow origin cannot be changed");
  });

  it("allows an old order chain to finish after switching to Direct but blocks a new Sales Order", async () => {
    const { service } = workflowHarness({ salesWorkflow: TransactionWorkflowPolicy.DIRECT });

    await expect(service.resolveWorkflowOrigin(
      currentUser,
      dto({ sourceVoucherId: "delivery-note-1" }),
      VoucherEntryType.SALES,
    )).resolves.toBe(VoucherWorkflowOrigin.ORDER_FLOW);

    await expect(service.resolveWorkflowOrigin(
      currentUser,
      dto({ voucherType: "sales-order", documentKind: "sale-order" }),
      VoucherEntryType.SALES_ORDER,
    )).rejects.toThrow("Sales workflow is Direct");
  });

  it("requires a Direct-capable sales policy for a new standalone invoice", async () => {
    const { service } = workflowHarness({ salesWorkflow: TransactionWorkflowPolicy.ORDER_BASED });

    await expect(service.resolveWorkflowOrigin(
      currentUser,
      dto(),
      VoucherEntryType.SALES,
    )).rejects.toThrow("Sales workflow is Order Based");
  });
});

describe("VouchersService Sales Invoice order-flow lineage", () => {
  it("accepts only a Delivery Note that retains its Sales Order", async () => {
    const { service } = workflowHarness({
      voucherFindFirst: async ({ where }) => {
        if (where.id === "delivery-note-1") {
          return {
            voucherType: VoucherEntryType.SALES,
            documentKind: "delivery-note",
            voucherNumber: "DN-2608-00001",
            sourceVoucherId: "sales-order-1",
            status: VoucherEntryStatus.POSTED,
          };
        }
        if (where.id === "sales-order-1") return { id: "sales-order-1" };
        return null;
      },
    });

    await expect(service.validateSalesWorkflowLink(
      dto({ sourceVoucherId: "delivery-note-1" }),
      VoucherWorkflowOrigin.ORDER_FLOW,
    )).resolves.toBeUndefined();
  });

  it("does not impose a one-Invoice-per-Delivery-Note header rule", async () => {
    const { service, voucherEntryFindFirst } = workflowHarness({
      voucherFindFirst: async ({ where }) => {
        if (where.id === "delivery-note-1") {
          return {
            voucherType: VoucherEntryType.SALES,
            documentKind: "delivery-note",
            voucherNumber: "DN-2608-00001",
            sourceVoucherId: "sales-order-1",
            status: VoucherEntryStatus.POSTED,
          };
        }
        if (where.id === "sales-order-1") return { id: "sales-order-1" };
        // The old implementation issued a third header-child query here and
        // rejected the second partial Invoice. Exact line quantities now own
        // that decision in assertSalesInvoiceAllocation().
        return { voucherNumber: "SI-EARLIER-PARTIAL" };
      },
    });

    await expect(service.validateSalesWorkflowLink(
      dto({ sourceVoucherId: "delivery-note-1" }),
      VoucherWorkflowOrigin.ORDER_FLOW,
    )).resolves.toBeUndefined();
    expect(voucherEntryFindFirst).toHaveBeenCalledTimes(2);
  });

  it("rejects a Sales Invoice linked to a non-delivery document", async () => {
    const { service } = workflowHarness({
      voucherFindFirst: async ({ where }) => where.id === "not-a-delivery"
        ? {
            voucherType: VoucherEntryType.SALES_ORDER,
            documentKind: "sale-order",
            voucherNumber: "SO-2608-00001",
            sourceVoucherId: null,
          }
        : null,
    });

    await expect(service.validateSalesWorkflowLink(
      dto({ sourceVoucherId: "not-a-delivery" }),
      VoucherWorkflowOrigin.ORDER_FLOW,
    )).rejects.toThrow("valid Delivery Note");
  });

  it("requires a posted Delivery Note for a new Invoice but permits an unchanged legacy source on edit", async () => {
    const { service } = workflowHarness({
      voucherFindFirst: async ({ where }) => {
        if (where.id === "delivery-note-legacy") {
          return {
            voucherType: VoucherEntryType.SALES,
            documentKind: "delivery-note",
            voucherNumber: "DN-LEGACY",
            sourceVoucherId: "sales-order-1",
            status: VoucherEntryStatus.REVERSED,
          };
        }
        if (where.id === "sales-order-1") return { id: "sales-order-1" };
        return null;
      },
    });
    const input = dto({ sourceVoucherId: "delivery-note-legacy" });

    await expect(service.validateSalesWorkflowLink(
      input,
      VoucherWorkflowOrigin.ORDER_FLOW,
    )).rejects.toThrow("Delivery Note DN-LEGACY must be posted");

    await expect(service.validateSalesWorkflowLink(
      input,
      VoucherWorkflowOrigin.ORDER_FLOW,
      "invoice-existing",
      "delivery-note-legacy",
    )).resolves.toBeUndefined();
  });
});

describe("VouchersService workflow-source reversal guard", () => {
  it.each([
    {
      label: "Purchase Order",
      source: {
        id: "purchase-order-1",
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "purchase-order",
        voucherNumber: "PO-2608-00001",
      },
      child: {
        voucherType: VoucherEntryType.PURCHASE,
        documentKind: "receipt-note",
        voucherNumber: "GRN-2608-00001",
      },
    },
    {
      label: "Delivery Note",
      source: {
        id: "delivery-note-1",
        voucherType: VoucherEntryType.SALES,
        documentKind: "delivery-note",
        voucherNumber: "DN-2608-00001",
      },
      child: {
        voucherType: VoucherEntryType.SALES,
        // Historical Sales Invoices can carry the old generic "bill" marker.
        // They are still active invoice children and must protect their DN.
        documentKind: "bill",
        voucherNumber: "SI-2608-00001",
      },
    },
  ])("does not reverse a $label while an active downstream document exists", async ({ source, child }) => {
    const reverseVoucher = vi.fn();
    const prisma = {
      workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
      voucherInventoryItem: {
        findMany: vi.fn(async () => source.documentKind === "delivery-note" ? [{ id: "delivery-line-1" }] : []),
      },
      voucherEntry: {
        findUnique: vi.fn(async () => ({
          ...source,
          workspaceId: "workspace-1",
          reference: null,
          createdByUserId: "user-1",
        })),
        findFirst: vi.fn(async () => child),
      },
    };
    const service = new VouchersService(
      prisma as never,
      { reverseVoucher } as never,
      {} as never,
      {} as never,
    );

    await expect(service.reverse(currentUser, source.id)).rejects.toThrow("cannot be reversed while active");
    expect(reverseVoucher).not.toHaveBeenCalled();
    expect(prisma.voucherEntry.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: {
          notIn: expect.arrayContaining([
            VoucherEntryStatus.CANCELLED,
            VoucherEntryStatus.REVERSED,
          ]),
        },
      }),
    }));
  });

  it("blocks a non-primary Delivery Note when an active Invoice sources one of its lines", async () => {
    const reverseVoucher = vi.fn();
    const findFirst = vi.fn(async ({ where }: { where: { AND?: Array<{ OR?: unknown[] }> } }) => {
      const lineage = where.AND?.[1];
      const hasLineSource = JSON.stringify(lineage).includes("delivery-line-secondary");
      return hasLineSource ? { voucherNumber: "SI-COMBINED" } : null;
    });
    const prisma = {
      workspaceMember: { findFirst: vi.fn(async () => ({ id: "membership-1" })) },
      voucherInventoryItem: { findMany: vi.fn(async () => [{ id: "delivery-line-secondary" }]) },
      voucherEntry: {
        findUnique: vi.fn(async () => ({
          id: "delivery-secondary",
          workspaceId: "workspace-1",
          voucherType: VoucherEntryType.SALES,
          documentKind: "delivery-note",
          voucherNumber: "DN-SECONDARY",
          reference: null,
          createdByUserId: "user-1",
        })),
        findFirst,
      },
    };
    const service = new VouchersService(
      prisma as never,
      { reverseVoucher } as never,
      {} as never,
      {} as never,
    );

    await expect(service.reverse(currentUser, "delivery-secondary")).rejects.toThrow(
      "cannot be reversed while active Sales Invoice SI-COMBINED exists",
    );
    expect(reverseVoucher).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalled();
  });
});

describe("VouchersService partial Purchase Order receipts", () => {
  function partialReceipt(requestedQuantity: number) {
    const service = new VouchersService({
      voucherEntry: {
        findUnique: vi.fn(async () => ({
          id: "purchase-order-1",
          workspaceId: "workspace-1",
          voucherType: VoucherEntryType.PURCHASE,
          documentKind: "purchase-order",
          voucherNumber: "PO-2608-00001",
          status: VoucherEntryStatus.POSTED,
          partyName: "Supplier One",
          voucherDate: new Date("2026-08-01"),
          inventoryItems: [{
            id: "po-line-1",
            inventoryItemId: "item-1",
            itemName: "Paracetamol API",
            quantity: 10,
            unitPrice: 800,
          }],
        })),
        findMany: vi.fn(async () => ([{
          id: "receipt-note-1",
          inventoryItems: [{ sourceInventoryLineId: "po-line-1", quantity: 4 }],
        }])),
      },
    } as never, {} as never, {} as never, {} as never) as unknown as WorkflowInternals;

    return service.assertReceiptNoteAgainstPurchaseOrder(
      dto({
        voucherType: "purchase",
        documentKind: "receipt-note",
        sourceVoucherId: "purchase-order-1",
        partyName: "Supplier One",
        voucherDate: "2026-08-02",
      }),
      [{
        inventoryItemId: "item-1",
        sourceInventoryLineId: "po-line-1",
        itemName: "Paracetamol API",
        quantity: requestedQuantity,
        unitPrice: 800,
      }],
    );
  }

  it("allows another Receipt Note up to the Purchase Order's remaining quantity", async () => {
    await expect(partialReceipt(6)).resolves.toBeUndefined();
  });

  it("rejects cumulative Receipt Note quantities above the Purchase Order", async () => {
    await expect(partialReceipt(7)).rejects.toThrow("only 6 more can be received");
  });
});
