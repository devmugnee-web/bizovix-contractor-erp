import { Injectable } from "@nestjs/common";
import type { OrganizationMaster } from "@bizovix/database";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrganizationMasterDto } from "./dto/create-organization-master.dto";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(organizationId: string, search?: string): Promise<OrganizationMaster[]> {
    const trimmed = search?.trim() ?? "";

    if (trimmed.length === 1) {
      return [];
    }

    return this.prisma.organizationMaster.findMany({
      where: {
        organizationId,
        ...(trimmed.length >= 2
          ? {
              OR: [
                { shortName: { contains: trimmed, mode: "insensitive" } },
                { fullName: { contains: trimmed, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { shortName: "asc" },
      take: trimmed.length >= 2 ? 20 : 100,
    });
  }

  create(organizationId: string, dto: CreateOrganizationMasterDto): Promise<OrganizationMaster> {
    return this.prisma.organizationMaster.create({
      data: {
        organizationId,
        shortName: dto.shortName,
        fullName: dto.fullName,
      },
    });
  }
}
