import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { ReportsService } from "./reports.service.js";

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reportsService: ReportsService) {}

  @Get("trial-balance")
  async getTrialBalance(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.reportsService.getTrialBalance(currentUser, workspaceId);
  }

  @Get("closing-stock")
  async getClosingStock(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.reportsService.getClosingStock(currentUser, workspaceId);
  }

  @Get("user-activity-log")
  async getUserActivityLog(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.reportsService.getUserActivityLog(currentUser, workspaceId);
  }

  @Get("login-history")
  async getLoginHistory(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.reportsService.getLoginHistory(currentUser, workspaceId);
  }

  @Get("deleted-transactions")
  async getDeletedTransactions(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.reportsService.getDeletedTransactions(currentUser, workspaceId);
  }

  @Get("edited-transactions")
  async getEditedTransactions(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.reportsService.getEditedTransactions(currentUser, workspaceId);
  }

  @Get("approval-history")
  async getApprovalHistory(@CurrentUser() currentUser: AuthenticatedRequestUser, @Query("workspaceId") workspaceId?: string) {
    return this.reportsService.getApprovalHistory(currentUser, workspaceId);
  }
}
