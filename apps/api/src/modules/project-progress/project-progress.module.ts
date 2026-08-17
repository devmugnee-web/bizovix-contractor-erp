import { Module } from "@nestjs/common";
import { ProjectBillsModule } from "../project-bills/project-bills.module";
import { ProjectProgressController } from "./project-progress.controller";
import { ProjectProgressService } from "./project-progress.service";

@Module({
  imports: [ProjectBillsModule],
  controllers: [ProjectProgressController],
  providers: [ProjectProgressService],
})
export class ProjectProgressModule {}
