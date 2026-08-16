import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
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
import { PgBgModule } from "./modules/pg-bg/pg-bg.module";
import { CmsWorksModule } from "./modules/cms-works/cms-works.module";
import { ProjectExpensesModule } from "./modules/project-expenses/project-expenses.module";
import { GeneralExpensesModule } from "./modules/general-expenses/general-expenses.module";
import { ReceiptsModule } from "./modules/receipts/receipts.module";
import { CashBankModule } from "./modules/cash-bank/cash-bank.module";
import { ReportsModule } from "./modules/reports/reports.module";
import { AccountingModule } from "./modules/accounting/accounting.module";
import { RemindersModule } from "./modules/reminders/reminders.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { NumberingModule } from "./modules/settings-numbering/numbering.module";
import { GeneralSettingsModule } from "./modules/settings-general/general-settings.module";
import { CompanyProfileModule } from "./modules/settings-company/company-profile.module";
import { UsersModule } from "./modules/users/users.module";
import { RolesModule } from "./modules/roles/roles.module";
import { TenderBankSettingsModule } from "./modules/settings-tender-bank/tender-bank-settings.module";
import { FinanceSettingsModule } from "./modules/settings-finance/finance-settings.module";
import { ReminderRuleModule } from "./modules/settings-notifications/reminder-rule.module";
import { DocumentSettingsModule } from "./modules/settings-documents/document-settings.module";
import { ApprovalRuleModule } from "./modules/settings-approvals/approval-rule.module";
import { SecuritySettingsModule } from "./modules/settings-security/security-settings.module";
import { SystemSettingsModule } from "./modules/settings-system/system-settings.module";
import { BillingModule } from "./modules/billing/billing.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    OrganizationsModule,
    BankAccountsModule,
    DocumentPurchasesModule,
    TenderSecuritiesModule,
    CreditCommitmentsModule,
    PgBgModule,
    CmsWorksModule,
    ProjectExpensesModule,
    GeneralExpensesModule,
    ReceiptsModule,
    CashBankModule,
    ReportsModule,
    AccountingModule,
    NotificationsModule,
    RemindersModule,
    DashboardModule,
    NumberingModule,
    GeneralSettingsModule,
    CompanyProfileModule,
    UsersModule,
    RolesModule,
    TenderBankSettingsModule,
    FinanceSettingsModule,
    ReminderRuleModule,
    DocumentSettingsModule,
    ApprovalRuleModule,
    SecuritySettingsModule,
    SystemSettingsModule,
    BillingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
