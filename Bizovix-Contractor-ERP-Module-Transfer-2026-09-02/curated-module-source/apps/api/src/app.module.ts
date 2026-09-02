import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AccountingModule } from "./accounting/accounting.module.js";
import { AccountsModule } from "./accounts/accounts.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CloudSyncModule } from "./cloud-sync/cloud-sync.module.js";
import { parseEnvironment } from "./config/env.schema.js";
import { DashboardModule } from "./dashboard/dashboard.module.js";
import { FixedAssetsModule } from "./fixed-assets/fixed-assets.module.js";
import { HrModule } from "./hr/hr.module.js";
import { LcModule } from "./lc/lc.module.js";
import { ManufacturingModule } from "./manufacturing/manufacturing.module.js";
import { MastersModule } from "./masters/masters.module.js";
import { InventoryModule } from "./inventory/inventory.module.js";
import { OnboardingModule } from "./onboarding/onboarding.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RedisModule } from "./redis/redis.module.js";
import { RecycleBinModule } from "./recycle-bin/recycle-bin.module.js";
import { ReportsModule } from "./reports/reports.module.js";
import { SubscriptionModule } from "./subscription/subscription.module.js";
import { VouchersModule } from "./vouchers/vouchers.module.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: parseEnvironment,
    }),
    PrismaModule,
    RedisModule,
    AuditModule,
    AccountingModule,
    AccountsModule,
    AuthModule,
    CloudSyncModule,
    OnboardingModule,
    WorkspacesModule,
    DashboardModule,
    MastersModule,
    InventoryModule,
    VouchersModule,
    FixedAssetsModule,
    HrModule,
    LcModule,
    ManufacturingModule,
    ReportsModule,
    SubscriptionModule,
    RecycleBinModule,
  ],
})
export class AppModule {}
