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
type PairLock = {
  leftId: string;
  rightId: string;
  leftCol: number;
  rightCol: number;
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
  updateScheduleTimes: (habitId: string, start: string | null, end: string | null) => void;
  setPendingEventPositions: Dispatch<SetStateAction<Record<string, number>>>;
  setRecentlyMovedEventId: (id: string | null) => void;
  setLastMovedEventId: (id: string) => void;
  setCurrentDragPosition: (minutes: number | null) => void;
  timedEvents: OggiEvent[];
  layoutById: Record<string, LayoutInfo>;
  calculateDragLayout: (draggedEventId: string, newStartMinutes: number, hasClearedOverlap: boolean) => { width: number; left: number };
  brokenOverlapPairsRef: React.MutableRefObject<Set<string>>;
  finalDragColumnRef: React.MutableRefObject<Record<string, number>>;
  adjTaskIdsRef: React.MutableRefObject<Set<string>>;
  nearTaskIdsRef: React.MutableRefObject<Set<string>>;
  taskPositionTypeRef: React.MutableRefObject<Record<string, 'top' | 'bottom' | 'middle'>>;
  taskPositionTypeState: Record<string, 'top' | 'bottom' | 'middle'>;
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
  updateScheduleTimes,
  setPendingEventPositions,
  setRecentlyMovedEventId,
  setLastMovedEventId,
  setCurrentDragPosition,
  timedEvents,
  layoutById,
  calculateDragLayout,
  brokenOverlapPairsRef,
  finalDragColumnRef,
  adjTaskIdsRef,
  nearTaskIdsRef,
  taskPositionTypeRef,
  taskPositionTypeState,
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
        setTimeOverrideRange(event.id, selectedYmd, newStartTime, newEndTime);
        updateScheduleTimes(event.id, newStartTime, newEndTime);

        // TEST: Save the final column where task was dropped
        const currentLayout = layoutByIdRef.current[event.id];
        if (currentLayout) {
          finalDragColumnRef.current[event.id] = currentLayout.col;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        
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
  
  // Debug: Show column number (0 = leftmost, +1 for each column to the right)
  // If task spans multiple columns, show all columns (e.g., "COL:0+1" for span 2)
  const currentLayout = layoutById[event.id] || { col: 0, columns: 1, span: 1 };
  let debugLabel = `COL:${currentLayout.col}`;
  if (currentLayout.span > 1) {
    const columns = [];
    for (let i = 0; i < currentLayout.span; i++) {
      columns.push(currentLayout.col + i);
    }
    debugLabel = `COL:${columns.join('+')}`;
  }
  
  // Add number showing how many parts the total space is divided into (total columns)
  debugLabel += ` [${currentLayout.columns}]`;
  
  // Add position type (Top/Bottom/Middle) if available
  // Use state to ensure re-render when it changes
  const positionType = taskPositionTypeState[event.id] || taskPositionTypeRef.current[event.id];
  if (positionType) {
    debugLabel += ` ${positionType.toUpperCase()}`;
  }
  
  // Add "DRAG" if this task is being dragged
  if (isDragging) {
    debugLabel += ' DRAG';
  } else if (draggingEventId) {
    // Check if this task is near the dragged task (recursively: if it touches a task with NEAR, it also has NEAR)
    const draggedEvent = timedEvents.find(e => e.id === draggingEventId);
    if (draggedEvent) {
      const currentStart = toMinutes(event.startTime);
      const currentEnd = toMinutes(event.endTime);
      const draggedStart = toMinutes(draggedEvent.startTime);
      const draggedEnd = toMinutes(draggedEvent.endTime);
      
      // Build sets of tasks that have ADJ (adjacent to dragged) or NEAR
      const adjTaskIds = new Set<string>();
      const nearTaskIds = new Set<string>();
      const checkedTaskIds = new Set<string>();
      const draggedLayout = layoutById[draggingEventId] || { col: 0, columns: 1, span: 1 };
      
      // Helper function to check if a task should have ADJ or NEAR
      const shouldHaveNear = (taskId: string): 'adj' | 'near' | false => {
        if (checkedTaskIds.has(taskId)) {
          if (adjTaskIds.has(taskId)) return 'adj';
          if (nearTaskIds.has(taskId)) return 'near';
          return false;
        }
        checkedTaskIds.add(taskId);
        
        const task = timedEvents.find(e => e.id === taskId);
        if (!task) return false;
        
        const taskStart = toMinutes(task.startTime);
        const taskEnd = toMinutes(task.endTime);
        const taskLayout = layoutById[taskId] || { col: 0, columns: 1, span: 1 };
        
        // Check if overlaps directly with dragged task AND is in adjacent column
        // Must be adjacent to ALL columns occupied by dragged task
        const overlapsDragged = Math.max(taskStart, draggedStart) < Math.min(taskEnd, draggedEnd);
        if (overlapsDragged) {
          // Get all columns occupied by dragged task
          const draggedCols: number[] = [];
          for (let i = 0; i < draggedLayout.span; i++) {
            draggedCols.push(draggedLayout.col + i);
          }
          
          // For task to be ADJ, it must be adjacent to at least one dragged column
          // and not be inside any dragged column
          const isAdjacentToAny = draggedCols.some(draggedCol => 
            Math.abs(taskLayout.col - draggedCol) === 1
          );
          const isNotInside = !draggedCols.includes(taskLayout.col);
          
          if (isAdjacentToAny && isNotInside) {
            adjTaskIds.add(taskId);
            return 'adj';
          } else {
            nearTaskIds.add(taskId);
            return 'near';
          }
        }
        
        // Check if overlaps with any task that has NEAR/ADJ
        const overlapsWithNear = timedEvents.some(other => {
          if (other.id === taskId || other.id === draggingEventId) return false;
          const otherStart = toMinutes(other.startTime);
          const otherEnd = toMinutes(other.endTime);
          const overlaps = Math.max(taskStart, otherStart) < Math.min(taskEnd, otherEnd);
          if (!overlaps) return false;
          // Recursively check if other task has NEAR/ADJ
          return shouldHaveNear(other.id) !== false;
        });
        
        if (overlapsWithNear) {
          nearTaskIds.add(taskId);
          return 'near';
        }
        
        // Check if to the right of a task that has NEAR/ADJ
        const rightOfNear = timedEvents.some(other => {
          if (other.id === taskId || other.id === draggingEventId) return false;
          const otherLayout = layoutById[other.id] || { col: 0, columns: 1, span: 1 };
          if (otherLayout.col !== taskLayout.col - 1) return false;
          const otherStart = toMinutes(other.startTime);
          const otherEnd = toMinutes(other.endTime);
          const overlaps = Math.max(taskStart, otherStart) < Math.min(taskEnd, otherEnd);
          if (!overlaps) return false;
          return shouldHaveNear(other.id) !== false;
        });
        
        if (rightOfNear) {
          nearTaskIds.add(taskId);
          return 'near';
        }
        
        return false;
      };
      
      const result = shouldHaveNear(event.id);
      
      if (result === 'adj') {
        // Save task as having ADJ
        adjTaskIdsRef.current.add(event.id);
        debugLabel += ' ADJ';
      } else if (result === 'near') {
        // Save task as having NEAR
        nearTaskIdsRef.current.add(event.id);
        debugLabel += ' NEAR';
      }
    }
  } else {
    // Not in drag, but check if this task had ADJ during previous drag
    if (adjTaskIdsRef.current.has(event.id)) {
      debugLabel += ' ADJ';
    }
  }
  
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
  
  // Stores the stable layout (snapshot) to use as a lock during drag
  const stableLayoutRef = useRef<Record<string, LayoutInfo>>({});
  const pairLockRef = useRef<Record<string, PairLock>>({});
  // Tracks pairs that broke overlap during current drag (format: "id1-id2" or "id2-id1")
  const brokenOverlapPairsRef = useRef<Set<string>>(new Set());
  // TEST: Stores the final column where task was dropped during drag
  const finalDragColumnRef = useRef<Record<string, number>>({});
  // Stores tasks that have ADJ during drag (persists after drag ends)
  const adjTaskIdsRef = useRef<Set<string>>(new Set());
  // Stores tasks that have NEAR during drag (for compaction after drag ends)
  const nearTaskIdsRef = useRef<Set<string>>(new Set());
  // Stores position type (Top/Bottom/Middle) for tasks during drag
  const taskPositionTypeRef = useRef<Record<string, 'top' | 'bottom' | 'middle'>>({});
  // State to force re-render when position type changes
  const [taskPositionTypeState, setTaskPositionTypeState] = useState<Record<string, 'top' | 'bottom' | 'middle'>>({});

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

  // Logic for layout calculation
  const calculateLayout = useCallback((
    events: (OggiEvent & { s: number; e: number; duration: number; isLastMoved: boolean })[],
    draggedEventId: string | null,
    lockedLayout?: Record<string, LayoutInfo> // "Frozen" layout from snapshot
  ) => {
    const layout: Record<string, LayoutInfo> = {};
    const eventMap = events.reduce<Record<string, (typeof events)[number]>>((acc, ev) => {
      acc[ev.id] = ev;
      return acc;
    }, {});

    const prunePairLocks = () => {
      const locks = pairLockRef.current;
      for (const key of Object.keys(locks)) {
        const lock = locks[key];
        const left = eventMap[lock.leftId];
        const right = eventMap[lock.rightId];
        if (!left || !right) {
          delete locks[key];
          continue;
        }
        const stillOverlap = Math.max(left.s, right.s) < Math.min(left.e, right.e);
        const sameStart = left.s === right.s;
        const rightStartsEarlier = right.s < left.s;
        if (!stillOverlap || (!sameStart && !rightStartsEarlier)) {
          delete locks[key];
        }
      }
    };

    prunePairLocks();

    const lockEntries = Object.entries(pairLockRef.current);
    const lockLookup = lockEntries.reduce<Record<string, { col: number; pairKey: string; partnerId: string }>>((acc, [key, lock]) => {
      acc[lock.leftId] = { col: lock.leftCol, pairKey: key, partnerId: lock.rightId };
      acc[lock.rightId] = { col: lock.rightCol, pairKey: key, partnerId: lock.leftId };
      return acc;
    }, {});
    
    // 1. Cluster based on time
    let clusters: typeof events[] = [];
    let currentCluster: typeof events = [];
    let clusterEnd = -1;

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

    // 2. Process clusters
    for (const cluster of clusters) {
        // Sort order: Stable first, Mover last
        const insertionOrder = [...cluster].sort((a, b) => {
            const aIsMover = draggedEventId ? (a.id === draggedEventId) : (a.id === lastMovedEventId);
            const bIsMover = draggedEventId ? (b.id === draggedEventId) : (b.id === lastMovedEventId);
            
            if (!aIsMover && bIsMover) return -1;
            if (aIsMover && !bIsMover) return 1;
            
            if (a.s !== b.s) return a.s - b.s;
            return b.duration - a.duration;
        });

        const columns: typeof insertionOrder[] = [];
        
        for (const ev of insertionOrder) {
            const isMover = draggedEventId ? (ev.id === draggedEventId) : (ev.id === lastMovedEventId);
            let startSearchCol = 0;

            // During drag: if task has no overlap with any other task, put it in column 0 (highest priority)
            if (isMover && draggedEventId) {
                const hasOverlap = cluster.some(other => {
                    if (other.id === ev.id) return false;
                    return Math.max(ev.s, other.s) < Math.min(ev.e, other.e);
                });
                
                if (!hasOverlap) {
                    // No overlap - put in column 0 and clear saved column
                    delete finalDragColumnRef.current[ev.id];
                    while (columns.length <= 0) columns.push([]);
                    columns[0].push(ev);
                    layout[ev.id] = { col: 0, columns: 1, span: 1 };
                    continue;
                }
            }

            // TEST: Priority - if task has a final drag column saved, use it and ignore all other locks
            const savedColumn = finalDragColumnRef.current[ev.id];
            if (savedColumn !== undefined) {
                while (columns.length <= savedColumn) columns.push([]);
                const targetColumn = columns[savedColumn];
                const hasCollision = targetColumn.some(existingEv =>
                    Math.max(ev.s, existingEv.s) < Math.min(ev.e, existingEv.e)
                );
                if (!hasCollision) {
                    targetColumn.push(ev);
                    layout[ev.id] = { col: savedColumn, columns: 1, span: 1 };
                    continue;
                }
            }

            const lockInfo = lockLookup[ev.id];
            if (lockInfo) {
                const partnerStillInCluster = cluster.some(c => c.id === lockInfo.partnerId);
                if (!partnerStillInCluster) {
                    delete pairLockRef.current[lockInfo.pairKey];
                    delete lockLookup[ev.id];
                    delete lockLookup[lockInfo.partnerId];
                } else {
                    // Check if this pair broke overlap during drag - if so, ignore the lock
                    const pairKey1 = `${ev.id}-${lockInfo.partnerId}`;
                    const pairKey2 = `${lockInfo.partnerId}-${ev.id}`;
                    const isBrokenPair = brokenOverlapPairsRef.current.has(pairKey1) || brokenOverlapPairsRef.current.has(pairKey2);
                    
                    if (isBrokenPair) {
                        // This pair broke overlap - delete the lock and let normal logic handle it
                        delete pairLockRef.current[lockInfo.pairKey];
                        delete lockLookup[ev.id];
                        delete lockLookup[lockInfo.partnerId];
                    } else {
                        while (columns.length <= lockInfo.col) columns.push([]);
                        const lockedColumn = columns[lockInfo.col];
                        const hasCollision = lockedColumn.some(existingEv =>
                            Math.max(ev.s, existingEv.s) < Math.min(ev.e, existingEv.e)
                        );
                        if (!hasCollision) {
                            lockedColumn.push(ev);
                            layout[ev.id] = { col: lockInfo.col, columns: 1, span: 1 };
                            continue;
                        } else {
                            delete pairLockRef.current[lockInfo.pairKey];
                            delete lockLookup[ev.id];
                            delete lockLookup[lockInfo.partnerId];
                        }
                    }
                }
            }

            if (!lockInfo && isMover) {
                const overlapsAny = cluster.some(other => {
                    if (other.id === ev.id) return false;
                    return Math.max(ev.s, other.s) < Math.min(ev.e, other.e);
                });
                const sameStartOverlap = cluster.some(other => {
                    if (other.id === ev.id) return false;
                    return other.s === ev.s && Math.max(ev.s, other.s) < Math.min(ev.e, other.e);
                });
                
                // Force right ONLY if we broke overlap with at least one of the currently overlapping tasks
                // OR if same start overlap (existing logic)
                let forceRight = sameStartOverlap;
                if (draggedEventId && overlapsAny) {
                    const brokeOverlapWithCurrent = cluster.some(other => {
                        if (other.id === ev.id) return false;
                        const overlap = Math.max(ev.s, other.s) < Math.min(ev.e, other.e);
                        if (!overlap) return false;
                        const pairKey1 = `${ev.id}-${other.id}`;
                        const pairKey2 = `${other.id}-${ev.id}`;
                        return brokenOverlapPairsRef.current.has(pairKey1) || brokenOverlapPairsRef.current.has(pairKey2);
                    });
                    forceRight = forceRight || brokeOverlapWithCurrent;
                }
                
                if (forceRight && overlapsAny) {
                    startSearchCol = columns.length;
                }
            }

            // --- COLUMN LOCK LOGIC ---
            // Ensure static tasks respect the dragged task's space if they were originally overlapping
            // AND the dragged task was to the left.
            if (lockedLayout && lockedLayout[ev.id] && !isMover && draggedEventId && lockedLayout[draggedEventId]) {
                const sCol = lockedLayout[ev.id].col;
                const dCol = lockedLayout[draggedEventId].col;
                
                // If Mover was strictly to the LEFT of Static task originally
                if (dCol < sCol) {
                    // Check if they CURRENTLY overlap
                    const dCurrent = cluster.find(x => x.id === draggedEventId);
                    if (dCurrent) {
                        const overlap = Math.max(ev.s, dCurrent.s) < Math.min(ev.e, dCurrent.e);
                        // If they still overlap, Static task CANNOT move to the left columns occupied by Dragged
                        if (overlap) {
                            startSearchCol = sCol; 
                        }
                        // If NO overlap, startSearchCol stays 0 -> Static task can move Left (Fill Gap)
                    }
                }
            }

            // SPECIAL CASE: If dragged task was on LEFT and still overlapping, keep it on LEFT
            // BUT skip this if we broke overlap with any of these tasks during drag
            // OR if the dragged task now starts BEFORE the right task (natural order should apply)
            if (isMover && draggedEventId && lockedLayout && lockedLayout[ev.id]) {
                const originalDraggedCol = lockedLayout[ev.id].col;
                
                // Check if dragged task was originally on LEFT (col 0)
                if (originalDraggedCol === 0) {
                    // Find tasks that were originally on the right (col > 0) and overlapping
                    const originallyOverlappingTasks = cluster.filter(otherEv => {
                        if (otherEv.id === ev.id || !lockedLayout[otherEv.id]) return false;
                        const otherCol = lockedLayout[otherEv.id].col;
                        return otherCol > 0 && otherCol !== originalDraggedCol;
                    });
                    
                    // Check if we broke overlap with any of these tasks - if so, skip this block
                    const brokeOverlapWithAny = originallyOverlappingTasks.some(otherEv => {
                        const pairKey1 = `${ev.id}-${otherEv.id}`;
                        const pairKey2 = `${otherEv.id}-${ev.id}`;
                        return brokenOverlapPairsRef.current.has(pairKey1) || brokenOverlapPairsRef.current.has(pairKey2);
                    });
                    
                    // Check if dragged task now starts BEFORE any of the originally right tasks
                    // If so, natural order should apply (dragged task should be on left naturally)
                    const draggedStartsBeforeAny = originallyOverlappingTasks.some(otherEv => {
                        const overlapStart = Math.max(ev.s, otherEv.s);
                        const overlapEnd = Math.min(ev.e, otherEv.e);
                        const isOverlapping = overlapStart < overlapEnd;
                        // If overlapping and dragged starts before, natural order applies
                        return isOverlapping && ev.s < otherEv.s;
                    });
                    
                    if (brokeOverlapWithAny || draggedStartsBeforeAny) {
                        // We broke overlap OR dragged task now starts before - skip this special case
                        // Let the natural order or forceRight logic handle it
                    } else {
                        // Check if still overlapping with ANY of those tasks
                        const stillOverlappingWithAny = originallyOverlappingTasks.some(otherEv => {
                            const overlapStart = Math.max(ev.s, otherEv.s);
                            const overlapEnd = Math.min(ev.e, otherEv.e);
                            return overlapStart < overlapEnd;
                        });
                        
                        if (stillOverlappingWithAny && originallyOverlappingTasks.length > 0) {
                            // Still overlapping: keep dragged task on LEFT (col 0)
                            while (columns.length <= 0) columns.push([]);
                            const col0 = columns[0];
                            const hasCollision = col0.some(existingEv => 
                                existingEv.id !== ev.id && Math.max(ev.s, existingEv.s) < Math.min(ev.e, existingEv.e)
                            );
                            if (!hasCollision) {
                                col0.push(ev);
                                layout[ev.id] = { col: 0, columns: 1, span: 1 };
                                continue; // Skip First Fit - stays on LEFT
                            }
                        }
                    }
                }
            }

            // Re-entering overlap for Mover (goes to right)
            // BUT only if we actually broke overlap with that specific task during drag
            if (isMover && draggedEventId && lockedLayout && lockedLayout[ev.id]) {
                const originalDraggedCol = lockedLayout[ev.id].col;
                
                // Check if re-entering overlap with originally overlapping tasks
                // AND we broke overlap with at least one of them
                const isReEnteringOverlap = cluster.some(otherEv => {
                    if (otherEv.id === ev.id || !lockedLayout[otherEv.id]) return false;
                    const originalOtherCol = lockedLayout[otherEv.id].col;
                    const wereOriginallyOverlapping = originalDraggedCol !== originalOtherCol;
                    
                    if (wereOriginallyOverlapping) {
                        const overlapStart = Math.max(ev.s, otherEv.s);
                        const overlapEnd = Math.min(ev.e, otherEv.e);
                        const currentlyOverlapping = overlapStart < overlapEnd;
                        
                        if (currentlyOverlapping) {
                            // Check if we broke overlap with this specific task
                            const pairKey1 = `${ev.id}-${otherEv.id}`;
                            const pairKey2 = `${otherEv.id}-${ev.id}`;
                            const brokeOverlapWithThis = brokenOverlapPairsRef.current.has(pairKey1) || brokenOverlapPairsRef.current.has(pairKey2);
                            return brokeOverlapWithThis;
                        }
                    }
                    return false;
                });
                
                // Only go to right if it was originally on left and is re-entering
                // AND we broke overlap with that task
                // (if it was already handled above, this won't execute due to continue)
                if (isReEnteringOverlap && originalDraggedCol === 0) {
                    columns.push([ev]);
                    layout[ev.id] = { col: columns.length - 1, columns: 1, span: 1 };
                    continue;
                }
            }

            // NEW LOGIC: If task is in overlap, always go to the right
            // For new tasks (not in drag): if overlapping, go to right
            // During drag: if overlapping, go to right
            if (!isMover || !draggedEventId) {
                // New task or not dragging: if in overlap, go to right
                const hasOverlap = cluster.some(other => {
                    if (other.id === ev.id) return false;
                    return Math.max(ev.s, other.s) < Math.min(ev.e, other.e);
                });
                if (hasOverlap) {
                    startSearchCol = columns.length; // Start from the rightmost
                }
            } else if (isMover && draggedEventId) {
                // During drag: if overlapping, go to right (handled in placement logic below)
                const hasOverlap = cluster.some(other => {
                    if (other.id === ev.id) return false;
                    return Math.max(ev.s, other.s) < Math.min(ev.e, other.e);
                });
                if (hasOverlap) {
                    // The actual column calculation is done in the placement logic below
                    startSearchCol = columns.length; // Fallback: start from the rightmost
                }
            }

            // Standard First Fit
            let placed = false;
            
            // Special handling for D during drag when overlapping
            if (isMover && draggedEventId) {
                // Check for exact time matches (touching at start/end)
                const tasksAbove: typeof cluster = [];
                const tasksBelow: typeof cluster = [];
                const tasksTouching: typeof cluster = [];
                
                for (const other of cluster) {
                    if (other.id === ev.id) continue;
                    
                    // Check if D ends exactly when task below starts
                    if (ev.e === other.s) {
                        tasksBelow.push(other);
                        taskPositionTypeRef.current[ev.id] = 'top';
                        taskPositionTypeRef.current[other.id] = 'bottom';
                    }
                    // Check if D starts exactly when task above ends
                    else if (ev.s === other.e) {
                        tasksAbove.push(other);
                        taskPositionTypeRef.current[ev.id] = 'bottom';
                        taskPositionTypeRef.current[other.id] = 'top';
                    }
                    // Check if D is sandwich (between two tasks)
                    else if (ev.s > other.s && ev.e < other.e) {
                        // D is completely inside other task
                        tasksTouching.push(other);
                    }
                    else if (other.s > ev.s && other.e < ev.e) {
                        // Other task is completely inside D
                        tasksTouching.push(other);
                    }
                }
                
                // Check if D is sandwich (has tasks both above and below)
                if (tasksAbove.length > 0 && tasksBelow.length > 0) {
                    const newTypes: Record<string, 'top' | 'bottom' | 'middle'> = {};
                    newTypes[ev.id] = 'middle';
                    tasksAbove.forEach(t => newTypes[t.id] = 'top');
                    tasksBelow.forEach(t => newTypes[t.id] = 'bottom');
                    taskPositionTypeRef.current = { ...taskPositionTypeRef.current, ...newTypes };
                    setTaskPositionTypeState(prev => ({ ...prev, ...newTypes }));
                } else {
                    // Update state for individual position types
                    const newTypes: Record<string, 'top' | 'bottom' | 'middle'> = {};
                    if (tasksAbove.length > 0) {
                        newTypes[ev.id] = 'bottom';
                        tasksAbove.forEach(t => newTypes[t.id] = 'top');
                    }
                    if (tasksBelow.length > 0) {
                        newTypes[ev.id] = 'top';
                        tasksBelow.forEach(t => newTypes[t.id] = 'bottom');
                    }
                    if (Object.keys(newTypes).length > 0) {
                        taskPositionTypeRef.current = { ...taskPositionTypeRef.current, ...newTypes };
                        setTaskPositionTypeState(prev => ({ ...prev, ...newTypes }));
                    }
                }
                
                const overlappingTasks = cluster.filter(other => {
                    if (other.id === ev.id) return false;
                    return Math.max(ev.s, other.s) < Math.min(ev.e, other.e);
                });
                
                // Also include tasks that touch exactly (same start or end) - but NOT for span calculation
                const touchingTasks = cluster.filter(other => {
                    if (other.id === ev.id) return false;
                    return (ev.e === other.s) || (ev.s === other.e);
                });
                
                // For span calculation: only overlapping tasks count, NOT touching tasks
                // If tasks touch exactly (same time), they don't affect span calculation
                const allRelevantTasks = [...overlappingTasks];
                
                if (allRelevantTasks.length > 0) {
                    // CHECKER: If task has Top/Bottom/Middle, render immediately
                    const hasPositionType = taskPositionTypeRef.current[ev.id] !== undefined;
                    
                    if (hasPositionType) {
                        // Task has Top/Bottom/Middle, calculate span immediately
                        // Count how many tasks are in D's space (those that overlap or touch D)
                        const tasksInDSpace = allRelevantTasks.length;
                        
                        // Find which columns are occupied by overlapping/touching tasks
                        const occupiedCols = new Set<number>();
                    for (const otherTask of allRelevantTasks) {
                        const otherLayout = layout[otherTask.id];
                        if (otherLayout) {
                            const otherCol = otherLayout.col;
                            const otherSpan = otherLayout.span || 1;
                            for (let i = 0; i < otherSpan; i++) {
                                occupiedCols.add(otherCol + i);
                            }
                        }
                    }
                    
                    // Also check columns array directly for ALL tasks that might be placed but layout not updated
                    // IMPORTANT: Check ALL tasks in columns, not just those in allRelevantTasks,
                    // because tasks might be placed but their layout not yet updated
                    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
                        const col = columns[colIdx];
                        // Check if ANY task in this column overlaps with the dragged task
                        const hasOverlappingTask = col.some(existingEv => {
                            if (existingEv.id === ev.id) return false;
                            // Check if this task overlaps with dragged task
                            return Math.max(ev.s, existingEv.s) < Math.min(ev.e, existingEv.e);
                        });
                        if (hasOverlappingTask) {
                            occupiedCols.add(colIdx);
                        }
                    }
                    
                    // Calculate total columns: consider all tasks that have been placed
                    // First, find the maximum column index from all placed tasks
                    let maxColFromLayout = -1;
                    for (const otherTask of cluster) {
                        if (otherTask.id === ev.id) continue;
                        const otherLayout = layout[otherTask.id];
                        if (otherLayout) {
                            const otherEndCol = otherLayout.col + (otherLayout.span || 1) - 1;
                            maxColFromLayout = Math.max(maxColFromLayout, otherEndCol);
                        }
                    }
                    // Also check columns array for tasks that might be placed but layout not updated
                    // Check beyond columns.length to catch all placed tasks
                    const maxColToCheckForTotal = Math.max(columns.length, maxColFromLayout + 1);
                    for (let colIdx = 0; colIdx < maxColToCheckForTotal; colIdx++) {
                        if (colIdx < columns.length && columns[colIdx].length > 0) {
                            maxColFromLayout = Math.max(maxColFromLayout, colIdx);
                        }
                    }
                    // Also consider occupied columns from the calculation above
                    const maxOccupiedCol = occupiedCols.size > 0 ? Math.max(...Array.from(occupiedCols)) : -1;
                    maxColFromLayout = Math.max(maxColFromLayout, maxOccupiedCol);
                    // Total columns should be at least the number of overlapping tasks + 1 (for the dragged task)
                    // But also consider existing columns
                    const totalCols = Math.max(columns.length, maxColFromLayout + 1, tasksInDSpace + 1);
                    
                    // Calculate span: totalCols - tasksInDSpace
                    // Example: if totalCols = 4 and tasksInDSpace = 2, then span = 2
                    const dSpan = Math.max(1, totalCols - tasksInDSpace);
                    
                    // Find free columns (gaps) between occupied columns
                    const freeCols: number[] = [];
                    for (let colIdx = 0; colIdx < totalCols; colIdx++) {
                        if (!occupiedCols.has(colIdx)) {
                            freeCols.push(colIdx);
                        }
                    }
                    
                    // Place D in the first free columns (gaps)
                    // If there are free columns, find consecutive free columns that can fit the span
                    // IMPORTANT: If task is already positioned, try to expand left to increase span
                    // Otherwise, place D after the last occupied column
                    let dStartCol: number;
                    let actualSpan = dSpan;
                    
                    if (freeCols.length > 0) {
                        // Check if task is already positioned
                        const currentLayout = layout[ev.id];
                        const isAlreadyPositioned = currentLayout !== undefined;
                        
                        if (isAlreadyPositioned && currentLayout) {
                            // Task is already positioned - but if there are free columns, 
                            // task must go to the first free column on the left
                            const currentCol = currentLayout.col;
                            const currentSpan = currentLayout.span || 1;
                            
                            // Find the first (leftmost) free column
                            const firstFreeCol = freeCols.length > 0 ? Math.min(...freeCols) : null;
                            
                            if (firstFreeCol !== null) {
                                // Try to form a consecutive sequence starting from the first free column
                                let canFormSequence = true;
                                let sequenceSpan = 0;
                                
                                // Start from firstFreeCol and try to form a sequence of dSpan columns
                                for (let col = firstFreeCol; col < firstFreeCol + dSpan; col++) {
                                    // Check if this column is free or part of current position
                                    if (freeCols.includes(col)) {
                                        // Column is free
                                        sequenceSpan++;
                                    } else if (col >= currentCol && col < currentCol + currentSpan) {
                                        // Column is part of current position (available for the task)
                                        sequenceSpan++;
                                    } else {
                                        // Column is occupied by another task, cannot form sequence
                                        canFormSequence = false;
                                        break;
                                    }
                                }
                                
                                if (canFormSequence && sequenceSpan >= dSpan) {
                                    // We can form the required span starting from firstFreeCol
                                    dStartCol = firstFreeCol;
                                    actualSpan = dSpan;
                                } else {
                                    // Cannot form full span from first free column, but still use first free column
                                    // Start from the first free column and count consecutive free columns
                                    dStartCol = firstFreeCol;
                                    let consecutiveCount = 1;
                                    
                                    // Count consecutive free columns starting from firstFreeCol
                                    for (let i = 1; i < freeCols.length; i++) {
                                        if (freeCols[i] === firstFreeCol + consecutiveCount) {
                                            consecutiveCount++;
                                            if (consecutiveCount >= dSpan) {
                                                break;
                                            }
                                        } else if (freeCols[i] > firstFreeCol + consecutiveCount) {
                                            // Gap in sequence, stop counting
                                            break;
                                        }
                                    }
                                    
                                    actualSpan = Math.min(consecutiveCount, dSpan);
                                }
                            } else {
                                // No free columns, use normal logic
                                dStartCol = freeCols[0];
                                let consecutiveCount = 1;
                                
                                for (let i = 1; i < freeCols.length; i++) {
                                    if (freeCols[i] === freeCols[i-1] + 1) {
                                        consecutiveCount++;
                                        if (consecutiveCount >= dSpan) {
                                            break;
                                        }
                                    } else {
                                        if (consecutiveCount >= dSpan) {
                                            break;
                                        }
                                        dStartCol = freeCols[i];
                                        consecutiveCount = 1;
                                    }
                                }
                                
                                actualSpan = Math.min(consecutiveCount, dSpan);
                            }
                        } else {
                            // Task not yet positioned - must go to the first free column on the left
                            // Find the first (leftmost) free column
                            const firstFreeCol = freeCols.length > 0 ? Math.min(...freeCols) : null;
                            
                            if (firstFreeCol !== null) {
                                // Start from the first free column and count consecutive free columns
                                dStartCol = firstFreeCol;
                                let consecutiveCount = 1;
                                
                                // Count consecutive free columns starting from firstFreeCol
                                for (let i = 1; i < freeCols.length; i++) {
                                    if (freeCols[i] === firstFreeCol + consecutiveCount) {
                                        consecutiveCount++;
                                        if (consecutiveCount >= dSpan) {
                                            break;
                                        }
                                    } else if (freeCols[i] > firstFreeCol + consecutiveCount) {
                                        // Gap in sequence, stop counting
                                        break;
                                    }
                                }
                                
                                actualSpan = Math.min(consecutiveCount, dSpan);
                            } else {
                                // No free columns, use normal logic
                                dStartCol = freeCols[0];
                                let consecutiveCount = 1;
                                
                                for (let i = 1; i < freeCols.length; i++) {
                                    if (freeCols[i] === freeCols[i-1] + 1) {
                                        consecutiveCount++;
                                        if (consecutiveCount >= dSpan) {
                                            break;
                                        }
                                    } else {
                                        if (consecutiveCount >= dSpan) {
                                            break;
                                        }
                                        dStartCol = freeCols[i];
                                        consecutiveCount = 1;
                                    }
                                }
                                
                                actualSpan = Math.min(consecutiveCount, dSpan);
                            }
                        }
                    } else {
                        // No free columns, place D after the last occupied column
                        const maxOccupiedCol = occupiedCols.size > 0 ? Math.max(...Array.from(occupiedCols)) : -1;
                        dStartCol = maxOccupiedCol + 1;
                        actualSpan = dSpan;
                    }
                    
                    const dEndCol = dStartCol + actualSpan - 1;
                    
                    // Ensure columns exist
                    while (columns.length <= dEndCol) {
                        columns.push([]);
                    }
                    
                    // Place D in all columns from dStartCol to dEndCol
                    for (let colIdx = dStartCol; colIdx <= dEndCol; colIdx++) {
                        columns[colIdx].push(ev);
                    }
                    
                        layout[ev.id] = { col: dStartCol, columns: totalCols, span: actualSpan };
                        placed = true;
                    } else {
                        // No Top/Bottom/Middle, use normal overlap logic
                        // Count how many tasks are in D's space (those that overlap with D)
                        const tasksInDSpace = overlappingTasks.length;
                        
                        // Find which columns are occupied by overlapping tasks
                        const occupiedCols = new Set<number>();
                        for (const otherTask of overlappingTasks) {
                            const otherLayout = layout[otherTask.id];
                            if (otherLayout) {
                                const otherCol = otherLayout.col;
                                const otherSpan = otherLayout.span || 1;
                                for (let i = 0; i < otherSpan; i++) {
                                    occupiedCols.add(otherCol + i);
                                }
                            }
                        }
                        
                        // Also check columns array directly for ALL tasks that might be placed but layout not updated
                        // IMPORTANT: Check ALL tasks in columns, not just those in overlappingTasks,
                        // because tasks might be placed but their layout not yet updated
                        for (let colIdx = 0; colIdx < columns.length; colIdx++) {
                            const col = columns[colIdx];
                            // Check if ANY task in this column overlaps with the dragged task
                            const hasOverlappingTask = col.some(existingEv => {
                                if (existingEv.id === ev.id) return false;
                                // Check if this task overlaps with dragged task
                                return Math.max(ev.s, existingEv.s) < Math.min(ev.e, existingEv.e);
                            });
                            if (hasOverlappingTask) {
                                occupiedCols.add(colIdx);
                            }
                        }
                        
                        // Calculate total columns: consider all tasks that have been placed
                        // First, find the maximum column index from all placed tasks
                        let maxColFromLayout = -1;
                        for (const otherTask of cluster) {
                            if (otherTask.id === ev.id) continue;
                            const otherLayout = layout[otherTask.id];
                            if (otherLayout) {
                                const otherEndCol = otherLayout.col + (otherLayout.span || 1) - 1;
                                maxColFromLayout = Math.max(maxColFromLayout, otherEndCol);
                            }
                        }
                        // Also check columns array for tasks that might be placed but layout not updated
                        // Check beyond columns.length to catch all placed tasks
                        const maxColToCheckForTotal = Math.max(columns.length, maxColFromLayout + 1);
                        for (let colIdx = 0; colIdx < maxColToCheckForTotal; colIdx++) {
                            if (colIdx < columns.length && columns[colIdx].length > 0) {
                                maxColFromLayout = Math.max(maxColFromLayout, colIdx);
                            }
                        }
                        // Also consider occupied columns from the calculation above
                        const maxOccupiedCol = occupiedCols.size > 0 ? Math.max(...Array.from(occupiedCols)) : -1;
                        maxColFromLayout = Math.max(maxColFromLayout, maxOccupiedCol);
                        // Total columns should be at least the number of overlapping tasks + 1 (for the dragged task)
                        // But also consider existing columns
                        const totalCols = Math.max(columns.length, maxColFromLayout + 1, tasksInDSpace + 1);
                        
                        // Calculate span: totalCols - tasksInDSpace
                        const dSpan = Math.max(1, totalCols - tasksInDSpace);
                        
                        // Find free columns (gaps) between occupied columns
                        const freeCols: number[] = [];
                        for (let colIdx = 0; colIdx < totalCols; colIdx++) {
                            if (!occupiedCols.has(colIdx)) {
                                freeCols.push(colIdx);
                            }
                        }
                        
                        // Place D in the first free columns (gaps)
                        // IMPORTANT: If task is already positioned, try to expand left to increase span
                        let dStartCol: number;
                        let actualSpan = dSpan;
                        
                        if (freeCols.length > 0) {
                            // Check if task is already positioned
                            const currentLayout = layout[ev.id];
                            const isAlreadyPositioned = currentLayout !== undefined;
                            
                            if (isAlreadyPositioned && currentLayout) {
                                // Task is already positioned - but if there are free columns, 
                                // task must go to the first free column on the left
                                const currentCol = currentLayout.col;
                                const currentSpan = currentLayout.span || 1;
                                
                                // Find the first (leftmost) free column
                                const firstFreeCol = freeCols.length > 0 ? Math.min(...freeCols) : null;
                                
                                if (firstFreeCol !== null) {
                                    // Try to form a consecutive sequence starting from the first free column
                                    let canFormSequence = true;
                                    let sequenceSpan = 0;
                                    
                                    // Start from firstFreeCol and try to form a sequence of dSpan columns
                                    for (let col = firstFreeCol; col < firstFreeCol + dSpan; col++) {
                                        // Check if this column is free or part of current position
                                        if (freeCols.includes(col)) {
                                            // Column is free
                                            sequenceSpan++;
                                        } else if (col >= currentCol && col < currentCol + currentSpan) {
                                            // Column is part of current position (available for the task)
                                            sequenceSpan++;
                                        } else {
                                            // Column is occupied by another task, cannot form sequence
                                            canFormSequence = false;
                                            break;
                                        }
                                    }
                                    
                                    if (canFormSequence && sequenceSpan >= dSpan) {
                                        // We can form the required span starting from firstFreeCol
                                        dStartCol = firstFreeCol;
                                        actualSpan = dSpan;
                                    } else {
                                        // Cannot form full span from first free column, but still use first free column
                                        // Start from the first free column and count consecutive free columns
                                        dStartCol = firstFreeCol;
                                        let consecutiveCount = 1;
                                        
                                        // Count consecutive free columns starting from firstFreeCol
                                        for (let i = 1; i < freeCols.length; i++) {
                                            if (freeCols[i] === firstFreeCol + consecutiveCount) {
                                                consecutiveCount++;
                                                if (consecutiveCount >= dSpan) {
                                                    break;
                                                }
                                            } else if (freeCols[i] > firstFreeCol + consecutiveCount) {
                                                // Gap in sequence, stop counting
                                                break;
                                            }
                                        }
                                        
                                        actualSpan = Math.min(consecutiveCount, dSpan);
                                    }
                                } else {
                                    // No free columns, use normal logic
                                    dStartCol = freeCols[0];
                                    let consecutiveCount = 1;
                                    
                                    for (let i = 1; i < freeCols.length; i++) {
                                        if (freeCols[i] === freeCols[i-1] + 1) {
                                            consecutiveCount++;
                                            if (consecutiveCount >= dSpan) {
                                                break;
                                            }
                                        } else {
                                            if (consecutiveCount >= dSpan) {
                                                break;
                                            }
                                            dStartCol = freeCols[i];
                                            consecutiveCount = 1;
                                        }
                                    }
                                    
                                    actualSpan = Math.min(consecutiveCount, dSpan);
                                }
                            } else {
                                // Task not yet positioned - must go to the first free column on the left
                                // Find the first (leftmost) free column
                                const firstFreeCol = freeCols.length > 0 ? Math.min(...freeCols) : null;
                                
                                if (firstFreeCol !== null) {
                                    // Start from the first free column and count consecutive free columns
                                    dStartCol = firstFreeCol;
                                    let consecutiveCount = 1;
                                    
                                    // Count consecutive free columns starting from firstFreeCol
                                    for (let i = 1; i < freeCols.length; i++) {
                                        if (freeCols[i] === firstFreeCol + consecutiveCount) {
                                            consecutiveCount++;
                                            if (consecutiveCount >= dSpan) {
                                                break;
                                            }
                                        } else if (freeCols[i] > firstFreeCol + consecutiveCount) {
                                            // Gap in sequence, stop counting
                                            break;
                                        }
                                    }
                                    
                                    actualSpan = Math.min(consecutiveCount, dSpan);
                                } else {
                                    // No free columns, use normal logic
                                    dStartCol = freeCols[0];
                                    let consecutiveCount = 1;
                                    
                                    for (let i = 1; i < freeCols.length; i++) {
                                        if (freeCols[i] === freeCols[i-1] + 1) {
                                            consecutiveCount++;
                                            if (consecutiveCount >= dSpan) {
                                                break;
                                            }
                                        } else {
                                            if (consecutiveCount >= dSpan) {
                                                break;
                                            }
                                            dStartCol = freeCols[i];
                                            consecutiveCount = 1;
                                        }
                                    }
                                    
                                    actualSpan = Math.min(consecutiveCount, dSpan);
                                }
                            }
                        } else {
                            const maxOccupiedCol = occupiedCols.size > 0 ? Math.max(...Array.from(occupiedCols)) : -1;
                            dStartCol = maxOccupiedCol + 1;
                            actualSpan = dSpan;
                        }
                        
                        const dEndCol = dStartCol + actualSpan - 1;
                        
                        while (columns.length <= dEndCol) {
                            columns.push([]);
                        }
                        
                        for (let colIdx = dStartCol; colIdx <= dEndCol; colIdx++) {
                            columns[colIdx].push(ev);
                        }
                        
                        layout[ev.id] = { col: dStartCol, columns: totalCols, span: actualSpan };
                        placed = true;
                    }
                }
            }
            
            if (!placed) {
                // Standard First Fit logic
                for (let i = startSearchCol; i < columns.length; i++) {
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
                // Ensure we don't skip columns unnecessarily if creating new one
                // but if startSearchCol > current len, we must pad with empty columns
                while (columns.length < startSearchCol) {
                    columns.push([]);
                }
                columns.push([ev]);
                layout[ev.id] = { col: columns.length - 1, columns: 1, span: 1 };
            }
        }
        
        // 3. Compact columns for NEAR and ADJ tasks (fill gaps left by D)
        // After drag ends, tasks that were NEAR or ADJ should compact to fill gaps
        if (!draggedEventId && (adjTaskIdsRef.current.size > 0 || nearTaskIdsRef.current.size > 0)) {
            // Find tasks that were NEAR or ADJ (adjacent or near to dragged task)
            const tasksToCompact = cluster.filter(ev => 
                adjTaskIdsRef.current.has(ev.id) || nearTaskIdsRef.current.has(ev.id)
            );
            
            // For each task to compact (ADJ or NEAR), check how many tasks are adjacent and compact
            for (const taskToCompact of tasksToCompact) {
                const currentCol = layout[taskToCompact.id]?.col ?? 0;
                
                // Count tasks in adjacent columns (left and right)
                const leftCol = currentCol - 1;
                const rightCol = currentCol + 1;
                
                const leftColTasks = leftCol >= 0 ? columns[leftCol]?.filter(other => {
                    if (other.id === taskToCompact.id) return false;
                    return Math.max(taskToCompact.s, other.s) < Math.min(taskToCompact.e, other.e);
                }) : [];
                
                const rightColTasks = rightCol < columns.length ? columns[rightCol]?.filter(other => {
                    if (other.id === taskToCompact.id) return false;
                    return Math.max(taskToCompact.s, other.s) < Math.min(taskToCompact.e, other.e);
                }) : [];
                
                // If there are gaps (empty columns) to the left, try to move left
                if (leftCol >= 0 && columns[leftCol]?.length === 0) {
                    // Empty column to the left, check if we can move
                    const canMoveLeft = !cluster.some(other => {
                        if (other.id === taskToCompact.id) return false;
                        const otherCol = layout[other.id]?.col ?? 0;
                        if (otherCol !== leftCol) return false;
                        return Math.max(taskToCompact.s, other.s) < Math.min(taskToCompact.e, other.e);
                    });
                    
                    if (canMoveLeft) {
                        // Move to left column
                        const currentColIndex = columns[currentCol].findIndex(e => e.id === taskToCompact.id);
                        if (currentColIndex !== -1) {
                            columns[currentCol].splice(currentColIndex, 1);
                            if (!columns[leftCol]) columns[leftCol] = [];
                            columns[leftCol].push(taskToCompact);
                            layout[taskToCompact.id].col = leftCol;
                        }
                    }
                }
            }
        }
        
        const totalCols = columns.length;

        // 4. Expansion
        for (let i = 0; i < columns.length; i++) {
            const colEvents = columns[i];
            for (const ev of colEvents) {
                // If this is the dragged task and it already has a span calculated by special logic,
                // preserve that span but still allow expansion if there are free columns to the right
                const isDraggedTask = draggedEventId ? (ev.id === draggedEventId) : false;
                const currentLayout = layout[ev.id];
                const existingSpan = currentLayout?.span || 1;
                
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
                
                // For dragged task, use the maximum of existing span (from special logic) and expansion span
                // This ensures the span calculated by special logic is preserved, but can still expand if possible
                if (isDraggedTask && existingSpan > 1) {
                    span = Math.max(existingSpan, span);
                }
                
                layout[ev.id].columns = totalCols;
                layout[ev.id].span = span;
            }
        }

        const ensurePairLock = (leftId: string, rightId: string) => {
            const leftLayout = layout[leftId];
            const rightLayout = layout[rightId];
            if (!leftLayout || !rightLayout) return;
            const key = `${leftId}->${rightId}`;
            pairLockRef.current[key] = {
                leftId,
                rightId,
                leftCol: leftLayout.col,
                rightCol: rightLayout.col,
            };
        };

        const removePairLock = (leftId: string, rightId: string) => {
            delete pairLockRef.current[`${leftId}->${rightId}`];
        };

        for (let i = 0; i < cluster.length; i++) {
            for (let j = i + 1; j < cluster.length; j++) {
                const a = cluster[i];
                const b = cluster[j];
                const overlap = Math.max(a.s, b.s) < Math.min(a.e, b.e);
                if (!overlap) {
                    removePairLock(a.id, b.id);
                    removePairLock(b.id, a.id);
                    continue;
                }
                const layoutA = layout[a.id];
                const layoutB = layout[b.id];
                if (!layoutA || !layoutB) continue;
                if (layoutA.col === layoutB.col) {
                    removePairLock(a.id, b.id);
                    removePairLock(b.id, a.id);
                    continue;
                }
                const left = layoutA.col < layoutB.col ? a : b;
                const right = left.id === a.id ? b : a;
                
                // Check if one of the tasks is being dragged and still in original overlap
                // If still in original overlap, create lock to maintain positions (left stays left, right stays right)
                if (draggedEventId && (left.id === draggedEventId || right.id === draggedEventId)) {
                    const pairKey1 = `${left.id}-${right.id}`;
                    const pairKey2 = `${right.id}-${left.id}`;
                    const brokeOverlap = brokenOverlapPairsRef.current.has(pairKey1) || brokenOverlapPairsRef.current.has(pairKey2);
                    
                    // If they broke overlap, remove lock and let normal logic handle it
                    if (brokeOverlap) {
                        removePairLock(left.id, right.id);
                        removePairLock(right.id, left.id);
                        continue;
                    }
                    
                    // If still in original overlap, create lock regardless of which starts first
                    // This maintains positions: left stays left, right stays right
                    ensurePairLock(left.id, right.id);
                    continue;
                }
                
                if (a.s === b.s) {
                    ensurePairLock(left.id, right.id);
                    continue;
                }
                if (right.s < left.s) {
                    ensurePairLock(left.id, right.id);
                } else {
                    removePairLock(left.id, right.id);
                    removePairLock(right.id, left.id);
                }
            }
        }
    }
    return layout;
  }, [lastMovedEventId, dragClearedOriginalOverlap]);

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
        return calculateLayout(events, draggingEventId, lockSnapshot);
    } 
    
    return calculateLayout(events, null);
  }, [timedEvents, pendingEventPositions, lastMovedEventId, draggingEventId, currentDragPosition, calculateLayout]);
  
  const handleDragStart = useCallback((id: string) => {
      stableLayoutRef.current = layoutById;
      // Clear previous ADJ and NEAR tasks when starting a new drag
      adjTaskIdsRef.current = new Set();
      nearTaskIdsRef.current = new Set();
      // Clear position types when starting a new drag
      taskPositionTypeRef.current = {};
      setTaskPositionTypeState({});
      
      // Calculate Top/Bottom/Middle for dragged task at START position only
      const draggedEvent = timedEvents.find(e => e.id === id);
      if (draggedEvent) {
          const draggedStartM = toMinutes(draggedEvent.startTime);
          const draggedEndM = toMinutes(draggedEvent.endTime);
          
          const newPositionTypes: Record<string, 'top' | 'bottom' | 'middle'> = {};
          const tasksAbove: typeof timedEvents = [];
          const tasksBelow: typeof timedEvents = [];
          
          for (const other of timedEvents) {
              if (other.id === id) continue;
              
              const otherStartM = toMinutes(other.startTime);
              const otherEndM = toMinutes(other.endTime);
              
              // Check if D ends exactly when task below starts
              if (draggedEndM === otherStartM) {
                  tasksBelow.push(other);
                  newPositionTypes[id] = 'top';
                  newPositionTypes[other.id] = 'bottom';
              }
              // Check if D starts exactly when task above ends
              else if (draggedStartM === otherEndM) {
                  tasksAbove.push(other);
                  newPositionTypes[id] = 'bottom';
                  newPositionTypes[other.id] = 'top';
              }
          }
          
          // Check if D is sandwich (has tasks both above and below)
          if (tasksAbove.length > 0 && tasksBelow.length > 0) {
              newPositionTypes[id] = 'middle';
              tasksAbove.forEach(t => newPositionTypes[t.id] = 'top');
              tasksBelow.forEach(t => newPositionTypes[t.id] = 'bottom');
          }
          
          // Update both ref and state to trigger re-render
          if (Object.keys(newPositionTypes).length > 0) {
              taskPositionTypeRef.current = { ...taskPositionTypeRef.current, ...newPositionTypes };
              setTaskPositionTypeState(newPositionTypes);
          }
      }
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
    const tempLayout = calculateLayout(events, draggedEventId, lockSnapshot);
    
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
                   updateScheduleTimes={updateScheduleTimes}
                   setPendingEventPositions={setPendingEventPositions}
                   setRecentlyMovedEventId={setRecentlyMovedEventId}
                   setLastMovedEventId={setLastMovedEventId}
                   setCurrentDragPosition={setCurrentDragPosition}
                   timedEvents={timedEvents}
                   layoutById={layoutById}
                   calculateDragLayout={calculateDragLayout}
                   brokenOverlapPairsRef={brokenOverlapPairsRef}
                   finalDragColumnRef={finalDragColumnRef}
                   adjTaskIdsRef={adjTaskIdsRef}
                   nearTaskIdsRef={nearTaskIdsRef}
                   taskPositionTypeRef={taskPositionTypeRef}
                   taskPositionTypeState={taskPositionTypeState}
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