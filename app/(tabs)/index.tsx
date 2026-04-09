import SmartTaskFeedbackModal from '@/components/SmartTaskFeedbackModal';
import { HabitItem } from '@/components/HabitItem';
import { MorphingFolderAddIcon, MORPHING_FOLDER_ADD_FIRST_PIXEL_OFFSET } from '@/components/index/MorphingFolderAddIcon';
import { FolderModals } from '@/components/index/FolderModals';
import { styles } from '@/components/index/indexStyles';
import TabelleView from '@/components/index/TabelleView';
import { THEME } from '@/constants/theme';
import { DOMANI_TOMORROW_KEY, IERI_YESTERDAY_KEY, OGGI_TODAY_KEY, SectionItem, TUTTE_KEY } from '@/lib/index/indexTypes';
import { useIndexLogic } from '@/lib/index/useIndexLogic';
import { useHabits } from '@/lib/habits/Provider';
import { isHabitFullyDoneForDay } from '@/lib/habits/occurrences';
import type { Habit } from '@/lib/habits/schema';
import { resolveSmartTaskFeedback, type SmartTaskFeedback } from '@/lib/smartTask';
import { useAppTheme } from '@/lib/theme-context';
import { MenuView } from '@react-native-menu/menu';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Link, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, InteractionManager, LayoutAnimation, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { Layout, runOnUI, SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

/** Soglia in px per mostrare i puntini “c’è altro da scorrere” sulla barra cartelle */
const FOLDER_BAR_SCROLL_SLACK = 6;
const FOLDER_ADD_MORPH_LEAD = 12;
const FOLDER_ADD_LINE_BASE_HEIGHT = 26;
const FOLDER_ADD_LINE_BASE_TOP = 6;
const FOLDER_ADD_LINE_FINAL_HEIGHT = 1;
const FOLDER_ADD_SHRINK_END_EARLY_PX = 6;

const TASKS_DRAG_AUTOSCROLL_THRESHOLD = 108;
const TASKS_DRAG_AUTOSCROLL_SPEED = 72;
const TASKS_DRAG_AUTOSCROLL_TOP_THRESHOLD = 28;
const TASKS_MULTI_DRAG_ROW_HEIGHT = 83;
const TASKS_DROP_COVER_DURATION_MS = 160;
const IOS_TAB_BAR_BASE_HEIGHT = 49;
const TASKS_TAB_BAR_EDGE_OVERLAP = 28;
const TASKS_DROP_COVER_BOTTOM_LIFT = 65;
const TASKS_DROP_COVER_DEBUG_LINES = false;
const TASKS_DRAG_ANIMATION_CONFIG = {
  damping: 26,
  stiffness: 165,
} as const;

type SmartTaskPromptState = {
  habitId: string;
  mode: 'completed' | 'overdue';
  resolvedOnYmd: string;
};

const MergeIcon = ({ isActive, isMergeHoverSV, debugAboveCount, debugBelowCount }: { isActive: boolean; isMergeHoverSV: SharedValue<boolean>, debugAboveCount?: number | string | null, debugBelowCount?: number | string | null }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const isVisible = isActive && isMergeHoverSV.value;
    return {
      opacity: withTiming(isVisible ? 1 : 0, { duration: 150 }),
      transform: [{ scale: withTiming(isVisible ? 1 : 0.5, { duration: 150 }) }]
    };
  });

  return (
    <View style={[styles.mergePlusIcon, { flexDirection: 'row', alignItems: 'center' }]}>
      {/* {isActive && debugAboveCount != null && <Text style={{ color: 'blue', marginRight: 4, fontWeight: 'bold' }}>{debugAboveCount}</Text>} */}
      <Animated.View style={[animatedStyle, { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }]}>
        <View style={{
          position: 'absolute',
          left: 1,
          top: 1,
          width: 16,
          height: 16,
          borderRadius: 8,
          backgroundColor: '#fff',
        }} />
        <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="add" size={18} color={THEME.success} />
        </View>
      </Animated.View>
      {/* {isActive && debugBelowCount != null && <Text style={{ color: 'yellow', marginLeft: 4, fontWeight: 'bold' }}>{debugBelowCount}</Text>} */}
    </View>
  );
};

const ChevronIcon = ({ isCollapsed, folderColor }: { isCollapsed: boolean; folderColor: string }) => {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: withTiming(isCollapsed ? '90deg' : '0deg', { duration: 250 }) }]
    };
  });

  return (
    <Animated.View style={[{ marginRight: 4 }, animatedStyle]}>
      <Ionicons name="chevron-down" size={18} color={folderColor} />
    </Animated.View>
  );
};

