import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { VatTaxCertificatesController } from "./vat-tax-certificates.controller";
import { VatTaxCertificatesService } from "./vat-tax-certificates.service";

@Module({
  imports: [AuditLogModule],
  controllers: [VatTaxCertificatesController],
  providers: [VatTaxCertificatesService],
  exports: [VatTaxCertificatesService],
})
export class VatTaxCertificatesModule {}
