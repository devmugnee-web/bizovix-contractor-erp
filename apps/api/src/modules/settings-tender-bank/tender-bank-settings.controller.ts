import { Body, Controller, Get, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UpdateTenderBankSettingDto } from "./dto/tender-bank-settings.dto";
import { TenderBankSettingsService } from "./tender-bank-settings.service";

@Controller("settings/tender-bank")
export class TenderBankSettingsController {
  constructor(private readonly service: TenderBankSettingsService) {}

  @Get() @RequirePermissions("settings.read") get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.organizationId);
  }

  @Put()
  @RequirePermissions("settings.manage")
  @ResponseMessage("Tender & bank instrument settings updated successfully")
  update(@Body() dto: UpdateTenderBankSettingDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, dto);
  }
}
