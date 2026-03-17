import type { Habit } from './schema';

/** Parse YYYY-MM-DD at noon UTC so the calendar day is unambiguous across timezones */
function datePartsFromYmd(ymd: string): { weekday: number; dayOfMonth: number; monthIndex: number } {
  const d = new Date(ymd + 'T12:00:00.000Z');
  return {
    weekday: d.getUTCDay(),
    dayOfMonth: d.getUTCDate(),
    monthIndex: d.getUTCMonth() + 1,
  };
}

function prevYmd(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function toMinutes(hhmm: string): number {
  if (hhmm === '24:00') return 1440;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Get effective start/end minutes for a habit on a given date */
function getTaskTimesForDate(
  h: Habit,
  ymd: string,
): { startMin: number | null; endMin: number | null } {
  const { weekday, dayOfMonth } = datePartsFromYmd(ymd);
  const override = h.timeOverrides?.[ymd];
  const isAllDayMarker = override === '00:00';
  if (isAllDayMarker) return { startMin: null, endMin: null };

  const overrideStart =
    typeof override === 'string' ? override : (override as any)?.start ?? null;
  const overrideEnd =
    typeof override === 'object' && override !== null ? (override as any).end ?? null : null;

  const weekly = h.schedule?.weeklyTimes?.[weekday] ?? null;
  const monthlyT = h.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
  const start = overrideStart ?? weekly?.start ?? monthlyT?.start ?? h.schedule?.time ?? null;
  const end = overrideEnd ?? weekly?.end ?? monthlyT?.end ?? h.schedule?.endTime ?? null;

  return {
    startMin: start ? toMinutes(start) : null,
    endMin: end ? toMinutes(end) : null,
  };
}

/** Returns true if this task spans the reset boundary on the given date */
function spansReset(h: Habit, ymd: string, resetMin: number): boolean {
  if (h.tipo !== 'task') return false;
  const { startMin, endMin } = getTaskTimesForDate(h, ymd);
  if (startMin === null || endMin === null) return false;
  return startMin < resetMin && endMin > resetMin;
}

/** Returns true if the habit appears on ymd according to schedule/override rules only */
function appearsOnDateRaw(h: Habit, ymd: string): boolean {
  const { weekday, dayOfMonth, monthIndex } = datePartsFromYmd(ymd);
  const hasOverrideForDay = !!h.timeOverrides?.[ymd];
  if (h.createdAt && ymd < h.createdAt && !hasOverrideForDay) return false;
  const repeatStartDate = h.schedule?.repeatStartDate;
  if (repeatStartDate && ymd < repeatStartDate && !hasOverrideForDay) return false;
  const repeatEndDate = h.schedule?.repeatEndDate;
  if (repeatEndDate && ymd > repeatEndDate && !hasOverrideForDay) return false;
  const isSingle =
    h.habitFreq === 'single' ||
    (!h.habitFreq &&
      (h.schedule?.daysOfWeek?.length ?? 0) === 0 &&
      !h.schedule?.monthDays?.length &&
      !h.schedule?.yearMonth);

  if (isSingle) {
    const hasAnyOverride = Object.keys(h.timeOverrides ?? {}).length > 0;
    if (!hasOverrideForDay) {
      // If it's single and has NO overrides at all, it only appears on its creation day.
      // If it DOES have overrides, it ONLY appears on the days where it has an override.
      if (hasAnyOverride || ymd !== h.createdAt) return false;
    }
  }

  const sched = h.schedule;
  if (!sched || isSingle) return true;
  const dow = sched.daysOfWeek ?? [];
  const mdays = sched.monthDays ?? [];
  const yrM = sched.yearMonth ?? null;
  const yrD = sched.yearDay ?? null;
  const weeklyApplies = dow.length === 0 || dow.includes(weekday);
  const monthlyApplies = mdays.length > 0 ? mdays.includes(dayOfMonth) : true;
  const annualApplies = yrM && yrD ? yrM === monthIndex && yrD === dayOfMonth : true;
  return weeklyApplies && monthlyApplies && annualApplies;
}

/**
 * Returns habits that "appear" on the given date (same logic as tasks tab for "today").
 * Used by calendar and setDayCompletion so completion % matches the tasks tab.
 *
 * When dayResetTime is provided (and not '00:00'), tasks that start before the reset
 * and end after the reset on day D are excluded from D and included on D+1 instead.
 */
export function getHabitsAppearingOnDate(habits: Habit[], ymd: string, dayResetTime?: string): Habit[] {
  const resetMin = dayResetTime && dayResetTime !== '00:00' ? toMinutes(dayResetTime) : 0;
  const prev = prevYmd(ymd);

  const result: Habit[] = [];

  for (const h of habits) {
    if (appearsOnDateRaw(h, ymd)) {
      if (resetMin > 0 && spansReset(h, ymd, resetMin)) {
        continue;
      }
      result.push(h);
    } else if (resetMin > 0 && h.tipo === 'task' && appearsOnDateRaw(h, prev) && spansReset(h, prev, resetMin)) {
      result.push(h);
    }
  }

  return result;
}
