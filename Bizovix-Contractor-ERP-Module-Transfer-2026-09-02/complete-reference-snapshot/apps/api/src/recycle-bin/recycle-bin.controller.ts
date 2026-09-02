import { Controller, Delete, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { RecycleBinService } from "./recycle-bin.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("recycle-bin")
export class RecycleBinController {
  constructor(@Inject(RecycleBinService) private readonly recycleBinService: RecycleBinService) {}

  @Get()
  @RequirePermission("recycle_bin.view")
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.recycleBinService.list(currentUser, workspaceId);
  }

  @Post(":entryId/restore")
  @RequirePermission("recycle_bin.delete")
  async restore(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("entryId") entryId: string) {
    return this.recycleBinService.restore(currentUser, entryId);
  }

  @Delete(":entryId")
  @RequirePermission("recycle_bin.delete")
  async deletePermanently(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("entryId") entryId: string) {
    return this.recycleBinService.deletePermanently(currentUser, entryId);
  }

  @Delete()
  @RequirePermission("recycle_bin.delete")
  async empty(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.recycleBinService.empty(currentUser, workspaceId);
  }
}
