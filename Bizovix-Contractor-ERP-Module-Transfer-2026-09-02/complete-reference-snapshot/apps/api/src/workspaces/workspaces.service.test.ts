import { describe, expect, it, vi } from "vitest";

import { TransactionWorkflowPolicy } from "../generated/prisma/index.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { WorkspacesService } from "./workspaces.service.js";

type RoleInternals = {
  normalizeShareRole(value: unknown): "Manager" | "Accountant" | "Staff" | "Auditor";
  defaultPermissionMatrix(role: "Manager" | "Accountant" | "Staff" | "Auditor"): Record<string, Record<string, string>>;
  buildGrantedPermissionKeys(matrix: Record<string, Record<string, string>>, role: "Manager" | "Accountant" | "Staff" | "Auditor"): Set<string>;
};

function internals() {
  return new WorkspacesService({} as never, {} as never) as unknown as RoleInternals;
}

describe("WorkspacesService team roles", () => {
  it.each([
    ["Admin", "Manager"],
    ["Biller", "Staff"],
    ["Viewer", "Auditor"],
  ] as const)("keeps legacy %s roles compatible as %s", (legacyRole, expectedRole) => {
    expect(internals().normalizeShareRole(legacyRole)).toBe(expectedRole);
  });

  it("never grants posting, deletion, or workspace management to Staff", () => {
    const service = internals();
    const permissions = service.buildGrantedPermissionKeys(service.defaultPermissionMatrix("Staff"), "Staff");

    expect(permissions.has("accounting.voucher.create")).toBe(true);
    expect(permissions.has("accounting.voucher.post")).toBe(false);
    expect(permissions.has("accounting.voucher.delete")).toBe(false);
    expect(permissions.has("workspace.manage")).toBe(false);
  });

  it("keeps Auditor access read-only", () => {
    const service = internals();
    const permissions = service.buildGrantedPermissionKeys(service.defaultPermissionMatrix("Auditor"), "Auditor");

    expect(permissions.has("dashboard.view")).toBe(true);
    expect(permissions.has("accounting.voucher.create")).toBe(false);
    expect(permissions.has("accounting.voucher.post")).toBe(false);
  });
});

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

function workflowHarness(membershipRole: "OWNER" | "ADMIN" | "MEMBER" = "OWNER") {
  const updatedAt = new Date("2026-08-31T08:00:00.000Z");
  const companyUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "company-1",
    ...data,
    updatedAt,
  }));
  const prisma = {
    workspaceMember: {
      findFirst: vi.fn(async () => ({
        id: "workspace-member-1",
        workspace: { id: "workspace-1", tenantId: "tenant-1", companyId: "company-1" },
      })),
    },
    tenantMember: {
      findUnique: vi.fn(async () => ({ id: "tenant-member-1", membershipRole })),
    },
    company: {
      findUniqueOrThrow: vi.fn(async () => ({
        id: "company-1",
        purchaseWorkflow: TransactionWorkflowPolicy.BOTH,
        salesWorkflow: TransactionWorkflowPolicy.BOTH,
        updatedAt,
      })),
      update: companyUpdate,
    },
  };
  const audit = { log: vi.fn(async () => undefined) };
  return {
    service: new WorkspacesService(prisma as never, audit as never),
    prisma,
    audit,
    companyUpdate,
  };
}

describe("WorkspacesService transaction workflow settings", () => {
  it("returns the company-level purchase and sales policies", async () => {
    const { service } = workflowHarness();

    await expect(service.getTransactionWorkflowSettings(currentUser, "workspace-1")).resolves.toEqual({
      purchaseWorkflow: TransactionWorkflowPolicy.BOTH,
      salesWorkflow: TransactionWorkflowPolicy.BOTH,
      updatedAt: new Date("2026-08-31T08:00:00.000Z"),
    });
  });

  it.each(["OWNER", "ADMIN"] as const)("lets a tenant %s change policies without touching vouchers", async (role) => {
    const { service, companyUpdate, audit, prisma } = workflowHarness(role);

    const result = await service.saveTransactionWorkflowSettings(currentUser, "workspace-1", {
      purchaseWorkflow: TransactionWorkflowPolicy.DIRECT,
      salesWorkflow: TransactionWorkflowPolicy.ORDER_BASED,
    });

    expect(result).toEqual(expect.objectContaining({
      purchaseWorkflow: TransactionWorkflowPolicy.DIRECT,
      salesWorkflow: TransactionWorkflowPolicy.ORDER_BASED,
    }));
    expect(companyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        purchaseWorkflow: TransactionWorkflowPolicy.DIRECT,
        salesWorkflow: TransactionWorkflowPolicy.ORDER_BASED,
      },
    }));
    expect((prisma as Record<string, unknown>).voucherEntry).toBeUndefined();
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: "TRANSACTION_WORKFLOW_CHANGED",
      entityType: "Company",
    }));
  });

  it("rejects invalid policy values and non-admin members", async () => {
    const invalid = workflowHarness();
    await expect(invalid.service.saveTransactionWorkflowSettings(currentUser, "workspace-1", {
      purchaseWorkflow: "ADVANCED",
      salesWorkflow: TransactionWorkflowPolicy.BOTH,
    })).rejects.toThrow("purchaseWorkflow must be DIRECT, ORDER_BASED, or BOTH");

    const member = workflowHarness("MEMBER");
    await expect(member.service.saveTransactionWorkflowSettings(currentUser, "workspace-1", {
      purchaseWorkflow: TransactionWorkflowPolicy.DIRECT,
      salesWorkflow: TransactionWorkflowPolicy.DIRECT,
    })).rejects.toThrow("Only the workspace owner can manage users");
  });
});

describe("WorkspacesService workspace selection scope", () => {
  it("moves the full session company scope with a selected cross-company workspace", async () => {
    const sessionUpdate = vi.fn(async () => ({}));
    const prisma = {
      workspaceMember: {
        findFirst: vi.fn(async () => ({
          id: "membership-2",
          workspace: {
            tenantId: "tenant-1",
            organizationId: "organization-2",
            companyId: "company-2",
          },
        })),
      },
      userSession: { update: sessionUpdate },
    };
    const service = new WorkspacesService(prisma as never, {} as never);

    await expect(service.selectWorkspace(currentUser, "workspace-2")).resolves.toEqual({ success: true });
    expect(sessionUpdate).toHaveBeenCalledWith({
      where: { id: "session-1" },
      data: {
        workspaceId: "workspace-2",
        tenantId: "tenant-1",
        organizationId: "organization-2",
        companyId: "company-2",
      },
    });
  });
});
