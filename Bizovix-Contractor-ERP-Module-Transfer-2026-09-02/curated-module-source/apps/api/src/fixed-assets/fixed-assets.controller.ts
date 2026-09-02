import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { CreateAssetCategoryDto } from "./dto/create-asset-category.dto.js";
import { CreateFixedAssetDto } from "./dto/create-fixed-asset.dto.js";
import { PostDepreciationDto } from "./dto/post-depreciation.dto.js";
import { UpdateAssetCategoryDto } from "./dto/update-asset-category.dto.js";
import { UpdateFixedAssetDto } from "./dto/update-fixed-asset.dto.js";
import { FixedAssetsService } from "./fixed-assets.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("fixed-assets")
export class FixedAssetsController {
  constructor(@Inject(FixedAssetsService) private readonly fixedAssetsService: FixedAssetsService) {}

  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.fixedAssetsService.list(currentUser);
  }

  @Post()
  @RequirePermission("accounting.ledger.create")
  async create(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateFixedAssetDto) {
    return this.fixedAssetsService.create(currentUser, dto);
  }

  @Get("categories")
  async listCategories(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.fixedAssetsService.listCategories(currentUser);
  }

  @Post("categories")
  @RequirePermission("accounting.ledger.create")
  async createCategory(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateAssetCategoryDto) {
    return this.fixedAssetsService.createCategory(currentUser, dto);
  }

  @Patch("categories/:id")
  @RequirePermission("accounting.ledger.create")
  async updateCategory(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateAssetCategoryDto,
  ) {
    return this.fixedAssetsService.updateCategory(currentUser, id, dto);
  }

  @Delete("categories/:id")
  @RequirePermission("accounting.ledger.create")
  async deleteCategory(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.fixedAssetsService.deleteCategory(currentUser, id);
  }

  @Post("bootstrap-coa")
  @RequirePermission("accounting.ledger.create")
  async bootstrapCoa(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.fixedAssetsService.bootstrapCoa(currentUser);
  }

  @Get(":id/depreciation/preview")
  async previewDepreciation(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.fixedAssetsService.previewDepreciation(currentUser, id);
  }

  @Patch(":id")
  @RequirePermission("accounting.ledger.create")
  async update(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Body() dto: UpdateFixedAssetDto,
  ) {
    return this.fixedAssetsService.update(currentUser, id, dto);
  }

  @Delete(":id")
  @RequirePermission("accounting.ledger.create")
  async delete(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.fixedAssetsService.delete(currentUser, id);
  }

  @Post(":id/depreciation")
  @RequirePermission("accounting.voucher.post")
  async postDepreciation(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Body() dto: PostDepreciationDto,
  ) {
    return this.fixedAssetsService.postDepreciation(currentUser, id, dto);
  }
}
