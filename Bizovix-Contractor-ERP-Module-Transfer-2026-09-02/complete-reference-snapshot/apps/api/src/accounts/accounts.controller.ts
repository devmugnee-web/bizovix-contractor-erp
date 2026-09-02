import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";

import { AccountLevel } from "../generated/prisma/index.js";
import { AccountsService } from "./accounts.service.js";
import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { RequirePermission } from "../common/decorators/require-permission.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import { PermissionGuard } from "../common/guards/permission.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { CreateAccountDto } from "./dto/create-account.dto.js";
import { CreateExpenseLedgerDto } from "./dto/create-expense-ledger.dto.js";
import { CreateLedgerItemDto } from "./dto/create-ledger-item.dto.js";
import { ReparentAccountDto } from "./dto/reparent-account.dto.js";
import { SetAccountStatusDto } from "./dto/set-account-status.dto.js";
import { UpdateAccountDto } from "./dto/update-account.dto.js";
import { UpdateLedgerItemDto } from "./dto/update-ledger-item.dto.js";

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller("accounts")
export class AccountsController {
  constructor(@Inject(AccountsService) private readonly accountsService: AccountsService) {}

  @Get("tree")
  async getTree(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Query("includeInactiveHistory") includeInactiveHistory?: string,
  ) {
    return this.accountsService.getTree(currentUser, includeInactiveHistory === "true");
  }

  @Get("ledgers")
  async getPostableLedgers(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.accountsService.getPostableLedgers(currentUser);
  }

  @Get("money-accounts")
  async getMoneyAccounts(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("type") type?: string) {
    return this.accountsService.getMoneyAccounts(currentUser, type);
  }

  @Get("suggest-code")
  async suggestCode(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Query("level") level: string,
    @Query("nature") nature: string,
    @Query("parentId") parentId?: string,
    @Query("name") name?: string,
  ) {
    return this.accountsService.suggestCode(currentUser, {
      level: level as AccountLevel,
      nature: nature ?? "",
      parentId: parentId || null,
      name: name ?? "",
    });
  }

  @Get("search")
  async search(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Query("q") query?: string,
    @Query("level") level?: string,
    @Query("status") status?: string,
  ) {
    return this.accountsService.search(currentUser, query, level, status);
  }

  @Get(":id")
  async getById(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.accountsService.getById(currentUser, id);
  }

  @Post()
  @RequirePermission("accounting.ledger.create")
  async create(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateAccountDto) {
    return this.accountsService.create(currentUser, dto);
  }

  @Post("expense-ledgers")
  @RequirePermission("accounting.ledger.create")
  async createExpenseLedger(@CurrentUser() currentUser: AuthenticatedRequestUser, @Body() dto: CreateExpenseLedgerDto) {
    return this.accountsService.createExpenseLedger(currentUser, dto);
  }

  @Put(":id")
  @RequirePermission("accounting.ledger.create")
  async update(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: UpdateAccountDto) {
    return this.accountsService.update(currentUser, id, dto);
  }

  @Post(":id/reparent")
  @RequirePermission("accounting.ledger.create")
  async reparent(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: ReparentAccountDto) {
    return this.accountsService.reparent(currentUser, id, dto);
  }

  @Post(":id/status")
  @RequirePermission("accounting.ledger.create")
  async setStatus(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: SetAccountStatusDto) {
    return this.accountsService.setStatus(currentUser, id, dto);
  }

  @Delete(":id")
  @RequirePermission("accounting.ledger.create")
  async remove(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.accountsService.remove(currentUser, id);
  }

  @Get(":id/items")
  async listLedgerItems(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string) {
    return this.accountsService.listLedgerItems(currentUser, id);
  }

  @Post(":id/items")
  @RequirePermission("accounting.ledger.create")
  async createLedgerItem(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Body() dto: CreateLedgerItemDto) {
    return this.accountsService.createLedgerItem(currentUser, id, dto);
  }

  @Put(":id/items/:itemId")
  @RequirePermission("accounting.ledger.create")
  async updateLedgerItem(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateLedgerItemDto,
  ) {
    return this.accountsService.updateLedgerItem(currentUser, id, itemId, dto);
  }

  @Delete(":id/items/:itemId")
  @RequirePermission("accounting.ledger.create")
  async deleteLedgerItem(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("id") id: string, @Param("itemId") itemId: string) {
    return this.accountsService.deleteLedgerItem(currentUser, id, itemId);
  }
}
