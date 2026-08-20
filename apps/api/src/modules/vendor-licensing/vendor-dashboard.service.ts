import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ONLINE_WINDOW_MINUTES } from "./common/constants";

@Injectable()
export class VendorDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary() {
    const now = new Date();
    const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60 * 1000);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalCustomers,
      totalLicenses,
      activeLicenses,
      suspendedLicenses,
      revokedLicenses,
      expiredLicenses,
      totalTrialLicenses,
      activeTrials,
      expiredTrialsRaw,
      convertedTrials,
      oneTimeLicenses,
      subscriptionLicenses,
      trialCustomerIds,
      oneTimeCustomerIds,
      saasCustomerIds,
      expiringSoon7,
      expiringSoon30,
      currentlyOnlineDevices,
      totalActiveDevices,
      totalInstallations,
      totalDownloads,
      downloadsLast30Days,
      activeSubscriptions,
      expiredSubscriptions,
      suspendedSubscriptions,
      cancelledSubscriptions,
      subscriptionsExpiringSoon7,
      subscriptionsExpiringSoon30,
      packages,
    ] = await Promise.all([
      this.prisma.vendorCustomer.count(),
      this.prisma.vendorLicenseKey.count(),
      this.prisma.vendorLicenseKey.count({ where: { status: "ACTIVE" } }),
      this.prisma.vendorLicenseKey.count({ where: { status: "SUSPENDED" } }),
      this.prisma.vendorLicenseKey.count({ where: { status: "REVOKED" } }),
      this.prisma.vendorLicenseKey.count({ where: { status: "EXPIRED" } }),
      this.prisma.vendorLicenseKey.count({ where: { type: "TRIAL" } }),
      this.prisma.vendorLicenseKey.count({ where: { type: "TRIAL", status: "ACTIVE", convertedToLicenseId: null } }),
      this.prisma.vendorLicenseKey.count({ where: { type: "TRIAL", status: "EXPIRED", convertedToLicenseId: null } }),
      this.prisma.vendorLicenseKey.count({ where: { type: "TRIAL", convertedToLicenseId: { not: null } } }),
      this.prisma.vendorLicenseKey.count({ where: { type: "ONE_TIME" } }),
      this.prisma.vendorLicenseKey.count({ where: { type: "SUBSCRIPTION" } }),
      this.prisma.vendorLicenseKey.findMany({ where: { type: "TRIAL" }, distinct: ["customerId"], select: { customerId: true } }),
      this.prisma.vendorLicenseKey.findMany({ where: { type: "ONE_TIME" }, distinct: ["customerId"], select: { customerId: true } }),
      this.prisma.vendorLicenseKey.findMany({ where: { type: "SUBSCRIPTION" }, distinct: ["customerId"], select: { customerId: true } }),
      this.prisma.vendorLicenseKey.count({ where: { status: "ACTIVE", expiresAt: { lte: in7Days, gte: now } } }),
      this.prisma.vendorLicenseKey.count({ where: { status: "ACTIVE", expiresAt: { lte: in30Days, gte: now } } }),
      this.prisma.vendorDeviceActivation.count({ where: { status: "ACTIVE", lastSeenAt: { gte: onlineSince } } }),
      this.prisma.vendorDeviceActivation.count({ where: { status: "ACTIVE" } }),
      this.prisma.vendorDeviceActivation.count(),
      this.prisma.vendorDownloadEvent.count(),
      this.prisma.vendorDownloadEvent.count({ where: { createdAt: { gte: last30Days } } }),
      this.prisma.vendorSubscription.count({ where: { status: "ACTIVE" } }),
      this.prisma.vendorSubscription.count({ where: { status: "EXPIRED" } }),
      this.prisma.vendorSubscription.count({ where: { status: "SUSPENDED" } }),
      this.prisma.vendorSubscription.count({ where: { status: "CANCELLED" } }),
      this.prisma.vendorSubscription.count({ where: { status: "ACTIVE", currentPeriodEnd: { lte: in7Days, gte: now } } }),
      this.prisma.vendorSubscription.count({ where: { status: "ACTIVE", currentPeriodEnd: { lte: in30Days, gte: now } } }),
      this.prisma.vendorLicensePackage.findMany({ select: { id: true, name: true, code: true } }),
    ]);

    const byPackage = await Promise.all(
      packages.map(async (pkg) => ({
        packageId: pkg.id,
        packageName: pkg.name,
        packageCode: pkg.code,
        activeLicenseCount: await this.prisma.vendorLicenseKey.count({
          where: { packageId: pkg.id, status: "ACTIVE" },
        }),
      })),
    );

    return {
      totalCustomers,
      totalLicenses,
      licensesByStatus: { active: activeLicenses, suspended: suspendedLicenses, revoked: revokedLicenses, expired: expiredLicenses },
      licensesByType: { oneTime: oneTimeLicenses, subscription: subscriptionLicenses, trial: totalTrialLicenses },
      trials: { active: activeTrials, expired: expiredTrialsRaw, converted: convertedTrials, totalCustomers: trialCustomerIds.length },
      customersByChannel: { oneTime: oneTimeCustomerIds.length, saas: saasCustomerIds.length, trial: trialCustomerIds.length },
      subscriptions: {
        active: activeSubscriptions,
        expired: expiredSubscriptions,
        suspended: suspendedSubscriptions,
        cancelled: cancelledSubscriptions,
        expiringSoon: { in7Days: subscriptionsExpiringSoon7, in30Days: subscriptionsExpiringSoon30 },
      },
      expiringSoon: { in7Days: expiringSoon7, in30Days: expiringSoon30 },
      devices: {
        currentlyOnline: currentlyOnlineDevices,
        offline: totalActiveDevices - currentlyOnlineDevices,
        totalActive: totalActiveDevices,
        totalInstallations,
        onlineWindowMinutes: ONLINE_WINDOW_MINUTES,
      },
      downloads: { total: totalDownloads, last30Days: downloadsLast30Days },
      byPackage,
    };
  }

  async packages() {
    const packages = await this.prisma.vendorLicensePackage.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    return Promise.all(
      packages.map(async (pkg) => {
        const [activeLicenseCount, totalIssued, activeDeviceCount] = await Promise.all([
          this.prisma.vendorLicenseKey.count({ where: { packageId: pkg.id, status: "ACTIVE" } }),
          this.prisma.vendorLicenseKey.count({ where: { packageId: pkg.id } }),
          this.prisma.vendorDeviceActivation.count({ where: { status: "ACTIVE", licenseKey: { packageId: pkg.id } } }),
        ]);
        return {
          id: pkg.id,
          code: pkg.code,
          name: pkg.name,
          type: pkg.type,
          billingCycle: pkg.billingCycle,
          isActive: pkg.isActive,
          activeLicenseCount,
          totalIssued,
          activeDeviceCount,
        };
      }),
    );
  }

  async downloads() {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [total, last30DaysCount, byPlatform, byVersion, byDay] = await Promise.all([
      this.prisma.vendorDownloadEvent.count(),
      this.prisma.vendorDownloadEvent.count({ where: { createdAt: { gte: last30Days } } }),
      this.prisma.vendorDownloadEvent.groupBy({ by: ["platform"], _count: { _all: true } }),
      this.prisma.vendorDownloadEvent.groupBy({ by: ["version"], _count: { _all: true } }),
      this.prisma.$queryRaw<{ day: Date; count: bigint }[]>`
        SELECT DATE("createdAt") as day, COUNT(*) as count
        FROM vendor_download_events
        WHERE "createdAt" >= ${last30Days}
        GROUP BY day
        ORDER BY day ASC
      `,
    ]);

    return {
      total,
      last30Days: last30DaysCount,
      byPlatform: byPlatform.map((p) => ({ platform: p.platform ?? "unknown", count: p._count._all })),
      byVersion: byVersion.map((v) => ({ version: v.version ?? "unknown", count: v._count._all })),
      byDay: byDay.map((d) => ({ day: d.day, count: Number(d.count) })),
    };
  }

  async activity(limit = 50) {
    const [events, downloads] = await Promise.all([
      this.prisma.vendorLicenseEvent.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
        include: { licenseKey: { include: { customer: true } } },
      }),
      this.prisma.vendorDownloadEvent.findMany({
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const feed = [
      ...events.map((e) => ({
        kind: "LICENSE_EVENT" as const,
        id: e.id,
        type: e.type,
        message: e.message,
        companyName: e.licenseKey.customer.companyName,
        licenseKeyId: e.licenseKeyId,
        actorAdminId: e.actorAdminId,
        createdAt: e.createdAt,
      })),
      ...downloads.map((d) => ({
        kind: "DOWNLOAD" as const,
        id: d.id,
        type: "DOWNLOAD",
        message: [d.platform, d.version].filter(Boolean).join(" "),
        companyName: d.companyName ?? d.email ?? "Unknown",
        licenseKeyId: null,
        actorAdminId: null,
        createdAt: d.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return feed.slice(0, limit);
  }

  async companies() {
    const now = new Date();
    const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60 * 1000);

    const customers = await this.prisma.vendorCustomer.findMany({
      include: {
        licenseKeys: {
          include: {
            package: { select: { id: true, name: true, code: true } },
            subscription: { select: { status: true, billingCycle: true, currentPeriodEnd: true } },
            activations: { select: { status: true, lastSeenAt: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return customers.map((customer) => ({
      id: customer.id,
      companyName: customer.companyName,
      email: customer.email,
      organizationId: customer.organizationId,
      createdAt: customer.createdAt,
      licenses: customer.licenseKeys.map((license) => {
        const activeDevices = license.activations.filter((a) => a.status === "ACTIVE");
        const lastActivity = license.activations.reduce<Date | null>(
          (latest, a) => (!latest || a.lastSeenAt > latest ? a.lastSeenAt : latest),
          null,
        );
        return {
          id: license.id,
          licenseKey: license.licenseKey,
          type: license.type,
          status: license.status,
          package: license.package,
          subscription: license.subscription,
          maxDevices: license.maxDevices,
          activeDeviceCount: activeDevices.length,
          onlineDeviceCount: activeDevices.filter((a) => a.lastSeenAt >= onlineSince).length,
          expiresAt: license.expiresAt,
          remainingDays: license.expiresAt
            ? Math.ceil((license.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
            : null,
          lastActivity,
        };
      }),
    }));
  }
}
