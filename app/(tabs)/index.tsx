import { HabitItem } from '@/components/HabitItem';
import { THEME } from '@/constants/theme';
import { useHabits } from '@/lib/habits/Provider';
import type { Habit } from '@/lib/habits/schema';
import { useAppTheme } from '@/lib/theme-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import DraggableFlatList, { RenderItemParams, ScaleDecorator } from 'react-native-draggable-flatlist';
import Animated, { SharedValue, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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


type FolderItem = { id: string; name: string; color: string; icon?: string };

type FolderBlockItem = { type: 'folderBlock'; folderName: string | null; folderId: string; tasks: Habit[] };
type TaskItem = { type: 'task'; habit: Habit };
type SectionItem = FolderBlockItem | TaskItem;

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
  const { habits, history, getDay, toggleDone, removeHabit, updateHabit, addHabit, reorder, updateHabitsOrder, updateHabitFolder, setHabits, resetToday, dayResetTime, setDayResetTime } = useHabits();
  const [input, setInput] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [closingMenuId, setClosingMenuId] = useState<string | null>(null);
  type SortModeType = 'creation' | 'alphabetical' | 'custom' | 'time' | 'color' | 'folder';
  const [sortMode, setSortMode] = useState<SortModeType>('creation');
  const [sortModeByFolder, setSortModeByFolder] = useState<Record<string, SortModeType>>({});
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>('__oggi__');
  const [createFolderVisible, setCreateFolderVisible] = useState(false);
  const [editFolderVisible, setEditFolderVisible] = useState(false);
  const [editingFolder, setEditingFolder] = useState<FolderItem | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderColor, setNewFolderColor] = useState(FOLDER_COLORS[3]);
  const [newFolderIcon, setNewFolderIcon] = useState(FOLDER_ICONS[0].name);
  const [foldersScrollEnabled, setFoldersScrollEnabled] = useState(false);
  const foldersContainerWidthRef = useRef(0);
  const foldersContentWidthRef = useRef(0);
  const dragEndTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDisplayRef = useRef<SectionItem[] | null>(null);
  const isPostDragRef = useRef(false);
  const commitDragEndRef = useRef<() => void>(() => { });
  const preDragSnapshotRef = useRef<SectionItem[] | null>(null);
  const isMergeHoverSV = useSharedValue(false);
  const dragDirectionSV = useSharedValue(0); // -1 for up, 1 for down
  const isMergeHoverAtReleaseRef = useRef(false);
  const dragDirectionAtReleaseRef = useRef(0);
  // No more isMergeHoverNode state here - now using useAnimatedStyle in renderItem for zero flutters.
  const [animVals, setAnimVals] = useState<unknown>(null);
  const emptyFoldersIndicesSV = useSharedValue<number[]>([]);

  const [displayList, setDisplayList] = useState<SectionItem[] | null>(null);
  const [sectionOrder, setSectionOrder] = useState<(string | null)[] | null>(null);
  const [fadingOutFolderId, setFadingOutFolderId] = useState<string | null>(null);
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const today = getDay(new Date());

  const prevSectionedListRef = useRef<SectionItem[]>([]);
  const TUTTE_KEY = '__tutte__';
  const OGGI_TODAY_KEY = '__oggi__'; // virtual folder: tasks appearing today only

  const sectionedListOrderKey = useCallback((list: SectionItem[]) => {
    return list.map(i => {
      if (i.type === 'folderBlock') return `f-${i.folderId}-${i.tasks.map(t => `${t.id}:${t.text}:${t.folder ?? ''}`).join('|')}`;
      return `t-${i.habit.id}-${i.habit.text}-${i.habit.folder ?? ''}`;
    }).join(',');
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
            const seen = new Set<string>();
            const migrated = parsed.map((f: unknown, idx: number) => {
              const ensureUniqueId = (base: string) => {
                let id = base;
                while (seen.has(id)) id = `${base}-${idx}-${Date.now()}`;
                seen.add(id);
                return id;
              };
              if (typeof f === 'string') return { id: ensureUniqueId(f + Date.now()), name: f, color: '#3b82f6', icon: 'folder-outline' } as FolderItem;
              if (f && typeof f === 'object' && 'name' in f) {
                const obj = f as { id?: unknown; name?: unknown; color?: string; iconColor?: string; icon?: string };
                const nameVal = obj.name;
                if (typeof nameVal !== 'string' || !nameVal.trim()) return null;
                const rawId = obj.id;
                const id = typeof rawId === 'string' && rawId ? ensureUniqueId(rawId) : ensureUniqueId(`${nameVal}-${Date.now()}-${idx}`);
                const color = typeof obj.color === 'string' ? obj.color : (typeof obj.iconColor === 'string' ? obj.iconColor : '#3b82f6');
                const icon = typeof obj.icon === 'string' ? obj.icon : 'folder-outline';
                return { id, name: nameVal.trim(), color, icon } as FolderItem;
              }
              return null;
            }).filter((f): f is FolderItem => f != null && typeof (f as FolderItem).name === 'string' && (f as FolderItem).name !== '[object Object]') as FolderItem[];
            setFolders(migrated);
            if (migrated.length !== parsed.length) {
              AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(migrated)).catch(() => { });
            }
          }
        } catch { }
      } else {
        AsyncStorage.getItem('tasks_custom_folders_v1').then((legacy) => {
          if (legacy) {
            try {
              const parsed = JSON.parse(legacy);
              if (Array.isArray(parsed)) {
                const migrated = parsed.map((name: string, idx: number) => ({ id: `${name}-${Date.now()}-${idx}`, name, color: '#3b82f6', icon: 'folder-outline' } as FolderItem));
                setFolders(migrated);
                AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(migrated)).catch(() => { });
              }
            } catch { }
          }
        }).catch(() => { });
      }
    }).catch(() => { });
  }, []);

  const addFolderAndPersist = useCallback((newFolder: FolderItem) => {
    setFolders(prev => {
      const next = [...prev, newFolder];
      AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => { });
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
    const newFolder: FolderItem = { id: `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`, name, color: newFolderColor, icon: newFolderIcon };
    addFolderAndPersist(newFolder);
    setActiveFolder(name);
    setCreateFolderVisible(false);
  }, [newFolderName, newFolderColor, newFolderIcon, addFolderAndPersist]);

  const handleSaveEditFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name || !editingFolder) return;
    const oldName = editingFolder.name.trim();
    setFolders(prev => {
      const next = prev.map(f => f.name.trim() === oldName ? { ...f, name, color: newFolderColor, icon: newFolderIcon } : f);
      AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => { });
      return next;
    });
    setSectionOrder(prev => {
      const next = prev ? prev.map(n => (n ?? '').trim() === oldName ? name : n) : null;
      if (next) AsyncStorage.setItem('tasks_section_order_v1', JSON.stringify(next.map(n => n === null ? TUTTE_KEY : n))).catch(() => { });
      return next;
    });
    setSortModeByFolder(prev => {
      const next = { ...prev };
      if (oldName in next) {
        next[name] = next[oldName];
        delete next[oldName];
      }
      return next;
    });
    setHabits(prev => prev.map(h => (h.folder ?? '').trim() === oldName ? { ...h, folder: name } : h));
    if (activeFolder === oldName) setActiveFolder(name);
    setEditFolderVisible(false);
    setEditingFolder(null);
  }, [newFolderName, newFolderColor, newFolderIcon, editingFolder, activeFolder, setHabits]);

  const performDeleteFolder = useCallback((folderName: string) => {
    setFolders(prev => {
      const next = prev.filter(f => f.name !== folderName);
      AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => { });
      return next;
    });
    setSortModeByFolder(prev => {
      const next = { ...prev };
      delete next[folderName.trim()];
      return next;
    });
    setSectionOrder(prev => {
      const next = prev ? prev.filter(n => n !== folderName.trim()) : null;
      if (next) AsyncStorage.setItem('tasks_section_order_v1', JSON.stringify(next.map(n => n === null ? TUTTE_KEY : n))).catch(() => { });
      return next;
    });
    if (activeFolder === folderName) setActiveFolder(null);
  }, [activeFolder]);

  const handleLongPressFolder = useCallback((folder: FolderItem) => {
    setEditingFolder(folder);
    setNewFolderName(folder.name);
    setNewFolderColor(folder.color);
    setNewFolderIcon(folder.icon ?? 'folder-outline');
    setEditFolderVisible(true);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem('tasks_section_order_v1').then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            const order = parsed
              .filter((x: unknown) => typeof x === 'string')
              .map((x: string) => x === TUTTE_KEY ? null : x);
            if (order.length > 0) setSectionOrder(order);
          }
        } catch { }
      }
    }).catch(() => { });
  }, [TUTTE_KEY]);

  useEffect(() => {
    AsyncStorage.getItem('tasks_sort_mode_v1').then((mode) => {
      if (['alphabetical', 'creation', 'custom', 'time', 'color', 'folder'].includes(mode ?? '')) {
        setSortMode(mode as SortModeType);
      }
    }).catch(() => { });
    AsyncStorage.getItem('tasks_sort_mode_per_folder_v1').then((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data) as Record<string, string>;
          if (parsed && typeof parsed === 'object') {
            const valid: Record<string, SortModeType> = {};
            const modes: SortModeType[] = ['alphabetical', 'creation', 'custom', 'time', 'color', 'folder'];
            for (const [k, v] of Object.entries(parsed)) {
              if (typeof v === 'string' && modes.includes(v as SortModeType)) valid[k] = v as SortModeType;
            }
            setSortModeByFolder(valid);
          }
        } catch { }
      }
    }).catch(() => { });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem('tasks_sort_mode_v1', sortMode).catch(() => { });
  }, [sortMode]);
  useEffect(() => {
    AsyncStorage.setItem('tasks_sort_mode_per_folder_v1', JSON.stringify(sortModeByFolder)).catch(() => { });
  }, [sortModeByFolder]);


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
      ...folders.map(f => ({ text: typeof f.name === 'string' ? f.name : String(f.name ?? ''), onPress: () => { updateHabitFolder(habit.id, f.name); setClosingMenuId(habit.id); } })),
      { text: 'Annulla', style: 'cancel' as const }
    ];
    Alert.alert('Sposta in cartella', `Dove vuoi spostare "${habit.text}"?`, options);
  }, [folders, updateHabitFolder]);

  const toggleSelect = useCallback((habit: Habit) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(habit.id)) next.delete(habit.id);
      else next.add(habit.id);
      return next;
    });
  }, []);

  const todayWeekday = useMemo(() => new Date().getDay(), [today]);
  const todayDayOfMonth = useMemo(() => new Date().getDate(), [today]);
  const todayMonthIndex = useMemo(() => new Date().getMonth() + 1, [today]);

  const habitsAppearingToday = useMemo(() => {
    return habits.filter((h) => {
      const hasOverrideForToday = !!h.timeOverrides?.[today];
      if (h.createdAt && today < h.createdAt && !hasOverrideForToday) return false;
      const isSingle =
        h.habitFreq === 'single' ||
        (!h.habitFreq &&
          (Object.keys(h.timeOverrides ?? {}).length > 0) &&
          (h.schedule?.daysOfWeek?.length ?? 0) === 0 &&
          !h.schedule?.monthDays?.length &&
          !h.schedule?.yearMonth);
      if (isSingle && !hasOverrideForToday) return false;
      const sched = h.schedule;
      if (!sched || isSingle) return true;
      const dow = sched.daysOfWeek ?? [];
      const mdays = sched.monthDays ?? [];
      const yrM = sched.yearMonth ?? null;
      const yrD = sched.yearDay ?? null;
      const weeklyApplies = dow.length === 0 || dow.includes(todayWeekday);
      const monthlyApplies = mdays.length > 0 ? mdays.includes(todayDayOfMonth) : true;
      const annualApplies = yrM && yrD ? yrM === todayMonthIndex && yrD === todayDayOfMonth : true;
      return weeklyApplies && monthlyApplies && annualApplies;
    });
  }, [habits, today, todayWeekday, todayDayOfMonth, todayMonthIndex]);

  const stats = useMemo(() => {
    const todayHabits = habitsAppearingToday;
    const total = todayHabits.length;
    const completed = history[today]?.completedByHabitId ?? {};
    const done = todayHabits.filter(h => completed[h.id]).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }, [habitsAppearingToday, history, today]);

  const effectiveSortMode: SortModeType =
    activeFolder === null || activeFolder === OGGI_TODAY_KEY
      ? sortMode
      : (sortModeByFolder[activeFolder.trim()] ?? 'creation');

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
    let list: Habit[];
    if (activeFolder === OGGI_TODAY_KEY) {
      list = [...habitsAppearingToday];
    } else if (activeFolder) {
      const target = activeFolder.trim();
      list = habits.filter(h => (h.folder ?? '').trim() === target);
    } else {
      list = [...habits];
    }
    return sortHabitsList(list);
  }, [habits, habitsAppearingToday, sortMode, today, activeFolder, sortHabitsList]);

  const sectionedList = useMemo((): SectionItem[] => {
    const isOggiView = activeFolder === OGGI_TODAY_KEY;
    const isFolderStructureView = isOggiView || (activeFolder === null && sortMode === 'folder');

    if (!isFolderStructureView) {
      return sortedHabits.map(h => ({ type: 'task' as const, habit: h }));
    }

    const sourceHabits = isOggiView ? habitsAppearingToday : habits;
    const byFolder = new Map<string | null, Habit[]>();
    for (const h of sourceHabits) {
      const f = (h.folder ?? '').trim() || null;
      if (!byFolder.has(f)) byFolder.set(f, []);
      byFolder.get(f)!.push(h);
    }
    const folderNames = new Set(folders.map(f => (f.name ?? '').trim()));
    let resolvedOrder: (string | null)[];
    if (sectionOrder && sectionOrder.length > 0) {
      resolvedOrder = sectionOrder
        .filter(n => n === null || (folderNames.has(n) && n !== OGGI_TODAY_KEY));
      const orderSet = new Set(resolvedOrder);
      for (const f of folders) {
        const name = (f.name ?? '').trim();
        if (name && !orderSet.has(name)) {
          resolvedOrder.push(name);
          orderSet.add(name);
        }
      }
    } else {
      resolvedOrder = [null];
      for (const f of folders) {
        const name = (f.name ?? '').trim();
        if (name && byFolder.has(name)) resolvedOrder.push(name);
      }
    }
    if (resolvedOrder.length === 0) {
      resolvedOrder = [null];
      for (const f of folders) {
        const name = (f.name ?? '').trim();
        if (name && byFolder.has(name)) resolvedOrder.push(name);
      }
    }
    const out: SectionItem[] = [];
    const orderList = [...resolvedOrder];
    for (let i = 0; i < orderList.length; i++) {
      const folderName = orderList[i];
      const tasks = byFolder.get(folderName) ?? [];
      if (sectionOrder == null && (!tasks || tasks.length === 0)) continue;
      if (isOggiView && tasks.length === 0) continue;
      const folderId = folderName === null ? TUTTE_KEY : folders.find(f => (f.name ?? '').trim() === folderName)?.id ?? folderName;
      const folderSortMode: SortModeType =
        folderName === null ? (sortModeByFolder[TUTTE_KEY] ?? 'creation') : (sortModeByFolder[folderName] ?? 'creation');
      const sorted = sortHabitsWithMode(tasks, folderSortMode);
      out.push({ type: 'folderBlock', folderName, folderId, tasks: sorted });
    }
    const finalized = out.map(newItem => {
      const prev = prevSectionedListRef.current.find(p => {
        if (p.type !== newItem.type) return false;
        if (p.type === 'folderBlock' && newItem.type === 'folderBlock') {
          return p.folderId === newItem.folderId;
        }
        if (p.type === 'task' && newItem.type === 'task') {
          return p.habit.id === newItem.habit.id;
        }
        return false;
      });
      // Stabilize object references for folderBlocks and tasks
      if (prev) {
        if (prev.type === 'folderBlock' && newItem.type === 'folderBlock') {
          const tasksMatch = prev.tasks.length === newItem.tasks.length &&
            prev.tasks.every((t, idx) => t.id === newItem.tasks[idx].id);
          if (tasksMatch && prev.folderName === newItem.folderName) return prev;
        }
        if (prev.type === 'task' && newItem.type === 'task') {
          if (prev.habit.text === newItem.habit.text && prev.habit.folder === newItem.habit.folder) return prev;
        }
      }
      return newItem;
    });

    prevSectionedListRef.current = finalized;
    return finalized;
  }, [habits, habitsAppearingToday, folders, activeFolder, sortMode, sortModeByFolder, sortedHabits, sortHabitsWithMode, sectionOrder]);

  useEffect(() => {
    // Keep the UI thread synchronously updated with which active indices correspond to empty folders
    emptyFoldersIndicesSV.value = sectionedList.map(x => x.type === 'folderBlock' && x.tasks.length === 0 ? 1 : 0);

    if (displayList === null) {
      setDisplayList(sectionedList);
      return;
    }
    if (isPostDragRef.current) {
      if (sectionedListOrderKey(sectionedList) === sectionedListOrderKey(displayList)) {
        // Convergence! sectionedList now matches the drag result.
        // Release the guard and let DraggableFlatList continue using
        // displayList (which is the EXACT array reference from onDragEnd).
        // A new reference will only be provided when naturally needed.
        pendingDisplayRef.current = null;
        isPostDragRef.current = false;
        preDragSnapshotRef.current = null;
        if (dragEndTimeoutRef.current != null) {
          clearTimeout(dragEndTimeoutRef.current);
          dragEndTimeoutRef.current = null;
        }
        commitDragEndRef.current();
      }
      // While guard is up, NEVER update displayList — this prevents the flash.
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

  const isFolderModeWithSections =
    (activeFolder === null && sortMode === 'folder') || activeFolder === OGGI_TODAY_KEY;

  const folderTabsOrder = useMemo(() => {
    const folderNames = new Set(folders.map(f => (f.name ?? '').trim()));
    let base: (string | null)[];
    if (sectionOrder && sectionOrder.length > 0) {
      const order = sectionOrder.filter(n => n === null || folderNames.has(n));
      const orderSet = new Set(order);
      for (const f of folders) {
        const name = (f.name ?? '').trim();
        if (name && !orderSet.has(name)) {
          order.push(name);
          orderSet.add(name);
        }
      }
      base = order;
    } else {
      base = [null, ...folders.map(f => (f.name ?? '').trim())];
    }
    return [OGGI_TODAY_KEY, ...base];
  }, [sectionOrder, folders]);

  const renderSectionItem = useCallback(({ item, drag, isActive, getIndex }: RenderItemParams<SectionItem>) => {
    if (item.type === 'folderBlock') {
      const folderMeta = folders.find(f => (f.name ?? '').trim() === (item.folderName ?? '').trim());
      const folderColor = folderMeta?.color ?? THEME.textMuted;
      const label = typeof item.folderName === 'string' ? item.folderName : 'Tutte';

      return (
        <ScaleDecorator activeScale={1}>
          <View style={[isActive && styles.dragActiveFolderBlock]}>
            {/* The Folder Header */}
            <View style={styles.folderSeparator}>
              <TouchableOpacity
                onLongPress={selectionMode ? undefined : drag}
                disabled={isActive || selectionMode}
                activeOpacity={0.9}
                delayLongPress={200}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}
              >
                <Text style={[
                  styles.folderSeparatorText,
                  { color: folderColor },
                  isActive && { transform: [{ scale: 1.35 }] }
                ]}>
                  {label}
                </Text>

                <MergeIcon isActive={isActive} isMergeHoverSV={isMergeHoverSV} />
              </TouchableOpacity>
            </View>
            {/* The Folder Tasks */}
            <View style={styles.folderTaskGroup}>
              {item.tasks.map((h) => (
                <View key={h.id} style={styles.taskInFolder}>
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
                  />
                </View>
              ))}
            </View>
          </View>
        </ScaleDecorator>
      );
    }
    if (item.type === 'task') {
      const canDragTask = !isFolderModeWithSections;
      return (
        <ScaleDecorator>
          <TouchableOpacity
            onLongPress={canDragTask ? drag : undefined}
            disabled={isActive || !canDragTask}
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
            />
          </TouchableOpacity>
        </ScaleDecorator>
      );
    }
    return null;
  }, [completedByHabitId, handleSchedule, closingMenuId, activeFolder, sortMode, folders, handleMoveToFolder, isFolderModeWithSections, selectionMode, selectedIds, toggleSelect, isMergeHoverSV]);

  const commitDragEnd = useCallback(() => {
    isMergeHoverSV.value = false;
  }, [isMergeHoverSV]);
  commitDragEndRef.current = commitDragEnd;

  const getFolderBlockFromHeaderIndex = useCallback((list: SectionItem[], headerIdx: number) => {
    const header = list[headerIdx];
    if (header?.type !== 'folderBlock') return null; // Changed from folderHeader to folderBlock
    const block: SectionItem[] = [header];
    let i = headerIdx + 1;
    // No merge zone or task group items in the new SectionItem structure
    return { block, endIndex: i };
  }, []);

  // getFolderBlockIndicesAfterDrag removed — using snapshot-based revert instead

  const validFolderDropIndices = useMemo(() => {
    const indices: number[] = [];
    let i = 0;
    while (i < sectionedList.length) {
      const item = sectionedList[i];
      if (item.type === 'folderBlock') {
        indices.push(i); // above title
        i++;
        // No merge zone or task group items in the new SectionItem structure
      } else {
        i++;
      }
    }
    return indices;
  }, [sectionedList]);

  const folderIndicesArray = useMemo(
    () => validFolderDropIndices,
    [validFolderDropIndices]
  );

  const handleSectionedDragEnd = useCallback(({ data, from, to }: { data: SectionItem[]; from: number; to: number }) => {
    const snapshot = preDragSnapshotRef.current;
    const draggedItem = snapshot ? snapshot[from] : null;

    if (from === to && !isMergeHoverAtReleaseRef.current) {
      commitDragEnd();
      return;
    }

    if (!draggedItem || draggedItem.type !== 'folderBlock') {
      // It's a task drag
      const taskItems = data.flatMap((x): Habit[] => x.type === 'folderBlock' ? x.tasks : x.type === 'task' ? [x.habit] : []);
      pendingDisplayRef.current = data;
      setDisplayList(data);
      isPostDragRef.current = true;
      const runUpdates = () => {
        updateHabitsOrder(taskItems);
        if (activeFolder != null) setSortModeByFolder(prev => ({ ...prev, [activeFolder.trim()]: 'custom' }));
        else setSortMode('custom');
        // Safety net: release guard after 2s if convergence never happens
        if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
        dragEndTimeoutRef.current = setTimeout(() => {
          isPostDragRef.current = false;
          pendingDisplayRef.current = null;
          preDragSnapshotRef.current = null;
          commitDragEnd();
        }, 2000);
      };
      if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
      dragEndTimeoutRef.current = setTimeout(runUpdates, 100);
      return;
    }

    // FOLDER DRAG LOGIC
    // Determine if we dropped inside the hover radius 
    if (isMergeHoverAtReleaseRef.current && snapshot) {
      let actualTarget: FolderBlockItem | null = null;

      // If a list reorder actually registered under the hood before drop
      if (from !== to) {
        // The item at `to` in the NEW data is where we dropped.
        // Wait, the item at `to` is the dragged item itself. The item it swapped WITH
        // is now at some other index depending on direction. 
        // More reliably, just find the folder in the NEW `data` that is adjacent to `to`
        // in the direction we were dragging.
        const direction = dragDirectionAtReleaseRef.current;
        const targetIdx = to + direction;
        if (targetIdx >= 0 && targetIdx < data.length) {
          const potentialTarget = data[targetIdx];
          if (potentialTarget && potentialTarget.type === 'folderBlock') {
            actualTarget = potentialTarget;
          }
        }
      }

      // Fallback: If from === to (no swap registered) or target not found,
      // use the snapshot and direction to guess the adjacent folder.
      if (!actualTarget) {
        const direction = dragDirectionAtReleaseRef.current;
        const candidates = [from + direction, from - 1, from + 1];
        for (const idx of candidates) {
          if (idx >= 0 && idx < snapshot.length && idx !== from) {
            const item = snapshot[idx];
            if (item && item.type === 'folderBlock' && item.folderId !== (draggedItem as FolderBlockItem).folderId) {
              actualTarget = item as FolderBlockItem;
              break;
            }
          }
        }
      }

      if (actualTarget) {
        const sourceTasks = (draggedItem as FolderBlockItem).tasks;
        const sourceLabel = typeof (draggedItem as FolderBlockItem).folderName === 'string' ? (draggedItem as FolderBlockItem).folderName : 'Tutte';
        const targetLabel = typeof actualTarget.folderName === 'string' ? actualTarget.folderName : 'Tutte';

        if (sourceTasks.length > 0) {
          // Revert immediately visually so we don't snap incorrectly
          setDisplayList(snapshot);

          Alert.alert(
            'Aggiungi task',
            `Vuoi aggiungere le task di "${sourceLabel}" in "${targetLabel}"?`,
            [
              {
                text: 'No', style: 'cancel', onPress: () => {
                  isPostDragRef.current = false;
                  preDragSnapshotRef.current = null;
                  commitDragEnd();
                }
              },
              {
                text: 'Sì', onPress: () => {
                  const targetFolder = actualTarget.folderName === null ? undefined : (actualTarget.folderName as string);
                  sourceTasks.forEach(h => updateHabitFolder(h.id, targetFolder));
                  isPostDragRef.current = false;
                  preDragSnapshotRef.current = null;
                  commitDragEnd();
                }
              }
            ]
          );
          return;
        }
      }
    }

    // Simple Folder Reorder
    const folderItems = data.filter((x): x is FolderBlockItem => x.type === 'folderBlock');
    isPostDragRef.current = true;
    const folderOrder = folderItems.map(f => f.folderName);
    setSectionOrder(folderOrder);
    AsyncStorage.setItem('tasks_section_order_v1', JSON.stringify(folderOrder.map(n => n === null ? TUTTE_KEY : n))).catch(() => { });

    pendingDisplayRef.current = data;
    setDisplayList(data);

    const newFoldersOrder = folderOrder.filter((n): n is string => n !== null);
    if (newFoldersOrder.length > 0) {
      setFolders(prev => {
        const orderMap = new Map(newFoldersOrder.map((n, i) => [n, i]));
        const next = [...prev].sort((a, b) => {
          const ia = orderMap.get((a.name ?? '').trim()) ?? 999;
          const ib = orderMap.get((b.name ?? '').trim()) ?? 999;
          return ia - ib;
        });
        AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => { });
        return next;
      });
    }

    // Safety net: release guard after 2s if convergence never happens.
    // Normal release happens in the sync useEffect when sectionedList catches up.
    if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
    dragEndTimeoutRef.current = setTimeout(() => {
      isPostDragRef.current = false;
      pendingDisplayRef.current = null;
      preDragSnapshotRef.current = null;
      commitDragEnd();
    }, 2000);

  }, [updateHabitsOrder, updateHabitFolder, commitDragEnd, activeFolder, isMergeHoverSV, folders]);

  useAnimatedReaction(
    () => {
      'worklet';
      const v = animVals as any;
      if (!v || v.activeIndexAnim.value < 0) return null;

      // Look up if this item is an empty folder directly on the UI thread
      // to avoid JS bridge delays and visual flashes.
      const activeIdx = Math.round(v.activeIndexAnim.value);
      if (emptyFoldersIndicesSV.value[activeIdx] === 1) {
        return { isHovering: false, direction: 0 };
      }

      const hover = v.hoverAnim?.value ?? 0;
      const direction = hover === 0 ? 0 : (hover < 0 ? -1 : 1);
      const absHover = Math.abs(hover);

      return {
        isHovering: absHover > 40 && absHover < 110,
        direction
      };
    },
    (res) => {
      if (res !== null) {
        isMergeHoverSV.value = res.isHovering;
        dragDirectionSV.value = res.direction;
      }
    },
    [animVals]
  );

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
            data={pendingDisplayRef.current ?? displayList ?? sectionedList}
            keyExtractor={(item) => item.type === 'folderBlock' ? `folder-${item.folderId}` : `task-${item.habit.id}`}
            renderItem={renderSectionItem}
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
              isMergeHoverSV.value = false;
              dragDirectionSV.value = 0;
              isPostDragRef.current = false;
              pendingDisplayRef.current = null;
              const list = displayList ?? sectionedList;

              // Save snapshot of the list BEFORE dragging for clean revert
              preDragSnapshotRef.current = [...list];
            }}
            onRelease={(index) => {
              // Capture exactly what the UI thread values are at the moment of finger lift,
              // BEFORE any snap-back animations destroy the hover state.
              isMergeHoverAtReleaseRef.current = isMergeHoverSV.value;
              dragDirectionAtReleaseRef.current = dragDirectionSV.value;
            }}
            onDragEnd={handleSectionedDragEnd}
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
        <Link href={{ pathname: '/modal', params: { type: 'new', folder: activeFolder ?? undefined } }} asChild>
          <TouchableOpacity accessibilityRole="button" style={styles.fab}>
            <Ionicons name="add" size={28} color="#fff" />
          </TouchableOpacity>
        </Link>
      )}

      <Modal visible={editFolderVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => { setEditFolderVisible(false); setEditingFolder(null); }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalCenter}
          >
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={styles.createFolderCard}>
                <Text style={styles.createFolderTitle}>Modifica cartella</Text>

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

                <TouchableOpacity
                  onPress={() => {
                    if (editingFolder) {
                      Alert.alert('Elimina Cartella', `Vuoi eliminare la cartella "${editingFolder.name}"? (Le task torneranno in "Tutte")`, [
                        { text: 'Annulla', style: 'cancel' },
                        { text: 'Elimina', style: 'destructive', onPress: () => { performDeleteFolder(editingFolder.name); setEditFolderVisible(false); setEditingFolder(null); } }
                      ]);
                    }
                  }}
                  style={styles.editFolderDeleteBtn}
                >
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                  <Text style={styles.editFolderDeleteText}>Elimina cartella</Text>
                </TouchableOpacity>

                <View style={styles.createFolderActions}>
                  <TouchableOpacity style={styles.createFolderBtnSecondary} onPress={() => { setEditFolderVisible(false); setEditingFolder(null); }}>
                    <Text style={styles.createFolderBtnSecondaryText}>Annulla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createFolderBtnPrimary, { backgroundColor: newFolderName.trim() ? newFolderColor : '#4b5563' }]}
                    onPress={handleSaveEditFolder}
                    disabled={!newFolderName.trim()}
                  >
                    <Text style={styles.createFolderBtnPrimaryText}>Salva</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

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
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
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
    fontSize: 26,
    fontFamily: 'BagelFatOne_400Regular',
    marginBottom: 4
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  progressBarBg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#374151',
    overflow: 'hidden'
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#ffffff'
  },
  progressActions: {
    flexDirection: 'row',
    gap: 8
  },
  progressBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center'
  },
  fabRow: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 98,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fabTrash: {
    backgroundColor: '#ef4444',
    width: 83,
    height: 83,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOpacity: 0.6,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  fabCancel: {
    backgroundColor: '#ffffff',
    width: 83,
    height: 83,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  fabDisabled: {
    opacity: 0.5,
  },
  foldersContainer: {
    marginBottom: 4,
    marginTop: -4,
  },
  foldersScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    gap: 12,
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
    width: 28,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
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
  blockInvisible: {
    opacity: 0,
    pointerEvents: 'none',
  },
  blockInvisibleCollapsed: {
    display: 'none',
  },
  sectionRowInvisible: {
    opacity: 0,
  },
  folderSeparator: {
    paddingVertical: 4,
    paddingTop: 10,
  },
  folderMergeZone: {
    height: 12,
    marginVertical: 2,
  },
  folderTaskGroup: {
    paddingBottom: 4,
  },
  taskInFolder: {
    marginVertical: 2,
  },
  folderSeparatorText: {
    paddingLeft: 3,
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
  editFolderDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
  },
  editFolderDeleteText: {
    color: '#ef4444',
    fontSize: 16,
    fontWeight: '600',
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
  dragActiveFolderBlock: {
    opacity: 0.95,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
  },
  mergePlusIcon: {
    position: 'absolute',
    right: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});