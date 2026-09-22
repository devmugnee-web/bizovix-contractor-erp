-- Generated from isolated migration replay plus reviewed current-Prisma reconciliation.
-- CLEAN DATABASE ONLY. See docs/offline-first/cloud-database-bootstrap.md.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp%')
     OR EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' AND t.typtype IN ('e', 'd', 'c', 'r', 'm'))
     OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public')
     OR EXISTS (SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public', 'pg_catalog', 'information_schema') AND nspname NOT LIKE 'pg_toast%' AND nspname NOT LIKE 'pg_temp%')
  THEN RAISE EXCEPTION 'Bootstrap requires a completely empty database'; END IF;
END $$;

--
-- PostgreSQL database dump
--



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: AccountType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AccountType" AS ENUM (
    'BANK',
    'CASH'
);


--
-- Name: AdjustmentDirection; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AdjustmentDirection" AS ENUM (
    'ADDITION',
    'DEDUCTION'
);


--
-- Name: ApplicationStage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ApplicationStage" AS ENUM (
    'APPLIED',
    'SCREENING',
    'SHORTLISTED',
    'INTERVIEW',
    'ASSESSMENT',
    'REFERENCE_CHECK',
    'SELECTED',
    'OFFER_SENT',
    'OFFER_ACCEPTED',
    'REJECTED',
    'WITHDRAWN'
);


--
-- Name: AssetAcquisitionType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssetAcquisitionType" AS ENUM (
    'DIRECT_PURCHASE',
    'PURCHASE_ORDER',
    'OPENING_ASSET',
    'DONATION',
    'TRANSFER_IN',
    'INTERNALLY_CONSTRUCTED',
    'OTHER'
);


--
-- Name: AssetCondition; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssetCondition" AS ENUM (
    'NEW',
    'EXCELLENT',
    'GOOD',
    'FAIR',
    'POOR',
    'DAMAGED'
);


--
-- Name: AssetFundingMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssetFundingMode" AS ENUM (
    'CASH_BANK',
    'CREDIT',
    'OPENING_BALANCE'
);


--
-- Name: AssetOperationalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AssetOperationalStatus" AS ENUM (
    'AVAILABLE',
    'ASSIGNED',
    'ACTIVE',
    'UNDER_MAINTENANCE',
    'DAMAGED',
    'LOST',
    'RETIRED'
);


--
-- Name: AttendanceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."AttendanceStatus" AS ENUM (
    'PRESENT',
    'ABSENT',
    'LEAVE',
    'HOLIDAY'
);


--
-- Name: BillMatchStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillMatchStatus" AS ENUM (
    'MATCHED',
    'QUANTITY_VARIANCE',
    'RATE_VARIANCE',
    'AMOUNT_VARIANCE',
    'MISSING_RECEIPT',
    'BLOCKED'
);


--
-- Name: BillStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'CERTIFIED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: BillType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."BillType" AS ENUM (
    'ADVANCE',
    'RUNNING',
    'INTERIM',
    'FINAL'
);


--
-- Name: ChallanSubmissionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ChallanSubmissionStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'PAYMENT_RELEASED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: CmsWorkStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CmsWorkStatus" AS ENUM (
    'ONGOING',
    'COMPLETED',
    'ARCHIVED',
    'CANCELLED',
    'COMPLETION_PENDING',
    'DLP',
    'CLOSEOUT_PENDING'
);


--
-- Name: ComparativeStatementStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ComparativeStatementStatus" AS ENUM (
    'DRAFT',
    'EVALUATED',
    'APPROVED',
    'CANCELLED'
);


--
-- Name: CompletionCertificateEgpStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CompletionCertificateEgpStatus" AS ENUM (
    'UNSPECIFIED',
    'NOT_APPLICABLE',
    'NOT_APPLIED',
    'PENDING',
    'UNDER_PROCESS',
    'OBTAINED'
);


--
-- Name: CompletionCertificateSource; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CompletionCertificateSource" AS ENUM (
    'UNSPECIFIED',
    'EGP',
    'MANUAL'
);


--
-- Name: CompletionCertificateStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."CompletionCertificateStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: ContractStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContractStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'ON_HOLD',
    'COMPLETED',
    'CANCELLED',
    'CLOSED'
);


--
-- Name: ContractType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ContractType" AS ENUM (
    'WORK_ORDER',
    'CONTRACT_AGREEMENT',
    'PURCHASE_ORDER',
    'SERVICE_CONTRACT',
    'OTHER'
);


--
-- Name: DeductionCalcType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DeductionCalcType" AS ENUM (
    'FIXED_AMOUNT',
    'PERCENTAGE'
);


--
-- Name: DefectStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DefectStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'RECTIFIED',
    'VERIFIED',
    'CLOSED'
);


--
-- Name: DlpStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DlpStatus" AS ENUM (
    'NOT_STARTED',
    'ACTIVE',
    'EXPIRED',
    'COMPLETED',
    'EXTENDED'
);


--
-- Name: DocumentPurchaseRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."DocumentPurchaseRequestStatus" AS ENUM (
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'PURCHASED'
);


--
-- Name: EmployeeChangeType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmployeeChangeType" AS ENUM (
    'PROMOTION',
    'TRANSFER',
    'DEPARTMENT_CHANGE',
    'DESIGNATION_CHANGE',
    'GRADE_CHANGE',
    'SALARY_REVISION',
    'REPORTING_MANAGER_CHANGE',
    'LOCATION_CHANGE',
    'EMPLOYMENT_TYPE_CHANGE'
);


--
-- Name: EmployeeLoanStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmployeeLoanStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'DISBURSED',
    'SETTLED'
);


--
-- Name: EmployeeLoanType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmployeeLoanType" AS ENUM (
    'LOAN',
    'SALARY_ADVANCE',
    'EXPENSE_ADVANCE'
);


--
-- Name: EmployeeStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmployeeStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'RESIGNED',
    'TERMINATED'
);


--
-- Name: EmploymentType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."EmploymentType" AS ENUM (
    'PERMANENT',
    'PROBATION',
    'CONTRACTUAL',
    'INTERN'
);


--
-- Name: ExitProcessStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExitProcessStatus" AS ENUM (
    'IN_PROGRESS',
    'COMPLETED'
);


--
-- Name: ExpenseNature; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExpenseNature" AS ENUM (
    'DIRECT',
    'INDIRECT'
);


--
-- Name: ExpensePaymentMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExpensePaymentMode" AS ENUM (
    'CASH_BANK',
    'PAYABLE'
);


--
-- Name: ExpenseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ExpenseStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'AMENDED'
);


--
-- Name: FixedAssetDepreciationMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FixedAssetDepreciationMethod" AS ENUM (
    'STRAIGHT_LINE'
);


--
-- Name: FixedAssetStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FixedAssetStatus" AS ENUM (
    'ACTIVE',
    'DISPOSED',
    'FULLY_DEPRECIATED'
);


--
-- Name: FundingType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."FundingType" AS ENUM (
    'LOAN',
    'CASH'
);


--
-- Name: Gender; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."Gender" AS ENUM (
    'MALE',
    'FEMALE',
    'OTHER'
);


--
-- Name: GrnInspectionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GrnInspectionStatus" AS ENUM (
    'PENDING',
    'ACCEPTED',
    'PARTIAL',
    'REJECTED'
);


--
-- Name: GuaranteeType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."GuaranteeType" AS ENUM (
    'PG',
    'BG'
);


--
-- Name: HandoverStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HandoverStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: HandoverType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HandoverType" AS ENUM (
    'PROVISIONAL',
    'FINAL'
);


--
-- Name: HrExpenseCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HrExpenseCategory" AS ENUM (
    'TRAVEL',
    'MEAL',
    'TRANSPORTATION',
    'ACCOMMODATION',
    'OTHER'
);


--
-- Name: HrExpenseClaimStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."HrExpenseClaimStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'REIMBURSED'
);


--
-- Name: InstrumentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."InstrumentStatus" AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'RELEASED',
    'RELEASE_REQUESTED',
    'RETURNED',
    'ENCASHED',
    'CANCELLED'
);


--
-- Name: ItemStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ItemStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE'
);


--
-- Name: ItemType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ItemType" AS ENUM (
    'MATERIAL',
    'SERVICE',
    'EQUIPMENT',
    'CONSUMABLE',
    'OTHER'
);


--
-- Name: JobOpeningStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."JobOpeningStatus" AS ENUM (
    'OPEN',
    'ON_HOLD',
    'CLOSED'
);


--
-- Name: LcAllocationBasis; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LcAllocationBasis" AS ENUM (
    'PURCHASE_VALUE',
    'USD_VALUE',
    'QUANTITY',
    'WEIGHT',
    'CBM',
    'EQUAL'
);


--
-- Name: LcAllocationMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LcAllocationMode" AS ENUM (
    'AUTO',
    'MANUAL_AMOUNT',
    'MANUAL_PERCENTAGE',
    'HYBRID',
    'DIRECT_PRODUCT'
);


--
-- Name: LcCostCategory; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LcCostCategory" AS ENUM (
    'LC_BANKING',
    'ORIGIN',
    'FREIGHT',
    'INSURANCE',
    'CUSTOMS',
    'TAX',
    'CNF',
    'PORT',
    'DESTINATION_TRANSPORT',
    'LOCAL',
    'OTHER'
);


--
-- Name: LcLandedCostStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LcLandedCostStatus" AS ENUM (
    'DRAFT',
    'FINALIZED'
);


--
-- Name: LcProfitMode; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LcProfitMode" AS ENUM (
    'PERCENTAGE',
    'FIXED'
);


--
-- Name: LcStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LcStatus" AS ENUM (
    'DRAFT',
    'ACTIVE',
    'COSTING_PENDING',
    'ALLOCATION_PENDING',
    'READY_TO_FINALIZE',
    'FINALIZED',
    'CLOSED',
    'CANCELLED'
);


--
-- Name: LeaveRequestStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."LeaveRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: MasterCategoryType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."MasterCategoryType" AS ENUM (
    'VENDOR',
    'MATERIAL',
    'SUBCONTRACTOR_TRADE',
    'DOCUMENT_PURCHASE'
);


--
-- Name: PartyRole; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PartyRole" AS ENUM (
    'CLIENT',
    'VENDOR',
    'SUPPLIER',
    'SUBCONTRACTOR',
    'SERVICE_PROVIDER',
    'OTHER'
);


--
-- Name: PartyStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PartyStatus" AS ENUM (
    'ACTIVE',
    'INACTIVE',
    'SUSPENDED',
    'BLACKLISTED',
    'ARCHIVED'
);


--
-- Name: PayrollRunStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayrollRunStatus" AS ENUM (
    'DRAFT',
    'APPROVED',
    'PAID'
);


--
-- Name: PayslipPaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PayslipPaymentStatus" AS ENUM (
    'PENDING',
    'PAID'
);


--
-- Name: PgBgWorkflowStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PgBgWorkflowStatus" AS ENUM (
    'DRAFT',
    'NOA_ACCEPTED',
    'NOA_REJECTED',
    'FINALIZED'
);


--
-- Name: PrPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PrPriority" AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'URGENT'
);


--
-- Name: PrStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PrStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'CONVERTED'
);


--
-- Name: ProjectBudgetStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ProjectBudgetStatus" AS ENUM (
    'DRAFT',
    'APPROVED',
    'REVISED',
    'ARCHIVED'
);


--
-- Name: PurchaseOrderStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PurchaseOrderStatus" AS ENUM (
    'DRAFT',
    'APPROVED',
    'ISSUED',
    'PARTIALLY_RECEIVED',
    'RECEIVED',
    'CANCELLED',
    'CLOSED'
);


--
-- Name: PurchaseType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."PurchaseType" AS ENUM (
    'EGP',
    'MANUAL'
);


--
-- Name: QuotationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."QuotationStatus" AS ENUM (
    'RECEIVED',
    'SUPERSEDED',
    'WITHDRAWN'
);


--
-- Name: ReceiptStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."ReceiptStatus" AS ENUM (
    'PENDING',
    'RECEIVED',
    'CANCELLED'
);


--
-- Name: RetentionReleaseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RetentionReleaseStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'RELEASED',
    'CANCELLED'
);


--
-- Name: RfqStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."RfqStatus" AS ENUM (
    'DRAFT',
    'ISSUED',
    'CLOSED',
    'CANCELLED',
    'AWARDED'
);


--
-- Name: SalaryPaymentMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SalaryPaymentMethod" AS ENUM (
    'CASH',
    'BANK',
    'MFS'
);


--
-- Name: SalesQuotationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SalesQuotationStatus" AS ENUM (
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'REJECTED'
);


--
-- Name: SecurityType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SecurityType" AS ENUM (
    'PAY_ORDER',
    'BANK_GUARANTEE'
);


--
-- Name: SeparationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SeparationType" AS ENUM (
    'RESIGNATION',
    'TERMINATION',
    'RETIREMENT',
    'CONTRACT_EXPIRY'
);


--
-- Name: StockMovementType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."StockMovementType" AS ENUM (
    'LC_RECEIPT',
    'LC_REVERSAL',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT'
);


--
-- Name: SubscriptionPlan; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubscriptionPlan" AS ENUM (
    'TRIAL',
    'PREMIUM',
    'ENTERPRISE'
);


--
-- Name: SubscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SubscriptionStatus" AS ENUM (
    'TRIALING',
    'ACTIVE',
    'EXPIRED',
    'CANCELED',
    'PAST_DUE',
    'SUSPENDED'
);


--
-- Name: SupplierBillStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupplierBillStatus" AS ENUM (
    'DRAFT',
    'APPROVAL_PENDING',
    'APPROVED',
    'PARTIALLY_PAID',
    'PAID',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: SupplierPaymentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupplierPaymentStatus" AS ENUM (
    'ACTIVE',
    'CANCELLED'
);


--
-- Name: SupportMessageAuthorType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportMessageAuthorType" AS ENUM (
    'CUSTOMER',
    'SUPPORT'
);


--
-- Name: SupportTicketIssueType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportTicketIssueType" AS ENUM (
    'TECHNICAL',
    'HOW_TO',
    'DATA',
    'FEATURE',
    'ACCOUNT'
);


--
-- Name: SupportTicketPriority; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportTicketPriority" AS ENUM (
    'NORMAL',
    'HIGH',
    'URGENT'
);


--
-- Name: SupportTicketStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."SupportTicketStatus" AS ENUM (
    'OPEN',
    'IN_PROGRESS',
    'WAITING_FOR_CUSTOMER',
    'RESOLVED',
    'CLOSED'
);


--
-- Name: TechnicalComplianceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TechnicalComplianceStatus" AS ENUM (
    'COMPLIANT',
    'PARTIALLY_COMPLIANT',
    'NON_COMPLIANT'
);


--
-- Name: TenderCostingApprovalStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TenderCostingApprovalStatus" AS ENUM (
    'DRAFT',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED'
);


--
-- Name: TenderCostingStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TenderCostingStatus" AS ENUM (
    'READY',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: TenderProcurementMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TenderProcurementMethod" AS ENUM (
    'OTM',
    'RFQ',
    'LTM',
    'TSTM',
    'QCBS',
    'LCS',
    'SFB',
    'DC',
    'SBCQ',
    'SSS',
    'IC',
    'CSE',
    'DPM',
    'OSTETM',
    'RFQU',
    'RFQL'
);


--
-- Name: TenderSecurityDocumentStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TenderSecurityDocumentStatus" AS ENUM (
    'PENDING',
    'CREATED',
    'NOT_REQUIRED'
);


--
-- Name: TenderStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TenderStatus" AS ENUM (
    'SUBMITTED',
    'UNDER_PROCESS',
    'NOA',
    'AWARDED',
    'ONGOING',
    'COMPLETED',
    'REJECTED',
    'DRAFT',
    'PUBLISHED',
    'DOCUMENT_PURCHASED',
    'PREPARING',
    'OPENED',
    'CANCELLED'
);


--
-- Name: TenderVatTaxEntryKind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TenderVatTaxEntryKind" AS ENUM (
    'SELF_DEPOSIT',
    'BILL_DEDUCTION'
);


--
-- Name: TimeExtensionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."TimeExtensionStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: VariationStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VariationStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
);


--
-- Name: VariationType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VariationType" AS ENUM (
    'ADDITION',
    'OMISSION',
    'RATE_CHANGE',
    'QUANTITY_CHANGE',
    'NEW_ITEM',
    'OTHER'
);


--
-- Name: VatTaxCertificateStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VatTaxCertificateStatus" AS ENUM (
    'PENDING',
    'UNDER_PROCESSING',
    'ISSUED',
    'NOT_ISSUED',
    'REJECTED',
    'RETURNED'
);


--
-- Name: VatTaxCertificateType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VatTaxCertificateType" AS ENUM (
    'VAT',
    'TAX'
);


--
-- Name: VendorBillingCycle; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VendorBillingCycle" AS ENUM (
    'MONTHLY',
    'QUARTERLY',
    'YEARLY'
);


--
-- Name: VendorDeviceStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VendorDeviceStatus" AS ENUM (
    'ACTIVE',
    'DEACTIVATED'
);


--
-- Name: VendorLicenseStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VendorLicenseStatus" AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'SUSPENDED',
    'REVOKED'
);


--
-- Name: VendorLicenseType; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VendorLicenseType" AS ENUM (
    'ONE_TIME',
    'SUBSCRIPTION',
    'TRIAL'
);


--
-- Name: VendorSubscriptionStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."VendorSubscriptionStatus" AS ENUM (
    'ACTIVE',
    'EXPIRED',
    'SUSPENDED',
    'CANCELLED'
);


--
-- Name: WorkIouExpenseFor; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkIouExpenseFor" AS ENUM (
    'TENDER',
    'PROJECT'
);


--
-- Name: WorkIouPaymentMethod; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkIouPaymentMethod" AS ENUM (
    'CASH',
    'BANK_TRANSFER',
    'CARD',
    'MOBILE_BANKING',
    'CHEQUE',
    'OTHER'
);


--
-- Name: WorkIouSettlementStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkIouSettlementStatus" AS ENUM (
    'PENDING',
    'PARTIALLY_SETTLED',
    'SETTLED'
);


