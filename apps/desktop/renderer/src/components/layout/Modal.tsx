"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  contentClassName?: string;
  draggable?: boolean;
  workspace?: boolean;
  closeOnBackdrop?: boolean;
  portal?: boolean;
}

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

type ModalContentProps = Omit<ModalProps, "open" | "portal">;

export function Modal({ open, portal = false, ...props }: ModalProps) {
  if (!open) return null;

  const content = <ModalContent {...props} />;
  return portal && typeof document !== "undefined" ? createPortal(content, document.body) : content;
}

function ModalContent({
  onClose,
  title,
  children,
  wide = false,
  contentClassName = "",
  draggable = false,
  workspace = false,
  closeOnBackdrop = true,
}: ModalContentProps) {
  const headingId = React.useId();
  const [dragOffset, setDragOffset] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const dragStateRef = React.useRef<DragState | null>(null);
  const previousUserSelectRef = React.useRef("");

  const finishDragging = React.useCallback(() => {
    dragStateRef.current = null;
    setDragging(false);

    if (typeof document !== "undefined") {
      document.body.style.userSelect = previousUserSelectRef.current;
    }
  }, []);

  React.useEffect(
    () => () => {
      if (dragStateRef.current && typeof document !== "undefined") {
        document.body.style.userSelect = previousUserSelectRef.current;
      }
    },
    [],
  );

  const startDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggable || event.button !== 0 || (event.target as HTMLElement).closest("button")) {
      return;
    }

    const dialog = dialogRef.current;
    if (!dialog) return;

    const boundsMargin = 8;
    const rect = dialog.getBoundingClientRect();
    const availableX = Math.max(0, (window.innerWidth - rect.width) / 2 - boundsMargin);
    const availableY = Math.max(0, (window.innerHeight - rect.height) / 2 - boundsMargin);

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
      minX: -availableX,
      maxX: availableX,
      minY: -availableY,
      maxY: availableY,
    };
    previousUserSelectRef.current = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };

  const moveDialog = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    const nextX = dragState.originX + event.clientX - dragState.startX;
    const nextY = dragState.originY + event.clientY - dragState.startY;
    setDragOffset({
      x: Math.min(dragState.maxX, Math.max(dragState.minX, nextX)),
      y: Math.min(dragState.maxY, Math.max(dragState.minY, nextY)),
    });
  };

  const stopDragging = (event: React.PointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishDragging();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/40 ${workspace ? "p-2 sm:p-4" : "p-4"}`}
      onClick={closeOnBackdrop ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className={`w-full ${wide ? "max-w-5xl" : "max-w-md"} ${workspace ? "flex min-h-0 flex-col overflow-hidden rounded-xl border border-biz-border bg-white shadow-[0_22px_70px_rgba(7,27,73,0.22)]" : "rounded-lg bg-biz-surface p-5 shadow-card-hover"} ${contentClassName}`}
        style={{ transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`flex items-center justify-between ${workspace ? "mb-0 shrink-0 border-b border-biz-border bg-white px-4 py-3 sm:px-5" : "mb-4"} ${
            draggable
              ? `select-none touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`
              : ""
          }`}
          title={draggable ? "Drag to move" : undefined}
          onPointerDown={startDragging}
          onPointerMove={moveDialog}
          onPointerUp={stopDragging}
          onPointerCancel={stopDragging}
        >
          <h3
            id={headingId}
            className={`${workspace ? "text-[17px] font-bold" : "text-[16px] font-semibold"} text-biz-text`}
          >
            {title}
          </h3>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className={`${workspace ? "flex h-8 w-8 items-center justify-center rounded-md hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-biz-blue/40" : ""} text-biz-muted hover:text-biz-text`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
