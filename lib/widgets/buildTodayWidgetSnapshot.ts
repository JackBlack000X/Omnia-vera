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
        sortOrder: habit.order ?? 0,
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
      if (left.isComplete !== right.isComplete) {
        return left.isComplete ? 1 : -1;
      }
      if (left.currentCount !== right.currentCount) {
        return right.currentCount - left.currentCount;
      }
      return left.sortOrder - right.sortOrder;
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
    items: items.map(({ sortOrder: _sortOrder, ...item }) => item),
  };
}
