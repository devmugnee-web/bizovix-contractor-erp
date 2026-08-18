import { Injectable } from "@nestjs/common";
import type { OrganizationMaster, Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrganizationMasterDto } from "./dto/create-organization-master.dto";
import { QueryOrganizationMasterDto } from "./dto/query-organization-master.dto";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Real paginated list — distinct from `search()`'s typeahead (min-2-char, capped-at-20/100)
   * behavior, which existing pickers already depend on and must not change. */
  async findAll(organizationId: string, query: QueryOrganizationMasterDto): Promise<{ items: OrganizationMaster[]; meta: PaginationMeta }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.OrganizationMasterWhereInput = {
      organizationId,
      ...(query.search
        ? { OR: [{ shortName: { contains: query.search, mode: "insensitive" } }, { fullName: { contains: query.search, mode: "insensitive" } }] }
        : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.organizationMaster.findMany({ where, orderBy: { shortName: "asc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.organizationMaster.count({ where }),
    ]);

    return { items, meta: buildPaginationMeta(total, page, limit) };
  }

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
