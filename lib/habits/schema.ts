export type HabitSchedule = {
  daysOfWeek: number[]; // 0 = Sunday ... 6 = Saturday
  monthDays?: number[]; // 1-31 for monthly days
  time?: string | null; // 'HH:MM' for default start time
  endTime?: string | null; // 'HH:MM' for default end time
  yearMonth?: number; // 1-12 for annual recurrence month
  yearDay?: number; // 1-31 for annual recurrence day
  weeklyTimes?: Record<number, { start: string | null; end: string | null }>; // per-dow times
  monthlyTimes?: Record<number, { start: string | null; end: string | null }>; // per-day-of-month times
};

export type Habit = {
  id: string;
  text: string;
  order: number;
  schedule?: HabitSchedule;
  timeOverrides?: Record<string, string | { start: string; end: string }>; // date YYYY-MM-DD -> 'HH:MM' or { start, end }
  color?: string; // hex color for card/background
  createdAt?: string; // YYYY-MM-DD creation date in Europe/Zurich
  isAllDay?: boolean; // explicit all-day flag
  habitFreq?: 'single' | 'daily' | 'weekly' | 'monthly' | 'annual'; // explicit frequency flag
};

export type DayCompletion = {
  date: string; // YYYY-MM-DD in Europe/Zurich
  completedByHabitId: Record<string, boolean>;
};

export type HabitsState = {
  habits: Habit[];
  history: Record<string, DayCompletion>;
  lastResetDate: string | null;
  dayResetTime?: string; // 'HH:MM' for when the day resets (default: '00:00')
};


