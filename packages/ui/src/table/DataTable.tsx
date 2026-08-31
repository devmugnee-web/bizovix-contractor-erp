import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "../lib/cn";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  /** Renders the header as a clickable sort toggle with a small direction indicator. */
  sortable?: boolean;
  sortDirection?: "asc" | "desc" | null;
  onSort?: () => void;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  isLoading?: boolean;
  emptyMessage?: string;
  /** Extra classes merged onto the scroll container. Use to opt into vertical scrolling (e.g. "flex-1 min-h-0 overflow-y-auto"). */
  containerClassName?: string;
  /** Extra classes merged onto the table element (e.g. "table-fixed min-w-0" for a no-scroll layout). */
  tableClassName?: string;
  /** Pins the header row to the top of the scroll container with a solid background. */
  stickyHeader?: boolean;
  /** Makes each data row actionable. Interactive controls inside the row keep their own behavior. */
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  isLoading = false,
  emptyMessage = "No records found",
  containerClassName,
  tableClassName,
  stickyHeader = false,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className={cn("overflow-x-auto", containerClassName)}>
      <table className={cn("w-full min-w-[720px] text-left text-[13px]", tableClassName)}>
        <thead>
          <tr className={cn("bg-biz-bg", stickyHeader && "sticky top-0 z-10")}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 font-medium text-biz-muted",
                  stickyHeader && "bg-biz-bg",
                  col.className,
                )}
              >
                {col.sortable ? (
                  <button
                    type="button"
                    onClick={col.onSort}
                    className="inline-flex items-center gap-1 hover:text-biz-text"
                  >
                    {col.header}
                    {col.sortDirection === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : col.sortDirection === "desc" ? (
                      <ArrowDown className="h-3 w-3" />
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-50" />
                    )}
                  </button>
                ) : (
                  col.header
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-biz-muted">
                Loading...
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-biz-muted">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr
                key={rowKey(row)}
                className={cn(
                  "border-t border-biz-border",
                  onRowClick && "cursor-pointer transition-colors hover:bg-biz-blue-soft/40 focus-visible:bg-biz-blue-soft/40 focus-visible:outline-none",
                )}
                tabIndex={onRowClick ? 0 : undefined}
                role={onRowClick ? "link" : undefined}
                onClick={(event) => {
                  if (!onRowClick || (event.target as HTMLElement).closest("a, button, input, select, textarea")) return;
                  onRowClick(row);
                }}
                onKeyDown={(event) => {
                  if (!onRowClick || (event.key !== "Enter" && event.key !== " ")) return;
                  event.preventDefault();
                  onRowClick(row);
                }}
              >
                {columns.map((col) => (
                  <td key={col.key} className={cn("px-4 py-3 text-biz-text", col.className)}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
