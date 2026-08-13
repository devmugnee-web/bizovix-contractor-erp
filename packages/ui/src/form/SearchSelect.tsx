import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "../lib/cn";

export interface SearchSelectOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface SearchSelectProps {
  value?: SearchSelectOption | null;
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (option: SearchSelectOption) => void;
  options: SearchSelectOption[];
  isLoading?: boolean;
  placeholder?: string;
  minChars?: number;
  className?: string;
}

export function SearchSelect({
  value,
  query,
  onQueryChange,
  onSelect,
  options,
  isLoading = false,
  placeholder = "Search...",
  minChars = 2,
  className,
}: SearchSelectProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-biz-muted" />
        <input
          value={value ? value.label : query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          className="h-11 w-full rounded-sm border border-biz-border bg-biz-surface pl-9 pr-3 text-[13px] text-biz-text placeholder:text-biz-muted focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
        />
      </div>
      {open && query.trim().length >= minChars && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-sm border border-biz-border bg-biz-surface shadow-card-hover">
          {isLoading ? (
            <div className="px-3 py-2.5 text-[13px] text-biz-muted">Searching...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2.5 text-[13px] text-biz-muted">No results found</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(opt);
                  setOpen(false);
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-biz-bg"
              >
                <span className="text-[13px] font-medium text-biz-text">{opt.label}</span>
                {opt.sublabel && <span className="text-[11px] text-biz-muted">{opt.sublabel}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
