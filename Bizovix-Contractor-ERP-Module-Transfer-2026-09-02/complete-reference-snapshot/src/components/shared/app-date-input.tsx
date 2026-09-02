"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type AppDateInputProps = {
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  tabIndex?: number;
  /** ISO (yyyy-mm-dd) bounds, same as a native date input's min/max. A typed
   * or picked date outside this range is rejected like any other invalid
   * entry — the draft reverts to the last committed value. */
  min?: string;
  max?: string;
  "aria-label"?: string;
  "data-workflow-date"?: string;
  "data-po-date"?: string;
  "data-purchase-bill-date"?: string;
  "data-receipt-note-date"?: string;
  "data-purchase-return-date"?: string;
  "data-payment-out-date"?: string;
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const POSTING_DATE_LABELS = new Set(["Voucher Date", "Bill Date", "Purchase Order Date", "Receipt Date", "Invoice Date"]);

function formatIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function parseAppDateInput(value: string) {
  const normalized = value.trim();
  const numericMatch = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})$/.exec(normalized);
  const namedMatch = /^(\d{1,2})\s+([a-z]{3,9})\s+(\d{2}|\d{4})$/i.exec(normalized);
  if (!numericMatch && !namedMatch) return null;

  const day = Number((numericMatch ?? namedMatch)![1]);
  const yearText = (numericMatch ?? namedMatch)![3];
  const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
  const month = numericMatch
    ? Number(numericMatch[2])
    : SHORT_MONTHS.findIndex((name) => name.toLowerCase() === namedMatch![2].slice(0, 3).toLowerCase()) + 1;
  const candidate = new Date(year, month - 1, day);

  if (
    year < 1000 ||
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function AppDateInput({
  value,
  onChange,
  className,
  inputClassName,
  disabled,
  readOnly,
  tabIndex,
  min,
  max,
  "aria-label": ariaLabel,
  "data-workflow-date": workflowDate,
  "data-po-date": purchaseOrderDate,
  "data-purchase-bill-date": purchaseBillDate,
  "data-receipt-note-date": receiptNoteDate,
  "data-purchase-return-date": purchaseReturnDate,
  "data-payment-out-date": paymentOutDate,
}: AppDateInputProps) {
  const [draft, setDraft] = useState(() => formatIsoDate(value));
  const [calendarPickerVersion, setCalendarPickerVersion] = useState(0);
  const calendarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(formatIsoDate(value));
  }, [value]);

  const commitDraft = () => {
    if (!draft.trim()) {
      setDraft("");
      onChange?.("");
      return;
    }

    const parsed = parseAppDateInput(draft);
    const inRange = parsed && (!min || parsed >= min) && (!max || parsed <= max);
    if (inRange) {
      setDraft(formatIsoDate(parsed));
      onChange?.(parsed);
    } else {
      setDraft(formatIsoDate(value));
    }
  };

  return (
    <div className={cn("relative", className)}>
      <input
        type="text"
        value={draft}
        disabled={disabled}
        readOnly={readOnly}
        tabIndex={tabIndex}
        aria-label={ariaLabel}
        data-workflow-date={workflowDate}
        data-voucher-posting-date={ariaLabel && POSTING_DATE_LABELS.has(ariaLabel) ? "true" : undefined}
        data-po-date={purchaseOrderDate}
        data-purchase-bill-date={purchaseBillDate}
        data-receipt-note-date={receiptNoteDate}
        data-purchase-return-date={purchaseReturnDate}
        data-payment-out-date={paymentOutDate}
        inputMode="numeric"
        placeholder="DD/MM/YYYY"
        className={cn(
          "flex h-10 w-full rounded-md border border-[#cfd9e8] bg-white px-3 pr-10 text-sm text-foreground outline-none focus:border-[#8fb5ee] focus:ring-2 focus:ring-[#0f6cf6]/15 disabled:cursor-not-allowed disabled:opacity-50",
          inputClassName,
        )}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            // Purchase Order owns the Date -> Party keyboard sequence at the
            // form level. Let that Enter bubble; all other date fields retain
            // the component's submit-prevention behaviour.
            if (!purchaseOrderDate && !purchaseBillDate && !receiptNoteDate && !purchaseReturnDate && !paymentOutDate) event.preventDefault();
            commitDraft();
          }
        }}
      />
      {readOnly || disabled ? (
        <CalendarDays
          className="pointer-events-none h-4 w-4 text-[#52657f]"
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}
        />
      ) : (
        // A plain click on the invisible native date input below used to be
        // what opened its picker, but that put two things in the way: (1) a
        // hovered card's own hover-lift leaves an active CSS transform on an
        // ancestor while the click happens, and Chromium silently refuses to
        // open a native date/color picker under those conditions (see the
        // `.erp-card:has(input[type="date"])` override in globals.css for
        // that half of the fix); (2) Chrome's native date input only treats
        // its own rightmost few pixels as the "open the picker" hotspot, so a
        // click landing anywhere else on the decorative icon just focused the
        // (invisible) input without opening anything — from the outside that
        // looked like "the icon works if I click slightly to its right".
        // A real button covering the same click zone, whose only job is
        // calling `showPicker()` explicitly, doesn't depend on hitting either
        // undocumented hotspot.
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${ariaLabel ?? "Date"} calendar`}
          // Plain Tailwind `absolute` loses here: the global `button { position:
          // relative }` rule (globals.css, unlayered) always beats a layered
          // Tailwind utility of the same importance regardless of source order,
          // so positioning has to go through the style attribute instead — the
          // same reason the icon and native input below are positioned this way.
          style={{ position: "absolute", right: 0, top: 0, width: 40, height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => {
            const input = calendarInputRef.current;
            if (!input) return;
            if (typeof input.showPicker === "function") {
              try {
                input.showPicker();
                return;
              } catch {
                // showPicker() throws without a genuine user gesture, or
                // isn't implemented at all on older engines — either way,
                // fall back to the input's own default click behaviour.
              }
            }
            input.focus();
            input.click();
          }}
        >
          <CalendarDays className="pointer-events-none h-4 w-4 text-[#52657f]" aria-hidden />
        </button>
      )}
      {!readOnly && !disabled ? (
        <input
          ref={calendarInputRef}
          key={calendarPickerVersion}
          type="date"
          value={value}
          min={min}
          max={max}
          aria-label={`${ariaLabel ?? "Date"} calendar input`}
          tabIndex={-1}
          className="pointer-events-none"
          style={{ position: "absolute", right: 0, top: 0, width: 40, height: "100%", opacity: 0 }}
          onChange={(event) => {
            onChange?.(event.target.value);
            event.currentTarget.blur();
            setCalendarPickerVersion((version) => version + 1);
          }}
        />
      ) : null}
    </div>
  );
}
