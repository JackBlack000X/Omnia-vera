import { getDailyOccurrenceTotalForDate } from './occurrences';
import { isTravelLikeTipo, type Habit } from './schema';

export type LogicalMinuteRange = {
  start: number;
  end: number;
};

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

function getLogicalDayBounds(dayResetTime?: string): {
  resetMin: number;
  windowStart: number;
  windowEnd: number;
} {
  const resetMin = dayResetTime && dayResetTime !== '00:00' ? toMinutes(dayResetTime) : 0;
  return {
    resetMin,
    windowStart: resetMin,
    windowEnd: resetMin + 1440,
  };
}

function getLogicalDaySlices(
  ymd: string,
  resetMin: number,
): { ymd: string; displayOffset: number; minStart: number; minEnd: number }[] {
  if (resetMin === 0) {
    return [{ ymd, displayOffset: 0, minStart: 0, minEnd: 1440 }];
  }

  return [
    { ymd, displayOffset: 0, minStart: resetMin, minEnd: 1440 },
    { ymd: nextYmd(ymd), displayOffset: 1440, minStart: 0, minEnd: resetMin },
  ].filter((slice) => slice.minEnd > slice.minStart);
}

function normalizeRangeEnd(startMin: number, endMin: number | null): number {
  if (endMin === null) return Math.min(1440, startMin + 60);
  if (endMin <= startMin) return Math.min(1440, startMin + 60);
  return endMin;
}

function mergeMinuteRanges(ranges: LogicalMinuteRange[]): LogicalMinuteRange[] {
  if (ranges.length <= 1) return ranges;

  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: LogicalMinuteRange[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }

  return merged;
}

function getTravelActiveRangeForLogicalDate(h: Habit, ymd: string): LogicalMinuteRange | null {
  if (!isTravelLikeTipo(h.tipo) || !h.travel) return null;

  const travel = h.travel;
  if (h.tipo === 'vacanza') {
    const startOffset = diffDays(ymd, travel.giornoPartenza) * 1440;
    const endYmd = travel.giornoRitorno ?? travel.giornoPartenza;
    const endOffset = diffDays(ymd, endYmd) * 1440;
    const start = startOffset + toMinutes(travel.orarioPartenza);
    const endTime = travel.orarioArrivoRitorno ?? travel.orarioArrivo;
    if (!endTime) return null;
    const end = endOffset + toMinutes(endTime);
    if (end <= start) return null;
    return { start, end };
  }

  const departureOffset = diffDays(ymd, travel.giornoPartenza) * 1440;
  const departureStart = departureOffset + toMinutes(travel.orarioPartenza);
  let activeEnd =
    departureOffset + toMinutes(travel.orarioArrivo) + (travel.arrivoGiornoDopo ? 1440 : 0);

  if (travel.giornoRitorno) {
    const returnOffset = diffDays(ymd, travel.giornoRitorno) * 1440;
    if (travel.orarioArrivoRitorno) {
      activeEnd =
        returnOffset +
        toMinutes(travel.orarioArrivoRitorno) +
        (travel.arrivoRitornoGiornoDopo ? 1440 : 0);
    } else if (travel.orarioPartenzaRitorno) {
      activeEnd =
        returnOffset +
        toMinutes(travel.orarioPartenzaRitorno) +
        (travel.partenzaRitornoGiornoDopo ? 1440 : 0);
    }
  }

  if (activeEnd <= departureStart) return null;
  return { start: departureStart, end: activeEnd };
}