export default function IndexScreen() {
  const { t } = useTranslation();
  const { activeTheme } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { duplicateHabit, habits: allHabits, history, setHabits, getDay } = useHabits();
  const [activeSection, setActiveSection] = useState<'tasks' | 'tabelle'>('tasks');
  const [smartTaskPrompt, setSmartTaskPrompt] = useState<SmartTaskPromptState | null>(null);
  const [dismissedSmartTaskIds, setDismissedSmartTaskIds] = useState<string[]>([]);
  const logicalTodayYmd = useMemo(() => getDay(new Date()), [getDay]);
  const logicalTodayHistory = history[logicalTodayYmd];

  React.useEffect(() => {
    setDismissedSmartTaskIds([]);
  }, [logicalTodayYmd]);

  const smartTaskPromptHabit = useMemo(() => {
    if (!smartTaskPrompt) return null;
    return allHabits.find((habit) => habit.id === smartTaskPrompt.habitId) ?? null;
  }, [allHabits, smartTaskPrompt]);

  React.useEffect(() => {
    if (smartTaskPrompt && !smartTaskPromptHabit) {
      setSmartTaskPrompt(null);
    }
  }, [smartTaskPrompt, smartTaskPromptHabit]);

  const overdueSmartTask = useMemo(() => {
    return allHabits
      .filter((habit) => {
        if ((habit.tipo !== 'task' && habit.tipo !== 'abitudine') || !habit.smartTask?.enabled) {
          return false;
        }
        if (dismissedSmartTaskIds.includes(habit.id)) return false;
        if (habit.smartTask.nextDueDate >= logicalTodayYmd) return false;
        return !isHabitFullyDoneForDay(logicalTodayHistory, habit);
      })
      .sort((a, b) => {
        const byDueDate = (a.smartTask?.nextDueDate ?? '').localeCompare(b.smartTask?.nextDueDate ?? '');
        if (byDueDate !== 0) return byDueDate;
        return (a.order ?? 0) - (b.order ?? 0);
      })[0] ?? null;
  }, [allHabits, dismissedSmartTaskIds, logicalTodayHistory, logicalTodayYmd]);

  React.useEffect(() => {
    if (activeSection !== 'tasks' || smartTaskPrompt || !overdueSmartTask) return;
    setSmartTaskPrompt({
      habitId: overdueSmartTask.id,
      mode: 'overdue',
      resolvedOnYmd: logicalTodayYmd,
    });
  }, [activeSection, logicalTodayYmd, overdueSmartTask, smartTaskPrompt]);

  const handleSmartTaskCompleted = useCallback((habit: Habit, completedOnYmd: string) => {
    if (!habit.smartTask?.enabled) return;
    setDismissedSmartTaskIds((prev) => prev.filter((id) => id !== habit.id));
    setSmartTaskPrompt({
      habitId: habit.id,
      mode: 'completed',
      resolvedOnYmd: completedOnYmd,
    });
  }, []);

  const handleSmartTaskPromptClose = useCallback(() => {
    if (smartTaskPrompt?.mode === 'overdue') {
      setDismissedSmartTaskIds((prev) => (
        prev.includes(smartTaskPrompt.habitId) ? prev : [...prev, smartTaskPrompt.habitId]
      ));
    }
    setSmartTaskPrompt(null);
  }, [smartTaskPrompt]);

  const handleSmartTaskFeedback = useCallback((feedback: SmartTaskFeedback) => {
    if (!smartTaskPrompt) return;
    const { habitId, resolvedOnYmd } = smartTaskPrompt;

    setHabits((prev) => prev.map((habit) => {
      if (habit.id !== habitId || !habit.smartTask) return habit;
      return {
        ...habit,
        smartTask: resolveSmartTaskFeedback({
          current: habit.smartTask,
          feedback,
          resolvedOnYmd,
        }),
      };
    }));

    setDismissedSmartTaskIds((prev) => prev.filter((id) => id !== habitId));
    setSmartTaskPrompt(null);
  }, [setHabits, smartTaskPrompt]);

  const handleDuplicate = useCallback((habit: Habit) => {
    Alert.alert(
      t('index.duplicateTitle'),
      t('index.duplicateMessage', { name: habit.text }),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          onPress: () => {
            duplicateHabit(habit.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ]
    );
  }, [duplicateHabit, t]);

  const {
    habits,
    removeHabit,
    resetToday,
    dayResetTime,
    setDayResetTime,
    closingMenuId,
    sortMode,
    setSortMode,
    sortModeByFolder,
    setSortModeByFolder,
    folders,
    activeFolder,
    setActiveFolder,
    createFolderVisible,
    setCreateFolderVisible,
    editFolderVisible,
    setEditFolderVisible,
    editingFolder,
    setEditingFolder,
    newFolderName,
    setNewFolderName,
    newFolderColor,
    setNewFolderColor,
    newFolderIcon,
    setNewFolderIcon,
    newFolderFilters,
    setNewFolderFilters,
    foldersScrollEnabled,
    foldersContainerWidthRef,
    foldersScrollViewportWidthRef,
    foldersContentWidthRef,
    pendingDisplayRef,
    isMergeHoverSV,
    dragDirectionSV,
    isMergeHoverAtReleaseRef,
    dragDirectionAtReleaseRef,
    lastMergeHoverTimeSV,
    lastMergeHoverExitTimeSV,
    mergeDirectionSV,
    overlapHoverStateRef,
    overlapHoverState,
    animVals,
    setAnimVals,
    folderHeightsSV,
    displayList,
    folderMergeResetVersion,
    optionsMenuVisible,
    setOptionsMenuVisible,
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    draggingSelectionCount,
    stats,
    getHabitCompletionState,
    isFolderModeWithSections,
    folderTabsOrder,
    sectionedList,
    handleAddFolder,
    handleCreateFolder,
    handleSaveEditFolder,
    performDeleteFolder,
    handleLongPressFolder,
    handleSchedule,
    handleMoveToFolder,
    handleMenuOpen,
    handleMenuClose,
    toggleHabitDone,
    toggleSelect,
    recordDragStartSelection,
    buildCollapsedListIfMultiSelect,
    selectionOrder,
    toggleFolderCollapsed,
    updateFoldersScrollEnabled,
    handleSectionedDragEnd,
    preDragSnapshotRef,
    isPostDragRef,
    resetStorage,
    collapsedFolderIds,
    menuToday,
    menuTomorrow,
    menuYesterday,
  } = useIndexLogic();

  const lastFolderBarScrollXRef = useRef(0);
  const allTabRightEdgeRef = useRef(0);
  const addButtonRightEdgeRef = useRef(0);
  const addButtonLeftEdgeRef = useRef(0);
  const addButtonWidthRef = useRef(0);
  const [folderBarOverflowLines, setFolderBarOverflowLines] = useState({ left: false, right: false });
  const [folderAddMorphProgress, setFolderAddMorphProgress] = useState(0);

  const updateFolderAddMorphProgress = useCallback((contentW: number, layoutW: number, scrollX: number) => {
    const lw = layoutW > 0 ? layoutW : foldersScrollViewportWidthRef.current;
    const buttonLeft = addButtonLeftEdgeRef.current;
    const buttonWidth = addButtonWidthRef.current;
    if (lw <= 0 || contentW <= 0 || buttonWidth <= 0 || buttonLeft <= 0) {
      setFolderAddMorphProgress(0);
      return;
    }

    const viewportRight = scrollX + lw;
    const revealStart = buttonLeft - FOLDER_ADD_MORPH_LEAD;
    const revealEnd = addButtonRightEdgeRef.current > 0 ? addButtonRightEdgeRef.current : buttonLeft + buttonWidth;
    const raw = (viewportRight - revealStart) / Math.max(1, revealEnd - revealStart);
    setFolderAddMorphProgress(Math.max(0, Math.min(1, raw)));
  }, [foldersScrollViewportWidthRef]);

  const updateFolderBarOverflowDots = useCallback(
    (contentW: number, layoutW: number, scrollX: number) => {
      const lw = layoutW > 0 ? layoutW : foldersScrollViewportWidthRef.current;
      if (lw <= 0 || contentW <= 0) {
        setFolderBarOverflowLines((p) => (p.left || p.right ? { left: false, right: false } : p));
        return;
      }
      const overflows = contentW > lw + FOLDER_BAR_SCROLL_SLACK;
      if (!overflows) {
        setFolderBarOverflowLines((p) => (p.left || p.right ? { left: false, right: false } : p));
        return;
      }
      const allTabFullyHidden = allTabRightEdgeRef.current > 0
        ? scrollX > allTabRightEdgeRef.current
        : scrollX > FOLDER_BAR_SCROLL_SLACK;
      const addButtonVisible = addButtonRightEdgeRef.current > 0
        ? scrollX + lw >= addButtonRightEdgeRef.current - 8
        : scrollX + lw >= contentW - FOLDER_BAR_SCROLL_SLACK;
      const right = !addButtonVisible;
      const left = scrollX > FOLDER_BAR_SCROLL_SLACK && allTabFullyHidden;
      setFolderBarOverflowLines((p) => {
        if (p.left === left && p.right === right) return p;
        return { left, right };
      });
    },
    [foldersScrollViewportWidthRef]
  );

  React.useEffect(() => {
    updateFolderBarOverflowDots(
      foldersContentWidthRef.current,
      foldersScrollViewportWidthRef.current,
      lastFolderBarScrollXRef.current
    );
    updateFolderAddMorphProgress(
      foldersContentWidthRef.current,
      foldersScrollViewportWidthRef.current,
      lastFolderBarScrollXRef.current
    );
  }, [
    folderTabsOrder,
    updateFolderBarOverflowDots,
    updateFolderAddMorphProgress,
    foldersContentWidthRef,
    foldersScrollViewportWidthRef,
  ]);

  const folderAddRightLineStyle = useMemo(() => {
    const buttonWidth = addButtonWidthRef.current;
    const shrinkStart = buttonWidth > 0
      ? (FOLDER_ADD_MORPH_LEAD + MORPHING_FOLDER_ADD_FIRST_PIXEL_OFFSET + 3.5) / (buttonWidth + FOLDER_ADD_MORPH_LEAD)
      : 0.5;
    const shrinkEnd = buttonWidth > 0
      ? 1 - (FOLDER_ADD_SHRINK_END_EARLY_PX / (buttonWidth + FOLDER_ADD_MORPH_LEAD))
      : 1;
    const shrinkProgress = Math.max(
      0,
      Math.min(1, (folderAddMorphProgress - shrinkStart) / Math.max(0.0001, shrinkEnd - shrinkStart))
    );
    const shrinkPhase = shrinkProgress;
    const nextHeight =
      FOLDER_ADD_LINE_BASE_HEIGHT - (FOLDER_ADD_LINE_BASE_HEIGHT - FOLDER_ADD_LINE_FINAL_HEIGHT) * shrinkPhase;
    const nextTop = FOLDER_ADD_LINE_BASE_TOP + (FOLDER_ADD_LINE_BASE_HEIGHT - nextHeight) / 2;

    return {
      top: nextTop,
      height: nextHeight,
      opacity: 1,
    };
  }, [folderAddMorphProgress]);

  const shouldShowMorphingRightLine = folderAddRightLineStyle.height > (FOLDER_ADD_LINE_FINAL_HEIGHT + 1);

  const handleSelectDayScope = useCallback(
    (scope: typeof OGGI_TODAY_KEY | typeof DOMANI_TOMORROW_KEY | typeof IERI_YESTERDAY_KEY) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setActiveFolder(scope);
    },
    [setActiveFolder]
  );

  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const lastFolderTapRef = useRef<{ id: string; time: number } | null>(null);
  const isDraggingRef = useRef(false);
  const [isDraggingFolder, setIsDraggingFolder] = React.useState(false);
  const dragInteractionHandleRef = useRef<ReturnType<typeof InteractionManager.createInteractionHandle> | null>(null);
  const lastPlaceholderIndexRef = useRef<number | null>(null);
  const dropCoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dropCoverData, setDropCoverData] = useState<SectionItem[] | null>(null);
  const [taskScrollOffset, setTaskScrollOffset] = useState(0);
  const taskCoverBottomInset = IOS_TAB_BAR_BASE_HEIGHT + insets.bottom;

  React.useEffect(() => {
    return () => {
      if (dropCoverTimeoutRef.current != null) clearTimeout(dropCoverTimeoutRef.current);
    };
  }, []);

  const clearDropCover = useCallback(() => {
    if (dropCoverTimeoutRef.current != null) {
      clearTimeout(dropCoverTimeoutRef.current);
      dropCoverTimeoutRef.current = null;
    }
    setDropCoverData(null);
  }, []);

  const showDropCover = useCallback((data: SectionItem[]) => {
    if (!data.length) return;
    if (dropCoverTimeoutRef.current != null) clearTimeout(dropCoverTimeoutRef.current);
    setDropCoverData(data);
    dropCoverTimeoutRef.current = setTimeout(() => {
      dropCoverTimeoutRef.current = null;
      setDropCoverData(null);
    }, TASKS_DROP_COVER_DURATION_MS);
  }, []);

  // Never collapse the list data. Changing keys triggers the library's reset()
  // which freezes shared values, breaking multi-drag. Instead, we keep the same
  // keys and handle the visual collapse in renderItem.
  const listData = useMemo(() => {
    return pendingDisplayRef.current ?? displayList ?? sectionedList;
  }, [displayList, sectionedList]);

  // Forziamo il re-render delle celle durante il drag quando l'overlap cambia
  const extraDataForDrag = useMemo(() => ({
    overlapHoverState,
    collapsedFolderIds,
  }), [overlapHoverState, collapsedFolderIds]);

  // Determine the anchor task for multi-drag (first selected in selection order)
  const multiDragAnchorId = useMemo(() => {
    if (selectedIds.size <= 1 || isFolderModeWithSections) return null;
    const active = selectionOrder.filter(id => selectedIds.has(id));
    return active[0] ?? null;
  }, [selectedIds, selectionOrder, isFolderModeWithSections]);

  // Collect habits for the anchor block (ordered like buildCollapsedListIfMultiSelect)
  const multiDragHabits = useMemo(() => {
    if (!multiDragAnchorId) return [];
    const allHabits: { id: string; habit: any; index: number }[] = [];
    listData.forEach((item, i) => {
      if (item.type === 'task' && selectedIds.has(item.habit.id)) {
        allHabits.push({ id: item.habit.id, index: i, habit: item.habit });
      }
    });
    const anchorInfo = allHabits.find(h => h.id === multiDragAnchorId);
    if (!anchorInfo) return [];
    const anchorIndex = anchorInfo.index;
    const ordered = selectionOrder.filter(id => selectedIds.has(id));
    let result = [anchorInfo.habit];
    ordered.slice(1).forEach(id => {
      const info = allHabits.find(h => h.id === id);
      if (!info || info.id === multiDragAnchorId) return;
      if (info.index < anchorIndex) result = [info.habit, ...result];
      else result = [...result, info.habit];
    });
    // Add any selected not in ordered
    allHabits.forEach(info => {
      if (result.some(h => h.id === info.id)) return;
      if (info.index < anchorIndex) result = [info.habit, ...result];
      else result = [...result, info.habit];
    });
    return result;
  }, [multiDragAnchorId, selectedIds, selectionOrder, listData]);

  const getHabitCompletionProps = useCallback((habit: Habit) => {
    const completion = getHabitCompletionState(habit);
    return {
      isDone: completion.isDone,
      completionMode: completion.mode,
      completionDate: completion.mode === 'day' ? completion.date : undefined,
    } as const;
  }, [getHabitCompletionState]);

  const renderDropCoverTaskCard = useCallback((habit: Habit, key: string, inFolder = false) => {
    const completion = getHabitCompletionProps(habit);
    return (
      <View key={key} style={inFolder ? styles.taskInFolder : undefined}>
        <HabitItem
          habit={habit}
          index={0}
          isDone={completion.isDone}
          completionMode={completion.completionMode}
          completionDate={completion.completionDate}
          onToggleDone={toggleHabitDone}
          onRename={handleSchedule}
          onSchedule={handleSchedule}
          onColor={handleSchedule}
          shouldCloseMenu={closingMenuId === habit.id || closingMenuId === 'all'}
          onMoveToFolder={activeFolder === null ? handleMoveToFolder : undefined}
          selectionMode={selectionMode}
          isSelected={selectedIds.has(habit.id)}
          onToggleSelect={toggleSelect}
          onMenuOpen={handleMenuOpen}
          onMenuClose={handleMenuClose}
          onSmartTaskCompleted={handleSmartTaskCompleted}
        />
      </View>
    );
  }, [
    activeFolder,
    closingMenuId,
    getHabitCompletionProps,
    handleMenuClose,
    handleMenuOpen,
    handleMoveToFolder,
    handleSchedule,
    handleSmartTaskCompleted,
    selectedIds,
    selectionMode,
    toggleHabitDone,
    toggleSelect,
  ]);

  const renderDropCoverItem = useCallback((item: SectionItem, index: number) => {
    if (item.type === 'folderBlock') {
      const folderMeta = folders.find(f => (f.name ?? '').trim() === (item.folderName ?? '').trim());
      const folderColor = folderMeta?.color ?? THEME.textMuted;
      const isCollapsed = collapsedFolderIds.has(item.folderId);
      return (
        <View key={`cover-folder-${item.folderId}`}>
          <View style={styles.folderSeparator}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[styles.folderSeparatorText, { color: folderColor }]}>
                  {typeof item.folderName === 'string' ? item.folderName : t('common.tutte')}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View>
                  <ChevronIcon isCollapsed={isCollapsed} folderColor={folderColor} />
                </View>
              </View>
            </View>
          </View>
          {isCollapsed ? (
            <View style={{ height: 4 }} />
          ) : (
            <View style={styles.folderDebugBoxWrap}>
              <View style={styles.folderTaskGroup}>
                {item.tasks.map((habit) => renderDropCoverTaskCard(habit, `cover-task-${habit.id}`, true))}
              </View>
            </View>
          )}
        </View>
      );
    }

    if (item.type === 'multiDragBlock') {
      return (
        <View key={`cover-multi-${item.habits[0]?.id ?? index}`} style={styles.multiDragBlockRow}>
          {item.habits.map((habit) => renderDropCoverTaskCard(habit, `cover-multi-task-${habit.id}`))}
        </View>
      );
    }

    return renderDropCoverTaskCard(item.habit, `cover-task-${item.habit.id}`);
  }, [collapsedFolderIds, folders, renderDropCoverTaskCard, t]);

  const renderSectionItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<SectionItem>) => {
    if (item.type === 'folderBlock') {
      const folderMeta = folders.find(f => (f.name ?? '').trim() === (item.folderName ?? '').trim());
      const folderColor = folderMeta?.color ?? THEME.textMuted;
      const label = typeof item.folderName === 'string' ? item.folderName : t('common.tutte');
      const isCollapsed = collapsedFolderIds.has(item.folderId);
      const overlapState = overlapHoverState;
      let hasTouchingNeighbor = false;

      if (
        !isCollapsed &&
        isDraggingFolder &&
        overlapState.isOverlapping &&
        typeof getIndex === 'function'
      ) {
        const idx = getIndex() ?? -1;
        const activeIdx = overlapState.activeIndex;
        const dir = overlapState.direction;
        if (idx >= 0 && dir !== 0) {
          const neighborIdx = activeIdx + dir;
          if (
            neighborIdx >= 0 &&
            neighborIdx < listData.length &&
            (idx === activeIdx || idx === neighborIdx)
          ) {
            const activeItem = listData[activeIdx];
            const neighborItem = listData[neighborIdx];
            const activeIsFolder =
              activeItem &&
              activeItem.type === 'folderBlock' &&
              !collapsedFolderIds.has(activeItem.folderId);
            const neighborIsFolder =
              neighborItem &&
              neighborItem.type === 'folderBlock' &&
              !collapsedFolderIds.has(neighborItem.folderId);
            if (activeIsFolder && neighborIsFolder) {
              hasTouchingNeighbor = true;
            }
          }
        }
      }

      let debugAboveCount: number | string | null = null;
      let debugBelowCount: number | string | null = null;
      if (isActive && typeof getIndex === 'function') {
        const originalIdx = getIndex() ?? -1;
        const currentIdx = overlapState.activeIndex; // Indice visivo calcolato
        const displayIdx = currentIdx >= 0 ? currentIdx : originalIdx;
        
        let aboveOriginalIdx = -1;
        let belowOriginalIdx = -1;
        
        if (displayIdx > originalIdx) {
          aboveOriginalIdx = displayIdx;
          belowOriginalIdx = displayIdx + 1;
        } else if (displayIdx < originalIdx) {
          aboveOriginalIdx = displayIdx - 1;
          belowOriginalIdx = displayIdx;
        } else {
          aboveOriginalIdx = displayIdx - 1;
          belowOriginalIdx = displayIdx + 1;
        }
        
        if (aboveOriginalIdx >= 0 && aboveOriginalIdx < listData.length) {
          const aboveItem = listData[aboveOriginalIdx];
          if (aboveItem && aboveItem.type === 'folderBlock') {
            const isEmptyOrCollapsed = aboveItem.tasks.length === 0 || collapsedFolderIds.has(aboveItem.folderId);
            debugAboveCount = isEmptyOrCollapsed ? 'V' : aboveItem.tasks.length;
          }
        } else {
          debugAboveCount = 0;
        }
        
        if (belowOriginalIdx >= 0 && belowOriginalIdx < listData.length) {
          const belowItem = listData[belowOriginalIdx];
          if (belowItem && belowItem.type === 'folderBlock') {
            const isEmptyOrCollapsed = belowItem.tasks.length === 0 || collapsedFolderIds.has(belowItem.folderId);
            debugBelowCount = isEmptyOrCollapsed ? 'V' : belowItem.tasks.length;
          }
        } else {
          debugBelowCount = 0;
        }
      }

      return (
        <View onLayout={(e) => {
          if (typeof getIndex === 'function') {
            const idx = getIndex();
            if (idx != null && idx >= 0) {
              const h = e.nativeEvent.layout.height;
              runOnUI(() => {
                const arr = [...folderHeightsSV.value];
                arr[idx] = h;
                folderHeightsSV.value = arr;
              })();
            }
          }
        }}>
        <ScaleDecorator activeScale={1}>
          <View style={[isActive && styles.dragActiveFolderBlock]}>
            {/* The Folder Header */}
            <View style={styles.folderSeparator}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
                <TouchableOpacity
                  onLongPress={selectionMode ? undefined : drag}
                  disabled={isActive}
                  activeOpacity={0.7}
                  delayLongPress={200}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}
                >
                  <Text style={[
                    styles.folderSeparatorText,
                    { color: folderColor },
                    isActive && { transform: [{ scale: 1.35 }], transformOrigin: '0% 50%' }
                  ]}>
                    {label}
                  </Text>
                  <View style={{ marginLeft: 20 }}>
                    <MergeIcon isActive={isActive} isMergeHoverSV={isMergeHoverSV} debugAboveCount={debugAboveCount} debugBelowCount={debugBelowCount} />
                  </View>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    pointerEvents={isActive ? 'none' : 'auto'}
                    style={isActive ? { opacity: 0 } : undefined}
                  >
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ disabled: isActive }}
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        toggleFolderCollapsed(item.folderId);
                      }}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      activeOpacity={0.7}
                      disabled={isActive}
                    >
                      <ChevronIcon isCollapsed={isCollapsed} folderColor={folderColor} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
            {/* The Folder Tasks */}
            {isCollapsed ? (
              <View style={{ height: 4 }} />
            ) : (
              <View style={styles.folderDebugBoxWrap}>
                <View style={styles.folderTaskGroup}>
                  {item.tasks.map((h) => {
                    const completion = getHabitCompletionProps(h);
                    return (
                      <View
                        key={h.id}
                        style={styles.taskInFolder}
                      >
                        <HabitItem
                          habit={h}
                          index={0}
                          isDone={completion.isDone}
                          completionMode={completion.completionMode}
                          completionDate={completion.completionDate}
                          onToggleDone={toggleHabitDone}
                          onRename={handleSchedule}
                          onSchedule={handleSchedule}
                          onColor={handleSchedule}
                          shouldCloseMenu={closingMenuId === h.id || closingMenuId === 'all'}
                          onMoveToFolder={activeFolder === null ? handleMoveToFolder : undefined}
                          selectionMode={selectionMode}
                          isSelected={selectedIds.has(h.id)}
                          onToggleSelect={toggleSelect}
                          onMenuOpen={handleMenuOpen}
                          onMenuClose={handleMenuClose}
                          onSmartTaskCompleted={handleSmartTaskCompleted}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            )}
          </View>
        </ScaleDecorator>
        </View>
      );
    }
    if (item.type === 'task') {
      const isSelected = selectedIds.has(item.habit.id);
      const isAnchor = item.habit.id === multiDragAnchorId;
      const isNonAnchorSelected = isSelected && multiDragAnchorId && !isAnchor;

      // Anchor task: render the multi-drag block (all selected habits stacked)
      if (isAnchor && multiDragHabits.length > 1) {
        return (
          <View>
            <ScaleDecorator>
              <View style={styles.multiDragBlockRow}>
                {multiDragHabits.map((habit) => {
                  const completion = getHabitCompletionProps(habit);
                  return (
                    <HabitItem
                      key={habit.id}
                      habit={habit}
                      index={0}
                      isDone={completion.isDone}
                      completionMode={completion.completionMode}
                      completionDate={completion.completionDate}
                      onToggleDone={toggleHabitDone}
                      onRename={handleSchedule}
                      onSchedule={handleSchedule}
                      onColor={handleSchedule}
                      shouldCloseMenu={closingMenuId === habit.id || closingMenuId === 'all'}
                      onMoveToFolder={activeFolder === null ? handleMoveToFolder : undefined}
                      selectionMode={selectionMode}
                      isSelected={selectedIds.has(habit.id)}
                      onToggleSelect={toggleSelect}
                      onLongPress={drag}
                      onMenuOpen={handleMenuOpen}
                      onMenuClose={handleMenuClose}
                      onSmartTaskCompleted={handleSmartTaskCompleted}
                    />
                  );
                })}
              </View>
            </ScaleDecorator>
          </View>
        );
      }

      // Non-anchor selected tasks: render at 0 height (hidden, not draggable)
      if (isNonAnchorSelected) {
        return (
          <ScaleDecorator>
            <View style={{ height: 0, overflow: 'hidden' }} />
          </ScaleDecorator>
        );
      }
      const canDragTask = !isFolderModeWithSections;
      const canStartDrag =
        canDragTask &&
        (!selectionMode || selectedIds.size === 0 || selectedIds.has(item.habit.id));
      const taskRowLayout = isPostDragRef.current ? undefined : Layout;
      const shouldUseStaticTaskWrapper = selectionMode && selectedIds.size > 0;
      const completion = getHabitCompletionProps(item.habit);
      const taskCard = (
        <ScaleDecorator>
          <Pressable
            onLongPress={canStartDrag ? drag : undefined}
            disabled={isActive || !canStartDrag}
            delayLongPress={200}
            onPress={() => {
              if (selectionMode) return;
              const id = item.habit.id;
              const now = Date.now();
              if (lastTapRef.current?.id === id && now - lastTapRef.current.time < 300) {
                lastTapRef.current = null;
                handleDuplicate(item.habit);
              } else {
                lastTapRef.current = { id, time: now };
              }
            }}
          >
            <HabitItem
              habit={item.habit}
              index={0}
              isDone={completion.isDone}
              completionMode={completion.completionMode}
              completionDate={completion.completionDate}
              onToggleDone={toggleHabitDone}
              onRename={handleSchedule}
              onSchedule={handleSchedule}
              onColor={handleSchedule}
              shouldCloseMenu={closingMenuId === item.habit.id || closingMenuId === 'all'}
              onMoveToFolder={activeFolder === null ? handleMoveToFolder : undefined}
              selectionMode={selectionMode}
              isSelected={selectedIds.has(item.habit.id)}
              onToggleSelect={toggleSelect}
              onLongPress={canStartDrag ? drag : undefined}
              dragBadgeCount={isActive && draggingSelectionCount > 1 ? draggingSelectionCount : undefined}
              onMenuOpen={handleMenuOpen}
              onMenuClose={handleMenuClose}
              onSmartTaskCompleted={handleSmartTaskCompleted}
            />
          </Pressable>
        </ScaleDecorator>
      );
      if (shouldUseStaticTaskWrapper) {
        return <View>{taskCard}</View>;
      }
      return (
        <Animated.View layout={taskRowLayout}>
          {taskCard}
        </Animated.View>
      );
    }
    return null;
  }, [
    getHabitCompletionProps,
    handleSchedule,
    closingMenuId,
    activeFolder,
    sortMode,
    folders,
    handleMoveToFolder,
    handleMenuOpen,
    handleMenuClose,
    isFolderModeWithSections,
    selectionMode,
    selectedIds,
    draggingSelectionCount,
    toggleSelect,
    isMergeHoverSV,
    collapsedFolderIds,
    toggleFolderCollapsed,
    multiDragAnchorId,
    multiDragHabits,
    isDraggingFolder,
    listData,
    overlapHoverState,
    handleDuplicate,
    handleSmartTaskCompleted,
    isPostDragRef,
    toggleHabitDone,
    t,
  ]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {activeTheme !== 'futuristic' && (
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={() => setActiveSection('tasks')}>
              <Text style={[styles.title, activeSection !== 'tasks' && { color: '#888' }]}>{t('index.tasks')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveSection('tabelle')}>
              <Text style={[styles.title, activeSection !== 'tabelle' && { color: '#888' }]}>{t('index.tables')}</Text>
            </TouchableOpacity>
          </View>
          <Text style={[styles.progressText, activeSection !== 'tasks' && { opacity: 0 }]}>{stats.pct}%</Text>
        </View>
      )}

      {activeTheme === 'futuristic' && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 16, marginTop: 55, paddingHorizontal: 16, paddingBottom: 6 }}>
          <TouchableOpacity onPress={() => setActiveSection('tasks')}>
            <Text style={[styles.progressText, activeSection !== 'tasks' && { opacity: 0.3 }]}>{stats.pct}%</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setActiveSection('tabelle')}>
            <Text style={[styles.progressText, { fontSize: 18, letterSpacing: 1 }, activeSection !== 'tabelle' && { opacity: 0.3 }]}>
              {t('index.tables').toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {activeSection === 'tabelle' && <TabelleView />}

      {activeSection === 'tasks' && <><View style={styles.tasksProgressAndFoldersWrap}>
        <View style={styles.progressSection}>
        <View style={styles.progressBarContainer}>
          <View style={[
            styles.progressBarBg,
            activeTheme === 'futuristic' && {
              borderRadius: 0,
              transform: [{ skewX: '-30deg' }]
            }
          ]}>
            <View style={[
              styles.progressBarFill,
              { width: `${stats.pct}%` },
              activeTheme === 'futuristic' && {
                borderRadius: 0
              }
            ]} />
          </View>
          <View style={styles.progressActions}>
            {optionsMenuVisible && (
              <>
                {[
                  {
                    key: 'sort', icon: 'swap-vertical-outline' as const, onPress: () => {
                      setOptionsMenuVisible(false);
                      const folderNameNow = activeFolder?.trim() ?? null;
                      const isDayVirtualTab =
                        folderNameNow === OGGI_TODAY_KEY ||
                        folderNameNow === DOMANI_TOMORROW_KEY ||
                        folderNameNow === IERI_YESTERDAY_KEY;
                      const baseFallback: typeof sortMode = isDayVirtualTab ? sortMode : 'creation';
                      const current: typeof sortMode =
                        folderNameNow !== null
                          ? (sortModeByFolder[folderNameNow] ?? baseFallback)
                          : sortMode;
                      const setCurrent = (mode: typeof sortMode) => {
                        if (folderNameNow !== null) {
                          setSortModeByFolder(prev => ({ ...prev, [folderNameNow]: mode }));
                        } else {
                          setSortMode(mode);
                        }
                      };
                      const sel = (label: string, mode: typeof sortMode) =>
                        current === mode ? `${label} ✓` : label;
                      const labels: Record<typeof sortMode, string> = {
                        creation: 'Data di creazione',
                        time: 'Orario',
                        color: 'Ordine per colore',
                        folder: 'Ordine per cartelle',
                        alphabetical: 'Ordine alfabetico',
                        custom: 'Ordine libero (Trascina)',
                      };
                      const isRealFolder =
                        folderNameNow !== null &&
                        folderNameNow !== OGGI_TODAY_KEY &&
                        folderNameNow !== DOMANI_TOMORROW_KEY &&
                        folderNameNow !== IERI_YESTERDAY_KEY;
                      const options: any[] = [
                        { text: 'Annulla', style: 'cancel' },
                        { text: sel('Data di creazione', 'creation'), onPress: () => setCurrent('creation') },
                        { text: sel('Orario', 'time'), onPress: () => setCurrent('time') },
                        { text: sel('Ordine per colore', 'color'), onPress: () => setCurrent('color') },
                      ];
                      if (!isRealFolder) {
                        options.push({ text: sel('Ordine per cartelle', 'folder'), onPress: () => setCurrent('folder') });
                      }
                      options.push(
                        { text: sel('Ordine alfabetico', 'alphabetical'), onPress: () => setCurrent('alphabetical') },
                        { text: sel('Ordine libero (Trascina)', 'custom'), onPress: () => setCurrent('custom') }
                      );
                      Alert.alert(
                        isRealFolder ? 'Ordina task (in questa cartella)' : 'Ordina task',
                        `Ordine attuale: ${labels[current] ?? current}`,
                        options
                      );
                    }
                  },
                  {
                    key: 'places', icon: 'map-outline' as const, onPress: () => {
                      setOptionsMenuVisible(false);
                      router.push('/places');
                    }
                  },
                  {
                    key: 'reset', icon: 'refresh-outline' as const, onPress: () => {
                      setOptionsMenuVisible(false);
                      Alert.alert(
                        'Azzera le task di oggi?',
                        'Vuoi segnare tutte le task come non completate per oggi?',
                        [
                          { text: 'Annulla', style: 'cancel' },
                          { text: 'Conferma', style: 'destructive', onPress: resetToday }
                        ]
                      );
                    }
                  },
                  {
                    key: 'selection', icon: 'checkmark-done-outline' as const, onPress: () => {
                      setOptionsMenuVisible(false);
                      setSelectionMode(v => {
                        if (v) {
                          setSelectedIds(new Set());
                          return false;
                        }
                        return true;
                      });
                    }
                  },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={opt.onPress}
                    style={[
                      styles.progressBtn,
                      activeTheme === 'futuristic' && {
                        borderRadius: 0,
                        transform: [{ skewX: '-30deg' }]
                      }
                    ]}
                  >
                    <Ionicons name={opt.icon} size={16} color={THEME.textMuted} />
                  </TouchableOpacity>
                ))}
              </>
            )}
            <TouchableOpacity
              onPress={() => setOptionsMenuVisible(v => !v)}
              style={[
                styles.progressBtn,
                activeTheme === 'futuristic' && {
                  borderRadius: 0,
                  transform: [{ skewX: '-30deg' }]
                }
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={18} color={THEME.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
        </View>

        <View
          style={styles.foldersContainer}
            onLayout={(e) => {
              foldersContainerWidthRef.current = e.nativeEvent.layout.width;
              updateFoldersScrollEnabled();
            }}
          >
          <View
            style={styles.foldersScrollHost}
            onLayout={(e) => {
              const lw = e.nativeEvent.layout.width;
              foldersScrollViewportWidthRef.current = lw;
              updateFoldersScrollEnabled();
              updateFolderBarOverflowDots(
                foldersContentWidthRef.current,
                lw,
                lastFolderBarScrollXRef.current
              );
              updateFolderAddMorphProgress(
                foldersContentWidthRef.current,
                lw,
                lastFolderBarScrollXRef.current
              );
            }}
          >
          <ScrollView
            horizontal
            style={styles.foldersScrollView}
            showsHorizontalScrollIndicator={false}
            scrollEnabled={foldersScrollEnabled}
            contentContainerStyle={styles.foldersScroll}
            onContentSizeChange={(contentWidth) => {
              foldersContentWidthRef.current = contentWidth;
              updateFoldersScrollEnabled();
              updateFolderBarOverflowDots(
                contentWidth,
                foldersScrollViewportWidthRef.current,
                lastFolderBarScrollXRef.current
              );
              updateFolderAddMorphProgress(
                contentWidth,
                foldersScrollViewportWidthRef.current,
                lastFolderBarScrollXRef.current
              );
            }}
            onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              lastFolderBarScrollXRef.current = contentOffset.x;
              const layoutW =
                layoutMeasurement.width > 0
                  ? layoutMeasurement.width
                  : foldersScrollViewportWidthRef.current;
              updateFolderBarOverflowDots(contentSize.width, layoutW, contentOffset.x);
              updateFolderAddMorphProgress(contentSize.width, layoutW, contentOffset.x);
            }}
            scrollEventThrottle={16}
          >
            {folderTabsOrder.map((folderNameOrNull, i) =>
              folderNameOrNull === null ? (
              <TouchableOpacity
                key="tutte"
                style={styles.folderRow}
                onLayout={(e) => {
                  allTabRightEdgeRef.current = e.nativeEvent.layout.x + e.nativeEvent.layout.width;
                  updateFolderBarOverflowDots(
                    foldersContentWidthRef.current,
                    foldersScrollViewportWidthRef.current,
                    lastFolderBarScrollXRef.current
                  );
                }}
                onPress={() => setActiveFolder(null)}
              >
                  <Ionicons name="folder-open-outline" size={18} color={activeFolder === null ? THEME.text : THEME.textMuted} />
                  <Text style={[styles.folderLabel, activeFolder === null && styles.folderLabelActive]}>{t('common.tutte')}</Text>
                </TouchableOpacity>
              ) : (() => {
                const f = folders.find(fd => (fd.name ?? '').trim() === folderNameOrNull);
                if (!f) return null;
                return (
                  <TouchableOpacity
                    key={`ft-${i}-${(f.name ?? '').trim() || f.id}`}
                    style={styles.folderRow}
                    onPress={() => {
                      const id = typeof f.id === 'string' ? f.id : f.name;
                      const now = Date.now();
                      if (lastFolderTapRef.current?.id === id && now - lastFolderTapRef.current.time < 400) {
                        lastFolderTapRef.current = null;
                        handleLongPressFolder(f);
                      } else {
                        lastFolderTapRef.current = { id, time: now };
                        setActiveFolder(f.name);
                      }
                    }}
                    onLongPress={() => handleLongPressFolder(f)}
                    delayLongPress={200}
                  >
                    <Ionicons name={(f.icon ?? 'folder-outline') as any} size={18} color={activeFolder === f.name ? f.color : THEME.textMuted} />
                    <Text style={[styles.folderLabel, activeFolder === f.name && { color: f.color }]}>
                      {typeof f.name === 'string' ? f.name : String(f.name ?? '')}
                    </Text>
                  </TouchableOpacity>
                );
              })()
            )}

            <TouchableOpacity
              style={styles.folderAddBtn}
              onLayout={(e) => {
                addButtonLeftEdgeRef.current = e.nativeEvent.layout.x;
                addButtonRightEdgeRef.current = e.nativeEvent.layout.x + e.nativeEvent.layout.width;
                addButtonWidthRef.current = e.nativeEvent.layout.width;
                updateFolderBarOverflowDots(
                  foldersContentWidthRef.current,
                  foldersScrollViewportWidthRef.current,
                  lastFolderBarScrollXRef.current
                );
                updateFolderAddMorphProgress(
                  foldersContentWidthRef.current,
                  foldersScrollViewportWidthRef.current,
                  lastFolderBarScrollXRef.current
                );
              }}
              onPress={handleAddFolder}
            >
              <MorphingFolderAddIcon progress={folderAddMorphProgress} />
            </TouchableOpacity>
          </ScrollView>
          {shouldShowMorphingRightLine ? (
            <View
              style={[
                styles.folderBarOverflowLine,
                styles.folderBarOverflowLineRight,
                {
                  bottom: undefined,
                  right: -0.34,
                  top: folderAddRightLineStyle.top,
                  height: folderAddRightLineStyle.height,
                  opacity: folderAddRightLineStyle.opacity,
                }
              ]}
              pointerEvents="none"
            />
          ) : null}
          {folderBarOverflowLines.left ? (
            <View
              style={[
                styles.folderBarOverflowLine,
                styles.folderBarOverflowLineLeft,
                {
                  bottom: undefined,
                  left: -0.34,
                  top: FOLDER_ADD_LINE_BASE_TOP,
                  height: FOLDER_ADD_LINE_BASE_HEIGHT,
                }
              ]}
              pointerEvents="none"
            />
          ) : null}
        </View>

        <View style={styles.todayTabAnchor}>
          <MenuView
            style={styles.todayTabMenu}
            shouldOpenOnLongPress={false}
            onPressAction={({ nativeEvent }) => {
              if (nativeEvent.event === IERI_YESTERDAY_KEY) {
                handleSelectDayScope(IERI_YESTERDAY_KEY);
                return;
              }
              if (nativeEvent.event === OGGI_TODAY_KEY) {
                handleSelectDayScope(OGGI_TODAY_KEY);
                return;
              }
              if (nativeEvent.event === DOMANI_TOMORROW_KEY) {
                handleSelectDayScope(DOMANI_TOMORROW_KEY);
              }
            }}
            actions={[
              {
                id: IERI_YESTERDAY_KEY,
                title: t('index.folderYesterday'),
                preferredElementSize: 'small',
              },
              {
                id: OGGI_TODAY_KEY,
                title: t('index.folderToday'),
                preferredElementSize: 'small',
              },
              {
                id: DOMANI_TOMORROW_KEY,
                title: t('index.folderTomorrow'),
                preferredElementSize: 'small',
              },
            ]}
          >
            <View style={styles.todayTabRow}>
              <Text
                style={[
                  styles.folderLabel,
                  (activeFolder === OGGI_TODAY_KEY ||
                    activeFolder === DOMANI_TOMORROW_KEY ||
                    activeFolder === IERI_YESTERDAY_KEY) &&
                    styles.folderLabelActive,
                ]}
                numberOfLines={1}
              >
                {activeFolder === DOMANI_TOMORROW_KEY
                  ? t('index.folderTomorrow')
                  : activeFolder === IERI_YESTERDAY_KEY
                    ? t('index.folderYesterday')
                    : t('index.folderToday')}
              </Text>
            </View>
          </MenuView>
        </View>
        </View>
      </View>

      {habits.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Nessuna task ancora… Tocca + per aggiungere la tua prima task</Text>
        </View>
      ) : (
        <View style={styles.listWrap}>
          <View>
            <DraggableFlatList<SectionItem>
              data={listData}
              keyExtractor={(item) =>
                item.type === 'folderBlock'
                  ? `folder-${item.folderId}-${folderMergeResetVersion}-${item.tasks.map(task => task.id).join('|')}`
                  :
                item.type === 'multiDragBlock' ? `task-${item.habits[0].id}` :
                `task-${item.habit.id}`}
              renderItem={renderSectionItem}
              extraData={extraDataForDrag}
              contentContainerStyle={[styles.listContainer, activeTheme === 'futuristic' && { paddingHorizontal: -16 }]}
              style={[activeTheme === 'futuristic' && { marginHorizontal: -16 }]}
              containerStyle={styles.dragListContainer}
              showsVerticalScrollIndicator={false}
              dragItemOverflow
              autoscrollThreshold={TASKS_DRAG_AUTOSCROLL_THRESHOLD}
              autoscrollSpeed={TASKS_DRAG_AUTOSCROLL_SPEED}
              // @ts-ignore — patched prop for separate top threshold
              autoscrollTopThreshold={TASKS_DRAG_AUTOSCROLL_TOP_THRESHOLD}
              windowSize={60}
              initialNumToRender={12}
              removeClippedSubviews={false}
              animationConfig={TASKS_DRAG_ANIMATION_CONFIG}
              onAnimValInit={(v) => setAnimVals(v)}
              // @ts-ignore — patched prop: override cell measurements inside drag()
              onCellMeasureOverride={(index: number, _key: string, cellData: any, _cellDataMap: Map<string, any>) => {
                // When the anchor task renders the multi-drag block, the library
                // may have a stale single-task measurement (83px). Override with
                // the actual block size. The cell's offset from cellDataRef is
                // still correct since the key didn't change.
                // We also need to collapse the other selected cells to 0, otherwise
                // the internal layout map keeps counting them as full-height rows and
                // autoscroll stops early while dragging a multi-selection.
                const item = listData[index];
                if (item?.type === 'task' && multiDragHabits.length > 1) {
                  if (item.habit.id === multiDragAnchorId) {
                    return { size: multiDragHabits.length * TASKS_MULTI_DRAG_ROW_HEIGHT };
                  }
                  if (selectedIds.has(item.habit.id)) {
                    return { size: 0 };
                  }
                }
                return null;
              }}
              onDragBegin={(idx) => {
                clearDropCover();
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                lastPlaceholderIndexRef.current = idx;
                isDraggingRef.current = true;
                setIsDraggingFolder(listData[idx]?.type === 'folderBlock');
                dragInteractionHandleRef.current = InteractionManager.createInteractionHandle();
                isMergeHoverSV.value = false;
                dragDirectionSV.value = 0;
                isPostDragRef.current = false;
                lastMergeHoverTimeSV.value = 0;
                lastMergeHoverExitTimeSV.value = 0;
                mergeDirectionSV.value = 0;
                const list = displayList ?? sectionedList;
                preDragSnapshotRef.current = [...list];
                recordDragStartSelection(selectedIds);
              }}
              onPlaceholderIndexChange={(index) => {
                if (lastPlaceholderIndexRef.current !== null && lastPlaceholderIndexRef.current !== index) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                }
                lastPlaceholderIndexRef.current = index;
              }}
              onRelease={(index) => {
                // Capture exactly what the UI thread values are at the moment of finger lift,
                // BEFORE any snap-back animations destroy the hover state.
                const now = Date.now();
                const wasMergeHoverRecently =
                  (now - lastMergeHoverTimeSV.value) < 120 &&
                  lastMergeHoverExitTimeSV.value <= lastMergeHoverTimeSV.value;
                isMergeHoverAtReleaseRef.current = isMergeHoverSV.value || wasMergeHoverRecently;
                dragDirectionAtReleaseRef.current =
                  mergeDirectionSV.value !== 0 ? mergeDirectionSV.value : dragDirectionSV.value;
              }}
              onDragEnd={(params) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                lastPlaceholderIndexRef.current = null;
                isDraggingRef.current = false;
                const draggedWasFolder = listData[params.from]?.type === 'folderBlock';
                const draggedSelectedTask = !draggedWasFolder && draggingSelectionCount > 0;
                setIsDraggingFolder(false);
                if (params.from !== params.to && !draggedWasFolder && !draggedSelectedTask) {
                  showDropCover(params.data);
                } else {
                  clearDropCover();
                }
                // Release the interaction handle so any pending reset() can fire
                // now that the drag is over.
                if (dragInteractionHandleRef.current !== null) {
                  InteractionManager.clearInteractionHandle(dragInteractionHandleRef.current);
                  dragInteractionHandleRef.current = null;
                }
                handleSectionedDragEnd(params);
              }}
              onScrollOffsetChange={setTaskScrollOffset}
            />
          </View>
          {dropCoverData && dropCoverData.length > 0 && (
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: Math.max(0, taskCoverBottomInset - TASKS_TAB_BAR_EDGE_OVERLAP + TASKS_DROP_COVER_BOTTOM_LIFT),
                overflow: 'hidden',
                zIndex: 40,
              }}
            >
              <View style={[styles.listContainer, { transform: [{ translateY: -taskScrollOffset }] }]}>
                {dropCoverData.map(renderDropCoverItem)}
              </View>
            </View>
          )}
          {TASKS_DROP_COVER_DEBUG_LINES && dropCoverData && dropCoverData.length > 0 && (
            <>
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 2,
                  backgroundColor: '#ff2d2d',
                  zIndex: 60,
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: Math.max(0, taskCoverBottomInset - TASKS_TAB_BAR_EDGE_OVERLAP + TASKS_DROP_COVER_BOTTOM_LIFT),
                  height: 2,
                  backgroundColor: '#ff2d2d',
                  zIndex: 60,
                }}
              />
            </>
          )}
        </View>
      )}

      {selectionMode ? (
        <View style={styles.fabRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => {
              if (selectedIds.size === 0) return;
              Alert.alert(
                'Elimina task',
                `Vuoi eliminare ${selectedIds.size} task?`,
                [
                  { text: 'Annulla', style: 'cancel' },
                  {
                    text: 'Elimina', style: 'destructive', onPress: () => {
                      selectedIds.forEach(id => removeHabit(id));
                      setSelectedIds(new Set());
                      setSelectionMode(false);
                    }
                  }
                ]
              );
            }}
            style={[styles.fabTrash, selectedIds.size === 0 && styles.fabDisabled]}
            disabled={selectedIds.size === 0}
          >
            <Ionicons name="trash-outline" size={28} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
            style={styles.fabCancel}
          >
            <Ionicons name="close" size={52} color="#000" />
          </TouchableOpacity>
        </View>
      ) : (
        <Link
          href={{
            pathname: '/modal',
            params: {
              type: 'new',
              folder: (activeFolder && activeFolder !== TUTTE_KEY) ? activeFolder : undefined,
              ymd:
                activeFolder === DOMANI_TOMORROW_KEY
                  ? menuTomorrow
                  : activeFolder === IERI_YESTERDAY_KEY
                    ? menuYesterday
                    : menuToday,
            }
          }}
          asChild
        >
          <TouchableOpacity accessibilityRole="button" style={styles.fab}>
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </Link>
      )}
      </>}

      <FolderModals
        createFolderVisible={createFolderVisible}
        setCreateFolderVisible={setCreateFolderVisible}
        editFolderVisible={editFolderVisible}
        setEditFolderVisible={setEditFolderVisible}
        editingFolder={editingFolder}
        setEditingFolder={setEditingFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        newFolderColor={newFolderColor}
        setNewFolderColor={setNewFolderColor}
        newFolderIcon={newFolderIcon}
        setNewFolderIcon={setNewFolderIcon}
        newFolderFilters={newFolderFilters}
        setNewFolderFilters={setNewFolderFilters}
        handleCreateFolder={handleCreateFolder}
        handleSaveEditFolder={handleSaveEditFolder}
        performDeleteFolder={performDeleteFolder}
      />
      <SmartTaskFeedbackModal
        visible={Boolean(smartTaskPrompt && smartTaskPromptHabit)}
        habitTitle={smartTaskPromptHabit?.text ?? ''}
        mode={smartTaskPrompt?.mode ?? 'completed'}
        onSelect={handleSmartTaskFeedback}
        onClose={handleSmartTaskPromptClose}
      />
    </SafeAreaView>
  );
}
