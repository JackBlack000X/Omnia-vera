import { useHabits } from '@/lib/habits/Provider';
import { Habit, NotificationConfig, TravelMeta } from '@/lib/habits/schema';
import { minutesToHhmm, hhmmToMinutes, findDuplicateHabitSlot } from '@/lib/modal/helpers';
import { getFallbackCity } from '@/lib/weather';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';

export function useModalLogic(params: { type: string; id?: string; folder?: string; scrollRef: React.RefObject<ScrollView | null> }) {
  const { type, id, folder, scrollRef } = params;
  const { habits, addHabit, updateHabit, updateHabitColor, updateHabitFolder, updateSchedule, updateScheduleTime, updateScheduleFromDate, setHabits, getDay } = useHabits();
  const router = useRouter();
  const existing = useMemo(() => habits.find(h => h.id === id), [habits, id]);

  const [text, setText] = useState(existing?.text ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? '#4A148C');
  const validFolder = (folder && folder !== '__oggi__' && folder !== '__tutte__') ? folder : null;
  const [selectedFolder, setSelectedFolder] = useState<string | null>(existing?.folder ?? validFolder ?? null);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [tipo, setTipo] = useState<'task' | 'abitudine' | 'evento' | 'viaggio'>(existing?.tipo ?? 'task');
  useEffect(() => {
    if (existing?.tipo) setTipo(existing.tipo);
  }, [existing?.tipo]);

  const inferredExistingTipo: 'task' | 'abitudine' | 'evento' | 'viaggio' = (existing?.tipo ?? 'task');
  const todayForInit = useMemo(() => new Date(), []);
  const todayYmdForInit = useMemo(() => getDay(todayForInit), [getDay, todayForInit]);
  const todayWeekdayForInit = useMemo(() => todayForInit.getDay(), [todayForInit]);
  const todayDayOfMonthForInit = useMemo(() => todayForInit.getDate(), [todayForInit]);

  const effectiveTimeForToday = useMemo(() => {
    if (!existing) return { isAllDayMarker: false, start: null as string | null, end: null as string | null };
    const override = existing.timeOverrides?.[todayYmdForInit];
    const isAllDayMarker = override === '00:00';
    const overrideStart = !isAllDayMarker && typeof override === 'string'
      ? override
      : (!isAllDayMarker && override && typeof override === 'object' && 'start' in override ? (override as any).start : null);
    const overrideEnd = !isAllDayMarker && override && typeof override === 'object' && 'end' in override
      ? (override as any).end
      : null;

    const weekly = existing.schedule?.weeklyTimes?.[todayWeekdayForInit] ?? null;
    const monthlyT = existing.schedule?.monthlyTimes?.[todayDayOfMonthForInit] ?? null;
    const start = overrideStart ?? (weekly?.start ?? monthlyT?.start ?? (existing.schedule?.time ?? null));
    const end = overrideEnd ?? (weekly?.end ?? monthlyT?.end ?? (existing.schedule?.endTime ?? null));
    return { isAllDayMarker, start, end };
  }, [existing, todayYmdForInit, todayWeekdayForInit, todayDayOfMonthForInit]);

  // For tasks only: whether to show the schedule/time block.
  // New from Oggi = true. Existing: true if task has any schedule/override (including all-day '00:00') so edit shows Frequenza/Giorno/Orario.
  const [taskHasTime, setTaskHasTime] = useState<boolean>(() => {
    if (!existing) return type === 'new' && folder === '__oggi__';
    if (inferredExistingTipo !== 'task') return false;
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
  const [askReview, setAskReview] = useState<boolean>(existing?.askReview ?? false);

  const [notification, setNotification] = useState<NotificationConfig>(
    existing?.notification ?? { enabled: false, minutesBefore: 5, customTime: null, customDate: null }
  );

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
  const [travelGiornoPartenza, setTravelGiornoPartenza] = useState<string>(existing?.travel?.giornoPartenza ?? todayYmdForInit);
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
              .filter((n): n is string => typeof n === 'string');
            setAvailableFolders(names);
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
  const initialStart = (!effectiveTimeForToday.isAllDayMarker ? effectiveTimeForToday.start : null) ?? existing?.schedule?.time ?? null;
  const initialEnd = (!effectiveTimeForToday.isAllDayMarker ? effectiveTimeForToday.end : null) ?? existing?.schedule?.endTime ?? null;
  // Compute initial mode: if any recurring selection (weekly/monthly/annual) or any time is configured, default to 'timed'.
  const scheduleObj = existing?.schedule;
  const hasRecurringSelection = (initialDays.length > 0)
    || ((scheduleObj?.monthDays?.length ?? 0) > 0)
    || (!!scheduleObj?.yearMonth && !!scheduleObj?.yearDay);
  const hasAnyTimeConfigured = !!initialStart || !!initialEnd || !!scheduleObj?.weeklyTimes || !!scheduleObj?.monthlyTimes;
  // Use explicit isAllDay flag if present, otherwise fall back to inferring from absence of time config
  const hasTimeOverrides = existing?.timeOverrides && Object.keys(existing.timeOverrides).length > 0;
  const hasSpecificTimeOverrides = hasTimeOverrides && Object.values(existing?.timeOverrides ?? {}).some(time => time !== '00:00');
  const isAllDay = existing?.isAllDay !== undefined
    ? existing.isAllDay
    : (!hasAnyTimeConfigured && !scheduleObj?.weeklyTimes && !scheduleObj?.monthlyTimes && !hasSpecificTimeOverrides);
  const initialMode: 'allDay' | 'timed' = isAllDay ? 'allDay' : 'timed';
  const [mode, setMode] = useState<'allDay' | 'timed'>(initialMode);
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
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(initialDays);
  const [monthDays, setMonthDays] = useState<number[]>(existing?.schedule?.monthDays ?? []);
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
  const [selectedMonthDay, setSelectedMonthDay] = useState<number | null>(monthDays[0] ?? null);
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
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }, [existing?.timeOverrides, existing?.schedule?.repeatStartDate]);
  const [annualMonth, setAnnualMonth] = useState<number>(() =>
    existing?.schedule?.yearMonth ?? initialSingleDate.month);
  const [annualDay, setAnnualDay] = useState<number>(() =>
    existing?.schedule?.yearDay ?? initialSingleDate.day);
  const [annualYear, setAnnualYear] = useState<number>(() =>
    (existing?.schedule?.yearMonth && existing?.schedule?.yearDay) ? new Date().getFullYear() : initialSingleDate.year);

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
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();

    if (freq === 'annual') {
      return annualDay === currentDay && annualMonth === currentMonth;
    } else if (freq === 'single') {
      return annualDay === currentDay && annualMonth === currentMonth && annualYear === currentYear;
    }
    return false;
  }, [freq, annualDay, annualMonth, annualYear]);

  const [startMin, setStartMin] = useState<number>(hhmmToMinutes(initialStart ?? '08:00') ?? 8 * 60);
  const [endMin, setEndMin] = useState<number | null>(hhmmToMinutes(initialEnd) ?? null);
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
    const mondayFirst = [1, 2, 3, 4, 5, 6, 0];
    const pick = mondayFirst.find(d => initialDays.includes(d));
    return pick !== undefined ? pick : (initialDays[0] ?? null);
  });

  // Validate that start time doesn't exceed end time
  useEffect(() => {
    if (endMin && startMin >= endMin) {
      setEndMin(startMin + 60); // Set end time to 1 hour after start
    }
  }, [startMin, endMin]);

  // Helpers to know if we're editing per-day times (weekly, timed, multiple days)
  const usePerDayTimeWeekly = mode === 'timed' && freq === 'weekly' && daysOfWeek.length > 1 && selectedDow !== null;
  const usePerDayTimeMonthly = mode === 'timed' && freq === 'monthly' && monthDays.length > 1 && selectedMonthDay !== null;
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

  const updateCurrentStartMin = (next: number) => {
    if (usePerDayTimeWeekly && selectedDow !== null) {
      setPerDayTimes(prev => ({
        ...prev,
        [selectedDow]: { startMin: next, endMin: (prev[selectedDow]?.endMin ?? null) }
      }));
    } else if (usePerDayTimeMonthly && selectedMonthDay !== null) {
      setPerMonthTimes(prev => ({
        ...prev,
        [selectedMonthDay]: { startMin: next, endMin: (prev[selectedMonthDay]?.endMin ?? null) }
      }));
    } else {
      setStartMin(next);
    }
  };
  const updateCurrentEndMin = (next: number | null) => {
    if (usePerDayTimeWeekly && selectedDow !== null) {
      setPerDayTimes(prev => ({
        ...prev,
        [selectedDow]: { startMin: (prev[selectedDow]?.startMin ?? startMin), endMin: next }
      }));
    } else if (usePerDayTimeMonthly && selectedMonthDay !== null) {
      setPerMonthTimes(prev => ({
        ...prev,
        [selectedMonthDay]: { startMin: (prev[selectedMonthDay]?.startMin ?? startMin), endMin: next }
      }));
    } else {
      setEndMin(next);
    }
  };

  // When editing an existing task, keep Task → Orario aligned with persisted data.
  // Important: include single-date overrides (including all-day marker '00:00'),
  // otherwise tasks created from Oggi appear as "Nessun orario" in edit.
  useEffect(() => {
    if (!existing) return;
    const exTipo: 'task' | 'abitudine' | 'evento' | 'viaggio' = (existing.tipo ?? 'task');
    if (exTipo !== 'task') return;

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
    if (!effectiveTimeForToday.isAllDayMarker && (effectiveTimeForToday.start || effectiveTimeForToday.end)) {
      setTaskHasTime(true);
      setMode('timed');
      if (effectiveTimeForToday.start) {
        const s = hhmmToMinutes(effectiveTimeForToday.start);
        if (s != null) setStartMin(s);
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
  }, [existing?.id, effectiveTimeForToday]);


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
            setDaysOfWeek(prev => [...prev, d].sort());
            setMonthDays([]);
            setConfirmationModal(prev => ({ ...prev, visible: false }));
          },
        });
        return;
      }
      setDaysOfWeek(prev => {
        const next = [...prev, d].sort();
        // initialize per-day times if in timed mode
        if (mode === 'timed') {
          setPerDayTimes(p => ({ ...p, [d]: { startMin, endMin } }));
          if (next.length > 1) setSelectedDow(d);
        }
        // ensure UI shows 'timed' when user selects weekly days
        if (mode !== 'timed') setMode('timed');
        return next;
      });
    } else {
      // Removing a day - no confirmation needed
      setDaysOfWeek(prev => {
        const next = prev.filter(x => x !== d);
        setPerDayTimes(p => {
          const cp = { ...p } as any;
          delete cp[d];
          return cp;
        });
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
            setMonthDays(prev => [...prev, d].sort());
            setDaysOfWeek([]);
            setConfirmationModal(prev => ({ ...prev, visible: false }));
          },
        });
        return;
      }
      setMonthDays(prev => {
        const next = [...prev, d].sort();
        if (mode !== 'timed') setMode('timed');
        return next;
      });
    } else {
      // Removing a day - no confirmation needed
      setMonthDays(prev => prev.filter(x => x !== d));
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
    const shouldCheckDuplicate =
      !skipDuplicateCheck &&
      mode === 'timed' &&
      (tipo !== 'task' || taskHasTime) &&
      (type === 'new' || type === 'edit' || type === 'schedule');

    if (shouldCheckDuplicate) {
      const baseTitle = type === 'schedule' ? (existing?.text ?? '') : text;
      const trimmedTitle = baseTitle.trim();
      const start = minutesToHhmm(startMin) as string;
      const end = endMin !== null ? (minutesToHhmm(endMin) as string) : null;
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
      if (t.length <= 100) {
        // New task "Tutto il giorno" + Singola: create with timeOverrides/schedule in one go so it persists
        const isNewAllDaySingle = type === 'new' && mode === 'allDay' && (tipo !== 'task' || taskHasTime) && freq === 'single';
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
          habitFreq: (tipo === 'task' && !taskHasTime) ? 'single' : freq,
          ...(trimmedLabel && { label: trimmedLabel }),
        };
        const newHabitId = type === 'new' ? addHabit(t, color, selectedFolder || undefined, tipo as any, initialForAdd) : existing!.id;
        if (type === 'edit' && existing) {
          // Single update to avoid React batching overwriting tipo
          setHabits(prev => prev.map(h => {
            if (h.id !== existing.id) return h;
            const base: Habit = {
              ...h,
              text: t,
              color,
              folder: selectedFolder || undefined,
              label: trimmedLabel || undefined,
              tipo,
              locationRule: locationRule ?? undefined,
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
        if (mode === 'timed' && (tipo !== 'task' || taskHasTime)) {
          const time = minutesToHhmm(startMin) as string;
          // Se c'è orario di inizio ma nessuna fine, salva fine = inizio + 1 ora
          const rawEndMin = endMin !== null ? endMin : startMin + 60;
          const endTime = minutesToHhmm(Math.min(rawEndMin, 24 * 60)) as string;

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
                return { ...h, timeOverrides: overrides, schedule };
              });
              return next;
            });
          } else if (freq === 'daily') {
            updateScheduleFromDate(newHabitId, getDay(new Date()), time as string, endTime as string | null);
            // Clear one-off overrides for recurring daily tasks
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.daysOfWeek = [];
              schedule.monthDays = undefined;
              schedule.yearMonth = undefined;
              schedule.yearDay = undefined;
              return { ...h, timeOverrides: {}, schedule };
            }));
          } else if (freq === 'weekly') {
            updateScheduleFromDate(newHabitId, getDay(new Date()), time as string, endTime as string | null);
            // Clear monthly days for weekly tasks
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
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
              }
              return { ...h, schedule };
            }));
            // Clear one-off overrides for recurring weekly tasks
            setHabits(prev => prev.map(h => h.id === newHabitId ? { ...h, timeOverrides: {} } : h));
            // After creating weekly, check for merge candidates by same text+color
            const created = habits.find(h => h.id === newHabitId) ?? { id: newHabitId, text, color, schedule: { daysOfWeek, time, endTime } } as any;
            const candidates = habits.filter(h => h.id !== newHabitId && h.text.trim().toLowerCase() === created.text.trim().toLowerCase() && (h.color ?? '') === (created.color ?? ''));
            if (candidates.length > 0) {
              setConfirmationModal({
                visible: true,
                title: 'Combina con task esistente?',
                message: 'Esiste una task con stesso nome e colore. Vuoi combinarle?',
                onConfirm: () => {
                  const base = candidates[0];
                  // Merge days
                  const mergedDays = Array.from(new Set([...(base.schedule?.daysOfWeek ?? []), ...daysOfWeek])).sort();
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
                  setConfirmationModal(prev => ({ ...prev, visible: false }));
                  close();
                }
              });
              return; // wait user choice
            }
          } else if (freq === 'monthly') {
            updateScheduleFromDate(newHabitId, getDay(new Date()), time as string, endTime as string | null);
            // Update monthly days and clear weekly days
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
              schedule.monthDays = monthDays;
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
              }
              return { ...h, schedule };
            }));
            // Clear one-off overrides for recurring monthly tasks
            setHabits(prev => prev.map(h => h.id === newHabitId ? { ...h, timeOverrides: {} } : h));
          } else if (freq === 'annual') {
            updateScheduleFromDate(newHabitId, getDay(new Date()), time as string, endTime as string | null);
            // Annual: set yearMonth/yearDay and clear weekly/monthly fields
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
              schedule.yearMonth = annualMonth;
              schedule.yearDay = annualDay;
              schedule.daysOfWeek = [];
              schedule.monthDays = undefined;
              return { ...h, schedule };
            }));
            // Clear one-off overrides for recurring annual tasks
            setHabits(prev => prev.map(h => h.id === newHabitId ? { ...h, timeOverrides: {} } : h));
          }
        }
        // Se è "Tutto il giorno", salva solo la frequenza senza orari (new+single già gestito con initial in addHabit)
        if (mode === 'allDay' && (tipo !== 'task' || taskHasTime)) {
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
                return { ...h, timeOverrides: overrides, schedule };
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
              return { ...h, timeOverrides: {}, schedule };
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
              return { ...h, schedule };
            }));
          } else if (freq === 'monthly') {
            // Clear time fields for monthly all-day tasks
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.monthDays = monthDays;
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
              return { ...h, schedule };
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
              return { ...h, timeOverrides: overrides, schedule };
            });
            return next;
          });
        }
        // Edit task without time: clear all time data and timeOverrides so the task is removed from Oggi.
        if (type === 'edit' && tipo === 'task' && !taskHasTime) {
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
            return { ...h, timeOverrides: {}, schedule };
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
        const repeatStartYmd = freq !== 'single' ? `${annualYear}-${String(annualMonth).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}` : null;
        setHabits(prev => prev.map(h => {
          if (h.id !== newHabitId) return h;
          const base: Habit = {
            ...h,
            isAllDay: mode === 'allDay',
            habitFreq: (tipo === 'task' && !taskHasTime) ? 'single' : freq,
            tipo,
            locationRule: locationRule ?? undefined,
            notification,
            askReview: tipo !== 'viaggio' ? askReview : undefined,
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
      }
    } else if (type === 'rename' && existing) {
      const t = text.trim();
      if (t.length > 0 && t.length <= 100) updateHabit(existing.id, t);
    } else if (type === 'color' && existing) {
      updateHabitColor(existing.id, color);
    } else if (type === 'schedule' && existing) {
      const time = mode === 'timed' ? minutesToHhmm(startMin) as string : null;
      // Se c'è orario di inizio ma nessuna fine impostata, salva fine = inizio + 1 ora (come in Oggi)
      const rawEndMin = mode === 'timed' && endMin !== null ? endMin : (mode === 'timed' && time ? startMin + 60 : null);
      const endTime = rawEndMin != null ? minutesToHhmm(Math.min(rawEndMin, 24 * 60)) as string : null;

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
        updateScheduleFromDate(existing.id, getDay(new Date()), time, endTime);
        // Clear one-off overrides for recurring daily tasks
        setHabits(prev => prev.map(h => {
          if (h.id !== existing.id) return h;
          const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
          schedule.daysOfWeek = [];
          schedule.monthDays = undefined;
          schedule.yearMonth = undefined;
          schedule.yearDay = undefined;
          return { ...h, timeOverrides: {}, schedule };
        }));
      } else if (freq === 'weekly') {
        updateScheduleFromDate(existing.id, getDay(new Date()), time, endTime);
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
          }
          return { ...h, schedule };
        }));
        // Clear one-off overrides for recurring weekly tasks
        setHabits(prev => prev.map(h => h.id === existing.id ? { ...h, timeOverrides: {} } : h));
        // Prompt to merge for edits as well
        const candidates = habits.filter(h => h.id !== existing.id && h.text.trim().toLowerCase() === text.trim().toLowerCase() && (h.color ?? '') === (color ?? ''));
        if (candidates.length > 0) {
          setConfirmationModal({
            visible: true,
            title: 'Combina con task esistente?',
            message: 'Esiste una task con stesso nome e colore. Vuoi combinarle?',
            onConfirm: () => {
              const base = candidates[0];
              const mergedDays = Array.from(new Set([...(base.schedule?.daysOfWeek ?? []), ...daysOfWeek])).sort();
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
              setConfirmationModal(prev => ({ ...prev, visible: false }));
              close();
            }
          });
          return; // wait user choice
        }
      } else if (freq === 'monthly') {
        updateScheduleFromDate(existing.id, getDay(new Date()), time, endTime);
        // Update monthly days and clear weekly days
        setHabits(prev => prev.map(h => {
          if (h.id !== existing.id) return h;
          const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as NonNullable<Habit['schedule']>;
          schedule.monthDays = monthDays;
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
          }
          return { ...h, schedule };
        }));
        // Clear one-off overrides for recurring monthly tasks
        setHabits(prev => prev.map(h => h.id === existing.id ? { ...h, timeOverrides: {} } : h));
      } else if (freq === 'annual') {
        updateScheduleFromDate(existing.id, getDay(new Date()), time, endTime);
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
        // Clear one-off overrides for recurring annual tasks
        setHabits(prev => prev.map(h => h.id === existing.id ? { ...h, timeOverrides: {} } : h));
      }
      // Se è "Tutto il giorno", salva solo la frequenza senza orari
      if (mode === 'allDay' && (tipo !== 'task' || taskHasTime)) {
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
            return { ...h, timeOverrides: {}, schedule };
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
            schedule.monthDays = monthDays;
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
      const repeatStartYmd = freq !== 'single' ? `${annualYear}-${String(annualMonth).padStart(2, '0')}-${String(annualDay).padStart(2, '0')}` : null;
      // Persist explicit flags so the modal restores them correctly on re-open (preserve tipo)
      setHabits(prev => prev.map(h => h.id === existing.id ? {
        ...h,
        isAllDay: mode === 'allDay',
        habitFreq: (tipo === 'task' && !taskHasTime) ? 'single' : freq,
        tipo: existing.tipo ?? h.tipo,
        locationRule: locationRule ?? undefined,
        notification,
        askReview: (existing.tipo ?? h.tipo) !== 'viaggio' ? askReview : undefined,
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
    locationRule,
    notification,
    repeatEndType,
    setRepeatEndType,
    repeatEndCount,
    setRepeatEndCount,
    repeatEndCustomDate,
    setRepeatEndCustomDate,
    // Derived
    existing,
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
    labelInput,
    setLabelInput,
    labelSuggestions,
    topLabels,
  };
}
