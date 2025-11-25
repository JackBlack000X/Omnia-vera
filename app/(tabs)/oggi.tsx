import { THEME } from '@/constants/theme';
import { isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const TZ = 'Europe/Zurich';

// -- Helper Functions --

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

function toMinutes(hhmm: string) {
  if (hhmm === '24:00') return 1440;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(minutes: number): string {
  if (minutes >= 1440) return '24:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// -- Constants for Layout --
// HOUR_HEIGHT moved to state to allow zooming
// Margine sinistro per lasciare spazio all'etichetta dell'ora (es. "09:00")
const LEFT_MARGIN = 65;
const BASE_VERTICAL_OFFSET = 10;
const DRAG_VISUAL_OFFSET = BASE_VERTICAL_OFFSET + 2; // compensate grid offset during drag
// Altezza del separatore (linea grigia)
const SEPARATOR_HEIGHT = 1;
// Font size per l'etichetta dell'ora
const HOUR_FONT_SIZE = 14;

type OggiEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  color: string;
};

type DraggableEventProps = {
  event: OggiEvent;
  layoutStyle: { top: number; height: number; left: number; width: number };
  baseTop: number;
  dragY: SharedValue<number>;
  dragInitialTop: SharedValue<number>;
  draggingEventId: string | null;
  setDraggingEventId: (id: string | null) => void;
  windowStartMin: number;
  hourHeight: number;
  currentDate: Date;
  getDay: (date: Date) => string;
  setTimeOverrideRange: (habitId: string, ymd: string, start: string, end: string) => void;
  updateScheduleTimes: (habitId: string, start: string | null, end: string | null) => void;
  setPendingEventPositions: Dispatch<SetStateAction<Record<string, number>>>;
  setRecentlyMovedEventId: (id: string | null) => void;
  setLastMovedEventId: (id: string) => void;
  setCurrentDragPosition: (minutes: number | null) => void;
  timedEvents: OggiEvent[];
  layoutById: Record<string, { col: number; columns: number }>;
  calculateDragLayout: (draggedEventId: string, newStartMinutes: number) => { width: number; left: number };
};

function DraggableEvent({
  event,
  layoutStyle,
  baseTop,
  dragY,
  dragInitialTop,
  draggingEventId,
  setDraggingEventId,
  windowStartMin,
  hourHeight,
  currentDate,
  getDay,
  setTimeOverrideRange,
  updateScheduleTimes,
  setPendingEventPositions,
  setRecentlyMovedEventId,
  setLastMovedEventId,
  setCurrentDragPosition,
  timedEvents,
  layoutById,
  calculateDragLayout,
}: DraggableEventProps) {
  const isDragging = draggingEventId === event.id;
  const bg = event.color;
  const light = isLightColor(bg);

  // Shared values for dynamic width and left during drag
  const dragWidthValue = useSharedValue(layoutStyle.width);
  const dragLeftValue = useSharedValue(layoutStyle.left);

  // Flag locale per gestire lo stato nello stesso gesto
  const isDragActiveRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnappedMinuteRef = useRef<number | null>(null);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      // 1. Cattura il tocco immediatamente
      onStartShouldSetPanResponder: () => true,
      
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Se il drag è già attivo, cattura sempre
        if (isDragActiveRef.current) return true;
        // Altrimenti, cattura solo se movimento verticale significativo
        return Math.abs(gestureState.dy) > 5;
      },

      // 2. Impedisce alla ScrollView nativa di interrompere il gesto se il drag è attivo
      onShouldBlockNativeResponder: () => isDragActiveRef.current,

      onPanResponderGrant: (evt) => {
        // Reset del tracking della linea di snap
        lastSnappedMinuteRef.current = null;
        
        // Avvia il timer: se l'utente tiene premuto senza muoversi troppo per 200ms...
        longPressTimerRef.current = setTimeout(() => {
          isDragActiveRef.current = true; // ...ATTIVA il drag
          
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          
          setDraggingEventId(event.id);
          dragInitialTop.value = baseTop;
          dragY.value = 0;
        }, 200); // 200ms di attesa
      },

      onPanResponderMove: (evt, gestureState) => {
        // Se l'utente si muove TROPPO in orizzontale prima che il timer scatti, annulla il drag (permette swipe)
        if (!isDragActiveRef.current && Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          return;
        }

        // Se il timer non è ancora scattato, non fare nulla (permette alla ScrollView di funzionare se ci si muove subito)
        if (!isDragActiveRef.current) {
          return;
        }

        // 3. Se isDragActive è true, muovi l'elemento
        const rawY = gestureState.dy;
        const currentTop = dragInitialTop.value + rawY;
        const relativeTop = Math.max(0, currentTop - DRAG_VISUAL_OFFSET);
        const minutesFromStart = (relativeTop / hourHeight) * 60;
        const newStartMinutes = windowStartMin + minutesFromStart;
        const roundedMinutes = Math.round(newStartMinutes / 15) * 15;
        const clampedMinutes = Math.max(0, Math.min(1440, roundedMinutes));
        const snappedMinutesFromStart = clampedMinutes - windowStartMin;
        const snappedTop = (snappedMinutesFromStart / 60) * hourHeight + DRAG_VISUAL_OFFSET;
        const snappedY = snappedTop - dragInitialTop.value;

        dragY.value = snappedY;

        // Update current drag position so other events can recalculate their layout
        setCurrentDragPosition(clampedMinutes);

        // Calculate dynamic width and left using the layout calculation function
        // This simulates the layout as if the dragged event is already in its new position
        const dragLayout = calculateDragLayout(event.id, clampedMinutes);
        dragWidthValue.value = dragLayout.width;
        dragLeftValue.value = dragLayout.left;

        // 4. Feedback aptico quando attraversa una nuova linea di snap
        if (lastSnappedMinuteRef.current !== null && lastSnappedMinuteRef.current !== clampedMinutes) {
          // Feedback più forte per le ore intere, più leggero per i quarti d'ora
          const isFullHour = clampedMinutes % 60 === 0;
          if (isFullHour) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          } else {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }
        lastSnappedMinuteRef.current = clampedMinutes;
      },

      onPanResponderTerminate: () => {
        // Se la ScrollView ruba il tocco (es. scroll veloce subito), cancella il timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        isDragActiveRef.current = false;
        lastSnappedMinuteRef.current = null;
        setDraggingEventId(null);
        setCurrentDragPosition(null);
        dragY.value = 0;
      },

      onPanResponderRelease: (evt, gestureState) => {
        // Pulisci tutto al rilascio
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        if (!isDragActiveRef.current) {
          return;
        }

        // Calcola la posizione finale
        const finalY = dragY.value;
        const finalTop = dragInitialTop.value + finalY;
        const relativeFinalTop = Math.max(0, finalTop - DRAG_VISUAL_OFFSET);
        const minutesFromStart = (relativeFinalTop / hourHeight) * 60;
        const newStartMinutes = windowStartMin + minutesFromStart;
        const clampedMinutes = Math.max(0, Math.min(1440, Math.round(newStartMinutes)));

        const originalStartM = toMinutes(event.startTime);
        const originalEndM = toMinutes(event.endTime);
        const duration = originalEndM - originalStartM;

        const newEndMinutes = Math.min(1440, clampedMinutes + duration);

        const newStartTime = minutesToTime(clampedMinutes);
        const newEndTime = minutesToTime(newEndMinutes);

        setPendingEventPositions((prev) => ({ ...prev, [event.id]: clampedMinutes }));
        // Mark this event as recently moved so it goes to the right when layout recalculates
        setRecentlyMovedEventId(event.id);
        // Immediately mark as last moved so layout calculation uses it
        setLastMovedEventId(event.id);

        const selectedYmd = getDay(currentDate);
        // Salva l'override per la data specifica
        setTimeOverrideRange(event.id, selectedYmd, newStartTime, newEndTime);
        // Aggiorna anche lo schedule generale della task (per la tab tasks)
        updateScheduleTimes(event.id, newStartTime, newEndTime);

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        // Aggiorna la posizione base prima di resettare
        dragInitialTop.value = finalTop;
        dragY.value = 0;
        isDragActiveRef.current = false;
        lastSnappedMinuteRef.current = null;
        setDraggingEventId(null);
        setCurrentDragPosition(null);
      },
    });
  }, [
    event.id,
    baseTop,
    setDraggingEventId,
    dragInitialTop,
    dragY,
    windowStartMin,
    hourHeight,
    event.startTime,
    event.endTime,
    getDay,
    currentDate,
    setTimeOverrideRange,
    updateScheduleTimes,
    setPendingEventPositions,
    setRecentlyMovedEventId,
    setLastMovedEventId,
    setCurrentDragPosition,
    timedEvents,
    hourHeight,
    windowStartMin,
    dragWidthValue,
    dragLeftValue,
    calculateDragLayout,
  ]);

  // Update drag width and left when layout changes
  useEffect(() => {
    if (isDragging) {
      dragWidthValue.value = layoutStyle.width;
      dragLeftValue.value = layoutStyle.left;
    }
  }, [isDragging, layoutStyle.width, layoutStyle.left, dragWidthValue, dragLeftValue]);

  const animatedStyle = useAnimatedStyle(() => ({
    top: dragInitialTop.value + dragY.value,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1000 : 1,
    width: isDragging ? dragWidthValue.value : layoutStyle.width,
    left: isDragging ? dragLeftValue.value : layoutStyle.left,
  }));

  const EventComponent = isDragging ? Animated.View : View;
  const eventStyle = isDragging
    ? [
        styles.eventItem,
        {
          height: layoutStyle.height,
          backgroundColor: bg,
        },
        animatedStyle,
      ]
    : [
        styles.eventItem,
        {
          top: baseTop,
          height: layoutStyle.height,
          left: layoutStyle.left,
          width: layoutStyle.width,
          backgroundColor: bg,
          opacity: 1,
          zIndex: 1,
        },
      ];

  return (
    <View {...panResponder.panHandlers}>
      <EventComponent style={eventStyle}>
        <Text style={[styles.eventTitle, { color: light ? '#000' : '#FFF' }]} numberOfLines={1}>
          {event.title}
        </Text>
        {layoutStyle.height > 30 && (
          <Text style={[styles.eventTime, { color: light ? '#000' : '#FFF' }]}>
            {event.startTime} - {event.endTime}
          </Text>
        )}
      </EventComponent>
    </View>
  );
}

