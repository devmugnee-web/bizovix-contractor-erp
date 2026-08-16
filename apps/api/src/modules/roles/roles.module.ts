import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";

@Module({
  imports: [AuditLogModule],
  controllers: [RolesController],
  providers: [RolesService],
})
export class RolesModule {}
