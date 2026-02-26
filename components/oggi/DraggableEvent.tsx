import { LayoutInfo } from '@/lib/layoutEngine';
import {
  DRAG_VISUAL_OFFSET,
  isLightColor,
  minutesToTime,
  OggiEvent,
  toMinutes,
} from '@/lib/oggi/oggiHelpers';
import * as Haptics from 'expo-haptics';
import { Dispatch, SetStateAction, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

export type DraggableEventProps = {
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
  onDoubleTap?: () => void;
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
  onDoubleTap,
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
  const lastTapTimeRef = useRef(0);
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
        const now = Date.now();
        if (now - lastTapTimeRef.current < 300) {
          if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
          isDragActiveRef.current = false;
          lastTapTimeRef.current = 0;
          onDoubleTap?.();
          return;
        }
        lastTapTimeRef.current = now;

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
        }, 350);
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

const styles = StyleSheet.create({
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
});

export default DraggableEvent;
export type { DraggableEventProps };
