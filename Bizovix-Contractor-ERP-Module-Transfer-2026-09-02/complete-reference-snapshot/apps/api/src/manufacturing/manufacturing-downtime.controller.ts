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
  EndManufacturingDowntimeDto,
  ListManufacturingDowntimesDto,
  StartManufacturingDowntimeDto,
} from "./manufacturing-downtime.dto.js";
import { ManufacturingDowntimeService } from "./manufacturing-downtime.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/downtime")
export class ManufacturingDowntimeController {
  constructor(
    @Inject(ManufacturingDowntimeService)
    private readonly downtime: ManufacturingDowntimeService,
  ) {}

  @Get("candidates")
  @RequirePermission("manufacturing.view")
  listCandidates(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.downtime.listCandidates(user, workspaceId);
  }

  @Get("reason-codes")
  @RequirePermission("manufacturing.view")
  listReasonCodes(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.downtime.listReasonCodes(user, workspaceId);
  }

  @Get("events")
  @RequirePermission("manufacturing.view")
  listEvents(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: ListManufacturingDowntimesDto,
  ) {
    return this.downtime.listEvents(user, query);
  }

  @Post("events/start")
  @RequirePermission("manufacturing.production.execute")
  start(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: StartManufacturingDowntimeDto,
  ) {
    return this.downtime.start(user, dto);
  }

  @Post("events/:eventId/end")
  @RequirePermission("manufacturing.production.execute")
  end(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("eventId") eventId: string,
    @Body() dto: EndManufacturingDowntimeDto,
  ) {
    return this.downtime.end(user, eventId, dto);
  }
}
