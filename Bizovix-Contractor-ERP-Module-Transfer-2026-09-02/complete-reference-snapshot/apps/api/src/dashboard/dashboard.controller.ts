import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequireActiveSubscription } from "../common/decorators/require-active-subscription.decorator.js";
import { RequireFeature } from "../common/decorators/require-feature.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { FeatureGuard } from "../common/guards/feature.guard.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import { SubscriptionGuard } from "../common/guards/subscription.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { DashboardService } from "./dashboard.service.js";

@UseGuards(JwtAuthGuard, SubscriptionGuard, FeatureGuard, PermissionGuard)
@Controller("dashboard")
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @RequireActiveSubscription()
  @RequireFeature("dashboard.access")
  @RequirePermission("dashboard.view")
  @Get()
  async getDashboard(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.dashboardService.getForCurrentUser(currentUser, workspaceId);
  }
}
