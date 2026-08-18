import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { UomsService } from "./uoms.service";
import { SaveUomDto } from "./dto/save-uom.dto";

@Controller("uoms")
export class UomsController {
  constructor(private readonly uomsService: UomsService) {}

  @Get()
  @RequirePermissions("masters.read")
  findAll(@CurrentUser() user: AuthUser) {
    return this.uomsService.findAll(user.organizationId);
  }

  @Post()
  @RequirePermissions("uom.manage")
  @ResponseMessage("Unit of Measurement created successfully")
  create(@Body() dto: SaveUomDto, @CurrentUser() user: AuthUser) {
    return this.uomsService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("uom.manage")
  @ResponseMessage("Unit of Measurement updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveUomDto, @CurrentUser() user: AuthUser) {
    return this.uomsService.update(user.organizationId, user.id, id, dto);
  }
}
