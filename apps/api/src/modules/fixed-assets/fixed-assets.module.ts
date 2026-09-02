import { Module } from "@nestjs/common";
import { AccountingModule } from "../accounting/accounting.module";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { CashBankModule } from "../cash-bank/cash-bank.module";
import { NumberingModule } from "../settings-numbering/numbering.module";
import { FixedAssetsController } from "./fixed-assets.controller";
import { FixedAssetsService } from "./fixed-assets.service";

@Module({
  imports: [AccountingModule, AuditLogModule, CashBankModule, NumberingModule],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService],
})
export class FixedAssetsModule {}
