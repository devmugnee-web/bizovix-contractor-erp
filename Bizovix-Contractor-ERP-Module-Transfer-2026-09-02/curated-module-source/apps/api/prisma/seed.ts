import { PrismaClient, SubscriptionStatus, type TenantMembershipRole } from "../src/generated/prisma/index.js";
import argon2 from "argon2";

import {
  featureSeeds,
  freeYearlyFeatureKeys,
  freeYearlyPlanSeed,
  industryPackSeeds,
  moduleSeeds,
  permissionSeeds,
  roleSeeds,
  subscriptionPlanSeeds,
  usageLimitSeeds,
  voucherTypeSeeds,
} from "../src/platform/bootstrap/defaults.js";
import { seedAccountGroups, seedAccountHierarchy } from "../src/platform/bootstrap/seed-accounts.js";

const prisma = new PrismaClient();

const defaultOwnerCredentials = {
  companyName: "Bizovix Trading Limited",
  email: "owner@bizovix.app",
  password: "password123",
  userName: "Bizovix Owner",
  businessCategoryCode: "TRADING",
};

function buildInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function seedDefaultOwner() {
  const businessCategory = await prisma.businessCategory.findUnique({
    where: { code: defaultOwnerCredentials.businessCategoryCode },
  });
  const industryPack = await prisma.industryPack.findUnique({
    where: { code: "PACK_TRADING" },
  });
  const plan = await prisma.plan.findUnique({
    where: { code: freeYearlyPlanSeed.code },
  });

  if (!businessCategory || !industryPack || !plan) {
    throw new Error("Core business category seed data is missing");
  }

  const passwordHash = await argon2.hash(defaultOwnerCredentials.password);
  const user = await prisma.user.upsert({
    where: { email: defaultOwnerCredentials.email },
    update: {
      name: defaultOwnerCredentials.userName,
      passwordHash,
      initials: buildInitials(defaultOwnerCredentials.userName),
      isEmailVerified: true,
    },
    create: {
      name: defaultOwnerCredentials.userName,
      email: defaultOwnerCredentials.email,
      passwordHash,
      initials: buildInitials(defaultOwnerCredentials.userName),
      isEmailVerified: true,
    },
  });

  const companySlug = slugify(defaultOwnerCredentials.companyName);
  const tenant = await prisma.tenant.upsert({
    where: { slug: `${companySlug}-tenant` },
    update: {
      name: `${defaultOwnerCredentials.companyName} Account`,
      onboardingStep: "COMPLETED",
      onboardingCompletedAt: new Date(),
    },
    create: {
      name: `${defaultOwnerCredentials.companyName} Account`,
      slug: `${companySlug}-tenant`,
      onboardingStep: "COMPLETED",
      onboardingCompletedAt: new Date(),
    },
  });

  const organization = await prisma.organization.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: `${companySlug}-group`,
      },
    },
    update: {
      name: `${defaultOwnerCredentials.companyName} Group`,
    },
    create: {
      tenantId: tenant.id,
      name: `${defaultOwnerCredentials.companyName} Group`,
      slug: `${companySlug}-group`,
    },
  });

  const company = await prisma.company.upsert({
    where: {
      tenantId_slug: {
        tenantId: tenant.id,
        slug: companySlug,
      },
    },
    update: {
      organizationId: organization.id,
      name: defaultOwnerCredentials.companyName,
      businessCategoryId: businessCategory.id,
    },
    create: {
      tenantId: tenant.id,
      organizationId: organization.id,
      businessCategoryId: businessCategory.id,
      name: defaultOwnerCredentials.companyName,
      slug: companySlug,
    },
  });

  const membershipRole: TenantMembershipRole = "OWNER";
  const tenantMember = await prisma.tenantMember.upsert({
    where: {
      tenantId_userId: {
        tenantId: tenant.id,
        userId: user.id,
      },
    },
    update: {
      organizationId: organization.id,
      companyId: company.id,
      membershipRole,
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      organizationId: organization.id,
      companyId: company.id,
      membershipRole,
    },
  });

  const workspaceName = businessCategory.defaultWorkspaceName;
  const workspace = await prisma.workspace.upsert({
    where: {
      companyId_slug: {
        companyId: company.id,
        slug: slugify(workspaceName),
      },
    },
    update: {
      tenantId: tenant.id,
      organizationId: organization.id,
      businessCategoryId: businessCategory.id,
      industryPackId: industryPack.id,
      name: workspaceName,
    },
    create: {
      tenantId: tenant.id,
      organizationId: organization.id,
      companyId: company.id,
      businessCategoryId: businessCategory.id,
      industryPackId: industryPack.id,
      name: workspaceName,
      slug: slugify(workspaceName),
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: workspace.id,
        userId: user.id,
      },
    },
    update: {
      tenantMemberId: tenantMember.id,
    },
    create: {
      workspaceId: workspace.id,
      tenantMemberId: tenantMember.id,
      userId: user.id,
    },
  });

  const permissions = await prisma.permission.findMany();
  const ownerRoleCode = roleSeeds[0]?.code ?? "OWNER";
  const ownerRole = await prisma.role.upsert({
    where: {
      tenantId_workspaceId_code: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        code: ownerRoleCode,
      },
    },
    update: {
      companyId: company.id,
      name: "Owner",
      isSystem: true,
    },
    create: {
      tenantId: tenant.id,
      companyId: company.id,
      workspaceId: workspace.id,
      code: ownerRoleCode,
      name: "Owner",
      isSystem: true,
    },
  });

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: ownerRole.id,
          permissionId: permission.id,
        },
      },
      update: {
        allowed: true,
      },
      create: {
        roleId: ownerRole.id,
        permissionId: permission.id,
        allowed: true,
      },
    });
  }

  await prisma.userRole.upsert({
    where: {
      userId_roleId_workspaceId: {
        userId: user.id,
        roleId: ownerRole.id,
        workspaceId: workspace.id,
      },
    },
    update: {
      tenantId: tenant.id,
      companyId: company.id,
    },
    create: {
      userId: user.id,
      roleId: ownerRole.id,
      tenantId: tenant.id,
      companyId: company.id,
      workspaceId: workspace.id,
    },
  });

  const accountGroupIdByCode = await seedAccountGroups(prisma, tenant.id, company.id);

  for (const voucherType of voucherTypeSeeds) {
    await prisma.voucherType.upsert({
      where: {
        companyId_code: {
          companyId: company.id,
          code: voucherType.code,
        },
      },
      update: {
        name: voucherType.name,
        shortCode: voucherType.shortCode,
      },
      create: {
        tenantId: tenant.id,
        companyId: company.id,
        code: voucherType.code,
        name: voucherType.name,
        shortCode: voucherType.shortCode,
      },
    });
  }

  await seedAccountHierarchy(prisma, tenant.id, company.id, accountGroupIdByCode);

  await prisma.accountingSettings.upsert({
    where: { companyId: company.id },
    update: {},
    create: {
      tenantId: tenant.id,
      companyId: company.id,
      negativeStockPolicy: "ALLOW_NEGATIVE",
    },
  });

  await prisma.branch.upsert({
    where: { workspaceId: workspace.id },
    update: {},
    create: {
      tenantId: tenant.id,
      companyId: company.id,
      workspaceId: workspace.id,
      name: workspace.name,
      code: workspace.slug.slice(0, 32),
      isDefault: true,
    },
  });

  const subscription = await prisma.subscription.upsert({
    where: {
      id: `${tenant.id}:${workspace.id}:free`,
    },
    update: {
      companyId: company.id,
      workspaceId: workspace.id,
      planId: plan.id,
      status: SubscriptionStatus.FREE_ACTIVE,
    },
    create: {
      id: `${tenant.id}:${workspace.id}:free`,
      tenantId: tenant.id,
      companyId: company.id,
      workspaceId: workspace.id,
      planId: plan.id,
      status: SubscriptionStatus.FREE_ACTIVE,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + plan.durationMonths * 30 * 24 * 60 * 60 * 1000),
    },
  });

  for (const featureKey of freeYearlyFeatureKeys) {
    await prisma.entitlement.upsert({
      where: {
        scopeKey: `${tenant.id}:${company.id}:${workspace.id}:${featureKey}`,
      },
      update: {
        enabled: true,
        subscriptionId: subscription.id,
      },
      create: {
        tenantId: tenant.id,
        companyId: company.id,
        workspaceId: workspace.id,
        subscriptionId: subscription.id,
        featureKey,
        enabled: true,
        scopeKey: `${tenant.id}:${company.id}:${workspace.id}:${featureKey}`,
      },
    });
  }

  for (const usageLimit of usageLimitSeeds) {
    const periodKey = new Date().toISOString().slice(0, 7);
    await prisma.usageCounter.upsert({
      where: {
        scopeKey: `${tenant.id}:${workspace.id}:${usageLimit.key}:${periodKey}`,
      },
      update: {},
      create: {
        tenantId: tenant.id,
        workspaceId: workspace.id,
        key: usageLimit.key,
        periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
        periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0),
        value: usageLimit.key === "users" ? 1 : 0,
        scopeKey: `${tenant.id}:${workspace.id}:${usageLimit.key}:${periodKey}`,
      },
    });
  }
}

