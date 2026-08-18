import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { GrnService } from "./grn.service";
import { SaveGrnDto } from "./dto/save-grn.dto";
import { QueryGrnDto } from "./dto/query-grn.dto";

@Controller("grns")
export class GrnController {
  constructor(private readonly grnService: GrnService) {}

  @Get()
  @RequirePermissions("procurement.read")
  findAll(@Query() query: QueryGrnDto, @CurrentUser() user: AuthUser) {
    return this.grnService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("procurement.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.grnService.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("procurement.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.grnService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("grn.create")
  @ResponseMessage("Goods Receipt Note recorded successfully")
  create(@Body() dto: SaveGrnDto, @CurrentUser() user: AuthUser) {
    return this.grnService.create(user.organizationId, user.id, dto);
  }
}
