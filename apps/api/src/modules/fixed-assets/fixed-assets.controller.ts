import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import {
  BulkPostDepreciationDto,
  CreateAssetCategoryDto,
  CreateFixedAssetDto,
  PostDepreciationDto,
  QueryFixedAssetsDto,
  UpdateAssetCategoryDto,
  UpdateFixedAssetDto,
} from "./dto/fixed-assets.dto";
import { FixedAssetsService } from "./fixed-assets.service";

@Controller("fixed-assets")
export class FixedAssetsController {
  constructor(private readonly service: FixedAssetsService) {}

  @Get() @RequirePermissions("asset.read")
  list(@Query() query: QueryFixedAssetsDto, @CurrentUser() user: AuthUser) { return this.service.list(user.organizationId, query); }

  @Get("dashboard") @RequirePermissions("asset.read")
  dashboard(@CurrentUser() user: AuthUser) { return this.service.dashboard(user.organizationId); }

  @Get("categories") @RequirePermissions("asset.read")
  categories(@CurrentUser() user: AuthUser) { return this.service.listCategories(user.organizationId); }

  @Post("categories") @RequirePermissions("asset.create") @ResponseMessage("Asset category created")
  createCategory(@Body() dto: CreateAssetCategoryDto, @CurrentUser() user: AuthUser) { return this.service.createCategory(user.organizationId, user.id, dto); }

  @Patch("categories/:id") @RequirePermissions("asset.update")
  updateCategory(@Param("id") id: string, @Body() dto: UpdateAssetCategoryDto, @CurrentUser() user: AuthUser) { return this.service.updateCategory(user.organizationId, user.id, id, dto); }

  @Delete("categories/:id") @RequirePermissions("asset.delete")
  deleteCategory(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.deleteCategory(user.organizationId, user.id, id); }

  @Post() @RequirePermissions("asset.create") @ResponseMessage("Fixed asset acquired and posted")
  create(@Body() dto: CreateFixedAssetDto, @CurrentUser() user: AuthUser) { return this.service.create(user.organizationId, user.id, dto); }

  @Post("depreciation/bulk") @RequirePermissions("asset.depreciation.post")
  bulkDepreciation(@Body() dto: BulkPostDepreciationDto, @CurrentUser() user: AuthUser) { return this.service.postBulkDepreciation(user.organizationId, user.id, dto); }

  @Get("reports/register") @RequirePermissions("asset.reports.view")
  registerReport(@CurrentUser() user: AuthUser) { return this.service.registerReport(user.organizationId); }

  @Get(":id") @RequirePermissions("asset.read")
  one(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.findOne(user.organizationId, id); }

  @Get(":id/depreciation/preview") @RequirePermissions("asset.read")
  preview(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.previewDepreciation(user.organizationId, id); }

  @Patch(":id") @RequirePermissions("asset.update")
  update(@Param("id") id: string, @Body() dto: UpdateFixedAssetDto, @CurrentUser() user: AuthUser) { return this.service.update(user.organizationId, user.id, id, dto); }

  @Post(":id/depreciation") @RequirePermissions("asset.depreciation.post") @ResponseMessage("Depreciation posted")
  depreciate(@Param("id") id: string, @Body() dto: PostDepreciationDto, @CurrentUser() user: AuthUser) { return this.service.postDepreciation(user.organizationId, user.id, id, dto); }

  @Delete(":id") @RequirePermissions("asset.delete")
  remove(@Param("id") id: string, @CurrentUser() user: AuthUser) { return this.service.remove(user.organizationId, user.id, id); }
}
