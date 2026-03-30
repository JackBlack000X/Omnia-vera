import type { HabitTipo } from '@/lib/habits/schema';

// -- Types --

export type OggiEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  calendarYmd?: string;
  displayOffsetMinutes?: number;
  logicalStartMin?: number;
  logicalEndMin?: number;
  isAllDay: boolean;
  color: string;
  createdAt?: string;
  createdAtMs?: number;
  tipo?: HabitTipo;
  habitFreq?: 'single' | 'daily' | 'weekly' | 'monthly' | 'annual';
  travelMezzo?: 'aereo' | 'treno' | 'auto' | 'nave' | 'bici' | 'bus' | 'altro';
  /** Id abitudine reale quando `id` è sintetico (`::occ::`) */
  habitId?: string;
  /** Più occorrenze nello stesso giorno */
  multiOccurrenceSlot?: boolean;
  occurrenceSlotIndex?: number;
  occurrenceTotal?: number;
  dragDisabled?: boolean;
  isNotificationPreview?: boolean;
  notificationPreviewCompleted?: boolean;
};

const OCC_ID_MARKER = '::occ::';

export function makeOccurrenceEventId(habitId: string, slotIndex: number): string {
  return `${habitId}${OCC_ID_MARKER}${slotIndex}`;
}

export function resolveOggiHabitId(ev: Pick<OggiEvent, 'id' | 'habitId'>): string {
  return ev.habitId ?? ev.id;
}

// -- Constants for Layout --

export const LEFT_MARGIN = 65;
export const BASE_VERTICAL_OFFSET = 10;
export const DRAG_VISUAL_OFFSET = BASE_VERTICAL_OFFSET + 2;
export const HOUR_FONT_SIZE = 14;

// -- Helper Functions --

export function isLightColor(hex: string): boolean {
  const c = (hex || '').toLowerCase();
  if (!c.startsWith('#') || (c.length !== 7 && c.length !== 4)) return false;
  let r: number, g: number, b: number;
  if (c.length === 7) {
    r = parseInt(c.slice(1, 3), 16);
    g = parseInt(c.slice(3, 5), 16);
    b = parseInt(c.slice(5, 7), 16);
  } else {
    r = parseInt(c[1] + c[1], 16);
    g = parseInt(c[2] + c[2], 16);
    b = parseInt(c[3] + c[3], 16);
  }
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l >= 140;
}

export function toMinutes(hhmm: string) {
  if (hhmm === '24:00') return 1440;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function isValidTimeString(hhmm: string | null | undefined): hhmm is string {
  if (typeof hhmm !== 'string') return false;
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (minutes < 0 || minutes > 59) return false;
  if (hours < 0 || hours > 24) return false;
  if (hours === 24 && minutes !== 0) return false;
  return true;
}

export function minutesToTime(minutes: number): string {
  const total = Math.round(minutes);
  if (total === 1440) return '24:00';
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
