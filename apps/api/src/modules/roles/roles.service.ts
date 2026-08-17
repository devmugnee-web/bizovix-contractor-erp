import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import type { CreateRoleDto, SetRolePermissionsDto, UpdateRoleDto } from "./dto/role.dto";

const includeCounts = {
  _count: { select: { organizationUsers: true, permissions: true } },
} as const;

function toDto(row: {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: Date;
  _count: { organizationUsers: number; permissions: number };
}) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    userCount: row._count.organizationUsers,
    permissionCount: row._count.permissions,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
  ) {}

  async list(org: string) {
    const rows = await this.prisma.role.findMany({
      where: { organizationId: org },
      include: includeCounts,
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    });
    return rows.map(toDto);
  }

  async permissionsCatalog() {
    const rows = await this.prisma.permission.findMany({ orderBy: [{ group: "asc" }, { key: "asc" }] });
    return rows;
  }

  private async loadRole(org: string, id: string) {
    const row = await this.prisma.role.findFirst({
      where: { id, organizationId: org },
      include: { ...includeCounts, permissions: { select: { permission: { select: { key: true } } } } },
    });
    if (!row) throw new NotFoundException("Role not found");
    return row;
  }

  async one(org: string, id: string) {
    const row = await this.loadRole(org, id);
    return { ...toDto(row), permissionKeys: row.permissions.map((p) => p.permission.key) };
  }

  private async syncPermissionKeys(org: string, roleId: string, keys: string[]) {
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: keys } } });
    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { roleId } }),
      this.prisma.rolePermission.createMany({
        data: permissions.map((p) => ({ roleId, permissionId: p.id })),
        skipDuplicates: true,
      }),
    ]);
  }

  async create(org: string, actorId: string, dto: CreateRoleDto) {
    const row = await this.prisma.role.create({
      data: { organizationId: org, name: dto.name.trim(), description: dto.description?.trim() || null, isSystem: false },
    });
    if (dto.permissionKeys?.length) await this.syncPermissionKeys(org, row.id, dto.permissionKeys);
    await this.audit.record({
      organizationId: org,
      userId: actorId,
      action: "create",
      module: "Settings",
      entityType: "Role",
      entityId: row.id,
      referenceNo: row.name,
      newValue: await this.one(org, row.id),
    });
    return this.one(org, row.id);
  }

  async update(org: string, actorId: string, id: string, dto: UpdateRoleDto) {
    const old = await this.one(org, id);
    if (old.isSystem && dto.name && dto.name.trim() !== old.name)
      throw new BadRequestException("The name of a system role cannot be changed");
    const row = await this.prisma.role.update({
      where: { id, organizationId: org },
      data: { name: old.isSystem ? undefined : dto.name?.trim(), description: dto.description?.trim() },
    });
    await this.audit.record({
      organizationId: org,
      userId: actorId,
      action: "update",
      module: "Settings",
      entityType: "Role",
      entityId: row.id,
      referenceNo: row.name,
      oldValue: old,
      newValue: await this.one(org, id),
    });
    return this.one(org, id);
  }

  async setPermissions(org: string, actorId: string, id: string, dto: SetRolePermissionsDto) {
    const old = await this.one(org, id);
    await this.syncPermissionKeys(org, id, dto.permissionKeys);
    const updated = await this.one(org, id);
    await this.audit.record({
      organizationId: org,
      userId: actorId,
      action: "update_permissions",
      module: "Settings",
      entityType: "Role",
      entityId: id,
      referenceNo: old.name,
      oldValue: { permissionKeys: old.permissionKeys },
      newValue: { permissionKeys: updated.permissionKeys },
    });
    return updated;
  }

  async remove(org: string, actorId: string, id: string) {
    const role = await this.loadRole(org, id);
    if (role.isSystem) throw new BadRequestException("System roles cannot be deleted");
    if (role._count.organizationUsers > 0)
      throw new BadRequestException("This role is assigned to one or more users and cannot be deleted");
    await this.prisma.role.delete({ where: { id, organizationId: org } });
    await this.audit.record({
      organizationId: org,
      userId: actorId,
      action: "delete",
      module: "Settings",
      entityType: "Role",
      entityId: id,
      referenceNo: role.name,
      oldValue: toDto(role),
    });
    return null;
  }
}
