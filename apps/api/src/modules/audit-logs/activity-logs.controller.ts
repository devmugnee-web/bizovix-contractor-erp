import { Controller, Get, Param, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ActivityLogsService } from "./activity-logs.service";
import { QueryActivityLogDto } from "./dto/query-activity-log.dto";
@Controller("activity-logs")
export class ActivityLogsController { constructor(private readonly service:ActivityLogsService){}
  @Get() @RequirePermissions("settings.manage") list(@Query()q:QueryActivityLogDto,@CurrentUser()u:AuthUser){return this.service.list(u.organizationId,q)}
  @Get("stats") @RequirePermissions("settings.manage") stats(@CurrentUser()u:AuthUser){return this.service.stats(u.organizationId)}
  @Get("users") @RequirePermissions("settings.manage") users(@CurrentUser()u:AuthUser){return this.service.users(u.organizationId)}
  @Get("export") @RequirePermissions("settings.manage") exportCsv(@Query()q:QueryActivityLogDto,@CurrentUser()u:AuthUser){return this.service.exportCsv(u.organizationId,q)}
  @Get(":id") @RequirePermissions("settings.manage") one(@Param("id")id:string,@CurrentUser()u:AuthUser){return this.service.one(u.organizationId,id)}
}
