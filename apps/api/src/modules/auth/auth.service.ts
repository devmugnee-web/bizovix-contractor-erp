import { createHash, randomUUID } from "crypto";
import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import type { AuthUser, JwtPayload, LoginResult, Permission } from "@bizovix/types";
import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../audit-logs/audit-log.service";

interface OrgUserWithRole {
  organizationId: string;
  roleId: string;
  role: {
    name: string;
    permissions: { permission: { key: string } }[];
  };
}

@Injectable()
export class AuthService {
  private readonly jwtConfig: AppConfig["jwt"];

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.jwtConfig = this.configService.get<AppConfig["jwt"]>("app.jwt")!;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private async findOrgUser(userId: string, organizationId?: string): Promise<OrgUserWithRole | null> {
    return this.prisma.organizationUser.findFirst({
      where: {
        userId,
        ...(organizationId ? { organizationId } : { isDefault: true }),
      },
      select: {
        organizationId: true,
        roleId: true,
        role: {
          select: {
            name: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });
  }

  async loadAuthUser(userId: string, organizationId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.isActive) return null;

    const orgUser = await this.findOrgUser(userId, organizationId);
    if (!orgUser) return null;

    return {
      id: user.id,
      organizationId: orgUser.organizationId,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      roleName: orgUser.role.name,
      permissions: orgUser.role.permissions.map((p) => p.permission.key as Permission),
    };
  }

  private async issueTokens(
    userId: string,
    organizationId: string,
    email: string,
    roleId: string,
  ) {
    const basePayload = { sub: userId, organizationId, email, roleId };

    const accessToken = await this.jwtService.signAsync(
      { ...basePayload, type: "access", jti: randomUUID() } satisfies JwtPayload,
      { secret: this.jwtConfig.accessSecret, expiresIn: this.jwtConfig.accessExpiresIn as never },
    );
    const refreshToken = await this.jwtService.signAsync(
      { ...basePayload, type: "refresh", jti: randomUUID() } satisfies JwtPayload,
      { secret: this.jwtConfig.refreshSecret, expiresIn: this.jwtConfig.refreshExpiresIn as never },
    );

    const decoded = this.jwtService.decode<{ exp: number }>(refreshToken);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(decoded.exp * 1000),
      },
    });

    return { accessToken, refreshToken };
  }

  async login(email: string, password: string, ipAddress?: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const orgUser = await this.findOrgUser(user.id);
    if (!orgUser) {
      throw new UnauthorizedException("This account has no organization access");
    }

    const tokens = await this.issueTokens(user.id, orgUser.organizationId, user.email, orgUser.roleId);

    await this.auditLogService.record({
      organizationId: orgUser.organizationId,
      userId: user.id,
      action: "login",
      entityType: "User",
      entityId: user.id,
      ipAddress,
    });

    const authUser = await this.loadAuthUser(user.id, orgUser.organizationId);
    return { user: authUser!, ...tokens };
  }

  async devLogin(ipAddress?: string): Promise<LoginResult> {
    const appEnv = this.configService.get<string>("app.appEnv") ?? "development";
    if (appEnv === "production" || process.env.DEV_AUTH_BYPASS !== "true") {
      throw new ForbiddenException("Development login bypass is disabled");
    }

    const email = process.env.DEV_AUTH_BYPASS_EMAIL ?? "admin@bizovix.com";
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) throw new UnauthorizedException("Development admin is unavailable");
    const orgUser = await this.findOrgUser(user.id);
    if (!orgUser) throw new UnauthorizedException("Development admin has no organization access");

    const tokens = await this.issueTokens(user.id, orgUser.organizationId, user.email, orgUser.roleId);
    await this.auditLogService.record({ organizationId: orgUser.organizationId, userId: user.id, action: "dev_login", entityType: "User", entityId: user.id, ipAddress });
    const authUser = await this.loadAuthUser(user.id, orgUser.organizationId);
    return { user: authUser!, ...tokens };
  }

  async refresh(refreshToken: string): Promise<LoginResult> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.jwtConfig.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (payload.type !== "refresh") {
      throw new UnauthorizedException("Invalid token type");
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const orgUser = await this.findOrgUser(payload.sub, payload.organizationId);
    if (!orgUser) {
      throw new UnauthorizedException("This account has no organization access");
    }

    const tokens = await this.issueTokens(payload.sub, orgUser.organizationId, payload.email, orgUser.roleId);
    const authUser = await this.loadAuthUser(payload.sub, orgUser.organizationId);
    return { user: authUser!, ...tokens };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
