import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import {
  ApproveManufacturingStandardCostDto,
  CreateManufacturingCostDriverDto,
  CreateManufacturingStandardCostDto,
  FinalizeManufacturingActualCostDto,
  PostManufacturingActualCostDto,
  UpdateManufacturingCostDriverDto,
} from "./manufacturing-cost-report.dto.js";
import { ManufacturingCostReportService } from "./manufacturing-cost-report.service.js";

type CostReportQuery = Record<string, string | undefined>;

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/cost-reports")
export class ManufacturingCostReportController {
  constructor(
    @Inject(ManufacturingCostReportService)
    private readonly costing: ManufacturingCostReportService,
  ) {}

  @Get("configuration")
  @RequirePermission("manufacturing.view")
  configuration(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.costing.getConfiguration(user, workspaceId);
  }

  @Get("drivers")
  @RequirePermission("manufacturing.view")
  listDrivers(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: CostReportQuery,
  ) {
    return this.costing.listDrivers(user, query);
  }

  @Post("drivers")
  @RequirePermission("manufacturing.configure")
  createDriver(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingCostDriverDto,
  ) {
    return this.costing.createDriver(user, dto);
  }

  @Put("drivers/:driverId")
  @RequirePermission("manufacturing.configure")
  updateDriver(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("driverId") driverId: string,
    @Body() dto: UpdateManufacturingCostDriverDto,
  ) {
    return this.costing.updateDriver(user, driverId, dto);
  }

  @Get("standard-costs")
  @RequirePermission("manufacturing.view")
  listStandardCosts(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: CostReportQuery,
  ) {
    return this.costing.listStandardCosts(user, query);
  }

  @Post("standard-costs")
  @RequirePermission("manufacturing.cost.post")
  createStandardCost(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingStandardCostDto,
  ) {
    return this.costing.createStandardCost(user, dto);
  }

  @Post("standard-costs/:versionId/approve")
  @RequirePermission("manufacturing.cost.post")
  approveStandardCost(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("versionId") versionId: string,
    @Body() dto: ApproveManufacturingStandardCostDto,
  ) {
    return this.costing.approveStandardCost(user, versionId, dto);
  }

  @Get("orders/:orderId")
  @RequirePermission("manufacturing.view")
  orderCosting(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("orderId") orderId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.costing.getOrderCosting(user, orderId, workspaceId);
  }

  @Post("orders/:orderId/actuals")
  @RequirePermission("manufacturing.cost.post")
  postActualCost(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("orderId") orderId: string,
    @Body() dto: PostManufacturingActualCostDto,
  ) {
    return this.costing.postActualCost(user, orderId, dto);
  }

  @Post("orders/:orderId/finalize")
  @RequirePermission("manufacturing.cost.post")
  finalizeActualCost(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("orderId") orderId: string,
    @Body() dto: FinalizeManufacturingActualCostDto,
  ) {
    return this.costing.finalizeActualCost(user, orderId, dto);
  }

  @Get("reports/:report")
  @RequirePermission("manufacturing.reports.view")
  report(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("report") report: string,
    @Query() query: CostReportQuery,
  ) {
    return this.costing.getReport(user, report, query);
  }
}
