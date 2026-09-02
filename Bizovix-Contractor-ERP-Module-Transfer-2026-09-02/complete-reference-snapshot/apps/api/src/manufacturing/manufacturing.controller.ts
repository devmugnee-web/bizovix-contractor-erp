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
  ApproveManufacturingVersionDto,
  CreateManufacturingBomDto,
  CreateManufacturingBomVersionDto,
  CreateManufacturingOrderDto,
  CreateManufacturingWorkflowReviewDto,
  ManufacturingOrderActionDto,
  TransitionManufacturingWorkflowReviewDto,
  UpdateManufacturingSettingsDto,
} from "./manufacturing.dto.js";
import { ManufacturingService } from "./manufacturing.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing")
export class ManufacturingController {
  constructor(
    @Inject(ManufacturingService)
    private readonly manufacturing: ManufacturingService,
  ) {}

  @Get("readiness")
  @RequirePermission("manufacturing.view")
  readiness(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.manufacturing.getReadiness(user, workspaceId);
  }

  @Get("dashboard")
  @RequirePermission("manufacturing.view")
  dashboard(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.manufacturing.getDashboard(user, workspaceId);
  }

  @Get("settings")
  @RequirePermission("manufacturing.view")
  settings(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.manufacturing.getSettings(user, workspaceId);
  }

  @Put("settings")
  @RequirePermission("manufacturing.configure")
  updateSettings(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: UpdateManufacturingSettingsDto,
  ) {
    return this.manufacturing.updateSettings(user, dto);
  }

  @Get("availability")
  @RequirePermission("manufacturing.view")
  availability(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.manufacturing.getAvailability(user, query);
  }

  @Get("boms")
  @RequirePermission("manufacturing.view")
  listBoms(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.manufacturing.listBoms(user, query);
  }

  @Post("boms")
  @RequirePermission("manufacturing.master.manage")
  createBom(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingBomDto,
  ) {
    return this.manufacturing.createBom(user, dto);
  }

  @Post("boms/:bomId/versions")
  @RequirePermission("manufacturing.master.manage")
  createBomVersion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("bomId") bomId: string,
    @Body() dto: CreateManufacturingBomVersionDto,
  ) {
    return this.manufacturing.createBomVersion(user, bomId, dto);
  }

  @Post("bom-versions/:versionId/approve")
  @RequirePermission("manufacturing.view")
  approveBomVersion(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("versionId") versionId: string,
    @Body() dto: ApproveManufacturingVersionDto,
  ) {
    return this.manufacturing.approveBomVersion(user, versionId, dto);
  }

  @Get("orders")
  @RequirePermission("manufacturing.view")
  listOrders(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.manufacturing.listOrders(user, query);
  }

  @Post("orders")
  @RequirePermission("manufacturing.order.create")
  createOrder(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingOrderDto,
  ) {
    return this.manufacturing.createOrder(user, dto);
  }

  @Get("orders/:orderId")
  @RequirePermission("manufacturing.view")
  getOrder(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("orderId") orderId: string,
  ) {
    return this.manufacturing.getOrder(user, orderId);
  }

  @Get("orders/:orderId/quality-specification")
  @RequirePermission("manufacturing.view")
  getOrderQualitySpecification(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("orderId") orderId: string,
    @Query("transactionDate") transactionDate?: string,
  ) {
    return this.manufacturing.getOrderQualitySpecification(
      user,
      orderId,
      transactionDate,
    );
  }

  // The service resolves the permission from the requested action. Keeping the
  // guard undecorated here prevents a material issuer from inheriting close or
  // quality-release authority merely because all actions share one endpoint.
  @Post("orders/:orderId/actions")
  performOrderAction(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("orderId") orderId: string,
    @Body() dto: ManufacturingOrderActionDto,
  ) {
    return this.manufacturing.performOrderAction(user, orderId, dto);
  }

  @Get("workflow-reviews")
  @RequirePermission("manufacturing.view")
  listWorkflowReviews(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.manufacturing.listWorkflowReviews(user, query);
  }

  @Post("workflow-reviews")
  @RequirePermission("manufacturing.audit.review")
  createWorkflowReview(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingWorkflowReviewDto,
  ) {
    return this.manufacturing.createWorkflowReview(user, dto);
  }

  @Post("workflow-reviews/:reviewId/transitions")
  @RequirePermission("manufacturing.audit.review")
  transitionWorkflowReview(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("reviewId") reviewId: string,
    @Body() dto: TransitionManufacturingWorkflowReviewDto,
  ) {
    return this.manufacturing.transitionWorkflowReview(user, reviewId, dto);
  }
}
