import type { Habit } from '@/lib/habits/schema';

export type SmartTaskFeedback = 'justRight' | 'tooEarly' | 'tooLate';

export const SMART_TASK_MIN_INTERVAL_DAYS = 1;
export const SMART_TASK_MAX_INTERVAL_DAYS = 120;
const SMART_TASK_ADJUSTMENT_RATIO = 0.2;

function clampIntervalDays(value: number): number {
  return Math.max(
    SMART_TASK_MIN_INTERVAL_DAYS,
    Math.min(SMART_TASK_MAX_INTERVAL_DAYS, Math.round(value)),
  );
}

export function parseSmartTaskYmd(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

export function addDaysToSmartTaskYmd(ymd: string, days: number): string {
  const next = parseSmartTaskYmd(ymd);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

export function diffSmartTaskDays(fromYmd: string, toYmd: string): number {
  const from = parseSmartTaskYmd(fromYmd);
  const to = parseSmartTaskYmd(toYmd);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function inferSmartTaskSeed(args: {
  habitFreq: Habit['habitFreq'];
  targetYmd: string;
  todayYmd: string;
  existing?: Habit['smartTask'];
}): { intervalDays: number; nextDueDate: string } {
  if (args.existing?.nextDueDate) {
    return {
      intervalDays: clampIntervalDays(args.existing.intervalDays ?? 7),
      nextDueDate: args.existing.nextDueDate,
    };
  }

  const intervalFromFreq = (() => {
    switch (args.habitFreq) {
      case 'daily':
        return 1;
      case 'weekly':
        return 7;
      case 'monthly':
        return 30;
      case 'annual':
        return 365;
      case 'single':
      default:
        return null;
    }
  })();

  if (intervalFromFreq) {
    return {
      intervalDays: clampIntervalDays(intervalFromFreq),
      nextDueDate: args.targetYmd,
    };
  }

  const delta = diffSmartTaskDays(args.todayYmd, args.targetYmd);
  return {
    intervalDays: clampIntervalDays(delta > 0 ? delta : 7),
    nextDueDate: args.targetYmd,
  };
}

export function resolveSmartTaskFeedback(args: {
  current: Habit['smartTask'];
  feedback: SmartTaskFeedback;
  resolvedOnYmd: string;
}): NonNullable<Habit['smartTask']> {
  const currentInterval = clampIntervalDays(args.current?.intervalDays ?? 7);
  const adjustment = Math.max(1, Math.round(currentInterval * SMART_TASK_ADJUSTMENT_RATIO));

  const nextInterval = (() => {
    if (args.feedback === 'tooEarly') return clampIntervalDays(currentInterval + adjustment);
    if (args.feedback === 'tooLate') return clampIntervalDays(currentInterval - adjustment);
    return currentInterval;
  })();

  return {
    enabled: args.feedback === 'justRight' ? false : true,
    intervalDays: nextInterval,
    nextDueDate: addDaysToSmartTaskYmd(args.resolvedOnYmd, nextInterval),
  };
}
