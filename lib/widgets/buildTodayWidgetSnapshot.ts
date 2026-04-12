import { appearsOnDateRaw, getHabitsAppearingOnDate } from '../habits/habitsForDate';
import {
  getDailyOccurrenceTotal,
  getDailyOccurrenceTotalForDate,
  getOccurrenceDoneForDay,
} from '../habits/occurrences';
import type { Habit, HabitsState } from '../habits/schema';

export type WidgetCommand = {
  kind: 'toggleHabit';
  habitId: string;
  logicalDate: string;
};

export type TodayWidgetOccurrenceSlot = {
  start: number;
  end: number;
  isTimed: boolean;
};

export type TodayWidgetItem = {
  id: string;
  title: string;
  color: string | null;
  timeLabel: string | null;
  occurrenceSlots: TodayWidgetOccurrenceSlot[];
  currentCount: number;
  targetCount: number;
  isComplete: boolean;
  canIncrement: boolean;
  deeplink: string;
  action: WidgetCommand;
};

export type TodayWidgetSnapshot = {
  version: 1;
  logicalDate: string;
  dayResetTime: string;
  generatedAt: string;
  openAppDeeplink: string;
  progress: {
    completedCount: number;
    totalCount: number;
  };
  items: TodayWidgetItem[];
};

type BuildTodayWidgetSnapshotArgs = {
  habits: Habit[];
  history: HabitsState['history'];
  logicalDate: string;
  dayResetTime: string;
  currentDate?: Date;
  maxVisibleItems?: number;
  urlPrefix?: string;
};

type WidgetTimingPriority = {
  group: number;
  minute: number;
  timeLabel: string | null;
};

const WIDGET_TIME_ZONE = 'Europe/Zurich';

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

function toMinutes(hhmm: string): number {
  if (hhmm === '24:00') return 1440;
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
}

