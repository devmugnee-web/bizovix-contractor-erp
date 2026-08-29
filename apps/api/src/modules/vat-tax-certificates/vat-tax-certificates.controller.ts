import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type { AuthUser } from "@bizovix/types";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermissions } from "../../common/decorators/require-permissions.decorator";
import { ResponseMessage } from "../../common/decorators/response-message.decorator";
import {
  QueryRecentVatTaxCertificateDto,
  QueryVatTaxCertificateDto,
  QueryVatTaxCertificateStatsDto,
} from "./dto/query-vat-tax-certificate.dto";
import {
  SaveVatTaxCertificateDto,
  UpdateVatTaxCertificateDto,
} from "./dto/save-vat-tax-certificate.dto";
import { VatTaxCertificatesService } from "./vat-tax-certificates.service";

@Controller("vat-tax-certificates")
export class VatTaxCertificatesController {
  constructor(private readonly service: VatTaxCertificatesService) {}

  @Get()
  @RequirePermissions("vat_tax_certificate.read")
  findAll(@Query() query: QueryVatTaxCertificateDto, @CurrentUser() user: AuthUser) {
    return this.service.findAll(user.organizationId, query);
  }

  @Get("stats")
  @RequirePermissions("vat_tax_certificate.read")
  stats(@Query() query: QueryVatTaxCertificateStatsDto, @CurrentUser() user: AuthUser) {
    return this.service.stats(user.organizationId, query);
  }

  @Get("recent")
  @RequirePermissions("vat_tax_certificate.read")
  recent(@Query() query: QueryRecentVatTaxCertificateDto, @CurrentUser() user: AuthUser) {
    return this.service.recent(user.organizationId, query);
  }

  @Get("export")
  @RequirePermissions("vat_tax_certificate.export")
  exportCsv(@Query() query: QueryVatTaxCertificateDto, @CurrentUser() user: AuthUser) {
    return this.service.exportCsv(user.organizationId, user.id, query);
  }

  @Get(":id")
  @RequirePermissions("vat_tax_certificate.read")
  findOne(@Param("id") id: string, @CurrentUser() user: AuthUser) {
    return this.service.findOne(user.organizationId, id);
  }

  @Post()
  @RequirePermissions("vat_tax_certificate.create")
  @ResponseMessage("VAT-Tax Certificate created successfully")
  create(@Body() dto: SaveVatTaxCertificateDto, @CurrentUser() user: AuthUser) {
    return this.service.create(user.organizationId, user.id, dto);
  }

  @Patch(":id")
  @RequirePermissions("vat_tax_certificate.update")
  @ResponseMessage("VAT-Tax Certificate updated successfully")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateVatTaxCertificateDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(user.organizationId, user.id, id, dto);
  }
}
