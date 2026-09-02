import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";

import { CostingMethod, TransactionWorkflowPolicy, type Prisma } from "../generated/prisma/index.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { AuditService } from "../audit/audit.service.js";
import { roundMoney } from "../accounting/money.util.js";
import { PrismaService } from "../prisma/prisma.service.js";

type PermissionColumn = "view" | "create" | "edit" | "share" | "delete";
type PermissionLevel = "allow" | "limited" | "deny";
type ShareRole = "Manager" | "Accountant" | "Staff" | "Auditor";
type PermissionMatrix = Record<string, Record<PermissionColumn, PermissionLevel>>;
type WorkspaceAppSettingsRow = {
  id: string;
  workspaceId: string;
  namespace: string;
  settings: unknown;
  backupHistory: unknown;
  taxRates: unknown;
  taxGroups: unknown;
  currencies: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const shareRoles = ["Manager", "Accountant", "Staff", "Auditor"] as const;
const shareRoleCodePrefix = "sync_share_";
const autoBackupSettingsNamespace = "auto-backup";
const loyaltySettingsNamespace = "loyalty";
const tallySyncSettingsNamespace = "tally-sync";

@Injectable()
export class WorkspacesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async listForCurrentUser(currentUser: AuthenticatedRequestUser) {
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: currentUser.id },
      include: {
        workspace: {
          include: {
            businessCategory: true,
          },
        },
      },
      orderBy: {
        workspace: {
          createdAt: "asc",
        },
      },
    });

    return memberships.map(({ workspace }) => ({
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      industry: workspace.businessCategory.name,
      openPeriod: "01 Jul 2026 - 31 Jul 2026",
      financialYear: "01 Jul 2026 - 30 Jun 2027",
    }));
  }

  async selectWorkspace(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId,
      },
      include: {
        workspace: {
          select: {
            tenantId: true,
            organizationId: true,
            companyId: true,
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException("Workspace access denied");
    }

    await this.prisma.userSession.update({
      where: { id: currentUser.sessionId },
      // A user may belong to workspaces under different companies in the same
      // tenant. Keep the entire session scope aligned with the selected
      // workspace; otherwise company policy, protected ledgers, and voucher
      // companyId could be resolved from the previously selected company.
      data: {
        workspaceId,
        tenantId: membership.workspace.tenantId,
        organizationId: membership.workspace.organizationId,
        companyId: membership.workspace.companyId,
      },
    });

    return { success: true };
  }

  /**
   * Only the tenant owner/admin may add, edit, or revoke workspace members.
   * Without this any invited member — even a Viewer — could remove their
   * colleagues or grant themselves access.
   */
  /**
   * The company name is what the sidebar, invoices and every printed document
   * show, so renaming the business in Company Profile has to reach this record —
   * otherwise the old name keeps appearing everywhere outside that one form.
   */
  async updateCompanyProfile(currentUser: AuthenticatedRequestUser, workspaceId: string, body: unknown) {
    const workspace = await this.ensureCanManageMembers(currentUser, workspaceId);
    const name = typeof (body as { name?: unknown })?.name === "string" ? (body as { name: string }).name.trim() : "";

    if (!name) {
      throw new BadRequestException("Business name is required");
    }

    const company = await this.prisma.company.update({
      where: { id: workspace.companyId },
      data: { name },
      select: { id: true, name: true },
    });

    return { success: true, company };
  }

  private async ensureCanManageMembers(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const workspace = await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const membership = await this.prisma.tenantMember.findUnique({
      where: {
        tenantId_userId: {
          tenantId: workspace.tenantId,
          userId: currentUser.id,
        },
      },
    });

    if (!membership || (membership.membershipRole !== "OWNER" && membership.membershipRole !== "ADMIN")) {
      throw new ForbiddenException("Only the workspace owner can manage users");
    }

    return workspace;
  }

  /** Maps each UI matrix row to the resource slug the fine-grained
   * "{slug}.{action}" / "{slug}.{action}.own" permission keys use — see
   * buildGrantedPermissionKeys(). Keep in sync with defaultPermissionMatrix()
   * below and with the migration that seeds these keys. */
  private readonly resourceSlugByRow: Record<string, string> = {
    Sale: "sale",
    "Payment-In": "payment_in",
    "Sale Order": "sale_order",
    "Credit Note": "credit_note",
    "Delivery Challan": "delivery_challan",
    Estimate: "estimate",
    Expense: "expense",
    Party: "party",
    Item: "item",
    Proforma: "proforma",
  };

  /**
   * The UI permission matrix is the source of truth for what a member may do,
   * so it has to become real RolePermission rows — that is what PermissionGuard
   * (coarse gate) and PermissionsService (per-resource, own-vs-full scoping)
   * read. Storing it only as JSON would leave the matrix decorative.
   *
   * Each (row, column) cell maps to its own key — "Sale" Delete and "Expense"
   * Delete are no longer the same permission. "Limited" grants the ".own"
   * variant (own-created records only) instead of the full key; "Create" has
   * no ".own" variant since a record being created has no prior owner to
   * restrict against.
   */
  private buildGrantedPermissionKeys(matrix: PermissionMatrix, role: ShareRole) {
    const granted = new Set<string>(["workspace.view", "subscription.view"]);
    const allowed = (row: string, column: PermissionColumn) => matrix[row]?.[column] === "allow" || matrix[row]?.[column] === "limited";
    const anyAllowed = (column: PermissionColumn) => Object.keys(matrix).some((row) => allowed(row, column));

    const voucherRows = ["Sale", "Payment-In", "Sale Order", "Credit Note", "Delivery Challan", "Estimate", "Proforma", "Expense"];

    for (const [row, slug] of Object.entries(this.resourceSlugByRow)) {
      const cell = matrix[row];
      if (!cell) continue;

      for (const column of ["view", "create", "edit", "share", "delete"] as PermissionColumn[]) {
        const level = cell[column];
        if (!level || level === "deny") continue;

        if (column === "create") {
          granted.add(`${slug}.create`);
          continue;
        }

        granted.add(level === "allow" ? `${slug}.${column}` : `${slug}.${column}.own`);
      }
    }

    // Legacy coarse keys — kept as-is. They still gate voucher types this
    // matrix has no row for at all (Purchase, Purchase Order, Receipt Note,
    // Payment-Out, Debit Note, Contra, Journal), plus the approve/reject/
    // reverse workflow and dashboard/reports, none of which has a UI column.
    if (anyAllowed("view")) {
      granted.add("dashboard.view");
      granted.add("accounting.report.trial_balance");
    }

    if (voucherRows.some((row) => allowed(row, "create"))) {
      granted.add("accounting.voucher.create");
    }

    if ((role === "Manager" || role === "Accountant") && voucherRows.some((row) => allowed(row, "edit"))) {
      granted.add("accounting.voucher.post");
    }

    if ((role === "Manager" || role === "Accountant") && voucherRows.some((row) => allowed(row, "delete"))) {
      granted.add("accounting.voucher.delete");
    }

    // accounting.ledger.create also gates Fixed Assets and chart-of-accounts
    // endpoints that have no row of their own in this matrix — granting the
    // fine-grained party.create key alone would silently take that access
    // away from anyone who currently has it via "Party" create.
    if (allowed("Party", "create")) {
      granted.add("accounting.ledger.create");
    }

    return granted;
  }

  async listShareUsers(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    await this.ensureCanManageMembers(currentUser, workspaceId);

    const members = await this.prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        userId: { not: currentUser.id },
      },
      include: {
        user: {
          include: {
            userRoles: {
              where: { workspaceId },
              include: { role: true },
            },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    return members.flatMap((member) => {
      const assignedRole = member.user.userRoles.find(({ role }) => role.code.startsWith(shareRoleCodePrefix))?.role;
      if (!assignedRole) {
        return [];
      }

      const role = this.normalizeShareRole(assignedRole?.name);

      return [{
        id: member.user.id,
        name: member.user.name,
        contact: member.user.email,
        role,
        status: member.user.lastLoginAt ? "Active" : "Invite Sent",
        device: "Workspace Access",
        lastSync: member.joinedAt.toISOString(),
        permissions: this.parsePermissionMatrix(assignedRole?.description, role),
      }];
    });
  }

  async saveShareUser(currentUser: AuthenticatedRequestUser, workspaceId: string, body: unknown, userId?: string) {
    const workspace = await this.ensureCanManageMembers(currentUser, workspaceId);
    const input = this.parseShareUserInput(body, !userId);

    if (userId === currentUser.id) {
      throw new BadRequestException("Use the profile page to update your own account");
    }

    const contactUser = await this.prisma.user.findUnique({
      where: { email: input.contact },
    });

    if (userId && contactUser && contactUser.id !== userId) {
      throw new ConflictException("Another user already uses this email");
    }

    if (!userId && contactUser?.id === currentUser.id) {
      throw new BadRequestException("You are already the owner of this workspace");
    }

    if (!userId && contactUser) {
      const existingMembership = await this.prisma.tenantMember.findFirst({
        where: { userId: contactUser.id },
        select: { tenantId: true },
      });
      if (existingMembership && existingMembership.tenantId !== workspace.tenantId) {
        throw new ConflictException("This email already belongs to another company account");
      }
    }

    let temporaryPassword: string | null = null;
    const saved = await this.prisma.$transaction(async (transaction) => {
      const user = userId
        ? await transaction.user.update({
            where: { id: userId },
            data: {
              name: input.name,
              email: input.contact,
              initials: this.buildInitials(input.name),
              ...(input.password ? { passwordHash: await argon2.hash(input.password) } : {}),
            },
          })
        : contactUser
          ? contactUser
          : await (async () => {
              temporaryPassword = input.password ?? this.buildTemporaryPassword();
              return transaction.user.create({
                data: {
                  name: input.name,
                  email: input.contact,
                  passwordHash: await argon2.hash(temporaryPassword),
                  initials: this.buildInitials(input.name),
                  isEmailVerified: true,
                },
              });
            })();

      const role = await transaction.role.upsert({
        where: {
          tenantId_workspaceId_code: {
            tenantId: workspace.tenantId,
            workspaceId,
            code: `${shareRoleCodePrefix}${user.id}`,
          },
        },
        update: {
          name: input.role,
          description: JSON.stringify({ permissionMatrix: input.permissions }),
        },
        create: {
          tenantId: workspace.tenantId,
          companyId: workspace.companyId,
          workspaceId,
          code: `${shareRoleCodePrefix}${user.id}`,
          name: input.role,
          description: JSON.stringify({ permissionMatrix: input.permissions }),
          isSystem: false,
        },
      });

      const tenantMember = await transaction.tenantMember.upsert({
        where: {
          tenantId_userId: {
            tenantId: workspace.tenantId,
            userId: user.id,
          },
        },
        update: {
          organizationId: workspace.organizationId,
          companyId: workspace.companyId,
          membershipRole: user.id === currentUser.id ? "OWNER" : "MEMBER",
        },
        create: {
          tenantId: workspace.tenantId,
          userId: user.id,
          organizationId: workspace.organizationId,
          companyId: workspace.companyId,
          membershipRole: user.id === currentUser.id ? "OWNER" : "MEMBER",
        },
      });

      const workspaceMember = await transaction.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId,
            userId: user.id,
          },
        },
        update: { tenantMemberId: tenantMember.id },
        create: {
          workspaceId,
          tenantMemberId: tenantMember.id,
          userId: user.id,
        },
      });

      await transaction.userRole.deleteMany({
        where: {
          userId: user.id,
          workspaceId,
          role: { code: { startsWith: shareRoleCodePrefix } },
        },
      });

      await transaction.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          tenantId: workspace.tenantId,
          companyId: workspace.companyId,
          workspaceId,
        },
      });

      if (userId) {
        await transaction.userSession.updateMany({
          where: { userId: user.id, companyId: workspace.companyId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      // Turn the saved matrix into the RolePermission rows PermissionGuard reads,
      // so the access chosen in the UI is what the API actually enforces.
      const grantedKeys = this.buildGrantedPermissionKeys(input.permissions, input.role);
      const permissions = await transaction.permission.findMany();
      await transaction.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (permissions.length) {
        await transaction.rolePermission.createMany({
          data: permissions.map((permission) => ({
            roleId: role.id,
            permissionId: permission.id,
            allowed: grantedKeys.has(permission.key),
          })),
          skipDuplicates: true,
        });
      }

      return { user, workspaceMember };
    });

    await this.auditService.log({
      tenantId: workspace.tenantId,
      organizationId: workspace.organizationId,
      companyId: workspace.companyId,
      workspaceId,
      userId: currentUser.id,
      action: userId ? "TEAM_MEMBER_UPDATED" : "TEAM_MEMBER_CREATED",
      entityType: "User",
      entityId: saved.user.id,
      newValues: { name: saved.user.name, email: saved.user.email, role: input.role },
    });

    return {
      id: saved.user.id,
      name: saved.user.name,
      contact: saved.user.email,
      role: input.role,
      status: saved.user.lastLoginAt ? "Active" : "Invite Sent",
      device: "Workspace Access",
      lastSync: saved.workspaceMember.joinedAt.toISOString(),
      permissions: input.permissions,
      temporaryPassword,
    };
  }

  /**
   * The invite password is shown once, so an owner who loses it needs a way to
   * issue a new one without deleting and re-creating the member (which would
   * drop their saved permissions).
   */
  async resetShareUserPassword(currentUser: AuthenticatedRequestUser, workspaceId: string, userId: string) {
    await this.ensureCanManageMembers(currentUser, workspaceId);

    if (userId === currentUser.id) {
      throw new BadRequestException("Use the profile page to change your own password");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { user: true },
    });

    if (!membership) {
      throw new NotFoundException("Workspace user not found");
    }

    const temporaryPassword = this.buildTemporaryPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await argon2.hash(temporaryPassword) },
      }),
      // Existing sessions must not survive a password reset.
      this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "TEAM_MEMBER_PASSWORD_RESET",
      entityType: "User",
      entityId: userId,
      newValues: { email: membership.user.email },
    });

    return {
      id: membership.user.id,
      name: membership.user.name,
      contact: membership.user.email,
      temporaryPassword,
    };
  }

  async removeShareUser(currentUser: AuthenticatedRequestUser, workspaceId: string, userId: string) {
    await this.ensureCanManageMembers(currentUser, workspaceId);

    if (userId === currentUser.id) {
      throw new BadRequestException("You cannot remove your own workspace access");
    }

    const membership = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { user: true },
    });

    if (!membership) {
      throw new NotFoundException("Workspace user not found");
    }

    await this.prisma.$transaction(async (transaction) => {
      await transaction.userRole.deleteMany({ where: { userId, workspaceId } });
      await transaction.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
      await transaction.userSession.updateMany({
        where: { userId, companyId: currentUser.companyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const remainingWorkspaceLinks = await transaction.workspaceMember.count({
        where: { tenantMemberId: membership.tenantMemberId },
      });
      if (remainingWorkspaceLinks === 0) {
        await transaction.tenantMember.delete({ where: { id: membership.tenantMemberId } });
      }
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "TEAM_MEMBER_REMOVED",
      entityType: "User",
      entityId: userId,
      oldValues: { name: membership.user.name, email: membership.user.email },
    });

    return { success: true, removedUserId: userId };
  }

  async getAutoBackupSettings(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    await this.ensureWorkspaceAccess(currentUser, workspaceId);

    const rows = await this.prisma.$queryRaw<WorkspaceAppSettingsRow[]>`
      SELECT
        "id",
        "workspaceId",
        "namespace",
        "settings",
        "backupHistory",
        "taxRates",
        "taxGroups",
        "currencies",
        "createdAt",
        "updatedAt"
      FROM "WorkspaceAppSettings"
      WHERE "workspaceId" = ${workspaceId} AND "namespace" = ${autoBackupSettingsNamespace}
      LIMIT 1
    `;

    if (!rows[0]) {
      return {
        workspaceId,
        namespace: autoBackupSettingsNamespace,
        settings: null,
        history: [],
        taxRates: [],
        taxGroups: [],
        currencies: [],
        createdAt: null,
        updatedAt: null,
      };
    }

    return this.serializeAutoBackupSettings(rows[0]);
  }

  async saveAutoBackupSettings(currentUser: AuthenticatedRequestUser, workspaceId: string, body: unknown) {
    const workspace = await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const input = this.parseAutoBackupSettingsInput(body);
    const json = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;

    const row = await this.prisma.workspaceAppSettings.upsert({
      where: {
        workspaceId_namespace: {
          workspaceId,
          namespace: autoBackupSettingsNamespace,
        },
      },
      create: {
        tenantId: workspace.tenantId,
        companyId: workspace.companyId,
        workspaceId,
        namespace: autoBackupSettingsNamespace,
        settings: json(input.settings),
        backupHistory: json(input.history),
        taxRates: json(input.taxRates),
        taxGroups: json(input.taxGroups),
        currencies: json(input.currencies),
      },
      update: {
        settings: json(input.settings),
        backupHistory: json(input.history),
        taxRates: json(input.taxRates),
        taxGroups: json(input.taxGroups),
        currencies: json(input.currencies),
      },
    });

    return this.serializeAutoBackupSettings(row);
  }

  /** The only costing method the inventory runtime can actually value stock
   * with today (see assertMovingAverageCostingMethod) — surfaced here so the
   * Item Settings screen shows the truth instead of a hardcoded string. */
  private readonly supportedCostingMethods: CostingMethod[] = [CostingMethod.MOVING_WEIGHTED_AVERAGE];

  async getCostingSettings(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const workspace = await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const settings = await this.prisma.accountingSettings.findUnique({
      where: { companyId: workspace.companyId },
      select: { costingMethod: true },
    });

    return {
      costingMethod: settings?.costingMethod ?? CostingMethod.MOVING_WEIGHTED_AVERAGE,
      supportedCostingMethods: this.supportedCostingMethods,
    };
  }

  /**
   * Workflow policy belongs to the company, not to an individual browser or
   * workspace settings blob. Every workspace of the company therefore starts
   * new transactions under the same policy, while each voucher keeps the
   * origin captured when it was created.
   */
  async getTransactionWorkflowSettings(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const workspace = await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: workspace.companyId },
      select: {
        id: true,
        purchaseWorkflow: true,
        salesWorkflow: true,
        updatedAt: true,
      },
    });

    return {
      purchaseWorkflow: company.purchaseWorkflow,
      salesWorkflow: company.salesWorkflow,
      updatedAt: company.updatedAt,
    };
  }

  async saveTransactionWorkflowSettings(currentUser: AuthenticatedRequestUser, workspaceId: string, body: unknown) {
    const workspace = await this.ensureCanManageMembers(currentUser, workspaceId);
    const input = body && typeof body === "object" && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const purchaseWorkflow = this.parseTransactionWorkflowPolicy(input.purchaseWorkflow, "purchaseWorkflow");
    const salesWorkflow = this.parseTransactionWorkflowPolicy(input.salesWorkflow, "salesWorkflow");
    const previous = await this.prisma.company.findUniqueOrThrow({
      where: { id: workspace.companyId },
      select: { purchaseWorkflow: true, salesWorkflow: true },
    });
    const company = await this.prisma.company.update({
      where: { id: workspace.companyId },
      data: { purchaseWorkflow, salesWorkflow },
      select: {
        id: true,
        purchaseWorkflow: true,
        salesWorkflow: true,
        updatedAt: true,
      },
    });

    await this.auditService.log({
      tenantId: workspace.tenantId,
      companyId: workspace.companyId,
      workspaceId,
      userId: currentUser.id,
      action: "TRANSACTION_WORKFLOW_CHANGED",
      entityType: "Company",
      entityId: workspace.companyId,
      oldValues: previous,
      newValues: {
        purchaseWorkflow: company.purchaseWorkflow,
        salesWorkflow: company.salesWorkflow,
      },
    });

    return {
      purchaseWorkflow: company.purchaseWorkflow,
      salesWorkflow: company.salesWorkflow,
      updatedAt: company.updatedAt,
    };
  }

  async getLoyaltySettings(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const row = await this.prisma.workspaceAppSettings.findUnique({
      where: { workspaceId_namespace: { workspaceId, namespace: loyaltySettingsNamespace } },
      select: { settings: true, updatedAt: true },
    });
    const settings = (row?.settings && typeof row.settings === "object" ? row.settings : {}) as Record<string, unknown>;
    return { workspaceId, enabled: settings.enabled === true, rewardAmount: roundMoney(settings.rewardAmount as number | string | null | undefined), minimumInvoiceAmount: roundMoney(settings.minimumInvoiceAmount as number | string | null | undefined), expiryDays: Number(settings.expiryDays || 0), redeemPoints: Number(settings.redeemPoints || 0), redeemAmount: roundMoney(settings.redeemAmount as number | string | null | undefined), updatedAt: row?.updatedAt ?? null };
  }

  async saveLoyaltySettings(currentUser: AuthenticatedRequestUser, workspaceId: string, body: unknown) {
    const workspace = await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const input = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const rawRewardAmount = Number(input.rewardAmount);
    const rawMinimumInvoiceAmount = Number(input.minimumInvoiceAmount || 0);
    const expiryDays = Number(input.expiryDays || 0);
    const redeemPoints = Number(input.redeemPoints);
    const rawRedeemAmount = Number(input.redeemAmount);
    if (![rawRewardAmount, rawMinimumInvoiceAmount, expiryDays, redeemPoints, rawRedeemAmount].every(Number.isFinite) || rawRewardAmount <= 0 || redeemPoints <= 0 || rawRedeemAmount <= 0 || rawMinimumInvoiceAmount < 0 || expiryDays < 0) {
      throw new BadRequestException("Enter valid positive loyalty conversion values");
    }
    const rewardAmount = roundMoney(rawRewardAmount);
    const minimumInvoiceAmount = roundMoney(rawMinimumInvoiceAmount);
    const redeemAmount = roundMoney(rawRedeemAmount);
    const settings = { enabled: true, rewardAmount, minimumInvoiceAmount, expiryDays: Math.floor(expiryDays), redeemPoints: Math.floor(redeemPoints), redeemAmount };
    await this.prisma.workspaceAppSettings.upsert({
      where: { workspaceId_namespace: { workspaceId, namespace: loyaltySettingsNamespace } },
      create: { tenantId: workspace.tenantId, companyId: workspace.companyId, workspaceId, namespace: loyaltySettingsNamespace, settings, backupHistory: [], taxRates: [], taxGroups: [], currencies: [] },
      update: { settings },
    });
    return this.getLoyaltySettings(currentUser, workspaceId);
  }

  async deleteLoyaltySettings(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    await this.ensureWorkspaceAccess(currentUser, workspaceId);
    await this.prisma.workspaceAppSettings.deleteMany({
      where: { workspaceId, namespace: loyaltySettingsNamespace },
    });
    return { success: true as const };
  }

  async getLoyaltyBalance(currentUser: AuthenticatedRequestUser, workspaceId: string, partyName: string) {
    await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const name = partyName?.trim();
    if (!name) return { partyName: "", earned: 0, redeemed: 0, balance: 0 };
    const config = await this.prisma.workspaceAppSettings.findUnique({ where: { workspaceId_namespace: { workspaceId, namespace: loyaltySettingsNamespace } }, select: { settings: true } });
    const settings = (config?.settings && typeof config.settings === "object" ? config.settings : {}) as Record<string, unknown>;
    const expiryDays = Math.max(0, Math.floor(Number(settings.expiryDays || 0)));
    const expiryCutoff = new Date();
    expiryCutoff.setUTCDate(expiryCutoff.getUTCDate() - expiryDays);
    const rows = await this.prisma.$queryRaw<Array<{ earned: bigint; redeemed: bigint; expired: bigint }>>`
      SELECT COALESCE(SUM("loyaltyPointsEarned"), 0)::bigint AS earned,
             COALESCE(SUM("loyaltyPointsRedeemed"), 0)::bigint AS redeemed,
             COALESCE(SUM(CASE WHEN ${expiryDays} > 0 AND "voucherDate" < ${expiryCutoff} THEN "loyaltyPointsEarned" ELSE 0 END), 0)::bigint AS expired
      FROM "VoucherEntry"
      WHERE "workspaceId" = ${workspaceId} AND "partyName" = ${name}
        AND "voucherType" = 'SALES' AND "documentKind" IS NULL
        AND "status" IN ('APPROVED', 'POSTED')
    `;
    const earned = Number(rows[0]?.earned ?? 0);
    const redeemed = Number(rows[0]?.redeemed ?? 0);
    const expired = Math.max(0, Number(rows[0]?.expired ?? 0) - redeemed);
    return { partyName: name, earned, redeemed, expired, balance: Math.max(0, earned - redeemed - expired) };
  }

  async getTallySyncSettings(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const row = await this.prisma.workspaceAppSettings.findUnique({
      where: { workspaceId_namespace: { workspaceId, namespace: tallySyncSettingsNamespace } },
      select: { settings: true, updatedAt: true },
    });
    return {
      workspaceId,
      namespace: tallySyncSettingsNamespace,
      settings: row?.settings ?? {
        schemaVersion: 1,
        workspaceId,
        company: null,
        ledgerMappings: [],
        importedRemoteIds: [],
        batches: [],
        updatedAt: null,
      },
      updatedAt: row?.updatedAt ?? null,
    };
  }

  async saveTallySyncSettings(currentUser: AuthenticatedRequestUser, workspaceId: string, body: unknown) {
    const workspace = await this.ensureWorkspaceAccess(currentUser, workspaceId);
    const wrapper = body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : {};
    const candidate = wrapper.settings && typeof wrapper.settings === "object" && !Array.isArray(wrapper.settings)
      ? wrapper.settings as Record<string, unknown>
      : wrapper;
    const ledgerMappings = Array.isArray(candidate.ledgerMappings) ? candidate.ledgerMappings.slice(0, 1000) : [];
    const importedRemoteIds = Array.isArray(candidate.importedRemoteIds) ? candidate.importedRemoteIds.slice(0, 10000) : [];
    const batches = Array.isArray(candidate.batches) ? candidate.batches.slice(0, 200) : [];
    const company = candidate.company && typeof candidate.company === "object" && !Array.isArray(candidate.company) ? candidate.company : null;
    const normalizedSettings = { schemaVersion: 1, workspaceId, company, ledgerMappings, importedRemoteIds, batches, updatedAt: new Date().toISOString() };
    this.assertJsonBudget(normalizedSettings, "Tally sync settings");
    const settings = JSON.parse(JSON.stringify(normalizedSettings)) as Prisma.InputJsonValue;
    const row = await this.prisma.workspaceAppSettings.upsert({
      where: { workspaceId_namespace: { workspaceId, namespace: tallySyncSettingsNamespace } },
      create: { tenantId: workspace.tenantId, companyId: workspace.companyId, workspaceId, namespace: tallySyncSettingsNamespace, settings, backupHistory: [], taxRates: [], taxGroups: [], currencies: [] },
      update: { settings },
      select: { settings: true, updatedAt: true },
    });
    return { workspaceId, namespace: tallySyncSettingsNamespace, settings: row.settings, updatedAt: row.updatedAt };
  }

  private async ensureWorkspaceAccess(currentUser: AuthenticatedRequestUser, workspaceId: string) {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: {
        userId: currentUser.id,
        workspaceId,
      },
      include: { workspace: true },
    });

    if (!membership) {
      throw new ForbiddenException("Workspace access denied");
    }

    return membership.workspace;
  }

  private parseTransactionWorkflowPolicy(value: unknown, field: string) {
    if (
      value !== TransactionWorkflowPolicy.DIRECT &&
      value !== TransactionWorkflowPolicy.ORDER_BASED &&
      value !== TransactionWorkflowPolicy.BOTH
    ) {
      throw new BadRequestException(`${field} must be DIRECT, ORDER_BASED, or BOTH`);
    }
    return value;
  }

  private parseAutoBackupSettingsInput(body: unknown) {
    const value = body as Partial<{
      settings: unknown;
      history: unknown;
      taxRates: unknown;
      taxGroups: unknown;
      currencies: unknown;
    }>;

    return {
      settings: this.parseJsonObject(value.settings, "settings"),
      history: this.parseJsonArray(value.history, "history"),
      taxRates: this.parseJsonArray(value.taxRates, "taxRates"),
      taxGroups: this.parseJsonArray(value.taxGroups, "taxGroups"),
      currencies: this.parseJsonArray(value.currencies, "currencies"),
    };
  }

  private parseJsonObject(value: unknown, field: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new BadRequestException(`${field} must be a JSON object`);
    }

    return this.assertJsonBudget(value, field) as Record<string, unknown>;
  }

  private parseJsonArray(value: unknown, field: string) {
    if (value === undefined || value === null) {
      return [];
    }

    if (!Array.isArray(value)) {
      throw new BadRequestException(`${field} must be a JSON array`);
    }

    return this.assertJsonBudget(value, field) as unknown[];
  }

  private assertJsonBudget(value: unknown, field: string) {
    let json: string;

    try {
      json = JSON.stringify(value);
    } catch {
      throw new BadRequestException(`${field} must be valid JSON`);
    }

    if (json.length > 1_000_000) {
      throw new BadRequestException(`${field} is too large`);
    }

    return value;
  }

  private serializeAutoBackupSettings(row: WorkspaceAppSettingsRow | undefined) {
    if (!row) {
      throw new BadRequestException("Settings could not be saved");
    }

    return {
      id: row.id,
      workspaceId: row.workspaceId,
      namespace: row.namespace,
      settings: row.settings,
      history: Array.isArray(row.backupHistory) ? row.backupHistory : [],
      taxRates: Array.isArray(row.taxRates) ? row.taxRates : [],
      taxGroups: Array.isArray(row.taxGroups) ? row.taxGroups : [],
      currencies: Array.isArray(row.currencies) ? row.currencies : [],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private parseShareUserInput(body: unknown, passwordRequired = false) {
    const value = body as Partial<{
      name: unknown;
      contact: unknown;
      password: unknown;
      role: unknown;
      permissions: unknown;
    }>;
    const name = typeof value.name === "string" ? value.name.trim() : "";
    const contact = typeof value.contact === "string" ? value.contact.trim().toLowerCase() : "";
    const password = typeof value.password === "string" ? value.password : "";
    const role = this.normalizeShareRole(value.role);

    if (!name) {
      throw new BadRequestException("User name is required");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
      throw new BadRequestException("A valid email is required for cloud sharing");
    }

    if (passwordRequired && password.length < 8) {
      throw new BadRequestException("Initial password must be at least 8 characters");
    }

    if (password.length > 0 && password.length < 8) {
      throw new BadRequestException("Password must be at least 8 characters");
    }

    return {
      name,
      contact,
      password: password || undefined,
      role,
      permissions: this.normalizePermissionMatrix(value.permissions, role),
    };
  }

  private normalizeShareRole(value: unknown): ShareRole {
    if (value === "Admin") return "Manager";
    if (value === "Biller") return "Staff";
    if (value === "Viewer") return "Auditor";
    return shareRoles.includes(value as ShareRole) ? (value as ShareRole) : "Staff";
  }

  private parsePermissionMatrix(value: string | null | undefined, role: ShareRole): PermissionMatrix {
    if (!value) {
      return this.defaultPermissionMatrix(role);
    }

    try {
      const parsed = JSON.parse(value) as { permissionMatrix?: unknown };
      return this.normalizePermissionMatrix(parsed.permissionMatrix, role);
    } catch {
      return this.defaultPermissionMatrix(role);
    }
  }

  private normalizePermissionMatrix(value: unknown, role: ShareRole): PermissionMatrix {
    const fallback = this.defaultPermissionMatrix(role);
    if (!value || typeof value !== "object") {
      return fallback;
    }

    const source = value as Record<string, Partial<Record<PermissionColumn, PermissionLevel>>>;
    return Object.fromEntries(
      Object.entries(fallback).map(([row, columns]) => [
        row,
        Object.fromEntries(
          Object.entries(columns).map(([column, defaultLevel]) => {
            const level = source[row]?.[column as PermissionColumn];
            return [column, level === "allow" || level === "limited" || level === "deny" ? level : defaultLevel];
          }),
        ),
      ]),
    ) as PermissionMatrix;
  }

  private defaultPermissionMatrix(role: ShareRole): PermissionMatrix {
    const rows = ["Sale", "Payment-In", "Sale Order", "Credit Note", "Delivery Challan", "Estimate", "Expense", "Party", "Item", "Proforma"];
    const all = (level: PermissionLevel) =>
      Object.fromEntries(rows.map((row) => [row, { view: "allow", create: level, edit: level, share: "limited", delete: "deny" }])) as PermissionMatrix;

    if (role === "Manager") {
      return Object.fromEntries(rows.map((row) => [row, { view: "allow", create: "allow", edit: "allow", share: "allow", delete: "limited" }])) as PermissionMatrix;
    }

    if (role === "Auditor") {
      return all("deny");
    }

    return all("allow");
  }

  private buildInitials(name: string) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  private buildTemporaryPassword() {
    return `Bzv-${randomBytes(3).toString("hex")}-${randomBytes(3).toString("hex")}`;
  }
}
