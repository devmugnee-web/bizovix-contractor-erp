import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedRequest, AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { AuthService, type AuthSessionResult } from "./auth.service.js";
import { LoginDto } from "./dto/login.dto.js";
import { SignupDto } from "./dto/signup.dto.js";
import { VerifyEmailDto } from "./dto/verify-email.dto.js";

@Controller("auth")
export class AuthController {
  private readonly authService: AuthService;
  constructor(@Inject(AuthService) authService: AuthService) {
    this.authService = authService;
  }

  @Post("signup")
  async signup(@Body() dto: SignupDto, @Req() request: AuthenticatedRequest) {
    return this.authService.signup(dto, this.buildRequestMetadata(request, dto.email));
  }

  @Post("verify-email")
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.verifyEmail(dto.token, this.buildRequestMetadata(request));
    this.attachSessionCookies(response, result);
    return result.snapshot;
  }

  @Post("login")
  async login(@Body() dto: LoginDto, @Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.login(dto, this.buildRequestMetadata(request, dto.email, dto.deviceId));
    this.attachSessionCookies(response, result);
    return result.snapshot;
  }

  @Post("desktop-session")
  async desktopSession(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    // This issues a real session with no password check at all — safe only because
    // a desktop install's API used to be reachable exclusively from the same
    // machine. The LAN "server mode" feature (desktop/main.cjs, DESKTOP_ALLOW_LAN)
    // widens the API's bind host to every network interface, which would otherwise
    // let anyone on the office network log in as the owner with zero credentials.
    // DESKTOP_SKIP_LOGIN is an explicit, desktop-only, testing-phase override of
    // this same guard (see env.schema.ts) — network reachability is still gated
    // by DESKTOP_ALLOW_LAN's bind-host setting, this only removes the extra
    // "must be this exact machine" check on top of that.
    const result = await this.authService.desktopSession(this.buildRequestMetadata(request));
    this.attachSessionCookies(response, result);
    return result.snapshot;
  }

  @Post("refresh")
  async refresh(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: Response) {
    const result = await this.authService.refresh(request.cookies?.refresh_token);
    this.attachSessionCookies(response, result);
    return result.snapshot;
  }

  @UseGuards(JwtAuthGuard)
  @Post("logout")
  async logout(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(currentUser.sessionId, this.buildRequestMetadata(request));
    response.clearCookie("access_token");
    response.clearCookie("refresh_token");
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  async me(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.authService.getSessionSnapshotForCurrentUser(currentUser);
  }

  private attachSessionCookies(response: Response, result: AuthSessionResult) {
    const baseOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: false,
      path: "/",
    };

    response.cookie("access_token", result.tokens.accessToken, {
      ...baseOptions,
      maxAge: 1000 * 60 * 15,
    });
    response.cookie("refresh_token", result.tokens.refreshToken, {
      ...baseOptions,
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });
  }

  private buildRequestMetadata(request: AuthenticatedRequest, email?: string, deviceId?: string) {
    return {
      email,
      deviceId: deviceId ?? (request.headers["x-device-id"] as string | undefined),
      ipAddress: request.ip ?? null,
      userAgent: (request.headers["user-agent"] as string | undefined) ?? null,
      requestId: request.requestId ?? null,
    };
  }
}
