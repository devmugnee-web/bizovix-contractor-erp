import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { MasterCategoriesService } from "./master-categories.service";
import { SaveMasterCategoryDto } from "./dto/save-master-category.dto";
import { QueryMasterCategoryDto } from "./dto/query-master-category.dto";

@Controller("master-categories")
export class MasterCategoriesController {
  constructor(private readonly masterCategoriesService: MasterCategoriesService) {}

  @Get()
  @RequirePermissions("masters.read")
  findAll(@Query() query: QueryMasterCategoryDto, @CurrentUser() user: AuthUser) {
    return this.masterCategoriesService.findAll(user.organizationId, query.type);
  }

  @Post()
  @RequirePermissions("vendor.create")
  @ResponseMessage("Category created successfully")
  create(@Body() dto: SaveMasterCategoryDto, @CurrentUser() user: AuthUser) {
    return this.masterCategoriesService.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("vendor.update")
  @ResponseMessage("Category updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveMasterCategoryDto, @CurrentUser() user: AuthUser) {
    return this.masterCategoriesService.update(user.organizationId, user.id, id, dto);
  }
}
