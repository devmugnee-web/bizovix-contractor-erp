import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { BillingController } from "./billing.controller";
import { BillingService } from "./billing.service";
import { PlanLimitsService } from "./plan-limits.service";
import { BillingProfileController } from "./billing-profile.controller";
import { BillingProfileService } from "./billing-profile.service";
import { InvoicesController } from "./invoices.controller";
import { InvoicesService } from "./invoices.service";

@Module({
  imports: [AuditLogModule, NumberingModule],
  controllers: [BillingController, BillingProfileController, InvoicesController],
  providers: [BillingService, PlanLimitsService, BillingProfileService, InvoicesService],
  exports: [BillingService, PlanLimitsService],
})
export class BillingModule {}
