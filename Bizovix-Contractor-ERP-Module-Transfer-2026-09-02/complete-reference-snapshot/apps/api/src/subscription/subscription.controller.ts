import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { RequestUpgradeDto } from "./dto/request-upgrade.dto.js";
import { SubscriptionService } from "./subscription.service.js";

@UseGuards(JwtAuthGuard)
@Controller("subscriptions")
export class SubscriptionController {
  constructor(@Inject(SubscriptionService) private readonly subscriptionService: SubscriptionService) {}

  @Get("current")
  async current(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.subscriptionService.getCurrent(currentUser);
  }

  @Post("upgrade-requests")
  async requestUpgrade(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Body() dto: RequestUpgradeDto,
  ) {
    return this.subscriptionService.requestUpgrade(currentUser, dto.planCode, dto.note);
  }
}