function travelAppearsOnLogicalDate(h: Habit, ymd: string, dayResetTime?: string): boolean {
  if (!isTravelLikeTipo(h.tipo) || !h.travel) return false;

  const { windowStart, windowEnd } = getLogicalDayBounds(dayResetTime);
  const segments: { start: number; end: number }[] = [];
  const travel = h.travel;

  if (h.tipo === 'vacanza') {
    const startOffset = diffDays(ymd, travel.giornoPartenza) * 1440;
    const endYmd = travel.giornoRitorno ?? travel.giornoPartenza;
    const endOffset = diffDays(ymd, endYmd) * 1440;
    const endTime = travel.orarioArrivoRitorno ?? travel.orarioArrivo;
    if (!endTime) return false;
    segments.push({
      start: startOffset + toMinutes(travel.orarioPartenza),
      end: endOffset + toMinutes(endTime),
    });

    return segments.some(({ start, end }) => rangesOverlap(start, end, windowStart, windowEnd));
  }

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

export function getTravelActiveRangesForLogicalDate(
  habits: Habit[],
  ymd: string,
  dayResetTime?: string,
): LogicalMinuteRange[] {
  const { windowStart, windowEnd } = getLogicalDayBounds(dayResetTime);
  const ranges = habits
    .map((habit) => getTravelActiveRangeForLogicalDate(habit, ymd))
    .filter((range): range is LogicalMinuteRange => !!range)
    .filter((range) => rangesOverlap(range.start, range.end, windowStart, windowEnd));

  return mergeMinuteRanges(ranges);
}

export function rangeOverlapsAny(
  start: number,
  end: number,
  ranges: LogicalMinuteRange[],
): boolean {
  return ranges.some((range) => rangesOverlap(start, end, range.start, range.end));
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

function getHabitOccurrenceRangesForLogicalDate(
  h: Habit,
  ymd: string,
  dayResetTime?: string,
): LogicalMinuteRange[] {
  if (isTravelLikeTipo(h.tipo)) return [];

  const { resetMin, windowStart, windowEnd } = getLogicalDayBounds(dayResetTime);
  const ranges: LogicalMinuteRange[] = [];

  if (appearsOnDateRaw(h, ymd)) {
    const { startMin, endMin } = getTaskTimesForDate(h, ymd);
    if (startMin === null && endMin === null) {
      ranges.push({ start: windowStart, end: windowEnd });
    }
  }

  for (const slice of getLogicalDaySlices(ymd, resetMin)) {
    if (!appearsOnDateRaw(h, slice.ymd)) continue;

    const { startMin, endMin } = getTaskTimesForDate(h, slice.ymd);
    if (startMin === null) continue;
    if (startMin < slice.minStart || startMin >= slice.minEnd) continue;

    const rangeDuration = Math.max(5, normalizeRangeEnd(startMin, endMin) - startMin);
    const { weekday, dayOfMonth } = datePartsFromYmd(slice.ymd);
    const occurrenceCount = getDailyOccurrenceTotalForDate(h, weekday, dayOfMonth);
    const specificGap =
      h.schedule?.weeklyGaps?.[weekday] ?? h.schedule?.monthlyGaps?.[dayOfMonth];
    const gapMin = Math.max(5, specificGap ?? h.occurrenceGapMinutes ?? 360);

    if (occurrenceCount <= 1) {
      ranges.push({
        start: slice.displayOffset + startMin,
        end: slice.displayOffset + startMin + rangeDuration,
      });
      continue;
    }

    const dayOverrides = h.occurrenceSlotOverrides?.[slice.ymd] ?? {};
    const anchorMin =
      dayOverrides[0] && isValidTimeString(dayOverrides[0].start)
        ? toMinutes(dayOverrides[0].start)
        : startMin;

    for (let slotIndex = 0; slotIndex < occurrenceCount; slotIndex++) {
      const slotOverride = dayOverrides[slotIndex];
      let slotStart = anchorMin + slotIndex * gapMin;
      let slotEnd = slotStart + rangeDuration;

      if (
        slotOverride &&
        isValidTimeString(slotOverride.start) &&
        isValidTimeString(slotOverride.end)
      ) {
        slotStart = toMinutes(slotOverride.start);
        slotEnd = Math.max(slotStart + 5, toMinutes(slotOverride.end));
      }

      if (slotStart >= 1440) break;
      if (slotStart < slice.minStart || slotStart >= slice.minEnd) continue;

      ranges.push({
        start: slice.displayOffset + slotStart,
        end: slice.displayOffset + slotEnd,
      });
    }
  }

  return ranges.filter((range) => rangesOverlap(range.start, range.end, windowStart, windowEnd));
}

function isHabitSuppressedDuringTravelWithRanges(
  h: Habit,
  ymd: string,
  dayResetTime: string | undefined,
  travelRanges: LogicalMinuteRange[],
): boolean {
  if (!h.pauseDuringTravel || isTravelLikeTipo(h.tipo)) return false;
  if (travelRanges.length === 0) return false;

  const habitRanges = getHabitOccurrenceRangesForLogicalDate(h, ymd, dayResetTime);
  if (habitRanges.length === 0) return false;

  return habitRanges.every((range) => rangeOverlapsAny(range.start, range.end, travelRanges));
}

export function isHabitSuppressedDuringTravel(
  h: Habit,
  habits: Habit[],
  ymd: string,
  dayResetTime?: string,
): boolean {
  const travelRanges = getTravelActiveRangesForLogicalDate(habits, ymd, dayResetTime);
  return isHabitSuppressedDuringTravelWithRanges(h, ymd, dayResetTime, travelRanges);
}

/** Returns true if the habit appears on ymd according to schedule/override rules only */
export function appearsOnDateRaw(h: Habit, ymd: string): boolean {
  if (isTravelLikeTipo(h.tipo) && h.travel) {
    return travelAppearsOnLogicalDate(h, ymd, '00:00');
  }

  if (h.smartTask?.nextDueDate) {
    return ymd >= h.smartTask.nextDueDate;
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
  const travelRanges = getTravelActiveRangesForLogicalDate(habits, ymd, dayResetTime);
  const resetMin = dayResetTime && dayResetTime !== '00:00' ? toMinutes(dayResetTime) : 0;
  if (resetMin === 0) {
    const nonTravelHabits = habits.filter(
      (h) =>
        !isTravelLikeTipo(h.tipo) &&
        appearsOnDateRaw(h, ymd) &&
        !isHabitSuppressedDuringTravelWithRanges(h, ymd, dayResetTime, travelRanges),
    );
    return [...nonTravelHabits, ...travelHabits];
  }

  const next = nextYmd(ymd);
  const result: Habit[] = [...travelHabits];

  for (const h of habits) {
    if (isTravelLikeTipo(h.tipo)) continue;
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

  return result.filter(
    (h) => isTravelLikeTipo(h.tipo) || !isHabitSuppressedDuringTravelWithRanges(h, ymd, dayResetTime, travelRanges),
  );
}

function nextYmd(ymd: string): string {
  const d = new Date(ymd + 'T12:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
