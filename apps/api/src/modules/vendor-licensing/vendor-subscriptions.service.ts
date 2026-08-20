import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { addBillingPeriod } from "./common/billing-cycle.util";
import { QueryVendorSubscriptionsDto } from "./dto/query-subscriptions.dto";
import { RenewSubscriptionDto } from "./dto/renew-subscription.dto";

const detailInclude = {
  customer: true,
  package: true,
  licenseKey: { select: { id: true, licenseKey: true, status: true, maxDevices: true } },
} satisfies Prisma.VendorSubscriptionInclude;

@Injectable()
export class VendorSubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async logLicenseEvent(licenseKeyId: string, type: string, message?: string, actorAdminId?: string) {
    await this.prisma.vendorLicenseEvent.create({ data: { licenseKeyId, type, message, actorAdminId } });
  }

  async list(query: QueryVendorSubscriptionsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.VendorSubscriptionWhereInput = {
      status: query.status,
      billingCycle: query.billingCycle,
      packageId: query.packageId,
      customerId: query.customerId,
    };

    if (query.search) {
      where.OR = [
        { customer: { companyName: { contains: query.search, mode: "insensitive" } } },
        { customer: { email: { contains: query.search, mode: "insensitive" } } },
        { licenseKey: { licenseKey: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    if (query.expiringWithinDays !== undefined) {
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + query.expiringWithinDays);
      where.currentPeriodEnd = { lte: horizon, gte: new Date() };
      where.status = where.status ?? "ACTIVE";
    }

    const [items, total] = await Promise.all([
      this.prisma.vendorSubscription.findMany({
        where,
        include: detailInclude,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vendorSubscription.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async get(id: string) {
    const subscription = await this.prisma.vendorSubscription.findUnique({ where: { id }, include: detailInclude });
    if (!subscription) throw new NotFoundException("Subscription not found");
    return subscription;
  }

  /**
   * Runs the subscription+license writes in a callback transaction (not the `$transaction([a, b])`
   * array form) specifically so the final re-fetch below sees both writes committed — the array
   * form runs each op's own `include` against the pre-transaction snapshot, which would make the
   * response show the license's stale pre-cascade status even though the DB itself is correct.
   */
  private async writeAndReturn(id: string, write: (tx: Prisma.TransactionClient) => Promise<void>) {
    return this.prisma.$transaction(async (tx) => {
      await write(tx);
      return tx.vendorSubscription.findUniqueOrThrow({ where: { id }, include: detailInclude });
    });
  }

  /** Extends currentPeriodEnd by N billing cycles, restores ACTIVE status on both the subscription and its license. */
  async renew(id: string, dto: RenewSubscriptionDto, actorAdminId?: string) {
    const subscription = await this.get(id);
    const periods = dto.periods ?? 1;

    let periodEnd = subscription.currentPeriodEnd > new Date() ? subscription.currentPeriodEnd : new Date();
    for (let i = 0; i < periods; i++) {
      periodEnd = addBillingPeriod(periodEnd, subscription.billingCycle);
    }

    const updatedSubscription = await this.writeAndReturn(id, async (tx) => {
      await tx.vendorSubscription.update({
        where: { id },
        data: { currentPeriodEnd: periodEnd, status: "ACTIVE", cancelledAt: null, cancelReason: null },
      });
      await tx.vendorLicenseKey.update({ where: { id: subscription.licenseKeyId }, data: { expiresAt: periodEnd, status: "ACTIVE" } });
    });

    await this.logLicenseEvent(subscription.licenseKeyId, "SUBSCRIPTION_RENEWED", `Renewed to ${periodEnd.toISOString()}`, actorAdminId);
    return updatedSubscription;
  }

  async suspend(id: string, reason: string | undefined, actorAdminId?: string) {
    const subscription = await this.get(id);
    if (subscription.status === "CANCELLED") {
      throw new BadRequestException("A cancelled subscription cannot be suspended, renew it first");
    }

    const updatedSubscription = await this.writeAndReturn(id, async (tx) => {
      await tx.vendorSubscription.update({ where: { id }, data: { status: "SUSPENDED" } });
      await tx.vendorLicenseKey.update({ where: { id: subscription.licenseKeyId }, data: { status: "SUSPENDED" } });
    });

    await this.logLicenseEvent(subscription.licenseKeyId, "SUBSCRIPTION_SUSPENDED", reason, actorAdminId);
    return updatedSubscription;
  }

  async activate(id: string, actorAdminId?: string) {
    const subscription = await this.get(id);
    if (subscription.status !== "SUSPENDED") {
      throw new BadRequestException("Only a suspended subscription can be reactivated this way; use renew for expired/cancelled ones");
    }
    const isExpired = subscription.currentPeriodEnd < new Date();
    const nextStatus = isExpired ? "EXPIRED" : "ACTIVE";

    const updatedSubscription = await this.writeAndReturn(id, async (tx) => {
      await tx.vendorSubscription.update({ where: { id }, data: { status: nextStatus } });
      await tx.vendorLicenseKey.update({ where: { id: subscription.licenseKeyId }, data: { status: nextStatus } });
    });

    await this.logLicenseEvent(subscription.licenseKeyId, "SUBSCRIPTION_REACTIVATED", undefined, actorAdminId);
    return updatedSubscription;
  }

  /** Cancels auto-renewal; access rides out to the end of the current period (license stays ACTIVE until then). */
  async cancel(id: string, reason: string | undefined, actorAdminId?: string) {
    const subscription = await this.get(id);
    const updatedSubscription = await this.prisma.vendorSubscription.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
      include: detailInclude,
    });

    await this.logLicenseEvent(subscription.licenseKeyId, "SUBSCRIPTION_CANCELLED", reason, actorAdminId);
    return updatedSubscription;
  }
}