async function main() {
  for (const categorySeed of industryPackSeeds) {
    const category = await prisma.businessCategory.upsert({
      where: { code: categorySeed.categoryCode },
      update: {
        name: categorySeed.categoryName,
        description: categorySeed.description,
        defaultWorkspaceName: categorySeed.workspaceName,
      },
      create: {
        code: categorySeed.categoryCode,
        name: categorySeed.categoryName,
        description: categorySeed.description,
        defaultWorkspaceName: categorySeed.workspaceName,
      },
    });

    await prisma.industryPack.upsert({
      where: { code: categorySeed.packCode },
      update: {
        businessCategoryId: category.id,
        name: categorySeed.packName,
        moduleConfig: categorySeed.modules,
        menuConfig: categorySeed.menus,
        terminologyConfig: categorySeed.terminology,
        workflowConfig: categorySeed.workflows,
        reportConfig: categorySeed.reports,
        quickActionConfig: categorySeed.quickActions,
        dashboardConfig: categorySeed.dashboardCards,
      },
      create: {
        code: categorySeed.packCode,
        businessCategoryId: category.id,
        name: categorySeed.packName,
        moduleConfig: categorySeed.modules,
        menuConfig: categorySeed.menus,
        terminologyConfig: categorySeed.terminology,
        workflowConfig: categorySeed.workflows,
        reportConfig: categorySeed.reports,
        quickActionConfig: categorySeed.quickActions,
        dashboardConfig: categorySeed.dashboardCards,
      },
    });
  }

  const moduleIdByKey = new Map<string, string>();
  for (const moduleSeed of moduleSeeds) {
    const moduleRecord = await prisma.erpModule.upsert({
      where: { key: moduleSeed.key },
      update: {
        label: moduleSeed.label,
      },
      create: {
        key: moduleSeed.key,
        label: moduleSeed.label,
      },
    });
    moduleIdByKey.set(moduleSeed.key, moduleRecord.id);
  }

  const featureIdByKey = new Map<string, string>();
  for (const featureSeed of featureSeeds) {
    const feature = await prisma.feature.upsert({
      where: { key: featureSeed.key },
      update: {
        label: featureSeed.label,
        moduleId: moduleIdByKey.get(featureSeed.moduleKey) ?? null,
      },
      create: {
        key: featureSeed.key,
        label: featureSeed.label,
        moduleId: moduleIdByKey.get(featureSeed.moduleKey) ?? null,
      },
    });
    featureIdByKey.set(feature.key, feature.id);
  }

  for (const permissionSeed of permissionSeeds) {
    await prisma.permission.upsert({
      where: { key: permissionSeed.key },
      update: {
        moduleKey: permissionSeed.moduleKey,
        resource: permissionSeed.resource,
        action: permissionSeed.action,
      },
      create: {
        key: permissionSeed.key,
        moduleKey: permissionSeed.moduleKey,
        resource: permissionSeed.resource,
        action: permissionSeed.action,
      },
    });
  }

  for (const planSeed of subscriptionPlanSeeds) {
    const plan = await prisma.plan.upsert({
      where: { code: planSeed.code },
      update: {
        code: planSeed.code,
        name: planSeed.name,
        description: planSeed.description,
        durationMonths: planSeed.durationMonths,
        priceInMinor: planSeed.priceInMinor,
        currencyCode: planSeed.currencyCode,
        maxOrganizations: planSeed.maxOrganizations,
        maxCompanies: planSeed.maxCompanies,
        maxWorkspaces: planSeed.maxWorkspaces,
        maxBranches: planSeed.maxBranches,
        maxUsers: planSeed.maxUsers,
        maxGodowns: planSeed.maxGodowns,
        maxStockItems: planSeed.maxStockItems,
        maxCustomers: planSeed.maxCustomers,
        maxSuppliers: planSeed.maxSuppliers,
        maxMonthlyVouchers: planSeed.maxMonthlyVouchers,
        maxMonthlyInvoices: planSeed.maxMonthlyInvoices,
        maxStorageMb: planSeed.maxStorageMb,
      },
      create: {
        code: planSeed.code,
        name: planSeed.name,
        description: planSeed.description,
        durationMonths: planSeed.durationMonths,
        priceInMinor: planSeed.priceInMinor,
        currencyCode: planSeed.currencyCode,
        maxOrganizations: planSeed.maxOrganizations,
        maxCompanies: planSeed.maxCompanies,
        maxWorkspaces: planSeed.maxWorkspaces,
        maxBranches: planSeed.maxBranches,
        maxUsers: planSeed.maxUsers,
        maxGodowns: planSeed.maxGodowns,
        maxStockItems: planSeed.maxStockItems,
        maxCustomers: planSeed.maxCustomers,
        maxSuppliers: planSeed.maxSuppliers,
        maxMonthlyVouchers: planSeed.maxMonthlyVouchers,
        maxMonthlyInvoices: planSeed.maxMonthlyInvoices,
        maxStorageMb: planSeed.maxStorageMb,
      },
    });

    for (const featureKey of planSeed.featureKeys) {
      const featureId = featureIdByKey.get(featureKey);
      if (!featureId) {
        continue;
      }

      await prisma.planFeature.upsert({
        where: {
          planId_featureId: {
            planId: plan.id,
            featureId,
          },
        },
        update: { enabled: true },
        create: {
          planId: plan.id,
          featureId,
          enabled: true,
        },
      });
    }

    for (const usageLimitSeed of planSeed.usageLimits) {
      await prisma.usageLimit.upsert({
        where: {
          planId_key: {
            planId: plan.id,
            key: usageLimitSeed.key,
          },
        },
        update: {
          limit: usageLimitSeed.limit,
        },
        create: {
          planId: plan.id,
          key: usageLimitSeed.key,
          limit: usageLimitSeed.limit,
        },
      });
    }
  }

  await seedDefaultOwner();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
