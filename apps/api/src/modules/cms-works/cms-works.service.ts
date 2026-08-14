import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@bizovix/database";
import { buildPaginationMeta } from "@bizovix/utils";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCmsWorkDto } from "./dto/create-cms-work.dto";
import { QueryCmsWorkDto } from "./dto/query-cms-work.dto";

const includeRelations = { organizationMaster: { select: { id: true, shortName: true, fullName: true } } } satisfies Prisma.CmsWorkInclude;
type WorkRecord = Prisma.CmsWorkGetPayload<{ include: typeof includeRelations }>;

function toDto(record: WorkRecord) {
  return { ...record, contractValue: record.contractValue.toFixed(2) };
}

@Injectable()
export class CmsWorksService {
  constructor(private readonly prisma: PrismaService, private readonly auditLogService: AuditLogService) {}

  private where(organizationId: string, query: QueryCmsWorkDto): Prisma.CmsWorkWhereInput {
    return {
      organizationId,
      status: query.status ?? "ONGOING",
      ...(query.organizationMasterId ? { organizationMasterId: query.organizationMasterId } : {}),
      ...(query.workCategory ? { workCategory: query.workCategory } : {}),
      ...(query.search ? { OR: [
        { workName: { contains: query.search, mode: "insensitive" } },
        { organizationMaster: { shortName: { contains: query.search, mode: "insensitive" } } },
        { organizationMaster: { fullName: { contains: query.search, mode: "insensitive" } } },
      ] } : {}),
    };
  }

  async findAll(organizationId: string, query: QueryCmsWorkDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const where = this.where(organizationId, query);
    const [items, total] = await Promise.all([
      this.prisma.cmsWork.findMany({ where, include: includeRelations, orderBy: { id: "asc" }, skip: (page - 1) * limit, take: limit }),
      this.prisma.cmsWork.count({ where }),
    ]);
    return { items: items.map(toDto), meta: buildPaginationMeta(total, page, limit) };
  }

  async stats(organizationId: string) {
    const [ongoingWorks, aggregate] = await Promise.all([
      this.prisma.cmsWork.count({ where: { organizationId, status: "ONGOING" } }),
      this.prisma.cmsWork.aggregate({ where: { organizationId, status: "ONGOING" }, _sum: { contractValue: true } }),
    ]);
    return { ongoingWorks, totalWorkValue: (aggregate._sum.contractValue ?? 0).toString() };
  }

  async findOne(organizationId: string, id: string) {
    const work = await this.prisma.cmsWork.findFirst({ where: { id, organizationId }, include: includeRelations });
    if (!work) throw new NotFoundException("Work not found");
    return toDto(work);
  }

  async create(organizationId: string, userId: string, dto: CreateCmsWorkDto) {
    const master = await this.prisma.organizationMaster.findFirst({ where: { id: dto.organizationMasterId, organizationId } });
    if (!master) throw new NotFoundException("Organization not found");
    const work = await this.prisma.cmsWork.create({
      data: {
        organizationId,
        organizationMasterId: dto.organizationMasterId,
        workName: dto.workName,
        workCategory: dto.workCategory,
        contractValue: dto.contractValue,
        status: "ONGOING",
        startDate: dto.startDate ? new Date(dto.startDate) : null,
        expectedCompletionDate: dto.expectedCompletionDate ? new Date(dto.expectedCompletionDate) : null,
        createdById: userId,
      },
      include: includeRelations,
    });
    await this.auditLogService.record({ organizationId, userId, action: "create", entityType: "CmsWork", entityId: work.id, newValue: toDto(work) });
    return toDto(work);
  }

  async archive(organizationId: string, userId: string, id: string) {
    await this.findOne(organizationId, id);
    const work = await this.prisma.cmsWork.update({ where: { id }, data: { status: "ARCHIVED" }, include: includeRelations });
    await this.auditLogService.record({ organizationId, userId, action: "update", entityType: "CmsWork", entityId: id, newValue: toDto(work) });
    return toDto(work);
  }

  async categories(organizationId: string) {
    const rows = await this.prisma.cmsWork.findMany({ where: { organizationId }, distinct: ["workCategory"], select: { workCategory: true }, orderBy: { workCategory: "asc" } });
    return rows.map((row) => row.workCategory);
  }
}
