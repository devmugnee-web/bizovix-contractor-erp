import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateVendorPackageDto } from "./dto/create-package.dto";
import { UpdateVendorPackageDto } from "./dto/update-package.dto";

@Injectable()
export class VendorPackagesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const packages = await this.prisma.vendorLicensePackage.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: { _count: { select: { licenseKeys: true } } },
    });
    return packages.map((pkg) => ({ ...pkg, price: pkg.price?.toFixed(2) ?? null }));
  }

  async get(id: string) {
    const pkg = await this.prisma.vendorLicensePackage.findUnique({
      where: { id },
      include: { _count: { select: { licenseKeys: true } } },
    });
    if (!pkg) throw new NotFoundException("Package not found");
    return { ...pkg, price: pkg.price?.toFixed(2) ?? null };
  }

  async create(dto: CreateVendorPackageDto) {
    const pkg = await this.prisma.vendorLicensePackage.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        billingCycle: dto.billingCycle,
        maxDevices: dto.maxDevices,
        durationDays: dto.durationDays,
        price: dto.price,
        currency: dto.currency,
        features: dto.features as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
      },
    });
    return { ...pkg, price: pkg.price?.toFixed(2) ?? null };
  }

  async update(id: string, dto: UpdateVendorPackageDto) {
    await this.get(id);
    const pkg = await this.prisma.vendorLicensePackage.update({
      where: { id },
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        billingCycle: dto.billingCycle,
        maxDevices: dto.maxDevices,
        durationDays: dto.durationDays,
        price: dto.price,
        currency: dto.currency,
        features: dto.features as Prisma.InputJsonValue | undefined,
        isActive: dto.isActive,
      },
    });
    return { ...pkg, price: pkg.price?.toFixed(2) ?? null };
  }
}
