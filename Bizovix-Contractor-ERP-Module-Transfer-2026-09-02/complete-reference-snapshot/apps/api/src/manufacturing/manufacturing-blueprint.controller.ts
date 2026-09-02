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
  ApproveManufacturingControlRecordDto,
  ArchiveManufacturingPeriodDto,
  AssignOperationResourceDto,
  ConfigureManufacturingDocumentSequenceDto,
  CreateArtworkSpecificationDto,
  CreateDemandPlanDto,
  CreateManufacturingCalendarSlotDto,
  CreateManufacturingCampaignDto,
  CreateManufacturingReasonCodeDto,
  CreateManufacturingResourceDto,
  CreateManufacturingShiftDto,
  CreateMasterProductionScheduleDto,
  CreatePackagingConfigurationDto,
  CreateQualitySpecificationDto,
  CreateTestMethodDto,
  EnsureManufacturingPeriodDto,
  IssueManufacturingDocumentNumberDto,
  LockManufacturingPeriodDto,
  RunManufacturingCapacityCheckDto,
  UpdateManufacturingResourceDto,
  UpdateManufacturingResourceReadinessDto,
  ValidateManufacturingPeriodDto,
} from "./manufacturing-blueprint.dto.js";
import { ManufacturingBlueprintService } from "./manufacturing-blueprint.service.js";

type BlueprintQuery = Record<string, string | undefined>;

/**
 * Auditable manufacturing controls that complement the transaction/lifecycle API.
 * Every mutation is workspace-scoped and the service re-checks permissions and scope.
 */
@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/blueprint")
export class ManufacturingBlueprintController {
  constructor(
    @Inject(ManufacturingBlueprintService)
    private readonly blueprint: ManufacturingBlueprintService,
  ) {}

  @Get("resources")
  @RequirePermission("manufacturing.view")
  listResources(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: BlueprintQuery,
  ) {
    return this.blueprint.listResources(user, query);
  }

  @Post("resources")
  @RequirePermission("manufacturing.master.manage")
  createResource(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingResourceDto,
  ) {
    return this.blueprint.createResource(user, dto);
  }

  @Put("resources/:resourceId")
  @RequirePermission("manufacturing.master.manage")
  updateResource(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("resourceId") resourceId: string,
    @Body() dto: UpdateManufacturingResourceDto,
  ) {
    return this.blueprint.updateResource(user, resourceId, dto);
  }

  @Post("resources/:resourceId/readiness")
  @RequirePermission("manufacturing.master.manage")
  updateResourceReadiness(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("resourceId") resourceId: string,
    @Body() dto: UpdateManufacturingResourceReadinessDto,
  ) {
    return this.blueprint.updateResourceReadiness(user, resourceId, dto);
  }

  @Get("shifts")
  @RequirePermission("manufacturing.view")
  listShifts(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: BlueprintQuery,
  ) {
    return this.blueprint.listShifts(user, query);
  }

  @Post("shifts")
  @RequirePermission("manufacturing.master.manage")
  createShift(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingShiftDto,
  ) {
    return this.blueprint.createShift(user, dto);
  }

  @Get("calendar-slots")
  @RequirePermission("manufacturing.view")
  listCalendarSlots(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: BlueprintQuery,
  ) {
    return this.blueprint.listCalendarSlots(user, query);
  }

  @Post("calendar-slots")
  @RequirePermission("manufacturing.master.manage")
  upsertCalendarSlot(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingCalendarSlotDto,
  ) {
    return this.blueprint.upsertCalendarSlot(user, dto);
  }

  @Post("routing-operations/:operationId/resources")
  @RequirePermission("manufacturing.master.manage")
  assignOperationResource(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("operationId") operationId: string,
    @Body() dto: AssignOperationResourceDto,
  ) {
    return this.blueprint.assignOperationResource(user, operationId, dto);
  }

  @Get("control-records")
  @RequirePermission("manufacturing.view")
  listControlRecords(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: BlueprintQuery,
  ) {
    return this.blueprint.listControlRecords(user, query);
  }

  @Post("demand-plans")
  @RequirePermission("manufacturing.plan.manage")
  createDemandPlan(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateDemandPlanDto,
  ) {
    return this.blueprint.createDemandPlan(user, dto);
  }

