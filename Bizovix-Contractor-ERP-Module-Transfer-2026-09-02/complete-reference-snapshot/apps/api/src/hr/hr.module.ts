import { Module } from "@nestjs/common";

import { PrismaModule } from "../prisma/prisma.module.js";
import { HrController } from "./hr.controller.js";
import { HrService } from "./hr.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
