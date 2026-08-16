import { Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UpdateSecuritySettingDto } from "./dto/security-settings.dto";
import { SecuritySettingsService } from "./security-settings.service";

@Controller("settings/security")
export class SecuritySettingsController {
  constructor(private readonly service: SecuritySettingsService) {}

  @Get() @RequirePermissions("settings.read") get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.organizationId);
  }

  @Put()
  @RequirePermissions("settings.manage")
  @ResponseMessage("Security settings updated successfully")
  update(@Body() dto: UpdateSecuritySettingDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, dto);
  }

  @Get("sessions") @RequirePermissions("settings.read") sessions(@CurrentUser() u: AuthUser) {
    return this.service.activeSessions(u.id);
  }

  @Delete("sessions/:id")
  @RequirePermissions("settings.read")
  @ResponseMessage("Session revoked successfully")
  revoke(@Param("id") id: string, @CurrentUser() u: AuthUser) {
    return this.service.revokeSession(u.organizationId, u.id, id);
  }
}
