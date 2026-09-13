import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { DashboardService } from "./dashboard.service";
import { DashboardQueryDto } from "./dto/dashboard-query.dto";
import { SetMonthlyTargetDto } from "./dto/set-monthly-target.dto";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @RequirePermissions("dashboard.view")
  getDashboard(@CurrentUser() user: AuthUser, @Query() query: DashboardQueryDto) {
    return this.dashboardService.getDashboard(user.organizationId, query);
  }

  @Put("target")
  @RequirePermissions("settings.manage")
  setMonthlyTarget(@CurrentUser() user: AuthUser, @Body() dto: SetMonthlyTargetDto) {
    return this.dashboardService.setMonthlyTarget(user.organizationId, user.id, dto);
  }
}
