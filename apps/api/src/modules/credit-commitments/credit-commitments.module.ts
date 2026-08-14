import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { PrismaModule } from "../prisma/prisma.module";
import { CreditCommitmentsController } from "./credit-commitments.controller";
import { CreditCommitmentsService } from "./credit-commitments.service";

@Module({
  imports: [PrismaModule, AuditLogModule],
  controllers: [CreditCommitmentsController],
  providers: [CreditCommitmentsService],
})
export class CreditCommitmentsModule {}
