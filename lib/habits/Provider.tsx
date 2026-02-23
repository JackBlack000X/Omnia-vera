import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { Habit, HabitsState } from './schema';

const STORAGE_HABITS = 'habitcheck_habits_v1';
const STORAGE_HISTORY = 'habitcheck_history_v1';
const STORAGE_LASTRESET = 'habitcheck_lastreset_v1';
const STORAGE_DAYRESETTIME = 'habitcheck_dayresettime_v1';
const TZ = 'Europe/Zurich';

function formatYmd(date = new Date(), tz = TZ): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  } catch {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${dd}`;
  }
}

function generateUUID(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export type HabitsContextType = {
  habits: Habit[];
  history: HabitsState['history'];
  lastResetDate: string | null;
  dayResetTime: string;
  addHabit: (text: string, color?: string, folder?: string) => string;
  updateHabit: (id: string, text: string) => void;
  updateHabitColor: (id: string, color: string) => void;
  updateHabitFolder: (id: string, folder: string | undefined) => void;
  removeHabit: (id: string) => void;
  toggleDone: (id: string) => void;
  reorder: (id: string, direction: 'up' | 'down') => void;
  updateHabitsOrder: (orderedHabits: Habit[]) => void;
  resetToday: () => Promise<void>;
  getDay: (date: Date | string) => string;
  setTimeOverride: (id: string, date: string, hhmm: string | null) => void;
  setTimeOverrideRange: (id: string, date: string, startTime: string | null, endTime: string | null) => void;
  updateScheduleTime: (id: string, hhmm: string | null) => void;
  updateScheduleFromDate: (id: string, fromDate: string, startTime: string | null, endTime: string | null) => void;
  updateSchedule: (id: string, daysOfWeek: number[], hhmm: string | null) => void;
  setDayResetTime: (time: string) => Promise<void>;
  setHabits: React.Dispatch<React.SetStateAction<Habit[]>>;
  resetStorage: () => Promise<void>;
};

const HabitsContext = createContext<HabitsContextType | undefined>(undefined);

export function HabitsProvider({ children }: { children: React.ReactNode }) {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [history, setHistory] = useState<HabitsState['history']>({});
  const [lastResetDate, setLastResetDate] = useState<string | null>(null);
  const [dayResetTime, setDayResetTimeState] = useState<string>('00:00');
  const dateRef = useRef<string>(formatYmd());

  // Load persisted state with robust error handling
  useEffect(() => {
    (async () => {
      try {
        const [rawHabits, rawHistory, rawLast, rawDayResetTime] = await Promise.all([
          AsyncStorage.getItem(STORAGE_HABITS),
          AsyncStorage.getItem(STORAGE_HISTORY),
          AsyncStorage.getItem(STORAGE_LASTRESET),
          AsyncStorage.getItem(STORAGE_DAYRESETTIME),
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

        const today = formatYmd();
        if (rawLast !== today) {
          setLastResetDate(today);
          await AsyncStorage.setItem(STORAGE_LASTRESET, today);
        } else {
          setLastResetDate(rawLast);
        }
        
        if (rawDayResetTime) {
          setDayResetTimeState(rawDayResetTime);
        }
        
        dateRef.current = today;
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
      }
    })();
  }, []);

  // Persist habits/history with error handling
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(habits)).catch((error) => {
      console.error('Failed to save habits:', error);
    });
  }, [habits]);
  useEffect(() => {
    AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(history)).catch((error) => {
      console.error('Failed to save history:', error);
    });
  }, [history]);

  // Auto reset at midnight
  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      const currentYmd = formatYmd(now);
      if (currentYmd !== dateRef.current) {
        resetToday();
        dateRef.current = currentYmd;
      }
    };

    const interval = setInterval(checkMidnight, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const addHabit = useCallback((text: string, color?: string, folder?: string) => {
    const newId = generateUUID();
    setHabits((prev) => [
      ...prev,
      { id: newId, text, order: prev.length, color: color ?? '#4A148C', createdAt: formatYmd(), folder },
    ]);
    return newId;
  }, []);

  const updateHabit = useCallback((id: string, text: string) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, text } : h)));
  }, []);

  const updateHabitColor = useCallback((id: string, color: string) => {
    setHabits((prev) => prev.map((h) => (h.id === id ? { ...h, color } : h)));
  }, []);

  const updateHabitFolder = useCallback((id: string, folder: string | undefined) => {
    setHabits((prev) => {
      const next = prev.map((h) => (h.id === id ? { ...h, folder: folder?.trim() || undefined } : h));
      AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeHabit = useCallback((id: string) => {
    setHabits((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const toggleDone = useCallback((id: string) => {
    setHistory((prev) => {
      const today = formatYmd();
      const dayCompletion = prev[today] || { date: today, completedByHabitId: {} };
      const isCompleted = !dayCompletion.completedByHabitId[id];
      return {
        ...prev,
        [today]: {
          ...dayCompletion,
          completedByHabitId: {
            ...dayCompletion.completedByHabitId,
            [id]: isCompleted,
          },
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
    const today = formatYmd();
    setHistory((prev) => ({
      ...prev,
      [today]: { date: today, completedByHabitId: {} },
    }));
    setLastResetDate(today);
    await AsyncStorage.setItem(STORAGE_LASTRESET, today);
  }, []);

  const getDay = useCallback((date: Date | string) => {
    const d = typeof date === 'string' ? new Date(date) : date;
    
    // If day reset time is not midnight, adjust the date
    if (dayResetTime !== '00:00') {
      const [resetHour, resetMinute] = dayResetTime.split(':').map(Number);
      const resetMinutes = resetHour * 60 + resetMinute;
      
      // Get current time in minutes
      const currentMinutes = d.getHours() * 60 + d.getMinutes();
      
      // If current time is before reset time, consider it the previous day
      if (currentMinutes < resetMinutes) {
        const prevDay = new Date(d);
        prevDay.setDate(prevDay.getDate() - 1);
        return formatYmd(prevDay);
      }
    }
    
    return formatYmd(d);
  }, [dayResetTime]);

  const setTimeOverride = useCallback((id: string, date: string, hhmm: string | null) => {
    setHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== id) return h;
        const nextOverrides = { ...(h.timeOverrides ?? {}) } as Record<string, string | { start: string; end: string }>;
        if (hhmm) nextOverrides[date] = hhmm; else delete nextOverrides[date];
        return { ...h, timeOverrides: nextOverrides };
      });
      AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
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
        } else {
          delete nextOverrides[date];
        }
        return { ...h, timeOverrides: nextOverrides };
      });
      AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateScheduleTime = useCallback((id: string, hhmm: string | null) => {
    setHabits(prev => {
      const next = prev.map(h => {
        if (h.id !== id) return h;
        const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
        schedule.time = hhmm ?? null;
        return { ...h, schedule };
      });
      AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
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
          const startD = new Date(h.createdAt);
          const endD = new Date(fromDate);
          
          // Iterate from createdAt to fromDate (exclusive)
          let curr = new Date(startD);
          while (curr < endD) {
            const ymd = formatYmd(curr);
            // Only freeze if no override exists for that day
            if (!nextOverrides[ymd]) {
              if (oldStart && oldEnd) {
                nextOverrides[ymd] = { start: oldStart, end: oldEnd };
              } else if (oldStart) {
                nextOverrides[ymd] = oldStart;
              }
            }
            curr.setDate(curr.getDate() + 1);
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
          const fromDateObj = new Date(fromDate);
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
      AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
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
      AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const setDayResetTime = useCallback(async (time: string) => {
    setDayResetTimeState(time);
    await AsyncStorage.setItem(STORAGE_DAYRESETTIME, time);
  }, []);

  const resetStorage = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_HABITS),
        AsyncStorage.removeItem(STORAGE_HISTORY),
        AsyncStorage.removeItem(STORAGE_LASTRESET),
        AsyncStorage.removeItem(STORAGE_DAYRESETTIME),
      ]);
      setHabits([]);
      setHistory({});
      setLastResetDate(null);
      setDayResetTimeState('00:00');
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

  const value = useMemo<HabitsContextType>(() => ({
    habits, history, lastResetDate, dayResetTime,
    addHabit, updateHabit, updateHabitColor, updateHabitFolder, removeHabit, toggleDone, reorder, updateHabitsOrder, resetToday, getDay,
    setTimeOverride, setTimeOverrideRange, updateScheduleTime, updateScheduleFromDate, updateSchedule, setDayResetTime, setHabits, resetStorage,
  }), [habits, history, lastResetDate, dayResetTime, addHabit, updateHabit, updateHabitColor, updateHabitFolder, removeHabit, toggleDone, reorder, updateHabitsOrder, resetToday, getDay, setTimeOverride, setTimeOverrideRange, updateScheduleTime, updateScheduleFromDate, updateSchedule, setDayResetTime, setHabits, resetStorage]);

  return <HabitsContext.Provider value={value}>{children}</HabitsContext.Provider>;
}

export function useHabits() {
  const ctx = useContext(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used within HabitsProvider');
  return ctx;
}


