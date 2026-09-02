import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { PermissionsService } from "../common/services/permissions.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import type { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";

import {
  ManufacturingGovernanceService,
  manufacturingGovernanceEvidenceHash,
  sanitizeManufacturingGovernanceJson,
  validateManufacturingGovernanceDetails,
} from "./manufacturing-governance.service.js";

describe("manufacturing governance controls", () => {
  it("accepts a sequenced maker-checker approval workflow", () => {
    expect(() =>
      validateManufacturingGovernanceDetails("APPROVAL_WORKFLOW", {
        description: "Production-order review and approval",
        workflowScope: "PRODUCTION_ORDER",
        stages: [
          {
            sequence: 1,
            permissionKey: "manufacturing.order.approve",
            signatureMeaning: "Approved",
          },
          {
            sequence: 2,
            permissionKey: "manufacturing.audit.review",
            signatureMeaning: "Verified",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects duplicate approval-stage sequences", () => {
    expect(() =>
      validateManufacturingGovernanceDetails("APPROVAL_WORKFLOW", {
        description: "Invalid duplicate sequence",
        workflowScope: "PRODUCTION_ORDER",
        stages: [
          {
            sequence: 1,
            permissionKey: "manufacturing.order.approve",
            signatureMeaning: "Approved",
          },
          {
            sequence: 1,
            permissionKey: "manufacturing.audit.review",
            signatureMeaning: "Verified",
          },
        ],
      }),
    ).toThrow("sequences must be unique");
  });

  it("rejects unsupported workflow scopes and non-consecutive stages", () => {
    expect(() =>
      validateManufacturingGovernanceDetails("APPROVAL_WORKFLOW", {
        description: "Unsupported workflow",
        workflowScope: "INVENTED_SCOPE",
        stages: [
          {
            sequence: 1,
            permissionKey: "manufacturing.order.approve",
            signatureMeaning: "Approved",
          },
        ],
      }),
    ).toThrow("Workflow scope must be one of");

    expect(() =>
      validateManufacturingGovernanceDetails("APPROVAL_WORKFLOW", {
        description: "Gapped stages",
        workflowScope: "PRODUCTION_ORDER",
        stages: [
          {
            sequence: 1,
            permissionKey: "manufacturing.order.approve",
            signatureMeaning: "Approved",
          },
          {
            sequence: 3,
            permissionKey: "manufacturing.audit.review",
            signatureMeaning: "Verified",
          },
        ],
      }),
    ).toThrow("consecutive and start at 1");
  });

  it("requires unique status transitions with manufacturing permissions", () => {
    expect(() =>
      validateManufacturingGovernanceDetails("STATUS_CONFIGURATION", {
        description: "Production order lifecycle",
        workflowScope: "PRODUCTION_ORDER",
        transitions: [
          {
            from: "DRAFT",
            to: "SUBMITTED",
            permissionKey: "manufacturing.order.create",
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      validateManufacturingGovernanceDetails("STATUS_CONFIGURATION", {
        description: "Duplicate transition",
        workflowScope: "PRODUCTION_ORDER",
        transitions: [
          {
            from: "DRAFT",
            to: "SUBMITTED",
            permissionKey: "manufacturing.order.create",
          },
          {
            from: "DRAFT",
            to: "SUBMITTED",
            permissionKey: "admin.override",
          },
        ],
      }),
    ).toThrow("duplicates DRAFT->SUBMITTED");
  });

  it("never accepts credentials in an integration controlled record", () => {
    expect(() =>
      sanitizeManufacturingGovernanceJson({
        description: "LIMS integration",
        systemName: "LIMS",
        secretReference: "vault/manufacturing/lims",
        apiKey: "must-not-be-stored",
      }),
    ).toThrow("secret manager");
  });

  it("requires an allowed quality case type", () => {
    expect(() =>
      validateManufacturingGovernanceDetails("QUALITY_CASE", {
        description: "Actual investigation",
        caseType: "UNCONTROLLED_CASE",
        sourceReference: "BATCH-1",
        severity: "HIGH",
        ownerReference: "QA-1",
        state: "OPEN",
      }),
    ).toThrow("type is invalid");
  });

  it("requires every quality case to link a real order or inventory item", () => {
    const details = {
      description: "Actual investigation",
      caseType: "DEVIATION",
      sourceReference: "BATCH-1",
      severity: "HIGH",
      ownerReference: "QA-1",
      state: "OPEN",
    };
    expect(() =>
      validateManufacturingGovernanceDetails("QUALITY_CASE", details),
    ).toThrow("must link an existing production order or inventory item");
    expect(() =>
      validateManufacturingGovernanceDetails("QUALITY_CASE", {
        ...details,
        productionOrderId: "order-1",
      }),
    ).not.toThrow();
    expect(() =>
      validateManufacturingGovernanceDetails("QUALITY_CASE", {
        ...details,
        inventoryItemId: "item-1",
      }),
    ).not.toThrow();
  });

  it("rejects conflicting quality-case order aliases", () => {
    expect(() =>
      validateManufacturingGovernanceDetails("QUALITY_CASE", {
        description: "Actual investigation",
        caseType: "DEVIATION",
        sourceReference: "BATCH-1",
        severity: "HIGH",
        ownerReference: "QA-1",
        state: "OPEN",
        orderId: "order-1",
        productionOrderId: "order-2",
      }),
    ).toThrow("must reference the same production order");
  });

  it("requires operator qualification details for a training record", () => {
    const base = {
      description: "Qualified to run compressor assembly operation",
      documentType: "TRAINING_RECORD",
      documentNumber: "TRN-2026-001",
      documentVersion: "1",
      ownerReference: "QA Training",
      evidenceReference: "LMS/TRN-2026-001",
    };
    expect(() =>
      validateManufacturingGovernanceDetails("VALIDATION_DOCUMENT", base),
    ).toThrow("Qualified workspace user is required");
    expect(() =>
      validateManufacturingGovernanceDetails("VALIDATION_DOCUMENT", {
        ...base,
        subjectUserId: "user-1",
        qualificationScope: "OP-COMPRESSOR-ASSEMBLY",
        qualificationOutcome: "QUALIFIED",
      }),
    ).not.toThrow();
  });

  it("rejects an uncontrolled training outcome", () => {
    expect(() =>
      validateManufacturingGovernanceDetails("VALIDATION_DOCUMENT", {
        description: "Operator training evidence",
        documentType: "TRAINING_RECORD",
        documentNumber: "TRN-2026-002",
        documentVersion: "1",
        ownerReference: "QA Training",
        evidenceReference: "LMS/TRN-2026-002",
        subjectUserId: "user-1",
        qualificationScope: "ALL",
        qualificationOutcome: "PASSED_WITHOUT_REVIEW",
      }),
    ).toThrow("Qualification outcome must be");
  });

  it("hashes evidence deterministically regardless of object key order", () => {
    expect(manufacturingGovernanceEvidenceHash({ a: 1, b: { c: true } })).toBe(
      manufacturingGovernanceEvidenceHash({ b: { c: true }, a: 1 }),
    );
  });

  it("requires a retrievable attachment for an audit evidence pack", () => {
    const base = {
      description: "September manufacturing UAT evidence",
      scope: "10 Fridge September 2026 controlled run",
      periodFrom: "2026-09-01",
      periodTo: "2026-09-30",
      evidenceReference: "UAT-MFG-2026-09",
    };
    expect(() =>
      validateManufacturingGovernanceDetails("AUDIT_EVIDENCE_PACK", base),
    ).toThrow(/attachments/i);
    expect(() =>
      validateManufacturingGovernanceDetails("AUDIT_EVIDENCE_PACK", {
        ...base,
        attachments: [
          {
            fileName: "approved-uat.txt",
            mimeType: "text/plain",
            sizeBytes: 8,
            dataUrl: "data:text/plain;base64,YXBwcm92ZWQ=",
          },
        ],
      }),
    ).not.toThrow();
  });

  it("rejects execution evidence linked to a missing or foreign-workspace order", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        }),
      },
      manufacturingOrder: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const permissions = {
      getGrantedKeys: vi
        .fn()
        .mockResolvedValue(new Set(["manufacturing.production.execute"])),
    } as unknown as PermissionsService;
    const service = new ManufacturingGovernanceService(
      prisma,
      permissions,
      {} as ManufacturingElectronicSignatureService,
    );
    const user: AuthenticatedRequestUser = {
      id: "user-1",
      email: "operator@example.com",
      name: "Operator",
      initials: "OP",
      tenantId: "tenant-1",
      organizationId: "organization-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    };

    await expect(
      service.createRecord(user, {
        workspaceId: "workspace-1",
        kind: "EXECUTION_EVIDENCE",
        code: "IPC-001",
        name: "In-process check",
        details: {
          description: "Actual in-process observation",
          orderId: "missing-order",
          recordType: "IN_PROCESS_CHECK",
          entries: [{ parameter: "Temperature", value: "5" }],
          evidenceReference: "IPC-REF-001",
        },
        idempotencyKey: "ipc-create-001",
        transactionDate: "2026-09-11T00:00:00.000Z",
      }),
    ).rejects.toThrow(
      "Execution evidence must reference an existing production order in the active workspace.",
    );
  });

  it("rejects a quality case linked to a missing or foreign-workspace order", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        }),
      },
      manufacturingOrder: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const permissions = {
      getGrantedKeys: vi
        .fn()
        .mockResolvedValue(new Set(["manufacturing.quality.manage"])),
    } as unknown as PermissionsService;
    const service = new ManufacturingGovernanceService(
      prisma,
      permissions,
      {} as ManufacturingElectronicSignatureService,
    );
    const user: AuthenticatedRequestUser = {
      id: "user-1",
      email: "qa@example.com",
      name: "QA",
      initials: "QA",
      tenantId: "tenant-1",
      organizationId: "organization-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    };

    await expect(
      service.createRecord(user, {
        workspaceId: "workspace-1",
        kind: "QUALITY_CASE",
        code: "DEV-001",
        name: "Batch deviation",
        details: {
          description: "Actual deviation",
          caseType: "DEVIATION",
          sourceReference: "BATCH-1",
          severity: "HIGH",
          ownerReference: "QA-1",
          state: "OPEN",
          productionOrderId: "foreign-order",
        },
        idempotencyKey: "quality-create-001",
        transactionDate: "2026-09-11T00:00:00.000Z",
      }),
    ).rejects.toThrow(
      "Quality case must reference an existing production order in the active workspace.",
    );
  });

  it("rejects a quality case linked to a missing or foreign-workspace inventory item", async () => {
    const prisma = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        }),
      },
      inventoryItem: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const permissions = {
      getGrantedKeys: vi
        .fn()
        .mockResolvedValue(new Set(["manufacturing.quality.manage"])),
    } as unknown as PermissionsService;
    const service = new ManufacturingGovernanceService(
      prisma,
      permissions,
      {} as ManufacturingElectronicSignatureService,
    );
    const user: AuthenticatedRequestUser = {
      id: "user-1",
      email: "qa@example.com",
      name: "QA",
      initials: "QA",
      tenantId: "tenant-1",
      organizationId: "organization-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    };

    await expect(
      service.createRecord(user, {
        workspaceId: "workspace-1",
        kind: "QUALITY_CASE",
        code: "OOS-001",
        name: "Material OOS",
        details: {
          description: "Actual OOS investigation",
          caseType: "OOS",
          sourceReference: "LOT-1",
          severity: "CRITICAL",
          ownerReference: "QA-1",
          state: "OPEN",
          inventoryItemId: "foreign-item",
        },
        idempotencyKey: "quality-create-002",
        transactionDate: "2026-09-11T00:00:00.000Z",
      }),
    ).rejects.toThrow(
      "Quality case must reference an existing inventory item in the active workspace.",
    );
  });

  it("persists normalized quality-case links for the QA release gate", async () => {
    const createControlRecord = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "quality-record-1",
        versionNumber: 1,
        status: "DRAFT",
        ...data,
      }),
    );
    const db = {
      workspace: {
        findFirst: vi.fn().mockResolvedValue({
          id: "workspace-1",
          tenantId: "tenant-1",
          companyId: "company-1",
        }),
      },
      manufacturingOrder: {
        findFirst: vi.fn().mockResolvedValue({
          id: "order-1",
          finishedProductId: "finished-1",
        }),
      },
      manufacturingPeriod: { findUnique: vi.fn().mockResolvedValue(null) },
      manufacturingWorkflowReview: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "review-1" }),
      },
      manufacturingControlRecord: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: createControlRecord,
      },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(db),
      ),
    };
    const permissions = {
      getGrantedKeys: vi
        .fn()
        .mockResolvedValue(new Set(["manufacturing.quality.manage"])),
    } as unknown as PermissionsService;
    const service = new ManufacturingGovernanceService(
      db as unknown as PrismaService,
      permissions,
      {} as ManufacturingElectronicSignatureService,
    );
    const user: AuthenticatedRequestUser = {
      id: "user-1",
      email: "qa@example.com",
      name: "QA",
      initials: "QA",
      tenantId: "tenant-1",
      organizationId: "organization-1",
      companyId: "company-1",
      workspaceId: "workspace-1",
      sessionId: "session-1",
    };

    await service.createRecord(user, {
      workspaceId: "workspace-1",
      kind: "QUALITY_CASE",
      code: "DEV-002",
      name: "Linked batch deviation",
      details: {
        description: "Actual deviation",
        caseType: "DEVIATION",
        sourceReference: "BATCH-1",
        severity: "HIGH",
        ownerReference: "QA-1",
        state: "OPEN",
        productionOrderId: "order-1",
      },
      idempotencyKey: "quality-create-003",
      transactionDate: "2026-09-11T00:00:00.000Z",
    });

    expect(createControlRecord).toHaveBeenCalledWith({
      data: expect.objectContaining({
        inventoryItemId: "finished-1",
        payload: expect.objectContaining({
          details: expect.objectContaining({
            orderId: "order-1",
            productionOrderId: "order-1",
            inventoryItemId: "finished-1",
            state: "OPEN",
          }),
        }),
      }),
    });
  });
});
