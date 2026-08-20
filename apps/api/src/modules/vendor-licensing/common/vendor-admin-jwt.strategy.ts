import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { AppConfig } from "../../../config/configuration";
import { VendorAdminAuthService } from "../vendor-admin-auth.service";

export interface VendorAdminJwtPayload {
  sub: string;
  email: string;
  type: "vendor-admin";
}

export interface VendorAdminAuthUser {
  id: string;
  email: string;
  name: string;
}

@Injectable()
export class VendorAdminJwtStrategy extends PassportStrategy(Strategy, "vendor-admin-jwt") {
  constructor(
    private readonly configService: ConfigService,
    private readonly vendorAdminAuthService: VendorAdminAuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<AppConfig["vendorAdminJwt"]>("app.vendorAdminJwt")!.secret,
    });
  }

  async validate(payload: VendorAdminJwtPayload): Promise<VendorAdminAuthUser> {
    if (payload.type !== "vendor-admin") {
      throw new UnauthorizedException("Invalid token type");
    }

    const admin = await this.vendorAdminAuthService.loadActiveAdmin(payload.sub);
    if (!admin) {
      throw new UnauthorizedException("Admin account is no longer active");
    }

    return admin;
  }
}
