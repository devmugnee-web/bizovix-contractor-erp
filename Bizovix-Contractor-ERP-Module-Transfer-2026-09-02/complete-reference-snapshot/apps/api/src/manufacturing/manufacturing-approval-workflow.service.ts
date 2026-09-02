import { createHash } from "node:crypto";

import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  PreconditionFailedException,
} from "@nestjs/common";

import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import { Prisma } from "../generated/prisma/index.js";
import { PrismaService } from "../prisma/prisma.service.js";
import {
  approvalProgress,
  parseManufacturingApprovalWorkflow,
  type ManufacturingApprovalWorkflowScope,
} from "./manufacturing-approval-workflow.domain.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";

type Scope = { id: string; tenantId: string; companyId: string };

@Injectable()
export class ManufacturingApprovalWorkflowService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PermissionsService)
    private readonly permissions: PermissionsService,
    @Inject(ManufacturingElectronicSignatureService)
    private readonly electronicSignature: ManufacturingElectronicSignatureService,
  ) {}

  async advance(
    tx: Prisma.TransactionClient,
    input: {
      scope: Scope;
      user: AuthenticatedRequestUser;
      workflowScope: ManufacturingApprovalWorkflowScope;
      workflowGroup: string;
      workflowCode: string;
      entityType: string;
      entityId: string;
      orderId?: string | null;
      entityLabel: string;
      makerUserId: string;
      transactionDate: Date;
      idempotencyKey: string;
      signatureMeaning?: string | null;
      reauthenticationPassword?: string | null;
      note?: string | null;
      evidence?: Record<string, unknown>;
      fallbackPermissionKey?: string;
      fallbackMakerCheckerRequired?: boolean;
      fallbackElectronicSignatureRequired?: boolean;
      fallbackStages?: Array<{
        permissionKey: string;
        signatureMeaning?: string | null;
      }>;
      minimumStages?: number;
    },
  ) {
    const records = await tx.manufacturingControlRecord.findMany({
      where: {
        workspaceId: input.scope.id,
        kind: "APPROVAL_WORKFLOW",
        status: "APPROVED",
      },
      orderBy: [{ approvedAt: "desc" }, { versionNumber: "desc" }],
      select: { id: true, code: true, versionNumber: true, payload: true },
    });
    const applicable = records
      .map((record) => ({
        record,
        stages: parseManufacturingApprovalWorkflow(
          record.payload,
          input.workflowScope,
        ),
      }))
      .find((entry) => entry.stages);
    const fallbackStages = (input.fallbackStages ?? []).map((stage, index) => ({
      sequence: index + 1,
      permissionKey: stage.permissionKey,
      signatureMeaning: stage.signatureMeaning?.trim() || null,
    }));
    const stages = applicable?.stages ?? fallbackStages;
    const totalStages = stages.length || 1;
    if (input.minimumStages && totalStages < input.minimumStages) {
      throw new PreconditionFailedException(
        `${input.entityLabel} requires at least ${input.minimumStages} distinct approval stages; the approved workflow provides ${totalStages}.`,
      );
    }
    const settings = await tx.manufacturingSettings.findUnique({
      where: { workspaceId: input.scope.id },
      select: { approvalRequired: true, electronicSignatureRequired: true },
    });
    const signatureMeaning = input.signatureMeaning?.trim() || null;
    const reviewRows = await tx.manufacturingWorkflowReview.findMany({
      where: {
        workspaceId: input.scope.id,
        entityType: input.entityType,
        entityId: input.entityId,
        workflowCode: input.workflowCode,
        status: "APPROVED",
      },
      orderBy: { createdAt: "asc" },
      include: { createdBy: { select: { name: true } } },
    });
    const existing = reviewRows.filter((review) => {
      const evidence =
        review.evidence &&
        typeof review.evidence === "object" &&
        !Array.isArray(review.evidence)
          ? (review.evidence as Record<string, unknown>)
          : {};
      return evidence.approvalWorkflowScope === input.workflowScope;
    });
    const replay = existing.find(
      (review) => review.idempotencyKey === input.idempotencyKey,
    );
    if (replay) {
      const replayStageIndex = existing.indexOf(replay);
      const replayPermission =
        stages[replayStageIndex]?.permissionKey ?? input.fallbackPermissionKey;
      if (replayPermission) {
        const granted = await this.permissions.getGrantedKeys(input.user);
        if (!granted.has(replayPermission))
          throw new ForbiddenException(
            `Permission required: ${replayPermission}`,
          );
      }
      return {
        ...approvalProgress(totalStages, existing.length),
        replayed: true,
        workflowCode: applicable?.record.code ?? null,
        review: replay,
        stageApprovers: existing.map((review) => ({
          userId: review.approvedByUserId,
          transactionDate: review.transactionDate,
        })),
      };
    }
    const stageIndex = existing.length;
    const stage = stages[stageIndex];
    if (stageIndex >= totalStages)
      throw new BadRequestException(
        `${input.entityLabel} approval workflow is already complete.`,
      );
    if (
      input.makerUserId === input.user.id &&
      (Boolean(applicable) ||
        (fallbackStages.length > 0 &&
          input.fallbackMakerCheckerRequired !== false) ||
        (settings?.approvalRequired &&
          input.fallbackMakerCheckerRequired !== false))
    ) {
      throw new ForbiddenException(
        "Maker-checker is enabled; the record creator cannot approve the same record.",
      );
    }
    if (
      stages.length > 1 &&
      existing.some((review) => review.approvedByUserId === input.user.id)
    ) {
      throw new ForbiddenException(
        "Each configured approval stage requires a distinct approver; this user already approved an earlier stage.",
      );
    }
    if (stage) {
      const granted = await this.permissions.getGrantedKeys(input.user);
      if (!granted.has(stage.permissionKey))
        throw new ForbiddenException(
          `Approval stage ${stage.sequence} requires permission: ${stage.permissionKey}`,
        );
      if (!signatureMeaning) {
        throw new BadRequestException(
          `Approval stage ${stage.sequence} requires an electronic-signature meaning.`,
        );
      }
      if (
        stage.signatureMeaning &&
        signatureMeaning !== stage.signatureMeaning
      ) {
        throw new BadRequestException(
          `Approval stage ${stage.sequence} requires the exact signature meaning: ${stage.signatureMeaning}`,
        );
      }
    } else {
      if (input.fallbackPermissionKey) {
        const granted = await this.permissions.getGrantedKeys(input.user);
        if (!granted.has(input.fallbackPermissionKey))
          throw new ForbiddenException(
            `Permission required: ${input.fallbackPermissionKey}`,
          );
      }
      if (
        settings?.electronicSignatureRequired &&
        input.fallbackElectronicSignatureRequired !== false &&
        !signatureMeaning
      ) {
        throw new BadRequestException(
          `Electronic-signature meaning is required to approve ${input.entityLabel}.`,
        );
      }
    }
    const electronicSignatureEvidence = await this.electronicSignature.enforce(
      tx,
      {
        scope: input.scope,
        user: input.user,
        actionLabel: input.entityLabel,
        signatureMeaning,
        reauthenticationPassword: input.reauthenticationPassword,
        required:
          Boolean(stage) ||
          Boolean(
            settings?.electronicSignatureRequired &&
            input.fallbackElectronicSignatureRequired !== false,
          ),
      },
    );
    const completedStages = stageIndex + 1;
    const progress = approvalProgress(totalStages, completedStages);
    const hash = signatureMeaning
      ? createHash("sha256")
          .update(
            [
              input.scope.id,
              input.entityId,
              input.workflowCode,
              completedStages,
              input.user.id,
              input.transactionDate.toISOString(),
              input.idempotencyKey,
              signatureMeaning,
            ].join("|"),
          )
          .digest("hex")
      : null;
    const review = await tx.manufacturingWorkflowReview.create({
      data: {
        tenantId: input.scope.tenantId,
        companyId: input.scope.companyId,
        workspaceId: input.scope.id,
        orderId: input.orderId ?? null,
        workflowGroup: input.workflowGroup as never,
        workflowCode: input.workflowCode,
        entityType: input.entityType,
        entityId: input.entityId,
        transactionDate: input.transactionDate,
        idempotencyKey: input.idempotencyKey,
        title: `${progress.complete ? "Final" : "Stage"} approval ${input.entityLabel}`,
        outcome: "EXECUTED",
        status: "APPROVED",
        note: input.note?.trim() || null,
        evidence: {
          workflowRecordId: applicable?.record.id ?? null,
          workflowCode: applicable?.record.code ?? null,
          workflowVersion: applicable?.record.versionNumber ?? null,
          workflowScope: input.workflowScope,
          stageSequence: stage?.sequence ?? 1,
          stagePermission: stage?.permissionKey ?? null,
          signatureMeaning,
          electronicSignaturePolicy: electronicSignatureEvidence,
          approvalWorkflowScope: input.workflowScope,
          ...(input.evidence ?? {}),
          ...progress,
        },
        signatureHash: hash,
        approvedByUserId: input.user.id,
        approvedAt: input.transactionDate,
        createdByUserId: input.user.id,
      },
      include: { createdBy: { select: { name: true } } },
    });
    return {
      ...progress,
      replayed: false,
      workflowCode: applicable?.record.code ?? null,
      review,
      stageApprovers: [...existing, review].map((approval) => ({
        userId: approval.approvedByUserId,
        transactionDate: approval.transactionDate,
      })),
    };
  }
}
