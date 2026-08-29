import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { UpdateCompletionCertificateEgpDto } from "./dto/project-closing.dto";
import { QueryWorkCompletionCertificateDto } from "./dto/query-work-completion-certificate.dto";
import { WorkCompletionCertificatesService } from "./work-completion-certificates.service";

@Controller("work-completion-certificates")
export class WorkCompletionCertificatesController {
  constructor(private readonly service: WorkCompletionCertificatesService) {}

  @Get()
  @RequirePermissions("completion_certificate.read")
  findAll(
    @Query() query: QueryWorkCompletionCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("completion_certificate.read")
  stats(
    @Query() query: QueryWorkCompletionCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.stats(user.organizationId, query);
  }

  @Get(":workId")
  @RequirePermissions("completion_certificate.read")
  findOne(@Param("workId") workId: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, workId);
  }

  @Patch(":certificateId/egp-status")
  @RequirePermissions("completion_certificate.update")
  updateEgpTracking(
    @Param("certificateId") certificateId: string,
    @Body() dto: UpdateCompletionCertificateEgpDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.updateEgpTracking(
      user.organizationId,
      user.id,
      certificateId,
      dto,
    );
  }
}
