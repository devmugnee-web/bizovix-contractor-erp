import { Body, Controller, Delete, Get, Param, Post, Put } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { SaveApprovalRuleDto, UpdateApprovalRuleDto } from "./dto/approval-rule.dto";
import { ApprovalRuleService } from "./approval-rule.service";

@Controller("settings/approvals")
export class ApprovalRuleController {
  constructor(private readonly service: ApprovalRuleService) {}

  @Get() @RequirePermissions("settings.read") list(@CurrentUser() u: AuthUser) {
    return this.service.list(u.organizationId);
  }

  @Post()
  @RequirePermissions("settings.manage")
  @ResponseMessage("Approval rule created successfully")
  create(@Body() dto: SaveApprovalRuleDto, @CurrentUser() u: AuthUser) {
    return this.service.create(u.organizationId, u.id, dto);
  }

  @Put(":id")
  @RequirePermissions("settings.manage")
  @ResponseMessage("Approval rule updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateApprovalRuleDto, @CurrentUser() u: AuthUser) {
    return this.service.update(u.organizationId, u.id, id, dto);
  }

  @Delete(":id")
  @RequirePermissions("settings.manage")
  @ResponseMessage("Approval rule deleted successfully")
  remove(@Param("id") id: string, @CurrentUser() u: AuthUser) {
    return this.service.remove(u.organizationId, u.id, id);
  }
}
