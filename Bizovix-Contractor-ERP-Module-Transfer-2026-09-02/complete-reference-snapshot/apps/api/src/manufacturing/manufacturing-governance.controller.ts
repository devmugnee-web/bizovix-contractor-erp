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
  CreateManufacturingGovernanceRecordDto,
  RecordManufacturingControlledPrintDto,
  ReviseManufacturingGovernanceRecordDto,
  TransitionManufacturingGovernanceRecordDto,
} from "./manufacturing-governance.dto.js";
import { ManufacturingGovernanceService } from "./manufacturing-governance.service.js";

type GovernanceQuery = Record<string, string | undefined>;

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/governance")
export class ManufacturingGovernanceController {
  constructor(
    @Inject(ManufacturingGovernanceService)
    private readonly governance: ManufacturingGovernanceService,
  ) {}

  @Get("records")
  @RequirePermission("manufacturing.view")
  listRecords(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: GovernanceQuery,
  ) {
    return this.governance.listRecords(user, query);
  }

  @Get("records/:recordId")
  @RequirePermission("manufacturing.view")
  getRecord(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("recordId") recordId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.governance.getRecord(user, recordId, workspaceId);
  }

  @Post("records")
  @RequirePermission("manufacturing.view")
  createRecord(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateManufacturingGovernanceRecordDto,
  ) {
    return this.governance.createRecord(user, dto);
  }

  @Post("records/:recordId/revisions")
  @RequirePermission("manufacturing.view")
  reviseRecord(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("recordId") recordId: string,
    @Body() dto: ReviseManufacturingGovernanceRecordDto,
  ) {
    return this.governance.reviseRecord(user, recordId, dto);
  }

  @Post("records/:recordId/transitions")
  @RequirePermission("manufacturing.view")
  transitionRecord(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("recordId") recordId: string,
    @Body() dto: TransitionManufacturingGovernanceRecordDto,
  ) {
    return this.governance.transitionRecord(user, recordId, dto);
  }

  @Post("controlled-prints")
  @RequirePermission("manufacturing.audit.review")
  recordControlledPrint(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: RecordManufacturingControlledPrintDto,
  ) {
    return this.governance.recordControlledPrint(user, dto);
  }

  @Get("audit-trail")
  @RequirePermission("manufacturing.audit.review")
  listAuditTrail(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: GovernanceQuery,
  ) {
    return this.governance.listAuditTrail(user, query);
  }

  @Get("validation-readiness")
  @RequirePermission("manufacturing.view")
  validationReadiness(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.governance.validationReadiness(user, workspaceId);
  }
}
