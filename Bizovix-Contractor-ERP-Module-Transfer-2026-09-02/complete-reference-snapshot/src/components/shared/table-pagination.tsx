"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TablePaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  summary?: ReactNode;
  centerContent?: ReactNode;
  className?: string;
  showPageSizeSelector?: boolean;
  showPageIndicator?: boolean;
  iconOnlyNavigation?: boolean;
  dense?: boolean;
};

export function TablePagination({
  page,
  pageSize,
  totalItems,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
  summary,
  centerContent,
  className,
  showPageSizeSelector = true,
  showPageIndicator = true,
  iconOnlyNavigation = false,
  dense = false,
}: TablePaginationProps) {
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || typeof window === "undefined") return;
    restoredRef.current = true;
    const saved = Number(window.localStorage.getItem("bizovix:table-page-size"));
    if (pageSizeOptions.includes(saved) && saved !== pageSize) onPageSizeChange(saved);
  }, [onPageSizeChange, pageSize, pageSizeOptions]);

  const changePageSize = (size: number) => {
    window.localStorage.setItem("bizovix:table-page-size", String(size));
    onPageSizeChange(size);
  };
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const rangeStart = totalItems ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = totalItems ? Math.min(page * pageSize, totalItems) : 0;
  const navButtonClassName = cn(
    iconOnlyNavigation ? "h-7 w-7 rounded-lg p-0" : "h-7 rounded-lg px-2.5 text-xs",
    dense && iconOnlyNavigation && "h-6 w-6 rounded-full",
  );

  return (
    <div
      className={cn(
        "flex h-10 shrink-0 items-center justify-between gap-2 border-t border-border px-3 text-xs",
        dense && "h-7 min-h-7 gap-2 py-0",
        className,
      )}
    >
      <div className={cn("whitespace-nowrap text-muted", dense && "shrink-0")}>{summary ?? `Showing ${rangeStart}-${rangeEnd} of ${totalItems} entries`}</div>
      {centerContent ? <div className="flex shrink-0 items-center">{centerContent}</div> : null}
      <div className={cn("flex shrink-0 items-center gap-2", dense && "gap-1.5")}>
        {showPageSizeSelector ? (
          <select className="h-7 rounded-lg border border-border bg-white px-2 text-xs" value={pageSize} onChange={(event) => changePageSize(Number(event.target.value))}>
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} / page
              </option>
            ))}
          </select>
        ) : null}
        <div className={cn("flex items-center gap-1.5", dense && "gap-1")}>
          <Button
            variant="outline"
            size={iconOnlyNavigation ? "icon" : "sm"}
            className={navButtonClassName}
            onClick={() => onPageChange(Math.max(1, page - 1))}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            {iconOnlyNavigation ? <ChevronLeft className="h-4 w-4" /> : "Previous"}
          </Button>
          {showPageIndicator ? (
            <span className="whitespace-nowrap text-muted">
              Page {page} of {totalPages}
            </span>
          ) : null}
          <Button
            variant="outline"
            size={iconOnlyNavigation ? "icon" : "sm"}
            className={navButtonClassName}
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            {iconOnlyNavigation ? <ChevronRight className="h-4 w-4" /> : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
