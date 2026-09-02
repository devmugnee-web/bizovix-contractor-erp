import {
  Bell,
  BriefcaseBusiness,
  ClipboardCheck,
  Building2,
  ChartNoAxesColumn,
  CircleDollarSign,
  ClipboardList,
  FileBarChart2,
  FileSpreadsheet,
  Factory,
  HandCoins,
  Landmark,
  NotebookTabs,
  Settings2,
  ShieldCheck,
  Users,
  Warehouse,
} from "lucide-react";

export type ModuleSection = "masters" | "reports" | "utilities";

export interface ModuleDefinition {
  section: ModuleSection;
  slug: string;
  title: string;
  description: string;
  icon: typeof CircleDollarSign;
  columns: string[];
  actions: string[];
  rows: Array<Record<string, string>>;
  hierarchy?: Array<{
    title: string;
    groups: Array<{
      title: string;
      items: string[];
    }>;
  }>;
}

export const moduleRegistry: Record<string, ModuleDefinition> = {
  accounts: {
    section: "masters",
    slug: "accounts",
    title: "Accounts",
    description: "Ledger, group, opening balance, and account control master data.",
    icon: CircleDollarSign,
    columns: ["Account Code", "Ledger Name", "Group", "Opening Balance", "Status"],
    actions: ["Create Ledger", "Import Chart", "Export Accounts"],
    rows: [
      { "Account Code": "1101", "Ledger Name": "Cash in Hand", Group: "Cash-in-Hand", "Opening Balance": "৳ 25,450.00", Status: "Active" },
      { "Account Code": "2104", "Ledger Name": "Rahim Traders", Group: "Sundry Debtors", "Opening Balance": "৳ 0.00", Status: "Active" },
      { "Account Code": "4101", "Ledger Name": "Sales Account", Group: "Revenue", "Opening Balance": "৳ 0.00", Status: "Active" },
    ],
    hierarchy: [
      {
        title: "Create",
        groups: [
          {
            title: "Accounting Master",
            items: [
              "Group",
              "Ledger",
              "Cost Category",
              "Cost Center",
              "Cost Center Class",
              "Currency",
              "Rate of Exchange",
              "Budget",
              "Scenario",
              "Voucher Type",
              "Credit Limit",
            ],
          },
          {
            title: "Inventory Master",
            items: ["Stock Group", "Stock Category", "Stock Item", "Unit", "Godown/Location"],
          },
          {
            title: "Payroll Master",
            items: [
              "Employee Group",
              "Employee",
              "Units (Work)",
              "Attendance / Production Type",
              "Pay Head",
              "Payroll Voucher Type",
            ],
          },
          {
            title: "Statutory Master",
            items: ["VAT Classification"],
          },
          {
            title: "Statutory Details",
            items: ["VAT Registration details"],
          },
        ],
      },
      {
        title: "Alter",
        groups: [
          {
            title: "Accounting Master",
            items: [
              "Group",
              "Ledger",
              "Cost Category",
              "Cost Center",
              "Cost Center Class",
              "Currency",
              "Rate of Exchange",
              "Budget",
              "Scenario",
              "Voucher Type",
              "Credit Limit",
            ],
          },
          {
            title: "Inventory Master",
            items: ["Stock Group", "Stock Category", "Stock Item", "Unit", "Godown/Location"],
          },
          {
            title: "Payroll Master",
            items: [
              "Employee Group",
              "Employee",
              "Units (Work)",
              "Attendance / Production Type",
              "Pay Head",
              "Payroll Voucher Type",
            ],
          },
          {
            title: "Statutory Master",
            items: ["VAT Classification"],
          },
          {
            title: "Statutory Details",
            items: ["VAT Registration details"],
          },
        ],
      },
      {
        title: "Chart of Accounts",
        groups: [
          {
            title: "Accounting Master",
            items: [
              "Group",
              "Ledger",
              "Voucher Type",
              "Cost Categories",
              "Cost Centers",
              "Cost Center Class",
              "Currencies",
              "Budgets",
              "Scenarios",
            ],
          },
          {
            title: "Inventory Master",
            items: ["Stock Group", "Stock Category", "Stock Item", "Unit", "Godown/Location"],
          },
          {
            title: "Payroll Master",
            items: [
              "Employee Category",
              "Employee Groups",
              "Employees",
              "Attendance/Production Type",
              "Pay Head",
            ],
          },
        ],
      },
    ],
  },
  inventory: {
    section: "masters",
    slug: "inventory",
    title: "Inventory",
    description: "Stock item catalog, categories, godowns, units, and reorder controls.",
    icon: Warehouse,
    columns: ["Item Code", "Item Name", "Category", "Stock", "Reorder Level"],
    actions: ["Create Stock Item", "Import Stock", "Export Stock"],
    rows: [
      { "Item Code": "ITM-1001", "Item Name": "PVC Pipe 3 inch", Category: "Raw Materials", Stock: "218 pcs", "Reorder Level": "100 pcs" },
      { "Item Code": "ITM-1010", "Item Name": "Industrial Paint", Category: "Consumables", Stock: "42 drum", "Reorder Level": "25 drum" },
      { "Item Code": "ITM-1104", "Item Name": "Rental Generator", Category: "Equipment", Stock: "7 unit", "Reorder Level": "2 unit" },
    ],
  },
  manufacturing: {
    section: "masters",
    slug: "manufacturing",
    title: "Manufacturing",
    description: "Manage bills of materials, production orders, material consumption, and finished goods.",
    icon: Factory,
    columns: ["Production No.", "Finished Product", "BOM", "Quantity", "Warehouse", "Status"],
    actions: ["Create Production Order", "Create BOM", "Export Production"],
    rows: [],
  },
  parties: {
    section: "masters",
    slug: "parties",
    title: "Parties",
    description: "Customers, suppliers, contacts, credit controls, and commercial references.",
    icon: Users,
    columns: ["Party Name", "Type", "Contact", "Credit Limit", "Status"],
    actions: ["Create Customer", "Create Supplier", "Export Parties"],
    rows: [
      { "Party Name": "Rahim Traders", Type: "Customer", Contact: "01711-223344", "Credit Limit": "৳ 500,000.00", Status: "Active" },
      { "Party Name": "S. S. Corporation", Type: "Supplier", Contact: "01844-998877", "Credit Limit": "৳ 250,000.00", Status: "Active" },
      { "Party Name": "Masud Enterprise", Type: "Customer", Contact: "01911-664422", "Credit Limit": "৳ 300,000.00", Status: "Active" },
    ],
  },
  settings: {
    section: "masters",
    slug: "settings",
    title: "Settings",
    description: "Company, voucher preferences, numbering, and operational defaults.",
    icon: Settings2,
    columns: ["Setting", "Current Value", "Category", "Last Updated"],
    actions: ["Edit Preferences", "Voucher Numbering", "Download Config"],
    rows: [
      { Setting: "Default Currency", "Current Value": "BDT", Category: "General", "Last Updated": "20 May 2025" },
      { Setting: "Approval Required", "Current Value": "Yes", Category: "Workflow", "Last Updated": "18 May 2025" },
      { Setting: "Invoice Prefix", "Current Value": "SI-2505", Category: "Voucher", "Last Updated": "17 May 2025" },
    ],
  },
  "balance-sheet": {
    section: "reports",
    slug: "balance-sheet",
    title: "Balance Sheet",
    description: "Assets, liabilities, and equity grouped for clear financial presentation.",
    icon: FileBarChart2,
    columns: ["Particulars", "Group", "Current Period", "Previous Period"],
    actions: ["Print Report", "Export PDF", "Schedule Email"],
    rows: [
      { Particulars: "Cash and Bank", Group: "Current Assets", "Current Period": "৳ 1,275,450.00", "Previous Period": "৳ 1,112,200.00" },
      { Particulars: "Receivables", Group: "Current Assets", "Current Period": "৳ 91,200.00", "Previous Period": "৳ 87,000.00" },
      { Particulars: "Capital", Group: "Equity", "Current Period": "৳ 1,066,100.00", "Previous Period": "৳ 998,300.00" },
    ],
  },
  "profit-loss": {
    section: "reports",
    slug: "profit-loss",
    title: "Profit & Loss",
    description: "Revenue, direct cost, and operating profit summary for the active period.",
    icon: ChartNoAxesColumn,
    columns: ["Particulars", "Amount", "Variance", "Remarks"],
    actions: ["Print Report", "Export Excel", "Share Snapshot"],
    rows: [
      { Particulars: "Sales Revenue", Amount: "৳ 380,050.00", Variance: "+12.4%", Remarks: "Trading growth" },
      { Particulars: "Cost of Goods Sold", Amount: "৳ 187,500.00", Variance: "+5.1%", Remarks: "Controlled" },
      { Particulars: "Net Profit", Amount: "৳ 112,320.00", Variance: "+9.7%", Remarks: "Healthy margin" },
    ],
  },
  "cashflow-statement": {
    section: "reports",
    slug: "cashflow-statement",
    title: "Cashflow Statement",
    description: "Track operating, investing, and financing cash movement across the current period.",
    icon: FileSpreadsheet,
    columns: ["Section", "Particulars", "Amount", "Direction"],
    actions: ["Print Statement", "Export PDF", "Email Statement"],
    rows: [
      { Section: "Operating", Particulars: "Cash received from customers", Amount: "৳ 255,450.00", Direction: "Inflow" },
      { Section: "Operating", Particulars: "Cash paid to suppliers", Amount: "৳ 187,500.00", Direction: "Outflow" },
      { Section: "Financing", Particulars: "Owner capital introduced", Amount: "৳ 150,000.00", Direction: "Inflow" },
    ],
  },
  "account-receivable": {
    section: "reports",
    slug: "account-receivable",
    title: "Account Receivable",
    description: "Customer-wise outstanding balances, aging buckets, and follow-up positions.",
    icon: CircleDollarSign,
    columns: ["Customer", "Current", "30 Days", "60 Days", "Total Due"],
    actions: ["Print Aging", "Export Receivables", "Share Statement"],
    rows: [
      { Customer: "Rahim Traders", Current: "৳ 25,450.00", "30 Days": "৳ 0.00", "60 Days": "৳ 0.00", "Total Due": "৳ 25,450.00" },
      { Customer: "ABC Retail Ltd.", Current: "৳ 42,100.00", "30 Days": "৳ 8,500.00", "60 Days": "৳ 0.00", "Total Due": "৳ 50,600.00" },
      { Customer: "Masud Enterprise", Current: "৳ 12,600.00", "30 Days": "৳ 2,550.00", "60 Days": "৳ 0.00", "Total Due": "৳ 15,150.00" },
    ],
  },
  "account-payable": {
    section: "reports",
    slug: "account-payable",
    title: "Account Payable",
    description: "Supplier-wise outstanding liabilities, due aging, and settlement planning.",
    icon: HandCoins,
    columns: ["Supplier", "Current", "30 Days", "60 Days", "Total Payable"],
    actions: ["Print Payables", "Export Payables", "Share Payable Summary"],
    rows: [
      { Supplier: "Global Supplies", Current: "৳ 32,400.00", "30 Days": "৳ 0.00", "60 Days": "৳ 0.00", "Total Payable": "৳ 32,400.00" },
      { Supplier: "S. S. Corporation", Current: "৳ 18,750.00", "30 Days": "৳ 3,150.00", "60 Days": "৳ 0.00", "Total Payable": "৳ 21,900.00" },
      { Supplier: "Metro Import House", Current: "৳ 0.00", "30 Days": "৳ 12,000.00", "60 Days": "৳ 5,400.00", "Total Payable": "৳ 17,400.00" },
    ],
  },
  "closing-stock": {
    section: "reports",
    slug: "closing-stock",
    title: "Closing Stock",
    description: "Period-end stock valuation with item-wise quantity, rate, and closing amount.",
    icon: ClipboardCheck,
    columns: ["Item", "Closing Qty", "Unit", "Rate", "Closing Value"],
    actions: ["Print Stock", "Export Stock Value", "Share Closing Snapshot"],
    rows: [
      { Item: "Industrial Raw Material", "Closing Qty": "125", Unit: "pcs", Rate: "৳ 1,500.00", "Closing Value": "৳ 187,500.00" },
      { Item: "PVC Pipe 3 inch", "Closing Qty": "218", Unit: "pcs", Rate: "৳ 420.00", "Closing Value": "৳ 91,560.00" },
      { Item: "Industrial Paint", "Closing Qty": "42", Unit: "drum", Rate: "৳ 3,250.00", "Closing Value": "৳ 136,500.00" },
    ],
  },
  ledger: {
    section: "reports",
    slug: "ledger",
    title: "Ledger",
    description: "Drill into account-wise movement with opening, transaction, and balance views.",
    icon: ClipboardList,
    columns: ["Date", "Voucher", "Particulars", "Debit", "Credit"],
    actions: ["Filter Ledger", "Print Ledger", "Export CSV"],
    rows: [
      { Date: "20/05/2025", Voucher: "RV-2505-00109", Particulars: "Rahim Traders", Debit: "৳ 25,450.00", Credit: "৳ 0.00" },
      { Date: "18/05/2025", Voucher: "RV-2505-00108", Particulars: "ABC Retail Ltd.", Debit: "৳ 42,100.00", Credit: "৳ 0.00" },
      { Date: "15/05/2025", Voucher: "RV-2505-00107", Particulars: "Masud Enterprise", Debit: "৳ 12,600.00", Credit: "৳ 0.00" },
    ],
  },
  banking: {
    section: "utilities",
    slug: "banking",
    title: "Banking",
    description: "Bank books, reconciliation tasks, cheque management, and transfer workflows.",
    icon: Building2,
    columns: ["Account", "Pending Entries", "Last Reconciled", "Balance", "Action"],
    actions: ["Reconcile Now", "Import Bank Statement", "Print Summary"],
    rows: [
      { Account: "Dutch Bangla Bank", "Pending Entries": "6", "Last Reconciled": "20 May 2025", Balance: "৳ 850,000.00", Action: "Review" },
      { Account: "BRAC Bank", "Pending Entries": "2", "Last Reconciled": "18 May 2025", Balance: "৳ 400,000.00", Action: "Review" },
      { Account: "Cash to Bank", "Pending Entries": "1", "Last Reconciled": "16 May 2025", Balance: "৳ 25,450.00", Action: "Review" },
    ],
    hierarchy: [
      {
        title: "Banking",
        groups: [
          {
            title: "Banking Workspace",
            items: [
              "Banking Activities",
              "Imported Bank Data",
              "Cheque Printing",
              "Cheque Register",
              "Post-Dated Summary",
              "Deposit Slip",
              "Payment Advice",
            ],
          },
        ],
      },
    ],
  },
  "bank-accounts": {
    section: "utilities",
    slug: "bank-accounts",
    title: "Bank Accounts",
    description: "Maintain bank ledgers, branch details, current balances, and quick opening actions.",
    icon: Building2,
    columns: ["Bank Name", "Account Number", "Branch", "Current Balance", "Status"],
    actions: ["Create Bank Account", "Import Bank Accounts", "Export Bank Accounts"],
    rows: [
      { "Bank Name": "Dutch Bangla Bank", "Account Number": "105.221.778541", Branch: "Motijheel", "Current Balance": "৳ 850,000.00", Status: "Active" },
      { "Bank Name": "BRAC Bank", "Account Number": "221.778.004521", Branch: "Gulshan", "Current Balance": "৳ 400,000.00", Status: "Active" },
      { "Bank Name": "City Bank", "Account Number": "889.145.003214", Branch: "Banani", "Current Balance": "৳ 125,500.00", Status: "Inactive" },
    ],
  },
  "bank-transfers": {
    section: "utilities",
    slug: "bank-transfers",
    title: "Bank Transfers",
    description: "Move money between bank accounts and cash drawers, and keep every balance in sync.",
    icon: Building2,
    columns: ["Date", "From", "To", "Reference", "Amount"],
    actions: ["New Transfer", "Export Transfers", "Print Transfer List"],
    rows: [
      { Date: "28 Jul 2026", From: "Dutch Bangla Bank", To: "Cash in Hand", Reference: "Counter float", Amount: "৳ 50,000.00" },
      { Date: "26 Jul 2026", From: "Cash in Hand", To: "BRAC Bank", Reference: "Daily collection deposit", Amount: "৳ 125,000.00" },
      { Date: "24 Jul 2026", From: "BRAC Bank", To: "City Bank", Reference: "Payroll funding", Amount: "৳ 300,000.00" },
    ],
  },
  "cash-in-hand": {
    section: "utilities",
    slug: "cash-in-hand",
    title: "Cash In Hand",
    description: "Track petty cash, office cash drawers, and daily cash availability from one place.",
    icon: Landmark,
    columns: ["Location", "Custodian", "Opening Cash", "Closing Cash", "Status"],
    actions: ["Create Cash Drawer", "Record Opening Cash", "Export Cash Positions"],
    rows: [
      { Location: "Head Office", Custodian: "Accounts Desk", "Opening Cash": "৳ 25,450.00", "Closing Cash": "৳ 22,900.00", Status: "Open" },
      { Location: "Showroom", Custodian: "Counter 1", "Opening Cash": "৳ 12,000.00", "Closing Cash": "৳ 14,250.00", Status: "Open" },
      { Location: "Warehouse Gate", Custodian: "Security Desk", "Opening Cash": "৳ 3,500.00", "Closing Cash": "৳ 3,500.00", Status: "Closed" },
    ],
  },
  cheques: {
    section: "utilities",
    slug: "cheques",
    title: "Cheques",
    description: "Manage issued, cleared, unused, and post-dated cheques across all bank accounts.",
    icon: ClipboardCheck,
    columns: ["Bank Account", "Cheque No", "Issue Date", "Payee", "Status"],
    actions: ["Issue Cheque", "Mark Cleared", "Export Cheques"],
    rows: [
      { "Bank Account": "Dutch Bangla Bank", "Cheque No": "102541", "Issue Date": "20 May 2025", Payee: "S. S. Corporation", Status: "Issued" },
      { "Bank Account": "BRAC Bank", "Cheque No": "778231", "Issue Date": "18 May 2025", Payee: "Metro Import House", Status: "Cleared" },
      { "Bank Account": "City Bank", "Cheque No": "661204", "Issue Date": "17 May 2025", Payee: "Office Rent", Status: "Unused" },
    ],
  },
  "loan-accounts": {
    section: "utilities",
    slug: "loan-accounts",
    title: "Loan Accounts",
    description: "Monitor lender profiles, outstanding balances, installment schedules, and loan status.",
    icon: CircleDollarSign,
    columns: ["Lender", "Account Ref", "Outstanding", "Installment Date", "Status"],
    actions: ["Create Loan Account", "Record Installment", "Export Loan Accounts"],
    rows: [
      { Lender: "BRAC Bank SME", "Account Ref": "LN-22145", Outstanding: "৳ 1,250,000.00", "Installment Date": "25 Jul 2026", Status: "Running" },
      { Lender: "City Bank Term Loan", "Account Ref": "LN-88902", Outstanding: "৳ 540,000.00", "Installment Date": "30 Jul 2026", Status: "Running" },
      { Lender: "Personal Director Loan", "Account Ref": "LN-11007", Outstanding: "৳ 75,000.00", "Installment Date": "15 Aug 2026", Status: "Closing" },
    ],
  },
  "checkbook-register": {
    section: "utilities",
    slug: "checkbook-register",
    title: "Checkbook Register",
    description: "Track issued, unused, cleared, and cancelled cheque leaves across bank accounts.",
    icon: Landmark,
    columns: ["Bank Account", "Cheque No", "Issue Date", "Payee", "Status"],
    actions: ["Issue Cheque", "Mark Cleared", "Export Register"],
    rows: [
      { "Bank Account": "Dutch Bangla Bank", "Cheque No": "102541", "Issue Date": "20 May 2025", Payee: "S. S. Corporation", Status: "Issued" },
      { "Bank Account": "BRAC Bank", "Cheque No": "778231", "Issue Date": "18 May 2025", Payee: "Metro Import House", Status: "Cleared" },
      { "Bank Account": "Dutch Bangla Bank", "Cheque No": "102542", "Issue Date": "17 May 2025", Payee: "Office Rent", Status: "Unused" },
    ],
  },
  workspace: {
    section: "utilities",
    slug: "workspace",
    title: "Workspace",
    description: "Monitor active divisions, user distribution, and workspace-specific operating periods.",
    icon: BriefcaseBusiness,
    columns: ["Workspace", "Industry", "Users", "Open Period", "Status"],
    actions: ["Switch Workspace", "View Members", "Export Workspace Summary"],
    rows: [
      { Workspace: "Trading Division", Industry: "Trading", Users: "8", "Open Period": "May 2025", Status: "Online" },
      { Workspace: "Tender Division", Industry: "Tender", Users: "5", "Open Period": "May 2025", Status: "Online" },
      { Workspace: "Rental Division", Industry: "Equipment Rental", Users: "4", "Open Period": "May 2025", Status: "Online" },
    ],
  },
  "sync-share": {
    section: "utilities",
    slug: "sync-share",
    title: "Sync & Share",
    description: "Manage connected users, sharing status, device sync, and collaborative access from one place.",
    icon: NotebookTabs,
    columns: ["User", "Role", "Device", "Last Sync", "Status"],
    actions: ["Add User", "Sync Now", "Share Access"],
    rows: [
      { User: "Abu Kawser", Role: "Owner", Device: "Windows Desktop", "Last Sync": "19 Jul 2026 02:35 PM", Status: "Active" },
      { User: "Nusrat Jahan", Role: "Accounts Manager", Device: "Android App", "Last Sync": "19 Jul 2026 01:42 PM", Status: "Invited" },
      { User: "Shuvo Alam", Role: "Accounts Officer", Device: "Laptop Browser", "Last Sync": "19 Jul 2026 11:08 AM", Status: "Active" },
    ],
  },
  "auto-backup": {
    section: "utilities",
    slug: "auto-backup",
    title: "Auto Backup",
    description: "Set recurring cloud backups, choose schedules, and monitor the last successful protected snapshot.",
    icon: Bell,
    columns: ["Backup Profile", "Destination", "Frequency", "Last Run", "Status"],
    actions: ["Enable Auto Backup", "Run Backup Now", "Edit Schedule"],
    rows: [
      { "Backup Profile": "Daily Workspace Backup", Destination: "Bizovix Cloud", Frequency: "Every Day 11:00 PM", "Last Run": "18 Jul 2026 11:03 PM", Status: "Successful" },
      { "Backup Profile": "Weekly Workspace Backup", Destination: "Bizovix Cloud", Frequency: "Every Friday 09:00 PM", "Last Run": "Not uploaded", Status: "Not Connected" },
      { "Backup Profile": "Monthly Local Archive", Destination: "Local Computer", Frequency: "1st Day 08:00 PM", "Last Run": "Not created", Status: "Pending Setup" },
    ],
  },
  "backup-to-computer": {
    section: "utilities",
    slug: "backup-to-computer",
    title: "Backup To Computer",
    description: "Create local backup packages for the active workspace, its documents, and ledger history on this computer without exporting other workspaces.",
    icon: FileSpreadsheet,
    columns: ["Package", "Scope", "Saved Location", "Created On", "Status"],
    actions: ["Create Local Backup", "Download Latest Backup", "Verify Backup File"],
    rows: [
      { Package: "2026-07-19_14-15-00_trading-erp-workspace_bizovix-workspace-backup.fyb", Scope: "Trading ERP Workspace Only", "Saved Location": "Downloads", "Created On": "19 Jul 2026 02:15 PM", Status: "Ready" },
      { Package: "2026-07-18_19-25-00_tender-division_bizovix-workspace-backup.fyb", Scope: "Tender Division Only", "Saved Location": "Desktop", "Created On": "18 Jul 2026 07:25 PM", Status: "Ready" },
      { Package: "2026-07-01_09-00-00_rental-division_bizovix-workspace-backup.fyb", Scope: "Rental Division Only", "Saved Location": "Documents", "Created On": "01 Jul 2026 09:00 AM", Status: "Archived" },
    ],
  },
  "backup-to-drive": {
    section: "utilities",
    slug: "backup-to-drive",
    title: "Backup to Cloud",
    description: "Push protected workspace snapshots to Bizovix Cloud and monitor remote backup health.",
    icon: Building2,
    columns: ["Cloud", "Workspace", "Last Upload", "Snapshot Size", "Status"],
    actions: ["Connect Cloud", "Upload Backup", "Open Backup Log"],
    rows: [
      { Cloud: "Bizovix Cloud", Workspace: "Trading ERP Workspace", "Last Upload": "Not uploaded", "Snapshot Size": "-", Status: "Not Connected" },
    ],
  },
  "restore-backup": {
    section: "utilities",
    slug: "restore-backup",
    title: "Restore Backup",
    description: "Review backup history, validate restore points, and recover workspace data from a previous snapshot.",
    icon: ShieldCheck,
    columns: ["Restore Point", "Source", "Captured On", "Size", "Status"],
    actions: ["Restore Selected Backup", "Preview Restore Contents", "Export Restore Log"],
    rows: [
      { "Restore Point": "Before July Adjustments", Source: "Bizovix Cloud", "Captured On": "18 Jul 2026 11:03 PM", Size: "48 MB", Status: "Available" },
      { "Restore Point": "Quarter Close Snapshot", Source: "Bizovix Cloud", "Captured On": "30 Jun 2026 09:16 PM", Size: "73 MB", Status: "Available" },
      { "Restore Point": "Annual Archive", Source: "Local Computer", "Captured On": "01 Jan 2026 08:02 AM", Size: "120 MB", Status: "Protected" },
    ],
  },
  "import-items": {
    section: "utilities",
    slug: "import-items",
    title: "Import Items",
    description: "Upload stock items in bulk from spreadsheets and map each column before bringing them into the active workspace.",
    icon: FileSpreadsheet,
    columns: ["Import Batch", "Source File", "Mapped Columns", "Imported On", "Status"],
    actions: ["Upload Import Sheet", "Download Sample File", "Verify Mapping"],
    rows: [
      { "Import Batch": "Opening Stock July", "Source File": "opening-stock-july.xlsx", "Mapped Columns": "12", "Imported On": "19 Jul 2026 11:15 AM", Status: "Completed" },
      { "Import Batch": "Warehouse Refresh", "Source File": "warehouse-refresh.csv", "Mapped Columns": "10", "Imported On": "18 Jul 2026 04:40 PM", Status: "Ready" },
      { "Import Batch": "Rental Asset Intake", "Source File": "rental-assets.xlsx", "Mapped Columns": "14", "Imported On": "16 Jul 2026 02:05 PM", Status: "Needs Review" },
    ],
  },
  "update-items-bulk": {
    section: "utilities",
    slug: "update-items-bulk",
    title: "Update Items In Bulk",
    description: "Apply bulk edits across item names, rates, opening stock, categories, and unit setup from one controlled sheet.",
    icon: ClipboardCheck,
    columns: ["Update Batch", "Target Scope", "Changed Fields", "Applied On", "Status"],
    actions: ["Upload Update File", "Preview Changes", "Apply Bulk Update"],
    rows: [
      { "Update Batch": "Rate Revision Q3", "Target Scope": "Trading Stock", "Changed Fields": "Price, MRP", "Applied On": "19 Jul 2026 01:30 PM", Status: "Completed" },
      { "Update Batch": "Unit Cleanup", "Target Scope": "All Active Items", "Changed Fields": "Unit, Category", "Applied On": "18 Jul 2026 03:55 PM", Status: "Ready" },
      { "Update Batch": "Rental Group Align", "Target Scope": "Rental Assets", "Changed Fields": "Description, Tax", "Applied On": "14 Jul 2026 09:25 AM", Status: "Queued" },
    ],
  },
  "import-parties": {
    section: "utilities",
    slug: "import-parties",
    title: "Import Parties",
    description: "Bring customers and suppliers into the current workspace from CSV or spreadsheet files with contact mapping.",
    icon: Users,
    columns: ["Import Batch", "Party Type", "Contacts Added", "Imported On", "Status"],
    actions: ["Upload Party File", "Download Party Template", "Resolve Duplicates"],
    rows: [
      { "Import Batch": "Dealer Master Import", "Party Type": "Customer", "Contacts Added": "86", "Imported On": "19 Jul 2026 10:40 AM", Status: "Completed" },
      { "Import Batch": "Supplier Sync", "Party Type": "Supplier", "Contacts Added": "24", "Imported On": "17 Jul 2026 05:20 PM", Status: "Ready" },
      { "Import Batch": "Tender Vendors", "Party Type": "Supplier", "Contacts Added": "13", "Imported On": "13 Jul 2026 11:05 AM", Status: "Needs Review" },
    ],
  },
  "export-to-tally": {
    section: "utilities",
    slug: "export-to-tally",
    title: "Tally Import & Export",
    description: "Safely exchange balanced accounting vouchers between Bizovix and Tally with mapping, preview, and duplicate protection.",
    icon: BriefcaseBusiness,
    columns: ["Export Batch", "Data Scope", "Format", "Created On", "Status"],
    actions: ["Export to Tally", "Import from Tally", "Verify Ledger Mapping"],
    rows: [
      { "Export Batch": "Month End Trading", "Data Scope": "Sales, Purchase, Ledger", Format: "XML", "Created On": "19 Jul 2026 02:05 PM", Status: "Ready" },
      { "Export Batch": "Rental Close Pack", "Data Scope": "Ledger + Expenses", Format: "XML", "Created On": "16 Jul 2026 05:45 PM", Status: "Delivered" },
      { "Export Batch": "Tender Tax Pack", "Data Scope": "Vouchers + Parties", Format: "XML", "Created On": "11 Jul 2026 04:15 PM", Status: "Pending Validation" },
    ],
  },
  "export-items": {
    section: "utilities",
    slug: "export-items",
    title: "Export Items",
    description: "Download the active workspace item master for reporting, migration, audit, or external review.",
    icon: FileSpreadsheet,
    columns: ["Export Batch", "Item Scope", "Format", "Created On", "Status"],
    actions: ["Export Items", "Download Excel", "Send to Mail"],
    rows: [
      { "Export Batch": "Trading Master Export", "Item Scope": "All Active Items", Format: "XLSX", "Created On": "19 Jul 2026 12:55 PM", Status: "Ready" },
      { "Export Batch": "Rental Asset List", "Item Scope": "Rental Category", Format: "CSV", "Created On": "18 Jul 2026 01:25 PM", Status: "Downloaded" },
      { "Export Batch": "Tender Consumables", "Item Scope": "Tender Division", Format: "XLSX", "Created On": "12 Jul 2026 09:10 AM", Status: "Archived" },
    ],
  },
  "verify-my-data": {
    section: "utilities",
    slug: "verify-my-data",
    title: "Verify My Data",
    description: "Run health checks on vouchers, parties, stock records, and balances before backup, export, or financial closing.",
    icon: ShieldCheck,
    columns: ["Check Name", "Coverage", "Last Run", "Issues Found", "Status"],
    actions: ["Run Verification", "Open Issue Log", "Download Audit Report"],
    rows: [
      { "Check Name": "Voucher Balance Check", Coverage: "Current Workspace", "Last Run": "19 Jul 2026 03:00 PM", "Issues Found": "0", Status: "Passed" },
      { "Check Name": "Party Duplicate Scan", Coverage: "Customers + Suppliers", "Last Run": "18 Jul 2026 04:30 PM", "Issues Found": "2", Status: "Needs Attention" },
      { "Check Name": "Stock Integrity Review", Coverage: "Inventory Items", "Last Run": "17 Jul 2026 11:45 AM", "Issues Found": "0", Status: "Passed" },
    ],
  },
  "recycle-bin": {
    section: "utilities",
    slug: "recycle-bin",
    title: "Recycle Bin",
    description: "Review recently deleted vouchers, parties, and items before permanent removal from the active workspace.",
    icon: ClipboardList,
    columns: ["Entry Name", "Module", "Deleted On", "Deleted By", "Status"],
    actions: ["Restore Entry", "Delete Permanently", "Empty Bin"],
    rows: [
      { "Entry Name": "Cash Sale INV-1054", Module: "Sales", "Deleted On": "19 Jul 2026 09:20 AM", "Deleted By": "Abu Kawser", Status: "Recoverable" },
      { "Entry Name": "Masud Enterprise", Module: "Parties", "Deleted On": "18 Jul 2026 02:12 PM", "Deleted By": "Nusrat Jahan", Status: "Recoverable" },
      { "Entry Name": "Old Rental Toolkit", Module: "Items", "Deleted On": "15 Jul 2026 05:40 PM", "Deleted By": "Shuvo Alam", Status: "Pending Purge" },
    ],
  },
  "close-financial-year": {
    section: "utilities",
    slug: "close-financial-year",
    title: "Close Financial Year",
    description: "Complete pre-close review, verify balances, and move the selected workspace into its next financial year safely.",
    icon: Landmark,
    columns: ["Checklist Step", "Owner", "Due Date", "Progress", "Status"],
    actions: ["Start Year Close", "Preview Closing Entries", "Lock Period"],
    rows: [
      { "Checklist Step": "Verify ledger balances", Owner: "Accounts Team", "Due Date": "25 Jul 2026", Progress: "100%", Status: "Done" },
      { "Checklist Step": "Review outstanding stock", Owner: "Warehouse", "Due Date": "26 Jul 2026", Progress: "80%", Status: "In Progress" },
      { "Checklist Step": "Approve closing vouchers", Owner: "Management", "Due Date": "27 Jul 2026", Progress: "35%", Status: "Pending" },
    ],
  },
};

export const supportCenterLinks = [
  { label: "Shortcut Guide", description: "Review the full keyboard map", icon: NotebookTabs },
  { label: "Release Notes", description: "Track recent UI and workflow updates", icon: Bell },
  { label: "Security Settings", description: "Review access and approval defaults", icon: ShieldCheck },
  { label: "Billing Contacts", description: "Manage upgrade and subscription requests", icon: HandCoins },
];

export function getModuleDefinition(section: ModuleSection, slug: string) {
  const entry = moduleRegistry[slug];
  if (!entry || entry.section !== section) {
    return null;
  }

  return entry;
}
