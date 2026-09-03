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
  draggable?: boolean;
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

type ModalContentProps = Omit<ModalProps, "open">;

export function Modal({ open, ...props }: ModalProps) {
  if (!open) return null;

  return <ModalContent {...props} />;
}

function ModalContent({
  onClose,
  title,
  children,
  wide = false,
  contentClassName = "",
  draggable = false,
}: ModalContentProps) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`w-full ${wide ? "max-w-5xl" : "max-w-md"} rounded-lg bg-biz-surface p-5 shadow-card-hover ${contentClassName}`}
        style={{ transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={`mb-4 flex items-center justify-between ${
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
          <h3 className="text-[16px] font-semibold text-biz-text">{title}</h3>
          <button
            type="button"
            aria-label="Close modal"
            onClick={onClose}
            className="text-biz-muted hover:text-biz-text"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
