import { BadRequestException, Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ProjectCostingReportService } from "./project-costing-report.service";
import { generateProjectCostingPdf } from "./project-costing-pdf";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";

@Controller("project-bills/projects")
@RequirePermissions("cms.work.read", "project_bill.read", "boq.read")
export class ProjectCostingReportController {
  constructor(private readonly service: ProjectCostingReportService) {}

  @Get(":workId/costing")
  report(@Param("workId") workId: string, @CurrentUser() user: AuthUser) {
    return this.service.report(user.organizationId, workId);
  }

  @Get(":workId/costing/pdf")
  async pdf(@Param("workId") workId: string, @CurrentUser() user: AuthUser, @Res() response: Response) {
    const report = await this.service.report(user.organizationId, workId);
    if (!report.rows.length) throw new BadRequestException("No saved BOQ items are available for this project");
    const buffer = await generateProjectCostingPdf(report);
    const filename = `project-costing-${(report.tenderNumber || workId).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    response.setHeader("Content-Length", String(buffer.length));
    response.setHeader("Cache-Control", "private, no-store");
    response.send(buffer);
  }
}

@Controller("project-bills/costing/tenders")
@RequirePermissions("project_bill.read", "tender.costing.read")
export class TenderBillCostingController {
  constructor(private readonly service: ProjectCostingReportService) {}

  @Get()
  list(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.costedTenders(user.organizationId, query);
  }

  @Get(":costingId")
  report(@Param("costingId") costingId: string, @CurrentUser() user: AuthUser) {
    return this.service.tenderReport(user.organizationId, costingId);
  }

  @Get(":costingId/pdf")
  async pdf(@Param("costingId") costingId: string, @CurrentUser() user: AuthUser, @Res() response: Response) {
    const report = await this.service.tenderReport(user.organizationId, costingId);
    if (!report.rows.length) throw new BadRequestException("No saved costing items are available for this tender");
    const context = await this.service.tenderPdfContext(user.organizationId, costingId, report.project.id);
    const buffer = await generateProjectCostingPdf(report, context);
    const filename = `tender-costing-${(report.tenderNumber || costingId).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    response.setHeader("Content-Length", String(buffer.length));
    response.setHeader("Cache-Control", "private, no-store");
    response.send(buffer);
  }
}