export default function OggiScreen() {
  const { habits, history, getDay, setTimeOverrideRange, updateScheduleTimes } = useHabits();
  const { activeTheme } = useAppTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [windowStart, setWindowStart] = useState<string>('06:00');
  const [windowEnd, setWindowEnd] = useState<string>('22:00');
  const [visibleHours, setVisibleHours] = useState<number>(10);
  
  // Drag state
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [pendingEventPositions, setPendingEventPositions] = useState<Record<string, number>>({});
  const [recentlyMovedEventId, setRecentlyMovedEventId] = useState<string | null>(null);
  // Track current drag position in minutes (updated during drag)
  const [currentDragPosition, setCurrentDragPosition] = useState<number | null>(null);
  const dragY = useSharedValue(0);
  const dragInitialTop = useSharedValue(0);
  const scrollViewRef = useRef<ScrollView>(null);

  // -- Data Loading & Persistence --
  useEffect(() => {
    (async () => {
      try {
        const [start, end, visible] = await Promise.all([
          AsyncStorage.getItem('oggi_window_start_v1'),
          AsyncStorage.getItem('oggi_window_end_v1'),
          AsyncStorage.getItem('oggi_visible_hours_v1'),
        ]);
        if (start) setWindowStart(start);
        if (end) setWindowEnd(end);
        if (visible) {
             const v = parseInt(visible, 10);
             if (!isNaN(v) && v >= 5 && v <= 24) setVisibleHours(v);
        }
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
    AsyncStorage.setItem('oggi_visible_hours_v1', visibleHours.toString()).catch(() => {});
  }, [visibleHours]);

  // -- Time Updates --
  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);


  // -- Derived State for Layout --
  const today = getDay(currentDate);
  const todayDate = useMemo(() => formatDateLong(currentDate, TZ), [currentDate]);

  const windowStartMin = toMinutes(windowStart);
  const windowEndMin = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
  
  // Dynamic HOUR_HEIGHT based on visibleHours
  // We use a larger portion of screen height (78% default, 77.5% for classic) to ensure hours are well spaced
  // and fill the screen, especially when few hours are visible.
  const hourHeight = useMemo(() => {
      const factor = activeTheme === 'futuristic' ? 0.78 : 0.775;
      return (Dimensions.get('window').height * factor) / visibleHours;
  }, [visibleHours, activeTheme]);

  // Calcoliamo l'altezza totale della scroll view basandoci sui minuti totali visibili
  // Usiamo una scala lineare: pixel = minuti * (hourHeight / 60)
  const totalMinutes = windowEndMin - windowStartMin;
  const totalHeight = (totalMinutes / 60) * hourHeight;
  
  // Generiamo le etichette delle ore.
  // Partiamo dall'ora intera che contiene windowStartMin o subito dopo
  const hours = useMemo(() => {
    const startHour = Math.floor(windowStartMin / 60);
    const endHour = Math.floor((windowEndMin - 1) / 60); // Ultima ora che inizia prima della fine
    const result = [];
    // Aggiungiamo un'ora extra alla fine per chiudere la griglia se necessario
    for (let h = startHour; h <= endHour + 1; h++) {
      result.push(h);
    }
    return result;
  }, [windowStartMin, windowEndMin]);

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
    setCurrentDate(newDate);
  };

  // -- Event Processing --
  const weekday = useMemo(() => currentDate.getDay(), [currentDate]);
  const dayOfMonth = useMemo(() => currentDate.getDate(), [currentDate]);
  const monthIndex1 = useMemo(() => currentDate.getMonth() + 1, [currentDate]);

  const { timedEvents, allDayEvents } = useMemo(() => {
    const items: OggiEvent[] = [];
    const allDay: OggiEvent[] = [];
    
    for (const h of habits) {
      // Logic for date filtering (same as before)
      const selectedYmd = getDay(currentDate);
      const hasOverrideForSelected = !!h.timeOverrides?.[selectedYmd];
      if (h.createdAt && selectedYmd < h.createdAt && !hasOverrideForSelected) continue;

      const sched = h.schedule;
      let showToday = true;
      if (sched) {
        const dow = sched.daysOfWeek ?? [];
        const mdays = sched.monthDays ?? [];
        const yrM = sched.yearMonth ?? null;
        const yrD = sched.yearDay ?? null;
        const weeklyApplies = dow.length === 0 || dow.includes(weekday);
        const monthlyApplies = mdays.length > 0 ? mdays.includes(dayOfMonth) : true;
        const annualApplies = yrM && yrD ? (yrM === monthIndex1 && yrD === dayOfMonth) : true;
        showToday = weeklyApplies && monthlyApplies && annualApplies;
      }
      if (!showToday) continue;

      // Time logic
      const ymd = selectedYmd;
      const override = h.timeOverrides?.[ymd];
      const overrideStart = typeof override === 'string' ? override : override?.start;
      const overrideEnd = typeof override === 'object' && override !== null ? override.end : null;
      
       // One-off logic
      const schedDays = h.schedule?.daysOfWeek ?? [];
      const schedMonth = h.schedule?.monthDays ?? [];
      const isOneOff = (schedDays.length === 0 && schedMonth.length === 0 && h.timeOverrides && Object.keys(h.timeOverrides).length > 0);
      if (isOneOff && !overrideStart) continue;

      const weekly = h.schedule?.weeklyTimes?.[weekday] ?? null;
      const monthlyT = h.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
      const start = overrideStart ?? (weekly?.start ?? monthlyT?.start ?? (h.schedule?.time ?? null));
      const end = overrideEnd ?? (weekly?.end ?? monthlyT?.end ?? (h.schedule?.endTime ?? null));
      const color = h.color ?? '#3b82f6';
      const title = h.text;

      if (!start && !end) {
        allDay.push({ id: h.id, title, startTime: '00:00', endTime: '24:00', isAllDay: true, color });
      } else if (start) {
        // Normalize end time
        let finalEnd = end;
        if (!end) {
           const [sh] = start.split(':').map(Number);
           const nextHour = Math.min(24, sh + 1);
           finalEnd = nextHour === 24 ? '24:00' : `${String(nextHour).padStart(2, '0')}:00`;
        } else if (end === '23:59') {
          finalEnd = '24:00';
        }
        items.push({ id: h.id, title, startTime: start, endTime: finalEnd!, isAllDay: false, color });
      } else if (!start && end) {
        // Only end provided
        const [eh] = end.split(':').map(Number);
        const startHour = Math.max(0, eh - 1);
        items.push({ id: h.id, title, startTime: `${String(startHour).padStart(2, '0')}:00`, endTime: end === '23:59' ? '24:00' : end, isAllDay: false, color });
      }
    }
    return { timedEvents: items, allDayEvents: allDay };
  }, [habits, weekday, dayOfMonth, currentDate, getDay, monthIndex1]);

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
  
  // Track the last moved event ID
  // When two events have same start time and duration, the one moved last goes to the right
  const [lastMovedEventId, setLastMovedEventId] = useState<string | null>(null);
  
  // Track the column order for events with same start time and duration
  // Maps timeKey (start-duration) to array of event IDs in column order (left to right)
  const [columnOrderByTime, setColumnOrderByTime] = useState<Record<string, string[]>>({});
  
  // When an event is moved, update the last moved event ID
  useEffect(() => {
    if (!recentlyMovedEventId) return;
    
    const movedEvent = timedEvents.find(e => e.id === recentlyMovedEventId);
    if (movedEvent && !pendingEventPositions[recentlyMovedEventId]) {
      // Event has been saved, mark it as the last moved event
      setLastMovedEventId(recentlyMovedEventId);
    }
  }, [recentlyMovedEventId, timedEvents, pendingEventPositions]);
  
  // Clear recently moved flag after a delay
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

  // -- Layout Calculation for Overlaps --
  type LayoutInfo = { col: number; columns: number };
  const layoutById = useMemo<Record<string, LayoutInfo>>(() => {
    // Sort by start time, and if same start time, longer tasks go left (shorter go right)
    // If same start and same duration, last moved task goes right
    const events = timedEvents.map(e => {
      const startM = toMinutes(e.startTime);
      const endM = toMinutes(e.endTime);
      const isLastMoved = e.id === lastMovedEventId;
      return {
        ...e,
        s: startM,
        e: endM,
        duration: endM - startM,
        isRecentlyMoved: pendingEventPositions.hasOwnProperty(e.id) || e.id === recentlyMovedEventId,
        isLastMoved
      };
    }).sort((a, b) => {
      if (a.s !== b.s) return a.s - b.s; // Different start time
      if (a.duration !== b.duration) return b.duration - a.duration; // Same start, different duration (longer first)
      // Same start and same duration: last moved or recently moved go right
      const aShouldGoRight = a.isRecentlyMoved || a.isLastMoved;
      const bShouldGoRight = b.isRecentlyMoved || b.isLastMoved;
      if (aShouldGoRight && !bShouldGoRight) return 1;
      if (!aShouldGoRight && bShouldGoRight) return -1;
      return 0; // Both same status, maintain order
    });

    const active: Array<{ id: string; end: number; col: number }> = [];
    const layout: Record<string, LayoutInfo> = {};
    
    // Simple column assignment strategy: first fit
    // This is a simplified version of the "packing" algorithm
    // Note: For perfect Google Calendar style layout, we need a more complex graph coloring or cluster analysis.
    // Here we use a simpler greedy approach per cluster of overlapping events.
    
    // Identify clusters
    let clusters: typeof events[] = [];
    let currentCluster: typeof events = [];
    let clusterEnd = -1;

    for (const ev of events) {
      if (currentCluster.length === 0) {
        currentCluster.push(ev);
        clusterEnd = ev.e;
      } else {
        if (ev.s < clusterEnd) {
          currentCluster.push(ev);
          clusterEnd = Math.max(clusterEnd, ev.e);
        } else {
          clusters.push(currentCluster);
          currentCluster = [ev];
          clusterEnd = ev.e;
        }
      }
    }
    if (currentCluster.length > 0) clusters.push(currentCluster);

    // Process each cluster
    for (const cluster of clusters) {
      // Sort cluster: events with same start and duration, last moved goes right
      // But preserve relative order of non-moved events
      const sortedCluster = [...cluster].sort((a, b) => {
        if (a.s !== b.s) return a.s - b.s; // Different start time: sort by start
        if (a.duration !== b.duration) return b.duration - a.duration; // Same start, different duration: longer first
        // Same start and same duration
        const aShouldGoRight = a.isRecentlyMoved || a.isLastMoved;
        const bShouldGoRight = b.isRecentlyMoved || b.isLastMoved;
        
        // If one is moved and the other isn't, moved goes right
        if (aShouldGoRight && !bShouldGoRight) return 1; // a goes after b (right)
        if (!aShouldGoRight && bShouldGoRight) return -1; // a goes before b (left)
        
        // Both same status: use saved column order if available
        const timeKey = `${a.s}-${a.duration}`;
        const savedOrder = columnOrderByTime[timeKey];
        if (savedOrder && !aShouldGoRight && !bShouldGoRight) {
          // Both not moved: use saved column order
          const aIndex = savedOrder.indexOf(a.id);
          const bIndex = savedOrder.indexOf(b.id);
          if (aIndex !== -1 && bIndex !== -1) {
            return aIndex - bIndex; // Maintain saved column order
          }
        }
        
        return 0; // Maintain current order
      });
      
      const columns: typeof sortedCluster[] = [];
      for (const ev of sortedCluster) {
        let placed = false;
        
        // Check if there are already events with same start time and duration in columns
        const sameStartCols: number[] = [];
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          if (col.some(existingEv => existingEv.s === ev.s && existingEv.duration === ev.duration)) {
            sameStartCols.push(i);
          }
        }
        const hasSameStartEvents = sameStartCols.length > 0;
        
        // If event is last moved/recently moved and there are same-start events, 
        // force it to a new rightmost column (always goes right)
        if ((ev.isLastMoved || ev.isRecentlyMoved) && hasSameStartEvents) {
          columns.push([ev]);
          layout[ev.id] = { col: columns.length - 1, columns: 1 };
          placed = true;
        } else if (!hasSameStartEvents) {
          // Normal first-fit logic: try to place in existing column
          for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const lastInCol = col[col.length - 1];
            if (lastInCol.e <= ev.s) {
              col.push(ev);
              layout[ev.id] = { col: i, columns: 1 }; // Will update columns later
              placed = true;
              break;
            }
          }
        } else {
          // Has same start events but not moved: goes to first available column
          // (this maintains creation order for non-moved events)
          for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const lastInCol = col[col.length - 1];
            if (lastInCol.e <= ev.s) {
              col.push(ev);
              layout[ev.id] = { col: i, columns: 1 };
              placed = true;
              break;
            }
          }
        }
        
        if (!placed) {
          // Create new column (either no fit found, or has same start as existing events)
          columns.push([ev]);
          layout[ev.id] = { col: columns.length - 1, columns: 1 };
        }
      }
      // Update total columns for everyone in this cluster
      const totalCols = columns.length;
      for (const ev of cluster) {
        layout[ev.id].columns = totalCols;
      }
    }

    return layout;
  }, [timedEvents, pendingEventPositions, recentlyMovedEventId, lastMovedEventId, columnOrderByTime]);
  
  // Save column order for events with same start time and duration
  useEffect(() => {
    if (Object.keys(pendingEventPositions).length > 0) return; // Don't update during drag
    
    const newOrder: Record<string, string[]> = {};
    
    // Group events by start time and duration
    const eventsByTime: Record<string, typeof timedEvents> = {};
    for (const e of timedEvents) {
      const startM = toMinutes(e.startTime);
      const endM = toMinutes(e.endTime);
      const duration = endM - startM;
      const timeKey = `${startM}-${duration}`;
      if (!eventsByTime[timeKey]) eventsByTime[timeKey] = [];
      eventsByTime[timeKey].push(e);
    }
    
    // For each group, get the column order from layout (left to right)
    for (const timeKey in eventsByTime) {
      const group = eventsByTime[timeKey];
      if (group.length > 1) {
        // Get current layout for these events
        const layoutInfo = group.map(e => ({
          id: e.id,
          col: layoutById[e.id]?.col ?? 999
        })).sort((a, b) => a.col - b.col);
        
        const orderByCol = layoutInfo.map(item => item.id);
        
        // Only save if order is different from saved order
        const currentOrder = columnOrderByTime[timeKey];
        if (JSON.stringify(currentOrder) !== JSON.stringify(orderByCol)) {
          newOrder[timeKey] = orderByCol;
        }
      }
    }
    
    // Update if there are changes
    if (Object.keys(newOrder).length > 0) {
      setColumnOrderByTime(prev => ({ ...prev, ...newOrder }));
    }
  }, [layoutById, timedEvents, pendingEventPositions, columnOrderByTime]);

  // Function to calculate layout during drag (as if the dragged event is already in its new position)
  const calculateDragLayout = useCallback((draggedEventId: string, newStartMinutes: number): { width: number; left: number } => {
    // Find the dragged event
    const draggedEvent = timedEvents.find(e => e.id === draggedEventId);
    if (!draggedEvent) {
      // Fallback: return default width
      const screenWidth = Dimensions.get('window').width;
      const availableWidth = screenWidth - LEFT_MARGIN;
      return { width: availableWidth - 2, left: LEFT_MARGIN };
    }

    // Get original column from layoutById
    const originalLayout = layoutById[draggedEventId] || { col: 0, columns: 1 };
    const originalCol = originalLayout.col;
    const originalColumns = originalLayout.columns;

    // Create temporary events list: remove dragged event from original position, add it at new position
    const originalStartM = toMinutes(draggedEvent.startTime);
    const originalEndM = toMinutes(draggedEvent.endTime);
    const duration = originalEndM - originalStartM;
    const newEndMinutes = Math.min(1440, newStartMinutes + duration);

    // Check if dragged event in new position still overlaps with other events in original position
    // Find events that overlap with the original position
    const eventsInOriginalPosition = timedEvents.filter(e => {
      if (e.id === draggedEventId) return false;
      const eStart = toMinutes(e.startTime);
      const eEnd = toMinutes(e.endTime);
      // Check if event overlaps with original position (even partially)
      return !(eEnd <= originalStartM || eStart >= originalEndM);
    });

    // Check if dragged event in new position still overlaps with any of these events
    const stillOverlaps = eventsInOriginalPosition.some(e => {
      const eStart = toMinutes(e.startTime);
      const eEnd = toMinutes(e.endTime);
      // Check if dragged event in new position overlaps with this event (even partially)
      return !(newEndMinutes <= eStart || newStartMinutes >= eEnd);
    });

    // If still overlaps, maintain original column
    if (stillOverlaps && eventsInOriginalPosition.length > 0) {
      // Calculate layout for events in original position (without dragged event)
      const eventsForOriginalLayout = eventsInOriginalPosition.map(e => {
        const startM = toMinutes(e.startTime);
        const endM = toMinutes(e.endTime);
        return {
          ...e,
          s: startM,
          e: endM,
          duration: endM - startM,
        };
      }).sort((a, b) => {
        if (a.s !== b.s) return a.s - b.s;
        if (a.duration !== b.duration) return b.duration - a.duration;
        return 0;
      });

      // Calculate how many columns are needed for these events
      let maxCols = 1;
      const tempColumns: typeof eventsForOriginalLayout[] = [];
      for (const ev of eventsForOriginalLayout) {
        let placed = false;
        for (let i = 0; i < tempColumns.length; i++) {
          const col = tempColumns[i];
          const lastInCol = col[col.length - 1];
          if (lastInCol.e <= ev.s) {
            col.push(ev);
            placed = true;
            break;
          }
        }
        if (!placed) {
          tempColumns.push([ev]);
        }
        maxCols = Math.max(maxCols, tempColumns.length);
      }

      // Add dragged event to the count (it's still overlapping)
      const totalCols = maxCols + 1; // +1 for dragged event
      const screenWidth = Dimensions.get('window').width;
      const availableWidth = screenWidth - LEFT_MARGIN;
      const colWidth = availableWidth / totalCols;
      const left = LEFT_MARGIN + (originalCol * colWidth);

      return {
        width: colWidth - 2, // 2px spacing
        left,
      };
    }

    // Create events list without the dragged event
    const eventsWithoutDragged = timedEvents.filter(e => e.id !== draggedEventId);

    // Create a temporary event with the new position
    const tempDraggedEvent: OggiEvent = {
      ...draggedEvent,
      startTime: minutesToTime(newStartMinutes),
      endTime: minutesToTime(newEndMinutes),
    };

    // Combine: all other events + dragged event at new position
    const tempEvents = [...eventsWithoutDragged, tempDraggedEvent];

    // Calculate layout for all events (same logic as layoutById)
    const events = tempEvents.map(e => {
      const startM = toMinutes(e.startTime);
      const endM = toMinutes(e.endTime);
      return {
        ...e,
        s: startM,
        e: endM,
        duration: endM - startM,
        isRecentlyMoved: e.id === draggedEventId,
        isLastMoved: e.id === draggedEventId,
      };
    }).sort((a, b) => {
      if (a.s !== b.s) return a.s - b.s;
      if (a.duration !== b.duration) return b.duration - a.duration;
      const aShouldGoRight = a.isRecentlyMoved || a.isLastMoved;
      const bShouldGoRight = b.isRecentlyMoved || b.isLastMoved;
      if (aShouldGoRight && !bShouldGoRight) return 1;
      if (!aShouldGoRight && bShouldGoRight) return -1;
      return 0;
    });

    // Identify clusters - events that overlap in time (even partially)
    // This correctly handles partial overlaps: if a 1-hour task is moved 15min up,
    // the bottom 45min still overlap with other tasks, so they must share space
    let clusters: typeof events[] = [];
    let currentCluster: typeof events = [];
    let clusterEnd = -1;

    for (const ev of events) {
      if (currentCluster.length === 0) {
        currentCluster.push(ev);
        clusterEnd = ev.e;
      } else {
        // Check if event overlaps with cluster (even partially)
        // Two events overlap if: ev.s < clusterEnd (event starts before cluster ends)
        // This ensures partial overlaps are correctly detected
        if (ev.s < clusterEnd) {
          currentCluster.push(ev);
          clusterEnd = Math.max(clusterEnd, ev.e);
        } else {
          clusters.push(currentCluster);
          currentCluster = [ev];
          clusterEnd = ev.e;
        }
      }
    }
    if (currentCluster.length > 0) clusters.push(currentCluster);

    // Process each cluster and find layout for dragged event
    const layout: Record<string, LayoutInfo> = {};
    
    for (const cluster of clusters) {
      const sortedCluster = [...cluster].sort((a, b) => {
        if (a.s !== b.s) return a.s - b.s;
        if (a.duration !== b.duration) return b.duration - a.duration;
        const aShouldGoRight = a.isRecentlyMoved || a.isLastMoved;
        const bShouldGoRight = b.isRecentlyMoved || b.isLastMoved;
        if (aShouldGoRight && !bShouldGoRight) return 1;
        if (!aShouldGoRight && bShouldGoRight) return -1;
        return 0;
      });

      const columns: typeof sortedCluster[] = [];
      for (const ev of sortedCluster) {
        let placed = false;

        const sameStartCols: number[] = [];
        for (let i = 0; i < columns.length; i++) {
          const col = columns[i];
          if (col.some(existingEv => existingEv.s === ev.s && existingEv.duration === ev.duration)) {
            sameStartCols.push(i);
          }
        }
        const hasSameStartEvents = sameStartCols.length > 0;

        if ((ev.isLastMoved || ev.isRecentlyMoved) && hasSameStartEvents) {
          columns.push([ev]);
          layout[ev.id] = { col: columns.length - 1, columns: 1 };
          placed = true;
        } else if (!hasSameStartEvents) {
          for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const lastInCol = col[col.length - 1];
            if (lastInCol.e <= ev.s) {
              col.push(ev);
              layout[ev.id] = { col: i, columns: 1 };
              placed = true;
              break;
            }
          }
        } else {
          for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const lastInCol = col[col.length - 1];
            if (lastInCol.e <= ev.s) {
              col.push(ev);
              layout[ev.id] = { col: i, columns: 1 };
              placed = true;
              break;
            }
          }
        }

        if (!placed) {
          columns.push([ev]);
          layout[ev.id] = { col: columns.length - 1, columns: 1 };
        }
      }

      // Update total columns for everyone in this cluster
      const totalCols = columns.length;
      for (const ev of cluster) {
        layout[ev.id].columns = totalCols;
      }
    }

    // Get layout for dragged event
    const draggedLayout = layout[draggedEventId] || { col: 0, columns: 1 };
    const screenWidth = Dimensions.get('window').width;
    const availableWidth = screenWidth - LEFT_MARGIN;
    const colWidth = availableWidth / draggedLayout.columns;
    const left = LEFT_MARGIN + (draggedLayout.col * colWidth);

    return {
      width: colWidth - 2, // 2px spacing
      left,
    };
  }, [timedEvents, columnOrderByTime, layoutById]);

  // -- Helper to calculate styles --
  const getEventStyle = (event: OggiEvent) => {
    const originalStart = toMinutes(event.startTime);
    const originalEnd = toMinutes(event.endTime);
    const pendingStart = pendingEventPositions[event.id];
    const startM = pendingStart ?? originalStart;
    const endM = pendingStart !== undefined ? Math.min(1440, startM + (originalEnd - originalStart)) : originalEnd;
    
    // Clip to view window
    if (endM <= windowStartMin || startM >= windowEndMin) return null;
    
    const visibleStart = Math.max(startM, windowStartMin);
    const visibleEnd = Math.min(endM, windowEndMin);
    
    // Coordinates
    const top = ((visibleStart - windowStartMin) / 60) * hourHeight;
    const durationMin = visibleEnd - visibleStart;
    const height = Math.max(1, (durationMin / 60) * hourHeight);
    
    // Horizontal layout
    // If a task is being dragged and this event is not the dragged one,
    // check if the dragged task has exited the overlap zone
    let lay = layoutById[event.id] || { col: 0, columns: 1 };
    
    if (draggingEventId && draggingEventId !== event.id && currentDragPosition !== null) {
      const draggedEvent = timedEvents.find(e => e.id === draggingEventId);
      if (draggedEvent) {
        const draggedOriginalStart = toMinutes(draggedEvent.startTime);
        const draggedOriginalEnd = toMinutes(draggedEvent.endTime);
        
        // Check if this event overlaps with dragged event's original position
        const overlapsOriginal = !(endM <= draggedOriginalStart || startM >= draggedOriginalEnd);
        
        if (overlapsOriginal) {
          // Check if dragged event in its current position (from currentDragPosition or pendingEventPositions) still overlaps
          const draggedCurrentStart = currentDragPosition ?? pendingEventPositions[draggingEventId] ?? draggedOriginalStart;
          const draggedDuration = draggedOriginalEnd - draggedOriginalStart;
          const draggedCurrentEnd = Math.min(1440, draggedCurrentStart + draggedDuration);
          
          // Check if dragged event still overlaps with this event
          const stillOverlaps = !(draggedCurrentEnd <= startM || draggedCurrentStart >= endM);
          
          if (!stillOverlaps) {
            // Dragged event has exited: recalculate layout without it
            const eventsWithoutDragged = timedEvents.filter(e => e.id !== draggingEventId);
            const eventsForLayout = eventsWithoutDragged.map(e => {
              const eStart = toMinutes(e.startTime);
              const eEnd = toMinutes(e.endTime);
              return {
                ...e,
                s: eStart,
                e: eEnd,
                duration: eEnd - eStart,
              };
            }).sort((a, b) => {
              if (a.s !== b.s) return a.s - b.s;
              if (a.duration !== b.duration) return b.duration - a.duration;
              return 0;
            });
            
            // Find cluster that contains this event
            let clusters: typeof eventsForLayout[] = [];
            let currentCluster: typeof eventsForLayout = [];
            let clusterEnd = -1;
            
            for (const ev of eventsForLayout) {
              if (currentCluster.length === 0) {
                currentCluster.push(ev);
                clusterEnd = ev.e;
              } else {
                if (ev.s < clusterEnd) {
                  currentCluster.push(ev);
                  clusterEnd = Math.max(clusterEnd, ev.e);
                } else {
                  clusters.push(currentCluster);
                  currentCluster = [ev];
                  clusterEnd = ev.e;
                }
              }
            }
            if (currentCluster.length > 0) clusters.push(currentCluster);
            
            // Find the cluster containing this event
            const cluster = clusters.find(c => c.some(e => e.id === event.id)) || [];
            
            if (cluster.length > 0 && cluster.some(e => e.id === event.id)) {
              // Calculate layout for this cluster without dragged event
              const tempColumns: typeof cluster[] = [];
              for (const ev of cluster) {
                let placed = false;
                for (let i = 0; i < tempColumns.length; i++) {
                  const col = tempColumns[i];
                  const lastInCol = col[col.length - 1];
                  if (lastInCol.e <= ev.s) {
                    col.push(ev);
                    placed = true;
                    break;
                  }
                }
                if (!placed) {
                  tempColumns.push([ev]);
                }
              }
              
              const totalCols = tempColumns.length;
              const eventCol = tempColumns.findIndex(col => col.some(e => e.id === event.id));
              if (eventCol !== -1) {
                lay = { col: eventCol, columns: totalCols };
              }
            }
          }
        } else {
          // This event did NOT overlap with dragged event's original position
          // Check if dragged event in new position now overlaps with this event
          const draggedCurrentStart = currentDragPosition ?? pendingEventPositions[draggingEventId] ?? draggedOriginalStart;
          const draggedDuration = draggedOriginalEnd - draggedOriginalStart;
          const draggedCurrentEnd = Math.min(1440, draggedCurrentStart + draggedDuration);
          
          // Check if dragged event now overlaps with this event
          const nowOverlaps = !(draggedCurrentEnd <= startM || draggedCurrentStart >= endM);
          
          if (nowOverlaps) {
            // Dragged event has entered: recalculate layout with it included
            const eventsWithoutDragged = timedEvents.filter(e => e.id !== draggingEventId);
            const draggedEvent = timedEvents.find(e => e.id === draggingEventId);
            if (draggedEvent) {
              const tempDraggedEvent = {
                ...draggedEvent,
                s: draggedCurrentStart,
                e: draggedCurrentEnd,
                duration: draggedDuration,
              };
              
              const eventsForLayout = [...eventsWithoutDragged.map(e => {
                const eStart = toMinutes(e.startTime);
                const eEnd = toMinutes(e.endTime);
                return {
                  ...e,
                  s: eStart,
                  e: eEnd,
                  duration: eEnd - eStart,
                };
              }), tempDraggedEvent].sort((a, b) => {
                if (a.s !== b.s) return a.s - b.s;
                if (a.duration !== b.duration) return b.duration - a.duration;
                return 0;
              });
              
              // Find cluster that contains this event
              let clusters: typeof eventsForLayout[] = [];
              let currentCluster: typeof eventsForLayout = [];
              let clusterEnd = -1;
              
              for (const ev of eventsForLayout) {
                if (currentCluster.length === 0) {
                  currentCluster.push(ev);
                  clusterEnd = ev.e;
                } else {
                  if (ev.s < clusterEnd) {
                    currentCluster.push(ev);
                    clusterEnd = Math.max(clusterEnd, ev.e);
                  } else {
                    clusters.push(currentCluster);
                    currentCluster = [ev];
                    clusterEnd = ev.e;
                  }
                }
              }
              if (currentCluster.length > 0) clusters.push(currentCluster);
              
              // Find the cluster containing this event
              const cluster = clusters.find(c => c.some(e => e.id === event.id)) || [];
              
              if (cluster.length > 0 && cluster.some(e => e.id === event.id)) {
                // Calculate layout for this cluster with dragged event included
                const tempColumns: typeof cluster[] = [];
                for (const ev of cluster) {
                  let placed = false;
                  for (let i = 0; i < tempColumns.length; i++) {
                    const col = tempColumns[i];
                    const lastInCol = col[col.length - 1];
                    if (lastInCol.e <= ev.s) {
                      col.push(ev);
                      placed = true;
                      break;
                    }
                  }
                  if (!placed) {
                    tempColumns.push([ev]);
                  }
                }
                
                const totalCols = tempColumns.length;
                const eventCol = tempColumns.findIndex(col => col.some(e => e.id === event.id));
                if (eventCol !== -1) {
                  lay = { col: eventCol, columns: totalCols };
                }
              }
            }
          }
        }
      }
    }
    
    const screenWidth = Dimensions.get('window').width;
    const availableWidth = screenWidth - LEFT_MARGIN; // Removed right padding to use full width
    const colWidth = availableWidth / lay.columns;
    const left = LEFT_MARGIN + (lay.col * colWidth);
    
    // Adjust for visual separation from grid lines
    // Add 2px top margin to sit below the hour line
    // Subtract height to sit above the next hour line (and account for top margin)
    // If event ends exactly on the hour, use 3.75px buffer instead of 4px
    const endsOnHour = endM % 60 === 0;
    const heightBuffer = endsOnHour ? 3.75 : 4;
    const adjustedTop = top + 2;
    const adjustedHeight = Math.max(1, height - heightBuffer); // No min height limit, purely proportional

    return {
      top: adjustedTop,
      height: adjustedHeight,
      left,
      width: colWidth - 2, // 2px spacing
    };
  };
  
  const getCurrentTimeTop = () => {
     const now = currentTime;
     const min = now.getHours() * 60 + now.getMinutes();
     if (min < windowStartMin || min > windowEndMin) return null;
     return ((min - windowStartMin) / 60) * hourHeight;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, activeTheme === 'futuristic' && { marginTop: 50 }]}>
        <TouchableOpacity onPress={() => navigateDate('prev')} style={styles.navButton}>
          <Ionicons name="chevron-back" size={24} color={THEME.text} />
        </TouchableOpacity>
        <Text style={[styles.dateText, isToday(currentDate, TZ) ? styles.todayDateText : styles.otherDateText]}>
          {todayDate}
        </Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigateDate('next')} style={styles.navButton}>
             <Ionicons name="chevron-forward" size={24} color={THEME.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingsButton} onPress={() => setShowSettings(true)}>
             <Ionicons name="settings-outline" size={24} color={THEME.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* All Day Area */}
      {allDayEvents.length > 0 && (
        <View style={styles.allDayContainer}>
             <View style={styles.allDayLabelContainer}>
                <View style={styles.allDayDot} />
             </View>
             <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.allDayScroll}>
               {allDayEvents.map((e) => {
                 const bg = e.color;
                 const light = isLightColor(bg);
                 return (
                   <View key={e.id} style={[styles.allDayItem, { backgroundColor: bg }]}>
                      <Text style={[styles.eventTitle, { color: light ? '#000' : '#FFF' }]} numberOfLines={1}>
                        {e.title}
                      </Text>
                   </View>
                 );
               })}
             </ScrollView>
        </View>
      )}

      {/* Main Timeline Scroll */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        <ScrollView 
          ref={scrollViewRef}
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          scrollEnabled={!draggingEventId}
        >
         <View style={{ height: totalHeight + (visibleHours === 24 ? 0 : 43 + (activeTheme !== 'futuristic' ? 55 : 0)) }}> 
             {/* Grid Lines & Hours */}
             {hours.map(h => {
                const minutesFromStart = (h * 60) - windowStartMin;
                // Don't draw if completely out of bounds
                if (minutesFromStart < 0 || minutesFromStart > totalMinutes + 60) return null;
                
                // Aggiungo un offset verticale di base (es. 10px) per evitare che la prima ora (00:00) sia tagliata
                const top = (minutesFromStart / 60) * hourHeight + BASE_VERTICAL_OFFSET;
                
                return (
                  <View key={h} style={[styles.hourRow, { top }]}>
                      <Text style={styles.hourLabel}>
                        {`${String(h).padStart(2, '0')}:00`}
                      </Text>
                      <View style={styles.hourLine} />
                  </View>
                );
             })}

             {/* Events */}
             {timedEvents.map(e => {
               const style = getEventStyle(e);
               if (!style) return null;
               const bg = e.color;
               const light = isLightColor(bg);
               
               // Aggiungo lo stesso offset di base anche agli eventi
               const baseTop = style.top + BASE_VERTICAL_OFFSET;

               return (
                 <DraggableEvent
                   key={e.id}
                   event={e}
                   layoutStyle={style}
                   baseTop={baseTop}
                   dragY={dragY}
                   dragInitialTop={dragInitialTop}
                   draggingEventId={draggingEventId}
                   setDraggingEventId={setDraggingEventId}
                   windowStartMin={windowStartMin}
                   hourHeight={hourHeight}
                   currentDate={currentDate}
                   getDay={getDay}
                   setTimeOverrideRange={setTimeOverrideRange}
                   updateScheduleTimes={updateScheduleTimes}
                   setPendingEventPositions={setPendingEventPositions}
                   setRecentlyMovedEventId={setRecentlyMovedEventId}
                   setLastMovedEventId={setLastMovedEventId}
                   setCurrentDragPosition={setCurrentDragPosition}
                   timedEvents={timedEvents}
                   layoutById={layoutById}
                   calculateDragLayout={calculateDragLayout}
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
      </GestureHandlerRootView>

      {/* Settings Modal (Simplified for brevity, keeping core functional) */}
      <Modal visible={showSettings} animationType="slide" transparent onRequestClose={() => setShowSettings(false)}>
         <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
               <Text style={styles.modalTitle}>Impostazioni Vista</Text>
               
               {/* Start Time Control */}
               <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Inizio: {windowStart}</Text>
                  <View style={styles.settingControls}>
                     <TouchableOpacity style={styles.controlBtn} onPress={() => {
                        const m = toMinutes(windowStart);
                        if (m > 0) setWindowStart(`${String(Math.floor((m-60)/60)).padStart(2, '0')}:00`);
                     }}><Text style={styles.controlBtnText}>-</Text></TouchableOpacity>
                     <TouchableOpacity style={styles.controlBtn} onPress={() => {
                        const startM = toMinutes(windowStart);
                        const endM = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
                        // Ensure at least 5 hour window (300 min)
                        if (startM < endM - 300) {
                            const nextStartM = startM + 60;
                            const newDuration = (endM - nextStartM) / 60;
                            if (visibleHours > newDuration) {
                                setVisibleHours(Math.max(5, Math.floor(newDuration)));
                            }
                            setWindowStart(`${String(Math.floor(nextStartM/60)).padStart(2, '0')}:00`);
                        }
                     }}><Text style={styles.controlBtnText}>+</Text></TouchableOpacity>
                  </View>
               </View>

               {/* End Time Control */}
               <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Fine: {windowEnd}</Text>
                  <View style={styles.settingControls}>
                     <TouchableOpacity style={styles.controlBtn} onPress={() => {
                        const startM = toMinutes(windowStart);
                        const endM = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
                        // Ensure at least 5 hour window (300 min)
                        if (endM > startM + 300) {
                             const nextEndM = endM - 60;
                             const newDuration = (nextEndM - startM) / 60;
                             if (visibleHours > newDuration) {
                                 setVisibleHours(Math.max(5, Math.floor(newDuration)));
                             }
                             setWindowEnd(nextEndM === 1440 ? '24:00' : `${String(Math.floor(nextEndM/60)).padStart(2, '0')}:00`);
                        }
                     }}><Text style={styles.controlBtnText}>-</Text></TouchableOpacity>
                     <TouchableOpacity style={styles.controlBtn} onPress={() => {
                        const m = toMinutes(windowEnd);
                        if (m < 1440) {
                           const next = Math.min(24, Math.floor((m+60)/60));
                           setWindowEnd(next === 24 ? '24:00' : `${String(next).padStart(2, '0')}:00`);
                        }
                     }}><Text style={styles.controlBtnText}>+</Text></TouchableOpacity>
                  </View>
               </View>

                <View style={styles.settingRow}>
                    <Text style={styles.settingLabel}>Ore Visibili: {visibleHours}</Text>
                    <View style={styles.settingControls}>
                       <TouchableOpacity style={styles.controlBtn} onPress={() => {
                          if (visibleHours > 5) setVisibleHours(prev => prev - 1);
                       }}><Text style={styles.controlBtnText}>-</Text></TouchableOpacity>
                       <TouchableOpacity style={styles.controlBtn} onPress={() => {
                          if (visibleHours < 24) {
                              const nextVisible = visibleHours + 1;
                              setVisibleHours(nextVisible);
                              
                              // Adjust window if visible hours > duration
                              const startM = toMinutes(windowStart);
                              const endM = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
                              const currentDuration = (endM - startM) / 60;
                              
                              if (nextVisible > currentDuration) {
                                   let newEndM = startM + (nextVisible * 60);
                                   let newStartM = startM;
                                   
                                   if (newEndM > 1440) {
                                       newEndM = 1440;
                                       newStartM = Math.max(0, 1440 - (nextVisible * 60));
                                   }
                                   
                                   const fmt = (m: number) => `${String(Math.floor(m/60)).padStart(2, '0')}:00`;
                                   setWindowStart(fmt(newStartM));
                                   setWindowEnd(newEndM === 1440 ? '24:00' : fmt(newEndM));
                              }
                          }
                       }}><Text style={styles.controlBtnText}>+</Text></TouchableOpacity>
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
    backgroundColor: 'transparent',
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
  todayDateText: {
    color: '#FF3B30',
  },
  otherDateText: {
    color: '#FFF',
  },
  headerRight: {
    flexDirection: 'row',
    gap: 10,
  },
  settingsButton: {
    padding: 4,
  },
  
  // All Day
  allDayContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
    minHeight: 50,
  },
  allDayLabelContainer: {
    width: LEFT_MARGIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allDayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFF',
  },
  allDayScroll: {
    flex: 1,
    paddingRight: 10,
  },
  allDayItem: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 6,
    minWidth: 80,
  },

  // Timeline
  scrollView: {
    flex: 1,
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
