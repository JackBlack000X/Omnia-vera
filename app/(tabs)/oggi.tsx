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
const LEFT_MARGIN = 65;
const BASE_VERTICAL_OFFSET = 10;
const DRAG_VISUAL_OFFSET = BASE_VERTICAL_OFFSET + 2; 
const HOUR_FONT_SIZE = 14;

type OggiEvent = {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  color: string;
};

type LayoutInfo = { col: number; columns: number; span: number };

type DraggableEventProps = {
  event: OggiEvent;
  layoutStyle: { top: number; height: number; left: number; width: number };
  baseTop: number;
  dragY: SharedValue<number>;
  dragInitialTop: SharedValue<number>;
  draggingEventId: string | null;
  setDraggingEventId: (id: string | null) => void;
  dragClearedOriginalOverlap: boolean;
  setDragClearedOriginalOverlap: (value: boolean) => void;
  setDragSizingLocked: (value: boolean) => void;
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
  layoutById: Record<string, LayoutInfo>;
  calculateDragLayout: (draggedEventId: string, newStartMinutes: number, hasClearedOverlap: boolean) => { width: number; left: number };
};

function DraggableEvent({
  event,
  layoutStyle,
  baseTop,
  dragY,
  dragInitialTop,
  draggingEventId,
  setDraggingEventId,
  dragClearedOriginalOverlap,
  setDragClearedOriginalOverlap,
  setDragSizingLocked,
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

  const dragWidthValue = useSharedValue(layoutStyle.width);
  const dragLeftValue = useSharedValue(layoutStyle.left);

  // --- REFS ---
  const layoutStyleRef = useRef(layoutStyle);
  const timedEventsRef = useRef(timedEvents);
  const calculateDragLayoutRef = useRef(calculateDragLayout);
  const layoutByIdRef = useRef(layoutById);
  const initialSnapshotRef = useRef({ width: 0, left: 0 });
  
  const overlapClearedRef = useRef(false);

  layoutStyleRef.current = layoutStyle;
  timedEventsRef.current = timedEvents;
  calculateDragLayoutRef.current = calculateDragLayout;
  layoutByIdRef.current = layoutById;

  const isDragActiveRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnappedMinuteRef = useRef<number | null>(null);
  const initialTouchYRef = useRef<number | null>(null);
  const hasMovedRef = useRef(false);
  const initialStartMinutesRef = useRef<number | null>(null);

  const panResponder = useMemo(() => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (isDragActiveRef.current) return true;
        return Math.abs(gestureState.dy) > 5;
      },
      onShouldBlockNativeResponder: () => isDragActiveRef.current,

      onPanResponderGrant: (evt) => {
        lastSnappedMinuteRef.current = null;
        initialTouchYRef.current = evt.nativeEvent.pageY;
        overlapClearedRef.current = false;
        
        longPressTimerRef.current = setTimeout(() => {
          isDragActiveRef.current = true;
          setDragClearedOriginalOverlap(false);
          setDragSizingLocked(true);
          hasMovedRef.current = false;
          initialStartMinutesRef.current = toMinutes(event.startTime);
          
          const currentLayout = layoutStyleRef.current;
          initialSnapshotRef.current = { 
            width: currentLayout.width, 
            left: currentLayout.left 
          };
          
          dragWidthValue.value = currentLayout.width;
          dragLeftValue.value = currentLayout.left;
          dragInitialTop.value = baseTop;
          dragY.value = 0;
          
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setDraggingEventId(event.id);
        }, 200);
      },

      onPanResponderMove: (evt, gestureState) => {
        if (!isDragActiveRef.current && Math.abs(gestureState.dx) > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)) {
          if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
          }
          return;
        }

        if (!isDragActiveRef.current) return;

        if (initialTouchYRef.current === null) initialTouchYRef.current = evt.nativeEvent.pageY;
        const currentTouchY = evt.nativeEvent.pageY;
        const touchDeltaY = currentTouchY - initialTouchYRef.current;
        
        const initialBaseTop = dragInitialTop.value;
        const currentTop = initialBaseTop + touchDeltaY;
        const relativeTop = Math.max(0, currentTop - DRAG_VISUAL_OFFSET);
        const minutesFromStart = (relativeTop / hourHeight) * 60;
        const newStartMinutes = windowStartMin + minutesFromStart;
        const roundedMinutes = Math.round(newStartMinutes / 15) * 15;
        const clampedMinutes = Math.max(0, Math.min(1440, roundedMinutes));
        
        const snappedMinutesFromStart = clampedMinutes - windowStartMin;
        const snappedTop = (snappedMinutesFromStart / 60) * hourHeight + DRAG_VISUAL_OFFSET;
        dragY.value = snappedTop - initialBaseTop;

        const initialStartM = initialStartMinutesRef.current ?? toMinutes(event.startTime);
        const movedMinutes = Math.abs(clampedMinutes - initialStartM);
        if (!hasMovedRef.current && movedMinutes >= 15) {
          hasMovedRef.current = true;
          setDragSizingLocked(false);
        }

        if (!overlapClearedRef.current && hasMovedRef.current) {
          const originalStartM = toMinutes(event.startTime);
          const originalEndM = toMinutes(event.endTime);
          const duration = originalEndM - originalStartM;
          const draggedCurrentEnd = Math.min(1440, clampedMinutes + duration);
          
          const currentTimedEvents = timedEventsRef.current;
          const overlapsAny = currentTimedEvents.some((other) => {
            if (other.id === event.id) return false;
            const otherStart = toMinutes(other.startTime);
            const otherEnd = toMinutes(other.endTime);
            return !(draggedCurrentEnd <= otherStart || clampedMinutes >= otherEnd);
          });
          
          if (!overlapsAny) {
            setDragClearedOriginalOverlap(true);
            overlapClearedRef.current = true;
          }
        }

        if (hasMovedRef.current) {
          if (!overlapClearedRef.current) {
             dragWidthValue.value = initialSnapshotRef.current.width;
             dragLeftValue.value = initialSnapshotRef.current.left;
          } else {
             setCurrentDragPosition(clampedMinutes);
             const dragLayout = calculateDragLayoutRef.current(event.id, clampedMinutes, true);
             dragWidthValue.value = dragLayout.width;
             dragLeftValue.value = dragLayout.left;
          }
        } else {
          dragWidthValue.value = initialSnapshotRef.current.width;
          dragLeftValue.value = initialSnapshotRef.current.left;
          setCurrentDragPosition(null);
        }

        if (lastSnappedMinuteRef.current !== null && lastSnappedMinuteRef.current !== clampedMinutes) {
          const isFullHour = clampedMinutes % 60 === 0;
          Haptics.impactAsync(isFullHour ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        }
        lastSnappedMinuteRef.current = clampedMinutes;
      },

      onPanResponderTerminate: () => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        isDragActiveRef.current = false;
        lastSnappedMinuteRef.current = null;
        hasMovedRef.current = false;
        initialStartMinutesRef.current = null;
        setDragClearedOriginalOverlap(false);
        overlapClearedRef.current = false;
        setDragSizingLocked(false);
        setDraggingEventId(null);
        setCurrentDragPosition(null);
        dragY.value = 0;
      },

      onPanResponderRelease: (evt, gestureState) => {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        if (!isDragActiveRef.current) return;

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
        
        // IMPORTANT: Always update last moved.
        if (hasMovedRef.current) {
           setRecentlyMovedEventId(event.id);
           setLastMovedEventId(event.id);
        }

        const selectedYmd = getDay(currentDate);
        setTimeOverrideRange(event.id, selectedYmd, newStartTime, newEndTime);
        updateScheduleTimes(event.id, newStartTime, newEndTime);

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
        dragInitialTop.value = finalTop;
        dragY.value = 0;
        isDragActiveRef.current = false;
        lastSnappedMinuteRef.current = null;
        hasMovedRef.current = false;
        initialStartMinutesRef.current = null;
        setDragClearedOriginalOverlap(false);
        overlapClearedRef.current = false;
        setDragSizingLocked(false);
        setDraggingEventId(null);
        setCurrentDragPosition(null);
      },
    });
  }, [
    event.id,
    event.startTime, 
    event.endTime,
    baseTop,
    windowStartMin,
    hourHeight,
    dragInitialTop,
    dragY,
    dragWidthValue,
    dragLeftValue,
    currentDate,
    setDraggingEventId,
    setDragClearedOriginalOverlap,
    setDragSizingLocked,
    setPendingEventPositions,
    setRecentlyMovedEventId,
    setLastMovedEventId,
    setCurrentDragPosition,
    setTimeOverrideRange,
    updateScheduleTimes,
    getDay
  ]);

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
  
  const [showSettings, setShowSettings] = useState(false);
  const [windowStart, setWindowStart] = useState<string>('06:00');
  const [windowEnd, setWindowEnd] = useState<string>('22:00');
  const [visibleHours, setVisibleHours] = useState<number>(10);
  
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);
  const [pendingEventPositions, setPendingEventPositions] = useState<Record<string, number>>({});
  const [recentlyMovedEventId, setRecentlyMovedEventId] = useState<string | null>(null);
  const [currentDragPosition, setCurrentDragPosition] = useState<number | null>(null);
  const [dragClearedOriginalOverlap, setDragClearedOriginalOverlap] = useState(false);
  const [dragSizingLocked, setDragSizingLocked] = useState(false);
  const dragY = useSharedValue(0);
  const dragInitialTop = useSharedValue(0);
  const scrollViewRef = useRef<ScrollView>(null);
  const originalLayoutRef = useRef<Record<string, LayoutInfo>>({});

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

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  const today = getDay(currentDate);
  const todayDate = useMemo(() => formatDateLong(currentDate, TZ), [currentDate]);

  const windowStartMin = toMinutes(windowStart);
  const windowEndMin = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
  
  const hourHeight = useMemo(() => {
      const factor = activeTheme === 'futuristic' ? 0.78 : 0.775;
      return (Dimensions.get('window').height * factor) / visibleHours;
  }, [visibleHours, activeTheme]);

  const totalMinutes = windowEndMin - windowStartMin;
  const totalHeight = (totalMinutes / 60) * hourHeight;
  
  const hours = useMemo(() => {
    const startHour = Math.floor(windowStartMin / 60);
    const endHour = Math.floor((windowEndMin - 1) / 60);
    const result = [];
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

  const weekday = useMemo(() => currentDate.getDay(), [currentDate]);
  const dayOfMonth = useMemo(() => currentDate.getDate(), [currentDate]);
  const monthIndex1 = useMemo(() => currentDate.getMonth() + 1, [currentDate]);

  const { timedEvents, allDayEvents } = useMemo(() => {
    const items: OggiEvent[] = [];
    const allDay: OggiEvent[] = [];
    
    for (const h of habits) {
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

      const ymd = selectedYmd;
      const override = h.timeOverrides?.[ymd];
      const overrideStart = typeof override === 'string' ? override : override?.start;
      const overrideEnd = typeof override === 'object' && override !== null ? override.end : null;
      
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
  
  const [lastMovedEventId, setLastMovedEventId] = useState<string | null>(null);
  const [columnOrderByTime, setColumnOrderByTime] = useState<Record<string, string[]>>({});
  
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

  // LOGIC CORE: CALCULATE LAYOUT
  const calculateLayout = useCallback((
    events: (OggiEvent & { s: number; e: number; duration: number; isLastMoved: boolean })[],
    draggedEventId: string | null,
    originalLayout?: Record<string, LayoutInfo>, // Original layout to preserve columns if still overlapping
  ) => {
    const layout: Record<string, LayoutInfo> = {};
    
    // 1. Form Clusters based on time
    let clusters: typeof events[] = [];
    let currentCluster: typeof events = [];
    let clusterEnd = -1;

    // Sort by Time for clustering
    const sortedByTime = [...events].sort((a, b) => {
        if (a.s !== b.s) return a.s - b.s;
        return b.duration - a.duration;
    });

    for (const ev of sortedByTime) {
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

    // 2. Process Clusters
    for (const cluster of clusters) {
        // SEPARATE MOVER AND STATIC
        // The "Mover" is the one currently being dragged OR the last one dropped (lastMovedEventId)
        // IMPORTANT: We handle only ONE mover at a time to prevent chain swaps
        const moverId = draggedEventId || lastMovedEventId;
        
        const mover = cluster.find(e => e.id === moverId);
        const statics = cluster.filter(e => e.id !== moverId);

        // NO SORTING: Keep statics in their original order (no time-based ordering)
        // This prevents tasks from changing columns based on start time

        const columns: typeof events[] = [];

        // A. Place Statics (Preserve original column if still overlapping with dragged task)
        for (const ev of statics) {
            let placed = false;
            
            // If we have original layout and dragged task, check if still overlapping
            if (originalLayout && originalLayout[ev.id] && draggedEventId && originalLayout[draggedEventId] && mover) {
                const stillOverlaps = Math.max(ev.s, mover.s) < Math.min(ev.e, mover.e);
                
                // Get original column positions
                const originalEvCol = originalLayout[ev.id].col;
                const originalDraggedCol = originalLayout[draggedEventId].col;
                const wasToTheRight = originalEvCol > originalDraggedCol;
                
                // If still overlapping, MUST preserve original column
                // CRITICAL: if task was to the right, it MUST stay right until completely out of overlap
                if (stillOverlaps) {
                    const originalCol = originalLayout[ev.id].col;
                    // Ensure column array exists
                    while (columns.length <= originalCol) {
                        columns.push([]);
                    }
                    
                    // Check if original column is free (no collision with other statics that are not this one)
                    const hasCollision = columns[originalCol].some(existingEv => 
                        existingEv.id !== ev.id && Math.max(ev.s, existingEv.s) < Math.min(ev.e, existingEv.e)
                    );
                    
                    if (!hasCollision) {
                        // Preserve original column
                        columns[originalCol].push(ev);
                        layout[ev.id] = { col: originalCol, columns: 1, span: 1 };
                        placed = true;
                    }
                    // If collision in original column, fall through to First Fit below
                }
            }
            
            // If not placed yet (not overlapping or original column not available), use First Fit
            if (!placed) {
                for (let i = 0; i < columns.length; i++) {
                    const col = columns[i];
                    const hasCollision = col.some(existingEv => 
                        Math.max(ev.s, existingEv.s) < Math.min(ev.e, existingEv.e)
                    );
                    if (!hasCollision) {
                        col.push(ev);
                        layout[ev.id] = { col: i, columns: 1, span: 1 };
                        placed = true;
                        break;
                    }
                }
            }
            
            if (!placed) {
                columns.push([ev]);
                layout[ev.id] = { col: columns.length - 1, columns: 1, span: 1 };
            }
        }

        // B. Place Mover (Force Right on Collision)
        if (mover) {
            let targetCol = 0;
            let placed = false;

            // Try to fit in existing columns (filling gaps)
            for (let i = 0; i < columns.length; i++) {
                const col = columns[i];
                const hasCollision = col.some(existingEv => 
                    Math.max(mover.s, existingEv.s) < Math.min(mover.e, existingEv.e)
                );
                
                if (!hasCollision) {
                    col.push(mover);
                    layout[mover.id] = { col: i, columns: 1, span: 1 };
                    placed = true;
                    break;
                }
            }

            // If collision in all columns, create new one at the end
            if (!placed) {
                columns.push([mover]);
                layout[mover.id] = { col: columns.length - 1, columns: 1, span: 1 };
            }
        }
        
        const totalCols = columns.length;

        // C. Expansion Logic
        for (let i = 0; i < columns.length; i++) {
            const colEvents = columns[i];
            for (const ev of colEvents) {
                let span = 1;
                for (let nextCol = i + 1; nextCol < totalCols; nextCol++) {
                    const nextColEvents = columns[nextCol];
                    const hasOverlap = nextColEvents.some(otherEv => 
                        Math.max(ev.s, otherEv.s) < Math.min(ev.e, otherEv.e)
                    );
                    if (!hasOverlap) {
                        span++;
                    } else {
                        break;
                    }
                }
                layout[ev.id].columns = totalCols;
                layout[ev.id].span = span;
            }
        }
    }
    return layout;
  }, [lastMovedEventId]);

  const layoutById = useMemo<Record<string, LayoutInfo>>(() => {
    // Save original layout when drag starts
    if (draggingEventId && Object.keys(originalLayoutRef.current).length === 0) {
      const events = timedEvents.map(e => {
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
      const baseLayout = calculateLayout(events, null);
      originalLayoutRef.current = baseLayout;
    }
    
    // Clear original layout when drag ends
    if (!draggingEventId && Object.keys(originalLayoutRef.current).length > 0) {
      originalLayoutRef.current = {};
    }

    // If dragging and we have a current drag position, calculate preview layout
    // This shows how other tasks will move to make space for the dragged task
    if (draggingEventId && currentDragPosition !== null) {
      const draggedEvent = timedEvents.find(e => e.id === draggingEventId);
      if (draggedEvent) {
        const originalStartM = toMinutes(draggedEvent.startTime);
        const originalEndM = toMinutes(draggedEvent.endTime);
        const duration = originalEndM - originalStartM;
        const newEndMinutes = Math.min(1440, currentDragPosition + duration);

        const events = timedEvents.map(e => {
          if (e.id === draggingEventId) {
            return {
              ...e,
              s: currentDragPosition,
              e: newEndMinutes,
              duration,
              isLastMoved: true // Force mover status for preview
            };
          }
          
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

        // Calculate layout with dragged task at preview position
        // Pass original layout to preserve columns if still overlapping
        return calculateLayout(events, draggingEventId, originalLayoutRef.current);
      }
    }

    // Normal layout calculation (no drag or no preview position yet)
    const events = timedEvents.map(e => {
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
    
    return calculateLayout(events, draggingEventId);
  }, [timedEvents, pendingEventPositions, lastMovedEventId, draggingEventId, currentDragPosition, calculateLayout]);
  
  const calculateDragLayout = useCallback((draggedEventId: string, newStartMinutes: number, hasClearedOverlap: boolean): { width: number; left: number } => {
    const draggedEvent = timedEvents.find(e => e.id === draggedEventId);
    if (!draggedEvent) {
      const screenWidth = Dimensions.get('window').width;
      const availableWidth = screenWidth - LEFT_MARGIN;
      return { width: availableWidth - 2, left: LEFT_MARGIN };
    }

    const originalLayout = layoutById[draggedEventId] || { col: 0, columns: 1, span: 1 };

    if (!hasClearedOverlap) {
      const screenWidth = Dimensions.get('window').width;
      const availableWidth = screenWidth - LEFT_MARGIN;
      const columns = Math.max(1, originalLayout.columns);
      const colWidth = availableWidth / columns;
      const left = LEFT_MARGIN + (originalLayout.col * colWidth);
      return { width: (colWidth * originalLayout.span) - 2, left };
    }

    const originalStartM = toMinutes(draggedEvent.startTime);
    const originalEndM = toMinutes(draggedEvent.endTime);
    const duration = originalEndM - originalStartM;
    const newEndMinutes = Math.min(1440, newStartMinutes + duration);

    const tempDraggedEvent = {
      ...draggedEvent,
      startTime: minutesToTime(newStartMinutes),
      endTime: minutesToTime(newEndMinutes),
    };

    const events = timedEvents.map(e => {
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
        // Important: Pass lastMovedEventId here so calculateLayout knows who WAS moved before
        // But draggingEventId takes precedence inside calculateLayout
        isLastMoved: e.id === lastMovedEventId 
      };
    });

    const tempLayout = calculateLayout(events, draggedEventId);
    
    const draggedLayout = tempLayout[draggedEventId] || { col: 0, columns: 1, span: 1 };
    const screenWidth = Dimensions.get('window').width;
    const availableWidth = screenWidth - LEFT_MARGIN;
    const colWidth = availableWidth / draggedLayout.columns;
    const left = LEFT_MARGIN + (draggedLayout.col * colWidth);

    return {
      width: (colWidth * draggedLayout.span) - 2,
      left,
    };
  }, [timedEvents, layoutById, calculateLayout, lastMovedEventId]);

  const getEventStyle = (event: OggiEvent) => {
    const originalStart = toMinutes(event.startTime);
    const originalEnd = toMinutes(event.endTime);
    const pendingStart = pendingEventPositions[event.id];
    const startM = pendingStart ?? originalStart;
    const endM = pendingStart !== undefined ? Math.min(1440, startM + (originalEnd - originalStart)) : originalEnd;
    
    if (endM <= windowStartMin || startM >= windowEndMin) return null;
    
    const visibleStart = Math.max(startM, windowStartMin);
    const visibleEnd = Math.min(endM, windowEndMin);
    
    const top = ((visibleStart - windowStartMin) / 60) * hourHeight;
    const durationMin = visibleEnd - visibleStart;
    const height = Math.max(1, (durationMin / 60) * hourHeight);
    
    let lay = layoutById[event.id] || { col: 0, columns: 1, span: 1 };
    
    const screenWidth = Dimensions.get('window').width;
    const availableWidth = screenWidth - LEFT_MARGIN;
    const colWidth = availableWidth / lay.columns;
    const left = LEFT_MARGIN + (lay.col * colWidth);
    const width = (colWidth * lay.span) - 2;
    
    const endsOnHour = endM % 60 === 0;
    const heightBuffer = endsOnHour ? 3.75 : 4;
    const adjustedTop = top + 2;
    const adjustedHeight = Math.max(1, height - heightBuffer);

    return {
      top: adjustedTop,
      height: adjustedHeight,
      left,
      width,
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
                if (minutesFromStart < 0 || minutesFromStart > totalMinutes + 60) return null;
                
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
                   dragClearedOriginalOverlap={dragClearedOriginalOverlap}
                   setDragClearedOriginalOverlap={setDragClearedOriginalOverlap}
                  setDragSizingLocked={setDragSizingLocked}
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

      {/* Settings Modal */}
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