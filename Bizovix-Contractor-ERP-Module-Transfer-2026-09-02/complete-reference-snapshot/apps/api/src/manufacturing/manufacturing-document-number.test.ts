import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "../generated/prisma/index.js";
import {
  issueManufacturingDocumentNumberTx,
  manufacturingEntityIdFromIdempotency,
} from "./manufacturing-document-number.js";

const scope = {
  id: "workspace-1",
  tenantId: "tenant-1",
  companyId: "company-1",
};
const issuedAt = new Date("2026-09-01T00:00:00.000Z");

function transactionMock(replay: unknown = null) {
  const created = {
    id: "number-1",
    documentKind: "BOM",
    documentNumber: "BOM-2026-000007",
    issuedAt,
    entityType: "ManufacturingBom",
    entityId: "bom-1",
  };
  return {
    created,
    tx: {
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockResolvedValue([{ id: "sequence-1" }]),
      manufacturingDocumentNumber: {
        findUnique: vi.fn().mockResolvedValue(replay),
        create: vi.fn().mockResolvedValue(created),
      },
      manufacturingDocumentSequence: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "sequence-1" })
          .mockResolvedValueOnce({
            id: "sequence-1",
            isActive: true,
            prefix: "BOM",
            nextNumber: 7,
            padding: 6,
            resetAnnually: true,
            resetPeriod: "ANNUAL",
            lastIssuedPeriod: "2026",
          }),
        update: vi.fn().mockResolvedValue({}),
      },
    },
  };
}

describe("shared manufacturing document-number issuer", () => {
  it("locks the request and sequence, persists entity ownership and advances exactly once", async () => {
    const mock = transactionMock();
    const result = await issueManufacturingDocumentNumberTx(
      mock.tx as unknown as Prisma.TransactionClient,
      scope,
      "user-1",
      {
        documentKind: "BOM",
        issuedAt,
        idempotencyKey: "create-bom-1",
        entityType: "ManufacturingBom",
        entityId: "bom-1",
        validateIssuedAtOnReplay: true,
      },
    );

    expect(result).toBe(mock.created);
    expect(mock.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(mock.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mock.tx.manufacturingDocumentNumber.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          documentNumber: "BOM-2026-000007",
          sequenceNumber: 7,
          entityType: "ManufacturingBom",
          entityId: "bom-1",
          idempotencyKey: "create-bom-1",
        }),
      }),
    );
    expect(mock.tx.manufacturingDocumentSequence.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ nextNumber: 8 }),
      }),
    );
  });

  it("replays the exact request without touching the sequence", async () => {
    const replay = {
      id: "number-existing",
      documentKind: "BOM",
      documentNumber: "BOM-2026-000007",
      issuedAt,
      entityType: "ManufacturingBom",
      entityId: "bom-1",
    };
    const mock = transactionMock(replay);
    const result = await issueManufacturingDocumentNumberTx(
      mock.tx as unknown as Prisma.TransactionClient,
      scope,
      "user-1",
      {
        documentKind: "BOM",
        issuedAt,
        idempotencyKey: "create-bom-1",
        entityType: "ManufacturingBom",
        entityId: "bom-1",
        validateIssuedAtOnReplay: true,
      },
    );

    expect(result).toBe(replay);
    expect(mock.tx.$queryRaw).not.toHaveBeenCalled();
    expect(mock.tx.manufacturingDocumentNumber.create).not.toHaveBeenCalled();
    expect(mock.tx.manufacturingDocumentSequence.update).not.toHaveBeenCalled();
  });

  it("rejects an idempotency replay owned by a different entity", async () => {
    const mock = transactionMock({
      documentKind: "BOM",
      issuedAt,
      entityType: "ManufacturingBom",
      entityId: "other-bom",
    });

    await expect(
      issueManufacturingDocumentNumberTx(
        mock.tx as unknown as Prisma.TransactionClient,
        scope,
        "user-1",
        {
          documentKind: "BOM",
          issuedAt,
          idempotencyKey: "create-bom-1",
          entityType: "ManufacturingBom",
          entityId: "bom-1",
          validateIssuedAtOnReplay: true,
        },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("derives stable, entity-scoped UUIDs from client idempotency", () => {
    const first = manufacturingEntityIdFromIdempotency(
      "workspace-1",
      "ManufacturingBom",
      "key-1",
    );
    expect(first).toBe(
      manufacturingEntityIdFromIdempotency(
        "workspace-1",
        "ManufacturingBom",
        "key-1",
      ),
    );
    expect(first).not.toBe(
      manufacturingEntityIdFromIdempotency(
        "workspace-1",
        "ManufacturingOrder",
        "key-1",
      ),
    );
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
