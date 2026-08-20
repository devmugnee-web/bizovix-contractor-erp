import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma, VendorLicenseStatus, VendorSubscriptionStatus } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { generateLicenseKey } from "./common/license-key.util";
import { addBillingPeriod } from "./common/billing-cycle.util";
import { rethrowAsConflictIfUniqueViolation } from "./common/prisma-error.util";
import { IssueVendorLicenseDto } from "./dto/issue-license.dto";
import { UpdateVendorLicenseDto } from "./dto/update-license.dto";
import { QueryVendorLicensesDto } from "./dto/query-licenses.dto";
import { ExtendVendorLicenseDto } from "./dto/extend-license.dto";
import { ConvertTrialDto } from "./dto/convert-trial.dto";

const detailInclude = {
  customer: true,
  package: true,
  subscription: true,
  activations: { orderBy: { lastSeenAt: "desc" as const } },
  events: { orderBy: { createdAt: "desc" as const }, take: 20 },
  convertedToLicense: { select: { id: true, licenseKey: true } },
} satisfies Prisma.VendorLicenseKeyInclude;

@Injectable()
export class VendorLicensesService {
  constructor(private readonly prisma: PrismaService) {}

  private async logEvent(
    licenseKeyId: string,
    type: string,
    message?: string,
    actorAdminId?: string,
    metadata?: Prisma.InputJsonValue,
  ) {
    await this.prisma.vendorLicenseEvent.create({ data: { licenseKeyId, type, message, actorAdminId, metadata } });
  }

