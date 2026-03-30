import type { HealthMetric } from '@/lib/habits/schema';

export type HealthHabitOption = {
  metric: HealthMetric;
  label: string;
  solidColor: string;
  gradient: readonly [string, string];
  icon: 'moon-outline' | 'footsteps-outline' | 'walk-outline' | 'flame-outline';
};

export const HEALTH_HABIT_OPTIONS: readonly HealthHabitOption[] = [
  {
    metric: 'sleep',
    label: 'Sonno',
    solidColor: '#8b5cf6',
    gradient: ['#8b5cf6', '#38bdf8'],
    icon: 'moon-outline',
  },
  {
    metric: 'steps',
    label: 'Passi',
    solidColor: '#22c55e',
    gradient: ['#38bdf8', '#22c55e'],
    icon: 'footsteps-outline',
  },
  {
    metric: 'distance',
    label: 'Km',
    solidColor: '#f97316',
    gradient: ['#ef4444', '#f97316'],
    icon: 'walk-outline',
  },
  {
    metric: 'activeEnergy',
    label: 'Calorie',
    solidColor: '#facc15',
    gradient: ['#ef4444', '#facc15'],
    icon: 'flame-outline',
  },
] as const;

export function getHealthHabitOption(metric?: HealthMetric | null): HealthHabitOption | null {
  if (!metric) return null;
  return HEALTH_HABIT_OPTIONS.find((option) => option.metric === metric) ?? null;
}
