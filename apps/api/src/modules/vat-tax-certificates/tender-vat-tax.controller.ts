import { Body, Controller, Get, Param, Patch, Post, Query, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { AuthUser } from "@bizovix/types";
import type { Response } from "express";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import type { UploadedDocumentFile } from "../documents/documents.service";
import { TenderVatTaxService } from "./tender-vat-tax.service";
import { CreateTenderTaxDto, TenderTaxQueryDto, UpdateTenderTaxDto, VoidTenderTaxDto } from "./dto/tender-vat-tax.dto";
import { tenderTaxPdf, tenderTaxExcel } from "./tender-vat-tax-export";

@Controller("tender-vat-tax")
@RequirePermissions("vat_tax_certificate.read")
export class TenderVatTaxController {
  constructor(private readonly service: TenderVatTaxService) {}
  @Get("tenders")
  list(@CurrentUser() u: AuthUser, @Query() q: TenderTaxQueryDto) { return this.service.list(u.organizationId, q); }
  @Get("tenders/:id")
  detail(@CurrentUser() u: AuthUser, @Param("id") id: string, @Query() q: TenderTaxQueryDto) { return this.service.detail(u.organizationId, id, q); }
  @Post("tenders/:id/entries") @RequirePermissions("vat_tax_certificate.read", "vat_tax_certificate.create")
  create(@CurrentUser() u: AuthUser, @Param("id") id: string, @Body() dto: CreateTenderTaxDto) { return this.service.create(u.organizationId, u.id, id, dto); }
  @Patch("entries/:id") @RequirePermissions("vat_tax_certificate.read", "vat_tax_certificate.update")
  update(@CurrentUser() u: AuthUser, @Param("id") id: string, @Body() dto: UpdateTenderTaxDto) { return this.service.update(u.organizationId, u.id, id, dto); }
  @Post("entries/:id/void") @RequirePermissions("vat_tax_certificate.read", "vat_tax_certificate.update")
  void(@CurrentUser() u: AuthUser, @Param("id") id: string, @Body() dto: VoidTenderTaxDto) { return this.service.void(u.organizationId, u.id, id, dto); }
  @Post("entries/:id/documents") @RequirePermissions("vat_tax_certificate.read", "vat_tax_certificate.update", "documents.upload")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(@CurrentUser() u: AuthUser, @Param("id") id: string, @UploadedFile() file?: UploadedDocumentFile) { return this.service.upload(u.organizationId, u.id, u.name, id, file); }
  private async download(u: AuthUser, q: TenderTaxQueryDto, res: Response, format: "pdf" | "xlsx", tenderId?: string) {
    const report = await this.service.exportData(u.organizationId, q, tenderId);
    const buffer = format === "pdf" ? await tenderTaxPdf(report) : await tenderTaxExcel(report);
    res.setHeader("Content-Type", format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="tender-vat-tax-${q.dateFrom || "all"}-${q.dateTo || "dates"}.${format}"`);
    res.setHeader("Access-Control-Expose-Headers", "Content-Disposition"); res.setHeader("Cache-Control", "private, no-store"); res.send(buffer);
  }
  @Get("export/pdf") @RequirePermissions("vat_tax_certificate.read", "vat_tax_certificate.export")
  pdf(@CurrentUser() u: AuthUser, @Query() q: TenderTaxQueryDto, @Res() res: Response) { return this.download(u, q, res, "pdf"); }
  @Get("export/xlsx") @RequirePermissions("vat_tax_certificate.read", "vat_tax_certificate.export")
  excel(@CurrentUser() u: AuthUser, @Query() q: TenderTaxQueryDto, @Res() res: Response) { return this.download(u, q, res, "xlsx"); }
  @Get("tenders/:id/export/pdf") @RequirePermissions("vat_tax_certificate.read", "vat_tax_certificate.export")
  tenderPdf(@CurrentUser() u: AuthUser, @Param("id") id: string, @Query() q: TenderTaxQueryDto, @Res() res: Response) { return this.download(u, q, res, "pdf", id); }
  @Get("tenders/:id/export/xlsx") @RequirePermissions("vat_tax_certificate.read", "vat_tax_certificate.export")
  tenderExcel(@CurrentUser() u: AuthUser, @Param("id") id: string, @Query() q: TenderTaxQueryDto, @Res() res: Response) { return this.download(u, q, res, "xlsx", id); }
}
