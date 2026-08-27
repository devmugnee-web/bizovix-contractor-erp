import { ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "../lib/cn";

export interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** When provided (with onLimitChange), renders a "Show [x] entries" rows-per-page selector. */
  pageSizeOptions?: number[];
  onLimitChange?: (limit: number) => void;
  /** Adds "jump to first page" / "jump to last page" chevron buttons on either end. */
  showJumpButtons?: boolean;
}

function buildPageList(page: number, totalPages: number): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);

  const result: (number | "...")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) result.push("...");
    result.push(p);
  });
  return result;
}

export function Pagination({
  page,
  limit,
  total,
  totalPages,
  onPageChange,
  pageSizeOptions,
  onLimitChange,
  showJumpButtons = false,
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const pages = buildPageList(page, totalPages);

  const showSizeSelector = pageSizeOptions && onLimitChange;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
      <span className="text-[12px] text-biz-muted">
        Showing {from.toLocaleString()} to {to.toLocaleString()} of {total.toLocaleString()} entries
      </span>
      <div className="flex items-center gap-2">
        {showSizeSelector && (
          <>
            <label className="flex items-center gap-1.5 text-[12px] text-biz-muted">
              Show
              <div className="relative">
                <select
                  value={limit}
                  onChange={(e) => onLimitChange(Number(e.target.value))}
                  className="h-8 w-[52px] appearance-none rounded-md border border-biz-border bg-biz-surface pl-2 pr-5 text-[12px] font-semibold text-biz-text focus:outline-none focus:ring-2 focus:ring-biz-blue/30"
                >
                  {pageSizeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-biz-muted" />
              </div>
            </label>
            <span className="h-5 w-px bg-biz-border" />
          </>
        )}
        <div className="flex items-center gap-1.5">
          {showJumpButtons && (
            <button
              type="button"
              aria-label="First page"
              disabled={page <= 1}
              onClick={() => onPageChange(1)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-biz-border bg-biz-surface text-biz-text disabled:opacity-40"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-biz-border bg-biz-surface text-biz-text disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          {pages.map((p, i) =>
            p === "..." ? (
              <span key={`ellipsis-${i}`} className="px-1.5 text-biz-muted">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border text-[13px] font-medium",
                  p === page
                    ? "border-biz-blue bg-biz-blue text-white"
                    : "border-biz-border bg-biz-surface text-biz-text hover:bg-biz-bg",
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="Next page"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-biz-border bg-biz-surface text-biz-text disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {showJumpButtons && (
            <button
              type="button"
              aria-label="Last page"
              disabled={page >= totalPages}
              onClick={() => onPageChange(totalPages)}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-biz-border bg-biz-surface text-biz-text disabled:opacity-40"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
