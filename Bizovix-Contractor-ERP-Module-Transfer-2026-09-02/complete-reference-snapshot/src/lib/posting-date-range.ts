const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getLatestPostingMonthRange(dateKeys: string[]) {
  const latest = dateKeys.filter((dateKey) => DATE_KEY_PATTERN.test(dateKey)).sort().at(-1);
  if (!latest) return null;
  const [year, month] = latest.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const monthKey = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}`;
  return {
    from: `${monthKey}-01`,
    to: `${monthKey}-${lastDay.toString().padStart(2, "0")}`,
  };
}