function formatMinutesAsHhmm(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function nextYmd(ymd: string): string {
  const date = new Date(`${ymd}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function datePartsFromYmd(ymd: string): { weekday: number; dayOfMonth: number } {
  const date = new Date(`${ymd}T12:00:00.000Z`);
  return {
    weekday: date.getUTCDay(),
    dayOfMonth: date.getUTCDate(),
  };
}

function normalizeRangeEnd(startMin: number, endMin: number | null): number {
  if (endMin === null || endMin <= startMin) {
    return Math.min(1440, startMin + 60);
  }

  return endMin;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB;
}

function getLogicalDaySlices(
  logicalDate: string,
  resetMinutes: number,
): Array<{ ymd: string; displayOffset: number; minStart: number; minEnd: number }> {
  if (resetMinutes === 0) {
    return [{ ymd: logicalDate, displayOffset: 0, minStart: 0, minEnd: 1440 }];
  }

  return [
    { ymd: logicalDate, displayOffset: 0, minStart: resetMinutes, minEnd: 1440 },
    { ymd: nextYmd(logicalDate), displayOffset: 1440, minStart: 0, minEnd: resetMinutes },
  ].filter((slice) => slice.minEnd > slice.minStart);
}

function getTaskTimeRangeForDate(
  habit: Habit,
  ymd: string,
): { startMin: number | null; endMin: number | null } {
  const { weekday, dayOfMonth } = datePartsFromYmd(ymd);
  const override = habit.timeOverrides?.[ymd];
  const isAllDayMarker = override === '00:00';
  if (isAllDayMarker) {
    return { startMin: null, endMin: null };
  }

  const rawOverrideStart =
    typeof override === 'string' ? override : override?.start ?? null;
  const rawOverrideEnd =
    typeof override === 'object' && override !== null ? override.end ?? null : null;
  const overrideStart = isValidTimeString(rawOverrideStart) ? rawOverrideStart : null;
  const overrideEnd = isValidTimeString(rawOverrideEnd) ? rawOverrideEnd : null;

  const weekly = habit.schedule?.weeklyTimes?.[weekday] ?? null;
  const monthly = habit.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
  const start = overrideStart ?? weekly?.start ?? monthly?.start ?? habit.schedule?.time ?? null;
  const end = overrideEnd ?? weekly?.end ?? monthly?.end ?? habit.schedule?.endTime ?? null;

  return {
    startMin: start && isValidTimeString(start) ? toMinutes(start) : null,
    endMin: end && isValidTimeString(end) ? toMinutes(end) : null,
  };
}

function getTaskStartMinutesForDate(habit: Habit, ymd: string): number | null {
  return getTaskTimeRangeForDate(habit, ymd).startMin;
}

function getHabitOccurrenceSlotsForLogicalDate(
  habit: Habit,
  logicalDate: string,
  dayResetTime: string,
): WidgetOccurrenceSlot[] {
  const resetMinutes = dayResetTime !== '00:00' ? toMinutes(dayResetTime) : 0;
  const windowStart = resetMinutes;
  const windowEnd = resetMinutes + 1440;
  const slots: WidgetOccurrenceSlot[] = [];

  if (appearsOnDateRaw(habit, logicalDate)) {
    const { startMin, endMin } = getTaskTimeRangeForDate(habit, logicalDate);
    if (startMin === null && endMin === null) {
      slots.push({ start: windowStart, end: windowEnd, isTimed: false });
    }
  }

  for (const slice of getLogicalDaySlices(logicalDate, resetMinutes)) {
    if (!appearsOnDateRaw(habit, slice.ymd)) {
      continue;
    }

    const { startMin, endMin } = getTaskTimeRangeForDate(habit, slice.ymd);
    if (startMin === null || startMin < slice.minStart || startMin >= slice.minEnd) {
      continue;
    }

    const rangeDuration = Math.max(5, normalizeRangeEnd(startMin, endMin) - startMin);
    const { weekday, dayOfMonth } = datePartsFromYmd(slice.ymd);
    const occurrenceCount = getDailyOccurrenceTotalForDate(habit, weekday, dayOfMonth);
    const specificGap =
      habit.schedule?.weeklyGaps?.[weekday] ?? habit.schedule?.monthlyGaps?.[dayOfMonth];
    const gapMinutes = Math.max(5, specificGap ?? habit.occurrenceGapMinutes ?? 360);
    const dayOverrides = habit.occurrenceSlotOverrides?.[slice.ymd] ?? {};
    const anchorMin =
      dayOverrides[0] && isValidTimeString(dayOverrides[0].start)
        ? toMinutes(dayOverrides[0].start)
        : startMin;

    for (let slotIndex = 0; slotIndex < occurrenceCount; slotIndex += 1) {
      const slotOverride = dayOverrides[slotIndex];
      let slotStart = anchorMin + slotIndex * gapMinutes;
      let slotEnd = slotStart + rangeDuration;

      if (
        slotOverride &&
        isValidTimeString(slotOverride.start) &&
        isValidTimeString(slotOverride.end)
      ) {
        slotStart = toMinutes(slotOverride.start);
        slotEnd = Math.max(slotStart + 5, toMinutes(slotOverride.end));
      }

      if (slotStart >= 1440) {
        break;
      }
      if (slotStart < slice.minStart || slotStart >= slice.minEnd) {
        continue;
      }

      slots.push({
        start: slice.displayOffset + slotStart,
        end: slice.displayOffset + slotEnd,
        isTimed: true,
      });
    }
  }

  return slots
    .filter((slot) => rangesOverlap(slot.start, slot.end, windowStart, windowEnd))
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function getZonedYmdAndMinutes(date: Date): { ymd: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: WIDGET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '0');

  return {
    ymd: `${year}-${month}-${day}`,
    minutes: hour * 60 + minute,
  };
}

function getCurrentLogicalMinute(
  referenceDate: Date,
  logicalDate: string,
  dayResetTime: string,
): number | null {
  const resetMinutes = dayResetTime !== '00:00' ? toMinutes(dayResetTime) : 0;
  const { ymd, minutes } = getZonedYmdAndMinutes(referenceDate);

  if (ymd === logicalDate && minutes >= resetMinutes) {
    return minutes;
  }
  if (resetMinutes > 0 && ymd === nextYmd(logicalDate) && minutes < resetMinutes) {
    return 1440 + minutes;
  }
  if (resetMinutes === 0 && ymd === logicalDate) {
    return minutes;
  }

  return null;
}

function getWidgetTimingPriority(
  habit: Habit,
  logicalDate: string,
  dayResetTime: string,
  referenceDate: Date,
  isComplete: boolean,
): WidgetTimingPriority {
  const allSlots = getHabitOccurrenceSlotsForLogicalDate(habit, logicalDate, dayResetTime);
  const timedSlots = allSlots.filter((slot) => slot.isTimed);
  const currentLogicalMinute = getCurrentLogicalMinute(referenceDate, logicalDate, dayResetTime);

  if (timedSlots.length > 0) {
    if (currentLogicalMinute !== null) {
      const activeSlot = timedSlots.find(
        (slot) => slot.start <= currentLogicalMinute && currentLogicalMinute < slot.end,
      );
      if (activeSlot) {
        return {
          group: isComplete ? 4 : 0,
          minute: activeSlot.start,
          timeLabel: 'Adesso',
        };
      }

      const nextSlot = timedSlots.find((slot) => slot.start >= currentLogicalMinute);
      if (nextSlot) {
        return {
          group: isComplete ? 5 : 1,
          minute: nextSlot.start,
          timeLabel: `Alle ${formatMinutesAsHhmm(nextSlot.start)}`,
        };
      }
    }

    const firstTimedSlot = timedSlots[0];
    return {
      group: isComplete ? 6 : 3,
      minute: firstTimedSlot?.start ?? Number.MAX_SAFE_INTEGER,
      timeLabel: firstTimedSlot ? `Alle ${formatMinutesAsHhmm(firstTimedSlot.start)}` : null,
    };
  }

  if (allSlots.length > 0) {
    return {
      group: isComplete ? 7 : 2,
      minute: Number.MAX_SAFE_INTEGER,
      timeLabel: 'In giornata',
    };
  }

  return {
    group: isComplete ? 9 : 8,
    minute: Number.MAX_SAFE_INTEGER,
    timeLabel: null,
  };
}

function getArrivalSortValue(habit: Habit, logicalDate: string, dayResetTime: string): number {
  const resetMinutes = dayResetTime !== '00:00' ? toMinutes(dayResetTime) : 0;
  const todayStart = getTaskStartMinutesForDate(habit, logicalDate);

  if (todayStart !== null && todayStart >= resetMinutes) {
    return todayStart;
  }

  const tomorrow = nextYmd(logicalDate);
  const tomorrowStart = getTaskStartMinutesForDate(habit, tomorrow);
  if (tomorrowStart !== null && tomorrowStart < resetMinutes) {
    return 1440 + tomorrowStart;
  }

  return Number.MAX_SAFE_INTEGER;
}

function buildOggiPath(urlPrefix: string, params: Record<string, string | undefined>): string {
  const base = urlPrefix.endsWith('://')
    ? `${urlPrefix}oggi`
    : `${urlPrefix.replace(/\/+$/, '')}/oggi`;
  const search = new URLSearchParams(
    Object.entries(params).filter(([, value]) => typeof value === 'string') as [string, string][],
  );
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

export function buildTodayWidgetSnapshot({
  habits,
  history,
  logicalDate,
  dayResetTime,
  currentDate,
  maxVisibleItems = Number.MAX_SAFE_INTEGER,
  urlPrefix = 'habitchecknative://',
}: BuildTodayWidgetSnapshotArgs): TodayWidgetSnapshot {
  const referenceDate = currentDate ?? new Date();
  const dayHistory = history[logicalDate];
  const visibleHabits = getHabitsAppearingOnDate(habits, logicalDate, dayResetTime).sort(
    (left, right) => (left.order ?? 0) - (right.order ?? 0),
  );

  const items = visibleHabits
    .map((habit) => {
      const targetCount = getDailyOccurrenceTotal(habit);
      const currentCount = getOccurrenceDoneForDay(dayHistory, habit);
      const isComplete = currentCount >= targetCount;
      const action: WidgetCommand = {
        kind: 'toggleHabit',
        habitId: habit.id,
        logicalDate,
      };
      const timing = getWidgetTimingPriority(
        habit,
        logicalDate,
        dayResetTime,
        referenceDate,
        isComplete,
      );
      const occurrenceSlots = getHabitOccurrenceSlotsForLogicalDate(
        habit,
        logicalDate,
        dayResetTime,
      );

      const rawTitle = typeof habit.text === 'string' ? habit.text.trim() : '';
      const title = rawTitle.length > 0 ? rawTitle : 'Senza titolo';

      return {
        timingGroup: timing.group,
        timingMinute: timing.minute,
        arrivalSort: getArrivalSortValue(habit, logicalDate, dayResetTime),
        sortOrder: habit.order ?? 0,
        createdAtMs: habit.createdAtMs ?? 0,
        id: habit.id,
        title,
        color: habit.color ?? null,
        timeLabel: timing.timeLabel,
        occurrenceSlots,
        currentCount,
        targetCount,
        isComplete,
        canIncrement: !isComplete,
        deeplink: buildOggiPath(urlPrefix, {
          habitId: habit.id,
          date: logicalDate,
        }),
        action,
      };
    })
    .sort((left, right) => {
      if (left.timingGroup !== right.timingGroup) {
        return left.timingGroup - right.timingGroup;
      }
      if (left.timingMinute !== right.timingMinute) {
        return left.timingMinute - right.timingMinute;
      }
      if (left.arrivalSort !== right.arrivalSort) {
        return left.arrivalSort - right.arrivalSort;
      }
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder;
      }
      return left.createdAtMs - right.createdAtMs;
    })
    .slice(0, maxVisibleItems);

  return {
    version: 1,
    logicalDate,
    dayResetTime,
    generatedAt: referenceDate.toISOString(),
    openAppDeeplink: buildOggiPath(urlPrefix, { date: logicalDate }),
    progress: {
      completedCount: visibleHabits.filter((habit) => {
        const targetCount = getDailyOccurrenceTotal(habit);
        return getOccurrenceDoneForDay(dayHistory, habit) >= targetCount;
      }).length,
      totalCount: visibleHabits.length,
    },
    items: items.map(({
      timingGroup: _timingGroup,
      timingMinute: _timingMinute,
      arrivalSort: _arrivalSort,
      sortOrder: _sortOrder,
      createdAtMs: _createdAtMs,
      ...item
    }) => item),
  };
}
