import * as React from "react";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectInputProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  options: SelectOption[];
  placeholder?: string;
  icon?: LucideIcon;
}

export const SelectInput = React.forwardRef<HTMLSelectElement, SelectInputProps>(
  ({ options, placeholder, icon: Icon, className, ...props }, ref) => (
    <div className="relative">
      {Icon && (
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
      )}
      <select
        ref={ref}
        className={cn(
          "h-11 w-full appearance-none rounded-sm border border-biz-border bg-biz-surface px-3 pr-9 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30",
          Icon && "pl-9",
          className,
        )}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
    </div>
  ),
);
SelectInput.displayName = "SelectInput";
