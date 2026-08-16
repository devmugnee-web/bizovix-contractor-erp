import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CreateAccountingPeriodDto, SetPeriodStatusDto, UpdateFinanceSettingDto } from "./dto/finance-settings.dto";
import { FinanceSettingsService } from "./finance-settings.service";

@Controller("settings/finance")
export class FinanceSettingsController {
  constructor(private readonly service: FinanceSettingsService) {}

  @Get() @RequirePermissions("settings.read") get(@CurrentUser() u: AuthUser) {
    return this.service.get(u.organizationId);
  }

  @Get("accounts") @RequirePermissions("settings.read") accounts(@CurrentUser() u: AuthUser) {
    return this.service.accountOptions(u.organizationId);
  }

  @Put()
  @RequirePermissions("settings.manage")
  @ResponseMessage("Finance & accounts settings updated successfully")
  update(@Body() dto: UpdateFinanceSettingDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, dto);
  }

  @Get("periods") @RequirePermissions("settings.read") periods(@CurrentUser() u: AuthUser) {
    return this.service.listPeriods(u.organizationId);
  }

  @Post("periods")
  @RequirePermissions("settings.manage")
  @ResponseMessage("Accounting period created successfully")
  createPeriod(@Body() dto: CreateAccountingPeriodDto, @CurrentUser() u: AuthUser) {
    return this.service.createPeriod(u.organizationId, u.id, dto);
  }

  @Patch("periods/:id/status")
  @RequirePermissions("settings.manage")
  @ResponseMessage("Accounting period status updated successfully")
  setPeriodStatus(@Param("id") id: string, @Body() dto: SetPeriodStatusDto, @CurrentUser() u: AuthUser) {
    return this.service.setPeriodStatus(u.organizationId, u.id, id, dto.status as "OPEN" | "LOCKED");
  }
}
