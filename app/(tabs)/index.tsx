import { HabitItem } from '@/components/HabitItem';
import { THEME } from '@/constants/theme';
import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import Animated, { runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { SafeAreaView } from 'react-native-safe-area-context';

const TZ = 'Europe/Zurich';

const FOLDER_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#ec4899', '#9ca3af'];

const FOLDER_ICONS: { name: string; label: string }[] = [
  { name: 'folder-outline', label: 'Cartella' },
  { name: 'folder-open-outline', label: 'Aperta' },
  { name: 'document-text-outline', label: 'Documento' },
  { name: 'bookmark-outline', label: 'Segnalibro' },
  { name: 'star-outline', label: 'Stella' },
  { name: 'heart-outline', label: 'Cuore' },
  { name: 'flag-outline', label: 'Bandiera' },
  { name: 'briefcase-outline', label: 'Valigetta' },
  { name: 'archive-outline', label: 'Archivio' },
];

type FolderItem = { id: string; name: string; color: string; icon?: string };

type SectionItem =
  | { type: 'folder'; folderName: string | null; folderId: string }
  | { type: 'task'; habit: Habit };

function FolderRowCancelTranslate({
  hoverAnim,
  children,
}: {
  hoverAnim: { value: number };
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -hoverAnim.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

function TaskRowFollowFolderDrag({
  cellIndex,
  animVals,
  children,
}: {
  cellIndex: number;
  animVals: {
    activeIndexAnim: { value: number };
    spacerIndexAnim: { value: number };
    activeCellSize: { value: number };
    hoverAnim: { value: number };
  } | null;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => {
    if (!animVals || cellIndex < 0) return { transform: [{ translateY: 0 }] };
    const activeIdx = animVals.activeIndexAnim.value;
    const spacer = animVals.spacerIndexAnim.value;
    const size = animVals.activeCellSize.value;
    const hover = animVals.hoverAnim.value;
    if (activeIdx < 0) return { transform: [{ translateY: 0 }] };
    const isAfterActive = cellIndex > activeIdx;
    const isBeforeActive = cellIndex < activeIdx;
    const shouldTranslate = isAfterActive
      ? cellIndex <= spacer
      : isBeforeActive
        ? cellIndex >= spacer
        : false;
    const libraryTranslate = shouldTranslate ? (isAfterActive ? -size : size) : 0;
    return { transform: [{ translateY: hover - libraryTranslate }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

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

export default function IndexScreen() {
  const router = useRouter();
  const { activeTheme } = useAppTheme();
  const { habits, history, getDay, toggleDone, removeHabit, updateHabit, addHabit, reorder, updateHabitsOrder, updateHabitFolder, resetToday, dayResetTime, setDayResetTime } = useHabits();
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [closingMenuId, setClosingMenuId] = useState<string | null>(null);
  type SortModeType = 'creation' | 'alphabetical' | 'custom' | 'time' | 'color' | 'folder';
  const [sortMode, setSortMode] = useState<SortModeType>('creation');
  const [sortModeByFolder, setSortModeByFolder] = useState<Record<string, SortModeType>>({});
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[3]);
  const [newFolderIcon, setNewFolderIcon] = useState(FOLDER_ICONS[0].name);
  const [foldersScrollEnabled, setFoldersScrollEnabled] = useState(false);
  const foldersContainerWidthRef = useRef(0);
  const foldersContentWidthRef = useRef(0);
  const dragEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDisplayRef = useRef<SectionItem[] | null>(null);
  const [draggingFolderIndex, setDraggingFolderIndex] = useState<number | null>(null);
  const overlayY = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const dragCounter = useSharedValue(0);
  const isDraggingFolder = useSharedValue(0);
  const [overlayPositionReady, setOverlayPositionReady] = useState(false);
  const [animVals, setAnimVals] = useState<unknown>(null);
  const [displayList, setDisplayList] = useState<SectionItem[] | null>(null);
  const today = getDay(new Date());

  const sectionedListOrderKey = useCallback((list: SectionItem[]) => {
    return list.map(i => i.type === 'folder' ? `f-${i.folderId}` : `t-${i.habit.id}`).join(',');
  }, []);

  const updateFoldersScrollEnabled = useCallback(() => {
    const cw = foldersContentWidthRef.current;
    const tw = foldersContainerWidthRef.current;
    setFoldersScrollEnabled(tw > 0 && cw > tw);
  }, []);

  useEffect(() => {
    return () => {
      if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('tasks_custom_folders_v2').then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const migrated = parsed.map((f: unknown) => {
              if (typeof f === 'string') return { id: f + Date.now(), name: f, color: '#3b82f6', icon: 'folder-outline' } as FolderItem;
              if (f && typeof f === 'object' && 'name' in f) return { id: (f as FolderItem).id ?? (f as FolderItem).name, name: (f as FolderItem).name, color: (f as FolderItem).color ?? '#3b82f6', icon: (f as FolderItem).icon ?? 'folder-outline' } as FolderItem;
              return null;
            }).filter(Boolean) as FolderItem[];
            setFolders(migrated);
          }
        } catch {}
      } else {
        AsyncStorage.getItem('tasks_custom_folders_v1').then((legacy) => {
          if (legacy) {
            try {
              const parsed = JSON.parse(legacy);
              if (Array.isArray(parsed)) {
                const migrated = parsed.map((name: string) => ({ id: name + Date.now(), name, color: '#3b82f6', icon: 'folder-outline' } as FolderItem));
                setFolders(migrated);
                AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(migrated)).catch(() => {});
              }
            } catch {}
          }
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const addFolderAndPersist = useCallback((newFolder: FolderItem) => {
    setFolders(prev => {
      const next = [...prev, newFolder];
      AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const handleAddFolder = useCallback(() => {
    setNewFolderName('');
    setNewFolderColor(FOLDER_COLORS[3]);
    setNewFolderIcon(FOLDER_ICONS[0].name);
    setCreateFolderVisible(true);
  }, []);

  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) return;
    const newFolder: FolderItem = { id: name + Date.now(), name, color: newFolderColor, icon: newFolderIcon };
    addFolderAndPersist(newFolder);
    setActiveFolder(name);
    setCreateFolderVisible(false);
  }, [newFolderName, newFolderColor, newFolderIcon, addFolderAndPersist]);

  const handleLongPressFolder = useCallback((folderName: string) => {
    Alert.alert(
      'Elimina Cartella',
      `Vuoi eliminare la cartella "${folderName}"? (Le task al suo interno non verranno cancellate, torneranno in "Tutte")`,
      [
        { text: 'Annulla', style: 'cancel' },
        { 
          text: 'Elimina', 
          style: 'destructive',
          onPress: () => {
            setFolders(prev => {
              const next = prev.filter(f => f.name !== folderName);
              AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => {});
              return next;
            });
            setSortModeByFolder(prev => {
              const next = { ...prev };
              delete next[folderName.trim()];
              return next;
            });
            if (activeFolder === folderName) {
              setActiveFolder(null);
            }
          }
        }
      ]
    );
  }, [activeFolder]);

  useEffect(() => {
    AsyncStorage.getItem('tasks_sort_mode_v1').then((mode) => {
      if (['alphabetical', 'creation', 'custom', 'time', 'color', 'folder'].includes(mode ?? '')) {
        setSortMode(mode as SortModeType);
      }
    }).catch(() => {});
    AsyncStorage.getItem('tasks_sort_mode_per_folder_v1').then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data) as Record<string, string>;
          if (parsed && typeof parsed === 'object') {
            const valid: Record<string, SortModeType> = {};
            const modes: SortModeType[] = ['alphabetical', 'creation', 'custom', 'time', 'color', 'folder'];
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === 'string' && modes.includes(v)) valid[k] = v as SortModeType;
            }
            setSortModeByFolder(valid);
          }
        } catch {}
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('tasks_sort_mode_v1', sortMode).catch(() => {});
  }, [sortMode]);
  useEffect(() => {
    AsyncStorage.setItem('tasks_sort_mode_per_folder_v1', JSON.stringify(sortModeByFolder)).catch(() => {});
  }, [sortModeByFolder]);

  const stats = useMemo(() => {
    const total = habits.length;
    const completed = history[today]?.completedByHabitId ?? {};
    const done = Object.values(completed).filter(Boolean).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [habits, history, today]);

  // Reset closing menu state after a short delay
  useEffect(() => {
    if (closingMenuId) {
      const timer = setTimeout(() => {
        setClosingMenuId(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [closingMenuId]);

  // Close all menus when screen comes into focus (e.g., returning from modal)
  useFocusEffect(
    useCallback(() => {
      // Set a flag to close all menus when returning to this screen
      setClosingMenuId('all');
      const timer = setTimeout(() => {
        setClosingMenuId(null);
      }, 50);
      return () => clearTimeout(timer);
    }, [])
  );

  const handleRename = useCallback((h: Habit) => {
    setClosingMenuId(h.id);
    router.push({ pathname: '/modal', params: { type: 'rename', id: h.id } });
  }, [router]);
  const handleSchedule = useCallback((h: Habit) => {
    setClosingMenuId(h.id);
    router.push({ pathname: '/modal', params: { type: 'edit', id: h.id } });
  }, [router]);
  const handleColor = useCallback((h: Habit) => {
    setClosingMenuId(h.id);
    router.push({ pathname: '/modal', params: { type: 'edit', id: h.id } });
  }, [router]);

  const handleMoveToFolder = useCallback((habit: Habit) => {
    const options = [
      { text: 'Tutte (nessuna cartella)', onPress: () => { updateHabitFolder(habit.id, undefined); setClosingMenuId(habit.id); } },
      ...folders.map(f => ({ text: f.name, onPress: () => { updateHabitFolder(habit.id, f.name); setClosingMenuId(habit.id); } })),
      { text: 'Annulla', style: 'cancel' as const }
    ];
    Alert.alert('Sposta in cartella', `Dove vuoi spostare "${habit.text}"?`, options);
  }, [folders, updateHabitFolder]);

  const effectiveSortMode: SortModeType =
    activeFolder === null ? sortMode : (sortModeByFolder[activeFolder.trim()] ?? 'creation');

  const sortHabitsWithMode = useCallback((list: Habit[], mode: SortModeType) => {
    if (mode === 'alphabetical') {
      return [...list].sort((a, b) => a.text.localeCompare(b.text));
    }
    if (mode === 'custom') {
      return [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    }
    if (mode === 'color') {
      const hexToHue = (hex: string): number => {
        const h = hex.replace(/^#/, '');
        if (h.length !== 6 && h.length !== 3) return 400;
        const r = parseInt(h.length === 3 ? h[0] + h[0] : h.slice(0, 2), 16) / 255;
        const g = parseInt(h.length === 3 ? h[1] + h[1] : h.slice(2, 4), 16) / 255;
        const b = parseInt(h.length === 3 ? h[2] + h[2] : h.slice(4, 6), 16) / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const l = (max + min) / 2;
        if (max === min) return 400;
        const d = max - min;
        const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (s < 0.15) return 400;
        let hue = 0;
        if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        else if (max === g) hue = ((b - r) / d + 2) / 6;
        else hue = ((r - g) / d + 4) / 6;
        return hue * 360;
      };
      return [...list].sort((a, b) => {
        const hueA = hexToHue(a.color ?? '#4A148C');
        const hueB = hexToHue(b.color ?? '#4A148C');
        const diff = hueA - hueB;
        return diff !== 0 ? diff : (a.order ?? 0) - (b.order ?? 0);
      });
    }
    if (mode === 'time') {
      const getStartTime = (h: Habit) => {
        const override = h.timeOverrides?.[today];
        const isAllDayMarker = override === '00:00';
        if (isAllDayMarker || h.isAllDay) return -1;
        const overrideStart = !isAllDayMarker && typeof override === 'string' ? override : (!isAllDayMarker ? override?.start : undefined);
        if (overrideStart) {
          const [hh, mm] = overrideStart.split(':').map(Number);
          return hh * 60 + mm;
        }
        const dateObj = new Date();
        const weekday = dateObj.getDay();
        const dayOfMonth = dateObj.getDate();
        const weekly = h.schedule?.weeklyTimes?.[weekday] ?? null;
        const monthlyT = h.schedule?.monthlyTimes?.[dayOfMonth] ?? null;
        const start = weekly?.start ?? monthlyT?.start ?? (h.schedule?.time ?? null);
        if (!start) return -1;
        const [hh, mm] = start.split(':').map(Number);
        return hh * 60 + mm;
      };
      return [...list].sort((a, b) => getStartTime(a) - getStartTime(b));
    }
    if (mode === 'folder') {
      return [...list].sort((a, b) => {
        const fa = a.folder ?? '';
        const fb = b.folder ?? '';
        const cmp = fa.localeCompare(fb);
        return cmp !== 0 ? cmp : (a.order ?? 0) - (b.order ?? 0);
      });
    }
    return list;
  }, [today]);

  const sortHabitsList = useCallback(
    (list: Habit[]) => sortHabitsWithMode(list, effectiveSortMode),
    [sortHabitsWithMode, effectiveSortMode]
  );

  const sortedHabits = useMemo(() => {
    let list = [...habits];
    if (activeFolder) {
      const target = activeFolder.trim();
      list = list.filter(h => (h.folder ?? '').trim() === target);
    }
    return sortHabitsList(list);
  }, [habits, sortMode, today, activeFolder, sortHabitsList]);

  const sectionedList = useMemo((): SectionItem[] => {
    if (activeFolder !== null) {
      return sortedHabits.map(h => ({ type: 'task' as const, habit: h }));
    }
    if (sortMode !== 'folder') {
      return sortedHabits.map(h => ({ type: 'task' as const, habit: h }));
    }
    const byFolder = new Map<string | null, Habit[]>();
    for (const h of habits) {
      const f = (h.folder ?? '').trim() || null;
      if (!byFolder.has(f)) byFolder.set(f, []);
      byFolder.get(f)!.push(h);
    }
    const sectionOrder: (string | null)[] = [null];
    for (const f of folders) {
      const name = (f.name ?? '').trim();
      if (name && byFolder.has(name)) sectionOrder.push(name);
    }
    const out: SectionItem[] = [];
    for (const folderName of sectionOrder) {
      const tasks = byFolder.get(folderName);
      if (!tasks || tasks.length === 0) continue;
      const folderSortMode: SortModeType =
        folderName === null ? 'creation' : (sortModeByFolder[folderName] ?? 'creation');
      const sorted = sortHabitsWithMode(tasks, folderSortMode);
      const folderId = folderName === null ? 'null' : folders.find(f => (f.name ?? '').trim() === folderName)?.id ?? folderName;
      out.push({ type: 'folder', folderName, folderId });
      for (const h of sorted) out.push({ type: 'task', habit: h });
    }
    return out;
  }, [habits, folders, activeFolder, sortMode, sortModeByFolder, sortedHabits, sortHabitsWithMode]);

  useEffect(() => {
    if (displayList === null) {
      setDisplayList(sectionedList);
      return;
    }
    if (sectionedListOrderKey(sectionedList) !== sectionedListOrderKey(displayList)) {
      pendingDisplayRef.current = null;
      setDisplayList(sectionedList);
    }
  }, [sectionedList, displayList, sectionedListOrderKey]);

  const completedByHabitId = useMemo(
    () => history[today]?.completedByHabitId ?? {},
    [history, today]
  );

  const renderSectionItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<SectionItem>) => {
    if (item.type === 'folder') {
      const folderMeta = folders.find(f => (f.name ?? '').trim() === (item.folderName ?? '').trim());
      const folderColor = folderMeta?.color ?? THEME.textMuted;
      const label = item.folderName ?? 'Tutte';
      const hoverAnim = animVals && (animVals as { hoverAnim: { value: number } }).hoverAnim;
      const inner = (
        <View style={[styles.folderSeparator, isActive && overlayPositionReady && styles.folderRowInvisible]}>
          <TouchableOpacity
            onLongPress={drag}
            disabled={isActive}
            activeOpacity={0.9}
            delayLongPress={200}
          >
            <Text style={[styles.folderSeparatorText, { color: folderColor }]}>{label}</Text>
          </TouchableOpacity>
        </View>
      );
      const folderRow = (
        <ScaleDecorator activeScale={1}>
          {isActive && hoverAnim ? (
            <FolderRowCancelTranslate hoverAnim={hoverAnim}>{inner}</FolderRowCancelTranslate>
          ) : (
            inner
          )}
        </ScaleDecorator>
      );
      return folderRow;
    }
    const idx = getIndex?.();
    const isInDraggedSection =
      draggingFolderIndex != null &&
      overlayPositionReady &&
      idx !== undefined &&
      idx > draggingFolderIndex &&
      (() => {
        const nextFolder = sectionedList.findIndex((it, i) => i > draggingFolderIndex && it.type === 'folder');
        const end = nextFolder < 0 ? sectionedList.length : nextFolder;
        return idx < end;
      })();
    const isInDraggedSectionForCancel =
      draggingFolderIndex != null &&
      idx !== undefined &&
      idx > draggingFolderIndex &&
      (() => {
        const nextFolder = sectionedList.findIndex((it, i) => i > draggingFolderIndex && it.type === 'folder');
        const end = nextFolder < 0 ? sectionedList.length : nextFolder;
        return idx < end;
      })();
    const taskVals = animVals
      ? (animVals as { activeIndexAnim: { value: number }; spacerIndexAnim: { value: number }; activeCellSize: { value: number }; hoverAnim: { value: number } })
      : null;
    const taskRow = (
      <ScaleDecorator>
        <TouchableOpacity
          onLongPress={drag}
          disabled={isActive}
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
          />
        </TouchableOpacity>
      </ScaleDecorator>
    );
    const wrapped =
      isInDraggedSectionForCancel && taskVals ? (
        <TaskRowFollowFolderDrag cellIndex={idx ?? -1} animVals={taskVals}>
          {taskRow}
        </TaskRowFollowFolderDrag>
      ) : (
        taskRow
      );
    return isInDraggedSection ? <View style={styles.sectionRowInvisible}>{wrapped}</View> : wrapped;
  }, [completedByHabitId, handleSchedule, closingMenuId, activeFolder, folders, handleMoveToFolder, draggingFolderIndex, sectionedList, overlayPositionReady, animVals]);

  const commitDragEnd = useCallback(() => {
    isDraggingFolder.value = 0;
    setDraggingFolderIndex(null);
    setOverlayPositionReady(false);
  }, [isDraggingFolder]);

  const folderIndicesArray = useMemo(
    () => sectionedList.map((item, i) => (item.type === 'folder' ? i : -1)).filter((i) => i >= 0),
    [sectionedList]
  );
  const folderIndicesSV = useSharedValue<number[]>([]);
  useEffect(() => {
    folderIndicesSV.value = folderIndicesArray;
  }, [folderIndicesArray, folderIndicesSV]);

  const handleSectionedDragEnd = useCallback(({ data, from, to }: { data: SectionItem[]; from: number; to: number }) => {
    let finalData = data;
    const draggedItem = data[to];
    if (draggedItem?.type === 'folder') {
      const folderName = draggedItem.folderName;
      let blockLen = 1;
      while (to + blockLen < data.length && data[to + blockLen].type === 'task') {
        const h = data[to + blockLen].habit;
        const taskFolder = (h.folder ?? '').trim() || null;
        if (taskFolder !== (folderName ?? null)) break;
        blockLen++;
      }
      const block = data.slice(to, to + blockLen);
      const validFolderIndices = data
        .map((item, i) => (item.type === 'folder' ? i : -1))
        .filter((i) => i >= 0);
      const snappedTo = validFolderIndices.length === 0
        ? 0
        : validFolderIndices.reduce((best, idx) =>
            Math.abs(idx - to) < Math.abs(best - to) ? idx : best
          , validFolderIndices[0]);
      const remaining = [...data.slice(0, to), ...data.slice(to + blockLen)];
      const insertIndex = snappedTo <= to ? snappedTo : snappedTo - blockLen;
      const insertIdx = Math.max(0, Math.min(insertIndex, remaining.length));
      finalData = [...remaining.slice(0, insertIdx), ...block, ...remaining.slice(insertIdx)];
    }

    const folderItems = finalData.filter((x): x is Extract<SectionItem, { type: 'folder' }> => x.type === 'folder');
    const taskItems = finalData.filter((x): x is Extract<SectionItem, { type: 'task' }> => x.type === 'task');

    pendingDisplayRef.current = finalData;
    setDisplayList(finalData);

    const runUpdates = () => {
      if (from === to) {
        commitDragEnd();
        return;
      }
      const applyUpdates = () => {
        if (folderItems.length === 0) {
          updateHabitsOrder(taskItems.map(t => t.habit));
          if (activeFolder != null) {
            setSortModeByFolder(prev => ({ ...prev, [activeFolder.trim()]: 'custom' }));
          } else {
            setSortMode('custom');
          }
        } else {
          const folderOrder = folderItems.map(f => f.folderName);
          const newFoldersOrder = folderOrder.filter((n): n is string => n !== null);
          const byFolder = new Map<string | null, Habit[]>();
          for (const { habit } of taskItems) {
            const f = (habit.folder ?? '').trim() || null;
            if (!byFolder.has(f)) byFolder.set(f, []);
            byFolder.get(f)!.push(habit);
          }
          const orderedHabits: Habit[] = [];
          for (const fi of folderItems) {
            const tasks = byFolder.get(fi.folderName) ?? [];
            for (const h of tasks) orderedHabits.push(h);
          }
          updateHabitsOrder(orderedHabits);
          if (draggedItem?.type === 'task') {
            const srcFolder = (draggedItem.habit.folder ?? '').trim() || null;
            if (srcFolder) setSortModeByFolder(prev => ({ ...prev, [srcFolder]: 'custom' }));
            const toFolder = (() => {
              let idx = 0;
              for (const fi of folderItems) {
                const count = 1 + (byFolder.get(fi.folderName) ?? []).length;
                if (to < idx + count) return fi.folderName?.trim() ?? null;
                idx += count;
              }
              return null;
            })();
            if (toFolder != null && toFolder !== srcFolder) setSortModeByFolder(prev => ({ ...prev, [toFolder]: 'custom' }));
          }
          if (newFoldersOrder.length > 0) {
            setFolders(prev => {
              const orderMap = new Map(newFoldersOrder.map((n, i) => [n, i]));
              const next = [...prev].sort((a, b) => {
                const ia = orderMap.get((a.name ?? '').trim()) ?? 999;
                const ib = orderMap.get((b.name ?? '').trim()) ?? 999;
                return ia - ib;
              });
              AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => {});
              return next;
            });
          }
        }
        commitDragEnd();
      };
      startTransition(applyUpdates);
    };

    if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
    const PERSIST_DELAY_MS = 800;
    dragEndTimeoutRef.current = setTimeout(runUpdates, PERSIST_DELAY_MS);
  }, [updateHabitsOrder, commitDragEnd, activeFolder]);

  const setOverlayReady = useCallback(() => setOverlayPositionReady(true), []);

  useAnimatedReaction(
    () => {
      'worklet';
      const v = animVals as {
        activeCellOffset: { value: number };
        scrollOffset: { value: number };
        hoverAnim: { value: number };
        activeIndexAnim: { value: number };
        spacerIndexAnim: { value: number };
      } | null;
      if (!v) return { y: 0, active: -1, dragId: 0 };
      if (isDraggingFolder.value === 1) {
        const indices = folderIndicesSV.value;
        if (indices.length > 0) {
          const nearest = indices.reduce(
            (best, idx) =>
              Math.abs(idx - v.spacerIndexAnim.value) < Math.abs(best - v.spacerIndexAnim.value) ? idx : best,
            indices[0]
          );
          if (nearest !== v.spacerIndexAnim.value) v.spacerIndexAnim.value = nearest;
        }
      }
      const y = v.activeCellOffset.value - v.scrollOffset.value + v.hoverAnim.value;
      return { y, active: v.activeIndexAnim.value, dragId: dragCounter.value };
    },
    (current) => {
      if (current.active >= 0) {
        overlayY.value = current.y;
        overlayOpacity.value = withTiming(1, { duration: 150 });
        runOnJS(setOverlayReady)();
      }
    },
    [animVals, setOverlayReady, overlayY, overlayOpacity, dragCounter, isDraggingFolder, folderIndicesSV]
  );

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    top: overlayY.value,
    opacity: overlayOpacity.value,
  }));

  const draggingSectionItems = useMemo(() => {
    if (draggingFolderIndex == null || activeFolder !== null) return [];
    const items: SectionItem[] = [];
    for (let i = draggingFolderIndex; i < sectionedList.length; i++) {
      const it = sectionedList[i];
      if (it.type === 'folder' && i > draggingFolderIndex) break;
      items.push(it);
    }
    return items;
  }, [draggingFolderIndex, sectionedList, activeFolder]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {activeTheme !== 'futuristic' && (
        <View style={styles.header}>
          <Text style={styles.title}>Tasks</Text>
        </View>
      )}

      <View style={[styles.progressSection, activeTheme === 'futuristic' && { marginTop: 55 }]}>
        <Text style={styles.progressText}>{stats.pct}%</Text>
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
            <TouchableOpacity onPress={() => {
              const folderNameNow = activeFolder?.trim() ?? null;
              const inFolder = folderNameNow !== null;
              const current: SortModeType = inFolder
                ? (sortModeByFolder[folderNameNow] ?? 'creation')
                : sortMode;
              const setCurrent = (mode: SortModeType) => {
                if (inFolder && folderNameNow) {
                  setSortModeByFolder(prev => ({ ...prev, [folderNameNow]: mode }));
                } else {
                  setSortMode(mode);
                }
              };
              const sel = (label: string, mode: SortModeType) =>
                current === mode ? `${label} ✓` : label;
              const labels: Record<SortModeType, string> = {
                creation: 'Data di creazione',
                time: 'Orario',
                color: 'Ordine per colore',
                folder: 'Ordine per cartelle',
                alphabetical: 'Ordine alfabetico',
                custom: 'Ordine libero (Trascina)',
              };
              Alert.alert(
                inFolder ? 'Ordina task (in questa cartella)' : 'Ordina task',
                `Ordine attuale: ${labels[current] ?? current}`,
                [
                  { text: 'Annulla', style: 'cancel' },
                  { text: sel('Data di creazione', 'creation'), onPress: () => setCurrent('creation') },
                  { text: sel('Orario', 'time'), onPress: () => setCurrent('time') },
                  { text: sel('Ordine per colore', 'color'), onPress: () => setCurrent('color') },
                  { text: sel('Ordine per cartelle', 'folder'), onPress: () => setCurrent('folder') },
                  { text: sel('Ordine alfabetico', 'alphabetical'), onPress: () => setCurrent('alphabetical') },
                  { text: sel('Ordine libero (Trascina)', 'custom'), onPress: () => setCurrent('custom') },
                ]
              );
            }} style={[
              styles.progressBtn,
              activeTheme === 'futuristic' && {
                borderRadius: 0,
                transform: [{ skewX: '-30deg' }]
              }
            ]}>
              <Ionicons name="swap-vertical-outline" size={16} color={THEME.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              Alert.alert(
                'Azzera le task di oggi?',
                'Vuoi segnare tutte le task come non completate per oggi?',
                [
                  { text: 'Annulla', style: 'cancel' },
                  { text: 'Conferma', style: 'destructive', onPress: resetToday }
                ]
              );
            }} style={[
              styles.progressBtn,
              activeTheme === 'futuristic' && {
                borderRadius: 0,
                transform: [{ skewX: '-30deg' }]
              }
            ]}>
              <Ionicons name="refresh-outline" size={16} color={THEME.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              const currentHour = parseInt(dayResetTime.split(':')[0]);
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
            }} style={[
              styles.progressBtn,
              activeTheme === 'futuristic' && {
                borderRadius: 0,
                transform: [{ skewX: '-30deg' }]
              }
            ]}>
              <Ionicons name="time-outline" size={16} color={THEME.textMuted} />
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
          <TouchableOpacity 
            style={styles.folderRow}
            onPress={() => setActiveFolder(null)}
          >
            <Ionicons name="folder-open-outline" size={18} color={activeFolder === null ? THEME.text : THEME.textMuted} />
            <Text style={[styles.folderLabel, activeFolder === null && styles.folderLabelActive]}>Tutte</Text>
          </TouchableOpacity>
          
          {folders.map(f => (
            <TouchableOpacity 
              key={f.id}
              style={styles.folderRow}
              onPress={() => setActiveFolder(f.name)}
              onLongPress={() => handleLongPressFolder(f.name)}
              delayLongPress={200}
            >
              <Ionicons name={(f.icon ?? 'folder-outline') as any} size={18} color={activeFolder === f.name ? f.color : THEME.textMuted} />
              <Text style={[styles.folderLabel, activeFolder === f.name && { color: f.color }]}>
                {f.name}
              </Text>
            </TouchableOpacity>
          ))}
          
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
            data={pendingDisplayRef.current ?? displayList ?? sectionedList}
            keyExtractor={(item) => item.type === 'folder' ? `folder-${item.folderId}` : `task-${item.habit.id}`}
            renderItem={renderSectionItem}
            contentContainerStyle={[styles.listContainer, activeTheme === 'futuristic' && { paddingHorizontal: -16 }]}
            style={[activeTheme === 'futuristic' && { marginHorizontal: -16 }]}
            containerStyle={styles.dragListContainer}
            showsVerticalScrollIndicator={false}
            dragItemOverflow
            onAnimValInit={(v) => setAnimVals(v)}
            onDragBegin={(index) => {
              if (sectionedList[index]?.type === 'folder') {
                isDraggingFolder.value = 1;
                setOverlayPositionReady(false);
                setDraggingFolderIndex(index);
                dragCounter.value = dragCounter.value + 1;
                overlayOpacity.value = 0;
              }
            }}
            onDragEnd={handleSectionedDragEnd}
          />
          {draggingFolderIndex != null && overlayPositionReady && draggingSectionItems.length > 0 && (
            <Animated.View style={[styles.dragOverlay, overlayAnimatedStyle]} pointerEvents="none">
              {draggingSectionItems.map((it, i) =>
                it.type === 'folder' ? (
                  <View key={`folder-${it.folderId}`} style={styles.folderSeparator}>
                    <Text style={[styles.folderSeparatorText, styles.dragOverlayFolderTitle, { color: folders.find(f => (f.name ?? '').trim() === (it.folderName ?? '').trim())?.color ?? THEME.textMuted }]}>
                      {it.folderName ?? 'Tutte'}
                    </Text>
                  </View>
                ) : (
                  <View key={`task-${it.habit.id}`} style={styles.dragOverlayTask}>
                    <HabitItem
                      habit={it.habit}
                      index={0}
                      isDone={Boolean(completedByHabitId[it.habit.id])}
                      onRename={handleSchedule}
                      onSchedule={handleSchedule}
                      onColor={handleSchedule}
                      shouldCloseMenu
                      onMoveToFolder={undefined}
                    />
                  </View>
                )
              )}
            </Animated.View>
          )}
        </View>
      )}

      <Link href={{ pathname: '/modal', params: { type: 'new', folder: activeFolder ?? undefined } }} asChild>
        <TouchableOpacity accessibilityRole="button" style={styles.fab}>
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      </Link>

      <Modal visible={createFolderVisible} transparent animationType="fade">
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setCreateFolderVisible(false)}
        >
          <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
            style={styles.modalCenter}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={styles.createFolderCard}>
                <Text style={styles.createFolderTitle}>Nuova cartella</Text>
                
                <Text style={styles.createFolderLabel}>Nome</Text>
                <TextInput
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  placeholder="Es. Lavoro, Sport..."
                  placeholderTextColor="#6b7280"
                  style={styles.createFolderInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                
                <Text style={styles.createFolderLabel}>Colore</Text>
                <View style={styles.createFolderRow}>
                  {FOLDER_COLORS.map(c => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setNewFolderColor(c)}
                      style={[
                        styles.colorSwatch,
                        { backgroundColor: c },
                        newFolderColor === c && styles.colorSwatchSelected
                      ]}
                    />
                  ))}
                </View>
                
                <Text style={styles.createFolderLabel}>Icona</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.iconRow}>
                  {FOLDER_ICONS.map(i => (
                    <TouchableOpacity
                      key={i.name}
                      onPress={() => setNewFolderIcon(i.name)}
                      style={[
                        styles.iconOption, 
                        newFolderIcon === i.name && [styles.iconOptionSelected, { borderColor: newFolderColor }]
                      ]}
                    >
                      <Ionicons name={i.name as any} size={24} color={newFolderIcon === i.name ? newFolderColor : THEME.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                
                <View style={styles.createFolderActions}>
                  <TouchableOpacity style={styles.createFolderBtnSecondary} onPress={() => setCreateFolderVisible(false)}>
                    <Text style={styles.createFolderBtnSecondaryText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.createFolderBtnPrimary, { backgroundColor: newFolderName.trim() ? newFolderColor : '#4b5563' }]} 
                    onPress={handleCreateFolder}
                    disabled={!newFolderName.trim()}
                  >
                    <Text style={styles.createFolderBtnPrimaryText}>Crea</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { 
    flex: 1, 
    backgroundColor: 'transparent', 
    paddingHorizontal: 16 
  },
  
  header: { 
    marginTop: 8, 
    marginBottom: 15 
  },
  title: { 
    fontSize: 28, 
    fontWeight: '700', 
    color: THEME.text
  },

  progressSection: {
    marginBottom: 8
  },
  progressText: {
    color: THEME.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  progressBarBg: { 
    flex: 1,
    height: 8, 
    borderRadius: 4, 
    backgroundColor: '#374151', 
    overflow: 'hidden' 
  },
  progressBarFill: { 
    height: '100%',
    backgroundColor: '#3b82f6'
  },
  progressActions: {
    flexDirection: 'row',
    gap: 8
  },
  progressBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center'
  },
  
  foldersContainer: {
    marginBottom: 4,
    marginTop: -4,
  },
  foldersScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    gap: 16,
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  folderLabel: {
    color: THEME.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  folderLabelActive: {
    color: THEME.text,
    fontWeight: '600',
  },
  folderAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#1f2937',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  listWrap: {
    flex: 1,
    position: 'relative' as const,
    overflow: 'visible' as const,
  },
  dragListContainer: {
    overflow: 'visible',
  },
  dragOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  dragOverlayTask: {
    marginHorizontal: 0,
  },
  folderRowInvisible: {
    opacity: 0,
  },
  sectionRowInvisible: {
    opacity: 0,
  },
  folderSeparator: {
    paddingVertical: 4,
    paddingTop: 8,
    marginTop: 2,
  },
  folderSeparatorText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dragOverlayFolderTitle: {
    fontSize: 14,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCenter: {
    width: '100%',
    maxWidth: 360,
  },
  createFolderCard: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#374151',
  },
  createFolderTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: THEME.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  createFolderLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.textMuted,
    marginBottom: 8,
    marginTop: 16,
  },
  createFolderInput: {
    backgroundColor: '#111827',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: THEME.text,
    borderWidth: 1,
    borderColor: '#374151',
  },
  createFolderRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSwatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  colorSwatchSelected: {
    borderColor: '#fff',
    transform: [{ scale: 1.1 }],
  },
  iconRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 4,
  },
  iconOption: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconOptionSelected: {
    borderColor: THEME.text,
    backgroundColor: '#374151',
  },
  createFolderActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  createFolderBtnSecondary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#374151',
    alignItems: 'center',
  },
  createFolderBtnSecondaryText: {
    color: THEME.text,
    fontSize: 16,
    fontWeight: '600',
  },
  createFolderBtnPrimary: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  createFolderBtnPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },

  emptyCard: {
    backgroundColor: THEME.surface,
    borderColor: '#1f2937',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20
  },
  emptyText: { 
    color: THEME.textMuted, 
    textAlign: 'center',
    fontSize: 16
  },

  listContainer: { 
    paddingBottom: 100 
  },

  fab: { 
    position: 'absolute', 
    right: 20, 
    bottom: 98, 
    backgroundColor: '#1d4ed8', 
    width: 83, 
    height: 83, 
    borderRadius: 42, 
    alignItems: 'center', 
    justifyContent: 'center', 
    shadowColor: '#1d4ed8', 
    shadowOpacity: 0.6, 
    shadowRadius: 20, 
    shadowOffset: { width: 0, height: 0 },
    elevation: 12
  },

});