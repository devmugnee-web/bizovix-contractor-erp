import { Injectable } from "@nestjs/common";
import type { OrganizationMaster, Prisma } from "@bizovix/database";
import type { PaginationMeta } from "@bizovix/types";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { CreateOrganizationMasterDto } from "./dto/create-organization-master.dto";
import { QueryOrganizationMasterDto } from "./dto/query-organization-master.dto";
import { desktopCaptureAvailable, lockDesktopCaptureBoundary } from "../desktop-sync/desktop-sync-capture";
import { lockDesktopMasterClock, recordDesktopMasterChange } from "../desktop-sync/desktop-master-sync-state";

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
    return this.prisma.$transaction(async (tx) => {
      await lockDesktopCaptureBoundary(tx, organizationId);
      if (!await desktopCaptureAvailable(tx, "organizationMaster")) return this.createInTransaction(tx, organizationId, dto);
      await lockDesktopMasterClock(tx, organizationId, "organizationMaster");
      const record = await this.createInTransaction(tx, organizationId, dto);
      await recordDesktopMasterChange(tx, organizationId, "organizationMaster", record, 1);
      return record;
    });
  }

  /** Preserve original exact names and case-sensitive uniqueness; caller owns tx. */
  createInTransaction(tx: Prisma.TransactionClient, organizationId: string, dto: CreateOrganizationMasterDto, id?: string): Promise<OrganizationMaster> {
    return tx.organizationMaster.create({
      data: {
        ...(id ? { id } : {}),
        organizationId,
        shortName: dto.shortName,
        fullName: dto.fullName,
      },
    });
  }
}
