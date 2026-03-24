export type HabitSchedule = {
  daysOfWeek: number[]; // 0 = Sunday ... 6 = Saturday
  monthDays?: number[]; // 1-31 for monthly days
  time?: string | null; // 'HH:MM' for default start time
  endTime?: string | null; // 'HH:MM' for default end time
  yearMonth?: number; // 1-12 for annual recurrence month
  yearDay?: number; // 1-31 for annual recurrence day
  weeklyTimes?: Record<number, { start: string | null; end: string | null }>; // per-dow times
  monthlyTimes?: Record<number, { start: string | null; end: string | null }>; // per-day-of-month times
  repeatEndDate?: string | null; // 'YYYY-MM-DD' — last day of recurrence (inclusive)
  repeatStartDate?: string | null; // 'YYYY-MM-DD' — first day of recurrence (inclusive)
};

export type TravelMeta = {
  mezzo: 'aereo' | 'treno' | 'auto' | 'nave' | 'bici' | 'bus' | 'altro';
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
  /** Se true, la partenza del ritorno e' il giorno dopo rispetto a giornoRitorno */
  partenzaRitornoGiornoDopo?: boolean;
  orarioArrivoRitorno?: string; // 'HH:MM' (ritorno, opzionale)
  /** Se true, l'arrivo del ritorno è il giorno dopo (orarioArrivoRitorno è in formato HH:MM del giorno dopo) */
  arrivoRitornoGiornoDopo?: boolean;
};

export type NotificationConfig = {
  enabled: boolean;
  minutesBefore: number | null; // null = custom time
  customTime?: string | null; // 'HH:MM' if minutesBefore is null
  customDate?: string | null; // 'YYYY-MM-DD' if set, overrides the event day
};

export type TrackerEntry = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
  color: string;
  withPeople?: string[]; // names of people
  rating?: number | null; // 1-10
  comment?: string | null;
  createdAt: string; // YYYY-MM-DD
};

export type Habit = {
  id: string;
  text: string;
  order: number;
  schedule?: HabitSchedule;
  timeOverrides?: Record<string, string | { start: string; end: string }>; // date YYYY-MM-DD -> 'HH:MM' or { start, end }
  color?: string; // hex color for card/background
  createdAt?: string; // YYYY-MM-DD creation date in Europe/Zurich
  createdAtMs?: number; // Unix timestamp ms at creation for precise ordering
  isAllDay?: boolean; // explicit all-day flag
  habitFreq?: 'single' | 'daily' | 'weekly' | 'monthly' | 'annual'; // explicit frequency flag
  folder?: string; // custom folder/category name
  label?: string; // free-form label/tag
  tipo?: 'task' | 'abitudine' | 'evento' | 'viaggio'; // task type
  notification?: NotificationConfig;
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
  /** If true, this habit will be included in the daily review modal */
  askReview?: boolean;
  /** Quante volte al giorno (Tasks: una riga; completamento N/N). 1–30, default 1 se assente. */
  dailyOccurrences?: number;
  /** Minuti tra un’occorrenza e la successiva (ancora = orario inizio in schedule / modale). */
  occurrenceGapMinutes?: number;
  /**
   * Override orari per slot (0..N-1) in un giorno (chiave calendario YYYY-MM-DD).
   * Con più di 2 occorrenze, uno slot spostato in Oggi salva qui (distacco custom per quel momento).
   */
  occurrenceSlotOverrides?: Record<string, Record<number, { start: string; end: string }>>;
};

export type DayCompletion = {
  date: string; // YYYY-MM-DD in Europe/Zurich
  completedByHabitId: Record<string, boolean>;
  /** Per abitudini con dailyOccurrences > 1: quante occorrenze segnate oggi (0..N). */
  occurrenceDoneCountByHabitId?: Record<string, number>;
  ratings?: Record<string, number>; // habitId -> 1-10
  comments?: Record<string, string>; // habitId -> text
};

export type UserTable = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  headerRows: string[][];  // frozen rows at top  – headerRows[frozenRowIdx][colIdx]
  headerCols: string[][];  // frozen cols on left – headerCols[rowIdx][frozenColIdx]
  cells: string[][];       // body cells[rowIdx][colIdx]
};

export type HabitsState = {
  habits: Habit[];
  history: Record<string, DayCompletion>;
  lastResetDate: string | null;
  dayResetTime?: string; // 'HH:MM' for when the day resets (default: '00:00')
  reviewedDates: string[]; // YYYY-MM-DD dates that have been reviewed
};


