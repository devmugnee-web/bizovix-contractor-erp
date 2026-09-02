import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query, UseGuards } from "@nestjs/common";

import { CurrentUser } from "../common/decorators/current-user.decorator.js";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard.js";
import type { AuthenticatedRequestUser } from "../common/interfaces/request-context.interface.js";
import { WorkspacesService } from "./workspaces.service.js";

@UseGuards(JwtAuthGuard)
@Controller("workspaces")
export class WorkspacesController {
  constructor(@Inject(WorkspacesService) private readonly workspacesService: WorkspacesService) {}

  @Get()
  async list(@CurrentUser() currentUser: AuthenticatedRequestUser) {
    return this.workspacesService.listForCurrentUser(currentUser);
  }

  @Post(":workspaceId/select")
  async select(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspacesService.selectWorkspace(currentUser, workspaceId);
  }

  @Put(":workspaceId/company")
  async updateCompanyProfile(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.workspacesService.updateCompanyProfile(currentUser, workspaceId, body);
  }

  @Get(":workspaceId/share-users")
  async listShareUsers(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspacesService.listShareUsers(currentUser, workspaceId);
  }

  @Post(":workspaceId/share-users")
  async createShareUser(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.workspacesService.saveShareUser(currentUser, workspaceId, body);
  }

  @Put(":workspaceId/share-users/:userId")
  async updateShareUser(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
    @Body() body: unknown,
  ) {
    return this.workspacesService.saveShareUser(currentUser, workspaceId, body, userId);
  }

  @Post(":workspaceId/share-users/:userId/reset-password")
  async resetShareUserPassword(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
  ) {
    return this.workspacesService.resetShareUserPassword(currentUser, workspaceId, userId);
  }

  @Delete(":workspaceId/share-users/:userId")
  async removeShareUser(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Param("userId") userId: string,
  ) {
    return this.workspacesService.removeShareUser(currentUser, workspaceId, userId);
  }

  @Get(":workspaceId/app-settings/auto-backup")
  async getAutoBackupSettings(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspacesService.getAutoBackupSettings(currentUser, workspaceId);
  }

  @Put(":workspaceId/app-settings/auto-backup")
  async saveAutoBackupSettings(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.workspacesService.saveAutoBackupSettings(currentUser, workspaceId, body);
  }

  @Get(":workspaceId/app-settings/costing-method")
  async getCostingSettings(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspacesService.getCostingSettings(currentUser, workspaceId);
  }

  @Get(":workspaceId/app-settings/workflow")
  async getTransactionWorkflowSettings(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
  ) {
    return this.workspacesService.getTransactionWorkflowSettings(currentUser, workspaceId);
  }

  @Put(":workspaceId/app-settings/workflow")
  async saveTransactionWorkflowSettings(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.workspacesService.saveTransactionWorkflowSettings(currentUser, workspaceId, body);
  }

  @Get(":workspaceId/app-settings/loyalty")
  async getLoyaltySettings(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspacesService.getLoyaltySettings(currentUser, workspaceId);
  }

  @Put(":workspaceId/app-settings/loyalty")
  async saveLoyaltySettings(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.workspacesService.saveLoyaltySettings(currentUser, workspaceId, body);
  }

  @Delete(":workspaceId/app-settings/loyalty")
  async deleteLoyaltySettings(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspacesService.deleteLoyaltySettings(currentUser, workspaceId);
  }

  @Get(":workspaceId/loyalty/balance")
  async getLoyaltyBalance(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Query("partyName") partyName: string,
  ) {
    return this.workspacesService.getLoyaltyBalance(currentUser, workspaceId, partyName);
  }

  @Get(":workspaceId/app-settings/tally-sync")
  async getTallySyncSettings(@CurrentUser() currentUser: AuthenticatedRequestUser, @Param("workspaceId") workspaceId: string) {
    return this.workspacesService.getTallySyncSettings(currentUser, workspaceId);
  }

  @Put(":workspaceId/app-settings/tally-sync")
  async saveTallySyncSettings(
    @CurrentUser() currentUser: AuthenticatedRequestUser,
    @Param("workspaceId") workspaceId: string,
    @Body() body: unknown,
  ) {
    return this.workspacesService.saveTallySyncSettings(currentUser, workspaceId, body);
  }
}