  @Post("master-production-schedules")
  @RequirePermission("manufacturing.plan.manage")
  createMasterProductionSchedule(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateMasterProductionScheduleDto,
  ) {
    return this.blueprint.createMasterProductionSchedule(user, dto);
  }

  @Post("campaigns")
  @RequirePermission("manufacturing.plan.manage")
  createCampaign(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingCampaignDto,
  ) {
    return this.blueprint.createCampaign(user, dto);
  }

  @Post("test-methods")
  @RequirePermission("manufacturing.quality.manage")
  createTestMethod(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateTestMethodDto,
  ) {
    return this.blueprint.createTestMethod(user, dto);
  }

  @Post("quality-specifications")
  @RequirePermission("manufacturing.quality.manage")
  createQualitySpecification(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateQualitySpecificationDto,
  ) {
    return this.blueprint.createQualitySpecification(user, dto);
  }

  @Post("artwork-specifications")
  @RequirePermission("manufacturing.master.manage")
  createArtworkSpecification(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateArtworkSpecificationDto,
  ) {
    return this.blueprint.createArtworkSpecification(user, dto);
  }

  @Post("packaging-configurations")
  @RequirePermission("manufacturing.master.manage")
  createPackagingConfiguration(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreatePackagingConfigurationDto,
  ) {
    return this.blueprint.createPackagingConfiguration(user, dto);
  }

  @Post("reason-codes")
  @RequirePermission("manufacturing.configure")
  createReasonCode(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingReasonCodeDto,
  ) {
    return this.blueprint.createReasonCode(user, dto);
  }

  @Post("control-records/:recordId/approve")
  @RequirePermission("manufacturing.audit.review")
  approveControlRecord(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("recordId") recordId: string,
    @Body() dto: ApproveManufacturingControlRecordDto,
  ) {
    return this.blueprint.approveControlRecord(user, recordId, dto);
  }

  @Get("document-sequences")
  @RequirePermission("manufacturing.view")
  listDocumentSequences(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: BlueprintQuery,
  ) {
    return this.blueprint.listDocumentSequences(user, query);
  }

  @Put("document-sequences")
  @RequirePermission("manufacturing.configure")
  configureDocumentSequence(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: ConfigureManufacturingDocumentSequenceDto,
  ) {
    return this.blueprint.configureDocumentSequence(user, dto);
  }

  @Post("document-numbers/issue")
  @RequirePermission("manufacturing.configure")
  issueDocumentNumber(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: IssueManufacturingDocumentNumberDto,
  ) {
    return this.blueprint.issueDocumentNumber(user, dto);
  }

  @Get("capacity-checks")
  @RequirePermission("manufacturing.view")
  listCapacityChecks(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: BlueprintQuery,
  ) {
    return this.blueprint.listCapacityChecks(user, query);
  }

  @Post("capacity-checks/run")
  @RequirePermission("manufacturing.plan.manage")
  runCapacityCheck(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: RunManufacturingCapacityCheckDto,
  ) {
    return this.blueprint.runCapacityCheck(user, dto);
  }

  @Get("periods")
  @RequirePermission("manufacturing.view")
  listPeriods(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: BlueprintQuery,
  ) {
    return this.blueprint.listPeriods(user, query);
  }

  @Post("periods/ensure")
  @RequirePermission("manufacturing.configure")
  ensurePeriod(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: EnsureManufacturingPeriodDto,
  ) {
    return this.blueprint.ensurePeriod(user, dto);
  }

  @Post("periods/validate")
  @RequirePermission("manufacturing.audit.review")
  validatePeriod(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: ValidateManufacturingPeriodDto,
  ) {
    return this.blueprint.validatePeriod(user, dto);
  }

  @Post("periods/lock")
  @RequirePermission("manufacturing.audit.review")
  lockPeriod(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: LockManufacturingPeriodDto,
  ) {
    return this.blueprint.lockPeriod(user, dto);
  }

  @Post("periods/archive")
  @RequirePermission("manufacturing.audit.review")
  archivePeriod(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: ArchiveManufacturingPeriodDto,
  ) {
    return this.blueprint.archivePeriod(user, dto);
  }
}
