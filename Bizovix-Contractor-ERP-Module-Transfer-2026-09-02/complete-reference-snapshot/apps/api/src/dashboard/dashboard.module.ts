import { Module } from "@nestjs/common";

import { FeatureGuard } from "../common/guards/feature.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import { SubscriptionGuard } from "../common/guards/subscription.guard.js";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, SubscriptionGuard, FeatureGuard, PermissionGuard],
})
export class DashboardModule {}
