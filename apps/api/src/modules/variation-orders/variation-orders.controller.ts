import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { VariationOrdersService } from "./variation-orders.service";
import { ApproveVariationOrderDto, SaveVariationOrderDto } from "./dto/save-variation-order.dto";

@Controller("variation-orders")
export class VariationOrdersController {
  constructor(private readonly service: VariationOrdersService) {}

  @Get()
  @RequirePermissions("variation.read")
  findAll(@Query("cmsWorkId") cmsWorkId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, cmsWorkId);
  }

  @Get(":id")
  @RequirePermissions("variation.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("variation.create")
  @ResponseMessage("Variation Order saved as draft")
  create(@Body() dto: SaveVariationOrderDto, @CurrentUser() user: AuthUser) {
    return this.service.saveDraft(user.organizationId, user.id, null, dto);
  }

  @Patch(":id")
  @RequirePermissions("variation.update")
  @ResponseMessage("Variation Order updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveVariationOrderDto, @CurrentUser() user: AuthUser) {
    return this.service.saveDraft(user.organizationId, user.id, id, dto);
  }

  @Post(":id/submit")
  @RequirePermissions("variation.submit")
  @ResponseMessage("Variation Order submitted successfully")
  submit(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.submit(user.organizationId, user.id, id);
  }

  @Post(":id/approve")
  @RequirePermissions("variation.approve")
  @ResponseMessage("Variation Order approved successfully")
  approve(@Param("id") id: string, @Body() dto: ApproveVariationOrderDto, @CurrentUser() user: AuthUser) {
    return this.service.approve(user.organizationId, user.id, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions("variation.approve")
  @ResponseMessage("Variation Order rejected")
  reject(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.reject(user.organizationId, user.id, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("variation.update")
  @ResponseMessage("Variation Order cancelled")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(user.organizationId, user.id, id);
  }
}
