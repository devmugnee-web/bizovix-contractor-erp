import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { ProjectLifecycleGuardService } from "./project-lifecycle-guard.service";

@Global()
@Module({
  providers: [PrismaService, ProjectLifecycleGuardService],
  exports: [PrismaService, ProjectLifecycleGuardService],
})
export class PrismaModule {}
