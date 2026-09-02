-- CreateEnum
CREATE TYPE "ManufacturingMode" AS ENUM ('GENERAL', 'PHARMACEUTICAL', 'HYBRID');

-- CreateEnum
CREATE TYPE "ManufacturingItemRole" AS ENUM ('RAW_MATERIAL', 'PACKAGING_MATERIAL', 'INTERMEDIATE', 'BULK', 'FINISHED_GOOD', 'BY_PRODUCT', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "ManufacturingMakeBuy" AS ENUM ('MAKE', 'BUY', 'BOTH');

-- CreateEnum
CREATE TYPE "ManufacturingLocationDisposition" AS ENUM ('RELEASED', 'RESERVED', 'STAGING', 'WIP', 'QC_HOLD', 'REWORK', 'REJECTED', 'SCRAP');

-- CreateEnum
CREATE TYPE "ManufacturingVersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'RETIRED');

-- CreateEnum
CREATE TYPE "ManufacturingPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'RELEASED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ManufacturingLotStatus" AS ENUM ('PLANNED', 'RELEASED', 'IN_PRODUCTION', 'QC_HOLD', 'COMPLETED', 'CANCELLED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ManufacturingMrpRunStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ManufacturingOrderType" AS ENUM ('ASSEMBLY', 'PHARMACEUTICAL', 'PACKAGING', 'REWORK', 'REPROCESSING', 'SUBCONTRACT');

-- CreateEnum
CREATE TYPE "ManufacturingOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'RESERVED', 'ISSUED', 'IN_PRODUCTION', 'QC_HOLD', 'QA_RELEASED', 'COMPLETED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManufacturingMaterialStatus" AS ENUM ('PLANNED', 'PARTIALLY_RESERVED', 'RESERVED', 'PARTIALLY_ISSUED', 'ISSUED', 'PARTIALLY_RETURNED', 'RETURNED', 'CONSUMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManufacturingReservationStatus" AS ENUM ('ACTIVE', 'PARTIALLY_ISSUED', 'ISSUED', 'RELEASED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManufacturingTransactionType" AS ENUM ('MATERIAL_REQUISITION', 'MATERIAL_ISSUE', 'MATERIAL_RETURN', 'PACKAGING_ISSUE', 'PACKAGING_RETURN', 'PRODUCTION_RECEIPT', 'SCRAP_RECEIPT', 'REWORK_RECEIPT', 'QA_RELEASE', 'LOCATION_TRANSFER');

-- CreateEnum
CREATE TYPE "ManufacturingTransactionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'POSTED', 'CANCELLED', 'REVERSED');

-- CreateEnum
CREATE TYPE "ManufacturingOperationStatus" AS ENUM ('PENDING', 'READY', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'SKIPPED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ManufacturingQualityInspectionType" AS ENUM ('IN_PROCESS', 'FINISHED_GOOD', 'PACKAGING', 'RELEASE');

-- CreateEnum
CREATE TYPE "ManufacturingQualityStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'PASSED', 'FAILED', 'HOLD', 'WAIVED');

-- CreateEnum
CREATE TYPE "ManufacturingSerialStatus" AS ENUM ('CREATED', 'QC_HOLD', 'RELEASED', 'REWORK', 'SCRAPPED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "ManufacturingSerialMovementRole" AS ENUM ('INPUT', 'OUTPUT');

-- CreateEnum
CREATE TYPE "ManufacturingCostStatus" AS ENUM ('DRAFT', 'PROVISIONAL', 'FINALIZED', 'VOIDED');

-- CreateEnum
CREATE TYPE "ManufacturingCostType" AS ENUM ('MATERIAL', 'LABOUR', 'MACHINE', 'OVERHEAD', 'PACKAGING', 'SUBCONTRACT', 'OTHER', 'SCRAP_RECOVERY', 'VARIANCE');

-- CreateEnum
CREATE TYPE "ManufacturingWorkflowOutcome" AS ENUM ('EXECUTED', 'ZERO_REVIEW', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "ManufacturingWorkflowReviewStatus" AS ENUM ('PENDING', 'REVIEWED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "manufacturingTransactionLineId" TEXT;

-- CreateTable
CREATE TABLE "ManufacturingSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mode" "ManufacturingMode" NOT NULL DEFAULT 'GENERAL',
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "quantityScale" INTEGER NOT NULL DEFAULT 4,
    "costScale" INTEGER NOT NULL DEFAULT 6,
    "blockNegativeStock" BOOLEAN NOT NULL DEFAULT true,
    "reservationRequired" BOOLEAN NOT NULL DEFAULT true,
    "issueBeforeOperationStart" BOOLEAN NOT NULL DEFAULT true,
    "allowPartialCompletion" BOOLEAN NOT NULL DEFAULT true,
    "allowProvisionalCost" BOOLEAN NOT NULL DEFAULT true,
    "requireQcBeforeRelease" BOOLEAN NOT NULL DEFAULT true,
    "requireSerialBeforeRelease" BOOLEAN NOT NULL DEFAULT false,
    "electronicSignatureRequired" BOOLEAN NOT NULL DEFAULT true,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
    "defaultRawMaterialWarehouseId" TEXT,
    "defaultWipWarehouseId" TEXT,
    "defaultFinishedGoodsWarehouseId" TEXT,
    "defaultFinishedGoodsReleasedWarehouseId" TEXT,
    "defaultRejectedWarehouseId" TEXT,
    "defaultScrapWarehouseId" TEXT,
    "defaultRawMaterialLocationId" TEXT,
    "defaultWipLocationId" TEXT,
    "defaultFinishedGoodsHoldLocationId" TEXT,
    "defaultFinishedGoodsReleaseLocationId" TEXT,
    "rawMaterialInventoryAccountId" TEXT,
    "packagingInventoryAccountId" TEXT,
    "wipInventoryAccountId" TEXT,
    "finishedGoodsInventoryAccountId" TEXT,
    "manufacturingVarianceAccountId" TEXT,
    "labourClearingAccountId" TEXT,
    "overheadAbsorptionAccountId" TEXT,
    "scrapRecoveryAccountId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingItemProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "role" "ManufacturingItemRole" NOT NULL,
    "makeBuy" "ManufacturingMakeBuy" NOT NULL DEFAULT 'BUY',
    "lotTracked" BOOLEAN NOT NULL DEFAULT false,
    "serialTracked" BOOLEAN NOT NULL DEFAULT false,
    "expiryTracked" BOOLEAN NOT NULL DEFAULT false,
    "qcRequired" BOOLEAN NOT NULL DEFAULT false,
    "shelfLifeDays" INTEGER,
    "standardYieldPercent" DECIMAL(9,6) NOT NULL DEFAULT 100,
    "defaultIssueLocationId" TEXT,
    "defaultReceiptLocationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingItemProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "disposition" "ManufacturingLocationDisposition" NOT NULL DEFAULT 'RELEASED',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingBom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingBom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingBomVersion" (
    "id" TEXT NOT NULL,
    "bomId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ManufacturingVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "outputQuantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
    "outputUnit" TEXT NOT NULL DEFAULT 'pcs',
    "expectedYieldPercent" DECIMAL(9,6) NOT NULL DEFAULT 100,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "changeReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingBomVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingBomComponent" (
    "id" TEXT NOT NULL,
    "bomVersionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "issueLocationId" TEXT,
    "quantityPerOutput" DECIMAL(18,6) NOT NULL,
    "fixedQuantity" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "scrapPercent" DECIMAL(9,6) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "allowSubstitute" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingBomComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingRouting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingRouting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingRoutingVersion" (
    "id" TEXT NOT NULL,
    "routingId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ManufacturingVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "changeReason" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingRoutingVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingRoutingOperation" (
    "id" TEXT NOT NULL,
    "routingVersionId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workCenterCode" TEXT,
    "productionLineCode" TEXT,
    "setupMinutes" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "runMinutesPerUnit" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "queueMinutes" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "isSubcontracted" BOOLEAN NOT NULL DEFAULT false,
    "qcRequired" BOOLEAN NOT NULL DEFAULT false,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingRoutingOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planNumber" TEXT NOT NULL,
    "finishedProductId" TEXT NOT NULL,
    "bomVersionId" TEXT NOT NULL,
    "routingVersionId" TEXT,
    "status" "ManufacturingPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "plannedStartDate" DATE NOT NULL,
    "plannedEndDate" DATE NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingPlanLot" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "lotNumber" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "plannedStartDate" DATE,
    "plannedEndDate" DATE,
    "status" "ManufacturingLotStatus" NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingPlanLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingMrpRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runNumber" TEXT NOT NULL,
    "planId" TEXT,
    "orderId" TEXT,
    "status" "ManufacturingMrpRunStatus" NOT NULL DEFAULT 'PENDING',
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "horizonEndDate" DATE,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingMrpRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingMrpRequirement" (
    "id" TEXT NOT NULL,
    "mrpRunId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "bomComponentId" TEXT,
    "warehouseId" TEXT,
    "locationId" TEXT,
    "requiredDate" DATE NOT NULL,
    "unit" TEXT NOT NULL,
    "grossRequirement" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "onHandQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "activeReservationQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "scheduledReceiptQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "netRequirement" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "shortageQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "snapshotUnitCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManufacturingMrpRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fiscalYearId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "type" "ManufacturingOrderType" NOT NULL DEFAULT 'ASSEMBLY',
    "status" "ManufacturingOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "planId" TEXT,
    "finishedProductId" TEXT NOT NULL,
    "bomVersionId" TEXT NOT NULL,
    "routingVersionId" TEXT,
    "issueWarehouseId" TEXT NOT NULL,
    "receiptWarehouseId" TEXT NOT NULL,
    "issueLocationId" TEXT,
    "receiptLocationId" TEXT,
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "completedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "plannedStartDate" DATE,
    "plannedEndDate" DATE,
    "actualStartAt" TIMESTAMP(3),
    "actualEndAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "closedByUserId" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrderLot" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "planLotId" TEXT,
    "lotNumber" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "completedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" "ManufacturingLotStatus" NOT NULL DEFAULT 'PLANNED',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingOrderLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrderMaterial" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "bomComponentId" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "status" "ManufacturingMaterialStatus" NOT NULL DEFAULT 'PLANNED',
    "unit" TEXT NOT NULL,
    "plannedQuantity" DECIMAL(18,4) NOT NULL,
    "reservedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "issuedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "returnedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "consumedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "scrappedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "requiredDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingOrderMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "reservationNumber" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "status" "ManufacturingReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "releasedByUserId" TEXT,
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingReservationLine" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "orderMaterialId" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "inventoryLotId" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "issuedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "releasedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingReservationLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fiscalYearId" TEXT,
    "transactionNumber" TEXT NOT NULL,
    "transactionType" "ManufacturingTransactionType" NOT NULL,
    "status" "ManufacturingTransactionStatus" NOT NULL DEFAULT 'DRAFT',
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLotId" TEXT,
    "reservationId" TEXT,
    "operationExecutionId" TEXT,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "voucherEntryId" TEXT,
    "referenceNo" TEXT,
    "notes" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "postedByUserId" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingTransactionLine" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "orderMaterialId" TEXT,
    "reservationLineId" TEXT,
    "sourceInventoryLotId" TEXT,
    "destinationInventoryLotId" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingTransactionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOperationExecution" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLotId" TEXT,
    "routingOperationId" TEXT NOT NULL,
    "status" "ManufacturingOperationStatus" NOT NULL DEFAULT 'PENDING',
    "plannedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "inputQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "goodQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "scrapQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reworkQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "startedByUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "completedAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingOperationExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingQualityInspection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inspectionNumber" TEXT NOT NULL,
    "inspectionType" "ManufacturingQualityInspectionType" NOT NULL,
    "status" "ManufacturingQualityStatus" NOT NULL DEFAULT 'PENDING',
    "orderId" TEXT NOT NULL,
    "orderLotId" TEXT,
    "operationExecutionId" TEXT,
    "inventoryItemId" TEXT NOT NULL,
    "sourceTransactionId" TEXT,
    "sampleQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "acceptedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "holdReason" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "inspectedByUserId" TEXT,
    "inspectedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingQualityInspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingQualityResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "parameterCode" TEXT NOT NULL,
    "parameterName" TEXT NOT NULL,
    "testMethod" TEXT,
    "unit" TEXT,
    "specificationMin" DECIMAL(24,6),
    "specificationMax" DECIMAL(24,6),
    "specificationText" TEXT,
    "actualValue" DECIMAL(24,6),
    "actualText" TEXT,
    "passed" BOOLEAN,
    "remarks" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingQualityResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingInventoryLot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "locationId" TEXT,
    "lotNumber" TEXT NOT NULL,
    "receivedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "availableQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reservedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "holdQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "rejectedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "unitCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "manufacturedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "sourceTransactionLineId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingInventoryLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingSerial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serialNumber" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "orderId" TEXT,
    "orderLotId" TEXT,
    "inventoryLotId" TEXT,
    "warehouseId" TEXT,
    "locationId" TEXT,
    "status" "ManufacturingSerialStatus" NOT NULL DEFAULT 'CREATED',
    "manufacturedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingSerialMovement" (
    "id" TEXT NOT NULL,
    "transactionLineId" TEXT NOT NULL,
    "serialId" TEXT NOT NULL,
    "role" "ManufacturingSerialMovementRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManufacturingSerialMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingGenealogy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderLotId" TEXT,
    "transactionLineId" TEXT,
    "parentInventoryLotId" TEXT,
    "childInventoryLotId" TEXT,
    "parentSerialId" TEXT,
    "childSerialId" TEXT,
    "relationshipType" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManufacturingGenealogy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingCostSnapshot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "ManufacturingCostStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "materialCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "labourCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "machineCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "overheadCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "subcontractCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "otherCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "scrapRecovery" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "varianceAmount" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "completedQuantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(24,6) NOT NULL DEFAULT 0,
    "voucherEntryId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "finalizedByUserId" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingCostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingCostLine" (
    "id" TEXT NOT NULL,
    "costSnapshotId" TEXT NOT NULL,
    "costType" "ManufacturingCostType" NOT NULL,
    "description" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "transactionLineId" TEXT,
    "accountId" TEXT,
    "quantity" DECIMAL(18,4),
    "rate" DECIMAL(24,6),
    "amount" DECIMAL(24,6) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManufacturingCostLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingWorkflowReview" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT,
    "orderId" TEXT,
    "workflowGroup" TEXT NOT NULL,
    "workflowCode" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "outcome" "ManufacturingWorkflowOutcome",
    "status" "ManufacturingWorkflowReviewStatus" NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "note" TEXT,
    "evidence" JSONB,
    "signatureHash" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingWorkflowReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingSettings_workspaceId_key" ON "ManufacturingSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "ManufacturingSettings_tenantId_companyId_idx" ON "ManufacturingSettings"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingItemProfile_inventoryItemId_key" ON "ManufacturingItemProfile"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ManufacturingItemProfile_workspaceId_role_isActive_idx" ON "ManufacturingItemProfile"("workspaceId", "role", "isActive");

-- CreateIndex
CREATE INDEX "ManufacturingItemProfile_defaultIssueLocationId_idx" ON "ManufacturingItemProfile"("defaultIssueLocationId");

-- CreateIndex
CREATE INDEX "ManufacturingItemProfile_defaultReceiptLocationId_idx" ON "ManufacturingItemProfile"("defaultReceiptLocationId");

-- CreateIndex
CREATE INDEX "ManufacturingLocation_workspaceId_disposition_isActive_idx" ON "ManufacturingLocation"("workspaceId", "disposition", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingLocation_warehouseId_code_key" ON "ManufacturingLocation"("warehouseId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingLocation_warehouseId_name_key" ON "ManufacturingLocation"("warehouseId", "name");

-- CreateIndex
CREATE INDEX "ManufacturingBom_workspaceId_finishedProductId_isActive_idx" ON "ManufacturingBom"("workspaceId", "finishedProductId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingBom_workspaceId_code_key" ON "ManufacturingBom"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingBom_workspaceId_name_key" ON "ManufacturingBom"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ManufacturingBomVersion_bomId_status_effectiveFrom_idx" ON "ManufacturingBomVersion"("bomId", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingBomVersion_bomId_versionNumber_key" ON "ManufacturingBomVersion"("bomId", "versionNumber");

-- CreateIndex
CREATE INDEX "ManufacturingBomComponent_inventoryItemId_idx" ON "ManufacturingBomComponent"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ManufacturingBomComponent_issueLocationId_idx" ON "ManufacturingBomComponent"("issueLocationId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingBomComponent_bomVersionId_inventoryItemId_sort_key" ON "ManufacturingBomComponent"("bomVersionId", "inventoryItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "ManufacturingRouting_workspaceId_finishedProductId_isActive_idx" ON "ManufacturingRouting"("workspaceId", "finishedProductId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingRouting_workspaceId_code_key" ON "ManufacturingRouting"("workspaceId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingRouting_workspaceId_name_key" ON "ManufacturingRouting"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ManufacturingRoutingVersion_routingId_status_effectiveFrom_idx" ON "ManufacturingRoutingVersion"("routingId", "status", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingRoutingVersion_routingId_versionNumber_key" ON "ManufacturingRoutingVersion"("routingId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingRoutingOperation_routingVersionId_sequence_key" ON "ManufacturingRoutingOperation"("routingVersionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingRoutingOperation_routingVersionId_code_key" ON "ManufacturingRoutingOperation"("routingVersionId", "code");

-- CreateIndex
CREATE INDEX "ManufacturingPlan_workspaceId_status_plannedStartDate_idx" ON "ManufacturingPlan"("workspaceId", "status", "plannedStartDate");

-- CreateIndex
CREATE INDEX "ManufacturingPlan_finishedProductId_idx" ON "ManufacturingPlan"("finishedProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingPlan_workspaceId_planNumber_key" ON "ManufacturingPlan"("workspaceId", "planNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingPlanLot_planId_lotNumber_key" ON "ManufacturingPlanLot"("planId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingPlanLot_planId_sequence_key" ON "ManufacturingPlanLot"("planId", "sequence");

-- CreateIndex
CREATE INDEX "ManufacturingMrpRun_workspaceId_status_asOfDate_idx" ON "ManufacturingMrpRun"("workspaceId", "status", "asOfDate");

-- CreateIndex
CREATE INDEX "ManufacturingMrpRun_planId_idx" ON "ManufacturingMrpRun"("planId");

-- CreateIndex
CREATE INDEX "ManufacturingMrpRun_orderId_idx" ON "ManufacturingMrpRun"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingMrpRun_workspaceId_runNumber_key" ON "ManufacturingMrpRun"("workspaceId", "runNumber");

-- CreateIndex
CREATE INDEX "ManufacturingMrpRequirement_inventoryItemId_requiredDate_idx" ON "ManufacturingMrpRequirement"("inventoryItemId", "requiredDate");

-- CreateIndex
CREATE INDEX "ManufacturingMrpRequirement_bomComponentId_idx" ON "ManufacturingMrpRequirement"("bomComponentId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingMrpRequirement_mrpRunId_inventoryItemId_requir_key" ON "ManufacturingMrpRequirement"("mrpRunId", "inventoryItemId", "requiredDate", "warehouseId", "locationId");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_workspaceId_status_plannedStartDate_idx" ON "ManufacturingOrder"("workspaceId", "status", "plannedStartDate");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_planId_idx" ON "ManufacturingOrder"("planId");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_finishedProductId_idx" ON "ManufacturingOrder"("finishedProductId");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_fiscalYearId_idx" ON "ManufacturingOrder"("fiscalYearId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrder_workspaceId_orderNumber_key" ON "ManufacturingOrder"("workspaceId", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrderLot_planLotId_key" ON "ManufacturingOrderLot"("planLotId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrderLot_orderId_lotNumber_key" ON "ManufacturingOrderLot"("orderId", "lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrderLot_orderId_sequence_key" ON "ManufacturingOrderLot"("orderId", "sequence");

-- CreateIndex
CREATE INDEX "ManufacturingOrderMaterial_inventoryItemId_idx" ON "ManufacturingOrderMaterial"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderMaterial_bomComponentId_idx" ON "ManufacturingOrderMaterial"("bomComponentId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrderMaterial_orderId_inventoryItemId_bomCompo_key" ON "ManufacturingOrderMaterial"("orderId", "inventoryItemId", "bomComponentId");

-- CreateIndex
CREATE INDEX "ManufacturingReservation_workspaceId_status_expiresAt_idx" ON "ManufacturingReservation"("workspaceId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ManufacturingReservation_orderId_idx" ON "ManufacturingReservation"("orderId");

-- CreateIndex
CREATE INDEX "ManufacturingReservation_warehouseId_locationId_idx" ON "ManufacturingReservation"("warehouseId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingReservation_workspaceId_reservationNumber_key" ON "ManufacturingReservation"("workspaceId", "reservationNumber");

-- CreateIndex
CREATE INDEX "ManufacturingReservationLine_orderMaterialId_idx" ON "ManufacturingReservationLine"("orderMaterialId");

-- CreateIndex
CREATE INDEX "ManufacturingReservationLine_inventoryItemId_idx" ON "ManufacturingReservationLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ManufacturingReservationLine_inventoryLotId_idx" ON "ManufacturingReservationLine"("inventoryLotId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingReservationLine_reservationId_inventoryItemId__key" ON "ManufacturingReservationLine"("reservationId", "inventoryItemId", "inventoryLotId", "orderMaterialId");

-- CreateIndex
CREATE INDEX "ManufacturingTransaction_workspaceId_transactionType_status_idx" ON "ManufacturingTransaction"("workspaceId", "transactionType", "status", "transactionDate");

-- CreateIndex
CREATE INDEX "ManufacturingTransaction_orderId_transactionDate_idx" ON "ManufacturingTransaction"("orderId", "transactionDate");

-- CreateIndex
CREATE INDEX "ManufacturingTransaction_orderLotId_idx" ON "ManufacturingTransaction"("orderLotId");

-- CreateIndex
CREATE INDEX "ManufacturingTransaction_reservationId_idx" ON "ManufacturingTransaction"("reservationId");

-- CreateIndex
CREATE INDEX "ManufacturingTransaction_voucherEntryId_idx" ON "ManufacturingTransaction"("voucherEntryId");

-- CreateIndex
CREATE INDEX "ManufacturingTransaction_fiscalYearId_idx" ON "ManufacturingTransaction"("fiscalYearId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingTransaction_workspaceId_transactionNumber_key" ON "ManufacturingTransaction"("workspaceId", "transactionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingTransaction_workspaceId_idempotencyKey_key" ON "ManufacturingTransaction"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ManufacturingTransactionLine_transactionId_idx" ON "ManufacturingTransactionLine"("transactionId");

-- CreateIndex
CREATE INDEX "ManufacturingTransactionLine_inventoryItemId_idx" ON "ManufacturingTransactionLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ManufacturingTransactionLine_orderMaterialId_idx" ON "ManufacturingTransactionLine"("orderMaterialId");

-- CreateIndex
CREATE INDEX "ManufacturingTransactionLine_reservationLineId_idx" ON "ManufacturingTransactionLine"("reservationLineId");

-- CreateIndex
CREATE INDEX "ManufacturingTransactionLine_sourceInventoryLotId_idx" ON "ManufacturingTransactionLine"("sourceInventoryLotId");

-- CreateIndex
CREATE INDEX "ManufacturingTransactionLine_destinationInventoryLotId_idx" ON "ManufacturingTransactionLine"("destinationInventoryLotId");

-- CreateIndex
CREATE INDEX "ManufacturingOperationExecution_orderId_status_idx" ON "ManufacturingOperationExecution"("orderId", "status");

-- CreateIndex
CREATE INDEX "ManufacturingOperationExecution_orderLotId_idx" ON "ManufacturingOperationExecution"("orderLotId");

-- CreateIndex
CREATE INDEX "ManufacturingOperationExecution_routingOperationId_idx" ON "ManufacturingOperationExecution"("routingOperationId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOperationExecution_orderId_orderLotId_routingO_key" ON "ManufacturingOperationExecution"("orderId", "orderLotId", "routingOperationId");

-- CreateIndex
CREATE INDEX "ManufacturingQualityInspection_workspaceId_status_inspectio_idx" ON "ManufacturingQualityInspection"("workspaceId", "status", "inspectionType");

-- CreateIndex
CREATE INDEX "ManufacturingQualityInspection_orderId_orderLotId_idx" ON "ManufacturingQualityInspection"("orderId", "orderLotId");

-- CreateIndex
CREATE INDEX "ManufacturingQualityInspection_operationExecutionId_idx" ON "ManufacturingQualityInspection"("operationExecutionId");

-- CreateIndex
CREATE INDEX "ManufacturingQualityInspection_sourceTransactionId_idx" ON "ManufacturingQualityInspection"("sourceTransactionId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingQualityInspection_workspaceId_inspectionNumber_key" ON "ManufacturingQualityInspection"("workspaceId", "inspectionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingQualityResult_inspectionId_parameterCode_key" ON "ManufacturingQualityResult"("inspectionId", "parameterCode");

-- CreateIndex
CREATE INDEX "ManufacturingInventoryLot_workspaceId_warehouseId_locationI_idx" ON "ManufacturingInventoryLot"("workspaceId", "warehouseId", "locationId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "ManufacturingInventoryLot_expiresAt_idx" ON "ManufacturingInventoryLot"("expiresAt");

-- CreateIndex
CREATE INDEX "ManufacturingInventoryLot_sourceTransactionLineId_idx" ON "ManufacturingInventoryLot"("sourceTransactionLineId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingInventoryLot_workspaceId_inventoryItemId_lotNu_key" ON "ManufacturingInventoryLot"("workspaceId", "inventoryItemId", "lotNumber");

-- CreateIndex
CREATE INDEX "ManufacturingSerial_workspaceId_inventoryItemId_status_idx" ON "ManufacturingSerial"("workspaceId", "inventoryItemId", "status");

-- CreateIndex
CREATE INDEX "ManufacturingSerial_orderId_orderLotId_idx" ON "ManufacturingSerial"("orderId", "orderLotId");

-- CreateIndex
CREATE INDEX "ManufacturingSerial_inventoryLotId_idx" ON "ManufacturingSerial"("inventoryLotId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingSerial_workspaceId_serialNumber_key" ON "ManufacturingSerial"("workspaceId", "serialNumber");

-- CreateIndex
CREATE INDEX "ManufacturingSerialMovement_serialId_idx" ON "ManufacturingSerialMovement"("serialId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingSerialMovement_transactionLineId_serialId_role_key" ON "ManufacturingSerialMovement"("transactionLineId", "serialId", "role");

-- CreateIndex
CREATE INDEX "ManufacturingGenealogy_workspaceId_orderId_idx" ON "ManufacturingGenealogy"("workspaceId", "orderId");

-- CreateIndex
CREATE INDEX "ManufacturingGenealogy_parentInventoryLotId_idx" ON "ManufacturingGenealogy"("parentInventoryLotId");

-- CreateIndex
CREATE INDEX "ManufacturingGenealogy_childInventoryLotId_idx" ON "ManufacturingGenealogy"("childInventoryLotId");

-- CreateIndex
CREATE INDEX "ManufacturingGenealogy_parentSerialId_idx" ON "ManufacturingGenealogy"("parentSerialId");

-- CreateIndex
CREATE INDEX "ManufacturingGenealogy_childSerialId_idx" ON "ManufacturingGenealogy"("childSerialId");

-- CreateIndex
CREATE INDEX "ManufacturingGenealogy_transactionLineId_idx" ON "ManufacturingGenealogy"("transactionLineId");

-- CreateIndex
CREATE INDEX "ManufacturingCostSnapshot_workspaceId_status_createdAt_idx" ON "ManufacturingCostSnapshot"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ManufacturingCostSnapshot_voucherEntryId_idx" ON "ManufacturingCostSnapshot"("voucherEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingCostSnapshot_orderId_versionNumber_key" ON "ManufacturingCostSnapshot"("orderId", "versionNumber");

-- CreateIndex
CREATE INDEX "ManufacturingCostLine_costSnapshotId_costType_idx" ON "ManufacturingCostLine"("costSnapshotId", "costType");

-- CreateIndex
CREATE INDEX "ManufacturingCostLine_inventoryItemId_idx" ON "ManufacturingCostLine"("inventoryItemId");

-- CreateIndex
CREATE INDEX "ManufacturingCostLine_transactionLineId_idx" ON "ManufacturingCostLine"("transactionLineId");

-- CreateIndex
CREATE INDEX "ManufacturingWorkflowReview_workspaceId_workflowGroup_workf_idx" ON "ManufacturingWorkflowReview"("workspaceId", "workflowGroup", "workflowCode", "transactionDate");

-- CreateIndex
CREATE INDEX "ManufacturingWorkflowReview_workspaceId_status_workflowCode_idx" ON "ManufacturingWorkflowReview"("workspaceId", "status", "workflowCode");

-- CreateIndex
CREATE INDEX "ManufacturingWorkflowReview_workspaceId_entityType_entityId_idx" ON "ManufacturingWorkflowReview"("workspaceId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "ManufacturingWorkflowReview_planId_idx" ON "ManufacturingWorkflowReview"("planId");

-- CreateIndex
CREATE INDEX "ManufacturingWorkflowReview_orderId_idx" ON "ManufacturingWorkflowReview"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingWorkflowReview_workspaceId_idempotencyKey_key" ON "ManufacturingWorkflowReview"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "StockMovement_manufacturingTransactionLineId_idx" ON "StockMovement"("manufacturingTransactionLineId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_manufacturingTransactionLineId_fkey" FOREIGN KEY ("manufacturingTransactionLineId") REFERENCES "ManufacturingTransactionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSettings" ADD CONSTRAINT "ManufacturingSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSettings" ADD CONSTRAINT "ManufacturingSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSettings" ADD CONSTRAINT "ManufacturingSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingItemProfile" ADD CONSTRAINT "ManufacturingItemProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingItemProfile" ADD CONSTRAINT "ManufacturingItemProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingItemProfile" ADD CONSTRAINT "ManufacturingItemProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingItemProfile" ADD CONSTRAINT "ManufacturingItemProfile_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingItemProfile" ADD CONSTRAINT "ManufacturingItemProfile_defaultIssueLocationId_fkey" FOREIGN KEY ("defaultIssueLocationId") REFERENCES "ManufacturingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingItemProfile" ADD CONSTRAINT "ManufacturingItemProfile_defaultReceiptLocationId_fkey" FOREIGN KEY ("defaultReceiptLocationId") REFERENCES "ManufacturingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingItemProfile" ADD CONSTRAINT "ManufacturingItemProfile_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingLocation" ADD CONSTRAINT "ManufacturingLocation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingLocation" ADD CONSTRAINT "ManufacturingLocation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingLocation" ADD CONSTRAINT "ManufacturingLocation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingLocation" ADD CONSTRAINT "ManufacturingLocation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingLocation" ADD CONSTRAINT "ManufacturingLocation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBom" ADD CONSTRAINT "ManufacturingBom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBom" ADD CONSTRAINT "ManufacturingBom_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBom" ADD CONSTRAINT "ManufacturingBom_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBom" ADD CONSTRAINT "ManufacturingBom_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBom" ADD CONSTRAINT "ManufacturingBom_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBomVersion" ADD CONSTRAINT "ManufacturingBomVersion_bomId_fkey" FOREIGN KEY ("bomId") REFERENCES "ManufacturingBom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBomVersion" ADD CONSTRAINT "ManufacturingBomVersion_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBomComponent" ADD CONSTRAINT "ManufacturingBomComponent_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "ManufacturingBomVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBomComponent" ADD CONSTRAINT "ManufacturingBomComponent_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingBomComponent" ADD CONSTRAINT "ManufacturingBomComponent_issueLocationId_fkey" FOREIGN KEY ("issueLocationId") REFERENCES "ManufacturingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRouting" ADD CONSTRAINT "ManufacturingRouting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRouting" ADD CONSTRAINT "ManufacturingRouting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRouting" ADD CONSTRAINT "ManufacturingRouting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRouting" ADD CONSTRAINT "ManufacturingRouting_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRouting" ADD CONSTRAINT "ManufacturingRouting_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRoutingVersion" ADD CONSTRAINT "ManufacturingRoutingVersion_routingId_fkey" FOREIGN KEY ("routingId") REFERENCES "ManufacturingRouting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRoutingVersion" ADD CONSTRAINT "ManufacturingRoutingVersion_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRoutingOperation" ADD CONSTRAINT "ManufacturingRoutingOperation_routingVersionId_fkey" FOREIGN KEY ("routingVersionId") REFERENCES "ManufacturingRoutingVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlan" ADD CONSTRAINT "ManufacturingPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlan" ADD CONSTRAINT "ManufacturingPlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlan" ADD CONSTRAINT "ManufacturingPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlan" ADD CONSTRAINT "ManufacturingPlan_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlan" ADD CONSTRAINT "ManufacturingPlan_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "ManufacturingBomVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlan" ADD CONSTRAINT "ManufacturingPlan_routingVersionId_fkey" FOREIGN KEY ("routingVersionId") REFERENCES "ManufacturingRoutingVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlan" ADD CONSTRAINT "ManufacturingPlan_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlan" ADD CONSTRAINT "ManufacturingPlan_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingPlanLot" ADD CONSTRAINT "ManufacturingPlanLot_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ManufacturingPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRun" ADD CONSTRAINT "ManufacturingMrpRun_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRun" ADD CONSTRAINT "ManufacturingMrpRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRun" ADD CONSTRAINT "ManufacturingMrpRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRun" ADD CONSTRAINT "ManufacturingMrpRun_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ManufacturingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRun" ADD CONSTRAINT "ManufacturingMrpRun_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRun" ADD CONSTRAINT "ManufacturingMrpRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRequirement" ADD CONSTRAINT "ManufacturingMrpRequirement_mrpRunId_fkey" FOREIGN KEY ("mrpRunId") REFERENCES "ManufacturingMrpRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRequirement" ADD CONSTRAINT "ManufacturingMrpRequirement_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingMrpRequirement" ADD CONSTRAINT "ManufacturingMrpRequirement_bomComponentId_fkey" FOREIGN KEY ("bomComponentId") REFERENCES "ManufacturingBomComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ManufacturingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_finishedProductId_fkey" FOREIGN KEY ("finishedProductId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_bomVersionId_fkey" FOREIGN KEY ("bomVersionId") REFERENCES "ManufacturingBomVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_routingVersionId_fkey" FOREIGN KEY ("routingVersionId") REFERENCES "ManufacturingRoutingVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_issueWarehouseId_fkey" FOREIGN KEY ("issueWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_receiptWarehouseId_fkey" FOREIGN KEY ("receiptWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_issueLocationId_fkey" FOREIGN KEY ("issueLocationId") REFERENCES "ManufacturingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_receiptLocationId_fkey" FOREIGN KEY ("receiptLocationId") REFERENCES "ManufacturingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderLot" ADD CONSTRAINT "ManufacturingOrderLot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderLot" ADD CONSTRAINT "ManufacturingOrderLot_planLotId_fkey" FOREIGN KEY ("planLotId") REFERENCES "ManufacturingPlanLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderMaterial" ADD CONSTRAINT "ManufacturingOrderMaterial_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderMaterial" ADD CONSTRAINT "ManufacturingOrderMaterial_bomComponentId_fkey" FOREIGN KEY ("bomComponentId") REFERENCES "ManufacturingBomComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderMaterial" ADD CONSTRAINT "ManufacturingOrderMaterial_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservation" ADD CONSTRAINT "ManufacturingReservation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservation" ADD CONSTRAINT "ManufacturingReservation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservation" ADD CONSTRAINT "ManufacturingReservation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservation" ADD CONSTRAINT "ManufacturingReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservation" ADD CONSTRAINT "ManufacturingReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservation" ADD CONSTRAINT "ManufacturingReservation_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ManufacturingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservation" ADD CONSTRAINT "ManufacturingReservation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservation" ADD CONSTRAINT "ManufacturingReservation_releasedByUserId_fkey" FOREIGN KEY ("releasedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservationLine" ADD CONSTRAINT "ManufacturingReservationLine_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "ManufacturingReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservationLine" ADD CONSTRAINT "ManufacturingReservationLine_orderMaterialId_fkey" FOREIGN KEY ("orderMaterialId") REFERENCES "ManufacturingOrderMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservationLine" ADD CONSTRAINT "ManufacturingReservationLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingReservationLine" ADD CONSTRAINT "ManufacturingReservationLine_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "ManufacturingInventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_orderLotId_fkey" FOREIGN KEY ("orderLotId") REFERENCES "ManufacturingOrderLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "ManufacturingReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_operationExecutionId_fkey" FOREIGN KEY ("operationExecutionId") REFERENCES "ManufacturingOperationExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_fromWarehouseId_fkey" FOREIGN KEY ("fromWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_toWarehouseId_fkey" FOREIGN KEY ("toWarehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_fromLocationId_fkey" FOREIGN KEY ("fromLocationId") REFERENCES "ManufacturingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_toLocationId_fkey" FOREIGN KEY ("toLocationId") REFERENCES "ManufacturingLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_voucherEntryId_fkey" FOREIGN KEY ("voucherEntryId") REFERENCES "VoucherEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "ManufacturingTransaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransaction" ADD CONSTRAINT "ManufacturingTransaction_postedByUserId_fkey" FOREIGN KEY ("postedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransactionLine" ADD CONSTRAINT "ManufacturingTransactionLine_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "ManufacturingTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransactionLine" ADD CONSTRAINT "ManufacturingTransactionLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransactionLine" ADD CONSTRAINT "ManufacturingTransactionLine_orderMaterialId_fkey" FOREIGN KEY ("orderMaterialId") REFERENCES "ManufacturingOrderMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransactionLine" ADD CONSTRAINT "ManufacturingTransactionLine_reservationLineId_fkey" FOREIGN KEY ("reservationLineId") REFERENCES "ManufacturingReservationLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransactionLine" ADD CONSTRAINT "ManufacturingTransactionLine_sourceInventoryLotId_fkey" FOREIGN KEY ("sourceInventoryLotId") REFERENCES "ManufacturingInventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingTransactionLine" ADD CONSTRAINT "ManufacturingTransactionLine_destinationInventoryLotId_fkey" FOREIGN KEY ("destinationInventoryLotId") REFERENCES "ManufacturingInventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOperationExecution" ADD CONSTRAINT "ManufacturingOperationExecution_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOperationExecution" ADD CONSTRAINT "ManufacturingOperationExecution_orderLotId_fkey" FOREIGN KEY ("orderLotId") REFERENCES "ManufacturingOrderLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOperationExecution" ADD CONSTRAINT "ManufacturingOperationExecution_routingOperationId_fkey" FOREIGN KEY ("routingOperationId") REFERENCES "ManufacturingRoutingOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOperationExecution" ADD CONSTRAINT "ManufacturingOperationExecution_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOperationExecution" ADD CONSTRAINT "ManufacturingOperationExecution_completedByUserId_fkey" FOREIGN KEY ("completedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_orderLotId_fkey" FOREIGN KEY ("orderLotId") REFERENCES "ManufacturingOrderLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_operationExecutionId_fkey" FOREIGN KEY ("operationExecutionId") REFERENCES "ManufacturingOperationExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_sourceTransactionId_fkey" FOREIGN KEY ("sourceTransactionId") REFERENCES "ManufacturingTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_inspectedByUserId_fkey" FOREIGN KEY ("inspectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityInspection" ADD CONSTRAINT "ManufacturingQualityInspection_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingQualityResult" ADD CONSTRAINT "ManufacturingQualityResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "ManufacturingQualityInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingInventoryLot" ADD CONSTRAINT "ManufacturingInventoryLot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingInventoryLot" ADD CONSTRAINT "ManufacturingInventoryLot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingInventoryLot" ADD CONSTRAINT "ManufacturingInventoryLot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingInventoryLot" ADD CONSTRAINT "ManufacturingInventoryLot_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingInventoryLot" ADD CONSTRAINT "ManufacturingInventoryLot_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingInventoryLot" ADD CONSTRAINT "ManufacturingInventoryLot_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ManufacturingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingInventoryLot" ADD CONSTRAINT "ManufacturingInventoryLot_sourceTransactionLineId_fkey" FOREIGN KEY ("sourceTransactionLineId") REFERENCES "ManufacturingTransactionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingInventoryLot" ADD CONSTRAINT "ManufacturingInventoryLot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_orderLotId_fkey" FOREIGN KEY ("orderLotId") REFERENCES "ManufacturingOrderLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_inventoryLotId_fkey" FOREIGN KEY ("inventoryLotId") REFERENCES "ManufacturingInventoryLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "ManufacturingLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerial" ADD CONSTRAINT "ManufacturingSerial_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerialMovement" ADD CONSTRAINT "ManufacturingSerialMovement_transactionLineId_fkey" FOREIGN KEY ("transactionLineId") REFERENCES "ManufacturingTransactionLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingSerialMovement" ADD CONSTRAINT "ManufacturingSerialMovement_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "ManufacturingSerial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_orderLotId_fkey" FOREIGN KEY ("orderLotId") REFERENCES "ManufacturingOrderLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_transactionLineId_fkey" FOREIGN KEY ("transactionLineId") REFERENCES "ManufacturingTransactionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_parentInventoryLotId_fkey" FOREIGN KEY ("parentInventoryLotId") REFERENCES "ManufacturingInventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_childInventoryLotId_fkey" FOREIGN KEY ("childInventoryLotId") REFERENCES "ManufacturingInventoryLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_parentSerialId_fkey" FOREIGN KEY ("parentSerialId") REFERENCES "ManufacturingSerial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_childSerialId_fkey" FOREIGN KEY ("childSerialId") REFERENCES "ManufacturingSerial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingGenealogy" ADD CONSTRAINT "ManufacturingGenealogy_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostSnapshot" ADD CONSTRAINT "ManufacturingCostSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostSnapshot" ADD CONSTRAINT "ManufacturingCostSnapshot_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostSnapshot" ADD CONSTRAINT "ManufacturingCostSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostSnapshot" ADD CONSTRAINT "ManufacturingCostSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostSnapshot" ADD CONSTRAINT "ManufacturingCostSnapshot_voucherEntryId_fkey" FOREIGN KEY ("voucherEntryId") REFERENCES "VoucherEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostSnapshot" ADD CONSTRAINT "ManufacturingCostSnapshot_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostSnapshot" ADD CONSTRAINT "ManufacturingCostSnapshot_finalizedByUserId_fkey" FOREIGN KEY ("finalizedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostLine" ADD CONSTRAINT "ManufacturingCostLine_costSnapshotId_fkey" FOREIGN KEY ("costSnapshotId") REFERENCES "ManufacturingCostSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostLine" ADD CONSTRAINT "ManufacturingCostLine_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingCostLine" ADD CONSTRAINT "ManufacturingCostLine_transactionLineId_fkey" FOREIGN KEY ("transactionLineId") REFERENCES "ManufacturingTransactionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingWorkflowReview" ADD CONSTRAINT "ManufacturingWorkflowReview_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingWorkflowReview" ADD CONSTRAINT "ManufacturingWorkflowReview_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingWorkflowReview" ADD CONSTRAINT "ManufacturingWorkflowReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingWorkflowReview" ADD CONSTRAINT "ManufacturingWorkflowReview_planId_fkey" FOREIGN KEY ("planId") REFERENCES "ManufacturingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingWorkflowReview" ADD CONSTRAINT "ManufacturingWorkflowReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingWorkflowReview" ADD CONSTRAINT "ManufacturingWorkflowReview_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingWorkflowReview" ADD CONSTRAINT "ManufacturingWorkflowReview_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingWorkflowReview" ADD CONSTRAINT "ManufacturingWorkflowReview_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
