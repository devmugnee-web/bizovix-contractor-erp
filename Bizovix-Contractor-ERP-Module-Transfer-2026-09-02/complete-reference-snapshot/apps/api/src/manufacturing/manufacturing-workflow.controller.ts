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
  CreateManufacturingRunStepOccurrenceDto,
  DiscardEmptyManufacturingRunDto,
  ListManufacturingRunsQueryDto,
  StartManufacturingRunDto,
  TransitionManufacturingRunStepDto,
  UpdateManufacturingWorkflowConfigurationDto,
} from "./manufacturing-workflow.dto.js";
import { ManufacturingWorkflowService } from "./manufacturing-workflow.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/workflow")
export class ManufacturingWorkflowController {
  constructor(
    @Inject(ManufacturingWorkflowService)
    private readonly workflow: ManufacturingWorkflowService,
  ) {}

  @Get("definitions/active")
  @RequirePermission("manufacturing.view")
  getActiveDefinition() {
    return this.workflow.getActiveDefinition();
  }

  @Get("configuration")
  @RequirePermission("manufacturing.view")
  getConfiguration(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.workflow.getConfiguration(user, workspaceId);
  }

  @Put("configuration")
  @RequirePermission("manufacturing.configure")
  updateConfiguration(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: UpdateManufacturingWorkflowConfigurationDto,
  ) {
    return this.workflow.updateConfiguration(user, dto);
  }

  @Get("electronic-signature-context")
  @RequirePermission("manufacturing.view")
  getElectronicSignatureContext(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.workflow.getElectronicSignatureContext(user, workspaceId);
  }

  @Get("runs")
  @RequirePermission("manufacturing.view")
  listRuns(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: ListManufacturingRunsQueryDto,
  ) {
    return this.workflow.listRuns(user, query);
  }

  @Post("runs")
  @RequirePermission("manufacturing.order.create")
  startRun(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: StartManufacturingRunDto,
  ) {
    return this.workflow.startRun(user, dto);
  }

  @Post("runs/:runId/discard-empty")
  @RequirePermission("manufacturing.close")
  discardEmptyRun(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("runId") runId: string,
    @Body() dto: DiscardEmptyManufacturingRunDto,
  ) {
    return this.workflow.discardEmptyRun(user, runId, dto);
  }

  @Get("runs/:runId")
  @RequirePermission("manufacturing.view")
  getRun(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("runId") runId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.workflow.getRun(user, runId, workspaceId);
  }

  @Get("runs/:runId/next-action")
  @RequirePermission("manufacturing.view")
  getNextAction(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("runId") runId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.workflow.getNextAction(user, runId, workspaceId);
  }

  @Get("runs/:runId/history")
  @RequirePermission("manufacturing.view")
  getHistory(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("runId") runId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.workflow.getHistory(user, runId, workspaceId);
  }

  // The service enforces the step's stable permission key; a generic route
  // guard here would accidentally grant posting authority to every viewer.
  @Post("runs/:runId/steps/:stepId/occurrences")
  createStepOccurrence(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("runId") runId: string,
    @Param("stepId") stepId: string,
    @Body() dto: CreateManufacturingRunStepOccurrenceDto,
  ) {
    return this.workflow.createStepOccurrence(user, runId, stepId, dto);
  }

  @Post("runs/:runId/steps/:stepId/transitions")
  transitionStep(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("runId") runId: string,
    @Param("stepId") stepId: string,
    @Body() dto: TransitionManufacturingRunStepDto,
  ) {
    return this.workflow.transitionStep(user, runId, stepId, dto);
  }
}
