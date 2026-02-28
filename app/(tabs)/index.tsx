import { HabitItem } from '@/components/HabitItem';
import { FolderModals } from '@/components/index/FolderModals';
import { styles } from '@/components/index/indexStyles';
import { THEME } from '@/constants/theme';
import { OGGI_TODAY_KEY, SectionItem, TUTTE_KEY } from '@/lib/index/indexTypes';
import { useIndexLogic } from '@/lib/index/useIndexLogic';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, LayoutAnimation, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { FadeInDown, SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const MergeIcon = ({ isActive, isMergeHoverSV }: { isActive: boolean; isMergeHoverSV: SharedValue<boolean> }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const isVisible = isActive && isMergeHoverSV.value;
    return {
      opacity: withTiming(isVisible ? 1 : 0, { duration: 150 }),
      transform: [{ scale: withTiming(isVisible ? 1 : 0.5, { duration: 150 }) }]
    };
  });

  return (
    <Animated.View style={[styles.mergePlusIcon, animatedStyle]}>
      <Ionicons name="add" size={24} color={THEME.success} />
    </Animated.View>
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
    setAnimVals,
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
    toggleFolderCollapsed,
    updateFoldersScrollEnabled,
    handleSectionedDragEnd,
    preDragSnapshotRef,
    isPostDragRef,
    resetStorage,
    collapsedFolderIds,
  } = useIndexLogic();

  const [isDragging, setIsDragging] = useState(false);

  const listData = useMemo(() => {
    const base = isDragging
      ? (preDragSnapshotRef.current ?? displayList ?? sectionedList)
      : (pendingDisplayRef.current ?? displayList ?? sectionedList);
    // Collapse when 2+ selected (not only when dragging) so the list doesn't change mid-drag
    // and the block can be dragged; otherwise changing data in onDragBegin breaks the drag.
    if (!isFolderModeWithSections && selectedIds.size > 1) {
      return buildCollapsedListIfMultiSelect(base, selectedIds);
    }
    return base;
  }, [displayList, sectionedList, isFolderModeWithSections, isDragging, selectedIds, buildCollapsedListIfMultiSelect]);

  const renderSectionItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<SectionItem>) => {
    if (item.type === 'folderBlock') {
      const folderMeta = folders.find(f => (f.name ?? '').trim() === (item.folderName ?? '').trim());
      const folderColor = folderMeta?.color ?? THEME.textMuted;
      const label = typeof item.folderName === 'string' ? item.folderName : 'Tutte';
      const isCollapsed = collapsedFolderIds.has(item.folderId);

      return (
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
                  style={{ flex: 1 }}
                >
                  <Text style={[
                    styles.folderSeparatorText,
                    { color: folderColor },
                    isActive && { transform: [{ scale: 1.35 }], transformOrigin: '0% 50%' }
                  ]}>
                    {label}
                  </Text>
                </TouchableOpacity>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <MergeIcon isActive={isActive} isMergeHoverSV={isMergeHoverSV} />
                  {!isActive && (
                    <TouchableOpacity
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        toggleFolderCollapsed(item.folderId);
                      }}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      activeOpacity={0.7}
                    >
                      <ChevronIcon isCollapsed={isCollapsed} folderColor={folderColor} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
            {/* The Folder Tasks */}
            {!isCollapsed && (
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
            )}
          </View>
        </ScaleDecorator>
      );
    }
    if (item.type === 'multiDragBlock') {
      const rowHeight = 75;
      const gap = 4;
      const blockHeight = item.habits.length * rowHeight + (item.habits.length - 1) * gap;
      return (
        <ScaleDecorator>
          <View style={[styles.multiDragBlockRow, { height: blockHeight }]}>
            {item.habits.map((habit, i) => (
              <TouchableOpacity
                key={habit.id}
                onPress={() => toggleSelect(habit)}
                onLongPress={drag}
                disabled={isActive}
                activeOpacity={0.9}
                delayLongPress={200}
                style={[
                  styles.multiDragBlockCard,
                  { backgroundColor: habit.color ?? '#6b7280' },
                  i === item.habits.length - 1 && styles.multiDragBlockCardLast,
                ]}
              >
                <View style={[styles.multiDragBlockCheck, styles.multiDragBlockCheckSelected]} />
                <Text style={styles.multiDragBlockCardText} numberOfLines={1}>
                  {habit.text}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScaleDecorator>
      );
    }
    if (item.type === 'task') {
      const isMultiDragPlaceholder =
        draggingSelectionCount > 1 && selectedIds.has(item.habit.id);
      if (isMultiDragPlaceholder) {
        return (
          <ScaleDecorator>
            <View style={styles.multiDragPlaceholder} />
          </ScaleDecorator>
        );
      }
      const canDragTask = !isFolderModeWithSections;
      const canStartDrag =
        canDragTask &&
        (!selectionMode || selectedIds.size === 0 || selectedIds.has(item.habit.id));
      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={canStartDrag ? drag : undefined}
            disabled={isActive || !canStartDrag}
            activeOpacity={0.9}
            delayLongPress={200}
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
      );
    }
    return null;
  }, [completedByHabitId, handleSchedule, closingMenuId, activeFolder, sortMode, folders, handleMoveToFolder, handleMenuOpen, handleMenuClose, isFolderModeWithSections, selectionMode, selectedIds, draggingSelectionCount, toggleSelect, isMergeHoverSV, collapsedFolderIds, toggleFolderCollapsed]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {activeTheme !== 'futuristic' && (
        <View style={styles.header}>
          <Text style={styles.title}>Tasks</Text>
          <Text style={styles.progressText}>{stats.pct}%</Text>
        </View>
      )}

      <View style={[styles.progressSection, activeTheme === 'futuristic' && { marginTop: 55 }]}>
        {activeTheme === 'futuristic' && (
          <Text style={styles.progressText}>{stats.pct}%</Text>
        )}
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
                      const inFolder = folderNameNow !== null;
                      const current: typeof sortMode = inFolder
                        ? (sortModeByFolder[folderNameNow] ?? 'creation')
                        : sortMode;
                      const setCurrent = (mode: typeof sortMode) => {
                        if (inFolder && folderNameNow) {
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
                      const isRealFolder = inFolder && folderNameNow !== OGGI_TODAY_KEY;
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
                    key: 'time', icon: 'time-outline' as const, onPress: () => {
                      setOptionsMenuVisible(false);
                      const hours = Array.from({ length: 24 }, (_, i) => i);
                      const hourOptions = hours.map(hour => ({
                        text: `${hour.toString().padStart(2, '0')}:00`,
                        onPress: () => setDayResetTime(`${hour.toString().padStart(2, '0')}:00`)
                      }));
                      Alert.alert(
                        'Imposta orario reset giornaliero',
                        `Attualmente: ${dayResetTime}\n\nA che ora deve iniziare la nuova giornata?`,
                        [
                          { text: 'Annulla', style: 'cancel' },
                          ...hourOptions
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
            extraData={collapsedFolderIds}
            contentContainerStyle={[styles.listContainer, activeTheme === 'futuristic' && { paddingHorizontal: -16 }]}
            style={[activeTheme === 'futuristic' && { marginHorizontal: -16 }]}
            containerStyle={styles.dragListContainer}
            showsVerticalScrollIndicator={false}
            dragItemOverflow
            autoscrollThreshold={0}
            windowSize={60}
            initialNumToRender={12}
            removeClippedSubviews={false}
            animationConfig={{ damping: 20, stiffness: 200 }}
            onAnimValInit={(v) => setAnimVals(v)}
            onDragBegin={(index) => {
              setIsDragging(true);
              isMergeHoverSV.value = false;
              dragDirectionSV.value = 0;
              isPostDragRef.current = false;
              lastMergeHoverTimeRef.current = 0;
              mergeDirectionRef.current = 0;
              const list = displayList ?? sectionedList;
              preDragSnapshotRef.current = [...list];
              recordDragStartSelection(selectedIds);
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
              setIsDragging(false);
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
        handleCreateFolder={handleCreateFolder}
        handleSaveEditFolder={handleSaveEditFolder}
        performDeleteFolder={performDeleteFolder}
      />
    </SafeAreaView>
  );
}
