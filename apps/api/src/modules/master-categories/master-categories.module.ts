import { Module } from "@nestjs/common";
import { AuditLogModule } from "../audit-logs/audit-log.module";
import { MasterCategoriesController } from "./master-categories.controller";
import { MasterCategoriesService } from "./master-categories.service";

@Module({
  imports: [AuditLogModule],
  controllers: [MasterCategoriesController],
  providers: [MasterCategoriesService],
  exports: [MasterCategoriesService],
})
export class MasterCategoriesModule {}
