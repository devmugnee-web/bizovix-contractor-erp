import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { SubscriptionStatus } from "../generated/prisma/index.js";

import { AuditService } from "../audit/audit.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { freeYearlyFeatureKeys, roleSeeds, usageLimitSeeds, voucherTypeSeeds } from "../platform/bootstrap/defaults.js";
import { seedAccountGroups, seedAccountHierarchy } from "../platform/bootstrap/seed-accounts.js";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

@Injectable()
export class OnboardingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async getState(currentUser: AuthenticatedRequestUser) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: currentUser.tenantId },
    });

    const categories = await this.prisma.businessCategory.findMany({
      orderBy: { name: "asc" },
    });

    return {
      tenantId: currentUser.tenantId,
      companyId: currentUser.companyId,
      onboardingStep: tenant?.onboardingStep ?? "VERIFY_EMAIL",
      categories: categories.map((category) => ({
        code: category.code,
        name: category.name,
        description: category.description,
      })),
    };
  }

  async completeBusinessCategory(currentUser: AuthenticatedRequestUser, businessCategoryCode: string) {
    const category = await this.prisma.businessCategory.findUnique({
      where: { code: businessCategoryCode },
      include: { industryPack: true },
    });

    if (!category?.industryPack) {
      throw new BadRequestException("Business category configuration missing");
    }
    const industryPack = category.industryPack;

    const plan = await this.prisma.plan.findUnique({
      where: { code: "FREE_YEARLY" },
      include: {
        features: {
          include: {
            feature: true,
          },
        },
      },
    });

    if (!plan) {
      throw new BadRequestException("Free yearly plan is not available");
    }

    const workspace = await this.prisma.$transaction(async (transaction) => {
      await transaction.company.update({
        where: { id: currentUser.companyId },
        data: { businessCategoryId: category.id },
      });

      const existingWorkspace = await transaction.workspace.findFirst({
        where: {
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          businessCategoryId: category.id,
        },
      });

      const workspaceRecord =
        existingWorkspace
          ? await transaction.workspace.update({
              where: { id: existingWorkspace.id },
              data: {
                businessCategoryId: category.id,
                industryPackId: industryPack.id,
                name: category.defaultWorkspaceName,
              },
            })
          : await (async () => {
              const baseSlug = slugify(category.defaultWorkspaceName);
              let candidateSlug = baseSlug;
              let suffix = 2;

              while (
                await transaction.workspace.findFirst({
                  where: {
                    companyId: currentUser.companyId,
                    slug: candidateSlug,
                  },
                  select: { id: true },
                })
              ) {
                candidateSlug = `${baseSlug}-${suffix++}`;
              }

              return transaction.workspace.create({
                data: {
                  tenantId: currentUser.tenantId,
                  organizationId: currentUser.organizationId,
                  companyId: currentUser.companyId,
                  businessCategoryId: category.id,
                  industryPackId: industryPack.id,
                  name: category.defaultWorkspaceName,
                  slug: candidateSlug,
                },
              });
            })();

      const tenantMembership = await transaction.tenantMember.findFirstOrThrow({
        where: {
          tenantId: currentUser.tenantId,
          userId: currentUser.id,
        },
      });

      await transaction.workspaceMember.upsert({
        where: {
          workspaceId_userId: {
            workspaceId: workspaceRecord.id,
            userId: currentUser.id,
          },
        },
        update: {},
        create: {
          workspaceId: workspaceRecord.id,
          tenantMemberId: tenantMembership.id,
          userId: currentUser.id,
        },
      });

      const roleMap = new Map<string, string>();
      for (const roleSeed of roleSeeds) {
        const role = await transaction.role.upsert({
          where: {
            tenantId_workspaceId_code: {
              tenantId: currentUser.tenantId,
              workspaceId: workspaceRecord.id,
              code: roleSeed.code,
            },
          },
          update: {
            name: roleSeed.name,
          },
          create: {
            tenantId: currentUser.tenantId,
            companyId: currentUser.companyId,
            workspaceId: workspaceRecord.id,
            code: roleSeed.code,
            name: roleSeed.name,
            isSystem: true,
          },
        });
        roleMap.set(role.code, role.id);
      }

      const permissions = await transaction.permission.findMany();
      for (const roleSeed of roleSeeds) {
        const allowedPermissionKeys =
          roleSeed.code === "OWNER" || roleSeed.code === "SUPER_ADMIN"
            ? permissions.map((permission) => permission.key)
            : permissions
                .filter((permission) => {
                  if (roleSeed.code === "VIEWER") {
                    return permission.action === "view";
                  }
                  if (roleSeed.code === "ADMIN") {
                    return true;
                  }
                  if (roleSeed.code.includes("ACCOUNTS")) {
                    return (
                      permission.moduleKey === "dashboard" ||
                      permission.moduleKey === "accounting" ||
                      permission.moduleKey === "subscription" ||
                      permission.moduleKey === "lc" ||
                      (permission.moduleKey === "manufacturing" &&
                        [
                          "manufacturing.view",
                          "manufacturing.cost.post",
                          "manufacturing.reports.view",
                          ...(roleSeed.code === "ACCOUNTS_MANAGER"
                            ? ["manufacturing.close", "manufacturing.audit.review"]
                            : []),
                        ].includes(permission.key))
                    );
                  }
                  if (roleSeed.code.includes("SALES")) {
                    return permission.key === "dashboard.view" || permission.key === "workspace.view";
                  }
                  if (roleSeed.code === "HR_MANAGER") {
                    return permission.moduleKey === "dashboard" || permission.moduleKey === "hr";
                  }
                  if (roleSeed.code === "PURCHASE_OFFICER") {
                    return permission.moduleKey === "dashboard" || permission.moduleKey === "lc" || permission.moduleKey === "inventory";
                  }
                  if (roleSeed.code === "INVENTORY_MANAGER" || roleSeed.code === "STORE_KEEPER") {
                    return (
                      permission.moduleKey === "dashboard" ||
                      permission.moduleKey === "inventory" ||
                      [
                        "manufacturing.view",
                        "manufacturing.material.reserve",
                        "manufacturing.material.issue",
                        "manufacturing.production.execute",
                        "manufacturing.packaging.execute",
                        "manufacturing.reports.view",
                      ].includes(permission.key)
                    );
                  }
                  if (roleSeed.code === "QUALITY_MANAGER") {
                    return (
                      permission.moduleKey === "dashboard" ||
                      [
                        "manufacturing.view",
                        "manufacturing.quality.manage",
                        "manufacturing.quality.inspect",
                        "manufacturing.quality.release",
                        "manufacturing.audit.review",
                        "manufacturing.reports.view",
                      ].includes(permission.key)
                    );
                  }
                  return permission.key === "dashboard.view" || permission.key === "workspace.view";
                })
                .map((permission) => permission.key);

        const roleId = roleMap.get(roleSeed.code);
        if (!roleId) {
          continue;
        }

        for (const permission of permissions.filter((entry) => allowedPermissionKeys.includes(entry.key))) {
          await transaction.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId,
                permissionId: permission.id,
              },
            },
            update: {
              allowed: true,
            },
            create: {
              roleId,
              permissionId: permission.id,
              allowed: true,
            },
          });
        }
      }

      const ownerRoleId = roleMap.get("OWNER");
      if (ownerRoleId) {
        await transaction.userRole.upsert({
          where: {
            userId_roleId_workspaceId: {
              userId: currentUser.id,
              roleId: ownerRoleId,
              workspaceId: workspaceRecord.id,
            },
          },
          update: {},
          create: {
            userId: currentUser.id,
            roleId: ownerRoleId,
            tenantId: currentUser.tenantId,
            companyId: currentUser.companyId,
            workspaceId: workspaceRecord.id,
          },
        });
      }

      const accountGroupIdByCode = await seedAccountGroups(transaction, currentUser.tenantId, currentUser.companyId);

      for (const voucherType of voucherTypeSeeds) {
        await transaction.voucherType.upsert({
          where: {
            companyId_code: {
              companyId: currentUser.companyId,
              code: voucherType.code,
            },
          },
          update: {},
          create: {
            tenantId: currentUser.tenantId,
            companyId: currentUser.companyId,
            code: voucherType.code,
            name: voucherType.name,
            shortCode: voucherType.shortCode,
          },
        });
      }

      await seedAccountHierarchy(transaction, currentUser.tenantId, currentUser.companyId, accountGroupIdByCode);

      await transaction.accountingSettings.upsert({
        where: { companyId: currentUser.companyId },
        update: {},
        create: {
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          negativeStockPolicy: "ALLOW_NEGATIVE",
        },
      });

      await transaction.branch.upsert({
        where: { workspaceId: workspaceRecord.id },
        update: {},
        create: {
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          workspaceId: workspaceRecord.id,
          name: workspaceRecord.name,
          code: workspaceRecord.slug.slice(0, 32),
          isDefault: true,
        },
      });

      const subscription = await transaction.subscription.upsert({
        where: {
          id: `${currentUser.tenantId}:${workspaceRecord.id}:free`,
        },
        update: {
          workspaceId: workspaceRecord.id,
        },
        create: {
          id: `${currentUser.tenantId}:${workspaceRecord.id}:free`,
          tenantId: currentUser.tenantId,
          companyId: currentUser.companyId,
          workspaceId: workspaceRecord.id,
          planId: plan.id,
          status: SubscriptionStatus.FREE_ACTIVE,
          startsAt: new Date(),
          endsAt: new Date(Date.now() + plan.durationMonths * 30 * 24 * 60 * 60 * 1000),
        },
      });

      for (const featureKey of freeYearlyFeatureKeys) {
        await transaction.entitlement.upsert({
          where: {
            scopeKey: `${currentUser.tenantId}:${currentUser.companyId}:${workspaceRecord.id}:${featureKey}`,
          },
          update: {
            enabled: true,
          },
          create: {
            tenantId: currentUser.tenantId,
            companyId: currentUser.companyId,
            workspaceId: workspaceRecord.id,
            subscriptionId: subscription.id,
            featureKey,
            enabled: true,
            scopeKey: `${currentUser.tenantId}:${currentUser.companyId}:${workspaceRecord.id}:${featureKey}`,
          },
        });
      }

      for (const usageLimit of usageLimitSeeds) {
        await transaction.usageCounter.upsert({
          where: {
            scopeKey: `${currentUser.tenantId}:${workspaceRecord.id}:${usageLimit.key}:${new Date().toISOString().slice(0, 7)}`,
          },
          update: {},
          create: {
            tenantId: currentUser.tenantId,
            workspaceId: workspaceRecord.id,
            key: usageLimit.key,
            periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
            periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
            value: usageLimit.key === "users" ? 1 : 0,
            scopeKey: `${currentUser.tenantId}:${workspaceRecord.id}:${usageLimit.key}:${new Date().toISOString().slice(0, 7)}`,
          },
        });
      }

      await transaction.userSession.update({
        where: { id: currentUser.sessionId },
        data: {
          workspaceId: workspaceRecord.id,
        },
      });

      await transaction.tenant.update({
        where: { id: currentUser.tenantId },
        data: {
          onboardingStep: "COMPLETED",
          onboardingCompletedAt: new Date(),
        },
      });

      return workspaceRecord;
    });

    await this.auditService.log({
      tenantId: currentUser.tenantId,
      organizationId: currentUser.organizationId,
      companyId: currentUser.companyId,
      workspaceId: workspace.id,
      userId: currentUser.id,
      action: "WORKSPACE_CREATED_FROM_BUSINESS_CATEGORY",
      entityType: "Workspace",
      entityId: workspace.id,
      newValues: {
        businessCategoryCode,
        workspaceName: workspace.name,
      },
    });

    return workspace;
  }
}
