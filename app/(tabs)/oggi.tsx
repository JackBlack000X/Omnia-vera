import { THEME } from '@/constants/theme';
import { isToday } from '@/lib/date';
import { useHabits } from '@/lib/habits/Provider';
import { calculateLayout, LayoutInfo } from '@/lib/layoutEngine';
import { cancelAllScheduledNotifications, registerForPushNotificationsAsync, scheduleHabitNotification } from '@/lib/notifications';
import { storage } from '@/lib/storage';
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
  createdAt?: string;
};


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
  updateScheduleFromDate: (id: string, fromDate: string, startTime: string | null, endTime: string | null) => void;
  setPendingEventPositions: Dispatch<SetStateAction<Record<string, number>>>;
  setRecentlyMovedEventId: (id: string | null) => void;
  setLastMovedEventId: (id: string) => void;
  setCurrentDragPosition: (minutes: number | null) => void;
  currentDragPosition: number | null;
  dragMode: 'forward' | 'single';
  timedEvents: OggiEvent[];
  layoutById: Record<string, LayoutInfo>;
  calculateDragLayout: (draggedEventId: string, newStartMinutes: number, hasClearedOverlap: boolean) => { width: number; left: number };
  brokenOverlapPairsRef: React.MutableRefObject<Set<string>>;
  columnRankRef: React.MutableRefObject<Record<string, number>>;
  rankCounterRef: React.MutableRefObject<number>;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
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
  updateScheduleFromDate,
  setPendingEventPositions,
  setRecentlyMovedEventId,
  setLastMovedEventId,
  setCurrentDragPosition,
  currentDragPosition,
  dragMode,
  timedEvents,
  layoutById,
  calculateDragLayout,
  brokenOverlapPairsRef,
  columnRankRef,
  rankCounterRef,
  onDragStart,
  onDragEnd,
}: DraggableEventProps) {
  const isDragging = draggingEventId === event.id;
  const bg = event.color;
  const light = isLightColor(bg);

  const dragWidthValue = useSharedValue(layoutStyle.width);
  const dragLeftValue = useSharedValue(layoutStyle.left);

  const layoutStyleRef = useRef(layoutStyle);
  const timedEventsRef = useRef(timedEvents);
  const calculateDragLayoutRef = useRef(calculateDragLayout);
  const layoutByIdRef = useRef(layoutById);
  const initialSnapshotRef = useRef({ width: 0, left: 0 });
  const overlapClearedRef = useRef(false);
  const originalOverlapIdsRef = useRef<Set<string>>(new Set());

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
          
          const overlaps = new Set<string>();
          const startM = toMinutes(event.startTime);
          const endM = toMinutes(event.endTime);
          const currentTimedEvents = timedEventsRef.current;
          currentTimedEvents.forEach(other => {
            if (other.id === event.id) return;
            const otherStart = toMinutes(other.startTime);
            const otherEnd = toMinutes(other.endTime);
            const isOverlap = !(endM <= otherStart || startM >= otherEnd);
            if (isOverlap) overlaps.add(other.id);
          });
          originalOverlapIdsRef.current = overlaps;
          brokenOverlapPairsRef.current = new Set();
          
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
          onDragStart(event.id);
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
          let overlapsAny = false;
          let overlapsOriginal = false;
          const originalPartners = originalOverlapIdsRef.current;
          const shouldCheckOriginal = originalPartners.size > 0;
          
          // Check each original partner individually to track which pairs broke overlap
          for (const originalPartnerId of originalPartners) {
            const other = currentTimedEvents.find(e => e.id === originalPartnerId);
            if (!other) continue;
            const otherStart = toMinutes(other.startTime);
            const otherEnd = toMinutes(other.endTime);
            const isOverlap = !(draggedCurrentEnd <= otherStart || clampedMinutes >= otherEnd);
            
            if (!isOverlap) {
              // This pair broke overlap - mark it
              const pairKey1 = `${event.id}-${originalPartnerId}`;
              const pairKey2 = `${originalPartnerId}-${event.id}`;
              brokenOverlapPairsRef.current.add(pairKey1);
              brokenOverlapPairsRef.current.add(pairKey2);
            } else {
              overlapsOriginal = true;
            }
          }
          
          for (const other of currentTimedEvents) {
            if (other.id === event.id) continue;
            const otherStart = toMinutes(other.startTime);
            const otherEnd = toMinutes(other.endTime);
            const isOverlap = !(draggedCurrentEnd <= otherStart || clampedMinutes >= otherEnd);
            if (isOverlap) {
              overlapsAny = true;
            }
          }
          
          const stillOverlapping = shouldCheckOriginal ? overlapsOriginal : overlapsAny;
          
          if (!stillOverlapping) {
            setDragClearedOriginalOverlap(true);
            overlapClearedRef.current = true;
          }
        }

        // >>> FIX: Aggiorna currentDragPosition anche al primo movimento
        // Questo permette al layout di ricalcolarsi correttamente anche quando si muove di poco
        if (hasMovedRef.current || movedMinutes > 0) {
          setCurrentDragPosition(clampedMinutes);
          // >>> FIX: Ricalcola sempre il layout, anche quando overlapClearedRef è false
          // Questo permette alla task in drag di aggiornarsi visivamente anche quando è ancora in overlap
          const dragLayout = calculateDragLayoutRef.current(event.id, clampedMinutes, overlapClearedRef.current);
          dragWidthValue.value = dragLayout.width;
          dragLeftValue.value = dragLayout.left;
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
        originalOverlapIdsRef.current = new Set();
        brokenOverlapPairsRef.current = new Set();
        setDragSizingLocked(false);
        setDraggingEventId(null);
        setCurrentDragPosition(null);
        dragY.value = 0;
        onDragEnd();
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
        
        if (hasMovedRef.current) {
           setRecentlyMovedEventId(event.id);
           setLastMovedEventId(event.id);
        }

        const selectedYmd = getDay(currentDate);
        if (dragMode === 'single') {
          setTimeOverrideRange(event.id, selectedYmd, newStartTime, newEndTime);
        } else {
          updateScheduleFromDate(event.id, selectedYmd, newStartTime, newEndTime);
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (hasMovedRef.current) {
          // Snapshot every task's current column position as its new rank.
          // After the first drag, visual column order (left=lowest rank) becomes
          // the authoritative priority for future left/right placement — createdAt
          // is no longer relevant once any task has been moved.
          const currentLayout = layoutByIdRef.current;
          const allIds = Object.keys(currentLayout);
          // Sort by current column; break ties with existing rank so the order
          // within each column (non-overlapping tasks sharing a slot) stays stable.
          allIds.sort((a, b) => {
            const ca = currentLayout[a]?.col ?? 0;
            const cb = currentLayout[b]?.col ?? 0;
            if (ca !== cb) return ca - cb;
            return (columnRankRef.current[a] ?? 0) - (columnRankRef.current[b] ?? 0);
          });
          for (let i = 0; i < allIds.length; i++) {
            columnRankRef.current[allIds[i]] = i + 1;
          }
          rankCounterRef.current = allIds.length;
        }
        
        dragInitialTop.value = finalTop;
        dragY.value = 0;
        isDragActiveRef.current = false;
        lastSnappedMinuteRef.current = null;
        hasMovedRef.current = false;
        initialStartMinutesRef.current = null;
        setDragClearedOriginalOverlap(false);
        overlapClearedRef.current = false;
        originalOverlapIdsRef.current = new Set();
        brokenOverlapPairsRef.current = new Set();
        setDragSizingLocked(false);
        setDraggingEventId(null);
        setCurrentDragPosition(null);
        onDragEnd();
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
    onDragStart,
    onDragEnd,
    setDraggingEventId,
    setDragClearedOriginalOverlap,
    setDragSizingLocked,
    setPendingEventPositions,
    setRecentlyMovedEventId,
    setLastMovedEventId,
    setCurrentDragPosition,
    setTimeOverrideRange,
    updateScheduleFromDate,
    dragMode,
    getDay
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      top: isDragging ? dragInitialTop.value + dragY.value : baseTop,
      opacity: isDragging ? 0.8 : 1,
      zIndex: isDragging ? 1000 : 1,
      width: isDragging ? dragWidthValue.value : layoutStyle.width,
      left: isDragging ? dragLeftValue.value : layoutStyle.left,
    };
  }, [isDragging, baseTop, layoutStyle.width, layoutStyle.left]);

  const currentLayout = layoutById[event.id] || { col: 0, columns: 1, span: 1 };
  let debugLabel = `COL:${currentLayout.col}`;
  if (currentLayout.span > 1) {
    const cols = [];
    for (let i = 0; i < currentLayout.span; i++) {
      cols.push(currentLayout.col + i);
    }
    debugLabel = `COL:${cols.join('+')}`;
  }
  debugLabel += ` [${currentLayout.columns}]`;
  if (isDragging) debugLabel += ' DRAG';
  
  const eventStyle = [
    styles.eventItem,
    {
      height: layoutStyle.height,
      backgroundColor: bg,
    },
    animatedStyle,
  ];

  return (
    <View {...panResponder.panHandlers}>
        <Animated.View style={eventStyle}>
          <Text style={[styles.eventTitle, { color: light ? '#000' : '#FFF', fontSize: 10, fontWeight: 'bold' }]}>
            {debugLabel}
          </Text>
          <Text style={[styles.eventTitle, { color: light ? '#000' : '#FFF' }]} numberOfLines={1}>
            {event.title}
          </Text>
          {layoutStyle.height > 30 && (
            <Text style={[styles.eventTime, { color: light ? '#000' : '#FFF' }]}>
              {event.startTime} - {event.endTime}
            </Text>
          )}
        </Animated.View>
    </View>
  );
}

