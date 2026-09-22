import { Module } from "@nestjs/common";
import { MasterCategoriesModule } from "../master-categories/master-categories.module";
import { DesktopSyncController } from "./desktop-sync.controller";
import { DesktopSyncService } from "./desktop-sync.service";
import { UomsModule } from "../uoms/uoms.module";
import { PaymentTermsModule } from "../payment-terms/payment-terms.module";
import { OrganizationsModule } from "../organizations/organizations.module";
import { DesktopMasterSyncController } from "./desktop-master-sync.controller";
import { DesktopMasterSyncService } from "./desktop-master-sync.service";

@Module({
  imports: [MasterCategoriesModule, UomsModule, PaymentTermsModule, OrganizationsModule],
  controllers: [DesktopSyncController, DesktopMasterSyncController],
  providers: [DesktopSyncService, DesktopMasterSyncService],
  exports: [DesktopSyncService, DesktopMasterSyncService],
})
export class DesktopSyncModule {}
