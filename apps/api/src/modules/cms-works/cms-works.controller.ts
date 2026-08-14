import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { CmsWorksService } from "./cms-works.service";
import { CreateCmsWorkDto } from "./dto/create-cms-work.dto";
import { QueryCmsWorkDto } from "./dto/query-cms-work.dto";

@Controller("cms/works")
export class CmsWorksController {
  constructor(private readonly service: CmsWorksService) {}

  @Get() @RequirePermissions("cms.work.read")
  findAll(@Query() query: QueryCmsWorkDto, @CurrentUser() user: AuthUser) { return this.service.findAll(user.organizationId, query); }

  @Get("stats") @RequirePermissions("cms.work.read")
  stats(@CurrentUser() user: AuthUser) { return this.service.stats(user.organizationId); }

  @Get("categories") @RequirePermissions("cms.work.read")
  categories(@CurrentUser() user: AuthUser) { return this.service.categories(user.organizationId); }

  @Get(":id") @RequirePermissions("cms.work.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.findOne(user.organizationId, id); }

  @Post() @RequirePermissions("cms.work.create") @ResponseMessage("Manual work created successfully")
  create(@Body() dto: CreateCmsWorkDto, @CurrentUser() user: AuthUser) { return this.service.create(user.organizationId, user.id, dto); }

  @Patch(":id/archive") @RequirePermissions("cms.work.archive") @ResponseMessage("Work archived successfully")
  archive(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.archive(user.organizationId, user.id, id); }
}
