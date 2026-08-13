import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AuthUser, JwtPayload, Permission } from "@bizovix/types";
import type { AppConfig } from "../../../config/configuration";
import { AuthService } from "../auth.service";

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, "jwt-access") {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<AppConfig["jwt"]>("app.jwt")!.accessSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (payload.type !== "access") {
      throw new UnauthorizedException("Invalid token type");
    }

    const user = await this.authService.loadAuthUser(payload.sub, payload.organizationId);
    if (!user) {
      throw new UnauthorizedException("User is no longer active");
    }

    return user as unknown as AuthUser & { permissions: Permission[] };
  }
}
