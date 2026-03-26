import { canAskLocationPermission, getLocationPermissionStatusAsync, startGeofencingForRegions, stopGeofencingAsync } from '@/lib/location';
import { loadPlaces } from '@/lib/places';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { getDailyOccurrenceTotal, getOccurrenceDoneForDay, migrateOccurrenceCompletionForNewDailyTotal } from './occurrences';
import { getHabitsAppearingOnDate } from './habitsForDate';
import { Habit, HabitsState, TrackerEntry, UserTable } from './schema';

const STORAGE_HABITS = 'habitcheck_habits_v1';
const STORAGE_TABLES = 'habitcheck_tables_v1';
const STORAGE_TRACKER = 'habitcheck_tracker_v1';
const STORAGE_HISTORY = 'habitcheck_history_v1';
const STORAGE_LASTRESET = 'habitcheck_lastreset_v1';
const STORAGE_DAYRESETTIME = 'habitcheck_dayresettime_v1';
const STORAGE_REVIEWED_DATES = 'habitcheck_reviewed_dates_v1';
const TZ = 'Europe/Zurich';

const MAX_HISTORY_DAYS = 180;
const MAX_REVIEWED_DATES = 365;

function pruneHistory(history: HabitsState['history']): HabitsState['history'] {
  const keys = Object.keys(history);
  if (keys.length <= MAX_HISTORY_DAYS) return history;
  // Keys are `YYYY-MM-DD`, so lexicographic sort preserves chronological order.
  keys.sort();
  const keep = new Set(keys.slice(-MAX_HISTORY_DAYS));
  const pruned: HabitsState['history'] = {};
  for (const k of keep) pruned[k] = history[k];
  return pruned;
}

function isOutOfSpaceError(error: unknown): boolean {
  const msg = (() => {
    if (typeof error === 'string') return error;
    if (error && typeof error === 'object' && 'message' in error) return String((error as any).message);
    return String(error);
  })();
  const lower = msg.toLowerCase();
  return lower.includes('out of space') || (msg.includes('NSCocoaErrorDomain') && (msg.includes('Code=640') || lower.includes('640')));
}

/** Parse YYYY-MM-DD at noon UTC to avoid timezone boundary issues */
function parseYmdSafe(ymd: string): Date {
  return new Date(ymd + 'T12:00:00.000Z');
}

