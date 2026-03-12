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
  scrollOffsetY: SharedValue<number>;
  draggingEventId: string | null;
  setDraggingEventId: (id: string | null) => void;
  dragClearedOriginalOverlap: boolean;
  setDragClearedOriginalOverlap: (value: boolean) => void;
  setDragSizingLocked: (value: boolean) => void;
  windowStartMin: number;
  windowEndMin: number;
  hourHeight: number;
  visibleHours: number;
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
  onDragAutoScroll?: (dragBounds: { top: number; bottom: number } | null) => void;
  dragDisabled?: boolean;
};

function getSnapStepMinutes(visibleHours: number, hourHeight: number): 5 | 10 | 15 {
  // Prefer deterministic behavior based on zoom level (visible hours),
  // with a fallback on pixel density for safety.
  if (visibleHours >= 20 || hourHeight <= 32) return 15;
  if (visibleHours >= 14 || hourHeight <= 48) return 10;
  return 5;
}

function DraggableEvent({
  event,
  layoutStyle,
  baseTop,
  dragY,
  dragInitialTop,
  scrollOffsetY,
  draggingEventId,
  setDraggingEventId,
  dragClearedOriginalOverlap,
  setDragClearedOriginalOverlap,
  setDragSizingLocked,
  windowStartMin,
  windowEndMin,
  hourHeight,
  visibleHours,
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
  onDragAutoScroll,
  dragDisabled,
}: DraggableEventProps) {
  const isDragging = draggingEventId === event.id;
  const bg = event.color;
  const light = isLightColor(bg);
  const isTravel = event.tipo === 'viaggio';

  const dragWidthValue = useSharedValue(layoutStyle.width);
  const dragLeftValue = useSharedValue(layoutStyle.left);
  const dragStartScrollOffset = useSharedValue(0);

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
      onStartShouldSetPanResponder: () => !isTravel && !dragDisabled,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        if (isTravel) return false;
        if (dragDisabled) return false;
        if (isDragActiveRef.current) return true;
        return Math.abs(gestureState.dy) > 5;
      },
      // Keep the active drag bound to this responder even when the finger reaches
      // the scroll edge; otherwise the parent can terminate the gesture and the
      // drag resets exactly when autoscroll should kick in.
      onPanResponderTerminationRequest: () => !isDragActiveRef.current,
      onShouldBlockNativeResponder: () => isDragActiveRef.current,

      onPanResponderGrant: (evt) => {
        if (isTravel || dragDisabled) return;
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
          dragStartScrollOffset.value = scrollOffsetY.value;
          dragY.value = 0;

          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onDragStart(event.id);
          setDraggingEventId(event.id);
        }, 350);
      },

      onPanResponderMove: (evt, gestureState) => {
        if (isTravel || dragDisabled) return;
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
        const scrollDelta = scrollOffsetY.value - dragStartScrollOffset.value;

        const initialBaseTop = dragInitialTop.value;
        const currentTop = initialBaseTop + touchDeltaY + scrollDelta;
        const durationMin = toMinutes(event.endTime) - toMinutes(event.startTime);
        const relativeTopMax = Math.max(0, ((windowEndMin - durationMin) - windowStartMin) / 60 * hourHeight);
        const maxClampedTop = DRAG_VISUAL_OFFSET + relativeTopMax;
        const clampedTop = Math.max(DRAG_VISUAL_OFFSET, Math.min(maxClampedTop, currentTop));
        const relativeTop = Math.max(0, clampedTop - DRAG_VISUAL_OFFSET);
        const minutesFromStart = (relativeTop / hourHeight) * 60;
        const newStartMinutes = windowStartMin + minutesFromStart;
        const clampedMinutes = Math.max(0, Math.min(1440, newStartMinutes));

        // Movimento fluido: la posizione segue il dito senza scatti,
        // lo snap avviene solo in onPanResponderRelease.
        dragY.value = clampedTop - initialBaseTop - scrollDelta;
        onDragAutoScroll?.({
          top: clampedTop - scrollOffsetY.value,
          bottom: clampedTop - scrollOffsetY.value + layoutStyleRef.current.height,
        });

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
          // Ricalcola sempre il layout per aggiornare larghezza/colonna durante il drag.
          const dragLayout = calculateDragLayoutRef.current(event.id, clampedMinutes, overlapClearedRef.current);
          dragWidthValue.value = dragLayout.width;
          dragLeftValue.value = dragLayout.left;
        } else {
          dragWidthValue.value = initialSnapshotRef.current.width;
          dragLeftValue.value = initialSnapshotRef.current.left;
          setCurrentDragPosition(null);
        }

        // Feedback aptico solo quando si attraversano multipli di 15 minuti,
        // ma senza influenzare la posizione (niente snap visivo).
        const snapStep = getSnapStepMinutes(visibleHours, hourHeight);
        const snappedMinute = Math.round(clampedMinutes / snapStep) * snapStep;
        if (lastSnappedMinuteRef.current !== null && lastSnappedMinuteRef.current !== snappedMinute) {
          const isFullHour = snappedMinute % 60 === 0;
          Haptics.impactAsync(isFullHour ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
        }
        lastSnappedMinuteRef.current = snappedMinute;
      },

      onPanResponderTerminate: () => {
        if (isTravel || dragDisabled) return;
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
        onDragAutoScroll?.(null);
      },

      onPanResponderRelease: (evt, gestureState) => {
        if (isTravel || dragDisabled) return;
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }

        if (!isDragActiveRef.current) return;

        const finalY = dragY.value;
        const scrollDelta = scrollOffsetY.value - dragStartScrollOffset.value;
        let finalTop = dragInitialTop.value + finalY + scrollDelta;
        const durationMin = toMinutes(event.endTime) - toMinutes(event.startTime);
        const relativeTopMaxRelease = Math.max(0, ((windowEndMin - durationMin) - windowStartMin) / 60 * hourHeight);
        const maxClampedTopRelease = DRAG_VISUAL_OFFSET + relativeTopMaxRelease;
        finalTop = Math.max(DRAG_VISUAL_OFFSET, Math.min(maxClampedTopRelease, finalTop));
        const relativeFinalTop = Math.max(0, finalTop - DRAG_VISUAL_OFFSET);
        const minutesFromStart = (relativeFinalTop / hourHeight) * 60;
        const newStartMinutes = windowStartMin + minutesFromStart;
        const snapStep = getSnapStepMinutes(visibleHours, hourHeight);
        const snappedMinutes = Math.round(newStartMinutes / snapStep) * snapStep;
        const maxStartMin = windowEndMin - durationMin;
        const clampedMinutes = Math.max(0, Math.min(1440, Math.min(snappedMinutes, maxStartMin)));

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
        // Salva sempre l'orario sulla task (schedule + override) così appare anche in Tasks
        updateScheduleFromDate(event.id, selectedYmd, newStartTime, newEndTime);
        if (dragMode === 'single') {
          setTimeOverrideRange(event.id, selectedYmd, newStartTime, newEndTime);
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
        onDragAutoScroll?.(null);
      },
    });
  }, [
    event.id,
    event.startTime,
    event.endTime,
    baseTop,
    windowStartMin,
    windowEndMin,
    hourHeight,
    visibleHours,
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
    getDay,
    dragDisabled,
  ]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      top: isDragging ? dragInitialTop.value + dragY.value + (scrollOffsetY.value - dragStartScrollOffset.value) : baseTop,
      opacity: isDragging ? 0.8 : 1,
      zIndex: isDragging ? 1000 : 1,
      width: isDragging ? dragWidthValue.value : layoutStyle.width,
      left: isDragging ? dragLeftValue.value : layoutStyle.left,
    };
  }, [isDragging, baseTop, layoutStyle.width, layoutStyle.left, scrollOffsetY, dragStartScrollOffset]);

  const eventStyle = [
    styles.eventItem,
    {
      height: layoutStyle.height,
      backgroundColor: bg,
    },
    animatedStyle,
    !isDragging && isTravel && { opacity: 0.7 },
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
