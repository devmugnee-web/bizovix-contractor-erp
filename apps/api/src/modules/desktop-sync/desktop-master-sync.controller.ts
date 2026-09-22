import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { DesktopMasterCommandDto, DesktopMasterChangesQueryDto, DesktopMasterQueryDto } from "./desktop-master-sync.dto";
import { DesktopMasterSyncService } from "./desktop-master-sync.service";

@Controller("desktop-sync/masters")
export class DesktopMasterSyncController {
  constructor(private readonly sync: DesktopMasterSyncService) {}

  @Post("commands")
  // Service applies entity-specific live permissions: organization search/create
  // retain their JWT-only contract; UOM and payment terms still require masters.read.
  execute(@CurrentUser() actor: AuthUser, @Body() command: DesktopMasterCommandDto) { return this.sync.execute(actor, command); }

  @Get("snapshot")
  snapshot(@CurrentUser() actor: AuthUser, @Query() query: DesktopMasterQueryDto) { return this.sync.snapshot(actor, query.deviceId, query.entityType); }

  @Get("changes")
  changes(@CurrentUser() actor: AuthUser, @Query() query: DesktopMasterChangesQueryDto) { return this.sync.changes(actor, query.deviceId, query.entityType, query.cursor); }
}
