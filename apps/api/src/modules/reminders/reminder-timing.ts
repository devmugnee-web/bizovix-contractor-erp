export const DEFAULT_REMINDER_TIME_ZONE = "Asia/Dhaka";

export type SupportedRepeatType = "DAILY" | "WEEKLY" | "MONTHLY";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function safeTimeZone(timeZone?: string | null): string {
  const candidate = timeZone?.trim() || DEFAULT_REMINDER_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return DEFAULT_REMINDER_TIME_ZONE;
  }
}

function partsInTimeZone(date: Date, timeZone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function storedDateParts(date: Date): Pick<DateParts, "year" | "month" | "day"> {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function zonedDateTimeToUtc(parts: DateParts, timeZone: string): Date {
  const targetAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let timestamp = targetAsUtc;

  // Two passes cover ordinary timezone offsets and daylight-saving transitions.
  for (let pass = 0; pass < 2; pass += 1) {
    const actual = partsInTimeZone(new Date(timestamp), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    timestamp += targetAsUtc - actualAsUtc;
  }

  return new Date(timestamp);
}

function parseDueTime(value?: string | null): { hour: number; minute: number } | null {
  const match = value?.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  return match ? { hour: Number(match[1]), minute: Number(match[2]) } : null;
}

export function reminderDueAt(
  dueDate: Date,
  dueTime: string | null | undefined,
  timeZone: string,
): Date {
  const date = storedDateParts(dueDate);
  const time = parseDueTime(dueTime) ?? { hour: 0, minute: 0 };
  return zonedDateTimeToUtc({ ...date, ...time, second: 0 }, safeTimeZone(timeZone));
}

export function localDayRange(now: Date, timeZone: string): { start: Date; end: Date } {
  const local = partsInTimeZone(now, timeZone);
  const date = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);

  return {
    start: reminderDueAt(date, null, timeZone),
    end: reminderDueAt(next, null, timeZone),
  };
}

export function calendarDaysUntil(
  dueDate: Date,
  now: Date,
  timeZone: string,
  storedAsCalendarDate = true,
): number {
  const due = storedAsCalendarDate ? storedDateParts(dueDate) : partsInTimeZone(dueDate, timeZone);
  const current = partsInTimeZone(now, timeZone);
  const dueOrdinal = Date.UTC(due.year, due.month - 1, due.day) / 86_400_000;
  const currentOrdinal = Date.UTC(current.year, current.month - 1, current.day) / 86_400_000;
  return dueOrdinal - currentOrdinal;
}

export function isSupportedRepeatType(value?: string | null): value is SupportedRepeatType {
  return value === "DAILY" || value === "WEEKLY" || value === "MONTHLY";
}

export function advanceRecurringDate(date: Date, repeatType: SupportedRepeatType): Date {
  const next = new Date(date);
  if (repeatType === "DAILY") {
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (repeatType === "WEEKLY") {
    next.setUTCDate(next.getUTCDate() + 7);
    return next;
  }

  const year = next.getUTCFullYear();
  const month = next.getUTCMonth();
  const day = next.getUTCDate();
  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  return new Date(Date.UTC(year, month + 1, Math.min(day, lastDayOfNextMonth)));
}

export function nextRecurringDate(
  dueDate: Date,
  dueTime: string | null | undefined,
  repeatType: SupportedRepeatType,
  now: Date,
  timeZone: string,
): Date {
  let next = advanceRecurringDate(dueDate, repeatType);
  while (reminderDueAt(next, dueTime, timeZone).getTime() <= now.getTime()) {
    next = advanceRecurringDate(next, repeatType);
  }
  return next;
}
