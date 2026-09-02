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
  CreateMaterialExceptionDto,
  DecideMaterialExceptionDto,
  RetestManufacturingInventoryLotDto,
} from "./manufacturing-material-exceptions.dto.js";
import { ManufacturingMaterialExceptionsService } from "./manufacturing-material-exceptions.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/material-controls")
export class ManufacturingMaterialExceptionsController {
  constructor(
    @Inject(ManufacturingMaterialExceptionsService)
    private readonly controls: ManufacturingMaterialExceptionsService,
  ) {}

  @Get()
  @RequirePermission("manufacturing.view")
  getControlView(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.controls.getControlView(user, query);
  }

  @Post()
  @RequirePermission("manufacturing.material.issue")
  createRequest(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: CreateMaterialExceptionDto,
  ) {
    return this.controls.createRequest(user, dto);
  }

  @Post("lots/:lotId/retest")
  @RequirePermission("manufacturing.quality.manage")
  retestInventoryLot(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("lotId") lotId: string,
    @Body() dto: RetestManufacturingInventoryLotDto,
  ) {
    return this.controls.retestInventoryLot(user, lotId, dto);
  }

  @Post(":requestId/decision")
  decideRequest(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Param("requestId") requestId: string,
    @Body() dto: DecideMaterialExceptionDto,
  ) {
    return this.controls.decideRequest(user, requestId, dto);
  }
}
