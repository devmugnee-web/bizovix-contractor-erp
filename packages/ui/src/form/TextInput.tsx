import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
  hasError?: boolean;
}

export const TextInput = React.forwardRef<HTMLInputElement, TextInputProps>(
  ({ icon: Icon, hasError, className, ...props }, ref) => (
    <div className="relative">
      {Icon && (
        <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
      )}
      <input
        ref={ref}
        className={cn(
          "h-11 w-full rounded-sm border bg-biz-surface px-3 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30",
          Icon && "pl-9",
          hasError ? "border-biz-danger" : "border-biz-border",
          className,
        )}
        {...props}
      />
    </div>
  ),
);
TextInput.displayName = "TextInput";
