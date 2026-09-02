"use client";

import { CalendarClock } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

type AppDateTimeInputProps = {
  /** Local wall-clock value in the native datetime-local shape:
   * yyyy-mm-ddTHH:mm. This component deliberately performs no UTC conversion. */
  value: string;
  onChange?: (value: string) => void;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  readOnly?: boolean;
  tabIndex?: number;
  min?: string;
  max?: string;
  step?: number;
  "aria-label"?: string;
};

function formatLocalDateTime(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day, hour, minute] = match;
  return `${day}/${month}/${year} ${hour}:${minute}`;
}

export function parseAppDateTimeInput(value: string) {
  const match =
    /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})$/.exec(
      value.trim(),
    );
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year =
    match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const candidate = new Date(Date.UTC(year, month - 1, day, hour, minute));

  if (
    year < 1000 ||
    hour > 23 ||
    minute > 59 ||
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day ||
    candidate.getUTCHours() !== hour ||
    candidate.getUTCMinutes() !== minute
  )
    return null;

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function AppDateTimeInput({
  value,
  onChange,
  className,
  inputClassName,
  disabled,
  readOnly,
  tabIndex,
  min,
  max,
  step,
  "aria-label": ariaLabel,
}: AppDateTimeInputProps) {
  const [draft, setDraft] = useState(() => formatLocalDateTime(value));
  const [calendarPickerVersion, setCalendarPickerVersion] = useState(0);

  useEffect(() => {
    setDraft(formatLocalDateTime(value));
  }, [value]);

  const commitDraft = () => {
    if (!draft.trim()) {
      setDraft("");
      onChange?.("");
      return;
    }

    const parsed = parseAppDateTimeInput(draft);
    const inRange =
      parsed && (!min || parsed >= min) && (!max || parsed <= max);
    if (inRange) {
      setDraft(formatLocalDateTime(parsed));
      onChange?.(parsed);
    } else {
      setDraft(formatLocalDateTime(value));
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
        inputMode="numeric"
        placeholder="DD/MM/YYYY HH:mm"
        className={cn(
          "flex h-10 w-full rounded-md border border-[#cfd9e8] bg-white px-3 pr-10 text-sm text-foreground outline-none focus:border-[#8fb5ee] focus:ring-2 focus:ring-[#0f6cf6]/15 disabled:cursor-not-allowed disabled:opacity-50",
          inputClassName,
        )}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commitDraft();
          }
        }}
      />
      <CalendarClock
        className="pointer-events-none h-4 w-4 text-[#52657f]"
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
        }}
      />
      {!readOnly && !disabled ? (
        <input
          key={calendarPickerVersion}
          type="datetime-local"
          value={value}
          min={min}
          max={max}
          step={step}
          aria-label={`${ariaLabel ?? "Date and time"} calendar`}
          tabIndex={-1}
          className="z-10 cursor-pointer"
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: 40,
            height: "100%",
            opacity: 0.001,
          }}
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
