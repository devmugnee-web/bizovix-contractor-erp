const DAY_MS = 86_400_000;

/** Revised Completion Date formula (master task section 32): calendar-correct day addition
 * from the snapshot taken when this EOT was requested — never approximated by month length,
 * and never re-derived from a possibly-already-moved "current" contract date. Pure function. */
export function calculateRevisedCompletionDate(previousCompletionDate: Date, approvedDays: number): Date {
  return new Date(previousCompletionDate.getTime() + approvedDays * DAY_MS);
}
