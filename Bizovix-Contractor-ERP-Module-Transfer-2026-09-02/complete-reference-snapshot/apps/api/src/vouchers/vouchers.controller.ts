import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { CreateVoucherDto } from "./dto/create-voucher.dto.js";
import { ListDayBookDto } from "./dto/list-day-book.dto.js";
import { VouchersService } from "./vouchers.service.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("vouchers")
export class VouchersController {
  constructor(@Inject(VouchersService) private readonly vouchersService: VouchersService) {}

  @Get("day-book")
  async listDayBook(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query() query: ListDayBookDto) {
    return this.vouchersService.listDayBook(currentUser, query);
  }

  @Get(":id")
  async getById(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") voucherId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.vouchersService.getById(currentUser, voucherId, workspaceId);
  }

  @Post()
  @RequirePermission("accounting.voucher.create")
  async create(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateVoucherDto) {
    return this.vouchersService.create(currentUser, dto);
  }

  // Update/remove/submit/cancel are gated inside VouchersService instead of a
  // static decorator here: which permission key applies depends on this
  // specific voucher's type (fine-grained per-type key if the Users & Roles
  // matrix covers it, the legacy coarse key otherwise) and, for "Limited",
  // on whether the current user created this exact record — none of which a
  // route-level @RequirePermission can express.
  @Put(":id")
  async update(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") voucherId: string, @Body() dto: CreateVoucherDto) {
    return this.vouchersService.update(currentUser, voucherId, dto);
  }

  @Delete(":id")
  async remove(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") voucherId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.vouchersService.remove(currentUser, voucherId, workspaceId);
  }

  @Delete(":id/reset-sales-invoice")
  async resetSalesInvoice(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") voucherId: string,
    @Query("workspaceId") workspaceId?: string,
  ) {
    return this.vouchersService.resetSalesInvoice(currentUser, voucherId, workspaceId);
  }

  @Post(":id/submit")
  async submit(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") voucherId: string) {
    return this.vouchersService.submit(currentUser, voucherId);
  }

  @Post(":id/approve")
  @RequirePermission("accounting.voucher.post")
  async approve(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") voucherId: string) {
    return this.vouchersService.approve(currentUser, voucherId);
  }

  @Post(":id/reject")
  @RequirePermission("accounting.voucher.post")
  async reject(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") voucherId: string) {
    return this.vouchersService.reject(currentUser, voucherId);
  }

  @Post(":id/cancel")
  async cancel(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") voucherId: string) {
    return this.vouchersService.cancel(currentUser, voucherId);
  }

  @Post(":id/reverse")
  @RequirePermission("accounting.voucher.post")
  async reverse(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") voucherId: string,
    @Body("reason") reason?: string,
  ) {
    return this.vouchersService.reverse(currentUser, voucherId, reason);
  }
}
