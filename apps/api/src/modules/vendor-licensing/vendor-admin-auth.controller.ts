import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { Public } from "../../common/decorators/public.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { VendorAdminAuthGuard } from "./common/vendor-admin-auth.guard";
import { CurrentVendorAdmin } from "./common/current-vendor-admin.decorator";
import type { VendorAdminAuthUser } from "./common/vendor-admin-jwt.strategy";
import { VendorAdminAuthService } from "./vendor-admin-auth.service";
import { VendorAdminLoginDto } from "./dto/login.dto";

@Public()
@Controller("vendor-admin/auth")
export class VendorAdminAuthController {
  constructor(private readonly authService: VendorAdminAuthService) {}

  @Post("login")
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  @ResponseMessage("Login successful")
  login(@Body() dto: VendorAdminLoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Get("me")
  @UseGuards(VendorAdminAuthGuard)
  me(@CurrentVendorAdmin() admin: VendorAdminAuthUser) {
    return admin;
  }
}
