import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GEOFENCE_TASK_NAME } from '@/lib/location';
import { Habit, DayCompletion } from '@/lib/habits/schema';

const STORAGE_HABITS = 'habitcheck_habits_v1';
const STORAGE_HISTORY = 'habitcheck_history_v1';
const STORAGE_DAYRESETTIME = 'habitcheck_dayresettime_v1';
const TZ = 'Europe/Zurich';

function parseYmdSafe(ymd: string): Date {
  return new Date(ymd + 'T12:00:00.000Z');
}

function formatYmd(date = new Date(), tz = TZ): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    const d = date instanceof Date ? date : parseYmdSafe(String(date));
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${d.getUTCFullYear()}-${m}-${dd}`;
  }
}

function getLogicalDayKey(date: Date, dayResetTime: string): string {
  if (dayResetTime !== '00:00') {
    const [resetHour, resetMinute] = dayResetTime.split(':').map(Number);
    const resetMinutes = resetHour * 60 + resetMinute;

    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
    const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
    const currentMinutes = hour * 60 + minute;

    if (currentMinutes < resetMinutes) {
      const prevDay = new Date(date);
      prevDay.setUTCDate(prevDay.getUTCDate() - 1);
      return formatYmd(prevDay);
    }
  }
  return formatYmd(date);
}

async function completeHabitsForPlace(placeId: string) {
  try {
    const [rawHabits, rawHistory, rawResetTime] = await Promise.all([
      AsyncStorage.getItem(STORAGE_HABITS),
      AsyncStorage.getItem(STORAGE_HISTORY),
      AsyncStorage.getItem(STORAGE_DAYRESETTIME),
    ]);

    if (!rawHabits) return;
    let habits: Habit[] = [];
    try {
      const parsed = JSON.parse(rawHabits);
      if (Array.isArray(parsed)) habits = parsed;
    } catch {
      return;
    }

    const targetHabits = habits.filter(
      (h) => h.locationRule?.type === 'geofenceExit' && h.locationRule.placeId === placeId,
    );
    if (targetHabits.length === 0) return;

    let history: Record<string, DayCompletion> = {};
    if (rawHistory) {
      try {
        const parsed = JSON.parse(rawHistory);
        if (parsed && typeof parsed === 'object') history = parsed;
      } catch {
        // ignore corrupted history, start fresh for today
      }
    }

    const dayResetTime = rawResetTime || '00:00';
    const now = new Date();
    const todayKey = getLogicalDayKey(now, dayResetTime);

    const existingDay = history[todayKey] ?? { date: todayKey, completedByHabitId: {} };
    const updatedCompleted = { ...existingDay.completedByHabitId };
    for (const h of targetHabits) {
      updatedCompleted[h.id] = true;
    }

    const nextHistory: Record<string, DayCompletion> = {
      ...history,
      [todayKey]: { date: todayKey, completedByHabitId: updatedCompleted },
    };

    await AsyncStorage.setItem(STORAGE_HISTORY, JSON.stringify(nextHistory));
  } catch {
    // Fail-safe: never crash the task
  }
}

TaskManager.defineTask(GEOFENCE_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.warn('Geofence task error', error);
    return;
  }
  const event = data as any;
  if (!event || !event.region) return;

  if (event.eventType === Location.GeofencingEventType.Exit) {
    const placeId = event.region.identifier;
    await completeHabitsForPlace(placeId);
  }
});

