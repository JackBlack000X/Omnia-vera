import type { Habit } from './schema';

function isValidTimeString(hhmm: string | null | undefined): hhmm is string {
  if (typeof hhmm !== 'string') return false;
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes < 0 || minutes > 59) return false;
  if (hours < 0 || hours > 24) return false;
  if (hours === 24 && minutes !== 0) return false;
  return true;
}

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

function diffDays(fromYmd: string, toYmd: string): number {
  const from = new Date(fromYmd + 'T12:00:00.000Z');
  const to = new Date(toYmd + 'T12:00:00.000Z');
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

function travelAppearsOnLogicalDate(h: Habit, ymd: string, dayResetTime?: string): boolean {
  if (h.tipo !== 'viaggio' || !h.travel) return false;

  const resetMin = dayResetTime && dayResetTime !== '00:00' ? toMinutes(dayResetTime) : 0;
  const windowStart = resetMin;
  const windowEnd = resetMin + 1440;
  const segments: Array<{ start: number; end: number }> = [];
  const travel = h.travel;

  const departureOffset = diffDays(ymd, travel.giornoPartenza) * 1440;
  segments.push({
    start: departureOffset + toMinutes(travel.orarioPartenza),
    end: departureOffset + toMinutes(travel.orarioArrivo) + (travel.arrivoGiornoDopo ? 1440 : 0),
  });

  if (travel.giornoRitorno && travel.orarioPartenzaRitorno && travel.orarioArrivoRitorno) {
    const returnOffset = diffDays(ymd, travel.giornoRitorno) * 1440;
    segments.push({
      start: returnOffset + toMinutes(travel.orarioPartenzaRitorno) + (travel.partenzaRitornoGiornoDopo ? 1440 : 0),
      end: returnOffset + toMinutes(travel.orarioArrivoRitorno) + (travel.arrivoRitornoGiornoDopo ? 1440 : 0),
    });
  }

  return segments.some(({ start, end }) => rangesOverlap(start, end, windowStart, windowEnd));
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

  const rawOverrideStart =
    typeof override === 'string' ? override : (override as any)?.start ?? null;
  const rawOverrideEnd =
    typeof override === 'object' && override !== null ? (override as any).end ?? null : null;
  const overrideStart = isValidTimeString(rawOverrideStart) ? rawOverrideStart : null;
  const overrideEnd = isValidTimeString(rawOverrideEnd) ? rawOverrideEnd : null;

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
export function appearsOnDateRaw(h: Habit, ymd: string): boolean {
  if (h.tipo === 'viaggio' && h.travel) {
    return travelAppearsOnLogicalDate(h, ymd, '00:00');
  }

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
/**
 * Returns habits that "appear" on the given logical date.
 * A logical day starting at dayResetTime (e.g., 06:00) includes:
 * 1. Tasks scheduled for YMD that start AT OR AFTER the reset.
 * 2. Tasks scheduled for YMD+1 that start BEFORE the reset.
 * 3. All-day tasks scheduled for YMD.
 */
export function getHabitsAppearingOnDate(habits: Habit[], ymd: string, dayResetTime?: string): Habit[] {
  const travelHabits = habits.filter((h) => travelAppearsOnLogicalDate(h, ymd, dayResetTime));
  const resetMin = dayResetTime && dayResetTime !== '00:00' ? toMinutes(dayResetTime) : 0;
  if (resetMin === 0) {
    const nonTravelHabits = habits.filter((h) => h.tipo !== 'viaggio' && appearsOnDateRaw(h, ymd));
    return [...nonTravelHabits, ...travelHabits];
  }

  const next = nextYmd(ymd);
  const result: Habit[] = [...travelHabits];

  for (const h of habits) {
    if (h.tipo === 'viaggio') continue;
    // Check if it's an all-day task for this logical day
    const isAllDayForYmd = appearsOnDateRaw(h, ymd) && (() => {
      const { startMin, endMin } = getTaskTimesForDate(h, ymd);
      return startMin === null && endMin === null;
    })();

    if (isAllDayForYmd) {
      result.push(h);
      continue;
    }

    // Check if it starts on YMD after or at reset
    if (appearsOnDateRaw(h, ymd)) {
      const { startMin } = getTaskTimesForDate(h, ymd);
      if (startMin !== null && startMin >= resetMin) {
        result.push(h);
        continue;
      }
    }

    // Check if it starts on YMD+1 before reset
    if (appearsOnDateRaw(h, next)) {
      const { startMin } = getTaskTimesForDate(h, next);
      if (startMin !== null && startMin < resetMin) {
        result.push(h);
        continue;
      }
    }
  }

  return result;
}

function nextYmd(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
