import { Body, Controller, Get, Headers, Inject, Post, Query } from "@nestjs/common";

import { CloudSyncService } from "./cloud-sync.service.js";

@Controller("cloud-sync")
export class CloudSyncController {
  constructor(@Inject(CloudSyncService) private readonly cloudSyncService: CloudSyncService) {}

  @Get("ready")
  async ready() {
    return {
      ok: true,
      service: "Bizovix Cloud Sync",
      checkedAt: new Date().toISOString(),
    };
  }

  @Get("health")
  async health(@Headers("authorization") authorization?: string, @Headers("x-cloud-sync-token") token?: string) {
    this.cloudSyncService.assertCloudToken(authorization, token);
    return {
      ok: true,
      service: "Bizovix Cloud Sync",
      checkedAt: new Date().toISOString(),
    };
  }

  @Get("workspace-backups")
  async listWorkspaceBackups(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-cloud-sync-token") token: string | undefined,
    @Query("workspaceId") workspaceId?: string,
  ) {
    this.cloudSyncService.assertCloudToken(authorization, token);
    return this.cloudSyncService.listWorkspaceBackups(workspaceId);
  }

  @Post("workspace-backups")
  async createWorkspaceBackup(
    @Headers("authorization") authorization: string | undefined,
    @Headers("x-cloud-sync-token") token: string | undefined,
    @Body() body: unknown,
  ) {
    this.cloudSyncService.assertCloudToken(authorization, token);
    return this.cloudSyncService.createWorkspaceBackup(body);
  }
}
