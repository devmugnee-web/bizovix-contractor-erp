import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { AccountingService } from "./accounting.service";
import {
  CreateAccountDto,
  CreateJournalDto,
  CreatePayableDto,
  OpeningBalanceDto,
  PayPayableDto,
  QueryAccountingDto,
} from "./dto/accounting.dto";
@Controller("accounts")
export class AccountingController {
  constructor(private readonly service: AccountingService) {}
  @Get("summary") @RequirePermissions("accounts.read") summary(@CurrentUser() u: AuthUser) {
    return this.service.summary(u.organizationId);
  }
  @Get("integrity") @RequirePermissions("accounts.read") integrity(@CurrentUser() u: AuthUser) {
    return this.service.integrity(u.organizationId);
  }
  @Get("chart") @RequirePermissions("chart_of_accounts.read") chart(@CurrentUser() u: AuthUser) {
    return this.service.chart(u.organizationId);
  }
  @Post("chart") @RequirePermissions("chart_of_accounts.create") createAccount(
    @Body() d: CreateAccountDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.createAccount(u.organizationId, u.id, d);
  }
  @Patch("chart/:id") @RequirePermissions("chart_of_accounts.update") updateAccount(
    @Param("id") id: string,
    @Body() d: Partial<CreateAccountDto>,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.updateAccount(u.organizationId, u.id, id, d);
  }
  @Get("journals") @RequirePermissions("journal.read") journals(
    @Query() q: QueryAccountingDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.journals(u.organizationId, q);
  }
  @Post("journals") @RequirePermissions("journal.create") createJournal(
    @Body() d: CreateJournalDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.createJournal(u.organizationId, u.id, d);
  }
  @Post("journals/:id/post") @RequirePermissions("journal.post") postJournal(
    @Param("id") id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.postDraft(u.organizationId, u.id, id);
  }
  @Post("journals/:id/reverse") @RequirePermissions("journal.reverse") reverse(
    @Param("id") id: string,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.reverse(u.organizationId, u.id, id);
  }
  @Get("ledger") @RequirePermissions("ledger.read") ledger(
    @Query() q: QueryAccountingDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.ledger(u.organizationId, q);
  }
  @Get("receivables") @RequirePermissions("receivable.read") receivables(
    @Query() q: QueryAccountingDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.receivables(u.organizationId, q);
  }
  @Get("payables") @RequirePermissions("payable.read") payables(
    @Query() q: QueryAccountingDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.payables(u.organizationId, q);
  }
  @Post("payables") @RequirePermissions("payable.manage") createPayable(
    @Body() d: CreatePayableDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.createPayable(u.organizationId, u.id, d);
  }
  @Post("payables/:id/pay") @RequirePermissions("payable.manage") payPayable(
    @Param("id") id: string,
    @Body() d: PayPayableDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.payPayable(u.organizationId, u.id, id, d);
  }
  @Get("projects") @RequirePermissions("project_accounts.read") projects(
    @Query() q: QueryAccountingDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.projectAccounts(u.organizationId, q);
  }
  @Get("party-ledger") @RequirePermissions("party_ledger.read") party(
    @Query() q: QueryAccountingDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.partyLedger(u.organizationId, q);
  }
  @Get("opening-balances") @RequirePermissions("opening_balance.read") openings(
    @Query() q: QueryAccountingDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.openingBalances(u.organizationId, q);
  }
  @Post("opening-balances") @RequirePermissions("opening_balance.manage") createOpening(
    @Body() d: OpeningBalanceDto,
    @CurrentUser() u: AuthUser,
  ) {
    return this.service.createOpening(u.organizationId, u.id, d);
  }
}
