const TZ = 'Europe/Zurich';

export function formatYmd(date = new Date(), tz = TZ): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
  }
}

export function getMonthYear(date: Date, tz = TZ): { year: number; month: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit',
    }).formatToParts(date);
    const year = parseInt(parts.find(p => p.type === 'year')?.value ?? '0', 10);
    const month = parseInt(parts.find(p => p.type === 'month')?.value ?? '0', 10);
    return { year, month };
  } catch {
    return { year: date.getFullYear(), month: date.getMonth() + 1 };
  }
}

export function getMonthName(month: number, tz = TZ): string {
  try {
    const d = new Date(2024, month - 1, 1);
    return new Intl.DateTimeFormat('it-IT', { timeZone: tz, month: 'long' }).format(d);
  } catch {
    const names = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
    return names[month - 1] ?? 'Mese';
  }
}

export function getCalendarDays(year: number, month: number, tz = TZ): Array<{ date: Date; isCurrentMonth: boolean; ymd: string }> {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0); // Last day of the month
  const start = new Date(first);
  // Calculate days to go back to Monday
  // getDay(): 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  // We want Monday = 0, so: (getDay() + 6) % 7 converts Sunday(0)->6, Monday(1)->0, etc.
  const dayOfWeek = first.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const daysToSubtract = (dayOfWeek + 6) % 7; // Convert to Monday=0: Sunday(0)->6, Monday(1)->0, ..., Saturday(6)->5
  start.setDate(start.getDate() - daysToSubtract);
  
  const end = new Date(last);
  const lastDayOfWeek = last.getDay();
  const daysToAdd = 6 - ((lastDayOfWeek + 6) % 7); // Days to add to reach Sunday
  end.setDate(end.getDate() + daysToAdd);
  
  const days: Array<{ date: Date; isCurrentMonth: boolean; ymd: string }> = [];
  const currentDate = new Date(start);
  while (currentDate <= end) {
    days.push({
      date: new Date(currentDate),
      isCurrentMonth: currentDate.getMonth() === month - 1,
      ymd: formatYmd(currentDate, tz),
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return days;
}

export function isToday(date: Date, tz = TZ): boolean {
  return formatYmd(date, tz) === formatYmd(new Date(), tz);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}
