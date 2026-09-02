import { Module } from "@nestjs/common";

import { AccountingModule } from "../accounting/accounting.module.js";
import { AccountsModule } from "../accounts/accounts.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { VouchersModule } from "../vouchers/vouchers.module.js";
import { FixedAssetsController } from "./fixed-assets.controller.js";
import { FixedAssetsService } from "./fixed-assets.service.js";

@Module({
  imports: [PrismaModule, AccountingModule, AccountsModule, VouchersModule],
  controllers: [FixedAssetsController],
  providers: [FixedAssetsService],
  exports: [FixedAssetsService],
})
export class FixedAssetsModule {}
