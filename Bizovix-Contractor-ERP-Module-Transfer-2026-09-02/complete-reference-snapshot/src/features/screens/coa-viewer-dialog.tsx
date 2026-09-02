"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface Account {
  code: string;
  name: string;
  level: "CATEGORY" | "SUBCATEGORY" | "LEDGER";
  nature: string;
  isSystem: boolean;
}

const COA_DATA: Account[] = [
  { code: "1000", name: "Fixed Assets", level: "CATEGORY", nature: "ASSET", isSystem: true },
  { code: "1100", name: "Fixed Assets - Property & Equipment", level: "SUBCATEGORY", nature: "ASSET", isSystem: true },
  { code: "1110", name: "Office Equipment", level: "LEDGER", nature: "ASSET", isSystem: false },
  { code: "1120", name: "Vehicles", level: "LEDGER", nature: "ASSET", isSystem: false },
  { code: "1130", name: "Building & Furniture", level: "LEDGER", nature: "ASSET", isSystem: false },

  { code: "2000", name: "Current Assets", level: "CATEGORY", nature: "ASSET", isSystem: true },
  { code: "2100", name: "Closing Balance", level: "SUBCATEGORY", nature: "ASSET", isSystem: true },
  { code: "2110", name: "Closing Balance", level: "LEDGER", nature: "ASSET", isSystem: false },

  { code: "2200", name: "Cash & Cash Equivalents", level: "SUBCATEGORY", nature: "ASSET", isSystem: true },
  { code: "2210", name: "Cash Accounts", level: "SUBCATEGORY", nature: "ASSET", isSystem: true },
  { code: "2211", name: "Cash in Hand", level: "LEDGER", nature: "ASSET", isSystem: true },
  { code: "2212", name: "Petty Cash", level: "LEDGER", nature: "ASSET", isSystem: true },
  { code: "2220", name: "Bank & MFS Accounts", level: "SUBCATEGORY", nature: "ASSET", isSystem: true },
  { code: "2221", name: "Bank Accounts", level: "LEDGER", nature: "ASSET", isSystem: true },
  { code: "2222", name: "MFS", level: "LEDGER", nature: "ASSET", isSystem: true },

  { code: "2300", name: "Receivables", level: "SUBCATEGORY", nature: "ASSET", isSystem: true },
  { code: "2310", name: "Accounts Receivables Control", level: "LEDGER", nature: "ASSET", isSystem: true },
  { code: "2320", name: "Others Receivable", level: "LEDGER", nature: "ASSET", isSystem: false },

  { code: "2400", name: "Deposit & Advance", level: "SUBCATEGORY", nature: "ASSET", isSystem: true },
  { code: "2410", name: "Utility Deposit", level: "LEDGER", nature: "ASSET", isSystem: false },
  { code: "2420", name: "Advance to Supplier", level: "LEDGER", nature: "ASSET", isSystem: false },

  { code: "2500", name: "Goods in Transit", level: "SUBCATEGORY", nature: "ASSET", isSystem: true },
  { code: "2510", name: "Goods in Transit", level: "LEDGER", nature: "ASSET", isSystem: false },

  { code: "3000", name: "Liabilities", level: "CATEGORY", nature: "LIABILITY", isSystem: true },
  { code: "3100", name: "Long Term Liabilities", level: "SUBCATEGORY", nature: "LIABILITY", isSystem: true },
  { code: "3110", name: "Bank Loan", level: "LEDGER", nature: "LIABILITY", isSystem: false },

  { code: "3200", name: "Current Liabilities", level: "SUBCATEGORY", nature: "LIABILITY", isSystem: true },
  { code: "3210", name: "Payable", level: "SUBCATEGORY", nature: "LIABILITY", isSystem: true },
  { code: "3211", name: "Accounts Payable Control", level: "LEDGER", nature: "LIABILITY", isSystem: true },
  { code: "3212", name: "Others Payable", level: "LEDGER", nature: "LIABILITY", isSystem: true },

  { code: "3220", name: "Advance Received", level: "SUBCATEGORY", nature: "LIABILITY", isSystem: true },
  { code: "3221", name: "Advance from Customer", level: "LEDGER", nature: "LIABILITY", isSystem: false },

  { code: "3230", name: "VAT", level: "SUBCATEGORY", nature: "LIABILITY", isSystem: true },
  { code: "3231", name: "VAT Input", level: "LEDGER", nature: "LIABILITY", isSystem: true },
  { code: "3232", name: "VAT Output", level: "LEDGER", nature: "LIABILITY", isSystem: true },

  { code: "3240", name: "Loan", level: "SUBCATEGORY", nature: "LIABILITY", isSystem: true },
  { code: "3241", name: "Short Term Loan", level: "LEDGER", nature: "LIABILITY", isSystem: false },
  { code: "3242", name: "Time Loan", level: "LEDGER", nature: "LIABILITY", isSystem: false },
  { code: "3243", name: "Personal Loan", level: "LEDGER", nature: "LIABILITY", isSystem: false },

  { code: "4000", name: "Equity", level: "CATEGORY", nature: "EQUITY", isSystem: true },
  { code: "4100", name: "Capital & Reserves", level: "SUBCATEGORY", nature: "EQUITY", isSystem: true },
  { code: "4110", name: "Paid-up Capital", level: "LEDGER", nature: "EQUITY", isSystem: false },

  { code: "4200", name: "Withdraws", level: "SUBCATEGORY", nature: "EQUITY", isSystem: true },
  { code: "4210", name: "Drawings", level: "LEDGER", nature: "EQUITY", isSystem: false },

  { code: "4300", name: "Profit & Loss", level: "SUBCATEGORY", nature: "EQUITY", isSystem: true },
  { code: "4310", name: "Retained Earnings", level: "LEDGER", nature: "EQUITY", isSystem: false },

  { code: "5000", name: "Income", level: "CATEGORY", nature: "INCOME", isSystem: true },
  { code: "5100", name: "Operating Income", level: "SUBCATEGORY", nature: "INCOME", isSystem: true },
  { code: "5110", name: "Sales", level: "LEDGER", nature: "INCOME", isSystem: false },
  { code: "5120", name: "Sales Return", level: "LEDGER", nature: "INCOME", isSystem: false },

  { code: "5200", name: "Other Income", level: "SUBCATEGORY", nature: "INCOME", isSystem: true },
  { code: "5210", name: "Service Income", level: "LEDGER", nature: "INCOME", isSystem: false },
  { code: "5220", name: "Bank Interest", level: "LEDGER", nature: "INCOME", isSystem: false },
  { code: "5230", name: "Commission", level: "LEDGER", nature: "INCOME", isSystem: false },

  { code: "6000", name: "Direct Expenses", level: "CATEGORY", nature: "DIRECT_EXPENSE", isSystem: true },
  { code: "6100", name: "Direct Expenses", level: "SUBCATEGORY", nature: "DIRECT_EXPENSE", isSystem: true },
  { code: "6110", name: "Carriage", level: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false },
  { code: "6120", name: "Labour", level: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false },
  { code: "6130", name: "Freight", level: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false },
  { code: "6140", name: "Handling", level: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false },
  { code: "6150", name: "Loading", level: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false },

  { code: "6200", name: "Purchase", level: "SUBCATEGORY", nature: "DIRECT_EXPENSE", isSystem: true },
  { code: "6210", name: "Purchase of Goods", level: "LEDGER", nature: "DIRECT_EXPENSE", isSystem: false },

  { code: "7000", name: "Indirect Expenses", level: "CATEGORY", nature: "INDIRECT_EXPENSE", isSystem: true },
  { code: "7100", name: "Administrative", level: "SUBCATEGORY", nature: "INDIRECT_EXPENSE", isSystem: true },
  { code: "7110", name: "Depreciation", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7120", name: "Electricity", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7130", name: "Internet", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7140", name: "Rent", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7150", name: "Stationery", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7160", name: "Maintenance", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },

  { code: "7200", name: "Financial", level: "SUBCATEGORY", nature: "INDIRECT_EXPENSE", isSystem: true },
  { code: "7210", name: "Bank Charge", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7220", name: "Interest", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7230", name: "Loan Fee", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },

  { code: "7300", name: "Sales & Marketing", level: "SUBCATEGORY", nature: "INDIRECT_EXPENSE", isSystem: true },
  { code: "7310", name: "Advertisement", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7320", name: "Entertainment", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7330", name: "Digital Marketing", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7340", name: "Promotion", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
  { code: "7350", name: "Commission", level: "LEDGER", nature: "INDIRECT_EXPENSE", isSystem: false },
];

interface CoaViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoaViewerDialog({ open, onOpenChange }: CoaViewerProps) {
  const [search, setSearch] = useState("");

  const filtered = COA_DATA.filter(
    (item) => item.name.toLowerCase().includes(search.toLowerCase()) || item.code.includes(search)
  );

  const protectedCount = COA_DATA.filter((c) => c.isSystem).length;
  const editableCount = COA_DATA.filter((c) => !c.isSystem).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(95vw,900px)] max-h-[90vh] overflow-y-auto">
        <div className="pr-8">
          <DialogTitle className="text-2xl font-bold">📊 Chart of Accounts</DialogTitle>
          <DialogDescription className="mt-2 text-sm">
            Complete account hierarchy. Bold, larger text indicates System Protected accounts that cannot be modified or deleted.
          </DialogDescription>
        </div>

        <div className="mt-4 flex gap-3">
          <Input
            placeholder="Search by account name or code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded">
          <div className="text-center">
            <div className="text-lg font-bold text-blue-600">{COA_DATA.length}</div>
            <div className="text-xs text-gray-600">Total Accounts</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">🔒 {protectedCount}</div>
            <div className="text-xs text-gray-600">System Protected</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-green-600">✏️ {editableCount}</div>
            <div className="text-xs text-gray-600">Editable</div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden border border-gray-200 rounded">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold">Code</th>
                <th className="px-4 py-2 text-left text-xs font-semibold">Name</th>
                <th className="px-4 py-2 text-left text-xs font-semibold">Level</th>
                <th className="px-4 py-2 text-left text-xs font-semibold">Nature</th>
                <th className="px-4 py-2 text-center text-xs font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No accounts found
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.code} className={item.isSystem ? "bg-blue-50" : ""}>
                    <td
                      className={`px-4 py-3 font-mono text-sm ${
                        item.isSystem ? "font-bold text-base text-blue-900" : ""
                      }`}
                    >
                      {item.code}
                    </td>
                    <td
                      className={`px-4 py-3 ${
                        item.isSystem ? "font-bold text-base text-blue-900" : ""
                      }`}
                    >
                      {item.name}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600">{item.level}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                          item.nature === "ASSET"
                            ? "bg-blue-100 text-blue-700"
                            : item.nature === "LIABILITY"
                              ? "bg-red-100 text-red-700"
                              : item.nature === "EQUITY"
                                ? "bg-green-100 text-green-700"
                                : item.nature === "INCOME"
                                  ? "bg-teal-100 text-teal-700"
                                  : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {item.nature}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {item.isSystem ? (
                        <span className="text-red-600 font-semibold text-lg">🔒 Protected</span>
                      ) : (
                        <span className="text-green-600 text-sm">Editable</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-gray-700">
          <strong>Important:</strong> Bold, larger items are System Protected. They cannot be edited or deleted because they are required for core ERP functionality.
        </div>
      </DialogContent>
    </Dialog>
  );
}
