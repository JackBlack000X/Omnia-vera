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
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
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

type FolderBlockItem = { type: 'folderBlock'; folderName: string | null; folderId: string; tasks: Habit[] };
type FolderHeaderItem = { type: 'folderHeader'; folderName: string | null; folderId: string };
type FolderMergeZoneItem = { type: 'folderMergeZone'; targetFolderName: string | null; targetFolderId: string };
type FolderTaskGroupItem = { type: 'folderTaskGroup'; folderName: string | null; folderId: string; tasks: Habit[] };
type TaskItem = { type: 'task'; habit: Habit };
type SectionItem = FolderBlockItem | FolderHeaderItem | FolderMergeZoneItem | FolderTaskGroupItem | TaskItem;

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
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
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
  const pendingFadeCallbackRef = useRef(true);
  const [draggingFolderIndex, setDraggingFolderIndex] = useState<number | null>(null);
  const overlayY = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const overlayScale = useSharedValue(1);
  const dragCounter = useSharedValue(0);
  const isDraggingFolder = useSharedValue(0);
  const [overlayPositionReady, setOverlayPositionReady] = useState(false);
  const [animVals, setAnimVals] = useState<unknown>(null);
  const [displayList, setDisplayList] = useState<SectionItem[] | null>(null);
  const [sectionOrder, setSectionOrder] = useState<(string | null)[] | null>(null);
  const [fadingOutFolderId, setFadingOutFolderId] = useState<string | null>(null);
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const today = getDay(new Date());

  const TUTTE_KEY = '__tutte__';
  const OGGI_TODAY_KEY = '__oggi__'; // virtual folder: tasks appearing today only

  const sectionedListOrderKey = useCallback((list: SectionItem[]) => {
    return list.map(i => {
      if (i.type === 'folderBlock') return `f-${i.folderId}`;
      if (i.type === 'folderHeader') return `h-${i.folderId}`;
      if (i.type === 'folderMergeZone') return `m-${i.targetFolderId}`;
      if (i.type === 'folderTaskGroup') return `g-${i.folderId}-${i.tasks.map(t => `${t.id}:${t.text}:${t.folder ?? ''}`).join('|')}`;
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
              AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(migrated)).catch(() => {});
            }
          }
        } catch {}
      } else {
        AsyncStorage.getItem('tasks_custom_folders_v1').then((legacy) => {
          if (legacy) {
            try {
              const parsed = JSON.parse(legacy);
              if (Array.isArray(parsed)) {
                const migrated = parsed.map((name: string, idx: number) => ({ id: `${name}-${Date.now()}-${idx}`, name, color: '#3b82f6', icon: 'folder-outline' } as FolderItem));
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
      AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => {});
      return next;
    });
    setSectionOrder(prev => {
      const next = prev ? prev.map(n => (n ?? '').trim() === oldName ? name : n) : null;
      if (next) AsyncStorage.setItem('tasks_section_order_v1', JSON.stringify(next.map(n => n === null ? TUTTE_KEY : n))).catch(() => {});
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
      AsyncStorage.setItem('tasks_custom_folders_v2', JSON.stringify(next)).catch(() => {});
      return next;
    });
    setSortModeByFolder(prev => {
      const next = { ...prev };
      delete next[folderName.trim()];
      return next;
    });
    setSectionOrder(prev => {
      const next = prev ? prev.filter(n => n !== folderName.trim()) : null;
      if (next) AsyncStorage.setItem('tasks_section_order_v1', JSON.stringify(next.map(n => n === null ? TUTTE_KEY : n))).catch(() => {});
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
        } catch {}
      }
    }).catch(() => {});
  }, [TUTTE_KEY]);

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
              if (typeof v === 'string' && modes.includes(v as SortModeType)) valid[k] = v as SortModeType;
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
      const folderSortMode: SortModeType =
        folderName === null ? 'creation' : (sortModeByFolder[folderName] ?? 'creation');
      const sorted = sortHabitsWithMode(tasks, folderSortMode);
      const folderId = folderName === null ? 'null' : folders.find(f => (f.name ?? '').trim() === folderName)?.id ?? folderName;
      out.push({ type: 'folderHeader', folderName, folderId });
      out.push({ type: 'folderMergeZone', targetFolderName: folderName, targetFolderId: folderId });
      out.push({ type: 'folderTaskGroup', folderName, folderId, tasks: sorted });
    }
    return out;
  }, [habits, habitsAppearingToday, folders, activeFolder, sortMode, sortModeByFolder, sortedHabits, sortHabitsWithMode, sectionOrder]);

  useEffect(() => {
    if (displayList === null) {
      setDisplayList(sectionedList);
      return;
    }
    if (isPostDragRef.current) return;
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
    const idx = getIndex?.();
    const isPartOfDraggedBlock = draggingFolderIndex != null && idx != null &&
      idx >= draggingFolderIndex && idx <= draggingFolderIndex + 2;

    if (item.type === 'folderMergeZone') {
      return (
        <ScaleDecorator>
          <View style={[styles.folderMergeZone, isPartOfDraggedBlock && overlayPositionReady && styles.blockInvisible]} />
        </ScaleDecorator>
      );
    }
    if (item.type === 'folderHeader') {
      const folderMeta = folders.find(f => (f.name ?? '').trim() === (item.folderName ?? '').trim());
      const folderColor = folderMeta?.color ?? THEME.textMuted;
      const label = typeof item.folderName === 'string' ? item.folderName : 'Tutte';
      return (
        <ScaleDecorator activeScale={1}>
          <View style={[styles.folderSeparator, isActive && overlayPositionReady && styles.blockInvisible]}>
            <TouchableOpacity
              onLongPress={selectionMode ? undefined : drag}
              disabled={isActive || selectionMode}
              activeOpacity={0.9}
              delayLongPress={200}
            >
              <Text style={[styles.folderSeparatorText, { color: folderColor }]}>{label}</Text>
            </TouchableOpacity>
          </View>
        </ScaleDecorator>
      );
    }
    if (item.type === 'folderTaskGroup') {
      return (
        <ScaleDecorator>
          <View style={[styles.folderTaskGroup, isPartOfDraggedBlock && overlayPositionReady && styles.blockInvisible]}>
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
        </ScaleDecorator>
      );
    }
    if (item.type === 'task') {
      return (
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
              selectionMode={selectionMode}
              isSelected={selectedIds.has(item.habit.id)}
              onToggleSelect={toggleSelect}
            />
          </TouchableOpacity>
        </ScaleDecorator>
      );
    }
    return null;
  }, [completedByHabitId, handleSchedule, closingMenuId, activeFolder, sortMode, folders, handleMoveToFolder, overlayPositionReady, isFolderModeWithSections, selectionMode, selectedIds, toggleSelect, draggingFolderIndex]);

  const commitDragEnd = useCallback(() => {
    setFadingOutFolderId(null);
    overlayOpacity.value = 0;
    overlayScale.value = 1;
    isDraggingFolder.value = 0;
    setDraggingFolderIndex(null);
    setOverlayPositionReady(false);
  }, [isDraggingFolder, overlayOpacity, overlayScale]);

  const commitDragEndIfFadeStillRelevant = useCallback(() => {
    if (!pendingFadeCallbackRef.current) return;
    pendingFadeCallbackRef.current = false;
    commitDragEnd();
  }, [commitDragEnd]);

  const getFolderBlockFromHeaderIndex = useCallback((list: SectionItem[], headerIdx: number) => {
    const header = list[headerIdx];
    if (header?.type !== 'folderHeader') return null;
    const block: SectionItem[] = [header];
    let i = headerIdx + 1;
    const mz = list[i];
    if (mz?.type === 'folderMergeZone' && mz.targetFolderId === header.folderId) {
      block.push(mz);
      i++;
    }
    const tg = list[i];
    if (tg?.type === 'folderTaskGroup' && tg.folderId === header.folderId) {
      block.push(tg);
      i++;
    }
    return { block, endIndex: i };
  }, []);

  const getFolderBlockIndicesAfterDrag = useCallback((data: SectionItem[], from: number, to: number, header: FolderHeaderItem) => {
    const indices: number[] = [to];
    const blockStart = from < to ? from : from + 2;
    const blockStartItem = data[blockStart];
    if (blockStartItem?.type === 'folderMergeZone' && blockStartItem.targetFolderId === header.folderId) {
      indices.push(blockStart);
    }
    const taskGroupIdx = blockStart + 1;
    if (data[taskGroupIdx]?.type === 'folderTaskGroup' && data[taskGroupIdx].folderId === header.folderId) {
      indices.push(taskGroupIdx);
    }
    return indices.sort((a, b) => a - b);
  }, []);

  const validFolderDropIndices = useMemo(() => {
    const indices: number[] = [];
    let i = 0;
    while (i < sectionedList.length) {
      const item = sectionedList[i];
      if (item.type === 'folderHeader') {
        indices.push(i);
        i++;
        if (sectionedList[i]?.type === 'folderMergeZone') {
          indices.push(i);
          i++;
        }
        if (sectionedList[i]?.type === 'folderTaskGroup') i++;
        indices.push(i);
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
  const folderIndicesSV = useSharedValue<number[]>([]);
  useEffect(() => {
    folderIndicesSV.value = folderIndicesArray;
  }, [folderIndicesArray, folderIndicesSV]);

  const handleSectionedDragEnd = useCallback(({ data, from, to }: { data: SectionItem[]; from: number; to: number }) => {
    const draggedItem = data[to];
    const isFolderHeaderDrag = draggedItem?.type === 'folderHeader';

    if (isFolderHeaderDrag && draggedItem) {
      setFadingOutFolderId(draggedItem.folderId);
      pendingFadeCallbackRef.current = true;
      overlayScale.value = withTiming(0.96, { duration: 420, easing: Easing.out(Easing.cubic) });
      overlayOpacity.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(commitDragEndIfFadeStillRelevant)();
      });
    }

    const droppedOnItem = from < to ? data[to - 1] : from > to ? data[to + 1] : null;
    // Merge: drop on merge zone OR drop before task group (between merge zone and tasks)
    const mergeZoneItem =
      droppedOnItem?.type === 'folderMergeZone'
        ? droppedOnItem
        : droppedOnItem?.type === 'folderTaskGroup'
          ? (from < to ? data[to - 2] : data[to - 1])
          : null;
    const isMergeDrop =
      mergeZoneItem?.type === 'folderMergeZone' && draggedItem?.type === 'folderHeader';

    if (isMergeDrop && mergeZoneItem.type === 'folderMergeZone' && draggedItem.type === 'folderHeader') {
      const sourceFolderName = draggedItem.folderName;
      const targetFolderName = mergeZoneItem.targetFolderName;
      const blockStart = from < to ? from : to + 1;
      const taskGroupItem = data[blockStart + 1];
      const sourceTasks = taskGroupItem?.type === 'folderTaskGroup' && taskGroupItem.folderId === draggedItem.folderId
        ? taskGroupItem.tasks
        : [];
      if (sourceFolderName !== targetFolderName && sourceTasks.length > 0) {
        const sourceLabel = typeof sourceFolderName === 'string' ? sourceFolderName : 'Tutte';
        const targetLabel = typeof targetFolderName === 'string' ? targetFolderName : 'Tutte';
        Alert.alert(
          'Aggiungi task',
          `Vuoi aggiungere le task di "${sourceLabel}" in "${targetLabel}"?`,
          [
            {
              text: 'No',
              style: 'cancel',
              onPress: () => {
                const reverted = [...data];
                const [item] = reverted.splice(to, 1);
                reverted.splice(from, 0, item);
                pendingDisplayRef.current = reverted;
                setDisplayList(reverted);
                isPostDragRef.current = false;
                commitDragEnd();
              },
            },
            {
              text: 'Sì',
              onPress: () => {
                const targetFolder = targetFolderName === null ? undefined : (targetFolderName as string);
                sourceTasks.forEach(h => updateHabitFolder(h.id, targetFolder));
                pendingDisplayRef.current = null;
                isPostDragRef.current = false;
                commitDragEnd();
              },
            },
          ]
        );
        return;
      }
    }

    let finalData: SectionItem[] = data;
    if (isFolderHeaderDrag && from !== to && draggedItem.type === 'folderHeader') {
      const blockIndices = getFolderBlockIndicesAfterDrag(data, from, to, draggedItem);
      const blockItems = blockIndices.map(i => data[i]).filter(Boolean);
      if (blockItems.length > 1) {
        const sortedIndices = [...blockIndices].sort((a, b) => b - a);
        let newData = [...data];
        for (const idx of sortedIndices) {
          newData.splice(idx, 1);
        }
        const insertAt = Math.max(0, to - blockIndices.filter(i => i < to).length);
        newData.splice(insertAt, 0, ...blockItems);
        finalData = newData;
      }
    }

    const folderItems = finalData
      .filter((x): x is FolderHeaderItem => x.type === 'folderHeader')
      .map(h => ({ type: 'folder' as const, folderName: h.folderName, folderId: h.folderId }));
    const taskItems = finalData.flatMap((x): Habit[] =>
      x.type === 'folderTaskGroup' ? x.tasks : x.type === 'task' ? [x.habit] : []
    );

    pendingDisplayRef.current = finalData;
    setDisplayList(finalData);
    isPostDragRef.current = true;

    if (folderItems.length > 0) {
      const folderOrder = folderItems.map(f => f.folderName);
      setSectionOrder(folderOrder);
      AsyncStorage.setItem('tasks_section_order_v1', JSON.stringify(folderOrder.map(n => n === null ? TUTTE_KEY : n))).catch(() => {});
    }

    const runUpdates = () => {
      if (from === to) {
        isPostDragRef.current = false;
        commitDragEnd();
        return;
      }
      const applyUpdates = () => {
        if (folderItems.length === 0) {
          updateHabitsOrder(taskItems);
          if (activeFolder != null) {
            setSortModeByFolder(prev => ({ ...prev, [activeFolder.trim()]: 'custom' }));
          } else {
            setSortMode('custom');
          }
        } else {
          const folderOrder = folderItems.map(f => f.folderName);
          const sectionOrderToSave = folderOrder.map(n => n === null ? TUTTE_KEY : n);
          AsyncStorage.setItem('tasks_section_order_v1', JSON.stringify(sectionOrderToSave)).catch(() => {});
          setSectionOrder(folderOrder);
          const newFoldersOrder = folderOrder.filter((n): n is string => n !== null);
          const byFolder = new Map<string | null, Habit[]>();
          for (const habit of taskItems) {
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
        isPostDragRef.current = false;
        commitDragEnd();
      };
      startTransition(applyUpdates);
    };

    if (dragEndTimeoutRef.current != null) clearTimeout(dragEndTimeoutRef.current);
    const PERSIST_DELAY_MS = 800;
    dragEndTimeoutRef.current = setTimeout(runUpdates, PERSIST_DELAY_MS);
  }, [updateHabitsOrder, updateHabitFolder, commitDragEnd, commitDragEndIfFadeStillRelevant, activeFolder, getFolderBlockIndicesAfterDrag]);

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
        overlayScale.value = 0.96;
        overlayScale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
        overlayOpacity.value = withTiming(1, { duration: 150 });
        runOnJS(setOverlayReady)();
      }
    },
    [animVals, setOverlayReady, overlayY, overlayOpacity, overlayScale, dragCounter, isDraggingFolder, folderIndicesSV]
  );

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    top: overlayY.value,
    opacity: overlayOpacity.value,
    transform: [{ scale: overlayScale.value }],
  }));

  const draggingSectionItems = useMemo(() => {
    if (draggingFolderIndex == null || activeFolder !== null) return [];
    const list = displayList ?? sectionedList;
    const result = getFolderBlockFromHeaderIndex(list, draggingFolderIndex);
    if (!result) return [];
    const { block } = result;
    const header = block[0];
    if (header?.type !== 'folderHeader') return [];
    const taskGroup = block.find((x): x is FolderTaskGroupItem => x.type === 'folderTaskGroup');
    const tasks = taskGroup?.tasks ?? [];
    const items: Array<{ type: 'folder'; folderName: string | null; folderId: string } | { type: 'task'; habit: Habit }> = [
      { type: 'folder' as const, folderName: header.folderName, folderId: header.folderId },
      ...tasks.map(h => ({ type: 'task' as const, habit: h }))
    ];
    return items;
  }, [draggingFolderIndex, displayList, sectionedList, activeFolder, getFolderBlockFromHeaderIndex]);

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
            {optionsMenuVisible && (
              <>
                {[
                  { key: 'sort', icon: 'swap-vertical-outline' as const, onPress: () => {
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
                  }},
                  { key: 'reset', icon: 'refresh-outline' as const, onPress: () => {
                    setOptionsMenuVisible(false);
                    Alert.alert(
                      'Azzera le task di oggi?',
                      'Vuoi segnare tutte le task come non completate per oggi?',
                      [
                        { text: 'Annulla', style: 'cancel' },
                        { text: 'Conferma', style: 'destructive', onPress: resetToday }
                      ]
                    );
                  }},
                  { key: 'time', icon: 'time-outline' as const, onPress: () => {
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
                  }},
                  { key: 'selection', icon: 'checkmark-done-outline' as const, onPress: () => {
                    setOptionsMenuVisible(false);
                    setSelectionMode(v => {
                      if (v) {
                        setSelectedIds(new Set());
                        return false;
                      }
                      return true;
                    });
                  }},
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
                <Ionicons name="today-outline" size={18} color={activeFolder === OGGI_TODAY_KEY ? THEME.text : THEME.textMuted} />
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
            keyExtractor={(item) => item.type === 'folderBlock' ? `folder-${item.folderId}` : item.type === 'folderHeader' ? `header-${item.folderId}` : item.type === 'folderMergeZone' ? `merge-${item.targetFolderId}` : item.type === 'folderTaskGroup' ? `group-${item.folderId}` : `task-${item.habit.id}`}
            renderItem={renderSectionItem}
            contentContainerStyle={[styles.listContainer, activeTheme === 'futuristic' && { paddingHorizontal: -16 }]}
            style={[activeTheme === 'futuristic' && { marginHorizontal: -16 }]}
            containerStyle={styles.dragListContainer}
            showsVerticalScrollIndicator={false}
            dragItemOverflow
            onAnimValInit={(v) => setAnimVals(v)}
            onDragBegin={(index) => {
              const list = pendingDisplayRef.current ?? displayList ?? sectionedList;
              if (list[index]?.type === 'folderHeader') {
                setFadingOutFolderId(null);
                pendingFadeCallbackRef.current = false;
                cancelAnimation(overlayOpacity);
                cancelAnimation(overlayScale);
                overlayScale.value = 1;
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
                      {typeof it.folderName === 'string' ? it.folderName : 'Tutte'}
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
                  { text: 'Elimina', style: 'destructive', onPress: () => {
                    selectedIds.forEach(id => removeHabit(id));
                    setSelectedIds(new Set());
                    setSelectionMode(false);
                  } }
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
  blockInvisible: {
    opacity: 0,
    pointerEvents: 'none',
  },
  sectionRowInvisible: {
    opacity: 0,
  },
  folderSeparator: {
    paddingVertical: 4,
    paddingTop: 8,
    marginTop: 2,
  },
  folderMergeZone: {
    height: 12,
    marginVertical: 2,
  },
  folderTaskGroup: {
    marginBottom: 4,
  },
  taskInFolder: {
    marginVertical: 2,
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

});