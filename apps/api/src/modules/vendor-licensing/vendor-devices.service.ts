import { Injectable } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { maskLicenseKey } from "./common/license-key.util";
import { ONLINE_WINDOW_MINUTES } from "./common/constants";
import { QueryVendorDevicesDto } from "./dto/query-devices.dto";

const include = {
  licenseKey: {
    select: {
      id: true,
      licenseKey: true,
      status: true,
      customer: { select: { id: true, companyName: true, email: true } },
      package: { select: { id: true, code: true, name: true } },
    },
  },
} satisfies Prisma.VendorDeviceActivationInclude;

@Injectable()
export class VendorDevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: QueryVendorDevicesDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MINUTES * 60 * 1000);

    const where: Prisma.VendorDeviceActivationWhereInput = {
      status: query.status,
      licenseKeyId: query.licenseId,
    };

    if (query.customerId || query.packageId) {
      where.licenseKey = { customerId: query.customerId, packageId: query.packageId };
    }

    if (query.onlineStatus === "online") {
      where.status = "ACTIVE";
      where.lastSeenAt = { gte: onlineSince };
    } else if (query.onlineStatus === "offline") {
      where.status = "ACTIVE";
      where.lastSeenAt = { lt: onlineSince };
    }

    if (query.search) {
      where.OR = [
        { deviceId: { contains: query.search, mode: "insensitive" } },
        { hostname: { contains: query.search, mode: "insensitive" } },
        { deviceName: { contains: query.search, mode: "insensitive" } },
        { licenseKey: { licenseKey: { contains: query.search, mode: "insensitive" } } },
        { licenseKey: { customer: { companyName: { contains: query.search, mode: "insensitive" } } } },
        { licenseKey: { customer: { email: { contains: query.search, mode: "insensitive" } } } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.vendorDeviceActivation.findMany({
        where,
        include,
        orderBy: { lastSeenAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.vendorDeviceActivation.count({ where }),
    ]);

    const items = rows.map((device) => ({
      id: device.id,
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      hostname: device.hostname,
      platform: device.platform,
      appVersion: device.appVersion,
      status: device.status,
      online: device.status === "ACTIVE" && device.lastSeenAt >= onlineSince,
      activatedAt: device.activatedAt,
      lastSeenAt: device.lastSeenAt,
      lastVerifiedAt: device.lastVerifiedAt,
      license: {
        id: device.licenseKey.id,
        licenseKeyMasked: maskLicenseKey(device.licenseKey.licenseKey),
        status: device.licenseKey.status,
        customer: device.licenseKey.customer,
        package: device.licenseKey.package,
      },
    }));

    return { items, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }
}