--
-- Name: WorkIouStatus; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public."WorkIouStatus" AS ENUM (
    'DRAFT',
    'SUBMITTED',
    'CANCELLED'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounting_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_periods (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    label text NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'OPEN'::text NOT NULL,
    "lockedById" text,
    "lockedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    id text NOT NULL,
    "organizationId" text,
    key text NOT NULL,
    value jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: approval_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_rules (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    module text NOT NULL,
    "transactionType" text,
    "minAmount" numeric(18,2),
    "maxAmount" numeric(18,2),
    "approvalRequired" boolean DEFAULT true NOT NULL,
    "approverRole" text NOT NULL,
    "approvalLevel" integer DEFAULT 1 NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: asset_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_categories (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "parentId" text,
    name text NOT NULL,
    code text NOT NULL,
    "defaultUsefulLifeMonths" integer,
    "defaultSalvageValue" numeric(18,4),
    "defaultDepreciationMethod" public."FixedAssetDepreciationMethod" DEFAULT 'STRAIGHT_LINE'::public."FixedAssetDepreciationMethod" NOT NULL,
    "assetLedgerId" text,
    "accumulatedDepreciationLedgerId" text,
    "depreciationExpenseLedgerId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text,
    action text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text,
    "oldValue" jsonb,
    "newValue" jsonb,
    "ipAddress" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    module text DEFAULT 'System'::text NOT NULL,
    description text DEFAULT 'System activity'::text NOT NULL,
    "referenceNo" text,
    status text DEFAULT 'SUCCESS'::text NOT NULL,
    "userAgent" text
);


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "accountName" text NOT NULL,
    "accountType" public."AccountType" NOT NULL,
    "bankName" text,
    "accountNumber" text,
    "currentBalance" numeric(18,2) DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    branch text,
    "routingNumber" text,
    "bankAccountType" text,
    "openingBalance" numeric(18,2) DEFAULT 0 NOT NULL,
    "openingBalanceDate" timestamp(3) without time zone,
    currency text DEFAULT 'BDT'::text NOT NULL,
    remarks text,
    "isActive" boolean DEFAULT true NOT NULL,
    "emiDate" date
);


--
-- Name: bank_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_reconciliations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "accountId" text NOT NULL,
    "statementFrom" timestamp(3) without time zone NOT NULL,
    "statementTo" timestamp(3) without time zone NOT NULL,
    "erpBalance" numeric(18,2) NOT NULL,
    "statementBalance" numeric(18,2) NOT NULL,
    difference numeric(18,2) NOT NULL,
    status text DEFAULT 'IN_PROGRESS'::text NOT NULL,
    "reconciledById" text,
    "reconciledAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: bill_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bill_adjustments (
    id text NOT NULL,
    "billId" text NOT NULL,
    type text NOT NULL,
    direction public."AdjustmentDirection" NOT NULL,
    description text,
    "calculationType" public."DeductionCalcType" DEFAULT 'FIXED_AMOUNT'::public."DeductionCalcType" NOT NULL,
    rate numeric(8,4),
    "baseAmount" numeric(18,2),
    amount numeric(18,2) NOT NULL,
    "ledgerAccountId" text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: billing_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.billing_profiles (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "billingName" text,
    "billingEmail" text,
    phone text,
    "billingAddress" text,
    "tinNumber" text,
    "binNumber" text,
    "paymentMethodType" text DEFAULT 'MANUAL'::text NOT NULL,
    "paymentMethodLabel" text,
    "paymentVerified" boolean DEFAULT false NOT NULL,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: boq_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boq_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cmsWorkId" text NOT NULL,
    "sectionId" text,
    "itemCode" text,
    description text NOT NULL,
    unit text NOT NULL,
    "contractQty" numeric(18,3) NOT NULL,
    "unitRate" numeric(18,2) NOT NULL,
    "contractAmount" numeric(18,2) NOT NULL,
    "executedQty" numeric(18,3) DEFAULT 0 NOT NULL,
    "executedValue" numeric(18,2) DEFAULT 0 NOT NULL,
    specification text,
    remarks text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "originalAmount" numeric(18,2) NOT NULL,
    "originalQty" numeric(18,3) NOT NULL,
    "originalRate" numeric(18,2) NOT NULL
);


--
-- Name: boq_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.boq_sections (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cmsWorkId" text NOT NULL,
    name text NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: challan_submission_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challan_submission_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "challanSubmissionId" text NOT NULL,
    "itemCode" text,
    description text NOT NULL,
    unit text NOT NULL,
    quantity numeric(18,3) NOT NULL,
    rate numeric(18,2) NOT NULL,
    amount numeric(18,2) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: challan_submission_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challan_submission_status_history (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "challanSubmissionId" text NOT NULL,
    "fromStatus" public."ChallanSubmissionStatus",
    "toStatus" public."ChallanSubmissionStatus" NOT NULL,
    action text NOT NULL,
    note text,
    "actedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: challan_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.challan_submissions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cmsWorkId" text NOT NULL,
    "contractId" text,
    "challanNo" text NOT NULL,
    "challanDate" timestamp(3) without time zone NOT NULL,
    description text NOT NULL,
    "challanType" text NOT NULL,
    "challanMonth" timestamp(3) without time zone NOT NULL,
    "periodFrom" timestamp(3) without time zone NOT NULL,
    "periodTo" timestamp(3) without time zone NOT NULL,
    "receivedBy" text NOT NULL,
    "receivedAt" text NOT NULL,
    "submittedTo" text NOT NULL,
    "paymentFrom" text NOT NULL,
    remarks text,
    "totalAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "approvedAmount" numeric(18,2),
    status public."ChallanSubmissionStatus" DEFAULT 'DRAFT'::public."ChallanSubmissionStatus" NOT NULL,
    "createdById" text,
    "submittedAt" timestamp(3) without time zone,
    "submittedById" text,
    "reviewStartedAt" timestamp(3) without time zone,
    "reviewStartedById" text,
    "approvedAt" timestamp(3) without time zone,
    "approvedById" text,
    "paymentReleasedAt" timestamp(3) without time zone,
    "paymentReleasedById" text,
    "rejectedAt" timestamp(3) without time zone,
    "rejectedById" text,
    "rejectionReason" text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledById" text,
    "cancellationReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: cheques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cheques (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "chequeNo" text NOT NULL,
    type text NOT NULL,
    "accountId" text,
    "bankName" text NOT NULL,
    branch text,
    party text NOT NULL,
    amount numeric(18,2) NOT NULL,
    "chequeDate" timestamp(3) without time zone NOT NULL,
    "actionDate" timestamp(3) without time zone,
    "referenceNo" text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    remarks text,
    "postedAt" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: cms_works; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cms_works (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text,
    "documentPurchaseId" text,
    "pgBgWorkflowId" text,
    "organizationMasterId" text NOT NULL,
    "workName" text NOT NULL,
    "workCategory" text NOT NULL,
    "contractValue" numeric(18,2) NOT NULL,
    status public."CmsWorkStatus" DEFAULT 'ONGOING'::public."CmsWorkStatus" NOT NULL,
    "startDate" timestamp(3) without time zone,
    "expectedCompletionDate" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "completionDate" timestamp(3) without time zone,
    "closedAt" timestamp(3) without time zone,
    "closedById" text,
    "archivedAt" timestamp(3) without time zone,
    "archivedById" text
);


--
-- Name: company_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_profiles (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "legalName" text,
    "displayName" text,
    address text,
    phone text,
    email text,
    website text,
    "tradeLicenseNo" text,
    "tinNumber" text,
    "binNumber" text,
    "registrationNumber" text,
    "signatoryName" text,
    "signatoryDesignation" text,
    "logoMimeType" text,
    "logoData" bytea,
    "signatureMimeType" text,
    "signatureData" bytea,
    "sealMimeType" text,
    "sealData" bytea,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: comparative_statement_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comparative_statement_suppliers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "comparativeStatementId" text NOT NULL,
    "supplierId" text NOT NULL,
    "quotationId" text NOT NULL,
    "quotedTotal" numeric(18,2) NOT NULL,
    "commercialAdjustment" numeric(18,2) DEFAULT 0 NOT NULL,
    "evaluatedTotal" numeric(18,2) NOT NULL,
    "deliveryDays" integer,
    "paymentTerms" text,
    "technicalStatus" public."TechnicalComplianceStatus" DEFAULT 'COMPLIANT'::public."TechnicalComplianceStatus" NOT NULL,
    recommended boolean DEFAULT false NOT NULL,
    rank integer,
    "isSelected" boolean DEFAULT false NOT NULL,
    remarks text
);


--
-- Name: comparative_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comparative_statements (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "rfqId" text NOT NULL,
    "cmsWorkId" text,
    "csNo" text NOT NULL,
    status public."ComparativeStatementStatus" DEFAULT 'DRAFT'::public."ComparativeStatementStatus" NOT NULL,
    "decisionNotes" text,
    "preparedById" text,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: completion_certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.completion_certificates (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workId" text NOT NULL,
    "contractId" text NOT NULL,
    "certificateNo" text NOT NULL,
    "completionType" text DEFAULT 'FINAL'::text NOT NULL,
    "applicationDate" timestamp(3) without time zone NOT NULL,
    "actualCompletionDate" timestamp(3) without time zone NOT NULL,
    "certifiedCompletionDate" timestamp(3) without time zone,
    "issuingAuthority" text,
    "certificateDate" timestamp(3) without time zone,
    remarks text,
    status public."CompletionCertificateStatus" DEFAULT 'DRAFT'::public."CompletionCertificateStatus" NOT NULL,
    "createdById" text,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    source public."CompletionCertificateSource" DEFAULT 'UNSPECIFIED'::public."CompletionCertificateSource" NOT NULL,
    "egpStatus" public."CompletionCertificateEgpStatus" DEFAULT 'UNSPECIFIED'::public."CompletionCertificateEgpStatus" NOT NULL,
    "egpAppliedOn" timestamp(3) without time zone,
    "egpObtainedOn" timestamp(3) without time zone,
    CONSTRAINT completion_certificates_egp_dates_check CHECK (((("egpStatus" = ANY (ARRAY['UNSPECIFIED'::public."CompletionCertificateEgpStatus", 'NOT_APPLICABLE'::public."CompletionCertificateEgpStatus", 'NOT_APPLIED'::public."CompletionCertificateEgpStatus"])) AND ("egpAppliedOn" IS NULL) AND ("egpObtainedOn" IS NULL)) OR (("egpStatus" = ANY (ARRAY['PENDING'::public."CompletionCertificateEgpStatus", 'UNDER_PROCESS'::public."CompletionCertificateEgpStatus"])) AND ("egpAppliedOn" IS NOT NULL) AND ("egpObtainedOn" IS NULL)) OR (("egpStatus" = 'OBTAINED'::public."CompletionCertificateEgpStatus") AND ("egpAppliedOn" IS NOT NULL) AND ("egpObtainedOn" IS NOT NULL) AND ("egpObtainedOn" >= "egpAppliedOn")))),
    CONSTRAINT completion_certificates_source_tracking_check CHECK ((((source = 'UNSPECIFIED'::public."CompletionCertificateSource") AND ("egpStatus" = 'UNSPECIFIED'::public."CompletionCertificateEgpStatus") AND ("egpAppliedOn" IS NULL) AND ("egpObtainedOn" IS NULL)) OR ((source = 'EGP'::public."CompletionCertificateSource") AND ("egpStatus" = 'NOT_APPLICABLE'::public."CompletionCertificateEgpStatus") AND ("egpAppliedOn" IS NULL) AND ("egpObtainedOn" IS NULL)) OR ((source = 'MANUAL'::public."CompletionCertificateSource") AND ("egpStatus" = ANY (ARRAY['NOT_APPLIED'::public."CompletionCertificateEgpStatus", 'PENDING'::public."CompletionCertificateEgpStatus", 'UNDER_PROCESS'::public."CompletionCertificateEgpStatus", 'OBTAINED'::public."CompletionCertificateEgpStatus"])))))
);


--
-- Name: credit_commitment_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_commitment_items (
    id text NOT NULL,
    "creditCommitmentId" text NOT NULL,
    "documentPurchaseId" text NOT NULL,
    "bankAccountId" text NOT NULL,
    "chargeAmount" numeric(18,2) NOT NULL,
    remarks text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: credit_commitments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_commitments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text,
    "organizationMasterId" text,
    amount numeric(18,2) NOT NULL,
    "chargeDate" timestamp(3) without time zone NOT NULL,
    "isCharged" boolean DEFAULT false NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "paymentFromAccountId" text,
    "paymentDate" timestamp(3) without time zone,
    remarks text,
    "totalAmount" numeric(18,2) DEFAULT 0 NOT NULL
);


--
-- Name: deduction_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deduction_configs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    type text NOT NULL,
    name text NOT NULL,
    code text,
    rate numeric(8,4) NOT NULL,
    "effectiveFrom" timestamp(3) without time zone NOT NULL,
    "effectiveTo" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: defect_liability_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.defect_liability_periods (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workId" text NOT NULL,
    "contractId" text NOT NULL,
    "completionCertificateId" text NOT NULL,
    "startDate" timestamp(3) without time zone NOT NULL,
    "endDate" timestamp(3) without time zone NOT NULL,
    "durationDays" integer NOT NULL,
    status public."DlpStatus" DEFAULT 'NOT_STARTED'::public."DlpStatus" NOT NULL,
    remarks text,
    "createdById" text,
    "completedById" text,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "originalStartDate" timestamp(3) without time zone,
    "originalEndDate" timestamp(3) without time zone
);


--
-- Name: desktop_master_sync_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_master_sync_changes (
    "organizationId" text NOT NULL,
    "entityType" text NOT NULL,
    sequence bigint NOT NULL,
    "entityId" text NOT NULL,
    "operationId" text,
    record jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT "desktop_master_sync_changes_entityType_check" CHECK (("entityType" = ANY (ARRAY['uom'::text, 'paymentTerm'::text, 'organizationMaster'::text]))),
    CONSTRAINT desktop_master_sync_changes_sequence_check CHECK ((sequence > 0))
);


--
-- Name: desktop_master_sync_clocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_master_sync_clocks (
    "organizationId" text NOT NULL,
    "entityType" text NOT NULL,
    epoch text NOT NULL,
    sequence bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "desktop_master_sync_clocks_entityType_check" CHECK (("entityType" = ANY (ARRAY['uom'::text, 'paymentTerm'::text, 'organizationMaster'::text]))),
    CONSTRAINT desktop_master_sync_clocks_sequence_check CHECK ((sequence >= 0))
);


--
-- Name: desktop_master_sync_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_master_sync_versions (
    "organizationId" text NOT NULL,
    "entityType" text NOT NULL,
    "entityId" text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT "desktop_master_sync_versions_entityType_check" CHECK (("entityType" = ANY (ARRAY['uom'::text, 'paymentTerm'::text, 'organizationMaster'::text]))),
    CONSTRAINT desktop_master_sync_versions_version_check CHECK ((version > 0))
);


--
-- Name: desktop_sync_category_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_sync_category_versions (
    "organizationId" text NOT NULL,
    "categoryId" text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT desktop_sync_category_versions_version_check CHECK ((version > 0))
);


--
-- Name: desktop_sync_changes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_sync_changes (
    "organizationId" text NOT NULL,
    sequence bigint NOT NULL,
    "categoryId" text NOT NULL,
    "operationId" text,
    category jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT desktop_sync_changes_sequence_check CHECK ((sequence > 0))
);


--
-- Name: desktop_sync_clocks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_sync_clocks (
    "organizationId" text NOT NULL,
    epoch text NOT NULL,
    sequence bigint DEFAULT 0 NOT NULL,
    CONSTRAINT desktop_sync_clocks_sequence_check CHECK ((sequence >= 0))
);


--
-- Name: desktop_sync_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_sync_devices (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    "deviceName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "revokedAt" timestamp(3) without time zone
);


--
-- Name: desktop_sync_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_sync_receipts (
    "organizationId" text NOT NULL,
    "deviceId" text NOT NULL,
    "operationId" text NOT NULL,
    "userId" text NOT NULL,
    "requestHash" text NOT NULL,
    result jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: dlp_defects; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dlp_defects (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "dlpId" text NOT NULL,
    "workId" text NOT NULL,
    "defectNo" text NOT NULL,
    description text NOT NULL,
    "reportedDate" timestamp(3) without time zone NOT NULL,
    "reportedBy" text,
    "responsiblePerson" text,
    "targetRectificationDate" timestamp(3) without time zone,
    "rectifiedDate" timestamp(3) without time zone,
    status public."DefectStatus" DEFAULT 'OPEN'::public."DefectStatus" NOT NULL,
    mandatory boolean DEFAULT true NOT NULL,
    remarks text,
    "createdById" text,
    "verifiedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "verifiedDate" timestamp(3) without time zone,
    "closedDate" timestamp(3) without time zone,
    priority text DEFAULT 'MEDIUM'::text NOT NULL
);


--
-- Name: dlp_extensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dlp_extensions (
    id text NOT NULL,
    "dlpId" text NOT NULL,
    "previousEndDate" timestamp(3) without time zone NOT NULL,
    "revisedEndDate" timestamp(3) without time zone NOT NULL,
    "extensionDays" integer NOT NULL,
    reason text NOT NULL,
    "approvedById" text NOT NULL,
    "approvedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: document_purchase_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_purchase_requests (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text NOT NULL,
    "costingId" text NOT NULL,
    status public."DocumentPurchaseRequestStatus" DEFAULT 'PENDING_APPROVAL'::public."DocumentPurchaseRequestStatus" NOT NULL,
    "requestedById" text,
    "requestedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "rejectedById" text,
    "rejectedAt" timestamp(3) without time zone,
    "rejectionReason" text,
    "documentPurchaseId" text,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: document_purchases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_purchases (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "purchaseType" public."PurchaseType" NOT NULL,
    "egpTenderId" text,
    "organizationMasterId" text NOT NULL,
    "paymentFromAccountId" text NOT NULL,
    "tenderWorkName" text NOT NULL,
    "purchaseDate" timestamp(3) without time zone NOT NULL,
    "documentPrice" numeric(18,2) NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "tenderSecurityStatus" public."TenderSecurityDocumentStatus" DEFAULT 'PENDING'::public."TenderSecurityDocumentStatus" NOT NULL,
    "estimatedTenderAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "linkedTenderId" text,
    category text,
    "submissionDate" timestamp(3) without time zone,
    "openingDate" timestamp(3) without time zone,
    remarks text,
    "bankCharge" numeric(18,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "document_purchases_bankCharge_nonnegative" CHECK (("bankCharge" >= (0)::numeric))
);


--
-- Name: document_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_settings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "allowedFileTypes" text[] DEFAULT ARRAY['PDF'::text, 'DOC'::text, 'DOCX'::text, 'XLS'::text, 'XLSX'::text, 'JPG'::text, 'JPEG'::text, 'PNG'::text],
    "maxFileSizeMb" integer DEFAULT 10 NOT NULL,
    "defaultExpiryReminderDays" integer DEFAULT 30 NOT NULL,
    "enableVersionControl" boolean DEFAULT false NOT NULL,
    "enableExpiryTracking" boolean DEFAULT true NOT NULL,
    "autoArchiveExpired" boolean DEFAULT false NOT NULL,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: document_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_versions (
    id text NOT NULL,
    "documentId" text NOT NULL,
    version integer NOT NULL,
    "fileName" text NOT NULL,
    "fileType" text NOT NULL,
    "fileSize" integer NOT NULL,
    "storageKey" text NOT NULL,
    "uploadedById" text,
    "uploadedByName" text,
    "changeNote" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    category text,
    "fileUrl" text,
    "expiryDate" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    account text,
    amount numeric(18,2),
    "archiveReason" text,
    "archivedAt" timestamp(3) without time zone,
    "archivedById" text,
    "archivedByName" text,
    "certificateNumber" text,
    "currentVersion" integer DEFAULT 1 NOT NULL,
    description text,
    "documentType" text,
    "fileName" text,
    "fileSize" integer,
    "fileType" text,
    "issueDate" timestamp(3) without time zone,
    "issuingAuthority" text,
    "organizationMasterId" text,
    "referenceNumber" text,
    "relatedEntityId" text,
    "relatedEntityName" text,
    "relatedModule" text,
    "reminderDays" integer,
    "responsiblePerson" text,
    status text DEFAULT 'ACTIVE'::text NOT NULL,
    "storageKey" text,
    tags text[] DEFAULT ARRAY[]::text[],
    "tenderId" text,
    "uploadedById" text,
    "uploadedByName" text,
    "workId" text,
    "contractId" text,
    "projectBillId" text,
    "timeExtensionId" text,
    "variationOrderId" text,
    "completionCertificateId" text,
    "dlpId" text,
    "defectId" text,
    "retentionReleaseId" text,
    "projectHandoverId" text,
    "partyId" text,
    "comparativeStatementId" text,
    "goodsReceiptNoteId" text,
    "purchaseOrderId" text,
    "purchaseRequisitionId" text,
    "rfqId" text,
    "supplierQuotationId" text,
    "supplierBillId" text,
    "supplierPaymentId" text,
    "challanSubmissionId" text,
    "vatTaxCertificateId" text
);


--
-- Name: expense_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_attachments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "expenseId" text NOT NULL,
    "fileName" text NOT NULL,
    "mimeType" text NOT NULL,
    "fileSize" integer NOT NULL,
    data bytea NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: expense_heads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_heads (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "ledgerAccountId" text,
    nature public."ExpenseNature" DEFAULT 'INDIRECT'::public."ExpenseNature" NOT NULL,
    "budgetCategory" text
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    category text,
    description text,
    amount numeric(18,2) NOT NULL,
    "expenseDate" timestamp(3) without time zone NOT NULL,
    "dueDate" timestamp(3) without time zone,
    status public."ExpenseStatus" DEFAULT 'PENDING'::public."ExpenseStatus" NOT NULL,
    "approvedById" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "workId" text,
    "expenseHeadId" text,
    "expenseById" text,
    "paidFromAccountId" text,
    "referenceNo" text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledById" text,
    "cancellationReason" text,
    "replacesExpenseId" text,
    "expenseLedgerAccountId" text,
    "expenseNature" public."ExpenseNature" DEFAULT 'INDIRECT'::public."ExpenseNature" NOT NULL,
    "payableId" text,
    "payablePartyId" text,
    "paymentMode" public."ExpensePaymentMode" DEFAULT 'CASH_BANK'::public."ExpensePaymentMode" NOT NULL
);


--
-- Name: finance_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_settings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "defaultCashAccountId" text,
    "defaultPettyCashAccountId" text,
    "defaultBankChargeAccountId" text,
    "defaultReceivableAccountId" text,
    "defaultPayableAccountId" text,
    "defaultProjectRevenueAccountId" text,
    "defaultGeneralExpenseAccountId" text,
    "defaultTenderDocumentExpenseAccountId" text,
    "defaultCreditCommitmentChargeAccountId" text,
    "autoPostApproved" boolean DEFAULT false NOT NULL,
    "requireApprovalBeforePosting" boolean DEFAULT true NOT NULL,
    "allowBackdatedTransactions" boolean DEFAULT true NOT NULL,
    "allowFutureDatedTransactions" boolean DEFAULT false NOT NULL,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "billRateTolerancePct" numeric(5,2)
);


--
-- Name: financial_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_transactions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "transactionNo" text NOT NULL,
    "accountId" text NOT NULL,
    direction text NOT NULL,
    amount numeric(18,2) NOT NULL,
    "balanceAfter" numeric(18,2) NOT NULL,
    "sourceModule" text NOT NULL,
    "sourceType" text NOT NULL,
    "sourceId" text NOT NULL,
    "referenceNo" text,
    description text NOT NULL,
    "transactionDate" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'POSTED'::text NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: fixed_asset_depreciation_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_asset_depreciation_entries (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "fixedAssetId" text NOT NULL,
    "periodStart" date NOT NULL,
    "periodEnd" date NOT NULL,
    amount numeric(18,4) NOT NULL,
    "journalEntryId" text NOT NULL,
    "postedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: fixed_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fixed_assets (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "assetLedgerId" text NOT NULL,
    "assetCode" text NOT NULL,
    "categoryId" text,
    "supplierId" text,
    "fundingMode" public."AssetFundingMode" DEFAULT 'CASH_BANK'::public."AssetFundingMode" NOT NULL,
    "fundingBankAccountId" text,
    "payableId" text,
    "acquisitionJournalId" text,
    name text NOT NULL,
    category text,
    location text,
    department text,
    "assignedToName" text,
    brand text,
    model text,
    manufacturer text,
    "serialNumber" text,
    "registrationNumber" text,
    condition public."AssetCondition" DEFAULT 'GOOD'::public."AssetCondition" NOT NULL,
    "operationalStatus" public."AssetOperationalStatus" DEFAULT 'AVAILABLE'::public."AssetOperationalStatus" NOT NULL,
    "acquisitionType" public."AssetAcquisitionType" DEFAULT 'DIRECT_PURCHASE'::public."AssetAcquisitionType" NOT NULL,
    notes text,
    "purchaseDate" date NOT NULL,
    "purchaseCost" numeric(18,4) NOT NULL,
    "transportationCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "installationCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "importDuty" numeric(18,4) DEFAULT 0 NOT NULL,
    "registrationCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "otherCapitalizedCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "discountAmount" numeric(18,4) DEFAULT 0 NOT NULL,
    "capitalizedCost" numeric(18,4) NOT NULL,
    "salvageValue" numeric(18,4) DEFAULT 0 NOT NULL,
    "usefulLifeMonths" integer NOT NULL,
    "depreciationMethod" public."FixedAssetDepreciationMethod" DEFAULT 'STRAIGHT_LINE'::public."FixedAssetDepreciationMethod" NOT NULL,
    "useManualDepreciation" boolean DEFAULT false NOT NULL,
    "manualDepreciationAmount" numeric(18,4),
    status public."FixedAssetStatus" DEFAULT 'ACTIVE'::public."FixedAssetStatus" NOT NULL,
    "disposalDate" date,
    "disposalProceeds" numeric(18,4),
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: fund_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fund_transfers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "transferNo" text NOT NULL,
    "fromAccountId" text NOT NULL,
    "toAccountId" text NOT NULL,
    amount numeric(18,2) NOT NULL,
    "bankCharge" numeric(18,2) DEFAULT 0 NOT NULL,
    "referenceNo" text,
    description text,
    "transferDate" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'COMPLETED'::text NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: general_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.general_settings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "companyDisplayName" text,
    "defaultCurrency" text DEFAULT 'BDT'::text NOT NULL,
    timezone text DEFAULT 'Asia/Dhaka'::text NOT NULL,
    "dateFormat" text DEFAULT 'DD/MM/YYYY'::text NOT NULL,
    "numberFormat" text DEFAULT 'STANDARD'::text NOT NULL,
    "financialYearStartMonth" integer DEFAULT 7 NOT NULL,
    "defaultLanguage" text DEFAULT 'en'::text NOT NULL,
    country text DEFAULT 'Bangladesh'::text NOT NULL,
    "defaultPageSize" integer DEFAULT 10 NOT NULL,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: goods_receipt_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipt_notes (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "grnNo" text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    "supplierId" text NOT NULL,
    "cmsWorkId" text,
    "receiptDate" timestamp(3) without time zone NOT NULL,
    "deliveryChallanNo" text,
    "deliveryChallanDate" timestamp(3) without time zone,
    "receivedById" text,
    "inspectionStatus" public."GrnInspectionStatus" DEFAULT 'PENDING'::public."GrnInspectionStatus" NOT NULL,
    "warehouseLocation" text,
    remarks text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: grn_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grn_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "grnId" text NOT NULL,
    "purchaseOrderItemId" text NOT NULL,
    "descriptionSnapshot" text NOT NULL,
    "unitSnapshot" text NOT NULL,
    "orderedQty" numeric(18,3) NOT NULL,
    "previouslyReceivedQty" numeric(18,3) NOT NULL,
    "currentReceivedQty" numeric(18,3) NOT NULL,
    "cumulativeReceivedQty" numeric(18,3) NOT NULL,
    "remainingQty" numeric(18,3) NOT NULL,
    "acceptedQty" numeric(18,3) NOT NULL,
    "rejectedQty" numeric(18,3) DEFAULT 0 NOT NULL,
    "damagedQty" numeric(18,3) DEFAULT 0 NOT NULL,
    "inspectionRemarks" text
);


--
-- Name: hidden_report_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hidden_report_transactions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "journalEntryId" text NOT NULL,
    "hiddenById" text,
    "hiddenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: hr_attendance_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_attendance_records (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "employeeId" text NOT NULL,
    "attendanceDate" date NOT NULL,
    status public."AttendanceStatus" DEFAULT 'PRESENT'::public."AttendanceStatus" NOT NULL,
    "checkIn" text,
    "checkOut" text,
    "lateMinutes" integer DEFAULT 0 NOT NULL,
    "overtimeMinutes" integer DEFAULT 0 NOT NULL,
    notes text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_business_units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_business_units (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_candidates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_candidates (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    source text,
    "resumeNote" text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_cost_centers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_cost_centers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_departments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_designations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_designations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_divisions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_divisions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_employee_change_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_employee_change_records (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "employeeId" text NOT NULL,
    "changeType" public."EmployeeChangeType" NOT NULL,
    "effectiveDate" date NOT NULL,
    "previousValue" text,
    "newValue" text,
    reason text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: hr_employee_loans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_employee_loans (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "employeeId" text NOT NULL,
    "loanType" public."EmployeeLoanType" NOT NULL,
    "principalAmount" numeric(18,4) NOT NULL,
    reason text,
    "applicationDate" date NOT NULL,
    status public."EmployeeLoanStatus" DEFAULT 'PENDING'::public."EmployeeLoanStatus" NOT NULL,
    "decidedById" text,
    "decidedAt" timestamp(3) without time zone,
    "disbursedAt" timestamp(3) without time zone,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_employees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_employees (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "employeeCode" text NOT NULL,
    name text NOT NULL,
    "fatherOrSpouseName" text,
    gender public."Gender",
    "dateOfBirth" date,
    phone text,
    email text,
    "presentAddress" text,
    "permanentAddress" text,
    "nationalId" text,
    "departmentId" text,
    "designationId" text,
    "gradeId" text,
    "businessUnitId" text,
    "divisionId" text,
    "locationId" text,
    "costCenterId" text,
    "reportingManagerId" text,
    "employmentType" public."EmploymentType" DEFAULT 'PERMANENT'::public."EmploymentType" NOT NULL,
    status public."EmployeeStatus" DEFAULT 'ACTIVE'::public."EmployeeStatus" NOT NULL,
    "joiningDate" date NOT NULL,
    "probationEndDate" date,
    "contractEndDate" date,
    "resignationDate" date,
    "grossSalary" numeric(18,4) NOT NULL,
    "salaryComponents" jsonb NOT NULL,
    "pfRate" numeric(5,2),
    "paymentMethod" public."SalaryPaymentMethod" DEFAULT 'CASH'::public."SalaryPaymentMethod" NOT NULL,
    "bankName" text,
    "bankAccountNumber" text,
    "mfsProvider" text,
    "mfsAccountNumber" text,
    notes text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_exit_processes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_exit_processes (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "employeeId" text NOT NULL,
    "separationType" public."SeparationType" NOT NULL,
    "noticeStartDate" date,
    "lastWorkingDate" date,
    "departmentClearance" boolean DEFAULT false NOT NULL,
    "assetClearance" boolean DEFAULT false NOT NULL,
    "financeClearance" boolean DEFAULT false NOT NULL,
    "hrClearance" boolean DEFAULT false NOT NULL,
    "finalSettlementAmount" numeric(18,4),
    "exitInterviewNotes" text,
    status public."ExitProcessStatus" DEFAULT 'IN_PROGRESS'::public."ExitProcessStatus" NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_expense_claims; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_expense_claims (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "employeeId" text NOT NULL,
    category public."HrExpenseCategory" NOT NULL,
    amount numeric(18,4) NOT NULL,
    "expenseDate" date NOT NULL,
    description text,
    status public."HrExpenseClaimStatus" DEFAULT 'PENDING'::public."HrExpenseClaimStatus" NOT NULL,
    "decidedById" text,
    "decidedAt" timestamp(3) without time zone,
    "decisionNote" text,
    "reimbursedAt" timestamp(3) without time zone,
    "reimbursedById" text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_grades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_grades (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    level integer,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_holidays; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_holidays (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    date date NOT NULL,
    "isRecurringYearly" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_job_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_job_applications (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "candidateId" text NOT NULL,
    "jobOpeningId" text NOT NULL,
    stage public."ApplicationStage" DEFAULT 'APPLIED'::public."ApplicationStage" NOT NULL,
    "appliedDate" date NOT NULL,
    "interviewDate" timestamp(3) without time zone,
    "interviewNotes" text,
    "assessmentScore" numeric(5,2),
    "referenceCheckNotes" text,
    "offeredSalary" numeric(18,4),
    "offerDate" date,
    notes text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_job_openings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_job_openings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    title text NOT NULL,
    "departmentId" text,
    "designationId" text,
    "numberOfPositions" integer DEFAULT 1 NOT NULL,
    status public."JobOpeningStatus" DEFAULT 'OPEN'::public."JobOpeningStatus" NOT NULL,
    description text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_leave_requests (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "employeeId" text NOT NULL,
    "leaveTypeId" text NOT NULL,
    "startDate" date NOT NULL,
    "endDate" date NOT NULL,
    "totalDays" numeric(5,2) NOT NULL,
    reason text,
    status public."LeaveRequestStatus" DEFAULT 'PENDING'::public."LeaveRequestStatus" NOT NULL,
    "decidedById" text,
    "decidedAt" timestamp(3) without time zone,
    "decisionNote" text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_leave_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_leave_types (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "daysPerYear" numeric(5,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_loan_repayments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_loan_repayments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "loanId" text NOT NULL,
    amount numeric(18,4) NOT NULL,
    "paidDate" date NOT NULL,
    note text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: hr_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_locations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_onboarding_checklists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_onboarding_checklists (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "employeeId" text NOT NULL,
    "documentsCollected" boolean DEFAULT false NOT NULL,
    "joiningFormSubmitted" boolean DEFAULT false NOT NULL,
    "idCardIssued" boolean DEFAULT false NOT NULL,
    "emailAccountCreated" boolean DEFAULT false NOT NULL,
    "accessGranted" boolean DEFAULT false NOT NULL,
    "deviceAllocated" boolean DEFAULT false NOT NULL,
    "workspaceAllocated" boolean DEFAULT false NOT NULL,
    "probationReviewDate" date,
    "probationReviewNotes" text,
    "confirmedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_payroll_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_payroll_runs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "periodYear" integer NOT NULL,
    "periodMonth" integer NOT NULL,
    "totalWorkingDays" numeric(5,2) NOT NULL,
    status public."PayrollRunStatus" DEFAULT 'DRAFT'::public."PayrollRunStatus" NOT NULL,
    "totalGross" numeric(18,4) DEFAULT 0 NOT NULL,
    "totalDeduction" numeric(18,4) DEFAULT 0 NOT NULL,
    "totalNetPayable" numeric(18,4) DEFAULT 0 NOT NULL,
    "createdById" text NOT NULL,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_payroll_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_payroll_settings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cycleType" text DEFAULT 'CALENDAR_MONTH'::text NOT NULL,
    "cycleStartDay" integer DEFAULT 1 NOT NULL,
    "paymentDay" integer DEFAULT 1 NOT NULL,
    "salaryComponents" jsonb NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_payslips; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_payslips (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "payrollRunId" text NOT NULL,
    "employeeId" text NOT NULL,
    "employeeCode" text NOT NULL,
    "employeeName" text NOT NULL,
    department text,
    designation text,
    "grossSalary" numeric(18,4) NOT NULL,
    components jsonb NOT NULL,
    "totalWorkingDays" numeric(5,2) NOT NULL,
    "presentDays" numeric(5,2) NOT NULL,
    "proratedGross" numeric(18,4) NOT NULL,
    "providentFund" numeric(18,4) DEFAULT 0 NOT NULL,
    "employerPfContribution" numeric(18,4) DEFAULT 0 NOT NULL,
    "iouDeduction" numeric(18,4) DEFAULT 0 NOT NULL,
    "loanDeduction" numeric(18,4) DEFAULT 0 NOT NULL,
    "fineDeduction" numeric(18,4) DEFAULT 0 NOT NULL,
    "lunchBillDeduction" numeric(18,4) DEFAULT 0 NOT NULL,
    "totalDeduction" numeric(18,4) DEFAULT 0 NOT NULL,
    "netPayable" numeric(18,4) NOT NULL,
    "paymentMethod" public."SalaryPaymentMethod" NOT NULL,
    "paymentStatus" public."PayslipPaymentStatus" DEFAULT 'PENDING'::public."PayslipPaymentStatus" NOT NULL,
    "paidAt" timestamp(3) without time zone,
    "paidById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: hr_shifts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hr_shifts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    "startTime" text NOT NULL,
    "endTime" text NOT NULL,
    "gracePeriodMinutes" integer DEFAULT 0 NOT NULL,
    "weeklyOffDays" jsonb NOT NULL,
    "isDefault" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: invoice_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_items (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    description text NOT NULL,
    amount numeric(12,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "subscriptionId" text NOT NULL,
    "planId" text,
    "invoiceNumber" text NOT NULL,
    "planNameSnapshot" text NOT NULL,
    "billingCycle" text NOT NULL,
    "billingPeriodStart" timestamp(3) without time zone NOT NULL,
    "billingPeriodEnd" timestamp(3) without time zone NOT NULL,
    subtotal numeric(12,2) NOT NULL,
    discount numeric(12,2) DEFAULT 0 NOT NULL,
    tax numeric(12,2) DEFAULT 0 NOT NULL,
    total numeric(12,2) NOT NULL,
    currency text DEFAULT 'BDT'::text NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "dueAt" timestamp(3) without time zone,
    "paidAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "itemCode" text NOT NULL,
    "itemName" text NOT NULL,
    description text,
    "itemType" public."ItemType" DEFAULT 'MATERIAL'::public."ItemType" NOT NULL,
    "categoryId" text,
    "uomId" text,
    "defaultPurchaseRate" numeric(18,2),
    "preferredVendorId" text,
    specification text,
    "brandModel" text,
    status public."ItemStatus" DEFAULT 'ACTIVE'::public."ItemStatus" NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "journalNo" text NOT NULL,
    "journalDate" timestamp(3) without time zone NOT NULL,
    "referenceNo" text,
    description text NOT NULL,
    "sourceModule" text NOT NULL,
    "sourceType" text NOT NULL,
    "sourceId" text NOT NULL,
    status text DEFAULT 'DRAFT'::text NOT NULL,
    "reversalOfId" text,
    "createdById" text,
    "postedById" text,
    "postedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: journal_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_lines (
    id text NOT NULL,
    "journalEntryId" text NOT NULL,
    "accountId" text NOT NULL,
    "projectId" text,
    "partyName" text,
    "partyType" text,
    debit numeric(18,2) DEFAULT 0 NOT NULL,
    credit numeric(18,2) DEFAULT 0 NOT NULL,
    description text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: lc_cost_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_cost_allocations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "costEntryId" text NOT NULL,
    "lcItemId" text NOT NULL,
    "basisValue" numeric(18,4) DEFAULT 0 NOT NULL,
    "basisPercentage" numeric(9,6) DEFAULT 0 NOT NULL,
    "autoSuggestedAmount" numeric(18,4) DEFAULT 0 NOT NULL,
    "manualAmount" numeric(18,4),
    "finalAmount" numeric(18,4) NOT NULL,
    "isDirect" boolean DEFAULT false NOT NULL,
    "isOverridden" boolean DEFAULT false NOT NULL,
    "overrideReason" text,
    "originalMode" public."LcAllocationMode",
    "originalBasis" public."LcAllocationBasis",
    "originalAutoAmount" numeric(18,4),
    "changedById" text,
    "changedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lc_cost_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_cost_entries (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "lcId" text NOT NULL,
    "costHeadId" text NOT NULL,
    "shipmentId" text,
    "vendorName" text,
    "invoiceNumber" text,
    "invoiceDate" date,
    currency text DEFAULT 'BDT'::text NOT NULL,
    "foreignAmount" numeric(18,4),
    "exchangeRate" numeric(18,6),
    "bdtAmount" numeric(18,4) NOT NULL,
    "allocationMode" public."LcAllocationMode" DEFAULT 'AUTO'::public."LcAllocationMode" NOT NULL,
    "allocationBasis" public."LcAllocationBasis",
    "includeInLandedCost" boolean DEFAULT true NOT NULL,
    "attachmentUrl" text,
    "attachmentName" text,
    remarks text,
    "paymentMethod" text,
    "paidFromAccountId" text,
    "creditPayeeName" text,
    "paymentAllocations" jsonb,
    "paymentJournalId" text,
    "payableId" text,
    "postingVersion" integer DEFAULT 1 NOT NULL,
    "isLocked" boolean DEFAULT false NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lc_cost_heads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_cost_heads (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    code text NOT NULL,
    category public."LcCostCategory" NOT NULL,
    "defaultCurrency" text DEFAULT 'BDT'::text NOT NULL,
    "defaultAllocationMethod" public."LcAllocationBasis" DEFAULT 'PURCHASE_VALUE'::public."LcAllocationBasis" NOT NULL,
    "fallbackAllocationMethod" public."LcAllocationBasis",
    "recommendedAllocationMode" public."LcAllocationMode",
    "includeInLandedCost" boolean DEFAULT true NOT NULL,
    "manualOverrideAllowed" boolean DEFAULT true NOT NULL,
    "glAccountId" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "isSystem" boolean DEFAULT false NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lc_grn_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_grn_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "grnId" text NOT NULL,
    "lcItemId" text NOT NULL,
    "expectedQuantity" numeric(18,4) NOT NULL,
    "receivedQuantity" numeric(18,4) NOT NULL,
    "shortQuantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "excessQuantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "damagedQuantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "rejectedQuantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: lc_grns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_grns (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "lcId" text NOT NULL,
    "grnNumber" text NOT NULL,
    "receivedDate" date NOT NULL,
    "warehouseId" text,
    remarks text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lc_inventory_postings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_inventory_postings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "lcId" text NOT NULL,
    "lcItemId" text NOT NULL,
    "warehouseId" text NOT NULL,
    "stockMovementId" text NOT NULL,
    quantity numeric(18,4) NOT NULL,
    "unitCost" numeric(24,6) NOT NULL,
    "totalCost" numeric(24,6) NOT NULL,
    "postedById" text NOT NULL,
    "postedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: lc_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "lcId" text NOT NULL,
    "itemId" text,
    "productName" text NOT NULL,
    description text,
    unit text DEFAULT 'pcs'::text NOT NULL,
    quantity numeric(18,4) NOT NULL,
    "foreignUnitPrice" numeric(18,4) NOT NULL,
    "exchangeRate" numeric(18,6) NOT NULL,
    "calculatedBdtUnitPrice" numeric(18,4) NOT NULL,
    "acceptedBdtUnitPrice" numeric(18,4),
    "totalPurchaseCostBdt" numeric(18,4) NOT NULL,
    weight numeric(18,4),
    cbm numeric(18,4),
    "hsCode" text,
    "receivedQuantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "landedCostAmount" numeric(18,4),
    "landedCostPerUnit" numeric(18,4),
    "profitMode" public."LcProfitMode",
    "profitValue" numeric(18,4),
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lc_landed_cost_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_landed_cost_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "landedCostId" text NOT NULL,
    "lcItemId" text NOT NULL,
    "purchaseCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "lcBankingCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "originCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "freightCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "insuranceCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "customsCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "taxCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "cnfCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "portCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "destinationTransportCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "localCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "otherCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "totalLandedCost" numeric(18,4) DEFAULT 0 NOT NULL,
    "receivedQuantity" numeric(18,4) DEFAULT 0 NOT NULL,
    "unitLandedCost" numeric(18,4) DEFAULT 0 NOT NULL
);


--
-- Name: lc_landed_costs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_landed_costs (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "lcId" text NOT NULL,
    "purchaseCostTotal" numeric(18,4) DEFAULT 0 NOT NULL,
    "importCostTotal" numeric(18,4) DEFAULT 0 NOT NULL,
    "landedCostTotal" numeric(18,4) DEFAULT 0 NOT NULL,
    "allocationDifference" numeric(18,4) DEFAULT 0 NOT NULL,
    status public."LcLandedCostStatus" DEFAULT 'DRAFT'::public."LcLandedCostStatus" NOT NULL,
    "finalizedById" text,
    "finalizedAt" timestamp(3) without time zone,
    "reopenedById" text,
    "reopenedAt" timestamp(3) without time zone,
    "reopenReason" text,
    "journalEntryId" text,
    "postingVersion" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lc_masters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_masters (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "lcNumber" text NOT NULL,
    "lcDate" date NOT NULL,
    "supplierId" text,
    "supplierName" text NOT NULL,
    "supplierCountry" text,
    "purchaseOrderRef" text,
    "piReference" text,
    "bankName" text,
    "bankBranch" text,
    "lcType" text,
    currency text DEFAULT 'USD'::text NOT NULL,
    "exchangeRate" numeric(18,6) NOT NULL,
    incoterm text,
    "originCountry" text,
    "originPort" text,
    "destinationPort" text,
    "destinationWarehouseId" text,
    "lastShipmentDate" date,
    "expiryDate" date,
    remarks text,
    "purchasePaymentStatus" text DEFAULT 'UNPAID'::text NOT NULL,
    "purchasePaidAmount" numeric(18,4) DEFAULT 0 NOT NULL,
    "paymentReference" text,
    "paymentAllocations" jsonb,
    "purchaseJournalId" text,
    "purchasePayableId" text,
    "purchasePostingVersion" integer DEFAULT 1 NOT NULL,
    "paymentJournalIds" jsonb,
    status public."LcStatus" DEFAULT 'DRAFT'::public."LcStatus" NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lc_shipments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_shipments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "lcId" text NOT NULL,
    "transportMode" text DEFAULT 'SEA'::text,
    "shipmentNumber" text,
    "blAwbNumber" text,
    etd date,
    eta date,
    "containerNumber" text,
    "forwarderName" text,
    "shippingLine" text,
    remarks text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: lc_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lc_status_history (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "lcId" text NOT NULL,
    "fromStatus" public."LcStatus",
    "toStatus" public."LcStatus" NOT NULL,
    reason text,
    "changedById" text NOT NULL,
    "changedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: ledger_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_accounts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "parentId" text,
    "accountType" text NOT NULL,
    "normalBalance" text NOT NULL,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "isSystem" boolean DEFAULT false NOT NULL,
    "systemKey" text,
    "linkedBankAccountId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "isControlAccount" boolean DEFAULT false NOT NULL
);


--
-- Name: licenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.licenses (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "licenseKey" text NOT NULL,
    seats integer DEFAULT 1 NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: master_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_categories (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    type public."MasterCategoryType" NOT NULL,
    name text NOT NULL,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: monthly_targets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monthly_targets (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    year integer NOT NULL,
    month integer NOT NULL,
    "targetAmount" numeric(18,2) NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    "reminderId" text,
    "sourceModule" text,
    "sourceType" text,
    "sourceId" text,
    priority text DEFAULT 'MEDIUM'::text NOT NULL,
    "isRead" boolean DEFAULT false NOT NULL,
    "readAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: number_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.number_sequences (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "moduleKey" text NOT NULL,
    prefix text NOT NULL,
    "includeYear" boolean DEFAULT true NOT NULL,
    "yearFormat" text DEFAULT 'YYYY'::text NOT NULL,
    separator text DEFAULT '-'::text NOT NULL,
    "sequenceLength" integer DEFAULT 4 NOT NULL,
    "nextNumber" integer DEFAULT 1 NOT NULL,
    "lastYearUsed" integer,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: organization_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_contacts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "organizationMasterId" text,
    name text NOT NULL,
    designation text NOT NULL,
    mobile text NOT NULL,
    email text,
    address text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "contactRole" text,
    "partyId" text
);


--
-- Name: organization_masters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_masters (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "shortName" text NOT NULL,
    "fullName" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: organization_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_users (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "userId" text NOT NULL,
    "roleId" text NOT NULL,
    "isDefault" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id text NOT NULL,
    name text NOT NULL,
    "shortName" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    status text DEFAULT 'ACTIVE'::text NOT NULL
);


--
-- Name: parties; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parties (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    "displayName" text,
    roles public."PartyRole"[],
    status public."PartyStatus" DEFAULT 'ACTIVE'::public."PartyStatus" NOT NULL,
    "contactPerson" text,
    phone text,
    "alternatePhone" text,
    email text,
    website text,
    address text,
    district text,
    country text,
    "binVat" text,
    "tinNo" text,
    "tradeLicenseNo" text,
    "registrationNo" text,
    "bankName" text,
    "bankAccountName" text,
    "bankAccountNo" text,
    "bankBranch" text,
    "bankRoutingSwift" text,
    "paymentTermId" text,
    "defaultCurrency" text DEFAULT 'BDT'::text,
    "creditLimit" numeric(18,2),
    "categoryId" text,
    notes text,
    "createdById" text,
    "archivedAt" timestamp(3) without time zone,
    "archivedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: payables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payables (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "partyName" text NOT NULL,
    "partyType" text DEFAULT 'VENDOR'::text NOT NULL,
    "projectId" text,
    "billNo" text NOT NULL,
    "billDate" timestamp(3) without time zone NOT NULL,
    amount numeric(18,2) NOT NULL,
    "paidAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "dueDate" timestamp(3) without time zone,
    description text,
    status text DEFAULT 'UNPAID'::text NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "partyId" text
);


--
-- Name: payment_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_records (
    id text NOT NULL,
    "invoiceId" text NOT NULL,
    amount numeric(12,2) NOT NULL,
    method text NOT NULL,
    reference text,
    status text DEFAULT 'PENDING'::text NOT NULL,
    "paidAt" timestamp(3) without time zone,
    "verifiedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: payment_terms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_terms (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    days integer DEFAULT 0 NOT NULL,
    description text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: performance_guarantees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance_guarantees (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text,
    "organizationMasterId" text,
    "bankAccountId" text,
    type public."GuaranteeType" NOT NULL,
    "instrumentNo" text,
    amount numeric(18,2) NOT NULL,
    "issueDate" timestamp(3) without time zone NOT NULL,
    "expiryDate" timestamp(3) without time zone NOT NULL,
    status public."InstrumentStatus" DEFAULT 'ACTIVE'::public."InstrumentStatus" NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "pgBgWorkflowId" text,
    "releaseRequestDate" timestamp(3) without time zone,
    "releaseDate" timestamp(3) without time zone,
    "releaseReference" text,
    "bankConfirmation" text,
    "releaseRemarks" text,
    "releaseRequestedById" text,
    "releasedById" text
);


--
-- Name: permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.permissions (
    id text NOT NULL,
    key text NOT NULL,
    "group" text NOT NULL,
    description text
);


--
-- Name: pg_bg_workflows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pg_bg_workflows (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "documentPurchaseId" text NOT NULL,
    "organizationMasterId" text NOT NULL,
    "contactId" text,
    "tenderSecurityAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "noaDate" timestamp(3) without time zone,
    "noaAmount" numeric(18,2),
    "workCategory" text,
    "acceptNoa" boolean,
    "pgBgRequired" boolean,
    status public."PgBgWorkflowStatus" DEFAULT 'DRAFT'::public."PgBgWorkflowStatus" NOT NULL,
    "currentStep" integer DEFAULT 1 NOT NULL,
    "acceptedAt" timestamp(3) without time zone,
    "acceptedById" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "contactSnapshot" jsonb
);


--
-- Name: plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plans (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    "monthlyPrice" numeric(12,2) NOT NULL,
    "yearlyPrice" numeric(12,2) NOT NULL,
    currency text DEFAULT 'BDT'::text NOT NULL,
    "userLimit" integer,
    "projectLimit" integer,
    "storageLimitMb" integer,
    "companyLimit" integer,
    features jsonb NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: project_bill_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_bill_items (
    id text NOT NULL,
    "billId" text NOT NULL,
    "boqItemId" text NOT NULL,
    description text NOT NULL,
    unit text NOT NULL,
    "approvedRate" numeric(18,2) NOT NULL,
    "contractQty" numeric(18,3) NOT NULL,
    "previousQty" numeric(18,3) NOT NULL,
    "currentQty" numeric(18,3) NOT NULL,
    "cumulativeQty" numeric(18,3) NOT NULL,
    "previousValue" numeric(18,2) NOT NULL,
    "currentValue" numeric(18,2) NOT NULL,
    "cumulativeValue" numeric(18,2) NOT NULL
);


--
-- Name: project_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_bills (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cmsWorkId" text NOT NULL,
    "contractId" text NOT NULL,
    "billNo" text NOT NULL,
    "billType" public."BillType" DEFAULT 'RUNNING'::public."BillType" NOT NULL,
    "billDate" timestamp(3) without time zone NOT NULL,
    "periodFrom" timestamp(3) without time zone,
    "periodTo" timestamp(3) without time zone,
    "submissionDate" timestamp(3) without time zone,
    "certificationDate" timestamp(3) without time zone,
    "clientCertificateRef" text,
    "measurementBookRef" text,
    remarks text,
    "grossWorkValue" numeric(18,2) DEFAULT 0 NOT NULL,
    "approvedAdditions" numeric(18,2) DEFAULT 0 NOT NULL,
    "grossBillAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "retentionPct" numeric(5,2),
    "retentionAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "retentionReleasedAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "retentionReleaseDueDate" timestamp(3) without time zone,
    "vatRate" numeric(8,4),
    "vatAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "aitRate" numeric(8,4),
    "aitAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "otherDeductionAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "netCertifiedAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "receivedAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    status public."BillStatus" DEFAULT 'DRAFT'::public."BillStatus" NOT NULL,
    "createdById" text,
    "submittedById" text,
    "certifiedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: project_budget_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_budget_lines (
    id text NOT NULL,
    "budgetId" text NOT NULL,
    "expenseHeadId" text NOT NULL,
    category text NOT NULL,
    description text,
    amount numeric(18,2) NOT NULL,
    remarks text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: project_budgets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_budgets (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cmsWorkId" text NOT NULL,
    version integer NOT NULL,
    status public."ProjectBudgetStatus" DEFAULT 'DRAFT'::public."ProjectBudgetStatus" NOT NULL,
    "totalBudget" numeric(18,2) DEFAULT 0 NOT NULL,
    "revisionNote" text,
    "createdById" text,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: project_closure_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_closure_events (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workId" text NOT NULL,
    action text NOT NULL,
    reason text,
    "overrideReason" text,
    "previousStatus" public."CmsWorkStatus" NOT NULL,
    "newStatus" public."CmsWorkStatus" NOT NULL,
    "performedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "readinessSnapshot" jsonb
);


--
-- Name: project_contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_contracts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text,
    "cmsWorkId" text NOT NULL,
    "pgBgWorkflowId" text,
    "organizationMasterId" text NOT NULL,
    "contractNo" text NOT NULL,
    "contractType" public."ContractType" DEFAULT 'WORK_ORDER'::public."ContractType" NOT NULL,
    "issueDate" timestamp(3) without time zone NOT NULL,
    "contractDate" timestamp(3) without time zone,
    "originalContractValue" numeric(18,2) NOT NULL,
    "currentContractValue" numeric(18,2) NOT NULL,
    currency text DEFAULT 'BDT'::text NOT NULL,
    "commencementDate" timestamp(3) without time zone NOT NULL,
    "originalCompletionDate" timestamp(3) without time zone NOT NULL,
    "currentCompletionDate" timestamp(3) without time zone NOT NULL,
    "durationDays" integer,
    "dlpDays" integer,
    "retentionPct" numeric(5,2),
    "securityDepositPct" numeric(5,2),
    "clientContactName" text,
    "responsiblePerson" text,
    "scopeOfWork" text,
    remarks text,
    status public."ContractStatus" DEFAULT 'DRAFT'::public."ContractStatus" NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "vatPct" numeric(5,2),
    "taxPct" numeric(5,2),
    "securityDepositMethod" text,
    "securityDepositStatus" text,
    "securityDepositReleasedAmount" numeric(18,2),
    "securityDepositReleasedDate" timestamp(3) without time zone,
    "securityDepositReleaseDueDate" timestamp(3) without time zone
);


--
-- Name: project_handovers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.project_handovers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workId" text NOT NULL,
    "contractId" text NOT NULL,
    "completionCertificateId" text,
    "handoverNo" text NOT NULL,
    "handoverType" public."HandoverType" DEFAULT 'FINAL'::public."HandoverType" NOT NULL,
    "handoverDate" timestamp(3) without time zone NOT NULL,
    "handedOverBy" text NOT NULL,
    "receivedBy" text NOT NULL,
    authority text NOT NULL,
    remarks text,
    status public."HandoverStatus" DEFAULT 'DRAFT'::public."HandoverStatus" NOT NULL,
    "createdById" text,
    "completedById" text,
    "completedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    "itemId" text NOT NULL,
    "itemCodeSnapshot" text NOT NULL,
    "itemNameSnapshot" text NOT NULL,
    "descriptionSnapshot" text,
    "unitSnapshot" text NOT NULL,
    "orderedQty" numeric(18,3) NOT NULL,
    "unitRate" numeric(18,2) NOT NULL,
    "discountAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "netRate" numeric(18,2) NOT NULL,
    "lineAmount" numeric(18,2) NOT NULL,
    "receivedQty" numeric(18,3) DEFAULT 0 NOT NULL,
    "deliveryDate" timestamp(3) without time zone,
    "cmsWorkId" text,
    "boqItemId" text,
    "sourceQuotationItemId" text,
    remarks text,
    "billedQty" numeric(18,3) DEFAULT 0 NOT NULL
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "poNo" text NOT NULL,
    "poDate" timestamp(3) without time zone NOT NULL,
    "supplierId" text NOT NULL,
    "cmsWorkId" text,
    "purchaseRequisitionId" text,
    "rfqId" text,
    "comparativeStatementId" text,
    "deliveryAddress" text,
    "paymentTerms" text,
    "deliveryTerms" text,
    currency text DEFAULT 'BDT'::text NOT NULL,
    subtotal numeric(18,2) NOT NULL,
    "discountAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "taxAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "otherCharges" numeric(18,2) DEFAULT 0 NOT NULL,
    "grandTotal" numeric(18,2) NOT NULL,
    remarks text,
    status public."PurchaseOrderStatus" DEFAULT 'DRAFT'::public."PurchaseOrderStatus" NOT NULL,
    "createdById" text,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "issuedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: purchase_requisition_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_requisition_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "purchaseRequisitionId" text NOT NULL,
    "itemId" text NOT NULL,
    "descriptionSnapshot" text NOT NULL,
    "uomId" text,
    "requestedQty" numeric(18,3) NOT NULL,
    "estimatedRate" numeric(18,2),
    "estimatedAmount" numeric(18,2),
    "requiredDate" timestamp(3) without time zone,
    "boqItemId" text,
    remarks text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: purchase_requisitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_requisitions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "prNo" text NOT NULL,
    "requestDate" timestamp(3) without time zone NOT NULL,
    "requiredByDate" timestamp(3) without time zone,
    "cmsWorkId" text,
    department text,
    "requestedById" text,
    priority public."PrPriority" DEFAULT 'MEDIUM'::public."PrPriority" NOT NULL,
    purpose text,
    remarks text,
    status public."PrStatus" DEFAULT 'DRAFT'::public."PrStatus" NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "rejectedReason" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: receipt_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipt_sequences (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    year integer NOT NULL,
    value integer DEFAULT 0 NOT NULL
);


--
-- Name: receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receipts (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text,
    "referenceNo" text,
    amount numeric(18,2) NOT NULL,
    "receiptDate" timestamp(3) without time zone NOT NULL,
    "dueDate" timestamp(3) without time zone,
    status public."ReceiptStatus" DEFAULT 'PENDING'::public."ReceiptStatus" NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "workId" text,
    "receiptNo" text,
    "receiptCategory" text DEFAULT 'GENERAL'::text NOT NULL,
    "receiptType" text DEFAULT 'GENERAL_RECEIPT'::text NOT NULL,
    "receivedFrom" text DEFAULT 'Unknown'::text NOT NULL,
    "receivedInAccountId" text,
    "paymentMethod" text DEFAULT 'CASH'::text NOT NULL,
    description text,
    "receivableId" text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledById" text,
    "cancellationReason" text,
    "replacesReceiptId" text,
    "grossAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "vatDeductedAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "taxDeductedAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "securityDepositDeductedAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "otherDeductionAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "chequeNo" text,
    "chequeDate" timestamp(3) without time zone,
    "chequeBankName" text,
    "receiptHeadAccountId" text
);


--
-- Name: receivables; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receivables (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "projectId" text NOT NULL,
    "contractId" text,
    "projectBillId" text,
    "partyName" text NOT NULL,
    "billNo" text NOT NULL,
    "billDate" timestamp(3) without time zone NOT NULL,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    "receivedAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "dueDate" timestamp(3) without time zone,
    description text,
    status text DEFAULT 'OUTSTANDING'::text NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id text NOT NULL,
    "userId" text NOT NULL,
    "tokenHash" text NOT NULL,
    "userAgent" text,
    "ipAddress" text,
    "expiresAt" timestamp(3) without time zone NOT NULL,
    "revokedAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: reminder_rule_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_rule_settings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "reminderType" text NOT NULL,
    "isEnabled" boolean DEFAULT true NOT NULL,
    "defaultPriority" text DEFAULT 'MEDIUM'::text NOT NULL,
    "offsetDays" integer[] DEFAULT ARRAY[7],
    "inAppEnabled" boolean DEFAULT true NOT NULL,
    "emailEnabled" boolean DEFAULT false NOT NULL,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminders (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    subtitle text,
    "dueDate" timestamp(3) without time zone NOT NULL,
    "relatedEntityType" text,
    "relatedEntityId" text,
    "isResolved" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    description text,
    priority text DEFAULT 'MEDIUM'::text NOT NULL,
    status text DEFAULT 'UPCOMING'::text NOT NULL,
    "dueTime" text,
    "assignedToUserId" text,
    "assignedToName" text,
    "sourceModule" text DEFAULT 'MANUAL'::text NOT NULL,
    "sourceType" text,
    "sourceId" text,
    "relatedEntityName" text,
    "referenceNo" text,
    "organizationMasterId" text,
    "organizationName" text,
    "notificationBefore" integer DEFAULT 0 NOT NULL,
    "repeatType" text DEFAULT 'NONE'::text NOT NULL,
    "repeatConfig" jsonb,
    remarks text,
    "snoozedUntil" timestamp(3) without time zone,
    "createdById" text,
    "createdByName" text,
    "completedById" text,
    "completedByName" text,
    "completedAt" timestamp(3) without time zone,
    "cancelledAt" timestamp(3) without time zone
);


--
-- Name: request_for_quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_for_quotations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "rfqNo" text NOT NULL,
    "purchaseRequisitionId" text,
    "cmsWorkId" text,
    "issueDate" timestamp(3) without time zone NOT NULL,
    "submissionDeadline" timestamp(3) without time zone NOT NULL,
    "deliveryLocation" text,
    "termsConditions" text,
    "paymentTerms" text,
    remarks text,
    status public."RfqStatus" DEFAULT 'DRAFT'::public."RfqStatus" NOT NULL,
    "issuedById" text,
    "issuedAt" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: retention_releases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retention_releases (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workId" text NOT NULL,
    "contractId" text NOT NULL,
    "releaseNo" text NOT NULL,
    amount numeric(18,2) NOT NULL,
    "releaseDueDate" timestamp(3) without time zone,
    "releaseDate" timestamp(3) without time zone,
    reference text,
    remarks text,
    status public."RetentionReleaseStatus" DEFAULT 'DRAFT'::public."RetentionReleaseStatus" NOT NULL,
    "createdById" text,
    "approvedById" text,
    "releasedById" text,
    "journalEntryId" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: rfq_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfq_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "rfqId" text NOT NULL,
    "itemId" text NOT NULL,
    "purchaseRequisitionItemId" text,
    "itemCodeSnapshot" text NOT NULL,
    "itemNameSnapshot" text NOT NULL,
    "descriptionSnapshot" text,
    "unitSnapshot" text NOT NULL,
    "requestedQty" numeric(18,3) NOT NULL,
    remarks text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: rfq_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rfq_suppliers (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "rfqId" text NOT NULL,
    "supplierId" text NOT NULL,
    "invitedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.role_permissions (
    id text NOT NULL,
    "roleId" text NOT NULL,
    "permissionId" text NOT NULL
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    name text NOT NULL,
    description text,
    "isSystem" boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: sales_quotation_follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_quotation_follow_ups (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "quotationId" text NOT NULL,
    "followedUpAt" timestamp(3) without time zone NOT NULL,
    "nextFollowUpAt" timestamp(3) without time zone,
    notes text,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sales_quotation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_quotation_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "quotationId" text NOT NULL,
    description text NOT NULL,
    quantity numeric(18,3) NOT NULL,
    unit text NOT NULL,
    "unitCost" numeric(18,2) NOT NULL,
    "totalCost" numeric(18,2) NOT NULL,
    "taxPct" numeric(5,2) NOT NULL,
    "taxAmount" numeric(18,2) NOT NULL,
    "unitPrice" numeric(18,2) NOT NULL,
    "totalPrice" numeric(18,2) NOT NULL,
    profit numeric(18,2) NOT NULL,
    "marginPct" numeric(7,4) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT sales_quotation_items_values_check CHECK (((quantity > (0)::numeric) AND ("unitCost" >= (0)::numeric) AND ("unitPrice" >= (0)::numeric) AND ("taxPct" >= (0)::numeric) AND ("taxPct" <= (100)::numeric)))
);


--
-- Name: sales_quotation_overheads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_quotation_overheads (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "quotationId" text NOT NULL,
    description text NOT NULL,
    amount numeric(18,2) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT sales_quotation_overheads_amount_check CHECK ((amount >= (0)::numeric))
);


--
-- Name: sales_quotation_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_quotation_status_history (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "quotationId" text NOT NULL,
    "fromStatus" public."SalesQuotationStatus",
    "toStatus" public."SalesQuotationStatus" NOT NULL,
    "changedById" text NOT NULL,
    reason text,
    "changedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: sales_quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_quotations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "quotationNo" text NOT NULL,
    "customerId" text NOT NULL,
    "workName" text NOT NULL,
    "quotationDate" timestamp(3) without time zone NOT NULL,
    "validUntil" timestamp(3) without time zone NOT NULL,
    currency text DEFAULT 'BDT'::text NOT NULL,
    status public."SalesQuotationStatus" DEFAULT 'DRAFT'::public."SalesQuotationStatus" NOT NULL,
    "salesPersonId" text,
    remarks text,
    version integer DEFAULT 1 NOT NULL,
    "totalCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "itemTaxTotal" numeric(18,2) DEFAULT 0 NOT NULL,
    "totalSelling" numeric(18,2) DEFAULT 0 NOT NULL,
    "overheadTotal" numeric(18,2) DEFAULT 0 NOT NULL,
    "subtotalBeforeVat" numeric(18,2) DEFAULT 0 NOT NULL,
    "vatApplicable" boolean DEFAULT false NOT NULL,
    "vatRate" numeric(5,2) DEFAULT 0 NOT NULL,
    "vatAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "grandTotal" numeric(18,2) DEFAULT 0 NOT NULL,
    "sentAt" timestamp(3) without time zone,
    "sentById" text,
    "decisionDate" timestamp(3) without time zone,
    "decisionById" text,
    "acceptedAmount" numeric(18,2),
    "customerPoWoNo" text,
    "rejectionReason" text,
    "lastFollowUpAt" timestamp(3) without time zone,
    "nextFollowUpAt" timestamp(3) without time zone,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT sales_quotations_date_range_check CHECK (("validUntil" >= "quotationDate")),
    CONSTRAINT sales_quotations_result_fields_check CHECK ((((status = 'ACCEPTED'::public."SalesQuotationStatus") AND ("acceptedAmount" > (0)::numeric) AND ("acceptedAmount" <= "grandTotal") AND (COALESCE(btrim("customerPoWoNo"), ''::text) <> ''::text) AND ("rejectionReason" IS NULL)) OR ((status = 'REJECTED'::public."SalesQuotationStatus") AND ("acceptedAmount" IS NULL) AND ("customerPoWoNo" IS NULL) AND (COALESCE(btrim("rejectionReason"), ''::text) <> ''::text)) OR ((status = ANY (ARRAY['DRAFT'::public."SalesQuotationStatus", 'SENT'::public."SalesQuotationStatus"])) AND ("acceptedAmount" IS NULL) AND ("customerPoWoNo" IS NULL) AND ("rejectionReason" IS NULL)))),
    CONSTRAINT sales_quotations_totals_nonnegative_check CHECK ((("totalCost" >= (0)::numeric) AND ("itemTaxTotal" >= (0)::numeric) AND ("totalSelling" >= (0)::numeric) AND ("overheadTotal" >= (0)::numeric) AND ("subtotalBeforeVat" >= (0)::numeric) AND ("vatAmount" >= (0)::numeric) AND ("grandTotal" >= (0)::numeric))),
    CONSTRAINT sales_quotations_vat_rate_check CHECK ((("vatRate" >= (0)::numeric) AND ("vatRate" <= (100)::numeric)))
);


--
-- Name: security_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.security_settings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "minPasswordLength" integer DEFAULT 8 NOT NULL,
    "requireUppercase" boolean DEFAULT true NOT NULL,
    "requireLowercase" boolean DEFAULT true NOT NULL,
    "requireNumber" boolean DEFAULT true NOT NULL,
    "requireSpecialChar" boolean DEFAULT false NOT NULL,
    "sessionTimeoutMinutes" integer DEFAULT 60 NOT NULL,
    "maxFailedLoginAttempts" integer DEFAULT 5 NOT NULL,
    "accountLockDurationMinutes" integer DEFAULT 15 NOT NULL,
    "forcePasswordChangeDays" integer,
    "twoFactorEnabled" boolean DEFAULT false NOT NULL,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "itemId" text NOT NULL,
    "warehouseId" text NOT NULL,
    "movementType" public."StockMovementType" NOT NULL,
    quantity numeric(18,4) NOT NULL,
    "unitCost" numeric(24,6) NOT NULL,
    "totalCost" numeric(24,6) NOT NULL,
    "sourceModule" text NOT NULL,
    "sourceType" text NOT NULL,
    "sourceId" text NOT NULL,
    "referenceNo" text,
    "occurredAt" timestamp(3) without time zone NOT NULL,
    "createdById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: subcontractor_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subcontractor_profiles (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "partyId" text NOT NULL,
    "tradeCategoryId" text,
    specialization text,
    "defaultRetentionPct" numeric(5,2),
    "performanceRating" numeric(3,2),
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    plan public."SubscriptionPlan" DEFAULT 'TRIAL'::public."SubscriptionPlan" NOT NULL,
    status public."SubscriptionStatus" DEFAULT 'TRIALING'::public."SubscriptionStatus" NOT NULL,
    "trialEndsAt" timestamp(3) without time zone,
    "currentPeriodEnd" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "billingCycle" text DEFAULT 'MONTHLY'::text NOT NULL,
    "cancelAtPeriodEnd" boolean DEFAULT false NOT NULL,
    "cancelRequestedAt" timestamp(3) without time zone,
    "currentPeriodStart" timestamp(3) without time zone,
    "planId" text,
    "startedAt" timestamp(3) without time zone,
    "trialStartedAt" timestamp(3) without time zone
);


--
-- Name: supplier_bill_deductions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_bill_deductions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "supplierBillId" text NOT NULL,
    type text NOT NULL,
    code text,
    rate numeric(8,4) NOT NULL,
    base numeric(18,2) NOT NULL,
    amount numeric(18,2) NOT NULL,
    remarks text
);


--
-- Name: supplier_bill_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_bill_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "supplierBillId" text NOT NULL,
    "purchaseOrderItemId" text NOT NULL,
    "itemId" text NOT NULL,
    "itemCodeSnapshot" text NOT NULL,
    "itemNameSnapshot" text NOT NULL,
    "descriptionSnapshot" text,
    "unitSnapshot" text NOT NULL,
    "orderedQty" numeric(18,3) NOT NULL,
    "acceptedQty" numeric(18,3) NOT NULL,
    "previouslyBilledQty" numeric(18,3) NOT NULL,
    "currentBilledQty" numeric(18,3) NOT NULL,
    "remainingBillableQty" numeric(18,3) NOT NULL,
    "poRate" numeric(18,2) NOT NULL,
    "invoiceRate" numeric(18,2) NOT NULL,
    "discountAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "lineAmount" numeric(18,2) NOT NULL,
    "matchStatus" public."BillMatchStatus" NOT NULL,
    remarks text
);


--
-- Name: supplier_bills; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_bills (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "billNo" text NOT NULL,
    "supplierInvoiceNo" text NOT NULL,
    "supplierInvoiceDate" timestamp(3) without time zone NOT NULL,
    "supplierId" text NOT NULL,
    "purchaseOrderId" text NOT NULL,
    "cmsWorkId" text,
    "paymentTermId" text,
    currency text DEFAULT 'BDT'::text NOT NULL,
    "dueDate" timestamp(3) without time zone,
    remarks text,
    status public."SupplierBillStatus" DEFAULT 'DRAFT'::public."SupplierBillStatus" NOT NULL,
    "matchStatus" public."BillMatchStatus" DEFAULT 'MATCHED'::public."BillMatchStatus" NOT NULL,
    subtotal numeric(18,2) DEFAULT 0 NOT NULL,
    "discountAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "taxableBase" numeric(18,2) DEFAULT 0 NOT NULL,
    "vatRate" numeric(8,4),
    "vatAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "aitRate" numeric(8,4),
    "aitAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "otherDeductionAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "netPayable" numeric(18,2) DEFAULT 0 NOT NULL,
    "payableId" text,
    "submittedAt" timestamp(3) without time zone,
    "approvedById" text,
    "approvedAt" timestamp(3) without time zone,
    "rejectedReason" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: supplier_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "payableId" text NOT NULL,
    "supplierId" text NOT NULL,
    "bankAccountId" text NOT NULL,
    amount numeric(18,2) NOT NULL,
    "paymentDate" timestamp(3) without time zone NOT NULL,
    "paymentMethod" text,
    "referenceNo" text,
    remarks text,
    status public."SupplierPaymentStatus" DEFAULT 'ACTIVE'::public."SupplierPaymentStatus" NOT NULL,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledById" text,
    "cancellationReason" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: supplier_quotation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_quotation_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "quotationId" text NOT NULL,
    "rfqItemId" text NOT NULL,
    "offeredQty" numeric(18,3) NOT NULL,
    "unitRate" numeric(18,2) NOT NULL,
    "discountPct" numeric(5,2) DEFAULT 0 NOT NULL,
    "taxPct" numeric(5,2) DEFAULT 0 NOT NULL,
    "lineAmount" numeric(18,2) NOT NULL,
    "deliveryDays" integer,
    "brandModel" text,
    specification text,
    remarks text
);


--
-- Name: supplier_quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_quotations (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "rfqId" text NOT NULL,
    "supplierId" text NOT NULL,
    "quotationRef" text NOT NULL,
    "quotationDate" timestamp(3) without time zone NOT NULL,
    "validityDate" timestamp(3) without time zone,
    currency text DEFAULT 'BDT'::text NOT NULL,
    "deliveryDays" integer,
    "paymentTerms" text,
    warranty text,
    remarks text,
    status public."QuotationStatus" DEFAULT 'RECEIVED'::public."QuotationStatus" NOT NULL,
    "revisionNo" integer DEFAULT 1 NOT NULL,
    "previousRevisionId" text,
    "totalAmount" numeric(18,2) NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: support_ticket_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_attachments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "ticketId" text NOT NULL,
    "messageId" text NOT NULL,
    "fileName" character varying(255) NOT NULL,
    "mimeType" character varying(100) NOT NULL,
    "fileSize" integer NOT NULL,
    data bytea NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: support_ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_ticket_messages (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "ticketId" text NOT NULL,
    "authorType" public."SupportMessageAuthorType" NOT NULL,
    "authorUserId" text,
    "authorVendorAdminId" text,
    body text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: support_tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.support_tickets (
    id text NOT NULL,
    number integer NOT NULL,
    "organizationId" text NOT NULL,
    "createdById" text NOT NULL,
    subject character varying(180) NOT NULL,
    "issueType" public."SupportTicketIssueType" NOT NULL,
    "moduleName" character varying(100) NOT NULL,
    priority public."SupportTicketPriority" DEFAULT 'NORMAL'::public."SupportTicketPriority" NOT NULL,
    status public."SupportTicketStatus" DEFAULT 'OPEN'::public."SupportTicketStatus" NOT NULL,
    "pagePath" character varying(500),
    "appVersion" character varying(50),
    "lastActivityAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: support_tickets_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.support_tickets_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: support_tickets_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.support_tickets_number_seq OWNED BY public.support_tickets.number;


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "maintenanceMode" boolean DEFAULT false NOT NULL,
    "featureToggles" jsonb,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: tender_bank_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tender_bank_settings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderValidityDays" integer DEFAULT 90 NOT NULL,
    "tenderOpeningReminderDays" integer DEFAULT 7 NOT NULL,
    "tenderExpiryReminderDays" integer DEFAULT 7 NOT NULL,
    "tsDefaultSecurityPct" numeric(8,2) DEFAULT 2 NOT NULL,
    "tsDefaultMarginPct" numeric(8,2) DEFAULT 10 NOT NULL,
    "tsDefaultValidityMonths" integer DEFAULT 6 NOT NULL,
    "tsExpiryReminderDays" integer DEFAULT 15 NOT NULL,
    "pgBgDefaultMarginPct" numeric(8,2) DEFAULT 10 NOT NULL,
    "pgBgDefaultValidityMonths" integer DEFAULT 12 NOT NULL,
    "pgBgDefaultInterestRate" numeric(8,2) DEFAULT 0 NOT NULL,
    "pgBgExpiryReminderDays" integer DEFAULT 30 NOT NULL,
    "pgBgMaturityReminderDays" integer DEFAULT 15 NOT NULL,
    "creditCommitmentDefaultCharge" numeric(18,2) DEFAULT 100 NOT NULL,
    "sdDefaultPct" numeric(8,2) DEFAULT 10 NOT NULL,
    "sdDefaultValidityMonths" integer DEFAULT 12 NOT NULL,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: tender_costing_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tender_costing_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "costingId" text NOT NULL,
    description text NOT NULL,
    "secondaryDescription" text,
    unit text NOT NULL,
    quantity numeric(18,3) NOT NULL,
    "unitCost" numeric(18,2) NOT NULL,
    "marginPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "totalCost" numeric(18,2) NOT NULL,
    "ourCost" numeric(18,2) NOT NULL,
    remarks text,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "sourcingType" text DEFAULT 'LOCAL'::text NOT NULL,
    "costingStatus" text DEFAULT 'NOT_COSTED'::text NOT NULL,
    "selectedSource" text,
    "localSupplierName" text,
    "localUnitPrice" numeric(18,2) DEFAULT 0 NOT NULL,
    "localDiscountPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "localVatPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "localTaxPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "localTransportCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "localOtherCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "localTotalCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "foreignSupplierName" text,
    "foreignCountry" text,
    "foreignCurrency" text DEFAULT 'USD'::text NOT NULL,
    "foreignUnitPrice" numeric(18,4) DEFAULT 0 NOT NULL,
    "foreignExchangeRate" numeric(18,6) DEFAULT 1 NOT NULL,
    "exchangeRateDate" timestamp(3) without time zone,
    "foreignFreightCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "foreignInsuranceCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "customsDutyPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "regulatoryDutyPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "supplementaryDutyPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "foreignVatPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "foreignTaxPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "cnfCharge" numeric(18,2) DEFAULT 0 NOT NULL,
    "portHandlingCharge" numeric(18,2) DEFAULT 0 NOT NULL,
    "bankLcCharge" numeric(18,2) DEFAULT 0 NOT NULL,
    "foreignLocalTransportCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "foreignOtherCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "foreignProductValueBdt" numeric(18,2) DEFAULT 0 NOT NULL,
    "foreignLandedCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "costingDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "preparedByUserId" text,
    "preparedByName" text,
    "foreignShippingMethod" text DEFAULT 'LC_SEA'::text NOT NULL,
    "foreignShippingProvider" text,
    "foreignDoorToDoorCharge" numeric(18,2) DEFAULT 0 NOT NULL,
    "foreignImportDutyIncluded" boolean DEFAULT false NOT NULL,
    "foreignTransitDays" integer,
    "foreignShippingReference" text,
    "foreignTransportCharge" numeric(18,2) DEFAULT 0 NOT NULL,
    "customsDeclarationCharge" numeric(18,2) DEFAULT 0 NOT NULL,
    "shippingWeightKg" numeric(18,3) DEFAULT 0 NOT NULL,
    "shippingVolumeCbm" numeric(18,4) DEFAULT 0 NOT NULL,
    "shippingRateBasis" text DEFAULT 'PER_CBM'::text NOT NULL,
    "shippingRate" numeric(18,4) DEFAULT 0 NOT NULL,
    "domesticTransportCost" numeric(18,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "tender_costing_items_customsDeclarationCharge_check" CHECK (("customsDeclarationCharge" >= (0)::numeric)),
    CONSTRAINT "tender_costing_items_domesticTransportCost_check" CHECK (("domesticTransportCost" >= (0)::numeric)),
    CONSTRAINT "tender_costing_items_foreignDoorToDoorCharge_check" CHECK (("foreignDoorToDoorCharge" >= (0)::numeric)),
    CONSTRAINT "tender_costing_items_foreignShippingMethod_check" CHECK (("foreignShippingMethod" = ANY (ARRAY['DOOR_TO_DOOR_SEA'::text, 'DOOR_TO_DOOR_AIR'::text, 'LC_SEA'::text, 'LC_AIR'::text]))),
    CONSTRAINT "tender_costing_items_foreignTransitDays_check" CHECK ((("foreignTransitDays" IS NULL) OR ("foreignTransitDays" > 0))),
    CONSTRAINT "tender_costing_items_foreignTransportCharge_check" CHECK (("foreignTransportCharge" >= (0)::numeric)),
    CONSTRAINT "tender_costing_items_shippingRateBasis_check" CHECK (("shippingRateBasis" = ANY (ARRAY['PER_CBM'::text, 'PER_KG'::text, 'FLAT'::text]))),
    CONSTRAINT "tender_costing_items_shippingRate_check" CHECK (("shippingRate" >= (0)::numeric)),
    CONSTRAINT "tender_costing_items_shippingVolumeCbm_check" CHECK (("shippingVolumeCbm" >= (0)::numeric)),
    CONSTRAINT "tender_costing_items_shippingWeightKg_check" CHECK (("shippingWeightKg" >= (0)::numeric)),
    CONSTRAINT tender_costing_items_source_values_check CHECK ((("localUnitPrice" >= (0)::numeric) AND (("localDiscountPercent" >= (0)::numeric) AND ("localDiscountPercent" <= (100)::numeric)) AND (("localVatPercent" >= (0)::numeric) AND ("localVatPercent" <= (100)::numeric)) AND (("localTaxPercent" >= (0)::numeric) AND ("localTaxPercent" <= (100)::numeric)) AND ("localTransportCost" >= (0)::numeric) AND ("localOtherCost" >= (0)::numeric) AND ("localTotalCost" >= (0)::numeric) AND ("foreignUnitPrice" >= (0)::numeric) AND ("foreignExchangeRate" > (0)::numeric) AND ("foreignFreightCost" >= (0)::numeric) AND ("foreignInsuranceCost" >= (0)::numeric) AND (("customsDutyPercent" >= (0)::numeric) AND ("customsDutyPercent" <= (100)::numeric)) AND (("regulatoryDutyPercent" >= (0)::numeric) AND ("regulatoryDutyPercent" <= (100)::numeric)) AND (("supplementaryDutyPercent" >= (0)::numeric) AND ("supplementaryDutyPercent" <= (100)::numeric)) AND (("foreignVatPercent" >= (0)::numeric) AND ("foreignVatPercent" <= (100)::numeric)) AND (("foreignTaxPercent" >= (0)::numeric) AND ("foreignTaxPercent" <= (100)::numeric)) AND ("cnfCharge" >= (0)::numeric) AND ("portHandlingCharge" >= (0)::numeric) AND ("bankLcCharge" >= (0)::numeric) AND ("foreignLocalTransportCost" >= (0)::numeric) AND ("foreignOtherCost" >= (0)::numeric) AND ("foreignProductValueBdt" >= (0)::numeric) AND ("foreignLandedCost" >= (0)::numeric))),
    CONSTRAINT tender_costing_items_sourcing_check CHECK ((("sourcingType" = ANY (ARRAY['LOCAL'::text, 'FOREIGN'::text, 'LOCAL_AND_FOREIGN'::text])) AND ("costingStatus" = ANY (ARRAY['NOT_COSTED'::text, 'DRAFT'::text, 'COSTED'::text])) AND (("selectedSource" IS NULL) OR ("selectedSource" = ANY (ARRAY['LOCAL'::text, 'FOREIGN'::text]))) AND (("sourcingType" <> 'LOCAL'::text) OR ("selectedSource" IS NULL) OR ("selectedSource" = 'LOCAL'::text)) AND (("sourcingType" <> 'FOREIGN'::text) OR ("selectedSource" IS NULL) OR ("selectedSource" = 'FOREIGN'::text)))),
    CONSTRAINT tender_costing_items_values_check CHECK (((NULLIF(btrim(description), ''::text) IS NOT NULL) AND (NULLIF(btrim(unit), ''::text) IS NOT NULL) AND (quantity > (0)::numeric) AND ("unitCost" >= (0)::numeric) AND ("marginPercent" >= (0)::numeric) AND ("marginPercent" <= (100)::numeric) AND ("totalCost" >= (0)::numeric) AND ("ourCost" >= (0)::numeric) AND ("ourCost" <= "totalCost") AND ("sortOrder" >= 0)))
);


--
-- Name: tender_costings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tender_costings (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text NOT NULL,
    status public."TenderCostingStatus" DEFAULT 'READY'::public."TenderCostingStatus" NOT NULL,
    "costingDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    source text,
    currency text DEFAULT 'BDT'::text NOT NULL,
    "exchangeRate" numeric(18,6) DEFAULT 1 NOT NULL,
    "costingVersion" integer DEFAULT 1 NOT NULL,
    remarks text,
    "preparedByUserId" text,
    "preparedByName" text,
    "estimatedValue" numeric(18,2) DEFAULT 0 NOT NULL,
    "estimatedCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "ourCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "marginPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "freightCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "installationCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "otherCost" numeric(18,2) DEFAULT 0 NOT NULL,
    "contingencyPercent" numeric(7,4) DEFAULT 0 NOT NULL,
    "contingencyAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "validityDays" integer,
    "paymentTermId" text,
    "deliveryTime" text,
    warranty text,
    "assignedToUserId" text,
    "assignedToName" text,
    "approvedForCostingAt" timestamp(3) without time zone NOT NULL,
    "approvedForCostingById" text,
    version integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "costingBudget" numeric(18,2),
    "lcContainerFee" numeric(18,2) DEFAULT 0 NOT NULL,
    "lcContainerAllocationMethod" text DEFAULT 'EQUAL'::text NOT NULL,
    CONSTRAINT tender_costings_budget_check CHECK ((("costingBudget" IS NULL) OR ("costingBudget" > (0)::numeric))),
    CONSTRAINT "tender_costings_lcContainerAllocationMethod_check" CHECK (("lcContainerAllocationMethod" = ANY (ARRAY['EQUAL'::text, 'WEIGHT'::text, 'VALUE'::text]))),
    CONSTRAINT tender_costings_values_check CHECK ((("exchangeRate" > (0)::numeric) AND ("costingVersion" > 0) AND (version > 0) AND ("estimatedValue" >= (0)::numeric) AND ("estimatedCost" >= (0)::numeric) AND ("ourCost" >= (0)::numeric) AND ("marginPercent" >= (0)::numeric) AND ("marginPercent" <= (100)::numeric) AND ("freightCost" >= (0)::numeric) AND ("installationCost" >= (0)::numeric) AND ("otherCost" >= (0)::numeric) AND ("contingencyPercent" >= (0)::numeric) AND ("contingencyPercent" <= (100)::numeric) AND ("contingencyAmount" >= (0)::numeric) AND (("validityDays" IS NULL) OR ("validityDays" > 0))))
);


--
-- Name: tender_securities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tender_securities (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text,
    "organizationMasterId" text,
    "bankAccountId" text,
    "instrumentNo" text,
    amount numeric(18,2) DEFAULT 0 NOT NULL,
    "issueDate" timestamp(3) without time zone NOT NULL,
    "expiryDate" timestamp(3) without time zone NOT NULL,
    status public."InstrumentStatus" DEFAULT 'ACTIVE'::public."InstrumentStatus" NOT NULL,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "chargeFromAccountId" text,
    "securityType" public."SecurityType" DEFAULT 'PAY_ORDER'::public."SecurityType" NOT NULL,
    "fundingType" public."FundingType" DEFAULT 'LOAN'::public."FundingType" NOT NULL,
    "marginAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "bankFinanceAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "interestRate" numeric(8,2) DEFAULT 0 NOT NULL,
    "validityMonths" integer DEFAULT 1 NOT NULL,
    remarks text
);


--
-- Name: tender_security_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tender_security_items (
    id text NOT NULL,
    "tenderSecurityId" text NOT NULL,
    "documentPurchaseId" text NOT NULL,
    "securityAmount" numeric(18,2) NOT NULL,
    "marginPercentage" numeric(8,2) NOT NULL,
    "marginAmount" numeric(18,2) NOT NULL,
    "bankFinanceAmount" numeric(18,2) NOT NULL,
    "referenceNo" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: tender_vat_tax_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tender_vat_tax_entries (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "tenderId" text NOT NULL,
    "taxType" public."VatTaxCertificateType" NOT NULL,
    "entryKind" public."TenderVatTaxEntryKind" NOT NULL,
    "entryDate" date NOT NULL,
    amount numeric(18,2) NOT NULL,
    "referenceNo" text NOT NULL,
    "referenceKey" text NOT NULL,
    notes text,
    "requestId" text NOT NULL,
    "requestHash" text NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "voidedAt" timestamp(3) without time zone,
    "voidReason" text,
    "createdById" text NOT NULL,
    "updatedById" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT tender_vat_tax_entries_positive_amount CHECK ((amount > (0)::numeric)),
    CONSTRAINT tender_vat_tax_entries_reference_required CHECK ((length(TRIM(BOTH FROM "referenceKey")) > 0)),
    CONSTRAINT tender_vat_tax_entries_void_reason CHECK ((("voidedAt" IS NULL) OR (("voidReason" IS NOT NULL) AND (length(TRIM(BOTH FROM "voidReason")) > 0))))
);


--
-- Name: tenders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenders (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "organizationMasterId" text,
    "egpTenderId" text,
    "workName" text NOT NULL,
    category text,
    "contractValue" numeric(18,2) DEFAULT 0 NOT NULL,
    status public."TenderStatus" DEFAULT 'DRAFT'::public."TenderStatus" NOT NULL,
    "progressPercentage" integer DEFAULT 0 NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "awardedAt" timestamp(3) without time zone,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "assignedToName" text,
    "assignedToUserId" text,
    "checklistStatus" text,
    description text,
    "documentPurchaseDeadline" timestamp(3) without time zone,
    "estimatedTenderSecurityAmount" numeric(18,2),
    "lowestBidAmount" numeric(18,2),
    "lowestBidder" text,
    "openingDate" timestamp(3) without time zone,
    "openingResult" text,
    "preBidDate" timestamp(3) without time zone,
    "legacyProcurementMethod" text,
    "publishedDate" timestamp(3) without time zone,
    "quotedAmount" numeric(18,2),
    "resultRemarks" text,
    "submissionDate" timestamp(3) without time zone,
    "submissionDeadline" timestamp(3) without time zone,
    "submissionMethod" text,
    "submissionReference" text,
    "submissionRemarks" text,
    "submittedById" text,
    "submittedByName" text,
    "tenderMethod" text,
    "tenderSecurityRequired" boolean DEFAULT false NOT NULL,
    "tenderType" text,
    "procurementMethod" public."TenderProcurementMethod" DEFAULT 'OTM'::public."TenderProcurementMethod" NOT NULL,
    "tenderIdNormalized" text,
    "legacyTenderIdExempt" boolean DEFAULT false NOT NULL,
    "costingApprovalStatus" public."TenderCostingApprovalStatus" DEFAULT 'DRAFT'::public."TenderCostingApprovalStatus" NOT NULL,
    "payOrderRequired" boolean DEFAULT false NOT NULL,
    "payOrderAmount" numeric(18,2),
    "foundByUserId" text,
    "findingDate" timestamp(3) without time zone,
    remarks text,
    version integer DEFAULT 1 NOT NULL,
    "costingSubmittedAt" timestamp(3) without time zone,
    "costingSubmittedById" text,
    "costingApprovedAt" timestamp(3) without time zone,
    "costingApprovedById" text,
    "costingRejectedAt" timestamp(3) without time zone,
    "costingRejectedById" text,
    "costingRejectionReason" text,
    "foundByName" text,
    "preBidEndDate" timestamp(3) without time zone,
    "documentFee" numeric(18,2),
    "paName" text,
    "paDesignation" text,
    "paPhone" text,
    "paAddress" text,
    "noticeOrganization" text,
    "tenderSecurityValidUpTo" timestamp(3) without time zone,
    CONSTRAINT tenders_business_id_required_check CHECK (((("legacyTenderIdExempt" = true) AND (NULLIF(btrim("egpTenderId"), ''::text) IS NULL) AND ("tenderIdNormalized" IS NULL)) OR ((NULLIF(btrim("egpTenderId"), ''::text) IS NOT NULL) AND ("tenderIdNormalized" = upper(regexp_replace(btrim("egpTenderId"), '[[:space:]]+'::text, ' '::text, 'g'::text)))))),
    CONSTRAINT tenders_costing_approval_state_check CHECK (((("costingApprovalStatus" = 'DRAFT'::public."TenderCostingApprovalStatus") AND ("costingSubmittedAt" IS NULL) AND ("costingApprovedAt" IS NULL) AND ("costingRejectedAt" IS NULL) AND ("costingRejectionReason" IS NULL)) OR (("costingApprovalStatus" = 'PENDING_APPROVAL'::public."TenderCostingApprovalStatus") AND ("costingSubmittedAt" IS NOT NULL) AND ("costingApprovedAt" IS NULL) AND ("costingRejectedAt" IS NULL) AND ("costingRejectionReason" IS NULL)) OR (("costingApprovalStatus" = 'APPROVED'::public."TenderCostingApprovalStatus") AND ("costingSubmittedAt" IS NOT NULL) AND ("costingApprovedAt" IS NOT NULL) AND ("costingRejectedAt" IS NULL) AND ("costingRejectionReason" IS NULL)) OR (("costingApprovalStatus" = 'REJECTED'::public."TenderCostingApprovalStatus") AND ("costingSubmittedAt" IS NOT NULL) AND ("costingApprovedAt" IS NULL) AND ("costingRejectedAt" IS NOT NULL) AND (NULLIF(btrim("costingRejectionReason"), ''::text) IS NOT NULL)))),
    CONSTRAINT tenders_pay_order_check CHECK (((("payOrderRequired" = true) AND ("payOrderAmount" > (0)::numeric)) OR (("payOrderRequired" = false) AND ("payOrderAmount" IS NULL)))),
    CONSTRAINT tenders_version_check CHECK ((version > 0))
);


--
-- Name: time_extensions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.time_extensions (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cmsWorkId" text NOT NULL,
    "contractId" text NOT NULL,
    "eotNo" text NOT NULL,
    "requestDate" timestamp(3) without time zone NOT NULL,
    "requestedDays" integer NOT NULL,
    reason text NOT NULL,
    description text,
    "approvalDate" timestamp(3) without time zone,
    "approvedDays" integer,
    "originalCompletionDate" timestamp(3) without time zone NOT NULL,
    "previousCompletionDate" timestamp(3) without time zone NOT NULL,
    "revisedCompletionDate" timestamp(3) without time zone,
    status public."TimeExtensionStatus" DEFAULT 'DRAFT'::public."TimeExtensionStatus" NOT NULL,
    "createdById" text,
    "approvedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: units_of_measurement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units_of_measurement (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    symbol text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    name text NOT NULL,
    "avatarUrl" text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    phone text
);


--
-- Name: variation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variation_items (
    id text NOT NULL,
    "variationOrderId" text NOT NULL,
    "boqItemId" text,
    "itemCode" text,
    description text NOT NULL,
    unit text,
    "originalQty" numeric(18,3),
    "originalRate" numeric(18,2),
    "revisedQty" numeric(18,3),
    "revisedRate" numeric(18,2),
    amount numeric(18,2) NOT NULL
);


--
-- Name: variation_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.variation_orders (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cmsWorkId" text NOT NULL,
    "contractId" text NOT NULL,
    "variationNo" text NOT NULL,
    "variationType" public."VariationType" DEFAULT 'ADDITION'::public."VariationType" NOT NULL,
    title text NOT NULL,
    reason text NOT NULL,
    description text,
    "requestDate" timestamp(3) without time zone NOT NULL,
    "approvalDate" timestamp(3) without time zone,
    "requestedAmount" numeric(18,2) NOT NULL,
    "approvedAmount" numeric(18,2),
    status public."VariationStatus" DEFAULT 'DRAFT'::public."VariationStatus" NOT NULL,
    "createdById" text,
    "approvedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: vat_tax_certificates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vat_tax_certificates (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "cmsWorkId" text NOT NULL,
    "contractId" text,
    "certificateType" public."VatTaxCertificateType" NOT NULL,
    "applicationDate" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "certificateNo" text,
    "issueDate" timestamp(3) without time zone,
    "validTill" timestamp(3) without time zone,
    amount numeric(18,2),
    "issuingAuthority" text,
    status public."VatTaxCertificateStatus" DEFAULT 'PENDING'::public."VatTaxCertificateStatus" NOT NULL,
    remarks text,
    "createdById" text,
    "updatedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT vat_tax_certificates_amount_nonnegative_check CHECK (((amount IS NULL) OR (amount >= (0)::numeric))),
    CONSTRAINT "vat_tax_certificates_certificateNo_not_blank_check" CHECK ((("certificateNo" IS NULL) OR (btrim("certificateNo") <> ''::text))),
    CONSTRAINT vat_tax_certificates_issued_fields_check CHECK (((status <> 'ISSUED'::public."VatTaxCertificateStatus") OR (("certificateNo" IS NOT NULL) AND ("issueDate" IS NOT NULL) AND ("validTill" IS NOT NULL) AND (amount IS NOT NULL) AND (amount > (0)::numeric)))),
    CONSTRAINT vat_tax_certificates_validity_check CHECK ((("validTill" IS NULL) OR (("issueDate" IS NOT NULL) AND ("validTill" >= "issueDate"))))
);


--
-- Name: vendor_admin_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_admin_users (
    id text NOT NULL,
    email text NOT NULL,
    "passwordHash" text NOT NULL,
    name text NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "lastLoginAt" timestamp(3) without time zone,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: vendor_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_customers (
    id text NOT NULL,
    "companyName" text NOT NULL,
    "contactName" text,
    email text NOT NULL,
    phone text,
    address text,
    "organizationId" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: vendor_device_activations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_device_activations (
    id text NOT NULL,
    "licenseKeyId" text NOT NULL,
    "deviceId" text NOT NULL,
    "deviceName" text,
    hostname text,
    "appVersion" text,
    "ipAddress" text,
    status public."VendorDeviceStatus" DEFAULT 'ACTIVE'::public."VendorDeviceStatus" NOT NULL,
    "activatedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "lastSeenAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "deactivatedAt" timestamp(3) without time zone,
    "lastVerifiedAt" timestamp(3) without time zone,
    platform text
);


--
-- Name: vendor_download_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_download_events (
    id text NOT NULL,
    "customerId" text,
    email text,
    "companyName" text,
    version text,
    platform text,
    "ipAddress" text,
    source text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: vendor_license_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_license_events (
    id text NOT NULL,
    "licenseKeyId" text NOT NULL,
    type text NOT NULL,
    message text,
    metadata jsonb,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "actorAdminId" text
);


--
-- Name: vendor_license_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_license_keys (
    id text NOT NULL,
    "licenseKey" text NOT NULL,
    "customerId" text NOT NULL,
    "packageId" text NOT NULL,
    type public."VendorLicenseType" NOT NULL,
    status public."VendorLicenseStatus" DEFAULT 'ACTIVE'::public."VendorLicenseStatus" NOT NULL,
    "maxDevices" integer NOT NULL,
    "issuedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "startsAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "expiresAt" timestamp(3) without time zone,
    "lastValidatedAt" timestamp(3) without time zone,
    "revokedAt" timestamp(3) without time zone,
    "revokedReason" text,
    notes text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "convertedAt" timestamp(3) without time zone,
    "convertedToLicenseId" text,
    "trialDeviceId" text
);


--
-- Name: vendor_license_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_license_packages (
    id text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    type public."VendorLicenseType" DEFAULT 'SUBSCRIPTION'::public."VendorLicenseType" NOT NULL,
    "maxDevices" integer DEFAULT 3 NOT NULL,
    "durationDays" integer,
    price numeric(12,2),
    currency text DEFAULT 'USD'::text NOT NULL,
    features jsonb,
    "isActive" boolean DEFAULT true NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    "billingCycle" public."VendorBillingCycle"
);


--
-- Name: vendor_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vendor_subscriptions (
    id text NOT NULL,
    "licenseKeyId" text NOT NULL,
    "customerId" text NOT NULL,
    "packageId" text NOT NULL,
    "billingCycle" public."VendorBillingCycle" NOT NULL,
    status public."VendorSubscriptionStatus" DEFAULT 'ACTIVE'::public."VendorSubscriptionStatus" NOT NULL,
    "startedAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "currentPeriodEnd" timestamp(3) without time zone NOT NULL,
    "cancelledAt" timestamp(3) without time zone,
    "cancelReason" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: warehouses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.warehouses (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    address text,
    "isActive" boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: work_iou_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_iou_attachments (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workIouId" text NOT NULL,
    "fileName" text NOT NULL,
    "mimeType" text NOT NULL,
    "fileSize" integer NOT NULL,
    data bytea NOT NULL,
    "uploadedById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT work_iou_attachments_file_size_check CHECK (("fileSize" > 0))
);


--
-- Name: work_iou_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_iou_items (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "workIouId" text NOT NULL,
    "expenseDate" timestamp(3) without time zone NOT NULL,
    description text NOT NULL,
    "expenseHeadId" text NOT NULL,
    "categoryName" text NOT NULL,
    "paidToName" text NOT NULL,
    "referenceNo" text,
    amount numeric(18,2) NOT NULL,
    "sortOrder" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT work_iou_items_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT work_iou_items_sort_order_check CHECK (("sortOrder" >= 0))
);


--
-- Name: work_ious; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.work_ious (
    id text NOT NULL,
    "organizationId" text NOT NULL,
    "iouNo" text NOT NULL,
    "iouDate" timestamp(3) without time zone NOT NULL,
    "paidOn" timestamp(3) without time zone NOT NULL,
    "paidById" text NOT NULL,
    "paidToName" text NOT NULL,
    "paymentMethod" public."WorkIouPaymentMethod" NOT NULL,
    "referenceNo" text,
    "expenseFor" public."WorkIouExpenseFor" NOT NULL,
    "tenderId" text,
    "workId" text,
    purpose text NOT NULL,
    remarks text,
    "otherCharges" numeric(18,2) DEFAULT 0 NOT NULL,
    subtotal numeric(18,2) DEFAULT 0 NOT NULL,
    discount numeric(18,2) DEFAULT 0 NOT NULL,
    "totalAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "settledAmount" numeric(18,2) DEFAULT 0 NOT NULL,
    "settlementStatus" public."WorkIouSettlementStatus" DEFAULT 'PENDING'::public."WorkIouSettlementStatus" NOT NULL,
    "expectedSettlementDate" timestamp(3) without time zone,
    "settlementRemarks" text,
    status public."WorkIouStatus" DEFAULT 'DRAFT'::public."WorkIouStatus" NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    "submittedAt" timestamp(3) without time zone,
    "submittedById" text,
    "cancelledAt" timestamp(3) without time zone,
    "cancelledById" text,
    "cancellationReason" text,
    "createdById" text,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL,
    CONSTRAINT work_ious_context_check CHECK (((("expenseFor" = 'TENDER'::public."WorkIouExpenseFor") AND ("tenderId" IS NOT NULL) AND ("workId" IS NULL)) OR (("expenseFor" = 'PROJECT'::public."WorkIouExpenseFor") AND ("workId" IS NOT NULL) AND ("tenderId" IS NULL)))),
    CONSTRAINT work_ious_money_nonnegative_check CHECK ((("otherCharges" >= (0)::numeric) AND (subtotal >= (0)::numeric) AND (discount >= (0)::numeric) AND ("totalAmount" >= (0)::numeric) AND ("settledAmount" >= (0)::numeric))),
    CONSTRAINT work_ious_settlement_status_check CHECK (((("settlementStatus" = 'PENDING'::public."WorkIouSettlementStatus") AND ("settledAmount" = (0)::numeric)) OR (("settlementStatus" = 'PARTIALLY_SETTLED'::public."WorkIouSettlementStatus") AND ("settledAmount" > (0)::numeric) AND ("settledAmount" < "totalAmount")) OR (("settlementStatus" = 'SETTLED'::public."WorkIouSettlementStatus") AND ("totalAmount" > (0)::numeric) AND ("settledAmount" = "totalAmount")))),
    CONSTRAINT work_ious_total_check CHECK (((discount <= (subtotal + "otherCharges")) AND ("totalAmount" = ((subtotal + "otherCharges") - discount)) AND ("settledAmount" <= "totalAmount"))),
    CONSTRAINT work_ious_version_check CHECK ((version > 0))
);


--
-- Name: support_tickets number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets ALTER COLUMN number SET DEFAULT nextval('public.support_tickets_number_seq'::regclass);


--
-- Name: accounting_periods accounting_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (id);


--
-- Name: approval_rules approval_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT approval_rules_pkey PRIMARY KEY (id);


--
-- Name: asset_categories asset_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT asset_categories_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_reconciliations bank_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: bill_adjustments bill_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_adjustments
    ADD CONSTRAINT bill_adjustments_pkey PRIMARY KEY (id);


--
-- Name: billing_profiles billing_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_profiles
    ADD CONSTRAINT billing_profiles_pkey PRIMARY KEY (id);


--
-- Name: boq_items boq_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_items
    ADD CONSTRAINT boq_items_pkey PRIMARY KEY (id);


--
-- Name: boq_sections boq_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_sections
    ADD CONSTRAINT boq_sections_pkey PRIMARY KEY (id);


--
-- Name: challan_submission_items challan_submission_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submission_items
    ADD CONSTRAINT challan_submission_items_pkey PRIMARY KEY (id);


--
-- Name: challan_submission_status_history challan_submission_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submission_status_history
    ADD CONSTRAINT challan_submission_status_history_pkey PRIMARY KEY (id);


--
-- Name: challan_submissions challan_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submissions
    ADD CONSTRAINT challan_submissions_pkey PRIMARY KEY (id);


--
-- Name: cheques cheques_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT cheques_pkey PRIMARY KEY (id);


--
-- Name: cms_works cms_works_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_works
    ADD CONSTRAINT cms_works_pkey PRIMARY KEY (id);


--
-- Name: company_profiles company_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profiles
    ADD CONSTRAINT company_profiles_pkey PRIMARY KEY (id);


--
-- Name: comparative_statement_suppliers comparative_statement_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statement_suppliers
    ADD CONSTRAINT comparative_statement_suppliers_pkey PRIMARY KEY (id);


--
-- Name: comparative_statements comparative_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statements
    ADD CONSTRAINT comparative_statements_pkey PRIMARY KEY (id);


--
-- Name: completion_certificates completion_certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.completion_certificates
    ADD CONSTRAINT completion_certificates_pkey PRIMARY KEY (id);


--
-- Name: credit_commitment_items credit_commitment_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitment_items
    ADD CONSTRAINT credit_commitment_items_pkey PRIMARY KEY (id);


--
-- Name: credit_commitments credit_commitments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitments
    ADD CONSTRAINT credit_commitments_pkey PRIMARY KEY (id);


--
-- Name: deduction_configs deduction_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_configs
    ADD CONSTRAINT deduction_configs_pkey PRIMARY KEY (id);


--
-- Name: defect_liability_periods defect_liability_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defect_liability_periods
    ADD CONSTRAINT defect_liability_periods_pkey PRIMARY KEY (id);


--
-- Name: desktop_master_sync_changes desktop_master_sync_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_master_sync_changes
    ADD CONSTRAINT desktop_master_sync_changes_pkey PRIMARY KEY ("organizationId", "entityType", sequence);


--
-- Name: desktop_master_sync_clocks desktop_master_sync_clocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_master_sync_clocks
    ADD CONSTRAINT desktop_master_sync_clocks_pkey PRIMARY KEY ("organizationId", "entityType");


--
-- Name: desktop_master_sync_versions desktop_master_sync_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_master_sync_versions
    ADD CONSTRAINT desktop_master_sync_versions_pkey PRIMARY KEY ("organizationId", "entityType", "entityId");


--
-- Name: desktop_sync_category_versions desktop_sync_category_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_category_versions
    ADD CONSTRAINT desktop_sync_category_versions_pkey PRIMARY KEY ("organizationId", "categoryId");


--
-- Name: desktop_sync_changes desktop_sync_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_changes
    ADD CONSTRAINT desktop_sync_changes_pkey PRIMARY KEY ("organizationId", sequence);


--
-- Name: desktop_sync_clocks desktop_sync_clocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_clocks
    ADD CONSTRAINT desktop_sync_clocks_pkey PRIMARY KEY ("organizationId");


--
-- Name: desktop_sync_devices desktop_sync_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_devices
    ADD CONSTRAINT desktop_sync_devices_pkey PRIMARY KEY (id);


--
-- Name: desktop_sync_receipts desktop_sync_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_receipts
    ADD CONSTRAINT desktop_sync_receipts_pkey PRIMARY KEY ("organizationId", "deviceId", "operationId");


--
-- Name: dlp_defects dlp_defects_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dlp_defects
    ADD CONSTRAINT dlp_defects_pkey PRIMARY KEY (id);


--
-- Name: dlp_extensions dlp_extensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dlp_extensions
    ADD CONSTRAINT dlp_extensions_pkey PRIMARY KEY (id);


--
-- Name: document_purchase_requests document_purchase_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchase_requests
    ADD CONSTRAINT document_purchase_requests_pkey PRIMARY KEY (id);


--
-- Name: document_purchases document_purchases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchases
    ADD CONSTRAINT document_purchases_pkey PRIMARY KEY (id);


--
-- Name: document_settings document_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_settings
    ADD CONSTRAINT document_settings_pkey PRIMARY KEY (id);


--
-- Name: document_versions document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: expense_attachments expense_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_attachments
    ADD CONSTRAINT expense_attachments_pkey PRIMARY KEY (id);


--
-- Name: expense_heads expense_heads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_heads
    ADD CONSTRAINT expense_heads_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: finance_settings finance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_settings
    ADD CONSTRAINT finance_settings_pkey PRIMARY KEY (id);


--
-- Name: financial_transactions financial_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT financial_transactions_pkey PRIMARY KEY (id);


--
-- Name: fixed_asset_depreciation_entries fixed_asset_depreciation_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_asset_depreciation_entries
    ADD CONSTRAINT fixed_asset_depreciation_entries_pkey PRIMARY KEY (id);


--
-- Name: fixed_assets fixed_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT fixed_assets_pkey PRIMARY KEY (id);


--
-- Name: fund_transfers fund_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_transfers
    ADD CONSTRAINT fund_transfers_pkey PRIMARY KEY (id);


--
-- Name: general_settings general_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_settings
    ADD CONSTRAINT general_settings_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_notes goods_receipt_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT goods_receipt_notes_pkey PRIMARY KEY (id);


--
-- Name: grn_items grn_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT grn_items_pkey PRIMARY KEY (id);


--
-- Name: hidden_report_transactions hidden_report_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_report_transactions
    ADD CONSTRAINT hidden_report_transactions_pkey PRIMARY KEY (id);


--
-- Name: hr_attendance_records hr_attendance_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_records
    ADD CONSTRAINT hr_attendance_records_pkey PRIMARY KEY (id);


--
-- Name: hr_business_units hr_business_units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_business_units
    ADD CONSTRAINT hr_business_units_pkey PRIMARY KEY (id);


--
-- Name: hr_candidates hr_candidates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_candidates
    ADD CONSTRAINT hr_candidates_pkey PRIMARY KEY (id);


--
-- Name: hr_cost_centers hr_cost_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_cost_centers
    ADD CONSTRAINT hr_cost_centers_pkey PRIMARY KEY (id);


--
-- Name: hr_departments hr_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_departments
    ADD CONSTRAINT hr_departments_pkey PRIMARY KEY (id);


--
-- Name: hr_designations hr_designations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_designations
    ADD CONSTRAINT hr_designations_pkey PRIMARY KEY (id);


--
-- Name: hr_divisions hr_divisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_divisions
    ADD CONSTRAINT hr_divisions_pkey PRIMARY KEY (id);


--
-- Name: hr_employee_change_records hr_employee_change_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_change_records
    ADD CONSTRAINT hr_employee_change_records_pkey PRIMARY KEY (id);


--
-- Name: hr_employee_loans hr_employee_loans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT hr_employee_loans_pkey PRIMARY KEY (id);


--
-- Name: hr_employees hr_employees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT hr_employees_pkey PRIMARY KEY (id);


--
-- Name: hr_exit_processes hr_exit_processes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_processes
    ADD CONSTRAINT hr_exit_processes_pkey PRIMARY KEY (id);


--
-- Name: hr_expense_claims hr_expense_claims_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_expense_claims
    ADD CONSTRAINT hr_expense_claims_pkey PRIMARY KEY (id);


--
-- Name: hr_grades hr_grades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_grades
    ADD CONSTRAINT hr_grades_pkey PRIMARY KEY (id);


--
-- Name: hr_holidays hr_holidays_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_holidays
    ADD CONSTRAINT hr_holidays_pkey PRIMARY KEY (id);


--
-- Name: hr_job_applications hr_job_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_job_applications
    ADD CONSTRAINT hr_job_applications_pkey PRIMARY KEY (id);


--
-- Name: hr_job_openings hr_job_openings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_job_openings
    ADD CONSTRAINT hr_job_openings_pkey PRIMARY KEY (id);


--
-- Name: hr_leave_requests hr_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT hr_leave_requests_pkey PRIMARY KEY (id);


--
-- Name: hr_leave_types hr_leave_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types
    ADD CONSTRAINT hr_leave_types_pkey PRIMARY KEY (id);


--
-- Name: hr_loan_repayments hr_loan_repayments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_loan_repayments
    ADD CONSTRAINT hr_loan_repayments_pkey PRIMARY KEY (id);


--
-- Name: hr_locations hr_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_locations
    ADD CONSTRAINT hr_locations_pkey PRIMARY KEY (id);


--
-- Name: hr_onboarding_checklists hr_onboarding_checklists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_onboarding_checklists
    ADD CONSTRAINT hr_onboarding_checklists_pkey PRIMARY KEY (id);


--
-- Name: hr_payroll_runs hr_payroll_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_runs
    ADD CONSTRAINT hr_payroll_runs_pkey PRIMARY KEY (id);


--
-- Name: hr_payroll_settings hr_payroll_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_settings
    ADD CONSTRAINT hr_payroll_settings_pkey PRIMARY KEY (id);


--
-- Name: hr_payslips hr_payslips_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payslips
    ADD CONSTRAINT hr_payslips_pkey PRIMARY KEY (id);


--
-- Name: hr_shifts hr_shifts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_shifts
    ADD CONSTRAINT hr_shifts_pkey PRIMARY KEY (id);


--
-- Name: invoice_items invoice_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: items items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);


--
-- Name: journal_entries journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT journal_entries_pkey PRIMARY KEY (id);


--
-- Name: journal_lines journal_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT journal_lines_pkey PRIMARY KEY (id);


--
-- Name: lc_cost_allocations lc_cost_allocations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_allocations
    ADD CONSTRAINT lc_cost_allocations_pkey PRIMARY KEY (id);


--
-- Name: lc_cost_entries lc_cost_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_entries
    ADD CONSTRAINT lc_cost_entries_pkey PRIMARY KEY (id);


--
-- Name: lc_cost_heads lc_cost_heads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_heads
    ADD CONSTRAINT lc_cost_heads_pkey PRIMARY KEY (id);


--
-- Name: lc_grn_items lc_grn_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_grn_items
    ADD CONSTRAINT lc_grn_items_pkey PRIMARY KEY (id);


--
-- Name: lc_grns lc_grns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_grns
    ADD CONSTRAINT lc_grns_pkey PRIMARY KEY (id);


--
-- Name: lc_inventory_postings lc_inventory_postings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_inventory_postings
    ADD CONSTRAINT lc_inventory_postings_pkey PRIMARY KEY (id);


--
-- Name: lc_items lc_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_items
    ADD CONSTRAINT lc_items_pkey PRIMARY KEY (id);


--
-- Name: lc_landed_cost_items lc_landed_cost_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_landed_cost_items
    ADD CONSTRAINT lc_landed_cost_items_pkey PRIMARY KEY (id);


--
-- Name: lc_landed_costs lc_landed_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_landed_costs
    ADD CONSTRAINT lc_landed_costs_pkey PRIMARY KEY (id);


--
-- Name: lc_masters lc_masters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_masters
    ADD CONSTRAINT lc_masters_pkey PRIMARY KEY (id);


--
-- Name: lc_shipments lc_shipments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_shipments
    ADD CONSTRAINT lc_shipments_pkey PRIMARY KEY (id);


--
-- Name: lc_status_history lc_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_status_history
    ADD CONSTRAINT lc_status_history_pkey PRIMARY KEY (id);


--
-- Name: ledger_accounts ledger_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_accounts
    ADD CONSTRAINT ledger_accounts_pkey PRIMARY KEY (id);


--
-- Name: licenses licenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT licenses_pkey PRIMARY KEY (id);


--
-- Name: master_categories master_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_categories
    ADD CONSTRAINT master_categories_pkey PRIMARY KEY (id);


--
-- Name: monthly_targets monthly_targets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_targets
    ADD CONSTRAINT monthly_targets_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: number_sequences number_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_sequences
    ADD CONSTRAINT number_sequences_pkey PRIMARY KEY (id);


--
-- Name: organization_contacts organization_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_contacts
    ADD CONSTRAINT organization_contacts_pkey PRIMARY KEY (id);


--
-- Name: organization_masters organization_masters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_masters
    ADD CONSTRAINT organization_masters_pkey PRIMARY KEY (id);


--
-- Name: organization_users organization_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT organization_users_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: parties parties_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT parties_pkey PRIMARY KEY (id);


--
-- Name: payables payables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payables
    ADD CONSTRAINT payables_pkey PRIMARY KEY (id);


--
-- Name: payment_records payment_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_records
    ADD CONSTRAINT payment_records_pkey PRIMARY KEY (id);


--
-- Name: payment_terms payment_terms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms
    ADD CONSTRAINT payment_terms_pkey PRIMARY KEY (id);


--
-- Name: performance_guarantees performance_guarantees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_guarantees
    ADD CONSTRAINT performance_guarantees_pkey PRIMARY KEY (id);


--
-- Name: permissions permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.permissions
    ADD CONSTRAINT permissions_pkey PRIMARY KEY (id);


--
-- Name: pg_bg_workflows pg_bg_workflows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pg_bg_workflows
    ADD CONSTRAINT pg_bg_workflows_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: project_bill_items project_bill_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bill_items
    ADD CONSTRAINT project_bill_items_pkey PRIMARY KEY (id);


--
-- Name: project_bills project_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bills
    ADD CONSTRAINT project_bills_pkey PRIMARY KEY (id);


--
-- Name: project_budget_lines project_budget_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_budget_lines
    ADD CONSTRAINT project_budget_lines_pkey PRIMARY KEY (id);


--
-- Name: project_budgets project_budgets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_budgets
    ADD CONSTRAINT project_budgets_pkey PRIMARY KEY (id);


--
-- Name: project_closure_events project_closure_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_closure_events
    ADD CONSTRAINT project_closure_events_pkey PRIMARY KEY (id);


--
-- Name: project_contracts project_contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contracts
    ADD CONSTRAINT project_contracts_pkey PRIMARY KEY (id);


--
-- Name: project_handovers project_handovers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_handovers
    ADD CONSTRAINT project_handovers_pkey PRIMARY KEY (id);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: purchase_requisition_items purchase_requisition_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisition_items
    ADD CONSTRAINT purchase_requisition_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_requisitions purchase_requisitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions
    ADD CONSTRAINT purchase_requisitions_pkey PRIMARY KEY (id);


--
-- Name: receipt_sequences receipt_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_sequences
    ADD CONSTRAINT receipt_sequences_pkey PRIMARY KEY (id);


--
-- Name: receipts receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT receipts_pkey PRIMARY KEY (id);


--
-- Name: receivables receivables_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivables
    ADD CONSTRAINT receivables_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: reminder_rule_settings reminder_rule_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rule_settings
    ADD CONSTRAINT reminder_rule_settings_pkey PRIMARY KEY (id);


--
-- Name: reminders reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT reminders_pkey PRIMARY KEY (id);


--
-- Name: request_for_quotations request_for_quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_for_quotations
    ADD CONSTRAINT request_for_quotations_pkey PRIMARY KEY (id);


--
-- Name: retention_releases retention_releases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_releases
    ADD CONSTRAINT retention_releases_pkey PRIMARY KEY (id);


--
-- Name: rfq_items rfq_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_items
    ADD CONSTRAINT rfq_items_pkey PRIMARY KEY (id);


--
-- Name: rfq_suppliers rfq_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_suppliers
    ADD CONSTRAINT rfq_suppliers_pkey PRIMARY KEY (id);


--
-- Name: role_permissions role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: sales_quotation_follow_ups sales_quotation_follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_follow_ups
    ADD CONSTRAINT sales_quotation_follow_ups_pkey PRIMARY KEY (id);


--
-- Name: sales_quotation_items sales_quotation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_items
    ADD CONSTRAINT sales_quotation_items_pkey PRIMARY KEY (id);


--
-- Name: sales_quotation_overheads sales_quotation_overheads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_overheads
    ADD CONSTRAINT sales_quotation_overheads_pkey PRIMARY KEY (id);


--
-- Name: sales_quotation_status_history sales_quotation_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_status_history
    ADD CONSTRAINT sales_quotation_status_history_pkey PRIMARY KEY (id);


--
-- Name: sales_quotations sales_quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotations
    ADD CONSTRAINT sales_quotations_pkey PRIMARY KEY (id);


--
-- Name: security_settings security_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_settings
    ADD CONSTRAINT security_settings_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: subcontractor_profiles subcontractor_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_profiles
    ADD CONSTRAINT subcontractor_profiles_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: supplier_bill_deductions supplier_bill_deductions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bill_deductions
    ADD CONSTRAINT supplier_bill_deductions_pkey PRIMARY KEY (id);


--
-- Name: supplier_bill_items supplier_bill_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bill_items
    ADD CONSTRAINT supplier_bill_items_pkey PRIMARY KEY (id);


--
-- Name: supplier_bills supplier_bills_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bills
    ADD CONSTRAINT supplier_bills_pkey PRIMARY KEY (id);


--
-- Name: supplier_payments supplier_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);


--
-- Name: supplier_quotation_items supplier_quotation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotation_items
    ADD CONSTRAINT supplier_quotation_items_pkey PRIMARY KEY (id);


--
-- Name: supplier_quotations supplier_quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotations
    ADD CONSTRAINT supplier_quotations_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_attachments support_ticket_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_attachments
    ADD CONSTRAINT support_ticket_attachments_pkey PRIMARY KEY (id);


--
-- Name: support_ticket_messages support_ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT support_ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: support_tickets support_tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT support_tickets_pkey PRIMARY KEY (id);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: tender_bank_settings tender_bank_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_bank_settings
    ADD CONSTRAINT tender_bank_settings_pkey PRIMARY KEY (id);


--
-- Name: tender_costing_items tender_costing_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costing_items
    ADD CONSTRAINT tender_costing_items_pkey PRIMARY KEY (id);


--
-- Name: tender_costings tender_costings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costings
    ADD CONSTRAINT tender_costings_pkey PRIMARY KEY (id);


--
-- Name: tender_securities tender_securities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_securities
    ADD CONSTRAINT tender_securities_pkey PRIMARY KEY (id);


--
-- Name: tender_security_items tender_security_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_security_items
    ADD CONSTRAINT tender_security_items_pkey PRIMARY KEY (id);


--
-- Name: tender_vat_tax_entries tender_vat_tax_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_vat_tax_entries
    ADD CONSTRAINT tender_vat_tax_entries_pkey PRIMARY KEY (id);


--
-- Name: tenders tenders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenders
    ADD CONSTRAINT tenders_pkey PRIMARY KEY (id);


--
-- Name: time_extensions time_extensions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_extensions
    ADD CONSTRAINT time_extensions_pkey PRIMARY KEY (id);


--
-- Name: units_of_measurement units_of_measurement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units_of_measurement
    ADD CONSTRAINT units_of_measurement_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: variation_items variation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_items
    ADD CONSTRAINT variation_items_pkey PRIMARY KEY (id);


--
-- Name: variation_orders variation_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_orders
    ADD CONSTRAINT variation_orders_pkey PRIMARY KEY (id);


--
-- Name: vat_tax_certificates vat_tax_certificates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_tax_certificates
    ADD CONSTRAINT vat_tax_certificates_pkey PRIMARY KEY (id);


--
-- Name: vendor_admin_users vendor_admin_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_admin_users
    ADD CONSTRAINT vendor_admin_users_pkey PRIMARY KEY (id);


--
-- Name: vendor_customers vendor_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_customers
    ADD CONSTRAINT vendor_customers_pkey PRIMARY KEY (id);


--
-- Name: vendor_device_activations vendor_device_activations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_device_activations
    ADD CONSTRAINT vendor_device_activations_pkey PRIMARY KEY (id);


--
-- Name: vendor_download_events vendor_download_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_download_events
    ADD CONSTRAINT vendor_download_events_pkey PRIMARY KEY (id);


--
-- Name: vendor_license_events vendor_license_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_license_events
    ADD CONSTRAINT vendor_license_events_pkey PRIMARY KEY (id);


--
-- Name: vendor_license_keys vendor_license_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_license_keys
    ADD CONSTRAINT vendor_license_keys_pkey PRIMARY KEY (id);


--
-- Name: vendor_license_packages vendor_license_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_license_packages
    ADD CONSTRAINT vendor_license_packages_pkey PRIMARY KEY (id);


--
-- Name: vendor_subscriptions vendor_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_subscriptions
    ADD CONSTRAINT vendor_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: warehouses warehouses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT warehouses_pkey PRIMARY KEY (id);


--
-- Name: work_iou_attachments work_iou_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_iou_attachments
    ADD CONSTRAINT work_iou_attachments_pkey PRIMARY KEY (id);


--
-- Name: work_iou_items work_iou_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_iou_items
    ADD CONSTRAINT work_iou_items_pkey PRIMARY KEY (id);


--
-- Name: work_ious work_ious_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ious
    ADD CONSTRAINT work_ious_pkey PRIMARY KEY (id);


--
-- Name: accounting_periods_organizationId_label_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "accounting_periods_organizationId_label_key" ON public.accounting_periods USING btree ("organizationId", label);


--
-- Name: accounting_periods_organizationId_startDate_endDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "accounting_periods_organizationId_startDate_endDate_idx" ON public.accounting_periods USING btree ("organizationId", "startDate", "endDate");


--
-- Name: app_settings_organizationId_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "app_settings_organizationId_key_key" ON public.app_settings USING btree ("organizationId", key);


--
-- Name: approval_rules_organizationId_module_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "approval_rules_organizationId_module_isActive_idx" ON public.approval_rules USING btree ("organizationId", module, "isActive");


--
-- Name: asset_categories_organizationId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "asset_categories_organizationId_code_key" ON public.asset_categories USING btree ("organizationId", code);


--
-- Name: asset_categories_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_categories_organizationId_isActive_idx" ON public.asset_categories USING btree ("organizationId", "isActive");


--
-- Name: asset_categories_parentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "asset_categories_parentId_idx" ON public.asset_categories USING btree ("parentId");


--
-- Name: audit_logs_organizationId_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_organizationId_action_idx" ON public.audit_logs USING btree ("organizationId", action);


--
-- Name: audit_logs_organizationId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON public.audit_logs USING btree ("organizationId", "createdAt");


--
-- Name: audit_logs_organizationId_module_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_organizationId_module_idx" ON public.audit_logs USING btree ("organizationId", module);


--
-- Name: audit_logs_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_organizationId_status_idx" ON public.audit_logs USING btree ("organizationId", status);


--
-- Name: audit_logs_organizationId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "audit_logs_organizationId_userId_idx" ON public.audit_logs USING btree ("organizationId", "userId");


--
-- Name: bank_reconciliations_organizationId_accountId_statementTo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "bank_reconciliations_organizationId_accountId_statementTo_idx" ON public.bank_reconciliations USING btree ("organizationId", "accountId", "statementTo");


--
-- Name: bill_adjustments_billId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "bill_adjustments_billId_idx" ON public.bill_adjustments USING btree ("billId");


--
-- Name: billing_profiles_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "billing_profiles_organizationId_key" ON public.billing_profiles USING btree ("organizationId");


--
-- Name: boq_items_cmsWorkId_itemCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "boq_items_cmsWorkId_itemCode_key" ON public.boq_items USING btree ("cmsWorkId", "itemCode");


--
-- Name: boq_items_organizationId_cmsWorkId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "boq_items_organizationId_cmsWorkId_idx" ON public.boq_items USING btree ("organizationId", "cmsWorkId");


--
-- Name: boq_sections_cmsWorkId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "boq_sections_cmsWorkId_name_key" ON public.boq_sections USING btree ("cmsWorkId", name);


--
-- Name: challan_submission_items_organizationId_challanSubmissionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "challan_submission_items_organizationId_challanSubmissionId_idx" ON public.challan_submission_items USING btree ("organizationId", "challanSubmissionId");


--
-- Name: challan_submission_status_history_organizationId_challanSub_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "challan_submission_status_history_organizationId_challanSub_idx" ON public.challan_submission_status_history USING btree ("organizationId", "challanSubmissionId", "createdAt");


--
-- Name: challan_submissions_organizationId_challanNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "challan_submissions_organizationId_challanNo_key" ON public.challan_submissions USING btree ("organizationId", "challanNo");


--
-- Name: challan_submissions_organizationId_cmsWorkId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "challan_submissions_organizationId_cmsWorkId_status_idx" ON public.challan_submissions USING btree ("organizationId", "cmsWorkId", status);


--
-- Name: challan_submissions_organizationId_status_challanDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "challan_submissions_organizationId_status_challanDate_idx" ON public.challan_submissions USING btree ("organizationId", status, "challanDate");


--
-- Name: cheques_organizationId_chequeNo_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "cheques_organizationId_chequeNo_type_key" ON public.cheques USING btree ("organizationId", "chequeNo", type);


--
-- Name: cheques_organizationId_status_chequeDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cheques_organizationId_status_chequeDate_idx" ON public.cheques USING btree ("organizationId", status, "chequeDate");


--
-- Name: cms_works_documentPurchaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "cms_works_documentPurchaseId_key" ON public.cms_works USING btree ("documentPurchaseId");


--
-- Name: cms_works_organizationId_closedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cms_works_organizationId_closedAt_idx" ON public.cms_works USING btree ("organizationId", "closedAt");


--
-- Name: cms_works_organizationId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "cms_works_organizationId_id_key" ON public.cms_works USING btree ("organizationId", id);


--
-- Name: cms_works_organizationId_organizationMasterId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cms_works_organizationId_organizationMasterId_idx" ON public.cms_works USING btree ("organizationId", "organizationMasterId");


--
-- Name: cms_works_organizationId_status_completionDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cms_works_organizationId_status_completionDate_idx" ON public.cms_works USING btree ("organizationId", status, "completionDate");


--
-- Name: cms_works_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "cms_works_organizationId_status_idx" ON public.cms_works USING btree ("organizationId", status);


--
-- Name: cms_works_pgBgWorkflowId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "cms_works_pgBgWorkflowId_key" ON public.cms_works USING btree ("pgBgWorkflowId");


--
-- Name: company_profiles_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "company_profiles_organizationId_key" ON public.company_profiles USING btree ("organizationId");


--
-- Name: comparative_statement_suppliers_comparativeStatementId_supp_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "comparative_statement_suppliers_comparativeStatementId_supp_key" ON public.comparative_statement_suppliers USING btree ("comparativeStatementId", "supplierId");


--
-- Name: comparative_statements_organizationId_csNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "comparative_statements_organizationId_csNo_key" ON public.comparative_statements USING btree ("organizationId", "csNo");


--
-- Name: comparative_statements_rfqId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "comparative_statements_rfqId_key" ON public.comparative_statements USING btree ("rfqId");


--
-- Name: completion_certificates_one_active_final_per_work_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX completion_certificates_one_active_final_per_work_key ON public.completion_certificates USING btree ("organizationId", "workId") WHERE ((status <> 'CANCELLED'::public."CompletionCertificateStatus") AND (upper(btrim("completionType")) = 'FINAL'::text));


--
-- Name: completion_certificates_organizationId_certificateNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "completion_certificates_organizationId_certificateNo_key" ON public.completion_certificates USING btree ("organizationId", "certificateNo");


--
-- Name: completion_certificates_organizationId_source_egpStatus_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "completion_certificates_organizationId_source_egpStatus_idx" ON public.completion_certificates USING btree ("organizationId", source, "egpStatus");


--
-- Name: completion_certificates_organizationId_workId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "completion_certificates_organizationId_workId_status_idx" ON public.completion_certificates USING btree ("organizationId", "workId", status);


--
-- Name: credit_commitment_items_creditCommitmentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "credit_commitment_items_creditCommitmentId_idx" ON public.credit_commitment_items USING btree ("creditCommitmentId");


--
-- Name: credit_commitment_items_documentPurchaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "credit_commitment_items_documentPurchaseId_key" ON public.credit_commitment_items USING btree ("documentPurchaseId");


--
-- Name: credit_commitments_organizationId_paymentDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "credit_commitments_organizationId_paymentDate_idx" ON public.credit_commitments USING btree ("organizationId", "paymentDate");


--
-- Name: deduction_configs_organizationId_type_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "deduction_configs_organizationId_type_isActive_idx" ON public.deduction_configs USING btree ("organizationId", type, "isActive");


--
-- Name: defect_liability_periods_completionCertificateId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "defect_liability_periods_completionCertificateId_key" ON public.defect_liability_periods USING btree ("completionCertificateId");


--
-- Name: defect_liability_periods_organizationId_status_endDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "defect_liability_periods_organizationId_status_endDate_idx" ON public.defect_liability_periods USING btree ("organizationId", status, "endDate");


--
-- Name: defect_liability_periods_organizationId_workId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "defect_liability_periods_organizationId_workId_idx" ON public.defect_liability_periods USING btree ("organizationId", "workId");


--
-- Name: desktop_sync_devices_organizationId_userId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "desktop_sync_devices_organizationId_userId_idx" ON public.desktop_sync_devices USING btree ("organizationId", "userId");


--
-- Name: dlp_defects_organizationId_defectNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "dlp_defects_organizationId_defectNo_key" ON public.dlp_defects USING btree ("organizationId", "defectNo");


--
-- Name: dlp_defects_organizationId_priority_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dlp_defects_organizationId_priority_status_idx" ON public.dlp_defects USING btree ("organizationId", priority, status);


--
-- Name: dlp_defects_organizationId_workId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dlp_defects_organizationId_workId_status_idx" ON public.dlp_defects USING btree ("organizationId", "workId", status);


--
-- Name: dlp_extensions_dlpId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "dlp_extensions_dlpId_idx" ON public.dlp_extensions USING btree ("dlpId");


--
-- Name: document_purchase_requests_documentPurchaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_purchase_requests_documentPurchaseId_key" ON public.document_purchase_requests USING btree ("documentPurchaseId");


--
-- Name: document_purchase_requests_organizationId_costingId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_purchase_requests_organizationId_costingId_key" ON public.document_purchase_requests USING btree ("organizationId", "costingId");


--
-- Name: document_purchase_requests_organizationId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_purchase_requests_organizationId_id_key" ON public.document_purchase_requests USING btree ("organizationId", id);


--
-- Name: document_purchase_requests_organizationId_status_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_purchase_requests_organizationId_status_updatedAt_idx" ON public.document_purchase_requests USING btree ("organizationId", status, "updatedAt");


--
-- Name: document_purchase_requests_organizationId_tenderId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_purchase_requests_organizationId_tenderId_key" ON public.document_purchase_requests USING btree ("organizationId", "tenderId");


--
-- Name: document_purchases_organizationId_linkedTenderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_purchases_organizationId_linkedTenderId_idx" ON public.document_purchases USING btree ("organizationId", "linkedTenderId");


--
-- Name: document_settings_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_settings_organizationId_key" ON public.document_settings USING btree ("organizationId");


--
-- Name: document_versions_documentId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "document_versions_documentId_idx" ON public.document_versions USING btree ("documentId");


--
-- Name: document_versions_documentId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "document_versions_documentId_version_key" ON public.document_versions USING btree ("documentId", version);


--
-- Name: documents_challanSubmissionId_documentType_active_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "documents_challanSubmissionId_documentType_active_key" ON public.documents USING btree ("challanSubmissionId", "documentType") WHERE (("challanSubmissionId" IS NOT NULL) AND ("documentType" IS NOT NULL) AND (status <> 'ARCHIVED'::text));


--
-- Name: documents_challanSubmissionId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_challanSubmissionId_idx" ON public.documents USING btree ("challanSubmissionId");


--
-- Name: documents_organizationId_category_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_organizationId_category_idx" ON public.documents USING btree ("organizationId", category);


--
-- Name: documents_organizationId_expiryDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_organizationId_expiryDate_idx" ON public.documents USING btree ("organizationId", "expiryDate");


--
-- Name: documents_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_organizationId_status_idx" ON public.documents USING btree ("organizationId", status);


--
-- Name: documents_vatTaxCertificateId_documentType_active_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "documents_vatTaxCertificateId_documentType_active_key" ON public.documents USING btree ("vatTaxCertificateId", "documentType") WHERE (("vatTaxCertificateId" IS NOT NULL) AND ("documentType" IS NOT NULL) AND (status <> 'ARCHIVED'::text));


--
-- Name: documents_vatTaxCertificateId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "documents_vatTaxCertificateId_idx" ON public.documents USING btree ("vatTaxCertificateId");


--
-- Name: expense_attachments_organizationId_expenseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expense_attachments_organizationId_expenseId_idx" ON public.expense_attachments USING btree ("organizationId", "expenseId");


--
-- Name: expense_heads_organizationId_budgetCategory_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expense_heads_organizationId_budgetCategory_idx" ON public.expense_heads USING btree ("organizationId", "budgetCategory");


--
-- Name: expense_heads_organizationId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "expense_heads_organizationId_id_key" ON public.expense_heads USING btree ("organizationId", id);


--
-- Name: expense_heads_organizationId_ledgerAccountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expense_heads_organizationId_ledgerAccountId_idx" ON public.expense_heads USING btree ("organizationId", "ledgerAccountId");


--
-- Name: expense_heads_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "expense_heads_organizationId_name_key" ON public.expense_heads USING btree ("organizationId", name);


--
-- Name: expenses_organizationId_expenseHeadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_organizationId_expenseHeadId_idx" ON public.expenses USING btree ("organizationId", "expenseHeadId");


--
-- Name: expenses_organizationId_expenseLedgerAccountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_organizationId_expenseLedgerAccountId_idx" ON public.expenses USING btree ("organizationId", "expenseLedgerAccountId");


--
-- Name: expenses_organizationId_payablePartyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_organizationId_payablePartyId_idx" ON public.expenses USING btree ("organizationId", "payablePartyId");


--
-- Name: expenses_organizationId_referenceNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "expenses_organizationId_referenceNo_key" ON public.expenses USING btree ("organizationId", "referenceNo");


--
-- Name: expenses_organizationId_replacesExpenseId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_organizationId_replacesExpenseId_idx" ON public.expenses USING btree ("organizationId", "replacesExpenseId");


--
-- Name: expenses_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_organizationId_status_idx" ON public.expenses USING btree ("organizationId", status);


--
-- Name: expenses_organizationId_workId_expenseDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "expenses_organizationId_workId_expenseDate_idx" ON public.expenses USING btree ("organizationId", "workId", "expenseDate");


--
-- Name: expenses_payableId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "expenses_payableId_key" ON public.expenses USING btree ("payableId");


--
-- Name: expenses_replacesExpenseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "expenses_replacesExpenseId_key" ON public.expenses USING btree ("replacesExpenseId");


--
-- Name: finance_settings_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "finance_settings_organizationId_key" ON public.finance_settings USING btree ("organizationId");


--
-- Name: financial_transactions_organizationId_accountId_transaction_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "financial_transactions_organizationId_accountId_transaction_idx" ON public.financial_transactions USING btree ("organizationId", "accountId", "transactionDate");


--
-- Name: financial_transactions_organizationId_sourceModule_sourceTy_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "financial_transactions_organizationId_sourceModule_sourceTy_key" ON public.financial_transactions USING btree ("organizationId", "sourceModule", "sourceType", "sourceId", "accountId", direction);


--
-- Name: financial_transactions_organizationId_transactionDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "financial_transactions_organizationId_transactionDate_idx" ON public.financial_transactions USING btree ("organizationId", "transactionDate");


--
-- Name: financial_transactions_organizationId_transactionNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "financial_transactions_organizationId_transactionNo_key" ON public.financial_transactions USING btree ("organizationId", "transactionNo");


--
-- Name: fixed_asset_depreciation_entries_fixedAssetId_periodEnd_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fixed_asset_depreciation_entries_fixedAssetId_periodEnd_key" ON public.fixed_asset_depreciation_entries USING btree ("fixedAssetId", "periodEnd");


--
-- Name: fixed_asset_depreciation_entries_journalEntryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fixed_asset_depreciation_entries_journalEntryId_key" ON public.fixed_asset_depreciation_entries USING btree ("journalEntryId");


--
-- Name: fixed_asset_depreciation_entries_organizationId_periodEnd_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fixed_asset_depreciation_entries_organizationId_periodEnd_idx" ON public.fixed_asset_depreciation_entries USING btree ("organizationId", "periodEnd");


--
-- Name: fixed_assets_assetLedgerId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fixed_assets_assetLedgerId_key" ON public.fixed_assets USING btree ("assetLedgerId");


--
-- Name: fixed_assets_organizationId_assetCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fixed_assets_organizationId_assetCode_key" ON public.fixed_assets USING btree ("organizationId", "assetCode");


--
-- Name: fixed_assets_organizationId_categoryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fixed_assets_organizationId_categoryId_idx" ON public.fixed_assets USING btree ("organizationId", "categoryId");


--
-- Name: fixed_assets_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fixed_assets_organizationId_status_idx" ON public.fixed_assets USING btree ("organizationId", status);


--
-- Name: fixed_assets_organizationId_supplierId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fixed_assets_organizationId_supplierId_idx" ON public.fixed_assets USING btree ("organizationId", "supplierId");


--
-- Name: fund_transfers_organizationId_transferDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "fund_transfers_organizationId_transferDate_idx" ON public.fund_transfers USING btree ("organizationId", "transferDate");


--
-- Name: fund_transfers_organizationId_transferNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "fund_transfers_organizationId_transferNo_key" ON public.fund_transfers USING btree ("organizationId", "transferNo");


--
-- Name: general_settings_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "general_settings_organizationId_key" ON public.general_settings USING btree ("organizationId");


--
-- Name: goods_receipt_notes_organizationId_grnNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "goods_receipt_notes_organizationId_grnNo_key" ON public.goods_receipt_notes USING btree ("organizationId", "grnNo");


--
-- Name: goods_receipt_notes_organizationId_purchaseOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "goods_receipt_notes_organizationId_purchaseOrderId_idx" ON public.goods_receipt_notes USING btree ("organizationId", "purchaseOrderId");


--
-- Name: grn_items_organizationId_grnId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "grn_items_organizationId_grnId_idx" ON public.grn_items USING btree ("organizationId", "grnId");


--
-- Name: hidden_report_transactions_organizationId_hiddenAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hidden_report_transactions_organizationId_hiddenAt_idx" ON public.hidden_report_transactions USING btree ("organizationId", "hiddenAt");


--
-- Name: hidden_report_transactions_organizationId_journalEntryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hidden_report_transactions_organizationId_journalEntryId_key" ON public.hidden_report_transactions USING btree ("organizationId", "journalEntryId");


--
-- Name: hr_attendance_records_organizationId_attendanceDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_attendance_records_organizationId_attendanceDate_idx" ON public.hr_attendance_records USING btree ("organizationId", "attendanceDate");


--
-- Name: hr_attendance_records_organizationId_employeeId_attendanceD_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_attendance_records_organizationId_employeeId_attendanceD_key" ON public.hr_attendance_records USING btree ("organizationId", "employeeId", "attendanceDate");


--
-- Name: hr_business_units_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_business_units_organizationId_name_key" ON public.hr_business_units USING btree ("organizationId", name);


--
-- Name: hr_candidates_organizationId_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_candidates_organizationId_name_idx" ON public.hr_candidates USING btree ("organizationId", name);


--
-- Name: hr_cost_centers_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_cost_centers_organizationId_name_key" ON public.hr_cost_centers USING btree ("organizationId", name);


--
-- Name: hr_departments_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_departments_organizationId_name_key" ON public.hr_departments USING btree ("organizationId", name);


--
-- Name: hr_designations_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_designations_organizationId_name_key" ON public.hr_designations USING btree ("organizationId", name);


--
-- Name: hr_divisions_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_divisions_organizationId_name_key" ON public.hr_divisions USING btree ("organizationId", name);


--
-- Name: hr_employee_change_records_organizationId_employeeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_employee_change_records_organizationId_employeeId_idx" ON public.hr_employee_change_records USING btree ("organizationId", "employeeId");


--
-- Name: hr_employee_loans_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_employee_loans_organizationId_status_idx" ON public.hr_employee_loans USING btree ("organizationId", status);


--
-- Name: hr_employees_organizationId_employeeCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_employees_organizationId_employeeCode_key" ON public.hr_employees USING btree ("organizationId", "employeeCode");


--
-- Name: hr_employees_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_employees_organizationId_status_idx" ON public.hr_employees USING btree ("organizationId", status);


--
-- Name: hr_exit_processes_employeeId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_exit_processes_employeeId_key" ON public.hr_exit_processes USING btree ("employeeId");


--
-- Name: hr_exit_processes_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_exit_processes_organizationId_status_idx" ON public.hr_exit_processes USING btree ("organizationId", status);


--
-- Name: hr_expense_claims_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_expense_claims_organizationId_status_idx" ON public.hr_expense_claims USING btree ("organizationId", status);


--
-- Name: hr_grades_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_grades_organizationId_name_key" ON public.hr_grades USING btree ("organizationId", name);


--
-- Name: hr_holidays_organizationId_date_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_holidays_organizationId_date_name_key" ON public.hr_holidays USING btree ("organizationId", date, name);


--
-- Name: hr_job_applications_candidateId_jobOpeningId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_job_applications_candidateId_jobOpeningId_key" ON public.hr_job_applications USING btree ("candidateId", "jobOpeningId");


--
-- Name: hr_job_applications_organizationId_stage_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_job_applications_organizationId_stage_idx" ON public.hr_job_applications USING btree ("organizationId", stage);


--
-- Name: hr_job_openings_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_job_openings_organizationId_status_idx" ON public.hr_job_openings USING btree ("organizationId", status);


--
-- Name: hr_leave_requests_organizationId_employeeId_leaveTypeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_leave_requests_organizationId_employeeId_leaveTypeId_idx" ON public.hr_leave_requests USING btree ("organizationId", "employeeId", "leaveTypeId");


--
-- Name: hr_leave_requests_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_leave_requests_organizationId_status_idx" ON public.hr_leave_requests USING btree ("organizationId", status);


--
-- Name: hr_leave_types_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_leave_types_organizationId_name_key" ON public.hr_leave_types USING btree ("organizationId", name);


--
-- Name: hr_loan_repayments_organizationId_loanId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_loan_repayments_organizationId_loanId_idx" ON public.hr_loan_repayments USING btree ("organizationId", "loanId");


--
-- Name: hr_locations_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_locations_organizationId_name_key" ON public.hr_locations USING btree ("organizationId", name);


--
-- Name: hr_onboarding_checklists_employeeId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_onboarding_checklists_employeeId_key" ON public.hr_onboarding_checklists USING btree ("employeeId");


--
-- Name: hr_onboarding_checklists_organizationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_onboarding_checklists_organizationId_idx" ON public.hr_onboarding_checklists USING btree ("organizationId");


--
-- Name: hr_payroll_runs_organizationId_periodYear_periodMonth_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_payroll_runs_organizationId_periodYear_periodMonth_key" ON public.hr_payroll_runs USING btree ("organizationId", "periodYear", "periodMonth");


--
-- Name: hr_payroll_runs_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_payroll_runs_organizationId_status_idx" ON public.hr_payroll_runs USING btree ("organizationId", status);


--
-- Name: hr_payroll_settings_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_payroll_settings_organizationId_key" ON public.hr_payroll_settings USING btree ("organizationId");


--
-- Name: hr_payslips_organizationId_employeeId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "hr_payslips_organizationId_employeeId_idx" ON public.hr_payslips USING btree ("organizationId", "employeeId");


--
-- Name: hr_payslips_payrollRunId_employeeId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_payslips_payrollRunId_employeeId_key" ON public.hr_payslips USING btree ("payrollRunId", "employeeId");


--
-- Name: hr_shifts_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "hr_shifts_organizationId_name_key" ON public.hr_shifts USING btree ("organizationId", name);


--
-- Name: invoices_organizationId_invoiceNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "invoices_organizationId_invoiceNumber_key" ON public.invoices USING btree ("organizationId", "invoiceNumber");


--
-- Name: invoices_organizationId_issuedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "invoices_organizationId_issuedAt_idx" ON public.invoices USING btree ("organizationId", "issuedAt");


--
-- Name: items_organizationId_itemCode_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "items_organizationId_itemCode_key" ON public.items USING btree ("organizationId", "itemCode");


--
-- Name: items_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "items_organizationId_status_idx" ON public.items USING btree ("organizationId", status);


--
-- Name: journal_entries_organizationId_journalDate_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "journal_entries_organizationId_journalDate_status_idx" ON public.journal_entries USING btree ("organizationId", "journalDate", status);


--
-- Name: journal_entries_organizationId_journalNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "journal_entries_organizationId_journalNo_key" ON public.journal_entries USING btree ("organizationId", "journalNo");


--
-- Name: journal_entries_organizationId_sourceModule_sourceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "journal_entries_organizationId_sourceModule_sourceId_idx" ON public.journal_entries USING btree ("organizationId", "sourceModule", "sourceId");


--
-- Name: journal_entries_organizationId_sourceModule_sourceType_sour_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "journal_entries_organizationId_sourceModule_sourceType_sour_key" ON public.journal_entries USING btree ("organizationId", "sourceModule", "sourceType", "sourceId");


--
-- Name: journal_lines_accountId_journalEntryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "journal_lines_accountId_journalEntryId_idx" ON public.journal_lines USING btree ("accountId", "journalEntryId");


--
-- Name: journal_lines_partyName_journalEntryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "journal_lines_partyName_journalEntryId_idx" ON public.journal_lines USING btree ("partyName", "journalEntryId");


--
-- Name: journal_lines_projectId_journalEntryId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "journal_lines_projectId_journalEntryId_idx" ON public.journal_lines USING btree ("projectId", "journalEntryId");


--
-- Name: lc_cost_allocations_costEntryId_lcItemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_cost_allocations_costEntryId_lcItemId_key" ON public.lc_cost_allocations USING btree ("costEntryId", "lcItemId");


--
-- Name: lc_cost_allocations_organizationId_lcItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_cost_allocations_organizationId_lcItemId_idx" ON public.lc_cost_allocations USING btree ("organizationId", "lcItemId");


--
-- Name: lc_cost_entries_organizationId_costHeadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_cost_entries_organizationId_costHeadId_idx" ON public.lc_cost_entries USING btree ("organizationId", "costHeadId");


--
-- Name: lc_cost_entries_organizationId_lcId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_cost_entries_organizationId_lcId_idx" ON public.lc_cost_entries USING btree ("organizationId", "lcId");


--
-- Name: lc_cost_entries_payableId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_cost_entries_payableId_key" ON public.lc_cost_entries USING btree ("payableId");


--
-- Name: lc_cost_heads_organizationId_category_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_cost_heads_organizationId_category_isActive_idx" ON public.lc_cost_heads USING btree ("organizationId", category, "isActive");


--
-- Name: lc_cost_heads_organizationId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_cost_heads_organizationId_code_key" ON public.lc_cost_heads USING btree ("organizationId", code);


--
-- Name: lc_grn_items_grnId_lcItemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_grn_items_grnId_lcItemId_key" ON public.lc_grn_items USING btree ("grnId", "lcItemId");


--
-- Name: lc_grn_items_organizationId_lcItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_grn_items_organizationId_lcItemId_idx" ON public.lc_grn_items USING btree ("organizationId", "lcItemId");


--
-- Name: lc_grns_lcId_grnNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_grns_lcId_grnNumber_key" ON public.lc_grns USING btree ("lcId", "grnNumber");


--
-- Name: lc_grns_organizationId_lcId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_grns_organizationId_lcId_idx" ON public.lc_grns USING btree ("organizationId", "lcId");


--
-- Name: lc_inventory_postings_lcItemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_inventory_postings_lcItemId_key" ON public.lc_inventory_postings USING btree ("lcItemId");


--
-- Name: lc_inventory_postings_organizationId_lcId_postedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_inventory_postings_organizationId_lcId_postedAt_idx" ON public.lc_inventory_postings USING btree ("organizationId", "lcId", "postedAt");


--
-- Name: lc_inventory_postings_organizationId_warehouseId_postedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_inventory_postings_organizationId_warehouseId_postedAt_idx" ON public.lc_inventory_postings USING btree ("organizationId", "warehouseId", "postedAt");


--
-- Name: lc_inventory_postings_stockMovementId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_inventory_postings_stockMovementId_key" ON public.lc_inventory_postings USING btree ("stockMovementId");


--
-- Name: lc_items_organizationId_itemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_items_organizationId_itemId_idx" ON public.lc_items USING btree ("organizationId", "itemId");


--
-- Name: lc_items_organizationId_lcId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_items_organizationId_lcId_idx" ON public.lc_items USING btree ("organizationId", "lcId");


--
-- Name: lc_landed_cost_items_lcItemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_landed_cost_items_lcItemId_key" ON public.lc_landed_cost_items USING btree ("lcItemId");


--
-- Name: lc_landed_cost_items_organizationId_landedCostId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_landed_cost_items_organizationId_landedCostId_idx" ON public.lc_landed_cost_items USING btree ("organizationId", "landedCostId");


--
-- Name: lc_landed_costs_lcId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_landed_costs_lcId_key" ON public.lc_landed_costs USING btree ("lcId");


--
-- Name: lc_landed_costs_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_landed_costs_organizationId_status_idx" ON public.lc_landed_costs USING btree ("organizationId", status);


--
-- Name: lc_masters_organizationId_lcNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_masters_organizationId_lcNumber_key" ON public.lc_masters USING btree ("organizationId", "lcNumber");


--
-- Name: lc_masters_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_masters_organizationId_status_idx" ON public.lc_masters USING btree ("organizationId", status);


--
-- Name: lc_masters_organizationId_supplierId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_masters_organizationId_supplierId_idx" ON public.lc_masters USING btree ("organizationId", "supplierId");


--
-- Name: lc_masters_purchasePayableId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "lc_masters_purchasePayableId_key" ON public.lc_masters USING btree ("purchasePayableId");


--
-- Name: lc_shipments_organizationId_lcId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_shipments_organizationId_lcId_idx" ON public.lc_shipments USING btree ("organizationId", "lcId");


--
-- Name: lc_status_history_organizationId_lcId_changedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "lc_status_history_organizationId_lcId_changedAt_idx" ON public.lc_status_history USING btree ("organizationId", "lcId", "changedAt");


--
-- Name: ledger_accounts_organizationId_accountType_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ledger_accounts_organizationId_accountType_isActive_idx" ON public.ledger_accounts USING btree ("organizationId", "accountType", "isActive");


--
-- Name: ledger_accounts_organizationId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ledger_accounts_organizationId_code_key" ON public.ledger_accounts USING btree ("organizationId", code);


--
-- Name: ledger_accounts_organizationId_linkedBankAccountId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ledger_accounts_organizationId_linkedBankAccountId_key" ON public.ledger_accounts USING btree ("organizationId", "linkedBankAccountId");


--
-- Name: ledger_accounts_organizationId_systemKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "ledger_accounts_organizationId_systemKey_key" ON public.ledger_accounts USING btree ("organizationId", "systemKey");


--
-- Name: licenses_licenseKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "licenses_licenseKey_key" ON public.licenses USING btree ("licenseKey");


--
-- Name: master_categories_organizationId_type_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "master_categories_organizationId_type_name_key" ON public.master_categories USING btree ("organizationId", type, name);


--
-- Name: monthly_targets_organizationId_year_month_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "monthly_targets_organizationId_year_month_key" ON public.monthly_targets USING btree ("organizationId", year, month);


--
-- Name: notifications_organizationId_userId_isRead_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "notifications_organizationId_userId_isRead_createdAt_idx" ON public.notifications USING btree ("organizationId", "userId", "isRead", "createdAt");


--
-- Name: notifications_organizationId_userId_reminderId_type_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "notifications_organizationId_userId_reminderId_type_key" ON public.notifications USING btree ("organizationId", "userId", "reminderId", type);


--
-- Name: number_sequences_organizationId_moduleKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "number_sequences_organizationId_moduleKey_key" ON public.number_sequences USING btree ("organizationId", "moduleKey");


--
-- Name: organization_contacts_organizationId_organizationMasterId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organization_contacts_organizationId_organizationMasterId_idx" ON public.organization_contacts USING btree ("organizationId", "organizationMasterId");


--
-- Name: organization_contacts_organizationId_organizationMasterId_m_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organization_contacts_organizationId_organizationMasterId_m_key" ON public.organization_contacts USING btree ("organizationId", "organizationMasterId", mobile);


--
-- Name: organization_contacts_organizationId_partyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "organization_contacts_organizationId_partyId_idx" ON public.organization_contacts USING btree ("organizationId", "partyId");


--
-- Name: organization_contacts_organizationId_partyId_mobile_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organization_contacts_organizationId_partyId_mobile_key" ON public.organization_contacts USING btree ("organizationId", "partyId", mobile);


--
-- Name: organization_masters_organizationId_shortName_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organization_masters_organizationId_shortName_key" ON public.organization_masters USING btree ("organizationId", "shortName");


--
-- Name: organization_users_organizationId_userId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "organization_users_organizationId_userId_key" ON public.organization_users USING btree ("organizationId", "userId");


--
-- Name: parties_organizationId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "parties_organizationId_code_key" ON public.parties USING btree ("organizationId", code);


--
-- Name: parties_organizationId_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "parties_organizationId_name_idx" ON public.parties USING btree ("organizationId", name);


--
-- Name: parties_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "parties_organizationId_status_idx" ON public.parties USING btree ("organizationId", status);


--
-- Name: payables_organizationId_billNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payables_organizationId_billNo_key" ON public.payables USING btree ("organizationId", "billNo");


--
-- Name: payables_organizationId_partyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payables_organizationId_partyId_idx" ON public.payables USING btree ("organizationId", "partyId");


--
-- Name: payables_organizationId_partyName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payables_organizationId_partyName_idx" ON public.payables USING btree ("organizationId", "partyName");


--
-- Name: payables_organizationId_status_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payables_organizationId_status_dueDate_idx" ON public.payables USING btree ("organizationId", status, "dueDate");


--
-- Name: payment_records_invoiceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "payment_records_invoiceId_idx" ON public.payment_records USING btree ("invoiceId");


--
-- Name: payment_terms_organizationId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payment_terms_organizationId_id_key" ON public.payment_terms USING btree ("organizationId", id);


--
-- Name: payment_terms_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "payment_terms_organizationId_name_key" ON public.payment_terms USING btree ("organizationId", name);


--
-- Name: performance_guarantees_organizationId_status_expiryDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "performance_guarantees_organizationId_status_expiryDate_idx" ON public.performance_guarantees USING btree ("organizationId", status, "expiryDate");


--
-- Name: performance_guarantees_pgBgWorkflowId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "performance_guarantees_pgBgWorkflowId_key" ON public.performance_guarantees USING btree ("pgBgWorkflowId");


--
-- Name: permissions_key_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX permissions_key_key ON public.permissions USING btree (key);


--
-- Name: pg_bg_workflows_documentPurchaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "pg_bg_workflows_documentPurchaseId_key" ON public.pg_bg_workflows USING btree ("documentPurchaseId");


--
-- Name: pg_bg_workflows_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "pg_bg_workflows_organizationId_status_idx" ON public.pg_bg_workflows USING btree ("organizationId", status);


--
-- Name: plans_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX plans_code_key ON public.plans USING btree (code);


--
-- Name: project_bill_items_billId_boqItemId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "project_bill_items_billId_boqItemId_key" ON public.project_bill_items USING btree ("billId", "boqItemId");


--
-- Name: project_bill_items_boqItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_bill_items_boqItemId_idx" ON public.project_bill_items USING btree ("boqItemId");


--
-- Name: project_bills_one_active_final_per_project; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX project_bills_one_active_final_per_project ON public.project_bills USING btree ("organizationId", "cmsWorkId") WHERE (("billType" = 'FINAL'::public."BillType") AND (status <> ALL (ARRAY['CANCELLED'::public."BillStatus", 'REJECTED'::public."BillStatus"])));


--
-- Name: project_bills_organizationId_billNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "project_bills_organizationId_billNo_key" ON public.project_bills USING btree ("organizationId", "billNo");


--
-- Name: project_bills_organizationId_cmsWorkId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_bills_organizationId_cmsWorkId_status_idx" ON public.project_bills USING btree ("organizationId", "cmsWorkId", status);


--
-- Name: project_bills_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_bills_organizationId_status_idx" ON public.project_bills USING btree ("organizationId", status);


--
-- Name: project_budget_lines_budgetId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_budget_lines_budgetId_idx" ON public.project_budget_lines USING btree ("budgetId");


--
-- Name: project_budget_lines_expenseHeadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_budget_lines_expenseHeadId_idx" ON public.project_budget_lines USING btree ("expenseHeadId");


--
-- Name: project_budgets_organizationId_cmsWorkId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_budgets_organizationId_cmsWorkId_status_idx" ON public.project_budgets USING btree ("organizationId", "cmsWorkId", status);


--
-- Name: project_budgets_organizationId_cmsWorkId_version_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "project_budgets_organizationId_cmsWorkId_version_key" ON public.project_budgets USING btree ("organizationId", "cmsWorkId", version);


--
-- Name: project_closure_events_organizationId_workId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_closure_events_organizationId_workId_createdAt_idx" ON public.project_closure_events USING btree ("organizationId", "workId", "createdAt");


--
-- Name: project_contracts_organizationId_cmsWorkId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_contracts_organizationId_cmsWorkId_idx" ON public.project_contracts USING btree ("organizationId", "cmsWorkId");


--
-- Name: project_contracts_organizationId_contractNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "project_contracts_organizationId_contractNo_key" ON public.project_contracts USING btree ("organizationId", "contractNo");


--
-- Name: project_contracts_organizationId_currentCompletionDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_contracts_organizationId_currentCompletionDate_idx" ON public.project_contracts USING btree ("organizationId", "currentCompletionDate");


--
-- Name: project_contracts_organizationId_securityDepositReleaseDueD_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_contracts_organizationId_securityDepositReleaseDueD_idx" ON public.project_contracts USING btree ("organizationId", "securityDepositReleaseDueDate");


--
-- Name: project_contracts_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_contracts_organizationId_status_idx" ON public.project_contracts USING btree ("organizationId", status);


--
-- Name: project_handovers_organizationId_handoverNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "project_handovers_organizationId_handoverNo_key" ON public.project_handovers USING btree ("organizationId", "handoverNo");


--
-- Name: project_handovers_organizationId_workId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "project_handovers_organizationId_workId_status_idx" ON public.project_handovers USING btree ("organizationId", "workId", status);


--
-- Name: purchase_order_items_organizationId_purchaseOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "purchase_order_items_organizationId_purchaseOrderId_idx" ON public.purchase_order_items USING btree ("organizationId", "purchaseOrderId");


--
-- Name: purchase_orders_organizationId_poNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "purchase_orders_organizationId_poNo_key" ON public.purchase_orders USING btree ("organizationId", "poNo");


--
-- Name: purchase_orders_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "purchase_orders_organizationId_status_idx" ON public.purchase_orders USING btree ("organizationId", status);


--
-- Name: purchase_requisition_items_organizationId_purchaseRequisiti_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "purchase_requisition_items_organizationId_purchaseRequisiti_idx" ON public.purchase_requisition_items USING btree ("organizationId", "purchaseRequisitionId");


--
-- Name: purchase_requisitions_organizationId_prNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "purchase_requisitions_organizationId_prNo_key" ON public.purchase_requisitions USING btree ("organizationId", "prNo");


--
-- Name: purchase_requisitions_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "purchase_requisitions_organizationId_status_idx" ON public.purchase_requisitions USING btree ("organizationId", status);


--
-- Name: receipt_sequences_organizationId_year_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "receipt_sequences_organizationId_year_key" ON public.receipt_sequences USING btree ("organizationId", year);


--
-- Name: receipts_organizationId_receiptDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "receipts_organizationId_receiptDate_idx" ON public.receipts USING btree ("organizationId", "receiptDate");


--
-- Name: receipts_organizationId_receiptHeadAccountId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "receipts_organizationId_receiptHeadAccountId_idx" ON public.receipts USING btree ("organizationId", "receiptHeadAccountId");


--
-- Name: receipts_organizationId_receiptNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "receipts_organizationId_receiptNo_key" ON public.receipts USING btree ("organizationId", "receiptNo");


--
-- Name: receipts_organizationId_replacesReceiptId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "receipts_organizationId_replacesReceiptId_idx" ON public.receipts USING btree ("organizationId", "replacesReceiptId");


--
-- Name: receipts_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "receipts_organizationId_status_idx" ON public.receipts USING btree ("organizationId", status);


--
-- Name: receipts_organizationId_workId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "receipts_organizationId_workId_idx" ON public.receipts USING btree ("organizationId", "workId");


--
-- Name: receipts_replacesReceiptId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "receipts_replacesReceiptId_key" ON public.receipts USING btree ("replacesReceiptId");


--
-- Name: receivables_organizationId_billNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "receivables_organizationId_billNo_key" ON public.receivables USING btree ("organizationId", "billNo");


--
-- Name: receivables_organizationId_projectId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "receivables_organizationId_projectId_idx" ON public.receivables USING btree ("organizationId", "projectId");


--
-- Name: receivables_organizationId_status_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "receivables_organizationId_status_dueDate_idx" ON public.receivables USING btree ("organizationId", status, "dueDate");


--
-- Name: receivables_projectBillId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "receivables_projectBillId_key" ON public.receivables USING btree ("projectBillId");


--
-- Name: refresh_tokens_tokenHash_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON public.refresh_tokens USING btree ("tokenHash");


--
-- Name: reminder_rule_settings_organizationId_reminderType_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "reminder_rule_settings_organizationId_reminderType_key" ON public.reminder_rule_settings USING btree ("organizationId", "reminderType");


--
-- Name: reminders_organizationId_assignedToUserId_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reminders_organizationId_assignedToUserId_dueDate_idx" ON public.reminders USING btree ("organizationId", "assignedToUserId", "dueDate");


--
-- Name: reminders_organizationId_sourceModule_sourceId_type_dueDate_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "reminders_organizationId_sourceModule_sourceId_type_dueDate_key" ON public.reminders USING btree ("organizationId", "sourceModule", "sourceId", type, "dueDate");


--
-- Name: reminders_organizationId_status_dueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "reminders_organizationId_status_dueDate_idx" ON public.reminders USING btree ("organizationId", status, "dueDate");


--
-- Name: request_for_quotations_organizationId_rfqNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "request_for_quotations_organizationId_rfqNo_key" ON public.request_for_quotations USING btree ("organizationId", "rfqNo");


--
-- Name: request_for_quotations_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "request_for_quotations_organizationId_status_idx" ON public.request_for_quotations USING btree ("organizationId", status);


--
-- Name: retention_releases_journalEntryId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "retention_releases_journalEntryId_key" ON public.retention_releases USING btree ("journalEntryId");


--
-- Name: retention_releases_organizationId_releaseNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "retention_releases_organizationId_releaseNo_key" ON public.retention_releases USING btree ("organizationId", "releaseNo");


--
-- Name: retention_releases_organizationId_workId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "retention_releases_organizationId_workId_status_idx" ON public.retention_releases USING btree ("organizationId", "workId", status);


--
-- Name: rfq_items_organizationId_rfqId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "rfq_items_organizationId_rfqId_idx" ON public.rfq_items USING btree ("organizationId", "rfqId");


--
-- Name: rfq_suppliers_rfqId_supplierId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "rfq_suppliers_rfqId_supplierId_key" ON public.rfq_suppliers USING btree ("rfqId", "supplierId");


--
-- Name: role_permissions_roleId_permissionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON public.role_permissions USING btree ("roleId", "permissionId");


--
-- Name: roles_organizationId_name_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "roles_organizationId_name_key" ON public.roles USING btree ("organizationId", name);


--
-- Name: sales_quotation_follow_ups_organizationId_nextFollowUpAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotation_follow_ups_organizationId_nextFollowUpAt_idx" ON public.sales_quotation_follow_ups USING btree ("organizationId", "nextFollowUpAt");


--
-- Name: sales_quotation_follow_ups_organizationId_quotationId_follo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotation_follow_ups_organizationId_quotationId_follo_idx" ON public.sales_quotation_follow_ups USING btree ("organizationId", "quotationId", "followedUpAt");


--
-- Name: sales_quotation_items_organizationId_quotationId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotation_items_organizationId_quotationId_sortOrder_idx" ON public.sales_quotation_items USING btree ("organizationId", "quotationId", "sortOrder");


--
-- Name: sales_quotation_overheads_organizationId_quotationId_sortOr_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotation_overheads_organizationId_quotationId_sortOr_idx" ON public.sales_quotation_overheads USING btree ("organizationId", "quotationId", "sortOrder");


--
-- Name: sales_quotation_status_history_organizationId_quotationId_c_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotation_status_history_organizationId_quotationId_c_idx" ON public.sales_quotation_status_history USING btree ("organizationId", "quotationId", "changedAt");


--
-- Name: sales_quotations_organizationId_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotations_organizationId_customerId_idx" ON public.sales_quotations USING btree ("organizationId", "customerId");


--
-- Name: sales_quotations_organizationId_quotationNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "sales_quotations_organizationId_quotationNo_key" ON public.sales_quotations USING btree ("organizationId", "quotationNo");


--
-- Name: sales_quotations_organizationId_salesPersonId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotations_organizationId_salesPersonId_idx" ON public.sales_quotations USING btree ("organizationId", "salesPersonId");


--
-- Name: sales_quotations_organizationId_status_quotationDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotations_organizationId_status_quotationDate_idx" ON public.sales_quotations USING btree ("organizationId", status, "quotationDate");


--
-- Name: sales_quotations_organizationId_workName_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "sales_quotations_organizationId_workName_idx" ON public.sales_quotations USING btree ("organizationId", "workName");


--
-- Name: security_settings_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "security_settings_organizationId_key" ON public.security_settings USING btree ("organizationId");


--
-- Name: stock_movements_organizationId_itemId_warehouseId_occurredA_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "stock_movements_organizationId_itemId_warehouseId_occurredA_idx" ON public.stock_movements USING btree ("organizationId", "itemId", "warehouseId", "occurredAt");


--
-- Name: stock_movements_organizationId_sourceModule_sourceType_sour_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "stock_movements_organizationId_sourceModule_sourceType_sour_key" ON public.stock_movements USING btree ("organizationId", "sourceModule", "sourceType", "sourceId", "itemId", "warehouseId");


--
-- Name: subcontractor_profiles_partyId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "subcontractor_profiles_partyId_key" ON public.subcontractor_profiles USING btree ("partyId");


--
-- Name: subscriptions_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "subscriptions_organizationId_key" ON public.subscriptions USING btree ("organizationId");


--
-- Name: supplier_bill_deductions_organizationId_supplierBillId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_bill_deductions_organizationId_supplierBillId_idx" ON public.supplier_bill_deductions USING btree ("organizationId", "supplierBillId");


--
-- Name: supplier_bill_items_organizationId_purchaseOrderItemId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_bill_items_organizationId_purchaseOrderItemId_idx" ON public.supplier_bill_items USING btree ("organizationId", "purchaseOrderItemId");


--
-- Name: supplier_bill_items_organizationId_supplierBillId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_bill_items_organizationId_supplierBillId_idx" ON public.supplier_bill_items USING btree ("organizationId", "supplierBillId");


--
-- Name: supplier_bills_organizationId_billNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "supplier_bills_organizationId_billNo_key" ON public.supplier_bills USING btree ("organizationId", "billNo");


--
-- Name: supplier_bills_organizationId_purchaseOrderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_bills_organizationId_purchaseOrderId_idx" ON public.supplier_bills USING btree ("organizationId", "purchaseOrderId");


--
-- Name: supplier_bills_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_bills_organizationId_status_idx" ON public.supplier_bills USING btree ("organizationId", status);


--
-- Name: supplier_bills_organizationId_supplierId_supplierInvoiceNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "supplier_bills_organizationId_supplierId_supplierInvoiceNo_key" ON public.supplier_bills USING btree ("organizationId", "supplierId", "supplierInvoiceNo");


--
-- Name: supplier_bills_payableId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "supplier_bills_payableId_key" ON public.supplier_bills USING btree ("payableId");


--
-- Name: supplier_payments_organizationId_payableId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_payments_organizationId_payableId_idx" ON public.supplier_payments USING btree ("organizationId", "payableId");


--
-- Name: supplier_payments_organizationId_supplierId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_payments_organizationId_supplierId_idx" ON public.supplier_payments USING btree ("organizationId", "supplierId");


--
-- Name: supplier_quotation_items_organizationId_quotationId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_quotation_items_organizationId_quotationId_idx" ON public.supplier_quotation_items USING btree ("organizationId", "quotationId");


--
-- Name: supplier_quotations_organizationId_rfqId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "supplier_quotations_organizationId_rfqId_status_idx" ON public.supplier_quotations USING btree ("organizationId", "rfqId", status);


--
-- Name: supplier_quotations_previousRevisionId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "supplier_quotations_previousRevisionId_key" ON public.supplier_quotations USING btree ("previousRevisionId");


--
-- Name: supplier_quotations_rfqId_supplierId_quotationRef_revisionN_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "supplier_quotations_rfqId_supplierId_quotationRef_revisionN_key" ON public.supplier_quotations USING btree ("rfqId", "supplierId", "quotationRef", "revisionNo");


--
-- Name: support_ticket_attachments_organizationId_ticketId_messageI_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_ticket_attachments_organizationId_ticketId_messageI_idx" ON public.support_ticket_attachments USING btree ("organizationId", "ticketId", "messageId");


--
-- Name: support_ticket_messages_organizationId_ticketId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_ticket_messages_organizationId_ticketId_createdAt_idx" ON public.support_ticket_messages USING btree ("organizationId", "ticketId", "createdAt");


--
-- Name: support_tickets_number_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX support_tickets_number_key ON public.support_tickets USING btree (number);


--
-- Name: support_tickets_organizationId_createdById_lastActivityAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_tickets_organizationId_createdById_lastActivityAt_idx" ON public.support_tickets USING btree ("organizationId", "createdById", "lastActivityAt");


--
-- Name: support_tickets_status_lastActivityAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "support_tickets_status_lastActivityAt_idx" ON public.support_tickets USING btree (status, "lastActivityAt");


--
-- Name: system_settings_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "system_settings_organizationId_key" ON public.system_settings USING btree ("organizationId");


--
-- Name: tender_bank_settings_organizationId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "tender_bank_settings_organizationId_key" ON public.tender_bank_settings USING btree ("organizationId");


--
-- Name: tender_costing_items_organizationId_costingId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tender_costing_items_organizationId_costingId_sortOrder_idx" ON public.tender_costing_items USING btree ("organizationId", "costingId", "sortOrder");


--
-- Name: tender_costings_organizationId_assignedToUserId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tender_costings_organizationId_assignedToUserId_idx" ON public.tender_costings USING btree ("organizationId", "assignedToUserId");


--
-- Name: tender_costings_organizationId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "tender_costings_organizationId_id_key" ON public.tender_costings USING btree ("organizationId", id);


--
-- Name: tender_costings_organizationId_status_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tender_costings_organizationId_status_updatedAt_idx" ON public.tender_costings USING btree ("organizationId", status, "updatedAt");


--
-- Name: tender_costings_organizationId_tenderId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "tender_costings_organizationId_tenderId_key" ON public.tender_costings USING btree ("organizationId", "tenderId");


--
-- Name: tender_securities_organizationId_status_expiryDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tender_securities_organizationId_status_expiryDate_idx" ON public.tender_securities USING btree ("organizationId", status, "expiryDate");


--
-- Name: tender_security_items_documentPurchaseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "tender_security_items_documentPurchaseId_key" ON public.tender_security_items USING btree ("documentPurchaseId");


--
-- Name: tender_vat_tax_entries_active_reference_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tender_vat_tax_entries_active_reference_key ON public.tender_vat_tax_entries USING btree ("organizationId", "tenderId", "taxType", "referenceKey") WHERE ("voidedAt" IS NULL);


--
-- Name: tender_vat_tax_entries_organizationId_entryDate_voidedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tender_vat_tax_entries_organizationId_entryDate_voidedAt_idx" ON public.tender_vat_tax_entries USING btree ("organizationId", "entryDate", "voidedAt");


--
-- Name: tender_vat_tax_entries_organizationId_requestId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "tender_vat_tax_entries_organizationId_requestId_key" ON public.tender_vat_tax_entries USING btree ("organizationId", "requestId");


--
-- Name: tender_vat_tax_entries_organizationId_tenderId_entryDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tender_vat_tax_entries_organizationId_tenderId_entryDate_idx" ON public.tender_vat_tax_entries USING btree ("organizationId", "tenderId", "entryDate");


--
-- Name: tenders_organizationId_costingApprovalStatus_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tenders_organizationId_costingApprovalStatus_updatedAt_idx" ON public.tenders USING btree ("organizationId", "costingApprovalStatus", "updatedAt");


--
-- Name: tenders_organizationId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "tenders_organizationId_id_key" ON public.tenders USING btree ("organizationId", id);


--
-- Name: tenders_organizationId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tenders_organizationId_status_idx" ON public.tenders USING btree ("organizationId", status);


--
-- Name: tenders_organizationId_submissionDeadline_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "tenders_organizationId_submissionDeadline_idx" ON public.tenders USING btree ("organizationId", "submissionDeadline");


--
-- Name: tenders_organizationId_tenderIdNormalized_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "tenders_organizationId_tenderIdNormalized_key" ON public.tenders USING btree ("organizationId", "tenderIdNormalized");


--
-- Name: time_extensions_organizationId_cmsWorkId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "time_extensions_organizationId_cmsWorkId_status_idx" ON public.time_extensions USING btree ("organizationId", "cmsWorkId", status);


--
-- Name: time_extensions_organizationId_eotNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "time_extensions_organizationId_eotNo_key" ON public.time_extensions USING btree ("organizationId", "eotNo");


--
-- Name: units_of_measurement_organizationId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "units_of_measurement_organizationId_code_key" ON public.units_of_measurement USING btree ("organizationId", code);


--
-- Name: users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_email_key ON public.users USING btree (email);


--
-- Name: variation_orders_organizationId_cmsWorkId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "variation_orders_organizationId_cmsWorkId_status_idx" ON public.variation_orders USING btree ("organizationId", "cmsWorkId", status);


--
-- Name: variation_orders_organizationId_variationNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "variation_orders_organizationId_variationNo_key" ON public.variation_orders USING btree ("organizationId", "variationNo");


--
-- Name: vat_tax_cert_org_type_no_ci_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vat_tax_cert_org_type_no_ci_key ON public.vat_tax_certificates USING btree ("organizationId", "certificateType", lower(btrim("certificateNo"))) WHERE ("certificateNo" IS NOT NULL);


--
-- Name: vat_tax_cert_org_type_no_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vat_tax_cert_org_type_no_idx ON public.vat_tax_certificates USING btree ("organizationId", "certificateType", "certificateNo");


--
-- Name: vat_tax_certificates_organizationId_applicationDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vat_tax_certificates_organizationId_applicationDate_idx" ON public.vat_tax_certificates USING btree ("organizationId", "applicationDate");


--
-- Name: vat_tax_certificates_organizationId_certificateType_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vat_tax_certificates_organizationId_certificateType_status_idx" ON public.vat_tax_certificates USING btree ("organizationId", "certificateType", status);


--
-- Name: vat_tax_certificates_organizationId_cmsWorkId_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vat_tax_certificates_organizationId_cmsWorkId_status_idx" ON public.vat_tax_certificates USING btree ("organizationId", "cmsWorkId", status);


--
-- Name: vat_tax_certificates_organizationId_contractId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vat_tax_certificates_organizationId_contractId_idx" ON public.vat_tax_certificates USING btree ("organizationId", "contractId");


--
-- Name: vat_tax_certificates_organizationId_issueDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vat_tax_certificates_organizationId_issueDate_idx" ON public.vat_tax_certificates USING btree ("organizationId", "issueDate");


--
-- Name: vat_tax_certificates_organizationId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vat_tax_certificates_organizationId_updatedAt_idx" ON public.vat_tax_certificates USING btree ("organizationId", "updatedAt");


--
-- Name: vendor_admin_users_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vendor_admin_users_email_key ON public.vendor_admin_users USING btree (email);


--
-- Name: vendor_customers_email_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vendor_customers_email_key ON public.vendor_customers USING btree (email);


--
-- Name: vendor_device_activations_lastSeenAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_device_activations_lastSeenAt_idx" ON public.vendor_device_activations USING btree ("lastSeenAt");


--
-- Name: vendor_device_activations_licenseKeyId_deviceId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vendor_device_activations_licenseKeyId_deviceId_key" ON public.vendor_device_activations USING btree ("licenseKeyId", "deviceId");


--
-- Name: vendor_download_events_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_download_events_createdAt_idx" ON public.vendor_download_events USING btree ("createdAt");


--
-- Name: vendor_license_events_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_license_events_createdAt_idx" ON public.vendor_license_events USING btree ("createdAt");


--
-- Name: vendor_license_events_licenseKeyId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_license_events_licenseKeyId_idx" ON public.vendor_license_events USING btree ("licenseKeyId");


--
-- Name: vendor_license_keys_convertedToLicenseId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vendor_license_keys_convertedToLicenseId_key" ON public.vendor_license_keys USING btree ("convertedToLicenseId");


--
-- Name: vendor_license_keys_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_license_keys_customerId_idx" ON public.vendor_license_keys USING btree ("customerId");


--
-- Name: vendor_license_keys_expiresAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_license_keys_expiresAt_idx" ON public.vendor_license_keys USING btree ("expiresAt");


--
-- Name: vendor_license_keys_licenseKey_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vendor_license_keys_licenseKey_key" ON public.vendor_license_keys USING btree ("licenseKey");


--
-- Name: vendor_license_keys_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendor_license_keys_status_idx ON public.vendor_license_keys USING btree (status);


--
-- Name: vendor_license_keys_trialDeviceId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_license_keys_trialDeviceId_idx" ON public.vendor_license_keys USING btree ("trialDeviceId");


--
-- Name: vendor_license_packages_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vendor_license_packages_code_key ON public.vendor_license_packages USING btree (code);


--
-- Name: vendor_subscriptions_currentPeriodEnd_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_subscriptions_currentPeriodEnd_idx" ON public.vendor_subscriptions USING btree ("currentPeriodEnd");


--
-- Name: vendor_subscriptions_customerId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "vendor_subscriptions_customerId_idx" ON public.vendor_subscriptions USING btree ("customerId");


--
-- Name: vendor_subscriptions_licenseKeyId_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "vendor_subscriptions_licenseKeyId_key" ON public.vendor_subscriptions USING btree ("licenseKeyId");


--
-- Name: vendor_subscriptions_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX vendor_subscriptions_status_idx ON public.vendor_subscriptions USING btree (status);


--
-- Name: warehouses_organizationId_code_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "warehouses_organizationId_code_key" ON public.warehouses USING btree ("organizationId", code);


--
-- Name: warehouses_organizationId_isActive_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "warehouses_organizationId_isActive_idx" ON public.warehouses USING btree ("organizationId", "isActive");


--
-- Name: work_iou_attachments_organizationId_workIouId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "work_iou_attachments_organizationId_workIouId_idx" ON public.work_iou_attachments USING btree ("organizationId", "workIouId");


--
-- Name: work_iou_items_organizationId_expenseHeadId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "work_iou_items_organizationId_expenseHeadId_idx" ON public.work_iou_items USING btree ("organizationId", "expenseHeadId");


--
-- Name: work_iou_items_organizationId_workIouId_sortOrder_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "work_iou_items_organizationId_workIouId_sortOrder_idx" ON public.work_iou_items USING btree ("organizationId", "workIouId", "sortOrder");


--
-- Name: work_ious_org_settlement_expected_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX work_ious_org_settlement_expected_idx ON public.work_ious USING btree ("organizationId", "settlementStatus", "expectedSettlementDate");


--
-- Name: work_ious_organizationId_expenseFor_tenderId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "work_ious_organizationId_expenseFor_tenderId_idx" ON public.work_ious USING btree ("organizationId", "expenseFor", "tenderId");


--
-- Name: work_ious_organizationId_expenseFor_workId_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "work_ious_organizationId_expenseFor_workId_idx" ON public.work_ious USING btree ("organizationId", "expenseFor", "workId");


--
-- Name: work_ious_organizationId_id_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "work_ious_organizationId_id_key" ON public.work_ious USING btree ("organizationId", id);


--
-- Name: work_ious_organizationId_iouNo_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "work_ious_organizationId_iouNo_key" ON public.work_ious USING btree ("organizationId", "iouNo");


--
-- Name: work_ious_organizationId_paidById_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "work_ious_organizationId_paidById_idx" ON public.work_ious USING btree ("organizationId", "paidById");


--
-- Name: work_ious_organizationId_status_iouDate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "work_ious_organizationId_status_iouDate_idx" ON public.work_ious USING btree ("organizationId", status, "iouDate");


--
-- Name: accounting_periods accounting_periods_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT "accounting_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: app_settings app_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT "app_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: approval_rules approval_rules_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_rules
    ADD CONSTRAINT "approval_rules_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_categories asset_categories_accumulatedDepreciationLedgerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT "asset_categories_accumulatedDepreciationLedgerId_fkey" FOREIGN KEY ("accumulatedDepreciationLedgerId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: asset_categories asset_categories_assetLedgerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT "asset_categories_assetLedgerId_fkey" FOREIGN KEY ("assetLedgerId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: asset_categories asset_categories_depreciationExpenseLedgerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT "asset_categories_depreciationExpenseLedgerId_fkey" FOREIGN KEY ("depreciationExpenseLedgerId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: asset_categories asset_categories_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT "asset_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: asset_categories asset_categories_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_categories
    ADD CONSTRAINT "asset_categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.asset_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: audit_logs audit_logs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: bank_accounts bank_accounts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT "bank_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bank_reconciliations bank_reconciliations_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT "bank_reconciliations_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: bank_reconciliations bank_reconciliations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT "bank_reconciliations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bill_adjustments bill_adjustments_billId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_adjustments
    ADD CONSTRAINT "bill_adjustments_billId_fkey" FOREIGN KEY ("billId") REFERENCES public.project_bills(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: bill_adjustments bill_adjustments_ledgerAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bill_adjustments
    ADD CONSTRAINT "bill_adjustments_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: billing_profiles billing_profiles_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.billing_profiles
    ADD CONSTRAINT "billing_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: boq_items boq_items_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_items
    ADD CONSTRAINT "boq_items_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: boq_items boq_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_items
    ADD CONSTRAINT "boq_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: boq_items boq_items_sectionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_items
    ADD CONSTRAINT "boq_items_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES public.boq_sections(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: boq_sections boq_sections_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_sections
    ADD CONSTRAINT "boq_sections_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: boq_sections boq_sections_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.boq_sections
    ADD CONSTRAINT "boq_sections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: challan_submission_items challan_submission_items_challanSubmissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submission_items
    ADD CONSTRAINT "challan_submission_items_challanSubmissionId_fkey" FOREIGN KEY ("challanSubmissionId") REFERENCES public.challan_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: challan_submission_items challan_submission_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submission_items
    ADD CONSTRAINT "challan_submission_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: challan_submission_status_history challan_submission_status_history_challanSubmissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submission_status_history
    ADD CONSTRAINT "challan_submission_status_history_challanSubmissionId_fkey" FOREIGN KEY ("challanSubmissionId") REFERENCES public.challan_submissions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: challan_submission_status_history challan_submission_status_history_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submission_status_history
    ADD CONSTRAINT "challan_submission_status_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: challan_submissions challan_submissions_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submissions
    ADD CONSTRAINT "challan_submissions_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: challan_submissions challan_submissions_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submissions
    ADD CONSTRAINT "challan_submissions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: challan_submissions challan_submissions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.challan_submissions
    ADD CONSTRAINT "challan_submissions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cheques cheques_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT "cheques_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cheques cheques_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cheques
    ADD CONSTRAINT "cheques_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cms_works cms_works_documentPurchaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_works
    ADD CONSTRAINT "cms_works_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES public.document_purchases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cms_works cms_works_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_works
    ADD CONSTRAINT "cms_works_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: cms_works cms_works_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_works
    ADD CONSTRAINT "cms_works_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: cms_works cms_works_pgBgWorkflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_works
    ADD CONSTRAINT "cms_works_pgBgWorkflowId_fkey" FOREIGN KEY ("pgBgWorkflowId") REFERENCES public.pg_bg_workflows(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: cms_works cms_works_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cms_works
    ADD CONSTRAINT "cms_works_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES public.tenders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: company_profiles company_profiles_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_profiles
    ADD CONSTRAINT "company_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comparative_statement_suppliers comparative_statement_suppliers_comparativeStatementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statement_suppliers
    ADD CONSTRAINT "comparative_statement_suppliers_comparativeStatementId_fkey" FOREIGN KEY ("comparativeStatementId") REFERENCES public.comparative_statements(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comparative_statement_suppliers comparative_statement_suppliers_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statement_suppliers
    ADD CONSTRAINT "comparative_statement_suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comparative_statement_suppliers comparative_statement_suppliers_quotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statement_suppliers
    ADD CONSTRAINT "comparative_statement_suppliers_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES public.supplier_quotations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comparative_statement_suppliers comparative_statement_suppliers_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statement_suppliers
    ADD CONSTRAINT "comparative_statement_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: comparative_statements comparative_statements_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statements
    ADD CONSTRAINT "comparative_statements_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: comparative_statements comparative_statements_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statements
    ADD CONSTRAINT "comparative_statements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: comparative_statements comparative_statements_rfqId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comparative_statements
    ADD CONSTRAINT "comparative_statements_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES public.request_for_quotations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: completion_certificates completion_certificates_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.completion_certificates
    ADD CONSTRAINT "completion_certificates_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: completion_certificates completion_certificates_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.completion_certificates
    ADD CONSTRAINT "completion_certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: completion_certificates completion_certificates_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.completion_certificates
    ADD CONSTRAINT "completion_certificates_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: credit_commitment_items credit_commitment_items_bankAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitment_items
    ADD CONSTRAINT "credit_commitment_items_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: credit_commitment_items credit_commitment_items_creditCommitmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitment_items
    ADD CONSTRAINT "credit_commitment_items_creditCommitmentId_fkey" FOREIGN KEY ("creditCommitmentId") REFERENCES public.credit_commitments(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: credit_commitment_items credit_commitment_items_documentPurchaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitment_items
    ADD CONSTRAINT "credit_commitment_items_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES public.document_purchases(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: credit_commitments credit_commitments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitments
    ADD CONSTRAINT "credit_commitments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: credit_commitments credit_commitments_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitments
    ADD CONSTRAINT "credit_commitments_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: credit_commitments credit_commitments_paymentFromAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitments
    ADD CONSTRAINT "credit_commitments_paymentFromAccountId_fkey" FOREIGN KEY ("paymentFromAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: credit_commitments credit_commitments_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_commitments
    ADD CONSTRAINT "credit_commitments_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES public.tenders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: deduction_configs deduction_configs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deduction_configs
    ADD CONSTRAINT "deduction_configs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: defect_liability_periods defect_liability_periods_completionCertificateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defect_liability_periods
    ADD CONSTRAINT "defect_liability_periods_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES public.completion_certificates(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: defect_liability_periods defect_liability_periods_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defect_liability_periods
    ADD CONSTRAINT "defect_liability_periods_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: defect_liability_periods defect_liability_periods_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defect_liability_periods
    ADD CONSTRAINT "defect_liability_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: defect_liability_periods defect_liability_periods_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.defect_liability_periods
    ADD CONSTRAINT "defect_liability_periods_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_master_sync_changes desktop_master_sync_changes_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_master_sync_changes
    ADD CONSTRAINT "desktop_master_sync_changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_master_sync_clocks desktop_master_sync_clocks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_master_sync_clocks
    ADD CONSTRAINT "desktop_master_sync_clocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_master_sync_versions desktop_master_sync_versions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_master_sync_versions
    ADD CONSTRAINT "desktop_master_sync_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_sync_category_versions desktop_sync_category_versions_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_category_versions
    ADD CONSTRAINT "desktop_sync_category_versions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.master_categories(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_sync_category_versions desktop_sync_category_versions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_category_versions
    ADD CONSTRAINT "desktop_sync_category_versions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_sync_changes desktop_sync_changes_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_changes
    ADD CONSTRAINT "desktop_sync_changes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_sync_clocks desktop_sync_clocks_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_clocks
    ADD CONSTRAINT "desktop_sync_clocks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_sync_devices desktop_sync_devices_membership_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_devices
    ADD CONSTRAINT desktop_sync_devices_membership_fkey FOREIGN KEY ("organizationId", "userId") REFERENCES public.organization_users("organizationId", "userId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_sync_receipts desktop_sync_receipts_deviceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_receipts
    ADD CONSTRAINT "desktop_sync_receipts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES public.desktop_sync_devices(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: desktop_sync_receipts desktop_sync_receipts_membership_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sync_receipts
    ADD CONSTRAINT desktop_sync_receipts_membership_fkey FOREIGN KEY ("organizationId", "userId") REFERENCES public.organization_users("organizationId", "userId") ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: dlp_defects dlp_defects_dlpId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dlp_defects
    ADD CONSTRAINT "dlp_defects_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES public.defect_liability_periods(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: dlp_defects dlp_defects_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dlp_defects
    ADD CONSTRAINT "dlp_defects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: dlp_defects dlp_defects_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dlp_defects
    ADD CONSTRAINT "dlp_defects_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: dlp_extensions dlp_extensions_dlpId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dlp_extensions
    ADD CONSTRAINT "dlp_extensions_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES public.defect_liability_periods(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_purchase_requests document_purchase_requests_approvedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchase_requests
    ADD CONSTRAINT "document_purchase_requests_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_purchase_requests document_purchase_requests_documentPurchaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchase_requests
    ADD CONSTRAINT "document_purchase_requests_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES public.document_purchases(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: document_purchase_requests document_purchase_requests_organizationId_costingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchase_requests
    ADD CONSTRAINT "document_purchase_requests_organizationId_costingId_fkey" FOREIGN KEY ("organizationId", "costingId") REFERENCES public.tender_costings("organizationId", id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: document_purchase_requests document_purchase_requests_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchase_requests
    ADD CONSTRAINT "document_purchase_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_purchase_requests document_purchase_requests_organizationId_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchase_requests
    ADD CONSTRAINT "document_purchase_requests_organizationId_tenderId_fkey" FOREIGN KEY ("organizationId", "tenderId") REFERENCES public.tenders("organizationId", id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: document_purchase_requests document_purchase_requests_rejectedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchase_requests
    ADD CONSTRAINT "document_purchase_requests_rejectedById_fkey" FOREIGN KEY ("rejectedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_purchase_requests document_purchase_requests_requestedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchase_requests
    ADD CONSTRAINT "document_purchase_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_purchases document_purchases_linkedTenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchases
    ADD CONSTRAINT "document_purchases_linkedTenderId_fkey" FOREIGN KEY ("linkedTenderId") REFERENCES public.tenders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: document_purchases document_purchases_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchases
    ADD CONSTRAINT "document_purchases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_purchases document_purchases_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchases
    ADD CONSTRAINT "document_purchases_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: document_purchases document_purchases_paymentFromAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_purchases
    ADD CONSTRAINT "document_purchases_paymentFromAccountId_fkey" FOREIGN KEY ("paymentFromAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: document_settings document_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_settings
    ADD CONSTRAINT "document_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: document_versions document_versions_documentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES public.documents(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_challanSubmissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_challanSubmissionId_fkey" FOREIGN KEY ("challanSubmissionId") REFERENCES public.challan_submissions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_comparativeStatementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_comparativeStatementId_fkey" FOREIGN KEY ("comparativeStatementId") REFERENCES public.comparative_statements(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_completionCertificateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES public.completion_certificates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_defectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_defectId_fkey" FOREIGN KEY ("defectId") REFERENCES public.dlp_defects(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_dlpId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_dlpId_fkey" FOREIGN KEY ("dlpId") REFERENCES public.defect_liability_periods(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_goodsReceiptNoteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_goodsReceiptNoteId_fkey" FOREIGN KEY ("goodsReceiptNoteId") REFERENCES public.goods_receipt_notes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: documents documents_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_partyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_projectBillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_projectBillId_fkey" FOREIGN KEY ("projectBillId") REFERENCES public.project_bills(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_projectHandoverId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_projectHandoverId_fkey" FOREIGN KEY ("projectHandoverId") REFERENCES public.project_handovers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_purchaseRequisitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES public.purchase_requisitions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_retentionReleaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_retentionReleaseId_fkey" FOREIGN KEY ("retentionReleaseId") REFERENCES public.retention_releases(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_rfqId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES public.request_for_quotations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_supplierBillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES public.supplier_bills(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_supplierPaymentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_supplierPaymentId_fkey" FOREIGN KEY ("supplierPaymentId") REFERENCES public.supplier_payments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_supplierQuotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_supplierQuotationId_fkey" FOREIGN KEY ("supplierQuotationId") REFERENCES public.supplier_quotations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES public.tenders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_timeExtensionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_timeExtensionId_fkey" FOREIGN KEY ("timeExtensionId") REFERENCES public.time_extensions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_variationOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES public.variation_orders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_vatTaxCertificateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_vatTaxCertificateId_fkey" FOREIGN KEY ("vatTaxCertificateId") REFERENCES public.vat_tax_certificates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: documents documents_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT "documents_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expense_attachments expense_attachments_expenseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_attachments
    ADD CONSTRAINT "expense_attachments_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES public.expenses(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: expense_attachments expense_attachments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_attachments
    ADD CONSTRAINT "expense_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: expense_heads expense_heads_ledgerAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_heads
    ADD CONSTRAINT "expense_heads_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expense_heads expense_heads_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_heads
    ADD CONSTRAINT "expense_heads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: expenses expenses_expenseById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_expenseById_fkey" FOREIGN KEY ("expenseById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expenses expenses_expenseHeadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_expenseHeadId_fkey" FOREIGN KEY ("expenseHeadId") REFERENCES public.expense_heads(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expenses expenses_expenseLedgerAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_expenseLedgerAccountId_fkey" FOREIGN KEY ("expenseLedgerAccountId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expenses expenses_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: expenses expenses_paidFromAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_paidFromAccountId_fkey" FOREIGN KEY ("paidFromAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expenses expenses_payableId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES public.payables(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expenses expenses_payablePartyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_payablePartyId_fkey" FOREIGN KEY ("payablePartyId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expenses expenses_replacesExpenseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_replacesExpenseId_fkey" FOREIGN KEY ("replacesExpenseId") REFERENCES public.expenses(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: expenses expenses_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT "expenses_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: finance_settings finance_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_settings
    ADD CONSTRAINT "finance_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: financial_transactions financial_transactions_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT "financial_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: financial_transactions financial_transactions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_transactions
    ADD CONSTRAINT "financial_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: fixed_asset_depreciation_entries fixed_asset_depreciation_entries_fixedAssetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_asset_depreciation_entries
    ADD CONSTRAINT "fixed_asset_depreciation_entries_fixedAssetId_fkey" FOREIGN KEY ("fixedAssetId") REFERENCES public.fixed_assets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: fixed_asset_depreciation_entries fixed_asset_depreciation_entries_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_asset_depreciation_entries
    ADD CONSTRAINT "fixed_asset_depreciation_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: fixed_assets fixed_assets_assetLedgerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT "fixed_assets_assetLedgerId_fkey" FOREIGN KEY ("assetLedgerId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fixed_assets fixed_assets_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT "fixed_assets_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.asset_categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: fixed_assets fixed_assets_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT "fixed_assets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: fixed_assets fixed_assets_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fixed_assets
    ADD CONSTRAINT "fixed_assets_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: fund_transfers fund_transfers_fromAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_transfers
    ADD CONSTRAINT "fund_transfers_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: fund_transfers fund_transfers_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_transfers
    ADD CONSTRAINT "fund_transfers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: fund_transfers fund_transfers_toAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fund_transfers
    ADD CONSTRAINT "fund_transfers_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: general_settings general_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.general_settings
    ADD CONSTRAINT "general_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: goods_receipt_notes goods_receipt_notes_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT "goods_receipt_notes_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: goods_receipt_notes goods_receipt_notes_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT "goods_receipt_notes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: goods_receipt_notes goods_receipt_notes_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT "goods_receipt_notes_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: goods_receipt_notes goods_receipt_notes_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_notes
    ADD CONSTRAINT "goods_receipt_notes_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: grn_items grn_items_grnId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT "grn_items_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES public.goods_receipt_notes(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: grn_items grn_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT "grn_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: grn_items grn_items_purchaseOrderItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grn_items
    ADD CONSTRAINT "grn_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES public.purchase_order_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: hidden_report_transactions hidden_report_transactions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_report_transactions
    ADD CONSTRAINT "hidden_report_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_attendance_records hr_attendance_records_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_records
    ADD CONSTRAINT "hr_attendance_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_attendance_records hr_attendance_records_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_attendance_records
    ADD CONSTRAINT "hr_attendance_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_business_units hr_business_units_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_business_units
    ADD CONSTRAINT "hr_business_units_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_candidates hr_candidates_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_candidates
    ADD CONSTRAINT "hr_candidates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_cost_centers hr_cost_centers_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_cost_centers
    ADD CONSTRAINT "hr_cost_centers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_departments hr_departments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_departments
    ADD CONSTRAINT "hr_departments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_designations hr_designations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_designations
    ADD CONSTRAINT "hr_designations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_divisions hr_divisions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_divisions
    ADD CONSTRAINT "hr_divisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_employee_change_records hr_employee_change_records_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_change_records
    ADD CONSTRAINT "hr_employee_change_records_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_employee_change_records hr_employee_change_records_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_change_records
    ADD CONSTRAINT "hr_employee_change_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_employee_loans hr_employee_loans_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT "hr_employee_loans_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_employee_loans hr_employee_loans_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employee_loans
    ADD CONSTRAINT "hr_employee_loans_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_employees hr_employees_businessUnitId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES public.hr_business_units(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_employees hr_employees_costCenterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES public.hr_cost_centers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_employees hr_employees_departmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES public.hr_departments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_employees hr_employees_designationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES public.hr_designations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_employees hr_employees_divisionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES public.hr_divisions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_employees hr_employees_gradeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_gradeId_fkey" FOREIGN KEY ("gradeId") REFERENCES public.hr_grades(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_employees hr_employees_locationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES public.hr_locations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_employees hr_employees_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_employees hr_employees_reportingManagerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_employees
    ADD CONSTRAINT "hr_employees_reportingManagerId_fkey" FOREIGN KEY ("reportingManagerId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_exit_processes hr_exit_processes_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_processes
    ADD CONSTRAINT "hr_exit_processes_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_exit_processes hr_exit_processes_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_exit_processes
    ADD CONSTRAINT "hr_exit_processes_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_expense_claims hr_expense_claims_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_expense_claims
    ADD CONSTRAINT "hr_expense_claims_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_expense_claims hr_expense_claims_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_expense_claims
    ADD CONSTRAINT "hr_expense_claims_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_grades hr_grades_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_grades
    ADD CONSTRAINT "hr_grades_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_holidays hr_holidays_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_holidays
    ADD CONSTRAINT "hr_holidays_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_job_applications hr_job_applications_candidateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_job_applications
    ADD CONSTRAINT "hr_job_applications_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES public.hr_candidates(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_job_applications hr_job_applications_jobOpeningId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_job_applications
    ADD CONSTRAINT "hr_job_applications_jobOpeningId_fkey" FOREIGN KEY ("jobOpeningId") REFERENCES public.hr_job_openings(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_job_applications hr_job_applications_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_job_applications
    ADD CONSTRAINT "hr_job_applications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_job_openings hr_job_openings_departmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_job_openings
    ADD CONSTRAINT "hr_job_openings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES public.hr_departments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_job_openings hr_job_openings_designationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_job_openings
    ADD CONSTRAINT "hr_job_openings_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES public.hr_designations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: hr_job_openings hr_job_openings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_job_openings
    ADD CONSTRAINT "hr_job_openings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_leave_requests hr_leave_requests_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT "hr_leave_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_leave_requests hr_leave_requests_leaveTypeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT "hr_leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES public.hr_leave_types(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: hr_leave_requests hr_leave_requests_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_requests
    ADD CONSTRAINT "hr_leave_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_leave_types hr_leave_types_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_leave_types
    ADD CONSTRAINT "hr_leave_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_loan_repayments hr_loan_repayments_loanId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_loan_repayments
    ADD CONSTRAINT "hr_loan_repayments_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES public.hr_employee_loans(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_loan_repayments hr_loan_repayments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_loan_repayments
    ADD CONSTRAINT "hr_loan_repayments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_locations hr_locations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_locations
    ADD CONSTRAINT "hr_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_onboarding_checklists hr_onboarding_checklists_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_onboarding_checklists
    ADD CONSTRAINT "hr_onboarding_checklists_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_onboarding_checklists hr_onboarding_checklists_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_onboarding_checklists
    ADD CONSTRAINT "hr_onboarding_checklists_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_payroll_runs hr_payroll_runs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_runs
    ADD CONSTRAINT "hr_payroll_runs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_payroll_settings hr_payroll_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payroll_settings
    ADD CONSTRAINT "hr_payroll_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_payslips hr_payslips_employeeId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payslips
    ADD CONSTRAINT "hr_payslips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES public.hr_employees(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: hr_payslips hr_payslips_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payslips
    ADD CONSTRAINT "hr_payslips_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_payslips hr_payslips_payrollRunId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_payslips
    ADD CONSTRAINT "hr_payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES public.hr_payroll_runs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: hr_shifts hr_shifts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hr_shifts
    ADD CONSTRAINT "hr_shifts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoice_items invoice_items_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_items
    ADD CONSTRAINT "invoice_items_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoices invoices_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: invoices invoices_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: invoices invoices_subscriptionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES public.subscriptions(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: items items_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.master_categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: items items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT "items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: items items_preferredVendorId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT "items_preferredVendorId_fkey" FOREIGN KEY ("preferredVendorId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: items items_uomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.items
    ADD CONSTRAINT "items_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES public.units_of_measurement(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: journal_entries journal_entries_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT "journal_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: journal_entries journal_entries_reversalOfId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT "journal_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES public.journal_entries(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: journal_lines journal_lines_accountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: journal_lines journal_lines_journalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES public.journal_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: journal_lines journal_lines_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_lines
    ADD CONSTRAINT "journal_lines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_cost_allocations lc_cost_allocations_costEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_allocations
    ADD CONSTRAINT "lc_cost_allocations_costEntryId_fkey" FOREIGN KEY ("costEntryId") REFERENCES public.lc_cost_entries(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_cost_allocations lc_cost_allocations_lcItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_allocations
    ADD CONSTRAINT "lc_cost_allocations_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES public.lc_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_cost_allocations lc_cost_allocations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_allocations
    ADD CONSTRAINT "lc_cost_allocations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_cost_entries lc_cost_entries_costHeadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_entries
    ADD CONSTRAINT "lc_cost_entries_costHeadId_fkey" FOREIGN KEY ("costHeadId") REFERENCES public.lc_cost_heads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lc_cost_entries lc_cost_entries_lcId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_entries
    ADD CONSTRAINT "lc_cost_entries_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES public.lc_masters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_cost_entries lc_cost_entries_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_entries
    ADD CONSTRAINT "lc_cost_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_cost_entries lc_cost_entries_payableId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_entries
    ADD CONSTRAINT "lc_cost_entries_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES public.payables(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_cost_entries lc_cost_entries_shipmentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_entries
    ADD CONSTRAINT "lc_cost_entries_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES public.lc_shipments(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_cost_heads lc_cost_heads_glAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_heads
    ADD CONSTRAINT "lc_cost_heads_glAccountId_fkey" FOREIGN KEY ("glAccountId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_cost_heads lc_cost_heads_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_cost_heads
    ADD CONSTRAINT "lc_cost_heads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_grn_items lc_grn_items_grnId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_grn_items
    ADD CONSTRAINT "lc_grn_items_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES public.lc_grns(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_grn_items lc_grn_items_lcItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_grn_items
    ADD CONSTRAINT "lc_grn_items_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES public.lc_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_grn_items lc_grn_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_grn_items
    ADD CONSTRAINT "lc_grn_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_grns lc_grns_lcId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_grns
    ADD CONSTRAINT "lc_grns_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES public.lc_masters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_grns lc_grns_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_grns
    ADD CONSTRAINT "lc_grns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_grns lc_grns_warehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_grns
    ADD CONSTRAINT "lc_grns_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_inventory_postings lc_inventory_postings_lcId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_inventory_postings
    ADD CONSTRAINT "lc_inventory_postings_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES public.lc_masters(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lc_inventory_postings lc_inventory_postings_lcItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_inventory_postings
    ADD CONSTRAINT "lc_inventory_postings_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES public.lc_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lc_inventory_postings lc_inventory_postings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_inventory_postings
    ADD CONSTRAINT "lc_inventory_postings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_inventory_postings lc_inventory_postings_stockMovementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_inventory_postings
    ADD CONSTRAINT "lc_inventory_postings_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES public.stock_movements(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lc_inventory_postings lc_inventory_postings_warehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_inventory_postings
    ADD CONSTRAINT "lc_inventory_postings_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: lc_items lc_items_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_items
    ADD CONSTRAINT "lc_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_items lc_items_lcId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_items
    ADD CONSTRAINT "lc_items_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES public.lc_masters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_items lc_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_items
    ADD CONSTRAINT "lc_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_landed_cost_items lc_landed_cost_items_landedCostId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_landed_cost_items
    ADD CONSTRAINT "lc_landed_cost_items_landedCostId_fkey" FOREIGN KEY ("landedCostId") REFERENCES public.lc_landed_costs(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_landed_cost_items lc_landed_cost_items_lcItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_landed_cost_items
    ADD CONSTRAINT "lc_landed_cost_items_lcItemId_fkey" FOREIGN KEY ("lcItemId") REFERENCES public.lc_items(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_landed_cost_items lc_landed_cost_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_landed_cost_items
    ADD CONSTRAINT "lc_landed_cost_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_landed_costs lc_landed_costs_lcId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_landed_costs
    ADD CONSTRAINT "lc_landed_costs_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES public.lc_masters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_landed_costs lc_landed_costs_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_landed_costs
    ADD CONSTRAINT "lc_landed_costs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_masters lc_masters_destinationWarehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_masters
    ADD CONSTRAINT "lc_masters_destinationWarehouseId_fkey" FOREIGN KEY ("destinationWarehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_masters lc_masters_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_masters
    ADD CONSTRAINT "lc_masters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_masters lc_masters_purchasePayableId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_masters
    ADD CONSTRAINT "lc_masters_purchasePayableId_fkey" FOREIGN KEY ("purchasePayableId") REFERENCES public.payables(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_masters lc_masters_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_masters
    ADD CONSTRAINT "lc_masters_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: lc_shipments lc_shipments_lcId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_shipments
    ADD CONSTRAINT "lc_shipments_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES public.lc_masters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_shipments lc_shipments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_shipments
    ADD CONSTRAINT "lc_shipments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_status_history lc_status_history_lcId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_status_history
    ADD CONSTRAINT "lc_status_history_lcId_fkey" FOREIGN KEY ("lcId") REFERENCES public.lc_masters(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: lc_status_history lc_status_history_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lc_status_history
    ADD CONSTRAINT "lc_status_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ledger_accounts ledger_accounts_linkedBankAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_accounts
    ADD CONSTRAINT "ledger_accounts_linkedBankAccountId_fkey" FOREIGN KEY ("linkedBankAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: ledger_accounts ledger_accounts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_accounts
    ADD CONSTRAINT "ledger_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ledger_accounts ledger_accounts_parentId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_accounts
    ADD CONSTRAINT "ledger_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: licenses licenses_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.licenses
    ADD CONSTRAINT "licenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: master_categories master_categories_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_categories
    ADD CONSTRAINT "master_categories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: monthly_targets monthly_targets_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monthly_targets
    ADD CONSTRAINT "monthly_targets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: notifications notifications_reminderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES public.reminders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: notifications notifications_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: number_sequences number_sequences_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.number_sequences
    ADD CONSTRAINT "number_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_contacts organization_contacts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_contacts
    ADD CONSTRAINT "organization_contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_contacts organization_contacts_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_contacts
    ADD CONSTRAINT "organization_contacts_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: organization_contacts organization_contacts_partyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_contacts
    ADD CONSTRAINT "organization_contacts_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: organization_masters organization_masters_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_masters
    ADD CONSTRAINT "organization_masters_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_users organization_users_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT "organization_users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: organization_users organization_users_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT "organization_users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: organization_users organization_users_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_users
    ADD CONSTRAINT "organization_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: parties parties_categoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT "parties_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES public.master_categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: parties parties_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT "parties_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: parties parties_paymentTermId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parties
    ADD CONSTRAINT "parties_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES public.payment_terms(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payables payables_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payables
    ADD CONSTRAINT "payables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payables payables_partyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payables
    ADD CONSTRAINT "payables_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payables payables_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payables
    ADD CONSTRAINT "payables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: payment_records payment_records_invoiceId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_records
    ADD CONSTRAINT "payment_records_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: payment_terms payment_terms_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_terms
    ADD CONSTRAINT "payment_terms_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: performance_guarantees performance_guarantees_bankAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_guarantees
    ADD CONSTRAINT "performance_guarantees_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: performance_guarantees performance_guarantees_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_guarantees
    ADD CONSTRAINT "performance_guarantees_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: performance_guarantees performance_guarantees_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_guarantees
    ADD CONSTRAINT "performance_guarantees_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: performance_guarantees performance_guarantees_pgBgWorkflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_guarantees
    ADD CONSTRAINT "performance_guarantees_pgBgWorkflowId_fkey" FOREIGN KEY ("pgBgWorkflowId") REFERENCES public.pg_bg_workflows(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: performance_guarantees performance_guarantees_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance_guarantees
    ADD CONSTRAINT "performance_guarantees_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES public.tenders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pg_bg_workflows pg_bg_workflows_contactId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pg_bg_workflows
    ADD CONSTRAINT "pg_bg_workflows_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES public.organization_contacts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: pg_bg_workflows pg_bg_workflows_documentPurchaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pg_bg_workflows
    ADD CONSTRAINT "pg_bg_workflows_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES public.document_purchases(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: pg_bg_workflows pg_bg_workflows_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pg_bg_workflows
    ADD CONSTRAINT "pg_bg_workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: pg_bg_workflows pg_bg_workflows_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pg_bg_workflows
    ADD CONSTRAINT "pg_bg_workflows_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_bill_items project_bill_items_billId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bill_items
    ADD CONSTRAINT "project_bill_items_billId_fkey" FOREIGN KEY ("billId") REFERENCES public.project_bills(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_bill_items project_bill_items_boqItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bill_items
    ADD CONSTRAINT "project_bill_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES public.boq_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_bills project_bills_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bills
    ADD CONSTRAINT "project_bills_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_bills project_bills_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bills
    ADD CONSTRAINT "project_bills_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_bills project_bills_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_bills
    ADD CONSTRAINT "project_bills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_budget_lines project_budget_lines_budgetId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_budget_lines
    ADD CONSTRAINT "project_budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES public.project_budgets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_budget_lines project_budget_lines_expenseHeadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_budget_lines
    ADD CONSTRAINT "project_budget_lines_expenseHeadId_fkey" FOREIGN KEY ("expenseHeadId") REFERENCES public.expense_heads(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_budgets project_budgets_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_budgets
    ADD CONSTRAINT "project_budgets_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_budgets project_budgets_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_budgets
    ADD CONSTRAINT "project_budgets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_closure_events project_closure_events_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_closure_events
    ADD CONSTRAINT "project_closure_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_closure_events project_closure_events_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_closure_events
    ADD CONSTRAINT "project_closure_events_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_contracts project_contracts_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contracts
    ADD CONSTRAINT "project_contracts_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_contracts project_contracts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contracts
    ADD CONSTRAINT "project_contracts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_contracts project_contracts_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contracts
    ADD CONSTRAINT "project_contracts_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_contracts project_contracts_pgBgWorkflowId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contracts
    ADD CONSTRAINT "project_contracts_pgBgWorkflowId_fkey" FOREIGN KEY ("pgBgWorkflowId") REFERENCES public.pg_bg_workflows(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: project_contracts project_contracts_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_contracts
    ADD CONSTRAINT "project_contracts_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES public.tenders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: project_handovers project_handovers_completionCertificateId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_handovers
    ADD CONSTRAINT "project_handovers_completionCertificateId_fkey" FOREIGN KEY ("completionCertificateId") REFERENCES public.completion_certificates(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: project_handovers project_handovers_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_handovers
    ADD CONSTRAINT "project_handovers_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: project_handovers project_handovers_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_handovers
    ADD CONSTRAINT "project_handovers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: project_handovers project_handovers_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.project_handovers
    ADD CONSTRAINT "project_handovers_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_order_items purchase_order_items_boqItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "purchase_order_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES public.boq_items(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_order_items purchase_order_items_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "purchase_order_items_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_order_items purchase_order_items_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "purchase_order_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_order_items purchase_order_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "purchase_order_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: purchase_order_items purchase_order_items_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_comparativeStatementId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_comparativeStatementId_fkey" FOREIGN KEY ("comparativeStatementId") REFERENCES public.comparative_statements(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: purchase_orders purchase_orders_purchaseRequisitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES public.purchase_requisitions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_rfqId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES public.request_for_quotations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_orders purchase_orders_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_requisition_items purchase_requisition_items_boqItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisition_items
    ADD CONSTRAINT "purchase_requisition_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES public.boq_items(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_requisition_items purchase_requisition_items_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisition_items
    ADD CONSTRAINT "purchase_requisition_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: purchase_requisition_items purchase_requisition_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisition_items
    ADD CONSTRAINT "purchase_requisition_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: purchase_requisition_items purchase_requisition_items_purchaseRequisitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisition_items
    ADD CONSTRAINT "purchase_requisition_items_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES public.purchase_requisitions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: purchase_requisition_items purchase_requisition_items_uomId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisition_items
    ADD CONSTRAINT "purchase_requisition_items_uomId_fkey" FOREIGN KEY ("uomId") REFERENCES public.units_of_measurement(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_requisitions purchase_requisitions_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions
    ADD CONSTRAINT "purchase_requisitions_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: purchase_requisitions purchase_requisitions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_requisitions
    ADD CONSTRAINT "purchase_requisitions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: receipt_sequences receipt_sequences_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipt_sequences
    ADD CONSTRAINT "receipt_sequences_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: receipts receipts_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT "receipts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: receipts receipts_receiptHeadAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT "receipts_receiptHeadAccountId_fkey" FOREIGN KEY ("receiptHeadAccountId") REFERENCES public.ledger_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: receipts receipts_receivableId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT "receipts_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES public.receivables(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: receipts receipts_receivedInAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT "receipts_receivedInAccountId_fkey" FOREIGN KEY ("receivedInAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: receipts receipts_replacesReceiptId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT "receipts_replacesReceiptId_fkey" FOREIGN KEY ("replacesReceiptId") REFERENCES public.receipts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: receipts receipts_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT "receipts_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES public.tenders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: receipts receipts_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receipts
    ADD CONSTRAINT "receipts_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: receivables receivables_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivables
    ADD CONSTRAINT "receivables_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: receivables receivables_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivables
    ADD CONSTRAINT "receivables_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: receivables receivables_projectBillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivables
    ADD CONSTRAINT "receivables_projectBillId_fkey" FOREIGN KEY ("projectBillId") REFERENCES public.project_bills(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: receivables receivables_projectId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receivables
    ADD CONSTRAINT "receivables_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: refresh_tokens refresh_tokens_userId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reminder_rule_settings reminder_rule_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_rule_settings
    ADD CONSTRAINT "reminder_rule_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: reminders reminders_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminders
    ADD CONSTRAINT "reminders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: request_for_quotations request_for_quotations_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_for_quotations
    ADD CONSTRAINT "request_for_quotations_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: request_for_quotations request_for_quotations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_for_quotations
    ADD CONSTRAINT "request_for_quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: request_for_quotations request_for_quotations_purchaseRequisitionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_for_quotations
    ADD CONSTRAINT "request_for_quotations_purchaseRequisitionId_fkey" FOREIGN KEY ("purchaseRequisitionId") REFERENCES public.purchase_requisitions(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: retention_releases retention_releases_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_releases
    ADD CONSTRAINT "retention_releases_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: retention_releases retention_releases_journalEntryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_releases
    ADD CONSTRAINT "retention_releases_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES public.journal_entries(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: retention_releases retention_releases_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_releases
    ADD CONSTRAINT "retention_releases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: retention_releases retention_releases_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retention_releases
    ADD CONSTRAINT "retention_releases_workId_fkey" FOREIGN KEY ("workId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rfq_items rfq_items_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_items
    ADD CONSTRAINT "rfq_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: rfq_items rfq_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_items
    ADD CONSTRAINT "rfq_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rfq_items rfq_items_purchaseRequisitionItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_items
    ADD CONSTRAINT "rfq_items_purchaseRequisitionItemId_fkey" FOREIGN KEY ("purchaseRequisitionItemId") REFERENCES public.purchase_requisition_items(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: rfq_items rfq_items_rfqId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_items
    ADD CONSTRAINT "rfq_items_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES public.request_for_quotations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rfq_suppliers rfq_suppliers_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_suppliers
    ADD CONSTRAINT "rfq_suppliers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rfq_suppliers rfq_suppliers_rfqId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_suppliers
    ADD CONSTRAINT "rfq_suppliers_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES public.request_for_quotations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: rfq_suppliers rfq_suppliers_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rfq_suppliers
    ADD CONSTRAINT "rfq_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: role_permissions role_permissions_permissionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES public.permissions(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: role_permissions role_permissions_roleId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.role_permissions
    ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES public.roles(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: roles roles_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT "roles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotation_follow_ups sales_quotation_follow_ups_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_follow_ups
    ADD CONSTRAINT "sales_quotation_follow_ups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sales_quotation_follow_ups sales_quotation_follow_ups_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_follow_ups
    ADD CONSTRAINT "sales_quotation_follow_ups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotation_follow_ups sales_quotation_follow_ups_quotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_follow_ups
    ADD CONSTRAINT "sales_quotation_follow_ups_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES public.sales_quotations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotation_items sales_quotation_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_items
    ADD CONSTRAINT "sales_quotation_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotation_items sales_quotation_items_quotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_items
    ADD CONSTRAINT "sales_quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES public.sales_quotations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotation_overheads sales_quotation_overheads_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_overheads
    ADD CONSTRAINT "sales_quotation_overheads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotation_overheads sales_quotation_overheads_quotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_overheads
    ADD CONSTRAINT "sales_quotation_overheads_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES public.sales_quotations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotation_status_history sales_quotation_status_history_changedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_status_history
    ADD CONSTRAINT "sales_quotation_status_history_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sales_quotation_status_history sales_quotation_status_history_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_status_history
    ADD CONSTRAINT "sales_quotation_status_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotation_status_history sales_quotation_status_history_quotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotation_status_history
    ADD CONSTRAINT "sales_quotation_status_history_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES public.sales_quotations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotations sales_quotations_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotations
    ADD CONSTRAINT "sales_quotations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sales_quotations sales_quotations_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotations
    ADD CONSTRAINT "sales_quotations_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: sales_quotations sales_quotations_decisionById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotations
    ADD CONSTRAINT "sales_quotations_decisionById_fkey" FOREIGN KEY ("decisionById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sales_quotations sales_quotations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotations
    ADD CONSTRAINT "sales_quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: sales_quotations sales_quotations_salesPersonId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotations
    ADD CONSTRAINT "sales_quotations_salesPersonId_fkey" FOREIGN KEY ("salesPersonId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: sales_quotations sales_quotations_sentById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_quotations
    ADD CONSTRAINT "sales_quotations_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: security_settings security_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.security_settings
    ADD CONSTRAINT "security_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "stock_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: stock_movements stock_movements_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "stock_movements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: stock_movements stock_movements_warehouseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT "stock_movements_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES public.warehouses(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: subcontractor_profiles subcontractor_profiles_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_profiles
    ADD CONSTRAINT "subcontractor_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subcontractor_profiles subcontractor_profiles_partyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_profiles
    ADD CONSTRAINT "subcontractor_profiles_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subcontractor_profiles subcontractor_profiles_tradeCategoryId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subcontractor_profiles
    ADD CONSTRAINT "subcontractor_profiles_tradeCategoryId_fkey" FOREIGN KEY ("tradeCategoryId") REFERENCES public.master_categories(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: subscriptions subscriptions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "subscriptions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_planId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES public.plans(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supplier_bill_deductions supplier_bill_deductions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bill_deductions
    ADD CONSTRAINT "supplier_bill_deductions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_bill_deductions supplier_bill_deductions_supplierBillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bill_deductions
    ADD CONSTRAINT "supplier_bill_deductions_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES public.supplier_bills(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_bill_items supplier_bill_items_itemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bill_items
    ADD CONSTRAINT "supplier_bill_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES public.items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_bill_items supplier_bill_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bill_items
    ADD CONSTRAINT "supplier_bill_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_bill_items supplier_bill_items_purchaseOrderItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bill_items
    ADD CONSTRAINT "supplier_bill_items_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES public.purchase_order_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_bill_items supplier_bill_items_supplierBillId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bill_items
    ADD CONSTRAINT "supplier_bill_items_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES public.supplier_bills(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_bills supplier_bills_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bills
    ADD CONSTRAINT "supplier_bills_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supplier_bills supplier_bills_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bills
    ADD CONSTRAINT "supplier_bills_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_bills supplier_bills_payableId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bills
    ADD CONSTRAINT "supplier_bills_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES public.payables(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supplier_bills supplier_bills_paymentTermId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bills
    ADD CONSTRAINT "supplier_bills_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES public.payment_terms(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supplier_bills supplier_bills_purchaseOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bills
    ADD CONSTRAINT "supplier_bills_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES public.purchase_orders(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_bills supplier_bills_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_bills
    ADD CONSTRAINT "supplier_bills_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_payments supplier_payments_bankAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT "supplier_payments_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_payments supplier_payments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT "supplier_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_payments supplier_payments_payableId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT "supplier_payments_payableId_fkey" FOREIGN KEY ("payableId") REFERENCES public.payables(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_payments supplier_payments_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT "supplier_payments_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_quotation_items supplier_quotation_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotation_items
    ADD CONSTRAINT "supplier_quotation_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_quotation_items supplier_quotation_items_quotationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotation_items
    ADD CONSTRAINT "supplier_quotation_items_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES public.supplier_quotations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_quotation_items supplier_quotation_items_rfqItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotation_items
    ADD CONSTRAINT "supplier_quotation_items_rfqItemId_fkey" FOREIGN KEY ("rfqItemId") REFERENCES public.rfq_items(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_quotations supplier_quotations_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotations
    ADD CONSTRAINT "supplier_quotations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: supplier_quotations supplier_quotations_previousRevisionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotations
    ADD CONSTRAINT "supplier_quotations_previousRevisionId_fkey" FOREIGN KEY ("previousRevisionId") REFERENCES public.supplier_quotations(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: supplier_quotations supplier_quotations_rfqId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotations
    ADD CONSTRAINT "supplier_quotations_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES public.request_for_quotations(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: supplier_quotations supplier_quotations_supplierId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_quotations
    ADD CONSTRAINT "supplier_quotations_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES public.parties(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_ticket_attachments support_ticket_attachments_messageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_attachments
    ADD CONSTRAINT "support_ticket_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES public.support_ticket_messages(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_ticket_attachments support_ticket_attachments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_attachments
    ADD CONSTRAINT "support_ticket_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_ticket_attachments support_ticket_attachments_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_attachments
    ADD CONSTRAINT "support_ticket_attachments_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public.support_tickets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_ticket_messages support_ticket_messages_authorUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT "support_ticket_messages_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: support_ticket_messages support_ticket_messages_authorVendorAdminId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT "support_ticket_messages_authorVendorAdminId_fkey" FOREIGN KEY ("authorVendorAdminId") REFERENCES public.vendor_admin_users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: support_ticket_messages support_ticket_messages_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT "support_ticket_messages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_ticket_messages support_ticket_messages_ticketId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_ticket_messages
    ADD CONSTRAINT "support_ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES public.support_tickets(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: support_tickets support_tickets_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT "support_tickets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: support_tickets support_tickets_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.support_tickets
    ADD CONSTRAINT "support_tickets_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: system_settings system_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT "system_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tender_bank_settings tender_bank_settings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_bank_settings
    ADD CONSTRAINT "tender_bank_settings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tender_costing_items tender_costing_items_organizationId_costingId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costing_items
    ADD CONSTRAINT "tender_costing_items_organizationId_costingId_fkey" FOREIGN KEY ("organizationId", "costingId") REFERENCES public.tender_costings("organizationId", id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tender_costing_items tender_costing_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costing_items
    ADD CONSTRAINT "tender_costing_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tender_costings tender_costings_approvedForCostingById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costings
    ADD CONSTRAINT "tender_costings_approvedForCostingById_fkey" FOREIGN KEY ("approvedForCostingById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tender_costings tender_costings_assignedToUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costings
    ADD CONSTRAINT "tender_costings_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tender_costings tender_costings_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costings
    ADD CONSTRAINT "tender_costings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tender_costings tender_costings_organizationId_paymentTermId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costings
    ADD CONSTRAINT "tender_costings_organizationId_paymentTermId_fkey" FOREIGN KEY ("organizationId", "paymentTermId") REFERENCES public.payment_terms("organizationId", id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tender_costings tender_costings_organizationId_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costings
    ADD CONSTRAINT "tender_costings_organizationId_tenderId_fkey" FOREIGN KEY ("organizationId", "tenderId") REFERENCES public.tenders("organizationId", id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tender_costings tender_costings_preparedByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_costings
    ADD CONSTRAINT "tender_costings_preparedByUserId_fkey" FOREIGN KEY ("preparedByUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tender_securities tender_securities_bankAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_securities
    ADD CONSTRAINT "tender_securities_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tender_securities tender_securities_chargeFromAccountId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_securities
    ADD CONSTRAINT "tender_securities_chargeFromAccountId_fkey" FOREIGN KEY ("chargeFromAccountId") REFERENCES public.bank_accounts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tender_securities tender_securities_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_securities
    ADD CONSTRAINT "tender_securities_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tender_securities tender_securities_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_securities
    ADD CONSTRAINT "tender_securities_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tender_securities tender_securities_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_securities
    ADD CONSTRAINT "tender_securities_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES public.tenders(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tender_security_items tender_security_items_documentPurchaseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_security_items
    ADD CONSTRAINT "tender_security_items_documentPurchaseId_fkey" FOREIGN KEY ("documentPurchaseId") REFERENCES public.document_purchases(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tender_security_items tender_security_items_tenderSecurityId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_security_items
    ADD CONSTRAINT "tender_security_items_tenderSecurityId_fkey" FOREIGN KEY ("tenderSecurityId") REFERENCES public.tender_securities(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tender_vat_tax_entries tender_vat_tax_entries_organizationId_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tender_vat_tax_entries
    ADD CONSTRAINT "tender_vat_tax_entries_organizationId_tenderId_fkey" FOREIGN KEY ("organizationId", "tenderId") REFERENCES public.tenders("organizationId", id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: tenders tenders_costingApprovedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenders
    ADD CONSTRAINT "tenders_costingApprovedById_fkey" FOREIGN KEY ("costingApprovedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tenders tenders_costingRejectedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenders
    ADD CONSTRAINT "tenders_costingRejectedById_fkey" FOREIGN KEY ("costingRejectedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tenders tenders_costingSubmittedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenders
    ADD CONSTRAINT "tenders_costingSubmittedById_fkey" FOREIGN KEY ("costingSubmittedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tenders tenders_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenders
    ADD CONSTRAINT "tenders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;


--
-- Name: tenders tenders_foundByUserId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenders
    ADD CONSTRAINT "tenders_foundByUserId_fkey" FOREIGN KEY ("foundByUserId") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: tenders tenders_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenders
    ADD CONSTRAINT "tenders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: tenders tenders_organizationMasterId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenders
    ADD CONSTRAINT "tenders_organizationMasterId_fkey" FOREIGN KEY ("organizationMasterId") REFERENCES public.organization_masters(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: time_extensions time_extensions_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_extensions
    ADD CONSTRAINT "time_extensions_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: time_extensions time_extensions_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_extensions
    ADD CONSTRAINT "time_extensions_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: time_extensions time_extensions_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.time_extensions
    ADD CONSTRAINT "time_extensions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: units_of_measurement units_of_measurement_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units_of_measurement
    ADD CONSTRAINT "units_of_measurement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: variation_items variation_items_boqItemId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_items
    ADD CONSTRAINT "variation_items_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES public.boq_items(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: variation_items variation_items_variationOrderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_items
    ADD CONSTRAINT "variation_items_variationOrderId_fkey" FOREIGN KEY ("variationOrderId") REFERENCES public.variation_orders(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: variation_orders variation_orders_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_orders
    ADD CONSTRAINT "variation_orders_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: variation_orders variation_orders_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_orders
    ADD CONSTRAINT "variation_orders_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: variation_orders variation_orders_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.variation_orders
    ADD CONSTRAINT "variation_orders_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vat_tax_certificates vat_tax_certificates_cmsWorkId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_tax_certificates
    ADD CONSTRAINT "vat_tax_certificates_cmsWorkId_fkey" FOREIGN KEY ("cmsWorkId") REFERENCES public.cms_works(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: vat_tax_certificates vat_tax_certificates_contractId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_tax_certificates
    ADD CONSTRAINT "vat_tax_certificates_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES public.project_contracts(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: vat_tax_certificates vat_tax_certificates_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vat_tax_certificates
    ADD CONSTRAINT "vat_tax_certificates_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vendor_device_activations vendor_device_activations_licenseKeyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_device_activations
    ADD CONSTRAINT "vendor_device_activations_licenseKeyId_fkey" FOREIGN KEY ("licenseKeyId") REFERENCES public.vendor_license_keys(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vendor_download_events vendor_download_events_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_download_events
    ADD CONSTRAINT "vendor_download_events_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.vendor_customers(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: vendor_license_events vendor_license_events_licenseKeyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_license_events
    ADD CONSTRAINT "vendor_license_events_licenseKeyId_fkey" FOREIGN KEY ("licenseKeyId") REFERENCES public.vendor_license_keys(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vendor_license_keys vendor_license_keys_convertedToLicenseId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_license_keys
    ADD CONSTRAINT "vendor_license_keys_convertedToLicenseId_fkey" FOREIGN KEY ("convertedToLicenseId") REFERENCES public.vendor_license_keys(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: vendor_license_keys vendor_license_keys_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_license_keys
    ADD CONSTRAINT "vendor_license_keys_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.vendor_customers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: vendor_license_keys vendor_license_keys_packageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_license_keys
    ADD CONSTRAINT "vendor_license_keys_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES public.vendor_license_packages(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: vendor_subscriptions vendor_subscriptions_customerId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_subscriptions
    ADD CONSTRAINT "vendor_subscriptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES public.vendor_customers(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: vendor_subscriptions vendor_subscriptions_licenseKeyId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_subscriptions
    ADD CONSTRAINT "vendor_subscriptions_licenseKeyId_fkey" FOREIGN KEY ("licenseKeyId") REFERENCES public.vendor_license_keys(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: vendor_subscriptions vendor_subscriptions_packageId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vendor_subscriptions
    ADD CONSTRAINT "vendor_subscriptions_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES public.vendor_license_packages(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: warehouses warehouses_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.warehouses
    ADD CONSTRAINT "warehouses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: work_iou_attachments work_iou_attachments_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_iou_attachments
    ADD CONSTRAINT "work_iou_attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: work_iou_attachments work_iou_attachments_organizationId_workIouId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_iou_attachments
    ADD CONSTRAINT "work_iou_attachments_organizationId_workIouId_fkey" FOREIGN KEY ("organizationId", "workIouId") REFERENCES public.work_ious("organizationId", id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: work_iou_attachments work_iou_attachments_uploadedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_iou_attachments
    ADD CONSTRAINT "work_iou_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: work_iou_items work_iou_items_organizationId_expenseHeadId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_iou_items
    ADD CONSTRAINT "work_iou_items_organizationId_expenseHeadId_fkey" FOREIGN KEY ("organizationId", "expenseHeadId") REFERENCES public.expense_heads("organizationId", id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: work_iou_items work_iou_items_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_iou_items
    ADD CONSTRAINT "work_iou_items_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: work_iou_items work_iou_items_organizationId_workIouId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_iou_items
    ADD CONSTRAINT "work_iou_items_organizationId_workIouId_fkey" FOREIGN KEY ("organizationId", "workIouId") REFERENCES public.work_ious("organizationId", id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: work_ious work_ious_cancelledById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ious
    ADD CONSTRAINT "work_ious_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: work_ious work_ious_createdById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ious
    ADD CONSTRAINT "work_ious_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: work_ious work_ious_organizationId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ious
    ADD CONSTRAINT "work_ious_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES public.organizations(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: work_ious work_ious_organizationId_tenderId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ious
    ADD CONSTRAINT "work_ious_organizationId_tenderId_fkey" FOREIGN KEY ("organizationId", "tenderId") REFERENCES public.tenders("organizationId", id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: work_ious work_ious_organizationId_workId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ious
    ADD CONSTRAINT "work_ious_organizationId_workId_fkey" FOREIGN KEY ("organizationId", "workId") REFERENCES public.cms_works("organizationId", id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: work_ious work_ious_paidById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ious
    ADD CONSTRAINT "work_ious_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: work_ious work_ious_submittedById_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.work_ious
    ADD CONSTRAINT "work_ious_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES public.users(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


