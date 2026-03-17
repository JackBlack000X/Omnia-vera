import { HabitItem } from '@/components/HabitItem';
import { FolderModals } from '@/components/index/FolderModals';
import { styles } from '@/components/index/indexStyles';
import TabelleView from '@/components/index/TabelleView';
import { THEME } from '@/constants/theme';
import { OGGI_TODAY_KEY, SectionItem, TUTTE_KEY } from '@/lib/index/indexTypes';
import { useIndexLogic } from '@/lib/index/useIndexLogic';
import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Link, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Alert, InteractionManager, LayoutAnimation, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { FadeInDown, Layout, runOnUI, SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const TASKS_DRAG_AUTOSCROLL_THRESHOLD = 108;
const TASKS_DRAG_AUTOSCROLL_SPEED = 72;
const TASKS_DRAG_AUTOSCROLL_TOP_THRESHOLD = 28;
const TASKS_DRAG_ANIMATION_CONFIG = {
  damping: 26,
  stiffness: 165,
} as const;

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
  const { activeTheme } = useAppTheme();
  const router = useRouter();
  const { duplicateHabit } = useHabits();
  const [activeSection, setActiveSection] = useState<'tasks' | 'tabelle'>('tasks');

  const handleDuplicate = useCallback((habit: Habit) => {
    Alert.alert(
      'Duplica task',
      `Vuoi duplicare "${habit.text}"?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sì', onPress: () => {
            duplicateHabit(habit.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        },
      ]
    );
  }, [duplicateHabit]);

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
    foldersContentWidthRef,
    pendingDisplayRef,
    isMergeHoverSV,
    dragDirectionSV,
    isMergeHoverAtReleaseRef,
    dragDirectionAtReleaseRef,
    lastMergeHoverTimeRef,
    mergeDirectionRef,
    overlapHoverStateRef,
    overlapHoverState,
    animVals,
    setAnimVals,
    folderHeightsSV,
    displayList,
    optionsMenuVisible,
    setOptionsMenuVisible,
    selectionMode,
    setSelectionMode,
    selectedIds,
    setSelectedIds,
    draggingSelectionCount,
    stats,
    completedByHabitId,
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
  } = useIndexLogic();

  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const isDraggingRef = useRef(false);
  const [isDraggingFolder, setIsDraggingFolder] = React.useState(false);
  const dragInteractionHandleRef = useRef<ReturnType<typeof InteractionManager.createInteractionHandle> | null>(null);
  const lastPlaceholderIndexRef = useRef<number | null>(null);

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

  const renderSectionItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<SectionItem>) => {
    if (item.type === 'folderBlock') {
      const folderMeta = folders.find(f => (f.name ?? '').trim() === (item.folderName ?? '').trim());
      const folderColor = folderMeta?.color ?? THEME.textMuted;
      const label = typeof item.folderName === 'string' ? item.folderName : 'Tutte';
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
        <Animated.View onLayout={(e) => {
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
                  {item.tasks.map((h, index) => (
                    <Animated.View
                      key={h.id}
                      style={styles.taskInFolder}
                      entering={FadeInDown.duration(260).delay(index * 60)}
                    >
                      <HabitItem
                        habit={h}
                        index={0}
                        isDone={Boolean(completedByHabitId[h.id])}
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
                      />
                    </Animated.View>
                  ))}
                </View>
              </View>
            )}
          </View>
        </ScaleDecorator>
        </Animated.View>
      );
    }
    if (item.type === 'task') {
      const isSelected = selectedIds.has(item.habit.id);
      const isAnchor = item.habit.id === multiDragAnchorId;
      const isNonAnchorSelected = isSelected && multiDragAnchorId && !isAnchor;

      // Anchor task: render the multi-drag block (all selected habits stacked)
      if (isAnchor && multiDragHabits.length > 1) {
        return (
          <Animated.View>
          <ScaleDecorator>
            <View style={styles.multiDragBlockRow}>
              {multiDragHabits.map((habit) => (
                <HabitItem
                  key={habit.id}
                  habit={habit}
                  index={0}
                  isDone={Boolean(completedByHabitId[habit.id])}
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
                />
              ))}
            </View>
          </ScaleDecorator>
          </Animated.View>
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
      return (
        <Animated.View layout={Layout}>
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={canStartDrag ? drag : undefined}
            disabled={isActive || !canStartDrag}
            activeOpacity={0.9}
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
              isDone={Boolean(completedByHabitId[item.habit.id])}
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
            />
          </TouchableOpacity>
        </ScaleDecorator>
        </Animated.View>
      );
    }
    return null;
  }, [
    completedByHabitId,
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
  ]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {activeTheme !== 'futuristic' && (
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={() => setActiveSection('tasks')}>
              <Text style={[styles.title, activeSection !== 'tasks' && { color: '#888' }]}>Tasks</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setActiveSection('tabelle')}>
              <Text style={[styles.title, activeSection !== 'tabelle' && { color: '#888' }]}>Tabelle</Text>
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
            <Text style={[styles.progressText, { fontSize: 18, letterSpacing: 1 }, activeSection !== 'tabelle' && { opacity: 0.3 }]}>TABELLE</Text>
          </TouchableOpacity>
        </View>
      )}

      {activeSection === 'tabelle' && <TabelleView />}

      {activeSection === 'tasks' && <><View style={styles.progressSection}>
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
                      const isOggi = folderNameNow === OGGI_TODAY_KEY;
                      const baseFallback: typeof sortMode = isOggi ? sortMode : 'creation';
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
                      const isRealFolder = folderNameNow !== null && folderNameNow !== OGGI_TODAY_KEY;
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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          scrollEnabled={foldersScrollEnabled}
          contentContainerStyle={styles.foldersScroll}
          onContentSizeChange={(contentWidth) => {
            foldersContentWidthRef.current = contentWidth;
            updateFoldersScrollEnabled();
          }}
        >
          {folderTabsOrder.map((folderNameOrNull, i) =>
            folderNameOrNull === OGGI_TODAY_KEY ? (
              <TouchableOpacity
                key="oggi"
                style={styles.folderRow}
                onPress={() => setActiveFolder(OGGI_TODAY_KEY)}
              >
                <Text style={[styles.folderLabel, activeFolder === OGGI_TODAY_KEY && styles.folderLabelActive]}>Oggi</Text>
              </TouchableOpacity>
            ) : folderNameOrNull === null ? (
              <TouchableOpacity
                key="tutte"
                style={styles.folderRow}
                onPress={() => setActiveFolder(null)}
              >
                <Ionicons name="folder-open-outline" size={18} color={activeFolder === null ? THEME.text : THEME.textMuted} />
                <Text style={[styles.folderLabel, activeFolder === null && styles.folderLabelActive]}>Tutte</Text>
              </TouchableOpacity>
            ) : (() => {
              const f = folders.find(fd => (fd.name ?? '').trim() === folderNameOrNull);
              if (!f) return null;
              return (
                <TouchableOpacity
                  key={typeof f.id === 'string' ? f.id : `folder-${i}-${f.name}`}
                  style={styles.folderRow}
                  onPress={() => setActiveFolder(f.name)}
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

          <TouchableOpacity style={styles.folderAddBtn} onPress={handleAddFolder}>
            <Ionicons name="add" size={18} color={THEME.textMuted} />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {habits.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Nessuna task ancora… Tocca + per aggiungere la tua prima task</Text>
        </View>
      ) : (
        <View style={styles.listWrap}>
          <DraggableFlatList<SectionItem>
            data={listData}
            keyExtractor={(item) =>
              item.type === 'folderBlock' ? `folder-${item.folderId}` :
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
              const item = listData[index];
              if (item?.type === 'task' && item.habit.id === multiDragAnchorId && multiDragHabits.length > 1) {
                return { size: multiDragHabits.length * 83 };
              }
              return null;
            }}
            onDragBegin={(idx) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              lastPlaceholderIndexRef.current = idx;
              isDraggingRef.current = true;
              setIsDraggingFolder(listData[idx]?.type === 'folderBlock');
              dragInteractionHandleRef.current = InteractionManager.createInteractionHandle();
              isMergeHoverSV.value = false;
              dragDirectionSV.value = 0;
              isPostDragRef.current = false;
              lastMergeHoverTimeRef.current = 0;
              mergeDirectionRef.current = 0;
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
              const wasMergeHoverRecently = (Date.now() - lastMergeHoverTimeRef.current) < 500;
              isMergeHoverAtReleaseRef.current = isMergeHoverSV.value || wasMergeHoverRecently;
              dragDirectionAtReleaseRef.current =
                mergeDirectionRef.current !== 0 ? mergeDirectionRef.current : dragDirectionSV.value;
            }}
            onDragEnd={(params) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              lastPlaceholderIndexRef.current = null;
              isDraggingRef.current = false;
              setIsDraggingFolder(false);
              // Release the interaction handle so any pending reset() can fire
              // now that the drag is over.
              if (dragInteractionHandleRef.current !== null) {
                InteractionManager.clearInteractionHandle(dragInteractionHandleRef.current);
                dragInteractionHandleRef.current = null;
              }
              handleSectionedDragEnd(params);
            }}
          />
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
        <Link href={{ pathname: '/modal', params: { type: 'new', folder: (activeFolder && activeFolder !== OGGI_TODAY_KEY && activeFolder !== TUTTE_KEY) ? activeFolder : undefined } }} asChild>
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
    </SafeAreaView>
  );
}
