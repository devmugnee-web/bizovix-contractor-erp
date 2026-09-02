import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PostingEngineService } from "./posting-engine.service.js";

@Module({
  imports: [PrismaModule, InventoryModule],
  providers: [PostingEngineService],
  exports: [PostingEngineService],
})
export class AccountingModule {}
