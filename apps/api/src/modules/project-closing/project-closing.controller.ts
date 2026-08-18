import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ProjectClosingService } from "./project-closing.service";
import {
  CertificateStatusDto,
  CloseProjectDto,
  CreateDefectDto,
  CreateDlpDto,
  CreateHandoverDto,
  CreateRetentionReleaseDto,
  DefectStatusDto,
  ExtendDlpDto,
  ReopenProjectDto,
  SaveCompletionCertificateDto,
  UpdateCompletionCertificateDto,
  ArchiveProjectDto,
} from "./dto/project-closing.dto";

@Controller("project-closing")
export class ProjectClosingController {
  constructor(private readonly service: ProjectClosingService) {}

  @Get(":workId") @RequirePermissions("project_close.read") overview(
    @Param("workId") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.overview(user.organizationId, id);
  }
  @Patch("certificates/:id") @RequirePermissions("completion_certificate.update") updateCertificate(
    @Param("id") id: string,
    @Body() dto: UpdateCompletionCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateCertificate(user.organizationId, user.id, id, dto);
  }
  @Get(":workId/readiness") @RequirePermissions("project_close.read") readiness(
    @Param("workId") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.readiness(user.organizationId, id);
  }
  @Get(":workId/readiness-snapshot") @RequirePermissions("project_close.read") snapshot(
    @Param("workId") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.latestReadinessSnapshot(user.organizationId, id);
  }
  @Get(":workId/profitability") @RequirePermissions("report.view") profitability(
    @Param("workId") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.profitability(user.organizationId, id);
  }

  @Post(":workId/certificates") @RequirePermissions("completion_certificate.create") certificate(
    @Param("workId") id: string,
    @Body() dto: SaveCompletionCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.saveCertificate(user.organizationId, user.id, id, dto);
  }
  @Patch("certificates/:id/status")
  @RequirePermissions("completion_certificate.approve")
  certificateStatus(
    @Param("id") id: string,
    @Body() dto: CertificateStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.certificateStatus(user.organizationId, user.id, id, dto);
  }

  @Post(":workId/dlp") @RequirePermissions("dlp.manage") dlp(
    @Param("workId") id: string,
    @Body() dto: CreateDlpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createDlp(user.organizationId, user.id, id, dto);
  }
  @Post("dlp/:id/extend") @RequirePermissions("dlp.manage") extendDlp(
    @Param("id") id: string,
    @Body() dto: ExtendDlpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.extendDlp(user.organizationId, user.id, id, dto);
  }
  @Post("dlp/:id/complete") @RequirePermissions("dlp.manage") completeDlp(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.completeDlp(user.organizationId, user.id, id);
  }

  @Post(":workId/defects") @RequirePermissions("defect.manage") defect(
    @Param("workId") id: string,
    @Body() dto: CreateDefectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createDefect(user.organizationId, user.id, id, dto);
  }
  @Patch("defects/:id/status") @RequirePermissions("defect.manage") defectStatus(
    @Param("id") id: string,
    @Body() dto: DefectStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.defectStatus(user.organizationId, user.id, id, dto);
  }

  @Post(":workId/retention-releases") @RequirePermissions("retention.release") retention(
    @Param("workId") id: string,
    @Body() dto: CreateRetentionReleaseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createRetentionRelease(user.organizationId, user.id, id, dto);
  }
  @Post("retention-releases/:id/release") @RequirePermissions("retention.release") releaseRetention(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.releaseRetention(user.organizationId, user.id, id);
  }

  @Post(":workId/handovers") @RequirePermissions("handover.manage") handover(
    @Param("workId") id: string,
    @Body() dto: CreateHandoverDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.createHandover(user.organizationId, user.id, id, dto);
  }
  @Post("handovers/:id/complete") @RequirePermissions("handover.manage") completeHandover(
    @Param("id") id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.completeHandover(user.organizationId, user.id, id);
  }

  @Post(":workId/close") @RequirePermissions("project_close.close") close(
    @Param("workId") id: string,
    @Body() dto: CloseProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.close(user.organizationId, user.id, id, dto, false);
  }
  @Post(":workId/override-close") @RequirePermissions("project_close.override") overrideClose(
    @Param("workId") id: string,
    @Body() dto: CloseProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.close(user.organizationId, user.id, id, { ...dto, override: true }, true);
  }
  @Post(":workId/reopen") @RequirePermissions("project_close.reopen") reopen(
    @Param("workId") id: string,
    @Body() dto: ReopenProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reopen(user.organizationId, user.id, id, dto);
  }
  @Post(":workId/archive") @RequirePermissions("project_close.archive") archive(
    @Param("workId") id: string,
    @Body() dto: ArchiveProjectDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.archive(user.organizationId, user.id, id, dto);
  }
}
