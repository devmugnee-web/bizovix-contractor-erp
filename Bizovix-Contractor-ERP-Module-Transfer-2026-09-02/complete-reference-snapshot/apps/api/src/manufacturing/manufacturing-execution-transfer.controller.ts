import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { PostManufacturingExecutionTransferDto } from "./manufacturing-execution-transfer.dto.js";
import { ManufacturingExecutionTransferService } from "./manufacturing-execution-transfer.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("manufacturing/execution-transfers")
export class ManufacturingExecutionTransferController {
  constructor(
    @Inject(ManufacturingExecutionTransferService)
    private readonly transfers: ManufacturingExecutionTransferService,
  ) {}

  @Get("context")
  @RequirePermission("manufacturing.view")
  context(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Query("workspaceId") workspaceId?: string,
    @Query("kind") kind?: string,
  ) {
    return this.transfers.getContext(user, workspaceId, kind);
  }

  @Post()
  @RequirePermission("manufacturing.production.execute")
  post(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Body() dto: PostManufacturingExecutionTransferDto,
  ) {
    return this.transfers.post(user, dto);
  }
}
