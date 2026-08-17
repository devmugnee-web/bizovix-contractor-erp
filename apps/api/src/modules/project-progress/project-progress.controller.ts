import { Controller, Get, Param } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ProjectProgressService } from "./project-progress.service";

@Controller("cms/works/:workId")
export class ProjectProgressController {
  constructor(private readonly service: ProjectProgressService) {}

  @Get("progress")
  @RequirePermissions("cms.work.read")
  progress(@Param("workId") workId: string, @CurrentUser() user: AuthUser) {
    return this.service.progress(user.organizationId, workId);
  }
}