export default function OggiScreen() {
  const { habits, history, getDay, setTimeOverrideRange, updateScheduleFromDate } = useHabits();
  const { activeTheme } = useAppTheme();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [showSettings, setShowSettings] = useState(false);
  const [dragMode, setDragMode] = useState<'forward' | 'single'>('forward');
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
  
  const stableLayoutRef = useRef<Record<string, LayoutInfo>>({});
  const brokenOverlapPairsRef = useRef<Set<string>>(new Set());
  const initialOverlapsRef = useRef<Set<string>>(new Set());
  // Rank determines left-to-right order within a cluster.
  // Initialised from createdAt; bumped to a new high value each time a task is dragged,
  // so the last-moved task is always rightmost. Never reset, so relative order is stable.
  const columnRankRef = useRef<Record<string, number>>({});
  let rankCounterRef = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [start, end, visible, mode] = await Promise.all([
          AsyncStorage.getItem('oggi_window_start_v1'),
          AsyncStorage.getItem('oggi_window_end_v1'),
          AsyncStorage.getItem('oggi_visible_hours_v1'),
          AsyncStorage.getItem('oggi_drag_mode_v1'),
        ]);
        if (start) setWindowStart(start);
        if (end) setWindowEnd(end);
        if (visible) {
             const v = parseInt(visible, 10);
             if (!isNaN(v) && v >= 5 && v <= 24) setVisibleHours(v);
        }
        if (mode === 'single' || mode === 'forward') setDragMode(mode);
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
    AsyncStorage.setItem('oggi_drag_mode_v1', dragMode).catch(() => {});
  }, [dragMode]);

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date());
    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  // Sync notifications for today's habits
  useEffect(() => {
    (async () => {
      // Only schedule notifications if we are looking at today
      if (!isToday(currentDate, TZ)) return;

      await cancelAllScheduledNotifications();
      
      const now = new Date();
      for (const ev of timedEvents) {
        if (ev.isAllDay) continue;
        
        const [h, m] = ev.startTime.split(':').map(Number);
        const eventTime = new Date();
        eventTime.setHours(h, m, 0, 0);

        // Schedule if it's in the future (within today)
        if (eventTime > now) {
          // Send notification 10 minutes before
          const triggerTime = new Date(eventTime.getTime() - 10 * 60000);
          if (triggerTime > now) {
            await scheduleHabitNotification(
              'Abitudine in arrivo!',
              `${ev.title} inizia alle ${ev.startTime}`,
              triggerTime
            );
          }
        }
      }
    })();
  }, [timedEvents, currentDate]);

  const today = getDay(currentDate);
  const todayDate = useMemo(() => formatDateLong(currentDate, TZ), [currentDate]);

  const windowStartMin = toMinutes(windowStart);
  const windowEndMin = windowEnd === '24:00' ? 1440 : toMinutes(windowEnd);
  
  const [allDayHeight, setAllDayHeight] = useState(0);


  const hourHeight = useMemo(() => {
    const factor = activeTheme === 'futuristic' ? 0.78 : 0.775;
    const base = Dimensions.get('window').height * factor;
    return (base - allDayHeight) / visibleHours;
  }, [allDayHeight, visibleHours, activeTheme]);

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

      // Single-frequency tasks only appear on days that have an explicit override
      const isSingle = h.habitFreq === 'single' || (
        !h.habitFreq &&
        (Object.keys(h.timeOverrides ?? {}).length > 0) &&
        (h.schedule?.daysOfWeek?.length ?? 0) === 0 &&
        !h.schedule?.monthDays?.length &&
        !h.schedule?.yearMonth
      );
      if (isSingle && !hasOverrideForSelected) continue;

      const sched = h.schedule;
      let showToday = true;
      if (sched && !isSingle) {
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
      // '00:00' stored as a string (not an object) is used as an all-day marker by the modal
      const isAllDayMarker = override === '00:00';
      const overrideStart = !isAllDayMarker && typeof override === 'string' ? override : (!isAllDayMarker ? override?.start : undefined);
      const overrideEnd = !isAllDayMarker && typeof override === 'object' && override !== null ? override.end : null;

      const weekly = h.schedule?.weeklyTimes?.[weekday] ?? null;
      const monthlyT = h.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
      const start = overrideStart ?? (weekly?.start ?? monthlyT?.start ?? (h.schedule?.time ?? null));
      const end = overrideEnd ?? (weekly?.end ?? monthlyT?.end ?? (h.schedule?.endTime ?? null));
      const color = h.color ?? '#3b82f6';
      const title = h.text;

      if (isAllDayMarker || (!start && !end)) {
        allDay.push({ id: h.id, title, startTime: '00:00', endTime: '24:00', isAllDay: true, color, createdAt: h.createdAt });
      } else if (start) {
        let finalEnd = end;
        if (!end) {
           const [sh] = start.split(':').map(Number);
           const nextHour = Math.min(24, sh + 1);
           finalEnd = nextHour === 24 ? '24:00' : `${String(nextHour).padStart(2, '0')}:00`;
        } else if (end === '23:59') {
          finalEnd = '24:00';
        }
        items.push({ id: h.id, title, startTime: start, endTime: finalEnd!, isAllDay: false, color, createdAt: h.createdAt });
      } else if (!start && end) {
        const [eh] = end.split(':').map(Number);
        const startHour = Math.max(0, eh - 1);
        items.push({ id: h.id, title, startTime: `${String(startHour).padStart(2, '0')}:00`, endTime: end === '23:59' ? '24:00' : end, isAllDay: false, color, createdAt: h.createdAt });
      }
    }
    return { timedEvents: items, allDayEvents: allDay };
  }, [habits, weekday, dayOfMonth, currentDate, getDay, monthIndex1]);

  // Initialise column rank for any task that doesn't yet have one.
  // Rank determines left-to-right order: lower rank = leftmost column.
  // Initial rank comes from createdAt (older = lower rank).
  // Tasks with the same createdAt are sorted by ID string for stability.
  // On drag end the moved task gets a new rank higher than all existing ones,
  // making it permanently rightmost until another task is moved after it.
  useEffect(() => {
    const ranks = columnRankRef.current;
    const newTasks = timedEvents.filter(ev => ranks[ev.id] === undefined);
    if (newTasks.length === 0) return;

    // Sort new tasks by createdAt then id to assign ranks in creation order
    newTasks.sort((a, b) => {
      const da = a.createdAt ?? '';
      const db = b.createdAt ?? '';
      if (da !== db) return da < db ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });

    // Assign ranks starting from 1, spaced so there is room between existing tasks
    let next = rankCounterRef.current + 1;
    for (const ev of newTasks) {
      ranks[ev.id] = next++;
    }
    rankCounterRef.current = next - 1;
  }, [timedEvents]);

  // Reset all-day section height when there are no all-day events so hourHeight is unaffected
  useEffect(() => {
    if (allDayEvents.length === 0) setAllDayHeight(0);
  }, [allDayEvents.length]);

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
    const events = timedEvents.map(e => {
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
        const lockSnapshot = dragClearedOriginalOverlap ? undefined : stableLayoutRef.current;
        return calculateLayoutCallback(events, draggingEventId, lockSnapshot);
    } 
    
    return calculateLayoutCallback(events, null);
  }, [timedEvents, pendingEventPositions, lastMovedEventId, draggingEventId, currentDragPosition, calculateLayoutCallback]);
  
  const handleDragStart = useCallback((id: string) => {
    stableLayoutRef.current = layoutById;
    
    // Calculate initial overlaps when drag starts
    const initialOv = new Set<string>();
    for (let i = 0; i < timedEvents.length; i++) {
      const e1 = timedEvents[i];
      const s1 = toMinutes(e1.startTime);
      const end1 = toMinutes(e1.endTime);
      for (let j = i + 1; j < timedEvents.length; j++) {
        const e2 = timedEvents[j];
        const s2 = toMinutes(e2.startTime);
        const end2 = toMinutes(e2.endTime);
        if (Math.max(s1, s2) < Math.min(end1, end2)) {
          initialOv.add(`${e1.id}-${e2.id}`);
          initialOv.add(`${e2.id}-${e1.id}`);
        }
      }
    }
    initialOverlapsRef.current = initialOv;
  }, [layoutById, timedEvents]);

  const handleDragEnd = useCallback(() => {
      setDraggingEventId(null);
  }, []);
  
  const calculateDragLayout = useCallback((draggedEventId: string, newStartMinutes: number, hasClearedOverlap: boolean): { width: number; left: number } => {
    const draggedEvent = timedEvents.find(e => e.id === draggedEventId);
    if (!draggedEvent) {
      const screenWidth = Dimensions.get('window').width;
      const availableWidth = screenWidth - LEFT_MARGIN;
      return { width: availableWidth - 2, left: LEFT_MARGIN };
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
        isLastMoved: e.id === lastMovedEventId 
      };
    });

    // Always recalculate layout to get the correct span, especially when D enters overlap
    // Use the same logic as layoutById: if hasClearedOverlap is true, don't use lock snapshot
    const lockSnapshot = hasClearedOverlap ? undefined : stableLayoutRef.current;
    const tempLayout = calculateLayoutCallback(events, draggedEventId, lockSnapshot);
    
    const draggedLayout = tempLayout[draggedEventId] || { col: 0, columns: 1, span: 1 };
    const screenWidth = Dimensions.get('window').width;
    const availableWidth = screenWidth - LEFT_MARGIN;
    const colWidth = availableWidth / draggedLayout.columns;
    const left = LEFT_MARGIN + (draggedLayout.col * colWidth);

    return {
      width: (colWidth * draggedLayout.span) - 2,
      left,
    };
  }, [timedEvents, layoutById, calculateLayoutCallback, lastMovedEventId]);

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

      {/* All Day Area — visible only when there are all-day events */}
      {allDayEvents.length > 0 ? (
        <View style={styles.allDayContainer} onLayout={(e) => setAllDayHeight(e.nativeEvent.layout.height)}>
          {allDayEvents.map((e, i) => {
            const bg = e.color;
            const light = isLightColor(bg);
            return (
              <View
                key={e.id}
                style={[
                  styles.allDayItem,
                  { backgroundColor: bg },
                  i < allDayEvents.length - 1 && { marginRight: 4 },
                ]}
              >
                <Text style={[styles.eventTitle, { color: light ? '#000' : '#FFF' }]} numberOfLines={1}>
                  {e.title}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Main Timeline Scroll */}
      <GestureHandlerRootView
        style={{ flex: 1 }}
      >
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
                   onDragStart={handleDragStart}
                   onDragEnd={handleDragEnd}
                   setDraggingEventId={setDraggingEventId}
                   dragClearedOriginalOverlap={dragClearedOriginalOverlap}
                   setDragClearedOriginalOverlap={setDragClearedOriginalOverlap}
                  setDragSizingLocked={setDragSizingLocked}
                   windowStartMin={windowStartMin}
                   hourHeight={hourHeight}
                   currentDate={currentDate}
                   getDay={getDay}
                   setTimeOverrideRange={setTimeOverrideRange}
                   updateScheduleFromDate={updateScheduleFromDate}
                   setPendingEventPositions={setPendingEventPositions}
                   setRecentlyMovedEventId={setRecentlyMovedEventId}
                   setLastMovedEventId={setLastMovedEventId}
                   setCurrentDragPosition={setCurrentDragPosition}
                   currentDragPosition={currentDragPosition}
                   dragMode={dragMode}
                   timedEvents={timedEvents}
                   layoutById={layoutById}
                   calculateDragLayout={calculateDragLayout}
                   brokenOverlapPairsRef={brokenOverlapPairsRef}
                   columnRankRef={columnRankRef}
                   rankCounterRef={rankCounterRef}
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

               {/* Drag Mode Control */}
               <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Drag & Drop: {dragMode === 'forward' ? 'Da oggi in poi' : 'Solo questo giorno'}</Text>
                  <View style={styles.settingControls}>
                     <TouchableOpacity style={styles.controlBtnWide} onPress={() => {
                        setDragMode(prev => prev === 'forward' ? 'single' : 'forward');
                     }}><Text style={[styles.controlBtnText, { fontSize: 14 }]}>Cambia</Text></TouchableOpacity>
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