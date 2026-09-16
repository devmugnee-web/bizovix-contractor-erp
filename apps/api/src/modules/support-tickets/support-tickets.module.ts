import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SupportTicketsController, VendorSupportTicketsController } from "./support-tickets.controller";
import { SupportTicketsService } from "./support-tickets.service";

@Module({
  imports: [PrismaModule],
  controllers: [SupportTicketsController, VendorSupportTicketsController],
  providers: [SupportTicketsService],
})
export class SupportTicketsModule {}
