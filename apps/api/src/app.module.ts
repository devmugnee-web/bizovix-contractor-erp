import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import configuration from "./config/configuration";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { ResponseInterceptor } from "./common/interceptors/response.interceptor";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { AuditLogModule } from "./modules/audit-logs/audit-log.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { BankAccountsModule } from "./modules/bank-accounts/bank-accounts.module";
import { DocumentPurchasesModule } from "./modules/document-purchases/document-purchases.module";
import { TenderSecuritiesModule } from "./modules/tender-securities/tender-securities.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { CreditCommitmentsModule } from "./modules/credit-commitments/credit-commitments.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    OrganizationsModule,
    BankAccountsModule,
    DocumentPurchasesModule,
    TenderSecuritiesModule,
    CreditCommitmentsModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
