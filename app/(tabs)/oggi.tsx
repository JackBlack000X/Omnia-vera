import DraggableEvent from '@/components/oggi/DraggableEvent';
import DayReviewModal, { ReviewHabitItem } from '@/components/oggi/DayReviewModal';
import TrackerModal from '@/components/oggi/TrackerModal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { THEME } from '@/constants/theme';
import { isToday, parseYmdSafe } from '@/lib/date';
import { getLogicalDayKey, useHabits } from '@/lib/habits/Provider';
import { isTravelLikeTipo, type Habit } from '@/lib/habits/schema';
import { getDailyOccurrenceTotal, getDailyOccurrenceTotalForDate } from '@/lib/habits/occurrences';
import {
  appearsOnDateRaw,
  getHabitsAppearingOnDate,
  getTravelActiveRangesForLogicalDate,
  rangeOverlapsAny,
} from '@/lib/habits/habitsForDate';
import { calculateLayout, LayoutInfo } from '@/lib/layoutEngine';
import { cancelAllScheduledNotifications, registerForPushNotificationsAsync, scheduleHabitNotification } from '@/lib/notifications';
import { calculateEventVerticalMetrics } from '@/lib/oggi/eventLayout';
import { BASE_VERTICAL_OFFSET, isValidTimeString, isLightColor, LEFT_MARGIN, makeOccurrenceEventId, minutesToTime, OggiEvent, resolveOggiHabitId, toMinutes } from '@/lib/oggi/oggiHelpers';
import { useTimelineSettings } from '@/lib/oggi/useTimelineSettings';
import { useWeather } from '@/lib/oggi/useWeather';
import { toBcp47 } from '@/lib/i18n/bcp47';
import i18n from '@/lib/i18n/i18n';
import { useAppTheme } from '@/lib/theme-context';
import { FALLBACK_CITIES, fetchWeather, weatherCodeToColor, weatherCodeToIcon, WeatherDay } from '@/lib/weather';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Dimensions, LayoutChangeEvent, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 150;

