import { Habit } from '@/lib/habits/schema';

// Helpers
export function pad(n: number) { return String(n).padStart(2, '0'); }
export function minutesToHhmm(min: number): string { const h = Math.floor(min / 60); const m = min % 60; return `${pad(h)}:${pad(m)}`; }
export function hhmmToMinutes(hhmm: string | null | undefined) { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins} min`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${mins}min`;
  }
}

export type HabitTimeSlot = { start: string; end: string | null };

export function normalizeTitle(value: string) {
  return value.trim().toLowerCase();
}

export function extractHabitTimeSlots(habit: Habit): HabitTimeSlot[] {
  const slots: HabitTimeSlot[] = [];
  const schedule = habit.schedule;

  if (schedule?.weeklyTimes) {
    Object.values(schedule.weeklyTimes).forEach((entry) => {
      if (entry?.start) {
        slots.push({ start: entry.start, end: entry.end ?? null });
      }
    });
  }

  if (schedule?.monthlyTimes) {
    Object.values(schedule.monthlyTimes).forEach((entry) => {
      if (entry?.start) {
        slots.push({ start: entry.start, end: entry.end ?? null });
      }
    });
  }

  if (schedule?.time) {
    slots.push({ start: schedule.time, end: schedule.endTime ?? null });
  }

  if (habit.timeOverrides) {
    Object.values(habit.timeOverrides).forEach((value) => {
      if (typeof value === 'string') {
        if (value) slots.push({ start: value, end: null });
      } else if (value?.start) {
        slots.push({ start: value.start, end: value.end ?? null });
      }
    });
  }

  return slots;
}

export function findDuplicateHabitSlot(
  habits: Habit[],
  title: string,
  start: string,
  end: string | null,
  ignoreHabitId?: string
) {
  const normalizedTitle = normalizeTitle(title);

  for (const habit of habits) {
    if (ignoreHabitId && habit.id === ignoreHabitId) continue;
    if (normalizeTitle(habit.text) !== normalizedTitle) continue;

    const match = extractHabitTimeSlots(habit).find(
      (slot) => slot.start === start && (slot.end ?? null) === (end ?? null)
    );

    if (match) {
      return { habit, slot: match };
    }
  }

  return null;
}
