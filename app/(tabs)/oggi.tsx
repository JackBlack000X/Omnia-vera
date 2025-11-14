import { THEME } from '@/constants/theme';
import { isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const TZ = 'Europe/Zurich';

function formatDateLong(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', {
      timeZone: tz,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString('it-IT');
  }
}

function isLightColor(hex: string): boolean {
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

// No mock events: we render real habits as events

export default function OggiScreen() {
  const { habits, history, getDay } = useHabits();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [windowStart, setWindowStart] = useState<string>('06:00');
  const [windowEnd, setWindowEnd] = useState<string>('22:00');
  const [visibleHours, setVisibleHours] = useState<number>(24);
  const [forcedTaskColor, setForcedTaskColor] = useState<null | 'black' | 'white'>(null);
  
  const today = getDay(currentDate);

  const todayDate = useMemo(() => {
    return formatDateLong(currentDate, TZ);
  }, [currentDate]);

  const todayStats = useMemo(() => {
    const total = habits.length;
    const completed = history[today]?.completedByHabitId ?? {};
    const done = Object.values(completed).filter(Boolean).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [habits, history, today]);

  // Update current time every minute
  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date());
    };
    
    // Update immediately
    updateTime();
    
    // Set up interval to update every minute
    const interval = setInterval(updateTime, 60000); // 60000ms = 1 minute
    
    return () => clearInterval(interval);
  }, []);

  // Load/save viewing window
  useEffect(() => {
    (async () => {
      try {
        const [start, end, vis] = await Promise.all([
          AsyncStorage.getItem('oggi_window_start_v1'),
          AsyncStorage.getItem('oggi_window_end_v1'),
          AsyncStorage.getItem('oggi_visible_hours_v1'),
        ]);
        if (start) setWindowStart(start);
        if (end) setWindowEnd(end);
        const v = vis ? parseInt(vis, 10) : NaN;
        if (!isNaN(v)) setVisibleHours(Math.min(24, Math.max(5, v)));
        const forced = await AsyncStorage.getItem('oggi_forced_task_color_v1');
        if (forced === 'black' || forced === 'white') setForcedTaskColor(forced);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('oggi_window_start_v1', windowStart).catch(() => {});
  }, [windowStart]);
  useEffect(() => {
    AsyncStorage.setItem('oggi_window_end_v1', windowEnd).catch(() => {});
  }, [windowEnd]);
  useEffect(() => {
    AsyncStorage.setItem('oggi_visible_hours_v1', String(visibleHours)).catch(() => {});
  }, [visibleHours]);

  useEffect(() => {
    const v = forcedTaskColor ?? 'auto';
    AsyncStorage.setItem('oggi_forced_task_color_v1', v).catch(() => {});
  }, [forcedTaskColor]);


  const toMinutes = (hhmm: string) => {
    if (hhmm === '24:00') return 1440;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const windowStartMin = toMinutes(windowStart);
  const windowEndMin = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
  
  // Calculate hourGap based on effective visible hours:
  // if window spans less than selected visibleHours (e.g., 00:00-23:00 with 24 selected),
  // behave as if visibleHours equals the window span in hours.
  const clampedVisibleHours = Math.max(5, Math.min(24, visibleHours));
  const windowSpanHours = Math.max(1, Math.floor((windowEndMin - windowStartMin) / 60));
  const effectiveVisibleHours = Math.max(5, Math.min(24, Math.min(clampedVisibleHours, windowSpanHours)));
  const baseHourGap = 31; // Base spacing between hours
  const firstHourGap = effectiveVisibleHours === 23 ? 32.35 : 
                      effectiveVisibleHours === 22 ? 33.82 : 
                      effectiveVisibleHours === 21 ? 35.43 : 
                      effectiveVisibleHours === 20 ? 37.2 : 
                      effectiveVisibleHours === 19 ? 39.15 : 
                      effectiveVisibleHours === 18 ? 41.34 : 
                      effectiveVisibleHours === 17 ? 43.77 : 
                      effectiveVisibleHours === 16 ? 46.5 : 
                      effectiveVisibleHours === 15 ? 49.6 : 
                      effectiveVisibleHours === 14 ? 53.15 : 
                      effectiveVisibleHours === 13 ? 57.23 : 
                      effectiveVisibleHours === 12 ? 62.0 : 
                      effectiveVisibleHours === 11 ? 67.65 : 
                      effectiveVisibleHours === 10 ? 74.4 : 
                      effectiveVisibleHours === 9 ? 82.68 : 
                      effectiveVisibleHours === 8 ? 93 : 
                      effectiveVisibleHours === 7 ? 106.30 : 
                      effectiveVisibleHours === 6 ? 124 : 
                      effectiveVisibleHours === 5 ? 148.82 : baseHourGap; // Special spacing for first hour using effective visible hours
  const hourGap = baseHourGap; // Regular spacing for all other hours
  const scalePxPerMin = hourGap / 60; // Pixels per minute

  // Scroll/timeline height should end at the last visible hour
  const visibleHourCount = Math.max(1, Math.floor((windowEndMin - windowStartMin) / 60) + 1);
  const timelineHeightPx = (visibleHourCount - 1) * firstHourGap + hourGap;
  const isFullDayWindow = windowStartMin === 0 && windowEndMin === 1440;
  // For full-day window, use 24 hours only if visibleHours is 24, otherwise use visibleHourCount
  const scrollHeightPx = isFullDayWindow && visibleHours === 24 ? (24 * firstHourGap) : timelineHeightPx;
  // Extra bottom space so the last hour is fully reachable past the selection bar
  const selectionBarPx = 80;
  // Reduce bottom space by 10px total as requested
  const totalScrollHeightPx = scrollHeightPx + selectionBarPx - 10;

  // Generate hourly timeline based on viewing window (include end label)
  const hours = useMemo(() => {
    const startHour = Math.floor(windowStartMin / 60);
    const endHourLabel = Math.floor(windowEndMin / 60); // include end hour label
    const count = Math.max(endHourLabel - startHour + 1, 1);
    return Array.from({ length: count }, (_, i) => {
      const hour = startHour + i;
      return `${hour.toString().padStart(2, '0')}:00`;
    });
  }, [windowStartMin, windowEndMin]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  const getEventPosition = (startTime: string, endTime: string) => {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Position relative to windowStart
    // Hide tasks outside the visible window
    if (endMinutes <= windowStartMin || startMinutes >= windowEndMin) {
      return { top: -1, height: 0 };
    }

    // Clamp to visible window for positioning and size
    const visibleStart = Math.max(startMinutes, windowStartMin);
    const visibleEnd = Math.min(endMinutes, windowEndMin);

    const minutesFromWindowStart = Math.max(0, visibleStart - windowStartMin);
    const fullHoursAfterStart = Math.floor(minutesFromWindowStart / 60);
    const minutesIntoCurrentHour = minutesFromWindowStart % 60;
    // Ancoriamo alla stessa logica delle righe: prima ora a 0, poi blocchi da firstHourGap
    const topBlocks = fullHoursAfterStart === 0 ? 0 : (firstHourGap + (fullHoursAfterStart - 1) * firstHourGap);
    let top = topBlocks + minutesIntoCurrentHour * (firstHourGap / 60);
    // Offset visivo: sposta SOLO il blocco evento di 30 minuti verso il basso
    const visualOffsetMinutes = 30;
    const visualOffsetPx = visualOffsetMinutes * (firstHourGap / 60);
    top += visualOffsetPx;
    
    // Correzione per task di diverse lunghezze basata su formula generica
    const taskDurationHours = (visibleEnd - visibleStart) / 60;
    
    // Applica correzione solo per task di durata > 1 ora
    if (taskDurationHours > 1.1) {
      // Formula generica basata sul pattern identificato:
      // correzione = -1.25 * (durata_ore - 1) * ore_visibili + 30 * (durata_ore - 1)
      const durationFactor = taskDurationHours - 1;
      const correctionMinutes = Math.max(0, -1.25 * durationFactor * visibleHours + 30 * durationFactor);
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 10 minuti (0.1667 ore)
    if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // Range pi? stretto per 10 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 5 minuti (0.0833 ore)
    if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // Range pi? stretto per 5 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 15 minuti (0.25 ore)
    if (Math.abs(taskDurationHours - 0.25) < 0.05) { // Range pi? stretto per 15 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 30 minuti (0.5 ore)
    if (Math.abs(taskDurationHours - 0.5) < 0.05) { // Range pi? stretto per 30 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 45 minuti (0.75 ore)
    if (Math.abs(taskDurationHours - 0.75) < 0.05) { // Range pi? stretto per 45 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 40 minuti (0.667 ore)
    if (Math.abs(taskDurationHours - 0.667) < 0.05) { // Range pi? stretto per 40 minuti
      const correctionMinutes = 1.25; // Sposta in gi? di 1.25 minuti
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 20 minuti (0.333 ore)
    if (Math.abs(taskDurationHours - 0.333) < 0.05) { // Range pi? stretto per 20 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 25 minuti (0.417 ore)
    if (Math.abs(taskDurationHours - 0.417) < 0.05) { // Range pi? stretto per 25 minuti
      const correctionMinutes = 1.25; // Sposta in gi? di 1.25 minuti
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 35 minuti (0.583 ore)
    if (Math.abs(taskDurationHours - 0.583) < 0.05) { // Range pi? stretto per 35 minuti
      const correctionMinutes = 1.25; // Sposta in gi? di 1.25 minuti
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 50 minuti (0.833 ore)
    if (Math.abs(taskDurationHours - 0.833) < 0.05) { // Range pi? stretto per 50 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione specifica SOLO per 55 minuti (0.917 ore)
    if (Math.abs(taskDurationHours - 0.917) < 0.05) { // Range pi? stretto per 55 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      top += correctionPx;
    }
    
    // Correzione per 5 ore visibili - NON toccare 24 ore
    if (visibleHours === 5) {
      // Correzione specifica per 5 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        const correctionMinutes = -24.5; // Sposta in su di 24.5 minuti
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        top += correctionPx;
      }
      
      // Correzione specifica per 10 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionMinutes = -23.5; // Sposta in su di 23.5 minuti
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        top += correctionPx;
      }
      
      // Correzione specifica per 15 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionMinutes = -21; // Sposta in su di 21 minuti
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        top += correctionPx;
      }
      
       // Correzione specifica per 20 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
         const correctionMinutes = -18.625; // Sposta in su di 18.625 minuti
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
      
      // Correzione specifica per 25 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionMinutes = -16.25; // Sposta in su di 16.25 minuti
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        top += correctionPx;
      }
      
      // Correzione specifica per 30 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionMinutes = -13.5; // Sposta in su di 13.5 minuti
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        top += correctionPx;
      }
      
       // Correzione specifica per 35 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
         const correctionMinutes = -11.25; // Sposta in su di 11.25 minuti
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       // Correzione specifica per 40 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.667) < 0.05) { // 40 minuti
         const correctionMinutes = -8.85; // Sposta in su di 8.85 minuti
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       // Correzione specifica per 45 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.75) < 0.05) { // 45 minuti
         const correctionMinutes = -6.75; // Sposta in su di 6.75 minuti
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       // Correzione specifica per 50 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.833) < 0.05) { // 50 minuti
         const correctionMinutes = -4.75; // Sposta in su di 4.75 minuti
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       // Correzione specifica per 55 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.917) < 0.05) { // 55 minuti
         const correctionMinutes = -2.75; // Sposta in su di 2.75 minuti
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
     }
    
    // Correzione specifica per 6 ore visibili
    if (visibleHours === 6) {
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        const correctionPx = -0.5; // Sposta in su di 0.5 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionPx = -2; // Sposta in su di 2 pixel (era 1.5, ora +0.5)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionPx = -1.5; // Sposta in su di 1.5 pixel (era 2, ora -0.5)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
        const correctionPx = -1; // Sposta in su di 1 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionPx = -1; // Sposta in su di 1 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionPx = -1; // Sposta in su di 1 pixel (era 0.5, ora +0.5)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
        const correctionPx = -0.5; // Sposta in su di 0.5 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.667) < 0.05) { // 40 minuti
        const correctionPx = -0.5; // Sposta in su di 0.5 pixel
        top += correctionPx;
      }
    }
    
    // Correzione specifica per 7 ore visibili
    if (visibleHours === 7) {
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        const correctionPx = -0.5; // Scende di 0.25 pixel rispetto a prima
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionPx = -2.25; // Alza di ulteriori 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionPx = -2.5; // Alza ulteriormente di 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
        const correctionPx = -1.5; // Sposta in su di 1.5 pixel (era 2, ora -0.5)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionPx = -1.75; // Sposta in su di 1.75 pixel (era 1.5, ora +0.25)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionPx = -1.25; // Alza di ulteriori 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
        const correctionPx = -0.625; // Sposta in su di 0.625 pixel (era 0.5, ora +0.125)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.667) < 0.05) { // 40 minuti
        const correctionPx = -0.25; // Sposta in su di 0.25 pixel (era 0.125, ora +0.125)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.833) < 0.05) { // 50 minuti
        const correctionPx = -0.125; // Sposta in su di 0.125 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.917) < 0.05) { // 55 minuti
        const correctionPx = -0.25; // Alza di 0.25 pixel
        top += correctionPx;
      }
    }
    
    // Correzione specifica per 8 ore visibili
    if (visibleHours === 8) {
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        const correctionPx = -0.25; // Alza di 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionPx = -1.375; // Alza di ulteriori 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionPx = -3.25; // Alza di ulteriori 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionPx = -1.5; // Sposta in su di 1.5 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
        const correctionPx = -2; // Sposta in su di 2 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionPx = -2.2; // Alza di ulteriori 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
        const correctionPx = -1; // Alza di ulteriori 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.833) < 0.05) { // 50 minuti
        const correctionPx = -0.25; // Sposta in giu di 1px rispetto a prima
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.667) < 0.05) { // 40 minuti
        const correctionPx = -0.5; // Sposta in su di 0.5 pixel (altri 0.25)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.75) < 0.05) { // 45 minuti
        const correctionPx = 0.25; // Abbassa di 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.917) < 0.05) { // 55 minuti
        const correctionPx = -0.25; // Alza di 0.25px
        top += correctionPx;
      }
    }
    
    // Correzione specifica per 11 ore visibili
    if (visibleHours === 11) {
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        const correctionPx = -0.125; // Alza di 0.125 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionPx = -1.125; // Alza di 1.125 pixel (era 1.25, ora -0.125)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionPx = -3; // Alza di 3 pixel (era 5, ora -2)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
        const correctionPx = -4; // Alza di 4 pixel (era 3, ora +1)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionPx = -2.5; // Alza di 2.5 pixel (era 3.5, ora -1)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionPx = -2; // Alza di 2 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
        const correctionPx = -1; // Alza di 1 pixel
        top += correctionPx;
      }
    }
    
    // Correzione specifica per 12 ore visibili
    if (visibleHours === 12) {
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionPx = -0.5; // Alza di 0.5 pixel (era 1, ora -0.5)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionPx = -2; // Alza di 2 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
        const correctionPx = -4; // Alza di 4 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionPx = -4; // Alza di 4 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionPx = -3; // Alza di 3 pixel
        top += correctionPx;
      }
    }
    
    // Correzione specifica per 9 ore visibili
    if (visibleHours === 9) {
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        const correctionPx = -0.5; // Sposta in su di 0.5 pixel (era 0.25, ora +0.25)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionPx = -1.45; // Sposta in su di 1.45 pixel (era 1.325, ora +0.125)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionPx = -3.875; // Sposta in su di 3.875 pixel (era 3.75, ora +0.125)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionPx = -1.625; // Sposta in su di 1.625 pixel (era 1.5, ora +0.125)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.917) < 0.05) { // 55 minuti
        const correctionPx = -0.5; // Sposta in su di 0.5 pixel (era 0.25, ora +0.25)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
        const correctionPx = -2.875; // Sposta in su di 2.875 pixel (era 2.75, ora +0.125)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionPx = -2.625; // Alza di ulteriori 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
        const correctionPx = -1.25; // Alza di ulteriori 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.833) < 0.05) { // 50 minuti
        const correctionPx = -0.25; // Alza di 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.667) < 0.05) { // 40 minuti
        const correctionPx = -0.25; // Sposta in su di 0.25 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.75) < 0.05) { // 45 minuti
        const correctionPx = -0.125; // Sposta in su di 0.125 pixel
        top += correctionPx;
      }
    }
    
    // Correzione specifica per 10 ore visibili
    if (visibleHours === 10) {
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        const correctionPx = -0.25; // Alza di 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionPx = -1; // Alza di ulteriori 0.25px (totale 1px)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionPx = -3.5; // Abbassa di 0.25px (totale 3.5px)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionPx = -2.5; // Alza di ulteriori 0.25px (totale 2.5px)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
        const correctionPx = -3.25; // Alza di ulteriori 0.25px (totale 3.25px)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionPx = -1.75; // Abbassa di 0.25px (totale 1.75px)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
        const correctionPx = -0.75; // Alza di ulteriori 0.25px (totale 0.75px)
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.667) < 0.05) { // 40 minuti
        const correctionPx = -0.25; // Alza di 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.75) < 0.05) { // 45 minuti
        const correctionPx = -0.25; // Alza di 0.25px
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.833) < 0.05) { // 50 minuti
        const correctionPx = -0.25; // Alza di 0.25 pixel
        top += correctionPx;
      }
      if (Math.abs(taskDurationHours - 0.917) < 0.05) { // 55 minuti
        const correctionPx = -0.25; // Alza di 0.25px
        top += correctionPx;
      }
    }
    
    // Correzione per ore visibili 6-23 - interpola tra 5 ore e 24 ore
    if (visibleHours >= 6 && visibleHours < 24) {
      // Punti di riferimento:
      // 5 ore: -24.5 minuti per 5 minuti, -23.5 minuti per 10 minuti
      // 24 ore: +1 minuto per 5 minuti, +1 minuto per 10 minuti (offset attuali)
      
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        // Interpolazione lineare tra 5 ore (-24.5) e 24 ore (+1)
        const offset5h = -24.5;
        const offset24h = 1;
        const interpolationFactor = (visibleHours - 5) / (24 - 5); // 0 per 5h, 1 per 24h
        const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
        
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        top += correctionPx;
      }
      
       if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
         // Interpolazione lineare tra 5 ore (-23.5) e 24 ore (+1)
         const offset5h = -23.5;
         const offset24h = 1;
         const interpolationFactor = (visibleHours - 5) / (24 - 5); // 0 per 5h, 1 per 24h
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
         // Interpolazione lineare tra 5 ore (-21) e 24 ore (+1)
         const offset5h = -21;
         const offset24h = 1;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
         // Interpolazione lineare tra 5 ore (-18.625) e 24 ore (+1)
         const offset5h = -18.625;
         const offset24h = 1;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
         // Interpolazione lineare tra 5 ore (-16.25) e 24 ore (+1.25)
         const offset5h = -16.25;
         const offset24h = 1.25;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
         // Interpolazione lineare tra 5 ore (-13.5) e 24 ore (+1)
         const offset5h = -13.5;
         const offset24h = 1;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
         // Interpolazione lineare tra 5 ore (-11.25) e 24 ore (+1.25)
         const offset5h = -11.25;
         const offset24h = 1.25;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.667) < 0.05) { // 40 minuti
         // Interpolazione lineare tra 5 ore (-8.85) e 24 ore (+1.25)
         const offset5h = -8.85;
         const offset24h = 1.25;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.75) < 0.05) { // 45 minuti
         // Interpolazione lineare tra 5 ore (-6.75) e 24 ore (+1)
         const offset5h = -6.75;
         const offset24h = 1;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.833) < 0.05) { // 50 minuti
         // Interpolazione lineare tra 5 ore (-4.75) e 24 ore (+1)
         const offset5h = -4.75;
         const offset24h = 1;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
       
       if (Math.abs(taskDurationHours - 0.917) < 0.05) { // 55 minuti
         // Interpolazione lineare tra 5 ore (-2.75) e 24 ore (+1)
         const offset5h = -2.75;
         const offset24h = 1;
         const interpolationFactor = (visibleHours - 5) / (24 - 5);
         const correctionMinutes = offset5h + (offset24h - offset5h) * interpolationFactor;
         
         const correctionPx = correctionMinutes * (firstHourGap / 60);
         top += correctionPx;
       }
    }
 
    // Current height with hourGap (baseline used so center stays fixed after resize)
    let prevHeight = (visibleEnd - visibleStart) * (hourGap / 60);
    // Target height so that 60min == firstHourGap per current scale
    let height = (visibleEnd - visibleStart) * (firstHourGap / 60);
    
    // Prevent bottom edge from crossing the hour line when ending exactly on an hour
    const endsOnHour = (endMinutes % 60) === 0;
    const bottomGapPx = 2; // adjusted gap at the bottom
    const applyTrim = (h: number) => {
      if (endsOnHour) {
        return Math.max(20, h - bottomGapPx);
      }
      return Math.max(20, h);
    };
    prevHeight = applyTrim(prevHeight);
    height = applyTrim(height);

    // Keep the visual center unchanged: adjust top by half the delta
    const delta = height - prevHeight;
    top -= delta / 2;

    return { top, height };
  };

  // Calculate current time line position
  const getCurrentTimePosition = () => {
    const now = currentTime;
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentMinutes = currentHour * 60 + currentMinute;
    
    // Check if current time is within the visible window
    if (currentMinutes < windowStartMin || currentMinutes > windowEndMin) {
      return null;
    }
    
    // Position relative to windowStart
    // Calcolo identico alle task, con un blocco virtuale di 30 minuti, per seguire lo stesso spostamento
    const visualStart = Math.max(currentMinutes, windowStartMin);
    const visualEnd = Math.min(visualStart + 30, windowEndMin);
    const minutesFromWindowStart = Math.max(0, visualStart - windowStartMin);
    const fullHoursAfterStart = Math.floor(minutesFromWindowStart / 60);
    const minutesIntoCurrentHour = minutesFromWindowStart % 60;
    const topBlocks = fullHoursAfterStart === 0 ? 0 : (firstHourGap + (fullHoursAfterStart - 1) * firstHourGap);
    let top = topBlocks + minutesIntoCurrentHour * (firstHourGap / 60);
    const visualOffsetMinutes = 30;
    top += visualOffsetMinutes * (firstHourGap / 60);
    // Replica la correzione del centro applicata alle task
    const applyTrim = (h: number, endsOnHour: boolean) => endsOnHour ? Math.max(20, h - 2) : Math.max(20, h);
    const endsOnHour = (visualEnd % 60) === 0;
    const prevHeight = applyTrim((visualEnd - visualStart) * (hourGap / 60), endsOnHour);
    const height = applyTrim((visualEnd - visualStart) * (firstHourGap / 60), endsOnHour);
    const delta = height - prevHeight;
    top -= delta; // compensazione completa del delta
    return top;
  };

  // Build events from habits for the selected day
  type OggiEvent = { id: string; title: string; startTime: string; endTime: string; isAllDay: boolean; color: string };
  const weekday = useMemo(() => {
    const d = currentDate;
    return d.getDay(); // 0=Sunday
  }, [currentDate]);
  const dayOfMonth = useMemo(() => currentDate.getDate(), [currentDate]);
  const monthIndex1 = useMemo(() => currentDate.getMonth() + 1, [currentDate]);

  const { timedEvents, allDayEvents } = useMemo(() => {
    const items: OggiEvent[] = [];
    const allDay: OggiEvent[] = [];
    for (const h of habits) {
      // Respect creation date: show only from createdAt (inclusive) onward,
      // except when there is an explicit time override for the selected date.
      const selectedYmd = getDay(currentDate);
      const hasOverrideForSelected = !!h.timeOverrides?.[selectedYmd];
      if (h.createdAt && selectedYmd < h.createdAt && !hasOverrideForSelected) {
        continue;
      }
      // Filter by schedule day
      const sched = h.schedule;
      let showToday = true;
      if (sched) {
        const dow = sched.daysOfWeek ?? [];
        const mdays = sched.monthDays ?? [];
        const yrM = sched.yearMonth ?? null;
        const yrD = sched.yearDay ?? null;
        // Our UI selects Mon..Sun mapped to 1..6,0 (Sunday)
        const weeklyApplies = dow.length === 0 || dow.includes(weekday);
        const monthlyApplies = mdays.length > 0 ? mdays.includes(dayOfMonth) : true;
        const annualApplies = yrM && yrD ? (yrM === monthIndex1 && yrD === dayOfMonth) : true;
        showToday = weeklyApplies && monthlyApplies && annualApplies;
      } else {
        // If no explicit schedule, treat as daily (appears every day)
        // The createdAt check above already ensures we only show from creation date onward
        showToday = true;
      }
      if (!showToday) continue;

      // Effective times
      const ymd = selectedYmd; // same key used for overrides
      const overrideStart = h.timeOverrides?.[ymd];
      // One-off: if no weekly/monthly selection but has overrides, show only on override date
      const schedDays = h.schedule?.daysOfWeek ?? [];
      const schedMonth = h.schedule?.monthDays ?? [];
      const isOneOff = (schedDays.length === 0 && schedMonth.length === 0 && h.timeOverrides && Object.keys(h.timeOverrides).length > 0);
      if (isOneOff && !overrideStart) {
        continue;
      }

      // Weekly per-day override time if available
      const weekly = h.schedule?.weeklyTimes?.[weekday] ?? null;
      const monthlyT = h.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
      const start = overrideStart ?? (weekly?.start ?? monthlyT?.start ?? (h.schedule?.time ?? null));
      const end = (weekly?.end ?? monthlyT?.end ?? (h.schedule?.endTime ?? null));
      const color = h.color ?? '#3b82f6';
      const title = h.text;

      if (!start && !end) {
        allDay.push({ id: h.id, title, startTime: '00:00', endTime: '24:00', isAllDay: true, color });
      } else if (start && end) {
        items.push({ id: h.id, title, startTime: start, endTime: end === '23:59' ? '24:00' : end, isAllDay: false, color });
      } else if (start && !end) {
        // Single point time -> treat as 1h block for display
        const [sh] = start.split(':').map(Number);
        const nextHour = Math.min(24, sh + 1);
        const endStr = nextHour === 24 ? '24:00' : `${String(nextHour).padStart(2, '0')}:00`;
        items.push({ id: h.id, title, startTime: `${String(sh).padStart(2, '0')}:00`, endTime: endStr, isAllDay: false, color });
      } else if (!start && end) {
        // Only end provided -> show as last hour ending at end
        const [eh] = end.split(':').map(Number);
        const startHour = Math.max(0, eh - 1);
        items.push({ id: h.id, title, startTime: `${String(startHour).padStart(2, '0')}:00`, endTime: end === '23:59' ? '24:00' : end, isAllDay: false, color });
      }
    }

    // Past/future filtering
    // Show events for any selected day (past, today, future) according to schedule/overrides
    return { timedEvents: items, allDayEvents: allDay };
  }, [habits, weekday, dayOfMonth, currentDate, getDay]);

  // Compute columns for overlapping timed events
  type LayoutInfo = { col: number; columns: number };
  const layoutById = useMemo<Record<string, LayoutInfo>>(() => {
    const events = timedEvents.map(e => {
      const [sh, sm] = e.startTime.split(':').map(Number);
      const [eh, em] = e.endTime.split(':').map(Number);
      return { ...e, s: sh * 60 + sm, e: eh * 60 + em };
    }).sort((a, b) => a.s - b.s || a.e - b.e);
    const active: Array<{ id: string; end: number; col: number; group: number }> = [];
    const takenCols: boolean[] = [];
    let currentGroup = 0;
    const groupMaxCols: Record<number, number> = {};
    const assignment: Record<string, LayoutInfo & { group: number }> = {} as any;

    for (const ev of events) {
      // Remove non-overlapping from active
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].end <= ev.s) {
          takenCols[active[i].col] = false;
          active.splice(i, 1);
        }
      }
      // New cluster if active empty
      if (active.length === 0) {
        currentGroup += 1;
        takenCols.length = 0;
      }
      // Find first free column
      let col = 0;
      while (takenCols[col]) col++;
      takenCols[col] = true;
      active.push({ id: ev.id, end: ev.e, col, group: currentGroup });
      assignment[ev.id] = { col, columns: 1, group: currentGroup };
      groupMaxCols[currentGroup] = Math.max(groupMaxCols[currentGroup] ?? 0, col + 1);
    }
    // Assign group column counts
    Object.keys(assignment).forEach(id => {
      const grp = assignment[id].group;
      assignment[id].columns = groupMaxCols[grp] ?? 1;
    });
    const out: Record<string, LayoutInfo> = {};
    Object.entries(assignment).forEach(([id, v]) => { out[id] = { col: v.col, columns: v.columns }; });
    return out;
  }, [timedEvents]);

  const renderEvent = (event: OggiEvent) => {
    if (event.isAllDay) {
      const bg = forcedTaskColor === 'black' ? '#000000' : forcedTaskColor === 'white' ? '#ffffff' : event.color;
      const lightAllDay = isLightColor(bg);
      return (
        <View key={event.id} style={styles.allDayEvent}>
          <View style={styles.allDayDot} />
          <View style={[styles.eventBlock, { backgroundColor: bg }]}>
            <Text style={[styles.eventTitle, lightAllDay ? { color: '#111111' } : { color: THEME.text }]}>{event.title}</Text>
          </View>
        </View>
      );
    }

    const { top, height } = getEventPosition(event.startTime, event.endTime);
    if (top < 0 || height <= 0) return null;
    const screenWidth = Dimensions.get('window').width;
    const baseLeft = 65;
    const availableWidth = Math.max(0, screenWidth - baseLeft);
    const layout = layoutById[event.id] ?? { col: 0, columns: 1 };
    const colWidth = availableWidth / layout.columns;
    const spacing = layout.columns > 1 ? 2 : 0; // 2px spacing between overlapping events
    const leftPx = baseLeft + layout.col * colWidth + (layout.col * spacing);
    const widthPx = Math.max(0, colWidth - spacing);

    const bg = forcedTaskColor === 'black' ? '#000000' : forcedTaskColor === 'white' ? '#ffffff' : event.color;
    const light = isLightColor(bg);
    return (
      <View
        key={event.id}
        style={[
          styles.timedEvent,
          {
            top: top,
            height: Math.max(height, 20),
            backgroundColor: bg,
            left: leftPx,
            width: widthPx,
          }
        ]}
      >
        <Text style={[styles.eventTitle, light ? { color: '#111111' } : { color: THEME.text }]}>{event.title}</Text>
        {height >= 37 ? (
          <Text style={[styles.eventTime, light ? { color: '#111111' } : { color: THEME.text }]}>{event.startTime} - {event.endTime}</Text>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigateDate('prev')} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={[styles.dateText, isToday(currentDate, TZ) ? styles.todayDateText : styles.otherDateText]}>{todayDate}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigateDate('next')} style={styles.navButton}>
            <Ionicons name="chevron-forward" size={24} color={THEME.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)}>
            <Ionicons name="settings-outline" size={24} color={THEME.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* All Day Events */}
      {allDayEvents.length > 0 && (
        <View style={styles.allDaySection}>
          <View style={styles.allDayEvent}>
            <View style={styles.allDayDot} />
            <View style={styles.allDayBlocksRow}>
            {allDayEvents.map((e, idx) => {
              const light = isLightColor(e.color);
              return (
                <View
                  key={e.id}
                  style={[
                    styles.eventBlock,
                    { backgroundColor: e.color },
                    // Internal spacing between adjacent all-day blocks (no edge spacing)
                    { marginRight: idx < allDayEvents.length - 1 ? 4 : 0 }
                  ]}
                > 
                  <Text style={[styles.eventTitle, light ? { color: '#111111' } : { color: THEME.text }]} numberOfLines={2}>
                    {e.title}
                  </Text>
                </View>
              );
            })}
            </View>
          </View>
        </View>
      )}

      {/* Timeline */}
      <View style={styles.timelineContainer}>
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={{ height: totalScrollHeightPx }}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
        >
          <View style={[styles.timeline, { height: totalScrollHeightPx }]}>
            {/* Hour rows positioned absolutely - 00:00 always at top */}
            {hours.map((hour, index) => {
              const hourIndex = Math.floor(toMinutes(hour) / 60);
              const startHour = Math.floor(windowStartMin / 60);
              const relativeIndex = Math.max(0, hourIndex - startHour);
              // Position rows relative to windowStart: first visible hour at top 0
              let top = 0;
              if (relativeIndex === 0) {
                top = 0;
              } else {
                top = firstHourGap + (relativeIndex - 1) * firstHourGap;
              }
              
              return (
                <View 
                  key={hour} 
                  style={[
                    styles.hourRowAbsolute, 
                    { 
                      top: top,
                      height: hourGap
                    }
                  ]}
                >
                  <Text style={styles.hourText}>{hour}</Text>
                  <View style={styles.hourLine} />
                </View>
              );
            })}
            {/* Adaptive current time line (fits window start/end and scaling) */}
            {(() => {
              const timePosition = getCurrentTimePosition();
              if (timePosition === null) return null;
              return (
                <View
                  style={[
                    styles.currentTimeLine,
                    { top: timePosition }
                  ]}
                >
                  <View style={styles.currentTimeLineRed} />
                </View>
              );
            })()}
            {/* Events positioned absolutely */}
            {timedEvents.map(renderEvent)}
            
            
            {/* Bottom space accounted in totalScrollHeightPx */}
          </View>
        </ScrollView>
      </View>

      {/* Settings Modal */}
      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Finestra visibile</Text>

            {/* Task color override */}
            <View style={styles.counterGroup}>
              <Text style={styles.pickerLabel}>Colore task</Text>
              <View style={styles.counterRow}>
                <TouchableOpacity
                  accessibilityRole="button"
                  style={styles.stepBtn}
                  onPress={() => {
                    setForcedTaskColor(prev => {
                      if (prev === null) return 'black';
                      if (prev === 'black') return 'white';
                      return null;
                    });
                  }}
                >
                  <Text style={styles.stepBtnText}>
                    {forcedTaskColor === null ? 'Auto' : forcedTaskColor === 'black' ? 'Nero' : 'Bianco'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.counterGroup}>
              <Text style={styles.pickerLabel}>Inizio</Text>
              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.stepBtn, (() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    return startH <= 0 ? styles.stepBtnDisabled : {};
                  })()]}
                  onPress={() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    if (startH <= 0) return;
                    
                    const newStart = Math.max(0, startH - 1);
                    // Mantieni almeno 5 ore di distacco
                    const newEnd = Math.max(endH, newStart + 5);
                    setWindowStart(`${String(newStart).padStart(2, '0')}:00`);
                    setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                  }}
                >
                  <Text style={[styles.stepBtnText, (() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    return startH <= 0 ? styles.stepBtnTextDisabled : {};
                  })()]}>-</Text>
                </Pressable>
                <Text style={styles.timeText}>{windowStart}</Text>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.stepBtn, (() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    return startH >= 19 ? styles.stepBtnDisabled : {};
                  })()]}
                  onPress={() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    if (startH >= 19) return;
                    
                    const newStart = Math.min(19, startH + 1);
                    // Mantieni almeno 5 ore di distacco
                    const newEnd = Math.max(endH, newStart + 5);
                    setWindowStart(`${String(newStart).padStart(2, '0')}:00`);
                    setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                  }}
                >
                  <Text style={[styles.stepBtnText, (() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    return startH >= 19 ? styles.stepBtnTextDisabled : {};
                  })()]}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.counterGroup}>
              <Text style={styles.pickerLabel}>Fine</Text>
              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.stepBtn, (() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    return (startH === 0 && endH === 5) ? styles.stepBtnDisabled : {};
                  })()]}
                  onPress={() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    if (startH === 0 && endH === 5) return;
                    
                    // Se siamo a 5 ore esatte, scendi entrambi mantenendo 5 ore
                    if (endH - startH === 5) {
                      const newEnd = endH - 1;
                      const newStart = startH - 1;
                      setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                      setWindowStart(`${String(newStart).padStart(2, '0')}:00`);
                    } else {
                      // Altrimenti scendi solo la fine mantenendo almeno 5 ore
                      const newEnd = Math.max(startH + 5, endH - 1);
                      setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                    }
                  }}
                >
                  <Text style={[styles.stepBtnText, (() => {
                    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    return (startH === 0 && endH === 5) ? styles.stepBtnTextDisabled : {};
                  })()]}>-</Text>
                </Pressable>
                <Text style={styles.timeText}>{windowEnd}</Text>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.stepBtn, (() => {
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    return endH >= 24 ? styles.stepBtnDisabled : {};
                  })()]}
                  onPress={() => {
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    if (endH >= 24) return;
                    
                    const newEnd = Math.min(24, endH + 1);
                    setWindowEnd(newEnd === 24 ? '24:00' : `${String(newEnd).padStart(2, '0')}:00`);
                  }}
                >
                  <Text style={[styles.stepBtnText, (() => {
                    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                    return endH >= 24 ? styles.stepBtnTextDisabled : {};
                  })()]}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.counterGroup}>
              <Text style={styles.pickerLabel}>Ore visibili nella finestra attuale</Text>
              <View style={styles.counterRow}>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.stepBtn, visibleHours <= 5 ? styles.stepBtnDisabled : {}]}
                  onPress={() => setVisibleHours(h => Math.max(5, h - 1))}
                >
                  <Text style={[styles.stepBtnText, visibleHours <= 5 ? styles.stepBtnTextDisabled : {}]}>-</Text>
                </Pressable>
                <Text style={styles.timeText}>{visibleHours}</Text>
                <Pressable
                  accessibilityRole="button"
                  style={[styles.stepBtn, visibleHours >= 24 ? styles.stepBtnDisabled : {}]}
                  onPress={() => setVisibleHours(h => Math.min(24, h + 1))}
                >
                  <Text style={[styles.stepBtnText, visibleHours >= 24 ? styles.stepBtnTextDisabled : {}]}>+</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setShowSettings(false)}>
                <Text style={styles.actionText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: THEME.background
  },
  
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    backgroundColor: '#000000',
    borderBottomWidth: 1,
    borderBottomColor: '#374151'
  },
  navButton: {
    padding: 8
  },
  dateText: {
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize'
  },
  todayDateText: {
    color: '#ff3b30'
  },
  otherDateText: {
    color: '#ffffff'
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  settingsButton: {
    padding: 8
  },

  allDaySection: {
    paddingHorizontal: 0,
    paddingVertical: 2,
    borderBottomWidth: 0,
    borderBottomColor: 'transparent'
  },
  allDayEvent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
    paddingLeft: 65,
    paddingRight: 0
  },
  allDayBlocksRow: {
    flex: 1,
    flexDirection: 'row'
  },
  allDayDot: {
    position: 'absolute',
    left: 16,
    width: 32,
    height: 32,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    marginTop: 2
  },
  eventBlock: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    marginTop: 2
  },
  eventTitle: {
    color: THEME.text,
    fontSize: 14,
    fontWeight: '600'
  },

  timelineContainer: {
    flex: 1
  },
  scrollView: {
    flex: 1
  },
  timeline: {
    position: 'relative',
    paddingLeft: -23, // Spostato di 163px a destra (da 140 a -23)
    paddingRight: 0,
    marginTop: -4 // Riduce lo spazio sopra 00:00 di 4px
  },
  hourRowAbsolute: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center'
  },
  hourText: {
    color: THEME.text,
    fontSize: 16,
    width: 50,
    textAlign: 'right',
    marginRight: 10,
    marginLeft: 5, // Spostato di ulteriori +8px a destra rispetto a -3
    fontWeight: '700'
  },
  hourLine: {
    position: 'absolute',
    left: 65,
    right: 0,
    height: 2,
    backgroundColor: '#374151'
  },

  timedEvent: {
    position: 'absolute',
    left: 65, // base, width/left override per evento per sovrapposizioni
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    zIndex: 1,
    marginVertical: 1
  },
  eventTime: {
    color: THEME.text,
    fontSize: 13,
    marginTop: 2,
    fontWeight: '700'
  },

  currentTimeLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    zIndex: 10
  },
  currentTimeLineRed: {
    flex: 1,
    height: 2,
    backgroundColor: '#ff3b30'
  },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 24
  },
  modalCard: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderRadius: 16,
    padding: 16
  },
  modalTitle: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12
  },
  counterGroup: {
    marginTop: 8
  },
  pickerLabel: {
    color: THEME.textMuted,
    marginBottom: 8
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#374151'
  },
  stepBtnDisabled: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    opacity: 0.5
  },
  stepBtnText: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '700'
  },
  stepBtnTextDisabled: {
    color: '#6b7280'
  },
  timeText: {
    color: THEME.text,
    fontSize: 28,
    fontWeight: '800'
  },
  
  modalActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end'
  },
  actionBtn: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8
  },
  actionText: {
    color: THEME.text,
    fontWeight: '700'
  },

});