import { randomBytes } from "crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import bcrypt from "bcryptjs";
import { buildPaginationMeta } from "@bizovix/utils";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";
import { PlanLimitsService } from "../billing/plan-limits.service";
import type { CreateUserDto, QueryUserDto, ResetPasswordDto, UpdateUserDto } from "./dto/user.dto";

const includeUser = {
  user: { select: { id: true, name: true, email: true, phone: true, isActive: true, createdAt: true } },
  role: { select: { id: true, name: true } },
} as const;

function toDto(row: { id: string; user: { id: string; name: string; email: string; phone: string | null; isActive: boolean; createdAt: Date }; role: { id: string; name: string }; createdAt: Date }, lastLoginAt?: Date | null) {
  return {
    id: row.user.id,
    membershipId: row.id,
    name: row.user.name,
    email: row.user.email,
    phone: row.user.phone,
    isActive: row.user.isActive,
    role: row.role,
    createdAt: row.user.createdAt,
    lastLoginAt: lastLoginAt ?? null,
  };
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  private async assertPasswordPolicy(org: string, password: string) {
    const policy = await this.prisma.securitySetting.findUnique({ where: { organizationId: org } });
    const minLength = policy?.minPasswordLength ?? 8;
    const problems: string[] = [];
    if (password.length < minLength) problems.push(`at least ${minLength} characters`);
    if (policy?.requireUppercase && !/[A-Z]/.test(password)) problems.push("an uppercase letter");
    if (policy?.requireLowercase && !/[a-z]/.test(password)) problems.push("a lowercase letter");
    if (policy?.requireNumber && !/[0-9]/.test(password)) problems.push("a number");
    if (policy?.requireSpecialChar && !/[^A-Za-z0-9]/.test(password)) problems.push("a special character");
    if (problems.length) throw new BadRequestException(`Password must contain ${problems.join(", ")}.`);
  }

  private async lastLogins(org: string, userIds: string[]) {
    if (!userIds.length) return new Map<string, Date>();
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId: org, action: "login", userId: { in: userIds } },
      orderBy: { createdAt: "desc" },
      select: { userId: true, createdAt: true },
    });
    const map = new Map<string, Date>();
    for (const row of rows) if (row.userId && !map.has(row.userId)) map.set(row.userId, row.createdAt);
    return map;
  }

  async list(org: string, query: QueryUserDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = {
      organizationId: org,
      ...(query.isActive !== undefined ? { user: { isActive: query.isActive === "true" } } : {}),
      ...(query.roleId ? { roleId: query.roleId } : {}),
      ...(query.search
        ? {
            user: {
              OR: [
                { name: { contains: query.search, mode: "insensitive" as const } },
                { email: { contains: query.search, mode: "insensitive" as const } },
              ],
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.organizationUser.findMany({
        where,
        include: includeUser,
        orderBy: { user: { name: "asc" } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.organizationUser.count({ where }),
    ]);
    const lastLogins = await this.lastLogins(org, items.map((i) => i.user.id));
    return {
      items: items.map((row) => toDto(row, lastLogins.get(row.user.id))),
      meta: buildPaginationMeta(total, page, limit),
    };
  }

  async one(org: string, userId: string) {
    const row = await this.prisma.organizationUser.findFirst({
      where: { organizationId: org, userId },
      include: includeUser,
    });
    if (!row) throw new NotFoundException("User not found");
    const lastLogins = await this.lastLogins(org, [userId]);
    return toDto(row, lastLogins.get(userId));
  }

  private async assertRole(org: string, roleId: string) {
    const role = await this.prisma.role.findFirst({ where: { id: roleId, organizationId: org } });
    if (!role) throw new NotFoundException("Role not found");
    return role;
  }

  async create(org: string, actorId: string, dto: CreateUserDto) {
    await this.planLimits.assertCanAddUser(org);
    await this.assertRole(org, dto.roleId);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException("A user with this email already exists");
    const password = dto.password ?? randomBytes(9).toString("base64url");
    await this.assertPasswordPolicy(org, password);
    const passwordHash = await bcrypt.hash(password, 10);
    const row = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { name: dto.name.trim(), email: dto.email.toLowerCase(), phone: dto.phone?.trim() || null, passwordHash },
      });
      return tx.organizationUser.create({
        data: { organizationId: org, userId: user.id, roleId: dto.roleId, isDefault: true },
        include: includeUser,
      });
    });
    await this.audit.record({
      organizationId: org,
      userId: actorId,
      action: "create",
      module: "Settings",
      entityType: "User",
      entityId: row.user.id,
      newValue: toDto(row),
    });
    return { ...toDto(row), temporaryPassword: dto.password ? undefined : password };
  }

  async update(org: string, actorId: string, userId: string, dto: UpdateUserDto) {
    const existing = await this.one(org, userId);
    if (dto.roleId) await this.assertRole(org, dto.roleId);
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.name !== undefined || dto.phone !== undefined)
        await tx.user.update({
          where: { id: userId },
          data: { name: dto.name?.trim(), phone: dto.phone?.trim() || undefined },
        });
      if (dto.roleId)
        await tx.organizationUser.updateMany({
          where: { organizationId: org, userId },
          data: { roleId: dto.roleId },
        });
      return tx.organizationUser.findFirstOrThrow({ where: { organizationId: org, userId }, include: includeUser });
    });
    await this.audit.record({
      organizationId: org,
      userId: actorId,
      action: "update",
      module: "Settings",
      entityType: "User",
      entityId: userId,
      oldValue: existing,
      newValue: toDto(row),
    });
    return toDto(row);
  }

  async setStatus(org: string, actorId: string, userId: string, isActive: boolean) {
    await this.one(org, userId);
    if (userId === actorId && !isActive) throw new BadRequestException("You cannot deactivate your own account");
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive } });
      if (!isActive)
        await tx.refreshToken.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      return tx.organizationUser.findFirstOrThrow({ where: { organizationId: org, userId }, include: includeUser });
    });
    await this.audit.record({
      organizationId: org,
      userId: actorId,
      action: isActive ? "activate" : "deactivate",
      module: "Settings",
      entityType: "User",
      entityId: userId,
      newValue: toDto(row),
    });
    return toDto(row);
  }

  async resetPassword(org: string, actorId: string, userId: string, dto: ResetPasswordDto) {
    await this.one(org, userId);
    await this.assertPasswordPolicy(org, dto.newPassword);
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.record({
      organizationId: org,
      userId: actorId,
      action: "reset_password",
      module: "Settings",
      entityType: "User",
      entityId: userId,
      description: "Password reset by administrator",
    });
    return { success: true };
  }
}
