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
  CalculateManufacturingMrpDto,
  CancelManufacturingSupplySuggestionDto,
  ConvertManufacturingSupplySuggestionDto,
  CreateManufacturingItemProfileDto,
  CreateManufacturingLocationDto,
  CreateManufacturingPlanDto,
  CreateManufacturingRoutingDto,
  CreateManufacturingRoutingVersionDto,
  CreateManufacturingSupplySuggestionDto,
  ManufacturingPlanningApprovalDto,
  UpdateManufacturingItemProfileDto,
  UpdateManufacturingLocationDto,
} from "./manufacturing-planning.dto.js";
import { ManufacturingPlanningService } from "./manufacturing-planning.service.js";

type PlanningQuery = Record<string, string | undefined>;

/**
 * Planning/master endpoints live beside the existing manufacturing controller.
 * They deliberately use the same `/manufacturing` prefix so the UI has one
 * manufacturing API surface while each controller remains small and explicit.
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing")
export class ManufacturingPlanningController {
  constructor(
    @Inject(ManufacturingPlanningService)
    private readonly planning: ManufacturingPlanningService,
  ) {}

  @Get("item-profiles")
  @RequirePermission("manufacturing.view")
  listItemProfiles(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PlanningQuery,
  ) {
    return this.planning.listItemProfiles(user, query);
  }

  @Post("item-profiles")
  @RequirePermission("manufacturing.master.manage")
  createItemProfile(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingItemProfileDto,
  ) {
    return this.planning.createItemProfile(user, dto);
  }

  @Put("item-profiles/:profileId")
  @RequirePermission("manufacturing.master.manage")
  updateItemProfile(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("profileId") profileId: string,
    @Body() dto: UpdateManufacturingItemProfileDto,
  ) {
    return this.planning.updateItemProfile(user, profileId, dto);
  }

  @Get("locations")
  @RequirePermission("manufacturing.view")
  listLocations(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PlanningQuery,
  ) {
    return this.planning.listLocations(user, query);
  }

  @Post("locations")
  @RequirePermission("manufacturing.master.manage")
  createLocation(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingLocationDto,
  ) {
    return this.planning.createLocation(user, dto);
  }

  @Put("locations/:locationId")
  @RequirePermission("manufacturing.master.manage")
  updateLocation(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("locationId") locationId: string,
    @Body() dto: UpdateManufacturingLocationDto,
  ) {
    return this.planning.updateLocation(user, locationId, dto);
  }

  @Get("routings")
  @RequirePermission("manufacturing.view")
  listRoutings(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PlanningQuery,
  ) {
    return this.planning.listRoutings(user, query);
  }

  @Get("routing-assignees")
  @RequirePermission("manufacturing.view")
  listRoutingAssignees(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PlanningQuery,
  ) {
    return this.planning.listRoutingAssignees(user, query);
  }

  @Get("run-preflight")
  @RequirePermission("manufacturing.view")
  runPreflight(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PlanningQuery,
  ) {
    return this.planning.runPreflight(user, query);
  }

  @Post("routings")
  @RequirePermission("manufacturing.master.manage")
  createRouting(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingRoutingDto,
  ) {
    return this.planning.createRouting(user, dto);
  }

  @Post("routings/:routingId/versions")
  @RequirePermission("manufacturing.master.manage")
  createRoutingVersion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("routingId") routingId: string,
    @Body() dto: CreateManufacturingRoutingVersionDto,
  ) {
    return this.planning.createRoutingVersion(user, routingId, dto);
  }

  @Post("routing-versions/:versionId/approve")
  @RequirePermission("manufacturing.view")
  approveRoutingVersion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("versionId") versionId: string,
    @Body() dto: ManufacturingPlanningApprovalDto,
  ) {
    return this.planning.approveRoutingVersion(user, versionId, dto);
  }

  @Get("plans")
  @RequirePermission("manufacturing.view")
  listPlans(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PlanningQuery,
  ) {
    return this.planning.listPlans(user, query);
  }

  @Post("plans")
  @RequirePermission("manufacturing.plan.manage")
  createPlan(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingPlanDto,
  ) {
    return this.planning.createPlan(user, dto);
  }

  @Post("plans/:planId/approve")
  @RequirePermission("manufacturing.view")
  approvePlan(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("planId") planId: string,
    @Body() dto: ManufacturingPlanningApprovalDto,
  ) {
    return this.planning.approvePlan(user, planId, dto);
  }

  @Get("mrp-runs")
  @RequirePermission("manufacturing.view")
  listMrpRuns(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PlanningQuery,
  ) {
    return this.planning.listMrpRuns(user, query);
  }

  @Get("mrp-runs/:runId")
  @RequirePermission("manufacturing.view")
  getMrpRun(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("runId") runId: string,
  ) {
    return this.planning.getMrpRun(user, runId);
  }

  @Post("mrp-runs/calculate")
  @RequirePermission("manufacturing.plan.manage")
  calculateMrp(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CalculateManufacturingMrpDto,
  ) {
    return this.planning.calculateMrp(user, dto);
  }

  @Get("supply-suggestions")
  @RequirePermission("manufacturing.view")
  listSupplySuggestions(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PlanningQuery,
  ) {
    return this.planning.listSupplySuggestions(user, query);
  }

  @Post("supply-suggestions")
  @RequirePermission("manufacturing.plan.manage")
  createSupplySuggestion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingSupplySuggestionDto,
  ) {
    return this.planning.createSupplySuggestion(user, dto);
  }

  @Post("supply-suggestions/:suggestionId/approve")
  @RequirePermission("manufacturing.plan.manage")
  approveSupplySuggestion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("suggestionId") suggestionId: string,
    @Body() dto: ManufacturingPlanningApprovalDto,
  ) {
    return this.planning.approveSupplySuggestion(user, suggestionId, dto);
  }

  @Post("supply-suggestions/:suggestionId/convert")
  @RequirePermission("manufacturing.plan.manage")
  convertSupplySuggestion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("suggestionId") suggestionId: string,
    @Body() dto: ConvertManufacturingSupplySuggestionDto,
  ) {
    return this.planning.convertSupplySuggestion(user, suggestionId, dto);
  }

  @Post("supply-suggestions/:suggestionId/cancel")
  @RequirePermission("manufacturing.plan.manage")
  cancelSupplySuggestion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("suggestionId") suggestionId: string,
    @Body() dto: CancelManufacturingSupplySuggestionDto,
  ) {
    return this.planning.cancelSupplySuggestion(user, suggestionId, dto);
  }
}
