import type { DayCompletion, Habit } from './schema';

const MAX_DAILY_OCCURRENCES = 30;

export function getDailyOccurrenceTotal(habit: Habit): number {
  const raw = habit.dailyOccurrences ?? 1;
  return Math.min(MAX_DAILY_OCCURRENCES, Math.max(1, Math.floor(raw)));
}

/** Done count 0..n for today (or given day entry). */
export function getOccurrenceDoneForDay(day: DayCompletion | undefined, habit: Habit): number {
  const n = getDailyOccurrenceTotal(habit);
  if (n <= 1) {
    return day?.completedByHabitId[habit.id] ? 1 : 0;
  }
  const raw = day?.occurrenceDoneCountByHabitId?.[habit.id];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(n, Math.max(0, Math.floor(raw)));
  }
  return day?.completedByHabitId[habit.id] ? n : 0;
}

export function isHabitFullyDoneForDay(day: DayCompletion | undefined, habit: Habit): boolean {
  const n = getDailyOccurrenceTotal(habit);
  const k = getOccurrenceDoneForDay(day, habit);
  return k >= n;
}

/**
 * k completati per la migrazione N→N': non usare solo getOccurrenceDoneForDay(day, prevHabit):
 * con N=1 quel helper ignora occurrenceDoneCountByHabitId, quindi uno storico 1/2 (count=1, bool=false)
 * letto con habit a N=1 diventa 0 e la migrazione azzera tutto.
 */
function getOccurrenceDoneForMigration(day: DayCompletion | undefined, habitId: string, prevHabit: Habit): number {
  const oldN = getDailyOccurrenceTotal(prevHabit);
  const raw = day?.occurrenceDoneCountByHabitId?.[habitId];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return Math.min(oldN, Math.max(0, Math.floor(raw)));
  }
  if (oldN <= 1) {
    return day?.completedByHabitId[habitId] ? 1 : 0;
  }
  return day?.completedByHabitId[habitId] ? oldN : 0;
}

/**
 * Quando l'utente cambia "volte al giorno" in modale, riallinea k per oggi:
 * conserva i tap già fatti: nuovo k = min(k vecchio, nuovo N) (es. 1/1 → 2 ripetizioni → 1/2).
 */
export function migrateOccurrenceCompletionForNewDailyTotal(
  day: DayCompletion,
  habitId: string,
  prevHabit: Habit,
  newDailyTotal: number,
): DayCompletion {
  const oldN = getDailyOccurrenceTotal(prevHabit);
  const newN = Math.min(MAX_DAILY_OCCURRENCES, Math.max(1, Math.floor(newDailyTotal)));
  if (oldN === newN) return day;

  const oldK = getOccurrenceDoneForMigration(day, habitId, prevHabit);
  const newK = Math.min(oldK, newN);

  const nextCounts = { ...(day.occurrenceDoneCountByHabitId ?? {}) };
  if (newN <= 1) {
    delete nextCounts[habitId];
  } else {
    if (newK === 0) delete nextCounts[habitId];
    else nextCounts[habitId] = newK;
  }

  const nextCompleted = { ...(day.completedByHabitId ?? {}) };
  nextCompleted[habitId] = newN <= 1 ? newK >= 1 : newK >= newN;

  return {
    ...day,
    completedByHabitId: nextCompleted,
    occurrenceDoneCountByHabitId: Object.keys(nextCounts).length ? nextCounts : undefined,
  };
}

/**
 * Ultimo slot (solo inizio) deve restare entro la finestra [reset, reset+24h) in minuti.
 */
export function occurrenceChainFitsLogicalDay(
  dayResetHhmm: string,
  anchorStartMin: number,
  occurrenceCount: number,
  gapMinutes: number,
): boolean {
  if (occurrenceCount <= 1) return true;
  const parts = dayResetHhmm.split(':').map(Number);
  const resetM = (parts[0] ?? 0) * 60 + (parts[1] ?? 0);
  const anchor = ((anchorStartMin % (24 * 60)) + 24 * 60) % (24 * 60);
  const firstFromReset = (anchor - resetM + 24 * 60) % (24 * 60);
  const lastSlotStart = firstFromReset + (occurrenceCount - 1) * gapMinutes;
  return lastSlotStart < 24 * 60;
}
