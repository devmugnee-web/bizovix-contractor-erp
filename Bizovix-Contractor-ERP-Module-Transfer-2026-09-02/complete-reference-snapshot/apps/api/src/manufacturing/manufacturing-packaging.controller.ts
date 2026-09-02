import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import {
  AllocateManufacturingSerialsDto,
  ConfirmPackagingReleaseReadinessDto,
  CreateManufacturingPackagingOrderDto,
  CreateManufacturingSerialRuleDto,
  ManufacturingSignedActionDto,
  RecordPackagingLineClearanceDto,
  RecordSerialQualityDto,
  ReconcileManufacturingPackagingDto,
  RegisterManufacturingPackageUnitsDto,
  RegisterManufacturingPackagingLabelsDto,
  RetryPackagingMaterialReservationDto,
} from "./manufacturing-packaging.dto.js";
import { ManufacturingPackagingService } from "./manufacturing-packaging.service.js";

type PackagingQuery = Record<string, string | undefined>;

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/serial-packaging")
export class ManufacturingPackagingController {
  constructor(
    @Inject(ManufacturingPackagingService)
    private readonly packaging: ManufacturingPackagingService,
  ) {}

  @Get("workspace")
  @RequirePermission("manufacturing.view")
  getWorkspace(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: PackagingQuery,
  ) {
    return this.packaging.getWorkspace(user, query);
  }

  @Post("serial-rules")
  @RequirePermission("manufacturing.master.manage")
  createSerialRule(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingSerialRuleDto,
  ) {
    return this.packaging.createSerialRule(user, dto);
  }

  @Post("serial-rules/:ruleId/activate")
  @RequirePermission("manufacturing.master.manage")
  activateSerialRule(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("ruleId") ruleId: string,
    @Body() dto: ManufacturingSignedActionDto,
  ) {
    return this.packaging.activateSerialRule(user, ruleId, dto);
  }

  @Post("serial-rules/:ruleId/allocate")
  @RequirePermission("manufacturing.production.execute")
  allocateSerials(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("ruleId") ruleId: string,
    @Body() dto: AllocateManufacturingSerialsDto,
  ) {
    return this.packaging.allocateSerials(user, ruleId, dto);
  }

  @Post("serial-qc")
  recordSerialQuality(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: RecordSerialQualityDto,
  ) {
    return this.packaging.recordSerialQuality(user, dto);
  }

  @Post("packaging-orders")
  @RequirePermission("manufacturing.packaging.execute")
  createPackagingOrder(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingPackagingOrderDto,
  ) {
    return this.packaging.createPackagingOrder(user, dto);
  }

  @Post("packaging-orders/:packagingOrderId/reserve-materials")
  @RequirePermission("manufacturing.material.reserve")
  retryPackagingMaterialReservation(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("packagingOrderId") packagingOrderId: string,
    @Body() dto: RetryPackagingMaterialReservationDto,
  ) {
    return this.packaging.retryPackagingMaterialReservation(
      user,
      packagingOrderId,
      dto,
    );
  }

  @Post("packaging-orders/:packagingOrderId/line-clearance")
  @RequirePermission("manufacturing.packaging.execute")
  recordLineClearance(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("packagingOrderId") packagingOrderId: string,
    @Body() dto: RecordPackagingLineClearanceDto,
  ) {
    return this.packaging.recordLineClearance(user, packagingOrderId, dto);
  }

  @Post("packaging-orders/:packagingOrderId/reconcile")
  @RequirePermission("manufacturing.packaging.execute")
  reconcilePackaging(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("packagingOrderId") packagingOrderId: string,
    @Body() dto: ReconcileManufacturingPackagingDto,
  ) {
    return this.packaging.reconcilePackaging(user, packagingOrderId, dto);
  }

  @Post("packaging-orders/:packagingOrderId/labels")
  @RequirePermission("manufacturing.packaging.execute")
  registerLabels(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("packagingOrderId") packagingOrderId: string,
    @Body() dto: RegisterManufacturingPackagingLabelsDto,
  ) {
    return this.packaging.registerLabels(user, packagingOrderId, dto);
  }

  @Post("packaging-orders/:packagingOrderId/package-units")
  @RequirePermission("manufacturing.packaging.execute")
  registerPackageUnits(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("packagingOrderId") packagingOrderId: string,
    @Body() dto: RegisterManufacturingPackageUnitsDto,
  ) {
    return this.packaging.registerPackageUnits(user, packagingOrderId, dto);
  }

  @Post("packaging-orders/:packagingOrderId/release-readiness")
  @RequirePermission("manufacturing.quality.release")
  confirmReleaseReadiness(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("packagingOrderId") packagingOrderId: string,
    @Body() dto: ConfirmPackagingReleaseReadinessDto,
  ) {
    return this.packaging.confirmReleaseReadiness(user, packagingOrderId, dto);
  }
}
