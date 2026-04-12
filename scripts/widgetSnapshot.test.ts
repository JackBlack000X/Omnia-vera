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

test('buildTodayWidgetSnapshot prioritizes the current timed habit and then the next arrival', () => {
  const habits = [
    makeHabit({
      id: 'habit-anytime',
      text: 'Inbox libera',
      order: 0,
    }),
    makeHabit({
      id: 'habit-current',
      text: 'Deep work',
      order: 3,
      schedule: { daysOfWeek: [2], time: '14:00', endTime: '16:00' },
    }),
    makeHabit({
      id: 'habit-next',
      text: 'Call cliente',
      order: 1,
      schedule: { daysOfWeek: [2], time: '17:30', endTime: '18:00' },
    }),
    makeHabit({
      id: 'habit-done',
      text: 'Workout',
      order: 2,
      schedule: { daysOfWeek: [2], time: '15:30', endTime: '16:30' },
    }),
  ];

  const history = makeHistory({
    '2026-04-07': {
      date: '2026-04-07',
      completedByHabitId: {
        'habit-done': true,
      },
    },
  });

  const snapshot = buildTodayWidgetSnapshot({
    habits,
    history,
    logicalDate: '2026-04-07',
    dayResetTime: '02:00',
    currentDate: new Date('2026-04-07T15:00:00+02:00'),
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
      timeLabel: item.timeLabel,
      isComplete: item.isComplete,
      canIncrement: item.canIncrement,
    })),
    [
      {
        id: 'habit-current',
        timeLabel: 'Adesso',
        isComplete: false,
        canIncrement: true,
      },
      {
        id: 'habit-next',
        timeLabel: 'Alle 17:30',
        isComplete: false,
        canIncrement: true,
      },
      {
        id: 'habit-anytime',
        timeLabel: 'In giornata',
        isComplete: false,
        canIncrement: true,
      },
    ],
  );
});

test('buildTodayWidgetSnapshot keeps early next-day tasks inside the same logical day after reset', () => {
  const habits = [
    makeHabit({
      id: 'habit-late',
      text: 'Task notte',
      order: 3,
      timeOverrides: { '2026-04-08': '01:30' },
    }),
    makeHabit({
      id: 'habit-water',
      text: 'Bere acqua',
      order: 0,
      dailyOccurrences: 3,
    }),
    makeHabit({
      id: 'habit-walk',
      text: 'Camminare',
      order: 1,
    }),
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
    currentDate: new Date('2026-04-07T22:00:00+02:00'),
    maxVisibleItems: 3,
    urlPrefix: 'habitchecknative://',
  });

  assert.deepEqual(
    snapshot.items.map((item) => ({
      id: item.id,
      timeLabel: item.timeLabel,
      currentCount: item.currentCount,
      targetCount: item.targetCount,
    })),
    [
      {
        id: 'habit-late',
        timeLabel: 'Alle 01:30',
        currentCount: 0,
        targetCount: 1,
      },
      {
        id: 'habit-water',
        timeLabel: 'In giornata',
        currentCount: 2,
        targetCount: 3,
      },
      {
        id: 'habit-walk',
        timeLabel: 'In giornata',
        currentCount: 1,
        targetCount: 1,
      },
    ],
  );

  assert.equal(
    snapshot.items[0]?.deeplink,
    'habitchecknative://oggi?habitId=habit-late&date=2026-04-07',
  );
  assert.equal(snapshot.openAppDeeplink, 'habitchecknative://oggi?date=2026-04-07');
});

test('buildTodayWidgetSnapshot uses fallback title when habit text is empty', () => {
  const habits = [
    makeHabit({ id: 'habit-empty', text: '   ', order: 0 }),
    makeHabit({ id: 'habit-named', text: 'Ok', order: 1 }),
  ];

  const snapshot = buildTodayWidgetSnapshot({
    habits,
    history: makeHistory({}),
    logicalDate: '2026-04-07',
    dayResetTime: '02:00',
    currentDate: new Date('2026-04-07T10:00:00+02:00'),
    maxVisibleItems: 3,
    urlPrefix: 'habitchecknative://',
  });

  const emptyTitleItem = snapshot.items.find((item) => item.id === 'habit-empty');
  assert.equal(emptyTitleItem?.title, 'Senza titolo');
});
