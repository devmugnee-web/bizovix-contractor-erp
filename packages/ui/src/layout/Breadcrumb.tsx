import { ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav className={cn("flex items-center gap-1.5 text-[13px]", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {item.href && !isLast ? (
              <a href={item.href} className="text-biz-muted hover:text-biz-text">
                {item.label}
              </a>
            ) : (
              <span className={cn(isLast ? "font-semibold text-biz-blue" : "text-biz-muted")}>{item.label}</span>
            )}
            {!isLast && <ChevronRight className="h-3.5 w-3.5 text-biz-muted" />}
          </span>
        );
      })}
    </nav>
  );
}
