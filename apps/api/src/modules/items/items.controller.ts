import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { ItemsService } from "./items.service";
import { SaveItemDto } from "./dto/save-item.dto";
import { QueryItemDto } from "./dto/query-item.dto";

@Controller("items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Get()
  @RequirePermissions("item.read")
  findAll(@Query() query: QueryItemDto, @CurrentUser() user: AuthUser) {
    return this.itemsService.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("item.read")
  stats(@CurrentUser() user: AuthUser) {
    return this.itemsService.stats(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("item.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.itemsService.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("item.create")
  @ResponseMessage("Item created successfully")
  create(@Body() dto: SaveItemDto, @CurrentUser() user: AuthUser) {
    return this.itemsService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("item.update")
  @ResponseMessage("Item updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveItemDto, @CurrentUser() user: AuthUser) {
    return this.itemsService.update(user.organizationId, user.id, id, dto);
  }
}
