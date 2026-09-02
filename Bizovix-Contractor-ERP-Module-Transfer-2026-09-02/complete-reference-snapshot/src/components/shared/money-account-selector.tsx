"use client";

import { useEffect, type Ref } from "react";
import { useMoneyAccountsQuery } from "@/hooks/use-accounts-query";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MoneyAccountOption, MoneyAccountType } from "@/types/accounts";

type MoneyAccountSelectorProps = {
  value: string;
  onChange: (account: MoneyAccountOption | null) => void;
  allowedTypes: MoneyAccountType[];
  disabled?: boolean;
  required?: boolean;
  className?: string;
  placeholder?: string;
  enabled?: boolean;
  selectRef?: Ref<HTMLSelectElement>;
  purchaseOrderPaymentRow?: number;
};

export function MoneyAccountSelector({ value, onChange, allowedTypes, disabled, required, className, placeholder = "Select ledger", enabled = true, selectRef, purchaseOrderPaymentRow }: MoneyAccountSelectorProps) {
  const query = useMoneyAccountsQuery(enabled);
  const allowed = new Set(allowedTypes);
  const options = (query.data ?? []).filter((account) => allowed.has(account.type));

  useEffect(() => {
    if (!enabled || disabled || query.isLoading || !options.length) return;
    if (!value || !options.some((account) => account.id === value)) onChange(options[0]!);
  }, [disabled, enabled, onChange, options, query.isLoading, value]);

  return (
    <select
      ref={selectRef}
      data-po-payment-ledger={purchaseOrderPaymentRow}
      value={value}
      required={required}
      disabled={disabled || query.isLoading}
      onChange={(event) => onChange(options.find((account) => account.id === event.target.value) ?? null)}
      className={cn("min-w-0 border border-[#cfd9e8] bg-white px-2 text-sm disabled:bg-[#eef2f7]", className)}
    >
      <option value="">{query.isLoading ? "Loading ledgers..." : placeholder}</option>
      {options.map((account) => (
        <option key={account.id} value={account.id}>
          {account.name} — {formatCurrency(account.currentBalance)}
        </option>
      ))}
    </select>
  );
}
