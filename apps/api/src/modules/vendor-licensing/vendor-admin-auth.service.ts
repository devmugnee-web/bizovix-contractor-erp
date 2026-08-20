import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import type { AppConfig } from "../../config/configuration";
import { PrismaService } from "../prisma/prisma.service";
import type { VendorAdminAuthUser, VendorAdminJwtPayload } from "./common/vendor-admin-jwt.strategy";

@Injectable()
export class VendorAdminAuthService {
  private readonly jwtConfig: AppConfig["vendorAdminJwt"];

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.jwtConfig = this.configService.get<AppConfig["vendorAdminJwt"]>("app.vendorAdminJwt")!;
  }

  async loadActiveAdmin(id: string): Promise<VendorAdminAuthUser | null> {
    const admin = await this.prisma.vendorAdminUser.findUnique({ where: { id } });
    if (!admin || !admin.isActive) return null;
    return { id: admin.id, email: admin.email, name: admin.name };
  }

  async login(email: string, password: string) {
    const admin = await this.prisma.vendorAdminUser.findUnique({ where: { email } });
    if (!admin || !admin.isActive) {
      throw new UnauthorizedException("Invalid email or password");
    }

    const passwordMatches = await bcrypt.compare(password, admin.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException("Invalid email or password");
    }

    await this.prisma.vendorAdminUser.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });

    const accessToken = await this.jwtService.signAsync(
      { sub: admin.id, email: admin.email, type: "vendor-admin" } satisfies VendorAdminJwtPayload,
      { secret: this.jwtConfig.secret, expiresIn: this.jwtConfig.expiresIn as never },
    );

    return {
      admin: { id: admin.id, email: admin.email, name: admin.name },
      accessToken,
    };
  }
}
