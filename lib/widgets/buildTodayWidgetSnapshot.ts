import { getHabitsAppearingOnDate } from '../habits/habitsForDate';
import { getDailyOccurrenceTotal, getOccurrenceDoneForDay } from '../habits/occurrences';
import type { Habit, HabitsState } from '../habits/schema';

export type WidgetCommand = {
  kind: 'toggleHabit';
  habitId: string;
  logicalDate: string;
};

export type TodayWidgetItem = {
  id: string;
  title: string;
  color: string | null;
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
  maxVisibleItems?: number;
  urlPrefix?: string;
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

function toMinutes(hhmm: string): number {
  if (hhmm === '24:00') return 1440;
  const [hours, minutes] = hhmm.split(':').map(Number);
  return hours * 60 + minutes;
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

function getTaskStartMinutesForDate(habit: Habit, ymd: string): number | null {
  const { weekday, dayOfMonth } = datePartsFromYmd(ymd);
  const override = habit.timeOverrides?.[ymd];
  if (override === '00:00') return null;

  const rawOverrideStart =
    typeof override === 'string' ? override : override?.start ?? null;
  const overrideStart = isValidTimeString(rawOverrideStart) ? rawOverrideStart : null;

  const weekly = habit.schedule?.weeklyTimes?.[weekday] ?? null;
  const monthly = habit.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
  const start = overrideStart ?? weekly?.start ?? monthly?.start ?? habit.schedule?.time ?? null;

  return start && isValidTimeString(start) ? toMinutes(start) : null;
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
  maxVisibleItems = 3,
  urlPrefix = 'habitchecknative://',
}: BuildTodayWidgetSnapshotArgs): TodayWidgetSnapshot {
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

      const rawTitle = typeof habit.text === 'string' ? habit.text.trim() : '';
      const title = rawTitle.length > 0 ? rawTitle : 'Senza titolo';

      return {
        arrivalSort: getArrivalSortValue(habit, logicalDate, dayResetTime),
        sortOrder: habit.order ?? 0,
        createdAtMs: habit.createdAtMs ?? 0,
        id: habit.id,
        title,
        color: habit.color ?? null,
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
    generatedAt: new Date().toISOString(),
    openAppDeeplink: buildOggiPath(urlPrefix, { date: logicalDate }),
    progress: {
      completedCount: visibleHabits.filter((habit) => {
        const targetCount = getDailyOccurrenceTotal(habit);
        return getOccurrenceDoneForDay(dayHistory, habit) >= targetCount;
      }).length,
      totalCount: visibleHabits.length,
    },
    items: items.map(({ arrivalSort: _arrivalSort, sortOrder: _sortOrder, createdAtMs: _createdAtMs, ...item }) => item),
  };
}
