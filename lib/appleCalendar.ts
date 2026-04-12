import type { Habit } from '@/lib/habits/schema';
import { createStableId } from '@/lib/createStableId';
import i18n from '@/lib/i18n/i18n';
import { toBcp47 } from '@/lib/i18n/bcp47';
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

const TZ = 'Europe/Zurich';

export const STORAGE_CALENDAR_ASKED = 'omnia_calendar_asked_v1';

function formatYmd(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    const d = date;
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${d.getUTCFullYear()}-${m}-${dd}`;
  }
}

function dateToHHMM(d: Date): string {
  try {
    const parts = new Intl.DateTimeFormat(toBcp47(i18n.language), {
      timeZone: TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);
    const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
    const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
    return `${hour}:${minute}`;
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

/** True if the app can ask for calendar access (iOS/Android only). */
export function canAskCalendarPermission(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

/**
 * Request calendar permission. Returns the permission status.
 * On web or unsupported platforms, returns 'denied'.
 */
export async function requestCalendarPermissionsAsync(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  if (!canAskCalendarPermission()) return 'denied';
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'denied';
  }
}

/**
 * Get current calendar permission status without prompting.
 */
export async function getCalendarPermissionStatusAsync(): Promise<
  'granted' | 'denied' | 'undetermined'
> {
  if (!canAskCalendarPermission()) return 'denied';
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync();
    if (status === 'granted') return 'granted';
    if (status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'denied';
  }
}

/**
 * Fetch calendar events from the device (Apple Calendar on iOS) in the given range.
 * Requires calendar permission to be granted.
 */
export async function getCalendarEventsAsync(
  startDate: Date,
  endDate: Date
): Promise<Calendar.Event[]> {
  if (!canAskCalendarPermission()) return [];
  const status = await getCalendarPermissionStatusAsync();
  if (status !== 'granted') return [];

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const ids = calendars.map((c) => c.id);
  if (ids.length === 0) return [];

  return Calendar.getEventsAsync(ids, startDate, endDate);
}

const DEFAULT_EVENT_COLOR = '#4A148C';

/**
 * Convert expo-calendar events to Habit[] (tipo 'evento').
 * Skips events whose calendarEventId is already present in existingHabits.
 */
export function calendarEventsToHabits(
  events: Calendar.Event[],
  existingHabits: Habit[],
  orderOffset: number
): Habit[] {
  const existingIds = new Set(
    existingHabits
      .map((h) => h.calendarEventId)
      .filter((id): id is string => Boolean(id))
  );

  const created = new Date();
  const ymdCreated = formatYmd(created);

  return events
    .filter((e) => e.id && !existingIds.has(e.id))
    .map((event, i) => {
      const id = createStableId();
      const start =
        typeof event.startDate === 'string'
          ? new Date(event.startDate)
          : event.startDate;
      const end =
        typeof event.endDate === 'string'
          ? new Date(event.endDate)
          : event.endDate;
      const ymd = formatYmd(start);

      const timeOverrides: Record<string, string | { start: string; end: string }> =
        {};
      if (event.allDay) {
        timeOverrides[ymd] = '00:00';
      } else {
        timeOverrides[ymd] = {
          start: dateToHHMM(start),
          end: dateToHHMM(end),
        };
      }

      return {
        id,
        text: event.title ?? 'Senza titolo',
        order: orderOffset + i,
        color: DEFAULT_EVENT_COLOR,
        createdAt: ymdCreated,
        isAllDay: event.allDay ?? false,
        habitFreq: 'single' as const,
        tipo: 'evento' as const,
        timeOverrides,
        calendarEventId: event.id ?? undefined,
      } satisfies Habit;
    });
}
