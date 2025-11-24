import { THEME } from '@/constants/theme';
import { isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, LayoutChangeEvent, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

// Dati di correzione manuale consolidati (trasferibili su altri dispositivi)
const INITIAL_MANUAL_CORRECTIONS: Record<number, Record<string, number>> = {"5":{"0.0833":-0.5,"0.1667":-0.5,"0.2500":-0.5,"0.3333":-0.25,"0.4167":-0.75,"0.5000":-0.5,"0.5833":-0.75,"0.6667":-0.5,"0.7500":-0.5,"0.8333":-0.5,"0.9167":-0.5,"1.0000":2},"6":{"0.2500":0,"0.3333":0,"0.4167":-0.5,"0.5833":-0.5,"0.6667":-0.5,"0.7500":0,"0.8333":0,"0.9167":0,"1.0000":2},"7":{"0.1667":-0.25,"0.3333":-0.25,"0.4167":-0.75,"0.5000":-0.25,"0.5833":-0.75,"0.6667":-0.75,"0.7500":-0.25,"1.0000":1.5,"0.2500":-0.25,"0.8333":-0.25,"0.9167":-0.25,"0.0833":-0.25},"8":{"0.0833":-0.75,"0.1667":-1,"0.2500":-1,"0.3333":-0.75,"0.7500":-0.75,"0.8333":-0.75,"0.9167":-0.75,"1.0000":0.75,"0.4167":-1.25,"0.5000":-0.75,"0.5833":-1.25,"0.6667":-1.25},"9":{"0.3333":-0.75,"0.4167":-1,"0.5000":-0.75,"0.5833":-1,"0.6667":-1,"0.7500":-0.75,"0.8333":-0.75,"0.9167":-0.75,"0.0833":-0.75,"0.1667":-0.75,"0.2500":-0.75,"1.0000":0.5},"10":{"0.4167":-1,"0.5000":-0.5,"0.5833":-1,"0.6667":-1,"1.0000":0.75,"0.0833":-0.5,"0.1667":-0.5,"0.2500":-0.5,"0.3333":-0.5,"0.7500":-0.75,"0.8333":-0.75,"0.9167":-0.75},"11":{"0.3333":-0.5,"0.4167":-1,"0.6667":-1,"0.5833":-1,"0.5000":-0.5,"0.7500":-0.5,"0.8333":-0.5,"0.9167":-0.5,"1.0000":0.5,"0.0833":-0.5,"0.1667":-0.5,"0.2500":-0.5},"12":{"0.6667":-0.75,"0.3333":-0.5,"0.5833":-0.75,"0.2500":-0.5,"0.1667":-0.5,"0.0833":-0.5,"0.4167":-0.75,"0.5000":-0.5,"0.9167":-0.5,"0.8333":-0.5,"0.7500":-0.5,"1.0000":0.5},"13":{"0.5000":-0.75,"0.4167":-1,"0.5833":-1,"0.6667":-1,"0.1667":-0.75,"0.0833":-0.75,"0.2500":-0.75,"0.3333":-0.75,"0.7500":-0.75,"0.8333":-0.75,"0.9167":-0.75,"1.0000":0.25},"14":{"0.0833":-3.5,"0.1667":-3.5,"0.2500":-3.5,"0.3333":-3.5,"0.4167":-3.75,"0.5000":-3.5,"0.5833":-3.75,"0.6667":-3.75,"0.7500":-3.5,"0.8333":-3.5,"0.9167":-3.5,"1.0000":-2.75},"15":{"0.0833":-3.25,"0.1667":-3.25,"0.2500":-3.25,"0.3333":-3.25,"0.4167":-3.25,"0.5000":-3.25,"0.5833":-3.25,"0.6667":-3.25,"0.7500":-3.25,"0.8333":-3.25,"0.9167":-3.25,"1.0000":-2.5},"16":{"0.0833":-2.75,"0.1667":-2.75,"0.2500":-2.75,"0.3333":-2.75,"0.4167":-3,"0.5000":-2.75,"0.5833":-3,"0.6667":-3,"0.7500":-2.75,"0.8333":-2.75,"0.9167":-2.75,"1.0000":-2},"17":{"0.0833":-2,"0.1667":-2,"0.2500":-2,"0.3333":-2,"0.4167":-2.25,"0.5000":-2,"0.5833":-2.25,"0.6667":-2.25,"0.7500":-2,"0.8333":-2,"0.9167":-2,"1.0000":-1.25},"18":{"0.9167":-2,"0.8333":-2,"0.7500":-2,"0.6667":-2.25,"0.5833":-2.25,"0.5000":-2,"0.0833":-2,"0.1667":-2,"0.2500":-2,"0.3333":-2,"0.4167":-2.25,"1.0000":-1.25},"19":{"0.0833":-1.75,"0.1667":-1.75,"0.2500":-1.75,"0.3333":-1.75,"0.4167":-2,"0.5000":-1.75,"0.5833":-2,"0.6667":-2,"0.7500":-1.75,"0.8333":-1.75,"0.9167":-1.75,"1.0000":-1.25},"20":{"0.0833":-1.5,"0.1667":-1.5,"0.2500":-1.5,"0.3333":-1.5,"0.4167":-1.75,"0.5000":-1.5,"0.5833":-1.75,"0.6667":-1.75,"0.7500":-1.5,"0.8333":-1.5,"0.9167":-1.5,"1.0000":-1},"21":{"0.0833":-1.5,"0.1667":-1.5,"0.2500":-1.5,"0.3333":-1.5,"0.4167":-1.5,"0.5000":-1.5,"0.5833":-1.5,"0.6667":-1.5,"0.7500":-1.5,"0.8333":-1.5,"0.9167":-1.5,"1.0000":-0.75},"22":{"0.0833":-1.75,"0.1667":-1.75,"0.2500":-1.75,"0.3333":-1.75,"0.4167":-1.75,"0.5000":-1.75,"0.5833":-1.75,"0.6667":-1.75,"0.7500":-1.75,"0.8333":-1.75,"0.9167":-1.75,"1.0000":-1.25},"23":{"0.0833":-1,"0.1667":-1,"0.2500":-1,"0.3333":-1,"0.4167":-1.25,"0.5000":-1.25,"0.5833":-1.25,"0.6667":-1.25,"0.7500":-1,"0.8333":-1,"0.9167":-1,"1.0000":-0.5},"24":{"0.0833":-0.75,"0.1667":-0.75,"0.2500":-0.75,"0.3333":-0.75,"0.7500":-0.75,"0.8333":-0.75,"0.9167":-0.75,"0.4167":-0.75,"0.5000":-0.75,"0.5833":-0.75,"0.6667":-0.75,"1.0000":-0.25}};
const INITIAL_GLOBAL_CORRECTIONS: Record<number, number> = {"6":2.25,"7":4.5,"8":6.5,"9":7.5,"10":8.25,"11":9,"12":9.5,"13":10.25,"14":13.5,"15":13.5,"16":13.5,"17":13,"18":13.25,"19":13.25,"20":13.25,"21":13.25,"22":13.75,"23":13.25,"24":13};

export default function OggiScreen() {
  const { habits, history, getDay } = useHabits();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [windowStart, setWindowStart] = useState<string>('06:00');
  const [windowEnd, setWindowEnd] = useState<string>('22:00');
  const [visibleHours, setVisibleHours] = useState<number>(24);
  const [forcedTaskColor, setForcedTaskColor] = useState<null | 'black' | 'white'>(null);
  const [manualCorrections, setManualCorrections] = useState<Record<number, Record<string, number>>>(INITIAL_MANUAL_CORRECTIONS);
  const [globalCorrections, setGlobalCorrections] = useState<Record<number, number>>(INITIAL_GLOBAL_CORRECTIONS);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null); // Task selezionata con doppio click
  const [taskDurationOffsets, setTaskDurationOffsets] = useState<Record<string, number>>({}); // Offset per durata task (chiave: durata in ore, es. "0.3333" per 20 min)
  const [globalTaskOffset, setGlobalTaskOffset] = useState<number>(0); // Offset globale per tutte le task (in step di 0.25px)
  const headerRef = useRef<View>(null);
  const allDayRef = useRef<View>(null);
  const [headerBottomY, setHeaderBottomY] = useState<number | null>(null); // Posizione Y del fondo dell'header (barra divisoria)
  const [allDayHeight, setAllDayHeight] = useState<number>(0); // Altezza sezione allDay
  const [showTaskMenu, setShowTaskMenu] = useState(false); // Mostra/nascondi menu task (doppio click)
  const [importText, setImportText] = useState<string>(''); // Testo per importazione
  
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
        const [start, end, vis, manualCorr, globalCorr, taskOffsets, globalOffset] = await Promise.all([
          AsyncStorage.getItem('oggi_window_start_v1'),
          AsyncStorage.getItem('oggi_window_end_v1'),
          AsyncStorage.getItem('oggi_visible_hours_v1'),
          AsyncStorage.getItem('oggi_manual_corrections_v1'),
          AsyncStorage.getItem('oggi_global_corrections_v1'),
          AsyncStorage.getItem('oggi_task_duration_offsets_v1'),
          AsyncStorage.getItem('oggi_global_task_offset_v1'),
        ]);
        if (start) setWindowStart(start);
        if (end) setWindowEnd(end);
        const v = vis ? parseInt(vis, 10) : NaN;
        if (!isNaN(v)) {
          // Calcola il massimo consentito basato sulla finestra
          const startH = start && start !== '24:00' ? parseInt(start.slice(0, 2), 10) : (start === '24:00' ? 24 : 0);
          const endH = end && end !== '24:00' ? parseInt(end.slice(0, 2), 10) : (end === '24:00' ? 24 : 24);
          const maxVisibleHours = endH - startH;
          setVisibleHours(Math.min(maxVisibleHours || 24, Math.max(5, v)));
        }
        if (manualCorr) {
          try {
            setManualCorrections(JSON.parse(manualCorr));
          } catch {}
        }
        if (globalCorr) {
          try {
            setGlobalCorrections(JSON.parse(globalCorr));
          } catch {}
        }
        if (taskOffsets) {
          try {
            setTaskDurationOffsets(JSON.parse(taskOffsets));
          } catch {}
        }
        if (globalOffset) {
          const offset = parseInt(globalOffset, 10);
          if (!isNaN(offset)) setGlobalTaskOffset(offset);
        }
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
    AsyncStorage.setItem('oggi_manual_corrections_v1', JSON.stringify(manualCorrections)).catch(() => {});
  }, [manualCorrections]);

  useEffect(() => {
    AsyncStorage.setItem('oggi_global_corrections_v1', JSON.stringify(globalCorrections)).catch(() => {});
  }, [globalCorrections]);

  useEffect(() => {
    AsyncStorage.setItem('oggi_task_duration_offsets_v1', JSON.stringify(taskDurationOffsets)).catch(() => {});
  }, [taskDurationOffsets]);

  useEffect(() => {
    AsyncStorage.setItem('oggi_global_task_offset_v1', String(globalTaskOffset)).catch(() => {});
  }, [globalTaskOffset]);

  useEffect(() => {
    const v = forcedTaskColor ?? 'auto';
    AsyncStorage.setItem('oggi_forced_task_color_v1', v).catch(() => {});
  }, [forcedTaskColor]);

  // Limita automaticamente visibleHours alla differenza tra windowEnd e windowStart
  useEffect(() => {
    const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
    const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
    const maxVisibleHours = endH - startH;
    
    // Aggiorna visibleHours solo se supera il massimo consentito
    setVisibleHours(prev => {
      if (prev > maxVisibleHours) {
        return Math.max(5, Math.min(24, maxVisibleHours));
      }
      return prev;
    });
  }, [windowStart, windowEnd]);


  const toMinutes = (hhmm: string) => {
    if (hhmm === '24:00') return 1440;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const windowStartMin = toMinutes(windowStart);
  const windowEndMin = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
  
  // Calcolo spazio disponibile basato sulla posizione della barra divisoria (header + allDay)
  // Invece di usare screenHeight, usiamo la posizione effettiva della barra divisoria
  const screenHeight = Dimensions.get('window').height;
  const tabBarHeight = 80; // Altezza tab bar + safe area bottom (approssimativo)
  
  // Calcola la posizione della barra divisoria (fine header + allDay se presente)
  const dividerY = headerBottomY !== null ? headerBottomY + allDayHeight : null;
  
  // Se abbiamo misurato, usa quella posizione, altrimenti fallback fisso
  const availableTimelineHeight = dividerY 
    ? screenHeight - dividerY - tabBarHeight
    : screenHeight - 110 - tabBarHeight; // Fallback: header ~50px + allDay ~60px se presente
  
  // Calcolo fattore di scala per allineare task su iPhone diversi
  // Usa lo spazio disponibile invece dell'altezza totale dello schermo
  const referenceTimelineHeight = 802; // Spazio timeline di riferimento (iPhone 17 Pro Max)
  const scaleFactor = availableTimelineHeight / referenceTimelineHeight;
  
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

  const getEventPosition = (startTime: string, endTime: string, taskId?: string) => {
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
    
    // Sistema di calcolo specifico per 5 ore visibili
    let baseTop: number;
    if (visibleHours === 5) {
      // Calcolo specifico per 5 ore visibili
      // Usa una formula diversa per garantire allineamento perfetto
      const hourGapFor5Hours = firstHourGap; // Usa firstHourGap per 5 ore
      baseTop = fullHoursAfterStart * hourGapFor5Hours + minutesIntoCurrentHour * (hourGapFor5Hours / 60);
    } else {
      // Calcolo standard per altre ore visibili
      // Ancoriamo alla stessa logica delle righe: prima ora a 0, poi blocchi da firstHourGap
      const topBlocks = fullHoursAfterStart === 0 ? 0 : (firstHourGap + (fullHoursAfterStart - 1) * firstHourGap);
      baseTop = topBlocks + minutesIntoCurrentHour * (firstHourGap / 60);
      
      // Correzione progressiva per contrastare lo slittamento verso l'alto sul telefono fisico
      // Man mano che aumentano le ore visibili (e firstHourGap diminuisce), aggiungiamo offset in giù
      // Fattore sperimentale: 0.5px per ogni ora oltre le 5
      const zoomCorrection = (visibleHours - 5) * 0.5;
      baseTop += zoomCorrection;
    }
    
    // Calcoliamo tutte le correzioni separatamente, poi le applichiamo con fattore di scala
    let totalCorrection = 0;
    
    // Correzione per task di diverse lunghezze basata su formula generica - RIMOSSA
    // Questa formula causava lo scivolamento in basso delle task lunghe
    /*
    const taskDurationHours = (visibleEnd - visibleStart) / 60;
    if (taskDurationHours > 1.1) {
      const durationFactor = taskDurationHours - 1;
      const correctionMinutes = Math.max(0, -1.25 * durationFactor * visibleHours + 30 * durationFactor);
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      totalCorrection += correctionPx;
    }
    */
    
    // Manteniamo solo una correzione fissa di base per task lunghe (>60 min) se necessario
    // Per ora proviamo a non aggiungere nulla (0 offset extra) per vedere se si allineano naturalmente
    // dato che la griglia è regolare.
    const taskDurationHours = (visibleEnd - visibleStart) / 60;
    if (taskDurationHours > 1.1) {
       // Applica lo stesso offset base delle task di 1 ora (3.5px) per coerenza
       totalCorrection += 3.5;
    }
    
    // Correzione specifica SOLO per 10 minuti (0.1667 ore)
    if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // Range pi? stretto per 10 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      totalCorrection += correctionPx;
    }
    
    // Correzione specifica SOLO per 5 minuti (0.0833 ore)
    if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // Range pi? stretto per 5 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      totalCorrection += correctionPx;
    }
    
    // Correzione specifica SOLO per 15 minuti (0.25 ore)
    if (Math.abs(taskDurationHours - 0.25) < 0.05) { // Range pi? stretto per 15 minuti
      const correctionMinutes = 1; // Sposta in gi? di 1 minuto
      const correctionPx = correctionMinutes * (firstHourGap / 60);
      totalCorrection += correctionPx;
    }
    
    // Correzioni specifiche per durata rimosse per uniformità
    // Ora tutte le task (5-60 min) usano lo stesso offset fisso di 3.5px
    
    // Correzione globale per tutti gli orari: sposta tutto giù di 5.5 minuti
    // Spostato su di 1 pixel come richiesto (-1)
    const globalOffset = 5.5 * (firstHourGap / 60) - 1;
    totalCorrection += globalOffset;
    
    // Correzione per task da 5 a 55 minuti con valori specifici calibrati dall'utente
    // Base di partenza era 3.5px. Le correzioni sono: 1 unità = 0.25px
    const taskFullDurationMinutes = endMinutes - startMinutes;
    if (taskFullDurationMinutes >= 5 && taskFullDurationMinutes <= 55) {
      let specificPixelOffset = 0;
      
      if (taskFullDurationMinutes === 5) specificPixelOffset = -8 * 0.25;        // -2px
      else if (taskFullDurationMinutes === 10) specificPixelOffset = -8 * 0.25;  // -2px
      else if (taskFullDurationMinutes === 15) specificPixelOffset = -8 * 0.25;  // -2px
      else if (taskFullDurationMinutes === 20) specificPixelOffset = 2 * 0.25;   // +0.5px
      else if (taskFullDurationMinutes === 25) specificPixelOffset = 3 * 0.25;   // +0.75px
      else if (taskFullDurationMinutes === 30) specificPixelOffset = 1 * 0.25;   // +0.25px
      else if (taskFullDurationMinutes === 35) specificPixelOffset = 3 * 0.25;   // +0.75px
      else if (taskFullDurationMinutes === 40) specificPixelOffset = 3 * 0.25;   // +0.75px
      else if (taskFullDurationMinutes === 45) specificPixelOffset = 2 * 0.25;   // +0.5px
      else if (taskFullDurationMinutes === 50) specificPixelOffset = 2 * 0.25;   // +0.5px
      else if (taskFullDurationMinutes === 55) specificPixelOffset = 2 * 0.25;   // +0.5px
      
      // Applica la base (3.5) + la correzione specifica
      // Fallback a 3.5px per durate intermedie non specificate (es. 12 min)
      totalCorrection += (3.5 + specificPixelOffset);
    }
    
    // Correzione specifica per task di 1 ora: sposta giù di 3.5px (FISSO)
    // NON TOCCARE - Questa è perfetta
    if (Math.abs(taskFullDurationMinutes - 60) < 1) { // Se dura esattamente 60 minuti (1 ora)
      // 3.5 pixel in giù, fisso
      const oneHourCorrectionPx = 3.5;
      totalCorrection += oneHourCorrectionPx; // Aggiunta diretta pixel
    }
 
    // Correzione per 5 ore visibili - NON toccare 24 ore
    if (visibleHours === 5) {
      // Correzione specifica per 5 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.0833) < 0.05) { // 5 minuti
        const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        totalCorrection += correctionPx;
      }
      
      // Correzione specifica per 10 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.1667) < 0.05) { // 10 minuti
        const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        totalCorrection += correctionPx;
      }
      
      // Correzione specifica per 15 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.25) < 0.05) { // 15 minuti
        const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        totalCorrection += correctionPx;
      }
      
       // Correzione specifica per 20 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.333) < 0.05) { // 20 minuti
         const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60) - 0.25; // 0.25px in su
        totalCorrection += correctionPx;
       }
      
      // Correzione specifica per 25 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.417) < 0.05) { // 25 minuti
        const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60) - 0.25; // 0.25px in su
        totalCorrection += correctionPx;
      }
      
      // Correzione specifica per 30 minuti quando visibleHours === 5
      if (Math.abs(taskDurationHours - 0.5) < 0.05) { // 30 minuti
        const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        totalCorrection += correctionPx;
      }
      
       // Correzione specifica per 35 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.583) < 0.05) { // 35 minuti
         const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60) - 0.25; // 0.25px in su
        totalCorrection += correctionPx;
       }
       
       // Correzione specifica per 40 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.667) < 0.05) { // 40 minuti
         const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60) - 0.5; // Altri 0.25px in su (totale 0.5)
        totalCorrection += correctionPx;
       }
       
       // Correzione specifica per 45 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.75) < 0.05) { // 45 minuti
         const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        totalCorrection += correctionPx;
       }
       
       // Correzione specifica per 50 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.833) < 0.05) { // 50 minuti
         const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        totalCorrection += correctionPx;
       }
       
       // Correzione specifica per 55 minuti quando visibleHours === 5
       if (Math.abs(taskDurationHours - 0.917) < 0.05) { // 55 minuti
         const correctionMinutes = 0; 
        const correctionPx = correctionMinutes * (firstHourGap / 60);
        totalCorrection += correctionPx;
       }
     }
    
    // Applica eventuali correzioni manuali salvate per durata/orario visibile
    const fullDurationHours = (endMinutes - startMinutes) / 60;
    
    // IGNORA correzioni manuali anche qui per task di 1 ora (60 minuti)
    // Questo elimina qualsiasi differenza dovuta a salvataggi diversi tra simulatore e telefono
    if (Math.abs(fullDurationHours - 1.0) >= 0.01) {
      const manualKey = fullDurationHours.toFixed(4);
      const manualCorrection = manualCorrections[visibleHours]?.[manualKey];
      if (manualCorrection !== undefined) {
        totalCorrection += manualCorrection;
      }
    }

    // Applica correzione globale salvata (sovrascrive/aggiunge a quella hardcoded)
    const savedGlobal = globalCorrections[visibleHours];
    if (savedGlobal !== undefined) {
      totalCorrection += savedGlobal;
    }
    
    // RIMOSSO scaleFactor: Applica correzioni in valore assoluto
    // La griglia è fissa, quindi le correzioni devono essere fisse per tutti i dispositivi
    let top = baseTop + totalCorrection;
    
    // Applica offset globale per tutte le task (FISSO)
    const globalOffsetPx = globalTaskOffset * 0.25;
    top += globalOffsetPx;
    
    // Applica offset per tutte le task con la stessa durata (FISSO)
    // Usa la durata come chiave (es. "0.3333" per 20 minuti)
    const visibleDurationHours = (visibleEnd - visibleStart) / 60;
    const durationKey = visibleDurationHours.toFixed(4);
    
    // IGNORA correzioni manuali salvate per task di esattamente 1 ora (60 minuti)
    // Questo garantisce che siano sempre sincronizzate tra dispositivi basandosi solo sul codice
    const isOneHour = Math.abs((visibleEnd - visibleStart) - 60) < 1;
    
    if (!isOneHour && taskDurationOffsets[durationKey] !== undefined) {
      const durationOffsetPx = taskDurationOffsets[durationKey] * 0.25;
      top += durationOffsetPx;
    }
 
     // Current height with hourGap (baseline used so center stays fixed after resize)
     let prevHeight = (visibleEnd - visibleStart) * (hourGap / 60);
     
     // Calcolo altezza specifico per 5 ore visibili
     let height: number;
     if (visibleHours === 5) {
       // Altezza specifica per 5 ore visibili
       const hourGapFor5Hours = firstHourGap;
       height = (visibleEnd - visibleStart) * (hourGapFor5Hours / 60);
     } else {
       // Altezza standard per altre ore visibili
       // Target height so that 60min == firstHourGap per current scale
       height = (visibleEnd - visibleStart) * (firstHourGap / 60);
     }
     
     // Correzione specifica: riduci task di 1 ora di 1 pixel
     const fullDurationMinutes = endMinutes - startMinutes;
     if (Math.abs(fullDurationMinutes - 60) < 1) { // Se dura esattamente 60 minuti (1 ora)
       height -= 1;
     }
     
     // Prevent bottom edge from crossing the hour line when ending exactly on an hour
    const endsOnHour = (endMinutes % 60) === 0;
    
    // Logica di accorciamento per evitare sovrapposizione con linea oraria
    let bottomGapPx = 0;
    
    if (endsOnHour) {
      const durationMins = endMinutes - startMinutes;
      const isExactlyOneHour = Math.abs(durationMins - 60) < 1;
      
      // Se finisce sull'ora E NON è di 1 ora esatta (che è già a posto)
      // Accorcia di 3.25 pixel per staccarsi bene dalla linea
      if (!isExactlyOneHour) {
        bottomGapPx = 3.25;
      } else {
        // Per task di 1 ora manteniamo il gap esistente (se c'era) o lo impostiamo a 2 come da vecchio codice
        bottomGapPx = 2; 
      }
    }

    const applyTrim = (h: number) => {
      if (endsOnHour) {
        return Math.max(1, h - bottomGapPx);
      }
      return Math.max(1, h);
    };
    prevHeight = applyTrim(prevHeight);
    height = applyTrim(height);

    // Abbiamo rimosso la compensazione del centro (top -= delta / 2) 
    // per mantenere il punto di partenza (top) fisso e modificare solo la fine (height).

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
     
     // Replica la correzione del centro applicata alle task
    const applyTrim = (h: number, endsOnHour: boolean) => endsOnHour ? Math.max(20, h - 2) : Math.max(20, h);
    const endsOnHour = (visualEnd % 60) === 0;
    const prevHeight = applyTrim((visualEnd - visualStart) * (hourGap / 60), endsOnHour);
    const height = applyTrim((visualEnd - visualStart) * (firstHourGap / 60), endsOnHour);
    const delta = height - prevHeight;
    // top -= delta; // compensazione completa del delta
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

  const lastPressTime = React.useRef<{ id: string; time: number } | null>(null);
  
  const handleTaskPress = (event: OggiEvent) => {
    const now = Date.now();
    // Controlla se è un doppio click (stessa task entro 300ms)
    if (lastPressTime.current?.id === event.id && now - lastPressTime.current.time < 300) {
      // Doppio click: apri menu task
      setSelectedTaskId(event.id);
      setShowTaskMenu(true);
      lastPressTime.current = null;
    } else {
      // Singolo click: salva per possibile doppio click
      lastPressTime.current = { id: event.id, time: now };
      // Dopo 300ms, se non c'è stato doppio click, esegui azione singolo click
      setTimeout(() => {
        if (lastPressTime.current?.id === event.id && lastPressTime.current.time === now) {
          // Singolo click normale (future implementation: open task details)
          lastPressTime.current = null;
        }
      }, 300);
    }
  };

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

    const { top, height } = getEventPosition(event.startTime, event.endTime, event.id);
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
      <TouchableOpacity
        key={event.id}
        activeOpacity={0.7}
        onPress={() => handleTaskPress(event)}
        style={[
          styles.timedEvent,
          {
            top: top,
            height: Math.max(height, 1),
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
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {/* Header */}
      <View 
        ref={headerRef}
        style={styles.header}
        onLayout={(event: LayoutChangeEvent) => {
          const { y, height } = event.nativeEvent.layout;
          // y è la posizione top, y + height è la posizione bottom (barra divisoria)
          setHeaderBottomY(y + height);
        }}
      >
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
        <View 
          ref={allDayRef}
          style={styles.allDaySection}
          onLayout={(event: LayoutChangeEvent) => {
            const { height } = event.nativeEvent.layout;
            setAllDayHeight(height);
          }}
        >
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
            {/* Adaptive current time line (fits window start/end and scaling) - RIMOSSA COME RICHIESTO */}
            {/* 
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
            */}
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
                {(() => {
                  const startH = windowStart === '24:00' ? 24 : parseInt(windowStart.slice(0, 2), 10);
                  const endH = windowEnd === '24:00' ? 24 : parseInt(windowEnd.slice(0, 2), 10);
                  const maxVisibleHours = endH - startH;
                  return (
                    <>
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
                        style={[styles.stepBtn, visibleHours >= maxVisibleHours ? styles.stepBtnDisabled : {}]}
                        onPress={() => setVisibleHours(h => Math.min(maxVisibleHours, h + 1))}
                >
                        <Text style={[styles.stepBtnText, visibleHours >= maxVisibleHours ? styles.stepBtnTextDisabled : {}]}>+</Text>
                </Pressable>
                    </>
                  );
                })()}
              </View>
            </View>

            {/* Esporta/Importa impostazioni */}
            <View style={styles.counterGroup}>
              <Text style={styles.pickerLabel}>Sincronizza correzioni tra dispositivi</Text>
              
              {/* Mostra tutte le correzioni salvate */}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#6366f1', marginBottom: 8 }]}
                onPress={async () => {
                  const allCorrections = {
                    taskDurationOffsets,
                    globalTaskOffset,
                    manualCorrections,
                    globalCorrections,
                  };
                  const jsonString = JSON.stringify(allCorrections, null, 2);
                  await Clipboard.setStringAsync(jsonString);
                  Alert.alert('Esportato!', 'Tutte le correzioni sono state copiate negli appunti.\n\nIncolla questo JSON sul tuo altro dispositivo per sincronizzare.');
                }}
              >
                <Text style={styles.actionText}>Esporta tutte le correzioni</Text>
              </TouchableOpacity>
              
              <Text style={[styles.pickerLabel, { fontSize: 11, marginTop: 4, marginBottom: 8 }]}>
                Include: offset durata task, offset globale, correzioni manuali
              </Text>
              
              <TextInput
                style={styles.textInput}
                placeholder="Incolla qui il JSON esportato dall'altro dispositivo..."
                placeholderTextColor="#6b7280"
                value={importText}
                onChangeText={setImportText}
                multiline
                numberOfLines={6}
              />
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#f59e0b', marginTop: 8 }]}
                onPress={() => {
                  try {
                    const imported = JSON.parse(importText);
                    let importedCount = 0;
                    
                    if (imported.taskDurationOffsets) {
                      setTaskDurationOffsets(imported.taskDurationOffsets);
                      importedCount += Object.keys(imported.taskDurationOffsets).length;
                    }
                    if (imported.globalTaskOffset !== undefined) {
                      setGlobalTaskOffset(imported.globalTaskOffset);
                      importedCount += 1;
                    }
                    if (imported.manualCorrections) {
                      setManualCorrections(imported.manualCorrections);
                      importedCount += Object.keys(imported.manualCorrections).length;
                    }
                    if (imported.globalCorrections) {
                      setGlobalCorrections(imported.globalCorrections);
                      importedCount += Object.keys(imported.globalCorrections).length;
                    }
                    
                    setImportText('');
                    Alert.alert('Importato!', `Sincronizzate ${importedCount} correzioni con successo.\n\nLe task ora dovrebbero essere allineate come sul dispositivo di origine.`);
                  } catch (e) {
                    Alert.alert('Errore', 'JSON non valido. Controlla di aver incollato correttamente il JSON esportato.');
                  }
                }}
              >
                <Text style={styles.actionText}>Importa e sincronizza</Text>
              </TouchableOpacity>
              
              {/* Mostra riepilogo correzioni */}
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#6b7280', marginTop: 12 }]}
                onPress={() => {
                  const summary = {
                    'Offset durata task': Object.keys(taskDurationOffsets).length,
                    'Offset globale': globalTaskOffset !== 0 ? 1 : 0,
                    'Correzioni manuali': Object.keys(manualCorrections).length,
                    'Correzioni globali': Object.keys(globalCorrections).length,
                  };
                  const summaryText = Object.entries(summary)
                    .filter(([_, count]) => count > 0)
                    .map(([key, count]) => `${key}: ${count}`)
                    .join('\n') || 'Nessuna correzione salvata';
                  
                  Alert.alert('Riepilogo correzioni', summaryText);
                }}
              >
                <Text style={styles.actionText}>Mostra riepilogo</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => setShowSettings(false)}>
                <Text style={styles.actionText}>Chiudi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Task Menu piccolo (doppio click) - allungato sotto */}
      <Modal visible={showTaskMenu} animationType="slide" transparent onRequestClose={() => {
        setShowTaskMenu(false);
        setSelectedTaskId(null);
      }}>
        <View style={styles.modalBackdrop}>
          <Pressable 
            style={{ flex: 1 }} 
            onPress={() => {
              setShowTaskMenu(false);
              setSelectedTaskId(null);
            }}
          />
          <View style={styles.taskMenuCard}>
            {selectedTaskId && (() => {
              const selectedTask = timedEvents.find(e => e.id === selectedTaskId);
              if (!selectedTask) return null;
              const [startH, startM] = selectedTask.startTime.split(':').map(Number);
              const [endH, endM] = selectedTask.endTime.split(':').map(Number);
              const startMin = startH * 60 + startM;
              const endMin = endH * 60 + endM;
              const durationMinutes = endMin - startMin;
              const durationHours = durationMinutes / 60;
              const durationKey = durationHours.toFixed(4);
              
              // Mostra solo se la durata è tra 5 e 60 minuti
              if (durationMinutes < 5 || durationMinutes > 60) {
                return (
                  <View style={styles.taskMenuContent}>
                    <Text style={styles.taskMenuTitle}>Durata non supportata</Text>
                    <Text style={[styles.pickerLabel, { fontSize: 12 }]}>
                      Seleziona una task tra 5 e 60 minuti
                    </Text>
                    <TouchableOpacity 
                      style={[styles.actionBtn, { marginTop: 12 }]} 
                      onPress={() => {
                        setShowTaskMenu(false);
                        setSelectedTaskId(null);
                      }}
                    >
                      <Text style={styles.actionText}>Chiudi</Text>
                    </TouchableOpacity>
                  </View>
                );
              }
              
              return (
                <View style={styles.taskMenuContent}>
                  <Text style={styles.taskMenuTitle}>{selectedTask.title}</Text>
                  <Text style={[styles.pickerLabel, { fontSize: 11, marginBottom: 12 }]}>
                    {durationMinutes} minuti
                  </Text>
                  
                  {/* Sposta singolo (task con stessa durata) */}
                  <View style={styles.taskMenuRow}>
                    <Text style={[styles.pickerLabel, { fontSize: 13, marginRight: 12, width: 80 }]}>
                      Singolo
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.stepBtn, { width: 36, height: 36 }]}
                      onPress={() => {
                        setTaskDurationOffsets(prev => ({
                          ...prev,
                          [durationKey]: (prev[durationKey] || 0) - 1
                        }));
                      }}
                    >
                      <Text style={styles.stepBtnText}>-</Text>
                    </Pressable>
                    <Text style={[styles.timeText, { fontSize: 16, marginHorizontal: 16 }]}>
                      {taskDurationOffsets[durationKey] || 0}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.stepBtn, { width: 36, height: 36 }]}
                      onPress={() => {
                        setTaskDurationOffsets(prev => ({
                          ...prev,
                          [durationKey]: (prev[durationKey] || 0) + 1
                        }));
                      }}
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </Pressable>
                  </View>

                  {/* Sposta tutte */}
                  <View style={styles.taskMenuRow}>
                    <Text style={[styles.pickerLabel, { fontSize: 13, marginRight: 12, width: 80 }]}>
                      Tutte
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.stepBtn, { width: 36, height: 36 }]}
                      onPress={() => setGlobalTaskOffset(prev => prev - 1)}
                    >
                      <Text style={styles.stepBtnText}>-</Text>
                    </Pressable>
                    <Text style={[styles.timeText, { fontSize: 16, marginHorizontal: 16 }]}>
                      {globalTaskOffset}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.stepBtn, { width: 36, height: 36 }]}
                      onPress={() => setGlobalTaskOffset(prev => prev + 1)}
                    >
                      <Text style={styles.stepBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })()}
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
    color: '#FF0000'
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
    color: '#FFFFFF',
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
    backgroundColor: '#FF0000'
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
  textInput: {
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
    borderRadius: 8,
    padding: 12,
    color: THEME.text,
    fontSize: 12,
    fontFamily: 'monospace',
    minHeight: 100,
    textAlignVertical: 'top'
  },
  taskMenuCard: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 20,
    maxHeight: '40%',
  },
  taskMenuContent: {
    alignItems: 'center',
  },
  taskMenuTitle: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    textAlign: 'center',
  },
  taskMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginTop: 16,
  }

});