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
  const last = new Date(year, month, 0);
  const start = new Date(first);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday = 0
  const end = new Date(last);
  end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)));
  const days: Array<{ date: Date; isCurrentMonth: boolean; ymd: string }> = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push({
      date: new Date(d),
      isCurrentMonth: d.getMonth() === month - 1,
      ymd: formatYmd(d, tz),
    });
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
