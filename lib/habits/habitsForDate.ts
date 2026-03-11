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

/**
 * Returns habits that "appear" on the given date (same logic as tasks tab for "today").
 * Used by calendar and setDayCompletion so completion % matches the tasks tab.
 */
export function getHabitsAppearingOnDate(habits: Habit[], ymd: string): Habit[] {
  const { weekday, dayOfMonth, monthIndex } = datePartsFromYmd(ymd);
  return habits.filter((h) => {
    const hasOverrideForDay = !!h.timeOverrides?.[ymd];
    if (h.createdAt && ymd < h.createdAt && !hasOverrideForDay) return false;
    const repeatStartDate = h.schedule?.repeatStartDate;
    if (repeatStartDate && ymd < repeatStartDate && !hasOverrideForDay) return false;
    const repeatEndDate = h.schedule?.repeatEndDate;
    if (repeatEndDate && ymd > repeatEndDate && !hasOverrideForDay) return false;
    const isSingle =
      h.habitFreq === 'single' ||
      (!h.habitFreq &&
        (Object.keys(h.timeOverrides ?? {}).length > 0) &&
        (h.schedule?.daysOfWeek?.length ?? 0) === 0 &&
        !h.schedule?.monthDays?.length &&
        !h.schedule?.yearMonth);
    if (isSingle && !hasOverrideForDay) return false;
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
  });
}