function formatYmd(date = new Date(), tz = TZ): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    const d = date instanceof Date ? date : parseYmdSafe(String(date));
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${d.getUTCFullYear()}-${m}-${dd}`;
  }
}

function generateUUID(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function getLogicalDayKey(date: Date | string, dayResetTime: string): string {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date;

  const d = typeof date === 'string' ? parseYmdSafe(date) : date;

  if (dayResetTime !== '00:00') {
    const [resetHour, resetMinute] = dayResetTime.split(':').map(Number);
    const resetMinutes = resetHour * 60 + resetMinute;

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(d);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const currentMinutes = hour * 60 + minute;

    if (currentMinutes < resetMinutes) {
      const prevDay = new Date(d);
      prevDay.setUTCDate(prevDay.getUTCDate() - 1);
      return formatYmd(prevDay);
    }
  }

  return formatYmd(d);
}

export type HabitsContextType = {
  habits: Habit[];
  history: HabitsState['history'];
  lastResetDate: string | null;
  dayResetTime: string;
  reviewedDates: string[];
  isLoaded: boolean;
  addHabit: (text: string, color?: string, folder?: string, tipo?: 'task' | 'abitudine' | 'evento', initial?: { timeOverrides?: Habit['timeOverrides']; schedule?: Habit['schedule']; isAllDay?: boolean; habitFreq?: Habit['habitFreq']; label?: string }) => string;
  duplicateHabit: (id: string) => string | null;
  updateHabit: (id: string, text: string) => void;
  updateHabitColor: (id: string, color: string) => void;
  updateHabitFolder: (id: string, folder: string | undefined) => void;
  updateHabitTipo: (id: string, tipo: 'task' | 'abitudine' | 'evento') => void;
  removeHabit: (id: string) => void;
  toggleDone: (id: string) => void;
  reorder: (id: string, direction: 'up' | 'down') => void;
  updateHabitsOrder: (orderedHabits: Habit[]) => void;
  resetToday: () => Promise<void>;
  getDay: (date: Date | string) => string;
  setTimeOverride: (id: string, date: string, hhmm: string | null) => void;
  setTimeOverrideRange: (id: string, date: string, startTime: string | null, endTime: string | null) => void;
  /** Override orario per uno slot (Oggi, N>1 occorrenze) */
  setOccurrenceSlotTimeRange: (habitId: string, ymd: string, slotIndex: number, start: string, end: string) => void;
  /** Salva override per più slot in un colpo solo (usato quando si trascina uno slot e si congelano gli altri) */
  setMultipleOccurrenceSlotOverrides: (habitId: string, ymd: string, slots: Record<number, { start: string; end: string }>) => void;
  /** Imposta distacco minuti e rimuove override slot per quel giorno (es. conferma menu con 2 occorrenze) */
  setOccurrenceGapMinutesAndClearDayOverrides: (habitId: string, gapMinutes: number, ymd: string) => void;
  updateScheduleTime: (id: string, hhmm: string | null) => void;
  updateScheduleFromDate: (id: string, fromDate: string, startTime: string | null, endTime: string | null) => void;
  updateSchedule: (id: string, daysOfWeek: number[], hhmm: string | null) => void;
  setDayResetTime: (timeOrFn: string | ((prev: string) => string)) => Promise<void>;
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  resetStorage: () => Promise<void>;
  /** Persist completion for a day (used by calendar). Uses same "habits for that day" as tasks tab. */
  setDayCompletion: (ymd: string, completedCount: number) => void;
  /** Dopo modifica "volte al giorno" in modale: riallinea completamenti per oggi (giornata logica). */
  migrateTodayCompletionForDailyCountChange: (habitId: string, prevHabit: Habit, newDailyTotal: number) => void;
  /** Mark a date as reviewed (day review modal completed) */
  markDateReviewed: (ymd: string) => Promise<void>;
  /** Save rating and comment for a habit on a specific day */
  saveDayReview: (ymd: string, habitId: string, rating: number | null, comment: string | null) => void;
  /** Update askReview toggle on a habit */
  updateHabitAskReview: (id: string, askReview: boolean) => void;
  trackerEntries: TrackerEntry[];
  addTrackerEntry: (entry: Omit<TrackerEntry, 'id' | 'createdAt'>) => string;
  updateTrackerEntry: (id: string, entry: Partial<Omit<TrackerEntry, 'id' | 'createdAt'>>) => void;
  deleteTrackerEntry: (id: string) => void;
  savedTrackerPeople: string[];
  tables: UserTable[];
  addTable: (name: string, color: string, cols?: number, rows?: number) => string;
  updateTable: (id: string, patch: Partial<Omit<UserTable, 'id' | 'createdAt'>>) => void;
  deleteTable: (id: string) => void;
};

const HabitsContext = createContext<HabitsContextType | undefined>(undefined);

export function HabitsProvider({ children }: { children: React.ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<HabitsState['history']>({});
  const [lastResetDate, setLastResetDate] = useState<string | null>(null);
  const [dayResetTime, setDayResetTimeState] = useState<string>('00:00');
  const [reviewedDates, setReviewedDates] = useState<string[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [trackerEntries, setTrackerEntries] = useState<TrackerEntry[]>([]);
  const [savedTrackerPeople, setSavedTrackerPeople] = useState<string[]>([]);
  const [tables, setTables] = useState<UserTable[]>([]);
  const dateRef = useRef<string>(formatYmd());
  const habitsRef = useRef<Habit[]>([]);
  habitsRef.current = habits;
  const historyRef = useRef<HabitsState['history']>({});
  historyRef.current = history;
  const storageOutOfSpaceHandledRef = useRef(false);
  const habitsPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ora di reset effettiva per il ciclo corrente (usata per getDay / reset automatici)
  const dayResetTimeRef = useRef<string>('00:00');
  // Ora di reset configurata dall'utente (che potrà valere da oggi o da domani a seconda del caso)
  const dayResetConfiguredRef = useRef<string>('00:00');

  // Load persisted state with robust error handling
  useEffect(() => {
    (async () => {
      try {
        const [rawHabits, rawHistory, rawLast, rawDayResetTime, rawReviewedDates, rawTracker, rawTables] = await Promise.all([
          AsyncStorage.getItem(STORAGE_HABITS),
          AsyncStorage.getItem(STORAGE_HISTORY),
          AsyncStorage.getItem(STORAGE_LASTRESET),
          AsyncStorage.getItem(STORAGE_DAYRESETTIME),
          AsyncStorage.getItem(STORAGE_REVIEWED_DATES),
          AsyncStorage.getItem(STORAGE_TRACKER),
          AsyncStorage.getItem(STORAGE_TABLES),
        ]);

        if (rawHabits) {
          try {
            const parsed = JSON.parse(rawHabits);
            if (Array.isArray(parsed)) setHabits(parsed);
          } catch (e) {
            console.warn('Corrupted habits data, skipping');
          }
        }

        if (rawHistory) {
          try {
            const parsed = JSON.parse(rawHistory);
            if (parsed && typeof parsed === 'object') setHistory(parsed);
          } catch (e) {
            console.warn('Corrupted history data, skipping');
          }
        }

        if (rawReviewedDates) {
          try {
            const parsed = JSON.parse(rawReviewedDates);
            if (Array.isArray(parsed)) setReviewedDates(parsed);
          } catch (e) {
            console.warn('Corrupted reviewed dates data, skipping');
          }
        }

        if (rawTracker) {
          try {
            const parsed = JSON.parse(rawTracker) as { entries?: TrackerEntry[]; people?: string[] };
            if (parsed && typeof parsed === 'object') {
              if (Array.isArray(parsed.entries)) setTrackerEntries(parsed.entries);
              if (Array.isArray(parsed.people)) setSavedTrackerPeople(parsed.people);
            }
          } catch (e) {
            console.warn('Corrupted tracker data, skipping');
          }
        }

        if (rawTables) {
          try {
            const parsed = JSON.parse(rawTables);
            if (Array.isArray(parsed)) {
              // migrate old schema (columns/rows) to new (headerRow/headerCol/cells)
              const migrated = parsed.map((t: any) => {
                // already new format
                if (t.headerRows) return t;
                // intermediate format (headerRow/headerCol)
                if (t.headerRow) {
                  const headerRows = [t.headerRow as string[]];
                  const headerCols = (t.headerCol as string[]).map((v: string) => [v]);
                  return { ...t, headerRows, headerCols, headerRow: undefined, headerCol: undefined };
                }
                // legacy format (columns/rows)
                const cols: string[] = Array.isArray(t.columns) ? t.columns : [];
                const oldRows: Record<string, string>[] = Array.isArray(t.rows) ? t.rows : [];
                const rowCount = Math.max(oldRows.length, 3);
                const headerRow = cols.length > 0 ? cols : Array.from({ length: 4 }, (_, i) => String.fromCharCode(65 + i));
                const headerRows = [headerRow];
                const headerCols = Array.from({ length: rowCount }, (_, i) => [String(i + 1)]);
                const cells: string[][] = Array.from({ length: rowCount }, (_, ri) =>
                  headerRow.map(col => oldRows[ri]?.[col] ?? '')
                );
                return { ...t, headerRows, headerCols, cells, columns: undefined, rows: undefined };
              });
              setTables(migrated);
            }
          } catch (e) {
            console.warn('Corrupted tables data, skipping');
          }
        }

        const effectiveResetTime = rawDayResetTime || '00:00';
        // All'avvio, reset effettivo e configurato coincidono
        dayResetTimeRef.current = effectiveResetTime;
        dayResetConfiguredRef.current = effectiveResetTime;
        setDayResetTimeState(effectiveResetTime);
        const today = getLogicalDayKey(new Date(), effectiveResetTime);
        if (rawLast !== today) {
          setLastResetDate(today);
          await AsyncStorage.setItem(STORAGE_LASTRESET, today);
        } else {
          setLastResetDate(rawLast);
        }
        dateRef.current = today;
        setIsLoaded(true);
      } catch (error) {
        console.error('Failed to load data:', error);
        if (Platform.OS !== 'web') {
          Alert.alert(
            'Errore caricamento dati',
            'I dati potrebbero essere corrotti. Vuoi reimpostare l\'archivio?',
            [
              { text: 'Annulla', style: 'cancel' },
              { text: 'Reimposta', onPress: () => resetStorage() }
            ]
          );
        }
      setIsLoaded(true);
      }
    })();
  }, []);

  // Persist habits/history (debounced) with out-of-space handling
  useEffect(() => {
    if (habitsPersistTimerRef.current) clearTimeout(habitsPersistTimerRef.current);
    habitsPersistTimerRef.current = setTimeout(() => {
      AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(habits)).catch((error) => {
        console.error('Failed to save habits:', error);
        if (storageOutOfSpaceHandledRef.current) return;
        if (!isOutOfSpaceError(error)) return;
        storageOutOfSpaceHandledRef.current = true;
        if (Platform.OS === 'web') return;

        Alert.alert(
          'Spazio insufficiente',
          'Il salvataggio non riesce perché lo storage è pieno. Vuoi reimpostare l\'archivio (perdere i dati locali)?',
          [
            { text: 'Annulla', style: 'cancel' },
            {
              text: 'Reimposta',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  try {
                    await resetStorage();
                  } finally {
                    storageOutOfSpaceHandledRef.current = false;
                  }
                })();
              },
            },
          ]
        );
      });
    }, 300);

    return () => {
      if (habitsPersistTimerRef.current) clearTimeout(habitsPersistTimerRef.current);
      habitsPersistTimerRef.current = null;
    };
  }, [habits]);

  useEffect(() => {
    if (historyPersistTimerRef.current) clearTimeout(historyPersistTimerRef.current);
    historyPersistTimerRef.current = setTimeout(() => {
      const pruned = pruneHistory(history);
      AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(pruned)).catch((error) => {
        console.error('Failed to save history:', error);
        if (storageOutOfSpaceHandledRef.current) return;
        if (!isOutOfSpaceError(error)) return;
        storageOutOfSpaceHandledRef.current = true;
        if (Platform.OS === 'web') return;

        Alert.alert(
          'Spazio insufficiente',
          'Il salvataggio non riesce perché lo storage è pieno. Vuoi reimpostare l\'archivio (perdere i dati locali)?',
          [
            { text: 'Annulla', style: 'cancel' },
            {
              text: 'Reimposta',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  try {
                    await resetStorage();
                  } finally {
                    storageOutOfSpaceHandledRef.current = false;
                  }
                })();
              },
            },
          ]
        );
      });
    }, 300);

    return () => {
      if (historyPersistTimerRef.current) clearTimeout(historyPersistTimerRef.current);
      historyPersistTimerRef.current = null;
    };
  }, [history]);

  // Setup geofencing for location-based habits when permissions and data allow
  useEffect(() => {
    if (!canAskLocationPermission()) return;
    (async () => {
      try {
        const status = await getLocationPermissionStatusAsync();
        if (status !== 'background') {
          await stopGeofencingAsync();
          return;
        }
        const places = await loadPlaces();
        if (places.length === 0) {
          await stopGeofencingAsync();
          return;
        }
        const activePlaceIds = new Set(
          habits
            .filter(h => h.locationRule?.type === 'geofenceExit')
            .map(h => h.locationRule!.placeId),
        );
        if (activePlaceIds.size === 0) {
          await stopGeofencingAsync();
          return;
        }
        const regions = places
          .filter(p => activePlaceIds.has(p.id))
          .map(p => ({
            identifier: p.id,
            latitude: p.lat,
            longitude: p.lng,
            radius: p.radiusMeters,
          }));
        if (regions.length === 0) {
          await stopGeofencingAsync();
          return;
        }
        await startGeofencingForRegions(regions);
      } catch (e) {
        console.warn('Failed to configure geofencing', e);
      }
    })();
  }, [habits]);

  // Auto reset at midnight
  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      const currentYmd = getLogicalDayKey(now, dayResetTimeRef.current);
      if (currentYmd !== dateRef.current) {
        resetToday();
        dateRef.current = currentYmd;
        // Quando si apre un nuovo giorno logico, applica l'ora di reset configurata più recente
        dayResetTimeRef.current = dayResetConfiguredRef.current;
      }
    };

    const interval = setInterval(checkMidnight, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-complete events when their end time is reached
  const checkEventAutoComplete = useCallback(() => {
    const now = new Date();
    const todayYmd = formatYmd(now);
    // Also check yesterday for cross-midnight single events (app was backgrounded overnight)
    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayYmd = formatYmd(yesterdayDate);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const currentH = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const currentM = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const currentMins = currentH * 60 + currentM;
    const todayDow = new Date(todayYmd + 'T12:00:00.000Z').getUTCDay();

    // Returns the end time from yesterday's timeOverride if it's a cross-midnight event
    // (end time is before the day reset threshold, meaning it spans into today's early morning)
    function getYesterdayCrossMidnightEnd(habit: Habit): string | null {
      if (habit.habitFreq !== 'single') return null;
      const prevOverride = habit.timeOverrides?.[yesterdayYmd];
      if (!prevOverride || typeof prevOverride !== 'object' || !('end' in prevOverride)) return null;
      const et = (prevOverride as { start: string; end: string }).end;
      const [eh, em] = et.split(':').map(Number);
      const endMins = eh * 60 + em;
      const [rh, rm] = dayResetTimeRef.current.split(':').map(Number);
      const resetMins = rh * 60 + rm;
      // Threshold: if reset is midnight (0), use 6 AM; otherwise use reset time
      const threshold = resetMins === 0 ? 360 : resetMins;
      return endMins < threshold ? et : null;
    }

    function getEndTime(habit: Habit): string | null {
      if (habit.isAllDay) {
        const [rh, rm] = dayResetTimeRef.current.split(':').map(Number);
        const resetMins = rh * 60 + rm;
        const endMins = resetMins === 0 ? 23 * 60 + 59 : resetMins - 1;
        return `${String(Math.floor(endMins / 60)).padStart(2, '0')}:${String(endMins % 60).padStart(2, '0')}`;
      }
      const override = habit.timeOverrides?.[todayYmd];
      if (override && typeof override === 'object' && 'end' in override) return (override as { start: string; end: string }).end;
      // Cross-midnight: event from yesterday ending in early morning of today
      const crossMidnightEnd = getYesterdayCrossMidnightEnd(habit);
      if (crossMidnightEnd) return crossMidnightEnd;
      const weeklyEnd = habit.schedule?.weeklyTimes?.[todayDow]?.end;
      if (weeklyEnd) return weeklyEnd;
      if (habit.schedule?.endTime) return habit.schedule.endTime;
      return null;
    }

    function isToday(habit: Habit): boolean {
      const freq = habit.habitFreq;
      if (freq === 'single') {
        if (habit.timeOverrides?.[todayYmd]) return true;
        // Cross-midnight: event from yesterday with early-morning end time
        if (getYesterdayCrossMidnightEnd(habit)) return true;
        return false;
      }
      if (freq === 'daily') return true;
      if (freq === 'weekly') return (habit.schedule?.daysOfWeek ?? []).includes(todayDow);
      if (freq === 'monthly') {
        const dayNum = parseInt(todayYmd.split('-')[2], 10);
        return (habit.schedule?.monthDays ?? []).includes(dayNum);
      }
      if (freq === 'annual') {
        const [, m, d] = todayYmd.split('-').map(Number);
        return habit.schedule?.yearMonth === m && habit.schedule?.yearDay === d;
      }
      return !!(habit.timeOverrides?.[todayYmd]) || (habit.schedule?.daysOfWeek?.includes(todayDow) ?? false);
    }

    for (const habit of habitsRef.current) {
      if (habit.tipo !== 'evento') continue;
      if (historyRef.current[todayYmd]?.completedByHabitId[habit.id]) continue;
      if (!isToday(habit)) continue;
      const endTime = getEndTime(habit);
      if (!endTime) continue;
      const [eh, em] = endTime.split(':').map(Number);
      if (currentMins >= eh * 60 + em) {
        setHistory(prev => {
          const day = prev[todayYmd] || { date: todayYmd, completedByHabitId: {} };
          if (day.completedByHabitId[habit.id]) return prev;
          const n = getDailyOccurrenceTotal(habit);
          const nextCounts = { ...(day.occurrenceDoneCountByHabitId ?? {}) };
          if (n > 1) nextCounts[habit.id] = n;
          return {
            ...prev,
            [todayYmd]: {
              ...day,
              completedByHabitId: { ...day.completedByHabitId, [habit.id]: true },
              occurrenceDoneCountByHabitId: n > 1 ? nextCounts : day.occurrenceDoneCountByHabitId,
            },
          };
        });
      }
    }
  }, []);

  // Run check after habits load or change (catches newly created events immediately)
  useEffect(() => {
    if (habits.length > 0) checkEventAutoComplete();
  }, [habits, checkEventAutoComplete]);

  // Run check every minute for time-based completion
  useEffect(() => {
    const interval = setInterval(checkEventAutoComplete, 60 * 1000);
    return () => clearInterval(interval);
  }, [checkEventAutoComplete]);

  // Re-run check when app comes back to foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') checkEventAutoComplete();
    });
    return () => sub.remove();
  }, [checkEventAutoComplete]);

  const addHabit = useCallback((text: string, color?: string, folder?: string, tipo?: 'task' | 'abitudine' | 'evento', initial?: { timeOverrides?: Habit['timeOverrides']; schedule?: Habit['schedule']; isAllDay?: boolean; habitFreq?: Habit['habitFreq']; label?: string }) => {
    const newId = generateUUID();
    const base = { id: newId, text, order: 0, color: color ?? '#4A148C', createdAt: formatYmd(), createdAtMs: Date.now(), folder, tipo };
    setHabits((prev) => {
      const newOrder = prev.length;
      const newHabit: Habit = {
        ...base,
        order: newOrder,
        ...(initial?.timeOverrides && { timeOverrides: initial.timeOverrides }),
        ...(initial?.schedule && { schedule: initial.schedule }),
        ...(initial?.isAllDay !== undefined && { isAllDay: initial.isAllDay }),
        ...(initial?.habitFreq && { habitFreq: initial.habitFreq }),
        ...(initial?.label && { label: initial.label }),
      };
      return [...prev, newHabit];
    });
    return newId;
  }, []);

  const duplicateHabit = useCallback((id: string): string | null => {
    let newId: string | null = null;
    setHabits((prev) => {
      const source = prev.find(h => h.id === id);
      if (!source) return prev;
      newId = generateUUID();
      const copy: Habit = {
        ...source,
        id: newId,
        createdAt: formatYmd(),
        order: prev.length,
        timeOverrides: {},
      };
      return [...prev, copy];
    });
    return newId;
  }, []);

  const updateHabit = useCallback((id: string, text: string) => {
    setHabits((prev) => {
      const next = prev.map((h) => (h.id === id ? { ...h, text } : h));
      return next;
    });
  }, []);

  const updateHabitColor = useCallback((id: string, color: string) => {
    setHabits((prev) => {
      const next = prev.map((h) => (h.id === id ? { ...h, color } : h));
      return next;
    });
  }, []);

  const updateHabitFolder = useCallback((id: string, folder: string | undefined) => {
    setHabits((prev) => {
      const next = prev.map((h) => (h.id === id ? { ...h, folder: folder?.trim() || undefined } : h));
      return next;
    });
  }, []);

  const addTrackerEntry = useCallback((entry: Omit<TrackerEntry, 'id' | 'createdAt'>): string => {
    const newId = generateUUID();
    const now = formatYmd();
    const newEntry: TrackerEntry = { ...entry, id: newId, createdAt: now };
    setTrackerEntries(prev => {
      const next = [...prev, newEntry];
      const people = Array.from(new Set([...savedTrackerPeople, ...(entry.withPeople ?? [])].filter(Boolean)));
      setSavedTrackerPeople(people);
      AsyncStorage.setItem(STORAGE_TRACKER, JSON.stringify({ entries: next, people })).catch(() => {});
      return next;
    });
    return newId;
  }, [savedTrackerPeople]);

  const updateTrackerEntry = useCallback((id: string, entry: Partial<Omit<TrackerEntry, 'id' | 'createdAt'>>) => {
    setTrackerEntries(prev => {
      const next = prev.map(e => e.id === id ? { ...e, ...entry } : e);
      const people = Array.from(new Set([...savedTrackerPeople, ...(entry.withPeople ?? [])].filter(Boolean)));
      setSavedTrackerPeople(people);
      AsyncStorage.setItem(STORAGE_TRACKER, JSON.stringify({ entries: next, people })).catch(() => {});
      return next;
    });
  }, [savedTrackerPeople]);

  const deleteTrackerEntry = useCallback((id: string) => {
    setTrackerEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      AsyncStorage.setItem(STORAGE_TRACKER, JSON.stringify({ entries: next, people: savedTrackerPeople })).catch(() => {});
      return next;
    });
  }, [savedTrackerPeople]);

  const updateHabitTipo = useCallback((id: string, tipo: 'task' | 'abitudine' | 'evento') => {
    setHabits((prev) => {
      const next = prev.map((h) => (h.id === id ? { ...h, tipo } : h));
      return next;
    });
  }, []);

  const removeHabit = useCallback((id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const migrateTodayCompletionForDailyCountChange = useCallback((habitId: string, prevHabit: Habit, newDailyTotal: number) => {
    setHistory((prev) => {
      const today = getLogicalDayKey(new Date(), dayResetTimeRef.current);
      const day = prev[today];
      const baseDay = day ?? { date: today, completedByHabitId: {} };
      const nextDay = migrateOccurrenceCompletionForNewDailyTotal(baseDay, habitId, prevHabit, newDailyTotal);
      return { ...prev, [today]: nextDay };
    });
  }, []);

  const toggleDone = useCallback((id: string) => {
    setHistory((prev) => {
      const today = getLogicalDayKey(new Date(), dayResetTimeRef.current);
      const dayCompletion = prev[today] || { date: today, completedByHabitId: {} };
      const habit = habitsRef.current.find((h) => h.id === id);
      const n = habit ? getDailyOccurrenceTotal(habit) : 1;

      if (n <= 1) {
        const isCompleted = !dayCompletion.completedByHabitId[id];
        const nextOccCounts = { ...(dayCompletion.occurrenceDoneCountByHabitId ?? {}) };
        delete nextOccCounts[id];
        return {
          ...prev,
          [today]: {
            ...dayCompletion,
            completedByHabitId: {
              ...dayCompletion.completedByHabitId,
              [id]: isCompleted,
            },
            occurrenceDoneCountByHabitId: Object.keys(nextOccCounts).length ? nextOccCounts : undefined,
          },
        };
      }

      const k = getOccurrenceDoneForDay(dayCompletion, habit!);
      const kNext = (k + 1) % (n + 1);
      const nextCounts = { ...(dayCompletion.occurrenceDoneCountByHabitId ?? {}) };
      if (kNext === 0) delete nextCounts[id];
      else nextCounts[id] = kNext;

      return {
        ...prev,
        [today]: {
          ...dayCompletion,
          completedByHabitId: {
            ...dayCompletion.completedByHabitId,
            [id]: kNext >= n,
          },
          occurrenceDoneCountByHabitId: Object.keys(nextCounts).length ? nextCounts : undefined,
        },
      };
    });
  }, []);

  const reorder = useCallback((id: string, direction: 'up' | 'down') => {
    setHabits((prev) => {
      const index = prev.findIndex((h) => h.id === id);
      if (index === -1) return prev;

      const newHabits = [...prev].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const habitToMove = newHabits[index];

      if (direction === 'up' && index > 0) {
        const prevHabit = newHabits[index - 1];
        newHabits[index] = { ...prevHabit, order: habitToMove.order };
        newHabits[index - 1] = { ...habitToMove, order: prevHabit.order };
      } else if (direction === 'down' && index < newHabits.length - 1) {
        const nextHabit = newHabits[index + 1];
        newHabits[index] = { ...nextHabit, order: habitToMove.order };
        newHabits[index + 1] = { ...habitToMove, order: nextHabit.order };
      }
      return newHabits;
    });
  }, []);

  const updateHabitsOrder = useCallback((orderedHabits: Habit[]) => {
    setHabits(prev => {
      // Map ordered ids
      const idToIndex = new Map<string, number>();
      orderedHabits.forEach((h, idx) => idToIndex.set(h.id, idx));

      // Update the 'order' property of each habit in prev based on its position in orderedHabits
      const newHabits = prev.map(h => {
        const newOrder = idToIndex.get(h.id);
        if (newOrder !== undefined) {
          return { ...h, order: newOrder };
        }
        return h;
      });

      return newHabits;
    });
  }, []);

  const resetToday = useCallback(async () => {
    const today = getLogicalDayKey(new Date(), dayResetTimeRef.current);
    setHistory((prev) => {
      // Preserve completions for single habits — they don't recur, so they stay done permanently
      const preserved: Record<string, boolean> = {};
      for (const dayEntry of Object.values(prev)) {
        for (const [habitId, done] of Object.entries(dayEntry.completedByHabitId)) {
          if (!done) continue;
          const habit = habitsRef.current.find(h => h.id === habitId);
          if (habit?.habitFreq === 'single') {
            preserved[habitId] = true;
          }
        }
      }
      return {
        ...prev,
        [today]: { date: today, completedByHabitId: preserved, occurrenceDoneCountByHabitId: undefined },
      };
    });
    setLastResetDate(today);
    await AsyncStorage.setItem(STORAGE_LASTRESET, today);
    // Dopo un reset manuale, il nuovo ciclo usa l'ora di reset configurata più recente
    dayResetTimeRef.current = dayResetConfiguredRef.current;
  }, []);

  const getDay = useCallback((date: Date | string) => {
    return getLogicalDayKey(date, dayResetTimeRef.current);
  }, []);

  const setDayCompletion = useCallback((ymd: string, completedCount: number) => {
    setHistory((prev) => {
      const habitsForDay = getHabitsAppearingOnDate(habitsRef.current, ymd, dayResetTimeRef.current);
      const sorted = [...habitsForDay].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const completedByHabitId: Record<string, boolean> = {};
      sorted.forEach((h, i) => {
        completedByHabitId[h.id] = i < completedCount;
      });
      return {
        ...prev,
        [ymd]: { date: ymd, completedByHabitId, occurrenceDoneCountByHabitId: undefined },
      };
    });
  }, []);

  const setTimeOverride = useCallback((id: string, date: string, hhmm: string | null) => {
    setHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== id) return h;
        const nextOverrides = { ...(h.timeOverrides ?? {}) } as Record<string, string | { start: string; end: string }>;
        if (hhmm) nextOverrides[date] = hhmm; else delete nextOverrides[date];
        return { ...h, timeOverrides: nextOverrides };
      });
      return next;
    });
  }, []);

  const setTimeOverrideRange = useCallback((id: string, date: string, startTime: string | null, endTime: string | null) => {
    setHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== id) return h;
        const nextOverrides = { ...(h.timeOverrides ?? {}) } as Record<string, string | { start: string; end: string }>;
        if (startTime && endTime) {
          nextOverrides[date] = { start: startTime, end: endTime };
        } else if (startTime) {
          nextOverrides[date] = startTime;
        } else {
          delete nextOverrides[date];
        }
        return { ...h, timeOverrides: nextOverrides };
      });
      return next;
    });
  }, []);

  const setOccurrenceSlotTimeRange = useCallback((habitId: string, ymd: string, slotIndex: number, start: string, end: string) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const day = { ...(h.occurrenceSlotOverrides?.[ymd] ?? {}), [slotIndex]: { start, end } };
      const next = { ...(h.occurrenceSlotOverrides ?? {}), [ymd]: day };
      return { ...h, occurrenceSlotOverrides: next };
    }));
  }, []);

  const setMultipleOccurrenceSlotOverrides = useCallback((habitId: string, ymd: string, slots: Record<number, { start: string; end: string }>) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const day = { ...(h.occurrenceSlotOverrides?.[ymd] ?? {}), ...slots };
      const next = { ...(h.occurrenceSlotOverrides ?? {}), [ymd]: day };
      return { ...h, occurrenceSlotOverrides: next };
    }));
  }, []);

  const setOccurrenceGapMinutesAndClearDayOverrides = useCallback((habitId: string, gapMinutes: number, ymd: string) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h;
      const rest = { ...(h.occurrenceSlotOverrides ?? {}) };
      delete rest[ymd];
      return {
        ...h,
        occurrenceGapMinutes: Math.max(5, Math.floor(gapMinutes)),
        occurrenceSlotOverrides: Object.keys(rest).length ? rest : undefined,
      };
    }));
  }, []);

  const updateScheduleTime = useCallback((id: string, hhmm: string | null) => {
    setHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== id) return h;
        const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
        schedule.time = hhmm ?? null;
        return { ...h, schedule };
      });
      return next;
    });
  }, []);

  const updateScheduleFromDate = useCallback((id: string, fromDate: string, startTime: string | null, endTime: string | null) => {
    setHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== id) return h;

        const nextOverrides = { ...(h.timeOverrides ?? {}) } as Record<string, string | { start: string; end: string }>;
        const oldStart = h.schedule?.time ?? null;
        const oldEnd = h.schedule?.endTime ?? null;

        // If we have a creation date and an old schedule, freeze the past
        if (h.createdAt && (oldStart || oldEnd)) {
          const startD = parseYmdSafe(h.createdAt);
          const endD = parseYmdSafe(fromDate);

          let curr = new Date(startD);
          while (curr.getTime() < endD.getTime()) {
            const ymd = formatYmd(curr);
            if (!nextOverrides[ymd]) {
              if (oldStart && oldEnd) {
                nextOverrides[ymd] = { start: oldStart, end: oldEnd };
              } else if (oldStart) {
                nextOverrides[ymd] = oldStart;
              }
            }
            curr.setUTCDate(curr.getUTCDate() + 1);
          }
        }

        const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
        schedule.time = startTime ?? null;
        schedule.endTime = endTime ?? null;

        const isRecurring = h.habitFreq === 'daily' || h.habitFreq === 'weekly' || h.habitFreq === 'monthly' || h.habitFreq === 'annual' ||
          (h.schedule?.daysOfWeek?.length ?? 0) > 0 ||
          (h.schedule?.monthDays?.length ?? 0) > 0 ||
          !!h.schedule?.yearMonth;

        // For single/ad-hoc tasks, they ONLY appear on days where they have an explicit override.
        // So we MUST keep the override for fromDate, otherwise the task disappears from today.
        // For recurring tasks, they naturally appear on their scheduled days, so we can clear the
        // override and let them fall back to the new base schedule we're setting.
        if (!isRecurring) {
          // Update the override for the dragged day
          if (startTime && endTime) {
            nextOverrides[fromDate] = { start: startTime, end: endTime };
          } else if (startTime) {
            nextOverrides[fromDate] = startTime;
          }

          // Since it's "Da oggi in poi" mode, we should also update any future overrides 
          // this ad-hoc task might have, so they match the new time.
          for (const dateKey of Object.keys(nextOverrides)) {
            if (dateKey > fromDate) {
              if (startTime && endTime) {
                nextOverrides[dateKey] = { start: startTime, end: endTime };
              } else if (startTime) {
                nextOverrides[dateKey] = startTime;
              }
            }
          }
        } else {
          delete nextOverrides[fromDate];
        }

        return { ...h, schedule, timeOverrides: nextOverrides };
      });
      return next;
    });
  }, []);

  const updateSchedule = useCallback((id: string, daysOfWeek: number[], hhmm: string | null) => {
    setHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== id) return h;
        const existingSchedule = h.schedule ?? { daysOfWeek: [] };
        return { ...h, schedule: { ...existingSchedule, daysOfWeek, time: hhmm ?? null } };
      });
      return next;
    });
  }, []);

  const setDayResetTime = useCallback(async (timeOrFn: string | ((prev: string) => string)) => {
    // Get latest value from ref to be synchronous and accurate during rapid calls
    const oldTime = dayResetConfiguredRef.current;
    
    let newTime: string;
    if (typeof timeOrFn === 'function') {
      newTime = timeOrFn(oldTime);
    } else {
      newTime = timeOrFn;
    }

    const [nh, nm] = newTime.split(':').map(Number);
    const newMinutes = nh * 60 + nm;

    const [oh, om] = oldTime.split(':').map(Number);
    const oldMinutes = oh * 60 + om;

    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(now);
    const curH = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const curM = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const currentMinutes = curH * 60 + curM;

    let effectiveForToday = dayResetTimeRef.current;
    if (currentMinutes < oldMinutes) {
      if (newMinutes > currentMinutes) {
        effectiveForToday = newTime;
      } else {
        effectiveForToday = oldTime;
      }
    } else {
      effectiveForToday = oldTime;
    }

    setDayResetTimeState(newTime);
    dayResetConfiguredRef.current = newTime;
    dayResetTimeRef.current = effectiveForToday;

    await AsyncStorage.setItem(STORAGE_DAYRESETTIME, newTime);
  }, []);

  const markDateReviewed = useCallback(async (ymd: string) => {
    setReviewedDates(prev => {
      if (prev.includes(ymd)) return prev;
      const next = [...prev, ymd].sort();
      const trimmed = next.slice(-MAX_REVIEWED_DATES);
      AsyncStorage.setItem(STORAGE_REVIEWED_DATES, JSON.stringify(trimmed)).catch(() => {});
      return trimmed;
    });
  }, []);

  const saveDayReview = useCallback((ymd: string, habitId: string, rating: number | null, comment: string | null) => {
    setHistory(prev => {
      const day = prev[ymd] || { date: ymd, completedByHabitId: {} };
      const ratings = { ...(day.ratings ?? {}) };
      const comments = { ...(day.comments ?? {}) };
      if (rating !== null) ratings[habitId] = rating; else delete ratings[habitId];
      if (comment !== null && comment.trim() !== '') comments[habitId] = comment.trim(); else delete comments[habitId];
      return {
        ...prev,
        [ymd]: { ...day, ratings, comments },
      };
    });
  }, []);

  const updateHabitAskReview = useCallback((id: string, askReview: boolean) => {
    setHabits(prev => {
      const next = prev.map(h => (h.id === id ? { ...h, askReview } : h));
      return next;
    });
  }, []);

  const resetStorage = useCallback(async () => {
    try {
      await AsyncStorage.clear();
      setHabits([]);
      setHistory({});
      setLastResetDate(null);
      setDayResetTimeState('00:00');
      setReviewedDates([]);
      const today = formatYmd();
      dateRef.current = today;
      await AsyncStorage.setItem(STORAGE_LASTRESET, today);
    } catch (error) {
      console.error('Failed to reset storage:', error);
      if (Platform.OS !== 'web') {
        Alert.alert('Errore', 'Impossibile reimpostare l\'archivio');
      }
    }
  }, []);

  const addTable = useCallback((name: string, color: string, cols = 4, rowCount = 5): string => {
    const newId = generateUUID();
    const now = formatYmd();
    const headerRows = [Array.from({ length: cols }, (_, i) => String.fromCharCode(65 + i))];
    const headerCols = Array.from({ length: rowCount }, (_, i) => [String(i + 1)]);
    const cells: string[][] = Array.from({ length: rowCount }, () => Array(cols).fill(''));
    const newTable: UserTable = { id: newId, name, color, createdAt: now, headerRows, headerCols, cells };
    setTables(prev => {
      const next = [...prev, newTable];
      AsyncStorage.setItem(STORAGE_TABLES, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return newId;
  }, []);

  const updateTable = useCallback((id: string, patch: Partial<Omit<UserTable, 'id' | 'createdAt'>>) => {
    setTables(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...patch } : t);
      AsyncStorage.setItem(STORAGE_TABLES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const deleteTable = useCallback((id: string) => {
    setTables(prev => {
      const next = prev.filter(t => t.id !== id);
      AsyncStorage.setItem(STORAGE_TABLES, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo<HabitsContextType>(() => ({
    habits, history, lastResetDate, dayResetTime, reviewedDates, isLoaded,
    addHabit, duplicateHabit, updateHabit, updateHabitColor, updateHabitFolder, updateHabitTipo, removeHabit, migrateTodayCompletionForDailyCountChange, toggleDone, reorder, updateHabitsOrder, resetToday, getDay, setDayCompletion,
    setTimeOverride, setTimeOverrideRange, setOccurrenceSlotTimeRange, setMultipleOccurrenceSlotOverrides, setOccurrenceGapMinutesAndClearDayOverrides, updateScheduleTime, updateScheduleFromDate, updateSchedule, setDayResetTime, setHabits, resetStorage,
    markDateReviewed, saveDayReview, updateHabitAskReview,
    trackerEntries, addTrackerEntry, updateTrackerEntry, deleteTrackerEntry, savedTrackerPeople,
    tables, addTable, updateTable, deleteTable,
  }), [habits, history, lastResetDate, dayResetTime, reviewedDates, isLoaded, addHabit, duplicateHabit, updateHabit, updateHabitColor, updateHabitFolder, updateHabitTipo, removeHabit, migrateTodayCompletionForDailyCountChange, toggleDone, reorder, updateHabitsOrder, resetToday, getDay, setDayCompletion, setTimeOverride, setTimeOverrideRange, setOccurrenceSlotTimeRange, setMultipleOccurrenceSlotOverrides, setOccurrenceGapMinutesAndClearDayOverrides, updateScheduleTime, updateScheduleFromDate, updateSchedule, setDayResetTime, setHabits, resetStorage, markDateReviewed, saveDayReview, updateHabitAskReview, trackerEntries, addTrackerEntry, updateTrackerEntry, deleteTrackerEntry, savedTrackerPeople, tables, addTable, updateTable, deleteTable]);

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within HabitsProvider');
  return ctx;
}


