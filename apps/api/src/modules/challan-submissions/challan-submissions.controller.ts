import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import { ChallanSubmissionsService } from "./challan-submissions.service";
import { ApproveChallanSubmissionDto, ChallanActionReasonDto } from "./dto/challan-action.dto";
import { QueryChallanSubmissionDto } from "./dto/query-challan-submission.dto";
import {
  SaveChallanSubmissionDto,
  UpdateChallanSubmissionDto,
} from "./dto/save-challan-submission.dto";

@Controller("challan-submissions")
export class ChallanSubmissionsController {
  constructor(private readonly service: ChallanSubmissionsService) {}

  @Get()
  @RequirePermissions("challan_submission.read")
  findAll(@Query() query: QueryChallanSubmissionDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("challan_submission.read")
  stats(@Query("cmsWorkId") cmsWorkId: string | undefined, @CurrentUser() user: AuthUser) {
    return this.service.stats(user.organizationId, cmsWorkId);
  }

  @Get("number-preview")
  @RequirePermissions("challan_submission.read")
  numberPreview(@CurrentUser() user: AuthUser) {
    return this.service.numberPreview(user.organizationId);
  }

  @Get(":id")
  @RequirePermissions("challan_submission.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("challan_submission.create")
  @ResponseMessage("Challan Submission saved as draft")
  create(@Body() dto: SaveChallanSubmissionDto, @CurrentUser() user: AuthUser) {
    return this.service.createDraft(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("challan_submission.update")
  @ResponseMessage("Challan Submission updated successfully")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateChallanSubmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateDraft(user.organizationId, user.id, id, dto);
  }

  @Post(":id/submit")
  @RequirePermissions("challan_submission.submit")
  @ResponseMessage("Challan submitted for review")
  submit(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.submit(user.organizationId, user.id, id);
  }

  @Post(":id/start-review")
  @RequirePermissions("challan_submission.review")
  @ResponseMessage("Challan review started")
  startReview(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.startReview(user.organizationId, user.id, id);
  }

  @Post(":id/approve")
  @RequirePermissions("challan_submission.approve")
  @ResponseMessage("Challan approved successfully")
  approve(
    @Param("id") id: string,
    @Body() dto: ApproveChallanSubmissionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.approve(user.organizationId, user.id, id, dto);
  }

  @Post(":id/reject")
  @RequirePermissions("challan_submission.reject")
  @ResponseMessage("Challan rejected")
  reject(
    @Param("id") id: string,
    @Body() dto: ChallanActionReasonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reject(user.organizationId, user.id, id, dto.reason);
  }

  @Post(":id/release-payment")
  @RequirePermissions("challan_submission.release_payment")
  @ResponseMessage("Challan payment released")
  releasePayment(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.releasePayment(user.organizationId, user.id, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("challan_submission.cancel")
  @ResponseMessage("Challan cancelled")
  cancel(
    @Param("id") id: string,
    @Body() dto: ChallanActionReasonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.cancel(user.organizationId, user.id, id, dto.reason);
  }
}
