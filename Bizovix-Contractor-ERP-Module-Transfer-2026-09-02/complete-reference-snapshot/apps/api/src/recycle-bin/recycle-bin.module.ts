import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { RecycleBinController } from "./recycle-bin.controller.js";
import { RecycleBinService } from "./recycle-bin.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [RecycleBinController],
  providers: [RecycleBinService],
  exports: [RecycleBinService],
})
export class RecycleBinModule {}
