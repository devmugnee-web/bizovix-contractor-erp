import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { AuthService } from "../auth/auth.service.js";
import { SelectBusinessCategoryDto } from "./dto/select-business-category.dto.js";
import { OnboardingService } from "./onboarding.service.js";

@UseGuards(JwtAuthGuard)
@Controller("onboarding")
export class OnboardingController {
  constructor(
    @Inject(OnboardingService) private readonly onboardingService: OnboardingService,
    @Inject(AuthService) private readonly authService: AuthService,
  ) {}

  @Get("state")
  async getState(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.onboardingService.getState(currentUser);
  }

  @Post("business-category")
  async selectBusinessCategory(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Body() dto: SelectBusinessCategoryDto,
  ) {
    await this.onboardingService.completeBusinessCategory(currentUser, dto.businessCategoryCode);
    return this.authService.getSessionSnapshotForCurrentUser(currentUser);
  }
}
