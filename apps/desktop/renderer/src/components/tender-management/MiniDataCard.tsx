"use client";

import * as React from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import { DataTable, IconButton, TextInput, cn, type DataTableColumn } from "@bizovix/ui";

export interface MiniDataCardProps<T> {
  id?: string;
  badgeNumber: number;
  badgeClassName: string;
  title: string;
  subtitle: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  addLabel?: string;
  onAdd?: () => void;
  columns: DataTableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  footerLabel: string;
  onFooterClick?: () => void;
}

export function MiniDataCard<T>({
  id,
  badgeNumber,
  badgeClassName,
  title,
  subtitle,
  searchValue,
  onSearchChange,
  addLabel,
  onAdd,
  columns,
  data,
  rowKey,
  footerLabel,
  onFooterClick,
}: MiniDataCardProps<T>) {
  return (
    <div
      id={id}
      className="flex flex-col overflow-hidden rounded-xl border border-biz-border bg-biz-surface shadow-[0_2px_10px_rgba(15,23,42,0.05)]"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-biz-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[11px] font-bold",
              badgeClassName,
            )}
          >
            {badgeNumber}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-[12.5px] font-semibold leading-tight text-biz-text">{title}</h3>
            <p className="truncate text-[10.5px] leading-tight text-biz-muted">{subtitle}</p>
          </div>
        </div>
        {addLabel && (
          <IconButton
            aria-label={addLabel}
            title={onAdd ? addLabel : `${addLabel} (not yet available)`}
            onClick={onAdd}
            disabled={!onAdd}
            className="h-7 w-7 shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
          </IconButton>
        )}
      </div>

      {onSearchChange && (
        <div className="shrink-0 border-b border-biz-border px-3 py-1.5">
          <TextInput
            icon={Search}
            placeholder="Search by Tender ID..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-7 text-[11.5px]"
          />
        </div>
      )}

      <DataTable<T> data={data} rowKey={rowKey} columns={columns} />

      <button
        type="button"
        onClick={onFooterClick}
        disabled={!onFooterClick}
        title={onFooterClick ? undefined : `${footerLabel} (not yet available)`}
        className="group/link flex shrink-0 items-center justify-between border-t border-biz-border px-3 py-1.5 text-[11px] font-semibold text-biz-blue transition-colors hover:text-biz-blue-hover disabled:cursor-not-allowed disabled:text-biz-muted disabled:hover:text-biz-muted"
      >
        {footerLabel}
        <ChevronRight className="h-3 w-3 transition-transform group-hover/link:translate-x-0.5" />
      </button>
    </div>
  );
}
