import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { CloudSyncController } from "./cloud-sync.controller.js";
import { CloudSyncService } from "./cloud-sync.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [CloudSyncController],
  providers: [CloudSyncService],
})
export class CloudSyncModule {}
