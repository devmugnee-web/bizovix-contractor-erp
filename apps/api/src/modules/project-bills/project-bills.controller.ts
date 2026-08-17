import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { ProjectBillsService } from "./project-bills.service";
import { SaveProjectBillDto } from "./dto/save-project-bill.dto";
import { QueryProjectBillDto } from "./dto/query-project-bill.dto";

@Controller("project-bills")
export class ProjectBillsController {
  constructor(private readonly service: ProjectBillsService) {}

  @Get()
  @RequirePermissions("project_bill.read")
  findAll(@Query() query: QueryProjectBillDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("project_bill.read")
  stats(@Query("cmsWorkId") cmsWorkId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.stats(user.organizationId, cmsWorkId);
  }

  @Get(":id")
  @RequirePermissions("project_bill.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("project_bill.create")
  @ResponseMessage("Running Bill saved as draft")
  create(@Body() dto: SaveProjectBillDto, @CurrentUser() user: AuthUser) {
    return this.service.saveDraft(user.organizationId, user.id, null, dto);
  }

  @Patch(":id")
  @RequirePermissions("project_bill.update")
  @ResponseMessage("Running Bill updated successfully")
  update(@Param("id") id: string, @Body() dto: SaveProjectBillDto, @CurrentUser() user: AuthUser) {
    return this.service.saveDraft(user.organizationId, user.id, id, dto);
  }

  @Post(":id/submit")
  @RequirePermissions("project_bill.submit")
  @ResponseMessage("Running Bill submitted successfully")
  submit(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.submit(user.organizationId, user.id, id);
  }

  @Post(":id/start-review")
  @RequirePermissions("project_bill.certify")
  @ResponseMessage("Running Bill moved to review")
  startReview(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.startReview(user.organizationId, user.id, id);
  }

  @Post(":id/reject")
  @RequirePermissions("project_bill.certify")
  @ResponseMessage("Running Bill rejected")
  reject(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.reject(user.organizationId, user.id, id);
  }

  @Post(":id/certify")
  @RequirePermissions("project_bill.certify")
  @ResponseMessage("Running Bill certified successfully")
  certify(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.certify(user.organizationId, user.id, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("project_bill.cancel")
  @ResponseMessage("Running Bill cancelled")
  cancel(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.cancel(user.organizationId, user.id, id);
  }
}
