import type { HabitsState } from '@/lib/habits/schema';

export function buildCsv(history: HabitsState['history']): string {
  const headers = ['date', 'habitId', 'completed'];
  const rows: string[] = [headers.join(',')];
  const dates = Object.keys(history).sort();
  for (const date of dates) {
    const rec = history[date];
    const map = rec?.completedByHabitId ?? {};
    for (const [habitId, completed] of Object.entries(map)) {
      rows.push([date, habitId, completed ? '1' : '0'].join(','));
    }
  }
  return rows.join('\n');
}
