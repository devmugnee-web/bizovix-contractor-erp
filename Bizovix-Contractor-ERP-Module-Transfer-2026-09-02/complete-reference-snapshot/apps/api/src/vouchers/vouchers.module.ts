import { Module } from "@nestjs/common";

import { AccountingModule } from "../accounting/accounting.module.js";
import { PermissionsService } from "../common/services/permissions.service.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RecycleBinModule } from "../recycle-bin/recycle-bin.module.js";
import { VouchersController } from "./vouchers.controller.js";
import { VouchersService } from "./vouchers.service.js";

@Module({
  imports: [PrismaModule, AccountingModule, RecycleBinModule, InventoryModule],
  controllers: [VouchersController],
  providers: [VouchersService, PermissionsService],
  exports: [VouchersService],
})
export class VouchersModule {}