  private async generateUniqueKey(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const key = generateLicenseKey();
      const existing = await this.prisma.vendorLicenseKey.findUnique({ where: { licenseKey: key } });
      if (!existing) return key;
    }
    throw new BadRequestException("Could not generate a unique license key, please retry");
  }


  async list(query: QueryVendorLicensesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.VendorLicenseKeyWhereInput = {
      status: query.status,
      type: query.type,
      packageId: query.packageId,
      customerId: query.customerId,
    };

    if (query.search) {
      where.OR = [
        { licenseKey: { contains: query.search, mode: "insensitive" } },
        { customer: { companyName: { contains: query.search, mode: "insensitive" } } },
        { customer: { email: { contains: query.search, mode: "insensitive" } } },
      ];
    }

    if (query.expiringWithinDays !== undefined) {
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + query.expiringWithinDays);
      where.expiresAt = { lte: horizon, gte: new Date() };
      where.status = where.status ?? VendorLicenseStatus.ACTIVE;
    }

    const [items, total] = await Promise.all([
      this.prisma.vendorLicenseKey.findMany({
        where,
        include: {
          customer: true,
          package: true,
          _count: { select: { activations: { where: { status: "ACTIVE" } } } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vendorLicenseKey.count({ where }),
    ]);

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async get(id: string) {
    const license = await this.prisma.vendorLicenseKey.findUnique({ where: { id }, include: detailInclude });
    if (!license) throw new NotFoundException("License not found");
    return license;
  }

  private async getOrThrow(id: string) {
    const license = await this.prisma.vendorLicenseKey.findUnique({ where: { id } });
    if (!license) throw new NotFoundException("License not found");
    return license;
  }

  /**
   * Universal issuance path for ONE_TIME / SUBSCRIPTION / TRIAL. Creating a "subscription" in
   * this system just means issuing a license against a SUBSCRIPTION-type package — this method
   * transactionally creates the paired VendorSubscription row too, so there's exactly one
   * issuance code path rather than a duplicate one under /vendor-admin/subscriptions.
   */
  async issue(dto: IssueVendorLicenseDto, actorAdminId?: string) {
    if (!dto.customerId && !dto.newCustomer) {
      throw new BadRequestException("Provide either customerId or newCustomer");
    }

    const pkg = await this.prisma.vendorLicensePackage.findUnique({ where: { id: dto.packageId } });
    if (!pkg) throw new NotFoundException("Package not found");

    const licenseKey = await this.generateUniqueKey();
    const type = dto.type ?? pkg.type;
    const maxDevices = dto.maxDevices ?? pkg.maxDevices;

    let expiresAt: Date | null = null;
    if (dto.expiresAt) {
      expiresAt = new Date(dto.expiresAt);
    } else if (pkg.durationDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + pkg.durationDays);
    }

    let record;
    try {
      record = await this.prisma.$transaction(async (tx) => {
        const customerId = dto.customerId ?? (await tx.vendorCustomer.create({ data: dto.newCustomer! })).id;

        const license = await tx.vendorLicenseKey.create({
          data: {
            licenseKey,
            customerId,
            packageId: dto.packageId,
            type,
            maxDevices,
            expiresAt,
            notes: dto.notes,
          },
        });

        if (type === "SUBSCRIPTION") {
          const billingCycle = pkg.billingCycle ?? "MONTHLY";
          const currentPeriodEnd = expiresAt ?? addBillingPeriod(new Date(), billingCycle);
          await tx.vendorSubscription.create({
            data: { licenseKeyId: license.id, customerId, packageId: dto.packageId, billingCycle, currentPeriodEnd },
          });
        }

        return tx.vendorLicenseKey.findUniqueOrThrow({ where: { id: license.id }, include: detailInclude });
      });
    } catch (error) {
      rethrowAsConflictIfUniqueViolation(error, "A customer with this email already exists");
    }

    await this.logEvent(record.id, "ISSUED", `License issued (${type}, ${maxDevices} device(s))`, actorAdminId);
    if (record.subscription) {
      await this.logEvent(record.id, "SUBSCRIPTION_CREATED", `Subscription created (${record.subscription.billingCycle})`, actorAdminId);
    }
    return record;
  }

  async update(id: string, dto: UpdateVendorLicenseDto, actorAdminId?: string) {
    const existing = await this.getOrThrow(id);

    if (dto.packageId) {
      const pkg = await this.prisma.vendorLicensePackage.findUnique({ where: { id: dto.packageId } });
      if (!pkg) throw new NotFoundException("Package not found");
    }

    const record = await this.prisma.vendorLicenseKey.update({
      where: { id },
      data: {
        maxDevices: dto.maxDevices,
        packageId: dto.packageId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
        notes: dto.notes,
      },
      include: detailInclude,
    });

    if (dto.maxDevices !== undefined && dto.maxDevices !== existing.maxDevices) {
      await this.logEvent(
        id,
        "DEVICE_LIMIT_CHANGED",
        `Device limit changed from ${existing.maxDevices} to ${dto.maxDevices}`,
        actorAdminId,
      );
    } else {
      await this.logEvent(id, "UPDATED", "License details updated", actorAdminId);
    }
    return record;
  }

  async extend(id: string, dto: ExtendVendorLicenseDto, actorAdminId?: string) {
    const license = await this.getOrThrow(id);
    if (!dto.days && !dto.newExpiresAt) {
      throw new BadRequestException("Provide either days or newExpiresAt");
    }

    let expiresAt: Date;
    if (dto.newExpiresAt) {
      expiresAt = new Date(dto.newExpiresAt);
    } else {
      const base = license.expiresAt && license.expiresAt > new Date() ? license.expiresAt : new Date();
      expiresAt = new Date(base);
      expiresAt.setDate(expiresAt.getDate() + dto.days!);
    }

    const record = await this.prisma.vendorLicenseKey.update({
      where: { id },
      data: { expiresAt, status: license.status === "EXPIRED" ? "ACTIVE" : license.status },
      include: detailInclude,
    });

    await this.logEvent(id, "EXTENDED", `Extended to ${expiresAt.toISOString()}`, actorAdminId);
    return record;
  }

  async suspend(id: string, reason?: string, actorAdminId?: string) {
    await this.getOrThrow(id);
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.vendorSubscription.updateMany({
        where: { licenseKeyId: id, status: { not: "CANCELLED" } },
        data: { status: "SUSPENDED" },
      });
      return tx.vendorLicenseKey.update({ where: { id }, data: { status: "SUSPENDED" }, include: detailInclude });
    });
    await this.logEvent(id, "SUSPENDED", reason, actorAdminId);
    return record;
  }

  async reactivate(id: string, actorAdminId?: string) {
    const license = await this.getOrThrow(id);
    if (license.status === "REVOKED") {
      throw new BadRequestException("A revoked license cannot be reactivated, issue a new one instead");
    }
    const isExpired = license.expiresAt !== null && license.expiresAt < new Date();
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.vendorSubscription.updateMany({
        where: { licenseKeyId: id, status: "SUSPENDED" },
        data: { status: isExpired ? "EXPIRED" : "ACTIVE" },
      });
      return tx.vendorLicenseKey.update({
        where: { id },
        data: { status: isExpired ? "EXPIRED" : "ACTIVE" },
        include: detailInclude,
      });
    });
    await this.logEvent(id, "REACTIVATED", undefined, actorAdminId);
    return record;
  }

  async revoke(id: string, reason?: string, actorAdminId?: string) {
    await this.getOrThrow(id);
    const record = await this.prisma.$transaction(async (tx) => {
      await tx.vendorDeviceActivation.updateMany({
        where: { licenseKeyId: id, status: "ACTIVE" },
        data: { status: "DEACTIVATED", deactivatedAt: new Date() },
      });
      await tx.vendorSubscription.updateMany({
        where: { licenseKeyId: id, status: { not: "CANCELLED" } },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason ?? "License revoked" },
      });
      return tx.vendorLicenseKey.update({
        where: { id },
        data: { status: "REVOKED", revokedAt: new Date(), revokedReason: reason },
        include: detailInclude,
      });
    });
    await this.logEvent(id, "REVOKED", reason, actorAdminId);
    return record;
  }

  /** Issues a new paid license for the same customer and marks this TRIAL as converted. */
  async convertTrial(id: string, dto: ConvertTrialDto, actorAdminId?: string) {
    const trial = await this.getOrThrow(id);
    if (trial.type !== "TRIAL") throw new BadRequestException("Only a TRIAL license can be converted");
    if (trial.convertedToLicenseId) throw new BadRequestException("This trial has already been converted");

    const newLicense = await this.issue(
      {
        customerId: trial.customerId,
        packageId: dto.packageId,
        maxDevices: dto.maxDevices,
        expiresAt: dto.expiresAt,
        notes: `Converted from trial ${trial.licenseKey}`,
      },
      actorAdminId,
    );

    const updatedTrial = await this.prisma.vendorLicenseKey.update({
      where: { id },
      data: { convertedToLicenseId: newLicense.id, convertedAt: new Date() },
      include: detailInclude,
    });

    await this.logEvent(id, "TRIAL_CONVERTED", `Converted to license ${newLicense.licenseKey}`, actorAdminId);
    return { trial: updatedTrial, newLicense };
  }

  async listDevices(id: string) {
    await this.getOrThrow(id);
    return this.prisma.vendorDeviceActivation.findMany({
      where: { licenseKeyId: id },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  async revokeDevice(id: string, deviceId: string, actorAdminId?: string) {
    const activation = await this.prisma.vendorDeviceActivation.findUnique({
      where: { licenseKeyId_deviceId: { licenseKeyId: id, deviceId } },
    });
    if (!activation) throw new NotFoundException("Device activation not found");

    const record = await this.prisma.vendorDeviceActivation.update({
      where: { id: activation.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date() },
    });
    await this.logEvent(id, "DEVICE_REVOKED", `Device ${deviceId} deactivated by admin`, actorAdminId);
    return record;
  }

  @Cron(CronExpression.EVERY_HOUR)
  async expireOverdueLicenses() {
    const overdue = await this.prisma.vendorLicenseKey.findMany({
      where: { status: VendorLicenseStatus.ACTIVE, expiresAt: { lt: new Date() } },
      select: { id: true },
    });
    if (overdue.length === 0) return;

    const ids = overdue.map((license) => license.id);
    await this.prisma.vendorLicenseKey.updateMany({ where: { id: { in: ids } }, data: { status: VendorLicenseStatus.EXPIRED } });
    await this.prisma.vendorSubscription.updateMany({
      where: { licenseKeyId: { in: ids }, status: VendorSubscriptionStatus.ACTIVE },
      data: { status: VendorSubscriptionStatus.EXPIRED },
    });
    await this.prisma.vendorLicenseEvent.createMany({
      data: overdue.map((license) => ({ licenseKeyId: license.id, type: "EXPIRED", message: "Auto-expired by schedule" })),
    });
  }
}
