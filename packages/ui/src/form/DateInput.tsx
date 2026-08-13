import * as React from "react";
import { Calendar } from "lucide-react";
import { cn } from "../lib/cn";

export const DateInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative">
      <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
      <input
        ref={ref}
        type="date"
        className={cn(
          "h-11 w-full rounded-sm border border-biz-border bg-biz-surface pl-9 pr-3 text-[13px] text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30",
          className,
        )}
        {...props}
      />
    </div>
  ),
);
DateInput.displayName = "DateInput";
