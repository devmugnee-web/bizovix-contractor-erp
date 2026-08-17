import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { TimeExtensionsService } from "./time-extensions.service";
import { ApproveTimeExtensionDto, SaveTimeExtensionDto } from "./dto/save-time-extension.dto";

@Controller("time-extensions")
export class TimeExtensionsController {
  constructor(private readonly service: TimeExtensionsService) {}

  @Get()
  @RequirePermissions("time_extension.read")
  findAll(@Query("cmsWorkId") cmsWorkId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, cmsWorkId);
  }

  @Get(":id")
  @RequirePermissions("time_extension.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("time_extension.create")
  @ResponseMessage("Time Extension saved as draft")
  create(@Body() dto: SaveTimeExtensionDto, @CurrentUser() user: AuthUser) {
    return this.service.saveDraft(user.organizationId, user.id, null, dto);
  }

  @Patch(":id")
  @RequirePermissions("time_extension.update")
  @ResponseMessage("Time Extension updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveTimeExtensionDto, @CurrentUser() user: AuthUser) {
    return this.service.saveDraft(user.organizationId, user.id, id, dto);
  }

  @Post(":id/submit")
  @RequirePermissions("time_extension.submit")
  @ResponseMessage("Time Extension submitted successfully")
  submit(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.submit(user.organizationId, user.id, id);
  }

  @Post(":id/approve")
  @RequirePermissions("time_extension.approve")
  @ResponseMessage("Time Extension approved successfully")
  approve(@Param("id") id: string, @Body() dto: ApproveTimeExtensionDto, @CurrentUser() user: AuthUser) {
    return this.service.approve(user.organizationId, user.id, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions("time_extension.approve")
  @ResponseMessage("Time Extension rejected")
  reject(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.reject(user.organizationId, user.id, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("time_extension.update")
  @ResponseMessage("Time Extension cancelled")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(user.organizationId, user.id, id);
  }
}
