import { createHash } from "node:crypto";

import { BadRequestException, ConflictException } from "@nestjs/common";
import {
  Prisma,
  type ManufacturingDocumentKind,
} from "../generated/prisma/index.js";
import { formatManufacturingDocumentNumber } from "./manufacturing-blueprint.domain.js";

type Scope = { id: string; tenantId: string; companyId: string };

type IssueManufacturingDocumentNumberInput = {
  documentKind: ManufacturingDocumentKind;
  issuedAt: Date;
  idempotencyKey: string;
  entityType?: string | null;
  entityId?: string | null;
  validateIssuedAtOnReplay?: boolean;
};

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}

export function manufacturingEntityIdFromIdempotency(
  workspaceId: string,
  entityType: string,
  idempotencyKey: string,
) {
  const bytes = createHash("sha256")
    .update([workspaceId, entityType, idempotencyKey].join("|"))
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function assertReplayMatches(
  replay: {
    documentKind: ManufacturingDocumentKind;
    issuedAt: Date;
    entityType: string | null;
    entityId: string | null;
  },
  input: IssueManufacturingDocumentNumberInput,
) {
  if (
    replay.documentKind !== input.documentKind ||
    replay.entityType !== cleanText(input.entityType) ||
    replay.entityId !== cleanText(input.entityId) ||
    (input.validateIssuedAtOnReplay &&
      replay.issuedAt.getTime() !== input.issuedAt.getTime())
  ) {
    throw new ConflictException(
      "Document-number idempotency key is already used for a different request.",
    );
  }
}

export async function issueManufacturingDocumentNumberTx(
  tx: Prisma.TransactionClient,
  scope: Scope,
  userId: string,
  input: IssueManufacturingDocumentNumberInput,
) {
  const entityType = cleanText(input.entityType);
  const entityId = cleanText(input.entityId);
  if (Boolean(entityType) !== Boolean(entityId)) {
    throw new BadRequestException(
      "Document-number entityType and entityId must either both be supplied or both be omitted.",
    );
  }
  if (!input.idempotencyKey.trim()) {
    throw new BadRequestException(
      "Document-number idempotencyKey is required.",
    );
  }

  // Serialize retries of the same logical request before reading its replay.
  // The sequence-row lock below protects different requests that allocate from
  // the same series. Both locks are transaction-scoped and release on rollback.
  await tx.$executeRaw(
    Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`manufacturing-document:${scope.id}:${input.idempotencyKey}`}, 0))`,
  );
  const replay = await tx.manufacturingDocumentNumber.findUnique({
    where: {
      workspaceId_idempotencyKey: {
        workspaceId: scope.id,
        idempotencyKey: input.idempotencyKey,
      },
    },
  });
  if (replay) {
    assertReplayMatches(replay, input);
    return replay;
  }

  const candidate = await tx.manufacturingDocumentSequence.findUnique({
    where: {
      workspaceId_documentKind: {
        workspaceId: scope.id,
        documentKind: input.documentKind,
      },
    },
    select: { id: true },
  });
  if (!candidate)
    throw new BadRequestException(
      `Configure an active ${input.documentKind} document sequence first.`,
    );
  const lockedRows = await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "ManufacturingDocumentSequence" WHERE "id" = ${candidate.id} FOR UPDATE`,
  );
  if (!lockedRows.length)
    throw new BadRequestException(
      `Configure an active ${input.documentKind} document sequence first.`,
    );
  const sequence = await tx.manufacturingDocumentSequence.findUnique({
    where: { id: candidate.id },
  });
  if (!sequence?.isActive)
    throw new BadRequestException(
      `Configure an active ${input.documentKind} document sequence first.`,
    );
  const year = input.issuedAt.getUTCFullYear();
  const month = input.issuedAt.getUTCMonth() + 1;
  const resetPeriod =
    sequence.resetPeriod ?? (sequence.resetAnnually ? "ANNUAL" : "NEVER");
  const issuedPeriod =
    resetPeriod === "MONTHLY"
      ? `${year}-${String(month).padStart(2, "0")}`
      : resetPeriod === "ANNUAL"
        ? String(year)
        : "NEVER";
  const sequenceNumber =
    resetPeriod !== "NEVER" && sequence.lastIssuedPeriod !== issuedPeriod
      ? 1
      : sequence.nextNumber;
  const documentNumber = formatManufacturingDocumentNumber({
    prefix: sequence.prefix,
    sequenceNumber,
    padding: sequence.padding,
    year,
    month,
    includeYear: resetPeriod !== "NEVER",
    resetPeriod,
  });
  const row = await tx.manufacturingDocumentNumber.create({
    data: {
      tenantId: scope.tenantId,
      companyId: scope.companyId,
      workspaceId: scope.id,
      sequenceId: sequence.id,
      documentKind: input.documentKind,
      documentNumber,
      sequenceNumber,
      issuedYear: year,
      issuedPeriod,
      entityType,
      entityId,
      idempotencyKey: input.idempotencyKey,
      issuedByUserId: userId,
      issuedAt: input.issuedAt,
    },
  });
  await tx.manufacturingDocumentSequence.update({
    where: { id: sequence.id },
    data: {
      nextNumber: sequenceNumber + 1,
      lastIssuedYear: year,
      lastIssuedPeriod: issuedPeriod,
      updatedByUserId: userId,
    },
  });
  return row;
}
