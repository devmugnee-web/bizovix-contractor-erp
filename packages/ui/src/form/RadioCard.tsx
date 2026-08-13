import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/cn";

export interface RadioCardOption {
  value: string;
  label: string;
  icon: LucideIcon;
  iconClassName?: string;
}

export interface RadioCardGroupProps {
  name: string;
  options: RadioCardOption[];
  value: string;
  onChange: (value: string) => void;
}

export function RadioCardGroup({ name, options, value, onChange }: RadioCardGroupProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((opt) => {
        const selected = opt.value === value;
        const Icon = opt.icon;
        return (
          <label
            key={opt.value}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-md border-2 px-4 py-3 transition-colors",
              selected ? "border-biz-blue bg-biz-blue-soft" : "border-biz-border bg-biz-surface hover:bg-biz-bg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={selected}
              onChange={() => onChange(opt.value)}
              className="h-4 w-4 accent-biz-blue"
            />
            <Icon className={cn("h-4 w-4", opt.iconClassName ?? "text-biz-muted")} />
            <span className={cn("text-[14px] font-medium", selected ? "text-biz-blue" : "text-biz-text")}>
              {opt.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}