function HoldableButton({ onPress, style, children }: { onPress: () => void | Promise<void>; style: any; children: React.ReactNode }) {
  const onPressRef = useRef(onPress);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPressedRef = useRef(false);
  const isRunningRef = useRef(false);

  useEffect(() => { onPressRef.current = onPress; }, [onPress]);

  const clearTimers = () => {
    isPressedRef.current = false;
    isRunningRef.current = false;
    if (holdTimeoutRef.current) { clearTimeout(holdTimeoutRef.current); holdTimeoutRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  };

  const handlePressIn = async () => {
    if (isPressedRef.current) return;
    isPressedRef.current = true;
    
    if (holdTimeoutRef.current) { clearTimeout(holdTimeoutRef.current); holdTimeoutRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }

    isRunningRef.current = true;
    try {
      await onPressRef.current();
    } finally {
      isRunningRef.current = false;
    }

    holdTimeoutRef.current = setTimeout(() => {
      if (isPressedRef.current && !intervalRef.current) {
        intervalRef.current = setInterval(async () => {
          if (isPressedRef.current && !isRunningRef.current) {
            isRunningRef.current = true;
            try {
              await onPressRef.current();
            } finally {
              isRunningRef.current = false;
            }
          }
        }, HOLD_INTERVAL_MS);
      }
    }, HOLD_DELAY_MS);
  };

  useEffect(() => {
    return () => {
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <Pressable 
      style={({ pressed }) => [style, pressed && { opacity: 0.85 }]} 
      onPress={() => {}} 
      onPressIn={handlePressIn} 
      onPressOut={clearTimers} 
      onResponderTerminate={clearTimers}
    >
      {children}
    </Pressable>
  );
}

const TZ = 'Europe/Zurich';
const COLUMN_RANKS_KEY = 'oggi_column_ranks_v1';
/** Bordo autoscroll in px: sopra questa distanza da top/bottom della timeline parte lo scroll */
const OGGI_DRAG_AUTOSCROLL_THRESHOLD = 0;
const OGGI_DRAG_AUTOSCROLL_THRESHOLD_BOTTOM = 82;
const OGGI_DRAG_AUTOSCROLL_BASE_SPEED = 4;
const OGGI_DRAG_AUTOSCROLL_EXTRA_SPEED = 9;
const VACATION_ACCENT = '#facc15';

// -- Helper Functions --

function formatDateLong(date: Date, tz: string): string {
  const locale = toBcp47(i18n.language);
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString(locale);
  }
}

function shortPlaceLabel(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '';
  const first = trimmed.split(',')[0];
  return first ? first.trim() : trimmed;
}

function diffDays(fromYmd: string, toYmd: string): number {
  const from = new Date(fromYmd + 'T12:00:00.000Z');
  const to = new Date(toYmd + 'T12:00:00.000Z');
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function formatDateLabelLong(ymd: string): string {
  const locale = toBcp47(i18n.language);
  try {
    const d = new Date(ymd + 'T12:00:00.000Z');
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'Europe/Zurich',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return ymd;
  }
}

function formatCalendarYmd(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

function nextYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function prevYmd(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function OggiScreen() {
  const { t } = useTranslation();
  const { habits, history, getDay, getResetTimeForDay, setTimeOverrideRange, setOccurrenceSlotTimeRange, setMultipleOccurrenceSlotOverrides, setOccurrenceGapMinutesAndClearDayOverrides, updateScheduleFromDate, setHabits, reviewedDates, markDateReviewed, saveDayReview, dayResetTime, setDayResetTime, isLoaded, trackerEntries } = useHabits();
  const { activeTheme } = useAppTheme();
  const router = useRouter();
  const { ymd } = useLocalSearchParams<{ ymd?: string }>();
  const [currentDate, setCurrentDate] = useState(() => {
    if (ymd) return new Date(ymd + 'T12:00:00');
    return new Date();
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [showSettings, setShowSettings] = useState(false);
  const [reviewQueue, setReviewQueue] = useState<string[]>([]);
  const [dismissedDatesThisSession, setDismissedDatesThisSession] = useState<string[]>([]);

  const [reviewingHabitId, setReviewingHabitId] = useState<string | null>(null);
  const [reviewingDate, setReviewingDate] = useState<string | null>(null);
  const [showTrackerModal, setShowTrackerModal] = useState(false);
  const [editingTrackerEntry, setEditingTrackerEntry] = useState<import('@/lib/habits/schema').TrackerEntry | null>(null);
  const { windowStart, setWindowStart, windowEnd, setWindowEnd, visibleHours, setVisibleHours } = useTimelineSettings();
  const { todayWeather: baseTodayWeather } = useWeather(currentDate);
  const [travelTodayWeather, setTravelTodayWeather] = useState<WeatherDay | null>(null);

  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [pendingEventPositions, setPendingEventPositions] = useState<Record<string, number>>({});
  const [recentlyMovedEventId, setRecentlyMovedEventId] = useState<string | null>(null);
  const [currentDragPosition, setCurrentDragPosition] = useState<number | null>(null);
  const [dragClearedOriginalOverlap, setDragClearedOriginalOverlap] = useState(false);
  const [dragSizingLocked, setDragSizingLocked] = useState(false);
  const [dragAreaHeight, setDragAreaHeight] = useState(0);
  const dragY = useSharedValue(0);
  const dragInitialTop = useSharedValue(0);
  const scrollOffsetY = useSharedValue(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const scrollOffsetRef = useRef(0);
  const viewportHeightRef = useRef(0);
  const autoScrollDirRef = useRef<-1 | 0 | 1>(0);
  const autoScrollIntensityRef = useRef(0);
  const autoScrollRafRef = useRef<number | null>(null);

  const stableLayoutRef = useRef<Record<string, LayoutInfo>>({});
  const brokenOverlapPairsRef = useRef<Set<string>>(new Set());
  const initialOverlapsRef = useRef<Set<string>>(new Set());
  // Rank determines left-to-right order within a cluster.
  // Initialised from createdAt; bumped to a new high value each time a task is dragged,
  // so the last-moved task is always rightmost. Never reset, so relative order is stable.
  const columnRankRef = useRef<Record<string, number>>({});
  let rankCounterRef = useRef(0);

  const applyColumnRankOrder = useCallback((orderedIds: string[]) => {
    if (orderedIds.length === 0) return;
    for (let i = 0; i < orderedIds.length; i++) {
      columnRankRef.current[orderedIds[i]] = i + 1;
    }
    rankCounterRef.current = orderedIds.length;
    setRankVersion(v => v + 1);
  }, []);

  const snapshotColumnRankState = useCallback(() => ({
    ranks: { ...columnRankRef.current },
    counter: rankCounterRef.current,
  }), []);

  const restoreColumnRankState = useCallback((snapshot: { ranks: Record<string, number>; counter: number } | null | undefined) => {
    if (!snapshot) return;
    columnRankRef.current = { ...snapshot.ranks };
    rankCounterRef.current = snapshot.counter;
    setRankVersion(v => v + 1);
  }, []);

  // Load persisted column ranks and check if we need to adjust currentDate for reset
  useEffect(() => {
    AsyncStorage.getItem(COLUMN_RANKS_KEY).then(raw => {
      if (!raw) return;
      try {
        const { ranks, counter } = JSON.parse(raw);
        if (ranks && typeof ranks === 'object') columnRankRef.current = ranks;
        if (typeof counter === 'number') rankCounterRef.current = counter;
      } catch {}
    });

    // If no explicit ymd in params, keep the screen anchored to the current visible logical day.
    if (!ymd && isLoaded) {
      const visibleYmd = getDay(new Date());
      setCurrentDate(new Date(`${visibleYmd}T12:00:00`));
    }
  }, [getDay, isLoaded, dayResetTime, ymd]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now);
      // Aggiorna currentDate solo se l'utente stava guardando "oggi" ed è scoccata la mezzanotte
      // (evita di resettare se l'utente sta navigando manualmente un giorno passato/futuro)
      setCurrentDate(prev => {
        const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        const prevYmd = fmt(prev);
        const nowYmd  = fmt(now);
        if (prevYmd === nowYmd) return prev;
        // Aggiorna solo se prev era "ieri" rispetto a now (l'utente stava guardando oggi)
        const yesterday = new Date(now);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayYmd = fmt(yesterday);
        return prevYmd === yesterdayYmd ? now : prev;
      });
    };
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  const selectedDayYmd = useMemo(() => formatCalendarYmd(currentDate), [currentDate]);
  const todayYmd = getDay(new Date());
  const currentDayResetTime = useMemo(() => getResetTimeForDay(selectedDayYmd), [getResetTimeForDay, selectedDayYmd]);
  const prevDayYmd = useMemo(() => prevYmd(selectedDayYmd), [selectedDayYmd]);
  const nextDayYmd = useMemo(() => nextYmd(selectedDayYmd), [selectedDayYmd]);
  const nextDayResetTime = useMemo(() => getResetTimeForDay(nextDayYmd), [getResetTimeForDay, nextDayYmd]);

  const isPastReset = useMemo(() => {
    if (!dayResetTime || dayResetTime === '00:00') return false;
    const [rh, rm] = dayResetTime.split(':').map(Number);
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return nowMin >= rh * 60 + rm;
  }, [dayResetTime, currentTime]);
  const todayDate = useMemo(() => formatDateLong(currentDate, TZ), [currentDate]);

  const windowStartMin = useMemo(() => {
      if (dayResetTime && dayResetTime !== '00:00') return toMinutes(currentDayResetTime);
      return toMinutes(windowStart);
  }, [dayResetTime, currentDayResetTime, windowStart]);

  const windowEndMin = useMemo(() => {
      if (dayResetTime && dayResetTime !== '00:00') {
        const startMin = toMinutes(currentDayResetTime);
        let endMin = toMinutes(nextDayResetTime);
        if (endMin <= startMin) endMin += 1440;
        return endMin;
      }
      return windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
  }, [dayResetTime, currentDayResetTime, nextDayResetTime, windowEnd]);
  
  const [allDayHeight, setAllDayHeight] = useState(0);


  const timelineBaseHeight = useMemo(() => {
    const factor = activeTheme === 'futuristic' ? 0.78 : 0.775;
    return Dimensions.get('window').height * factor - allDayHeight;
  }, [allDayHeight, activeTheme]);

  const hourHeight = useMemo(() => {
    return timelineBaseHeight / visibleHours;
  }, [timelineBaseHeight, visibleHours]);

  const fiveHourReferenceHeight = useMemo(() => {
    return timelineBaseHeight / 5;
  }, [timelineBaseHeight]);

  const totalMinutes = windowEndMin - windowStartMin;
  const totalHeight = (totalMinutes / 60) * hourHeight;
  const contentHeight = useMemo(
    () => totalHeight + (visibleHours === 24 ? 0 : 43 + (activeTheme !== 'futuristic' ? 55 : 0)),
    [totalHeight, visibleHours, activeTheme]
  );
  
  const hours = useMemo(() => {
    const startHour = Math.floor(windowStartMin / 60);
    const endHour = Math.ceil(windowEndMin / 60);
    const result = [];
    for (let h = startHour; h <= endHour; h++) {
      result.push(h);
    }
    return result;
  }, [windowStartMin, windowEndMin]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
    hasAutoScrolled.current = false;
    setTravelTodayWeather(null);
  };

  const resolveDisplayTimeForEvent = useCallback((ev: Pick<OggiEvent, 'calendarYmd' | 'displayOffsetMinutes'>, displayTime: string) => {
    const displayMinutes = toMinutes(displayTime);
    const offset = ev.displayOffsetMinutes ?? 0;
    const calendarMinutes = Math.max(0, Math.min(1440, displayMinutes - offset));
    return {
      ymd: ev.calendarYmd ?? selectedDayYmd,
      time: minutesToTime(calendarMinutes),
    };
  }, [selectedDayYmd]);

  const detectHabitFreq = useCallback((habit: Habit): NonNullable<Habit['habitFreq']> => {
    if (habit.habitFreq) return habit.habitFreq;
    if ((habit.schedule?.monthDays?.length ?? 0) > 0) return 'monthly';
    if (habit.schedule?.yearMonth && habit.schedule?.yearDay) return 'annual';
    if ((habit.schedule?.daysOfWeek?.length ?? 0) > 0) return 'weekly';
    return 'daily';
  }, []);

  const isUniformRecurringTime = useCallback((habit: Habit, freq: NonNullable<Habit['habitFreq']>) => {
    const schedule = habit.schedule;
    if (!schedule) return true;

    if (freq === 'weekly') {
      const days = schedule.daysOfWeek ?? [];
      if (days.length <= 1) return true;
      const firstDay = days[0]!;
      const firstStart = schedule.weeklyTimes?.[firstDay]?.start ?? schedule.time ?? null;
      const firstEnd = schedule.weeklyTimes?.[firstDay]?.end ?? schedule.endTime ?? null;
      return days.every((day) => {
        const start = schedule.weeklyTimes?.[day]?.start ?? schedule.time ?? null;
        const end = schedule.weeklyTimes?.[day]?.end ?? schedule.endTime ?? null;
        return start === firstStart && end === firstEnd;
      });
    }

    if (freq === 'monthly') {
      const days = schedule.monthDays ?? [];
      if (days.length <= 1) return true;
      const firstDay = days[0]!;
      const firstStart = schedule.monthlyTimes?.[firstDay]?.start ?? schedule.time ?? null;
      const firstEnd = schedule.monthlyTimes?.[firstDay]?.end ?? schedule.endTime ?? null;
      return days.every((day) => {
        const start = schedule.monthlyTimes?.[day]?.start ?? schedule.time ?? null;
        const end = schedule.monthlyTimes?.[day]?.end ?? schedule.endTime ?? null;
        return start === firstStart && end === firstEnd;
      });
    }

    return true;
  }, []);

  const hasAnyDaySpecificRecurringCustomization = useCallback((habit: Habit) => {
    const hasTimeOverride = Object.values(habit.timeOverrides ?? {}).some((value) => {
      if (!value || value === '00:00') return false;
      if (typeof value === 'string') return true;
      return value.start !== value.end;
    });

    const hasOccurrenceOverride = Object.values(habit.occurrenceSlotOverrides ?? {}).some((dayOverrides) =>
      Object.keys(dayOverrides ?? {}).length > 0
    );

    return hasTimeOverride || hasOccurrenceOverride;
  }, []);

  const applyRecurringScopedTimeChange = useCallback((
    habitId: string,
    ymd: string,
    startTime: string,
    endTime: string,
    scope: 'period' | 'future'
  ) => {
    const targetDate = parseYmdSafe(ymd);
    const targetWeekday = targetDate.getDay();
    const targetDayOfMonth = targetDate.getDate();
    const targetMonth = targetDate.getMonth() + 1;

    setHabits((prev) => prev.map((habit) => {
      if (habit.id !== habitId) return habit;

      const freq = detectHabitFreq(habit);
      const schedule = { ...(habit.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
      const nextOverrides = { ...(habit.timeOverrides ?? {}) } as Record<string, string | { start: string; end: string }>;

      for (const dateKey of Object.keys(nextOverrides)) {
        if (dateKey < ymd) continue;
        const d = parseYmdSafe(dateKey);
        if (scope === 'future') {
          delete nextOverrides[dateKey];
          continue;
        }
        if (freq === 'weekly' && d.getDay() === targetWeekday) delete nextOverrides[dateKey];
        if (freq === 'monthly' && d.getDate() === targetDayOfMonth) delete nextOverrides[dateKey];
        if (freq === 'annual' && d.getDate() === targetDayOfMonth && d.getMonth() + 1 === targetMonth) delete nextOverrides[dateKey];
      }

      if (freq === 'weekly') {
        if (scope === 'future' && isUniformRecurringTime(habit, freq)) {
          schedule.weeklyTimes = {};
          for (const day of schedule.daysOfWeek ?? []) {
            schedule.weeklyTimes[day] = { start: startTime, end: endTime };
          }
          schedule.time = null;
          schedule.endTime = null;
        } else {
          schedule.weeklyTimes = { ...(schedule.weeklyTimes ?? {}) };
          schedule.weeklyTimes[targetWeekday] = { start: startTime, end: endTime };
          if ((schedule.daysOfWeek?.length ?? 0) > 1) {
            schedule.time = null;
            schedule.endTime = null;
          } else {
            schedule.time = startTime;
            schedule.endTime = endTime;
          }
        }
      } else if (freq === 'monthly') {
        if (scope === 'future' && isUniformRecurringTime(habit, freq)) {
          schedule.monthlyTimes = {};
          for (const day of schedule.monthDays ?? []) {
            schedule.monthlyTimes[day] = { start: startTime, end: endTime };
          }
          schedule.time = null;
          schedule.endTime = null;
        } else {
          schedule.monthlyTimes = { ...(schedule.monthlyTimes ?? {}) };
          schedule.monthlyTimes[targetDayOfMonth] = { start: startTime, end: endTime };
          if ((schedule.monthDays?.length ?? 0) > 1) {
            schedule.time = null;
            schedule.endTime = null;
          } else {
            schedule.time = startTime;
            schedule.endTime = endTime;
          }
        }
      } else {
        schedule.time = startTime;
        schedule.endTime = endTime;
      }

      return {
        ...habit,
        schedule,
        timeOverrides: Object.keys(nextOverrides).length ? nextOverrides : {},
      };
    }));
  }, [detectHabitFreq, isUniformRecurringTime, setHabits]);

  const getRecurringDragButtons = useCallback(({
    event,
    ymd,
    startTime,
    endTime,
  }: {
    event: OggiEvent;
    ymd: string;
    startTime: string;
    endTime: string;
  }) => {
    const habitId = resolveOggiHabitId(event);
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) {
      return [
        { text: t('oggi.onlyToday'), onPress: () => setTimeOverrideRange(habitId, ymd, startTime, endTime) },
        { text: t('oggi.fromTodayOn'), onPress: () => updateScheduleFromDate(habitId, ymd, startTime, endTime) },
      ];
    }

    const freq = detectHabitFreq(habit);
    const targetDate = parseYmdSafe(ymd);
    const weekday = targetDate.getDay();
    const dayOfMonth = targetDate.getDate();
    const periodButtonLabel =
      freq === 'weekly'
        ? t('oggi.weeklyOnDay', { day: t(`weekdaysFull.${weekday}` as const) })
        : freq === 'monthly'
          ? t('oggi.monthlyOnDay', { day: dayOfMonth })
          : freq === 'annual'
            ? t('oggi.annual')
            : null;

    const buttons: Array<{ text: string; onPress: () => void }> = [
      { text: t('oggi.onlyToday'), onPress: () => setTimeOverrideRange(habitId, ymd, startTime, endTime) },
    ];

    if (periodButtonLabel) {
      buttons.push({
        text: periodButtonLabel,
        onPress: () => applyRecurringScopedTimeChange(habitId, ymd, startTime, endTime, 'period'),
      });
    }

    if (
      !hasAnyDaySpecificRecurringCustomization(habit) &&
      (
        freq === 'daily' ||
        ((freq === 'weekly' || freq === 'monthly') && isUniformRecurringTime(habit, freq))
      )
    ) {
      buttons.push({
        text: t('oggi.fromTodayOn'),
        onPress: () => {
          if (freq === 'daily') {
            updateScheduleFromDate(habitId, ymd, startTime, endTime);
          } else {
            applyRecurringScopedTimeChange(habitId, ymd, startTime, endTime, 'future');
          }
        },
      });
    }

    return buttons;
  }, [habits, detectHabitFreq, setTimeOverrideRange, updateScheduleFromDate, applyRecurringScopedTimeChange, isUniformRecurringTime, hasAnyDaySpecificRecurringCustomization, t]);

  const shouldOpenRecurringDragMenu = useCallback(({
    event,
    ymd,
  }: {
    event: OggiEvent;
    ymd: string;
    startTime: string;
    endTime: string;
  }) => {
    const habitId = resolveOggiHabitId(event);
    const habit = habits.find((h) => h.id === habitId);
    if (!habit) return true;

    const rememberedSlot = habit.occurrenceSlotMenuSource?.[ymd];
    if (rememberedSlot == null) {
      return true;
    }

    // Solo lo slot che ha originato la scelta continua a riaprire il menu.
    // Gli altri slot della stessa task/day non devono ereditarlo.
    return rememberedSlot === (event.occurrenceSlotIndex ?? 0);
  }, [habits]);

  const weekday = useMemo(() => currentDate.getDay(), [currentDate]);
  const dayOfMonth = useMemo(() => currentDate.getDate(), [currentDate]);
  const monthIndex1 = useMemo(() => currentDate.getMonth() + 1, [currentDate]);

  // -- Meteo collegato ai viaggi --
  useEffect(() => {
    let cancelled = false;

    const compute = async () => {
      const selectedYmd = selectedDayYmd;
      // Trova un viaggio "attivo" per questa data:
      // il meteo della destinazione si mostra solo nei giorni in cui si è effettivamente lì,
      // cioè dal giorno DOPO la partenza fino al giorno PRIMA del ritorno.
      // Se ritorno == partenza (stesso giorno) non si cambia il meteo.
      const travels = habits.filter(
        (h: Habit) =>
          h.tipo === 'viaggio' &&
          h.travel &&
          h.travel.destinazioneNome &&
          h.travel.giornoPartenza &&
          h.travel.giornoRitorno &&
          h.travel.giornoRitorno > h.travel.giornoPartenza &&
          selectedYmd > h.travel.giornoPartenza &&
          selectedYmd < h.travel.giornoRitorno
      ) as Habit[];

      if (travels.length === 0) {
        if (!cancelled) setTravelTodayWeather(null);
        return;
      }

      // Se ce ne sono più di uno, prendi quello con giornoPartenza più vicino
      travels.sort((a, b) => {
        const da = a.travel!.giornoPartenza;
        const db = b.travel!.giornoPartenza;
        return da < db ? -1 : da > db ? 1 : 0;
      });

      const activeTravel = travels[0]!;
      const destName = activeTravel.travel!.destinazioneNome.trim().toLowerCase();

      // Mappa destinazione su una città nota (FALLBACK_CITIES contiene Zurigo, ecc.)
      const city = FALLBACK_CITIES.find(c =>
        c.name.toLowerCase().includes(destName) || destName.includes(c.name.toLowerCase())
      );

      if (!city) {
        if (!cancelled) setTravelTodayWeather(null);
        return;
      }

      const days = await fetchWeather({
        latitude: city.latitude,
        longitude: city.longitude,
      } as any);
      if (!days || cancelled) return;

      const match = days.find(d => d.date === selectedYmd) ?? null;
      if (!cancelled) setTravelTodayWeather(match);
    };

    compute();

    return () => {
      cancelled = true;
    };
  }, [selectedDayYmd, habits]);

  const { timedEvents, allDayEvents, vacationHighlightRanges } = useMemo(() => {
    const items: OggiEvent[] = [];
    const allDay: OggiEvent[] = [];
    const vacationRanges: Array<{ start: number; end: number }> = [];
    const logicalYmd = selectedDayYmd;
    const resetMin = dayResetTime && dayResetTime !== '00:00' ? toMinutes(currentDayResetTime) : 0;
    const nextResetMin = dayResetTime && dayResetTime !== '00:00' ? toMinutes(nextDayResetTime) : 0;
    const nextYmdStr = nextDayYmd;
    const usesPreviousCalendarDay = dayResetTime !== '00:00' && resetMin > 12 * 60;
    let logicalWindowEnd = nextResetMin;
    if (logicalWindowEnd <= resetMin) logicalWindowEnd += 1440;
    const logicalWindowStart = resetMin;

    const daysToCheck = usesPreviousCalendarDay
      ? [
          { ymd: prevDayYmd, minStart: resetMin, minEnd: 1440, displayOffset: 0 },
          { ymd: logicalYmd, minStart: 0, minEnd: Math.max(0, logicalWindowEnd - 1440), displayOffset: 1440 },
        ].filter(day => day.minEnd > day.minStart)
      : [
          { ymd: logicalYmd, minStart: resetMin, minEnd: Math.min(1440, logicalWindowEnd), displayOffset: 0 },
          ...(logicalWindowEnd > 1440
            ? [{ ymd: nextYmdStr, minStart: 0, minEnd: logicalWindowEnd - 1440, displayOffset: 1440 }]
            : []),
        ];
    const travelActiveRanges = getTravelActiveRangesForLogicalDate(habits, logicalYmd, currentDayResetTime);

    for (const h of habits) {
      if (h.tipo === 'avviso') continue;
      if (isTravelLikeTipo(h.tipo) && h.travel) {
          const travel = h.travel;
          const color = h.color ?? '#3b82f6';

          const pushTravelEvent = (id: string, title: string, startAbs: number, endAbs: number) => {
            if (endAbs <= logicalWindowStart || startAbs >= logicalWindowEnd) return;
            items.push({
              id,
              title,
              startTime: minutesToTime(Math.max(0, startAbs)),
              endTime: minutesToTime(Math.max(0, endAbs)),
              logicalStartMin: startAbs,
              logicalEndMin: endAbs,
              isAllDay: false,
              color,
              createdAt: h.createdAt,
              tipo: h.tipo,
              travelMezzo: travel.mezzo,
            });
          };

          const departureOffset = diffDays(logicalYmd, travel.giornoPartenza) * 1440;
          if (h.tipo === 'vacanza') {
            const endYmd = travel.giornoRitorno ?? travel.giornoPartenza;
            const endOffset = diffDays(logicalYmd, endYmd) * 1440;
            const vacationEndTime = travel.orarioArrivoRitorno ?? travel.orarioArrivo;
            if (vacationEndTime) {
              const startAbs = departureOffset + toMinutes(travel.orarioPartenza);
              const endAbs = endOffset + toMinutes(vacationEndTime);
              if (endAbs > logicalWindowStart && startAbs < logicalWindowEnd) {
                vacationRanges.push({
                  start: Math.max(logicalWindowStart, startAbs),
                  end: Math.min(logicalWindowEnd, endAbs),
                });
              }
            }
          } else {
            pushTravelEvent(
              `${h.id}-out`,
              `Partenza\n↓\nDestinazione`,
              departureOffset + toMinutes(travel.orarioPartenza),
              departureOffset + toMinutes(travel.orarioArrivo) + (travel.arrivoGiornoDopo ? 1440 : 0),
            );
          }

          if (h.tipo === 'viaggio' && travel.giornoRitorno && travel.orarioPartenzaRitorno && travel.orarioArrivoRitorno) {
            const returnOffset = diffDays(logicalYmd, travel.giornoRitorno) * 1440;
            pushTravelEvent(
              `${h.id}-return`,
              `Ritorno\n↑\nPartenza`,
              returnOffset + toMinutes(travel.orarioPartenzaRitorno) + (travel.partenzaRitornoGiornoDopo ? 1440 : 0),
              returnOffset + toMinutes(travel.orarioArrivoRitorno) + (travel.arrivoRitornoGiornoDopo ? 1440 : 0),
            );
          }
          continue;
      }

      // Check if it's an all-day task for this logical day
      if (appearsOnDateRaw(h, logicalYmd)) {
         const logicalDate = parseYmdSafe(logicalYmd);
         const logicalWeekday = logicalDate.getDay();
         const logicalDayOfMonth = logicalDate.getDate();
         const override = h.timeOverrides?.[logicalYmd];
         const isAllDayOverride = override === '00:00';
         const hasNoTime = !h.schedule?.time && !h.schedule?.endTime && 
                          !(h.schedule?.weeklyTimes?.[logicalWeekday]?.start) &&
                          !(h.schedule?.monthlyTimes?.[logicalDayOfMonth]?.start);
         
         if (isAllDayOverride || hasNoTime) {
            if (h.pauseDuringTravel && rangeOverlapsAny(logicalWindowStart, logicalWindowEnd, travelActiveRanges)) {
              continue;
            }
            allDay.push({ id: h.id, title: h.text, startTime: '00:00', endTime: '24:00', isAllDay: true, color: h.color ?? '#3b82f6', createdAt: h.createdAt, tipo: h.tipo, habitFreq: detectHabitFreq(h) });
            continue;
         }
      }

      // For timed habits/tasks
      for (const day of daysToCheck) {
        if (!appearsOnDateRaw(h, day.ymd)) continue;
        
        const dObj = parseYmdSafe(day.ymd);
        const weekday = dObj.getDay();
        const dayOfMonth = dObj.getDate();

        const override = h.timeOverrides?.[day.ymd];
        const isAllDayMarker = override === '00:00';
        if (isAllDayMarker) continue;

        const rawOverrideStart = typeof override === 'string' ? override : (override as any)?.start;
        const rawOverrideEnd = typeof override === 'object' && override !== null ? (override as any).end : null;
        const overrideStart = isValidTimeString(rawOverrideStart) ? rawOverrideStart : null;
        const overrideEnd = isValidTimeString(rawOverrideEnd) ? rawOverrideEnd : null;

        const weekly = h.schedule?.weeklyTimes?.[weekday] ?? null;
        const monthlyT = h.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
        const start = overrideStart ?? (weekly?.start ?? monthlyT?.start ?? (h.schedule?.time ?? null));
        const end = overrideEnd ?? (weekly?.end ?? monthlyT?.end ?? (h.schedule?.endTime ?? null));

        if (!start) continue;

        let finalEnd = end;
        if (!end) {
          const [sh] = start.split(':').map(Number);
          const nextHour = Math.min(24, sh + 1);
          finalEnd = nextHour === 24 ? '24:00' : `${String(nextHour).padStart(2, '0')}:00`;
        } else if (end === '23:59') {
          finalEnd = '24:00';
        }

        const startM = toMinutes(start);
        
        // Logical minutes relative to logical day start (resetMin)
        const absoluteStart = day.displayOffset + startM;

        if (startM < day.minStart || startM >= day.minEnd) continue;

        let endM = toMinutes(finalEnd!);
        if (endM <= startM) endM = Math.min(1440, startM + 60);

        const isNextDay = day.displayOffset > 0;
        const absoluteEnd = absoluteStart + (endM - startM);
        
        // RULE 1: Disable drag for the "continuation" part of a bridged task
        const isContinuation = isNextDay && resetMin > 0 && startM < resetMin;
        const dragDisabledForThisEvent = isContinuation;

        const durationMin = Math.max(5, endM - startM);
        const nOcc = getDailyOccurrenceTotalForDate(h, weekday, dayOfMonth);
        const specificGap = h.schedule?.weeklyGaps?.[weekday] ?? h.schedule?.monthlyGaps?.[dayOfMonth];
        const gapMin = Math.max(5, specificGap ?? h.occurrenceGapMinutes ?? 360);

        const baseMeta = {
          color: h.color ?? '#3b82f6',
          createdAt: h.createdAt,
          createdAtMs: h.createdAtMs,
          tipo: h.tipo,
          habitFreq: detectHabitFreq(h),
        };

        if (nOcc <= 1) {
          const eventId = isNextDay ? `${h.id}-next` : h.id;
          const eventTitle = h.text;
          if (h.pauseDuringTravel && rangeOverlapsAny(absoluteStart, absoluteEnd, travelActiveRanges)) {
            continue;
          }
          items.push({
            id: eventId,
            habitId: h.id,
            calendarYmd: day.ymd,
            displayOffsetMinutes: day.displayOffset,
            title: eventTitle,
            startTime: minutesToTime(absoluteStart),
            endTime: minutesToTime(absoluteEnd),
            isAllDay: false,
            ...baseMeta,
            dragDisabled: dragDisabledForThisEvent,
          });
        } else {
          const dayOv = h.occurrenceSlotOverrides?.[day.ymd] ?? {};
          const anchorMin =
            dayOv[0] && isValidTimeString(dayOv[0].start)
              ? toMinutes(dayOv[0].start)
              : startM;
          const slotTimes: Array<{ slotIndex: number; start: number; end: number }> = [];
          for (let i = 0; i < nOcc; i++) {
            const slotOv = dayOv[i];
            let sM: number;
            let eM: number;
            if (slotOv && isValidTimeString(slotOv.start) && isValidTimeString(slotOv.end)) {
              sM = toMinutes(slotOv.start);
              eM = toMinutes(slotOv.end);
            } else {
              sM = anchorMin + i * gapMin;
              if (sM >= 1440) continue;
              eM = Math.min(1440, sM + durationMin);
            }
            if (sM >= 1440) continue;
            slotTimes.push({ slotIndex: i, start: sM, end: eM });
          }

          const displayOrderBySlot = slotTimes
            .slice()
            .sort((left, right) => {
              if (left.start !== right.start) return left.start - right.start;
              if (left.end !== right.end) return left.end - right.end;
              return left.slotIndex - right.slotIndex;
            })
            .reduce<Record<number, number>>((acc, slotInfo, displayIndex) => {
              acc[slotInfo.slotIndex] = displayIndex;
              return acc;
            }, {});

          for (let i = 0; i < nOcc; i++) {
            const slotOv = dayOv[i];
            let sM: number;
            let eM: number;
            if (slotOv && isValidTimeString(slotOv.start) && isValidTimeString(slotOv.end)) {
              sM = toMinutes(slotOv.start);
              eM = toMinutes(slotOv.end);
            } else {
              sM = anchorMin + i * gapMin;
              if (sM >= 1440) break;
              eM = Math.min(1440, sM + durationMin);
            }
            if (sM >= 1440) break;
            
            // Re-check if this specific occurrence falls into our logical day window
            if (sM < day.minStart || sM >= day.minEnd) continue;
            const slotStartAbs = day.displayOffset + sM;
            const slotEndAbs = day.displayOffset + eM;
            if (h.pauseDuringTravel && rangeOverlapsAny(slotStartAbs, slotEndAbs, travelActiveRanges)) {
              continue;
            }

            const occurrenceId = makeOccurrenceEventId(isNextDay ? `${h.id}-next` : h.id, i);
            const displayIndex = displayOrderBySlot[i] ?? i;
            const occurrenceTitle = `${h.text} (${displayIndex + 1}/${nOcc})`;
            items.push({
              id: occurrenceId,
              habitId: h.id,
              calendarYmd: day.ymd,
              displayOffsetMinutes: day.displayOffset,
              multiOccurrenceSlot: true,
              occurrenceSlotIndex: i,
              occurrenceTotal: nOcc,
              title: occurrenceTitle,
              startTime: minutesToTime(slotStartAbs),
              endTime: minutesToTime(slotEndAbs),
              isAllDay: false,
              ...baseMeta,
              dragDisabled: dragDisabledForThisEvent,
            });
          }
        }
      }
    }
    return { timedEvents: items, allDayEvents: allDay, vacationHighlightRanges: vacationRanges };
  }, [habits, selectedDayYmd, prevDayYmd, dayResetTime, currentDayResetTime, nextDayResetTime, nextDayYmd, todayYmd]);

  const handleOccurrenceSlotDragEnd = useCallback(
    ({
      event,
      ymd,
      newStartTime,
      newEndTime,
      previousRankSnapshot,
    }: {
      event: OggiEvent;
      ymd: string;
      newStartTime: string;
      newEndTime: string;
      previousRankSnapshot?: { ranks: Record<string, number>; counter: number };
    }) => {
      const habitId = resolveOggiHabitId(event);
      const habit = habits.find((h) => h.id === habitId);
      if (!habit) return;
      const n = getDailyOccurrenceTotalForDate(habit, weekday, dayOfMonth);
      const slot = event.occurrenceSlotIndex ?? 0;
      const targetYmd = event.calendarYmd ?? ymd;
      const previousMenuSource = habit.occurrenceSlotMenuSource?.[targetYmd];

      // Save the dragged slot AND freeze all other slots at their current
      // rendered positions, so no other occurrence shifts when this one moves.
      const allSlots: Record<number, { start: string; end: string }> = {};
      for (let i = 0; i < n; i++) {
        if (i === slot) {
          const { ymd: startYmd, time: startTime } = resolveDisplayTimeForEvent(event, newStartTime);
          const { ymd: endYmd, time: endTime } = resolveDisplayTimeForEvent(event, newEndTime);
          if (startYmd === targetYmd && endYmd === targetYmd) {
            allSlots[i] = { start: startTime, end: endTime };
          }
        } else {
          const otherEv = timedEvents.find(
            (e) =>
              resolveOggiHabitId(e) === habitId &&
              e.multiOccurrenceSlot &&
              (e.occurrenceSlotIndex ?? -1) === i
          );
          if (otherEv) {
            const { ymd: startYmd, time: startTime } = resolveDisplayTimeForEvent(otherEv, otherEv.startTime);
            const { ymd: endYmd, time: endTime } = resolveDisplayTimeForEvent(otherEv, otherEv.endTime);
            if (startYmd === targetYmd && endYmd === targetYmd) {
              allSlots[i] = { start: startTime, end: endTime };
            }
          }
        }
      }

      const clearPendingPosition = () => {
        setPendingEventPositions((prev) => {
          const next = { ...prev };
          delete next[event.id];
          return next;
        });
      };

      const cancelPendingMove = () => {
        restoreColumnRankState(previousRankSnapshot);
        setRecentlyMovedEventId(null);
        setLastMovedEventId(null);
        setHabits(prev => prev.map(h => {
          if (h.id !== habitId) return h;
          const nextMenuSource = { ...(h.occurrenceSlotMenuSource ?? {}) };
          if (previousMenuSource == null) delete nextMenuSource[targetYmd];
          else nextMenuSource[targetYmd] = previousMenuSource;
          return {
            ...h,
            occurrenceSlotMenuSource: Object.keys(nextMenuSource).length ? nextMenuSource : undefined,
          };
        }));
        clearPendingPosition();
      };

      const applyOnlyToday = () => {
        setMultipleOccurrenceSlotOverrides(habitId, targetYmd, allSlots);
        setHabits(prev => prev.map(h => {
          if (h.id !== habitId) return h;
          const existingMenuSource = h.occurrenceSlotMenuSource?.[targetYmd];
          return {
            ...h,
            occurrenceSlotMenuSource: {
              ...(h.occurrenceSlotMenuSource ?? {}),
              [targetYmd]: existingMenuSource ?? slot,
            },
          };
        }));
        clearPendingPosition();
      };

      const freq = detectHabitFreq(habit);
      const targetDate = parseYmdSafe(targetYmd);
      if (freq === 'single') {
        applyOnlyToday();
        return;
      }

      const rememberedSlot = habit.occurrenceSlotMenuSource?.[targetYmd];
      if (rememberedSlot != null && rememberedSlot !== slot) {
        applyOnlyToday();
        return;
      }

      const sortedSlots = Object.entries(allSlots)
        .map(([index, slotValue]) => ({
          index: Number(index),
          startMin: toMinutes(slotValue.start),
          endMin: toMinutes(slotValue.end),
          slotValue,
        }))
        .sort((left, right) => left.index - right.index);

      const deriveUniformPattern = () => {
        if (sortedSlots.length === 0) return null;
        const duration = sortedSlots[0]!.endMin - sortedSlots[0]!.startMin;
        if (duration <= 0) return null;

        let gapMinutes: number | null = null;
        for (let i = 0; i < sortedSlots.length; i++) {
          const slotItem = sortedSlots[i]!;
          if (slotItem.endMin - slotItem.startMin !== duration) return null;
          if (i > 0) {
            const prevSlot = sortedSlots[i - 1]!;
            const nextGap = slotItem.startMin - prevSlot.startMin;
            if (nextGap <= 0) return null;
            if (gapMinutes === null) gapMinutes = nextGap;
            else if (gapMinutes !== nextGap) return null;
          }
        }

        return {
          start: sortedSlots[0]!.slotValue.start,
          end: sortedSlots[0]!.slotValue.end,
          gapMinutes: gapMinutes ?? Math.max(5, habit.occurrenceGapMinutes ?? 360),
        };
      };

      const applyScopedRecurringChange = (scope: 'period' | 'future') => {
        const pattern = deriveUniformPattern();
        if (!pattern) {
          Alert.alert(
            t('oggi.customLayoutOnlyTitle'),
            t('oggi.customLayoutOnlyMessage'),
          );
          return;
        }

        const targetWeekday = targetDate.getDay();
        const targetDayOfMonth = targetDate.getDate();
        const targetMonth = targetDate.getMonth() + 1;

        setHabits(prev => prev.map(h => {
          if (h.id !== habitId) return h;

          const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
          // Keep all day-specific slot overrides. Choosing a recurring scope
          // changes the base pattern, but must not wipe previous "solo oggi"
          // customizations for any specific date.
          const nextSlotOverrides = h.occurrenceSlotOverrides;

          if (freq === 'daily') {
            schedule.time = pattern.start;
            schedule.endTime = pattern.end;
            return {
              ...h,
              schedule,
              occurrenceGapMinutes: pattern.gapMinutes,
              occurrenceSlotOverrides: nextSlotOverrides,
              occurrenceSlotMenuSource: {
                ...(h.occurrenceSlotMenuSource ?? {}),
                [targetYmd]: slot,
              },
            };
          }

          if (freq === 'weekly') {
            schedule.weeklyTimes = { ...(schedule.weeklyTimes ?? {}) };
            schedule.weeklyTimes[targetWeekday] = { start: pattern.start, end: pattern.end };
            schedule.weeklyGaps = { ...(schedule.weeklyGaps ?? {}) };
            schedule.weeklyGaps[targetWeekday] = pattern.gapMinutes;
            if ((schedule.daysOfWeek?.length ?? 0) <= 1) {
              schedule.time = pattern.start;
              schedule.endTime = pattern.end;
            } else {
              schedule.time = null;
              schedule.endTime = null;
            }
            return {
              ...h,
              schedule,
              occurrenceSlotOverrides: nextSlotOverrides,
              occurrenceSlotMenuSource: {
                ...(h.occurrenceSlotMenuSource ?? {}),
                [targetYmd]: slot,
              },
            };
          }

          if (freq === 'monthly') {
            schedule.monthlyTimes = { ...(schedule.monthlyTimes ?? {}) };
            schedule.monthlyTimes[targetDayOfMonth] = { start: pattern.start, end: pattern.end };
            schedule.monthlyGaps = { ...(schedule.monthlyGaps ?? {}) };
            schedule.monthlyGaps[targetDayOfMonth] = pattern.gapMinutes;
            if ((schedule.monthDays?.length ?? 0) <= 1) {
              schedule.time = pattern.start;
              schedule.endTime = pattern.end;
            } else {
              schedule.time = null;
              schedule.endTime = null;
            }
            return {
              ...h,
              schedule,
              occurrenceSlotOverrides: nextSlotOverrides,
              occurrenceSlotMenuSource: {
                ...(h.occurrenceSlotMenuSource ?? {}),
                [targetYmd]: slot,
              },
            };
          }

          schedule.time = pattern.start;
          schedule.endTime = pattern.end;
          return {
            ...h,
            schedule,
            occurrenceGapMinutes: pattern.gapMinutes,
            occurrenceSlotOverrides: nextSlotOverrides,
            occurrenceSlotMenuSource: {
              ...(h.occurrenceSlotMenuSource ?? {}),
              [targetYmd]: slot,
            },
          };
        }));

        clearPendingPosition();
      };

      const wd = targetDate.getDay();
      const periodButtonLabel =
        freq === 'weekly'
          ? t('oggi.weeklyOnDay', { day: t(`weekdaysFull.${wd}` as const) })
          : freq === 'monthly'
            ? t('oggi.monthlyOnDay', { day: targetDate.getDate() })
            : freq === 'annual'
              ? t('oggi.annual')
              : null;

      const openRecurringScopeMenu = () => {
        const buttons: { text: string; onPress: () => void }[] = [
          { text: t('oggi.onlyToday'), onPress: applyOnlyToday },
        ];

        if (periodButtonLabel) {
          buttons.push({
            text: periodButtonLabel,
            onPress: () => applyScopedRecurringChange('period'),
          });
        }

        if (!hasAnyDaySpecificRecurringCustomization(habit)) {
          buttons.push({
            text: t('oggi.fromTodayOn'),
            onPress: () => applyScopedRecurringChange('future'),
          });
        }

        Alert.alert(
          t('oggi.recurringEditTitle'),
          t('oggi.recurringEditMessage'),
          [
            ...buttons,
            {
              text: t('common.cancel'),
              style: 'destructive',
              onPress: cancelPendingMove,
            },
          ]
        );
      };

      openRecurringScopeMenu();
    },
    [habits, timedEvents, weekday, dayOfMonth, resolveDisplayTimeForEvent, setMultipleOccurrenceSlotOverrides, setPendingEventPositions, detectHabitFreq, setHabits, hasAnyDaySpecificRecurringCustomization, restoreColumnRankState, setRecentlyMovedEventId, t],
  );


  const trackerEventsForDay = useMemo(() => {
    return trackerEntries
      .filter(t => t.date === selectedDayYmd)
      .map(t => ({
        id: `tracker-${t.id}`,
        title: t.title,
        startTime: t.startTime,
        endTime: t.endTime,
        isAllDay: false,
        color: t.color,
        createdAt: t.createdAt,
        tipo: 'tracker' as any,
        _trackerId: t.id,
      }));
  }, [trackerEntries, selectedDayYmd]);

  // Eventi usati per layout/drag/colonne: escludiamo i viaggi, che hanno una colonna visiva a parte
  const layoutEvents = useMemo(
    () => [...timedEvents.filter(ev => !isTravelLikeTipo(ev.tipo as any)), ...trackerEventsForDay],
    [timedEvents, trackerEventsForDay]
  );

  // Sync notifications for today's habits (solo eventi "normali", non i viaggi)
  useEffect(() => {
    (async () => {
      // Only schedule notifications if we are looking at today
      if (!isToday(currentDate, TZ)) return;

      await cancelAllScheduledNotifications();

      const now = new Date();
      for (const ev of layoutEvents) {
        if (ev.isAllDay) continue;

        const habit = habits.find(h => h.id === resolveOggiHabitId(ev));
        const notifCfg = habit?.notification;

        if (notifCfg && !notifCfg.enabled) continue;

        let triggerTime: Date;

        if (notifCfg?.minutesBefore === null && notifCfg.customTime) {
          const [ch, cm] = notifCfg.customTime.split(':').map(Number);
          const baseDate = notifCfg.customDate ? new Date(notifCfg.customDate) : new Date();
          triggerTime = new Date(baseDate);
          triggerTime.setHours(ch, cm, 0, 0);
        } else {
          const [h, m] = ev.startTime.split(':').map(Number);
          const eventTime = new Date();
          eventTime.setHours(h, m, 0, 0);
          if (eventTime <= now) continue;
          const minutesBefore = notifCfg?.minutesBefore ?? 0;
          triggerTime = new Date(eventTime.getTime() - minutesBefore * 60000);
        }

        if (triggerTime > now) {
          await scheduleHabitNotification(
            'Abitudine in arrivo!',
            `${ev.title} inizia alle ${ev.startTime}`,
            { type: 'date', date: triggerTime } as any
          );
        }
      }
    })();
  }, [layoutEvents, currentDate, habits]);

  // Tracks the last-seen startTime+endTime for each event to detect manual time edits.
  const prevEventTimesRef = useRef<Record<string, string>>({});

  // Initialise column rank for any task that doesn't yet have one.
  // Rank determines left-to-right order: lower rank = leftmost column.
  // Initial rank comes from createdAt (older = lower rank).
  // Tasks with the same createdAt are sorted by ID string for stability.
  // On drag end the moved task gets a new rank higher than all existing ones,
  // making it permanently rightmost until another task is moved after it.
  // When a task's time is manually edited (not via drag), it also gets bumped
  // to the highest rank so it appears rightmost when it re-enters an overlap.
  useEffect(() => {
    const ranks = columnRankRef.current;
    const prevTimes = prevEventTimesRef.current;

    const newTasks = layoutEvents.filter(ev => (ev as any).tipo !== 'tracker' && ranks[ev.id] === undefined);

    // Detect tasks whose time changed since last render (= manual time edit, not drag).
    // Drag updates happen after drag end via DraggableEvent's own rank logic, so we
    // only need to handle edits made through the modal / tasks view here.
    const timeEditedTasks = layoutEvents.filter(ev => {
      if ((ev as any).tipo === 'tracker') return false;
      if (ranks[ev.id] === undefined) return false; // already handled as newTask
      if (ev.id === recentlyMovedEventId) return false; // rank already set by drag, don't override
      const key = `${ev.startTime}-${ev.endTime}`;
      return prevTimes[ev.id] !== undefined && prevTimes[ev.id] !== key;
    });

    // Always update the snapshot of current times
    for (const ev of layoutEvents) {
      prevTimes[ev.id] = `${ev.startTime}-${ev.endTime}`;
    }

    if (newTasks.length === 0 && timeEditedTasks.length === 0) return;

    // Sort new tasks by createdAtMs (precise ms timestamp), then createdAt, then id for stability
    newTasks.sort((a, b) => {
      const ma = (a as any).createdAtMs ?? 0;
      const mb = (b as any).createdAtMs ?? 0;
      if (ma !== mb) return ma - mb;
      const da = a.createdAt ?? '';
      const db = b.createdAt ?? '';
      if (da !== db) return da < db ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

    let next = rankCounterRef.current + 1;
    for (const ev of newTasks) {
      ranks[ev.id] = next++;
    }
    // Bump time-edited tasks to rightmost (higher than all current ranks)
    for (const ev of timeEditedTasks) {
      ranks[ev.id] = next++;
    }
    rankCounterRef.current = next - 1;
    setRankVersion(v => v + 1);
  }, [layoutEvents, recentlyMovedEventId]);

  // Reset all-day section height when there are no all-day events so hourHeight is unaffected
  useEffect(() => {
    if (allDayEvents.length === 0) setAllDayHeight(0);
  }, [allDayEvents.length]);

  // Auto-scroll to current time on mount / when layout changes
  const hasAutoScrolled = useRef(false);

  useEffect(() => {
    if (typeof ymd === 'string') {
      const parsed = new Date(`${ymd}T12:00:00.000Z`);
      if (!Number.isNaN(parsed.getTime())) {
        setCurrentDate(parsed);
        hasAutoScrolled.current = false;
      }
    }
  }, [ymd]);

  const yesterdayYmd = useMemo(() => {
    const logicalToday = getDay(new Date());
    const d = new Date(logicalToday + 'T12:00:00.000Z');
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }, [getDay, dayResetTime, currentTime]);

  useEffect(() => {
    if (!isLoaded) return;

    const queue: string[] = [];
    const start = new Date(yesterdayYmd + 'T12:00:00.000Z');
    for (let i = 0; i < 30; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() - i);
      const ymd = d.toISOString().slice(0, 10);
      if (reviewedDates.includes(ymd) || dismissedDatesThisSession.includes(ymd)) continue;
      const habitsOnDay = getHabitsAppearingOnDate(habits, ymd, dayResetTime).filter(
        h => h.askReview && !isTravelLikeTipo(h.tipo)
      );
      if (habitsOnDay.length > 0) {
        queue.push(ymd);
      }
    }

    setReviewQueue(prev => {
      const prevKey = prev.join(',');
      const nextKey = queue.join(',');
      return prevKey === nextKey ? prev : queue;
    });
  }, [isLoaded, habits, reviewedDates, yesterdayYmd, dayResetTime, dismissedDatesThisSession]);

  useEffect(() => {
    if (hasAutoScrolled.current) return;
    if (!hourHeight || hourHeight <= 0) return;
    const now = new Date();
    const min = now.getHours() * 60 + now.getMinutes();
    if (min < windowStartMin || min > windowEndMin) return;
    const targetY = ((min - windowStartMin) / 60) * hourHeight + BASE_VERTICAL_OFFSET - 60;
    const id = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: Math.max(0, targetY), animated: false });
      hasAutoScrolled.current = true;
    }, 100);
    return () => clearTimeout(id);
  }, [hourHeight, windowStartMin, windowEndMin]);

  const stopAutoScroll = useCallback(() => {
    autoScrollDirRef.current = 0;
    autoScrollIntensityRef.current = 0;
  }, []);

  const stepAutoScroll = useCallback(() => {
    const dir = autoScrollDirRef.current;
    const intensity = autoScrollIntensityRef.current;

    if (!scrollViewRef.current || dir === 0 || intensity <= 0) {
      autoScrollRafRef.current = null;
      return;
    }

    const viewportHeight = viewportHeightRef.current;
    const totalContentHeight = contentHeight;

    if (!viewportHeight || totalContentHeight <= viewportHeight) {
      autoScrollRafRef.current = null;
      return;
    }

    const maxOffset = totalContentHeight - viewportHeight;
    const baseSpeed = OGGI_DRAG_AUTOSCROLL_BASE_SPEED;
    const extra = OGGI_DRAG_AUTOSCROLL_EXTRA_SPEED;
    const delta = dir * (baseSpeed + extra * intensity);
    const current = scrollOffsetRef.current;

    let next = current + delta;
    if (next < 0) next = 0;
    if (next > maxOffset) next = maxOffset;

    if (next === current) {
      autoScrollRafRef.current = null;
      return;
    }

    scrollViewRef.current.scrollTo({ y: next, animated: false });
    autoScrollRafRef.current = requestAnimationFrame(stepAutoScroll);
  }, [contentHeight]);

  const ensureAutoScrollLoop = useCallback(() => {
    if (autoScrollRafRef.current != null) return;
    autoScrollRafRef.current = requestAnimationFrame(stepAutoScroll);
  }, [stepAutoScroll]);

  const handleAutoScrollRequest = useCallback(
    (direction: -1 | 0 | 1, intensity: number) => {
      autoScrollDirRef.current = direction;
      autoScrollIntensityRef.current = intensity;

      if (direction === 0 || intensity <= 0) {
        return;
      }

      ensureAutoScrollLoop();
    },
    [ensureAutoScrollLoop]
  );

  const handleDragAreaLayout = useCallback((e: LayoutChangeEvent) => {
    const layoutHeight = e.nativeEvent.layout.height;
    setDragAreaHeight(layoutHeight);
    viewportHeightRef.current = layoutHeight;
  }, []);

  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextOffset = e.nativeEvent.contentOffset.y;
      scrollOffsetRef.current = nextOffset;
      scrollOffsetY.value = nextOffset;
    },
    [scrollOffsetY]
  );

  const handleDragAutoScroll = useCallback(
    (dragBounds: { top: number; bottom: number } | null) => {
      if (dragBounds === null) {
        handleAutoScrollRequest(0, 0);
        return;
      }

      const viewportHeight = viewportHeightRef.current || dragAreaHeight;
      if (viewportHeight <= 0) {
        handleAutoScrollRequest(0, 0);
        return;
      }

      let direction: -1 | 0 | 1 = 0;
      const inTopZone = dragBounds.top < OGGI_DRAG_AUTOSCROLL_THRESHOLD;
      const inBottomZone = dragBounds.bottom > viewportHeight - OGGI_DRAG_AUTOSCROLL_THRESHOLD_BOTTOM;

      if (inTopZone) {
        direction = -1;
      } else if (inBottomZone) {
        direction = 1;
      }

      if (direction === 0) {
        handleAutoScrollRequest(0, 0);
      } else {
        handleAutoScrollRequest(direction, 1);
      }
    },
    [dragAreaHeight, handleAutoScrollRequest]
  );

  useEffect(() => {
    if (Object.keys(pendingEventPositions).length === 0) return;
    setPendingEventPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(prev)) {
        const ev = timedEvents.find((e) => e.id === id);
        if (!ev || toMinutes(ev.startTime) === prev[id]) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [timedEvents, pendingEventPositions]);

  const [lastMovedEventId, setLastMovedEventId] = useState<string | null>(null);
  const [rankVersion, setRankVersion] = useState(0);
  const allDayLastTapRef = useRef<Record<string, number>>({});

  // Persist column ranks whenever they change (skip initial render at version 0)
  useEffect(() => {
    if (rankVersion === 0) return;
    AsyncStorage.setItem(COLUMN_RANKS_KEY, JSON.stringify({
      ranks: columnRankRef.current,
      counter: rankCounterRef.current,
    }));
  }, [rankVersion]);
  
  useEffect(() => {
    if (!recentlyMovedEventId) return;
    const movedEvent = timedEvents.find(e => e.id === recentlyMovedEventId);
    if (movedEvent && !pendingEventPositions[recentlyMovedEventId]) {
      setLastMovedEventId(recentlyMovedEventId);
    }
  }, [recentlyMovedEventId, timedEvents, pendingEventPositions]);
  
  useEffect(() => {
    if (!recentlyMovedEventId) return;
    const movedEvent = timedEvents.find(e => e.id === recentlyMovedEventId);
    if (!movedEvent) {
      setRecentlyMovedEventId(null);
      return;
    }
    const timer = setTimeout(() => {
      setRecentlyMovedEventId(null);
    }, 1000);
    return () => clearTimeout(timer);
  }, [recentlyMovedEventId, timedEvents]);

  const calculateLayoutCallback = useCallback((
    events: (OggiEvent & { s: number; e: number; duration: number; isLastMoved: boolean })[],
    draggedEventId: string | null,
    stableLayout?: Record<string, LayoutInfo>
  ) => {
    return calculateLayout(
      events,
      draggedEventId,
      stableLayout,
      columnRankRef.current,
      initialOverlapsRef.current,
      brokenOverlapPairsRef.current
    );
  }, []);

  // --- LAYOUT MANAGEMENT ---
  
  const layoutById = useMemo<Record<string, LayoutInfo>>(() => {
    const events = layoutEvents.map(e => {
      if ((e as any).tipo === 'tracker') {
        const startM = toMinutes(e.startTime);
        const endM = toMinutes(e.endTime);
        return { ...e, s: startM, e: endM, duration: endM - startM, isLastMoved: false };
      }
      const pendingStart = pendingEventPositions[e.id];
      const startM = pendingStart !== undefined ? pendingStart : toMinutes(e.startTime);
      const origS = toMinutes(e.startTime);
      const origE = toMinutes(e.endTime);
      const dur = origE - origS;
      const endM = startM + dur;
      
      return {
        ...e,
        s: startM,
        e: endM,
        duration: dur,
        isLastMoved: e.id === lastMovedEventId
      };
    });

    if (draggingEventId) {
        if (currentDragPosition !== null) {
            const draggedIdx = events.findIndex(e => e.id === draggingEventId);
            if (draggedIdx !== -1) {
                const d = events[draggedIdx];
                const newEnd = currentDragPosition + d.duration;
                events[draggedIdx] = { ...d, s: currentDragPosition, e: newEnd };
            }
        }
        return calculateLayoutCallback(events, draggingEventId, stableLayoutRef.current);
    }

    return calculateLayoutCallback(events, null);
  }, [layoutEvents, pendingEventPositions, lastMovedEventId, draggingEventId, currentDragPosition, calculateLayoutCallback, rankVersion]);

  // Tasks entirely outside the visible window — used to color first/last hour lines
  const { overflowBefore, overflowAfter } = useMemo(() => {
    const before: OggiEvent[] = [];
    const after: OggiEvent[] = [];
    for (const ev of layoutEvents) {
      const s = pendingEventPositions[ev.id] ?? toMinutes(ev.startTime);
      const origEnd = toMinutes(ev.endTime);
      const e = pendingEventPositions[ev.id] !== undefined
        ? s + (origEnd - toMinutes(ev.startTime))
        : origEnd;
      if (e <= windowStartMin) before.push(ev);
      else if (s >= windowEndMin) after.push(ev);
    }
    // Sort by startTime first, then by layout column for same-start events
    const sortByStartThenCol = (a: OggiEvent, b: OggiEvent) => {
      const sa = toMinutes(a.startTime);
      const sb = toMinutes(b.startTime);
      if (sa !== sb) return sa - sb;
      const colA = layoutById[a.id]?.col ?? 0;
      const colB = layoutById[b.id]?.col ?? 0;
      return colA - colB;
    };
    before.sort(sortByStartThenCol);
    after.sort(sortByStartThenCol);
    return { overflowBefore: before, overflowAfter: after };
  }, [layoutEvents, windowStartMin, windowEndMin, pendingEventPositions, layoutById]);

  const handleDragStart = useCallback((id: string) => {
      stableLayoutRef.current = layoutById;
    
    // Calculate initial overlaps when drag starts
    const initialOv = new Set<string>();
    for (let i = 0; i < layoutEvents.length; i++) {
      const e1 = layoutEvents[i];
      const s1 = toMinutes(e1.startTime);
      const end1 = toMinutes(e1.endTime);
      for (let j = i + 1; j < layoutEvents.length; j++) {
        const e2 = layoutEvents[j];
        const s2 = toMinutes(e2.startTime);
        const end2 = toMinutes(e2.endTime);
        if (Math.max(s1, s2) < Math.min(end1, end2)) {
          initialOv.add(`${e1.id}-${e2.id}`);
          initialOv.add(`${e2.id}-${e1.id}`);
        }
      }
    }
    initialOverlapsRef.current = initialOv;
  }, [layoutById, layoutEvents]);

  const handleDragEnd = useCallback(() => {
      setDraggingEventId(null);
      stopAutoScroll();
      setRankVersion(v => v + 1);
  }, [stopAutoScroll]);
  
  const calculateDragLayout = useCallback((draggedEventId: string, newStartMinutes: number, hasClearedOverlap: boolean): { width: number; left: number } => {
    const draggedEvent = layoutEvents.find(e => e.id === draggedEventId);
    if (!draggedEvent) {
      const screenWidth = Dimensions.get('window').width;
      const availableWidth = screenWidth - LEFT_MARGIN;
      return { width: availableWidth - 2, left: LEFT_MARGIN };
    }

    const originalStartM = toMinutes(draggedEvent.startTime);
    const originalEndM = toMinutes(draggedEvent.endTime);
    const duration = originalEndM - originalStartM;
    const newEndMinutes = newStartMinutes + duration;

    const tempDraggedEvent = {
      ...draggedEvent,
      startTime: minutesToTime(newStartMinutes),
      endTime: minutesToTime(newEndMinutes),
    };

    const events = layoutEvents.map(e => {
      if (e.id === draggedEventId) return {
          ...tempDraggedEvent,
          s: newStartMinutes,
          e: newEndMinutes,
          duration,
          isLastMoved: true
      };
      
      const startM = toMinutes(e.startTime);
      const endM = toMinutes(e.endTime);
      return {
        ...e,
        s: startM,
        e: endM,
        duration: endM - startM,
        isLastMoved: e.id === lastMovedEventId 
      };
    });

    // Always recalculate layout to get the correct span, especially when D enters overlap
    // Use the same logic as layoutById: if hasClearedOverlap is true, don't use lock snapshot
    const tempLayout = calculateLayoutCallback(events, draggedEventId, stableLayoutRef.current);
    
    const draggedLayout = tempLayout[draggedEventId] || { col: 0, columns: 1, span: 1 };
    const screenWidth = Dimensions.get('window').width;
    const availableWidth = screenWidth - LEFT_MARGIN;
    const colWidth = availableWidth / draggedLayout.columns;
    const left = LEFT_MARGIN + (draggedLayout.col * colWidth);

    return {
      width: (colWidth * draggedLayout.span) - 2,
      left,
    };
  }, [layoutEvents, layoutById, calculateLayoutCallback, lastMovedEventId]);

  const getEventStyle = (event: OggiEvent) => {
    const originalStart = toMinutes(event.startTime);
    const originalEnd = toMinutes(event.endTime);
    const pendingStart = pendingEventPositions[event.id];
    const startM = pendingStart ?? originalStart;
    const endM = pendingStart !== undefined ? startM + (originalEnd - originalStart) : originalEnd;
    
    if (endM <= windowStartMin || startM >= windowEndMin) return null;
    
    const verticalMetrics = calculateEventVerticalMetrics({
      startM,
      endM,
      windowStartMin,
      windowEndMin,
      hourHeight,
      fiveHourReferenceHeight,
      visibleHours,
    });
    if (!verticalMetrics) return null;

    const lay = layoutById[event.id] || { col: 0, columns: 1, span: 1 };
    
    const screenWidth = Dimensions.get('window').width;
    const availableWidth = screenWidth - LEFT_MARGIN;
    const colWidth = availableWidth / lay.columns;
    const left = LEFT_MARGIN + (lay.col * colWidth);
    const width = (colWidth * lay.span) - 2;
    
    return {
      top: verticalMetrics.top,
      height: verticalMetrics.height,
      left,
      width,
    };
  };

  const getTravelStripStyle = (event: OggiEvent) => {
    const startM = event.logicalStartMin ?? toMinutes(event.startTime);
    const endM = event.logicalEndMin ?? toMinutes(event.endTime);

    if (endM <= windowStartMin || startM >= windowEndMin) return null;

    const visibleStart = Math.max(startM, windowStartMin);
    const visibleEnd = Math.min(endM, windowEndMin);

    // Posiziona la striscia un po' oltre le linee orarie:
    // leggermente sopra l'inizio e sotto la fine, così non coincide
    // esattamente con lo spessore della linea grigia.
    const baseTop = ((visibleStart - windowStartMin) / 60) * hourHeight + BASE_VERTICAL_OFFSET;
    const durationMin = visibleEnd - visibleStart;
    const baseHeight = (durationMin / 60) * hourHeight;
    const top = baseTop - 8;
    const height = Math.max(14, baseHeight + 16);

    // Allinea il bordo destro del viaggio alla timeline lasciando
    // lo stesso piccolo gap che c'è tra le colonne delle task (~2px)
    // Leggermente staccato dal bordo sinistro (5px), mantenendo lo stesso bordo destro.
    return {
      top,
      height,
      left: 5,
      width: LEFT_MARGIN - 7,
    };
  };
  
  const getCurrentTimeTop = () => {
     const now = currentTime;
     const min = now.getHours() * 60 + now.getMinutes();
     if (selectedDayYmd !== todayYmd) return null;

     let effectiveMin = min;
     if (dayResetTime !== '00:00' && min < toMinutes(currentDayResetTime)) {
       effectiveMin += 1440;
     }

     if (effectiveMin < windowStartMin || effectiveMin > windowEndMin) return null;
     return ((effectiveMin - windowStartMin) / 60) * hourHeight;
  };

  const todayWeather = travelTodayWeather ?? baseTodayWeather;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, activeTheme === 'futuristic' && { marginTop: 50 }]}>
        <TouchableOpacity onPress={() => navigateDate('prev')} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.text} />
        </TouchableOpacity>
        <View style={styles.dateWeatherWrap}>
          <Text style={[styles.dateText, isToday(currentDate, TZ) ? styles.todayDateText : styles.otherDateText]}>
            {todayDate}
          </Text>
          {todayWeather ? (
            <IconSymbol
              name={weatherCodeToIcon(todayWeather.code)}
              size={24}
              color={weatherCodeToColor(todayWeather.code)}
              type="multicolor"
              style={styles.weatherIcon}
            />
          ) : null}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigateDate('next')} style={styles.navButton}>
             <Ionicons name="chevron-forward" size={24} color={THEME.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsButton}
            onPress={() => {
              setEditingTrackerEntry(null);
              setShowTrackerModal(true);
            }}
          >
            <Ionicons name="timer-outline" size={24} color="#60a5fa" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)}>
             <Ionicons name="settings-outline" size={24} color={THEME.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* All Day Area — visible only when there are all-day events */}
      {allDayEvents.length > 0 ? (
        <View style={styles.allDayContainer} onLayout={(e) => setAllDayHeight(e.nativeEvent.layout.height)}>
          {allDayEvents.map((e, i) => {
            const bg = e.color;
            const light = isLightColor(bg);
            return (
              <TouchableOpacity
                key={e.id}
                style={[
                  styles.allDayItem,
                  { backgroundColor: bg },
                  i < allDayEvents.length - 1 && { marginRight: 4 },
                ]}
                onPress={() => {
                  const now = Date.now();
                  const last = allDayLastTapRef.current[e.id] ?? 0;
                  if (now - last < 300) {
                    allDayLastTapRef.current[e.id] = 0;
                    const selectedDay = selectedDayYmd;
                    const isReviewDay = selectedDay < todayYmd || (selectedDay === todayYmd && isPastReset);
                    if (isReviewDay) {
                      setReviewingHabitId(e.id);
                      setReviewingDate(selectedDay);
                    } else {
                      router.push({ pathname: '/modal', params: { type: 'edit', id: e.id, ymd: selectedDayYmd } });
                    }
                  } else {
                    allDayLastTapRef.current[e.id] = now;
                  }
                }}
              >
                <Text style={[styles.eventTitle, { color: light ? '#000' : '#FFF' }]} numberOfLines={1}>
                  {e.title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {/* Main Timeline Scroll */}
      <GestureHandlerRootView
        style={styles.timelineHost}
      >
        <View
          style={styles.timelineViewport}
          onLayout={handleDragAreaLayout}
        >
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollViewContent}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!draggingEventId}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          indicatorStyle="white"
          contentInsetAdjustmentBehavior="never"
        >
         <View style={[styles.timelineContent, { height: contentHeight }]}> 
             {/* Grid Lines & Hours */}
             {hours.map((h, idx) => {
                const minutesFromStart = (h * 60) - windowStartMin;
                if (minutesFromStart < 0 || minutesFromStart > totalMinutes + 60) return null;

                const top = (minutesFromStart / 60) * hourHeight + BASE_VERTICAL_OFFSET;

                const isFirstLine = idx === 0;
                const isLastLine = idx === hours.length - 1;
                const overflowTasks = isFirstLine ? overflowBefore : isLastLine ? overflowAfter : [];

                const resetHour = parseInt(currentDayResetTime.split(':')[0], 10);
                const isResetLine = h === resetHour || (resetHour === 0 && h === 24);
                const hourStart = h * 60;
                const hourEnd = hourStart + 60;
                const isVacationHour = vacationHighlightRanges.some(
                  range => (range.end > hourStart && range.start < hourEnd) || range.end === hourStart
                );

                return (
                  <View key={h} style={[styles.hourRow, { top }]}>
                      <Text style={[styles.hourLabel, isVacationHour && !isResetLine && { color: VACATION_ACCENT }, isResetLine && { color: '#9C27B0' }]}>
                        {`${String(((h % 24) + 24) % 24).padStart(2, '0')}:00`}
                      </Text>
                      {overflowTasks.length > 0 ? (
                        <View style={styles.hourLineContainer}>
                          {overflowTasks.map((ev, i) => (
                            <View
                              key={ev.id}
                              style={{
                                flex: 1,
                                height: 3,
                                backgroundColor: ev.color,
                                borderTopLeftRadius: i === 0 ? 1.5 : 0,
                                borderBottomLeftRadius: i === 0 ? 1.5 : 0,
                                borderTopRightRadius: i === overflowTasks.length - 1 ? 1.5 : 0,
                                borderBottomRightRadius: i === overflowTasks.length - 1 ? 1.5 : 0,
                              }}
                            />
                          ))}
                        </View>
                      ) : (
                        <View style={styles.hourLine} />
                      )}
                  </View>
                );
             })}

             {/* Travel strip in hours column */}
             {timedEvents.filter(e => e.tipo === 'viaggio').map(e => {
               const style = getTravelStripStyle(e);
               if (!style) return null;
               const bg = e.color;
               const light = isLightColor(bg);
               const iconColor = light ? '#000' : '#FFF';
               const titleParts = e.title.split('\n');
               const mezzoIconMap: Record<string, string> = {
                 aereo: 'airplane-outline',
                 treno: 'train-outline',
                 auto: 'car-outline',
                 nave: 'boat-outline',
                 bici: 'bicycle-outline',
                 bus: 'bus-outline',
                 altro: 'ellipsis-horizontal-outline',
               };
               const mezzoIcon = (mezzoIconMap[e.travelMezzo ?? ''] ?? 'arrow-down-outline') as any;
               // 3 righe (~42px) servono per il formato verticale (da / icona / a).
               // Se non c'è spazio, usiamo una riga con freccia orizzontale.
               const useMultiLine = style.height >= 55;
               const displayLines = useMultiLine
                 ? titleParts
                 : [titleParts.filter(p => p !== '↓').join(' → ')];

               // Allinea l'icona con la linea oraria più vicina al centro
               const tripStartM = e.logicalStartMin ?? toMinutes(e.startTime);
               const tripEndM = e.logicalEndMin ?? toMinutes(e.endTime);
               let titleOffset = 0;
               if (useMultiLine) {
                 const stripCenter = style.height / 2;
                 let bestLine = -1;
                 let bestDist = Infinity;
                 for (let m = Math.ceil(tripStartM / 60) * 60; m <= Math.floor(tripEndM / 60) * 60; m += 60) {
                   if (m > tripStartM && m < tripEndM) {
                     const linePos = ((m - tripStartM) / 60) * hourHeight + 8;
                     const dist = Math.abs(linePos - stripCenter);
                     if (dist < bestDist) { bestDist = dist; bestLine = linePos; }
                   }
                 }
                 if (bestLine >= 0) {
                   titleOffset = bestLine - stripCenter;
                 }
               }
               return (
               <View
                 key={e.id}
                 style={[
                   styles.travelStrip,
                   {
                     top: style.top,
                     height: style.height,
                     left: style.left,
                     width: style.width,
                   },
                 ]}
               >
                {/* Background semi-trasparente, testo pieno */}
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: 6,
                    backgroundColor: bg,
                    opacity: 0.6,
                  }}
                />
                 <View style={{ alignItems: 'center', justifyContent: 'center', transform: [{ translateY: titleOffset }] }}>
                   {displayLines.map((line, idx) => (
                     <Text
                       key={idx}
                       style={[styles.travelStripText, { color: iconColor }]}
                       numberOfLines={1}
                       ellipsizeMode="clip"
                   >
                       {line}
                     </Text>
                   ))}
                 </View>
               </View>
               );
             })}

             {/* Normal timed events (tasks/abitudini/eventi) + tracker entries */}
             {layoutEvents.filter(e => !isTravelLikeTipo(e.tipo as any)).map(e => {
               const isTracker = (e as any).tipo === 'tracker';
               if (isTracker) {
                 const style = getEventStyle(e);
                 if (!style) return null;
                 const trackerId: string = (e as any)._trackerId;
                 const trackerEntry = trackerEntries.find(t => t.id === trackerId);
                 if (!trackerEntry) return null;
                 const bg = e.color;
                 const light = isLightColor(bg);
                 const textColor = light ? '#000' : '#FFF';
                 return (
                   <TouchableOpacity
                     key={e.id}
                     activeOpacity={0.85}
                     onPress={() => {
                       setEditingTrackerEntry(trackerEntry);
                       setShowTrackerModal(true);
                     }}
                     style={{
                       position: 'absolute',
                       top: style.top + BASE_VERTICAL_OFFSET,
                       height: style.height,
                       left: style.left,
                       width: style.width,
                       borderRadius: 6,
                       padding: 4,
                       overflow: 'hidden',
                       backgroundColor: bg,
                       opacity: 1,
                     }}
                   >
                     <Text style={{ fontSize: 12, fontWeight: 'bold', color: textColor }} numberOfLines={1}>
                       {e.title}
                     </Text>
                     {style.height > 30 && (
                       <Text style={{ fontSize: 10, opacity: 0.8, color: textColor }}>
                         {trackerEntry.startTime} - {trackerEntry.endTime}
                       </Text>
                     )}
                   </TouchableOpacity>
                 );
               }
               const style = getEventStyle(e);
               if (!style) return null;
               const bg = e.color;
               
               const baseTop = style.top + BASE_VERTICAL_OFFSET;

               return (
                 <DraggableEvent
                   key={e.id}
                   event={e}
                   layoutStyle={style}
                   baseTop={baseTop}
                   dragY={dragY}
                   dragInitialTop={dragInitialTop}
                   scrollOffsetY={scrollOffsetY}
                   draggingEventId={draggingEventId}
                   onDragStart={handleDragStart}
                   onDragEnd={handleDragEnd}
                   setDraggingEventId={setDraggingEventId}
                   dragClearedOriginalOverlap={dragClearedOriginalOverlap}
                   setDragClearedOriginalOverlap={setDragClearedOriginalOverlap}
                  setDragSizingLocked={setDragSizingLocked}
                   windowStartMin={windowStartMin}
                   windowEndMin={windowEndMin}
                   hourHeight={hourHeight}
                   visibleHours={visibleHours}
                   currentDate={currentDate}
                   getDay={getDay}
                    setTimeOverrideRange={(habitId, ymd, start, end) => {
                      const targetYmd = ymd ?? selectedDayYmd;
                      const targetPrevYmd = prevYmd(targetYmd);
                      const targetNextYmd = nextYmd(targetYmd);
                      const targetResetTime = getResetTimeForDay(targetYmd);
                      const usesPreviousCalendarDay = dayResetTime !== '00:00' && toMinutes(targetResetTime) > 12 * 60;

                      // Resolve display start/end back to calendar YMDs
                      const resolve = (minutes: number) => {
                        let calYmd = targetYmd;
                        let calMin = minutes;
                        if (usesPreviousCalendarDay) {
                          if (minutes >= 1440) {
                            calMin = minutes - 1440;
                          } else {
                            calYmd = targetPrevYmd;
                          }
                        } else if (minutes >= 1440) {
                          calMin = minutes - 1440;
                          calYmd = targetNextYmd;
                        }
                        return { ymd: calYmd, time: minutesToTime(calMin) };
                      };

                      const { ymd: startYmd, time: startTime } = resolve(toMinutes(start));
                      const { time: endTime } = resolve(toMinutes(end));

                      // Bridges are complex. If it starts on YMD and ends on YMD+1, we store it as an override on YMD.
                      // IMPORTANT: We always store the override on the STARTING calendar day.
                      setTimeOverrideRange(habitId, startYmd, startTime, endTime);
                   }}
                   updateScheduleFromDate={updateScheduleFromDate}
                   setPendingEventPositions={setPendingEventPositions}
                   applyColumnRankOrder={applyColumnRankOrder}
                   snapshotColumnRankState={snapshotColumnRankState}
                   restoreColumnRankState={restoreColumnRankState}
                   setRecentlyMovedEventId={setRecentlyMovedEventId}
                   setLastMovedEventId={setLastMovedEventId}
                   setCurrentDragPosition={setCurrentDragPosition}
                   currentDragPosition={currentDragPosition}
                   timedEvents={timedEvents}
                   layoutById={layoutById}
                   calculateDragLayout={calculateDragLayout}
                   brokenOverlapPairsRef={brokenOverlapPairsRef}
                   columnRankRef={columnRankRef}
                   onDragAutoScroll={handleDragAutoScroll}
                   onDoubleTap={() => {
                 const selectedDay = selectedDayYmd;
                 const isReviewDay = selectedDay < todayYmd || (selectedDay === todayYmd && isPastReset);
                 if (isReviewDay) {
                   setReviewingHabitId(resolveOggiHabitId(e));
                   setReviewingDate(selectedDay);
                 } else {
                   router.push({ pathname: '/modal', params: { type: 'edit', id: resolveOggiHabitId(e), ymd: selectedDay } });
                 }
               }}
                   onOccurrenceSlotDragEnd={handleOccurrenceSlotDragEnd}
                   getRecurringDragButtons={getRecurringDragButtons}
                   shouldOpenRecurringDragMenu={shouldOpenRecurringDragMenu}
               dragDisabled={
                 selectedDayYmd < todayYmd ||
                 (selectedDayYmd === todayYmd && isPastReset && toMinutes(e.endTime) <= toMinutes(currentDayResetTime))
               }
                 />
               );
             })}

             {/* Current Time Indicator */}
             {(() => {
               const top = getCurrentTimeTop();
               if (top === null) return null;
               return (
                 <View style={[styles.currentTimeIndicator, { top: top + BASE_VERTICAL_OFFSET }]}>
                    <View style={styles.currentTimeLine} />
                 </View>
               );
             })()}
         </View>
      </ScrollView>
      </View>
      </GestureHandlerRootView>

      {/* Day Review Modal (giorni non revisionati) */}
      {reviewQueue.length > 0 && (() => {
        const reviewDate = reviewQueue[0];
        const habitsOnDay = getHabitsAppearingOnDate(habits, reviewDate, dayResetTime).filter(
          h => h.askReview && !isTravelLikeTipo(h.tipo)
        );
        const dayHistory = history[reviewDate];
        const reviewItems: ReviewHabitItem[] = habitsOnDay.map(h => ({
          id: h.id,
          title: h.text,
          color: h.color ?? '#4A148C',
          completed: !!dayHistory?.completedByHabitId[h.id],
          rating: dayHistory?.ratings?.[h.id],
          comment: dayHistory?.comments?.[h.id],
        }));
        return (
          <DayReviewModal
            visible
            date={reviewDate}
            dateLabel={formatDateLabelLong(reviewDate)}
            items={reviewItems}
            onConfirm={async (reviews) => {
              for (const [habitId, { rating, comment }] of Object.entries(reviews)) {
                saveDayReview(reviewDate, habitId, rating, comment);
              }
              await markDateReviewed(reviewDate);
              // la coda si aggiorna automaticamente via effect (reviewedDates cambia)
            }}
            onClose={() => {
              setDismissedDatesThisSession(prev => [...prev, reviewDate]);
              // la coda si aggiorna automaticamente via effect
            }}
          />
        );
      })()}

      {/* Single habit review modal (doppio tap su task passata) */}
      {reviewingHabitId && reviewingDate && (() => {
        const habit = habits.find(h => h.id === reviewingHabitId);
        if (!habit) return null;
        const dayHistory = history[reviewingDate];
        const completed = !!dayHistory?.completedByHabitId[reviewingHabitId];
        const existingRating = dayHistory?.ratings?.[reviewingHabitId] ?? null;
        const existingComment = dayHistory?.comments?.[reviewingHabitId] ?? null;
        const item: ReviewHabitItem = {
          id: habit.id,
          title: habit.text,
          color: habit.color ?? '#4A148C',
          completed,
          rating: existingRating ?? undefined,
          comment: existingComment ?? undefined,
        };
        return (
          <DayReviewModal
            visible
            date={reviewingDate}
            dateLabel={formatDateLabelLong(reviewingDate)}
            items={[item]}
            onConfirm={(reviews) => {
              const rev = reviews[habit.id];
              if (rev) saveDayReview(reviewingDate, habit.id, rev.rating, rev.comment);
              setReviewingHabitId(null);
              setReviewingDate(null);
            }}
            onClose={() => {
              setReviewingHabitId(null);
              setReviewingDate(null);
            }}
          />
        );
      })()}

      {/* Tracker Modal */}
      <TrackerModal
        visible={showTrackerModal}
        initialDate={selectedDayYmd}
        editEntry={editingTrackerEntry}
        onClose={() => {
          setShowTrackerModal(false);
          setEditingTrackerEntry(null);
        }}
      />

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
         <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
               <Text style={styles.modalTitle}>Impostazioni Vista</Text>
               
               {/* Start Time Control */}
               <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Inizio: {windowStart}</Text>
                  <View style={styles.settingControls}>
                      <HoldableButton style={styles.controlBtn} onPress={() => {
                        setWindowStart(prev => {
                          const m = toMinutes(prev);
                          if (m <= 0) return prev;
                          return `${String(Math.floor((m-60)/60)).padStart(2, '0')}:00`;
                        });
                      }}><Text style={styles.controlBtnText}>-</Text></HoldableButton>
                      <HoldableButton style={styles.controlBtn} onPress={() => {
                        setWindowStart(prev => {
                          const startM = toMinutes(prev);
                          const currentEndM = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
                          if (startM >= currentEndM - 300) return prev;
                          const nextStartM = startM + 60;
                          return `${String(Math.floor(nextStartM/60)).padStart(2, '0')}:00`;
                        });
                      }}><Text style={styles.controlBtnText}>+</Text></HoldableButton>
                  </View>
               </View>

               {/* End Time Control */}
               <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Fine: {windowEnd}</Text>
                  <View style={styles.settingControls}>
                     <HoldableButton style={styles.controlBtn} onPress={() => {
                        setWindowEnd(prev => {
                          const currentStartM = toMinutes(windowStart);
                          const endM = prev === '24:00' ? 1440 : toMinutes(prev);
                          if (endM <= currentStartM + 300) return prev;
                          const nextEndM = endM - 60;
                          return nextEndM === 1440 ? '24:00' : `${String(Math.floor(nextEndM/60)).padStart(2, '0')}:00`;
                        });
                      }}><Text style={styles.controlBtnText}>-</Text></HoldableButton>
                      <HoldableButton style={styles.controlBtn} onPress={() => {
                        setWindowEnd(prev => {
                          const m = toMinutes(prev);
                          if (m >= 1440) return prev;
                          const next = Math.min(24, Math.floor((m+60)/60));
                          return next === 24 ? '24:00' : `${String(next).padStart(2, '0')}:00`;
                        });
                      }}><Text style={styles.controlBtnText}>+</Text></HoldableButton>
                  </View>
               </View>

                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Ore Visibili: {visibleHours}</Text>
                    <View style={styles.settingControls}>
                       <HoldableButton style={styles.controlBtn} onPress={() => {
                          setVisibleHours(prev => Math.max(5, prev - 1));
                       }}><Text style={styles.controlBtnText}>-</Text></HoldableButton>
                        <HoldableButton style={styles.controlBtn} onPress={() => {
                           setVisibleHours(v => Math.min(24, v + 1));
                        }}><Text style={styles.controlBtnText}>+</Text></HoldableButton>
                    </View>
                </View>

               {/* Reset Time Control */}
                  <View style={styles.settingRow}>
                   <Text style={styles.settingLabel}>Reset: {dayResetTime}</Text>
                   <View style={styles.settingControls}>
                      <HoldableButton style={styles.controlBtn} onPress={() => {
                         setDayResetTime(prev => {
                            const h = parseInt(prev.split(':')[0], 10);
                            const nextH = (h - 1 + 24) % 24;
                            return `${String(nextH).padStart(2, '0')}:00`;
                         });
                      }}><Text style={styles.controlBtnText}>-</Text></HoldableButton>
                      <HoldableButton style={styles.controlBtn} onPress={() => {
                         setDayResetTime(prev => {
                            const h = parseInt(prev.split(':')[0], 10);
                            const nextH = (h + 1) % 24;
                            return `${String(nextH).padStart(2, '0')}:00`;
                         });
                      }}><Text style={styles.controlBtnText}>+</Text></HoldableButton>
                   </View>
                </View>


               <TouchableOpacity style={styles.closeBtn} onPress={() => setShowSettings(false)}>
                  <Text style={styles.closeBtnText}>Chiudi</Text>
               </TouchableOpacity>
            </View>
         </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
  },
  navButton: {
    padding: 4,
  },
  dateText: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  dateWeatherWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayDateText: {
    color: '#FF3B30',
  },
  otherDateText: {
    color: '#FFF',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  weatherIcon: {
    transform: [{ translateY: 0 }],
  },
  settingsButton: {
    padding: 4,
  },
  
  // All Day
  allDayContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  allDayItem: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },

  // Timeline
  timelineHost: {
    flex: 1,
    backgroundColor: '#000',
  },
  timelineViewport: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#000',
  },
  scrollViewContent: {
    backgroundColor: '#000',
  },
  timelineContent: {
    backgroundColor: '#000',
  },
  hourRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    height: 20, // Just for the label area
    transform: [{ translateY: -10 }], // Center label vertically on the line
  },
  hourLabel: {
    width: LEFT_MARGIN,
    textAlign: 'right',
    paddingRight: 10,
    color: '#AAA', // Lighter text
    fontSize: 15, // Even larger
    fontWeight: '800', // Extra bold
  },
  hourLine: {
    flex: 1,
    height: 3, // Even thicker line
    backgroundColor: '#555', // More visible
  },
  hourLineContainer: {
    flex: 1,
    flexDirection: 'row',
    height: 3,
  },
  travelStrip: {
    position: 'absolute',
    borderRadius: 6,
    paddingLeft: 0,
    paddingRight: 4,
    paddingVertical: 2,
    justifyContent: 'center',
  },
  trackerStrip: {
    position: 'absolute',
    left: LEFT_MARGIN + 2,
    right: 2,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    justifyContent: 'center',
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255,255,255,0.5)',
    zIndex: 5,
  },
  trackerStripText: {
    fontSize: 11,
    fontWeight: '700',
  },
  trackerStripTime: {
    fontSize: 9,
    opacity: 0.85,
    marginTop: 1,
  },
  travelStripText: {
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 12,
  },
  travelStripTime: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 3,
  },
  
  // Events
  eventItem: {
    position: 'absolute',
    borderRadius: 6,
    padding: 4,
    overflow: 'hidden',
  },
  eventTitle: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  eventTime: {
    fontSize: 10,
    opacity: 0.8,
  },

  // Current Time
  currentTimeIndicator: {
    position: 'absolute',
    left: LEFT_MARGIN,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 99,
  },
  currentTimeDot: {
    display: 'none',
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#FF3B30',
  },
  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  settingLabel: {
    color: '#FFF',
    fontSize: 16,
  },
  settingControls: {
    flexDirection: 'row',
    gap: 10,
  },
  controlBtn: {
    width: 40,
    height: 40,
    backgroundColor: '#333',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnWide: {
    paddingHorizontal: 15,
    height: 40,
    backgroundColor: '#333',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlBtnText: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeBtn: {
    marginTop: 10,
    backgroundColor: '#3A3A3C',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
