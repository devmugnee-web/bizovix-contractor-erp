import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UpdateReminderRuleDto } from "./dto/reminder-rule.dto";
import { ReminderRuleService } from "./reminder-rule.service";

@Controller("settings/notifications")
export class ReminderRuleController {
  constructor(private readonly service: ReminderRuleService) {}

  @Get() @RequirePermissions("settings.read") list(@CurrentUser() u: AuthUser) {
    return this.service.list(u.organizationId);
  }

  @Put(":reminderType")
  @RequirePermissions("settings.manage")
  @ResponseMessage("Notification rule updated successfully")
  update(
    @Param("reminderType") reminderType: string,
    @Body() dto: UpdateReminderRuleDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.update(u.organizationId, u.id, reminderType, dto);
  }
}
