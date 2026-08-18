import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PaymentTermsController } from "./payment-terms.controller";
import { PaymentTermsService } from "./payment-terms.service";

@Module({
  imports: [AuditLogModule],
  controllers: [PaymentTermsController],
  providers: [PaymentTermsService],
  exports: [PaymentTermsService],
})
export class PaymentTermsModule {}
