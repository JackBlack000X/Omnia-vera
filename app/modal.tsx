import { useColorScheme } from '@/hooks/use-color-scheme';
import { useHabits } from '@/lib/habits/Provider';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Helpers
function pad(n: number) { return String(n).padStart(2, '0'); }
function minutesToHhmm(min: number) { const h = Math.floor(min / 60); const m = min % 60; return `${pad(h)}:${pad(m)}`; }
function hhmmToMinutes(hhmm: string | null | undefined) { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }
function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) {
    return `${mins} min`;
  } else if (mins === 0) {
    return `${hours}h`;
  } else {
    return `${hours}h ${mins}min`;
  }
}

// Simple full-screen confirmation modal
function ConfirmationModal({ 
  visible, 
  title, 
  message, 
  onConfirm, 
  onCancel, 
  isDark 
}: { 
  visible: boolean; 
  title: string; 
  message: string; 
  onConfirm: () => void; 
  onCancel: () => void; 
  isDark: boolean; 
}) {
  if (!visible) return null;

  return (
    <View style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 9999,
    }}>
      <View style={{
        backgroundColor: isDark ? '#1f2937' : '#ffffff',
        borderRadius: 16,
        padding: 24,
        margin: 20,
        minWidth: 300,
        maxWidth: 360,
        borderWidth: 1,
        borderColor: isDark ? '#374151' : '#e5e7eb',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
      }}>
        <Text style={{
          fontSize: 20,
          fontWeight: '700',
          color: isDark ? '#ffffff' : '#000000',
          marginBottom: 16,
          textAlign: 'center',
        }}>
          {title}
        </Text>
        <Text style={{
          fontSize: 16,
          color: isDark ? '#d1d5db' : '#374151',
          marginBottom: 24,
          lineHeight: 24,
          textAlign: 'center',
        }}>
          {message}
        </Text>
        <View style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          gap: 16,
        }}>
          <TouchableOpacity 
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: isDark ? '#6b7280' : '#d1d5db',
            }} 
            onPress={onCancel}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: isDark ? '#9ca3af' : '#6b7280',
              textAlign: 'center',
            }}>
              Annulla
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={{
              flex: 1,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              backgroundColor: '#dc2626',
            }} 
            onPress={onConfirm}
          >
            <Text style={{
              fontSize: 16,
              fontWeight: '600',
              color: '#ffffff',
              textAlign: 'center',
            }}>
              Conferma
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Modal multipurpose: type=new|rename|schedule|color
export default function ModalScreen() {
  const { type = 'new', id } = useLocalSearchParams<{ type?: string; id?: string }>();
  const { habits, addHabit, updateHabit, updateHabitColor, updateSchedule, updateScheduleTime, updateScheduleTimes, setHabits } = useHabits();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const existing = useMemo(() => habits.find(h => h.id === id), [habits, id]);

  const [text, setText] = useState(existing?.text ?? '');
  const [color, setColor] = useState<string>(existing?.color ?? '#4A148C');
  
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
  const hasOneOff = useMemo(() => {
    if (!existing) return false;
    const schedDays = existing.schedule?.daysOfWeek ?? [];
    const schedMonth = existing.schedule?.monthDays ?? [];
    const overrides = existing.timeOverrides ? Object.keys(existing.timeOverrides) : [];
    return schedDays.length === 0 && schedMonth.length === 0 && overrides.length > 0;
  }, [existing]);

  const initialSpecificDate = useMemo(() => {
    if (!existing || !existing.timeOverrides) return null;
    const keys = Object.keys(existing.timeOverrides);
    if (keys.length === 0) return null;
    // pick the latest date key
    const latest = keys.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))[0];
    const [y, m, d] = latest.split('-').map(Number);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }, [existing]);
  const initialDays = existing?.schedule?.daysOfWeek ?? [];
  const initialStart = existing?.schedule?.time ?? null;
  const initialEnd = existing?.schedule?.endTime ?? null;
  const [mode, setMode] = useState<'allDay' | 'timed' | 'specificDate'>(hasOneOff ? 'specificDate' : (initialStart ? 'timed' : 'allDay'));
  const [specificDate, setSpecificDate] = useState<Date | null>(initialSpecificDate);
  const [freq, setFreq] = useState<'single' | 'daily' | 'weekly' | 'monthly' | 'annual'>(() => {
    if (existing) {
      const overrides = existing.timeOverrides ? Object.keys(existing.timeOverrides) : [];
      if (overrides.length > 0 && (existing.schedule?.daysOfWeek?.length ?? 0) === 0 && !(existing.schedule?.monthDays?.length)) return 'single';
      if (existing?.schedule?.monthDays && existing.schedule.monthDays.length > 0) return 'monthly';
      if (existing?.schedule?.yearMonth && existing?.schedule?.yearDay) return 'annual';
      if (initialDays.length > 0) return 'weekly';
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
  const [annualMonth, setAnnualMonth] = useState<number>(existing?.schedule?.yearMonth ?? (new Date().getMonth() + 1));
  const [annualDay, setAnnualDay] = useState<number>(existing?.schedule?.yearDay ?? new Date().getDate());
  const [annualYear, setAnnualYear] = useState<number>(new Date().getFullYear());
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
      setMonthDays(prev => [...prev, d].sort());
    } else {
      // Removing a day - no confirmation needed
      setMonthDays(prev => prev.filter(x => x !== d));
    }
  }

  function close() { router.back(); }

  function save() {
    if (type === 'new' || (type === 'edit' && existing)) {
      const t = text.trim();
      if (t.length <= 100) {
        const newHabitId = type === 'new' ? addHabit(t, color) : existing!.id;
        if (type === 'edit' && existing) {
          if (t !== existing.text) updateHabit(existing.id, t);
          if (color !== (existing.color ?? '#4A148C')) updateHabitColor(existing.id, color);
        }
        // Se è una task temporizzata, aggiungi anche la programmazione
        if (mode === 'timed') {
          const time = minutesToHhmm(startMin);
          const endTime = endMin ? minutesToHhmm(endMin) : null;
          
          if (freq === 'single') {
            // save one-off override on picked date (specificDate or today)
            const base = specificDate ?? new Date();
            const y = base.getFullYear();
            const m = String(base.getMonth() + 1).padStart(2, '0');
            const d = String(base.getDate()).padStart(2, '0');
            const ymd = `${y}-${m}-${d}`;
            updateScheduleTimes(newHabitId, time, endTime);
            setHabits(prev => prev.map(h => {
              if (h.id !== newHabitId) return h;
              const next = { ...(h.timeOverrides ?? {}) } as Record<string, string>;
              next[ymd] = time;
              // clear recurring fields
              const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
              schedule.daysOfWeek = [];
              schedule.monthDays = undefined;
              return { ...h, timeOverrides: next, schedule };
            }));
          } else if (freq === 'daily') {
            updateScheduleTimes(newHabitId, time, endTime);
          } else if (freq === 'weekly') {
            updateScheduleTimes(newHabitId, time, endTime);
            updateSchedule(newHabitId, daysOfWeek, time);
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
            updateScheduleTimes(newHabitId, time, endTime);
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
            updateScheduleTimes(newHabitId, time, endTime);
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
        if (mode === 'specificDate' && specificDate && freq === 'single') {
          // Salva come one-off sul giorno scelto via timeOverrides
          const y = specificDate.getFullYear();
          const m = String(specificDate.getMonth() + 1).padStart(2, '0');
          const d = String(specificDate.getDate()).padStart(2, '0');
          const ymd = `${y}-${m}-${d}`;
          // one-off: se non hai scelto orari, default 08:00-09:00
          const time = minutesToHhmm(startMin);
          updateScheduleTimes(newHabitId, time, endMin ? minutesToHhmm(endMin) : null);
          // override solo per start (coerente col provider)
          setHabits(prev => prev.map(h => {
            if (h.id !== newHabitId) return h;
            const next = { ...(h.timeOverrides ?? {}) } as Record<string, string>;
            next[ymd] = time;
            return { ...h, timeOverrides: next };
          }));
        }
        // If user chose a specific start date and the frequency is recurring, set createdAt to that date
        if (specificDate && freq !== 'single') {
          const y = specificDate.getFullYear();
          const m = String(specificDate.getMonth() + 1).padStart(2, '0');
          const d = String(specificDate.getDate()).padStart(2, '0');
          const ymd = `${y}-${m}-${d}`;
          setHabits(prev => prev.map(h => h.id === newHabitId ? { ...h, createdAt: ymd } : h));
        }
      }
    } else if (type === 'rename' && existing) {
      const t = text.trim();
      if (t.length > 0 && t.length <= 100) updateHabit(existing.id, t);
    } else if (type === 'color' && existing) {
      updateHabitColor(existing.id, color);
    } else if (type === 'schedule' && existing) {
      const time = mode === 'timed' ? minutesToHhmm(startMin) : null;
      const endTime = mode === 'timed' && endMin ? minutesToHhmm(endMin) : null;
      
      if (freq === 'single') {
        const base = specificDate ?? new Date();
        const y = base.getFullYear();
        const m = String(base.getMonth() + 1).padStart(2, '0');
        const d = String(base.getDate()).padStart(2, '0');
        const ymd = `${y}-${m}-${d}`;
        updateScheduleTimes(existing.id, time, endTime);
        setHabits(prev => prev.map(h => {
          if (h.id !== existing.id) return h;
          const next = { ...(h.timeOverrides ?? {}) } as Record<string, string>;
          if (time) next[ymd] = time; else delete next[ymd];
          const schedule = { ...(h.schedule ?? { daysOfWeek: [] }) } as any;
          schedule.daysOfWeek = [];
          schedule.monthDays = undefined;
          return { ...h, timeOverrides: next, schedule };
        }));
      } else if (freq === 'daily') {
        updateScheduleTimes(existing.id, time, endTime);
        // Clear one-off overrides for recurring daily tasks
        setHabits(prev => prev.map(h => h.id === existing.id ? { ...h, timeOverrides: {} } : h));
      } else if (freq === 'weekly') {
        updateScheduleTimes(existing.id, time, endTime);
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
        updateScheduleTimes(existing.id, time, endTime);
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
        updateScheduleTimes(existing.id, time, endTime);
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
      // If a specific date was selected while scheduling a recurring task, set createdAt to that date
      if (specificDate && freq !== 'single') {
        const y = specificDate.getFullYear();
        const m = String(specificDate.getMonth() + 1).padStart(2, '0');
        const d = String(specificDate.getDate()).padStart(2, '0');
        const ymd = `${y}-${m}-${d}`;
        setHabits(prev => prev.map(h => h.id === existing.id ? { ...h, createdAt: ymd } : h));
      }
    }
    close();
  }

  const COLORS = ['#000000', '#ef4444', '#f59e0b', '#fbbf24', '#10b981', '#60a5fa', '#3b82f6', '#6366f1', '#ec4899', '#ffffff', '#9ca3af'];

  return (
    <>
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.select({ ios: 'padding', android: undefined })} style={{ flex: 1 }}>
        <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={styles.box}>
          <Text style={styles.title}>
            {type === 'new' ? 'Nuova Task' : type === 'rename' ? 'Rinomina Task' : type === 'schedule' ? 'Programma Abitudine' : type === 'edit' ? 'Modifica Task' : 'Scegli Colore'}
          </Text>

          {(type === 'new' || type === 'rename' || type === 'edit') && (
            <TextInput
              value={text}
              onChangeText={(v) => v.length <= 100 && setText(v)}
              onSubmitEditing={save}
              placeholder="Nome"
              placeholderTextColor="#64748b"
              style={styles.input}
            />
          )}

          {(type === 'new' || type === 'edit') && (
            <View style={styles.colorBottom}>
              <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                <Text style={styles.sectionTitle}>Colore</Text>
              </View>
              <View style={styles.colorSheet}>
                <View style={styles.colorsRowWrap}>
                  {COLORS.map(c => (
                    <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.colorSwatch, { backgroundColor: c, borderColor: color === c ? '#ffffff' : 'transparent' }]} />
                  ))}
                </View>
              </View>
              {/* no duplicate schedule block here */}
            </View>
          )}

          {(type === 'schedule' || type === 'new' || type === 'edit') && (
            <View>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => setMode('allDay')} style={[styles.chip, mode === 'allDay' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={mode === 'allDay' ? styles.chipActiveText : styles.chipGhostText}>Tutto il giorno</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMode('timed')} style={[styles.chip, mode === 'timed' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={mode === 'timed' ? styles.chipActiveText : styles.chipGhostText}>Orario specifico</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setMode('specificDate')} style={[styles.chip, mode === 'specificDate' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={mode === 'specificDate' ? styles.chipActiveText : styles.chipGhostText}>Data specifica</Text>
                </TouchableOpacity>
              </View>

              {mode === 'timed' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Orario</Text>
                  {freq === 'weekly' && daysOfWeek.length > 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.subtle, { textAlign: 'center' }]}>Giorni selezionati</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        {([1,2,3,4,5,6,0] as number[]).filter(d => daysOfWeek.includes(d)).map(d => {
                          const names = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
                          const label = names[d].slice(0, 3);
                          const active = selectedDow === d;
                          return (
                            <TouchableOpacity key={d} onPress={() => setSelectedDow(d)} style={[styles.chip, active ? styles.chipActive : styles.chipGhost]}>
                              <Text style={active ? styles.chipActiveText : styles.chipGhostText}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {freq === 'monthly' && monthDays.length > 1 && (
                    <View style={{ marginBottom: 12 }}>
                      <Text style={[styles.subtle, { textAlign: 'center' }]}>Giorni del mese selezionati</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                        {[...monthDays].sort((a,b)=>a-b).map(d => {
                          const label = String(d);
                          const active = selectedMonthDay === d;
                          return (
                            <TouchableOpacity key={d} onPress={() => setSelectedMonthDay(d)} style={[styles.chip, active ? styles.chipActive : styles.chipGhost]}>
                              <Text style={active ? styles.chipActiveText : styles.chipGhostText}>{label}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  <View style={styles.timeColumn}>
                    <View style={styles.timeSection}>
                      <Text style={styles.timeSectionTitle}>Inizio</Text>
                    <View style={styles.timePicker}>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Ore</Text>
                          <View style={styles.timeStepperRow}>
                            <TouchableOpacity onPress={() => updateCurrentStartMin(Math.max(0, currentStartMin - 60))} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.timeValue}>{Math.floor(currentStartMin / 60)}</Text>
                            <TouchableOpacity onPress={() => {
                              const curS = currentStartMin;
                              const curE = currentEndMin;
                              const newStartMin = curS + 60;
                              const maxStartMin = curE ? curE - 5 : 23 * 60;
                              updateCurrentStartMin(Math.min(maxStartMin, newStartMin));
                            }} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Min</Text>
                          <View style={styles.timeStepperRow}>
                            <TouchableOpacity onPress={() => updateCurrentStartMin(Math.max(0, currentStartMin - 5))} style={styles.timeStepper}>
                        <Text style={styles.timeStepperText}>−</Text>
                      </TouchableOpacity>
                            <Text style={styles.timeValue}>{currentStartMin % 60}</Text>
                            <TouchableOpacity onPress={() => {
                              const curS = currentStartMin;
                              const curE = currentEndMin;
                              const newStartMin = curS + 5;
                              const maxStartMin = curE ? curE - 5 : 23 * 60 + 55;
                              updateCurrentStartMin(Math.min(maxStartMin, newStartMin));
                            }} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                    
                    <View style={styles.timeSection}>
                      <Text style={styles.timeSectionTitle}>Fine</Text>
                      <View style={styles.timePicker}>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Ore</Text>
                          <View style={styles.timeStepperRow}>
                            <TouchableOpacity onPress={() => {
                              const curS = currentStartMin;
                              const curE = currentEndMin;
                              updateCurrentEndMin(Math.max(curS + 5, (curE ?? curS + 60) - 60));
                            }} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>−</Text>
                            </TouchableOpacity>
                            <Text style={styles.timeValue}>{Math.floor(((currentEndMin ?? (currentStartMin + 60)) / 60))}</Text>
                            <TouchableOpacity onPress={() => {
                              const curS = currentStartMin;
                              const curE = currentEndMin;
                              updateCurrentEndMin(Math.min(24 * 60, (curE ?? curS + 60) + 60));
                            }} style={styles.timeStepper}>
                        <Text style={styles.timeStepperText}>+</Text>
                      </TouchableOpacity>
                    </View>
                        </View>
                        <View style={styles.timeControls}>
                          <Text style={styles.timeLabel}>Min</Text>
                          <View style={styles.timeStepperRow}>
                            <TouchableOpacity onPress={() => {
                              const curS = currentStartMin;
                              const curE = currentEndMin;
                              updateCurrentEndMin(Math.max(curS + 5, (curE ?? curS + 60) - 5));
                            }} style={styles.timeStepper}>
                        <Text style={styles.timeStepperText}>−</Text>
                      </TouchableOpacity>
                            <Text style={styles.timeValue}>{((currentEndMin ?? (currentStartMin + 60)) % 60)}</Text>
                            <TouchableOpacity onPress={() => {
                              const curS = currentStartMin;
                              const curE = currentEndMin;
                              updateCurrentEndMin(Math.min(24 * 60, (curE ?? curS + 60) + 5));
                            }} style={styles.timeStepper}>
                              <Text style={styles.timeStepperText}>+</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  </View>
                  <Text style={styles.duration}>{formatDuration((currentEndMin ?? (currentStartMin + 60)) - currentStartMin)}</Text>
                </View>
              )}

              {mode === 'specificDate' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Scegli una data (può essere nel passato)</Text>
                  {(() => {
                    const now = new Date();
                    const sel = specificDate ?? new Date();
                    const same = sel.getFullYear() === now.getFullYear() && sel.getMonth() === now.getMonth() && sel.getDate() === now.getDate();
                    return (
                      <View style={{ backgroundColor: '#1f2937', borderRadius: 14, padding: 12, position: 'relative', borderWidth: 1, borderColor: same ? '#ff3b30' : '#334155' }}>
                        {same && (
                          <View style={{ position: 'absolute', top: 6, left: 8, backgroundColor: 'transparent' }}>
                            <Text style={{ color: '#ff3b30', fontWeight: '700', fontSize: 12 }}>Oggi</Text>
                          </View>
                        )}
                        {/* no label when not today */}
                        {/* Stacked selectors: Year, Month, Day */}
                        <View style={{ marginTop: 4 }}>
                      <View style={{ alignItems: 'center', marginBottom: 12 }}>
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Anno</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity onPress={() => setSpecificDate(prev => { const d = new Date(prev ?? new Date()); d.setFullYear(d.getFullYear() - 1); return d; })} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 84, textAlign: 'center' }}>{(specificDate ?? new Date()).getFullYear()}</Text>
                          <TouchableOpacity onPress={() => setSpecificDate(prev => { const d = new Date(prev ?? new Date()); d.setFullYear(d.getFullYear() + 1); return d; })} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ alignItems: 'center', marginBottom: 12 }}>
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Mese</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity onPress={() => setSpecificDate(prev => { const d = new Date(prev ?? new Date()); d.setMonth(d.getMonth() - 1); return d; })} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 84, textAlign: 'center' }}>{(specificDate ?? new Date()).getMonth() + 1}</Text>
                          <TouchableOpacity onPress={() => setSpecificDate(prev => { const d = new Date(prev ?? new Date()); d.setMonth(d.getMonth() + 1); return d; })} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                        </View>
                      </View>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Giorno</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <TouchableOpacity onPress={() => setSpecificDate(prev => { const d = new Date(prev ?? new Date()); d.setDate(d.getDate() - 1); return d; })} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                          <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 84, textAlign: 'center' }}>{(specificDate ?? new Date()).getDate()}</Text>
                          <TouchableOpacity onPress={() => setSpecificDate(prev => { const d = new Date(prev ?? new Date()); d.setDate(d.getDate() + 1); return d; })} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                        </View>
                      </View>
                        </View>
                      </View>
                    );
                  })()}
                </View>
              )}

              <View style={[styles.sectionHeader, { marginTop: 16 }]}><Text style={styles.sectionTitle}>Frequenza</Text></View>
              <View style={styles.row}>
                <TouchableOpacity onPress={() => setFreq('single')} style={[styles.chip, freq === 'single' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={freq === 'single' ? styles.chipActiveText : styles.chipGhostText}>Singola</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setFreq('daily')} style={[styles.chip, freq === 'daily' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={freq === 'daily' ? styles.chipActiveText : styles.chipGhostText}>Ogni giorno</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setFreq('weekly'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, freq === 'weekly' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={freq === 'weekly' ? styles.chipActiveText : styles.chipGhostText}>Settimanale</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setFreq('monthly'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, freq === 'monthly' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={freq === 'monthly' ? styles.chipActiveText : styles.chipGhostText}>Mensile</Text>
                </TouchableOpacity>
              </View>
              <View style={[styles.row, { marginTop: 8 }]}>
                <TouchableOpacity onPress={() => { setFreq('annual'); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50); }} style={[styles.chip, freq === 'annual' ? styles.chipActive : styles.chipGhost]}>
                  <Text style={freq === 'annual' ? styles.chipActiveText : styles.chipGhostText}>Annuale</Text>
                </TouchableOpacity>
              </View>

              {freq === 'weekly' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorni della settimana</Text>
                  <View style={styles.daysWrap}>
                    {['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map((d, i) => {
                      const sundayIndex = (i + 1) % 7; // map Mon->1 ... Sun->0
                      const selected = daysOfWeek.includes(sundayIndex);
                      return (
                        <TouchableOpacity key={i} onPress={() => toggleDow(sundayIndex)} style={[styles.dayPill, selected ? styles.dayPillOn : styles.dayPillOff]}>
                          <Text style={selected ? styles.dayTextOn : styles.dayTextOff}>{d}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {freq === 'monthly' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorni del mese</Text>
                  <View style={styles.monthlyDaysWrap}>
                    {Array.from({ length: 31 }).map((_, i) => (
                      <TouchableOpacity key={i} onPress={() => toggleMonthDay(i + 1)} style={[styles.monthlyDayPill, monthDays.includes(i + 1) ? styles.dayPillOn : styles.dayPillOff]}>
                        <Text style={monthDays.includes(i + 1) ? styles.dayTextOn : styles.dayTextOff}>{i + 1}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {freq === 'annual' && (
                <View style={{ marginTop: 12 }}>
                  <Text style={styles.subtle}>Giorno dell'anno</Text>
                  <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Anno</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => setAnnualYear(y => y - 1)} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 84, textAlign: 'center' }}>{annualYear}</Text>
                        <TouchableOpacity onPress={() => setAnnualYear(y => y + 1)} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Mese</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => setAnnualMonth(m => Math.max(1, m - 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{annualMonth}</Text>
                        <TouchableOpacity onPress={() => setAnnualMonth(m => Math.min(12, m + 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                      </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={{ color: '#94a3b8', marginBottom: 6 }}>Giorno</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity onPress={() => setAnnualDay(d => Math.max(1, d - 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>−</Text></TouchableOpacity>
                        <Text style={{ color: 'white', fontSize: 18, fontWeight: '700', minWidth: 64, textAlign: 'center' }}>{annualDay}</Text>
                        <TouchableOpacity onPress={() => setAnnualDay(d => Math.min(31, d + 1))} style={styles.timeStepper}><Text style={styles.timeStepperText}>+</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>
          )}

          {type === 'color' && (
            <View style={[styles.colorSheet, { marginTop: 'auto' }]}>
              <View style={styles.colorsRowWrap}>
                {COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setColor(c)} style={[styles.colorSwatch, { backgroundColor: c, borderColor: color === c ? '#ffffff' : 'transparent' }]} />
                ))}
              </View>
            </View>
          )}

          </View>
        </ScrollView>
        
        {/* Fixed position buttons */}
        <View style={styles.fixedButtonsContainer}>
          <TouchableOpacity onPress={close} style={[styles.circularBtn, styles.cancelBtn]}>
            <Ionicons name="close" size={52} color="#ff0000" />
              </TouchableOpacity>
          <TouchableOpacity onPress={save} style={[styles.circularBtn, styles.saveBtn]}>
            <Ionicons name="checkmark" size={52} color="#00ff00" />
              </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
      
      <ConfirmationModal
        visible={confirmationModal.visible}
        title={confirmationModal.title}
        message={confirmationModal.message}
        onConfirm={confirmationModal.onConfirm}
        onCancel={() => setConfirmationModal(prev => ({ ...prev, visible: false }))}
        isDark={isDark}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1220', paddingHorizontal: 14 },
  box: { marginTop: 16, paddingBottom: 100 },
  title: { color: 'white', fontSize: 22, fontWeight: '700', marginBottom: 12 },
  input: { color: 'white', borderColor: '#334155', borderWidth: 1, borderRadius: 12, padding: 12, backgroundColor: '#0f172a' },
  placeholder: { padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#334155', backgroundColor: '#0f172a' },
  placeholderText: { color: '#cbd5e1' },
  colorSheet: { backgroundColor: '#0f172a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#334155' },
  colorsRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16, justifyContent: 'center' },
  colorSwatch: { width: 48, height: 48, borderRadius: 999, borderWidth: 2 },
  colorBottom: { marginTop: 'auto' },
  btn: { backgroundColor: '#2563eb', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12 },
  btnText: { color: 'white', fontWeight: '600' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155' },
  btnGhostText: { color: '#e2e8f0' },
  btnPrimary: { backgroundColor: '#ec4899', paddingHorizontal: 22, paddingVertical: 12, borderRadius: 12 },
  btnPrimaryText: { color: 'white', fontWeight: '700' },

  // Circular action buttons
  circularBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3
  },
  cancelBtn: {
    backgroundColor: '#991b1b' // Less dimmed red
  },
  saveBtn: {
    backgroundColor: '#065f46' // Less dimmed green
  },
  
  // Fixed position buttons
  fixedButtonsContainer: {
    position: 'absolute',
    bottom: 5,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    zIndex: 1000
  },

  sectionHeader: { marginTop: 8 },
  sectionTitle: { color: '#e2e8f0', fontWeight: '700', fontSize: 18 },
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12 },
  chipGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#334155' },
  chipGhostText: { color: '#e2e8f0' },
  chipActive: { backgroundColor: '#ec4899' },
  chipActiveText: { color: 'white', fontWeight: '700' },

  subtle: { color: '#94a3b8', marginTop: 8, marginBottom: 6 },
  timeColumn: { gap: 16 },
  timeSection: { gap: 8 },
  timeSectionTitle: { 
    color: '#e2e8f0', 
    fontSize: 16, 
    fontWeight: '600',
    textAlign: 'center'
  },
  timeRow: { flexDirection: 'row', gap: 12 },
  timePicker: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16
  },
  timeStepper: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center'
  },
  timeStepperText: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '700'
  },
  timeBox: { 
    flex: 1, 
    backgroundColor: 'transparent', 
    borderRadius: 14, 
    paddingVertical: 16, 
    alignItems: 'center',
    marginHorizontal: 8
  },
  timeActive: { backgroundColor: 'transparent' },
  timeText: { color: 'white', fontSize: 22, fontWeight: '800' },
  duration: { color: '#94a3b8', marginTop: 8, textAlign: 'center' },

  // New time controls
  timeControls: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  timeLabel: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  timeStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeValue: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    minWidth: 30,
    textAlign: 'center',
  },

  daysWrap: { flexDirection: 'row', flexWrap: 'nowrap', gap: 6, justifyContent: 'center' },
  monthlyDaysWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  dayPill: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 999, borderWidth: 1, minWidth: 40, alignItems: 'center' },
  monthlyDayPill: { paddingHorizontal: 8, paddingVertical: 8, borderRadius: 999, borderWidth: 1, minWidth: 32, alignItems: 'center' },
  dayPillOn: { backgroundColor: '#ec4899', borderColor: '#ec4899' },
  dayPillOff: { backgroundColor: 'transparent', borderColor: '#334155' },
  dayTextOn: { color: 'white', fontWeight: '700' },
  dayTextOff: { color: '#e2e8f0' },
});
