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
  CreateMaterialRequisitionDto,
  InspectIncomingMaterialLotDto,
  MaterialRequisitionTransitionDto,
  RecordMaterialHandlingEvidenceDto,
  RegisterIncomingMaterialLotDto,
} from "./manufacturing-materials.dto.js";
import { ManufacturingMaterialsService } from "./manufacturing-materials.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/materials")
export class ManufacturingMaterialsController {
  constructor(
    @Inject(ManufacturingMaterialsService)
    private readonly materials: ManufacturingMaterialsService,
  ) {}

  @Get("source-movements")
  @RequirePermission("manufacturing.view")
  sourceMovements(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.materials.listSourceMovements(user, query);
  }

  @Get("incoming-lots")
  @RequirePermission("manufacturing.view")
  incomingLots(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.materials.listIncomingLots(user, query);
  }

  @Post("incoming-lots")
  @RequirePermission("manufacturing.material.issue")
  registerIncomingLot(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: RegisterIncomingMaterialLotDto,
  ) {
    return this.materials.registerIncomingLot(user, dto);
  }

  // Decision-specific permission is checked by the service because RELEASED
  // needs release authority while REJECTED needs inspection authority.
  @Post("incoming-lots/:lotId/inspection")
  inspectIncomingLot(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("lotId") lotId: string,
    @Body() dto: InspectIncomingMaterialLotDto,
  ) {
    return this.materials.inspectIncomingLot(user, lotId, dto);
  }

  @Get("allocation")
  @RequirePermission("manufacturing.view")
  allocation(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.materials.getAllocation(user, query);
  }

  @Get("requisitions")
  @RequirePermission("manufacturing.view")
  requisitions(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.materials.listRequisitions(user, query);
  }

  @Get("verifiers")
  @RequirePermission("manufacturing.view")
  verifiers(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.materials.listVerifiers(user, query);
  }

  @Get("requisitions/:requisitionId")
  @RequirePermission("manufacturing.view")
  requisition(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("requisitionId") requisitionId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.materials.getRequisition(user, requisitionId, workspaceId);
  }

  @Post("requisitions")
  @RequirePermission("manufacturing.material.reserve")
  createRequisition(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateMaterialRequisitionDto,
  ) {
    return this.materials.createRequisition(user, dto);
  }

  @Post("requisitions/:requisitionId/submit")
  @RequirePermission("manufacturing.material.reserve")
  submitRequisition(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("requisitionId") requisitionId: string,
    @Body() dto: MaterialRequisitionTransitionDto,
  ) {
    return this.materials.submitRequisition(user, requisitionId, dto);
  }

  @Post("requisitions/:requisitionId/approve")
  @RequirePermission("manufacturing.order.approve")
  approveRequisition(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("requisitionId") requisitionId: string,
    @Body() dto: MaterialRequisitionTransitionDto,
  ) {
    return this.materials.approveRequisition(user, requisitionId, dto);
  }

  @Post("handling-evidence")
  @RequirePermission("manufacturing.material.issue")
  recordHandlingEvidence(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: RecordMaterialHandlingEvidenceDto,
  ) {
    return this.materials.recordHandlingEvidence(user, dto);
  }
}
