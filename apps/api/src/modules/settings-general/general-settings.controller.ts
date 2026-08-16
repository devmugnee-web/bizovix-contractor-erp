import { Body, Controller, Get, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UpdateGeneralSettingDto } from "./dto/general-settings.dto";
import { GeneralSettingsService } from "./general-settings.service";

@Controller("settings/general")
export class GeneralSettingsController {
  constructor(private readonly service: GeneralSettingsService) {}

  @Get() @RequirePermissions("settings.read") get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.organizationId);
  }

  @Put()
  @RequirePermissions("settings.manage")
  @ResponseMessage("General settings updated successfully")
  update(@Body() dto: UpdateGeneralSettingDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, dto);
  }
}
