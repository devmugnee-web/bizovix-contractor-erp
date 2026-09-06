import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { VatTaxCertificatesController } from "./vat-tax-certificates.controller";
import { VatTaxCertificatesService } from "./vat-tax-certificates.service";
import { DocumentsModule } from "../documents/documents.module";
import { TenderVatTaxController } from "./tender-vat-tax.controller";
import { TenderVatTaxService } from "./tender-vat-tax.service";

@Module({
  imports: [AuditLogModule, DocumentsModule],
  controllers: [VatTaxCertificatesController, TenderVatTaxController],
  providers: [VatTaxCertificatesService, TenderVatTaxService],
  exports: [VatTaxCertificatesService],
})
export class VatTaxCertificatesModule {}
