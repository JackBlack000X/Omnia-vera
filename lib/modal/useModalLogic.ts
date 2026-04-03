import { useHabits } from '@/lib/habits/Provider';
import { formatYmd } from '@/lib/date';
import { getHealthHabitOption, HEALTH_HABIT_OPTIONS } from '@/lib/healthHabits';
import { getDailyOccurrenceTotal, getDailyOccurrenceTotalForDate, occurrenceChainFitsLogicalDay } from '@/lib/habits/occurrences';
import { Habit, HabitTipo, HealthMetric, NotificationConfig, TravelMeta, isTravelLikeTipo } from '@/lib/habits/schema';
import { minutesToHhmm, hhmmToMinutes, findDuplicateHabitSlot } from '@/lib/modal/helpers';
import { inferSmartTaskSeed } from '@/lib/smartTask';
import { getFallbackCity } from '@/lib/weather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView } from 'react-native';

export function useModalLogic(params: { type: string; id?: string; folder?: string; ymd?: string; scrollRef: React.RefObject<ScrollView | null> }) {
  const { type, id, folder, ymd, scrollRef } = params;
  const { habits, addHabit, updateHabit, updateHabitColor, updateHabitFolder, updateSchedule, updateScheduleTime, updateScheduleFromDate, setHabits, getDay, dayResetTime, migrateTodayCompletionForDailyCountChange } = useHabits();
  const router = useRouter();
  const existing = useMemo(() => habits.find(h => h.id === id), [habits, id]);
  const VACATION_COLOR = '#4A148C';

  const [text, setText] = useState(existing?.text ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? '#4A148C');
  const validFolder = (folder && folder !== '__oggi__' && folder !== '__tutte__') ? folder : null;
  const [selectedFolder, setSelectedFolder] = useState<string | null>(existing?.folder ?? validFolder ?? null);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [tipo, setTipo] = useState<HabitTipo>(existing?.tipo ?? 'task');
  const [healthMetric, setHealthMetric] = useState<HealthMetric | null>(existing?.health?.metric ?? null);
  const [healthGoalHours, setHealthGoalHours] = useState<number>(existing?.health?.goalHours ?? 8);
  const [healthGoalValue, setHealthGoalValue] = useState<number>(existing?.health?.goalValue ?? 0);
  useEffect(() => {
    if (existing?.tipo) setTipo(existing.tipo);
  }, [existing?.tipo]);
  useEffect(() => {
    setHealthMetric(existing?.health?.metric ?? null);
  }, [existing?.health?.metric]);
  useEffect(() => {
    setHealthGoalHours(existing?.health?.goalHours ?? 8);
  }, [existing?.health?.goalHours]);
  useEffect(() => {
    setHealthGoalValue(existing?.health?.goalValue ?? 0);
  }, [existing?.health?.goalValue]);

  const inferredExistingTipo: HabitTipo = (existing?.tipo ?? 'task');
  const supportsOptionalTime = (currentTipo: HabitTipo) =>
    currentTipo === 'task' || currentTipo === 'abitudine' || currentTipo === 'avviso';
  const todayYmdForInit = useMemo(() => ymd ?? getDay(new Date()), [ymd, getDay]);
  const logicalTodayYmd = useMemo(() => getDay(new Date()), [getDay]);
  const calendarTodayYmd = useMemo(() => formatYmd(new Date()), []);
  const todayForInit = useMemo(() => new Date(`${todayYmdForInit}T12:00:00`), [todayYmdForInit]);
  const todayWeekdayForInit = useMemo(() => todayForInit.getDay(), [todayForInit]);
  const todayDayOfMonthForInit = useMemo(() => todayForInit.getDate(), [todayForInit]);
  const hasRecurringSchedule = Boolean(
    existing?.schedule?.daysOfWeek?.length ||
    existing?.schedule?.monthDays?.length ||
    existing?.schedule?.yearMonth ||
    existing?.schedule?.yearDay ||
    existing?.schedule?.weeklyTimes ||
    existing?.schedule?.monthlyTimes
  );
  const shouldUseDateSpecificOverrides = Boolean(ymd) || !hasRecurringSchedule;
  const initialTravelDepartureYmd = useMemo(() => {
    if (existing?.travel?.giornoPartenza) return existing.travel.giornoPartenza;
    if (type !== 'new') return todayYmdForInit;

    // Tasks can follow the app's logical day, but trips must keep the real
    // calendar day even when "today" is still anchored to the previous
    // logical day before the reset hour.
    if (todayYmdForInit === logicalTodayYmd && calendarTodayYmd !== logicalTodayYmd) {
      return calendarTodayYmd;
    }

    return todayYmdForInit;
  }, [
    existing?.travel?.giornoPartenza,
    type,
    todayYmdForInit,
    logicalTodayYmd,
    calendarTodayYmd,
  ]);
  const firstOccurrenceSlotForToday = useMemo(() => {
    if (!shouldUseDateSpecificOverrides) return null;
    const slot = existing?.occurrenceSlotOverrides?.[todayYmdForInit]?.[0];
    if (!slot?.start) return null;
    return { start: slot.start, end: slot.end ?? null };
  }, [existing, todayYmdForInit, shouldUseDateSpecificOverrides]);

  const effectiveTimeForToday = useMemo(() => {
    if (!existing) return { isAllDayMarker: false, start: null as string | null, end: null as string | null };
    const override = shouldUseDateSpecificOverrides ? existing.timeOverrides?.[todayYmdForInit] : undefined;
    const isAllDayMarker = override === '00:00';
    const overrideStart = !isAllDayMarker && typeof override === 'string'
      ? override
      : (!isAllDayMarker && override && typeof override === 'object' && 'start' in override ? (override as any).start : null);
    const overrideEnd = !isAllDayMarker && override && typeof override === 'object' && 'end' in override
      ? (override as any).end
      : null;

    const weekly = existing.schedule?.weeklyTimes?.[todayWeekdayForInit] ?? null;
    const monthlyT = existing.schedule?.monthlyTimes?.[todayDayOfMonthForInit] ?? null;
    const start = firstOccurrenceSlotForToday?.start ?? overrideStart ?? (weekly?.start ?? monthlyT?.start ?? (existing.schedule?.time ?? null));
    const end = firstOccurrenceSlotForToday?.end ?? overrideEnd ?? (weekly?.end ?? monthlyT?.end ?? (existing.schedule?.endTime ?? null));
    return { isAllDayMarker, start, end };
  }, [existing, todayYmdForInit, todayWeekdayForInit, todayDayOfMonthForInit, firstOccurrenceSlotForToday, shouldUseDateSpecificOverrides]);

  // For tasks and habits: whether to show the schedule/time block.
  // New from Oggi/Domani = true. Existing: true if item has any schedule/override
  // (including all-day '00:00') so edit shows Frequenza/Giorno/Orario.
  const [taskHasTime, setTaskHasTime] = useState<boolean>(() => {
    if (!existing) return type === 'new' && (folder === '__oggi__' || folder === '__domani__');
    if (!supportsOptionalTime(inferredExistingTipo)) return false;
    const hasOverrides = existing.timeOverrides && Object.keys(existing.timeOverrides).length > 0;
    if (hasOverrides) return true;
    return Boolean(
      effectiveTimeForToday.start || effectiveTimeForToday.end
      || existing.schedule?.time || existing.schedule?.endTime
      || existing.schedule?.weeklyTimes || existing.schedule?.monthlyTimes
      || (existing.schedule?.daysOfWeek?.length ?? 0) > 0
      || (existing.schedule?.monthDays?.length ?? 0) > 0
      || (existing.schedule?.yearMonth && existing.schedule?.yearDay)
    );
  });

  const [locationRule, setLocationRule] = useState<Habit['locationRule'] | null>(existing?.locationRule ?? null);
  const [pauseDuringTravel, setPauseDuringTravel] = useState<boolean>(existing?.pauseDuringTravel ?? false);
  const [askReview, setAskReview] = useState<boolean>(existing?.askReview ?? false);
  const [smartTaskEnabled, setSmartTaskEnabled] = useState<boolean>(existing?.smartTask?.enabled ?? false);

  const [notification, setNotification] = useState<NotificationConfig>(
    existing?.notification ?? { enabled: false, minutesBefore: 0, customTime: null, customDate: null, showAsTaskInOggi: false }
  );

  const showNativeMergeAlert = useCallback((onConfirm: () => void) => {
    Alert.alert(
      'Combina con task esistente?',
      'Esiste una task con stesso nome e colore. Vuoi combinarle?',
      [
        { text: 'Annulla', style: 'destructive' },
        { text: 'Conferma', onPress: onConfirm },
      ],
      { cancelable: true },
    );
  }, []);

  const setHealthMetricWithDefaults = useCallback((nextMetric: HealthMetric) => {
    const option = HEALTH_HABIT_OPTIONS.find((entry) => entry.metric === nextMetric);
    setHealthMetric(nextMetric);
    if (!option) return;
    if (nextMetric === 'sleep') {
      setHealthGoalHours(option.defaultGoalHours ?? 8);
      return;
    }
    setHealthGoalValue(option.defaultGoalValue ?? 0);
  }, []);

  // Fine ripetizione
  type RepeatEndType = 'mai' | 'durata' | 'personalizzata';
  const [repeatEndType, setRepeatEndType] = useState<RepeatEndType>(() => {
    const saved = existing?.schedule?.repeatEndDate;
    if (!saved) return 'mai';
    return 'personalizzata';
  });
  const [repeatEndCount, setRepeatEndCount] = useState<number>(4);
  const [repeatEndCustomDate, setRepeatEndCustomDate] = useState<string | null>(
    existing?.schedule?.repeatEndDate ?? null
  );

  // Stato specifico per i viaggi
  const [travelMezzo, setTravelMezzo] = useState<TravelMeta['mezzo']>(existing?.travel?.mezzo ?? 'aereo');
  const [travelPartenzaTipo, setTravelPartenzaTipo] = useState<TravelMeta['partenzaTipo']>(existing?.travel?.partenzaTipo ?? 'attuale');
  const [travelPartenzaNome, setTravelPartenzaNome] = useState<string>(existing?.travel?.partenzaNome ?? '');
  const [travelDestinazioneNome, setTravelDestinazioneNome] = useState<string>(existing?.travel?.destinazioneNome ?? '');
  const [travelGiornoPartenza, setTravelGiornoPartenza] = useState<string>(initialTravelDepartureYmd);
  const [travelGiornoRitorno, setTravelGiornoRitorno] = useState<string | undefined>(existing?.travel?.giornoRitorno);
  const [travelOrarioPartenza, setTravelOrarioPartenza] = useState<string>(existing?.travel?.orarioPartenza ?? '09:00');
  const [travelOrarioArrivo, setTravelOrarioArrivo] = useState<string>(existing?.travel?.orarioArrivo ?? '10:00');
  const [travelArrivoGiornoDopo, setTravelArrivoGiornoDopo] = useState<boolean>(Boolean(existing?.travel?.arrivoGiornoDopo));
  const [travelOrarioPartenzaRitorno, setTravelOrarioPartenzaRitorno] = useState<string>(existing?.travel?.orarioPartenzaRitorno ?? existing?.travel?.orarioPartenza ?? '17:00');
  const [travelPartenzaRitornoGiornoDopo, setTravelPartenzaRitornoGiornoDopo] = useState<boolean>(Boolean(existing?.travel?.partenzaRitornoGiornoDopo));
  const [travelOrarioArrivoRitorno, setTravelOrarioArrivoRitorno] = useState<string>(existing?.travel?.orarioArrivoRitorno ?? existing?.travel?.orarioArrivo ?? '18:00');
  const [travelArrivoRitornoGiornoDopo, setTravelArrivoRitornoGiornoDopo] = useState<boolean>(Boolean(existing?.travel?.arrivoRitornoGiornoDopo));
  const [currentCityName, setCurrentCityName] = useState<string | null>(null);

  const STORAGE_LABELS = 'tasks_labels_v1';
  type LabelEntry = { text: string; count: number };
  const [labelInput, setLabelInput] = useState<string>(existing?.label ?? '');
  const [savedLabels, setSavedLabels] = useState<LabelEntry[]>([]);

  const topLabels = React.useMemo(
    () => [...savedLabels].sort((a, b) => b.count - a.count).slice(0, 3),
    [savedLabels]
  );

  const labelSuggestions = React.useMemo(() => {
    const q = labelInput.trim().toLowerCase();
    if (!q) return [];
    return savedLabels.filter(l => l.text.toLowerCase().includes(q) && l.text.toLowerCase() !== q);
  }, [labelInput, savedLabels]);

  useEffect(() => {
    (async () => {
      try {
        let data = await AsyncStorage.getItem('tasks_custom_folders_v2');
        if (!data) data = await AsyncStorage.getItem('tasks_custom_folders_v1');
        if (data) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            const names = parsed
              .map((f: unknown) => {
                if (typeof f === 'string') return f;
                if (f && typeof f === 'object' && 'name' in f) {
                  const n = (f as { name: unknown }).name;
                  return typeof n === 'string' ? n : null;
                }
                return null;
              })
              .filter((n): n is string => typeof n === 'string')
              .map(n => n.trim())
              .filter(Boolean);
            const uniqueNames = Array.from(new Set(names));
            setAvailableFolders(uniqueNames);
          }
        }
      } catch {}
      // Carica le label salvate
      try {
        const labelData = await AsyncStorage.getItem(STORAGE_LABELS);
        if (labelData) {
          const parsed = JSON.parse(labelData);
          if (Array.isArray(parsed)) setSavedLabels(parsed);
        }
      } catch {}
      // Recupera il nome della città corrente/fallback usata per il meteo
      try {
        const city = await getFallbackCity();
        if (city?.name) setCurrentCityName(city.name);
      } catch {}
    })();
  }, []);

  const shortenPlaceName = (value: string | null | undefined): string => {
    const trimmed = (value ?? '').trim();
    if (!trimmed) return '';
    const first = trimmed.split(',')[0];
    return first ? first.trim() : trimmed;
  };

  const buildVacationTravelMeta = (): TravelMeta => {
    const endDate = travelGiornoRitorno ?? travelGiornoPartenza;
    const endTime = travelOrarioArrivoRitorno || travelOrarioArrivo || travelOrarioPartenza;

    return {
      mezzo: 'altro',
      partenzaTipo: 'personalizzata',
      destinazioneNome: '',
      giornoPartenza: travelGiornoPartenza,
      giornoRitorno: endDate,
      orarioPartenza: travelOrarioPartenza,
      orarioArrivo: endTime,
      orarioPartenzaRitorno: endTime,
      orarioArrivoRitorno: endTime,
    };
  };

  // Confirmation modal state
  const [confirmationModal, setConfirmationModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // schedule state

  const initialDays = existing?.schedule?.daysOfWeek ?? [];
  const initialStart = tipo === 'avviso'
    ? '00:00'
    : ((!effectiveTimeForToday.isAllDayMarker ? effectiveTimeForToday.start : null) ?? existing?.schedule?.time ?? null);
  const initialEnd = tipo === 'avviso'
    ? null
    : ((!effectiveTimeForToday.isAllDayMarker ? effectiveTimeForToday.end : null) ?? existing?.schedule?.endTime ?? null);
  // Compute initial mode: if any recurring selection (weekly/monthly/annual) or any time is configured, default to 'timed'.
  const scheduleObj = existing?.schedule;
  const hasRecurringSelection = (initialDays.length > 0)
    || ((scheduleObj?.monthDays?.length ?? 0) > 0)
    || (!!scheduleObj?.yearMonth && !!scheduleObj?.yearDay);
  const hasAnyTimeConfigured = !!initialStart || !!initialEnd || !!scheduleObj?.weeklyTimes || !!scheduleObj?.monthlyTimes;
  // Use explicit isAllDay flag if present, otherwise fall back to inferring from absence of time config
  const hasTimeOverrides = existing?.timeOverrides && Object.keys(existing.timeOverrides).length > 0;
  const hasSpecificTimeOverrides = hasTimeOverrides && Object.values(existing?.timeOverrides ?? {}).some(time => time !== '00:00');
  const originalTimeOverrides = existing?.timeOverrides;
  const isAllDay = existing?.isAllDay !== undefined
    ? existing.isAllDay
    : (!hasAnyTimeConfigured && !scheduleObj?.weeklyTimes && !scheduleObj?.monthlyTimes && !hasSpecificTimeOverrides);
  const initialMode: 'allDay' | 'timed' = isAllDay ? 'allDay' : 'timed';
  const [mode, setMode] = useState<'allDay' | 'timed'>(initialMode);
  useEffect(() => {
    if (tipo !== 'salute') return;
    if (mode !== 'allDay') setMode('allDay');

    const option = getHealthHabitOption(healthMetric);
    if (!option) return;

    setText(option.label);
    setColor(option.solidColor);
  }, [tipo, healthMetric, mode]);
  useEffect(() => {
    if (tipo === 'avviso' && mode !== 'timed') setMode('timed');
  }, [tipo, mode]);
  useEffect(() => {
    if (tipo === 'avviso' && !notification.enabled) {
      setNotification(prev => ({ ...prev, enabled: true }));
    }
  }, [tipo, notification.enabled]);
  useEffect(() => {
    if (tipo !== 'avviso') return;
    setStartMin(0);
    setEndMin(null);
  }, [tipo]);
  const [freq, setFreq] = useState<'single' | 'daily' | 'weekly' | 'monthly' | 'annual'>(() => {
    if (existing) {
      // Use explicit saved frequency if present
      if (existing.habitFreq) return existing.habitFreq;

      // Fallback: infer from schedule/overrides for older tasks without the field
      const overrides = existing.timeOverrides ? Object.keys(existing.timeOverrides) : [];
      const hasTimeOverrides = overrides.length > 0;
      const hasSpecificSchedule = (existing.schedule?.daysOfWeek?.length ?? 0) > 0 ||
                                 (existing.schedule?.monthDays?.length ?? 0) > 0 ||
                                 existing.schedule?.yearMonth ||
                                 existing.schedule?.yearDay;

      // If it has time overrides but no specific schedule, it's single
      if (hasTimeOverrides && !hasSpecificSchedule) return 'single';

      // Check specific schedules first
      if (existing?.schedule?.monthDays && existing.schedule.monthDays.length > 0) return 'monthly';
      if (existing?.schedule?.yearMonth && existing?.schedule?.yearDay) return 'annual';
      if (initialDays.length > 0) return 'weekly';

      // If it has a schedule but no specific recurring pattern and no timeOverrides, it's daily
      if (existing.schedule &&
          !hasSpecificSchedule &&
          !hasTimeOverrides) return 'daily';
    }
    return 'single';
  });
  const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
  const sortDow = (arr: number[]) => [...arr].sort((a, b) => mondayFirst.indexOf(a) - mondayFirst.indexOf(b));
  const sortMonthDays = (arr: number[]) => [...arr].sort((a, b) => a - b);
  const MIN_TIMED_DURATION_MIN = 5;
  const clampTimedRange = useCallback((start: number, end: number | null) => {
    const safeStart = Math.max(0, Math.min(24 * 60 - MIN_TIMED_DURATION_MIN, Math.floor(start)));
    const fallbackEnd = safeStart + 60;
    const safeEnd = Math.max(safeStart + MIN_TIMED_DURATION_MIN, Math.floor(end ?? fallbackEnd));
    return {
      start: safeStart,
      end: Math.min(safeEnd, 24 * 60),
    };
  }, []);
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(() => sortDow(initialDays));
  const [monthDays, setMonthDays] = useState<number[]>(() => sortMonthDays(existing?.schedule?.monthDays ?? []));
  // Per-day-of-month times (minutes)
  const [perMonthTimes, setPerMonthTimes] = useState<Record<number, { startMin: number; endMin: number | null }>>(() => {
    const base: Record<number, { startMin: number; endMin: number | null }> = {};
    const mt = existing?.schedule?.monthlyTimes;
    if (mt) {
      Object.entries(mt).forEach(([k, v]) => {
        const d = Number(k);
        const s = hhmmToMinutes(v.start ?? null) ?? startMin;
        const e = hhmmToMinutes(v.end ?? null);
        base[d] = { startMin: s, endMin: e };
      });
    }
    return base;
  });
  const [selectedMonthDay, setSelectedMonthDay] = useState<number | null>(() => {
    if (existing && ymd && monthDays.includes(todayDayOfMonthForInit)) return todayDayOfMonthForInit;
    return monthDays[0] ?? null;
  });
  const prevMonthDaysRef = useRef<number[]>(monthDays);
  const recurringStartYmd = useMemo(() => {
    if (type === 'new') return todayYmdForInit;
    return existing?.schedule?.repeatStartDate ?? todayYmdForInit;
  }, [type, existing?.schedule?.repeatStartDate, todayYmdForInit]);

  // For single tasks, get date from timeOverrides (YYYY-MM-DD keys); for recurring from repeatStartDate; for annual from schedule
  const initialSingleDate = useMemo(() => {
    const startYmd = existing?.schedule?.repeatStartDate;
    if (startYmd && /^\d{4}-\d{2}-\d{2}$/.test(startYmd)) {
      const [y, m, d] = startYmd.split('-').map(Number);
      return { year: y, month: m, day: d };
    }
    const keys = existing?.timeOverrides ? Object.keys(existing.timeOverrides).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)) : [];
    if (keys.length > 0) {
      const [y, m, d] = keys[0].split('-').map(Number);
      return { year: y, month: m, day: d };
    }
    const [y, m, d] = todayYmdForInit.split('-').map(Number);
    return { year: y, month: m, day: d };
  }, [existing?.timeOverrides, existing?.schedule?.repeatStartDate, todayYmdForInit]);
  const [annualMonth, setAnnualMonth] = useState<number>(() =>
    existing?.schedule?.yearMonth ?? initialSingleDate.month);
  const [annualDay, setAnnualDay] = useState<number>(() =>
    existing?.schedule?.yearDay ?? initialSingleDate.day);
  const [annualYear, setAnnualYear] = useState<number>(() =>
    (existing?.schedule?.yearMonth && existing?.schedule?.yearDay) ? new Date().getFullYear() : initialSingleDate.year);
  const currentFormYmd = `${annualYear}-${String(annualMonth).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}`;
  const weekCustomTimeOverride = useMemo(() => {
    if (!existing?.timeOverrides) return null;
    if (freq === 'single') return null;

    const differsFromBaseSchedule = (dateKey: string, value: string | { start: string; end: string }) => {
      const current = new Date(`${dateKey}T12:00:00`);
      const weekday = current.getDay();
      const dayOfMonth = current.getDate();
      const baseWeekly = existing.schedule?.weeklyTimes?.[weekday] ?? null;
      const baseMonthly = existing.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
      const baseStart = baseWeekly?.start ?? baseMonthly?.start ?? existing.schedule?.time ?? null;
      const baseEnd = baseWeekly?.end ?? baseMonthly?.end ?? existing.schedule?.endTime ?? null;
      const overrideStart = typeof value === 'string' ? value : value?.start ?? null;
      const overrideEnd = typeof value === 'object' && value !== null ? value.end ?? null : null;
      return overrideStart !== baseStart || overrideEnd !== baseEnd;
    };

    const directOverride = existing.timeOverrides[todayYmdForInit];
    if (directOverride && directOverride !== '00:00' && differsFromBaseSchedule(todayYmdForInit, directOverride)) {
      return {
        ymd: todayYmdForInit,
        start: typeof directOverride === 'string' ? directOverride : directOverride?.start ?? null,
        end: typeof directOverride === 'object' && directOverride !== null ? directOverride.end ?? null : null,
      };
    }

    const baseDate = new Date(`${currentFormYmd}T12:00:00`);
    const weekday = baseDate.getDay();
    const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
    const weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() + diffToMonday);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const matches = Object.entries(existing.timeOverrides)
      .filter(([dateKey, value]) => {
        if (value === '00:00') return false;
        if (!differsFromBaseSchedule(dateKey, value)) return false;
        const current = new Date(`${dateKey}T12:00:00`);
        return current >= weekStart && current <= weekEnd;
      })
      .sort(([left], [right]) => left.localeCompare(right));

    if (matches.length === 0) return null;

    const [dateKey, value] = matches[0];
    return {
      ymd: dateKey,
      start: typeof value === 'string' ? value : value?.start ?? null,
      end: typeof value === 'object' && value !== null ? value.end ?? null : null,
    };
  }, [existing?.timeOverrides, freq, todayYmdForInit, currentFormYmd]);

  // Data inizio non può essere oltre data fine ripetizione (quando "Data personalizzata" è impostata)
  const maxStartYmd = repeatEndType === 'personalizzata' && repeatEndCustomDate && /^\d{4}-\d{2}-\d{2}$/.test(repeatEndCustomDate)
    ? repeatEndCustomDate
    : null;
  const setAnnualDayClamped = useCallback((updater: (d: number) => number) => {
    const newD = Math.max(1, Math.min(31, updater(annualDay)));
    const ymd = `${annualYear}-${String(annualMonth).padStart(2, '0')}-${String(newD).padStart(2, '0')}`;
    if (maxStartYmd && ymd > maxStartYmd) {
      const [, , d] = maxStartYmd.split('-').map(Number);
      setAnnualYear(Number(maxStartYmd.slice(0, 4)));
      setAnnualMonth(Number(maxStartYmd.slice(5, 7)));
      setAnnualDay(d);
      return;
    }
    setAnnualDay(newD);
  }, [annualYear, annualMonth, annualDay, maxStartYmd]);
  const setAnnualMonthClamped = useCallback((updater: (m: number) => number) => {
    const newM = Math.max(1, Math.min(12, updater(annualMonth)));
    const ymd = `${annualYear}-${String(newM).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}`;
    if (maxStartYmd && ymd > maxStartYmd) {
      const [, m, d] = maxStartYmd.split('-').map(Number);
      setAnnualYear(Number(maxStartYmd.slice(0, 4)));
      setAnnualMonth(m);
      setAnnualDay(d);
      return;
    }
    setAnnualMonth(newM);
  }, [annualYear, annualMonth, annualDay, maxStartYmd]);
  const setAnnualYearClamped = useCallback((updater: (y: number) => number) => {
    const newY = updater(annualYear);
    const ymd = `${newY}-${String(annualMonth).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}`;
    if (maxStartYmd && ymd > maxStartYmd) {
      const [y, m, d] = maxStartYmd.split('-').map(Number);
      setAnnualYear(y);
      setAnnualMonth(m);
      setAnnualDay(d);
      return;
    }
    setAnnualYear(newY);
  }, [annualYear, annualMonth, annualDay, maxStartYmd]);

  // Check if selected date is today
  const isToday = useMemo(() => {
    const [currentYear, currentMonth, currentDay] = todayYmdForInit.split('-').map(Number);

    if (freq === 'annual') {
      return annualDay === currentDay && annualMonth === currentMonth;
    } else if (freq === 'single') {
      return annualDay === currentDay && annualMonth === currentMonth && annualYear === currentYear;
    }
    return false;
  }, [freq, annualDay, annualMonth, annualYear, todayYmdForInit]);

  const [startMin, setStartMin] = useState<number>(hhmmToMinutes(initialStart ?? (tipo === 'avviso' ? '00:00' : '08:00')) ?? (tipo === 'avviso' ? 0 : 8 * 60));
  const [endMin, setEndMin] = useState<number | null>(hhmmToMinutes(initialEnd) ?? null);
  const [dailyOccurrences, setDailyOccurrences] = useState(() => {
    if (existing) {
      if ((existing.schedule?.daysOfWeek?.length ?? 0) > 0) {
        const firstDay = existing.schedule!.daysOfWeek![0];
        const wo = existing.schedule?.weeklyOccurrences;
        if (wo && wo[firstDay] !== undefined) return Math.min(30, Math.max(1, Math.floor(wo[firstDay])));
      }
      if ((existing.schedule?.monthDays?.length ?? 0) > 0) {
        const firstDay = sortMonthDays(existing.schedule!.monthDays!)[0];
        const mo = existing.schedule?.monthlyOccurrences;
        if (mo && mo[firstDay] !== undefined) return Math.min(30, Math.max(1, Math.floor(mo[firstDay])));
      }
    }
    return Math.min(30, Math.max(1, Math.floor(existing?.dailyOccurrences ?? 1)));
  });
  const [occurrenceGapMinutes, setOccurrenceGapMinutes] = useState(() =>
    Math.max(5, Math.floor(existing?.occurrenceGapMinutes ?? 360)));

  // Per-day occurrence gaps (weekly)
  const [perDayGaps, setPerDayGaps] = useState<Record<number, number>>(() => {
    const base: Record<number, number> = {};
    const wg = existing?.schedule?.weeklyGaps;
    if (wg) {
      Object.entries(wg).forEach(([k, v]) => { base[Number(k)] = Math.max(5, Math.floor(v)); });
    }
    return base;
  });

  // Per-day occurrence gaps (monthly)
  const [perMonthGaps, setPerMonthGaps] = useState<Record<number, number>>(() => {
    const base: Record<number, number> = {};
    const mg = existing?.schedule?.monthlyGaps;
    if (mg) {
      Object.entries(mg).forEach(([k, v]) => { base[Number(k)] = Math.max(5, Math.floor(v)); });
    }
    return base;
  });

  useEffect(() => {
    let newDailyOccurrences = Math.min(30, Math.max(1, Math.floor(existing?.dailyOccurrences ?? 1)));
    if (existing) {
      if ((existing.schedule?.daysOfWeek?.length ?? 0) > 0) {
        const firstDay = existing.schedule!.daysOfWeek![0];
        const wo = existing.schedule?.weeklyOccurrences;
        if (wo && wo[firstDay] !== undefined) newDailyOccurrences = Math.min(30, Math.max(1, Math.floor(wo[firstDay])));
      } else if ((existing.schedule?.monthDays?.length ?? 0) > 0) {
        const firstDay = sortMonthDays(existing.schedule!.monthDays!)[0];
        const mo = existing.schedule?.monthlyOccurrences;
        if (mo && mo[firstDay] !== undefined) newDailyOccurrences = Math.min(30, Math.max(1, Math.floor(mo[firstDay])));
      }
    }
    setDailyOccurrences(newDailyOccurrences);
    setOccurrenceGapMinutes(Math.max(5, Math.floor(existing?.occurrenceGapMinutes ?? 360)));
    
    const wg = existing?.schedule?.weeklyGaps;
    if (wg) {
      const pGaps: Record<number, number> = {};
      Object.entries(wg).forEach(([k, v]) => { pGaps[Number(k)] = Math.max(5, Math.floor(v)); });
      setPerDayGaps(pGaps);
    } else {
      setPerDayGaps({});
    }

    const mg = existing?.schedule?.monthlyGaps;
    if (mg) {
      const mGaps: Record<number, number> = {};
      Object.entries(mg).forEach(([k, v]) => { mGaps[Number(k)] = Math.max(5, Math.floor(v)); });
      setPerMonthGaps(mGaps);
    } else {
      setPerMonthGaps({});
    }
  }, [existing?.id]);
  // Per-day weekly times (minutes)
  const [perDayTimes, setPerDayTimes] = useState<Record<number, { startMin: number; endMin: number | null }>>(() => {
    const base: Record<number, { startMin: number; endMin: number | null }> = {};
    const wt = existing?.schedule?.weeklyTimes;
    if (wt) {
      Object.entries(wt).forEach(([k, v]) => {
        const d = Number(k);
        const s = hhmmToMinutes(v.start ?? null) ?? startMin;
        const e = hhmmToMinutes(v.end ?? null);
        base[d] = { startMin: s, endMin: e };
      });
    }
    return base;
  });
  const [selectedDow, setSelectedDow] = useState<number | null>(() => {
    if (existing && ymd && initialDays.includes(todayWeekdayForInit)) return todayWeekdayForInit;
    const pick = mondayFirst.find(d => initialDays.includes(d));
    return pick !== undefined ? pick : (initialDays[0] ?? null);
  });
  // Per-day occurrence counts (weekly)
  const [perDayOccurrences, setPerDayOccurrences] = useState<Record<number, number>>(() => {
    const base: Record<number, number> = {};
    const wo = existing?.schedule?.weeklyOccurrences;
    if (wo) {
      // Find unified value
      let unified = existing?.dailyOccurrences ?? 1;
      const days = existing?.schedule?.daysOfWeek ?? [];
      if (days.length > 0 && wo[days[0]] !== undefined) {
        unified = wo[days[0]];
      }
      Object.entries(wo).forEach(([k, v]) => { base[Number(k)] = unified; });
    }
    return base;
  });
  // Per-day occurrence counts (monthly)
  const [perMonthOccurrences, setPerMonthOccurrences] = useState<Record<number, number>>(() => {
    const base: Record<number, number> = {};
    const mo = existing?.schedule?.monthlyOccurrences;
    if (mo) {
      let unified = existing?.dailyOccurrences ?? 1;
      const days = existing?.schedule?.monthDays ?? [];
      if (days.length > 0 && mo[days[0]] !== undefined) {
        unified = mo[days[0]];
      }
      Object.entries(mo).forEach(([k, v]) => { base[Number(k)] = unified; });
    }
    return base;
  });

  // Tracks which days have been manually customized (no longer mirror the first day)
  const [customizedDows, setCustomizedDows] = useState<Set<number>>(() => {
    const days = sortDow(existing?.schedule?.daysOfWeek ?? []);
    if (days.length <= 1) return new Set();
    const firstDay = days[0];
    const wt = existing?.schedule?.weeklyTimes;
    const wg = existing?.schedule?.weeklyGaps;
    const customized = new Set<number>();
    for (const d of days.slice(1)) {
      const diffTime = wt && (wt[d]?.start !== wt[firstDay]?.start || wt[d]?.end !== wt[firstDay]?.end);
      const diffGap = wg && wg[d] !== undefined && wg[firstDay] !== undefined && wg[d] !== wg[firstDay];
      if (diffTime || diffGap) customized.add(d);
    }
    return customized;
  });
  const [customizedMonthDays, setCustomizedMonthDays] = useState<Set<number>>(() => {
    const days = sortMonthDays(existing?.schedule?.monthDays ?? []);
    if (days.length <= 1) return new Set();
    const firstDay = days[0];
    const mt = existing?.schedule?.monthlyTimes;
    const mg = existing?.schedule?.monthlyGaps;
    const customized = new Set<number>();
    for (const d of days.slice(1)) {
      const diffTime = mt && (mt[d]?.start !== mt[firstDay]?.start || mt[d]?.end !== mt[firstDay]?.end);
      const diffGap = mg && mg[d] !== undefined && mg[firstDay] !== undefined && mg[d] !== mg[firstDay];
      if (diffTime || diffGap) customized.add(d);
    }
    return customized;
  });

  // Validate that start time doesn't exceed end time
  useEffect(() => {
    if (endMin && startMin >= endMin) {
      setEndMin(startMin + 60); // Set end time to 1 hour after start
    }
  }, [startMin, endMin]);

  // Helpers to know if we're editing per-day times/occurrences (weekly, timed, multiple days)
  const usePerDayTimeWeekly = mode === 'timed' && freq === 'weekly' && daysOfWeek.length > 1 && selectedDow !== null;
  const usePerDayTimeMonthly = mode === 'timed' && freq === 'monthly' && monthDays.length > 1 && selectedMonthDay !== null;
  const usePerDayOccWeekly = freq === 'weekly' && daysOfWeek.length > 1 && selectedDow !== null;
  const usePerDayOccMonthly = freq === 'monthly' && monthDays.length > 1 && selectedMonthDay !== null;
  const isViewingSelectedDateContext = Boolean(
    existing &&
    ymd &&
    (
      freq === 'weekly'
        ? selectedDow === todayWeekdayForInit
        : freq === 'monthly'
          ? selectedMonthDay === todayDayOfMonthForInit
          : true
    )
  );
  const hasSpecificTimeContextForSelectedDate = Boolean(
    existing &&
    ymd &&
    (
      firstOccurrenceSlotForToday ||
      existing.timeOverrides?.[todayYmdForInit] !== undefined
    )
  );
  const effectiveStartMinForSelectedDate = hhmmToMinutes(effectiveTimeForToday.start ?? null);
  const effectiveEndMinForSelectedDate = hhmmToMinutes(effectiveTimeForToday.end ?? null);
  const currentStartMin = usePerDayTimeWeekly
    ? (selectedDow !== null && perDayTimes[selectedDow]?.startMin !== undefined ? perDayTimes[selectedDow]!.startMin : startMin)
    : usePerDayTimeMonthly
      ? (selectedMonthDay !== null && perMonthTimes[selectedMonthDay]?.startMin !== undefined ? perMonthTimes[selectedMonthDay]!.startMin : startMin)
      : startMin;
  const currentEndMin = usePerDayTimeWeekly
    ? (selectedDow !== null && perDayTimes[selectedDow]?.endMin !== undefined ? perDayTimes[selectedDow]!.endMin : endMin)
    : usePerDayTimeMonthly
      ? (selectedMonthDay !== null && perMonthTimes[selectedMonthDay]?.endMin !== undefined ? perMonthTimes[selectedMonthDay]!.endMin : endMin)
      : endMin;

  const isFirstDow = selectedDow !== null && daysOfWeek.length > 0 && selectedDow === daysOfWeek[0];
  const isFirstMonthDay = selectedMonthDay !== null && monthDays.length > 0 && selectedMonthDay === monthDays[0];

  useEffect(() => {
    if (daysOfWeek.length <= 1) return;
    const firstDow = daysOfWeek[0];
    if (firstDow === undefined) return;

    const sourceTime = perDayTimes[firstDow] ?? { startMin, endMin };
    const sourceGap = perDayGaps[firstDow] ?? occurrenceGapMinutes;

    setPerDayTimes(prev => {
      let changed = false;
      const next = { ...prev };
      for (const day of daysOfWeek.slice(1)) {
        if (customizedDows.has(day)) continue;
        const current = prev[day];
        if (!current || current.startMin !== sourceTime.startMin || current.endMin !== sourceTime.endMin) {
          next[day] = { startMin: sourceTime.startMin, endMin: sourceTime.endMin };
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setPerDayOccurrences(prev => {
      let changed = false;
      const next = { ...prev };
      for (const day of daysOfWeek) {
        if (next[day] !== dailyOccurrences) {
          next[day] = dailyOccurrences;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setPerDayGaps(prev => {
      let changed = false;
      const next = { ...prev };
      for (const day of daysOfWeek.slice(1)) {
        if (customizedDows.has(day)) continue;
        if ((prev[day] ?? occurrenceGapMinutes) !== sourceGap) {
          next[day] = sourceGap;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [
    daysOfWeek,
    customizedDows,
    perDayTimes,
    perDayGaps,
    startMin,
    endMin,
    dailyOccurrences,
    occurrenceGapMinutes,
  ]);

  useEffect(() => {
    if (monthDays.length <= 1) return;
    const firstMonthDay = monthDays[0];
    if (firstMonthDay === undefined) return;

    const sourceTime = perMonthTimes[firstMonthDay] ?? { startMin, endMin };
    const sourceOccurrences = perMonthOccurrences[firstMonthDay] ?? dailyOccurrences;
    const sourceGap = perMonthGaps[firstMonthDay] ?? occurrenceGapMinutes;

    setPerMonthTimes(prev => {
      let changed = false;
      const next = { ...prev };
      for (const day of monthDays.slice(1)) {
        if (customizedMonthDays.has(day)) continue;
        const current = prev[day];
        if (!current || current.startMin !== sourceTime.startMin || current.endMin !== sourceTime.endMin) {
          next[day] = { startMin: sourceTime.startMin, endMin: sourceTime.endMin };
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setPerMonthOccurrences(prev => {
      let changed = false;
      const next = { ...prev };
      for (const day of monthDays) {
        if (prev[day] !== sourceOccurrences) {
          next[day] = sourceOccurrences;
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setPerMonthGaps(prev => {
      let changed = false;
      const next = { ...prev };
      for (const day of monthDays.slice(1)) {
        if (customizedMonthDays.has(day)) continue;
        if ((prev[day] ?? occurrenceGapMinutes) !== sourceGap) {
          next[day] = sourceGap;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [
    monthDays,
    customizedMonthDays,
    perMonthTimes,
    perMonthOccurrences,
    perMonthGaps,
    startMin,
    endMin,
    dailyOccurrences,
    occurrenceGapMinutes,
  ]);

  const didSyncSelectedDayRef = useRef(false);
  useEffect(() => {
    didSyncSelectedDayRef.current = false;
  }, [existing?.id, ymd]);

  useEffect(() => {
    if (!existing || !ymd) return;
    if (didSyncSelectedDayRef.current) return;

    if (freq === 'weekly' && daysOfWeek.length > 1 && daysOfWeek.includes(todayWeekdayForInit)) {
      setSelectedDow(todayWeekdayForInit);
      didSyncSelectedDayRef.current = true;
      return;
    }

    if (freq === 'monthly' && monthDays.length > 1 && monthDays.includes(todayDayOfMonthForInit)) {
      setSelectedMonthDay(todayDayOfMonthForInit);
      didSyncSelectedDayRef.current = true;
    }
  }, [freq, daysOfWeek, monthDays, todayWeekdayForInit, todayDayOfMonthForInit, existing?.id, ymd]);

  const updateCurrentStartMin = (next: number) => {
    const clamped = clampTimedRange(next, currentEndMin);
    if (usePerDayTimeWeekly && selectedDow !== null) {
      if (!isFirstDow) {
        setCustomizedDows(prev => new Set([...prev, selectedDow]));
      }
      setPerDayTimes(prev => ({
        ...prev,
        [selectedDow]: { startMin: clamped.start, endMin: clampTimedRange(clamped.start, prev[selectedDow]?.endMin ?? null).end }
      }));
    } else if (usePerDayTimeMonthly && selectedMonthDay !== null) {
      if (!isFirstMonthDay) {
        setCustomizedMonthDays(prev => new Set([...prev, selectedMonthDay]));
      }
      setPerMonthTimes(prev => ({
        ...prev,
        [selectedMonthDay]: { startMin: clamped.start, endMin: clampTimedRange(clamped.start, prev[selectedMonthDay]?.endMin ?? null).end }
      }));
    } else {
      setStartMin(clamped.start);
      setEndMin(clamped.end);
    }
  };
  const updateCurrentEndMin = (next: number | null) => {
    if (usePerDayTimeWeekly && selectedDow !== null) {
      if (!isFirstDow) {
        setCustomizedDows(prev => new Set([...prev, selectedDow]));
      }
      const currentStart = perDayTimes[selectedDow]?.startMin ?? startMin;
      const clamped = clampTimedRange(currentStart, next);
      setPerDayTimes(prev => ({
        ...prev,
        [selectedDow]: { startMin: prev[selectedDow]?.startMin ?? startMin, endMin: clamped.end }
      }));
    } else if (usePerDayTimeMonthly && selectedMonthDay !== null) {
      if (!isFirstMonthDay) {
        setCustomizedMonthDays(prev => new Set([...prev, selectedMonthDay]));
      }
      const currentStart = perMonthTimes[selectedMonthDay]?.startMin ?? startMin;
      const clamped = clampTimedRange(currentStart, next);
      setPerMonthTimes(prev => ({
        ...prev,
        [selectedMonthDay]: { startMin: prev[selectedMonthDay]?.startMin ?? startMin, endMin: clamped.end }
      }));
    } else {
      const clamped = clampTimedRange(startMin, next);
      setEndMin(clamped.end);
    }
  };

  const updateCurrentTimeRange = (nextStart: number, nextEnd: number | null) => {
    const clamped = clampTimedRange(nextStart, nextEnd);
    if (usePerDayTimeWeekly && selectedDow !== null) {
      if (!isFirstDow) {
        setCustomizedDows(prev => new Set([...prev, selectedDow]));
      }
      setPerDayTimes(prev => ({
        ...prev,
        [selectedDow]: { startMin: clamped.start, endMin: clamped.end }
      }));
    } else if (usePerDayTimeMonthly && selectedMonthDay !== null) {
      if (!isFirstMonthDay) {
        setCustomizedMonthDays(prev => new Set([...prev, selectedMonthDay]));
      }
      setPerMonthTimes(prev => ({
        ...prev,
        [selectedMonthDay]: { startMin: clamped.start, endMin: clamped.end }
      }));
    } else {
      setStartMin(clamped.start);
      setEndMin(clamped.end);
    }
  };

  const currentDailyOccurrences = dailyOccurrences;
  const updateCurrentDailyOccurrences = (next: number) => {
    if (next > 1 && !occurrenceChainFitsLogicalDay(dayResetTime, currentStartMin, next, currentGapMinutes)) {
      return;
    }
    setDailyOccurrences(next);
    setPerDayOccurrences(prev => {
      const newP: typeof prev = {};
      for (const d of daysOfWeek) {
        newP[d] = next;
      }
      return newP;
    });
    setPerMonthOccurrences(prev => {
      const newP: typeof prev = {};
      for (const d of monthDays) {
        newP[d] = next;
      }
      return newP;
    });
  };

  const currentGapMinutes = useMemo(() => {
    if (freq === 'weekly' && selectedDow !== null) return perDayGaps[selectedDow] ?? occurrenceGapMinutes;
    if (freq === 'monthly' && selectedMonthDay !== null) return perMonthGaps[selectedMonthDay] ?? occurrenceGapMinutes;
    return occurrenceGapMinutes;
  }, [freq, selectedDow, selectedMonthDay, perDayGaps, perMonthGaps, occurrenceGapMinutes]);

  /**
   * Analyzes occurrenceSlotOverrides for today to determine if occurrences
   * have been manually moved (via drag), creating a non-uniform gap.
   *
   * Returns:
   *  { kind: 'uniform', gap: number } – all consecutive gaps are the same (including n=2)
   *  { kind: 'custom' }              – n>2 with at least two different gaps
   *  { kind: 'none' }                – no slot overrides for today
   */
  const slotGapInfo = useMemo(() => {
    if (!existing) return { kind: 'none' as const };
    if (!shouldUseDateSpecificOverrides) return { kind: 'none' as const };
    const n = getDailyOccurrenceTotalForDate(existing, todayWeekdayForInit, todayDayOfMonthForInit);
    if (n < 2) return { kind: 'none' as const };
    const dayOv = existing.occurrenceSlotOverrides?.[todayYmdForInit];
    if (!dayOv || Object.keys(dayOv).length === 0) return { kind: 'none' as const };
    // Compute gaps between consecutive overridden slots
    const gaps: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = dayOv[i];
      const b = dayOv[i + 1];
      if (!a || !b) return { kind: 'none' as const }; // not all slots overridden – ignore
      const aMin = (parseInt(a.start.split(':')[0], 10) * 60) + parseInt(a.start.split(':')[1], 10);
      const bMin = (parseInt(b.start.split(':')[0], 10) * 60) + parseInt(b.start.split(':')[1], 10);
      gaps.push(bMin - aMin);
    }
    if (gaps.length === 0) return { kind: 'none' as const };
    const firstGap = gaps[0];
    const allSame = gaps.every(g => g === firstGap);
    if (allSame) return { kind: 'uniform' as const, gap: Math.max(5, firstGap) };
    return { kind: 'custom' as const };
  }, [existing, todayYmdForInit, todayWeekdayForInit, todayDayOfMonthForInit, shouldUseDateSpecificOverrides]);

  const occurrencePreviewSlots = useMemo(() => {
    if (currentDailyOccurrences <= 1) return [] as string[];

    const dayOv = shouldUseDateSpecificOverrides ? existing?.occurrenceSlotOverrides?.[todayYmdForInit] : undefined;
    if (isViewingSelectedDateContext && dayOv && Object.keys(dayOv).length > 0) {
      const exactSlots: string[] = [];
      let hasAllSlots = true;
      for (let i = 1; i < currentDailyOccurrences; i++) {
        const slot = dayOv[i];
        const start = slot?.start ?? null;
        const end = slot?.end ?? null;
        if (hhmmToMinutes(start) === null || hhmmToMinutes(end) === null) {
          hasAllSlots = false;
          break;
        }
        exactSlots.push(`${start}–${end}`);
      }
      if (hasAllSlots && exactSlots.length > 0) return exactSlots;
    }

    const sM = currentStartMin;
    const eM = currentEndMin ?? (sM + 60);
    const dur = Math.max(5, eM - sM);
    const gap = Math.max(5, slotGapInfo.kind === 'uniform' ? slotGapInfo.gap : currentGapMinutes);
    const generatedSlots: string[] = [];
    for (let i = 1; i < currentDailyOccurrences; i++) {
      const slotS = sM + i * gap;
      if (slotS >= 24 * 60) break;
      const slotE = Math.min(24 * 60, slotS + dur);
      generatedSlots.push(`${minutesToHhmm(slotS)}–${minutesToHhmm(slotE)}`);
    }
    return generatedSlots;
  }, [
    currentDailyOccurrences,
    currentStartMin,
    currentEndMin,
    currentGapMinutes,
    existing,
    isViewingSelectedDateContext,
    slotGapInfo,
    todayYmdForInit,
    shouldUseDateSpecificOverrides,
  ]);

  const updateCurrentGapMinutes = useCallback((valOrUpdater: number | ((prev: number) => number)) => {
    const resolveGap = (prev: number) => {
      let nextGap = typeof valOrUpdater === 'function' ? valOrUpdater(prev) : valOrUpdater;
      nextGap = Math.max(5, nextGap);
      if (currentDailyOccurrences > 1 && !occurrenceChainFitsLogicalDay(dayResetTime, currentStartMin, currentDailyOccurrences, nextGap)) {
        return prev;
      }
      return nextGap;
    };

    // When the user manually edits the gap, clear dragged slot overrides for today
    // so all occurrences revert to equal spacing from that gap.
    if (shouldUseDateSpecificOverrides && existing && existing.occurrenceSlotOverrides?.[todayYmdForInit]) {
      setHabits(prev => prev.map(h => {
        if (h.id !== existing.id) return h;
        const rest = { ...(h.occurrenceSlotOverrides ?? {}) };
        delete rest[todayYmdForInit];
        const nextMenuSource = { ...(h.occurrenceSlotMenuSource ?? {}) };
        delete nextMenuSource[todayYmdForInit];
        return {
          ...h,
          occurrenceSlotOverrides: Object.keys(rest).length ? rest : undefined,
          occurrenceSlotMenuSource: Object.keys(nextMenuSource).length ? nextMenuSource : undefined,
        };
      }));
    }

    if (freq === 'weekly' && selectedDow !== null) {
      if (!isFirstDow) {
        setCustomizedDows(prev => new Set([...prev, selectedDow]));
      }
      setPerDayGaps(prev => ({
        ...prev,
        [selectedDow]: resolveGap(prev[selectedDow] ?? occurrenceGapMinutes)
      }));
    } else if (freq === 'monthly' && selectedMonthDay !== null) {
      if (!isFirstMonthDay) {
        setCustomizedMonthDays(prev => new Set([...prev, selectedMonthDay]));
      }
      setPerMonthGaps(prev => ({
        ...prev,
        [selectedMonthDay]: resolveGap(prev[selectedMonthDay] ?? occurrenceGapMinutes)
      }));
    } else {
      setOccurrenceGapMinutes(prev => resolveGap(prev));
    }
  }, [freq, selectedDow, selectedMonthDay, occurrenceGapMinutes, dayResetTime, currentStartMin, currentDailyOccurrences, existing, todayYmdForInit, shouldUseDateSpecificOverrides, setHabits]);

  // When editing an existing task/habit, keep Orario aligned with persisted data.
  // Important: include single-date overrides (including all-day marker '00:00'),
  // otherwise items created from Oggi appear as "Nessun orario" in edit.
  useEffect(() => {
    if (!existing) return;
    const exTipo: HabitTipo = (existing.tipo ?? 'task');
    if (!supportsOptionalTime(exTipo)) return;

    const hasAnyOverrides = Object.keys(existing.timeOverrides ?? {}).length > 0;
    const hasAnyScheduleConfig = Boolean(
      existing.schedule?.time ||
      existing.schedule?.endTime ||
      existing.schedule?.weeklyTimes ||
      existing.schedule?.monthlyTimes ||
      (existing.schedule?.daysOfWeek?.length ?? 0) > 0 ||
      (existing.schedule?.monthDays?.length ?? 0) > 0 ||
      (existing.schedule?.yearMonth && existing.schedule?.yearDay)
    );
    const shouldShowOrario = hasAnyOverrides || hasAnyScheduleConfig || Boolean(existing.isAllDay);
    setTaskHasTime(shouldShowOrario);

    if (!shouldShowOrario) return;

    // If there is an effective time for today (override/weekly/monthly/base) and it's not all-day,
    // start in timed mode and mirror current start/end.
    if (shouldUseDateSpecificOverrides && !effectiveTimeForToday.isAllDayMarker && (effectiveTimeForToday.start || effectiveTimeForToday.end)) {
      setTaskHasTime(true);
      setMode('timed');
      if (effectiveTimeForToday.start) {
        const s = hhmmToMinutes(effectiveTimeForToday.start);
        if (s != null) {
          setStartMin(s);
          if (freq === 'weekly' && selectedDow !== null) {
            setPerDayTimes(prev => ({
              ...prev,
              [selectedDow]: {
                startMin: s,
                endMin: effectiveTimeForToday.end ? hhmmToMinutes(effectiveTimeForToday.end) : null,
              },
            }));
          } else if (freq === 'monthly' && selectedMonthDay !== null) {
            setPerMonthTimes(prev => ({
              ...prev,
              [selectedMonthDay]: {
                startMin: s,
                endMin: effectiveTimeForToday.end ? hhmmToMinutes(effectiveTimeForToday.end) : null,
              },
            }));
          }
        }
      }
      if (effectiveTimeForToday.end) {
        const e = hhmmToMinutes(effectiveTimeForToday.end);
        setEndMin(e ?? null);
      }
      return;
    }

    // For saved all-day tasks, keep all-day mode visible in edit.
    if (effectiveTimeForToday.isAllDayMarker || existing.isAllDay) {
      setMode('allDay');
    }
  }, [existing?.id, effectiveTimeForToday, shouldUseDateSpecificOverrides]);

  useEffect(() => {
    const normalized = clampTimedRange(startMin, endMin);
    if (normalized.start !== startMin) setStartMin(normalized.start);
    if (normalized.end !== endMin) setEndMin(normalized.end);
  }, [startMin, endMin, clampTimedRange]);

  useEffect(() => {
    const prev = prevMonthDaysRef.current;
    const changed =
      prev.length !== monthDays.length || prev.some((day, index) => day !== monthDays[index]);
    if (changed) {
      setSelectedMonthDay(monthDays[0] ?? null);
      prevMonthDaysRef.current = monthDays;
    }
  }, [monthDays]);

  function toggleDow(d: number) {
    const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    const isAdding = !daysOfWeek.includes(d);

    if (isAdding) {
      // Adding a day - clear monthly days
      if (monthDays.length > 0) {
        const sortedMonthDays = [...monthDays].sort((a, b) => a - b);
        const monthlyDaysText = sortedMonthDays.length === 1 ? `giorno ${sortedMonthDays[0]}` : `giorni ${sortedMonthDays.join(', ')}`;
        setConfirmationModal({
          visible: true,
          title: 'Conferma cancellazione',
          message: `Selezionando ${dayNames[d]} cancellerai i ${monthlyDaysText} del mese. Sei sicuro?`,
          onConfirm: () => {
            setDaysOfWeek(prev => {
              const next = sortDow([...prev, d]);
              setSelectedDow(next[0] ?? null);
              return next;
            });
            setMonthDays([]);
            setConfirmationModal(prev => ({ ...prev, visible: false }));
          },
        });
        return;
      }
      setDaysOfWeek(prev => {
        const next = sortDow([...prev, d]);
        const firstDay = prev.length > 0 ? prev[0] : null;
        // When going from 1→2 days, sync the first day from globals first (since in
        // single-day mode the user edits globals, not perDayTimes).
        setPerDayTimes(p => {
          const newP = { ...p };
          if (firstDay !== null && prev.length === 1) {
            newP[firstDay] = { startMin, endMin };
          }
          const template = firstDay !== null ? (newP[firstDay] ?? { startMin, endMin }) : { startMin, endMin };
          newP[d] = { startMin: template.startMin, endMin: template.endMin };
          return newP;
        });
        setPerDayOccurrences(po => {
          const newPo = { ...po };
          if (firstDay !== null && prev.length === 1) {
            newPo[firstDay] = dailyOccurrences;
          }
          const occTemplate = firstDay !== null ? (newPo[firstDay] ?? dailyOccurrences) : dailyOccurrences;
          newPo[d] = occTemplate;
          return newPo;
        });
        setSelectedDow(next[0] ?? null);
        // ensure UI shows 'timed' when user selects weekly days
        if (tipo !== 'salute' && mode !== 'timed') setMode('timed');
        return next;
      });
    } else {
      // Removing a day - no confirmation needed
      setDaysOfWeek(prev => {
        const next = prev.filter(x => x !== d);
        setPerDayTimes(p => { const cp = { ...p } as any; delete cp[d]; return cp; });
        setPerDayOccurrences(p => { const cp = { ...p } as any; delete cp[d]; return cp; });
        setCustomizedDows(prev => { const s = new Set(prev); s.delete(d); return s; });
        if (selectedDow === d) {
          const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
          const pick = mondayFirst.find(x => next.includes(x));
          setSelectedDow(pick !== undefined ? pick : (next[0] ?? null));
        }
        return next;
      });
    }
  }

  function toggleMonthDay(d: number) {
    const isAdding = !monthDays.includes(d);

    if (isAdding) {
      // Adding a day - clear weekly days
      if (daysOfWeek.length > 0) {
        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const sortedWeekDays = [...daysOfWeek].sort((a, b) => a - b);
        const weeklyDaysText = sortedWeekDays.map(day => dayNames[day]).join(', ');
        setConfirmationModal({
          visible: true,
          title: 'Conferma cancellazione',
          message: `Selezionando il giorno ${d} cancellerai i giorni ${weeklyDaysText}. Sei sicuro?`,
          onConfirm: () => {
            setMonthDays(prev => [...prev, d].sort((a, b) => a - b));
            setDaysOfWeek([]);
            setConfirmationModal(prev => ({ ...prev, visible: false }));
          },
        });
        return;
      }
      setMonthDays(prev => {
        const next = [...prev, d].sort((a, b) => a - b);
        const firstDay = prev.length > 0 ? prev[0] : null;
        setPerMonthTimes(p => {
          const newP = { ...p };
          if (firstDay !== null && prev.length === 1) {
            newP[firstDay] = { startMin, endMin };
          }
          const template = firstDay !== null ? (newP[firstDay] ?? { startMin, endMin }) : { startMin, endMin };
          newP[d] = { startMin: template.startMin, endMin: template.endMin };
          return newP;
        });
        setPerMonthOccurrences(po => {
          const newPo = { ...po };
          if (firstDay !== null && prev.length === 1) {
            newPo[firstDay] = dailyOccurrences;
          }
          const occTemplate = firstDay !== null ? (newPo[firstDay] ?? dailyOccurrences) : dailyOccurrences;
          newPo[d] = occTemplate;
          return newPo;
        });
        if (tipo !== 'salute' && mode !== 'timed') setMode('timed');
        return next;
      });
    } else {
      // Removing a day - no confirmation needed
      setMonthDays(prev => {
        const next = prev.filter(x => x !== d);
        setPerMonthTimes(p => { const cp = { ...p } as any; delete cp[d]; return cp; });
        setPerMonthOccurrences(p => { const cp = { ...p } as any; delete cp[d]; return cp; });
        setCustomizedMonthDays(prev => { const s = new Set(prev); s.delete(d); return s; });
        return next;
      });
    }
  }

  function setModeWithConfirmation(newMode: 'allDay' | 'timed') {
    // If switching from timed to allDay, clear all time-related data
    if (mode === 'timed' && newMode === 'allDay') {
      setConfirmationModal({
        visible: true,
        title: 'Conferma cancellazione',
        message: 'Passando a "Tutto il giorno" cancellerai tutti gli orari specifici. Sei sicuro?',
        onConfirm: () => {
          // Clear all time-related data
          setStartMin(8 * 60); // Reset to default 8:00
          setEndMin(null);
          setPerDayTimes({});
          setPerMonthTimes({});
          setMode('allDay');
          setConfirmationModal(prev => ({ ...prev, visible: false }));

          // Auto-save the changes
          if (existing) {
            if (freq === 'daily') {
              // Clear time fields for daily all-day tasks
              setHabits(prev => prev.map(h => {
                if (h.id !== existing.id) return h;
                const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
                schedule.time = null;
                schedule.endTime = null;
                schedule.daysOfWeek = [];
                schedule.monthDays = undefined;
                schedule.yearMonth = undefined;
                schedule.yearDay = undefined;
                return { ...h, timeOverrides: {}, schedule };
              }));
            } else if (freq === 'single') {
              // For single frequency, save as one-off override for selected date without time
              const y = annualYear;
              const m = String(annualMonth).padStart(2, '0');
              const d = String(annualDay).padStart(2, '0');
              const ymd = `${y}-${m}-${d}`;
              setHabits(prev => prev.map(h => {
                if (h.id !== existing.id) return h;
                const next = { ...(h.timeOverrides ?? {}) } as Record<string, string>;
                next[ymd] = '00:00'; // All day marker
                const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
                schedule.daysOfWeek = [];
                schedule.monthDays = undefined;
                schedule.time = null;
                schedule.endTime = null;
                return { ...h, timeOverrides: next, schedule };
              }));
            }
            // Persist handled by HabitsProvider (debounced)
          }
        },
      });
      return;
    }
    setMode(newMode);
  }

  function setFreqWithConfirmation(newFreq: 'single' | 'daily' | 'weekly' | 'monthly' | 'annual') {
    // Check if we need confirmation when switching between different frequency types
    const hasWeeklyDays = daysOfWeek.length > 0;
    const hasMonthlyDays = monthDays.length > 0;
    const hasAnnualDate = annualMonth && annualDay;
    const hasSingleDate = false;

    const currentFreqHasSelection = (freq === 'weekly' && hasWeeklyDays) ||
                                   (freq === 'monthly' && hasMonthlyDays) ||
                                   (freq === 'annual' && hasAnnualDate) ||
                                   (freq === 'single' && hasSingleDate);

    const newFreqNeedsSelection = (newFreq === 'weekly' || newFreq === 'monthly' || newFreq === 'annual' || newFreq === 'single');

    if (currentFreqHasSelection && newFreqNeedsSelection && freq !== newFreq) {
      let message = '';
      if (freq === 'weekly' && hasWeeklyDays) {
        const dayNames = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
        const weeklyDaysText = [...daysOfWeek].sort((a, b) => a - b).map(day => dayNames[day]).join(', ');
        message = `Cambiando a ${newFreq === 'monthly' ? 'mensile' : newFreq === 'annual' ? 'annuale' : 'singola'} cancellerai i giorni ${weeklyDaysText}. Sei sicuro?`;
      } else if (freq === 'monthly' && hasMonthlyDays) {
        const monthlyDaysText = [...monthDays].sort((a, b) => a - b).join(', ');
        message = `Cambiando a ${newFreq === 'weekly' ? 'settimanale' : newFreq === 'annual' ? 'annuale' : 'singola'} cancellerai i giorni ${monthlyDaysText}. Sei sicuro?`;
      } else if (freq === 'annual' && hasAnnualDate) {
        message = `Cambiando a ${newFreq === 'weekly' ? 'settimanale' : newFreq === 'monthly' ? 'mensile' : 'singola'} cancellerai la data annuale. Sei sicuro?`;
      } else if (freq === 'single' && hasSingleDate) {
        message = `Cambiando a ${newFreq === 'weekly' ? 'settimanale' : newFreq === 'monthly' ? 'mensile' : 'annuale'} cancellerai la data specifica. Sei sicuro?`;
      }

      setConfirmationModal({
        visible: true,
        title: 'Conferma cancellazione',
        message: message,
        onConfirm: () => {
          // Clear previous selections
          if (freq === 'weekly') setDaysOfWeek([]);
          if (freq === 'monthly') setMonthDays([]);
          if (freq === 'annual') {
            setAnnualMonth(new Date().getMonth() + 1);
            setAnnualDay(new Date().getDate());
          }

          setFreq(newFreq);
          setConfirmationModal(prev => ({ ...prev, visible: false }));
        },
      });
      return;
    }

    // No confirmation needed, just change frequency
    setFreq(newFreq);
  }

  function close() { router.back(); }

  const executeSave = (skipDuplicateCheck = false) => {
    const healthOption = tipo === 'salute' ? getHealthHabitOption(healthMetric) : null;
    if (tipo === 'salute' && !healthOption) {
      Alert.alert('Seleziona una metrica', 'Scegli prima una metrica Apple Salute da collegare.');
      return;
    }

    const shouldCheckDuplicate =
      !skipDuplicateCheck &&
      mode === 'timed' &&
      (!supportsOptionalTime(tipo) || taskHasTime) &&
      (type === 'new' || type === 'edit' || type === 'schedule');

    if (shouldCheckDuplicate) {
      const baseTitle = type === 'schedule' ? (existing?.text ?? '') : text;
      const trimmedTitle = baseTitle.trim();
      const normalizedRange = clampTimedRange(startMin, endMin);
      const start = minutesToHhmm(normalizedRange.start) as string;
      const end = minutesToHhmm(normalizedRange.end) as string;
      const duplicate = findDuplicateHabitSlot(
        habits,
        trimmedTitle,
        start,
        end,
        type === 'new' ? undefined : existing?.id
      );
      if (duplicate) {
        const interval = end ? `${start}-${end}` : start;
        const fallbackTitle = trimmedTitle.length > 0 ? trimmedTitle : 'Task senza nome';
        const duplicateTitle = duplicate.habit.text?.trim().length
          ? duplicate.habit.text
          : fallbackTitle;
        setConfirmationModal({
          visible: true,
          title: 'Task già esistente',
          message: `Esiste già "${duplicateTitle}" con orario ${interval}. Vuoi crearla comunque?`,
          onConfirm: () => {
            setConfirmationModal((prev) => ({ ...prev, visible: false }));
            executeSave(true);
          },
        });
        return;
      }
    }

    if (type === 'new' || (type === 'edit' && existing)) {
      let t = text.trim();
      const resolvedColor = tipo === 'salute' && healthOption ? healthOption.solidColor : color;
      const resolvedHealth = tipo === 'salute' && healthMetric
        ? {
            metric: healthMetric,
            ...(healthMetric === 'sleep' ? { goalHours: Math.max(1, Math.min(16, Math.round(healthGoalHours))) } : {}),
            ...(healthMetric !== 'sleep'
              ? { goalValue: Math.max(0, healthMetric === 'distance' ? Math.round(healthGoalValue * 10) / 10 : Math.round(healthGoalValue)) }
              : {}),
          }
        : undefined;
      if (tipo === 'viaggio') {
        const rawFrom =
          travelPartenzaTipo === 'attuale'
            ? (currentCityName || 'Qui')
            : (travelPartenzaNome || '').trim();
        const rawTo = (travelDestinazioneNome || '').trim();
        const from = shortenPlaceName(rawFrom);
        const to = shortenPlaceName(rawTo);
        // In Tasks il titolo resta con la freccia → (come prima)
        if (from && to) t = `${from} → ${to}`;
        else if (to) t = to;
      }
      if (tipo === 'salute' && healthOption) {
        t = healthOption.label;
      }
      if (tipo === 'vacanza') {
        const vacationTitle = '';
        const travel = buildVacationTravelMeta();
        const endDate = travel.giornoRitorno ?? travel.giornoPartenza;
        const startAt = `${travel.giornoPartenza}T${travel.orarioPartenza}:00`;
        const endAt = `${endDate}T${travel.orarioArrivoRitorno ?? travel.orarioArrivo}:00`;
        const vacationColor = VACATION_COLOR;
        const notificationForVacation: NotificationConfig = {
          ...notification,
          minutesBefore: null,
          showAsTaskInOggi: false,
        };

        if (new Date(endAt).getTime() <= new Date(startAt).getTime()) {
          Alert.alert('Intervallo non valido', 'La fine della vacanza deve essere dopo l’inizio.');
          return;
        }

        if (notificationForVacation.enabled && (!notificationForVacation.customDate || !notificationForVacation.customTime)) {
          Alert.alert('Notifica incompleta', 'Per una vacanza scegli sia il giorno sia l’orario della notifica.');
          return;
        }

        if (type === 'new') {
          const newHabitId = addHabit(vacationTitle, vacationColor, selectedFolder || undefined, tipo, { habitFreq: 'single' });
          setHabits(prev => prev.map(h => (
            h.id === newHabitId
              ? {
                  ...h,
                  text: vacationTitle,
                  color: vacationColor,
                  folder: selectedFolder || undefined,
                  label: undefined,
                  tipo,
                  notification: notificationForVacation,
                  pauseDuringTravel: undefined,
                  askReview: undefined,
                  travel,
                  schedule: { daysOfWeek: [] },
                  timeOverrides: {},
                  habitFreq: 'single',
                  isAllDay: false,
                }
              : h
          )));
        } else if (existing) {
          setHabits(prev => prev.map(h => (
            h.id === existing.id
              ? {
                  ...h,
                  text: vacationTitle,
                  color: vacationColor,
                  folder: selectedFolder || undefined,
                  label: undefined,
                  tipo,
                  notification: notificationForVacation,
                  pauseDuringTravel: undefined,
                  askReview: undefined,
                  travel,
                  schedule: { daysOfWeek: [] },
                  timeOverrides: {},
                  habitFreq: 'single',
                  isAllDay: false,
                }
              : h
          )));
        }

        close();
        return;
      }
      if (t.length <= 100) {
        const occNForVal = Math.min(30, Math.max(1, Math.floor(dailyOccurrences)));
        if (mode === 'timed' && occNForVal > 1) {
          const gap = Math.max(5, Math.floor(occurrenceGapMinutes));
          if (!occurrenceChainFitsLogicalDay(dayResetTime, startMin, occNForVal, gap)) {
            Alert.alert(
              'Oltre la giornata',
              'Con queste ripetizioni e questo distacco, l’ultima occorrenza andrebbe oltre la fine della giornata logica. Riduci le volte, aumenta il distacco o cambia l’orario di inizio.',
            );
            return;
          }
        }
        /**
         * Allinea al form "Ripetizioni" (solo sotto Orario specifico): se N>1 e mode timed,
         * salva sempre. Non usare taskHasTime/tipo qui — altrimenti la patch può cancellare i campi
         * mentre il form mostra ancora 2+ ripetizioni.
         */
        const patchHabitOccurrences = (habit: Habit): Habit => {
          const next = { ...habit };
          if (mode === 'timed' && occNForVal > 1) {
            next.dailyOccurrences = occNForVal;
            next.occurrenceGapMinutes = Math.max(5, Math.floor(occurrenceGapMinutes));
          } else {
            delete (next as { dailyOccurrences?: number }).dailyOccurrences;
            delete (next as { occurrenceGapMinutes?: number }).occurrenceGapMinutes;
            delete (next as { occurrenceSlotOverrides?: Habit['occurrenceSlotOverrides'] }).occurrenceSlotOverrides;
            delete (next as { occurrenceSlotMenuSource?: Habit['occurrenceSlotMenuSource'] }).occurrenceSlotMenuSource;
          }
          return next;
        };
        // New task "Tutto il giorno" + Singola: create with timeOverrides/schedule in one go so it persists
        const isNewAllDaySingle = type === 'new' && mode === 'allDay' && (!supportsOptionalTime(tipo) || taskHasTime) && freq === 'single';
        const ymdSingle = `${annualYear}-${String(annualMonth).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}`;
        const initialAllDaySingle = isNewAllDaySingle ? {
          timeOverrides: { [ymdSingle]: '00:00' as const },
          schedule: { daysOfWeek: [] as number[], monthDays: undefined, time: null, endTime: null, weeklyTimes: undefined, monthlyTimes: undefined },
          isAllDay: true,
          habitFreq: 'single' as const,
        } : undefined;

        const trimmedLabel = labelInput.trim();
        // Salva/aggiorna la label in storage (fire and forget)
        if (trimmedLabel) {
          const updated = [...savedLabels];
          const idx = updated.findIndex(l => l.text.toLowerCase() === trimmedLabel.toLowerCase());
          if (idx >= 0) {
            updated[idx] = { ...updated[idx], count: updated[idx].count + 1 };
          } else {
            updated.push({ text: trimmedLabel, count: 1 });
          }
          setSavedLabels(updated);
          AsyncStorage.setItem(STORAGE_LABELS, JSON.stringify(updated)).catch(() => {});
        }

        const initialForAdd = isNewAllDaySingle ? { ...initialAllDaySingle, ...(trimmedLabel && { label: trimmedLabel }) } : {
          habitFreq: (supportsOptionalTime(tipo) && !taskHasTime) ? 'single' : freq,
          ...(trimmedLabel && { label: trimmedLabel }),
        };
        const newHabitId = type === 'new' ? addHabit(t, resolvedColor, selectedFolder || undefined, tipo as any, initialForAdd) : existing!.id;
        if (type === 'edit' && existing) {
          // Single update to avoid React batching overwriting tipo
          setHabits(prev => prev.map(h => {
            if (h.id !== existing.id) return h;
            const base: Habit = {
              ...patchHabitOccurrences(h),
              text: t,
              color: resolvedColor,
              folder: selectedFolder || undefined,
              label: trimmedLabel || undefined,
              tipo,
              health: resolvedHealth,
              locationRule: locationRule ?? undefined,
              pauseDuringTravel: !isTravelLikeTipo(tipo) ? pauseDuringTravel : undefined,
            };
            if (tipo === 'viaggio') {
              const storedPartenzaNome =
                travelPartenzaTipo === 'personalizzata'
                  ? travelPartenzaNome.trim() || undefined
                  : currentCityName || h.travel?.partenzaNome;
              const travel: TravelMeta = {
                mezzo: travelMezzo,
                partenzaTipo: travelPartenzaTipo,
                partenzaNome: storedPartenzaNome,
                destinazioneNome: travelDestinazioneNome.trim(),
                giornoPartenza: travelGiornoPartenza,
                giornoRitorno: travelGiornoRitorno,
                orarioPartenza: travelOrarioPartenza,
                orarioArrivo: travelOrarioArrivo,
                arrivoGiornoDopo: travelArrivoGiornoDopo,
                orarioPartenzaRitorno: travelOrarioPartenzaRitorno,
                partenzaRitornoGiornoDopo: travelPartenzaRitornoGiornoDopo,
                orarioArrivoRitorno: travelOrarioArrivoRitorno,
                arrivoRitornoGiornoDopo: travelArrivoRitornoGiornoDopo,
              };
              return { ...base, travel };
            }
            return base;
          }));
        }
        // Se è una task/evento/viaggio temporizzato, aggiungi anche la programmazione
        // (non richiedere taskHasTime: altrimenti le task non salvano orario/ripetizioni finché il flag non è aggiornato)
        if (mode === 'timed') {
          const normalizedRange = clampTimedRange(startMin, endMin);
          const time = minutesToHhmm(normalizedRange.start) as string;
          const endTime = tipo === 'avviso' ? null : (minutesToHhmm(normalizedRange.end) as string);

          if (freq === 'single') {
            // save one-off override for selected date only
            const y = annualYear;
            const m = String(annualMonth).padStart(2, '0');
            const d = String(annualDay).padStart(2, '0');
            const ymd = `${y}-${m}-${d}`;
            updateScheduleFromDate(newHabitId, ymd, time as string, endTime as string | null);
            setHabits(prev => {
              const next = prev.map(h => {
                if (h.id !== newHabitId) return h;
                const overrides: Record<string, string | { start: string; end: string }> = {};
                if (time) overrides[ymd] = endTime ? { start: time, end: endTime } : time;
                const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
                schedule.daysOfWeek = [];
                schedule.monthDays = undefined;
                return { ...patchHabitOccurrences(h), timeOverrides: overrides, schedule };
              });
              return next;
            });
          } else if (freq === 'daily') {
            if (type === 'new') {
              updateScheduleFromDate(newHabitId, getDay(new Date()), time as string, endTime as string | null);
            }
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.daysOfWeek = [];
              schedule.monthDays = undefined;
              schedule.yearMonth = undefined;
              schedule.yearDay = undefined;
              return {
                ...patchHabitOccurrences(h),
                timeOverrides: type === 'new' ? {} : (originalTimeOverrides ?? h.timeOverrides),
                schedule,
              };
            }));
          } else if (freq === 'weekly') {
            if (type === 'new') {
              updateScheduleFromDate(newHabitId, getDay(new Date()), time as string, endTime as string | null);
            }
            // Clear monthly days for weekly tasks
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
              schedule.daysOfWeek = daysOfWeek;
              schedule.monthDays = undefined;
              schedule.yearMonth = undefined;
              schedule.yearDay = undefined;
              // Persist per-day times if multiple days selected
              if (daysOfWeek.length > 1) {
                schedule.weeklyTimes = {};
                for (const d of daysOfWeek) {
                  const per = perDayTimes[d];
                  if (per) {
                    schedule.weeklyTimes[d] = { start: minutesToHhmm(per.startMin), end: per.endMin ? minutesToHhmm(per.endMin) : null };
                  } else {
                    schedule.weeklyTimes[d] = { start: time, end: endTime };
                  }
                }
                schedule.time = null;
                schedule.endTime = null;
                // Persist per-day occurrences and gaps
                schedule.weeklyOccurrences = {};
                schedule.weeklyGaps = {};
                for (const d of daysOfWeek) {
                  schedule.weeklyOccurrences[d] = perDayOccurrences[d] ?? occNForVal;
                  schedule.weeklyGaps[d] = perDayGaps[d] ?? (Math.max(5, Math.floor(occurrenceGapMinutes)));
                }
              } else {
                schedule.weeklyOccurrences = undefined;
                schedule.weeklyGaps = undefined;
              }
              schedule.monthlyOccurrences = undefined;
              return { ...patchHabitOccurrences(h), schedule };
            }));
            if (type === 'new') {
              setHabits(prev => prev.map(h => (h.id === newHabitId ? { ...patchHabitOccurrences(h), timeOverrides: {} } : h)));
            }
            // After creating weekly, check for merge candidates by same text+color
            const created = habits.find(h => h.id === newHabitId) ?? { id: newHabitId, text, color, schedule: { daysOfWeek, time, endTime } } as any;
            const candidates = habits.filter(h => h.id !== newHabitId && h.text.trim().toLowerCase() === created.text.trim().toLowerCase() && (h.color ?? '') === (created.color ?? ''));
            if (candidates.length > 0) {
              showNativeMergeAlert(() => {
                const base = candidates[0];
                // Merge days
                const mergedDays = sortDow(Array.from(new Set([...(base.schedule?.daysOfWeek ?? []), ...daysOfWeek])));
                setHabits(prev => prev.map(h => {
                  if (h.id !== base.id) return h;
                  const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
                  schedule.daysOfWeek = mergedDays;
                  // Initialize weeklyTimes and set for the selected days
                  schedule.weeklyTimes = schedule.weeklyTimes ?? {};
                  for (const d of daysOfWeek) {
                    schedule.weeklyTimes[d] = { start: time, end: endTime };
                  }
                  // Clear generic time to reflect per-day
                  schedule.time = null;
                  schedule.endTime = null;
                  return { ...h, schedule };
                }));
                // Remove the newly created duplicate
                setHabits(prev => prev.filter(h => h.id !== newHabitId));
                close();
              });
              return; // wait user choice
            }
          } else if (freq === 'monthly') {
            if (type === 'new') {
              updateScheduleFromDate(newHabitId, getDay(new Date()), time as string, endTime as string | null);
            }
            // Update monthly days and clear weekly days
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
              schedule.monthDays = sortMonthDays(monthDays);
              schedule.daysOfWeek = []; // Clear weekly days
              schedule.yearMonth = undefined;
              schedule.yearDay = undefined;
              if (monthDays.length > 1) {
                schedule.monthlyTimes = {};
                for (const d of monthDays) {
                  const per = perMonthTimes[d];
                  if (per) {
                    schedule.monthlyTimes[d] = { start: minutesToHhmm(per.startMin), end: per.endMin ? minutesToHhmm(per.endMin) : null };
                  } else {
                    schedule.monthlyTimes[d] = { start: time, end: endTime };
                  }
                }
                schedule.time = null;
                schedule.endTime = null;
                // Persist per-day occurrences and gaps
                schedule.monthlyOccurrences = {};
                schedule.monthlyGaps = {};
                for (const d of monthDays) {
                  schedule.monthlyOccurrences[d] = perMonthOccurrences[d] ?? occNForVal;
                  schedule.monthlyGaps[d] = perMonthGaps[d] ?? (Math.max(5, Math.floor(occurrenceGapMinutes)));
                }
              } else {
                schedule.monthlyOccurrences = undefined;
                schedule.monthlyGaps = undefined;
              }
              schedule.weeklyOccurrences = undefined;
              schedule.weeklyGaps = undefined;
              return { ...patchHabitOccurrences(h), schedule };
            }));
            if (type === 'new') {
              setHabits(prev => prev.map(h => (h.id === newHabitId ? { ...patchHabitOccurrences(h), timeOverrides: {} } : h)));
            }
          } else if (freq === 'annual') {
            if (type === 'new') {
              updateScheduleFromDate(newHabitId, getDay(new Date()), time as string, endTime as string | null);
            }
            // Annual: set yearMonth/yearDay and clear weekly/monthly fields
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
              schedule.yearMonth = annualMonth;
              schedule.yearDay = annualDay;
              schedule.daysOfWeek = [];
              schedule.monthDays = undefined;
              return { ...patchHabitOccurrences(h), schedule };
            }));
            if (type === 'new') {
              setHabits(prev => prev.map(h => (h.id === newHabitId ? { ...patchHabitOccurrences(h), timeOverrides: {} } : h)));
            }
          }
        }
        // Se è "Tutto il giorno", salva solo la frequenza senza orari (new+single già gestito con initial in addHabit)
        if (mode === 'allDay' && (!supportsOptionalTime(tipo) || taskHasTime)) {
          if (freq === 'single' && !isNewAllDaySingle) {
            // Edit only: new single all-day uses initial in addHabit above
            const y = annualYear;
            const m = String(annualMonth).padStart(2, '0');
            const d = String(annualDay).padStart(2, '0');
            const ymd = `${y}-${m}-${d}`;
            setHabits(prev => {
              const next = prev.map(h => {
                if (h.id !== newHabitId) return h;
                const overrides: Record<string, string> = { [ymd]: '00:00' }; // All day marker
                const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
                schedule.daysOfWeek = [];
                schedule.monthDays = undefined;
                schedule.time = null;
                schedule.endTime = null;
                schedule.weeklyTimes = undefined;
                schedule.monthlyTimes = undefined;
                return { ...patchHabitOccurrences(h), timeOverrides: overrides, schedule };
              });
              return next;
            });
          } else if (freq === 'daily') {
            // Clear time fields for daily all-day tasks
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.time = null;
              schedule.endTime = null;
              schedule.daysOfWeek = [];
              schedule.monthDays = undefined;
              schedule.yearMonth = undefined;
              schedule.yearDay = undefined;
              schedule.weeklyTimes = undefined;
              schedule.monthlyTimes = undefined;
              return {
                ...patchHabitOccurrences(h),
                timeOverrides: type === 'new' ? {} : (originalTimeOverrides ?? h.timeOverrides),
                schedule,
              };
            }));
          } else if (freq === 'weekly') {
            // Clear time fields for weekly all-day tasks
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.daysOfWeek = daysOfWeek;
              schedule.time = null;
              schedule.endTime = null;
              schedule.weeklyTimes = undefined;
              schedule.monthlyTimes = undefined;
              return { ...patchHabitOccurrences(h), schedule };
            }));
          } else if (freq === 'monthly') {
            // Clear time fields for monthly all-day tasks
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.monthDays = sortMonthDays(monthDays);
              schedule.daysOfWeek = [];
              schedule.time = null;
              schedule.endTime = null;
              schedule.weeklyTimes = undefined;
              schedule.monthlyTimes = undefined;
              return { ...patchHabitOccurrences(h), schedule };
            }));
          } else if (freq === 'annual') {
            // Clear time fields for annual all-day tasks
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.yearMonth = annualMonth;
              schedule.yearDay = annualDay;
              schedule.daysOfWeek = [];
              schedule.monthDays = undefined;
              schedule.time = null;
              schedule.endTime = null;
              schedule.weeklyTimes = undefined;
              schedule.monthlyTimes = undefined;
              return { ...patchHabitOccurrences(h), schedule };
          }));
        }
        }
        // New single task without time: ensure the selected date is saved as timeOverride so it appears in Oggi.
        if (type === 'new' && freq === 'single' && (mode === 'allDay' || !taskHasTime) && !isNewAllDaySingle) {
          const ymdFromForm = `${annualYear}-${String(annualMonth).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}`;
          setHabits(prev => {
            const next = prev.map(h => {
              if (h.id !== newHabitId) return h;
              const overrides = { ...(h.timeOverrides ?? {}), [ymdFromForm]: '00:00' };
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.daysOfWeek = schedule.daysOfWeek ?? [];
              schedule.monthDays = undefined;
              schedule.yearMonth = undefined;
              schedule.yearDay = undefined;
              schedule.time = null;
              schedule.endTime = null;
              return { ...patchHabitOccurrences(h), timeOverrides: overrides, schedule };
            });
            return next;
          });
        }
        // Edit task/habit without time: clear only the schedule fields, keep date overrides intact.
        if (type === 'edit' && supportsOptionalTime(tipo) && !taskHasTime) {
          setHabits(prev => prev.map(h => {
            if (h.id !== newHabitId) return h;
            const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
            schedule.daysOfWeek = [];
            schedule.monthDays = undefined;
            schedule.yearMonth = undefined;
            schedule.yearDay = undefined;
            schedule.time = null;
            schedule.endTime = null;
            schedule.weeklyTimes = undefined;
            schedule.monthlyTimes = undefined;
            return {
              ...patchHabitOccurrences(h),
              schedule,
            };
          }));
        }
        // Compute repeatEndDate from repeatEndType (data inizio = annualYear/annualMonth/annualDay)
      const computedRepeatEndDateNew = (() => {
          if (repeatEndType === 'mai') return null;
          if (repeatEndType === 'durata') {
            const d = new Date(annualYear, annualMonth - 1, annualDay);
            if (freq === 'daily') d.setDate(d.getDate() + repeatEndCount);
            else if (freq === 'weekly') d.setDate(d.getDate() + repeatEndCount * 7);
            else if (freq === 'monthly') d.setMonth(d.getMonth() + repeatEndCount);
            else d.setFullYear(d.getFullYear() + repeatEndCount);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          }
          return repeatEndCustomDate ?? null;
        })();
        // Persist explicit flags so the modal restores them correctly on re-open
      const repeatStartYmd = freq !== 'single' ? recurringStartYmd : null;
      const smartTaskTargetYmd = (() => {
        if (freq === 'single') {
          return `${annualYear}-${String(annualMonth).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}`;
        }
        return repeatStartYmd ?? todayYmdForInit;
      })();
      const resolvedSmartTask =
        !isTravelLikeTipo(tipo) && supportsOptionalTime(tipo)
          ? (smartTaskEnabled || existing?.smartTask
              ? inferSmartTaskSeed({
                  habitFreq: ((supportsOptionalTime(tipo) && !taskHasTime) ? 'single' : freq),
                  targetYmd: smartTaskTargetYmd,
                  todayYmd: todayYmdForInit,
                  existing: existing?.smartTask,
                })
              : null)
          : null;
      setHabits(prev => prev.map(h => {
        if (h.id !== newHabitId) return h;
        const base: Habit = {
            ...patchHabitOccurrences(h),
            text: t,
            color: resolvedColor,
            folder: selectedFolder || undefined,
            label: trimmedLabel || undefined,
            isAllDay: mode === 'allDay',
            habitFreq: (supportsOptionalTime(tipo) && !taskHasTime) ? 'single' : freq,
            tipo,
            health: resolvedHealth,
            locationRule: locationRule ?? undefined,
            pauseDuringTravel: !isTravelLikeTipo(tipo) ? pauseDuringTravel : undefined,
            notification,
            askReview: !isTravelLikeTipo(tipo) && tipo !== 'avviso' ? askReview : undefined,
            smartTask: resolvedSmartTask
              ? {
                  enabled: smartTaskEnabled,
                  intervalDays: resolvedSmartTask.intervalDays,
                  nextDueDate: resolvedSmartTask.nextDueDate,
                }
              : undefined,
            schedule: {
              ...(h.schedule ?? { daysOfWeek: [] }),
              repeatEndDate: computedRepeatEndDateNew,
              repeatStartDate: repeatStartYmd,
            },
          };
          if (tipo === 'viaggio') {
            const storedPartenzaNome =
              travelPartenzaTipo === 'personalizzata'
                ? travelPartenzaNome.trim() || undefined
                : currentCityName || h.travel?.partenzaNome;
            const travel: TravelMeta = {
              mezzo: travelMezzo,
              partenzaTipo: travelPartenzaTipo,
              partenzaNome: storedPartenzaNome,
              destinazioneNome: travelDestinazioneNome.trim(),
              giornoPartenza: travelGiornoPartenza,
              giornoRitorno: travelGiornoRitorno,
              orarioPartenza: travelOrarioPartenza,
              orarioArrivo: travelOrarioArrivo,
              arrivoGiornoDopo: travelArrivoGiornoDopo,
              orarioPartenzaRitorno: travelOrarioPartenzaRitorno,
              partenzaRitornoGiornoDopo: travelPartenzaRitornoGiornoDopo,
              orarioArrivoRitorno: travelOrarioArrivoRitorno,
              arrivoRitornoGiornoDopo: travelArrivoRitornoGiornoDopo,
            };
            return { ...base, travel };
          }
          return base;
        }));
        if (type === 'edit' && existing) {
          const newEffectiveDaily = mode === 'timed' && occNForVal > 1 ? occNForVal : 1;
          if (newEffectiveDaily !== getDailyOccurrenceTotal(existing)) {
            migrateTodayCompletionForDailyCountChange(existing.id, existing, newEffectiveDaily);
          }
        }
      }
    } else if (type === 'rename' && existing) {
      const t = text.trim();
      if (t.length > 0 && t.length <= 100) updateHabit(existing.id, t);
    } else if (type === 'color' && existing) {
      updateHabitColor(existing.id, color);
    } else if (type === 'schedule' && existing) {
      const occNForVal = Math.min(30, Math.max(1, Math.floor(dailyOccurrences)));
      const normalizedRange = mode === 'timed' ? clampTimedRange(startMin, endMin) : null;
      const time = mode === 'timed' ? minutesToHhmm(normalizedRange!.start) as string : null;
      const endTime = mode === 'timed' ? minutesToHhmm(normalizedRange!.end) as string : null;
      const shouldPersistEditedFirstOccurrence =
        !!ymd &&
        mode === 'timed' &&
        occNForVal > 1 &&
        !!time &&
        !!endTime;

      if (shouldPersistEditedFirstOccurrence) {
        setHabits(prev => prev.map(h => {
          if (h.id !== existing!.id) return h;
          const daySlots = { ...(h.occurrenceSlotOverrides?.[todayYmdForInit] ?? {}) };
          daySlots[0] = { start: time!, end: endTime! };
          return {
            ...h,
            occurrenceSlotOverrides: {
              ...(h.occurrenceSlotOverrides ?? {}),
              [todayYmdForInit]: daySlots,
            },
          };
        }));
      }

      if (freq === 'single') {
        // For single frequency, save as one-off override for selected date only (remove today if moved)
        const y = annualYear;
        const m = String(annualMonth).padStart(2, '0');
        const d = String(annualDay).padStart(2, '0');
        const ymd = `${y}-${m}-${d}`;
        updateScheduleFromDate(existing.id, ymd, time, endTime);
        setHabits(prev => {
          const next = prev.map(h => {
            if (h.id !== existing.id) return h;
            const overrides: Record<string, string | { start: string; end: string }> = {};
            if (time) overrides[ymd] = endTime ? { start: time, end: endTime } : time;
            const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
            schedule.daysOfWeek = [];
            schedule.monthDays = undefined;
            return { ...h, timeOverrides: overrides, schedule };
          });
          return next;
        });
      } else if (freq === 'daily') {
        setHabits(prev => prev.map(h => {
          if (h.id !== existing.id) return h;
          const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
          schedule.daysOfWeek = [];
          schedule.monthDays = undefined;
          schedule.yearMonth = undefined;
          schedule.yearDay = undefined;
          return { ...h, schedule };
        }));
      } else if (freq === 'weekly') {
        updateSchedule(existing.id, daysOfWeek, time);
        // Clear monthly days for weekly tasks
        setHabits(prev => prev.map(h => {
          if (h.id !== existing.id) return h;
          const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
          schedule.monthDays = undefined;
          schedule.yearMonth = undefined;
          schedule.yearDay = undefined;
          if (daysOfWeek.length > 1) {
            schedule.weeklyTimes = {};
            for (const d of daysOfWeek) {
              const per = perDayTimes[d];
              if (per) {
                schedule.weeklyTimes[d] = { start: minutesToHhmm(per.startMin), end: per.endMin ? minutesToHhmm(per.endMin) : null };
              } else {
                schedule.weeklyTimes[d] = { start: time, end: endTime };
              }
            }
            schedule.time = null;
            schedule.endTime = null;
            const occN = Math.min(30, Math.max(1, Math.floor(dailyOccurrences)));
            schedule.weeklyOccurrences = {};
            for (const d of daysOfWeek) {
              schedule.weeklyOccurrences[d] = perDayOccurrences[d] ?? occN;
            }
          } else {
            schedule.weeklyOccurrences = undefined;
          }
          schedule.monthlyOccurrences = undefined;
          return { ...h, schedule };
        }));
        const sameNumberArray = (left: number[], right: number[]) => {
          if (left.length !== right.length) return false;
          return [...left].sort((a, b) => a - b).every((value, index) => value === [...right].sort((a, b) => a - b)[index]);
        };
        const scheduleChanged =
          mode !== (existing.schedule?.time || existing.schedule?.endTime || existing.schedule?.weeklyTimes || existing.schedule?.monthlyTimes ? 'timed' : 'allDay') ||
          !sameNumberArray(daysOfWeek, existing.schedule?.daysOfWeek ?? []) ||
          !sameNumberArray(monthDays, existing.schedule?.monthDays ?? []) ||
          (freq === 'annual' && (existing.schedule?.yearMonth !== annualMonth || existing.schedule?.yearDay !== annualDay)) ||
          Math.max(1, Math.floor(existing.dailyOccurrences ?? 1)) !== Math.min(30, Math.max(1, Math.floor(dailyOccurrences))) ||
          Math.max(5, Math.floor(existing.occurrenceGapMinutes ?? 360)) !== Math.max(5, Math.floor(occurrenceGapMinutes));

        // Prompt to merge only when the schedule itself changed and the final title/color
        // would collide with another habit.
        const candidates = scheduleChanged
          ? habits.filter(h => h.id !== existing.id && h.text.trim().toLowerCase() === text.trim().toLowerCase() && (h.color ?? '') === (color ?? ''))
          : [];
        if (candidates.length > 0) {
          showNativeMergeAlert(() => {
            const base = candidates[0];
            const mergedDays = sortDow(Array.from(new Set([...(base.schedule?.daysOfWeek ?? []), ...daysOfWeek])));
            setHabits(prev => prev.map(h => {
              if (h.id !== base.id) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.daysOfWeek = mergedDays;
              schedule.weeklyTimes = schedule.weeklyTimes ?? {};
              for (const d of daysOfWeek) {
                schedule.weeklyTimes[d] = { start: time, end: endTime };
              }
              schedule.time = null;
              schedule.endTime = null;
              return { ...h, schedule };
            }));
            // Remove current if it's effectively duplicate and merging into base
            setHabits(prev => prev.filter(h => h.id !== existing.id));
            close();
          });
          return; // wait user choice
        }
      } else if (freq === 'monthly') {
        // Update monthly days and clear weekly days
        setHabits(prev => prev.map(h => {
          if (h.id !== existing.id) return h;
          const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
          schedule.monthDays = sortMonthDays(monthDays);
          schedule.daysOfWeek = []; // Clear weekly days
          schedule.yearMonth = undefined;
          schedule.yearDay = undefined;
          if (monthDays.length > 1) {
            schedule.monthlyTimes = {};
            for (const d of monthDays) {
              const per = perMonthTimes[d];
              if (per) {
                schedule.monthlyTimes[d] = { start: minutesToHhmm(per.startMin), end: per.endMin ? minutesToHhmm(per.endMin) : null };
              } else {
                schedule.monthlyTimes[d] = { start: time, end: endTime };
              }
            }
            schedule.time = null;
            schedule.endTime = null;
            const occN = Math.min(30, Math.max(1, Math.floor(dailyOccurrences)));
            schedule.monthlyOccurrences = {};
            for (const d of monthDays) {
              schedule.monthlyOccurrences[d] = perMonthOccurrences[d] ?? occN;
            }
          } else {
            schedule.monthlyOccurrences = undefined;
          }
          schedule.weeklyOccurrences = undefined;
          return { ...h, schedule };
        }));
      } else if (freq === 'annual') {
        // Annual: set yearMonth/yearDay and clear weekly/monthly
        setHabits(prev => prev.map(h => {
          if (h.id !== existing.id) return h;
          const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
          schedule.yearMonth = annualMonth;
          schedule.yearDay = annualDay;
          schedule.daysOfWeek = [];
          schedule.monthDays = undefined;
          return { ...h, schedule };
        }));
      }
      // Se è "Tutto il giorno", salva solo la frequenza senza orari
      if (mode === 'allDay' && (!supportsOptionalTime(tipo) || taskHasTime)) {
        if (freq === 'single') {
          // For single frequency, save as one-off override for selected date only (remove today if moved)
          const y = annualYear;
          const m = String(annualMonth).padStart(2, '0');
          const d = String(annualDay).padStart(2, '0');
          const ymd = `${y}-${m}-${d}`;
          setHabits(prev => {
            const next = prev.map(h => {
              if (h.id !== existing.id) return h;
              const overrides: Record<string, string> = { [ymd]: '00:00' }; // All day marker, only this date
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.daysOfWeek = [];
              schedule.monthDays = undefined;
              schedule.time = null;
              schedule.endTime = null;
              schedule.weeklyTimes = undefined;
              schedule.monthlyTimes = undefined;
              return { ...h, timeOverrides: overrides, schedule };
            });
            return next;
          });
        } else if (freq === 'daily') {
          // Clear time fields for daily all-day tasks
          setHabits(prev => prev.map(h => {
            if (h.id !== existing.id) return h;
            const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
            schedule.time = null;
            schedule.endTime = null;
            schedule.daysOfWeek = [];
            schedule.monthDays = undefined;
            schedule.yearMonth = undefined;
            schedule.yearDay = undefined;
            schedule.weeklyTimes = undefined;
            schedule.monthlyTimes = undefined;
            return { ...h, schedule };
          }));
        } else if (freq === 'weekly') {
          // Clear time fields for weekly all-day tasks
          setHabits(prev => prev.map(h => {
            if (h.id !== existing.id) return h;
            const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
            schedule.daysOfWeek = daysOfWeek;
            schedule.time = null;
            schedule.endTime = null;
            schedule.weeklyTimes = undefined;
            schedule.monthlyTimes = undefined;
            return { ...h, schedule };
          }));
        } else if (freq === 'monthly') {
          // Clear time fields for monthly all-day tasks
          setHabits(prev => prev.map(h => {
            if (h.id !== existing.id) return h;
            const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
            schedule.monthDays = sortMonthDays(monthDays);
            schedule.daysOfWeek = [];
            schedule.time = null;
            schedule.endTime = null;
            schedule.weeklyTimes = undefined;
            schedule.monthlyTimes = undefined;
            return { ...h, schedule };
          }));
        } else if (freq === 'annual') {
          // Clear time fields for annual all-day tasks
          setHabits(prev => prev.map(h => {
            if (h.id !== existing.id) return h;
            const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
            schedule.yearMonth = annualMonth;
            schedule.yearDay = annualDay;
            schedule.daysOfWeek = [];
            schedule.monthDays = undefined;
            schedule.time = null;
            schedule.endTime = null;
            schedule.weeklyTimes = undefined;
            schedule.monthlyTimes = undefined;
            return { ...h, schedule };
          }));
        }
      }
      // Compute repeatEndDate from repeatEndType (data inizio = annualYear/annualMonth/annualDay)
      const computedRepeatEndDate = (() => {
        if (repeatEndType === 'mai') return null;
        if (repeatEndType === 'durata') {
          const d = new Date(annualYear, annualMonth - 1, annualDay);
          if (freq === 'daily') d.setDate(d.getDate() + repeatEndCount);
          else if (freq === 'weekly') d.setDate(d.getDate() + repeatEndCount * 7);
          else if (freq === 'monthly') d.setMonth(d.getMonth() + repeatEndCount);
          else d.setFullYear(d.getFullYear() + repeatEndCount);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
        return repeatEndCustomDate ?? null;
      })();
      const repeatStartYmd = freq !== 'single' ? recurringStartYmd : null;
      const smartTaskTargetYmd = (() => {
        if (freq === 'single') {
          return `${annualYear}-${String(annualMonth).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}`;
        }
        return repeatStartYmd ?? todayYmdForInit;
      })();
      const existingTipo = existing.tipo ?? tipo;
      const preservedSmartTask =
        !isTravelLikeTipo(existingTipo) && supportsOptionalTime(existingTipo)
          ? ((smartTaskEnabled || existing.smartTask)
              ? inferSmartTaskSeed({
                  habitFreq: ((supportsOptionalTime(tipo) && !taskHasTime) ? 'single' : freq),
                  targetYmd: smartTaskTargetYmd,
                  todayYmd: todayYmdForInit,
                  existing: existing.smartTask,
                })
              : null)
          : null;
      const finalHabitFreq = (supportsOptionalTime(tipo) && !taskHasTime) ? 'single' : freq;
      const nextTimeOverrides = (() => {
        if (type !== 'edit' || !supportsOptionalTime(existingTipo)) return h.timeOverrides;
        // Preserve the original date-specific overrides when editing existing habits.
        return originalTimeOverrides ?? h.timeOverrides;
      })();
      // Persist explicit flags so the modal restores them correctly on re-open (preserve tipo)
      setHabits(prev => prev.map(h => h.id === existing.id ? {
        ...h,
        isAllDay: mode === 'allDay',
        habitFreq: finalHabitFreq,
        tipo: existingTipo,
        locationRule: locationRule ?? undefined,
        notification,
        askReview: !isTravelLikeTipo(existingTipo) && existingTipo !== 'avviso' ? askReview : undefined,
        timeOverrides: nextTimeOverrides,
        smartTask: preservedSmartTask
          ? {
              enabled: smartTaskEnabled,
              intervalDays: preservedSmartTask.intervalDays,
              nextDueDate: preservedSmartTask.nextDueDate,
            }
          : undefined,
        schedule: {
          ...(h.schedule ?? { daysOfWeek: [] }),
          repeatEndDate: computedRepeatEndDate,
          repeatStartDate: repeatStartYmd,
        },
      } : h));
    }
    close();
  };

  function save() {
    executeSave();
  }

  function closeConfirmationModal() {
    setConfirmationModal(prev => ({ ...prev, visible: false }));
  }

  return {
    // State
    text,
    setText,
    color,
    setColor,
    selectedFolder,
    setSelectedFolder,
    availableFolders,
    tipo,
    setTipo,
    healthMetric,
    setHealthMetric: setHealthMetricWithDefaults,
    healthGoalHours,
    setHealthGoalHours,
    healthGoalValue,
    setHealthGoalValue,
    taskHasTime,
    setTaskHasTime,
    confirmationModal,
    setConfirmationModal,
    mode,
    freq,
    daysOfWeek,
    monthDays,
    perMonthTimes,
    selectedMonthDay,
    setSelectedMonthDay,
    annualMonth,
    setAnnualMonth,
    annualDay,
    setAnnualDay,
    setAnnualDayClamped,
    setAnnualMonthClamped,
    setAnnualYearClamped,
    annualYear,
    setAnnualYear,
    isToday,
    startMin,
    endMin,
    perDayTimes,
    selectedDow,
    setSelectedDow,
    currentStartMin,
    currentEndMin,
    updateCurrentTimeRange,
    locationRule,
    pauseDuringTravel,
    notification,
    repeatEndType,
    setRepeatEndType,
    repeatEndCount,
    setRepeatEndCount,
    repeatEndCustomDate,
    setRepeatEndCustomDate,
    // Derived
    existing,
    weekCustomTimeOverride,
    usePerDayTimeWeekly,
    usePerDayTimeMonthly,
    // Handlers
    toggleDow,
    toggleMonthDay,
    setModeWithConfirmation,
    setFreqWithConfirmation,
    updateCurrentStartMin,
    updateCurrentEndMin,
    executeSave,
    save,
    close,
    closeConfirmationModal,
    setLocationRule,
    setPauseDuringTravel,
    setNotification,
    // Viaggio
    travelMezzo,
    setTravelMezzo,
    travelPartenzaTipo,
    setTravelPartenzaTipo,
    travelPartenzaNome,
    setTravelPartenzaNome,
    travelDestinazioneNome,
    setTravelDestinazioneNome,
    travelGiornoPartenza,
    setTravelGiornoPartenza,
    travelGiornoRitorno,
    setTravelGiornoRitorno,
    travelOrarioPartenza,
    setTravelOrarioPartenza,
    travelOrarioArrivo,
    setTravelOrarioArrivo,
    travelArrivoGiornoDopo,
    setTravelArrivoGiornoDopo,
    travelOrarioPartenzaRitorno,
    setTravelOrarioPartenzaRitorno,
    travelPartenzaRitornoGiornoDopo,
    setTravelPartenzaRitornoGiornoDopo,
    travelOrarioArrivoRitorno,
    setTravelOrarioArrivoRitorno,
    travelArrivoRitornoGiornoDopo,
    setTravelArrivoRitornoGiornoDopo,
    currentCityName,
    askReview,
    setAskReview,
    smartTaskEnabled,
    setSmartTaskEnabled,
    labelInput,
    setLabelInput,
    labelSuggestions,
    topLabels,
    dailyOccurrences,
    setDailyOccurrences,
    currentDailyOccurrences,
    updateCurrentDailyOccurrences,
    occurrenceGapMinutes,
    currentGapMinutes,
    slotGapInfo,
    occurrencePreviewSlots,
    setOccurrenceGapMinutes,
    updateCurrentGapMinutes,
  };
}
