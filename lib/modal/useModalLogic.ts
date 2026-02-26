import { useHabits } from '@/lib/habits/Provider';
import { Habit } from '@/lib/habits/schema';
import { minutesToHhmm, hhmmToMinutes, findDuplicateHabitSlot } from '@/lib/modal/helpers';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView } from 'react-native';

const STORAGE_HABITS = 'habitcheck_habits_v1';

export function useModalLogic(params: { type: string; id?: string; folder?: string; scrollRef: React.RefObject<ScrollView> }) {
  const { type, id, folder, scrollRef } = params;
  const { habits, addHabit, updateHabit, updateHabitColor, updateHabitFolder, updateSchedule, updateScheduleTime, updateScheduleFromDate, setHabits, getDay } = useHabits();
  const router = useRouter();
  const existing = useMemo(() => habits.find(h => h.id === id), [habits, id]);

  const [text, setText] = useState(existing?.text ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? '#4A148C');
  const validFolder = (folder && folder !== '__oggi__' && folder !== '__tutte__') ? folder : null;
  const [selectedFolder, setSelectedFolder] = useState<string | null>(existing?.folder ?? validFolder ?? null);
  const [availableFolders, setAvailableFolders] = useState<string[]>([]);
  const [tipo, setTipo] = useState<'task' | 'abitudine' | 'evento'>(existing?.tipo ?? 'task');
  useEffect(() => {
    if (existing?.tipo) setTipo(existing.tipo);
  }, [existing?.tipo]);

  // For tasks only: whether to show the schedule/time block.
  // Defaults to false (no time) for new tasks; true if the existing task already has time config.
  const [taskHasTime, setTaskHasTime] = useState<boolean>(
    existing?.tipo === 'task' && initialMode === 'timed'
  );

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
    })();
  }, []);

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
  const initialStart = existing?.schedule?.time ?? null;
  const initialEnd = existing?.schedule?.endTime ?? null;
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
  // For single tasks, get date from timeOverrides (YYYY-MM-DD keys); for annual from schedule
  const initialSingleDate = useMemo(() => {
    const keys = existing?.timeOverrides ? Object.keys(existing.timeOverrides).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)) : [];
    if (keys.length > 0) {
      const [y, m, d] = keys[0].split('-').map(Number);
      return { year: y, month: m, day: d };
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
  }, [existing?.timeOverrides]);
  const [annualMonth, setAnnualMonth] = useState<number>(() =>
    existing?.schedule?.yearMonth ?? initialSingleDate.month);
  const [annualDay, setAnnualDay] = useState<number>(() =>
    existing?.schedule?.yearDay ?? initialSingleDate.day);
  const [annualYear, setAnnualYear] = useState<number>(() =>
    (existing?.schedule?.yearMonth && existing?.schedule?.yearDay) ? new Date().getFullYear() : initialSingleDate.year);

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
            // Save to AsyncStorage - use the updated habits from setHabits
            setHabits(prev => {
              AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(prev)).catch(() => {});
              return prev;
            });
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
      const t = text.trim();
      if (t.length <= 100) {
        const newHabitId = type === 'new' ? addHabit(t, color, selectedFolder || undefined, tipo) : existing!.id;
        if (type === 'edit' && existing) {
          // Single update to avoid React batching overwriting tipo
          setHabits(prev => prev.map(h => {
            if (h.id !== existing.id) return h;
            return {
              ...h,
              text: t,
              color,
              folder: selectedFolder || undefined,
              tipo,
            };
          }));
        }
        // Se è una task temporizzata, aggiungi anche la programmazione
        if (mode === 'timed' && (tipo !== 'task' || taskHasTime)) {
          const time = minutesToHhmm(startMin) as string;
          const endTime = endMin !== null ? minutesToHhmm(endMin) as string : null;

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
              AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
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
        // Se è "Tutto il giorno", salva solo la frequenza senza orari
        if (mode === 'allDay' && (tipo !== 'task' || taskHasTime)) {
          if (freq === 'single') {
            // For single frequency, save as one-off override for selected date only
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
              AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
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
        // Persist explicit flags so the modal restores them correctly on re-open
        setHabits(prev => prev.map(h => h.id === newHabitId ? { ...h, isAllDay: mode === 'allDay', habitFreq: (tipo === 'task' && !taskHasTime) ? 'single' : freq, tipo } : h));
      }
    } else if (type === 'rename' && existing) {
      const t = text.trim();
      if (t.length > 0 && t.length <= 100) updateHabit(existing.id, t);
    } else if (type === 'color' && existing) {
      updateHabitColor(existing.id, color);
    } else if (type === 'schedule' && existing) {
      const time = mode === 'timed' ? minutesToHhmm(startMin) as string : null;
      const endTime = mode === 'timed' && endMin !== null ? minutesToHhmm(endMin) as string : null;

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
          AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
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
            AsyncStorage.setItem(STORAGE_HABITS, JSON.stringify(next)).catch(() => {});
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
      // Persist explicit flags so the modal restores them correctly on re-open (preserve tipo)
      setHabits(prev => prev.map(h => h.id === existing.id ? { ...h, isAllDay: mode === 'allDay', habitFreq: (tipo === 'task' && !taskHasTime) ? 'single' : freq, tipo: existing.tipo ?? h.tipo } : h));
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
  };
}
