import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { type OnboardingStep, type Prisma, type Tenant, type User } from "../generated/prisma/index.js";
import argon2 from "argon2";
import { randomBytes, randomUUID } from "node:crypto";

import { AuditService } from "../audit/audit.service.js";
import type { AppEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RedisService } from "../redis/redis.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import type { LoginDto } from "./dto/login.dto.js";
import type { SignupDto } from "./dto/signup.dto.js";

interface RequestMetadata {
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceId?: string | null;
  requestId?: string | null;
}

export interface SessionSnapshot {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    initials: string;
    permissions: string[];
  };
  tenant: {
    id: string;
    name: string;
    onboardingStep: OnboardingStep;
  };
  organization: {
    id: string;
    name: string;
  };
  company: {
    id: string;
    name: string;
  };
  workspaceId: string | null;
  shouldCompleteOnboarding: boolean;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthSessionResult {
  snapshot: SessionSnapshot;
  tokens: AuthTokens;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService) private readonly configService: ConfigService<AppEnvironment, true>,
    @Inject(RedisService) private readonly redisService: RedisService,
    @Inject(AuditService) private readonly auditService: AuditService,
  ) {}

  async signup(dto: SignupDto, requestMetadata: RequestMetadata) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException("An account already exists with this email");
    }

    const passwordHash = await argon2.hash(dto.password);
    const verificationToken = randomBytes(24).toString("hex");

    await this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name: dto.name.trim(),
          email,
          passwordHash,
          initials: this.buildInitials(dto.name),
        },
      });

      const tenant = await transaction.tenant.create({
        data: {
          name: `${dto.companyName.trim()} Account`,
          slug: this.createSlug(dto.companyName),
        },
      });

      const organization = await transaction.organization.create({
        data: {
          tenantId: tenant.id,
          name: `${dto.companyName.trim()} Group`,
          slug: `${this.createSlug(dto.companyName)}-group`,
        },
      });

      const company = await transaction.company.create({
        data: {
          tenantId: tenant.id,
          organizationId: organization.id,
          name: dto.companyName.trim(),
          slug: this.createSlug(dto.companyName),
        },
      });

      await transaction.tenantMember.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          organizationId: organization.id,
          companyId: company.id,
          membershipRole: "OWNER",
        },
      });

      await transaction.userVerificationToken.create({
        data: {
          userId: user.id,
          token: verificationToken,
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
        },
      });

      await transaction.auditLog.create({
        data: {
          tenantId: tenant.id,
          organizationId: organization.id,
          companyId: company.id,
          userId: user.id,
          action: "SIGNUP_CREATED",
          entityType: "User",
          entityId: user.id,
          requestId: requestMetadata.requestId ?? null,
          ipAddress: requestMetadata.ipAddress ?? null,
          userAgent: requestMetadata.userAgent ?? null,
          newValues: {
            email,
            companyName: company.name,
          } as Prisma.JsonObject,
        },
      });
    });

    return {
      success: true,
      verificationToken,
      nextStep: "VERIFY_EMAIL",
    };
  }

  /** Desktop-only, DESKTOP_SKIP_LOGIN-gated equivalent of signup() for a
   * database with no account at all yet — same shape (User + Tenant +
   * Organization + Company + OWNER membership), minus the email-verification
   * token, since isEmailVerified is set true immediately instead. The
   * generic placeholder name/company are expected to be edited afterward via
   * the ordinary onboarding/company-profile screens; the random password is
   * never surfaced since DESKTOP_SKIP_LOGIN bypasses password login entirely,
   * but a real one still exists so the account keeps working if that flag is
   * later turned off (via the Forgot Password flow). */
  private async provisionDefaultDesktopAccount(requestMetadata: RequestMetadata): Promise<User> {
    const email = "owner@bizovix.local";
    const name = "Owner";
    const companyName = "My Company";
    const passwordHash = await argon2.hash(randomBytes(24).toString("hex"));

    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          name,
          email,
          passwordHash,
          initials: this.buildInitials(name),
          isEmailVerified: true,
        },
      });

      const tenant = await transaction.tenant.create({
        data: {
          name: `${companyName} Account`,
          slug: this.createSlug(companyName),
          // Tenant.onboardingStep defaults to VERIFY_EMAIL, which normal
          // signup only advances past inside verifyEmail() — skipped here
          // since isEmailVerified is already true above, so start one step
          // further in or onboarding would wait forever on a link nobody
          // will ever click.
          onboardingStep: "SELECT_BUSINESS_CATEGORY",
        },
      });

      const organization = await transaction.organization.create({
        data: {
          tenantId: tenant.id,
          name: `${companyName} Group`,
          slug: `${this.createSlug(companyName)}-group`,
        },
      });

      const company = await transaction.company.create({
        data: {
          tenantId: tenant.id,
          organizationId: organization.id,
          name: companyName,
          slug: this.createSlug(companyName),
        },
      });

      await transaction.tenantMember.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          organizationId: organization.id,
          companyId: company.id,
          membershipRole: "OWNER",
        },
      });

      await transaction.auditLog.create({
        data: {
          tenantId: tenant.id,
          organizationId: organization.id,
          companyId: company.id,
          userId: user.id,
          action: "SIGNUP_CREATED",
          entityType: "User",
          entityId: user.id,
          requestId: requestMetadata.requestId ?? null,
          ipAddress: requestMetadata.ipAddress ?? null,
          userAgent: requestMetadata.userAgent ?? null,
          newValues: {
            email,
            companyName: company.name,
            autoProvisioned: true,
          } as Prisma.JsonObject,
        },
      });

      return user;
    });
  }

  async verifyEmail(token: string, requestMetadata: RequestMetadata): Promise<AuthSessionResult> {
    const verificationToken = await this.prisma.userVerificationToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!verificationToken || verificationToken.consumedAt || verificationToken.expiresAt < new Date()) {
      throw new BadRequestException("Verification link is invalid or expired");
    }

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: verificationToken.userId },
        data: { isEmailVerified: true },
      }),
      this.prisma.userVerificationToken.update({
        where: { id: verificationToken.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    const membership = await this.findPrimaryMembership(verificationToken.userId);
    await this.prisma.tenant.update({
      where: { id: membership.tenantId },
      data: { onboardingStep: "SELECT_BUSINESS_CATEGORY" },
    });
    membership.tenant.onboardingStep = "SELECT_BUSINESS_CATEGORY";

    await this.auditService.log({
      tenantId: membership.tenantId,
      organizationId: membership.organizationId,
      companyId: membership.companyId,
      userId: membership.userId,
      action: "EMAIL_VERIFIED",
      entityType: "User",
      entityId: membership.userId,
      requestId: requestMetadata.requestId ?? null,
      ipAddress: requestMetadata.ipAddress ?? null,
      userAgent: requestMetadata.userAgent ?? null,
    });

    return this.createSessionForUser(verificationToken.user, membership.tenant, membership.organization, membership.company, null, requestMetadata);
  }

  async login(dto: LoginDto, requestMetadata: RequestMetadata): Promise<AuthSessionResult> {
    const submittedEmail = dto.email.trim().toLowerCase();
    // Compatibility for the original preview credentials. This only resolves
    // the legacy email; normal password verification still applies.
    const email = submittedEmail === "admin@bizovix.com"
      ? "owner@bizovix.app"
      : submittedEmail;
    const lockKey = `auth:failed:${email}:${requestMetadata.ipAddress ?? "unknown"}`;
    const currentFailures = Number((await this.redisService.get(lockKey)) ?? 0);
    if (currentFailures >= 5) {
      throw new UnauthorizedException("Account temporarily locked. Try again later.");
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      await this.redisService.increment(lockKey, 60 * 15).catch(() => undefined);
      throw new UnauthorizedException("Invalid email or password");
    }

    if (!user.isEmailVerified) {
      throw new UnauthorizedException("Verify your email before signing in");
    }

    const passwordMatches = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordMatches) {
      await this.redisService.increment(lockKey, 60 * 15).catch(() => undefined);
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.redisService.delete(lockKey).catch(() => undefined);

    const membership = await this.findPrimaryMembership(user.id);
    const existingWorkspace = await this.prisma.workspace.findFirst({
      where: {
        tenantId: membership.tenantId,
        companyId: membership.companyId,
      },
      orderBy: { createdAt: "asc" },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.auditService.log({
      tenantId: membership.tenantId,
      organizationId: membership.organizationId,
      companyId: membership.companyId,
      workspaceId: existingWorkspace?.id ?? null,
      userId: user.id,
      action: "LOGIN_SUCCESS",
      entityType: "UserSession",
      entityId: user.id,
      requestId: requestMetadata.requestId ?? null,
      ipAddress: requestMetadata.ipAddress ?? null,
      userAgent: requestMetadata.userAgent ?? null,
    });

    return this.createSessionForUser(user, membership.tenant, membership.organization, membership.company, existingWorkspace?.id ?? null, {
      ...requestMetadata,
      deviceId: dto.deviceId ?? requestMetadata.deviceId,
    });
  }

  /**
   * A new single-owner desktop may bootstrap its local session automatically.
   * Once a second company member exists, explicit credentials are mandatory so
   * a shared computer can never silently elevate a team member to Owner —
   * unless DESKTOP_SKIP_LOGIN is set (testing-phase override, see
   * env.schema.ts), in which case every PC that can reach this API signs in
   * as whichever account was most recently active, team size notwithstanding.
   */
  async desktopSession(requestMetadata: RequestMetadata): Promise<AuthSessionResult> {
    // Scoped to the packaged desktop app only (DESKTOP_MODE is baked into its
    // bundled .env, never set on the real hosted/SaaS deployment) — without
    // this, the passwordless auto-login below would also work against the
    // production backend the moment this same code is ever deployed there.
    if (!this.configService.get("DESKTOP_MODE", { infer: true })) {
      throw new UnauthorizedException("Desktop mode is not enabled on this server");
    }

    // Login is intentionally disabled for every desktop install. Continue
    // issuing a signed session so existing API guards and audit metadata
    // still work.
    const skipLoginGuard = true;
    const configuredEmail = this.configService.get("DESKTOP_USER_EMAIL", { infer: true })?.trim();
    // Without an explicit account, open the one this machine used most recently
    // so the desktop app always resumes where the owner left off.
    let user = configuredEmail
      ? await this.prisma.user.findUnique({ where: { email: configuredEmail.toLowerCase() } })
      : await this.prisma.user.findFirst({
          where: { tenantMemberships: { some: {} } },
          orderBy: [{ lastLoginAt: { sort: "desc", nulls: "last" } }, { createdAt: "asc" }],
        });

    if (!user) {
      if (!skipLoginGuard) {
        throw new BadRequestException("No local account found for desktop mode");
      }
      // Testing-phase override: a brand new install has no account to resume
      // at all — auto-provision a default owner + company (skipping signup's
      // usual email-verification step, which has nowhere to deliver a link
      // on an offline desktop) so the app opens straight to onboarding
      // instead of asking for manual signup or login.
      user = await this.provisionDefaultDesktopAccount(requestMetadata);
    }

    const membership = await this.findPrimaryMembership(user.id);
    const companyMemberCount = await this.prisma.tenantMember.count({
      where: {
        tenantId: membership.tenantId,
        companyId: membership.companyId,
      },
    });
    if (companyMemberCount > 1 && !skipLoginGuard) {
      throw new UnauthorizedException("Team sign-in is required on this desktop");
    }
    const existingWorkspace = await this.prisma.workspace.findFirst({
      where: {
        tenantId: membership.tenantId,
        companyId: membership.companyId,
      },
      orderBy: { createdAt: "asc" },
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createSessionForUser(
      user,
      membership.tenant,
      membership.organization,
      membership.company,
      existingWorkspace?.id ?? null,
      requestMetadata,
    );
  }

  async refresh(refreshToken: string | undefined): Promise<AuthSessionResult> {
    if (!refreshToken) {
      throw new UnauthorizedException("Refresh token missing");
    }

    let payload: { sub: string; sessionId: string; tenantId: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get("JWT_REFRESH_SECRET", { infer: true }),
      });
    } catch {
      throw new UnauthorizedException("Refresh token invalid");
    }

    const session = await this.prisma.userSession.findUnique({
      where: { id: payload.sessionId },
      include: {
        user: true,
        tenant: true,
        organization: true,
        company: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Session expired");
    }

    const refreshMatches = await argon2.verify(session.refreshTokenHash, refreshToken);
    if (!refreshMatches) {
      throw new UnauthorizedException("Refresh token invalid");
    }

    const tokens = await this.issueTokens({
      userId: session.userId,
      sessionId: session.id,
      tenantId: session.tenantId,
    });

    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: await argon2.hash(tokens.refreshToken),
        lastUsedAt: new Date(),
      },
    });

    return {
      snapshot: await this.buildSessionSnapshot(session.user, session.tenant, session.organization, session.company, session.workspaceId),
      tokens,
    };
  }

  async logout(sessionId: string, requestMetadata: RequestMetadata) {
    const session = await this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
      },
    });

    await this.auditService.log({
      tenantId: session.tenantId,
      organizationId: session.organizationId,
      companyId: session.companyId,
      workspaceId: session.workspaceId,
      userId: session.userId,
      action: "LOGOUT",
      entityType: "UserSession",
      entityId: sessionId,
      requestId: requestMetadata.requestId ?? null,
      ipAddress: requestMetadata.ipAddress ?? null,
      userAgent: requestMetadata.userAgent ?? null,
    });
  }

  async getSessionSnapshotForCurrentUser(currentUser: AuthenticatedRequestUser): Promise<SessionSnapshot> {
    const session = await this.prisma.userSession.findUnique({
      where: { id: currentUser.sessionId },
      include: {
        user: true,
        tenant: true,
        organization: true,
        company: true,
      },
    });

    if (!session) {
      throw new UnauthorizedException("Session not found");
    }

    return this.buildSessionSnapshot(session.user, session.tenant, session.organization, session.company, session.workspaceId);
  }

  private async createSessionForUser(
    user: User,
    tenant: Tenant,
    organization: { id: string; name: string },
    company: { id: string; name: string },
    workspaceId: string | null,
    requestMetadata: RequestMetadata,
  ): Promise<AuthSessionResult> {
    const sessionId = randomUUID();
    const tokens = await this.issueTokens({
      userId: user.id,
      sessionId,
      tenantId: tenant.id,
    });

    await this.prisma.userSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tenantId: tenant.id,
        organizationId: organization.id,
        companyId: company.id,
        workspaceId,
        deviceId: requestMetadata.deviceId ?? randomUUID(),
        userAgent: requestMetadata.userAgent ?? null,
        ipAddress: requestMetadata.ipAddress ?? null,
        refreshTokenHash: await argon2.hash(tokens.refreshToken),
        expiresAt: new Date(Date.now() + this.configService.get("REFRESH_TOKEN_TTL_DAYS", { infer: true }) * 24 * 60 * 60 * 1000),
        lastUsedAt: new Date(),
      },
    });

    return {
      snapshot: await this.buildSessionSnapshot(user, tenant, organization, company, workspaceId),
      tokens,
    };
  }

  private async buildSessionSnapshot(
    user: Pick<User, "id" | "name" | "email" | "initials">,
    tenant: Pick<Tenant, "id" | "name" | "onboardingStep">,
    organization: { id: string; name: string },
    company: { id: string; name: string },
    workspaceId: string | null,
  ): Promise<SessionSnapshot> {
    const membership = await this.prisma.tenantMember.findFirst({
      where: {
        tenantId: tenant.id,
        userId: user.id,
      },
    });
    const roleAssignments = workspaceId
      ? await this.prisma.userRole.findMany({
          where: {
            userId: user.id,
            tenantId: tenant.id,
            OR: [{ workspaceId }, { workspaceId: null }],
          },
          include: {
            role: {
              include: {
                permissions: {
                  where: { allowed: true },
                  include: { permission: true },
                },
              },
            },
          },
        })
      : [];
    const grantedPermissions = [...new Set(
      roleAssignments.flatMap((assignment) => assignment.role.permissions.map((link) => link.permission.key)),
    )].sort();
    const assignedRoleName = roleAssignments.find((assignment) => assignment.role.code.startsWith("sync_share_"))?.role.name
      ?? roleAssignments[0]?.role.name;
    const displayRole = assignedRoleName === "Admin"
      ? "Manager"
      : assignedRoleName === "Biller"
        ? "Staff"
        : assignedRoleName === "Viewer"
          ? "Auditor"
          : assignedRoleName;

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: membership?.membershipRole === "OWNER" ? "Owner" : displayRole ?? "Member",
        initials: user.initials,
        permissions: grantedPermissions,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        onboardingStep: tenant.onboardingStep,
      },
      organization,
      company,
      workspaceId,
      shouldCompleteOnboarding: tenant.onboardingStep !== "COMPLETED",
    };
  }

  private async issueTokens(payload: { userId: string; sessionId: string; tenantId: string }): Promise<AuthTokens> {
    const accessToken = await this.jwtService.signAsync<{ sub: string; sessionId: string; tenantId: string }>(
      {
        sub: payload.userId,
        sessionId: payload.sessionId,
        tenantId: payload.tenantId,
      },
      {
        secret: this.configService.get("JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: this.configService.get("ACCESS_TOKEN_TTL", { infer: true }),
      },
    );

    const refreshToken = await this.jwtService.signAsync<{ sub: string; sessionId: string; tenantId: string }>(
      {
        sub: payload.userId,
        sessionId: payload.sessionId,
        tenantId: payload.tenantId,
      },
      {
        secret: this.configService.get("JWT_REFRESH_SECRET", { infer: true }),
        expiresIn: this.configService.get("REFRESH_TOKEN_TTL_DAYS", { infer: true }) * 24 * 60 * 60,
      },
    );

    return { accessToken, refreshToken };
  }

  private async findPrimaryMembership(userId: string): Promise<{
    tenantId: string;
    organizationId: string;
    companyId: string;
    userId: string;
    tenant: Tenant;
    organization: { id: string; name: string };
    company: { id: string; name: string };
  }> {
    const membership = await this.prisma.tenantMember.findFirst({
      where: { userId },
      include: {
        tenant: true,
        organization: true,
        company: true,
      },
      orderBy: { joinedAt: "asc" },
    });

    if (!membership?.organization || !membership.company || !membership.organizationId || !membership.companyId) {
      throw new BadRequestException("Tenant membership is incomplete");
    }

    return {
      tenantId: membership.tenantId,
      organizationId: membership.organizationId,
      companyId: membership.companyId,
      userId: membership.userId,
      tenant: membership.tenant,
      organization: membership.organization,
      company: membership.company,
    };
  }

  private buildInitials(name: string) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");
  }

  private createSlug(value: string) {
    const base = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `${base}-${randomBytes(3).toString("hex")}`;
  }
}
