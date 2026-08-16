import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import {
  QueryReminderDto,
  SaveReminderDto,
  SnoozeReminderDto,
  UpdateReminderDto,
} from "./dto/reminder.dto";
import { RemindersService } from "./reminders.service";
@Controller("reminders")
export class RemindersController {
  constructor(private readonly service: RemindersService) {}
  @Get() @RequirePermissions("reminders.read") list(
    @Query() q: QueryReminderDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.list(u.organizationId, q);
  }
  @Get("stats") @RequirePermissions("reminders.read") stats(@CurrentUser() u: AuthUser) {
    return this.service.stats(u.organizationId);
  }
  @Get("quick") @RequirePermissions("reminders.read") quick(@CurrentUser() u: AuthUser) {
    return this.service.quick(u.organizationId);
  }
  @Get("users") @RequirePermissions("reminders.read") users(@CurrentUser() u: AuthUser) {
    return this.service.users(u.organizationId);
  }
  @Get(":id") @RequirePermissions("reminders.read") one(
    @Param("id") id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.one(u.organizationId, id);
  }
  @Post()
  @RequirePermissions("reminders.create")
  @ResponseMessage("Reminder created successfully")
  create(@Body() d: SaveReminderDto, @CurrentUser() u: AuthUser) {
    return this.service.create(u.organizationId, u, d);
  }
  @Patch(":id") @RequirePermissions("reminders.update") update(
    @Param("id") id: string,
    @Body() d: UpdateReminderDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.update(u.organizationId, u.id, id, d);
  }
  @Post(":id/complete") @RequirePermissions("reminders.complete") complete(
    @Param("id") id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.complete(u.organizationId, u, id);
  }
  @Post(":id/snooze") @RequirePermissions("reminders.update") snooze(
    @Param("id") id: string,
    @Body() d: SnoozeReminderDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.snooze(u.organizationId, u.id, id, d);
  }
  @Post(":id/cancel") @RequirePermissions("reminders.cancel") cancel(
    @Param("id") id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.cancel(u.organizationId, u.id, id);
  }
}
