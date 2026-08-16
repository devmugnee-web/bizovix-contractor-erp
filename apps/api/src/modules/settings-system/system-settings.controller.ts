import { Body, Controller, Get, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UpdateSystemSettingDto } from "./dto/system-settings.dto";
import { SystemSettingsService } from "./system-settings.service";

@Controller("settings/system")
export class SystemSettingsController {
  constructor(private readonly service: SystemSettingsService) {}

  @Get() @RequirePermissions("settings.manage") get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.organizationId);
  }

  @Put()
  @RequirePermissions("settings.manage")
  @ResponseMessage("System settings updated successfully")
  update(@Body() dto: UpdateSystemSettingDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, dto);
  }
}
