import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { generateLicenseKey } from "./common/license-key.util";
import { ActivateLicenseDto } from "./dto/activate.dto";
import { HeartbeatDto } from "./dto/heartbeat.dto";
import { VerifyLicenseDto } from "./dto/verify.dto";
import { DeactivateDeviceDto } from "./dto/deactivate.dto";
import { TrackDownloadDto } from "./dto/track-download.dto";
import { RequestTrialDto } from "./dto/request-trial.dto";

type LicenseWithPackage = Prisma.VendorLicenseKeyGetPayload<{ include: { package: true } }>;

function remainingDays(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  return Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function assessLicense(license: { status: string; expiresAt: Date | null }): { valid: boolean; reason?: string } {
  if (license.status === "REVOKED") return { valid: false, reason: "License has been revoked" };
  if (license.status === "SUSPENDED") return { valid: false, reason: "License is suspended" };
  if (license.expiresAt && license.expiresAt < new Date()) return { valid: false, reason: "License has expired" };
  if (license.status !== "ACTIVE") return { valid: false, reason: "License is not active" };
  return { valid: true };
}

/** Shape shared by /activate, /verify and /heartbeat so the client software can handle all three the same way. */
function buildStatusResponse(
  license: LicenseWithPackage,
  opts: { deviceAuthorized: boolean; currentDeviceCount: number; reason?: string; activationId?: string },
) {
  const validity = assessLicense(license);
  return {
    valid: validity.valid,
    reason: opts.reason ?? validity.reason,
    licenseStatus: license.status,
    licenseType: license.type,
    deviceAuthorized: validity.valid && opts.deviceAuthorized,
    currentDeviceCount: opts.currentDeviceCount,
    maxDevices: license.maxDevices,
    expiresAt: license.expiresAt,
    remainingDays: remainingDays(license.expiresAt),
    ...(opts.activationId ? { activationId: opts.activationId } : {}),
    package: { code: license.package.code, name: license.package.name, features: license.package.features },
  };
}

@Injectable()
export class VendorLicenseClientService {
  constructor(private readonly prisma: PrismaService) {}

  private async findLicenseOrThrow(licenseKey: string): Promise<LicenseWithPackage> {
    const license = await this.prisma.vendorLicenseKey.findUnique({
      where: { licenseKey },
      include: { package: true },
    });
    if (!license) throw new NotFoundException("Invalid license key");
    return license;
  }

  /**
   * Device-limit enforcement must be race-free: two devices activating the same license at the
   * same instant must never both slip past a stale count and push it over maxDevices. We take a
   * Postgres row lock on the license (`SELECT ... FOR UPDATE`) before counting+writing, so a
   * second concurrent activate() for the same license blocks until the first transaction commits
   * and then re-counts against up-to-date data — the limit is enforced atomically, not just checked.
   */
  async activate(dto: ActivateLicenseDto, ipAddress?: string) {
    const licenseRef = await this.findLicenseOrThrow(dto.licenseKey);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM vendor_license_keys WHERE id = ${licenseRef.id} FOR UPDATE`;

      const license = await tx.vendorLicenseKey.findUniqueOrThrow({
        where: { id: licenseRef.id },
        include: { package: true },
      });
      const validity = assessLicense(license);
      if (!validity.valid) {
        throw new ConflictException(validity.reason);
      }

      const existing = await tx.vendorDeviceActivation.findUnique({
        where: { licenseKeyId_deviceId: { licenseKeyId: license.id, deviceId: dto.deviceId } },
      });
      const activeCount = await tx.vendorDeviceActivation.count({
        where: { licenseKeyId: license.id, status: "ACTIVE" },
      });

      const wouldConsumeNewSlot = !existing || existing.status === "DEACTIVATED";
      if (wouldConsumeNewSlot && activeCount >= license.maxDevices) {
        throw new ConflictException(`Device limit reached (max ${license.maxDevices} device(s)) for this license`);
      }

      const activation = existing
        ? await tx.vendorDeviceActivation.update({
            where: { id: existing.id },
            data: {
              deviceName: dto.deviceName,
              hostname: dto.hostname,
              platform: dto.platform,
              appVersion: dto.appVersion,
              ipAddress,
              status: "ACTIVE",
              lastSeenAt: new Date(),
              deactivatedAt: null,
            },
          })
        : await tx.vendorDeviceActivation.create({
            data: {
              licenseKeyId: license.id,
              deviceId: dto.deviceId,
              deviceName: dto.deviceName,
              hostname: dto.hostname,
              platform: dto.platform,
              appVersion: dto.appVersion,
              ipAddress,
            },
          });

      await tx.vendorLicenseEvent.create({
        data: { licenseKeyId: license.id, type: "DEVICE_ACTIVATED", message: `Device ${dto.deviceId} activated` },
      });
      await tx.vendorLicenseKey.update({ where: { id: license.id }, data: { lastValidatedAt: new Date() } });

      const finalCount = wouldConsumeNewSlot ? activeCount + 1 : activeCount;
      return buildStatusResponse(license, { deviceAuthorized: true, currentDeviceCount: finalCount, activationId: activation.id });
    });

    return result;
  }

  async verify(dto: VerifyLicenseDto) {
    const license = await this.findLicenseOrThrow(dto.licenseKey);
    const activation = await this.prisma.vendorDeviceActivation.findUnique({
      where: { licenseKeyId_deviceId: { licenseKeyId: license.id, deviceId: dto.deviceId } },
    });
    if (!activation) throw new NotFoundException("Device is not activated for this license");

    const activeCount = await this.prisma.vendorDeviceActivation.count({
      where: { licenseKeyId: license.id, status: "ACTIVE" },
    });
    const deviceAuthorized = activation.status === "ACTIVE";

    await this.prisma.vendorDeviceActivation.update({
      where: { id: activation.id },
      data: { lastVerifiedAt: new Date() },
    });

    return buildStatusResponse(license, {
      deviceAuthorized,
      currentDeviceCount: activeCount,
      reason: !deviceAuthorized ? "Device has been deactivated, please reactivate" : undefined,
    });
  }

  async heartbeat(dto: HeartbeatDto) {
    const license = await this.findLicenseOrThrow(dto.licenseKey);
    const activation = await this.prisma.vendorDeviceActivation.findUnique({
      where: { licenseKeyId_deviceId: { licenseKeyId: license.id, deviceId: dto.deviceId } },
    });
    if (!activation) throw new NotFoundException("Device is not activated for this license");

    const deviceAuthorized = activation.status === "ACTIVE";
    if (deviceAuthorized) {
      await this.prisma.vendorDeviceActivation.update({
        where: { id: activation.id },
        data: { lastSeenAt: new Date(), appVersion: dto.appVersion ?? activation.appVersion },
      });
      await this.prisma.vendorLicenseKey.update({ where: { id: license.id }, data: { lastValidatedAt: new Date() } });
    }

    const activeCount = await this.prisma.vendorDeviceActivation.count({
      where: { licenseKeyId: license.id, status: "ACTIVE" },
    });

    return buildStatusResponse(license, {
      deviceAuthorized,
      currentDeviceCount: activeCount,
      reason: !deviceAuthorized ? "Device has been deactivated, please reactivate" : undefined,
    });
  }

  async deactivate(dto: DeactivateDeviceDto) {
    const license = await this.findLicenseOrThrow(dto.licenseKey);
    const activation = await this.prisma.vendorDeviceActivation.findUnique({
      where: { licenseKeyId_deviceId: { licenseKeyId: license.id, deviceId: dto.deviceId } },
    });
    if (!activation) throw new NotFoundException("Device is not activated for this license");

    await this.prisma.vendorDeviceActivation.update({
      where: { id: activation.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date() },
    });
    await this.prisma.vendorLicenseEvent.create({
      data: { licenseKeyId: license.id, type: "DEVICE_DEACTIVATED", message: `Device ${dto.deviceId} deactivated` },
    });

    return { deactivated: true };
  }

  async trackDownload(dto: TrackDownloadDto, ipAddress?: string) {
    const customer = dto.email
      ? await this.prisma.vendorCustomer.findFirst({ where: { email: dto.email } })
      : null;

    await this.prisma.vendorDownloadEvent.create({
      data: {
        customerId: customer?.id,
        email: dto.email,
        companyName: dto.companyName,
        version: dto.version,
        platform: dto.platform,
        source: dto.source,
        ipAddress,
      },
    });

    return { tracked: true };
  }

  async requestTrial(dto: RequestTrialDto) {
    // Same device asking for another trial under a fresh email is the main abuse vector we can
    // reasonably catch server-side. trialDeviceId is stamped at request time (below) — a device
    // activation doesn't exist yet at this point, so we can't key off VendorDeviceActivation here.
    if (dto.deviceId) {
      const priorTrial = await this.prisma.vendorLicenseKey.findFirst({
        where: { type: "TRIAL", trialDeviceId: dto.deviceId },
        orderBy: { createdAt: "asc" },
      });
      if (priorTrial) {
        return {
          licenseKey: priorTrial.licenseKey,
          status: priorTrial.status,
          expiresAt: priorTrial.expiresAt,
          remainingDays: remainingDays(priorTrial.expiresAt),
          maxDevices: priorTrial.maxDevices,
          reused: true,
        };
      }
    }

    const customer = await this.prisma.vendorCustomer.upsert({
      where: { email: dto.email },
      update: {},
      create: {
        email: dto.email,
        companyName: dto.companyName,
        contactName: dto.contactName,
        phone: dto.phone,
      },
    });

    const existingTrial = await this.prisma.vendorLicenseKey.findFirst({
      where: { customerId: customer.id, type: "TRIAL", status: { not: "REVOKED" } },
    });
    if (existingTrial) {
      return {
        licenseKey: existingTrial.licenseKey,
        status: existingTrial.status,
        expiresAt: existingTrial.expiresAt,
        remainingDays: remainingDays(existingTrial.expiresAt),
        maxDevices: existingTrial.maxDevices,
        reused: true,
      };
    }

    const trialPackage = await this.prisma.vendorLicensePackage.findFirst({
      where: { type: "TRIAL", isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    if (!trialPackage) {
      throw new BadRequestException("No trial package is configured yet, please contact the vendor");
    }

    let licenseKey = "";
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = generateLicenseKey();
      const clash = await this.prisma.vendorLicenseKey.findUnique({ where: { licenseKey: candidate } });
      if (!clash) {
        licenseKey = candidate;
        break;
      }
    }
    if (!licenseKey) throw new BadRequestException("Could not generate a unique license key, please retry");

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (trialPackage.durationDays ?? 14));

    const license = await this.prisma.vendorLicenseKey.create({
      data: {
        licenseKey,
        customerId: customer.id,
        packageId: trialPackage.id,
        type: "TRIAL",
        maxDevices: trialPackage.maxDevices,
        expiresAt,
        trialDeviceId: dto.deviceId,
      },
    });
    await this.prisma.vendorLicenseEvent.create({
      data: { licenseKeyId: license.id, type: "ISSUED", message: "Trial license self-issued" },
    });

    return {
      licenseKey: license.licenseKey,
      status: license.status,
      expiresAt: license.expiresAt,
      remainingDays: remainingDays(license.expiresAt),
      maxDevices: license.maxDevices,
      reused: false,
    };
  }
}
