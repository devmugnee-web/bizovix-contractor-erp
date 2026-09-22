import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { DesktopCategoryCommandDto, DesktopChangesQueryDto, DesktopSyncQueryDto, RegisterDesktopDto } from "./desktop-sync.dto";
import { DesktopSyncService } from "./desktop-sync.service";

@Controller("desktop-sync")
export class DesktopSyncController {
  constructor(private readonly sync: DesktopSyncService) {}

  @Post("register")
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDesktopDto) { return this.sync.register(user, dto); }

  @Post("commands")
  @RequirePermissions("masters.read")
  execute(@CurrentUser() user: AuthUser, @Body() dto: DesktopCategoryCommandDto) { return this.sync.execute(user, dto); }

  @Get("snapshot")
  @RequirePermissions("masters.read")
  snapshot(@CurrentUser() user: AuthUser, @Query() query: DesktopSyncQueryDto) { return this.sync.snapshot(user, query.deviceId); }

  @Get("changes")
  @RequirePermissions("masters.read")
  changes(@CurrentUser() user: AuthUser, @Query() query: DesktopChangesQueryDto) { return this.sync.changes(user, query.deviceId, query.cursor); }
}
