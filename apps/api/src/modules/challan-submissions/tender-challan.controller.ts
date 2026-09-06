import { Controller, Get, Param, Query, Res } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { PaginationQueryDto } from "../../common/dto/pagination-query.dto";
import { TenderChallanService } from "./tender-challan.service";
import { TenderChallanPdfDto } from "./dto/tender-challan-pdf.dto";
import { sendWordDocument } from "../../common/documents/word-letter";

@Controller("challan-submissions/costing/tenders")
@RequirePermissions("challan_submission.read", "tender.costing.read")
export class TenderChallanController {
  constructor(private readonly service: TenderChallanService) {}

  @Get()
  list(@Query() query: PaginationQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.list(user.organizationId, query);
  }

  @Get(":costingId")
  report(@Param("costingId") costingId: string, @CurrentUser() user: AuthUser) {
    return this.service.report(user.organizationId, costingId);
  }

  @Get(":costingId/pdf")
  async pdf(@Param("costingId") costingId: string, @Query() options: TenderChallanPdfDto, @CurrentUser() user: AuthUser, @Res() response: Response) {
    const { buffer, tenderNumber } = await this.service.pdf(user.organizationId, costingId, options);
    const filename = `challan-${(tenderNumber || costingId).replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
    response.setHeader("Content-Length", String(buffer.length));
    response.setHeader("Cache-Control", "private, no-store");
    response.send(buffer);
  }

  @Get(":costingId/word")
  async word(@Param("costingId") costingId: string, @Query() options: TenderChallanPdfDto, @CurrentUser() user: AuthUser, @Res() response: Response) {
    const { buffer, tenderNumber } = await this.service.word(user.organizationId, costingId, options);
    sendWordDocument(response, buffer, `challan-${tenderNumber || costingId}.docx`);
  }
}
