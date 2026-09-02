import { Module } from "@nestjs/common";

import { PermissionsService } from "../common/services/permissions.service.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RecycleBinModule } from "../recycle-bin/recycle-bin.module.js";
import { MastersController } from "./masters.controller.js";
import { MastersService } from "./masters.service.js";

@Module({
  imports: [PrismaModule, RecycleBinModule, InventoryModule],
  controllers: [MastersController],
  providers: [MastersService, PermissionsService],
  exports: [MastersService],
})
export class MastersModule {}
