import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { DeductionConfigsService } from "./deduction-configs.service";
import { CreateDeductionConfigDto } from "./dto/create-deduction-config.dto";
import { UpdateDeductionConfigDto } from "./dto/update-deduction-config.dto";

@Controller("settings/deduction-configs")
export class DeductionConfigsController {
  constructor(private readonly service: DeductionConfigsService) {}

  @Get()
  @RequirePermissions("settings.read")
  list(@Query("type") type: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId, type);
  }

  @Post()
  @RequirePermissions("settings.manage")
  @ResponseMessage("Deduction configuration created successfully")
  create(@Body() dto: CreateDeductionConfigDto, @CurrentUser() user: AuthUser) {
    return this.service.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("settings.manage")
  @ResponseMessage("Deduction configuration updated successfully")
  update(@Param("id") id: string, @Body() dto: UpdateDeductionConfigDto, @CurrentUser() user: AuthUser) {
    return this.service.update(user.organizationId, user.id, id, dto);
  }
}
