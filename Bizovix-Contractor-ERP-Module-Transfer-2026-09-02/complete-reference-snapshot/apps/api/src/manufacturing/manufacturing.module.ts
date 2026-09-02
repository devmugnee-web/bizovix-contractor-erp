import { Module } from "@nestjs/common";

import { PermissionsService } from "../common/services/permissions.service.js";
import { InventoryModule } from "../inventory/inventory.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { ManufacturingBlueprintController } from "./manufacturing-blueprint.controller.js";
import { ManufacturingBlueprintService } from "./manufacturing-blueprint.service.js";
import { ManufacturingCostReportController } from "./manufacturing-cost-report.controller.js";
import { ManufacturingCostReportService } from "./manufacturing-cost-report.service.js";
import { ManufacturingController } from "./manufacturing.controller.js";
import { ManufacturingDowntimeController } from "./manufacturing-downtime.controller.js";
import { ManufacturingDowntimeService } from "./manufacturing-downtime.service.js";
import { ManufacturingGovernanceController } from "./manufacturing-governance.controller.js";
import { ManufacturingGovernanceService } from "./manufacturing-governance.service.js";
import { ManufacturingMaterialsController } from "./manufacturing-materials.controller.js";
import { ManufacturingMaterialsService } from "./manufacturing-materials.service.js";
import { ManufacturingMaterialExceptionsController } from "./manufacturing-material-exceptions.controller.js";
import { ManufacturingMaterialExceptionsService } from "./manufacturing-material-exceptions.service.js";
import { ManufacturingPackagingController } from "./manufacturing-packaging.controller.js";
import { ManufacturingPackagingService } from "./manufacturing-packaging.service.js";
import { ManufacturingPlanningController } from "./manufacturing-planning.controller.js";
import { ManufacturingPlanningService } from "./manufacturing-planning.service.js";
import { ManufacturingService } from "./manufacturing.service.js";
import { ManufacturingApprovalWorkflowService } from "./manufacturing-approval-workflow.service.js";
import { ManufacturingElectronicSignatureService } from "./manufacturing-electronic-signature.service.js";
import { ManufacturingExecutionTransferController } from "./manufacturing-execution-transfer.controller.js";
import { ManufacturingExecutionTransferService } from "./manufacturing-execution-transfer.service.js";
import { ManufacturingWorkflowController } from "./manufacturing-workflow.controller.js";
import { ManufacturingWorkflowService } from "./manufacturing-workflow.service.js";

@Module({
  imports: [PrismaModule, InventoryModule],
  controllers: [
    ManufacturingController,
    ManufacturingPlanningController,
    ManufacturingBlueprintController,
    ManufacturingCostReportController,
    ManufacturingGovernanceController,
    ManufacturingMaterialsController,
    ManufacturingMaterialExceptionsController,
    ManufacturingPackagingController,
    ManufacturingExecutionTransferController,
    ManufacturingDowntimeController,
    ManufacturingWorkflowController,
  ],
  providers: [
    ManufacturingService,
    ManufacturingApprovalWorkflowService,
    ManufacturingElectronicSignatureService,
    ManufacturingPlanningService,
    ManufacturingBlueprintService,
    ManufacturingCostReportService,
    ManufacturingGovernanceService,
    ManufacturingMaterialsService,
    ManufacturingMaterialExceptionsService,
    ManufacturingPackagingService,
    ManufacturingExecutionTransferService,
    ManufacturingDowntimeService,
    ManufacturingWorkflowService,
    PermissionsService,
  ],
  exports: [
    ManufacturingService,
    ManufacturingPlanningService,
    ManufacturingBlueprintService,
    ManufacturingCostReportService,
    ManufacturingGovernanceService,
    ManufacturingMaterialsService,
    ManufacturingMaterialExceptionsService,
    ManufacturingPackagingService,
    ManufacturingExecutionTransferService,
    ManufacturingDowntimeService,
    ManufacturingWorkflowService,
  ],
})
export class ManufacturingModule {}
