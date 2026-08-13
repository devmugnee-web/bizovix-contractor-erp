import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { DocumentPurchasesController } from "./document-purchases.controller";
import { DocumentPurchasesService } from "./document-purchases.service";

@Module({
  imports: [AuditLogModule],
  controllers: [DocumentPurchasesController],
  providers: [DocumentPurchasesService],
})
export class DocumentPurchasesModule {}
