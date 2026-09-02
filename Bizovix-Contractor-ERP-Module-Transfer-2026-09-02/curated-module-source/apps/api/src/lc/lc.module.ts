import { Module } from "@nestjs/common";

import { AccountsModule } from "../accounts/accounts.module.js";
import { AccountingModule } from "../accounting/accounting.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { VouchersModule } from "../vouchers/vouchers.module.js";
import { LcController } from "./lc.controller.js";
import { LcService } from "./lc.service.js";

@Module({
  imports: [PrismaModule, AccountsModule, AccountingModule, AuditModule, InventoryModule, VouchersModule],
  controllers: [LcController],
  providers: [LcService],
  exports: [LcService],
})
export class LcModule {}
