import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-jwt";

import type { AppEnvironment } from "../config/env.schema.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";

interface AccessTokenPayload {
  sub: string;
  sessionId: string;
  tenantId: string;
}

function extractAccessTokenFromCookie(request: { cookies?: Record<string, string> }) {
  return request.cookies?.access_token ?? null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(ConfigService) configService: ConfigService<AppEnvironment, true>,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractAccessTokenFromCookie,
      ignoreExpiration: false,
      secretOrKey: configService.get("JWT_ACCESS_SECRET", { infer: true }),
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedRequestUser> {
    const session = await this.prisma.userSession.findUnique({
      where: {
        id: payload.sessionId,
      },
      include: {
        user: true,
      },
    });

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw new UnauthorizedException("Session expired");
    }

    return {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      initials: session.user.initials,
      tenantId: session.tenantId,
      organizationId: session.organizationId,
      companyId: session.companyId,
      workspaceId: session.workspaceId,
      sessionId: session.id,
    };
  }
}
