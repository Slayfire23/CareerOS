const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Display-only formatting for stored "YYYY-MM" values; anything unexpected is shown as stored.
export function formatMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  const index = match ? Number(match[2]) - 1 : -1;
  return match && index >= 0 && index < 12 ? `${MONTHS[index]} ${match[1]}` : value;
}

export function formatMonthRange(start: string, end: string | null) {
  return `${formatMonth(start)} – ${end === null ? "Present" : formatMonth(end)}`;
}
