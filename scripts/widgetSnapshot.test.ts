import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTodayWidgetSnapshot } from '../lib/widgets/buildTodayWidgetSnapshot';
import type { Habit, HabitsState } from '../lib/habits/schema';

function makeHabit(overrides: Partial<Habit>): Habit {
  return {
    id: overrides.id ?? 'habit-default',
    text: overrides.text ?? 'Habit default',
    order: overrides.order ?? 0,
    createdAt: overrides.createdAt ?? '2026-04-07',
    color: overrides.color ?? '#3b82f6',
    habitFreq: overrides.habitFreq ?? 'daily',
    ...overrides,
  };
}

function makeHistory(history: HabitsState['history']): HabitsState['history'] {
  return history;
}

test('buildTodayWidgetSnapshot builds progress and widget actions for visible habits', () => {
  const habits = [
    makeHabit({ id: 'habit-read', text: 'Leggere', order: 2 }),
    makeHabit({ id: 'habit-water', text: 'Bere acqua', order: 0, dailyOccurrences: 3 }),
    makeHabit({ id: 'habit-walk', text: 'Camminare', order: 1 }),
    makeHabit({ id: 'habit-late', text: 'Task notte', order: 3, timeOverrides: { '2026-04-08': '01:30' } }),
  ];

  const history = makeHistory({
    '2026-04-07': {
      date: '2026-04-07',
      completedByHabitId: {
        'habit-walk': true,
      },
      occurrenceDoneCountByHabitId: {
        'habit-water': 2,
      },
    },
  });

  const snapshot = buildTodayWidgetSnapshot({
    habits,
    history,
    logicalDate: '2026-04-07',
    dayResetTime: '02:00',
    maxVisibleItems: 3,
    urlPrefix: 'habitchecknative://',
  });

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.logicalDate, '2026-04-07');
  assert.equal(snapshot.progress.completedCount, 1);
  assert.equal(snapshot.progress.totalCount, 4);
  assert.equal(snapshot.items.length, 3);

  assert.deepEqual(
    snapshot.items.map((item) => ({
      id: item.id,
      currentCount: item.currentCount,
      targetCount: item.targetCount,
      isComplete: item.isComplete,
      canIncrement: item.canIncrement,
      actionKind: item.action.kind,
      actionDate: item.action.logicalDate,
    })),
    [
      {
        id: 'habit-water',
        currentCount: 2,
        targetCount: 3,
        isComplete: false,
        canIncrement: true,
        actionKind: 'toggleHabit',
        actionDate: '2026-04-07',
      },
      {
        id: 'habit-read',
        currentCount: 0,
        targetCount: 1,
        isComplete: false,
        canIncrement: true,
        actionKind: 'toggleHabit',
        actionDate: '2026-04-07',
      },
      {
        id: 'habit-late',
        currentCount: 0,
        targetCount: 1,
        isComplete: false,
        canIncrement: true,
        actionKind: 'toggleHabit',
        actionDate: '2026-04-07',
      },
    ],
  );

  assert.equal(snapshot.items[0]?.deeplink, 'habitchecknative://oggi?habitId=habit-water&date=2026-04-07');
  assert.equal(snapshot.openAppDeeplink, 'habitchecknative://oggi?date=2026-04-07');
});
