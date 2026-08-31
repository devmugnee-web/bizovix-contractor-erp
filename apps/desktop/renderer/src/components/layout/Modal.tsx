"use client";

import * as React from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  contentClassName?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide = false,
  contentClassName = "",
}: ModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`w-full ${wide ? "max-w-5xl" : "max-w-md"} rounded-lg bg-biz-surface p-5 shadow-card-hover ${contentClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-biz-text">{title}</h3>
          <button type="button" onClick={onClose} className="text-biz-muted hover:text-biz-text">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
