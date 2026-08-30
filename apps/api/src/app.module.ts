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
import { TendersModule } from "./modules/tenders/tenders.module";
import { BankAccountsModule } from "./modules/bank-accounts/bank-accounts.module";
import { DocumentPurchasesModule } from "./modules/document-purchases/document-purchases.module";
import { DocumentsModule } from "./modules/documents/documents.module";
import { TenderSecuritiesModule } from "./modules/tender-securities/tender-securities.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { CreditCommitmentsModule } from "./modules/credit-commitments/credit-commitments.module";
import { PgBgModule } from "./modules/pg-bg/pg-bg.module";
import { CmsWorksModule } from "./modules/cms-works/cms-works.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { ProjectBudgetsModule } from "./modules/project-budgets/project-budgets.module";
import { BoqModule } from "./modules/boq/boq.module";
import { DeductionConfigsModule } from "./modules/deduction-configs/deduction-configs.module";
import { ProjectBillsModule } from "./modules/project-bills/project-bills.module";
import { ChallanSubmissionsModule } from "./modules/challan-submissions/challan-submissions.module";
import { VatTaxCertificatesModule } from "./modules/vat-tax-certificates/vat-tax-certificates.module";
import { VariationOrdersModule } from "./modules/variation-orders/variation-orders.module";
import { TimeExtensionsModule } from "./modules/time-extensions/time-extensions.module";
import { ProjectProgressModule } from "./modules/project-progress/project-progress.module";
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
import { ProjectClosingModule } from "./modules/project-closing/project-closing.module";
import { PartiesModule } from "./modules/parties/parties.module";
import { MasterCategoriesModule } from "./modules/master-categories/master-categories.module";
import { UomsModule } from "./modules/uoms/uoms.module";
import { PaymentTermsModule } from "./modules/payment-terms/payment-terms.module";
import { ItemsModule } from "./modules/items/items.module";
import { PurchaseRequisitionsModule } from "./modules/purchase-requisitions/purchase-requisitions.module";
import { RfqsModule } from "./modules/rfqs/rfqs.module";
import { SupplierQuotationsModule } from "./modules/supplier-quotations/supplier-quotations.module";
import { ComparativeStatementsModule } from "./modules/comparative-statements/comparative-statements.module";
import { PurchaseOrdersModule } from "./modules/purchase-orders/purchase-orders.module";
import { GrnModule } from "./modules/grn/grn.module";
import { SupplierBillsModule } from "./modules/supplier-bills/supplier-bills.module";
import { SupplierPaymentsModule } from "./modules/supplier-payments/supplier-payments.module";
import { SupplierLedgerModule } from "./modules/supplier-ledger/supplier-ledger.module";
import { VendorLicensingModule } from "./modules/vendor-licensing/vendor-licensing.module";
import { SalesQuotationsModule } from "./modules/sales-quotations/sales-quotations.module";
import { WorkIousModule } from "./modules/work-ious/work-ious.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditLogModule,
    AuthModule,
    OrganizationsModule,
    TendersModule,
    BankAccountsModule,
    DocumentPurchasesModule,
    DocumentsModule,
    TenderSecuritiesModule,
    CreditCommitmentsModule,
    PgBgModule,
    CmsWorksModule,
    ContractsModule,
    ProjectBudgetsModule,
    BoqModule,
    DeductionConfigsModule,
    ProjectBillsModule,
    ChallanSubmissionsModule,
    VatTaxCertificatesModule,
    VariationOrdersModule,
    TimeExtensionsModule,
    ProjectProgressModule,
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
    ProjectClosingModule,
    PartiesModule,
    MasterCategoriesModule,
    UomsModule,
    PaymentTermsModule,
    ItemsModule,
    PurchaseRequisitionsModule,
    RfqsModule,
    SupplierQuotationsModule,
    ComparativeStatementsModule,
    PurchaseOrdersModule,
    GrnModule,
    SupplierBillsModule,
    SupplierPaymentsModule,
    SupplierLedgerModule,
    VendorLicensingModule,
    SalesQuotationsModule,
    WorkIousModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
