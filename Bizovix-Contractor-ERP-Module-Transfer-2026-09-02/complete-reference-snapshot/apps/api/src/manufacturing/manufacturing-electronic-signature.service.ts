import argon2 from "argon2";

import {
  BadRequestException,
  Injectable,
  PreconditionFailedException,
  UnauthorizedException,
} from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { Prisma } from "../generated/prisma/index.js";
import { parseManufacturingElectronicSignaturePolicy } from "./manufacturing-electronic-signature.domain.js";

type Scope = { id: string; tenantId: string; companyId: string };

export type ManufacturingElectronicSignatureEvidence = {
  policyRecordId: string;
  policyCode: string;
  policyVersion: number;
  reauthenticated: boolean;
  sessionValidated: boolean;
};

@Injectable()
export class ManufacturingElectronicSignatureService {
  async enforce(
    tx: Prisma.TransactionClient,
    input: {
      scope: Scope;
      user: AuthenticatedRequestUser;
      actionLabel: string;
      signatureMeaning?: string | null;
      reauthenticationPassword?: string | null;
      required: boolean;
    },
  ): Promise<ManufacturingElectronicSignatureEvidence | null> {
    const signatureMeaning = input.signatureMeaning?.trim() || null;
    if (!input.required && !signatureMeaning) return null;

    const record = await tx.manufacturingControlRecord.findFirst({
      where: {
        workspaceId: input.scope.id,
        kind: "ELECTRONIC_SIGNATURE_POLICY",
        status: "APPROVED",
      },
      orderBy: [{ approvedAt: "desc" }, { versionNumber: "desc" }],
      select: { id: true, code: true, versionNumber: true, payload: true },
    });
    if (!record) {
      throw new PreconditionFailedException(
        "An approved manufacturing electronic-signature policy is required before this signed action can continue.",
      );
    }

    const policy = parseManufacturingElectronicSignaturePolicy(record.payload);
    if (!policy) {
      throw new PreconditionFailedException(
        "The approved manufacturing electronic-signature policy is invalid. Correct and reapprove the policy before continuing.",
      );
    }
    if (
      !signatureMeaning ||
      !policy.signatureMeanings.includes(signatureMeaning)
    ) {
      throw new BadRequestException(
        `Electronic-signature meaning for ${input.actionLabel} must exactly match one of the approved policy meanings: ${policy.signatureMeanings.join(", ")}.`,
      );
    }
    if (policy.mfaRequired) {
      throw new PreconditionFailedException(
        "Manufacturing electronic-signature policy requires MFA, but MFA verification is not configured. This signed action is blocked until MFA is available or the policy is revised and approved.",
      );
    }

    const session = await tx.userSession.findFirst({
      where: {
        id: input.user.sessionId,
        userId: input.user.id,
        tenantId: input.scope.tenantId,
        companyId: input.scope.companyId,
      },
      select: {
        id: true,
        expiresAt: true,
        lastUsedAt: true,
        revokedAt: true,
        user: { select: { passwordHash: true } },
      },
    });
    const now = new Date();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now.getTime()
    ) {
      throw new UnauthorizedException(
        "The authenticated session is no longer active. Sign in again before applying an electronic signature.",
      );
    }
    const policyDeadline =
      session.lastUsedAt.getTime() + policy.sessionTimeoutMinutes * 60_000;
    if (policyDeadline <= now.getTime()) {
      throw new UnauthorizedException(
        `The manufacturing electronic-signature session expired after ${policy.sessionTimeoutMinutes} minutes. Sign in again before retrying.`,
      );
    }

    let reauthenticated = false;
    if (policy.reauthenticationRequired) {
      const password = input.reauthenticationPassword;
      if (typeof password !== "string" || password.length === 0) {
        throw new UnauthorizedException(
          "Current password is required to apply this manufacturing electronic signature.",
        );
      }
      let valid: boolean;
      try {
        valid = await argon2.verify(session.user.passwordHash, password);
      } catch {
        valid = false;
      }
      if (!valid)
        throw new UnauthorizedException(
          "Current password is incorrect; the manufacturing electronic signature was not applied.",
        );
      reauthenticated = true;
    }

    return {
      policyRecordId: record.id,
      policyCode: record.code,
      policyVersion: record.versionNumber,
      reauthenticated,
      sessionValidated: true,
    };
  }
}
