import * as React from "react";
import { cn } from "../lib/cn";

export interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  currency?: string;
  containerClassName?: string;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ currency = "BDT", containerClassName, className, ...props }, ref) => (
    <div
      className={cn(
        "flex h-11 items-center overflow-hidden rounded-sm border border-biz-border bg-biz-surface focus-within:ring-2 focus-within:ring-biz-blue/30",
        containerClassName,
      )}
    >
      <input
        ref={ref}
        type="number"
        step="0.01"
        className={cn(
          "h-full w-full border-none bg-transparent px-3 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none",
          className,
        )}
        {...props}
      />
      <span className="flex h-full shrink-0 items-center border-l border-biz-border px-3 text-[13px] font-medium text-biz-muted">
        {currency}
      </span>
    </div>
  ),
);
CurrencyInput.displayName = "CurrencyInput";
