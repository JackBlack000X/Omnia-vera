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

export type TravelMeta = {
  mezzo: 'aereo' | 'treno' | 'auto' | 'nave' | 'altro';
  partenzaTipo: 'attuale' | 'personalizzata';
  partenzaNome?: string;
  destinazioneNome: string;
  giornoPartenza: string; // YYYY-MM-DD
  giornoRitorno?: string; // YYYY-MM-DD (optional)
  orarioPartenza: string; // 'HH:MM' (andata)
  orarioArrivo: string; // 'HH:MM' (andata)
  /** Se true, l'arrivo dell'andata è il giorno dopo (orarioArrivo è in formato HH:MM del giorno dopo) */
  arrivoGiornoDopo?: boolean;
  orarioPartenzaRitorno?: string; // 'HH:MM' (ritorno, opzionale)
  orarioArrivoRitorno?: string; // 'HH:MM' (ritorno, opzionale)
  /** Se true, l'arrivo del ritorno è il giorno dopo (orarioArrivoRitorno è in formato HH:MM del giorno dopo) */
  arrivoRitornoGiornoDopo?: boolean;
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
  folder?: string; // custom folder/category name
  tipo?: 'task' | 'abitudine' | 'evento' | 'viaggio'; // task type
  /** Dati opzionali per i viaggi */
  travel?: TravelMeta;
  /** Set when habit was imported from Apple/device calendar; used to avoid duplicate imports */
  calendarEventId?: string;
  /** Optional location-based auto-completion rule */
  locationRule?: {
    type: 'geofenceExit';
    placeId: string;
    minOutsideMinutes?: number;
  };
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


